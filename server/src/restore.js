// Put a backup back into the database.  Usage:  npm run restore -- backups/backup-2026-09-24_0900.json.gz
// Everything currently in the database is replaced. A safety backup of the current data is made first.
import 'dotenv/config';
import mongoose from 'mongoose';
import readline from 'node:readline/promises';
import path from 'node:path';
import fs from 'node:fs';
import { readBackup, restoreBackup, createBackup, listBackups, BACKUP_DIR } from './lib/backup.js';

const arg = process.argv[2];
if (!arg) {
  console.log('Which backup? Newest first:\n' + listBackups().slice(0, 10).map((b) => `  ${path.join(BACKUP_DIR, b.name)}`).join('\n'));
  console.log('\nThen run:  npm run restore -- <file>');
  process.exit(1);
}
const file = fs.existsSync(path.resolve(arg)) ? path.resolve(arg) : path.join(BACKUP_DIR, path.basename(arg));
const doc = readBackup(file);
console.log(`Backup from ${new Date(doc.createdAt).toLocaleString('en-PH')}:`);
for (const [n, c] of Object.entries(doc.counts || {})) console.log(`  ${n}: ${c}`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ans = await rl.question('\nThis REPLACES all current data with the backup. Type RESTORE to continue: ');
rl.close();
if (ans.trim() !== 'RESTORE') { console.log('Cancelled. Nothing changed.'); process.exit(0); }
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/matcha_pos');
const safety = await createBackup('before-restore');
console.log(`Saved the current data first: ${safety.name}`);
await restoreBackup(doc);
console.log('Restored. Restart the server (npm run server).');
await mongoose.disconnect();
