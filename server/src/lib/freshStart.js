// Start fresh: clears sales and everything in Reports so the shop looks brand new.
// Always kept: the menu, recipes, prices, the ingredient list, settings and the GCash / GoTyme QR.
// Options (written as JSON inside server/fresh-start.request, or passed by hand):
//   stock: 'zero'  → every ingredient's amount on hand becomes 0 (the list, units, costs and low-stock levels stay)
//   staff: true    → remove every staff account except Owner (the super admin), and the staff activity log
//   suppliers: true → remove the supplier list
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
// expenses, recycle bin, customer accounts & stamp cards, sign-up codes, customer service chats
const CLEAR = ['sales', 'daycloses', 'counters', 'stockmoves', 'expenses', 'trashes', 'customers', 'verifies', 'supportthreads', 'supportmsgs', 'restockorders'];
// Pictures that belong to orders: payment receipts customers sent, refund proofs
const ORDER_PICS = /^(receipt|refund)-/;

async function wipe(db, name) {
  const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
  return exists ? (await db.collection(name).deleteMany({})).deletedCount : 0;
}

export async function freshStart(log = console.log, opts = {}) {
  const db = mongoose.connection.db;
  const backup = await createBackup('reset'); // safety copy of everything first
  const counts = {};
  for (const name of CLEAR) counts[name] = await wipe(db, name);
  counts.orderPictures = (await db.collection('assets').deleteMany({ key: ORDER_PICS })).deletedCount;
  if (opts.stock === 'zero') counts.ingredientsZeroed = (await db.collection('ingredients').updateMany({}, { $set: { stock: 0 } })).modifiedCount;
  if (opts.staff) {
    const owner = await db.collection('users').findOne({ superAdmin: true }) || await db.collection('users').findOne({ name: /^owner$/i });
    if (owner) {
      counts.staffRemoved = (await db.collection('users').deleteMany({ _id: { $ne: owner._id } })).deletedCount;
      counts.stafflogs = await wipe(db, 'stafflogs');
    } else log('Fresh start: no Owner account found, so no staff accounts were removed.');
  }
  if (opts.suppliers) counts.suppliers = await wipe(db, 'suppliers');
  log(`Started fresh: removed ${counts.sales} orders and ${counts.customers} customer accounts${counts.staffRemoved != null ? `, ${counts.staffRemoved} staff accounts` : ''}${counts.ingredientsZeroed != null ? `; all stock set to 0` : ''}. Backup saved first: ${backup.name}`);
  return { backup: backup.name, counts };
}

/** Called when the server starts: only acts if fresh-start.request is there. */
export async function freshStartIfRequested(log = console.log) {
  if (!fs.existsSync(REQUEST)) return null;
  let opts = {};
  try { const t = fs.readFileSync(REQUEST, 'utf8').trim(); if (t.startsWith('{')) opts = JSON.parse(t); } catch { opts = {}; }
  const r = await freshStart(log, opts);
  try { fs.renameSync(REQUEST, DONE); } catch { try { fs.unlinkSync(REQUEST); } catch {} }
  fs.writeFileSync(DONE, `Started fresh on ${new Date().toISOString()}\nOptions: ${JSON.stringify(opts)}\nBackup made first: ${r.backup}\n${JSON.stringify(r.counts)}\n`);
  return r;
}
