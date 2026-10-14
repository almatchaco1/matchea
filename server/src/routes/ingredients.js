import { Router } from 'express';
import Ingredient from '../models/Ingredient.js';
import Product from '../models/Product.js';
import Settings from '../models/Settings.js';
import Sale from '../models/Sale.js';
import StockMove from '../models/StockMove.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError, shopTime, applyUsage, assertValid, nameRegex } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { toTrash } from '../lib/trash.js';
import { checkIngredient, checkStockQty, isObjectId, unitCostOf } from '../../../src/shared/rules.mjs';

export { noteOf, moneyOf };
const r = Router();
r.param('id', checkId);
const fields = (b) => {
  const hasPack = (b.packSize !== '' && b.packSize != null) || (b.packCost !== '' && b.packCost != null);
  const pack = hasPack ? { name: String(b.packName).trim().toLowerCase(), size: +b.packSize, cost: Math.round((+b.packCost || 0) * 100) / 100 } : null;
  return {
    name: String(b.name).trim(),
    cat: String(b.cat || '').trim(),
    unit: b.unit,
    reorder: +b.reorder,
    cost: pack ? unitCostOf(pack.cost, pack.size) : +b.cost,
    pack,
  };
};
async function assertUniqueName(name, exceptId) {
  const dup = await Ingredient.findOne({ name: nameRegex(name), ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, '_id');
  if (dup) throw new HttpError(409, 'An ingredient with this name already exists.', { name: 'An ingredient with this name already exists.' });
}

// List with today's usage (non-voided sales)
r.get('/', ah(async (_req, res) => {
  const { date } = shopTime();
  const weekAgo = shopTime(new Date(Date.now() - 6 * 864e5)).date; // today + the 6 days before
  const usedSince = (from) => Sale.aggregate([
    { $match: { date: { $gte: from }, status: { $in: ['paid', 'preparing', 'ready'] } } },
    { $unwind: '$usage' },
    { $group: { _id: '$usage.ing', qty: { $sum: '$usage.qty' } } },
  ]);
  const [ings, used, week] = await Promise.all([Ingredient.find().sort({ cat: 1, name: 1 }).lean(), usedSince(date), usedSince(weekAgo)]);
  const m = Object.fromEntries(used.map((u) => [String(u._id), u.qty]));
  const w = Object.fromEntries(week.map((u) => [String(u._id), u.qty]));
  // perDay: average daily use over the last 7 days, for "days left" and restock amounts
  res.json(ings.map((i) => ({ ...i, usedToday: m[String(i._id)] || 0, perDay: Math.round(((w[String(i._id)] || 0) / 7) * 100) / 100 })));
}));

r.post('/', requireAdmin, ah(async (req, res) => {
  const b = req.body || {};
  assertValid(checkIngredient(b, { isNew: true }));
  const f = fields(b);
  await assertUniqueName(f.name);
  const stock = +b.stock;
  const ing = await Ingredient.create({ ...f, stock });
  if (stock) await StockMove.create({ ing: ing._id, delta: stock, after: stock, reason: 'create', by: req.user.name });
  res.status(201).json(ing);
}));

r.put('/:id', requireAdmin, ah(async (req, res) => {
  const b = req.body || {};
  assertValid(checkIngredient(b));
  const f = fields(b);
  await assertUniqueName(f.name, req.params.id);
  const ing = await Ingredient.findByIdAndUpdate(req.params.id, f, { new: true });
  if (!ing) throw new HttpError(404, 'Ingredient not found.');
  res.json(ing);
}));

const noteOf = (v) => {
  const n = String(v || '').trim();
  if (n.length > 120) throw new HttpError(400, 'The note can be at most 120 characters.', { note: 'At most 120 characters.' });
  return n;
};
const moneyOf = (v, field) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new HttpError(400, 'Enter an amount like 1250.', { [field]: 'Enter an amount like 1250.' });
  if (Math.round(n * 100) !== Math.round(n * 100 * 1e6) / 1e6) throw new HttpError(400, 'Use at most 2 decimals.', { [field]: 'Use at most 2 decimals.' });
  return Math.round(n * 100) / 100;
};

