// Owner / admin: the customers who signed up on the ordering website, with what they've bought.
import { Router } from 'express';
import mongoose from 'mongoose';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError, shopTime, TZ } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { STAMPS_PER_REWARD } from '../../../src/shared/loyalty.mjs';

const r = Router();
r.use(requireAdmin);
r.param('id', checkId);

const DONE = { status: 'paid', training: { $ne: true } }; // finished, real sales only
const how = (c) => (c.googleId ? 'Google' : c.facebookId ? 'Facebook' : 'Mobile no.');

/** Start of this month in the shop's time zone, as a Date. */
function monthStart() {
  const { date } = shopTime(); // YYYY-MM-DD
  const ym = date.slice(0, 7);
  // midnight on the 1st in Manila (UTC+8, no DST); other zones fall back to UTC midnight
  return new Date(`${ym}-01T00:00:00${TZ === 'Asia/Manila' ? '+08:00' : 'Z'}`);
}

// Everyone with an account, newest first, plus totals for the top of the page
r.get('/', ah(async (_req, res) => {
  const custs = await Customer.find({}, 'name phone email googleId facebookId stamps lifetimeStamps rewardsUsed createdAt lastLoginAt')
    .sort({ createdAt: -1 }).limit(5000).lean();
  const ids = custs.map((c) => c._id);
  // Totals per customer (done in JS: works the same on every MongoDB-compatible database)
  const sales = await Sale.find({ ...DONE, customerId: { $in: ids } }, 'customerId total createdAt source lines.name lines.qty').lean();
  const S = new Map();
  for (const x of sales) {
    const k = String(x.customerId);
    let t = S.get(k);
    if (!t) S.set(k, t = { orders: 0, online: 0, spent: 0, last: null, drinks: {} });
    t.orders += 1; t.spent += +x.total || 0;
    if (x.source === 'online') t.online += 1;
    if (!t.last || x.createdAt > t.last) t.last = x.createdAt;
    for (const l of x.lines || []) t.drinks[l.name] = (t.drinks[l.name] || 0) + (+l.qty || 0);
  }
  const fav = (t) => { let best = null; for (const [name, qty] of Object.entries(t?.drinks || {})) if (!best || qty > best.qty) best = { name, qty }; return best; };
  const list = custs.map((c) => {
    const s = S.get(String(c._id)) || {};
    const f = fav(s);
    return {
      _id: c._id, name: c.name, phone: c.phone || '', email: c.email || '', via: how(c),
      joined: c.createdAt, lastLoginAt: c.lastLoginAt || null,
      orders: s.orders || 0, online: s.online || 0, spent: Math.round((s.spent || 0) * 100) / 100, lastOrder: s.last || null,
      favorite: f ? { name: f.name, qty: f.q } : null,
      stamps: c.stamps || 0, rewardReady: Math.floor((c.stamps || 0) / STAMPS_PER_REWARD),
    };
  });
  const m0 = monthStart();
  const d30 = new Date(Date.now() - 30 * 864e5);
  res.json({
    summary: {
      total: list.length,
      newThisMonth: list.filter((c) => new Date(c.joined) >= m0).length,
      ordered: list.filter((c) => c.orders > 0).length,
      returning: list.filter((c) => c.orders >= 2).length,
      active30: list.filter((c) => c.lastOrder && new Date(c.lastOrder) >= d30).length,
      rewardReady: list.filter((c) => c.rewardReady > 0).length,
      spent: Math.round(list.reduce((a, c) => a + c.spent, 0) * 100) / 100,
    },
    list,
  });
}));

// One customer: details and their last 30 finished orders
r.get('/:id', ah(async (req, res) => {
  const c = await Customer.findById(req.params.id).lean();
  if (!c) throw new HttpError(404, 'This customer account no longer exists.');
  const id = new mongoose.Types.ObjectId(String(c._id));
  const [orders, all] = await Promise.all([
    Sale.find({ ...DONE, customerId: id }, 'no createdAt total source lines.name lines.qty delivery.area stampsAwarded stampsUsed pay.method')
      .sort({ createdAt: -1 }).limit(30).lean(),
    Sale.find({ ...DONE, customerId: id }, 'total').lean(),
  ]);
  const tot = [{ n: all.length, spent: all.reduce((a, x) => a + (+x.total || 0), 0) }];
  res.json({
    _id: c._id, name: c.name, phone: c.phone || '', email: c.email || '', via: how(c), joined: c.createdAt, lastLoginAt: c.lastLoginAt || null,
    stamps: c.stamps || 0, lifetimeStamps: c.lifetimeStamps || 0, rewardsUsed: c.rewardsUsed || 0,
    address: c.address?.area || c.address?.detail ? { area: c.address.area || '', detail: c.address.detail || '', landmark: c.address.landmark || '' } : null,
    favorites: (c.favorites || []).length,
    orders: tot[0]?.n || 0, spent: Math.round((tot[0]?.spent || 0) * 100) / 100,
    recent: orders.map((o) => ({
      _id: o._id, no: o.no, at: o.createdAt, total: o.total, source: o.source || 'pos', method: o.pay?.method || '',
      area: o.delivery?.area || '', stamps: o.stampsAwarded || 0, freeDrink: (o.stampsUsed || 0) > 0,
      items: (o.lines || []).map((l) => `${l.qty} × ${l.name}`).join(', '),
    })),
  });
}));

export default r;
