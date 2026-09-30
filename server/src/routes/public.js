// Public (no login) endpoints for the customer ordering page.
import { Router } from 'express';
import crypto from 'node:crypto';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Ingredient from '../models/Ingredient.js';
import Settings from '../models/Settings.js';
import { ah, HttpError, assertValid } from '../lib/util.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import { priceOrder, usageList, nextOrderNo } from '../lib/orders.js';
import { checkOnlineOrder, normPhone, ONLINE, checkQrRef, cleanQrRef, checkPaidTime, ONLINE_FEE_PCT, withOnlineFee } from '../../../src/shared/rules.mjs';
import { mustPayFirst } from '../lib/noshow.js';
import { addonIdsFor, imageFor, hasBundledImage, photoUrl } from '../../../src/shared/menu-defaults.mjs';
import { computeTotals, priceLine } from '../../../src/shared/pricing.mjs';
import { redeemReward, returnReward } from '../lib/loyalty.js';
import { rewardValue } from '../../../src/shared/loyalty.mjs';
import Customer from '../models/Customer.js';
import Asset from '../models/Asset.js';
import { paymongoEnabled, methodTypes, createCheckout, getCheckout, expireCheckout, paidPayment, methodFrom, verifyWebhook } from '../lib/paymongo.js';

const PAY_WINDOW_MIN = 45; // unpaid "pay now" orders are cancelled after this many minutes

/** Public site address for PayMongo's return links (set PUBLIC_URL when deployed). */
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/** Mark an online order paid from a PayMongo payment. Safe to call more than once. */
async function markPaid(sale, pay) {
  if (!pay) return sale;
  const upd = await Sale.findOneAndUpdate(
    { _id: sale._id, status: { $in: ['awaiting_payment', 'cancelled'] }, paidOnline: false },
    { $set: { paidOnline: true, paidAt: new Date(), pay: { method: methodFrom(pay.type), tendered: sale.total, change: 0, ref: String(pay.id).slice(0, 60) } } },
    { new: true }
  );
  if (!upd) return (await Sale.findById(sale._id)) || sale;
  if (upd.status === 'awaiting_payment') return Sale.findByIdAndUpdate(upd._id, { status: 'new' }, { new: true });
  // Paid after we had already given up on it: keep it cancelled, flag a refund for staff
  return Sale.findByIdAndUpdate(upd._id, { refundDue: true }, { new: true });
}

/** Unpaid pay-now orders: check PayMongo, and cancel them when the payment window has passed. */
async function settle(sale) {
  if (sale.status !== 'awaiting_payment') return sale;
  if (paymongoEnabled() && sale.checkoutId) {
    try { const done = paidPayment(await getCheckout(sale.checkoutId)); if (done) return markPaid(sale, done); } catch { /* try again on next check */ }
  }
  if (Date.now() - new Date(sale.createdAt) > PAY_WINDOW_MIN * 60000) {
    if (sale.checkoutId) await expireCheckout(sale.checkoutId);
    const gone = await Sale.findOneAndUpdate({ _id: sale._id, status: 'awaiting_payment' },
      { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Payment was not completed in time.' }, { new: true });
    if (gone) await returnReward(gone);
    return gone || Sale.findById(sale._id);
  }
  return sale;
}
export { settle as settleOnlinePayment };

const r = Router();

// --- simple per-IP rate limit for placing orders (no extra packages) ---
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'x';
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    hits.set(key, list);
    if (list.length >= max) return next(new HttpError(429, 'Too many orders from this device. Please wait a few minutes or ask at the counter.'));
    // only orders that went through count (a typo in the reference number shouldn't lock anyone out)
    res.on('finish', () => { if (res.statusCode === 201) { list.push(Date.now()); if (hits.size > 5000) hits.clear(); } });
    next();
  };
}

