import { Router } from 'express';
import Settings from '../models/Settings.js';
import Ingredient from '../models/Ingredient.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah, assertValid, HttpError } from '../lib/util.js';
import Asset from '../models/Asset.js';
import { isQrPh } from '../../../src/shared/qrph.mjs';
import { checkSettings, isObjectId, checkStoreInfo, socialUrl, normPhone } from '../../../src/shared/rules.mjs';
import { cleanDecor, GREETING_MAX } from '../../../src/shared/decor.mjs';
import { checkDeliverySettings, DELIVERY_DEFAULTS } from '../../../src/shared/delivery.mjs';

const r = Router();

r.get('/', ah(async (_req, res) => res.json(await Settings.get())));

r.put('/', requireAdmin, ah(async (req, res) => {
  const s = await Settings.get();
  const cur = s.toObject();
  const b = req.body || {};
  // Fields that weren't sent keep their current values, then everything is validated together
  const next = {
    name: b.name ?? cur.name, address: b.address ?? cur.address, tin: b.tin ?? cur.tin, footer: b.footer ?? cur.footer,
    vat: b.vat ?? cur.vat,
    sizes: Array.isArray(b.sizes) ? b.sizes : cur.sizes.map((x) => ({ ...x, _id: String(x._id), cup: x.cup && String(x.cup) })),
    milks: Array.isArray(b.milks) ? b.milks : cur.milks.map((x) => ({ ...x, _id: String(x._id), ing: x.ing && String(x.ing) })),
    addons: Array.isArray(b.addons) ? b.addons : cur.addons.map((x) => ({ ...x, _id: String(x._id), ing: x.ing && String(x.ing) })),
  };
  assertValid(checkSettings(next));
  const info = {};
  for (const k of ['contactPhone', 'contactEmail', 'hours', 'facebook', 'instagram', 'tiktok']) info[k] = b[k] ?? cur[k] ?? '';
  assertValid(checkStoreInfo(info));

  // Ingredients picked for cups / milk / add-ons must exist
  const refs = [];
  next.sizes.forEach((o, i) => o.cup && refs.push([`sizes.${i}.cup`, String(o.cup)]));
  next.milks.forEach((o, i) => o.ing && refs.push([`milks.${i}.ing`, String(o.ing)]));
  next.addons.forEach((o, i) => o.ing && refs.push([`addons.${i}.ing`, String(o.ing)]));
  const found = new Set((await Ingredient.find({ _id: { $in: refs.map((x) => x[1]) } }, '_id')).map((i) => String(i._id)));
  const missing = {};
  refs.forEach(([k, id]) => { if (!found.has(id)) missing[k] = 'This ingredient no longer exists.'; });
  assertValid(missing);

  const keepId = (o) => (isObjectId(String(o._id || '')) ? { _id: o._id } : {}); // keeps open carts valid
  Object.assign(s, {
    name: String(next.name).trim(), address: String(next.address || '').trim(), tin: String(next.tin || '').trim(),
    footer: String(next.footer || '').trim(), vat: +next.vat,
    sizes: next.sizes.map((o) => ({ ...keepId(o), label: o.label.trim(), price: +o.price || 0, mult: +o.mult, cup: o.cup || null })),
    milks: next.milks.map((o) => ({ ...keepId(o), label: o.label.trim(), price: +o.price || 0, ing: o.ing })),
    addons: next.addons.map((o) => ({ ...keepId(o), label: o.label.trim(), price: +o.price || 0, ing: o.ing || null, qty: +o.qty || 0 })),
  });
  Object.assign(s, {
    contactPhone: String(info.contactPhone).trim(), contactEmail: String(info.contactEmail).trim().toLowerCase(),
    hours: String(info.hours).trim().split('\n').map((l) => l.trim()).filter(Boolean).join('\n'),
    facebook: socialUrl('facebook', info.facebook), instagram: socialUrl('instagram', info.instagram), tiktok: socialUrl('tiktok', info.tiktok),
  });
  if (b.onlineOpen != null) s.onlineOpen = !!b.onlineOpen;
  if (b.decor != null) s.decor = cleanDecor(b.decor);
  if (b.decorGreeting != null) s.decorGreeting = String(b.decorGreeting).replace(/\s+/g, ' ').trim().slice(0, GREETING_MAX);
  if (b.decorPos != null) s.decorPos = !!b.decorPos;
  if (b.delivery && typeof b.delivery === 'object') {
    const cur = { ...DELIVERY_DEFAULTS, ...(s.delivery?.toObject?.() || s.delivery || {}) };
    const d = { ...cur, ...b.delivery };
    assertValid(checkDeliverySettings(d));
    s.delivery = { enabled: !!d.enabled, lat: d.lat == null || d.lat === '' ? undefined : +d.lat, lng: d.lng == null || d.lng === '' ? undefined : +d.lng,
      label: String(d.label || '').trim().slice(0, 200), baseFee: +d.baseFee, baseKm: +d.baseKm, perKm: +d.perKm, maxKm: +d.maxKm, freeDrinks: Math.round(+d.freeDrinks) };
  }
  if (b.onlineMessage != null) s.onlineMessage = String(b.onlineMessage).trim().slice(0, 160);
  if (Array.isArray(b.sweetness) && b.sweetness.length && b.sweetness.length <= 10) s.sweetness = b.sweetness.map((x) => String(x).slice(0, 10));
  await s.save();
  res.json(s);
}));

