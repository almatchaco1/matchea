// Busiest times: average orders for each weekday × hour, so you can plan staff and prep.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso } from '../lib/format';

// One floating tooltip for every [data-tip] inside (mouse hover or keyboard focus)
function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e) => { const t = e.target.closest?.('[data-tip]'); if (!t) return setTip(null); const r = t.getBoundingClientRect(); setTip({ text: t.dataset.tip, x: r.left + r.width / 2, y: r.top }); };
  const hide = () => setTip(null);
  const el = tip && <div className="tip" role="tooltip" style={{ left: Math.min(window.innerWidth - 130, Math.max(130, tip.x)), top: tip.y }}>{tip.text}</div>;
  return [{ onMouseOver: show, onFocus: show, onMouseLeave: hide, onBlur: hide }, el];
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const hr = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

export default function Busy({ from, to, toast, onData }) {
  const [d, setD] = useState(null);
  const [tipProps, tipEl] = useTip();
  useEffect(() => {
    let live = true; setD(null);
    api.get(`/reports/busy?from=${from}&to=${to}`).then((x) => { if (live) { setD(x); onData?.(x); } }).catch((e) => toast(e.message));
    return () => { live = false; };
  }, [from, to, toast, onData]);
  if (!d) return <div className="empty">Loading…</div>;
  if (!d.orders) return <div className="panel"><div className="empty">No sales in this period yet.</div></div>;

  const active = d.hours.map((n, h) => (n ? h : null)).filter((h) => h != null);
  const lo = Math.min(8, ...active), hi = Math.max(20, ...active);
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const max = Math.max(0.1, ...d.cells.flat().map((c) => c.avgOrders));
  const maxWd = Math.max(1, ...d.weekdays.map((w) => w.avgNet));
  const maxH = Math.max(1, ...hours.map((h) => d.hours[h]));
  const shortRange = d.weekdays.some((w) => w.days === 0);

  return (
    <div {...tipProps}>
      {tipEl}
      {d.top.length > 0 && (
        <div className="bz-top">
          {d.top.map((t, i) => (
            <div className="panel bz-peak" key={i}>
              <span className="bz-rank">{i === 0 ? 'Busiest' : `#${i + 1}`}</span>
              <b>{WDL[t.wd]} {hr(t.h)}–{hr(t.h + 1)}</b>
              <small className="num">about {t.avgOrders} {t.avgOrders === 1 ? 'order' : 'orders'} each time</small>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="card-h"><h3>Average orders by day and hour</h3><span className="muted" style={{ fontSize: 12 }}>darker = busier</span></div>
        <div className="card-b bz-scroll">
          <div className="bz-grid" style={{ gridTemplateColumns: `44px repeat(${hours.length}, minmax(26px, 1fr))` }} role="table" aria-label="Average orders by weekday and hour">
            <span />
            {hours.map((h) => <span key={h} className="bz-h" role="columnheader">{h % 2 === lo % 2 ? hr(h) : ''}</span>)}
            {ORDER.map((wd) => (
              <div className="bz-row" key={wd} role="row" style={{ display: 'contents' }}>
                <span className="bz-wd" role="rowheader">{WD[wd]}</span>
                {hours.map((h) => {
                  const c = d.cells[wd][h];
                  const t = c.avgOrders / max;
                  return (
                    <span key={h} role="cell" className="bz-cell" tabIndex={0}
                      style={{ background: c.orders ? `color-mix(in srgb, var(--matcha) ${Math.round(12 + t * 88)}%, var(--surface))` : undefined }}
                      data-tip={`${WDL[wd]} ${hr(h)}–${hr(h + 1)}: ${c.avgOrders} orders on average (${c.orders} total), about ${peso(c.avgNet)}`}
                      aria-label={`${WDL[wd]} ${hr(h)}: ${c.avgOrders} orders on average`}>
                      {t > 0.55 ? <em>{c.avgOrders}</em> : ''}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="bz-legend" aria-hidden="true"><span>Quiet</span><i /><span>Busy</span></div>
        </div>
      </div>

      <div className="two">
        <div className="panel">
          <div className="card-h"><h3>Average sales by weekday</h3></div>
          <div className="card-b">
            {ORDER.map((wd) => { const w = d.weekdays[wd]; return (
              <div className="hbar" key={wd}><span className="t">{WDL[wd]}</span><span className="n num">{w.days ? `${peso(w.avgNet)} · ${w.avgOrders} orders` : 'not in range'}</span><div className="b"><i style={{ width: `${(w.avgNet / maxWd) * 100}%` }} /></div></div>
            ); })}
            {shortRange && <p className="muted" style={{ fontSize: 12, margin: 0 }}>Pick “Last 30 days” or longer to compare every weekday.</p>}
          </div>
        </div>
        <div className="panel">
          <div className="card-h"><h3>Orders by hour</h3><span className="muted" style={{ fontSize: 12 }}>all days</span></div>
          <div className="card-b">
            <div className="bz-hours">
              {hours.map((h) => (
                <div key={h} className="bz-hbar" data-tip={`${hr(h)}–${hr(h + 1)}: ${d.hours[h]} orders`} tabIndex={0}>
                  <i style={{ height: `${(d.hours[h] / maxH) * 100}%` }} />
                  <span>{h % 2 === lo % 2 ? hr(h) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