// Menu for customers: only what they need, no costs or stock numbers
r.get('/menu', ah(async (_req, res) => {
  const [s, products, ings] = await Promise.all([Settings.get(), Product.find({ active: true }).sort({ cat: 1, sort: 1, name: 1 }), Ingredient.find({}, 'stock')]);
  const stock = Object.fromEntries(ings.map((i) => [String(i._id), i.stock]));
  res.json({
    shop: {
      name: s.name, address: s.address, phone: s.contactPhone || '', email: s.contactEmail || '', hours: s.hours || '',
      facebook: s.facebook || '', instagram: s.instagram || '', tiktok: s.tiktok || '', open: s.onlineOpen !== false, message: s.onlineMessage || '', payOnline: paymongoEnabled(), payTypes: paymongoEnabled() ? payTypes() : [], seasonal: s.seasonal !== false,
      qr: qrInfo(s), payAtPickup: s.payAtPickup !== false || (!paymongoEnabled() && !Object.keys(qrInfo(s)).length) },
    sizes: s.sizes.map(({ _id, label, price }) => ({ _id, label, price })),
    sweetness: s.sweetness,
    addons: s.addons.map(({ _id, label, price }) => ({ _id, label, price })),
    items: products.map((p) => {
      const { usage } = priceLine({}, p, s);
      const soldOut = Object.entries(usage).some(([k, q]) => stock[k] != null && stock[k] < q);
      return {
        _id: p._id, name: p.name, cat: p.cat, desc: p.desc, price: p.price,
        image: p.image ? photoUrl(p.image) : hasBundledImage(p.name) ? imageFor(p.name) : '',
        hasSizes: p.hasSizes !== false, sweet: p.sweet !== false, milkQty: p.milkQty,
        addons: Array.isArray(p.addons) ? p.addons : addonIdsFor(p.name, s.addons),
        soldOut: soldOut || p.available === false, notAvailable: p.available === false, bestSeller: !!p.bestSeller,
      };
    }),
  });
}));

// The shop's GCash / Maya QR picture (?v=version so it can be cached)
r.get('/qr/:kind', ah(async (req, res) => {
  if (!['gcash', 'maya'].includes(req.params.kind)) throw new HttpError(404, 'Not found.');
  const a = await Asset.findOne({ key: `qr-${req.params.kind}` }).lean();
  if (!a) throw new HttpError(404, 'No QR code uploaded yet.');
  res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.type(a.type).send(Buffer.from(a.data.buffer || a.data));
}));

// Real customer ratings for the home page (last 12 months). Hidden until there are at least 5.
const RATING_MIN = 5;
let ratingCache = { at: 0, data: null };
r.get('/rating', ah(async (_req, res) => {
  if (Date.now() - ratingCache.at > 5 * 60000) {
    const since = new Date(Date.now() - 365 * 864e5);
    const list = await Sale.find({ 'rating.stars': { $gte: 1 }, 'rating.at': { $gte: since } }, 'rating.stars').lean();
    const count = list.length;
    const avg = count ? Math.round((list.reduce((a, s) => a + s.rating.stars, 0) / count) * 10) / 10 : null;
    ratingCache = { at: Date.now(), data: count >= RATING_MIN ? { avg, count } : { avg: null, count } };
  }
  res.json(ratingCache.data);
}));

// Looks for another order (last 90 days) that used the same payment screenshot:
// the exact same original file, or the exact same picture after it was made small in the browser.
const SHOT_DAYS = 90;
async function findReusedShot(hash, fileHash) {
  const since = new Date(Date.now() - SHOT_DAYS * 864e5);
  const or = [{ 'qrPay.shotHash': hash }, ...(fileHash ? [{ 'qrPay.shotPrint': fileHash }] : [])];
  const hit = await Sale.findOne({ $or: or, createdAt: { $gte: since } }, 'no date trackCode').sort({ createdAt: -1 }).lean();
  return hit ? { no: hit.no, date: hit.date, code: hit.trackCode, same: true } : null;
}