// ---------- Payment QR codes (GCash / Maya) ----------
const QR_KINDS = { gcash: 'GCash', maya: 'Maya' };
const MAX_QR_BYTES = 2.5 * 1024 * 1024;
function decodeImage(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Upload a PNG, JPG or WebP picture of your QR code.', { image: 'Upload a PNG, JPG or WebP picture.' });
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_QR_BYTES) throw new HttpError(400, 'That picture is too big. Use a screenshot of the QR (under 2.5 MB).', { image: 'Picture is too big (max 2.5 MB).' });
  const png = buf.slice(0, 4).toString('hex') === '89504e47', jpg = buf.slice(0, 3).toString('hex') === 'ffd8ff', webp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  if (!(png || jpg || webp)) throw new HttpError(400, 'That file is not a picture. Upload a screenshot of your QR code.', { image: 'That file is not a picture.' });
  return { type: png ? 'image/png' : jpg ? 'image/jpeg' : 'image/webp', data: buf };
}

// Save one QR: { image?: dataURL | '' (remove), name, number }
r.put('/qr/:kind', requireAdmin, ah(async (req, res) => {
  const kind = req.params.kind;
  if (!QR_KINDS[kind]) throw new HttpError(404, 'Unknown payment type.');
  const b = req.body || {};
  const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length > 60) throw new HttpError(400, 'The account name can be at most 60 characters.', { name: 'At most 60 characters.' });
  const rawNo = String(b.number ?? '').trim();
  const number = rawNo ? normPhone(rawNo) : '';
  if (rawNo && !number) throw new HttpError(400, `Enter the ${QR_KINDS[kind]} mobile number like 0917 123 4567, or leave it blank.`, { number: 'Enter a number like 0917 123 4567.' });
  const s = await Settings.get();
  const cur = s.qr?.[kind] || {};
  let v = cur.v || 0;
  // The code inside the picture (read on the owner's device) lets the app fill in the amount by itself
  let payload = b.payload === undefined ? cur.payload || '' : String(b.payload || '');
  if (payload && !isQrPh(payload)) throw new HttpError(400, 'That QR isn’t a GCash / Maya payment QR (QR Ph). Use the QR from “Receive” in the app.', { image: 'Not a payment QR.' });
  if (b.image === '') { await Asset.deleteOne({ key: `qr-${kind}` }); v = 0; payload = ''; }
  else if (b.image != null) {
    const img = decodeImage(b.image);
    await Asset.updateOne({ key: `qr-${kind}` }, { key: `qr-${kind}`, ...img }, { upsert: true });
    v = Date.now();
  }
  s.set(`qr.${kind}`, { v, name, number, payload });
  await s.save();
  res.json(s.qr);
}));

// Daily sales goal (0 = off)
r.put('/goal', requireAdmin, ah(async (req, res) => {
  const g = Number(req.body?.goal ?? 0);
  if (!Number.isFinite(g) || g < 0 || g > 10000000 || Math.round(g) !== g) throw new HttpError(400, 'Enter a whole peso amount like 5000, or 0 to turn it off.', { goal: 'Enter an amount like 5000.' });
  const s = await Settings.get(); s.dailyGoal = g; await s.save();
  res.json({ dailyGoal: g });
}));

r.put('/qr-options', requireAdmin, ah(async (req, res) => {
  const s = await Settings.get();
  if (req.body?.qrOnline != null) s.qrOnline = !!req.body.qrOnline;
  if (req.body?.payAtPickup != null) s.payAtPickup = !!req.body.payAtPickup;
  await s.save();
  res.json({ qrOnline: s.qrOnline, payAtPickup: s.payAtPickup });
}));

export default r;
