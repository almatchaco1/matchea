// Finishing a delivery: shared by staff ("Delivered") and the customer ("I received my order").
import Sale from '../models/Sale.js';
import { HttpError, applyUsage } from './util.js';
import { usageMap } from './orders.js';
import { awardStamps } from './loyalty.js';

export const isPrepaid = (s) => !!(s.paidOnline || s.qrPay?.verified || s.total <= 0);

/** Marks a delivery that is on the way as delivered and completes the sale. by: 'customer' | staff user */
export async function finishDelivery(cur, by) {
  if (cur.fulfil !== 'delivery') throw new HttpError(400, 'This is a pickup order.');
  if (cur.delivery?.state === 'delivered') return cur;
  if (cur.delivery?.state !== 'picked' || cur.status !== 'ready') throw new HttpError(409, 'This order isn’t on the way yet. The page will refresh.');
  if (!isPrepaid(cur)) throw new HttpError(400, 'This delivery isn’t marked paid yet. Check the payment first.');
  const staff = by && by !== 'customer';
  const sale = await Sale.findOneAndUpdate({ _id: cur._id, status: 'ready', 'delivery.state': 'picked' }, {
    status: 'paid', completedAt: new Date(), 'delivery.state': 'delivered', 'delivery.deliveredAt': new Date(),
    'delivery.receivedBy': staff ? 'staff' : 'customer',
    ...(staff ? { cashier: by._id, cashierName: by.name } : {}),
  }, { new: true });
  if (!sale) return Sale.findById(cur._id); // finished at the same moment by the other side
  if (!cur.stockDeducted) {
    await applyUsage(usageMap(sale.usage), -1, { reason: 'sale', by: staff ? by.name : 'Customer', sale: sale._id, note: 'Online order' });
    await Sale.updateOne({ _id: sale._id }, { stockDeducted: true });
  }
  return awardStamps(sale);
}
