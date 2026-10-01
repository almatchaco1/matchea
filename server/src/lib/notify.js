// "Your order is ready" text message, sent through Semaphore (semaphore.co, a PH SMS gateway).
// Set SEMAPHORE_API_KEY in server/.env to turn it on. Without it, nothing is sent (the
// customer still sees the alert on the ordering site).
import Sale from '../models/Sale.js';
import Customer from '../models/Customer.js';
import Settings from '../models/Settings.js';
import { pad } from './text.js';

export const smsEnabled = () => !!process.env.SEMAPHORE_API_KEY;

export async function sendSms(number, message) {
  if (!smsEnabled()) { console.log(`[SMS off] would text ${number}: ${message}`); return { skipped: true }; }
  const body = new URLSearchParams({ apikey: process.env.SEMAPHORE_API_KEY, number, message });
  if (process.env.SEMAPHORE_SENDER) body.set('sendername', process.env.SEMAPHORE_SENDER);
  const base = (process.env.SEMAPHORE_API_BASE || 'https://api.semaphore.co').replace(/\/$/, '');
  const res = await fetch(`${base}/api/v4/messages`, { method: 'POST', body, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Semaphore ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

/** Text the customer once when staff mark an online order ready. */
export async function notifyReady(sale) {
  if (!sale?.phone) return;
  const claimed = await Sale.findOneAndUpdate({ _id: sale._id, readyNotified: { $ne: true } }, { readyNotified: true });
  if (!claimed) return; // already texted
  if (sale.customerId) {
    const c = await Customer.findById(sale.customerId, 'smsReady');
    if (c && c.smsReady === false) return; // customer turned texts off
  }
  const s = await Settings.get();
  const shop = s.name || 'AL Matcha Co';
  const first = String(sale.customer || '').split(' ')[0];
  const site = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const msg = [
    `${shop}: Hi${first ? ` ${first}` : ''}! Your order #${pad(sale.no)} is ready for pickup.`,
    sale.pickupCode ? `Pickup code: ${sale.pickupCode}.` : '',
    sale.paidOnline || sale.qrPay?.verified ? 'It\'s already paid.' : 'Please pay at the counter.',
    site.startsWith('https://') ? `${site}/order/${sale.trackCode}` : '',
  ].filter(Boolean).join(' ');
  await sendSms(sale.phone, msg);
}
