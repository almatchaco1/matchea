import { useCallback, useEffect, useState } from 'react';
import { CountUp } from '../shop/fx';
import { api } from '../lib/api';
import { peso, pad, dayKey, timeOf } from '../lib/format';
import { PAY_LABELS as PAY_METHODS } from '../shared/pricing.mjs';
import { ConfirmButton } from './Modal';
import ReceiptModal from './Receipt';
import Backups from './Backups';
import Reviews from './Reviews';
import Closing from './Closing';
import Profit from './Profit';
import Busy from './Busy';
import Expenses from './Expenses';
import RecycleBin from './RecycleBin';
import MonthlyReport from './MonthlyReport';
import { AdminBtn, LockIcon } from './Locked';
import AdminPin from './AdminPin';
import { saveXlsx } from '../lib/xlsx';
import { imageOf } from '../lib/drinkImages';

const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['custom', 'Custom…']];
const VIEWS = [['overview', 'Overview'], ['closing', 'Closing'], ['profit', 'Profit', 'admin'], ['expenses', 'Expenses', 'admin'], ['busy', 'Busy times'], ['reviews', 'Reviews', 'admin'], ['backups', 'Backups', 'admin'], ['bin', 'Recycle bin', 'admin']];

function rangeOf(key, custom) {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return dayKey(x); };
  const now = new Date();
  if (key === 'today') return [d(0), d(0)];
  if (key === 'yesterday') return [d(1), d(1)];
  if (key === '7') return [d(6), d(0)];
  if (key === '30') return [d(29), d(0)];
  if (key === 'month') return [dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), d(0)];
  if (key === 'lastmonth') return [dayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)), dayKey(new Date(now.getFullYear(), now.getMonth(), 0))];
  return custom;
}
const daysBetween = (from, to) => { const out = []; for (let t = new Date(from + 'T12:00:00'); dayKey(t) <= to; t.setDate(t.getDate() + 1)) out.push(dayKey(t)); return out; };
const label = (from, to) => { const f = (x) => new Date(x + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }); return from === to ? f(from) : `${f(from)} – ${f(to)}`; };

