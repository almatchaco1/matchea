import Trash from '../models/Trash.js';

const peso = (n) => `₱${(+n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
export const OPTION_LABEL = { sizes: 'Size', milks: 'Milk', addons: 'Add-on', areas: 'Delivery area' };
const nameOf = (kind, d) => {
  if (kind === 'expense') return `${d.cat} · ${peso(d.amount)} · ${d.date}`;
  if (kind === 'option') return d.item?.label || d.item?.name || '';
  return d.name;
};

/** Keep a copy of a deleted record in the archive (until the owner deletes it for good). */
export async function toTrash(kind, doc, by) {
  const data = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  await Trash.create({ kind, name: nameOf(kind, data), data, by });
}

/** Items from before the archive kept things for good had an expiry date: keep them too. */
export async function keepArchiveForGood() {
  const coll = Trash.collection;
  try { for (const ix of await coll.indexes()) if (ix.expireAfterSeconds != null) await coll.dropIndex(ix.name); } catch { /* no collection yet */ }
  await Trash.updateMany({ expiresAt: { $exists: true } }, { $unset: { expiresAt: 1 } });
}
