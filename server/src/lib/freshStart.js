// Start fresh: clears sales and everything in Reports so the shop looks brand new.
// Keeps the menu, recipes, prices, ingredients, suppliers, staff, settings and GCash QR.
// Runs once when the file server/fresh-start.request exists (then renames it to fresh-start.done),
// or by hand with: npm run fresh-start
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createBackup } from './backup.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REQUEST = path.join(DIR, 'fresh-start.request');
const DONE = path.join(DIR, 'fresh-start.done');
// sales & online orders, day closings, order numbers, stock history (sales, deliveries, waste, counts),
// expenses, recycle bin, customer accounts & stamp cards
const CLEAR = ['sales', 'daycloses', 'counters', 'stockmoves', 'expenses', 'trashes', 'customers'];

export async function freshStart(log = console.log) {
  const db = mongoose.connection.db;
  const backup = await createBackup('reset'); // safety copy of everything first
  const counts = {};
  for (const name of CLEAR) {
    const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
    counts[name] = exists ? (await db.collection(name).deleteMany({})).deletedCount : 0;
  }
  log(`Started fresh: removed ${counts.sales} orders and ${counts.customers} customer accounts. Backup saved first: ${backup.name}`);
  return { backup: backup.name, counts };
}

/** Called when the server starts: only acts if fresh-start.request is there. */
export async function freshStartIfRequested(log = console.log) {
  if (!fs.existsSync(REQUEST)) return null;
  const r = await freshStart(log);
  try { fs.renameSync(REQUEST, DONE); } catch { try { fs.unlinkSync(REQUEST); } catch {} }
  fs.writeFileSync(DONE, `Started fresh on ${new Date().toISOString()}\nBackup made first: ${r.backup}\n${JSON.stringify(r.counts)}\n`);
  return r;
}
