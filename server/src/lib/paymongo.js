// PayMongo hosted checkout (GCash, Maya, QR Ph). Cards are not accepted.
// Docs: https://docs.paymongo.com/reference/create_checkout_sessions
//       https://docs.paymongo.com/docs/developer-tools-webhook-setup-management
import crypto from 'node:crypto';

const API = () => (process.env.PAYMONGO_API_BASE || 'https://api.paymongo.com').replace(/\/$/, '');
const secret = () => process.env.PAYMONGO_SECRET_KEY || '';

export const paymongoEnabled = () => /^sk_(test|live)_/.test(secret());
export const paymongoMode = () => (secret().startsWith('sk_live_') ? 'live' : secret().startsWith('sk_test_') ? 'test' : 'off');
export const methodTypes = () => (process.env.PAYMONGO_METHODS || 'gcash,paymaya,qrph').split(',').map((s) => s.trim()).filter((m) => m && m !== 'card');

async function pm(method, path, body) {
  let res;
  try {
    res = await fetch(API() + path, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(secret() + ':').toString('base64') },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error('Could not reach the payment service. Please try again or choose pay at pickup.'), { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || `HTTP ${res.status}`;
    console.error('PayMongo error:', detail);
    throw Object.assign(new Error('The payment service rejected the request. Please choose pay at pickup, or try again later.'), { status: 502, detail });
  }
  return data.data;
}

/** Create a hosted checkout for an order. Amounts go to PayMongo in centavos. */
export async function createCheckout({ sale, shopName, successUrl, cancelUrl, type }) {
  const no = String(sale.no).padStart(3, '0');
  // With a discount (e.g. free drink) the items no longer add up to the total, so send the order as one line
  const items = sale.discount?.amount > 0
    ? [{ name: `${shopName} order #${no}`.slice(0, 100), description: sale.lines.map((l) => `${l.qty}× ${l.name}`).join(', ').slice(0, 100), amount: Math.round(sale.total * 100), currency: 'PHP', quantity: 1 }]
    : sale.lines.map((l) => ({
      name: l.name.slice(0, 100), description: (l.mods || l.name).slice(0, 100),
      amount: Math.round(l.unit * 100), currency: 'PHP', quantity: l.qty,
    }));
  if (sale.onlineFee > 0) items.push({ name: 'Online payment fee', description: 'PayMongo fee for paying online', amount: Math.round(sale.onlineFee * 100), currency: 'PHP', quantity: 1 });
  const s = await pm('POST', '/v1/checkout_sessions', {
    data: {
      attributes: {
        line_items: items,
        payment_method_types: type ? [type] : methodTypes(), // one method per checkout, so the fee added matches it
        success_url: successUrl,
        cancel_url: cancelUrl,
        reference_number: String(sale._id),
        description: `${shopName} order #${no}`,
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        billing: { name: sale.customer, phone: sale.phone ? '+63' + sale.phone.slice(1) : undefined },
        metadata: { sale_id: String(sale._id), order_no: String(sale.no) },
      },
    },
  });
  return { id: s.id, url: s.attributes.checkout_url };
}

export const getCheckout = (id) => pm('GET', `/v1/checkout_sessions/${encodeURIComponent(id)}`);
export const expireCheckout = (id) => pm('POST', `/v1/checkout_sessions/${encodeURIComponent(id)}/expire`).catch(() => null);

/** Pull the paid payment (if any) out of a checkout session resource. */
export function paidPayment(session) {
  const a = session?.attributes || {};
  const p = (a.payments || []).find((x) => x?.attributes?.status === 'paid');
  if (!p && a.payment_intent?.attributes?.status !== 'succeeded') return null;
  const pa = p?.attributes || {};
  const type = pa.source?.type || a.payment_method_used || '';
  return { id: p?.id || a.payment_intent?.id || '', amount: (pa.amount ?? 0) / 100, type };
}

/** Map PayMongo's payment type to our pay.method. */
export const methodFrom = (type) => ({ gcash: 'gcash', paymaya: 'maya' }[type] || 'online');

/**
 * Verify the Paymongo-Signature header: "t=<ts>,te=<test sig>,li=<live sig>".
 * Signature = HMAC-SHA256(webhook secret, `${t}.${rawBody}`), compared with te (test) or li (live).
 */
export function verifyWebhook(header, rawBody, livemode) {
  const whsec = process.env.PAYMONGO_WEBHOOK_SECRET || '';
  if (!whsec || !header || !rawBody) return false;
  const parts = Object.fromEntries(String(header).split(',').map((kv) => { const i = kv.indexOf('='); return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]; }));
  const expected = crypto.createHmac('sha256', whsec).update(`${parts.t}.${rawBody}`).digest('hex');
  const got = livemode ? parts.li : parts.te;
  if (!got || got.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return false;
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  return Number.isFinite(age) && age < 60 * 60 * 24; // reject very old replays
}
