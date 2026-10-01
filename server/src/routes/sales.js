import { Router } from 'express';
import Sale from '../models/Sale.js';
import Counter from '../models/Counter.js';
import { priceOrder, usageList, usageMap, nextOrderNo } from '../lib/orders.js';
import { checkOverride } from '../middleware/auth.js';
import { ah, HttpError, shopTime, applyUsage, assertValid, dayRange } from '../lib/util.js';
import { checkId } from '../lib/ids.js';
import { checkCheckout, LIMITS, normPhone, DISC_PIN_OVER } from '../../../src/shared/rules.mjs';
import Customer from '../models/Customer.js';
import User from '../models/User.js';
import { redeemReward, returnReward, awardStamps, takeBackStamps } from '../lib/loyalty.js';
import { rewardValue } from '../../../src/shared/loyalty.mjs';
import { computeTotals, r2, PAY_METHODS } from '../../../src/shared/pricing.mjs';

const r = Router();
r.param('id', checkId);

// Ring up a sale. Prices and stock usage are recomputed here from the
// database, so the client can never set its own prices.
r.post('/', ah(async (req, res) => {
  const b = req.body || {};
  if (b.staffDrink) return staffDrink(req, res);
  const method = b.pay?.method;
  if (!PAY_METHODS[method]) throw new HttpError(400, 'Choose a payment method.', { method: 'Choose a payment method.' });
  const { settings, priced, usage, subtotal, cost } = await priceOrder(b.lines);
  const lines = b.lines;

  // Stamp card: the customer's mobile number (optional); a free drink replaces any other discount
  let cust = null;
  const rawPhone = String(b.loyaltyPhone || '').trim();
  if (rawPhone) {
    if (!normPhone(rawPhone)) throw new HttpError(400, 'Enter a PH mobile number like 0917 123 4567.', { loyaltyPhone: 'Enter a PH mobile number like 0917 123 4567.' });
    cust = await Customer.findOne({ phone: normPhone(rawPhone) });
    if (!cust) throw new HttpError(404, 'No customer account uses this number. They can sign up on the ordering site.', { loyaltyPhone: 'No account with this number.' });
  }
  const useReward = b.useReward === true;
  if (useReward && !cust) throw new HttpError(400, 'Enter the customer\'s number to use a free drink.', { loyaltyPhone: 'Enter their number first.' });
  const discount = useReward ? { type: 'none' } : { type: b.discount?.type || 'none', pct: b.discount?.pct, idNo: b.discount?.idNo, idName: b.discount?.idName };
  const t = computeTotals(subtotal, useReward ? { type: 'reward', amount: rewardValue(priced.map((l) => l.base)) } : discount, settings.vat);
  assertValid(checkCheckout({ lineCount: lines.length, total: t.total, discount, pay: b.pay, customer: b.customer, needName: true }));
  // Big promo discounts by a cashier need an admin's PIN
  let approvedBy;
  if (discount.type === 'pct' && +discount.pct > DISC_PIN_OVER && req.user.role !== 'admin') {
    const ov = checkOverride(b.override, 'discount', req.user._id);
    if (!ov) throw new HttpError(403, `Discounts over ${DISC_PIN_OVER}% need an admin’s PIN.`, { override: 'discount' });
    approvedBy = ov.by;
  }
  if (discount.type === 'scpwd') Object.assign(t.discount, { idNo: String(discount.idNo).trim().toUpperCase(), idName: String(discount.idName).trim().replace(/\s+/g, ' ') });
  if (approvedBy) t.discount.approvedBy = approvedBy;
  let tendered = t.total, change = 0;
  if (method === 'cash') {
    tendered = r2(+b.pay.tendered);
    change = r2(tendered - t.total);
  }

  if (useReward) await redeemReward(cust._id);
  const { date, hour, no } = await nextOrderNo();
  let sale;
  try { sale = await Sale.create({
    no, date, hour,
    cashier: req.user._id, cashierName: req.user.name,
    customer: String(b.customer || '').trim().replace(/\s+/g, ' ').slice(0, 60),
    lines: priced,
    subtotal: t.subtotal, discount: t.discount, total: t.total, vat: t.vat, vatExempt: t.vatExempt,
    pay: { method, tendered, change, ref: String(b.pay.ref || '').trim().slice(0, 60) },
    usage: usageList(usage), cost,
    customerId: cust?._id, stampsUsed: useReward ? 9 : 0,
  }); } catch (e) {
    if (useReward) await Customer.updateOne({ _id: cust._id }, { $inc: { stamps: 9, rewardsUsed: -1 } });
    throw e;
  }
  await applyUsage(usage, -1, { reason: 'sale', by: req.user.name, sale: sale._id });
  if (cust) sale = await awardStamps(sale);
  res.status(201).json(sale);
}));

