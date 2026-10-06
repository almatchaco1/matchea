// Inventory → Stock: health at a glance, the 3-step restock journey, and a card per ingredient.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { peso, qfmt, ingStatus, daysLeft, needsRestock, restockQty } from '../lib/format';
import { priceLine } from '../shared/pricing.mjs';
import Modal from './Modal';
import { AdminBtn } from './Locked';
import '../stock.css';

const STATUS = { ok: 'Good', warn: 'Low', bad: 'Out' };
const Ico = ({ d, ...p }) => <svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path d={d} /></svg>;
const I = {
  cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2M10 21h.01M17 21h.01',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8',
  check: 'M5 12.5 10 17 19 7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  x: 'M6 6l12 12M18 6 6 18',
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

export default function StockBoard({ data, isAdmin, toast, refresh, onAct, suppliers, reloadKey, openList, onListShown }) {
  const list = data.ingredients;
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState({ open: [], recent: [] });
  const [flow, setFlow] = useState(null); // { kind: 'list' } | { kind: 'receive', order?, items? }
  const loadOrders = useCallback(() => api.get('/restock').then(setOrders).catch(() => {}), []);
  useEffect(() => { loadOrders(); }, [loadOrders, reloadKey]);
  const { uses, blocked } = useDrinkMap(data.products, data.settings, list);
  // The "running low" note at the top of the POS opens the shopping list
  useEffect(() => { if (openList) { setFlow({ kind: 'list' }); onListShown?.(); } }, [openList]); // eslint-disable-line react-hooks/exhaustive-deps

  const out = list.filter((i) => ingStatus(i) === 'bad');
  const low = list.filter((i) => ingStatus(i) === 'warn');
  const good = list.length - out.length - low.length;
  const toBuy = list.filter(needsRestock);
  const value = list.reduce((a, i) => a + Math.max(0, i.stock) * (+i.cost || 0), 0);
  const open = orders.open;
  const onOrder = new Set(open.flatMap((o) => o.items.map((it) => String(it.ing))));
  const shown = list
    .filter((i) => filter === 'all' || (filter === 'buy' ? needsRestock(i) : ingStatus(i) === filter))
    .filter((i) => !q || `${i.name} ${i.cat}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ({ bad: 0, warn: 1, ok: 2 }[ingStatus(a)] - { bad: 0, warn: 1, ok: 2 }[ingStatus(b)]) || a.name.localeCompare(b.name));
  const step = open.length ? 2 : toBuy.length ? 1 : 0;
  const finished = (msg) => { setFlow(null); loadOrders(); refresh(); if (msg) toast(msg); };

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
        <div className="stk-tile t-val">
          <span className="stk-tile-n num">{peso(value)}</span>
          <span className="stk-tile-t"><b>Stock value</b><small>{list.length} ingredients</small></span>
        </div>
      </div>

      {/* 2. The restock journey */}
      <section className={`stk-flow s${step}`}>
        <ol className="stk-steps" aria-label="How restocking works">
          {[['cart', 'Make a list', 'What to buy'], ['truck', 'Order it', 'Send to your supplier'], ['box', 'Receive', 'Stock goes up']].map(([ic, t, s], k) => (
            <li key={t} className={step === 0 ? 'done' : k + 1 < step ? 'done' : k + 1 === step ? 'now' : ''}>
              <span className="stk-step-i"><Ico d={I[ic]} /></span>
              <span><b>{t}</b><small>{s}</small></span>
            </li>
          ))}
        </ol>
        <div className="stk-flow-body">
          {open.length > 0 ? open.map((o) => (
            <div key={o._id} className="stk-order">
              <div className="stk-order-h">
                <span className="stk-badge"><Ico d={I.truck} />On the way</span>
                <b>{o.items.length} {o.items.length === 1 ? 'item' : 'items'}{o.supplierName ? ` from ${o.supplierName}` : ''}</b>
                <small className="muted">Ordered by {o.createdBy} · {new Date(o.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{o.estCost ? ` · about ${peso(o.estCost)}` : ''}</small>
              </div>
              <ul className="stk-order-items">{o.items.map((it) => { const ing = list.find((x) => x._id === String(it.ing)); return <li key={String(it.ing)}>{it.name} <span className="muted">{ing ? amountText(ing, it.qty) : `${qfmt(it.qty)} ${it.unit}`}</span></li>; })}</ul>
              <div className="stk-order-a">
                <button className="btn primary big-cta" onClick={() => setFlow({ kind: 'receive', order: o })}><Ico d={I.box} />It arrived · Receive</button>
                <button className="btn ghost sm" onClick={async () => { try { await api.post(`/restock/${o._id}/cancel`); finished('Order cancelled'); } catch (e) { toast(e.message); } }}>Cancel order</button>
              </div>
            </div>
          )) : toBuy.length > 0 ? (
            <div className="stk-cta">
              <div>
                <b>{toBuy.length} {toBuy.length === 1 ? 'item needs' : 'items need'} buying</b>
                <p className="muted">{blocked.length ? <><span className="stk-red">{blocked.length} {blocked.length === 1 ? 'drink is' : 'drinks are'} sold out</span> because of this: {blocked.slice(0, 4).join(', ')}{blocked.length > 4 ? ` +${blocked.length - 4} more` : ''}.</> : 'Buy them before they run out.'}</p>
              </div>
              <div className="stk-cta-a">
                <button className="btn primary big-cta" onClick={() => setFlow({ kind: 'list' })}><Ico d={I.cart} />Make shopping list</button>
                <button className="btn ghost" onClick={() => setFlow({ kind: 'receive', items: toBuy.map((i) => ({ ing: i._id, qty: restockQty(i) })) })}>Already bought? Receive now</button>
              </div>
            </div>
          ) : (
            <div className="stk-cta ok">
              <div><b>Everything is stocked</b><p className="muted">Nothing is low. Items show up here when they reach their reorder level.</p></div>
              <div className="stk-cta-a"><button className="btn ghost" onClick={() => setFlow({ kind: 'receive', items: [] })}><Ico d={I.box} />Receive a delivery</button></div>
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
        <button className="btn" onClick={() => onAct('waste')}>Log waste</button>
        <AdminBtn allowed={isAdmin} className="btn primary" onClick={() => onAct('new')}>Add ingredient</AdminBtn>
      </div>

      {!shown.length ? <div className="panel empty">{!data.loaded ? 'Loading…' : list.length ? 'Nothing here.' : 'No ingredients yet. Add your matcha, milk, cups and syrups.'}</div> : (
        <div className="stk-grid">
          {shown.map((i) => <IngCard key={i._id} i={i} uses={uses[i._id] || []} onOrder={onOrder.has(i._id)} isAdmin={isAdmin} onAct={onAct} toast={toast} refresh={refresh} />)}
        </div>
      )}

      {flow?.kind === 'list' && <ShoppingList list={list} suppliers={suppliers} toast={toast} shop={data.settings?.name} onClose={() => setFlow(null)}
        onOrdered={() => finished('Marked as ordered. When it arrives, tap “It arrived · Receive”.')}
        onReceiveNow={(items) => setFlow({ kind: 'receive', items })} />}
      {flow?.kind === 'receive' && <ReceiveFlow list={list} order={flow.order} start={flow.items} suppliers={suppliers} products={data.products} settings={data.settings}
        onClose={() => setFlow(null)} onDone={() => finished()} toast={toast} />}
    </div>
  );
}

function IngCard({ i, uses, onOrder, isAdmin, onAct, toast, refresh }) {
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
      {onOrder && <span className="stk-onorder"><Ico d={I.truck} />On order</span>}
      <div className="stk-price">{isAdmin ? <CostCell ing={i} toast={toast} refresh={refresh} onSetup={() => onAct('edit', i)} /> : i.pack?.size && i.pack.cost ? `${peso(i.pack.cost)} / ${i.pack.name}` : i.cost ? `${peso(i.cost)} / ${i.unit}` : ''}</div>
      <footer>
        <button className={`btn sm ${s === 'ok' ? '' : 'primary'} stk-add`} onClick={() => onAct('recv', i)}><Ico d={I.plus} />Add stock</button>
        <div className="stk-more">
          <button className="btn sm ghost" aria-label={`More for ${i.name}`} aria-expanded={menu} onClick={() => setMenu(!menu)}><Ico d={I.dots} /></button>
          {menu && (
            <div className="stk-menu" role="menu" onMouseLeave={() => setMenu(false)}>
              <button role="menuitem" onClick={() => { setMenu(false); onAct('count', i); }}>Count it<small>Type what’s on the shelf</small></button>
              <button role="menuitem" onClick={() => { setMenu(false); onAct('waste', i); }}>Log waste<small>Spilled, expired…</small></button>
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

// Step 1 → 2: what to buy, then copy it for the supplier and mark it ordered
function ShoppingList({ list, suppliers, toast, shop, onClose, onOrdered, onReceiveNow }) {
  const start = list.filter(needsRestock).sort((a, b) => ({ bad: 0, warn: 1, ok: 2 }[ingStatus(a)] - { bad: 0, warn: 1, ok: 2 }[ingStatus(b)]));
  const round = (i) => { const p = packOf(i); const q = restockQty(i); return p ? Math.max(1, Math.ceil(q / p.size)) * p.size : q; };
  const [rows, setRows] = useState(() => start.map((i) => ({ id: i._id, qty: round(i), on: true })));
  const [sup, setSup] = useState(() => { try { return localStorage.getItem('matchaPos.lastSupplier') || ''; } catch { return ''; } });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const byId = Object.fromEntries(list.map((i) => [i._id, i]));
  const picked = rows.filter((r) => r.on && r.qty > 0);
  const cost = picked.reduce((a, r) => a + r.qty * (+byId[r.id].cost || 0), 0);
  const others = list.filter((i) => !rows.some((r) => r.id === i._id));
  const today = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const text = [`${shop || 'Matchéa'} order · ${today}`, ...picked.map((r) => { const i = byId[r.id]; const p = packOf(i); return `• ${i.name}: ${p ? `${qfmt(r.qty / p.size)} ${plural(r.qty / p.size, p.name)}` : `${qfmt(r.qty)} ${i.unit}`}`; })].join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('Copied. Paste it in Viber / Messenger to your supplier.'); } catch { toast('Could not copy. Select the list and copy it by hand.'); } };
  const order = async () => {
    setBusy(true); setErrs({});
    try {
      await api.post('/restock', { items: picked.map((r) => ({ ing: r.id, qty: r.qty })), supplier: suppliers.some((s) => s._id === sup) ? sup : null, note });
      try { localStorage.setItem('matchaPos.lastSupplier', sup); } catch {}
      onOrdered();
    } catch (e) { setErrs(e.fields || {}); toast(e.message); setBusy(false); }
  };
  return (
    <Modal wide title="Shopping list" onClose={onClose}
      aside={<span className="stk-steps-mini"><i className="on">1 List</i><i>2 Order</i><i>3 Receive</i></span>}
      footer={<>
        <button className="btn ghost" style={{ marginRight: 'auto' }} disabled={!picked.length} onClick={() => onReceiveNow(picked.map((r) => ({ ing: r.id, qty: r.qty })))}>Already bought? Receive now</button>
        <button className="btn" disabled={!picked.length} onClick={copy}><Ico d={I.copy} className="bi" />Copy list</button>
        <button className="btn primary" disabled={!picked.length || busy} onClick={order}>{busy ? 'Saving…' : `Mark as ordered (${picked.length})`}</button>
      </>}>
      <p className="muted stk-lead">Suggested amounts last about a week at your recent pace. Untick anything you don’t need, change amounts with − and +, then <b>copy the list</b> for your supplier and <b>mark it as ordered</b>.</p>
      <ul className="stk-rows">
        {rows.map((r) => {
          const i = byId[r.id]; const s = ingStatus(i);
          return (
            <li key={r.id} className={`stk-row ${r.on ? '' : 'off'} ${errs[r.id] ? 'err' : ''}`}>
              <label className="stk-tick"><input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)))} /><span /></label>
              <span className="stk-row-n"><b>{i.name}</b><small><span className={`stk-dot d-${s}`} />{qfmt(Math.max(0, i.stock))} {i.unit} left{i.cost ? ` · ${peso(r.qty * i.cost)}` : ''}</small></span>
              <Stepper ing={i} qty={r.qty} label={`amount of ${i.name}`} onChange={(v) => setRows(rows.map((x) => (x.id === r.id ? { ...x, qty: v, on: v > 0 } : x)))} />
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <select className="stk-addrow" value="" onChange={(e) => { const i = byId[e.target.value]; if (i) setRows([...rows, { id: i._id, qty: round(i), on: true }]); }} aria-label="Add another item">
          <option value="">+ Add another item…</option>
          {others.map((i) => <option key={i._id} value={i._id}>{i.name} ({qfmt(i.stock)} {i.unit} left)</option>)}
        </select>
      )}
      <div className="stk-orderinfo">
        <label><span>Supplier</span><select value={suppliers.some((s) => s._id === sup) ? sup : ''} onChange={(e) => setSup(e.target.value)}><option value="">— Any / not sure —</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
        <label><span>Note</span><input maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. delivery Thursday" /></label>
        <div className="stk-total"><span>Estimated cost</span><b className="num">{peso(cost)}</b></div>
      </div>
    </Modal>
  );
}

// Step 3: what arrived. Starts from the order (or a list), staff fix any amounts, one tap adds it all.
function ReceiveFlow({ list, order, start, suppliers, products, settings, onClose, onDone, toast }) {
  const byId = Object.fromEntries(list.map((i) => [i._id, i]));
  const init = (order ? order.items.map((it) => ({ ing: String(it.ing), qty: it.qty })) : start || []).filter((x) => byId[x.ing]);
  const priceOf = (i, qty) => { const p = packOf(i); return p?.cost ? Math.round((qty / p.size) * p.cost * 100) / 100 : i.cost ? Math.round(qty * i.cost * 100) / 100 : ''; };
  const [rows, setRows] = useState(() => init.map((x) => ({ id: x.ing, ordered: x.qty, qty: x.qty, paid: String(priceOf(byId[x.ing], x.qty)), paidTouched: false })));
  const [sup, setSup] = useState(() => order?.supplier ? String(order.supplier) : (() => { try { return localStorage.getItem('matchaPos.lastSupplier') || ''; } catch { return ''; } })());
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
      const body = { items: rows.map((r) => ({ ing: r.id, qty: r.qty, paid: r.qty > 0 && r.paid !== '' ? +r.paid : null })), supplier: suppliers.some((s) => s._id === sup) ? sup : null };
      await api.post(order ? `/restock/${order._id}/receive` : '/restock/now', body);
      try { localStorage.setItem('matchaPos.lastSupplier', sup); } catch {}
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
    <Modal wide title={order ? 'Receive the delivery' : 'Receive a delivery'} onClose={onClose}
      aside={<span className="stk-steps-mini"><i className="done">1 List</i><i className="done">2 Order</i><i className="on">3 Receive</i></span>}
      footer={<>
        <span className="stk-foot-total">Total paid <b className="num">{peso(total)}</b></span>
        <button className="btn" onClick={onClose}>Not yet</button>
        <button className="btn primary" disabled={busy || !arriving.length} onClick={save}>{busy ? 'Saving…' : `Add to stock (${arriving.length})`}</button>
      </>}>
      <p className="muted stk-lead">{order ? 'Check what came in. Change any amount that’s different, or tap “Didn’t come”.' : 'Type what came in.'} The price is what you paid in total for that item (it updates the drink costs).</p>
      {!rows.length && <p className="muted">Add the items that came in below.</p>}
      <ul className="stk-rows">
        {rows.map((r) => {
          const i = byId[r.id]; const missing = r.qty === 0;
          return (
            <li key={r.id} className={`stk-row rcv ${missing ? 'off' : ''} ${errs[r.id] || errs[`${r.id}:paid`] ? 'err' : ''}`}>
              <span className="stk-row-n"><b>{i.name}</b><small>{order && r.ordered ? `Ordered ${amountText(i, r.ordered)}` : `${qfmt(Math.max(0, i.stock))} ${i.unit} on hand`}</small></span>
              <Stepper ing={i} qty={r.qty} label={`amount of ${i.name} that arrived`} onChange={(v) => setRow(r.id, { qty: v, ...(r.paidTouched ? {} : { paid: v > 0 ? String(priceOf(i, v)) : '' }) })} />
              <label className="stk-paid"><span>₱</span><input className="num" inputMode="decimal" value={r.paid} disabled={missing} placeholder="Paid" aria-label={`Paid for ${i.name}`}
                onChange={(e) => setRow(r.id, { paid: e.target.value.replace(/[^\d.]/g, ''), paidTouched: true })} /></label>
              <button type="button" className={`btn sm ghost stk-miss ${missing ? 'on' : ''}`} onClick={() => setRow(r.id, missing ? { qty: r.ordered || (packOf(i)?.size || 1), paid: String(priceOf(i, r.ordered || packOf(i)?.size || 1)) } : { qty: 0, paid: '' })}>{missing ? 'It came' : 'Didn’t come'}</button>
              {(errs[r.id] || errs[`${r.id}:paid`]) && <em className="stk-err">{errs[r.id] || errs[`${r.id}:paid`]}</em>}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <select className="stk-addrow" value="" onChange={(e) => { const i = byId[e.target.value]; if (!i) return; const q0 = packOf(i)?.size || restockQty(i); setRows([...rows, { id: i._id, ordered: 0, qty: q0, paid: String(priceOf(i, q0)), paidTouched: false }]); }} aria-label="Add an item that came in">
          <option value="">+ Something else came in…</option>
          {others.map((i) => <option key={i._id} value={i._id}>{i.name}</option>)}
        </select>
      )}
      <div className="stk-orderinfo">
        <label><span>Supplier</span><select value={suppliers.some((s) => s._id === sup) ? sup : ''} onChange={(e) => setSup(e.target.value)}><option value="">— None —</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></label>
      </div>
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
