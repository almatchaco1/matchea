import Trash from '../models/Trash.js';

export const TRASH_DAYS = 30;
const nameOf = (kind, d) => (kind === 'expense' ? `${d.cat} · ₱${(+d.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} · ${d.date}` : d.name);

/** Keep a copy of a deleted record for 30 days. */
export async function toTrash(kind, doc, by) {
  const data = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  await Trash.create({ kind, name: nameOf(kind, data), data, by, expiresAt: new Date(Date.now() + TRASH_DAYS * 864e5) });
}
