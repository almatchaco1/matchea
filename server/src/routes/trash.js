// Owner: the Archive. Deleted drinks, ingredients, expenses, staff accounts and menu options (sizes, milks,
// add-ons, delivery areas) are kept here until the owner deletes them for good, and can be restored.
import { Router } from 'express';
import Trash from '../models/Trash.js';
import Product from '../models/Product.js';
import Ingredient from '../models/Ingredient.js';
import Expense from '../models/Expense.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { OPTION_LABEL } from '../lib/trash.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError, nameRegex } from '../lib/util.js';
import { checkId } from '../lib/ids.js';

const r = Router();
r.use(requireAdmin);
r.param('id', checkId);
const MODELS = { product: Product, ingredient: Ingredient, expense: Expense, user: User };
const LABEL = { product: 'drink', ingredient: 'ingredient', expense: 'expense', user: 'staff member' };

r.get('/', ah(async (_req, res) => {
  const list = await Trash.find({}, 'kind name by createdAt data.list').sort({ createdAt: -1 }).limit(2000).lean();
  res.json(list.map(({ data, ...t }) => (t.kind === 'option' ? { ...t, list: data?.list, what: OPTION_LABEL[data?.list] } : t)));
}));

r.post('/:id/restore', ah(async (req, res) => {
  const t = await Trash.findById(req.params.id).lean();
  if (!t) throw new HttpError(404, 'That item is no longer in the archive.');
  if (t.kind === 'option') return res.json(await restoreOption(t));
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
  if (t.kind === 'user') notes.push('They can sign in again with the same PIN.');
  res.json({ ok: true, kind: t.kind, name: t.name, notes });
}));

/** Put a size / milk / add-on / delivery area back into the shop settings. */
async function restoreOption(t) {
  const { list, item } = t.data || {};
  if (!OPTION_LABEL[list] || !item) throw new HttpError(400, 'That item can’t be restored.');
  const s = await Settings.get();
  const label = String(item.label || item.name || '').trim();
  if (list === 'areas') {
    s.delivery = s.delivery || {};
    const areas = s.delivery.areas || [];
    if (areas.some((a) => a.name.toLowerCase() === label.toLowerCase())) throw new HttpError(409, `There is already a delivery area called “${label}”.`);
    areas.push({ name: item.name, fee: item.fee });
    s.delivery.areas = areas;
    s.markModified('delivery');
  } else {
    if (s[list].some((x) => x.label.toLowerCase() === label.toLowerCase())) throw new HttpError(409, `There is already a ${OPTION_LABEL[list].toLowerCase()} called “${label}”. Rename or remove that one first.`);
    s[list].push(item); // the same id, so old orders still match it
  }
  await s.save();
  await Trash.deleteOne({ _id: t._id });
  const notes = [];
  for (const k of ['ing', 'cup']) if (item[k] && !(await Ingredient.exists({ _id: item[k] }))) notes.push('Its ingredient was deleted. Pick a new one in Menu → Shop & options.');
  return { ok: true, kind: 'option', list, name: t.name, notes };
}

r.delete('/:id', ah(async (req, res) => {
  await Trash.deleteOne({ _id: req.params.id });
  res.status(204).end();
}));

export default r;
