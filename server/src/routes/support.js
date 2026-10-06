// Customer service chat.
//   /api/help     the signed-in customer's own conversation with the shop
//   /api/support  staff inbox in the POS (any signed-in staff can reply)
import { Router } from 'express';
import { SupportThread, SupportMsg } from '../models/Support.js';
import Sale from '../models/Sale.js';
import Customer from '../models/Customer.js';
import { requireCustomer } from '../middleware/customerAuth.js';
import { ah, HttpError } from '../lib/util.js';
import { checkId } from '../lib/ids.js';

const RESTORE_DAYS = 3; // same as /online/:id/restore

export const TEXT_MAX = 1000;
const IMG_MAX = 700000; // data URL length (the browser makes pictures small first)
const TOPICS = ['Payment', 'My order', 'Delivery', 'Cancel or change', 'Account', 'Something else'];
const WELCOME = 'Thanks for reaching out! A Matchéa team member will reply here soon. During shop hours we usually reply within a few minutes.';

// One message's worth of checking: text and/or a picture
function readBody(b) {
  const text = String(b?.text ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const img = typeof b?.img === 'string' && b.img ? b.img : '';
  if (!text && !img) throw new HttpError(400, 'Type a message first.', { text: 'Type a message first.' });
  if (text.length > TEXT_MAX) throw new HttpError(400, `Messages can be at most ${TEXT_MAX} characters.`, { text: `At most ${TEXT_MAX} characters.` });
  let pic = null;
  if (img) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(img);
    if (!m || img.length > IMG_MAX) throw new HttpError(400, 'That picture couldn’t be sent. Try another one.', { img: 'Try another picture.' });
    pic = { type: m[1], data: Buffer.from(m[2], 'base64') };
  }
  return { text, pic };
}

const msgOut = (m) => ({
  _id: m._id, from: m.from, staffName: m.from === 'staff' ? m.staffName : '', text: m.text, at: m.createdAt,
  orderNo: m.orderNo ?? null, orderCode: m.orderCode || '', img: !!m.imgType,
});
const threadOut = (t) => ({
  _id: t._id, name: t.name, phone: t.phone, status: t.status, topic: t.topic, orderNo: t.orderNo ?? null, orderCode: t.orderCode || '',
  lastAt: t.lastAt, lastText: t.lastText, lastFrom: t.lastFrom, unreadStaff: t.unreadStaff || 0, unreadCustomer: t.unreadCustomer || 0,
});
const preview = (text, pic) => (text ? text.slice(0, 140) : pic ? '📷 Photo' : '');

async function sendImg(res, msg) {
  if (!msg?.img || !msg.imgType) throw new HttpError(404, 'Picture not found.');
  res.set('Cache-Control', 'private, max-age=86400');
  res.type(msg.imgType).send(Buffer.from(msg.img.buffer || msg.img));
}

/** Post a message from the shop into a customer's chat (made if they never chatted). Used when an order is restored. */
export async function postToCustomer(customerId, { text, staffName = '', from = 'staff', orderNo = null, orderCode = '', solve = false }) {
  if (!customerId) return null;
  let t = await SupportThread.findOne({ customerId });
  if (!t) {
    const c = await Customer.findById(customerId, 'name phone').lean();
    if (!c) return null;
    t = new SupportThread({ customerId, name: c.name, phone: c.phone || '' });
  }
  const m = await SupportMsg.create({ threadId: t._id, from, staffName, text, orderNo, orderCode });
  t.lastAt = m.createdAt; t.lastText = text.slice(0, 140); t.lastFrom = from === 'system' ? t.lastFrom : 'staff';
  t.unreadCustomer = (t.unreadCustomer || 0) + 1; t.unreadStaff = 0;
  if (solve && t.status !== 'resolved') {
    await SupportMsg.create({ threadId: t._id, from: 'system', text: 'This conversation was marked as solved. Send a message anytime if you need more help.' });
    t.status = 'resolved';
  }
  await t.save();
  return t;
}

// ---------------------------------------------------------------- customer
export const help = Router();
help.use(requireCustomer);
help.param('id', checkId);

// Per-customer limit so nobody can flood the inbox
const sent = new Map();
const tooMany = (id) => {
  const now = Date.now(), list = (sent.get(id) || []).filter((t) => now - t < 10 * 60e3);
  if (list.length >= 30) return true;
  list.push(now); sent.set(id, list); if (sent.size > 5000) sent.clear();
  return false;
};

help.get('/', ah(async (req, res) => {
  const t = await SupportThread.findOne({ customerId: req.customer._id });
  if (!t) return res.json({ thread: null, messages: [], topics: TOPICS });
  const msgs = await SupportMsg.find({ threadId: t._id }).sort({ createdAt: -1 }).limit(150).lean();
  if (t.unreadCustomer) await SupportThread.updateOne({ _id: t._id }, { unreadCustomer: 0 });
  res.json({ thread: threadOut(t), messages: msgs.reverse().map(msgOut), topics: TOPICS });
}));

help.get('/unread', ah(async (req, res) => {
  const t = await SupportThread.findOne({ customerId: req.customer._id }, 'unreadCustomer').lean();
  res.json({ n: t?.unreadCustomer || 0 });
}));

