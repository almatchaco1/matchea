import { requireAdmin } from '../middleware/auth.js';
import { Router } from 'express';
import Sale from '../models/Sale.js';
import Ingredient from '../models/Ingredient.js';
import StockMove from '../models/StockMove.js';
import DayClose from '../models/DayClose.js';
import Expense from '../models/Expense.js';
import Settings from '../models/Settings.js';
import { ah, shopTime, dayRange, isDay, HttpError } from '../lib/util.js';
import { createBackup } from '../lib/backup.js';
import { LIMITS, isObjectId } from '../../../src/shared/rules.mjs';

const r = Router();

// Sales summary for a date range: ?from=YYYY-MM-DD&to=YYYY-MM-DD
r.get('/summary', ah(async (req, res) => {
  const { from, to } = dayRange(req.query, shopTime().date, LIMITS.reportDays);
  // added up here rather than in the database, so it works the same on every MongoDB host
  const [sales, voids] = await Promise.all([
    Sale.find({ date: { $gte: from, $lte: to }, status: 'paid' }, 'date hour subtotal total vat discount.amount pay.method lines.name lines.qty lines.total fulfil deliveryFee delivery.fee delivery.cost delivery.free').lean(),
    Sale.countDocuments({ date: { $gte: from, $lte: to }, status: 'void' }),
  ]);
  const add = (a, b) => Math.round((a + (+b || 0)) * 100) / 100;
  const t = { gross: 0, net: 0, disc: 0, vat: 0 };
  const byDay = {}, pay = {}, items = {}, hours = Array(24).fill(0);
  const del = { orders: 0, fees: 0, cost: 0, free: 0 }; // delivery: fees customers paid, what Lalamove cost the shop
  for (const x of sales) {
    t.gross = add(t.gross, x.subtotal); t.net = add(t.net, x.total); t.disc = add(t.disc, x.discount?.amount); t.vat = add(t.vat, x.vat);
    const d = (byDay[x.date] ||= { date: x.date, net: 0, orders: 0 }); d.net = add(d.net, x.total); d.orders++;
    if (x.hour != null) hours[x.hour] = add(hours[x.hour], x.total);
    const m = x.pay?.method || 'cash'; const p = (pay[m] ||= { method: m, net: 0, orders: 0 }); p.net = add(p.net, x.total); p.orders++;
    if (x.fulfil === 'delivery') { del.orders++; del.fees = add(del.fees, x.deliveryFee); del.cost = add(del.cost, x.delivery?.cost ?? x.delivery?.fee); if (x.delivery?.free) del.free++; }
    for (const l of x.lines || []) { const it = (items[l.name] ||= { name: l.name, qty: 0, sales: 0 }); it.qty += l.qty || 0; it.sales = add(it.sales, l.total); }
  }
  const list = Object.values(items).sort((a, b) => b.qty - a.qty || b.sales - a.sales);
  res.json({
    from, to, ...t, orders: sales.length, voids,
    cups: list.reduce((a, i) => a + i.qty, 0),
    byDay: Object.values(byDay).sort((a, b) => (a.date < b.date ? -1 : 1)),
    hours,
    pay: Object.values(pay).sort((a, b) => b.net - a.net),
    items: list,
    delivery: del,
  });
}));

