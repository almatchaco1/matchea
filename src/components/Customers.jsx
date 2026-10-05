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

function CustomerModal({ c: row, onClose }) {
  const [c, setC] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get(`/customers/${row._id}`).then(setC).catch((e) => setErr(e.message)); }, [row._id]);
  const avg = c && c.orders ? c.spent / c.orders : 0;
  return (
    <Modal wide title={row.name} aside={row.orders >= 2 ? <span className="pill ok">Regular</span> : null} onClose={onClose}
      footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      {!c ? (err ? <div className="banner">{err}</div> : <p className="muted">Loading…</p>) : (
        <div className="cu-detail">
          <dl className="cu-facts">
            <div><dt>Mobile no.</dt><dd className="num">{phoneFmt(c.phone) || '—'}</dd></div>
            <div><dt>Email</dt><dd>{c.email || '—'}</dd></div>
            <div><dt>Signed up</dt><dd>{day(c.joined)} · {c.via}</dd></div>
            <div><dt>Last signed in</dt><dd>{c.lastLoginAt ? ago(c.lastLoginAt) : '—'}</dd></div>
            <div><dt>Orders</dt><dd className="num">{c.orders}</dd></div>
            <div><dt>Total spent</dt><dd className="num">{peso(c.spent)}</dd></div>
            <div><dt>Average order</dt><dd className="num">{c.orders ? peso(avg) : '—'}</dd></div>
            <div><dt>Stamp card</dt><dd><Stamps n={c.stamps} />{c.rewardsUsed > 0 && <small className="muted"> · {c.rewardsUsed} free {c.rewardsUsed === 1 ? 'drink' : 'drinks'} used</small>}</dd></div>
            {c.address && <div className="wide"><dt>Delivery address</dt><dd>{[c.address.detail, c.address.area].filter(Boolean).join(', ')}{c.address.landmark && <small className="muted"> · {c.address.landmark}</small>}</dd></div>}
          </dl>
          <h4 className="cu-h">Recent orders</h4>
          {!c.recent.length ? <p className="muted">No finished orders yet.</p> : (
            <ul className="cu-orders">
              {c.recent.map((o) => (
                <li key={o._id}>
                  <div className="cu-o-top">
                    <b className="num">#{pad(o.no)}</b>
                    <span className="muted">{new Date(o.at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    <span className={`pill ${o.source === 'online' ? 'ok' : 'mute'}`}>{o.source === 'online' ? (o.area ? 'Delivery' : 'Online') : 'Counter'}</span>
                    {o.freeDrink && <span className="pill best">Free drink</span>}
                    <b className="num cu-o-amt">{peso(o.total)}</b>
                  </div>
                  <div className="cu-o-items">{o.items}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
