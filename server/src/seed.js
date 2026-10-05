// Starter data: the Matchéa menu. Run once: `npm run seed`
// Safe to re-run: it only fills an empty database (use --reset to wipe menu + stock first).
import 'dotenv/config';
import mongoose from 'mongoose';
import Ingredient from './models/Ingredient.js';
import Product from './models/Product.js';
import Settings from './models/Settings.js';
import User from './models/User.js';
import { imageFor, addonIdsFor } from '../../src/shared/menu-defaults.mjs';

const reset = process.argv.includes('--reset');
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/matcha_pos');

if (reset) {
  await Promise.all([Ingredient.deleteMany({}), Product.deleteMany({}), Settings.deleteMany({})]);
  console.log('Cleared menu, ingredients and settings.');
}

if (await Ingredient.estimatedDocumentCount()) {
  console.log('Ingredients already exist — skipping menu seed (use --reset to start over).');
} else {
  // Stock levels, costs and recipe amounts below are PLACEHOLDERS: adjust them in
  // the Inventory and Menu tabs to match your real recipes and supplier prices.
  const I = {};
  const ings = [
    // key, name, group, unit, on hand, reorder at, cost per unit (₱)
    ['matcha', 'Matcha powder', 'Tea', 'g', 1000, 250, 6],
    ['oatside', 'Oatside oat milk', 'Milk', 'ml', 20000, 5000, 0.14],
    ['strawberry', 'Strawberry purée', 'Flavors', 'ml', 2000, 500, 0.3],
    ['mango', 'Mango (diced)', 'Flavors', 'g', 2000, 500, 0.25],
    ['brulee', 'Crème brûlée custard', 'Flavors', 'ml', 2000, 500, 0.35],
    ['kinako', 'Kinako powder', 'Flavors', 'g', 1000, 200, 0.4],
    ['banana', 'Banana pudding', 'Flavors', 'g', 2000, 500, 0.3],
    ['ube', 'Ube halaya', 'Flavors', 'g', 2000, 500, 0.35],
    ['cheese', 'Grated cheese', 'Toppings', 'g', 1000, 250, 0.45],
    ['chocolate', 'Chocolate sauce', 'Flavors', 'ml', 2000, 500, 0.25],
    ['graham', 'Graham crumbs', 'Toppings', 'g', 1500, 300, 0.2],
    ['caramel', 'Caramel sauce', 'Flavors', 'ml', 2000, 500, 0.22],
    ['saltedcaramel', 'Salted caramel sauce', 'Flavors', 'ml', 2000, 500, 0.25],
    ['cinnamon', 'Cinnamon syrup', 'Flavors', 'ml', 1500, 400, 0.2],
    ['crunch', 'Crunch topping', 'Toppings', 'g', 3000, 600, 0.15],
    ['dango', 'Dango (pcs)', 'Toppings', 'pcs', 150, 40, 12],
    ['marshmallow', 'Marshmallows', 'Toppings', 'pcs', 400, 100, 2.5],
    ['cupreg', 'Cup + lid, regular', 'Packaging', 'pcs', 500, 150, 7],
    ['cuplg', 'Cup + lid, upsize', 'Packaging', 'pcs', 300, 100, 8.5],
  ];
  for (const [k, name, cat, unit, stock, reorder, cost] of ings) {
    I[k] = (await Ingredient.create({ name, cat, unit, stock, reorder, cost }))._id;
  }

  await Settings.create({
    key: 'shop',
    name: 'Matchéa',
    footer: 'Good Matcha, Good Mood. Thank you!',
    vat: 0, // not VAT-registered
    sizes: [
      { label: 'Regular', price: 0, mult: 1, cup: I.cupreg },
      { label: 'Upsize', price: 40, mult: 1.35, cup: I.cuplg },
    ],
    milks: [{ label: 'Oatside', price: 0, ing: I.oatside }], // only one milk, so the register skips the milk question
    addons: [
      { label: 'Extra Matcha', price: 30, ing: I.matcha, qty: 2 },
    ],
    sweetness: ['0%', '25%', '50%', '75%', '100%'],
  });

  // name, price, description, recipe [[ingredient, amount per regular cup]]
  const M = 4, MILK = 200; // g matcha and ml Oatside per regular drink (placeholder)
  const drinks = [
    ['Matcha Latte', 200, 'Smooth, earthy, timeless.', []],
    ['Strawberry Matcha Latte', 241, 'Real strawberries, pure bliss.', [['strawberry', 40]]],
    ['Mango Matcha Latte', 250, 'Tropical sweetness, perfectly balanced.', [['mango', 50]]],
    ['Crème Brûlée Matcha Latte', 250, 'Rich, creamy, irresistible.', [['brulee', 40]]],
    ['Kinako Dango Matcha Latte', 260, 'Roasted, nutty, uniquely good.', [['kinako', 8], ['dango', 1], ['crunch', 15]]],
    ['Banana Pudding Matcha Latte', 260, 'Creamy banana, with a matcha twist.', [['banana', 50], ['crunch', 15]]],
    ['Putobumbong Matcha Latte', 270, 'Traditional flavor, modern comfort.', [['ube', 40], ['cheese', 10], ['dango', 1]]],
    ["S'mores Matcha Latte", 250, 'Chocolate, graham, marshmallow, bliss.', [['chocolate', 20], ['graham', 15], ['marshmallow', 3]]],
    ['Caramel Matcha Latte', 260, 'Smooth caramel, rich and satisfying.', [['caramel', 25], ['crunch', 15]]],
    ['Salted Caramel Matcha Latte', 260, 'Sweet caramel with a hint of sea salt.', [['saltedcaramel', 25], ['crunch', 15]]],
    ['Cinnamon Bun Matcha Latte', 260, 'Warm cinnamon spice, creamy and comforting.', [['cinnamon', 20], ['crunch', 15]]],
  ];
  const shopAddons = (await Settings.get()).addons;
  await Product.insertMany(drinks.map(([name, price, desc, extra], i) => ({
    name, price, desc, cat: i === 0 ? 'Classic' : 'Signature', milkQty: MILK, sort: i + 1,
    image: imageFor(name), addons: addonIdsFor(name, shopAddons), bestSeller: /putobumbong|s'mores/i.test(name),
    recipe: [['matcha', M], ...extra].map(([ing, qty]) => ({ ing: I[ing], qty })),
  })));
  console.log(`Seeded ${ings.length} ingredients, ${drinks.length} drinks and shop options for Matchéa.`);
}

const adminName = (process.env.ADMIN_NAME || 'Owner').trim();
if (!(await User.exists({ role: 'admin' }))) {
  const pin = String(process.env.ADMIN_PIN || '1234');
  await User.create({ name: adminName, pinHash: await User.hashPin(pin), pinLen: pin.length, role: 'admin' });
  console.log(`Created admin "${adminName}" with PIN ${pin}. You will be asked to set a new 6-digit PIN when you first sign in.`);
}

await mongoose.disconnect();