// Customer ratings (owner/admin only): ?days=30
r.get('/reviews', requireAdmin, ah(async (req, res) => {
  const days = Math.min(365, Math.max(1, Math.floor(+req.query.days || 30)));
  const since = new Date(Date.now() - days * 864e5);
  const list = await Sale.find({ 'rating.stars': { $gte: 1 }, 'rating.at': { $gte: since } }, 'no date customer lines rating').sort({ 'rating.at': -1 }).limit(500).lean();
  const dist = [0, 0, 0, 0, 0];
  const drinks = {};
  for (const s of list) {
    dist[s.rating.stars - 1]++;
    for (const n of new Set(s.lines.map((l) => l.name))) { const d = (drinks[n] ||= { name: n, count: 0, sum: 0 }); d.count++; d.sum += s.rating.stars; }
  }
  const avg = list.length ? Math.round((list.reduce((a, s) => a + s.rating.stars, 0) / list.length) * 10) / 10 : null;
  res.json({
    days, count: list.length, avg, dist,
    byDrink: Object.values(drinks).map((d) => ({ name: d.name, count: d.count, avg: Math.round((d.sum / d.count) * 10) / 10 })).sort((a, b) => b.count - a.count),
    recent: list.map((s) => ({ no: s.no, date: s.date, customer: String(s.customer || '').split(' ')[0], stars: s.rating.stars, comment: s.rating.comment || '', at: s.rating.at, items: s.lines.map((l) => `${l.qty}× ${l.name}`).join(', ') })),
  });
}));

const r2 = (n) => Math.round((+n || 0) * 100) / 100;
const hm = (d) => new Date(d).toLocaleTimeString('en-PH', { timeZone: process.env.SHOP_TZ || 'Asia/Manila', hour: 'numeric', minute: '2-digit' });

/** Stock moves (waste etc.) that happened on shop days from..to */
async function movesInDays(reason, from, to) {
  const lo = new Date(Date.parse(from) - 864e5), hi = new Date(Date.parse(to) + 2 * 864e5);
  const list = await StockMove.find({ reason, createdAt: { $gte: lo, $lt: hi } }).populate('ing', 'name unit cost').sort({ createdAt: -1 }).lean();
  return list.filter((m) => { const d = shopTime(m.createdAt).date; return d >= from && d <= to; });
}
const moveValue = (m) => (m.value != null ? Math.abs(m.value) : Math.abs(m.delta || 0) * (+m.ing?.cost || 0));

const costMap = async () => Object.fromEntries((await Ingredient.find({}, 'cost').lean()).map((i) => [String(i._id), +i.cost || 0]));
const saleCost = (x, cost) => (x.cost != null ? x.cost : (x.usage || []).reduce((a, u) => a + u.qty * (cost[String(u.ing)] || 0), 0));
/** Staff drinks: how many, their menu value, what they cost in ingredients, and per person */
function staffSummary(list, cost) {
  const by = {};
  for (const x of list) {
    const n = x.staffForName || x.customer || '—';
    const p = (by[n] ||= { name: n, drinks: 0, value: 0, cost: 0 });
    p.drinks += x.lines.reduce((a, l) => a + l.qty, 0); p.value += x.subtotal || 0; p.cost += saleCost(x, cost);
  }
  const people = Object.values(by).map((p) => ({ ...p, value: r2(p.value), cost: r2(p.cost) })).sort((a, b) => b.drinks - a.drinks);
  return { drinks: people.reduce((a, p) => a + p.drinks, 0), value: r2(people.reduce((a, p) => a + p.value, 0)), cost: r2(people.reduce((a, p) => a + p.cost, 0)), people };
}

