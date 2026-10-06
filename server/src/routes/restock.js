// Add several things to stock at once (the shopping list's "Add to stock").
import { Router } from 'express';
import Ingredient from '../models/Ingredient.js';
import { ah, HttpError } from '../lib/util.js';
import { checkStockQty, isObjectId } from '../../../src/shared/rules.mjs';
import { receiveOne, noteOf, moneyOf } from './ingredients.js';

const r = Router();

// items: [{ ing, qty (0 = skip), paid? (total paid for that item: updates its cost) }]
r.post('/now', ah(async (req, res) => {
  const raw = req.body?.items;
  if (!Array.isArray(raw) || !raw.length) throw new HttpError(400, 'Add at least one item.');
  if (raw.length > 200) throw new HttpError(400, 'That list is too long.');
  const ids = raw.map((x) => String(x?.ing || ''));
  if (ids.some((id) => !isObjectId(id))) throw new HttpError(400, 'Something in the list is not an ingredient.');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'An ingredient is on the list twice.');
  const fields = {};
  const paids = raw.map((x) => {
    if (+x.qty === 0 && x.qty !== '') return null;
    const e = checkStockQty(x.qty, 'receive'); if (e.qty) fields[x.ing] = e.qty;
    try { return moneyOf(x.paid, 'paid'); } catch { fields[`${x.ing}:paid`] = 'Enter an amount like 1250.'; return null; }
  });
  if (Object.keys(fields).length) throw new HttpError(400, 'Fix the highlighted amounts.', fields);
  if (!raw.some((x) => +x.qty > 0)) throw new HttpError(400, 'Enter an amount for at least one item.');
  const ings = await Ingredient.find({ _id: { $in: ids } });
  if (ings.length !== ids.length) throw new HttpError(409, 'An ingredient on the list was deleted. Reload and try again.');
  const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));
  const note = noteOf(req.body?.note);
  const done = [];
  for (const [k, x] of raw.entries()) {
    if (!(+x.qty > 0)) continue;
    await receiveOne(byId[String(x.ing)], { qty: +x.qty, paid: paids[k], note, by: req.user.name });
    done.push({ ing: x.ing, qty: +x.qty });
  }
  res.json({ received: done.length, items: done });
}));

export default r;