// Place an order (pay at pickup)
r.post('/orders', rateLimit(5, 10 * 60 * 1000), requireCustomer, ah(async (req, res) => {
  const cust = req.customer;
  // Name and number come from the signed-in account
  const b = { ...(req.body || {}), customer: cust.name, phone: cust.phone || '' };
  const settings = await Settings.get();
  if (settings.onlineOpen === false) throw new HttpError(409, settings.onlineMessage || 'Online ordering is closed right now. Please order at the counter.');
  assertValid(checkOnlineOrder(b));
  const phone = b.phone ? normPhone(b.phone) : '';
  let payNow = b.payNow === true;
  const payType = String(b.payType || '');
  // Paid by scanning the shop's QR: the customer gives the reference number, staff checks it before accepting
  let qrPay = null;
  if (b.qrPay) {
    const method = String(b.qrPay.method || '');
    const ref = cleanQrRef(b.qrPay.ref);
    if (!qrInfo(settings)[method]) throw new HttpError(409, 'That QR payment isn’t available right now. Choose another way to pay.');
    const refErr = checkQrRef(method, ref);
    if (refErr) throw new HttpError(400, refErr, { qrRef: refErr });
    if (await Sale.exists({ 'qrPay.ref': ref, status: { $ne: 'cancelled' } })) throw new HttpError(409, 'That reference number was already used for another order. Check your receipt.', { qrRef: 'Already used for another order.' });
    // Time on the receipt: a payment made long before this order may be an old receipt
    const time = checkPaidTime(b.qrPay.paidTime);
    if (time.err) throw new HttpError(400, time.err, { qrTime: time.err });
    // Optional screenshot of the payment receipt (made small in the browser first)
    const shot = typeof b.qrPay.shot === 'string' ? b.qrPay.shot : '';
    if (shot && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(shot) || shot.length > 700000))
      throw new HttpError(400, 'That picture couldn’t be used. Try a smaller screenshot, or leave it out.', { qrShot: 'Try a smaller screenshot, or leave it out.' });
    qrPay = { method, ref, at: new Date(), verified: false, shot: !!shot, shotData: shot, paidAt: time.paidAt };
    if (time.mins > ONLINE.payTimeOld) qrPay.timeOld = time.mins;
    if (shot) {
      // Same screenshot used before? (same original file, or the same picture data)
      qrPay.shotHash = crypto.createHash('sha256').update(shot.slice(shot.indexOf(',') + 1)).digest('hex');
      const print = /^[0-9a-f]{64}$/.test(String(b.qrPay.shotPrint || '')) ? b.qrPay.shotPrint : '';
      qrPay.shotPrint = print;
      qrPay.shotReused = await findReusedShot(qrPay.shotHash, print);
    }
    payNow = false;
  }
  const useReward = b.useReward === true;
  if (payNow && !paymongoEnabled()) throw new HttpError(409, 'Online payment is not available right now. Please choose pay at pickup.');
  if (payNow && !payTypes().includes(payType)) throw new HttpError(400, 'Choose GCash or Maya to pay online.', { pay: 'Choose GCash or Maya.' });
  const open = await Sale.countDocuments({ customerId: cust._id, source: 'online', status: { $in: ['awaiting_payment', 'new', 'preparing', 'ready'] } });
  if (open >= ONLINE.openOrdersPerPhone) throw new HttpError(429, 'You already have orders waiting. Please pick those up first, or ask at the counter.');

  // Customers may not set their own prices; milk is always the shop default for online orders
  const lines = b.lines.map((l) => ({ productId: l.productId, sizeId: l.sizeId, addonIds: l.addonIds, sweet: l.sweet, note: l.note, qty: l.qty }));
  const { priced, usage, subtotal, cost } = await priceOrder(lines, { maxLines: ONLINE.lines, maxQty: ONLINE.lineQty });
  const t = computeTotals(subtotal, useReward ? { type: 'reward', amount: rewardValue(priced.map((l) => l.base)) } : { type: 'none' }, settings.vat);
  if (t.total <= 0) { payNow = false; qrPay = null; } // nothing to pay online
  const anyPayFirst = paymongoEnabled() || Object.keys(qrInfo(settings)).length > 0;
  const pickupOk = settings.payAtPickup !== false || !anyPayFirst;
  if (t.total > 0 && !payNow && !qrPay && !pickupOk) throw new HttpError(400, 'Please pay first with GCash or Maya, then place your order.');
  const drinks = priced.reduce((a, l) => a + (+l.qty || 0), 0);
  if (t.total > 0 && !payNow && !qrPay && anyPayFirst && (t.total > ONLINE.payFirstOver || drinks > ONLINE.payFirstDrinks))
    throw new HttpError(403, `Big orders (over ₱${ONLINE.payFirstOver.toLocaleString('en-PH')} or more than ${ONLINE.payFirstDrinks} drinks) need to be paid first with GCash or Maya.`, { pay: 'Please pay first.' });
  if (t.total > 0 && !payNow && !qrPay && anyPayFirst && (await mustPayFirst(cust._id)))
    throw new HttpError(403, 'Because 2 recent orders weren’t picked up, please pay first with GCash or Maya for this order.', { pay: 'Please pay first.' });
  if (useReward) await redeemReward(cust._id);
  const { date, hour, no } = await nextOrderNo();
  let sale;
  try { sale = await Sale.create({
    no, date, hour, source: 'online', status: payNow ? 'awaiting_payment' : 'new', stockDeducted: false, customerId: cust._id,
    trackCode: crypto.randomBytes(9).toString('base64url'),
    customer: String(b.customer).trim().replace(/\s+/g, ' '), phone, pickupNote: String(b.pickupNote || '').trim(),
    lines: priced, subtotal: t.subtotal, discount: t.discount, total: t.total, vat: t.vat, vatExempt: t.vatExempt,
    onlineFee: payNow ? withOnlineFee(t.total, payType).fee : 0,
    pay: { method: 'unpaid', tendered: 0, change: 0, ref: '' },
    usage: usageList(usage), cost, stampsUsed: useReward ? 9 : 0,
    ...(qrPay ? { qrPay: { method: qrPay.method, ref: qrPay.ref, at: qrPay.at, verified: false, shot: qrPay.shot, paidAt: qrPay.paidAt, ...(qrPay.timeOld ? { timeOld: qrPay.timeOld } : {}),
      ...(qrPay.shot ? { shotHash: qrPay.shotHash, shotPrint: qrPay.shotPrint, ...(qrPay.shotReused ? { shotReused: qrPay.shotReused } : {}) } : {}) } } : {}),
  }); } catch (e) {
    if (useReward) await Customer.updateOne({ _id: cust._id }, { $inc: { stamps: 9, rewardsUsed: -1 } });
    throw e;
  }
  if (qrPay?.shotData) {
    const [, type, data] = /^data:([^;]+);base64,(.*)$/.exec(qrPay.shotData);
    await Asset.create({ key: `receipt-${sale._id}`, type, data: Buffer.from(data, 'base64') }).catch(() => Sale.updateOne({ _id: sale._id }, { 'qrPay.shot': false }));
  }
  if (!payNow) return res.status(201).json(publicView(sale));

  // Pay now: hand the customer to PayMongo's secure checkout page
  try {
    const base = baseUrl(req);
    const co = await createCheckout({ sale, shopName: settings.name, successUrl: `${base}/order/${sale.trackCode}?paid=1`, cancelUrl: `${base}/order/${sale.trackCode}`, type: payType });
    const upd = await Sale.findByIdAndUpdate(sale._id, { checkoutId: co.id, checkoutUrl: co.url }, { new: true });
    res.status(201).json(publicView(upd));
  } catch (e) {
    // Couldn't start payment: keep the order, switch it to pay at pickup so nothing is lost
    const upd = await Sale.findByIdAndUpdate(sale._id, { status: 'new', onlineFee: 0 }, { new: true });
    res.status(201).json({ ...publicView(upd), notice: 'Online payment is unavailable right now, so your order was sent as pay at pickup.' });
  }
}));

