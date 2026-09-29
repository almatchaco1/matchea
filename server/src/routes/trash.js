// Owner: the recycle bin. Deleted drinks, ingredients, suppliers and expenses can be restored for 30 days.
import { Router } from 'express';
import Trash from '../models/Trash.js';
import Product from '../models/Product.js';
import Ingredient from '../models/Ingredient.js';
import Supplier from '../models/Supplier.js';
import Expense from '../models/Expense.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError, nameRegex } from '../lib/util.js';
import { checkId } from '../lib/ids.js';

const r = Router();
r.use(requireAdmin);
r.param('id', checkId);
const MODELS = { product: Product, ingredient: Ingredient, supplier: Supplier, expense: Expense };
const LABEL = { product: 'drink', ingredient: 'ingredient', supplier: 'supplier', expense: 'expense' };

r.get('/', ah(async (_req, res) => {
  await Trash.deleteMany({ expiresAt: { $lt: new Date() } }); // in case the database doesn't expire them itself
  const list = await Trash.find({}, 'kind name by createdAt expiresAt').sort({ createdAt: -1 }).limit(300).lean();
  res.json(list);
}));

r.post('/:id/restore', ah(async (req, res) => {
  const t = await Trash.findById(req.params.id).lean();
  if (!t) throw new HttpError(404, 'That item is no longer in the recycle bin.');
  const M = MODELS[t.kind];
  const data = { ...t.data };
  if (await M.exists({ _id: data._id })) { await Trash.deleteOne({ _id: t._id }); return res.json({ ok: true, already: true }); }
  if (t.kind !== 'expense' && data.name && (await M.exists({ name: nameRegex(data.name) })))
    throw new HttpError(409, `There is already a ${LABEL[t.kind]} called “${data.name}”. Rename or delete that one first.`);
  await M.collection.insertOne(data); // exactly as it was, with the same id (so old sales and recipes still link to it)
  await Trash.deleteOne({ _id: t._id });
  const notes = [];
  if (t.kind === 'product' && data.recipe?.length) {
    const ids = data.recipe.map((x) => x.ing);
    const n = await Ingredient.countDocuments({ _id: { $in: ids } });
    if (n < ids.length) notes.push('Some of its recipe ingredients were deleted. Check the recipe in the Menu tab.');
  }
  res.json({ ok: true, kind: t.kind, name: t.name, notes });
}));

r.delete('/:id', ah(async (req, res) => {
  await Trash.deleteOne({ _id: req.params.id });
  res.status(204).end();
}));

export default r;
