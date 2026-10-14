// Inventory: health at a glance, restocking in 2 steps (list → add to stock), and a card per ingredient.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { peso, qfmt, ingStatus, daysLeft, needsRestock, restockQty } from '../lib/format';
import { priceLine } from '../shared/pricing.mjs';
import Modal from './Modal';
import { AdminBtn } from './Locked';
import { usePage, Pager } from '../lib/Pager';
import '../stock.css';

const STATUS = { ok: 'Good', warn: 'Low', bad: 'Out' };
const Ico = ({ d, ...p }) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path d={d} /></svg>;
const I = {
  cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2M10 21h.01M17 21h.01',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8',
  check: 'M5 12.5 10 17 19 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  cup: 'M6 8h12l-1.3 11.2A2 2 0 0 1 14.7 21H9.3a2 2 0 0 1-2-1.8L6 8Zm-1 0h14M9 8l1-4h4l1 4',
};

/** The way an ingredient is bought (carton, bottle…), or null when it's counted in its own unit. */
const packOf = (i) => (i?.pack?.size > 0 ? i.pack : null);
const plural = (n, w) => `${w}${Math.abs(n - 1) < 1e-9 ? '' : 's'}`;
/** "2 cartons · 2,000 ml" or "500 g" */
export const amountText = (i, qty) => {
  const p = packOf(i);
  if (!p) return `${qfmt(qty)} ${i.unit}`;
  const n = Math.round((qty / p.size) * 10) / 10;
  return `${qfmt(n)} ${plural(n, p.name)} · ${qfmt(qty)} ${i.unit}`;
};

/** Which drinks use each ingredient, and which drinks can't be made right now. */
function useDrinkMap(products, settings, ingredients) {
  return useMemo(() => {
    const uses = {}; const blocked = [];
    const stock = Object.fromEntries(ingredients.map((i) => [i._id, i.stock]));
    for (const p of products || []) {
      if (p.active === false) continue;
      let usage = {};
      try { usage = settings ? priceLine({}, p, settings).usage : {}; } catch { usage = {}; }
      let out = false;
      for (const [k, q] of Object.entries(usage)) {
        (uses[k] ||= []).push(p.name);
        if (stock[k] != null && stock[k] < q) out = true;
      }
      if (out && p.available !== false) blocked.push(p.name);
    }
    return { uses, blocked };
  }, [products, settings, ingredients]);
}

