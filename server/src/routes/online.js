// Staff side of online orders: accept → ready → paid, or cancel.
import { Router } from 'express';
import Sale from '../models/Sale.js';
import Asset from '../models/Asset.js';
import { ah, HttpError, applyUsage, assertValid, shopTime } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { usageMap } from '../lib/orders.js';
import { checkCheckout } from '../../../src/shared/rules.mjs';
import { r2, PAY_METHODS } from '../../../src/shared/pricing.mjs';
import { settleOnlinePayment } from './public.js';
import { paymongoMode } from '../lib/paymongo.js';
import { awardStamps, returnReward, redeemReward } from '../lib/loyalty.js';
import { postToCustomer } from './support.js';
import { notifyReady } from '../lib/notify.js';
import { checkOverride } from '../middleware/auth.js';
import { finishDelivery } from '../lib/delivery.js';

const r = Router();
r.param('id', checkId);

// Open orders (any day) plus today's finished ones
r.get('/', ah(async (_req, res) => {
  const { date } = shopTime();
  // Settle "pay now" orders first (payment check + expiry), so staff only see real orders
  for (const s of await Sale.find({ source: 'online', status: 'awaiting_payment' }).limit(50)) await settleOnlinePayment(s);
  const orders = await Sale.find({ source: 'online', $or: [{ status: { $in: ['new', 'preparing', 'ready'] } }, { date, status: { $ne: 'awaiting_payment' } }] }).sort({ createdAt: 1 }).limit(300);
  const waiting = await Sale.countDocuments({ source: 'online', status: 'awaiting_payment' });
  // Staff never see the pickup code itself (the customer has to tell it), only that there is one
  const list = orders.map(forStaff);
  res.json({ orders: list, awaitingPayment: waiting, paymentMode: paymongoMode() });
}));

/** An online order as staff see it: without the customer's pickup code. */
const forStaff = (o) => { const x = o.toJSON ? o.toJSON() : { ...o }; x.hasCode = !!x.pickupCode; delete x.pickupCode; return x; };

async function move(id, from, update) {
  const sale = await Sale.findOneAndUpdate({ _id: id, source: 'online', status: { $in: from } }, update, { new: true });
  if (sale) return sale;
  const cur = await Sale.findOne({ _id: id, source: 'online' }, 'status');
  if (!cur) throw new HttpError(404, 'Order not found.');
  const label = { new: 'waiting to be accepted', preparing: 'being prepared', ready: 'ready for pickup', paid: 'completed', cancelled: 'cancelled', void: 'voided' }[cur.status] || cur.status;
  throw new HttpError(409, `This order is ${label}, so that step isn't available. The list will refresh.`);
}

// Accept: stock is taken now (not when the customer ordered)
r.post('/:id/accept', ah(async (req, res) => {
  const cur = await Sale.findOne({ _id: req.params.id, source: 'online' }, 'qrPay total');
  const extra = {};
  if (cur?.qrPay?.method && !cur.qrPay.verified) {
    // Paid by QR: staff confirms they saw the money in their GCash / Maya first
    if (req.body?.paymentOk !== true) throw new HttpError(400, 'Check your GCash / Maya for this payment first, then tap “Payment received”.');
    Object.assign(extra, { 'qrPay.verified': true, 'qrPay.verifiedBy': req.user.name, paidAt: new Date(), pay: { method: cur.qrPay.method, tendered: cur.total, change: 0, ref: cur.qrPay.ref } });
  }
  const sale = await move(req.params.id, ['new'], { status: 'preparing', acceptedAt: new Date(), cashier: req.user._id, cashierName: req.user.name, stockDeducted: true, ...extra });
  await applyUsage(usageMap(sale.usage), -1, { reason: 'sale', by: req.user.name, sale: sale._id, note: 'Online order' });
  res.json(forStaff(sale));
}));

r.post('/:id/ready', ah(async (req, res) => {
  const sale = await move(req.params.id, ['preparing'], { status: 'ready', readyAt: new Date() });
  notifyReady(sale).catch((e) => console.error('Ready text failed:', e.message)); // don't make staff wait for the SMS
  res.json(forStaff(sale));
}));

