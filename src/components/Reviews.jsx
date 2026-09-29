// Owner: what customers thought of their orders (private, not shown to customers).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { pad } from '../lib/format';

const Stars = ({ n }) => <span className="rv-stars" aria-label={`${n} out of 5`}>{'★★★★★'.slice(0, n)}<i>{'★★★★★'.slice(n)}</i></span>;

export default function Reviews({ toast }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [only, setOnly] = useState('all'); // all | low | comments
  useEffect(() => { api.get(`/reports/reviews?days=${days}`).then(setD).catch((e) => toast(e.message)); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = (d?.recent || []).filter((r) => only === 'all' || (only === 'low' ? r.stars <= 3 : !!r.comment));
  const max = Math.max(1, ...(d?.dist || [1]));
  return (
    <section>
      <div className="toolbar">
        <h2 className="sec grow">Customer ratings</h2>
        <select className="search" style={{ width: 'auto', borderRadius: 8 }} value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Period">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      {!d ? <p className="muted">Loading…</p> : !d.count ? (
        <div className="panel empty">No ratings yet. Customers can rate their online orders after pickup.</div>
      ) : (
        <div className="rv-grid">
          <div className="panel rv-sum">
            <div className="rv-avg">{d.avg.toFixed(1)}<small>/5</small></div>
            <Stars n={Math.round(d.avg)} />
            <p className="muted">{d.count} {d.count === 1 ? 'rating' : 'ratings'}</p>
            <div className="rv-dist">
              {[5, 4, 3, 2, 1].map((s) => (
                <div key={s}><span>{s}★</span><i><b style={{ width: `${(d.dist[s - 1] / max) * 100}%` }} /></i><span className="num">{d.dist[s - 1]}</span></div>
              ))}
            </div>
          </div>
          <div className="panel rv-drinks">
            <h4>By drink</h4>
            <table><tbody>
              {d.byDrink.slice(0, 11).map((x) => (
                <tr key={x.name}><td>{x.name}</td><td className="r num" style={{ color: x.avg < 3.5 ? 'var(--bad)' : undefined }}>{x.avg.toFixed(1)} ★</td><td className="r muted num">{x.count}</td></tr>
              ))}
            </tbody></table>
          </div>
          <div className="panel rv-list">
            <div className="cats" style={{ margin: '0 0 10px' }}>
              {[['all', 'All'], ['low', '3★ and below'], ['comments', 'With comments']].map(([k, n]) => (
                <button key={k} className="chip" aria-pressed={only === k} onClick={() => setOnly(k)}>{n}</button>
              ))}
            </div>
            {!list.length ? <p className="muted">Nothing here.</p> : list.map((r, i) => (
              <div key={i} className={`rv-item ${r.stars <= 2 ? 'low' : ''}`}>
                <div className="rv-top"><Stars n={r.stars} /><span className="muted">{r.customer} · #{pad(r.no)} · {new Date(r.at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span></div>
                {r.comment && <p>“{r.comment}”</p>}
                <small className="muted">{r.items}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