export default function StockBoard({ data, isAdmin, toast, refresh, onAct, openList, onListShown }) {
  const list = data.ingredients;
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [flow, setFlow] = useState(null); // { kind: 'list' } | { kind: 'receive', items }
  const { uses, blocked } = useDrinkMap(data.products, data.settings, list);
  // The "running low" note at the top of the POS opens the shopping list
  useEffect(() => { if (openList) { setFlow({ kind: 'list' }); onListShown?.(); } }, [openList]); // eslint-disable-line react-hooks/exhaustive-deps

  const out = list.filter((i) => ingStatus(i) === 'bad');
  const low = list.filter((i) => ingStatus(i) === 'warn');
  const good = list.length - out.length - low.length;
  const toBuy = list.filter(needsRestock);
  const shown = list
    .filter((i) => filter === 'all' || (filter === 'buy' ? needsRestock(i) : ingStatus(i) === filter))
    .filter((i) => !q || `${i.name} ${i.cat}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ({ bad: 0, warn: 1, ok: 2 }[ingStatus(a)] - { bad: 0, warn: 1, ok: 2 }[ingStatus(b)]) || a.name.localeCompare(b.name));
  const pg = usePage(shown, `${filter}|${q}`); // 10 ingredients a page
  const step = toBuy.length ? 1 : 0;
  const finished = (msg) => { setFlow(null); refresh(); if (msg) toast(msg); };

  return (
    <div className="stk">
      {/* 1. How the shop is doing */}
      <div className="stk-health">
        {[['bad', 'Out of stock', out.length, 'Drinks using these can’t be sold'], ['warn', 'Running low', low.length, 'At or below the reorder level'], ['ok', 'Good', good, 'Enough on hand']].map(([k, label, n, sub]) => (
          <button key={k} className={`stk-tile t-${k} ${filter === k ? 'on' : ''}`} onClick={() => setFilter(filter === k ? 'all' : k)} aria-pressed={filter === k}>
            <span className="stk-tile-n num">{n}</span>
            <span className="stk-tile-t"><b>{label}</b><small>{sub}</small></span>
          </button>
        ))}
      </div>

      {/* 2. Restocking: make a list → add it to stock */}
      <section className={`stk-flow s${step}`}>
        <ol className="stk-steps two" aria-label="How restocking works">
          {[['cart', 'Make a list', 'What to buy'], ['box', 'Add to stock', 'When you have it']].map(([ic, t, s], k) => (
            <li key={t} className={step === 0 ? 'done' : k === 0 ? 'now' : ''}>
              <span className="stk-step-i"><Ico d={I[ic]} /></span>
              <span><b>{t}</b><small>{s}</small></span>
            </li>
          ))}
        </ol>
        <div className="stk-flow-body">
          {toBuy.length > 0 ? (
            <div className="stk-cta">
              <div>
                <b>{toBuy.length} {toBuy.length === 1 ? 'item needs' : 'items need'} buying</b>
                <p className="muted">{blocked.length ? <><span className="stk-red">{blocked.length} {blocked.length === 1 ? 'drink is' : 'drinks are'} sold out</span> because of this: {blocked.slice(0, 4).join(', ')}{blocked.length > 4 ? ` +${blocked.length - 4} more` : ''}.</> : 'Buy them before they run out.'}</p>
              </div>
              <div className="stk-cta-a">
                <button className="btn primary big-cta" onClick={() => setFlow({ kind: 'list' })}><Ico d={I.cart} />Make shopping list</button>
                <button className="btn ghost" onClick={() => setFlow({ kind: 'receive', items: toBuy.map((i) => ({ ing: i._id, qty: roundUp(i) })) })}>Already bought? Add to stock</button>
              </div>
            </div>
          ) : (
            <div className="stk-cta ok">
              <div><b>Everything is stocked</b><p className="muted">Nothing is low. Items show up here when they reach their reorder level.</p></div>
              <div className="stk-cta-a"><button className="btn ghost" onClick={() => setFlow({ kind: 'receive', items: [] })}><Ico d={I.box} />Add stock</button></div>
            </div>
          )}
        </div>
      </section>

      {/* 3. Every ingredient */}
      <div className="stk-bar">
        <div className="stk-chips">
          {[['all', 'All', list.length], ['buy', 'To buy', toBuy.length], ['bad', 'Out', out.length], ['warn', 'Low', low.length]].map(([k, n, c]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{n} <span className="muted num">{c}</span></button>
          ))}
        </div>
        <input className="search stk-search" type="search" placeholder="Find an ingredient…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find an ingredient" />
        <button className="btn" onClick={() => onAct('countall')}>Count all</button>
        <AdminBtn allowed={isAdmin} className="btn primary" onClick={() => onAct('new')}>Add ingredient</AdminBtn>
      </div>

      {!shown.length ? <div className="panel empty">{!data.loaded ? 'Loading…' : list.length ? 'Nothing here.' : 'No ingredients yet. Add your matcha, milk, cups and syrups.'}</div> : (
        <div className="stk-grid">
          {pg.rows.map((i) => <IngCard key={i._id} i={i} uses={uses[i._id] || []} isAdmin={isAdmin} onAct={onAct} toast={toast} refresh={refresh} />)}
        </div>
      )}
      <Pager {...pg} what="ingredients" />

      {flow?.kind === 'list' && <ShoppingList list={list} toast={toast} shop={data.settings?.name} onClose={() => setFlow(null)}
        onReceiveNow={(items) => setFlow({ kind: 'receive', items })} />}
      {flow?.kind === 'receive' && <ReceiveFlow list={list} start={flow.items} products={data.products} settings={data.settings}
        onClose={() => setFlow(null)} onDone={() => finished()} toast={toast} />}
    </div>
  );
}

/** Suggested amount to buy, rounded up to whole cartons / packs */
const roundUp = (i) => { const p = packOf(i); const q = restockQty(i); return p ? Math.max(1, Math.ceil(q / p.size)) * p.size : q; };

function IngCard({ i, uses, isAdmin, onAct, toast, refresh }) {
  const s = ingStatus(i);
  const [menu, setMenu] = useState(false);
  const full = Math.max((+i.reorder || 0) * 3, (+i.perDay || 0) * 7, 1);
  const pct = Math.max(0, Math.min(100, (Math.max(0, i.stock) / full) * 100));
  const reorderPct = Math.max(0, Math.min(100, ((+i.reorder || 0) / full) * 100));
  const d = daysLeft(i);
  return (
    <article className={`stk-card c-${s}`}>
      <header>
        <div className="stk-card-n"><b>{i.name}</b><small>{i.cat || 'Other'}</small></div>
        <span className={`stk-pill p-${s}`}>{STATUS[s]}</span>
      </header>
      <div className="stk-qty">
        <b className="num">{qfmt(Math.max(0, i.stock))}</b><span>{i.unit}</span>
        {packOf(i) && i.stock >= i.pack.size * 0.1 && <small>≈ {qfmt(Math.round((i.stock / i.pack.size) * 10) / 10)} {plural(i.stock / i.pack.size, i.pack.name)}</small>}
      </div>
      <div className="stk-meter" title={`Reorder at ${qfmt(i.reorder)} ${i.unit}`}>
        <i style={{ width: `${pct}%` }} />
        {i.reorder > 0 && <u style={{ left: `${reorderPct}%` }} />}
      </div>
      <p className="stk-card-sub">
        {s === 'bad' ? (uses.length ? <span className="stk-red">Blocks {uses.length} {uses.length === 1 ? 'drink' : 'drinks'}: {uses.slice(0, 2).join(', ')}{uses.length > 2 ? '…' : ''}</span> : 'Out of stock')
          : d != null ? <>{d < 1 ? 'Less than a day left' : `About ${Math.floor(d)} ${Math.floor(d) === 1 ? 'day' : 'days'} left`}{i.usedToday ? ` · used ${qfmt(i.usedToday)} today` : ''}</>
          : <>Reorder at {qfmt(i.reorder)} {i.unit}</>}
      </p>
      <div className="stk-price">{isAdmin ? <CostCell ing={i} toast={toast} refresh={refresh} onSetup={() => onAct('edit', i)} /> : i.pack?.size && i.pack.cost ? `${peso(i.pack.cost)} / ${i.pack.name}` : i.cost ? `${peso(i.cost)} / ${i.unit}` : ''}</div>
      <footer>
        <button className={`btn sm ${s === 'ok' ? '' : 'primary'} stk-add`} onClick={() => onAct('recv', i)}><Ico d={I.plus} />Add stock</button>
        <div className="stk-more">
          <button className="btn sm ghost" aria-label={`More for ${i.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)}><Ico d={I.dots} /></button>
          {menu && (
            <div className="stk-menu" role="menu" onMouseLeave={() => setMenu(false)}>
              <button role="menuitem" onClick={() => { setMenu(false); onAct('count', i); }}>Count it<small>Fix the amount: type what’s on the shelf</small></button>
              <button role="menuitem" onClick={() => { setMenu(false); onAct('history', i); }}>History<small>Every change</small></button>
              {isAdmin && <button role="menuitem" onClick={() => { setMenu(false); onAct('edit', i); }}>Edit<small>Name, unit, price, reorder level</small></button>}
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}

/** − 2 cartons + : edits an amount in packs (or in the ingredient's unit) */
function Stepper({ ing, qty, onChange, label }) {
  const p = packOf(ing);
  const unitStep = ['pcs', 'pack'].includes(ing.unit) ? 1 : ['kg', 'L'].includes(ing.unit) ? 0.5 : 100;
  const step = p ? p.size : unitStep;
  const shownVal = p ? Math.round((qty / p.size) * 100) / 100 : qty;
  const [txt, setTxt] = useState(String(shownVal));
  useEffect(() => { setTxt(String(shownVal)); }, [shownVal]);
  const set = (v) => onChange(Math.max(0, Math.round(v * 1000) / 1000));
  return (
    <span className="stk-step">
      <button type="button" onClick={() => set(qty - step)} disabled={qty <= 0} aria-label={`Less ${label}`}><Ico d={I.minus} /></button>
      <input className="num" inputMode="decimal" value={txt} aria-label={label}
        onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ''); setTxt(t); if (t !== '' && !isNaN(+t)) set(p ? +t * p.size : +t); else if (t === '') onChange(0); }} />
      <span className="stk-step-u">{p ? plural(+txt || 0, p.name) : ing.unit}</span>
      <button type="button" onClick={() => set(qty + step)} aria-label={`More ${label}`}><Ico d={I.plus} /></button>
    </span>
  );
}