// Customer picked up and paid
r.post('/:id/complete', ah(async (req, res) => {
  const cur = await Sale.findOne({ _id: req.params.id, source: 'online' });
  if (!cur) throw new HttpError(404, 'Order not found.');
  if (cur.fulfil === 'delivery') throw new HttpError(400, 'This is a delivery: tap “Delivered” when Lalamove has dropped it off.');
  // Pickup code: the customer tells it, so nobody else can take the order (an admin can let it go without)
  let approvedBy;
  if (cur.pickupCode && String(req.body?.code || '').replace(/\D/g, '') !== cur.pickupCode) {
    const ov = checkOverride(req.body?.override, 'pickup', req.user._id);
    if (!ov) throw new HttpError(400, req.body?.code ? 'That pickup code doesn’t match. Ask the customer to check their order page.' : 'Ask the customer for their 4-digit pickup code.', { code: req.body?.code ? 'Wrong code.' : 'Enter the pickup code.' });
    approvedBy = ov.by;
  }
  if (approvedBy) await Sale.updateOne({ _id: cur._id }, { pickupApprovedBy: approvedBy });
  if (cur.paidOnline || cur.qrPay?.verified) { // already paid (PayMongo, or QR checked by staff): just hand it over
    const sale = await move(req.params.id, ['ready', 'preparing'], { status: 'paid', completedAt: new Date(), cashier: req.user._id, cashierName: req.user.name });
    if (!cur.stockDeducted) {
      await applyUsage(usageMap(sale.usage), -1, { reason: 'sale', by: req.user.name, sale: sale._id, note: 'Online order' });
      await Sale.updateOne({ _id: sale._id }, { stockDeducted: true });
    }
    return res.json(await awardStamps(sale));
  }
  const pay = req.body?.pay || {};
  if (!PAY_METHODS[pay.method]) throw new HttpError(400, 'Choose how the customer paid.', { method: 'Choose how the customer paid.' });
  assertValid(checkCheckout({ lineCount: cur.lines.length, total: cur.total, pay }));
  const tendered = pay.method === 'cash' ? r2(+pay.tendered) : cur.total;
  const sale = await move(req.params.id, ['ready', 'preparing'], {
    status: 'paid', completedAt: new Date(), cashier: req.user._id, cashierName: req.user.name,
    pay: { method: pay.method, tendered, change: r2(tendered - cur.total), ref: String(pay.ref || '').trim() },
  });
  if (!cur.stockDeducted) { // completed straight from "new": take the stock now
    await applyUsage(usageMap(sale.usage), -1, { reason: 'sale', by: req.user.name, sale: sale._id, note: 'Online order' });
    await Sale.updateOne({ _id: sale._id }, { stockDeducted: true });
  }
  res.json(await awardStamps(sale));
}));

// ---------- Delivery (staff books Lalamove in the Lalamove app, then follows it here) ----------
const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
async function deliveryOrder(id) {
  const cur = await Sale.findOne({ _id: id, source: 'online' });
  if (!cur) throw new HttpError(404, 'Order not found.');
  if (cur.fulfil !== 'delivery') throw new HttpError(400, 'This is a pickup order.');
  return cur;
}
const STATE_LABEL = { waiting: 'not booked yet', booked: 'waiting for the rider', picked: 'on the way', delivered: 'already delivered' };
async function step(id, from, update, statuses = ['preparing', 'ready']) {
  const sale = await Sale.findOneAndUpdate({ _id: id, source: 'online', fulfil: 'delivery', status: { $in: statuses }, 'delivery.state': { $in: from } }, update, { new: true });
  if (sale) return sale;
  const cur = await deliveryOrder(id);
  if (!statuses.includes(cur.status)) throw new HttpError(409, cur.status === 'new' ? 'Accept the order first.' : `This order is ${cur.status === 'paid' ? 'completed' : cur.status}. The list will refresh.`);
  throw new HttpError(409, `The delivery is ${STATE_LABEL[cur.delivery?.state] || cur.delivery?.state}, so that step isn't available. The list will refresh.`);
}

