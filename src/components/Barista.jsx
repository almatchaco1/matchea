// Barista screen: every drink still to make, oldest first, big enough to read from across the counter.
// Tap a drink to see its recipe, tap the circle to tick it off; tap Done when the order is complete (online orders become "Ready for pickup", deliveries "Ready for the rider").
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { pad, qfmt } from '../lib/format';
import { byId } from '../shared/pricing.mjs';
import { checkProduct } from '../shared/rules.mjs';
import { howTo } from '../lib/recipe';
import { ProductModal } from './Menu';
import { ConfirmButton } from './Modal';
import { useFlip, leave } from '../lib/motion';
import '../barista-v2.css';

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [659, 880].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.15;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    });
  } catch {}
}

const mins = (d, now) => Math.max(0, Math.floor((now - new Date(d)) / 60000));

export default function Barista({ toast, data: menu, refresh, isAdmin, training, trainTickets, setTrainTickets }) {
  const grid = useRef(null);
  useFlip(grid); // the other tickets glide over when one is done
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState('');
  const [undo, setUndo] = useState(null); // { id, no }
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState(() => new Set()); // drinks showing their recipe
  const [edit, setEdit] = useState(null); // drink whose recipe is being edited
  const box = useRef(null);
  const seen = useRef(null);

  // A refresh that started before a tick was saved would show the old state, so those are skipped
  const writing = useRef(0), lastWrite = useRef(0);
  const load = useCallback(() => { const started = Date.now(); return (training ? Promise.resolve() : api.get('/barista')).then((d) => {
    if (training) return;
    if (writing.current > 0 || started < lastWrite.current) return;
    setData(d); setErr('');
    const ids = new Set(d.tickets.map((t) => t._id));
    if (seen.current && d.tickets.some((t) => !seen.current.has(t._id))) chime();
    seen.current = ids;
  }).catch((e) => setErr(e.message)); }, [training]);
  // Training: practice tickets live on this device only
  useEffect(() => {
    if (!training) return;
    setData({ tickets: trainTickets, waiting: 0 });
    const ids = new Set(trainTickets.map((t) => t._id));
    if (seen.current && trainTickets.some((t) => !seen.current.has(t._id))) chime();
    seen.current = ids;
  }, [training, trainTickets]);

  useEffect(() => {
    load();
    const a = setInterval(load, 5000);
    const b = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 10000); return () => clearTimeout(t); }, [undo]);

  const tick = async (t, l) => {
    // show it straight away, then save
    setData((d) => ({ ...d, tickets: d.tickets.map((x) => (x._id !== t._id ? x : { ...x, lines: x.lines.map((y) => (y.i === l.i ? { ...y, done: !l.done } : y)) })) }));
    if (training) { setTrainTickets((ts) => ts.map((x) => (x._id !== t._id ? x : { ...x, lines: x.lines.map((y) => (y.i === l.i ? { ...y, done: !l.done } : y)) }))); return; }
    writing.current += 1;
    let failed = false;
    try { await api.post(`/barista/${t._id}/line/${l.i}`, { done: !l.done }); } catch (e) { toast(e.message); failed = true; }
    finally { writing.current -= 1; lastWrite.current = Date.now(); }
    if (failed) load(); // put back what's really saved
  };
  const done = async (t) => {
    const card = grid.current?.querySelector(`[data-flip="${t._id}"]`);
    if (training) { leave(card, () => { setTrainTickets((ts) => ts.filter((x) => x._id !== t._id)); setUndo({ id: t._id, no: t.no, ticket: t }); }); return; }
    setBusy(t._id);
    try {
      const r = await api.post(`/barista/${t._id}/done`);
      leave(card, () => setData((d) => ({ ...d, tickets: d.tickets.filter((x) => x._id !== t._id) })));
      if (r.ready) toast(t.delivery ? `#${pad(t.no)} is ready for the Lalamove rider.` : `#${pad(t.no)} is ready. The customer has been told.`);
      else setUndo({ id: t._id, no: t.no });
    } catch (e) { toast(e.message); load(); }
    finally { setBusy(''); }
  };
  const doUndo = async () => {
    const u = undo; setUndo(null);
    if (training) { setTrainTickets((ts) => [...ts, u.ticket].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))); return; }
    try { await api.post(`/barista/${u.id}/undo`); load(); } catch (e) { toast(e.message); }
  };
  const toggleOpen = (k) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleFull = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else box.current?.requestFullscreen?.().catch(() => {}); };

  const tickets = data?.tickets || [];
  const drinks = tickets.reduce((a, t) => a + t.lines.filter((l) => !l.done).reduce((b, l) => b + l.qty, 0), 0);

  return (
    <div className={`barista ${full ? 'full' : ''}`} ref={box}>
      <div className="bar-top">
        <div>
          <h2 className="sec">To make</h2>
          <span className="bt-count"><b>{tickets.length}</b> {tickets.length === 1 ? 'order' : 'orders'}</span>
          <span className="bt-count"><b>{drinks}</b> {drinks === 1 ? 'drink' : 'drinks'}</span>
        </div>
        {data?.waiting > 0 && <span className="pill warn bar-wait">{data.waiting} online {data.waiting === 1 ? 'order' : 'orders'} waiting to be accepted</span>}
        {tickets.some((t) => ['pos', 'training', 'staff'].includes(t.source)) && (
          <ConfirmButton className="btn ghost" confirmText="Tap again to clear counter orders" onConfirm={async () => { if (training) { setTrainTickets([]); toast('Practice orders cleared'); return; } try { const r = await api.post('/barista/clear'); toast(`Cleared ${r.cleared} counter ${r.cleared === 1 ? 'order' : 'orders'}`); load(); } catch (e) { toast(e.message); } }}>Clear all</ConfirmButton>
        )}
        <button className="btn" onClick={toggleFull}>{full ? 'Exit full screen' : 'Full screen'}</button>
      </div>
      {err && <div className="banner">{err}</div>}
      {data && !tickets.length && (
        <div className="bar-empty"><b>All caught up</b><span>{training ? 'Ring up a practice order in Register and it shows up here.' : 'New orders show up here by themselves, with a chime.'}</span></div>
      )}
      <div className="bar-grid" ref={grid}>
        {tickets.map((t) => {
          const m = mins(t.createdAt, now);
          const total = t.lines.reduce((x, l) => x + l.qty, 0);
          const made = t.lines.filter((l) => l.done).reduce((x, l) => x + l.qty, 0);
          const allMade = made === total && total > 0;
          const src = t.source === 'online' ? 'Online' : t.source === 'training' ? 'Practice' : t.source === 'staff' ? 'Staff' : 'Counter';
          return (
            <article key={t._id} data-flip={t._id} className={`ticket bt ${m >= 10 ? 'late' : m >= 5 ? 'slow' : 'fresh'} ${allMade ? 'ready' : ''}`} style={{ '--age': Math.min(1, m / 12).toFixed(2) }}>
              <header className="bt-head">
                <span className="t-no">#{pad(t.no)}</span>
                <span className="bt-tags">
                  <span className={`t-src bt-src ${t.source}`}>{src}</span>
                  {t.delivery && <span className="dtag">Delivery</span>}
                </span>
                <span className="t-time bt-time" title="Minutes since ordered">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.2 1.5" /></svg>
                  {m < 1 ? 'now' : `${m} min`}
                </span>
              </header>
              {t.customer && <div className="t-name bt-name"><small>For</small>{t.customer}</div>}
              {t.note && <div className="t-note bt-note">“{t.note}”</div>}
              <div className="bt-prog" aria-label={`${made} of ${total} drinks made`}>
                <span className="bt-bar"><i style={{ width: `${total ? (made / total) * 100 : 0}%` }} /></span>
                <small>{made} of {total} made</small>
              </div>
              <ul className="bt-lines">
                {t.lines.map((l) => {
                  const k = `${t._id}:${l.i}`, isOpen = open.has(k);
                  const product = l.product ? byId(menu.products, l.product) : menu.products.find((p) => p.name === l.name);
                  return (
                    <li key={l.i}>
                      <div className={`t-line bt-line ${l.done ? 'done' : ''} ${isOpen ? 'open' : ''}`}>
                        <span className="bt-qty" aria-hidden="true">{l.qty}</span>
                        <div className="t-body">
                          <button className="t-main" onClick={() => toggleOpen(k)} aria-expanded={isOpen}>
                            <span className="t-drink"><b><span className="t-qty">{l.qty}×</span> {l.name.replace(/ Matcha Latte$/, '')}</b>
                              {l.mods && <small>{l.mods.split(' · ').map((x, j) => <em key={j} className={/upsize|extra|“/i.test(x) ? 'hl' : ''}>{x}</em>)}</small>}</span>
                            <span className="t-how"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2v-9Z" /><path d="M3 11.5a2 2 0 0 1 2-2h7.5M6 5.5h4" /></svg>{isOpen ? 'Hide recipe' : 'Recipe'}</span>
                          </button>
                        </div>
                        <button className="t-check" onClick={() => tick(t, l)} aria-pressed={l.done} aria-label={l.done ? 'Mark as not made' : 'Mark as made'}>
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                        </button>
                      </div>
                      {isOpen && <Recipe line={l} product={product} menu={menu} isAdmin={isAdmin} toast={toast} refresh={refresh} onMore={() => setEdit(product)} />}
                    </li>
                  );
                })}
              </ul>
              <button className={`btn primary t-done ${allMade ? 'go' : ''}`} disabled={busy === t._id} onClick={() => done(t)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {busy === t._id ? 'Saving…' : t.delivery ? 'Done · ready for the rider' : t.source === 'online' ? 'Done · ready for pickup' : 'Done'}
              </button>
            </article>
          );
        })}
      </div>
      {edit && <ProductModal p={edit} data={menu} settings={menu.settings} focusSteps noDelete toast={toast} onClose={() => setEdit(null)}
        done={(msg) => { setEdit(null); toast(msg === 'Saved' ? 'Recipe saved' : msg); refresh(); }} />}
      {undo && <div className="bar-undo" role="status">#{pad(undo.no)} done <button className="btn sm" onClick={doUndo}>Undo</button></div>}
    </div>
  );
}

const Amount = ({ q, unit }) => <span className="r-q"><b>{q}</b>{unit && <small>{unit}</small>}</span>;

function Recipe({ line, product, menu, isAdmin, toast, refresh, onMore }) {
  const [edit, setEdit] = useState(null); // { rows, milk } while editing
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  if (!product) return <div className="t-recipe"><p className="r-none">This drink is no longer on the menu, so there's no recipe for it.</p></div>;
  const r = howTo(line, product, menu.settings, menu.ingredients);
  const ings = menu.ingredients;
  const unitOf = (id) => byId(ings, id)?.unit || '';
  const sizes = menu.settings?.sizes || [];
  const base = sizes[0]?.label || 'regular';
  const scaled = sizes.filter((z) => (+z.mult || 1) !== 1);

  const start = () => { setErr(''); setEdit({ rows: product.recipe.map((x) => ({ ing: String(x.ing), qty: String(x.qty) })), milk: String(product.milkQty || 0) }); };
  const setRow = (i, patch) => setEdit((e) => ({ ...e, rows: e.rows.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  const addRow = () => setEdit((e) => { const used = new Set(e.rows.map((x) => x.ing)); const next = ings.find((x) => !used.has(String(x._id))); return next ? { ...e, rows: [...e.rows, { ing: String(next._id), qty: '' }] } : e; });
  const save = async () => {
    const body = { ...product, recipe: edit.rows.map((x) => ({ ing: x.ing, qty: x.qty === '' ? '' : +x.qty })), milkQty: edit.milk === '' ? 0 : +edit.milk };
    const e = checkProduct(body);
    const first = Object.keys(e)[0];
    if (first) {
      const m = first.match(/^recipe\.(\d+)\./);
      setErr(m ? `Row ${+m[1] + 1}: ${e[first]}` : e[first]); return;
    }
    setSaving(true);
    try { await api.put(`/products/${product._id}`, body); await refresh(); setEdit(null); toast(`${product.name} recipe saved`); }
    catch (x) { setErr(x.message); }
    finally { setSaving(false); }
  };

  if (edit) return (
    <div className="t-recipe editing">
      <div className="r-top"><span className="r-title">Editing</span><span className="r-size">{base}</span></div>
      <div className="r-edit-rows">
        {edit.rows.map((x, i) => (
          <div className="r-erow" key={i}>
            <select value={x.ing} onChange={(e) => setRow(i, { ing: e.target.value })} aria-label="Ingredient">
              {ings.map((g) => <option key={g._id} value={String(g._id)}>{g.name}</option>)}
            </select>
            <label className="r-qin"><input type="number" inputMode="decimal" min="0" step="any" value={x.qty} onChange={(e) => setRow(i, { qty: e.target.value })} aria-label="Amount" /><span>{unitOf(x.ing)}</span></label>
            <button className="r-x" onClick={() => setEdit((e) => ({ ...e, rows: e.rows.filter((_, k) => k !== i) }))} aria-label="Remove">✕</button>
          </div>
        ))}
        <div className="r-erow milk">
          <span className="r-mlabel">Milk <small>whichever milk they chose</small></span>
          <label className="r-qin"><input type="number" inputMode="decimal" min="0" step="any" value={edit.milk} onChange={(e) => setEdit({ ...edit, milk: e.target.value })} aria-label="Milk in ml" /><span>ml</span></label>
          <span />
        </div>
      </div>
      <button className="r-add" onClick={addRow} disabled={edit.rows.length >= ings.length}>+ Add ingredient</button>
      <p className="r-hint">
        Amounts are for a {base.toLowerCase()} cup.{scaled.length > 0 && ` ${scaled.map((z) => `${z.label} uses ×${z.mult}`).join(', ')} automatically.`} This is also what's taken off your stock.
      </p>
      {err && <div className="ferr" role="alert">{err}</div>}
      <div className="r-actions">
        <button className="r-more" onClick={onMore}>Steps, photo & price…</button>
        <button className="btn sm ghost" onClick={() => setEdit(null)} disabled={saving}>Cancel</button>
        <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );

  const fmt = (n) => qfmt(Math.round(n * 10) / 10);
  return (
    <div className="t-recipe">
      <div className="r-top">
        <span className="r-title">Recipe</span>
        <span className="r-size">{r.size || base}{line.qty > 1 ? ` · ×${line.qty}` : ''}</span>
        {isAdmin && <button className="r-editbtn" onClick={start} aria-label={`Edit ${product.name} recipe`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>Edit</button>}
      </div>
      <ul className="r-amts">
        {r.amounts.map((a, i) => (
          <li key={i} className={a.hl ? 'hl' : ''}>
            {a.qty > 0 ? <Amount q={fmt(a.qty)} unit={a.unit} /> : <Amount q="—" />}
            <span className="r-n">{a.name}</span>
          </li>
        ))}
        {r.sweet && <li className="hl"><Amount q={r.sweet} /><span className="r-n">Sweetness</span></li>}
        {r.cup && <li><Amount q="1" unit="pc" /><span className="r-n">{r.cup}</span></li>}
        {!r.amounts.length && <li className="r-empty">No amounts yet.{isAdmin ? ' Tap Edit to add them.' : ''}</li>}
      </ul>
      {r.steps.length > 0 && <ol className="r-steps">{r.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>}
    </div>
  );
}