// Step 1: what to buy. Copy it for whoever buys it, then add it to stock when you have it.
function ShoppingList({ list, toast, shop, onClose, onReceiveNow }) {
  const start = list.filter(needsRestock).sort((a, b) => ({ bad: 0, warn: 1, ok: 2 }[ingStatus(a)] - { bad: 0, warn: 1, ok: 2 }[ingStatus(b)]));
  const [rows, setRows] = useState(() => start.map((i) => ({ id: i._id, qty: roundUp(i), on: true })));
  const byId = Object.fromEntries(list.map((i) => [i._id, i]));
  const picked = rows.filter((r) => r.on && r.qty > 0);
  const cost = picked.reduce((a, r) => a + r.qty * (+byId[r.id].cost || 0), 0);
  const others = list.filter((i) => !rows.some((r) => r.id === i._id));
  const today = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const text = [`${shop || 'Matchéa'} shopping list · ${today}`, ...picked.map((r) => { const i = byId[r.id]; const p = packOf(i); return `• ${i.name}: ${p ? `${qfmt(r.qty / p.size)} ${plural(r.qty / p.size, p.name)}` : `${qfmt(r.qty)} ${i.unit}`}`; })].join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in Viber / Messenger, or keep it for shopping.'); } catch { toast('Could not copy. Select the list and copy it by hand.'); } };
  return (
    <Modal wide title="Shopping list" onClose={onClose}
      aside={<span className="stk-steps-mini"><i className="on">1 List</i><i>2 Add to stock</i></span>}
      footer={<>
        <span className="stk-foot-total">About <b className="num">{peso(cost)}</b></span>
        <button className="btn" disabled={!picked.length} onClick={copy}><Ico d={I.copy} className="bi" />Copy list</button>
        <button className="btn primary" disabled={!picked.length} onClick={() => onReceiveNow(picked.map((r) => ({ ing: r.id, qty: r.qty })))}>I bought it · Add to stock</button>
      </>}>
      <p className="muted stk-lead">Suggested amounts last about a week at your recent pace. Untick anything you don’t need and change amounts with − and +. <b>Copy the list</b> to send or take shopping. When you have the items, tap <b>I bought it · Add to stock</b>.</p>
      <ul className="stk-rows">
        {rows.map((r) => {
          const i = byId[r.id]; const s = ingStatus(i);
          return (
            <li key={r.id} className={`stk-row ${r.on ? '' : 'off'}`}>
              <label className="stk-tick"><input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)))} /><span /></label>
              <span className="stk-row-n"><b>{i.name}</b><small><span className={`stk-dot d-${s}`} />{qfmt(Math.max(0, i.stock))} {i.unit} left{i.cost ? ` · about ${peso(r.qty * i.cost)}` : ''}</small></span>
              <Stepper ing={i} qty={r.qty} label={`amount of ${i.name}`} onChange={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, qty: v, on: v > 0 } : x)))} />
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <select className="stk-addrow" value="" onChange={(e) => { const i = byId[e.target.value]; if (i) setRows([...rows, { id: i._id, qty: roundUp(i), on: true }]); }} aria-label="Add another item">
          <option value="">+ Add another item…</option>
          {others.map((i) => <option key={i._id} value={i._id}>{i.name} ({qfmt(i.stock)} {i.unit} left)</option>)}
        </select>
      )}
    </Modal>
  );
}

