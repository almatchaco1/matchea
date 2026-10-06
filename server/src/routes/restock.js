// Restocking in 3 steps: make a list → mark it ordered → receive the delivery (stock goes up in one go).
import { Router } from 'express';
import Ingredient from '../models/Ingredient.js';
import RestockOrder from '../models/RestockOrder.js';
import { ah, HttpError } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { checkStockQty, isObjectId } from '../../../src/shared/rules.mjs';
import { receiveOne, noteOf, moneyOf, supplierOf } from './ingredients.js';

const r = Router();
r.param('id', checkId);
const r2 = (n) => Math.round(n * 100) / 100;

// Orders on the way, plus the last few received
r.get('/', ah(async (_req, res) => {
  const [open, recent] = await Promise.all([
    RestockOrder.find({ status: 'ordered' }).sort({ createdAt: -1 }).limit(20).lean(),
    RestockOrder.find({ status: 'received' }).sort({ receivedAt: -1 }).limit(10).lean(),
  ]);
  res.json({ open, recent });
}));

/** Checks a list of { ing, qty } and returns the matching ingredients. */
async function readItems(raw, { allowZero = false } = {}) {
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, 'Add at least one item to the list.');
  if (raw.length > 200) throw new HttpError(400, 'That list is too long.');
  const fields = {};
  const ids = raw.map((x) => String(x?.ing || ''));
  if (ids.some((id) => !isObjectId(id))) throw new HttpError(400, 'Something in the list is not an ingredient.');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'An ingredient is on the list twice.');
  raw.forEach((x) => {
    if (allowZero && (+x.qty === 0 || x.qty === '0')) return;
    const e = checkStockQty(x.qty, 'receive'); if (e.qty) fields[x.ing] = e.qty;
  });
  if (Object.keys(fields).length) throw new HttpError(400, 'Fix the highlighted amounts.', fields);
  const ings = await Ingredient.find({ _id: { $in: ids } });
  if (ings.length !== ids.length) throw new HttpError(409, 'An ingredient on the list was deleted. Reload and try again.');
  const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));
  return raw.map((x) => ({ ing: byId[String(x.ing)], qty: +x.qty, paid: x.paid }));
}

// Step 2: the list was sent to the supplier
r.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const items = await readItems(b.items);
  const sup = await supplierOf(b.supplier);
  const order = await RestockOrder.create({
    items: items.map(({ ing, qty }) => ({ ing: ing._id, name: ing.name, unit: ing.unit, qty })),
    supplier: sup?._id, supplierName: sup?.name || '', note: noteOf(b.note),
    estCost: r2(items.reduce((a, { ing, qty }) => a + qty * (+ing.cost || 0), 0)), createdBy: req.user.name,
  });
  res.status(201).json(order);
}));

// Step 3: the delivery arrived. items: [{ ing, qty (what arrived, 0 = didn't come), paid? }]
// Also used without an order ("receive several things now") with id "now".
async function receiveAll(req, order) {
  const b = req.body || {};
  const items = await readItems(b.items, { allowZero: true });
  if (!items.some((x) => x.qty > 0)) throw new HttpError(400, 'Enter what arrived for at least one item.');
  const paids = items.map((x, k) => { try { return moneyOf(x.paid, `paid.${k}`); } catch (e) { e.fields = { [String(x.ing._id) + ':paid']: 'Enter an amount like 1250.' }; throw e; } });
  const sup = await supplierOf(b.supplier ?? order?.supplier);
  const note = noteOf(b.note || (order ? `Restock order ${String(order._id).slice(-5).toUpperCase()}` : ''));
  const done = [];
  for (const [k, x] of items.entries()) {
    if (!(x.qty > 0)) continue;
    await receiveOne(x.ing, { qty: x.qty, paid: paids[k], sup, note, by: req.user.name });
    done.push({ ing: x.ing._id, name: x.ing.name, unit: x.ing.unit, got: x.qty, paid: paids[k] });
  }
  return { done, items, paids, sup };
}

r.post('/now', ah(async (req, res) => {
  const { done } = await receiveAll(req, null);
  res.json({ received: done.length, items: done });
}));

r.post('/:id/receive', ah(async (req, res) => {
  // Claim the order first, so two devices can't add the same delivery twice
  const order = await RestockOrder.findOneAndUpdate({ _id: req.params.id, status: 'ordered' }, { status: 'received', receivedBy: req.user.name, receivedAt: new Date() }, { new: true });
  if (!order) {
    const cur = await RestockOrder.findById(req.params.id, 'status');
    throw new HttpError(cur ? 409 : 404, cur ? 'This order was already received or cancelled. The list will refresh.' : 'Order not found.');
  }
  try {
    const { items, paids } = await receiveAll(req, order);
    const got = Object.fromEntries(items.map((x, k) => [String(x.ing._id), { got: x.qty, paid: paids[k] }]));
    order.items = order.items.map((it) => ({ ...it.toObject(), got: got[String(it.ing)]?.got ?? 0, paid: got[String(it.ing)]?.paid ?? null }));
    // things that arrived but weren't on the list
    for (const x of items) if (!order.items.some((it) => String(it.ing) === String(x.ing._id)) && x.qty > 0) order.items.push({ ing: x.ing._id, name: x.ing.name, unit: x.ing.unit, qty: 0, got: x.qty, paid: got[String(x.ing._id)].paid });
    order.paidTotal = r2(paids.reduce((a, p) => a + (p || 0), 0));
    await order.save();
    res.json(order);
  } catch (e) {
    await RestockOrder.updateOne({ _id: order._id }, { status: 'ordered', $unset: { receivedBy: 1, receivedAt: 1 } }); // nothing was added: put it back
    throw e;
  }
}));

r.post('/:id/cancel', ah(async (req, res) => {
  const order = await RestockOrder.findOneAndUpdate({ _id: req.params.id, status: 'ordered' }, { status: 'cancelled', cancelledBy: req.user.name, cancelledAt: new Date() }, { new: true });
  if (!order) throw new HttpError(409, 'This order was already received or cancelled. The list will refresh.');
  res.json(order);
}));

export default r;
