// Suppliers: who you buy from. Everyone can see the list; only admins change it.
import { Router } from 'express';
import Supplier from '../models/Supplier.js';
import StockMove from '../models/StockMove.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError, assertValid, nameRegex } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { toTrash } from '../lib/trash.js';
import { checkSupplier } from '../../../src/shared/rules.mjs';

const r = Router();
r.param('id', checkId);
const clean = (b) => ({ name: String(b.name).trim().replace(/\s+/g, ' '), phone: String(b.phone || '').trim(), notes: String(b.notes || '').trim() });
async function unique(name, except) {
  if (await Supplier.exists({ name: nameRegex(name), ...(except ? { _id: { $ne: except } } : {}) }))
    throw new HttpError(409, 'A supplier with this name already exists.', { name: 'A supplier with this name already exists.' });
}

r.get('/', ah(async (_req, res) => {
  const [list, spent] = await Promise.all([
    Supplier.find().sort({ name: 1 }).lean(),
    StockMove.find({ reason: 'receive', supplier: { $ne: null } }, 'supplier value createdAt').lean(),
  ]);
  const m = {};
  for (const x of spent) { const k = String(x.supplier); const s = (m[k] ||= { total: 0, count: 0, last: null }); s.total += x.value || 0; s.count++; if (!s.last || x.createdAt > s.last) s.last = x.createdAt; }
  res.json(list.map((s) => ({ ...s, total: Math.round((m[s._id]?.total || 0) * 100) / 100, deliveries: m[s._id]?.count || 0, last: m[s._id]?.last || null })));
}));
r.post('/', requireAdmin, ah(async (req, res) => {
  assertValid(checkSupplier(req.body || {}));
  const f = clean(req.body); await unique(f.name);
  res.status(201).json(await Supplier.create(f));
}));
r.put('/:id', requireAdmin, ah(async (req, res) => {
  assertValid(checkSupplier(req.body || {}));
  const f = clean(req.body); await unique(f.name, req.params.id);
  const s = await Supplier.findByIdAndUpdate(req.params.id, f, { new: true });
  if (!s) throw new HttpError(404, 'Supplier not found.');
  await StockMove.updateMany({ supplier: s._id }, { supplierName: s.name });
  res.json(s);
}));
r.delete('/:id', requireAdmin, ah(async (req, res) => {
  const s = await Supplier.findByIdAndDelete(req.params.id);
  if (!s) throw new HttpError(404, 'Supplier not found.');
  await toTrash('supplier', s, req.user.name);
  res.status(204).end(); // past deliveries keep the supplier's name
}));

export default r;
