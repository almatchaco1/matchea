import { Router } from 'express';
import Product from '../models/Product.js';
import Ingredient from '../models/Ingredient.js';
import Settings from '../models/Settings.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError, assertValid, nameRegex } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { toTrash } from '../lib/trash.js';
import { checkProduct } from '../../../src/shared/rules.mjs';

const r = Router();
r.param('id', checkId);

async function clean(b, exceptId) {
  assertValid(checkProduct(b));
  const f = {
    name: String(b.name).trim(),
    cat: String(b.cat).trim(),
    desc: String(b.desc || '').trim(),
    price: +b.price,
    hasSizes: b.hasSizes !== false,
    milkQty: +b.milkQty || 0,
    sweet: b.sweet !== false,
    active: b.active !== false,
    bestSeller: b.bestSeller === true,
    available: b.available !== false,
    sort: Number.isFinite(+b.sort) ? +b.sort : 50,
    recipe: (b.recipe || []).map((x) => ({ ing: String(x.ing), qty: +x.qty })),
    image: String(b.image || '').trim(),
    steps: (Array.isArray(b.steps) ? b.steps : []).map((x) => String(x).trim()).filter(Boolean),
  };
  if (Array.isArray(b.addons)) {
    const s = await Settings.get();
    const known = new Set(s.addons.map((a) => String(a._id)));
    if (b.addons.some((a) => !known.has(String(a)))) throw new HttpError(400, 'An add-on no longer exists. Reopen the drink and choose again.', { addons: 'An add-on no longer exists. Choose again.' });
    f.addons = b.addons.map(String);
  }
  // every recipe ingredient must still exist
  const ids = f.recipe.map((x) => x.ing);
  const found = new Set((await Ingredient.find({ _id: { $in: ids } }, '_id')).map((i) => String(i._id)));
  const missing = {};
  f.recipe.forEach((x, i) => { if (!found.has(x.ing)) missing[`recipe.${i}.ing`] = 'This ingredient no longer exists. Choose another.'; });
  assertValid(missing);
  const dup = await Product.findOne({ name: nameRegex(f.name), ...(exceptId ? { _id: { $ne: exceptId } } : {}) }, '_id');
  if (dup) throw new HttpError(409, 'A menu item with this name already exists.', { name: 'A menu item with this name already exists.' });
  return f;
}

r.get('/', ah(async (_req, res) => res.json(await Product.find().sort({ cat: 1, sort: 1, name: 1 }))));

r.post('/', requireAdmin, ah(async (req, res) => {
  res.status(201).json(await Product.create(await clean(req.body || {})));
}));

r.put('/:id', requireAdmin, ah(async (req, res) => {
  const f = await clean(req.body || {}, req.params.id);
  const p = await Product.findByIdAndUpdate(req.params.id, f, { new: true, runValidators: true });
  if (!p) throw new HttpError(404, 'Menu item not found.');
  res.json(p);
}));

// Quick switch any staff can use when a drink runs out for the day
r.patch('/:id/available', ah(async (req, res) => {
  if (typeof req.body?.available !== 'boolean') throw new HttpError(400, 'Say whether the drink is available.');
  const p = await Product.findByIdAndUpdate(req.params.id, { available: req.body.available }, { new: true });
  if (!p) throw new HttpError(404, 'Menu item not found.');
  res.json(p);
}));

r.delete('/:id', requireAdmin, ah(async (req, res) => {
  const p = await Product.findByIdAndDelete(req.params.id);
  if (!p) throw new HttpError(404, 'Menu item not found.');
  await toTrash('product', p, req.user.name);
  res.status(204).end();
}));

export default r;
