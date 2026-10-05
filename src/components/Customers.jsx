// Owner / admin: the customers who signed up on the ordering website — how many, who they are, what they buy.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { peso, pad } from '../lib/format';
import { STAMPS_PER_REWARD } from '../shared/loyalty.mjs';
import { ago } from './Staff';
import Modal from './Modal';
import '../customers.css';

const SORTS = [['joined', 'Newest'], ['orders', 'Most orders'], ['spent', 'Most spent'], ['last', 'Last order'], ['name', 'Name A–Z']];
const FILTERS = [['all', 'All'], ['new', 'New this month'], ['regular', 'Came back (2+ orders)'], ['none', 'No orders yet'], ['reward', 'Free drink ready']];
const phoneFmt = (p) => (/^09\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p || '');
const day = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function Customers({ toast }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('joined');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => api.get('/customers').then((d) => { setData(d); setErr(''); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const monthStart = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); }, []);
  const shown = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    let l = data.list.filter((c) => !term
      || c.name.toLowerCase().includes(term)
      || (c.email && c.email.includes(term))
      || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits.replace(/^\+?63/, '0'))));
    if (filter === 'new') l = l.filter((c) => new Date(c.joined) >= monthStart);
    if (filter === 'regular') l = l.filter((c) => c.orders >= 2);
    if (filter === 'none') l = l.filter((c) => !c.orders);
    if (filter === 'reward') l = l.filter((c) => c.rewardReady > 0);
    const by = {
      joined: (a, b) => new Date(b.joined) - new Date(a.joined),
      orders: (a, b) => b.orders - a.orders || b.spent - a.spent,
      spent: (a, b) => b.spent - a.spent,
      last: (a, b) => new Date(b.lastOrder || 0) - new Date(a.lastOrder || 0),
      name: (a, b) => a.name.localeCompare(b.name),
    }[sort];
    return [...l].sort(by);
  }, [data, q, sort, filter, monthStart]);

  if (!data) return err ? <div className="banner">{err} <button className="linkbtn" onClick={load}>Try again</button></div> : <p className="muted">Loading customers…</p>;
  const s = data.summary;
  const pct = (n) => (s.total ? Math.round((n / s.total) * 100) : 0);

  return (
    <>
      <div className="toolbar">
        <h2 className="sec grow">Customers</h2>
        <span className="muted" style={{ fontSize: 13 }}>People who signed up on the ordering website</span>
      </div>

      <div className="stat-row">
        <div className="panel stat"><div className="k">Customers</div><div className="v">{s.total}</div><small className="muted">{s.newThisMonth ? `+${s.newThisMonth} this month` : 'No new sign-ups this month'}</small></div>
        <div className="panel stat"><div className="k">Have ordered</div><div className="v">{s.ordered}</div><small className="muted">{pct(s.ordered)}% of customers</small></div>
        <div className="panel stat"><div className="k">Came back</div><div className="v">{s.returning}</div><small className="muted">2 or more orders</small></div>
        <div className="panel stat"><div className="k">Active</div><div className="v">{s.active30}</div><small className="muted">ordered in the last 30 days</small></div>
        <div className="panel stat"><div className="k">Free drink ready</div><div className="v">{s.rewardReady}</div><small className="muted">{STAMPS_PER_REWARD}+ stamps</small></div>
      </div>

      <div className="panel cu-panel">
        <div className="cu-tools">
          <input className="search" type="search" placeholder="Search name, mobile no. or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
          <label className="cu-sort"><span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort customers">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
        </div>
        <div className="cu-chips" role="group" aria-label="Show">
          {FILTERS.map(([k, l]) => <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
        </div>

        {!data.list.length ? (
          <div className="empty">No customers yet. When people sign up on the ordering website, they show up here.</div>
        ) : !shown.length ? (
          <div className="empty">No customers match.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="cu-table">
              <thead><tr><th>Customer</th><th>Mobile no.</th><th className="r">Orders</th><th className="r">Spent</th><th>Last order</th><th>Favorite drink</th><th>Stamps</th><th>Joined</th></tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c._id} onClick={() => setOpen(c)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(c); }}>
                    <td data-l="Customer"><div className="cu-who"><span className="cu-av" aria-hidden="true">{initials(c.name)}</span><span><b>{c.name}</b>{c.email && <small>{c.email}</small>}</span></div></td>
                    <td data-l="Mobile no." className="num">{phoneFmt(c.phone) || <span className="muted">—</span>}</td>
                    <td data-l="Orders" className="r num">{c.orders}{c.orders >= 2 && <span className="pill ok cu-reg">Regular</span>}</td>
                    <td data-l="Spent" className="r num">{peso(c.spent)}</td>
                    <td data-l="Last order">{c.lastOrder ? ago(c.lastOrder) : <span className="muted">No orders yet</span>}</td>
                    <td data-l="Favorite drink">{c.favorite ? c.favorite.name : <span className="muted">—</span>}</td>
                    <td data-l="Stamps"><Stamps n={c.stamps} />{c.rewardReady > 0 && <span className="pill best cu-free">Free drink</span>}</td>
                    <td data-l="Joined">{day(c.joined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {shown.length > 0 && <p className="muted cu-count">Showing {shown.length} of {data.list.length}</p>}
      </div>

      {open && <CustomerModal c={open} onClose={() => setOpen(null)} toast={toast} />}
    </>
  );
}

function Stamps({ n }) {
  const p = n % STAMPS_PER_REWARD;
  return (
    <span className="cu-stamps" title={`${n} stamps`}>
      <span className="cu-dots" aria-hidden="true">{Array.from({ length: STAMPS_PER_REWARD }, (_, i) => <i key={i} className={i < p ? 'on' : ''} />)}</span>
      <span className="num">{p}/{STAMPS_PER_REWARD}</span>
    </span>
  );
}

const ICON = {
  phone: <path d="M6.6 3.5h2.2l1.1 3-1.6 1.1a8.6 8.6 0 0 0 4.1 4.1l1.1-1.6 3 1.1v2.2a1.6 1.6 0 0 1-1.7 1.6A12.4 12.4 0 0 1 5 5.2 1.6 1.6 0 0 1 6.6 3.5Z" />,
  mail: <><rect x="3" y="5" width="14" height="10" rx="2" /><path d="m3.5 6 6.5 5 6.5-5" /></>,
  cup: <><path d="M5 7h10l-1.2 9.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3L5 7Z" /><path d="M4 7h12M8 7l.6-3h2.8l.6 3" /></>,
  pin: <><path d="M10 17s-5-4.6-5-8.5a5 5 0 0 1 10 0C15 12.4 10 17 10 17Z" /><circle cx="10" cy="8.5" r="1.8" /></>,
  bag: <><path d="M5 7h10l-.8 9.5H5.8L5 7Z" /><path d="M7.5 7a2.5 2.5 0 0 1 5 0" /></>,
  bike: <><circle cx="5.5" cy="13.5" r="2.5" /><circle cx="14.5" cy="13.5" r="2.5" /><path d="M5.5 13.5 8 8h4l2.5 5.5M9 8l-1-2H6" /></>,
  clock: <><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.5 1.7" /></>,
  store: <><path d="M3.5 8 5 4h10l1.5 4M4.5 8v8h11V8" /><path d="M3.5 8a2.2 2.2 0 0 0 4.3 0 2.2 2.2 0 0 0 4.4 0 2.2 2.2 0 0 0 4.3 0" /></>,
};
const Ico = ({ n }) => <svg viewBox="0 0 20 20" aria-hidden="true">{ICON[n]}</svg>;

function CustomerModal({ c: row, onClose }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get(`/customers/${row._id}`).then(setC).catch((e) => setErr(e.message)); }, [row._id]);
  const avg = c && c.orders ? c.spent / c.orders : 0;
  const isNew = Date.now() - new Date(row.joined) < 30 * 864e5;
  const prog = c ? c.stamps % STAMPS_PER_REWARD : 0;
  const ready = c ? Math.floor(c.stamps / STAMPS_PER_REWARD) : 0;
  return (
    <Modal wide title="Customer" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      <div className="cp">
        <header className="cp-hero">
          <span className="cp-av" aria-hidden="true">{initials(row.name)}</span>
          <div className="cp-who">
            <h3>{row.name}</h3>
            <div className="cp-tags">
              {row.orders >= 2 && <span className="cp-tag reg">Regular</span>}
              {isNew && <span className="cp-tag new">New</span>}
              {ready > 0 && <span className="cp-tag free">Free drink ready</span>}
              <span className="cp-tag">Member since {new Date(row.joined).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}</span>
              {c && <span className="cp-tag">via {c.via}</span>}
            </div>
            <div className="cp-contact">
              {row.phone && <a href={`tel:${row.phone}`}><Ico n="phone" /><span className="num">{phoneFmt(row.phone)}</span></a>}
              {row.email && <a href={`mailto:${row.email}`}><Ico n="mail" /><span>{row.email}</span></a>}
            </div>
          </div>
        </header>

        {!c ? (err ? <div className="banner">{err}</div> : <p className="muted cp-load">Loading…</p>) : (<>
          <div className="cp-stats">
            <div><small>Orders</small><b className="num">{c.orders}</b></div>
            <div><small>Total spent</small><b className="num">{peso(c.spent)}</b></div>
            <div><small>Average order</small><b className="num">{c.orders ? peso(avg) : '—'}</b></div>
            <div><small>Last order</small><b>{row.lastOrder ? ago(row.lastOrder) : '—'}</b></div>
          </div>

          <div className="cp-two">
            <section className={`cp-card cp-stampcard ${ready ? 'ready' : ''}`}>
              <div className="cp-card-h"><b>Stamp card</b><span>{c.lifetimeStamps} stamps all time</span></div>
              <div className="cp-sbig"><b className="num">{prog}</b><span>of {STAMPS_PER_REWARD} stamps</span></div>
              <div className="cp-stamps" aria-label={`${prog} of ${STAMPS_PER_REWARD} stamps`}>
                {Array.from({ length: STAMPS_PER_REWARD }, (_, i) => <i key={i} className={i < prog ? 'on' : ''}>{i < prog && <Ico n="cup" />}</i>)}
              </div>
              <small className="cp-sub">{ready ? `${ready} free ${ready === 1 ? 'drink' : 'drinks'} ready to use` : `${STAMPS_PER_REWARD - prog} more for a free drink`}{c.rewardsUsed > 0 && ` · ${c.rewardsUsed} used`}</small>
            </section>
            <section className="cp-card cp-info">
              <div className="cp-row"><span className="cp-ri"><Ico n="cup" /></span><div><small>Favorite drink</small><b>{row.favorite ? `${row.favorite.name}` : '—'}</b>{row.favorite?.qty > 0 && <em>{row.favorite.qty} {row.favorite.qty === 1 ? 'cup' : 'cups'} ordered</em>}</div></div>
              <div className="cp-row"><span className="cp-ri"><Ico n="pin" /></span><div><small>Delivery address</small>{c.address ? <><b>{[c.address.detail, c.address.area].filter(Boolean).join(', ')}</b>{c.address.landmark && <em>{c.address.landmark}</em>}</> : <b className="muted">None saved</b>}</div></div>
              <div className="cp-row"><span className="cp-ri"><Ico n="clock" /></span><div><small>Last signed in</small><b>{c.lastLoginAt ? ago(c.lastLoginAt) : '—'}</b></div></div>
            </section>
          </div>

          <section className="cp-orders">
            <div className="cp-card-h"><b>Recent orders</b>{c.recent.length > 0 && <span>Last {c.recent.length}</span>}</div>
            {!c.recent.length ? <p className="cp-empty">No finished orders yet.</p> : (
              <ul>
                {c.recent.map((o) => {
                  const kind = o.source === 'online' ? (o.area ? 'delivery' : 'online') : 'counter';
                  return (
                    <li key={o._id} className={kind}>
                      <span className="cp-oi"><Ico n={kind === 'delivery' ? 'bike' : kind === 'online' ? 'bag' : 'store'} /></span>
                      <div className="cp-om">
                        <div className="cp-ot"><b className="num">#{pad(o.no)}</b><span className={`cp-kind ${kind}`}>{kind === 'delivery' ? 'Delivery' : kind === 'online' ? 'Online' : 'Counter'}</span>{o.freeDrink && <span className="cp-kind free">Free drink</span>}</div>
                        <div className="cp-oit">{o.items}</div>
                        <small>{new Date(o.at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}{o.stamps > 0 && ` · +${o.stamps} ${o.stamps === 1 ? 'stamp' : 'stamps'}`}</small>
                      </div>
                      <b className="num cp-oa">{peso(o.total)}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>)}
      </div>
    </Modal>
  );
}
