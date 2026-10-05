import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth, requireAdmin, signToken, signOverride } from '../middleware/auth.js';
import { ah, HttpError, assertValid, nameRegex, shopTime, TZ } from '../lib/util.js';
import Sale from '../models/Sale.js';
import StaffLog, { logStaff } from '../models/StaffLog.js';
import { checkId } from '../lib/ids.js';
import { checkStaff, checkStaffName, checkPin, weakPin, PIN_LEN, ROLES } from '../../../src/shared/rules.mjs';

const r = Router();
r.param('id', checkId);

const MAX_TRIES = 5;          // wrong PINs in a row before the account pauses
const LOCK_MINUTES = 5;

// Public: list of active staff names for the sign-in screen
r.get('/staff', ah(async (_req, res) => {
  res.json((await User.find({ active: true }, 'name role').sort('name').lean()).map((u) => ({ _id: u._id, name: u.name, role: u.role })));
}));

const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 60);
const ONLINE_MS = 2 * 60e3; // seen in the last 2 minutes = online now

r.post('/login', ah(async (req, res) => {
  const { name, pin } = req.body || {};
  if (!String(name || '').trim()) throw new HttpError(400, 'Choose your name.', { name: 'Choose your name.' });
  if (!/^\d{4,8}$/.test(String(pin || ''))) throw new HttpError(400, `Enter your ${PIN_LEN}-digit PIN.`, { pin: `Enter your ${PIN_LEN}-digit PIN.` });

  const user = await User.findOne({ name: String(name).trim() });
  if (!user) throw new HttpError(401, 'Name or PIN is incorrect.');
  const ip = ipOf(req);

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new HttpError(423, `Too many wrong PINs. Try again in ${mins} minute${mins > 1 ? 's' : ''}, or ask an admin to reset your PIN.`);
  }
  if (!(await user.checkPin(pin))) {
    user.failedLogins = (user.failedLogins || 0) + 1;
    const left = MAX_TRIES - user.failedLogins;
    logStaff(user, 'wrong_pin', { ip });
    if (left <= 0) {
      user.failedLogins = 0;
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      await user.save();
      logStaff(user, 'pin_lockout', { ip, note: `${MAX_TRIES} wrong PINs in a row` });
      throw new HttpError(423, `Too many wrong PINs. Sign-in is paused for ${LOCK_MINUTES} minutes.`);
    }
    await user.save();
    throw new HttpError(401, `Name or PIN is incorrect. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
  }
  // Right PIN, but the owner locked this account
  if (!user.active) {
    logStaff(user, 'blocked_login', { ip });
    throw new HttpError(403, `Your account is locked${user.lockReason ? `: ${user.lockReason}` : ''}. Please talk to the owner.`);
  }
  user.failedLogins = 0; user.lockedUntil = null;
  user.lastLoginAt = new Date(); user.lastSeenAt = new Date();
  user.pinLen = String(pin).length; // older accounts: now we know if the PIN still needs to become 6 digits
  await user.save();
  logStaff(user, 'login', { ip });
  res.json({ token: signToken(user), user, newPin: user.pinLen !== PIN_LEN, weakPin: user.pinLen === PIN_LEN && weakPin(pin) });
}));

r.get('/me', requireAuth, (req, res) => res.json(req.user));

// Change my own PIN (also used right after signing in with an old 4–8 digit PIN)
const selfTries = new Map();
r.post('/me/pin', requireAuth, ah(async (req, res) => {
  const { current, pin } = req.body || {};
  const key = String(req.user._id), now = Date.now();
  const tries = (selfTries.get(key) || []).filter((t) => now - t < 10 * 60000);
  if (tries.length >= 5) throw new HttpError(429, 'Too many wrong PINs. Try again in 10 minutes.', { current: 'Too many tries. Wait 10 minutes.' });
  const user = await User.findById(req.user._id);
  if (!(await user.checkPin(String(current || '')))) {
    tries.push(now); selfTries.set(key, tries);
    throw new HttpError(403, 'Your current PIN is not right.', { current: 'Your current PIN is not right.' });
  }
  selfTries.delete(key);
  assertValid(checkPin(pin));
  if (String(pin) === String(current)) throw new HttpError(400, 'Choose a different PIN from your old one.', { pin: 'Choose a different PIN from your old one.' });
  user.pinHash = await User.hashPin(pin); user.pinLen = PIN_LEN; user.failedLogins = 0; user.lockedUntil = null;
  await user.save();
  logStaff(user, 'pin_changed', { by: user.name, note: 'Set their own PIN' });
  res.json({ user, token: signToken(user) });
}));

r.post('/logout', requireAuth, ah(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { lastLogoutAt: new Date() });
  logStaff(req.user, 'logout', { ip: ipOf(req) });
  res.json({ ok: true });
}));

// ---------- Staff management (admin) ----------

/** Midnight today in the shop's timezone, as a Date. */
function shopDayStart(now = new Date()) {
  const { date } = shopTime(now);
  const guess = Date.parse(`${date}T00:00:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(guess)).map((x) => [x.type, +x.value]));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
  return new Date(guess - offset);
}

function statusOf(u, now = Date.now()) {
  if (!u.active) return 'locked';
  if (u.lockedUntil && u.lockedUntil > now) return 'paused';
  const seen = u.lastSeenAt ? +u.lastSeenAt : 0;
  const out = u.lastLogoutAt ? +u.lastLogoutAt : 0;
  if (seen && now - seen < ONLINE_MS && seen > out) return 'online';
  return 'offline';
}

r.get('/users', requireAuth, requireAdmin, ah(async (_req, res) => {
  const users = await User.find().sort('name');
  const since = shopDayStart();
  // One day of a small shop is a few hundred rows at most, so plain queries are fine here
  const [sales, voids, wrong] = await Promise.all([
    Sale.find({ status: 'paid', cashier: { $in: users.map((u) => u._id) }, createdAt: { $gte: since } }, 'cashier total createdAt').lean(),
    Sale.find({ status: 'void', voidedAt: { $gte: since } }, 'voidedBy').lean(),
    StaffLog.find({ type: 'wrong_pin', createdAt: { $gte: since } }, 'user').lean(),
  ]);
  const S = {}, V = {}, W = {};
  for (const x of sales) {
    const k = String(x.cashier); const a = (S[k] ||= { count: 0, total: 0, last: null });
    a.count += 1; a.total += x.total || 0; if (!a.last || x.createdAt > a.last) a.last = x.createdAt;
  }
  for (const x of voids) V[x.voidedBy] = { count: (V[x.voidedBy]?.count || 0) + 1 };
  for (const x of wrong) { const k = String(x.user); W[k] = { count: (W[k]?.count || 0) + 1 }; }
  const now = Date.now();
  res.json(users.map((u) => ({
    ...u.toJSON(),
    status: statusOf(u, now),
    today: {
      sales: S[u._id]?.count || 0,
      total: Math.round((S[u._id]?.total || 0) * 100) / 100,
      lastSaleAt: S[u._id]?.last || null,
      voids: V[u.name]?.count || 0,
      wrongPins: W[u._id]?.count || 0,
    },
  })));
}));

// Admin PIN for a cashier's risky action (big discount, void). Any active admin can approve.
const overrideTries = new Map();
r.post('/override', requireAuth, ah(async (req, res) => {
  const action = String(req.body?.action || '');
  if (!['discount', 'void', 'pickup'].includes(action)) throw new HttpError(400, 'Unknown action.');
  const key = String(req.user._id), now = Date.now();
  const tries = (overrideTries.get(key) || []).filter((t) => now - t < 10 * 60000);
  if (tries.length >= 5) throw new HttpError(429, 'Too many wrong admin PINs. Try again in 10 minutes.', { pin: 'Too many tries. Wait 10 minutes.' });
  const pin = String(req.body?.pin || '');
  if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, `Enter the admin’s ${PIN_LEN}-digit PIN.`, { pin: 'Enter the admin’s PIN.' });
  const admins = await User.find({ role: 'admin', active: true });
  let ok = null;
  for (const a of admins) if (await a.checkPin(pin)) { ok = a; break; }
  if (!ok) {
    tries.push(now); overrideTries.set(key, tries);
    const left = 5 - tries.length;
    throw new HttpError(403, `That isn’t an admin PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`, { pin: `Not an admin PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` });
  }
  overrideTries.delete(key);
  logStaff(ok, 'approved', { by: req.user.name, note: action === 'void' ? `Approved a void for ${req.user.name}` : action === 'pickup' ? `Let ${req.user.name} hand over an order without its pickup code` : `Approved a big discount for ${req.user.name}` });
  res.json({ token: signOverride(ok, action, req.user._id), by: ok.name });
}));