help.post('/messages', ah(async (req, res) => {
  const c = req.customer;
  if (tooMany(String(c._id))) throw new HttpError(429, 'You’ve sent a lot of messages. Please wait a few minutes.');
  const { text, pic } = readBody(req.body);
  const topic = TOPICS.includes(req.body?.topic) ? req.body.topic : '';
  // The order this is about (must be one of the customer's own)
  let order = null;
  const code = String(req.body?.orderCode || '').trim();
  if (code) {
    if (!/^[\w-]{8,20}$/.test(code)) throw new HttpError(400, 'That order couldn’t be found.');
    order = await Sale.findOne({ trackCode: code, customerId: c._id }, 'no trackCode').lean();
    if (!order) throw new HttpError(404, 'That order couldn’t be found in your account.');
  }
  let t = await SupportThread.findOne({ customerId: c._id });
  const fresh = !t || t.status === 'resolved';
  if (!t) t = new SupportThread({ customerId: c._id });
  t.name = c.name; t.phone = c.phone || '';
  if (fresh) { t.status = 'open'; t.topic = topic; t.orderNo = order?.no ?? null; t.orderCode = order?.trackCode || ''; }
  else { if (topic) t.topic = topic; if (order) { t.orderNo = order.no; t.orderCode = order.trackCode; } }
  t.lastAt = new Date(); t.lastText = preview(text, pic); t.lastFrom = 'customer'; t.unreadStaff = (t.unreadStaff || 0) + 1;
  await t.save();
  const m = await SupportMsg.create({ threadId: t._id, from: 'customer', text, orderNo: order?.no ?? null, orderCode: order?.trackCode || '',
    ...(pic ? { img: pic.data, imgType: pic.type } : {}) });
  const out = [msgOut(m)];
  if (fresh) out.push(msgOut(await SupportMsg.create({ threadId: t._id, from: 'system', text: WELCOME })));
  res.status(201).json({ thread: threadOut(t), messages: out });
}));

help.get('/img/:id', ah(async (req, res) => {
  const t = await SupportThread.findOne({ customerId: req.customer._id }, '_id').lean();
  const m = t && await SupportMsg.findOne({ _id: req.params.id, threadId: t._id }).select('+img imgType').lean();
  await sendImg(res, m);
}));

// ---------------------------------------------------------------- staff
export const support = Router();
support.param('id', checkId);

// Number on the Messages tab: conversations with a message staff haven't read
support.get('/count', ah(async (_req, res) => {
  res.json({ n: await SupportThread.countDocuments({ unreadStaff: { $gt: 0 } }) });
}));

support.get('/', ah(async (req, res) => {
  const st = ['open', 'resolved'].includes(req.query.status) ? { status: req.query.status } : {};
  const list = await SupportThread.find(st).sort({ lastAt: -1 }).limit(300).lean();
  const [open, unread] = await Promise.all([SupportThread.countDocuments({ status: 'open' }), SupportThread.countDocuments({ unreadStaff: { $gt: 0 } })]);
  res.json({ threads: list.map(threadOut), open, unread });
}));

support.get('/:id', ah(async (req, res) => {
  const t = await SupportThread.findById(req.params.id);
  if (!t) throw new HttpError(404, 'This conversation no longer exists.');
  const [msgs, orders] = await Promise.all([
    SupportMsg.find({ threadId: t._id }).sort({ createdAt: -1 }).limit(200).lean(),
    Sale.find({ customerId: t.customerId, source: 'online' }, 'no status total createdAt trackCode fulfil qrPay.method qrPay.ref qrPay.verified pay.method cancelReason cancelledAt paidOnline stampsUsed refund.at')
      .sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  if (t.unreadStaff) await SupportThread.updateOne({ _id: t._id }, { unreadStaff: 0 });
  res.json({
    thread: threadOut(t), messages: msgs.reverse().map(msgOut),
    orders: orders.map((o) => ({ _id: o._id, no: o.no, status: o.status, total: o.total, at: o.createdAt, code: o.trackCode || '', delivery: o.fulfil === 'delivery',
      method: o.qrPay?.method || o.pay?.method || '', cancelReason: o.cancelReason || '', paidOnline: !!o.paidOnline, freeDrink: o.stampsUsed > 0,
      qrRef: o.qrPay?.ref || '', qrUnchecked: !!o.qrPay?.method && !o.qrPay.verified,
      restorable: o.status === 'cancelled' && !o.refund?.at && !!o.cancelledAt && Date.now() - o.cancelledAt <= RESTORE_DAYS * 864e5 })),
  });
}));

support.post('/:id/reply', ah(async (req, res) => {
  const t = await SupportThread.findById(req.params.id);
  if (!t) throw new HttpError(404, 'This conversation no longer exists.');
  const { text, pic } = readBody(req.body);
  const m = await SupportMsg.create({ threadId: t._id, from: 'staff', staffName: req.user.name, text, ...(pic ? { img: pic.data, imgType: pic.type } : {}) });
  t.status = 'open'; t.lastAt = m.createdAt; t.lastText = preview(text, pic); t.lastFrom = 'staff';
  t.unreadCustomer = (t.unreadCustomer || 0) + 1; t.unreadStaff = 0;
  await t.save();
  res.status(201).json({ thread: threadOut(t), message: msgOut(m) });
}));

support.post('/:id/resolve', ah(async (req, res) => {
  const t = await SupportThread.findById(req.params.id);
  if (!t) throw new HttpError(404, 'This conversation no longer exists.');
  if (t.status !== 'resolved') {
    const m = await SupportMsg.create({ threadId: t._id, from: 'system', text: 'This conversation was marked as solved. Send a message anytime if you need more help.' });
    t.status = 'resolved'; t.unreadStaff = 0; t.lastAt = m.createdAt; t.unreadCustomer = (t.unreadCustomer || 0) + 1;
    await t.save();
  }
  res.json({ thread: threadOut(t) });
}));

support.get('/img/:id', ah(async (req, res) => {
  await sendImg(res, await SupportMsg.findById(req.params.id).select('+img imgType').lean());
}));
