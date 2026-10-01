// Pricing + stock-usage rules shared by the server (source of truth) and the
// React client (live cart preview). Keep this file dependency-free.

export const r2 = (n) => Math.round((+n || 0) * 100) / 100;
export const byId = (arr, id) => (arr || []).find((x) => String(x._id) === String(id));
const idOf = (v) => (v && typeof v === 'object' && v._id ? String(v._id) : v ? String(v) : '');

/**
 * Price one cart line and work out which ingredients it uses.
 * line:     { sizeId, milkId, addonIds, sweet, note, qty }
 * product:  { price, hasSizes, milkQty, sweet, recipe: [{ ing, qty }] }
 * settings: { sizes: [{ _id, label, price, mult, cup }], milks: [{ _id, label, price, ing }],
 *             addons: [{ _id, label, price, ing, qty }] }
 */
export function priceLine(line, product, settings) {
  const sizes = settings?.sizes || [];
  const milks = settings?.milks || [];
  const addons = settings?.addons || [];

  const size = product.hasSizes !== false && sizes.length ? byId(sizes, line.sizeId) || sizes[0] : null;
  const milk = product.milkQty > 0 && milks.length ? byId(milks, line.milkId) || milks[0] : null;
  const adds = [...new Set((line.addonIds || []).map(String))].map((id) => byId(addons, id)).filter(Boolean);
  const mult = size ? +size.mult || 1 : 1;
  const qty = Math.max(1, Math.min(99, Math.floor(+line.qty || 1)));

  let unit = +product.price || 0;
  if (size) unit += +size.price || 0;
  if (milk) unit += +milk.price || 0;
  adds.forEach((a) => (unit += +a.price || 0));

  const usage = {};
  const add = (ing, q) => {
    const k = idOf(ing);
    if (!k || !q) return;
    usage[k] = (usage[k] || 0) + q;
  };
  (product.recipe || []).forEach((r) => add(r.ing, (+r.qty || 0) * mult));
  if (milk) add(milk.ing, product.milkQty * mult);
  if (size && size.cup) add(size.cup, 1);
  adds.forEach((a) => add(a.ing, +a.qty || 0));
  for (const k in usage) usage[k] = r2(usage[k] * qty);

  const sweet = product.sweet !== false ? String(line.sweet || '') : '';
  const note = ''; // special requests (less ice, extra hot…) aren't offered, so any note sent is ignored
  const mods = [
    size && sizes.length > 1 ? size.label : '',
    milk && milks.length > 1 ? milk.label : '',
    sweet ? `Sweet ${sweet}` : '',
    ...adds.map((a) => `+ ${a.label}`),
    note ? `“${note}”` : '',
  ].filter(Boolean).join(' · ');

  return {
    unit: r2(unit), qty, total: r2(unit * qty), usage, mods, sweet, note,
    sizeId: size ? String(size._id) : null,
    milkId: milk ? String(milk._id) : null,
    addonIds: adds.map((a) => String(a._id)),
  };
}

/**
 * Order totals. Prices are VAT-inclusive (PH style).
 * discount.type: 'none' | 'pct' | 'scpwd' | 'reward' (free drink: discount.amount off)
 * Senior/PWD: VAT removed, then 20% off the VAT-exclusive amount.
 */
export function computeTotals(subtotal, discount, vatRate) {
  const sub = r2(subtotal);
  const rate = +vatRate || 0;
  let total = sub, vat = 0, vatExempt = 0, amount = 0, pct = 0;
  const type = discount?.type || 'none';
  if (type === 'scpwd') {
    const base = r2(sub / (1 + rate / 100));
    vatExempt = base;
    pct = 20;
    total = r2(base * 0.8);
  } else {
    if (type === 'pct') pct = Math.min(100, Math.max(0, +discount.pct || 0));
    total = type === 'reward' ? r2(Math.max(0, sub - Math.max(0, +discount.amount || 0))) : r2(sub - sub * pct / 100);
    vat = r2(total * rate / (100 + rate));
  }
  amount = r2(sub - total);
  return { subtotal: sub, total, vat, vatExempt, discount: { type, pct, amount } };
}

export const PAY_METHODS = { cash: 'Cash', gcash: 'GCash', maya: 'Maya' }; // card payments removed
// Labels for every stored method (online orders can also be paid by QR Ph etc. through PayMongo)
export const PAY_LABELS = { ...PAY_METHODS, online: 'Online', unpaid: 'Unpaid', staff: 'Staff drink' };
