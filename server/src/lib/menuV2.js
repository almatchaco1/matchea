// New Matchéa menu (Oct 2026): new drink names, prices and cup photos. Runs once when the server starts.
// Renamed drinks keep their recipes and sales history; drinks no longer on the menu are hidden (not deleted).
import Product from '../models/Product.js';
import Ingredient from '../models/Ingredient.js';
import Settings from '../models/Settings.js';
import { addonIdsFor, slug } from '../../../src/shared/menu-defaults.mjs';

export const MENU_VERSION = 2;
// [old names it may have now], new name, price
export const NEW_MENU = [
  [['Matcha Latte'], 'Classic Matcha Latte', 200],
  [['Caramel Matcha Latte'], 'Caramel Bliss Matcha', 250],
  [['Strawberry Matcha Latte'], 'Berry Matcha (Strawberry)', 240],
  [['Putobumbong Matcha Latte'], 'Putobumbong Matcha', 250],
  [[], 'Coconut Matcha Cloud', 220],
  [['Banana Pudding Matcha Latte'], 'Banana Pudding Matcha', 260],
  [['Crème Brûlée Matcha Latte'], 'Crème Brulee Matcha', 240],
  [['Kinako Dango Matcha Latte'], 'Kinako Dango Seasalt Matcha', 250],
  [[], 'Pistachio Kataifi Matcha', 260],
];
export const HIDE = ['Mango Matcha Latte', "S'mores Matcha Latte", 'Salted Caramel Matcha Latte', 'Cinnamon Bun Matcha Latte'];
// New drinks: description and what goes in a regular cup (besides matcha and milk). Amounts are placeholders to adjust in Menu.
const NEW_DRINKS = {
  'Coconut Matcha Cloud': { desc: 'Coconut cream cloud over matcha, with coconut jelly.', recipe: [['Coconut cream', 'ml', 40, 0.3], ['Coconut jelly', 'g', 30, 0.2]] },
  'Pistachio Kataifi Matcha': { desc: 'Pistachio cream and crispy kataifi on matcha.', recipe: [['Pistachio cream', 'g', 30, 1.2], ['Kataifi (toasted)', 'g', 10, 0.6]] },
};
const photo = (name) => `/drinks/${slug(name)}.webp`;
const same = (a, b) => slug(a) === slug(b);

export async function applyNewMenu({ log = console.log } = {}) {
  const settings = await Settings.get();
  if ((settings.menuVer || 0) >= MENU_VERSION) return 0;
  const all = await Product.find();
  if (!all.length) { await Settings.updateOne({ _id: settings._id }, { $set: { menuVer: MENU_VERSION } }); return 0; } // empty shop: nothing to rename
  const find = (names) => all.find((p) => names.some((n) => same(p.name, n)));
  const classic = find(['Classic Matcha Latte', 'Matcha Latte']);
  const matcha = await Ingredient.findOne({ name: /matcha powder/i });
  let n = 0;
  for (let i = 0; i < NEW_MENU.length; i++) {
    const [olds, name, price] = NEW_MENU[i];
    const p = find([name, ...olds]);
    if (p) {
      await Product.updateOne({ _id: p._id }, { $set: { name, price, image: photo(name), sort: i + 1, active: true } });
      log(`  ${p.name === name ? name : `${p.name} → ${name}`}: ₱${price}`);
    } else {
      const d = NEW_DRINKS[name];
      if (!d) continue;
      const recipe = matcha ? [{ ing: matcha._id, qty: classic?.recipe?.find((r) => String(r.ing) === String(matcha._id))?.qty || 4 }] : [];
      for (const [ingName, unit, qty, cost] of d.recipe) {
        let ing = await Ingredient.findOne({ name: new RegExp(`^${ingName.replace(/[()]/g, '\\$&')}$`, 'i') });
        if (!ing) ing = await Ingredient.create({ name: ingName, cat: 'Flavors', unit, stock: 0, reorder: unit === 'ml' ? 500 : 300, cost });
        recipe.push({ ing: ing._id, qty });
      }
      await Product.create({
        name, price, desc: d.desc, cat: 'Signature', image: photo(name), sort: i + 1,
        milkQty: classic?.milkQty ?? 200, hasSizes: classic?.hasSizes ?? true, sweet: classic?.sweet ?? true,
        addons: addonIdsFor(name, settings.addons), recipe,
      });
      log(`  added ${name}: ₱${price}`);
    }
    n++;
  }
  for (const old of HIDE) {
    const p = all.find((x) => same(x.name, old));
    if (p && p.active) { await Product.updateOne({ _id: p._id }, { $set: { active: false } }); log(`  hidden ${p.name}`); }
  }
  await Settings.updateOne({ _id: settings._id }, { $set: { menuVer: MENU_VERSION } });
  return n;
}