// Track an order with its secret code
r.get('/orders/:code', ah(async (req, res) => {
  const code = String(req.params.code || '');
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(code)) throw new HttpError(404, 'Order not found.');
  const sale = await Sale.findOne({ trackCode: code, source: 'online' });
  if (!sale) throw new HttpError(404, 'Order not found.');
  res.json(publicView(await settle(sale))); // checks PayMongo if it's still waiting for payment
}));

// Customer changes their mind while payment is pending: switch to pay at pickup, or cancel
r.post('/orders/:code/pay-later', ah(async (req, res) => {
  const sale = await Sale.findOne({ trackCode: String(req.params.code), source: 'online' });
  if (!sale) throw new HttpError(404, 'Order not found.');
  const cur = await settle(sale);
  if (cur.status !== 'awaiting_payment') return res.json(publicView(cur)); // already paid or expired
  if (cur.checkoutId) await expireCheckout(cur.checkoutId);
  res.json(publicView(await Sale.findByIdAndUpdate(cur._id, { status: 'new' }, { new: true })));
}));

r.post('/orders/:code/cancel', ah(async (req, res) => {
  const sale = await Sale.findOne({ trackCode: String(req.params.code), source: 'online' });
  if (!sale) throw new HttpError(404, 'Order not found.');
  const cur = await settle(sale);
  if (!['awaiting_payment', 'new'].includes(cur.status) || cur.paidOnline || cur.qrPay?.method)
    throw new HttpError(409, cur.paidOnline || cur.qrPay?.method ? 'You already sent payment for this order. Please call or message the shop to cancel it.' : 'The shop has started your order, so it can no longer be cancelled here. Please call the shop.');
  if (cur.checkoutId) await expireCheckout(cur.checkoutId);
  const upd = await Sale.findOneAndUpdate({ _id: cur._id, status: { $in: ['awaiting_payment', 'new'] } },
    { status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Cancelled by the customer.' }, { new: true });
  if (upd) await returnReward(upd);
  res.json(publicView(upd || (await Sale.findById(cur._id))));
}));

// PayMongo webhook: register https://YOUR-SITE/api/public/paymongo/webhook for "checkout_session.payment.paid"
r.post('/paymongo/webhook', ah(async (req, res) => {
  const evt = req.body?.data?.attributes || {};
  if (!verifyWebhook(req.get('Paymongo-Signature'), req.rawBody, evt.livemode === true)) return res.status(401).json({ error: 'Bad signature' });
  if (evt.type === 'checkout_session.payment.paid') {
    const session = evt.data;
    const saleId = session?.attributes?.metadata?.sale_id || session?.attributes?.reference_number;
    const sale = saleId && /^[a-f0-9]{24}$/i.test(saleId) ? await Sale.findOne({ _id: saleId, source: 'online' }) : null;
    if (sale && sale.checkoutId === session.id) await markPaid(sale, paidPayment(session));
  }
  res.json({ received: true }); // always 200 for events we don't handle, so PayMongo doesn't retry
}));

/** PayMongo methods offered as separate choices (each with its own fee): 'gcash', 'paymaya' */
const payTypes = () => methodTypes().filter((m) => ONLINE_FEE_PCT[m]);

/** QR payment options customers can use online: { gcash: { v, name, number }, … } */
function qrInfo(s) {
  const out = {};
  if (s.qrOnline === false) return out;
  for (const k of ['gcash', 'maya']) { const q = s.qr?.[k]; if (q?.v) out[k] = { v: q.v, name: q.name || '', number: q.number || '', payload: q.payload || '' }; }
  return out;
}
const publicView = (s) => ({
  code: s.trackCode, no: s.no, date: s.date, status: s.status === 'void' ? 'cancelled' : s.status,
  customer: s.customer.split(' ')[0], total: s.total, onlineFee: s.onlineFee || 0,
  // choices are included so the customer can tap "Order again"
  lines: s.lines.map(({ name, mods, qty, total, product, sizeId, addonIds }) => ({
    name, mods, qty, total, productId: product ? String(product) : null, sizeId: sizeId || null, addonIds: addonIds || [],
    sweet: (/(?:^| · )Sweet ([^·]+?)(?= · |$)/.exec(mods || '') || [])[1] || '', note: (/“(.*)”/.exec(mods || '') || [])[1] || '',
  })),
  createdAt: s.createdAt, acceptedAt: s.acceptedAt, readyAt: s.readyAt, completedAt: s.completedAt,
  paidOnline: !!s.paidOnline, payMethod: s.paidOnline || s.status === 'paid' ? s.pay?.method : '',
  checkoutUrl: s.status === 'awaiting_payment' ? s.checkoutUrl || '' : '',
  payDeadline: s.status === 'awaiting_payment' ? new Date(new Date(s.createdAt).getTime() + PAY_WINDOW_MIN * 60000) : null,
  refundDue: !!s.refundDue,
  qrPay: s.qrPay?.method ? { method: s.qrPay.method, ref: s.qrPay.ref, verified: !!s.qrPay.verified, at: s.qrPay.at || s.createdAt, shot: !!s.qrPay.shot } : null,
  cancelReason: s.status === 'cancelled' ? s.cancelReason || '' : '',
  subtotal: s.subtotal, discount: s.discount?.amount > 0 ? { type: s.discount.type, amount: s.discount.amount } : null,
  freeDrink: s.stampsUsed > 0, stampsAwarded: s.stampsAwarded ?? null, stampsBalance: s.stampsBalance ?? null,
});

export default r;