// Step 2: what you got. Starts from the list; fix any amounts and prices, one tap adds it all.
function ReceiveFlow({ list, start, products, settings, onClose, onDone, toast }) {
  const byId = Object.fromEntries(list.map((i) => [i._id, i]));
  const init = (start || []).filter((x) => byId[x.ing]);
  const priceOf = (i, qty) => { const p = packOf(i); return p?.cost ? Math.round((qty / p.size) * p.cost * 100) / 100 : i.cost ? Math.round(qty * i.cost * 100) / 100 : ''; };
  const [rows, setRows] = useState(() => init.map((x) => ({ id: x.ing, ordered: x.qty, qty: x.qty, paid: String(priceOf(byId[x.ing], x.qty)), paidTouched: false })));
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [result, setResult] = useState(null);
  const others = list.filter((i) => !rows.some((r) => r.id === i._id));
  const arriving = rows.filter((r) => r.qty > 0);
  const total = arriving.reduce((a, r) => a + (+r.paid || 0), 0);
  const setRow = (id, patch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const save = async () => {
    setBusy(true); setErrs({});
    const before = new Set(blockedNames(products, settings, list));
    try {
      await api.post('/restock/now', { items: rows.map((r) => ({ ing: r.id, qty: r.qty, paid: r.qty > 0 && r.paid !== '' ? +r.paid : null })) });
      const after = list.map((i) => { const r = rows.find((x) => x.id === i._id); return r ? { ...i, stock: Math.max(0, i.stock) + r.qty } : i; });
      const now = new Set(blockedNames(products, settings, after));
      setResult({ items: arriving.map((r) => ({ i: byId[r.id], qty: r.qty })), back: [...before].filter((n) => !now.has(n)), stillOut: [...now] });
    } catch (e) { setErrs(e.fields || {}); toast(e.message); }
    finally { setBusy(false); }
  };
  if (result) {
    return (
      <Modal title="Restocked" onClose={onDone} footer={<button className="btn primary" onClick={onDone}>Done</button>}>
        <div className="stk-done">
          <span className="stk-done-i"><Ico d={I.check} /></span>
          <b>{result.items.length} {result.items.length === 1 ? 'item' : 'items'} added to stock</b>
          <ul>{result.items.map(({ i, qty }) => <li key={i._id}>+{amountText(i, qty)} <span className="muted">{i.name}</span></li>)}</ul>
          {result.back.length > 0 && <div className="stk-back"><Ico d={I.cup} /><span><b>Back on the menu:</b> {result.back.join(', ')}</span></div>}
          {result.stillOut.length > 0 && <p className="stk-red">Still sold out: {result.stillOut.join(', ')}. Something else they need is out of stock.</p>}
        </div>
      </Modal>
    );
  }
  return (
    <Modal wide title="Add to stock" onClose={onClose}
      aside={<span className="stk-steps-mini"><i className="done">1 List</i><i className="on">2 Add to stock</i></span>}
      footer={<>
        <span className="stk-foot-total">Total paid <b className="num">{peso(total)}</b></span>
        <button className="btn" onClick={onClose}>Not yet</button>
        <button className="btn primary" disabled={busy || !arriving.length} onClick={save}>{busy ? 'Saving…' : `Add to stock (${arriving.length})`}</button>
      </>}>
      <p className="muted stk-lead">Check the amounts you got, or tap “Didn’t get” to skip one. Type the <b>price you paid</b> for each item: it keeps your drink costs and profit right.</p>
      {!rows.length && <p className="muted">Add the items that came in below.</p>}
      <ul className="stk-rows">
        {rows.map((r) => {
          const i = byId[r.id]; const missing = r.qty === 0;
          return (
            <li key={r.id} className={`stk-row rcv ${missing ? 'off' : ''} ${errs[r.id] || errs[`${r.id}:paid`] ? 'err' : ''}`}>
              <span className="stk-row-n"><b>{i.name}</b><small>{qfmt(Math.max(0, i.stock))} {i.unit} on hand now</small></span>
              <Stepper ing={i} qty={r.qty} label={`amount of ${i.name} that arrived`} onChange={(v) => setRow(r.id, { qty: v, ...(r.paidTouched ? {} : { paid: v > 0 ? String(priceOf(i, v)) : '' }) })} />
              <label className="stk-paid"><span>₱</span><input className="num" inputMode="decimal" value={r.paid} disabled={missing} placeholder="Paid" aria-label={`Paid for ${i.name}`}
                onChange={(e) => setRow(r.id, { paid: e.target.value.replace(/[^\d.]/g, ''), paidTouched: true })} /></label>
              <button type="button" className={`btn sm ghost stk-miss ${missing ? 'on' : ''}`} onClick={() => setRow(r.id, missing ? { qty: r.ordered || (packOf(i)?.size || 1), paid: String(priceOf(i, r.ordered || packOf(i)?.size || 1)) } : { qty: 0, paid: '' })}>{missing ? 'Got it' : 'Didn’t get'}</button>
              {(errs[r.id] || errs[`${r.id}:paid`]) && <em className="stk-err">{errs[r.id] || errs[`${r.id}:paid`]}</em>}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <select className="stk-addrow" value="" onChange={(e) => { const i = byId[e.target.value]; if (!i) return; const q0 = packOf(i)?.size || restockQty(i); setRows([...rows, { id: i._id, ordered: 0, qty: q0, paid: String(priceOf(i, q0)), paidTouched: false }]); }} aria-label="Add another item">
          <option value="">+ Add another item…</option>
          {others.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
        </select>
      )}
    </Modal>
  );
}

function blockedNames(products, settings, ingredients) {
  const stock = Object.fromEntries(ingredients.map((i) => [i._id, i.stock]));
  const out = [];
  for (const p of products || []) {
    if (p.active === false || p.available === false || !settings) continue;
    let usage = {};
    try { usage = priceLine({}, p, settings).usage; } catch { usage = {}; }
    if (Object.entries(usage).some(([k, q]) => stock[k] != null && stock[k] < q)) out.push(p.name);
  }
  return out;
}

// Owner: tap the price to change it right on the card
function CostCell({ ing, toast, refresh, onSetup }) {
  const pk = ing.pack?.size > 0 ? ing.pack : null;
  const [v, setV] = useState(null); // null = not editing
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (v == null) return;
    const n = v.trim() === '' ? 0 : Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) { toast(`Enter the price of one ${pk.name}, like 150`); return; }
    if (n === (+pk.cost || 0)) { setV(null); return; }
    setBusy(true);
    try {
      await api.put(`/ingredients/${ing._id}`, { name: ing.name, cat: ing.cat || '', unit: ing.unit, reorder: ing.reorder ?? 0, packName: pk.name, packSize: pk.size, packCost: n });
      toast(`${ing.name}: ${peso(n)} per ${pk.name}`); setV(null); refresh();
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  };
  if (!pk) return (
    <button className={`cost-btn ${ing.cost ? '' : 'none'}`} onClick={onSetup} title="Set the price of what you buy (a carton, a pack…)">
      <span className="cost-main">{ing.cost ? <>{peso(ing.cost)}<small>/{ing.unit}</small></> : 'Add price'} <span className="pen" aria-hidden="true">✎</span></span>
    </button>
  );
  if (v == null) return (
    <button className={`cost-btn ${pk.cost ? '' : 'none'}`} onClick={() => setV(pk.cost ? String(pk.cost) : '')} title={`Change the price of one ${pk.name}`}>
      <span className="cost-main">{pk.cost ? peso(pk.cost) : 'Add price'}<small> / {pk.name}</small></span>
      <small className="cost-sub">{qfmt(pk.size)} {ing.unit}{pk.cost ? ` · ${peso(ing.cost)}/${ing.unit}` : ''} <span className="pen" aria-hidden="true">✎</span></small>
    </button>
  );
  return (
    <span className="cost-edit">
      <span className="muted">₱</span>
      <input type="number" inputMode="decimal" min="0" step="any" autoFocus value={v} disabled={busy} aria-label={`Price of one ${pk.name} of ${ing.name}`}
        onChange={(e) => setV(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setV(null); }} />
      <span className="muted">/{pk.name}</span>
    </span>
  );
}
