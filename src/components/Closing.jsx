// End-of-day closing: what came in today, by payment method, with every GCash
// payment to tick off against the phone. "Close the day" saves the totals and makes a backup.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { peso, pad, dayKey, refShow } from '../lib/format';
import { PAY_LABELS } from '../shared/pricing.mjs';
import { printReceipt } from './Receipt';
import { printClosing } from '../lib/printer';
import { usePage, Pager } from '../lib/Pager';
import GoalBar from './GoalBar';

const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return dayKey(x); };
const nice = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const DISC = { pct: 'Discounts (%)', scpwd: 'Senior / PWD', reward: 'Free drinks (stamp card)' };

export default function Closing({ settings, toast, goInventory, isAdmin }) {
  const today = dayKey();
  const [date, setDate] = useState(today);
  const [c, setC] = useState(null);
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const slip = useRef(null);

  const load = useCallback(() => api.get(`/reports/closing?date=${date}`).then((d) => {
    setC(d);
    setCash(d.closed?.cashCounted != null ? String(d.closed.cashCounted) : '');
    setNote(d.closed?.note || '');
  }).catch((e) => toast(e.message)), [date, toast]);
  useEffect(() => { setC(null); setErr(''); load(); }, [load]);

  const tick = async (r) => {
    setC((x) => ({ ...x, refs: x.refs.map((y) => (y.id === r.id ? { ...y, checked: !r.checked } : y)) }));
    try { await api.post('/reports/closing/check', { date, id: r.id, checked: !r.checked }); } catch (e) { toast(e.message); load(); }
  };
  const close = async () => {
    setErr('');
    if (cash !== '' && !(+cash >= 0)) { setErr('Enter the cash you counted, like 2500, or leave it blank.'); return; }
    setBusy(true);
    try {
      const d = await api.post('/reports/closing', { date, cashCounted: cash, note });
      setC(d);
      toast(d.backup ? 'Day closed. A backup was saved too.' : 'Day closed.');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const print = async () => {
    try { if (await printClosing(c, settings, { cash, note })) { toast('Sent to the receipt printer.'); return; } }
    catch (e) { toast(e.message); }
    printReceipt(slip.current, `Closing ${date}`);
  };

  const checkedN = c ? c.refs.filter((r) => r.checked).length : 0;
  const diff = cash !== '' && c ? Math.round((+cash - c.cashExpected) * 100) / 100 : null;
  const discounts = c ? Object.entries(c.discounts).filter(([, v]) => v.count) : [];
  const rp = usePage(c?.refs, date), vp = usePage(c?.voids, date); // 10 a page

  return (
    <div className="closing">
      <div className="cl-date">
        <button className="btn sm ghost" onClick={() => setDate(shift(date, -1))} aria-label="Previous day">‹</button>
        <label className="cl-day"><b>{date === today ? 'Today' : nice(date).split(',')[0]}</b><span>{nice(date)}</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Choose a day" /></label>
        <button className="btn sm ghost" onClick={() => setDate(shift(date, 1))} disabled={date >= today} aria-label="Next day">›</button>
        {c?.closed ? <span className="pill ok">Closed by {c.closed.by} · {new Date(c.closed.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span> : c && <span className="pill mute">Not closed yet</span>}
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={print} disabled={!c}>Print summary</button>
      </div>

      {date === today && <GoalBar big refreshKey={c?.net} isAdmin={isAdmin} toast={toast} />}
      {!c ? <div className="empty">Loading…</div> : (
        <>
          {(c.unfinished > 0 || c.refundsDue.length > 0) && (
            <div className="banner warn-banner">
              {c.unfinished > 0 && <div>{c.unfinished} online {c.unfinished === 1 ? 'order is' : 'orders are'} not finished yet. Finish or cancel {c.unfinished === 1 ? 'it' : 'them'} in the Online tab before closing.</div>}
              {c.refundsDue.length > 0 && <div>Refunds to send back: {c.refundsDue.map((r) => `#${pad(r.no)} ${peso(r.total)} by ${r.method === 'paymongo' ? 'PayMongo' : PAY_LABELS[r.method] || r.method}${r.ref ? ` (ref ${r.ref})` : ''}`).join(' · ')}</div>}
            </div>
          )}

          {c.refundsSent?.length > 0 && (
            <div className="banner info-banner">
              <b>Refunds sent today ({peso(c.refundsSent.reduce((a, r) => a + r.amount, 0))}):</b>{' '}
              {c.refundsSent.map((r) => `#${pad(r.no)} ${peso(r.amount)} by ${r.method === 'paymongo' ? 'PayMongo' : PAY_LABELS[r.method] || r.method}${r.ref ? ` (ref ${r.ref})` : ''} · ${r.by} ${r.time}`).join(' · ')}.
              {' '}This money left your {c.refundsSent.some((r) => r.method !== 'paymongo') ? 'GCash' : 'PayMongo'} balance, not the cash drawer.
            </div>
          )}

          <div className="stat-row">
            <div className="panel stat"><div className="k">Net sales</div><div className="v num">{peso(c.net)}</div></div>
            <div className="panel stat"><div className="k">Orders</div><div className="v num">{c.orders}</div></div>
            <div className="panel stat"><div className="k">Drinks & items</div><div className="v num">{c.cups}</div></div>
            <div className="panel stat"><div className="k">Average order</div><div className="v num">{peso(c.orders ? c.net / c.orders : 0)}</div></div>
            <div className="panel stat"><div className="k">Counter · Online</div><div className="v num" style={{ fontSize: 18 }}>{peso(c.counter)} · {peso(c.online)}</div></div>
          </div>
          {c.first && <p className="muted cl-hours">First sale {c.first} · last sale {c.last}</p>}

          <div className="two">
            <div className="panel">
              <div className="card-h"><h3>Money in, by payment</h3></div>
              <div className="card-b">
                {!c.methods.length ? <div className="empty">No sales on this day.</div> : (
                  <table className="cl-table"><tbody>
                    {c.methods.map((m) => <tr key={m.method}><td>{PAY_LABELS[m.method] || m.method}</td><td className="r muted">{m.orders} {m.orders === 1 ? 'order' : 'orders'}</td><td className="r num"><b>{peso(m.net)}</b></td></tr>)}
                  </tbody><tfoot><tr><td>Total</td><td /><td className="r num"><b>{peso(c.net)}</b></td></tr></tfoot></table>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="card-h"><h3>Check GCash payments</h3><span className={`pill ${c.refs.length && checkedN === c.refs.length ? 'ok' : 'mute'}`}>{checkedN} of {c.refs.length} checked</span></div>
              <div className="card-b">
                {!c.refs.length ? <div className="muted">No GCash payments on this day.</div> : (
                  <>
                    <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>Tick each one once you see it in your GCash app.</p>
                    <ul className="cl-refs">
                      {rp.rows.map((r) => (
                        <li key={r.id}>
                          <label className={r.checked ? 'on' : ''}>
                            <input type="checkbox" checked={r.checked} onChange={() => tick(r)} />
                            <span className="cl-no">#{pad(r.no)}</span>
                            <span className="cl-meta"><span><b>{PAY_LABELS[r.method] || r.method}</b> · {r.time}{r.by && r.by !== 'Online' ? ` · ${r.by}` : r.by === 'Online' ? ' · online order' : ''}</span><small>{r.ref ? `Ref ${refShow(r.ref)}` : <em>No reference number</em>}</small></span>
                            <span className="num"><b>{peso(r.total)}</b></span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <Pager {...rp} what="payments" />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="two">
            <div className="panel">
              <div className="card-h"><h3>Best sellers</h3></div>
              <div className="card-b">
                {!c.top.length ? <div className="muted">—</div> : c.top.map((t, i) => (
                  <div className="cl-row" key={t.name}><span><span className="cl-rank">{i + 1}</span>{t.name}</span><span className="num">{t.qty} · {peso(t.sales)}</span></div>
                ))}
                {c.cashiers.length > 0 && <>
                  <h4 className="cl-sub">By cashier</h4>
                  {c.cashiers.map((x) => <div className="cl-row" key={x.name}><span>{x.name}</span><span className="num">{x.orders} · {peso(x.net)}</span></div>)}
                </>}
              </div>
            </div>
            <div className="panel">
              <div className="card-h"><h3>Discounts & voids</h3></div>
              <div className="card-b">
                {discounts.length ? discounts.map(([k, v]) => <div className="cl-row" key={k}><span>{DISC[k]} <span className="muted">×{v.count}</span></span><span className="num">−{peso(v.amount)}</span></div>) : <div className="cl-row"><span className="muted">No discounts</span><span /></div>}
                <div className="cl-row"><span>Voided orders <span className="muted">×{c.voids.length}</span></span><span className="num">{peso(c.voids.reduce((a, v) => a + v.total, 0))}</span></div>
                {vp.rows.map((v) => <div className="cl-row sub" key={v.no}><span>#{pad(v.no)} · {v.time}{v.by ? ` · by ${v.by}` : ''}{v.reason ? ` · ${v.reason}` : ''}</span><span className="num">{peso(v.total)}</span></div>)}
                <Pager {...vp} what="voids" />
                {c.cancelled > 0 && <div className="cl-row"><span>Cancelled online orders</span><span className="num">{c.cancelled}</span></div>}
                {c.staff?.drinks > 0 && <>
                  <div className="cl-row"><span>Staff drinks <span className="muted">×{c.staff.drinks}</span></span><span className="num">{peso(c.staff.cost)} cost</span></div>
                  {c.staff.people.map((p) => <div className="cl-row sub" key={p.name}><span>{p.name} · {p.drinks} {p.drinks === 1 ? 'drink' : 'drinks'}</span><span className="num">menu value {peso(p.value)}</span></div>)}
                </>}
              </div>
            </div>
          </div>

          <div className="panel cl-close">
            <div className="card-h"><h3>{c.closed ? 'Day closed' : 'Close the day'}</h3>{c.closed && <span className="muted" style={{ fontSize: 12 }}>You can update it anytime</span>}</div>
            <div className="card-b">
              <div className="cl-cash">
                <div><div className="k">Cash from sales</div><div className="v num">{peso(c.cashExpected)}</div></div>
                <label className="field"><span>Cash you counted <small className="muted">(optional)</small></span>
                  <input type="number" inputMode="decimal" min="0" step="any" value={cash} onChange={(e) => { setCash(e.target.value); setErr(''); }} placeholder={String(c.cashExpected)} /></label>
                <div><div className="k">Difference</div><div className={`v num ${diff == null ? 'muted' : diff === 0 ? 'good' : diff < 0 ? 'short' : 'over'}`}>{diff == null ? '—' : diff === 0 ? 'Exact ✓' : `${diff < 0 ? 'Short ' : 'Over '}${peso(Math.abs(diff))}`}</div></div>
              </div>
              <label className="field" style={{ marginTop: 10 }}><span>Note <small className="muted">(optional)</small></span>
                <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid ₱200 for ice from the cash" /></label>
              {err && <div className="ferr" role="alert">{err}</div>}
              <div className="cl-actions">
                <span className="muted" style={{ fontSize: 12 }}>Closing saves these totals and makes a backup of everything.</span>
                <button className="btn primary" onClick={close} disabled={busy}>{busy ? 'Saving…' : c.closed ? 'Update closing' : 'Close the day'}</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'none' }}><ClosingSlip ref={slip} c={c} s={settings} cash={cash} note={note} /></div>
        </>
      )}
    </div>
  );
}

const ClosingSlip = ({ ref, c, s = {}, cash, note }) => {
  const R = ({ l, r, big }) => <div className={`r ${big ? 'big' : ''}`}><span>{l}</span><span>{r}</span></div>;
  const diff = cash !== '' ? Math.round((+cash - c.cashExpected) * 100) / 100 : null;
  return (
    <div className="receipt" ref={ref}>
      <div className="c big">{s.name || 'Matchéa'}</div>
      <div className="c">End of day · {nice(c.date)}</div>
      {c.closed && <div className="c">Closed by {c.closed.by}</div>}
      <hr />
      <R big l="NET SALES" r={peso(c.net)} />
      <R l="Orders" r={c.orders} /><R l="Drinks & items" r={c.cups} />
      {c.first && <R l="First / last sale" r={`${c.first} / ${c.last}`} />}
      <hr />
      {c.methods.map((m) => <R key={m.method} l={`${PAY_LABELS[m.method] || m.method} (${m.orders})`} r={peso(m.net)} />)}
      <hr />
      <R l="Cash from sales" r={peso(c.cashExpected)} />
      {cash !== '' && <><R l="Cash counted" r={peso(+cash)} /><R l={diff < 0 ? 'Short' : diff > 0 ? 'Over' : 'Difference'} r={peso(Math.abs(diff))} /></>}
      <hr />
      {Object.entries(c.discounts).filter(([, v]) => v.count).map(([k, v]) => <R key={k} l={`${DISC[k]} (${v.count})`} r={`-${peso(v.amount)}`} />)}
      <R l={`Voids (${c.voids.length})`} r={peso(c.voids.reduce((a, v) => a + v.total, 0))} />
      {c.staff?.drinks > 0 && <R l={`Staff drinks (${c.staff.drinks})`} r={`${peso(c.staff.cost)} cost`} />}
      {c.refs.length > 0 && <R l="E-payments checked" r={`${c.refs.filter((r) => r.checked).length}/${c.refs.length}`} />}
      {c.top.length > 0 && <><hr /><div>Best sellers</div>{c.top.map((t) => <R key={t.name} l={`${t.qty} × ${t.name}`} r={peso(t.sales)} />)}</>}
      {note && <><hr /><div>Note: {note}</div></>}
      <hr />
      <div className="c">Printed {new Date().toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
    </div>
  );
};