r.get('/users/:id/activity', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Staff member not found.');
  const [log, sales] = await Promise.all([
    StaffLog.find({ user: user._id }).sort('-createdAt').limit(40).lean(),
    Sale.find({ cashier: user._id, status: { $in: ['paid', 'void'] } }, 'no total status source createdAt payMethod voidReason').sort('-createdAt').limit(15).lean(),
  ]);
  res.json({ log, sales });
}));

r.post('/users', requireAuth, requireAdmin, ah(async (req, res) => {
  const b = req.body || {};
  assertValid(checkStaff(b));
  const name = String(b.name).trim().replace(/\s+/g, ' ');
  if (await User.exists({ name: nameRegex(name) }))
    throw new HttpError(409, 'Someone already has that name.', { name: 'Someone already has that name. Add a last initial.' });
  const user = await User.create({ name, pinHash: await User.hashPin(b.pin), pinLen: String(b.pin).length, role: b.role === 'admin' ? 'admin' : 'cashier' });
  logStaff(user, 'created', { by: req.user.name, note: user.role === 'admin' ? 'Admin' : 'Cashier' });
  res.status(201).json(user);
}));

r.patch('/users/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Staff member not found.');
  const { pin, role, active, reason, signOut, clearLockout, name } = req.body || {};
  const self = String(user._id) === String(req.user._id);
  const by = req.user.name;
  const logs = [];
  // The super admin (owner) account is protected: it always stays super admin.
  if (user.superAdmin) {
    if (role != null && role !== 'admin') throw new HttpError(403, 'The super admin always stays super admin.');
    if (active === false) throw new HttpError(403, 'The super admin account can’t be locked.');
    if (!self && (pin != null || signOut || name != null)) throw new HttpError(403, 'Only the super admin can change their own name, PIN or sign themselves out.');
  }
  // Admins can make a cashier an admin; only the super admin can change an admin back to cashier.
  if (role === 'cashier' && user.role === 'admin' && !req.user.superAdmin)
    throw new HttpError(403, 'Only the super admin can change an admin back to cashier.');

  if (pin != null) {
    assertValid(checkPin(pin));
    user.pinHash = await User.hashPin(pin); user.pinLen = String(pin).length; user.failedLogins = 0; user.lockedUntil = null;
    user.sessionVersion = (user.sessionVersion || 0) + (self ? 0 : 1); // new PIN signs them out elsewhere
    logs.push(['pin_changed']);
  }
  if (name != null) {
    assertValid(checkStaffName(name));
    const clean = String(name).trim().replace(/\s+/g, ' ');
    if (clean !== user.name) {
      if (await User.exists({ name: nameRegex(clean), _id: { $ne: user._id } }))
        throw new HttpError(409, 'Someone already has that name.', { name: 'Someone already has that name. Add a last initial.' });
      logs.push(['renamed', `Was ${user.name}`]);
      user.name = clean;
    }
  }
  if (clearLockout) { user.failedLogins = 0; user.lockedUntil = null; logs.push(['lockout_cleared']); }
  if (role != null && role !== user.role) {
    if (!ROLES.includes(role)) throw new HttpError(400, 'Choose a role.', { role: 'Choose a role.' });
    user.role = role;
    logs.push(['role_changed', role === 'admin' ? 'Now admin' : 'Now cashier']);
  }
  if (active != null && !!active !== user.active) {
    if (active) {
      user.active = true; user.lockReason = undefined; user.lockedAt = undefined; user.lockedBy = undefined;
      logs.push(['unlocked']);
    } else {
      const why = String(reason || '').trim().replace(/\s+/g, ' ');
      if (why.length > 120) throw new HttpError(400, 'Keep the reason under 120 characters.', { reason: 'Keep the reason under 120 characters.' });
      user.active = false; user.lockReason = why || undefined; user.lockedAt = new Date(); user.lockedBy = by;
      user.sessionVersion = (user.sessionVersion || 0) + 1; // signs them out right away
      logs.push(['locked', why]);
    }
  }
  if (signOut) {
    if (self) throw new HttpError(400, 'Use Sign out at the top to sign yourself out.');
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    logs.push(['signed_out']);
  }
  if (self && (user.role !== 'admin' || !user.active)) throw new HttpError(400, 'You cannot lock yourself or remove your own admin access.');
  if (user.isModified('role') || user.isModified('active')) {
    const admins = await User.countDocuments({ role: 'admin', active: true, _id: { $ne: user._id } });
    if (!admins && (user.role !== 'admin' || !user.active)) throw new HttpError(400, 'Keep at least one active admin.');
  }
  await user.save();
  logs.forEach(([type, note]) => logStaff(user, type, { by, note: note || undefined }));
  res.json({ ...user.toJSON(), status: statusOf(user) });
}));

// Remove a staff account for good. Their past sales keep their name in reports.
r.delete('/users/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Staff member not found.');
  if (String(user._id) === String(req.user._id)) throw new HttpError(400, 'You cannot remove your own account.');
  if (user.superAdmin) throw new HttpError(403, 'The super admin account can’t be removed.');
  if (user.role === 'admin' && !req.user.superAdmin) throw new HttpError(403, 'Only the super admin can remove an admin.');
  if (user.role === 'admin' && user.active) {
    const admins = await User.countDocuments({ role: 'admin', active: true, _id: { $ne: user._id } });
    if (!admins) throw new HttpError(400, 'Keep at least one active admin.');
  }
  await user.deleteOne();
  logStaff(user, 'removed', { by: req.user.name });
  res.json({ ok: true, name: user.name });
}));

export default r;