export default function Reports({ data, toast, isAdmin, refresh, goInventory }) {
  const [view, setView] = useState(() => { try { return localStorage.getItem('matchaPos.reportView') || 'overview'; } catch { return 'overview'; } });
  const [range, setRange] = useState('today');
  const [custom, setCustom] = useState(() => [dayKey(), dayKey()]);
  const [sum, setSum] = useState(null);
  const [prev, setPrev] = useState(null); // the same length of time just before, for the "vs" chips
  const [orders, setOrders] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [xl, setXl] = useState(false);
  const [monthly, setMonthly] = useState(false);
  const [from, to] = rangeOf(range, custom);
  const days = daysBetween(from, to);
  const go = (v) => { setView(v); try { localStorage.setItem('matchaPos.reportView', v); } catch {} };
  const shown = VIEWS.filter(([, , who]) => !who || isAdmin); // the views this person can open
  const cur = shown.some(([k]) => k === view) ? view : 'overview';

  const load = useCallback(async () => {
    if (from > to) return;
    try {
      const n = daysBetween(from, to).length;
      const shift = (k, by) => { const t = new Date(k + 'T12:00:00'); t.setDate(t.getDate() - by); return dayKey(t); };
      const [s, o, pv] = await Promise.all([api.get(`/reports/summary?from=${from}&to=${to}`), api.get(`/sales?from=${from}&to=${to}`), api.get(`/reports/summary?from=${shift(from, n)}&to=${shift(to, n)}`).catch(() => null)]);
      setSum(s); setPrev(pv); setOrders(o.filter((x) => ['paid', 'void', 'staff'].includes(x.status))); // open/cancelled online orders live in the Online tab
    } catch (e) { toast(e.message); }
  }, [from, to, toast]);
  useEffect(() => { if (cur !== 'overview') return; load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load, cur]);

  const [voidAsk, setVoidAsk] = useState(null); // cashier's void waiting for an admin PIN
  const voidSale = async (o, override) => {
    try { await api.post(`/sales/${o._id}/void`, override ? { override } : {}); toast(`Order #${pad(o.no)} voided; stock restored`); load(); refresh(); }
    catch (e) { if (e.fields?.override === 'void') setVoidAsk(o); else toast(e.message); }
  };

  // Excel: summary, orders, drinks (with profit for the owner), payments, days/hours
  const exportXlsx = async () => {
    setXl(true);
    try {
      const [s, o, p, b] = await Promise.all([
        api.get(`/reports/summary?from=${from}&to=${to}`), api.get(`/sales?from=${from}&to=${to}`),
        isAdmin ? api.get(`/reports/profit?from=${from}&to=${to}`) : null, api.get(`/reports/busy?from=${from}&to=${to}`),
      ]);
      const list = o.filter((x) => ['paid', 'void', 'staff'].includes(x.status)).reverse();
      const title = `${data.settings?.name || 'Matchéa'} · ${label(from, to)}`;
      const sheets = [
        { name: 'Summary', title, columns: [{ header: 'What', width: 30 }, { header: 'Amount', type: 'peso', width: 16 }], rows: [
          ['Net sales', s.net], ['Orders', { v: s.orders }], ['Average order', s.orders ? s.net / s.orders : 0], ['Discounts given', s.disc],
          ...(p ? [['Ingredient cost', p.ingCost], ['Gross profit (before rent, salaries, bills)', p.profit]] : []),
        ].map(([a, v]) => [a, typeof v === 'object' ? String(v.v) : v]) },
        { name: 'Orders', title, columns: [{ header: 'Order', type: 'int', width: 8 }, { header: 'Date', type: 'date', width: 12 }, { header: 'Time', width: 10 }, { header: 'Status', width: 8 }, { header: 'From', width: 9 }, { header: 'Cashier', width: 14 }, { header: 'Customer', width: 16 }, { header: 'Items', width: 50 }, { header: 'Subtotal', type: 'peso', width: 12 }, { header: 'Discount', type: 'peso', width: 11 }, { header: 'Total', type: 'peso', width: 12 }, { header: 'Paid by', width: 10 }, { header: 'Reference', width: 16 }],
          rows: list.map((x) => [x.no, x.date, timeOf(x.createdAt), x.status === 'void' ? 'Void' : x.status === 'staff' ? 'Staff drink' : 'Paid', x.source === 'online' ? 'Online' : 'Counter', x.cashierName || '', x.customer || '', x.lines.map((l) => `${l.qty}× ${l.name}${l.mods ? ` (${l.mods})` : ''}`).join('; '), x.subtotal, x.discount?.amount || 0, x.total, PAY_METHODS[x.pay.method] || x.pay.method, x.pay.ref || '']),
          totals: ['', '', '', '', '', '', '', 'Total (paid orders)', list.filter((x) => x.status === 'paid').reduce((a, x) => a + x.subtotal, 0), list.filter((x) => x.status === 'paid').reduce((a, x) => a + (x.discount?.amount || 0), 0), s.net, '', ''] },
        p ? { name: 'Drinks & profit', title, columns: [{ header: 'Drink', width: 30 }, { header: 'Sold', type: 'int', width: 8 }, { header: 'Sales', type: 'peso', width: 13 }, { header: 'Ingredient cost', type: 'peso', width: 15 }, { header: 'Profit', type: 'peso', width: 13 }, { header: 'Margin', type: 'pct', width: 9 }, { header: 'Profit per cup', type: 'peso', width: 14 }],
          rows: p.drinks.map((x) => [x.name, x.qty, x.sales, x.cost, x.profit, x.margin, x.perCup]),
          totals: ['Total', p.drinks.reduce((a, x) => a + x.qty, 0), p.drinks.reduce((a, x) => a + x.sales, 0), p.ingCost, p.drinks.reduce((a, x) => a + x.profit, 0), '', ''] }
          : { name: 'Drinks', title, columns: [{ header: 'Drink', width: 30 }, { header: 'Sold', type: 'int', width: 8 }, { header: 'Sales', type: 'peso', width: 13 }], rows: s.items.map((x) => [x.name, x.qty, x.sales]) },
        { name: 'Payments', title, columns: [{ header: 'Paid by', width: 16 }, { header: 'Orders', type: 'int', width: 9 }, { header: 'Amount', type: 'peso', width: 14 }], rows: s.pay.map((x) => [PAY_METHODS[x.method] || x.method, x.orders, x.net]), totals: ['Total', s.orders, s.net] },
        { name: 'By day', title, columns: [{ header: 'Date', type: 'date', width: 12 }, { header: 'Day', width: 10 }, { header: 'Orders', type: 'int', width: 9 }, { header: 'Net sales', type: 'peso', width: 14 }],
          rows: days.map((dd) => { const x = s.byDay.find((y) => y.date === dd); return [dd, new Date(dd + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short' }), x?.orders || 0, x?.net || 0]; }), totals: ['Total', '', s.orders, s.net] },
        { name: 'By hour', title, columns: [{ header: 'Hour', width: 12 }, { header: 'Orders', type: 'int', width: 9 }, { header: 'Net sales', type: 'peso', width: 14 }],
          rows: s.hours.map((n, h) => [`${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`, b.hours[h], n]).filter((r) => r[1] || r[2]) },
      ];
      saveXlsx(`matchea-report-${from}${from !== to ? '-to-' + to : ''}.xlsx`, sheets);
    } catch (e) { toast(e.message); }
    finally { setXl(false); }
  };

  const single = days.length === 1;
  const a = sum || { net: 0, orders: 0, voids: 0, cups: 0, disc: 0, vat: 0, items: [], pay: [], hours: Array(24).fill(0), byDay: [] };
  const maxQ = Math.max(1, ...a.items.map((i) => i.qty));
  const needsRange = ['overview', 'profit', 'busy'].includes(cur);

  const rangeBar = needsRange && (
    <div className="rp-range">
      <select className="rp-select" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Period">
        {RANGES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
      </select>
      {range === 'custom' ? (
        <span className="rp-custom">
          <input type="date" value={custom[0]} max={dayKey()} onChange={(e) => e.target.value && setCustom([e.target.value, e.target.value > custom[1] ? e.target.value : custom[1]])} aria-label="From" />
          <span className="muted">to</span>
          <input type="date" value={custom[1]} max={dayKey()} min={custom[0]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="To" />
        </span>
      ) : <span className="muted rp-label">{label(from, to)}</span>}
      {cur === 'overview' && <button className="btn" style={{ marginLeft: 'auto' }} onClick={exportXlsx} disabled={xl}>{xl ? 'Preparing…' : 'Download Excel'}</button>}
    </div>
  );

  return (
    <>
      <div className="toolbar rp-head">
        <h2 className="sec grow">Reports</h2>
        <AdminBtn allowed={isAdmin} className="btn" onClick={() => setMonthly(true)}>Monthly report (PDF)</AdminBtn>
        <nav className="rp-tabs" role="tablist" aria-label="Report">
          {VIEWS.map(([k, n, who]) => (who && !isAdmin
            ? <button key={k} role="tab" aria-selected="false" className="locked" disabled title="Admins only"><LockIcon />{n}</button>
            : <button key={k} role="tab" aria-selected={cur === k} onClick={() => go(k)}>{n}</button>))}
        </nav>
      </div>
      {rangeBar}
      {cur === 'closing' && <Closing settings={data.settings} toast={toast} goInventory={goInventory} isAdmin={isAdmin} />}
      {cur === 'profit' && <Profit from={from} to={to} toast={toast} goInventory={goInventory} goExpenses={() => go('expenses')} />}
      {cur === 'expenses' && <Expenses toast={toast} />}
      {cur === 'busy' && <Busy from={from} to={to} toast={toast} />}
      {cur === 'reviews' && <Reviews toast={toast} />}
      {cur === 'backups' && <Backups toast={toast} />}
      {cur === 'bin' && <RecycleBin toast={toast} refresh={refresh} />}
      {cur === 'overview' && Overview()}
      {receipt && <ReceiptModal sale={receipt} settings={data.settings} onClose={() => setReceipt(null)} />}
      {voidAsk && <AdminPin action="void" detail={`Order #${pad(voidAsk.no)}`} onClose={() => setVoidAsk(null)} onApproved={(tok, by) => { const o = voidAsk; setVoidAsk(null); toast(`Approved by ${by}`); voidSale(o, tok); }} />}
      {monthly && <MonthlyReport settings={data.settings} toast={toast} onClose={() => setMonthly(false)} />}
    </>
  );

  function Overview() {
    const n = days.length;
    const pa = prev || null;
    const vsWord = n === 1 ? (range === 'today' ? 'yesterday' : 'the day before') : `the ${n} days before`;
    const delta = (now, before) => {
      if (!pa || before == null) return null;
      if (!before) return now ? { up: true, txt: 'new' } : null;
      const d = Math.round(((now - before) / before) * 100);
      if (now / before >= 3) return { up: true, txt: `${(now / before).toLocaleString('en-PH', { maximumFractionDigits: 1 })}×` }; // big jumps read better as "4.2×"
      return { up: d >= 0, txt: `${d >= 0 ? '+' : '−'}${Math.abs(d)}%` };
    };
    const Chip = ({ d, long }) => (d ? <span className={`rp10-chip ${d.up ? 'up' : 'down'}`} title={`Compared with ${vsWord}`}><svg viewBox="0 0 12 12" aria-hidden="true"><path d={d.up ? 'M6 2.5 10 8H2Z' : 'M6 9.5 2 4h8Z'} /></svg>{d.txt}{long && <em> vs {vsWord}</em>}</span> : null);
    const avg = a.orders ? a.net / a.orders : 0;
    const pAvg = pa && pa.orders ? pa.net / pa.orders : 0;
    const photo = (name) => { const p = data.products?.find((x) => x.name === name); return p ? imageOf(p) : ''; };
    const payTotal = a.pay.reduce((t, p) => t + p.net, 0);
    const peakH = a.hours.reduce((b, v, h) => (v > a.hours[b] ? h : b), 0);
    const hourName = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
    return (
      <>
      <div className="rp10-kpis">
        <div className="rp10-hero">
          <small>Net sales · {label(from, to)}</small>
          <b className="num"><CountUp value={a.net} format={peso} /></b>
          <Chip d={delta(a.net, pa?.net)} long />
          {single && a.orders > 0 && <span className="rp10-peak">Busiest hour: <b>{hourName(peakH)}</b> · {peso(a.hours[peakH])}</span>}
        </div>
        <div className="rp10-kpi"><small>Orders</small><b className="num"><CountUp value={a.orders} format={Math.round} /></b>{a.voids > 0 ? <span className="rp10-void">{a.voids} void</span> : null}<Chip d={delta(a.orders, pa?.orders)} /></div>
        <div className="rp10-kpi"><small>Average order</small><b className="num"><CountUp value={avg} format={peso} /></b><Chip d={delta(avg, pa ? pAvg : null)} /></div>
        <div className="rp10-kpi"><small>Drinks & items sold</small><b className="num"><CountUp value={a.cups} format={Math.round} /></b><Chip d={delta(a.cups, pa?.cups)} /></div>
        <div className="rp10-kpi"><small>Discounts given</small><b className="num"><CountUp value={a.disc} format={peso} /></b><span className="rp10-sub">{a.net + a.disc > 0 ? `${Math.round((a.disc / (a.net + a.disc)) * 100)}% of sales` : 'none'}</span></div>
      </div>

      <div className="rp10-row">
        <div className="panel rp10-card rp10-chart">
          <div className="card-h"><h3>{single ? 'Sales by hour' : 'Sales by day'}</h3><span className="muted">{a.orders ? `${peso(a.net)} total` : ''}</span></div>
          <div className="card-b">{a.orders ? <BarChart key={`${single}-${days.length}`} single={single} a={a} days={days} /> : <div className="rp10-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 40h32M12 34V22M20 34V14M28 34V26M36 34V18" /></svg><b>{sum ? 'No sales in this period' : 'Loading…'}</b><span>{sum ? 'Bars appear here as orders come in.' : ''}</span></div>}</div>
        </div>
        <div className="panel rp10-card">
          <div className="card-h"><h3>Best sellers</h3><span className="muted" style={{ fontSize: 12 }}>{a.items.length ? 'cups · sales' : ''}</span></div>
          <div className="card-b">
            {a.items.length ? <ol className="rp10-best">{a.items.slice(0, 6).map((it, k) => (
              <li key={it.name}>
                <span className={`rp10-rank r${k + 1}`}>{k + 1}</span>
                {photo(it.name) ? <img src={photo(it.name)} alt="" /> : <i className="rp10-noimg" />}
                <span className="rp10-bt"><b>{it.name}</b><span className="rp10-bar"><i style={{ width: (it.qty / maxQ) * 100 + '%' }} /></span></span>
                <span className="rp10-bn num"><b>{it.qty}</b><small>{peso(it.sales)}</small></span>
              </li>))}</ol> : <div className="rp10-empty small"><b>No sales yet</b><span>Your top drinks show here.</span></div>}
          </div>
        </div>
      </div>

      <div className="rp10-row">
        <div className="panel rp10-card">
          <div className="card-h"><h3>Orders</h3><span className="muted" style={{ fontSize: 12 }}>{orders.length ? `${orders.length} · tap one for its receipt` : ''}</span></div>
          <div className="tbl-wrap rp10-orders">
            {!orders.length ? <div className="rp10-empty small"><b>No orders in this period</b></div> : (
              <table>
                <thead><tr><th>#</th><th>Time</th><th>Items</th><th>Paid by</th><th className="r">Total</th><th /></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id} className={o.status === 'void' ? 'void' : ''} onClick={() => setReceipt(o)} style={{ cursor: 'pointer' }}>
                      <td className="num"><b>{pad(o.no)}</b></td>
                      <td className="num">{single ? '' : o.date.slice(5) + ' '}{timeOf(o.createdAt)}</td>
                      <td className="rp10-items">{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</td>
                      <td><span className={`rp10-pay m-${o.pay.method}`}>{PAY_METHODS[o.pay.method]}</span></td>
                      <td className="r num"><b>{peso(o.total)}</b></td>
                      <td className="r">{o.status === 'staff' && <span className="pill warn" style={{ marginRight: 4 }}>Staff</span>}{o.status === 'void' ? <span className="pill mute">Void</span>
                        : <ConfirmButton className="btn sm ghost" confirmText={isAdmin ? 'Confirm void' : 'Void · ask admin'} onConfirm={() => voidSale(o)}>Void</ConfirmButton>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel rp10-card">
          <div className="card-h"><h3>Payments</h3></div>
          <div className="card-b">
            {a.pay.length && payTotal > 0 ? (<>
              <div className="rp10-split" role="img" aria-label={a.pay.map((p) => `${PAY_METHODS[p.method] || p.method} ${Math.round((p.net / payTotal) * 100)}%`).join(', ')}>
                {a.pay.map((p) => <i key={p.method} className={`m-${p.method}`} style={{ flexGrow: p.net }} />)}
              </div>
              <ul className="rp10-legend">
                {a.pay.map((p) => (
                  <li key={p.method}><i className={`m-${p.method}`} /><span>{PAY_METHODS[p.method] || p.method}</span><b className="num">{peso(p.net)}</b><small>{Math.round((p.net / payTotal) * 100)}% · {p.orders} {p.orders === 1 ? 'order' : 'orders'}</small></li>
                ))}
              </ul>
            </>) : <div className="rp10-empty small"><b>No payments yet</b></div>}
          </div>
        </div>
      </div>
      </>
    );
  }
}

function BarChart({ single, a, days }) {
  const [hov, setHov] = useState(null);
  let series, labels, full;
  if (single) {
    const active = a.hours.map((v, h) => (v > 0 ? h : null)).filter((h) => h != null);
    const lo = Math.min(7, ...active), hi = Math.max(21, ...active);
    series = a.hours.slice(lo, hi + 1);
    labels = series.map((_, i) => { const h = lo + i; return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); });
    full = series.map((_, i) => { const h = lo + i; return `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`; });
  } else {
    const m = Object.fromEntries(a.byDay.map((d) => [d.date, d.net]));
    series = days.map((d) => m[d] || 0);
    labels = days.map((d) => { const [, mm, dd] = d.split('-'); return `${+mm}/${+dd}`; });
    full = days.map((d) => new Date(d + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }));
  }
  const W = 640, H = 230, P = { l: 44, r: 8, t: 26, b: 26 };
  const maxV = Math.max(1, ...series);
  const e = Math.pow(10, Math.floor(Math.log10(maxV)));
  const top = Math.ceil(maxV / e) * e;
  const bw = (W - P.l - P.r) / series.length;
  const y = (v) => P.t + (H - P.t - P.b) * (1 - v / top);
  const every = Math.ceil(series.length / 12);
  const peak = series.indexOf(Math.max(...series));
  const fmt = (t) => (t >= 1000 ? (t / 1000).toLocaleString('en-PH', { maximumFractionDigits: 1 }) + 'k' : Math.round(t));
  const barW = Math.min(36, bw * 0.62);
  return (
    <div className="rp10-plot" onMouseLeave={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={single ? 'Sales by hour' : 'Sales by day'}>
        <defs><linearGradient id="rp10g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--rp-bar-top,#5E9A3A)" /><stop offset="1" stopColor="var(--rp-bar-bot,#2E5A1E)" /></linearGradient></defs>
        {[0, 0.5, 1].map((f) => (
          <g key={f} className="rp10-grid">
            <line x1={P.l} x2={W - P.r} y1={y(top * f)} y2={y(top * f)} strokeDasharray={f ? '3 4' : undefined} />
            <text x={P.l - 8} y={y(top * f) + 3} textAnchor="end">{fmt(top * f)}</text>
          </g>
        ))}
        {series.map((v, i) => {
          const x = P.l + i * bw + (bw - barW) / 2, hgt = Math.max(0, (H - P.b) - y(v));
          return (
            <g key={i} onMouseEnter={() => setHov(i)} className={hov === i ? 'on' : hov != null ? 'dim' : ''}>
              <rect className="rp10-hit" x={P.l + i * bw} y={P.t} width={bw} height={H - P.b - P.t} fill="transparent" />
              {v > 0 && <path className="rp-bar rp10-b" style={{ '--d': `${i * 25}ms` }} fill="url(#rp10g)"
                d={`M${x},${H - P.b} V${H - P.b - hgt + Math.min(4, hgt)} q0,-${Math.min(4, hgt)} ${Math.min(4, hgt)},-${Math.min(4, hgt)} H${x + barW - Math.min(4, hgt)} q${Math.min(4, hgt)},0 ${Math.min(4, hgt)},${Math.min(4, hgt)} V${H - P.b} Z`} />}
              {i === peak && v > 0 && hov == null && <text className="rp10-peaklbl" x={x + barW / 2} y={y(v) - 7} textAnchor="middle">{fmt(v)}</text>}
              {i % every === 0 && <text className="rp10-x" x={P.l + i * bw + bw / 2} y={H - 8} textAnchor="middle">{labels[i]}</text>}
            </g>
          );
        })}
      </svg>
      {hov != null && (
        <div className="rp10-tip" style={{ left: `${((P.l + hov * bw + bw / 2) / W) * 100}%`, top: `${(Math.max(P.t, y(series[hov])) / H) * 100}%` }}>
          <small>{full[hov]}</small><b className="num">{peso(series[hov])}</b>
        </div>
      )}
    </div>
  );
}
