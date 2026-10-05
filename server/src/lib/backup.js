// Automatic backups: every day the server saves a copy of ALL data (sales, menu,
// stock, staff, customers, stamps) as one compressed file in server/backups.
// The newest 30 are kept. Restore with: npm run restore -- <file>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { shopTime } from './util.js';

const BACKUP_APP = 'matchea-pos';
const BACKUP_APPS = [BACKUP_APP, 'al-matcha-pos']; // second one: backup files made before the shop was renamed, so they can still be restored

const { EJSON } = mongoose.mongo.BSON;
export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../backups'));
export const KEEP = Math.max(3, +process.env.BACKUP_KEEP || 30);
const NAME = /^backup-\d{4}-\d{2}-\d{2}_\d{4}(-[a-z]+)?\.json\.gz$/;
export const isBackupName = (n) => NAME.test(String(n || ''));

function stamp(d = new Date()) {
  const { date } = shopTime(d);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: process.env.SHOP_TZ || 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace(':', '');
  return `${date}_${hm}`;
}

let running = null;
/** Write a backup file now. reason: 'daily' | 'manual' | 'before-restore' */
export function createBackup(reason = 'manual') {
  if (running) return running; // never two at once
  running = (async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('Not connected to the database.');
    const cols = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
    const data = {};
    const counts = {};
    for (const n of cols) { data[n] = await db.collection(n).find({}).toArray(); counts[n] = data[n].length; }
    const doc = { app: BACKUP_APP, version: 1, createdAt: new Date(), reason, counts, collections: data };
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = `backup-${stamp()}${reason === 'manual' ? '' : `-${reason === 'before-restore' ? 'prerestore' : reason}`}.json.gz`;
    const tmp = path.join(BACKUP_DIR, `.${file}.tmp`);
    fs.writeFileSync(tmp, zlib.gzipSync(EJSON.stringify(doc, { relaxed: false })));
    // check the file reads back before keeping it
    const check = readBackup(tmp);
    if (Object.keys(check.collections).length !== cols.length) throw new Error('The backup file did not save correctly.');
    fs.renameSync(tmp, path.join(BACKUP_DIR, file)); // appears only once complete
    prune();
    const copy = await copyOut(file);
    return { name: file, counts, copy };
  })().finally(() => { running = null; });
  return running;
}

// Second copy (e.g. a Google Drive or Dropbox folder on this computer), set in Reports → Backups
async function copyDir() {
  try { const S = mongoose.models.Settings; const s = S && (await S.findOne({ key: 'shop' }, 'backupCopyDir').lean()); return s?.backupCopyDir || process.env.BACKUP_COPY_DIR || ''; } catch { return ''; }
}
export function checkCopyDir(dir) {
  if (!dir) return '';
  if (!path.isAbsolute(dir)) return 'Use the full folder path, like /Users/you/Google Drive/My Drive/Matchea backups';
  try { if (!fs.statSync(dir).isDirectory()) return 'That is a file, not a folder.'; } catch { return 'That folder doesn’t exist on the computer running the server. Create it first.'; }
  try { fs.accessSync(dir, fs.constants.W_OK); } catch { return 'The server can’t save files in that folder.'; }
  if (path.resolve(dir) === BACKUP_DIR) return 'Choose a different folder from the main backups folder.';
  return '';
}
let lastCopy = { ok: null, error: '', at: null };
export const copyStatus = () => lastCopy;
async function copyOut(file) {
  const dir = await copyDir();
  if (!dir) return null;
  const bad = checkCopyDir(dir);
  try {
    if (bad) throw new Error(bad);
    fs.copyFileSync(path.join(BACKUP_DIR, file), path.join(dir, file));
    fs.readdirSync(dir).filter(isBackupName).sort().reverse().slice(KEEP).forEach((n) => { try { fs.unlinkSync(path.join(dir, n)); } catch {} });
    lastCopy = { ok: true, error: '', at: new Date(), dir };
  } catch (e) {
    lastCopy = { ok: false, error: e.message, at: new Date(), dir };
    console.error('Backup copy failed:', e.message);
  }
  return lastCopy;
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(isBackupName).sort().reverse().map((name) => {
    const st = fs.statSync(path.join(BACKUP_DIR, name));
    return { name, size: st.size, createdAt: st.mtime };
  });
}

function prune() {
  listBackups().slice(KEEP).forEach((b) => { try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch {} });
}

export function readBackup(file) {
  const doc = EJSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'), { relaxed: false });
  if (!BACKUP_APPS.includes(doc?.app) || !doc.collections) throw new Error('This is not a Matchéa backup file.');
  return doc;
}

/** Replace everything in the database with the backup's contents. */
export async function restoreBackup(doc) {
  const db = mongoose.connection.db;
  for (const [name, docs] of Object.entries(doc.collections)) {
    await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
  }
}

/** Daily backup: checks every hour and makes one if today doesn't have one yet. */
export function scheduleDailyBackups(log = console.log) {
  if (process.env.BACKUP_DISABLED === '1') return;
  const check = async () => {
    try {
      const today = shopTime().date;
      if (listBackups().some((b) => b.name.startsWith(`backup-${today}`))) return;
      const b = await createBackup('daily');
      log(`Daily backup saved: ${b.name}`);
    } catch (e) { console.error('Daily backup failed:', e.message); }
  };
  setTimeout(check, 30 * 1000); // shortly after start
  setInterval(check, 60 * 60 * 1000).unref();
}
