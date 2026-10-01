// Barista screen: drinks still to make. Counter sales (paid, not made yet, last 3 hours)
// and online orders being prepared. Tapping Done on an online order marks it ready (and texts the customer).
import { Router } from 'express';
import Sale from '../models/Sale.js';
import { ah, HttpError } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { notifyReady } from '../lib/notify.js';

const r = Router();
r.param('id', checkId);
const WINDOW_H = 3;

const ticket = (s) => ({
  _id: s._id, no: s.no, source: s.status === 'staff' ? 'staff' : s.source, customer: s.customer || '', note: s.pickupNote || '',
  createdAt: s.source === 'online' ? s.acceptedAt || s.createdAt : s.createdAt, paidOnline: !!s.paidOnline,
  lines: s.lines.map((l, i) => ({ i, name: l.name, mods: l.mods || '', qty: l.qty, done: (s.lineDone || []).includes(i),
    product: l.product ? String(l.product) : null, sizeId: l.sizeId || null, milkId: l.milkId || null, addonIds: l.addonIds?.length ? l.addonIds : null })),
});

r.get('/', ah(async (_req, res) => {
  const since = new Date(Date.now() - WINDOW_H * 3600e3);
  const [pos, online, waiting] = await Promise.all([
    Sale.find({ source: 'pos', status: { $in: ['paid', 'staff'] }, baristaDone: { $ne: true }, createdAt: { $gte: since } }).sort({ createdAt: 1 }).limit(60),
    Sale.find({ source: 'online', status: 'preparing' }).sort({ acceptedAt: 1, createdAt: 1 }).limit(60),
    Sale.countDocuments({ source: 'online', status: 'new' }),
  ]);
  const tickets = [...pos, ...online].map(ticket).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json({ tickets, waiting });
}));

// Tick / untick one drink
r.post('/:id/line/:i', ah(async (req, res) => {
  const i = Number(req.params.i);
  if (!Number.isInteger(i) || i < 0 || i > 50) throw new HttpError(400, 'Unknown drink.');
  const done = req.body?.done !== false;
  const s = await Sale.findOneAndUpdate({ _id: req.params.id, $or: [{ source: 'pos', status: { $in: ['paid', 'staff'] } }, { source: 'online', status: 'preparing' }] },
    done ? { $addToSet: { lineDone: i } } : { $pull: { lineDone: i } }, { new: true });
  if (!s) throw new HttpError(409, 'This order is no longer on the barista screen.');
  res.json(ticket(s));
}));

// Whole order made
r.post('/:id/done', ah(async (req, res) => {
  const cur = await Sale.findById(req.params.id, 'source status');
  if (!cur) throw new HttpError(404, 'Order not found.');
  if (cur.source === 'online') {
    const s = await Sale.findOneAndUpdate({ _id: cur._id, status: 'preparing' }, { status: 'ready', readyAt: new Date(), madeAt: new Date(), madeBy: req.user.name }, { new: true });
    if (!s) throw new HttpError(409, 'This online order was already marked ready or cancelled.');
    notifyReady(s).catch((e) => console.error('Ready text failed:', e.message));
    return res.json({ ok: true, ready: true });
  }
  const s = await Sale.findOneAndUpdate({ _id: cur._id, status: { $in: ['paid', 'staff'] }, baristaDone: { $ne: true } }, { baristaDone: true, madeAt: new Date(), madeBy: req.user.name }, { new: true });
  if (!s) throw new HttpError(409, 'This order was already done or voided.');
  if (s.textReady && s.phone) notifyReady(s).catch((e) => console.error('Ready text failed:', e.message));
  res.json({ ok: true, texted: !!(s.textReady && s.phone) });
}));

// Clear every counter order from the screen (e.g. the first time, or after a rush). Online orders stay.
r.post('/clear', ah(async (req, res) => {
  const since = new Date(Date.now() - WINDOW_H * 3600e3);
  const r2 = await Sale.updateMany({ source: 'pos', status: { $in: ['paid', 'staff'] }, baristaDone: { $ne: true }, createdAt: { $gte: since } }, { baristaDone: true, madeAt: new Date(), madeBy: req.user.name });
  res.json({ cleared: r2.modifiedCount });
}));

// Undo "Done" (counter orders only, within 10 minutes)
r.post('/:id/undo', ah(async (req, res) => {
  const s = await Sale.findOneAndUpdate({ _id: req.params.id, source: 'pos', baristaDone: true, madeAt: { $gte: new Date(Date.now() - 10 * 60e3) } }, { baristaDone: false, madeAt: null }, { new: true });
  if (!s) throw new HttpError(409, 'Too late to undo this one.');
  res.json(ticket(s));
}));

export default r;
