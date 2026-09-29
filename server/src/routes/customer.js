// Customer accounts for the ordering site: phone + password, Google, Facebook.
import { smsEnabled } from '../lib/notify.js';
import { mailEnabled, signinLog } from '../lib/mailer.js';
import { startVerify, resendVerify, checkVerify } from '../lib/verify.js';
import express, { Router } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import { ah, HttpError, assertValid } from '../lib/util.js';
import { signCustomer, requireCustomer } from '../middleware/customerAuth.js';
import { priceOrder } from '../lib/orders.js';
import { mustPayFirst } from '../lib/noshow.js';
import { checkSignup, checkPhone, checkCustomerName, checkPassword, normPhone, cleanName } from '../../../src/shared/rules.mjs';

const r = Router();
const MAX_TRIES = 5, LOCK_MIN = 10;

// Per-IP limit for sign-in / sign-up attempts (no extra packages)
const hits = new Map();
const limit = (max, ms) => (req, _res, next) => {
  const now = Date.now(), key = req.ip + req.path;
  const list = (hits.get(key) || []).filter((t) => now - t < ms);
  if (list.length >= max) return next(new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.'));
  list.push(now); hits.set(key, list); if (hits.size > 5000) hits.clear();
  next();
};

const session = async (c, res, status = 200) => {
  c.lastLoginAt = new Date(); await c.save();
  res.status(status).json({ token: signCustomer(c), customer: c, needsPhone: !c.phone, payFirst: await mustPayFirst(c._id) });
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

// Simple bot guard for forms: a hidden "website" box people never see, and a minimum time to fill the form in.
const botCheck = (b, minMs) => {
  if (String(b.website || '').trim()) throw new HttpError(400, 'Something went wrong. Please refresh the page and try again.');
  if (minMs && Number.isFinite(+b.ft) && +b.ft < minMs) throw new HttpError(400, 'That was very quick. Please check your details and try again.');
};

// Which sign-in buttons to show
r.get('/config', (_req, res) => res.json({
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  facebookAppId: process.env.FACEBOOK_APP_ID || '',
  facebookVersion: process.env.FACEBOOK_API_VERSION || 'v25.0',
  sms: smsEnabled(),
  email: mailEnabled(),
}));

r.post('/signup', limit(10, 15 * 60000), ah(async (req, res) => {
  const b = req.body || {};
  botCheck(b, 2000);
  assertValid(checkSignup(b));
  const phone = normPhone(b.phone);
  if (await Customer.exists({ phone })) throw new HttpError(409, 'This number already has an account. Sign in instead.', { phone: 'This number already has an account. Sign in instead.' });
  const name = cleanName(b.name), passwordHash = await Customer.hash(b.password);
  const c = await Customer.create({ name, phone, passwordHash, agreedAt: new Date() });
  await session(c, res, 201);
}));

r.post('/login', limit(20, 15 * 60000), ah(async (req, res) => {
  const { phone: raw, password } = req.body || {};
  botCheck(req.body || {}, 0);
  // Sign in with a mobile number or an email address
  const byEmail = String(raw || '').includes('@');
  const email = String(raw || '').trim().toLowerCase();
  assertValid({ ...(byEmail ? (EMAIL_RE.test(email) ? {} : { phone: 'Enter an email like name@gmail.com.' }) : checkPhone(raw)), ...(password ? {} : { password: 'Enter your password.' }) });
  const c = await Customer.findOne(byEmail ? { email } : { phone: normPhone(raw) });
  const wrong = () => new HttpError(401, `${byEmail ? 'Email' : 'Mobile number'} or password is incorrect.`, { password: `${byEmail ? 'Email' : 'Mobile number'} or password is incorrect.` });
  if (!c) throw wrong();
  if (c.lockedUntil && c.lockedUntil > new Date()) throw new HttpError(423, `Too many wrong passwords. Try again in ${Math.ceil((c.lockedUntil - Date.now()) / 60000)} minutes.`);
  if (!c.passwordHash) throw new HttpError(400, `This account signs in with ${c.googleId ? 'Google' : 'Facebook'}. Use that button, or tap “Forgot your password?” to set a password.`);
  if (!(await c.checkPassword(password))) {
    c.failedLogins = (c.failedLogins || 0) + 1;
    if (c.failedLogins >= MAX_TRIES) { c.failedLogins = 0; c.lockedUntil = new Date(Date.now() + LOCK_MIN * 60000); await c.save(); throw new HttpError(423, `Too many wrong passwords. Sign-in is paused for ${LOCK_MIN} minutes.`); }
    await c.save();
    const left = MAX_TRIES - c.failedLogins;
    const m = `${byEmail ? 'Email' : 'Mobile number'} or password is incorrect. ${left} ${left === 1 ? 'try' : 'tries'} left before sign-in pauses for ${LOCK_MIN} minutes.`;
    throw new HttpError(401, m, { password: m });
  }
  c.failedLogins = 0; c.lockedUntil = null;
  await session(c, res);
}));

// Google: verify the ID token from "Sign in with Google" with Google's library.
// Returns what to send back: a signed-in session, or "check your email for a code".
async function googleSignIn(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(404, 'Google sign-in is not set up.');
  let p;
  try {
    const t = await new OAuth2Client(clientId).verifyIdToken({ idToken: String(credential || ''), audience: clientId });
    p = t.getPayload();
  } catch (e) {
    signinLog(`google token check failed: ${String(e.message).slice(0, 200)} | client id ends ${clientId.slice(-12)}`);
    throw new HttpError(401, 'Google sign-in failed. Please try again.');
  }
  if (!p?.sub) throw new HttpError(401, 'Google sign-in failed. Please try again.');
  let c = await Customer.findOne({ googleId: p.sub });
  if (!c) {
    const profile = { googleId: p.sub, name: cleanName(p.name || p.given_name || 'Customer').slice(0, 40), agreedAt: new Date(), email: p.email_verified ? p.email || '' : '', avatar: p.picture || '' };
    // New account: email a 6-digit code to their Google address first (when email is set up)
    if (mailEnabled() && profile.email) return { status: 202, body: { verify: await startVerify('email', profile.email, { type: 'google', ...profile }) } };
    c = await Customer.create(profile);
  }
  c.lastLoginAt = new Date(); await c.save();
  return { status: 200, body: { token: signCustomer(c), customer: c, needsPhone: !c.phone } };
}

// Pop-up flow (kept for older pages): the page posts the token here
r.post('/google', limit(20, 15 * 60000), ah(async (req, res) => {
  const out = await googleSignIn(req.body?.credential);
  res.status(out.status).json(out.body);
}));

// Redirect flow (works on every browser and phone): Google posts the token to this address,
// we check it, keep the result for 2 minutes under a one-time key, and send the customer back to the site.
const handoff = new Map();
const back = (res, path, q) => res.redirect(303, `${path}?${new URLSearchParams(q)}`);
r.post('/google/redirect', express.urlencoded({ extended: false, limit: '20kb' }), limit(30, 15 * 60000), async (req, res) => {
  const from = String(req.body?.state || '').startsWith('/signup') ? '/signup' : '/signin';
  try {
    // Google's double-submit check: the cookie and the form must carry the same token
    const cookie = Object.fromEntries(String(req.headers.cookie || '').split(';').map((x) => x.trim().split('=').map(decodeURIComponent)).filter((x) => x[0]));
    // (Browsers don't send this cookie back to plain http://localhost, so it's only enforced when present;
    // the Google-signed token below is what really proves the sign-in.)
    if (cookie.g_csrf_token && req.body?.g_csrf_token && cookie.g_csrf_token !== req.body.g_csrf_token) {
      signinLog('google sign-in rejected: security cookie did not match');
      throw new HttpError(400, 'Google sign-in failed. Please try again.');
    }
    if (!req.body?.credential) { signinLog('google sign-in rejected: Google sent no credential'); throw new HttpError(400, 'Google sign-in failed. Please try again.'); }
    const out = await googleSignIn(req.body.credential);
    const key = crypto.randomBytes(18).toString('base64url');
    handoff.set(key, { ...out, at: Date.now() });
    for (const [k, v] of handoff) if (Date.now() - v.at > 120000) handoff.delete(k);
    back(res, from, { g: key });
  } catch (e) {
    if (!e.status) signinLog(`google sign-in error: ${String(e.message).slice(0, 200)}`);
    back(res, from, { gerr: e.status ? e.message : 'Google sign-in failed. Please try again.' }); // show the real reason (e.g. the code email couldn't be sent)
  }
});
r.post('/google/claim', limit(30, 15 * 60000), ah(async (req, res) => {
  const k = String(req.body?.key || ''), out = handoff.get(k);
  handoff.delete(k); // one use only
  if (!out || Date.now() - out.at > 120000) throw new HttpError(410, 'That Google sign-in expired. Please tap “Continue with Google” again.');
  res.status(out.status).json(out.body);
}));

// Facebook: the page sends the user access token; we confirm it belongs to our app, then read the profile
r.post('/facebook', limit(20, 15 * 60000), ah(async (req, res) => {
  const appId = process.env.FACEBOOK_APP_ID, appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) throw new HttpError(404, 'Facebook sign-in is not set up.');
  const token = String(req.body?.accessToken || '');
  const G = (process.env.FACEBOOK_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/$/, '');
  const get = async (url) => { try { const x = await fetch(url, { signal: AbortSignal.timeout(10000) }); return x.ok ? x.json() : null; } catch { return null; } };
  const dbg = await get(`${G}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appId + '|' + appSecret)}`);
  const d = dbg?.data;
  if (!d?.is_valid || String(d.app_id) !== String(appId) || !d.user_id) throw new HttpError(401, 'Facebook sign-in failed. Please try again.');
  const me = (await get(`${G}/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(token)}`)) || {};
  if (me.id && String(me.id) !== String(d.user_id)) throw new HttpError(401, 'Facebook sign-in failed. Please try again.');
  let c = await Customer.findOne({ facebookId: String(d.user_id) });
  if (!c) {
    const profile = { facebookId: String(d.user_id), name: cleanName(me.name || 'Customer').slice(0, 40), agreedAt: new Date(), email: String(me.email || '').toLowerCase(), avatar: me.picture?.data?.url || '' };
    if (mailEnabled() && profile.email) return res.status(202).json({ verify: await startVerify('email', profile.email, { type: 'facebook', ...profile }) });
    c = await Customer.create(profile);
  }
  await session(c, res);
}));

// Sign-up code: finish creating the account once the code is right
r.post('/verify', limit(30, 15 * 60000), ah(async (req, res) => {
  const v = await checkVerify(req.body?.id, req.body?.code);
  const p = v.pending || {};
  let c;
  if (p.type === 'signup') {
    if (await Customer.exists({ phone: p.phone })) throw new HttpError(409, 'This number already has an account. Sign in instead.');
    c = await Customer.create({ name: p.name, phone: p.phone, passwordHash: p.passwordHash });
  } else if (p.type === 'google' || p.type === 'facebook') {
    const key = p.type === 'google' ? 'googleId' : 'facebookId';
    c = await Customer.findOne({ [key]: p[key] }) || await Customer.create({ [key]: p[key], name: p.name, email: p.email, avatar: p.avatar, agreedAt: new Date() });
  } else throw new HttpError(400, 'This code is for something else. Please start again.');
  await session(c, res, 201);
}));
r.post('/verify/resend', limit(10, 15 * 60000), ah(async (req, res) => res.json({ verify: await resendVerify(req.body?.id) })));

// Adding or changing a mobile number: confirm it with a texted code
r.post('/me/phone/verify', requireCustomer, limit(30, 15 * 60000), ah(async (req, res) => {
  const v = await checkVerify(req.body?.id, req.body?.code);
  const p = v.pending || {}, c = req.customer;
  if (p.type !== 'phone' || String(p.customerId) !== String(c._id)) throw new HttpError(400, 'This code is for something else. Please try again.');
  if (await Customer.exists({ phone: p.phone, _id: { $ne: c._id } })) throw new HttpError(409, 'This number is already used by another account.');
  c.phone = p.phone; await c.save();
  res.json({ customer: c, needsPhone: !c.phone });
}));

r.post('/me/email/verify', requireCustomer, limit(30, 15 * 60000), ah(async (req, res) => {
  const v = await checkVerify(req.body?.id, req.body?.code);
  const p = v.pending || {}, c = req.customer;
  if (p.type !== 'email' || String(p.customerId) !== String(c._id)) throw new HttpError(400, 'This code is for something else. Please try again.');
  c.email = p.email; await c.save();
  res.json({ customer: c, needsPhone: !c.phone });
}));

r.get('/me', requireCustomer, ah(async (req, res) => res.json({ customer: req.customer, needsPhone: !req.customer.phone, payFirst: await mustPayFirst(req.customer._id) })));

// Update name / mobile number (Google & Facebook customers add their number here)
r.patch('/me', requireCustomer, limit(30, 15 * 60000), ah(async (req, res) => {
  const b = req.body || {}, c = req.customer;
  const errs = {};
  if (b.name != null) Object.assign(errs, checkCustomerName(b.name));
  if (b.phone != null && b.phone !== '') Object.assign(errs, checkPhone(b.phone));
  const newEmail = b.email != null ? String(b.email).trim().toLowerCase() : null;
  if (newEmail && (newEmail.length > 80 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(newEmail))) errs.email = 'Enter an email like name@gmail.com.';
  if (b.newPassword != null) {
    Object.assign(errs, checkPassword(b.newPassword, 'newPassword'));
    if (c.passwordHash && !(await c.checkPassword(b.currentPassword || ''))) errs.currentPassword = 'Your current password is incorrect.';
  }
  assertValid(errs);
  let newPhone = null;
  if (b.phone != null && b.phone !== '') {
    const phone = normPhone(b.phone);
    if (phone !== c.phone && (await Customer.exists({ phone, _id: { $ne: c._id } })))
      throw new HttpError(409, 'This number is already used by another account.', { phone: 'This number is already used by another account.' });
    if (phone !== c.phone) c.phone = phone;
  }
  if (b.name != null) c.name = cleanName(b.name);
  if (b.newPassword != null) c.passwordHash = await Customer.hash(b.newPassword);
  if (typeof b.smsReady === 'boolean') c.smsReady = b.smsReady;
  if (newEmail === '' && !c.googleId && !c.facebookId) c.email = '';
  await c.save();
  // A new email is only saved after the emailed code is entered (it's used for password resets)
  if (newEmail && newEmail !== c.email) {
    if (!mailEnabled()) throw new HttpError(503, 'Adding an email isn’t available right now. Please try again later.', { email: 'Not available right now.' });
    if (await Customer.exists({ email: newEmail, _id: { $ne: c._id } })) throw new HttpError(409, 'That email is already used by another account.', { email: 'Already used by another account.' });
    return res.status(202).json({ customer: c, needsPhone: !c.phone, verify: await startVerify('email', newEmail, { type: 'email', customerId: String(c._id), email: newEmail }) });
  }
  // A new number is only saved after the texted code is entered
  if (newPhone) return res.status(202).json({ customer: c, needsPhone: !c.phone, verify: await startVerify('sms', newPhone, { type: 'phone', customerId: String(c._id), phone: newPhone }) });
  res.json({ customer: c, needsPhone: !c.phone });
}));

// ---------- Forgot password: a 6-digit code to the account's email ----------
r.post('/forgot', limit(5, 15 * 60000), ah(async (req, res) => {
  const who = String(req.body?.who || '').trim();
  if (!who) throw new HttpError(400, 'Enter your email or mobile number.', { who: 'Enter your email or mobile number.' });
  const isEmail = who.includes('@');
  if (!isEmail && !normPhone(who)) throw new HttpError(400, 'Enter your email, or a PH mobile number like 0917 123 4567.', { who: 'Enter your email, or a mobile number like 0917 123 4567.' });
  const c = await Customer.findOne(isEmail ? { email: who.toLowerCase() } : { phone: normPhone(who) });
  if (!c) throw new HttpError(404, 'We couldn’t find an account with that email or number.', { who: 'We couldn’t find an account with that email or number.' });
  if (!c.email) throw new HttpError(400, 'This account has no email address, so we can’t send a code. Please ask at the counter and we’ll help you reset it.', { who: 'No email on this account. Please ask at the counter.' });
  if (!mailEnabled()) throw new HttpError(503, 'Password reset by email isn’t available right now. Please ask at the counter.');
  // Google / Facebook accounts have no password yet: the same code lets them set one
  res.json({ verify: await startVerify('email', c.email, { type: 'reset', customerId: String(c._id) }), setting: !c.passwordHash, social: c.googleId ? 'Google' : c.facebookId ? 'Facebook' : '' });
}));

r.post('/reset', limit(20, 15 * 60000), ah(async (req, res) => {
  assertValid(checkPassword(req.body?.password));
  const v = await checkVerify(req.body?.id, req.body?.code);
  const p = v.pending || {};
  if (p.type !== 'reset') throw new HttpError(400, 'This code is for something else. Please start again.');
  const c = await Customer.findById(p.customerId);
  if (!c) throw new HttpError(404, 'That account no longer exists.');
  c.passwordHash = await Customer.hash(req.body.password); c.failedLogins = 0; c.lockedUntil = null;
  await session(c, res);
}));

// ---------- Favourite drinks ----------
const FAV_MAX = 10;
r.post('/favorites', requireCustomer, limit(40, 15 * 60000), ah(async (req, res) => {
  const b = req.body || {}, c = req.customer;
  const line = { productId: b.productId, sizeId: b.sizeId ?? null, addonIds: Array.isArray(b.addonIds) ? b.addonIds : [], sweet: b.sweet || '', note: String(b.note || '').trim(), qty: 1 };
  const { priced } = await priceOrder([line]); // same checks as a real order: drink exists, options allowed
  const label = String(b.label || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const same = (f) => String(f.productId) === String(line.productId) && (f.sizeId || null) === (line.sizeId || null) && (f.sweet || '') === line.sweet
    && [...(f.addonIds || [])].sort().join() === [...line.addonIds].map(String).sort().join() && (f.note || '') === line.note;
  if (c.favorites.some(same)) throw new HttpError(409, 'This drink is already in your favourites.');
  if (c.favorites.length >= FAV_MAX) throw new HttpError(409, `You can save up to ${FAV_MAX} favourites. Remove one first.`);
  c.favorites.push({ label: label || priced[0].name, productId: line.productId, sizeId: line.sizeId, sweet: line.sweet, addonIds: line.addonIds.map(String), note: line.note });
  await c.save();
  res.status(201).json({ customer: c });
}));

r.delete('/favorites/:favId', requireCustomer, ah(async (req, res) => {
  const c = req.customer;
  const before = c.favorites.length;
  c.favorites = c.favorites.filter((f) => String(f._id) !== String(req.params.favId));
  if (c.favorites.length === before) throw new HttpError(404, 'That favourite was already removed.');
  await c.save();
  res.json({ customer: c });
}));

// ---------- Ratings (private: only the shop sees them) ----------
const RATE_DAYS = 14;
r.post('/orders/:code/rating', requireCustomer, limit(30, 15 * 60000), ah(async (req, res) => {
  const stars = Number(req.body?.stars);
  const comment = String(req.body?.comment || '').trim().replace(/\s+/g, ' ');
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'Choose 1 to 5 stars.', { stars: 'Choose 1 to 5 stars.' });
  if (comment.length > 300) throw new HttpError(400, 'Keep your comment under 300 characters.', { comment: 'At most 300 characters.' });
  const sale = await Sale.findOne({ trackCode: String(req.params.code), customerId: req.customer._id });
  if (!sale) throw new HttpError(404, 'Order not found.');
  if (sale.status !== 'paid') throw new HttpError(409, 'You can rate your order after you pick it up.');
  if (sale.rating?.stars) throw new HttpError(409, 'You already rated this order. Thank you!');
  if (Date.now() - new Date(sale.completedAt || sale.updatedAt) > RATE_DAYS * 864e5) throw new HttpError(409, `Ratings are open for ${RATE_DAYS} days after pickup.`);
  sale.rating = { stars, comment, at: new Date() };
  await sale.save();
  res.json({ rating: sale.rating });
}));

// Order history
r.get('/orders', requireCustomer, ah(async (req, res) => {
  const list = await Sale.find({ customerId: req.customer._id, source: 'online' }).sort({ createdAt: -1 }).limit(50);
  res.json(list.map((s) => ({
    code: s.trackCode, no: s.no, date: s.date, status: s.status === 'void' ? 'cancelled' : s.status, total: s.total,
    createdAt: s.createdAt, paidOnline: !!s.paidOnline, items: s.lines.map((l) => `${l.qty}× ${l.name}`).join(', '),
    lines: s.lines.map(({ product, name, mods, qty }) => ({ product, name, mods, qty })),
    rating: s.rating?.stars ? { stars: s.rating.stars, comment: s.rating.comment || '' } : null,
    canRate: s.status === 'paid' && !s.rating?.stars && Date.now() - new Date(s.completedAt || s.updatedAt) < RATE_DAYS * 864e5,
  })));
}));

export default r;