// Staff drink: made and taken off stock, but not a sale (total ₱0, shown separately in reports)
async function staffDrink(req, res) {
  const b = req.body;
  const forId = String(b.staffDrink.for || '');
  const who = /^[a-f0-9]{24}$/i.test(forId) ? await User.findOne({ _id: forId, active: true }, 'name') : null;
  if (!who) throw new HttpError(400, 'Choose who the staff drink is for.', { staffFor: 'Choose who it is for.' });
  const { priced, usage, subtotal, cost } = await priceOrder(b.lines, { maxLines: 5, maxQty: 5 });
  const { date, hour, no } = await nextOrderNo();
  const sale = await Sale.create({
    no, date, hour, status: 'staff',
    cashier: req.user._id, cashierName: req.user.name, customer: who.name,
    staffFor: who._id, staffForName: who.name,
    lines: priced, subtotal, discount: { type: 'staff', pct: 100, amount: subtotal }, total: 0, vat: 0, vatExempt: 0,
    pay: { method: 'staff', tendered: 0, change: 0, ref: '' },
    usage: usageList(usage), cost,
  });
  await applyUsage(usage, -1, { reason: 'staff', by: req.user.name, sale: sale._id, note: `Staff drink: ${who.name}` });
  const today = await Sale.countDocuments({ date, status: 'staff', staffFor: who._id });
  res.status(201).json({ ...sale.toObject(), staffToday: today });
}

// Stamp card lookup at the counter: ?phone=09XXXXXXXXX
r.get('/loyalty', ah(async (req, res) => {
  const phone = normPhone(req.query.phone);
  if (!phone) throw new HttpError(400, 'Enter a PH mobile number like 0917 123 4567.', { loyaltyPhone: 'Enter a PH mobile number.' });
  const c = await Customer.findOne({ phone }, 'name stamps');
  if (!c) throw new HttpError(404, 'No customer account uses this number. They can sign up on the ordering site.', { loyaltyPhone: 'No account with this number.' });
  res.json({ name: c.name, stamps: c.stamps || 0 });
}));

// Orders in a date range: ?from=YYYY-MM-DD&to=YYYY-MM-DD
r.get('/', ah(async (req, res) => {
  const { from, to } = dayRange(req.query, shopTime().date, LIMITS.reportDays);
  res.json(await Sale.find({ date: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).limit(2000));
}));

r.get('/next-number', ah(async (_req, res) => {
  const { date } = shopTime();
  const c = await Counter.findById(`order-${date}`);
  res.json({ date, next: (c?.seq || 0) + 1 });
}));

// Void (admin): marks the order void and puts its ingredients back on the shelf
r.post('/:id/void', ah(async (req, res) => {
  // Admins void directly; a cashier needs an admin's PIN
  let approvedBy;
  if (req.user.role !== 'admin') {
    const ov = checkOverride(req.body?.override, 'void', req.user._id);
    if (!ov) throw new HttpError(403, 'Voiding a sale needs an admin’s PIN.', { override: 'void' });
    approvedBy = ov.by;
  }
  const reason = String(req.body?.reason || '').trim();
  if (reason.length > 120) throw new HttpError(400, 'The reason can be at most 120 characters.', { reason: 'At most 120 characters.' });
  const sale = await Sale.findOneAndUpdate(
    { _id: req.params.id, status: { $in: ['paid', 'staff'] } },
    { status: 'void', voidedAt: new Date(), voidedBy: req.user.name, voidReason: reason, ...(approvedBy ? { voidApprovedBy: approvedBy } : {}) },
    { new: true }
  );
  if (!sale) throw new HttpError(409, 'This order was already voided or does not exist.');
  await applyUsage(usageMap(sale.usage), 1, { reason: 'void', by: req.user.name, sale: sale._id });
  await takeBackStamps(sale);
  await returnReward(sale);
  res.json(sale);
}));

export default r;