// ---------- End-of-day closing: ?date=YYYY-MM-DD ----------
async function closing(date) {
  const [sales, close, waste, refundsSent] = await Promise.all([
    Sale.find({ date }, 'no source status createdAt cashierName customer lines subtotal discount total vat pay voidedBy voidReason voidedAt refundDue stampsUsed qrPay paidOnline staffForName cost usage fulfil deliveryFee delivery').sort({ createdAt: 1 }).lean(),
    DayClose.findOne({ date }).lean(),
    movesInDays('waste', date, date),
    Sale.find({ 'refund.date': date }, 'no refund').lean(),
  ]);
  const paid = sales.filter((x) => x.status === 'paid');
  const checked = new Set(close?.checked || []);
  const sum = (arr, f) => r2(arr.reduce((a, x) => a + (+f(x) || 0), 0));
  const methods = {};
  for (const x of paid) { const m = (methods[x.pay?.method || 'cash'] ||= { method: x.pay?.method || 'cash', orders: 0, net: 0 }); m.orders++; m.net = r2(m.net + x.total); }
  const disc = { pct: { count: 0, amount: 0 }, scpwd: { count: 0, amount: 0 }, reward: { count: 0, amount: 0 } };
  for (const x of paid) { const t = x.discount?.type; if (disc[t] && x.discount.amount > 0) { disc[t].count++; disc[t].amount = r2(disc[t].amount + x.discount.amount); } }
  const items = {};
  for (const x of paid) for (const l of x.lines) { const it = (items[l.name] ||= { name: l.name, qty: 0, sales: 0 }); it.qty += l.qty; it.sales = r2(it.sales + l.total); }
  const cashiers = {};
  for (const x of paid) { const n = x.source === 'online' ? 'Online orders' : x.cashierName || '—'; const c = (cashiers[n] ||= { name: n, orders: 0, net: 0 }); c.orders++; c.net = r2(c.net + x.total); }
  const cashExpected = methods.cash?.net || 0;
  return {
    date,
    net: sum(paid, (x) => x.total), gross: sum(paid, (x) => x.subtotal), vat: sum(paid, (x) => x.vat), orders: paid.length,
    cups: paid.reduce((a, x) => a + x.lines.reduce((b, l) => b + l.qty, 0), 0),
    counter: sum(paid.filter((x) => x.source !== 'online'), (x) => x.total), online: sum(paid.filter((x) => x.source === 'online'), (x) => x.total),
    first: paid[0] ? hm(paid[0].createdAt) : null, last: paid.length ? hm(paid[paid.length - 1].createdAt) : null,
    methods: Object.values(methods).sort((a, b) => b.net - a.net),
    cashExpected,
    refs: paid.filter((x) => x.pay?.method && x.pay.method !== 'cash').map((x) => ({ id: String(x._id), no: x.no, time: hm(x.createdAt), method: x.pay.method, total: x.total, ref: x.pay.ref || '', by: x.source === 'online' ? 'Online' : x.cashierName, checked: checked.has(String(x._id)) })),
    discounts: disc,
    voids: sales.filter((x) => x.status === 'void').map((x) => ({ no: x.no, time: hm(x.createdAt), total: x.total, by: x.voidedBy || '', reason: x.voidReason || '' })),
    cancelled: sales.filter((x) => x.status === 'cancelled').length,
    refundsDue: sales.filter((x) => x.refundDue).map((x) => ({ no: x.no, total: x.total, method: x.qrPay?.verified ? x.qrPay.method : 'paymongo', ref: x.qrPay?.ref || x.pay?.ref || '' })),
    refundsSent: refundsSent.map((x) => ({ no: x.no, amount: x.refund.amount, method: x.refund.method, ref: x.refund.ref || '', by: x.refund.by || '', time: hm(x.refund.at) })),
    unfinished: sales.filter((x) => ['new', 'preparing', 'ready'].includes(x.status)).length,
    top: Object.values(items).sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, 5),
    cashiers: Object.values(cashiers).sort((a, b) => b.net - a.net),
    delivery: { orders: paid.filter((x) => x.fulfil === 'delivery').length, fees: sum(paid, (x) => (x.fulfil === 'delivery' ? x.deliveryFee : 0)), cost: sum(paid, (x) => (x.fulfil === 'delivery' ? x.delivery?.cost ?? x.delivery?.fee : 0)) },
    waste: { count: waste.length, value: r2(waste.reduce((a, m) => a + moveValue(m), 0)) },
    staff: staffSummary(sales.filter((x) => x.status === 'staff'), await costMap()),
    closed: close?.closedAt ? { at: close.closedAt, by: close.closedBy, cashCounted: close.cashCounted, cashExpected: close.cashExpected, note: close.note, net: close.net, orders: close.orders } : null,
  };
}

r.get('/closing', ah(async (req, res) => {
  const date = req.query.date || shopTime().date;
  if (!isDay(date)) throw new HttpError(400, 'Dates must look like YYYY-MM-DD.');
  res.json(await closing(date));
}));