// The Lalamove share link ("Share" on the booking in the Lalamove app): the customer follows the rider live on it.
// Any https link is accepted, because Lalamove's share links differ by app version and country.
const trackError = (u) => (u && !/^https:\/\/[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i.test(u) ? 'Paste the share link from the Lalamove app (it starts with https://), or leave it empty.' : '');

// Booked Lalamove: the customer sees "Waiting for a rider". cost (optional) = what Lalamove charged.
r.post('/:id/delivery/booked', ah(async (req, res) => {
  const b = req.body || {};
  const cost = b.cost === '' || b.cost == null ? undefined : +b.cost;
  if (cost != null && (!Number.isFinite(cost) || cost < 0 || cost > 5000)) throw new HttpError(400, 'Enter the Lalamove fee in pesos, or leave it empty.', { cost: 'Enter the fee in pesos.' });
  const trackUrl = clean(b.trackUrl, 300);
  const te = trackError(trackUrl); if (te) throw new HttpError(400, te, { trackUrl: te });
  const sale = await step(req.params.id, ['waiting', 'booked'], { 'delivery.state': 'booked', 'delivery.bookedAt': new Date(), 'delivery.bookedBy': req.user.name, ...(cost != null ? { 'delivery.cost': r2(cost) } : {}), ...(trackUrl ? { 'delivery.trackUrl': trackUrl } : {}) });
  res.json(forStaff(sale));
}));

// Rider picked up the drinks: the customer sees "On the way" with the rider's details and the Lalamove tracking link
r.post('/:id/delivery/picked', ah(async (req, res) => {
  const b = req.body || {};
  const rider = { name: clean(b.name, 40), phone: clean(b.phone, 20), plate: clean(b.plate, 12).toUpperCase() };
  const trackUrl = clean(b.trackUrl, 300);
  const e = {};
  if (rider.name.length < 2) e.name = 'Enter the rider’s name (from the Lalamove app).';
  if (rider.phone && !/^(\+?63|0)9\d{9}$/.test(rider.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a mobile number like 0917 123 4567, or leave it empty.';
  if (trackError(trackUrl)) e.trackUrl = trackError(trackUrl);
  assertValid(e);
  const cur = await deliveryOrder(req.params.id);
  if (cur.status === 'preparing') throw new HttpError(409, 'The drinks aren’t marked ready yet. Tap Done on the Barista screen (or Mark ready here) before the rider takes them.');
  const sale = await step(req.params.id, ['booked'], { status: 'ready', readyAt: new Date(), 'delivery.state': 'picked', 'delivery.pickedAt': new Date(), 'delivery.rider': rider, ...(trackUrl ? { 'delivery.trackUrl': trackUrl } : {}) }, ['ready']);
  res.json(forStaff(sale));
}));

// Add or change the tracking link any time after booking (empty = remove it)
r.post('/:id/delivery/track', ah(async (req, res) => {
  const trackUrl = clean(req.body?.trackUrl, 300);
  const te = trackError(trackUrl); if (te) throw new HttpError(400, te, { trackUrl: te });
  const sale = await step(req.params.id, ['booked', 'picked'], { 'delivery.trackUrl': trackUrl });
  res.json(forStaff(sale));
}));

// Rider cancelled: book again
r.post('/:id/delivery/rebook', ah(async (req, res) => {
  const sale = await step(req.params.id, ['booked', 'picked'], { 'delivery.state': 'waiting', 'delivery.rider': {}, 'delivery.trackUrl': '' });
  res.json(forStaff(sale));
}));

// Delivered: the order is completed (it was paid before it was sent). The customer can also confirm it on their order page.
r.post('/:id/delivery/delivered', ah(async (req, res) => {
  const cur = await deliveryOrder(req.params.id);
  if (cur.delivery?.state === 'delivered') return res.json(forStaff(cur));
  res.json(forStaff(await finishDelivery(cur, req.user)));
}));

// The payment screenshot a customer attached (staff only)
r.get('/:id/receipt', ah(async (req, res) => {
  const a = await Asset.findOne({ key: `receipt-${req.params.id}` }).lean();
  if (!a) throw new HttpError(404, 'No screenshot for this order.');
  res.set('Cache-Control', 'private, max-age=3600');
  res.type(a.type).send(Buffer.from(a.data.buffer || a.data));
}));

r.post('/:id/cancel', ah(async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) throw new HttpError(400, 'Tell the customer why (at least 3 characters).', { reason: 'Tell the customer why.' });
  if (reason.length > 120) throw new HttpError(400, 'The reason can be at most 120 characters.', { reason: 'At most 120 characters.' });
  const prev = await Sale.findOne({ _id: req.params.id, source: 'online' }, 'paidOnline qrPay fulfil delivery');
  if (prev?.fulfil === 'delivery' && prev.delivery?.state === 'picked') throw new HttpError(409, 'The rider already has this order, so it can’t be cancelled here. Call the rider and the customer first; if Lalamove cancels, tap Rider cancelled.');
  const paid = !!prev?.paidOnline || !!prev?.qrPay?.verified || !!prev?.qrPay?.method;
  // "Did not pick up" on an unpaid order counts as a no-show (2 in 60 days → that customer pays first next time)
  const noShow = !paid && (req.body?.noShow === true || /did not pick up|didn.t pick up|no.?show/i.test(reason));
  const sale = await move(req.params.id, ['new', 'preparing', 'ready'], { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason, noShow, refundDue: !!prev?.paidOnline || !!prev?.qrPay?.verified });
  if (sale.stockDeducted) {
    await applyUsage(usageMap(sale.usage), 1, { reason: 'void', by: req.user.name, sale: sale._id, note: 'Online order cancelled' });
    await Sale.updateOne({ _id: sale._id }, { stockDeducted: false });
  }
  await returnReward(sale);
  res.json(sale);
}));

// Undo a cancel (e.g. the GCash payment was found after all): the order goes back to "Preparing",
// the stock is taken again, and the customer is told in their customer service chat.
export const RESTORE_DAYS = 3;
r.post('/:id/restore', ah(async (req, res) => {
  const cur = await Sale.findOne({ _id: req.params.id, source: 'online' });
  if (!cur) throw new HttpError(404, 'Order not found.');
  if (cur.status !== 'cancelled') throw new HttpError(409, 'Only a cancelled order can be restored. The list will refresh.');
  if (!cur.cancelledAt || Date.now() - cur.cancelledAt > RESTORE_DAYS * 864e5) throw new HttpError(409, `This order was cancelled more than ${RESTORE_DAYS} days ago. Ask the customer to order again instead.`);
  const qrUnchecked = cur.qrPay?.method && !cur.qrPay.verified;
  if (qrUnchecked && req.body?.paymentOk !== true) throw new HttpError(400, 'Check your GCash / Maya for this payment first, then tick “I found the payment”.', { paymentOk: 'Tick this after checking.' });
  // A free drink that was given back on cancel is used again
  if (cur.stampsUsed > 0 && cur.stampsReturned) {
    if (!cur.customerId) throw new HttpError(409, 'This order used a free drink that can’t be taken again.');
    await redeemReward(cur.customerId).catch(() => { throw new HttpError(409, 'This order used a free drink, but the customer no longer has enough stamps. Ask them to order again instead.'); });
  }
  const set = {
    status: 'preparing', acceptedAt: new Date(), cashier: req.user._id, cashierName: req.user.name, stockDeducted: true,
    noShow: false, refundDue: false, hiddenByCustomer: false, stampsReturned: false, restoredAt: new Date(), restoredBy: req.user.name,
    ...(qrUnchecked ? { 'qrPay.verified': true, 'qrPay.verifiedBy': req.user.name, paidAt: new Date(), pay: { method: cur.qrPay.method, tendered: cur.total, change: 0, ref: cur.qrPay.ref } } : {}),
    ...(cur.fulfil === 'delivery' ? { 'delivery.state': 'waiting' } : {}),
  };
  const sale = await Sale.findOneAndUpdate({ _id: cur._id, status: 'cancelled' }, { $set: set, $unset: { cancelledAt: 1, cancelReason: 1 } }, { new: true });
  if (!sale) throw new HttpError(409, 'This order just changed. The list will refresh.');
  await applyUsage(usageMap(sale.usage), -1, { reason: 'sale', by: req.user.name, sale: sale._id, note: 'Online order restored' });
  const no = String(sale.no).padStart(3, '0');
  const paidBy = sale.qrPay?.method ? { gcash: 'GCash', maya: 'Maya' }[sale.qrPay.method] || 'online' : '';
  const text = String(req.body?.message || '').trim().slice(0, 500)
    || `Good news! ${paidBy && qrUnchecked ? `We found your ${paidBy} payment. ` : ''}Order #${no} is back on and we’re making it now. Sorry for the trouble!`;
  await postToCustomer(sale.customerId, { text, staffName: req.user.name, orderNo: sale.no, orderCode: sale.trackCode || '', solve: req.body?.solve !== false })
    .catch((e) => console.error('Chat message failed:', e.message));
  res.json(forStaff(sale));
}));

export default r;
