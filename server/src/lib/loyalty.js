// Stamp card bookkeeping. Every change is atomic, so double clicks or two
// registers can never spend the same stamps twice.
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import { HttpError } from './util.js';
import { STAMPS_PER_REWARD, stampsFor } from '../../../src/shared/loyalty.mjs';

/** Take 9 stamps for a free drink, or refuse if there aren't enough. */
export async function redeemReward(customerId) {
  const c = await Customer.findOneAndUpdate(
    { _id: customerId, stamps: { $gte: STAMPS_PER_REWARD } },
    { $inc: { stamps: -STAMPS_PER_REWARD, rewardsUsed: 1 } },
    { new: true }
  );
  if (!c) throw new HttpError(409, `A free drink needs ${STAMPS_PER_REWARD} stamps.`, { useReward: 'Not enough stamps for a free drink.' });
  return c;
}

/** Give stamps back when an order that used a free drink is cancelled or voided. Safe to call twice. */
export async function returnReward(sale) {
  if (!sale?.customerId || !(sale.stampsUsed > 0)) return;
  const s = await Sale.findOneAndUpdate({ _id: sale._id, stampsReturned: { $ne: true } }, { stampsReturned: true });
  if (s) await Customer.updateOne({ _id: sale.customerId }, { $inc: { stamps: sale.stampsUsed, rewardsUsed: -1 } });
}

/** Add stamps for a completed order. Safe to call twice. Returns the updated sale. */
export async function awardStamps(sale) {
  if (!sale?.customerId || sale.stampsAwarded != null) return sale;
  const n = stampsFor(sale.lines, sale.stampsUsed > 0);
  const upd = await Sale.findOneAndUpdate({ _id: sale._id, stampsAwarded: null }, { stampsAwarded: n }, { new: true });
  if (!upd) return Sale.findById(sale._id);
  const c = await Customer.findByIdAndUpdate(sale.customerId, { $inc: { stamps: n, lifetimeStamps: n } }, { new: true });
  return Sale.findByIdAndUpdate(sale._id, { stampsBalance: c ? c.stamps : null }, { new: true });
}

/** Voiding a completed order takes its stamps away again (never below zero). */
export async function takeBackStamps(sale) {
  if (!sale?.customerId || !(sale.stampsAwarded > 0)) return;
  const s = await Sale.findOneAndUpdate({ _id: sale._id, stampsTakenBack: { $ne: true } }, { stampsTakenBack: true });
  if (!s) return;
  const c = await Customer.findByIdAndUpdate(sale.customerId, { $inc: { stamps: -sale.stampsAwarded, lifetimeStamps: -sale.stampsAwarded } }, { new: true });
  if (c && c.stamps < 0) await Customer.updateOne({ _id: c._id }, { stamps: 0 });
}
