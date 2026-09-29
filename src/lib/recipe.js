// Works out the recipe for one drink on an order: the amounts for the size, milk and
// add-ons the customer chose, plus the "how to make it" steps from the Menu tab.
import { byId } from '../shared/pricing.mjs';

export function howTo(line, product, settings, ingredients) {
  if (!product) return null;
  const sizes = settings?.sizes || [];
  const milks = settings?.milks || [];
  const addons = settings?.addons || [];
  const parts = String(line.mods || '').split(' · ');
  // Newer orders store the choices; older ones only have the labels in the order text
  const pick = (arr, id, label) => (id && byId(arr, id)) || arr.find((o) => parts.includes(label(o)));

  const size = product.hasSizes !== false && sizes.length ? pick(sizes, line.sizeId, (o) => o.label) || sizes[0] : null;
  const milk = product.milkQty > 0 && milks.length ? pick(milks, line.milkId, (o) => o.label) || milks[0] : null;
  const adds = line.addonIds
    ? line.addonIds.map((id) => byId(addons, id)).filter(Boolean)
    : addons.filter((a) => parts.includes(`+ ${a.label}`));
  const mult = size ? +size.mult || 1 : 1;
  const ing = (id) => byId(ingredients, id);

  const amounts = [];
  (product.recipe || []).forEach((r) => {
    const i = ing(r.ing);
    amounts.push({ name: i?.name || '(deleted ingredient)', qty: (+r.qty || 0) * mult, unit: i?.unit || '' });
  });
  if (milk) amounts.push({ name: /milk/i.test(milk.label) ? milk.label : `${milk.label} milk`, qty: product.milkQty * mult, unit: 'ml', hl: milks.length > 1 });
  adds.forEach((a) => { const i = ing(a.ing); amounts.push({ name: a.label, qty: +a.qty || 0, unit: i?.unit || '', hl: true }); });

  return {
    size: size && sizes.length > 1 ? size.label : '',
    scaled: mult !== 1,
    amounts,
    sweet: (parts.find((x) => x.startsWith('Sweet ')) || '').slice(6),
    cup: size?.cup ? ing(size.cup)?.name || '' : '',
    steps: product.steps || [],
  };
}

// A starting point the owner can edit in the Menu tab
export const starterSteps = (withMilk) => (withMilk ? [
  'Sift the matcha into the bowl.',
  'Add hot water (about 80°C, not boiling) and whisk in a zigzag until smooth and frothy.',
  'Fill the cup with ice.',
  'Add the sweetener for the sweetness asked for.',
  'Pour in the milk.',
  'Pour the matcha slowly on top.',
  'Add any add-ons, put the lid on and label it with the order number.',
] : [
  'Sift the matcha into the bowl.',
  'Add hot water (about 80°C, not boiling) and whisk in a zigzag until smooth and frothy.',
  'Fill the cup with ice and add the sweetener for the sweetness asked for.',
  'Top up with cold water, then pour the matcha slowly on top.',
  'Put the lid on and label it with the order number.',
]);

// "1. Sift..." / "- Sift..." -> "Sift..."
export const toSteps = (text) => String(text || '').split('\n').map((x) => x.replace(/^\s*(\d+\s*[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
