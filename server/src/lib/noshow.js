import Sale from '../models/Sale.js';

// No-show rule: after 2 pay-at-pickup orders that weren't collected in the last 60 days,
// the customer has to pay first (GCash / online) for their next orders.
export const NO_SHOW_LIMIT = 2, NO_SHOW_DAYS = 60;
export async function mustPayFirst(customerId) {
  if (!customerId) return false;
  const since = new Date(Date.now() - NO_SHOW_DAYS * 864e5);
  return (await Sale.countDocuments({ customerId, noShow: true, cancelledAt: { $gte: since } })) >= NO_SHOW_LIMIT;
}