// Tick a GCash payment as checked against the phone
r.post('/closing/check', ah(async (req, res) => {
  const { date, id, checked } = req.body || {};
  if (!isDay(date)) throw new HttpError(400, 'Dates must look like YYYY-MM-DD.');
  if (!isObjectId(String(id || ''))) throw new HttpError(400, 'That id is not valid.');
  await DayClose.updateOne({ date }, checked === false ? { $pull: { checked: String(id) } } : { $addToSet: { checked: String(id) } }, { upsert: true });
  res.json({ ok: true });
}));

// Close the day: saves the totals and cash count, then makes a backup
r.post('/closing', ah(async (req, res) => {
  const b = req.body || {};
  const date = b.date || shopTime().date;
  if (!isDay(date)) throw new HttpError(400, 'Dates must look like YYYY-MM-DD.');
  if (date > shopTime().date) throw new HttpError(400, 'You can’t close a day that hasn’t happened yet.');
  let cash = null;
  if (b.cashCounted !== '' && b.cashCounted != null) {
    cash = Number(b.cashCounted);
    if (!Number.isFinite(cash) || cash < 0 || cash > 10000000) throw new HttpError(400, 'Enter the cash you counted, like 2500.', { cashCounted: 'Enter an amount like 2500.' });
    if (Math.round(cash * 100) !== cash * 100) throw new HttpError(400, 'Use at most 2 decimals.', { cashCounted: 'Use at most 2 decimals.' });
  }
  const note = String(b.note || '').trim();
  if (note.length > 300) throw new HttpError(400, 'The note can be at most 300 characters.', { note: 'At most 300 characters.' });
  const c = await closing(date);
  await DayClose.updateOne({ date }, { closedAt: new Date(), closedBy: req.user.name, cashCounted: cash, cashExpected: c.cashExpected, net: c.net, orders: c.orders, note }, { upsert: true });
  let backup = null;
  try { backup = (await createBackup('closing')).name; } catch (e) { console.error('Closing backup failed:', e.message); }
  res.json({ ...(await closing(date)), backup });
}));

// Today's sales so far, for the daily goal bar (any staff)
r.get('/today', ah(async (_req, res) => {
  const { date } = shopTime();
  const [sales, s] = await Promise.all([Sale.find({ date, status: 'paid' }, 'total').lean(), Settings.findOne({ key: 'shop' }, 'dailyGoal').lean()]);
  res.json({ date, net: r2(sales.reduce((a, x) => a + x.total, 0)), orders: sales.length, goal: s?.dailyGoal || 0 });
}));

