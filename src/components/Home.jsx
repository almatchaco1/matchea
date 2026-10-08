// POS "Today": the first screen. How the day is going, and everything that needs someone right now.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso, qfmt, ingStatus, needsRestock } from '../lib/format';
import { PAY_LABELS } from '../shared/pricing.mjs';
import '../home.css';

const Ico = ({ d }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const P = {
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4',
  cup: 'M6 8h12l-1.3 11.2A2 2 0 0 1 14.7 21H9.3a2 2 0 0 1-2-1.8L6 8Zm-1 0h14M9 8l1-4h4l1 4',
  chat: 'M12 21a9 9 0 1 0-8-4.9L3 21l4.9-1A9 9 0 0 0 12 21Z',
  refund: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8',
  check: 'M5 12.5 10 17 19 7',
  arrow: 'M9 5l7 7-7 7',
  up: 'M7 14l5-5 5 5',
  down: 'M7 10l5 5 5-5',
  register: 'M4 7h16v12H4zM8 3h8v4H8zM8 12h2M12 12h2M16 12h0M8 15h2M12 15h2',
};
const ymd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

export default function Home({ data, user, go, counts, isAdmin }) {
  const [today, setToday] = useState(null);
  const [yday, setYday] = useState(null);
  const [goal, setGoal] = useState(null);
  const load = useCallback(() => {
    const t = ymd(new Date()), y = ymd(new Date(Date.now() - 864e5));
    api.get(`/reports/summary?from=${t}&to=${t}`).then(setToday).catch(() => {});
    api.get(`/reports/summary?from=${y}&to=${y}`).then(setYday).catch(() => {});
    api.get('/reports/today').then(setGoal).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }).format(new Date())) % 24;
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(user.name || '').split(' ')[0];
  const dateTxt = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
  const s = data.settings;
  const open = s?.onlineOpen !== false;

  const net = today?.net || 0;
  const orders = today?.orders || 0;
  const avg = orders ? net / orders : 0;
  const ynet = yday?.net || 0;
  const diff = ynet > 0 ? Math.round(((net - ynet) / ynet) * 100) : null;
  const g = goal?.goal || 0;
  const pct = g ? Math.min(100, Math.round((net / g) * 100)) : 0;

  const out = data.ingredients.filter((i) => ingStatus(i) === 'bad');
  const toBuy = data.ingredients.filter(needsRestock);
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const tasks = [
    { k: 'online', n: counts.newOrders, title: `${pl(counts.newOrders, 'new online order', 'new online orders')}`, sub: 'Waiting to be accepted', ico: P.bell, tone: 'green' },
    { k: 'barista', n: counts.toMake, title: `${pl(counts.toMake, 'order', 'orders')} to make`, sub: 'On the Barista screen', ico: P.cup, tone: 'green' },
    { k: 'messages', n: counts.messages, title: `${pl(counts.messages, 'unread chat', 'unread chats')}`, sub: 'Customer service', ico: P.chat, tone: 'blue' },
    { k: 'online', n: counts.refunds, title: `${pl(counts.refunds, 'refund', 'refunds')} to send`, sub: 'Paid orders that were cancelled', ico: P.refund, tone: 'red' },
    { k: 'inventory', n: toBuy.length, title: out.length ? `${pl(out.length, 'item', 'items')} out of stock` : `${pl(toBuy.length, 'item', 'items')} running low`, sub: (out.length ? out : toBuy).slice(0, 2).map((i) => i.name).join(', ') + ((out.length || toBuy.length) > 2 ? '…' : ''), ico: P.box, tone: out.length ? 'red' : 'amber' },
  ].filter((x) => x.n > 0);

  const hours = today?.hours || [];
  // Opening hours, stretched to include any hour that had sales (early or late orders still show)
  const sold = hours.map((v, h) => (v > 0 ? h : null)).filter((h) => h != null);
  const lo = Math.min(7, ...sold), hi = Math.max(22, ...sold);
  const shown = hours.map((v, h) => ({ h, v })).filter(({ h }) => h >= lo && h <= hi);
  const maxH = Math.max(1, ...shown.map((x) => x.v));
  const best = (today?.items || []).slice(0, 5);
  const maxB = Math.max(1, ...best.map((b) => b.qty));
  const pay = today?.pay || [];

  return (
    <div className="hm">
      <section className="hm-hero">
        <div className="hm-hello">
          <p className="hm-date">
            <span className="hm-tod" aria-hidden="true"><svg viewBox="0 0 24 24"><path d={hour >= 18 || hour < 5 ? 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z' : 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'} /></svg></span>
            {dateTxt}
          </p>
          <h2><span className="hm-greet">{hello},</span> <span className="hm-name">{first}</span></h2>
          <p className="hm-sub">
            <span className={`hm-live ${open ? 'on' : ''}`}><i />{open ? 'Online ordering is open' : 'Online ordering is closed'}</span>
          </p>
          <div className="hm-quick">
            <button className="btn hm-cta" onClick={() => go('register')}><Ico d={P.register} />New order</button>
            <button className="btn ghost hm-cta2" onClick={() => go('barista')}><Ico d={P.cup} />Barista screen</button>
          </div>
        </div>
        <div className="hm-ring" aria-label={g ? `${pct}% of today's goal` : 'Today’s sales'}>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" className="hm-ring-bg" />
            <circle cx="60" cy="60" r="52" className="hm-ring-fg" style={{ strokeDasharray: `${(g ? pct : net > 0 ? 100 : 0) * 3.267} 999` }} />
          </svg>
          <div className="hm-ring-t">
            <small>{g ? 'Today’s goal' : 'Sales today'}</small>
            <b className="num">{g ? `${pct}%` : peso(net)}</b>
            <small>{g ? `${peso(net)} of ${peso(g)}` : `${orders} ${orders === 1 ? 'order' : 'orders'}`}</small>
          </div>
        </div>
      </section>

      <div className="hm-kpis">
        <div className="hm-kpi k1">
          <span>Sales today</span>
          <b className="num">{peso(net)}</b>
          {diff != null ? <small className={diff >= 0 ? 'up' : 'down'}><Ico d={diff >= 0 ? P.up : P.down} />{Math.abs(diff)}% vs yesterday</small> : <small>Yesterday {peso(ynet)}</small>}
        </div>
        <div className="hm-kpi"><span>Orders</span><b className="num">{orders}</b><small>{yday ? `${yday.orders} yesterday` : ' '}</small></div>
        <div className="hm-kpi"><span>Drinks sold</span><b className="num">{today?.cups || 0}</b><small>{best[0] ? `Top: ${best[0].name}` : 'No drinks yet'}</small></div>
        <div className="hm-kpi"><span>Average order</span><b className="num">{peso(avg)}</b><small>{today?.disc ? `${peso(today.disc)} in discounts` : 'No discounts'}</small></div>
      </div>

      <div className="hm-grid">
        <section className="hm-card hm-tasks">
          <h3>Needs attention</h3>
          {tasks.length ? (
            <ul>
              {tasks.map((x, k) => (
                <li key={k}>
                  <button className={`hm-task t-${x.tone}`} onClick={() => go(x.k)}>
                    <span className="hm-task-i"><Ico d={x.ico} /></span>
                    <span className="hm-task-t">
                      <b>{x.title}</b>
                      <small>{x.sub}</small>
                    </span>
                    <span className="hm-task-go"><Ico d={P.arrow} /></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="hm-clear"><span><Ico d={P.check} /></span><b>All caught up</b><small>No orders waiting, no messages, stock is fine.</small></div>
          )}
        </section>

        <section className="hm-card hm-hours">
          <h3>Sales by hour</h3>
          {net > 0 ? (
            <div className="hm-bars" role="img" aria-label="Sales by hour today">
              {shown.map(({ h, v }) => (
                <div key={h} className={`hm-bar ${h === hour ? 'now' : ''} ${v === maxH ? 'peak' : ''}`} title={`${hourLabel(h)}: ${peso(v)}`}>
                  {v === maxH && <em className="num">{peso(v).replace(/\.00$/, '')}</em>}
                  <i style={{ height: `${Math.max(v ? 6 : 2, (v / maxH) * 100)}%` }} />
                  <span>{h % 3 === 1 ? hourLabel(h) : ''}</span>
                </div>
              ))}
            </div>
          ) : <p className="hm-empty">No sales yet today. The first order will show up here.</p>}
        </section>

        <section className="hm-card hm-best">
          <h3>Best sellers today</h3>
          {best.length ? (
            <ol>
              {best.map((b, k) => (
                <li key={b.name}>
                  <span className="hm-rank">{k + 1}</span>
                  <span className="hm-best-n"><b>{b.name}</b><i style={{ width: `${(b.qty / maxB) * 100}%` }} /></span>
                  <span className="hm-best-q num">{qfmt(b.qty)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="hm-empty">Nothing sold yet.</p>}
        </section>

        <section className="hm-card hm-pay">
          <h3>Payments</h3>
          {pay.length ? (<>
            <div className="hm-split" aria-hidden="true">{pay.map((p) => <i key={p.method} className={`m-${p.method}`} style={{ flex: p.net }} />)}</div>
            <ul>{pay.map((p) => <li key={p.method}><span className={`hm-dot m-${p.method}`} />{PAY_LABELS[p.method] || p.method}<span className="num">{peso(p.net)}</span><small>{p.orders}</small></li>)}</ul>
          </>) : <p className="hm-empty">No payments yet.</p>}
          {isAdmin && <button className="linkbtn hm-more" onClick={() => go('reports')}>Open Reports →</button>}
        </section>
      </div>
    </div>
  );
}
