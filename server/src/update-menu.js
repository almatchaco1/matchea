// Fills in drink photos and allowed add-ons for drinks that don't have them yet.
// Runs automatically when the server starts. Manual run: npm run update-menu  (--force overwrites photos and add-ons)
import Product from './models/Product.js';
import Settings from './models/Settings.js';
import { imageFor, addonIdsFor, addonLabelsFor, hasBundledImage } from '../../src/shared/menu-defaults.mjs';

export async function applyMenuDefaults({ force = false, log = console.log } = {}) {
  const settings = await Settings.get();
  let n = 0;
  for (const p of await Product.find()) {
    const set = {};
    if ((force || !p.image) && hasBundledImage(p.name)) set.image = imageFor(p.name);
    if (force || !Array.isArray(p.addons)) set.addons = addonIdsFor(p.name, settings.addons);
    if (Object.keys(set).length) {
      await Product.updateOne({ _id: p._id }, { $set: set });
      n++;
      log(`  ${p.name}: ${set.image ? 'photo added' : 'photo kept'} · add-ons: ${set.addons ? addonLabelsFor(p.name).join(', ') : 'kept'}`);
    }
  }
  return n;
}

// Run directly: node src/update-menu.js [--force]
if (process.argv[1] && process.argv[1].endsWith('update-menu.js')) {
  const { default: mongoose } = await import('mongoose');
  await import('dotenv/config');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/matcha_pos');
  const n = await applyMenuDefaults({ force: process.argv.includes('--force') });
  console.log(n ? `Updated ${n} drinks.` : 'Nothing to update (use --force to overwrite).');
  await mongoose.disconnect();
}