// Stock came in: add it. Optional: amount paid (updates the cost per unit, so drink costs and profit stay right).
/** Add qty to an ingredient's stock and log it as a purchase. Used by Receive and by receiving a restock order. */
export async function receiveOne(ing, { qty, paid = null, note = '', by, updateCost = true }) {
  await applyUsage({ [String(ing._id)]: qty }, 1, { reason: 'receive', by, note });
  // add the purchase details to the move just logged
  const move = await StockMove.findOne({ ing: ing._id, reason: 'receive' }).sort({ createdAt: -1, _id: -1 });
  if (move && paid != null) await StockMove.updateOne({ _id: move._id }, { value: paid });
  if (paid != null && paid > 0 && updateCost) {
    const unit = unitCostOf(paid, qty);
    await Ingredient.updateOne({ _id: ing._id }, ing.pack?.size ? { cost: unit, 'pack.cost': Math.round(unit * ing.pack.size * 100) / 100 } : { cost: unit });
  }
}

r.post('/:id/receive', ah(async (req, res) => {
  const b = req.body || {};
  const note = noteOf(b.note);
  assertValid(checkStockQty(b.qty, 'receive'));
  const qty = +b.qty;
  const paid = moneyOf(b.paid, 'paid');
  const ing = await Ingredient.findById(req.params.id);
  if (!ing) throw new HttpError(404, 'Ingredient not found.');
  await receiveOne(ing, { qty, paid, note, by: req.user.name, updateCost: b.updateCost !== false });
  res.json(await Ingredient.findById(req.params.id));
}));

r.post('/:id/count', ah(async (req, res) => {
  assertValid(checkStockQty(req.body?.qty, 'count'));
  const qty = +req.body.qty;
  const before = await Ingredient.findById(req.params.id);
  if (!before) throw new HttpError(404, 'Ingredient not found.');
  const ing = await Ingredient.findByIdAndUpdate(req.params.id, { stock: qty }, { new: true });
  await StockMove.create({ ing: ing._id, delta: qty - before.stock, after: qty, reason: 'count', by: req.user.name });
  res.json(ing);
}));

// Stock count for everything at once: { counts: { <id>: qty, … } }. Only changed items are saved.
r.post('/count-all', ah(async (req, res) => {
  const counts = req.body?.counts;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) throw new HttpError(400, 'Nothing to save.');
  const ids = Object.keys(counts);
  if (!ids.length) throw new HttpError(400, 'Enter at least one count.');
  if (ids.length > 500 || ids.some((id) => !isObjectId(id))) throw new HttpError(400, 'Something in the list is not an ingredient.');
  const fields = {};
  ids.forEach((id) => { const e = checkStockQty(counts[id], 'count'); if (e.qty) fields[id] = e.qty; });
  if (Object.keys(fields).length) throw new HttpError(400, 'Fix the highlighted counts.', fields);
  const ings = await Ingredient.find({ _id: { $in: ids } });
  if (ings.length !== ids.length) throw new HttpError(409, 'An ingredient was deleted. Reload and try again.');
  const changed = ings.filter((i) => Math.abs(+counts[i._id] - i.stock) > 1e-9);
  if (changed.length) {
    await Ingredient.bulkWrite(changed.map((i) => ({ updateOne: { filter: { _id: i._id }, update: { stock: +counts[i._id] } } })));
    await StockMove.insertMany(changed.map((i) => ({ ing: i._id, delta: +counts[i._id] - i.stock, after: +counts[i._id], reason: 'count', by: req.user.name, note: 'Stock count', value: Math.round((+counts[i._id] - i.stock) * (+i.cost || 0) * 100) / 100 })));
  }
  const diff = changed.reduce((a, i) => a + (+counts[i._id] - i.stock) * (+i.cost || 0), 0);
  res.json({ counted: ids.length, changed: changed.length, value: Math.round(diff * 100) / 100 });
}));

r.get('/:id/moves', ah(async (req, res) => {
  res.json(await StockMove.find({ ing: req.params.id }).sort({ createdAt: -1 }).limit(300));
}));

r.delete('/:id', requireAdmin, ah(async (req, res) => {
  const id = req.params.id;
  const s = await Settings.get();
  const inOptions = [...s.sizes.map((x) => x.cup), ...s.milks.map((x) => x.ing), ...s.addons.map((x) => x.ing)].some((x) => String(x) === id);
  const usedBy = await Product.find({ 'recipe.ing': id }, 'name');
  if (usedBy.length || inOptions)
    throw new HttpError(409, `Still used by ${usedBy.map((p) => p.name).concat(inOptions ? ['a size, milk or add-on option'] : []).join(', ')}. Remove it there first.`);
  const gone = await Ingredient.findByIdAndDelete(id);
  if (gone) await toTrash('ingredient', gone, req.user.name);
  res.status(204).end();
}));

export default r;
