// Owner: a clean one-month summary to print or save as PDF (browser print → "Save as PDF").
import { useState } from 'react';
import { api } from '../lib/api';
import { dayKey } from '../lib/format';
import { PAY_LABELS } from '../shared/pricing.mjs';
import Modal from './Modal';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const peso = (n) => '₱' + (+n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n) => '₱' + Math.round(+n || 0).toLocaleString('en-PH');
const monthLabel = (m) => new Date(m + '-01T12:00:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
const lastDay = (m) => { const [y, mo] = m.split('-').map(Number); return dayKey(new Date(y, mo, 0)); };
const shift = (m, n) => { const [y, mo] = m.split('-').map(Number); return dayKey(new Date(y, mo - 1 + n, 1)).slice(0, 7); };
const WDL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const hr = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

function change(now, before) {
  if (!before) return '';
  const p = Math.round(((now - before) / before) * 100);
  return `<span class="chg ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}% vs last month</span>`;
}

function dayChart(month, byDay) {
  const days = []; const end = lastDay(month);
  for (let d = new Date(month + '-01T12:00:00'); dayKey(d) <= end; d.setDate(d.getDate() + 1)) days.push(dayKey(d));
  const m = Object.fromEntries(byDay.map((x) => [x.date, x.net]));
  const vals = days.map((d) => m[d] || 0);
  const W = 700, H = 170, P = { l: 46, r: 6, t: 10, b: 22 };
  const max = Math.max(1, ...vals); const e = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / e) * e;
  const bw = (W - P.l - P.r) / days.length; const y = (v) => P.t + (H - P.t - P.b) * (1 - v / top);
  const fmt = (t) => (t >= 1000 ? `${(t / 1000).toLocaleString('en-PH', { maximumFractionDigits: 1 })}k` : Math.round(t));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Sales by day">`;
  [0, 0.5, 1].forEach((f) => { s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(top * f)}" y2="${y(top * f)}" stroke="#EBE0C9" ${f ? 'stroke-dasharray="3 3"' : ''}/><text x="${P.l - 6}" y="${y(top * f) + 3}" text-anchor="end">₱${fmt(top * f)}</text>`; });
  vals.forEach((v, i) => {
    const x = P.l + i * bw + bw * 0.18, w = bw * 0.64, h = Math.max(0, H - P.b - y(v));
    if (h > 0) s += `<rect x="${x}" y="${y(v)}" width="${w}" height="${h}" rx="2" fill="#324623"/>`;
    const dd = +days[i].slice(8);
    if (dd === 1 || dd % 5 === 0) s += `<text x="${x + w / 2}" y="${H - 7}" text-anchor="middle">${dd}</text>`;
  });
  return s + '</svg>';
}

function buildHtml({ month, shop, s, prev, p, b, ex }) {
  const avg = s.orders ? s.net / s.orders : 0;
  const best = [...(p?.drinks || [])].sort((a, z) => z.qty - a.qty).slice(0, 10);
  const wd = [...b.weekdays].filter((w) => w.days).sort((a, z) => z.avgNet - a.avgNet)[0];
  const rows = (arr) => arr.join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(shop)} · ${esc(monthLabel(month))}</title>
<style>
@page{size:A4;margin:14mm 13mm}
*{box-sizing:border-box}
body{margin:0;font:11px/1.45 "Figtree",-apple-system,"Segoe UI",Arial,sans-serif;color:#1E2418;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2{font-family:"Fraunces",Georgia,serif;margin:0;color:#324623}
h1{font-size:24px} h2{font-size:14px;margin:18px 0 8px;padding-bottom:4px;border-bottom:1.5px solid #324623}
.head{display:flex;align-items:center;gap:14px;padding-bottom:12px;border-bottom:3px solid #324623}
.head img{width:110px;height:auto}
.head .sub{color:#505749;font-size:12px}
.head .gen{margin-left:auto;text-align:right;color:#505749;font-size:10px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.kpi{border:1px solid #E8DFCE;border-radius:10px;padding:9px 11px;background:#FFFBF7}
.kpi span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.07em;color:#505749;font-weight:700}
.kpi b{display:block;font-family:"Fraunces",Georgia,serif;font-size:19px;margin-top:2px}
.kpi.hi{background:#324623;border-color:#324623;color:#fff}.kpi.hi span{color:#DAE4C9}
.chg{font-size:9.5px;font-weight:700}.chg.up{color:#3C542C}.chg.down{color:#A8322A}
.kpi.hi .chg.up,.kpi.hi .chg.down{color:#DAE4C9}
svg text{font-size:9px;fill:#505749}
table{width:100%;border-collapse:collapse}
th{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#505749;text-align:left;padding:5px 6px;border-bottom:1px solid #E8DFCE}
td{padding:5px 6px;border-bottom:1px solid #F2EBDE}
.r{text-align:right}.num{font-variant-numeric:tabular-nums}
tr.tot td{font-weight:700;border-top:1.5px solid #324623;border-bottom:0}
tr.sub td{color:#505749}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.note{color:#505749;font-size:9.5px;margin-top:6px}
.keep{break-inside:avoid}
.foot{margin-top:18px;padding-top:8px;border-top:1px solid #E8DFCE;color:#505749;font-size:9px;display:flex;justify-content:space-between}
</style></head><body>
<div class="head"><img src="/brand/matchea-print.png" alt=""><div><h1>${esc(shop)}</h1><div class="sub">Monthly report · <b>${esc(monthLabel(month))}</b></div></div>
<div class="gen">Made ${esc(new Date().toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</div></div>

<div class="kpis">
 <div class="kpi"><span>Net sales</span><b>${peso(s.net)}</b>${change(s.net, prev?.net)}</div>
 <div class="kpi"><span>Orders</span><b>${s.orders.toLocaleString('en-PH')}</b>${change(s.orders, prev?.orders)}</div>
 <div class="kpi"><span>Average order</span><b>${peso(avg)}</b></div>
 <div class="kpi"><span>Drinks &amp; items sold</span><b>${s.cups.toLocaleString('en-PH')}</b></div>
 <div class="kpi"><span>Discounts given</span><b>${peso(s.disc)}</b></div>
 <div class="kpi hi"><span>Take-home profit</span><b>${p ? peso(p.takeHome) : '—'}</b>${p && s.net ? `<span class="chg up" style="text-transform:none;letter-spacing:0">${Math.round((p.takeHome / s.net) * 100)}% of sales</span>` : ''}</div>
</div>

<h2>Sales by day</h2>
${s.orders ? dayChart(month, s.byDay) : '<p class="note">No sales this month.</p>'}

<div class="two">
 <div class="keep"><h2>Profit</h2><table>
  <tr><td>Net sales</td><td class="r num">${peso(p?.net ?? s.net)}</td></tr>
  <tr class="sub"><td>− Ingredients</td><td class="r num">${peso(p?.ingCost)}</td></tr>
  <tr class="sub"><td>− Waste</td><td class="r num">${peso(p?.waste)}</td></tr>
  <tr class="sub"><td>− Staff drinks${p?.staff?.drinks ? ` (${p.staff.drinks})` : ''}</td><td class="r num">${peso(p?.staff?.cost)}</td></tr>
  <tr><td><b>Gross profit</b></td><td class="r num"><b>${peso(p?.profit)}</b></td></tr>
  <tr class="sub"><td>− Expenses</td><td class="r num">${peso(p?.expenses)}</td></tr>
  <tr class="tot"><td>Take-home profit</td><td class="r num">${peso(p?.takeHome)}</td></tr>
 </table>${p?.missingCosts ? `<p class="note">${p.missingCosts} ingredient(s) have no cost yet, so profit is higher than it really is.</p>` : ''}</div>
 <div class="keep"><h2>Expenses</h2>${ex.byCat.length ? `<table>${rows(ex.byCat.map((c) => `<tr><td>${esc(c.cat)}</td><td class="r num">${peso(c.amount)}</td></tr>`))}<tr class="tot"><td>Total</td><td class="r num">${peso(ex.total)}</td></tr></table>` : '<p class="note">No expenses added for this month.</p>'}</div>
</div>

<div class="keep"><h2>Best sellers</h2>${best.length ? `<table><tr><th>#</th><th>Drink</th><th class="r">Sold</th><th class="r">Sales</th><th class="r">Profit</th><th class="r">Margin</th></tr>
${rows(best.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td class="r num">${x.qty}</td><td class="r num">${peso(x.sales)}</td><td class="r num">${peso(x.profit)}</td><td class="r num">${x.margin}%</td></tr>`))}</table>` : '<p class="note">No sales this month.</p>'}</div>

<div class="two">
 <div class="keep"><h2>Payments</h2>${s.pay.length ? `<table>${rows(s.pay.map((x) => `<tr><td>${esc(PAY_LABELS[x.method] || x.method)}</td><td class="r num">${x.orders} orders</td><td class="r num">${peso(x.net)}</td></tr>`))}</table>` : '<p class="note">—</p>'}</div>
 <div class="keep"><h2>Busiest times</h2>${b.top.length ? `<table>${rows(b.top.map((t, i) => `<tr><td>${i + 1}</td><td>${WDL[t.wd]} ${hr(t.h)}–${hr(t.h + 1)}</td><td class="r num">~${t.avgOrders} orders</td></tr>`))}</table>${wd ? `<p class="note">Best day: <b>${WDL[wd.wd]}</b>, about ${whole(wd.avgNet)} in sales.</p>` : ''}` : '<p class="note">—</p>'}</div>
</div>

<div class="foot"><span>${esc(shop)} · ${esc(monthLabel(month))}</span><span>${s.voids ? `${s.voids} voided order(s) not counted` : ''}</span></div>
</body></html>`;
}

function printHtml(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument; doc.open(); doc.write(html); doc.close();
  const go = () => { const w = frame.contentWindow; const clean = () => setTimeout(() => frame.remove(), 500); w.addEventListener('afterprint', clean, { once: true }); w.focus(); w.print(); setTimeout(clean, 60000); };
  const imgs = [...doc.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))).filter(Boolean);
  Promise.race([Promise.all(imgs), new Promise((r) => setTimeout(r, 2500))]).then(() => setTimeout(go, 80));
}

export default function MonthlyReport({ settings, toast, onClose }) {
  const thisMonth = dayKey().slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => shift(thisMonth, -i));
  const [month, setMonth] = useState(new Date().getDate() <= 5 ? shift(thisMonth, -1) : thisMonth);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const from = `${month}-01`, to = month === thisMonth ? dayKey() : lastDay(month);
      const pm = shift(month, -1);
      const [s, prev, p, b, ex] = await Promise.all([
        api.get(`/reports/summary?from=${from}&to=${to}`),
        api.get(`/reports/summary?from=${pm}-01&to=${lastDay(pm)}`).catch(() => null),
        api.get(`/reports/profit?from=${from}&to=${to}`).catch(() => null),
        api.get(`/reports/busy?from=${from}&to=${to}`),
        api.get(`/expenses?from=${from}&to=${to}`).catch(() => ({ byCat: [], total: 0 })),
      ]);
      printHtml(buildHtml({ month, shop: settings?.name || 'Matchéa', s, prev, p, b, ex }));
      toast('In the print window, choose “Save as PDF” to keep a copy.');
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Monthly report" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={make} disabled={busy}>{busy ? 'Preparing…' : 'Make PDF'}</button></>}>
      <label className="field"><span>Month</span>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rp-select" style={{ width: '100%' }}>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}{m === thisMonth ? ' (so far)' : ''}</option>)}
        </select></label>
      <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>One page with sales, a daily chart, profit after ingredients, waste and expenses, best sellers, payments and your busiest times. A print window opens: choose <b>Save as PDF</b> to keep it, or print it.</p>
    </Modal>
  );
}

export { buildHtml };
