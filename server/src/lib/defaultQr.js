// The shop's own GCash QR, bundled with the app, so customers can pay by QR right away.
// Only used when no GCash QR has been set yet (Menu → GCash & GoTyme QR can change or remove it).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Settings from '../models/Settings.js';
import Asset from '../models/Asset.js';
import { isQrPh, qrPhInfo } from '../../../src/shared/qrph.mjs';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../seed/gcash-qr.jpg');
// The code inside that picture (read from it once)
const PAYLOAD = '00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDNWJKGRN5204601653036085802PH5909JO***H S.6014BARANGAY MOLIN61041234630441BB';

export async function installDefaultQr(log = console.log) {
  if (!fs.existsSync(FILE) || !isQrPh(PAYLOAD)) return;
  const s = await Settings.get();
  if (s.qr?.gcash?.v || s.migrations?.includes('default-gcash-qr')) return; // already set, or removed on purpose
  await Asset.updateOne({ key: 'qr-gcash' }, { key: 'qr-gcash', type: 'image/jpeg', data: fs.readFileSync(FILE) }, { upsert: true });
  s.set('qr.gcash', { v: Date.now(), name: qrPhInfo(PAYLOAD).name, number: '', payload: PAYLOAD });
  s.migrations = [...(s.migrations || []), 'default-gcash-qr'];
  await s.save();
  log('Added the shop GCash QR for online orders.');
}
