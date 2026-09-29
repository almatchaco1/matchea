// Owner: expenses that aren't ingredients (rent, electricity, salaries…). Used for take-home profit.
import { Router } from 'express';
import Expense from '../models/Expense.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError, assertValid, shopTime, dayRange } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { toTrash } from '../lib/trash.js';
import { checkExpense, LIMITS } from '../../../src/shared/rules.mjs';

const r = Router();
r.use(requireAdmin);
r.param('id', checkId);
const clean = (b) => ({ date: String(b.date), cat: String(b.cat).trim(), amount: Math.round(+b.amount * 100) / 100, note: String(b.note || '').trim() });

r.get('/', ah(async (req, res) => {
  const { from, to } = dayRange(req.query, shopTime().date, LIMITS.reportDays);
  const list = await Expense.find({ date: { $gte: from, $lte: to } }).sort({ date: -1, createdAt: -1 }).lean();
  const byCat = {};
  for (const e of list) byCat[e.cat] = Math.round(((byCat[e.cat] || 0) + e.amount) * 100) / 100;
  res.json({ from, to, list, total: Math.round(list.reduce((a, e) => a + e.amount, 0) * 100) / 100, byCat: Object.entries(byCat).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount) });
}));

r.post('/', ah(async (req, res) => {
  assertValid(checkExpense(req.body || {}));
  res.status(201).json(await Expense.create({ ...clean(req.body), by: req.user.name }));
}));

r.put('/:id', ah(async (req, res) => {
  assertValid(checkExpense(req.body || {}));
  const e = await Expense.findByIdAndUpdate(req.params.id, clean(req.body), { new: true });
  if (!e) throw new HttpError(404, 'Expense not found.');
  res.json(e);
}));

r.delete('/:id', ah(async (req, res) => {
  const e = await Expense.findByIdAndDelete(req.params.id);
  if (!e) throw new HttpError(404, 'Expense not found.');
  await toTrash('expense', e, req.user.name);
  res.status(204).end();
}));

export default r;
