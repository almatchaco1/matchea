// Shared by POS sales and online orders: checks each cart line against the
// current menu and settings, then prices it and works out stock usage.
import Product from '../models/Product.js';
import Settings from '../models/Settings.js';
import Counter from '../models/Counter.js';
import Ingredient from '../models/Ingredient.js';
import { HttpError, shopTime } from './util.js';
import { LIMITS, isObjectId } from '../../../src/shared/rules.mjs';
import { addonIdsFor } from '../../../src/shared/menu-defaults.mjs';
import { priceLine, r2 } from '../../../src/shared/pricing.mjs';

export async function priceOrder(rawLines, { maxLines = LIMITS.lines, maxQty = LIMITS.lineQty } = {}) {
  const lines = Array.isArray(rawLines) ? rawLines : [];
  if (!lines.length) throw new HttpError(400, 'The order is empty.');
  if (lines.length > maxLines) throw new HttpError(400, `An order can have at most ${maxLines} items.`);

  const settings = await Settings.get();
  const has = (arr, id) => arr.some((o) => String(o._id) === String(id));
  const ids = [...new Set(lines.map((l) => String(l?.productId)))].filter(isObjectId);
  const products = Object.fromEntries((await Product.find({ _id: { $in: ids } })).map((p) => [String(p._id), p]));

  // Check every line strictly: unknown sizes, milks or add-ons are rejected, never guessed
  lines.forEach((l, i) => {
    const p = products[String(l?.productId)];
    const n = p ? p.name : `Item ${i + 1}`;
    if (!p || !p.active) throw new HttpError(409, `${n} is no longer available. Remove it and try again.`);
    if (p.available === false) throw new HttpError(409, `${n} is not available right now. Remove it and try again.`);
    if (!Number.isInteger(+l.qty) || +l.qty < 1 || +l.qty > maxQty) throw new HttpError(400, `${n}: quantity must be a whole number from 1 to ${maxQty}.`);
    if (p.hasSizes !== false && settings.sizes.length && l.sizeId != null && !has(settings.sizes, l.sizeId)) throw new HttpError(409, `${n}: that size no longer exists. Pick a size again.`);
    if (p.milkQty > 0 && settings.milks.length && l.milkId != null && !has(settings.milks, l.milkId)) throw new HttpError(409, `${n}: that milk option no longer exists.`);
    const adds = Array.isArray(l.addonIds) ? l.addonIds : [];
    if (adds.length > 10 || adds.some((a) => !has(settings.addons, a))) throw new HttpError(409, `${n}: an add-on no longer exists. Choose again.`);
    if (new Set(adds.map(String)).size !== adds.length) throw new HttpError(400, `${n}: an add-on was chosen twice.`);
    const allowed = Array.isArray(p.addons) ? p.addons : addonIdsFor(p.name, settings.addons);
    const bad = adds.find((a) => !allowed.includes(String(a)));
    if (bad) {
      const label = settings.addons.find((o) => String(o._id) === String(bad))?.label || 'That add-on';
      throw new HttpError(400, `${label} isn't available for ${p.name}.`);
    }
    if (l.sweet && p.sweet !== false && !settings.sweetness.includes(String(l.sweet))) throw new HttpError(400, `${n}: choose a sweetness level from the list.`);
    if (String(l.note || '').length > LIMITS.note) throw new HttpError(400, `${n}: the note can be at most ${LIMITS.note} characters.`);
  });

  const usage = {};
  const xs = lines.map((l) => priceLine(l, products[String(l.productId)], settings));
  // Ingredient cost of each line at today's prices (for the profit report)
  const ingIds = [...new Set(xs.flatMap((x) => Object.keys(x.usage)))].filter(isObjectId);
  const unitCost = Object.fromEntries((await Ingredient.find({ _id: { $in: ingIds } }, 'cost').lean()).map((i) => [String(i._id), +i.cost || 0]));
  const priced = lines.map((l, i) => {
    const p = products[String(l.productId)];
    const x = xs[i];
    for (const k in x.usage) usage[k] = r2((usage[k] || 0) + x.usage[k]);
    const cost = r2(Object.entries(x.usage).reduce((a, [k, q]) => a + q * (unitCost[k] || 0), 0));
    return { product: p._id, name: p.name, cat: p.cat, mods: x.mods, qty: x.qty, unit: x.unit, total: x.total, cost, base: +p.price || 0, sizeId: x.sizeId, milkId: x.milkId, addonIds: x.addonIds };
  });
  return { settings, priced, usage, subtotal: r2(priced.reduce((a, l) => a + l.total, 0)), cost: r2(priced.reduce((a, l) => a + l.cost, 0)) };
}

export const usageList = (usage) => Object.entries(usage).map(([ing, qty]) => ({ ing, qty }));
export const usageMap = (list) => Object.fromEntries((list || []).map((u) => [String(u.ing), u.qty]));

/** Next order number for today (shared by counter and online orders). */
export async function nextOrderNo() {
  const { date, hour } = shopTime();
  return { date, hour, no: await Counter.next(`order-${date}`) };
}