// ---------- Profit per drink (owner): ?from&to ----------
r.get('/profit', requireAdmin, ah(async (req, res) => {
  const { from, to } = dayRange(req.query, shopTime().date, LIMITS.reportDays);
  const [sales, ings, waste, exps, staffSales] = await Promise.all([
    Sale.find({ date: { $gte: from, $lte: to }, status: 'paid' }, 'lines subtotal total vat discount usage cost').lean(),
    Ingredient.find({}, 'cost').lean(),
    movesInDays('waste', from, to),
    Expense.find({ date: { $gte: from, $lte: to } }, 'amount').lean(),
    Sale.find({ date: { $gte: from, $lte: to }, status: 'staff' }, 'lines subtotal usage cost staffForName customer').lean(),
  ]);
  const cost = Object.fromEntries(ings.map((i) => [String(i._id), +i.cost || 0]));
  const drinks = {};
  let estimated = 0, lineCount = 0;
  for (const x of sales) {
    const usageCost = (x.usage || []).reduce((a, u) => a + u.qty * (cost[String(u.ing)] || 0), 0);
    for (const l of x.lines) {
      lineCount++;
      let c = l.cost;
      if (c == null) { estimated++; c = x.subtotal > 0 ? usageCost * (l.total / x.subtotal) : 0; } // older orders: split today's cost by price
      const d = (drinks[l.name] ||= { name: l.name, qty: 0, sales: 0, cost: 0 });
      d.qty += l.qty; d.sales += l.total; d.cost += c;
    }
  }
  const list = Object.values(drinks).map((d) => ({ name: d.name, qty: d.qty, sales: r2(d.sales), cost: r2(d.cost), profit: r2(d.sales - d.cost), margin: d.sales > 0 ? Math.round(((d.sales - d.cost) / d.sales) * 1000) / 10 : 0, perCup: d.qty ? r2((d.sales - d.cost) / d.qty) : 0 }))
    .sort((a, b) => b.profit - a.profit);
  const gross = r2(sales.reduce((a, x) => a + x.subtotal, 0));
  const disc = r2(sales.reduce((a, x) => a + (x.discount?.amount || 0), 0));
  const vat = r2(sales.reduce((a, x) => a + (x.vat || 0), 0));
  const net = r2(sales.reduce((a, x) => a + x.total, 0));
  const ingCost = r2(list.reduce((a, d) => a + d.cost, 0));
  const wasteValue = r2(waste.reduce((a, m) => a + moveValue(m), 0));
  res.json({
    from, to, orders: sales.length, gross, disc, vat, net, ingCost, waste: wasteValue,
    staff: staffSummary(staffSales, cost),
    profit: r2(net - ingCost - wasteValue - staffSummary(staffSales, cost).cost), // no VAT: the shop isn't VAT-registered
    expenses: r2(exps.reduce((a, e) => a + e.amount, 0)),
    takeHome: r2(net - ingCost - wasteValue - staffSummary(staffSales, cost).cost - exps.reduce((a, e) => a + e.amount, 0)),
    drinks: list, estimated: lineCount ? Math.round((estimated / lineCount) * 100) : 0,
    missingCosts: ings.filter((i) => !(+i.cost > 0)).length,
  });
}));

// ---------- Busiest hours and days: ?from&to ----------
r.get('/busy', ah(async (req, res) => {
  const { from, to } = dayRange(req.query, shopTime().date, LIMITS.reportDays);
  const sales = await Sale.find({ date: { $gte: from, $lte: to }, status: 'paid' }, 'date hour total lines.qty').lean();
  const wdOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
  const days = Array(7).fill(0); // how many of each weekday are in the range
  for (let t = Date.parse(from); t <= Date.parse(to); t += 864e5) days[new Date(t).getUTCDay()]++;
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ orders: 0, net: 0, cups: 0 })));
  for (const x of sales) {
    if (x.hour == null) continue;
    const c = grid[wdOf(x.date)][x.hour];
    c.orders++; c.net += x.total; c.cups += x.lines.reduce((a, l) => a + (l.qty || 0), 0);
  }
  const cells = grid.map((row, wd) => row.map((c) => ({ orders: c.orders, avgOrders: days[wd] ? Math.round((c.orders / days[wd]) * 10) / 10 : 0, avgNet: days[wd] ? r2(c.net / days[wd]) : 0, cups: c.cups })));
  const weekdays = grid.map((row, wd) => { const o = row.reduce((a, c) => a + c.orders, 0), n = row.reduce((a, c) => a + c.net, 0); return { wd, days: days[wd], orders: o, avgOrders: days[wd] ? Math.round((o / days[wd]) * 10) / 10 : 0, avgNet: days[wd] ? r2(n / days[wd]) : 0 }; });
  const hours = Array.from({ length: 24 }, (_, h) => grid.reduce((a, row) => a + row[h].orders, 0));
  const top = [];
  cells.forEach((row, wd) => row.forEach((c, h) => { if (c.orders) top.push({ wd, h, avgOrders: c.avgOrders, orders: c.orders }); }));
  top.sort((a, b) => b.avgOrders - a.avgOrders || b.orders - a.orders);
  res.json({ from, to, orders: sales.length, cells, weekdays, hours, top: top.slice(0, 3) });
}));

export default r;
