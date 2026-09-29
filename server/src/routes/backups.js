// Owner/admin: see, make, download and restore backups.
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { requireAdmin } from '../middleware/auth.js';
import { ah, HttpError } from '../lib/util.js';
import Settings from '../models/Settings.js';
import { BACKUP_DIR, KEEP, createBackup, listBackups, isBackupName, readBackup, restoreBackup, checkCopyDir, copyStatus } from '../lib/backup.js';

const r = Router();
r.use(requireAdmin);

r.get('/', ah(async (_req, res) => {
  const s = await Settings.findOne({ key: 'shop' }, 'backupCopyDir').lean();
  res.json({ backups: listBackups(), keep: KEEP, folder: BACKUP_DIR, copyDir: s?.backupCopyDir || '', copy: copyStatus() });
}));

r.post('/', ah(async (_req, res) => res.status(201).json(await createBackup('manual'))));

// Second copy folder (e.g. Google Drive). Blank = off.
r.put('/copy-folder', ah(async (req, res) => {
  const dir = String(req.body?.dir || '').trim().replace(/^~(?=\/)/, process.env.HOME || '~');
  if (dir.length > 400) throw new HttpError(400, 'That path is too long.', { dir: 'That path is too long.' });
  const bad = checkCopyDir(dir);
  if (bad) throw new HttpError(400, bad, { dir: bad });
  await Settings.updateOne({ key: 'shop' }, { backupCopyDir: dir });
  let copy = null;
  if (dir) copy = (await createBackup('manual')).copy; // copy one straight away so you can see it works
  res.json({ copyDir: dir, copy });
}));

function fileOf(name) {
  name = String(name);
  if (!isBackupName(name)) throw new HttpError(400, 'Not a backup file.');
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'That backup no longer exists.');
  return file;
}

r.get('/:name', ah(async (req, res) => { const f = fileOf(req.params.name); res.download(f, path.basename(f)); }));

// Put everything back the way it was in a backup. A safety backup of right now is made first.
r.post('/:name/restore', ah(async (req, res) => {
  if (req.body?.confirm !== 'RESTORE') throw new HttpError(400, 'Type RESTORE to confirm.', { confirm: 'Type RESTORE to confirm.' });
  const doc = readBackup(fileOf(req.params.name));
  const safety = await createBackup('before-restore');
  await restoreBackup(doc);
  res.json({ ok: true, safety: safety.name, counts: doc.counts });
}));

export default r;
