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
import { awardStamps, returnReward } from '../lib/loyalty.js';
import { notifyReady } from '../lib/notify.js';

const r = Router();
r.param('id', checkId);

// Open orders (any day) plus today's finished ones
r.get('/', ah(async (_req, res) => {
  const { date } = shopTime();
  // Settle "pay now" orders first (payment check + expiry), so staff only see real orders
  for (const s of await Sale.find({ source: 'online', status: 'awaiting_payment' }).limit(50)) await settleOnlinePayment(s);
  const orders = await Sale.find({ source: 'online', $or: [{ status: { $in: ['new', 'preparing', 'ready'] } }, { date, status: { $ne: 'awaiting_payment' } }] }).sort({ createdAt: 1 }).limit(300);
  const waiting = await Sale.countDocuments({ source: 'online', status: 'awaiting_payment' });
  res.json({ orders, awaitingPayment: waiting, paymentMode: paymongoMode() });
}));

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
  res.json(sale);
}));

r.post('/:id/ready', ah(async (req, res) => {
  const sale = await move(req.params.id, ['preparing'], { status: 'ready', readyAt: new Date() });
  notifyReady(sale).catch((e) => console.error('Ready text failed:', e.message)); // don't make staff wait for the SMS
  res.json(sale);
}));

// Customer picked up and paid
r.post('/:id/complete', ah(async (req, res) => {
  const cur = await Sale.findOne({ _id: req.params.id, source: 'online' });
  if (!cur) throw new HttpError(404, 'Order not found.');
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
  const prev = await Sale.findOne({ _id: req.params.id, source: 'online' }, 'paidOnline qrPay');
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

export default r;
