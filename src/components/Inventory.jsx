import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso, qfmt, ingStatus, daysLeft, needsRestock, restockQty, download } from '../lib/format';
import Modal, { ConfirmButton } from './Modal';
import { Field, useErrors } from './Field';
import { checkIngredient, checkStockQty, checkSupplier, LIMITS, UNITS, WASTE_WHY, PACK_NAMES, unitCostOf } from '../shared/rules.mjs';
import { AdminBtn } from './Locked';
import { dayKey } from '../lib/format';

const LABEL = { ok: 'In stock', warn: 'Low', bad: 'Out' };
const REASON = { sale: 'Sale', void: 'Void', receive: 'Received', count: 'Count', create: 'Opening stock', waste: 'Waste', staff: 'Staff drink' };
const VIEWS = [['stock', 'Stock'], ['purchases', 'Purchases'], ['waste', 'Waste'], ['suppliers', 'Suppliers']];

export default function Inventory({ data, refresh, toast, isAdmin, openRestock, onRestockShown }) {
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null); // { kind: 'recv'|'count'|'edit'|'new'|'history'|'countall'|'waste', ing }
  const [view, setView] = useState('stock');
  const [suppliers, setSuppliers] = useState([]);
  const [logKey, setLogKey] = useState(0); // reload purchase/waste lists after a change
  const loadSuppliers = () => api.get('/suppliers').then(setSuppliers).catch(() => {});
  useEffect(() => { loadSuppliers(); }, []);
  const changed = (m) => { setModal(null); toast(m); refresh(); loadSuppliers(); setLogKey((k) => k + 1); };
  const list = data.ingredients;
  const warn = list.filter((i) => ingStatus(i) === 'warn').length;
  const out = list.filter((i) => ingStatus(i) === 'bad').length;
  const value = list.reduce((a, i) => a + Math.max(0, i.stock) * (+i.cost || 0), 0);
  const toBuy = list.filter(needsRestock);
  useEffect(() => { if (openRestock) { setModal({ kind: 'restock' }); onRestockShown?.(); } }, [openRestock]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = list.filter((i) => filter === 'all' || (filter === 'low' ? ingStatus(i) !== 'ok' : ingStatus(i) === 'bad'));

  return (
    <>
      <div className="toolbar rp-head">
        <h2 className="sec grow">Inventory</h2>
        <nav className="rp-tabs" role="tablist" aria-label="Inventory">
          {VIEWS.map(([k, n]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{n}</button>)}
        </nav>
      </div>

      {view === 'purchases' && <MoveLog kind="receive" key={`p${logKey}`} toast={toast} onAdd={() => setModal({ kind: 'recv' })} />}
      {view === 'waste' && <MoveLog kind="waste" key={`w${logKey}`} toast={toast} onAdd={() => setModal({ kind: 'waste' })} />}
      {view === 'suppliers' && <Suppliers list={suppliers} isAdmin={isAdmin} toast={toast} reload={loadSuppliers} />}

      {view === 'stock' && <>
      <div className="toolbar">
        <div className="cats grow" style={{ margin: 0 }}>
          {[['all', 'All', list.length], ['low', 'Needs reorder', warn + out], ['out', 'Out', out]].map(([k, n, c]) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{n} <span className="muted num">{c}</span></button>
          ))}
        </div>
        <button className="btn" onClick={() => setModal({ kind: 'countall' })}>Count all</button>
        <button className="btn" onClick={() => setModal({ kind: 'waste' })}>Log waste</button>
        <button className="btn" onClick={() => setModal({ kind: 'restock' })}>Restock list{toBuy.length > 0 && <span className="dot">{toBuy.length}</span>}</button>
        <AdminBtn allowed={isAdmin} className="btn primary" onClick={() => setModal({ kind: 'new' })}>Add ingredient</AdminBtn>
      </div>

      <div className="stat-row">
        <div className="panel stat"><div className="k">Items tracked</div><div className="v num">{list.length}</div></div>
        <div className="panel stat"><div className="k">Needs reorder</div><div className="v num" style={{ color: warn ? 'var(--warn)' : undefined }}>{warn}</div></div>
        <div className="panel stat"><div className="k">Out of stock</div><div className="v num" style={{ color: out ? 'var(--bad)' : undefined }}>{out}</div></div>
        <div className="panel stat"><div className="k">Stock value</div><div className="v num">{peso(value)}</div></div>
      </div>

      <div className="panel tbl-wrap">
        {!shown.length ? <div className="empty">{!data.loaded ? 'Loading…' : list.length ? 'Nothing in this filter.' : 'No ingredients yet. Add your matcha, milk, cups and syrups.'}</div> : (
          <table>
            <thead><tr><th>Ingredient</th><th>Status</th><th className="r">On hand</th><th></th><th className="r">Reorder at</th><th className="r">Used today</th><th className="r">Days left</th><th className="r">Cost</th><th></th></tr></thead>
            <tbody>
              {shown.map((i) => {
                const s = ingStatus(i);
                const pct = Math.max(0, Math.min(100, (i.stock / Math.max(1, (i.reorder || 1) * 3)) * 100));
                return (
                  <tr key={i._id}>
                    <td><b>{i.name}</b><div className="muted" style={{ fontSize: 12 }}>{i.cat}</div></td>
                    <td><span className={`pill ${s}`}>{LABEL[s]}</span></td>
                    <td className="r num"><b>{qfmt(i.stock)}</b> <span className="muted">{i.unit}</span>{i.pack?.size > 0 && i.stock > 0 && <div className="muted" style={{ fontSize: 11 }}>≈ {qfmt(Math.round((i.stock / i.pack.size) * 10) / 10)} {i.pack.name}{Math.abs(i.stock / i.pack.size - 1) < 0.05 ? '' : 's'}</div>}</td>
                    <td><div className="bar"><i className={s === 'ok' ? '' : s} style={{ width: pct + '%' }} /></div></td>
                    <td className="r num">{qfmt(i.reorder)} <span className="muted">{i.unit}</span></td>
                    <td className="r num">{i.usedToday ? qfmt(i.usedToday) : '—'}</td>
                    <td className="r num">{(() => { const d = daysLeft(i); return d == null ? <span className="muted">—</span> : <span style={{ color: d < 1 ? 'var(--bad)' : d < 3 ? 'var(--warn)' : undefined, fontWeight: d < 3 ? 700 : undefined }}>{d < 1 ? '< 1' : Math.floor(d)}</span>; })()}</td>
                    <td className="r num">{isAdmin ? <CostCell ing={i} toast={toast} refresh={refresh} onSetup={() => setModal({ kind: 'edit', ing: i, pack: true })} /> : i.pack?.size && i.pack.cost ? `${peso(i.pack.cost)} / ${i.pack.name}` : i.cost ? peso(i.cost) : '—'}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => setModal({ kind: 'recv', ing: i })}>Receive</button>{' '}
                      <button className="btn sm" onClick={() => setModal({ kind: 'count', ing: i })}>Count</button>{' '}
                      <button className="btn sm ghost" onClick={() => setModal({ kind: 'waste', ing: i })}>Waste</button>{' '}
                      <button className="btn sm ghost" onClick={() => setModal({ kind: 'history', ing: i })}>History</button>{' '}
                      <AdminBtn allowed={isAdmin} className="btn sm" onClick={() => setModal({ kind: 'edit', ing: i })}>Edit</AdminBtn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      </>}

      {modal?.kind === 'recv' && <ReceiveModal ing={modal.ing} list={list} suppliers={suppliers} isAdmin={isAdmin} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal?.kind === 'count' && <QtyModal {...modal} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal?.kind === 'countall' && <CountAllModal list={list} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal?.kind === 'waste' && <WasteModal ing={modal.ing} list={list} products={data.products} settings={data.settings} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal && (modal.kind === 'edit' || modal.kind === 'new') && <IngredientModal ing={modal.ing} packFirst={!!modal.pack} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal?.kind === 'history' && <HistoryModal ing={modal.ing} onClose={() => setModal(null)} />}
      {modal?.kind === 'restock' && <RestockModal list={list} shop={data.settings?.name} toast={toast} onClose={() => setModal(null)} />}
    </>
  );
}

function QtyModal({ kind, ing, onClose, done, toast }) {
  const [qty, setQty] = useState('');
  const [confirmBig, setConfirmBig] = useState(false);
  const { errs, check, clear, fromServer } = useErrors();
  const recv = kind === 'recv';
  const n = parseFloat(qty);
  // A count far from what the system expects is often a typo (e.g. kg typed as g)
  const bigChange = !recv && qty !== '' && !isNaN(n) && ing.stock > 0 && Math.abs(n - ing.stock) / ing.stock > 0.5;
  const bigReceive = recv && !isNaN(n) && ing.reorder > 0 && n > ing.reorder * 20;

  const save = async () => {
    if (!check(checkStockQty(qty, recv ? 'receive' : 'count'))) return;
    if ((bigChange || bigReceive) && !confirmBig) { setConfirmBig(true); return; }
    try {
      const r = await api.post(`/ingredients/${ing._id}/${recv ? 'receive' : 'count'}`, { qty: n });
      done(`${ing.name}: ${qfmt(r.stock)} ${ing.unit}`);
    } catch (e) { fromServer(e, toast); }
  };
  return (
    <Modal title={`${recv ? 'Receive' : 'Count'} · ${ing.name}`} aside={<span className="muted num">On hand {qfmt(ing.stock)} {ing.unit}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>{confirmBig ? 'Yes, save it' : 'Save'}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <Field id="qtyIn" label={`${recv ? 'Quantity received' : 'Actual count on shelf'} (${ing.unit})`} error={errs.qty}
          hint={recv ? 'Adds to the current stock.' : 'Replaces the current stock with what you counted.'}>
          <input id="qtyIn" type="number" inputMode="decimal" step="any" min="0" autoFocus value={qty}
            onChange={(e) => { setQty(e.target.value); clear('qty'); setConfirmBig(false); }} />
        </Field>
      </form>
      {confirmBig && (
        <div className="warnbox">
          {bigChange
            ? `That's a big change from ${qfmt(ing.stock)} ${ing.unit}. Check the unit (${ing.unit}) before saving.`
            : `That's more than 20× the reorder level. Check the unit (${ing.unit}) before saving.`}
        </div>
      )}
    </Modal>
  );
}

function IngredientModal({ ing, packFirst = false, onClose, done, toast }) {
  const [f, setF] = useState(() => {
    const base = ing ? { ...ing } : { name: '', cat: '', unit: 'ml', stock: '', reorder: '', cost: '' };
    const p = ing?.pack;
    return { ...base, packOn: ing ? !!p?.size || packFirst : true, packName: p?.name || 'pack', packSize: p?.size ?? '', packCost: p?.cost ?? '' };
  });
  const { errs, check, clear, fromServer } = useErrors();
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); clear(k); };
  const body = () => {
    const { packOn, packName, packSize, packCost, pack, ...rest } = f;
    const noPrice = { ...rest, packSize: '', cost: rest.cost === '' || rest.cost == null ? 0 : rest.cost };
    if (!packOn) return noPrice;
    if (String(packSize).trim() === '' && String(packCost).trim() === '') return noPrice; // price can be added later
    return { ...rest, packName, packSize, packCost };
  };
  const perUnit = f.packOn && +f.packSize > 0 && f.packCost !== '' ? unitCostOf(f.packCost, f.packSize) : null;
  const save = async () => {
    const e = checkIngredient(body(), { isNew: !ing });
    if (!check(e)) { toast(Object.values(e)[0]); return; } // also say it, in case the field is out of view
    try {
      if (ing) await api.put(`/ingredients/${ing._id}`, body()); else await api.post('/ingredients', body());
      done('Saved');
    } catch (e) { fromServer(e, toast); }
  };
  const del = async () => { try { await api.del(`/ingredients/${ing._id}`); done('Moved to the Recycle bin (Reports → Recycle bin) for 30 days'); } catch (e) { toast(e.message); } };
  return (
    <Modal title={ing ? 'Edit ingredient' : 'New ingredient'} onClose={onClose}
      footer={<>{ing && <ConfirmButton style={{ marginRight: 'auto' }} onConfirm={del} confirmText="Tap again to delete">Delete</ConfirmButton>}
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="row">
        <Field id="iName" label="Name" error={errs.name} style={{ flex: '2 1 200px' }}>
          <input id="iName" value={f.name} onChange={set('name')} maxLength={LIMITS.name} placeholder="Oatside oat milk" />
        </Field>
        <Field id="iCat" label="Group" error={errs.cat}>
          <input id="iCat" value={f.cat} onChange={set('cat')} maxLength={LIMITS.cat} placeholder="Tea, Milk, Packaging…" />
        </Field>
      </div>
      <div className="row">
        <Field id="iUnit" label="Measured in" error={errs.unit} hint="What recipes use">
          <select id="iUnit" value={f.unit} onChange={set('unit')}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
        </Field>
        {!ing && <Field id="iStock" label={`On hand (${f.unit})`} error={errs.stock}>
          <input id="iStock" type="number" inputMode="decimal" min="0" step="any" value={f.stock} onChange={set('stock')} placeholder="0" />
        </Field>}
        <Field id="iReorder" label={`Reorder at (${f.unit})`} error={errs.reorder}>
          <input id="iReorder" type="number" inputMode="decimal" min="0" step="any" value={f.reorder} onChange={set('reorder')} placeholder="0" />
        </Field>
      </div>

      <div className="opt-group buy-box">
        <h4>How you buy it</h4>
        <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 10 }}>
          <button type="button" aria-pressed={f.packOn} onClick={() => setF({ ...f, packOn: true })}>Price per pack / bottle</button>
          <button type="button" aria-pressed={!f.packOn} onClick={() => setF({ ...f, packOn: false })}>Price per {f.unit}</button>
        </div>
        {f.packOn ? (
          <>
            <div className="buy-line">
              <span>1</span>
              <select value={PACK_NAMES.includes(f.packName) ? f.packName : '__other'} onChange={(e) => setF({ ...f, packName: e.target.value === '__other' ? '' : e.target.value })} aria-label="What you buy">
                {PACK_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}<option value="__other">other…</option>
              </select>
              {!PACK_NAMES.includes(f.packName) && <input className="buy-name" maxLength={20} value={f.packName} onChange={set('packName')} placeholder="e.g. tray" aria-label="Name" />}
              <span>has</span>
              <input className="buy-num" type="number" inputMode="decimal" min="0" step="any" value={f.packSize} onChange={set('packSize')} placeholder="1000" aria-label={`Amount in one ${f.packName || 'pack'}`} aria-invalid={!!errs.packSize} />
              <span>{f.unit}</span>
              <span>and costs ₱</span>
              <input className="buy-num" type="number" inputMode="decimal" min="0" step="any" value={f.packCost} onChange={set('packCost')} placeholder="150" aria-label={`Price of one ${f.packName || 'pack'}`} aria-invalid={!!errs.packCost} />
            </div>
            {(errs.packName || errs.packSize || errs.packCost) && <div className="ferr">{errs.packName || errs.packSize || errs.packCost}</div>}
            <p className="muted buy-hint">{perUnit != null ? <>= <b>{peso(perUnit)}</b> per {f.unit}{perUnit < 1 ? ` (${peso(perUnit * (f.unit === 'pcs' ? 1 : 100))} per ${f.unit === 'pcs' ? 'pc' : `100 ${f.unit}`})` : ''}. Used for drink costs and profit.</> : `e.g. 1 carton has 1000 ${f.unit} and costs ₱150.`}</p>
          </>
        ) : (
          <Field id="iCost" label={`Cost per ${f.unit} (₱)`} error={errs.cost}>
            <input id="iCost" type="number" inputMode="decimal" min="0" step="any" value={f.cost} onChange={set('cost')} placeholder="0.00" />
          </Field>
        )}
      </div>
      {ing && <p className="muted" style={{ margin: 0 }}>Use Receive or Count to change the stock on hand.</p>}
    </Modal>
  );
}

function HistoryModal({ ing, onClose }) {
  const [moves, setMoves] = useState(null);
  useEffect(() => { api.get(`/ingredients/${ing._id}/moves`).then(setMoves).catch(() => setMoves([])); }, [ing._id]);
  return (
    <Modal title={`History · ${ing.name}`} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      {!moves ? <div className="empty">Loading…</div> : !moves.length ? <div className="empty">No stock changes yet.</div> : (
        <div className="tbl-wrap"><table>
          <thead><tr><th>When</th><th>What</th><th className="r">Change</th><th className="r">After</th><th>By</th></tr></thead>
          <tbody>{moves.map((m) => (
            <tr key={m._id}>
              <td className="num" style={{ whiteSpace: 'nowrap' }}>{new Date(m.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              <td>{REASON[m.reason] || m.reason}</td>
              <td className="r num" style={{ color: m.delta < 0 ? 'var(--bad)' : 'var(--ok)' }}>{m.delta > 0 ? '+' : ''}{qfmt(m.delta)}</td>
              <td className="r num">{m.after != null ? qfmt(m.after) : '—'}</td>
              <td>{m.by}</td>
            </tr>))}
          </tbody>
        </table></div>
      )}
    </Modal>
  );
}

// Shopping list for the supplier: everything low or running out within 3 days
function RestockModal({ list, shop, toast, onClose }) {
  const items = list.filter(needsRestock).sort((a, b) => (daysLeft(a) ?? 99) - (daysLeft(b) ?? 99));
  const [qty, setQty] = useState(() => Object.fromEntries(items.map((i) => [i._id, String(restockQty(i))])));
  const rows = items.map((i) => ({ i, q: Math.max(0, +qty[i._id] || 0) })).filter((r) => r.q > 0);
  const cost = rows.reduce((a, r) => a + r.q * (+r.i.cost || 0), 0);
  const today = new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  const text = [`${shop || 'Matchéa'} restock list · ${today}`, ...rows.map((r) => `• ${r.i.name}: ${qfmt(r.q)} ${r.i.unit}`)].join('\n');
  const copy = async () => { try { await navigator.clipboard.writeText(text); toast('List copied. Paste it in a message to your supplier.'); } catch { toast('Could not copy. Select the list and copy it by hand.'); } };
  const csv = () => download(`restock-${new Date().toISOString().slice(0, 10)}.csv`,
    [['ingredient', 'unit', 'on_hand', 'reorder_at', 'per_day', 'order_qty', 'est_cost'], ...rows.map((r) => [r.i.name, r.i.unit, r.i.stock, r.i.reorder, r.i.perDay, r.q, (r.q * (+r.i.cost || 0)).toFixed(2)])]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  return (
    <Modal title="Restock list" wide onClose={onClose}
      aside={<span className="muted" style={{ fontSize: 13 }}>{items.length ? `${items.length} to buy` : 'All good'}</span>}
      footer={<><button className="btn ghost" onClick={onClose}>Close</button>{rows.length > 0 && <><button className="btn" onClick={csv}>Download CSV</button><button className="btn primary" onClick={copy}>Copy list</button></>}</>}>
      {!items.length ? <p className="muted" style={{ margin: 0 }}>Nothing is low. Items appear here when they reach their reorder level or will run out within 3 days.</p> : (
        <>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Suggested amounts cover about a week at your recent pace. Change any amount before copying.</p>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Ingredient</th><th className="r">On hand</th><th className="r">Days left</th><th className="r">Order</th><th className="r">Est. cost</th></tr></thead>
              <tbody>
                {items.map((i) => {
                  const d = daysLeft(i); const s = ingStatus(i);
                  return (
                    <tr key={i._id}>
                      <td><b>{i.name}</b> {s !== 'ok' && <span className={`pill ${s}`}>{s === 'bad' ? 'Out' : 'Low'}</span>}</td>
                      <td className="r num">{qfmt(i.stock)} <span className="muted">{i.unit}</span></td>
                      <td className="r num">{d == null ? '—' : d < 1 ? '< 1' : Math.floor(d)}</td>
                      <td className="r"><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input className="search num" style={{ width: 90, borderRadius: 8, textAlign: 'right' }} inputMode="decimal" value={qty[i._id]} aria-label={`Order amount for ${i.name}`}
                          onChange={(e) => setQty({ ...qty, [i._id]: e.target.value.replace(/[^\d.]/g, '') })} /> <span className="muted">{i.unit}</span></span></td>
                      <td className="r num">{i.cost ? peso((+qty[i._id] || 0) * i.cost) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr><td colSpan={4} className="r"><b>Estimated total</b></td><td className="r num"><b>{peso(cost)}</b></td></tr></tfoot>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

const money = (v) => (v === '' ? null : +v);
const when = (d) => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Delivery arrived: how much, from whom, and what you paid (updates the cost per unit)
function ReceiveModal({ ing: first, list, suppliers, isAdmin, onClose, done, toast }) {
  const [ingId, setIngId] = useState(first?._id || list[0]?._id || '');
  const ing = list.find((i) => i._id === ingId);
  const [rawQty, setQty] = useState('');
  const [rawPaid, setPaid] = useState('');
  // Bought in packs (cartons, bottles…): enter how many and the price each
  const pk = ing?.pack?.size > 0 ? ing.pack : null;
  const [byPack, setByPack] = useState(true);
  const [packs, setPacks] = useState('1');
  const [each, setEach] = useState(() => (first?.pack?.cost ? String(first.pack.cost) : ''));
  useEffect(() => { setEach(ing?.pack?.cost ? String(ing.pack.cost) : ''); setPacks('1'); }, [ingId]); // eslint-disable-line react-hooks/exhaustive-deps
  const usePk = pk && byPack;
  const qty = usePk ? (packs === '' ? '' : String(Math.round(+packs * pk.size * 1000) / 1000)) : rawQty;
  const paid = usePk ? (each === '' || packs === '' ? '' : String(Math.round(+each * +packs * 100) / 100)) : rawPaid;
  const [sup, setSup] = useState(() => { try { return localStorage.getItem('matchaPos.lastSupplier') || ''; } catch { return ''; } });
  const [note, setNote] = useState('');
  const [confirmBig, setConfirmBig] = useState(false);
  const [busy, setBusy] = useState(false);
  const { errs, check, clear, fromServer } = useErrors();
  const n = parseFloat(qty);
  const unit = !isNaN(n) && n > 0 && paid !== '' && +paid >= 0 ? +paid / n : null;
  const bigReceive = ing && !isNaN(n) && ing.reorder > 0 && n > ing.reorder * 20;
  const priceJump = ing && unit != null && ing.cost > 0 && (unit > ing.cost * 2 || unit < ing.cost / 2);
  const supplierOk = !sup || suppliers.some((x) => x._id === sup);
  const save = async () => {
    if (!ing) return;
    const e = { ...checkStockQty(qty, 'receive') };
    if (usePk && !(Number.isFinite(+packs) && +packs > 0)) e.qty = `Enter how many ${pk.name}s you received.`;
    if (paid !== '' && !(+paid >= 0)) e.paid = 'Enter what you paid, like 1250, or leave it blank.';
    if (!check(e)) return;
    if ((bigReceive || priceJump) && !confirmBig) { setConfirmBig(true); return; }
    setBusy(true);
    try {
      const r = await api.post(`/ingredients/${ing._id}/receive`, { qty: n, paid: money(paid), supplier: supplierOk ? sup || null : null, note });
      try { localStorage.setItem('matchaPos.lastSupplier', sup); } catch {}
      done(`${ing.name}: ${qfmt(r.stock)} ${ing.unit}${unit != null ? ` · now ${r.pack?.size ? `${peso(r.pack.cost)} per ${r.pack.name}` : `${peso(r.cost)} per ${ing.unit}`}` : ''}`);
    } catch (x) { fromServer(x, toast); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Receive a delivery" aside={ing && <span className="muted num">On hand {qfmt(ing.stock)} {ing.unit}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : confirmBig ? 'Yes, save it' : 'Save'}</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        {!first && <Field id="rvIng" label="Ingredient"><select id="rvIng" value={ingId} onChange={(e) => { setIngId(e.target.value); setConfirmBig(false); }}>{list.map((i) => <option key={i._id} value={i._id}>{i.name} ({i.unit})</option>)}</select></Field>}
        {pk && (
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 10 }}>
            <button type="button" aria-pressed={byPack} onClick={() => { setByPack(true); clear('qty', 'paid'); }}>By {pk.name}</button>
            <button type="button" aria-pressed={!byPack} onClick={() => { setByPack(false); clear('qty', 'paid'); }}>By {ing.unit}</button>
          </div>
        )}
        {usePk ? (
          <>
            <div className="row">
              <Field id="rvPacks" label={`How many ${pk.name}s`} error={errs.qty} hint={packs && +packs > 0 ? `= ${qfmt(+qty)} ${ing.unit}` : `1 ${pk.name} = ${qfmt(pk.size)} ${ing.unit}`}>
                <input id="rvPacks" type="number" inputMode="decimal" step="any" min="0" autoFocus value={packs} onChange={(e) => { setPacks(e.target.value); clear('qty'); setConfirmBig(false); }} />
              </Field>
              <Field id="rvEach" label={`Price per ${pk.name} (₱)`} error={errs.paid} hint={paid !== '' ? `Total ${peso(+paid)}` : 'Optional · updates the cost'}>
                <input id="rvEach" type="number" inputMode="decimal" step="any" min="0" value={each} onChange={(e) => { setEach(e.target.value); clear('paid'); setConfirmBig(false); }} placeholder="0.00" />
              </Field>
            </div>
          </>
        ) : (
        <div className="row">
          <Field id="rvQty" label={`Quantity received (${ing?.unit || ''})`} error={errs.qty}>
            <input id="rvQty" type="number" inputMode="decimal" step="any" min="0" autoFocus value={qty} onChange={(e) => { setQty(e.target.value); clear('qty'); setConfirmBig(false); }} />
          </Field>
          <Field id="rvPaid" label="Total paid (₱)" error={errs.paid} hint={unit != null ? `= ${peso(unit)} per ${ing.unit}` : 'Optional · updates the cost per unit'}>
            <input id="rvPaid" type="number" inputMode="decimal" step="any" min="0" value={paid} onChange={(e) => { setPaid(e.target.value); clear('paid'); setConfirmBig(false); }} placeholder="0.00" />
          </Field>
        </div>
        )}
        <Field id="rvSup" label="Supplier" error={errs.supplier} hint={suppliers.length ? '' : isAdmin ? 'Add suppliers in the Suppliers tab.' : ''}>
          <select id="rvSup" value={supplierOk ? sup : ''} onChange={(e) => setSup(e.target.value)}>
            <option value="">— None —</option>
            {suppliers.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
          </select>
        </Field>
        <Field id="rvNote" label="Note" error={errs.note} hint="Optional · e.g. invoice number">
          <input id="rvNote" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Invoice #1234" />
        </Field>
      </form>
      {confirmBig && ing && <div className="warnbox">
        {bigReceive && <div>That's more than 20× the reorder level. Check the unit ({ing.unit}).</div>}
        {priceJump && <div>That works out to {pk ? `${peso(unit * pk.size)} per ${pk.name}` : `${peso(unit)} per ${ing.unit}`}, very different from the current {pk ? `${peso(ing.cost * pk.size)}` : peso(ing.cost)}. Check the amount{pk ? '' : ' and unit'}.</div>}
      </div>}
    </Modal>
  );
}

// Weekly stock count: type what's on the shelf for everything, see the difference, save once
function CountAllModal({ list, onClose, done, toast }) {
  const [q, setQ] = useState({});
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const [search, setSearch] = useState('');
  const entered = list.filter((i) => q[i._id] != null && q[i._id] !== '');
  const diffVal = entered.reduce((a, i) => a + ((+q[i._id] || 0) - i.stock) * (+i.cost || 0), 0);
  const groups = [...new Set(list.map((i) => i.cat || 'Other'))];
  const shown = list.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const save = async () => {
    const e = {};
    entered.forEach((i) => { const x = checkStockQty(q[i._id], 'count'); if (x.qty) e[i._id] = x.qty; });
    setErrs(e);
    if (Object.keys(e).length || !entered.length) return;
    setBusy(true);
    try {
      const r = await api.post('/ingredients/count-all', { counts: Object.fromEntries(entered.map((i) => [i._id, +q[i._id]])) });
      done(r.changed ? `Stock count saved: ${r.changed} ${r.changed === 1 ? 'item' : 'items'} changed (${r.value < 0 ? '−' : '+'}${peso(Math.abs(r.value))})` : 'Stock count saved: everything matched');
    } catch (x) { if (x.fields) setErrs(x.fields); toast(x.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal wide title="Stock count" onClose={onClose}
      aside={<span className="muted" style={{ fontSize: 13 }}>{entered.length} of {list.length} counted</span>}
      footer={<>
        {entered.length > 0 && <span className={`num ${diffVal < -0.005 ? 'ferr' : 'muted'}`} style={{ marginRight: 'auto', fontSize: 13 }}>Difference in value: {diffVal < 0 ? '−' : '+'}{peso(Math.abs(diffVal))}</span>}
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy || !entered.length}>{busy ? 'Saving…' : 'Save count'}</button></>}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Count what's on the shelf and type it in. Leave a box empty to skip that item. Only items you change are saved.</p>
      <input className="search" placeholder="Find an ingredient…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 10, flex: "none", width: "100%" }} />
      <div className="tbl-wrap">
        <table className="count-tbl">
          <thead><tr><th>Ingredient</th><th className="r">System says</th><th className="r">Counted</th><th className="r">Difference</th></tr></thead>
          {groups.map((g) => {
            const items = shown.filter((i) => (i.cat || 'Other') === g);
            if (!items.length) return null;
            return (
              <tbody key={g}>
                <tr className="grp"><td colSpan={4}>{g}</td></tr>
                {items.map((i) => {
                  const v = q[i._id]; const has = v != null && v !== '' && !isNaN(+v); const d = has ? +v - i.stock : 0;
                  return (
                    <tr key={i._id}>
                      <td><b>{i.name}</b></td>
                      <td className="r num muted">{qfmt(i.stock)} {i.unit}</td>
                      <td className="r"><span className="cnt-in"><input type="number" inputMode="decimal" min="0" step="any" value={v ?? ''} aria-label={`Counted ${i.name}`} aria-invalid={!!errs[i._id]}
                        onChange={(e) => { setQ({ ...q, [i._id]: e.target.value }); setErrs({ ...errs, [i._id]: undefined }); }} /><span className="muted">{i.unit}</span></span>
                        {errs[i._id] && <div className="ferr">{errs[i._id]}</div>}</td>
                      <td className={`r num ${!has || Math.abs(d) < 1e-9 ? 'muted' : d < 0 ? 'neg' : 'pos'}`}>{!has ? '—' : Math.abs(d) < 1e-9 ? '✓' : `${d > 0 ? '+' : '−'}${qfmt(Math.abs(d))}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </Modal>
  );
}

// Waste: a whole drink (uses its recipe) or a single ingredient
function WasteModal({ ing: first, list, products, settings, onClose, done, toast }) {
  const drinks = products.filter((p) => p.active !== false);
  const [mode, setMode] = useState(first ? 'ing' : 'drink');
  const [ingId, setIngId] = useState(first?._id || list[0]?._id || '');
  const [prodId, setProdId] = useState(drinks[0]?._id || '');
  const [sizeId, setSizeId] = useState(settings?.sizes?.[0]?._id || '');
  const [qty, setQty] = useState(mode === 'drink' ? '1' : '');
  const [why, setWhy] = useState('spilled');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const { errs, check, clear, fromServer } = useErrors();
  const ing = list.find((i) => i._id === ingId);
  const prod = drinks.find((p) => p._id === prodId);
  const save = async () => {
    setBusy(true);
    try {
      if (mode === 'drink') {
        const n = +qty;
        if (!check(Number.isInteger(n) && n >= 1 && n <= 50 ? {} : { qty: 'Enter how many cups, from 1 to 50.' })) return;
        const r = await api.post('/ingredients/waste-drink', { productId: prodId, sizeId: prod?.hasSizes !== false ? sizeId : undefined, qty: n, why, note });
        done(`Waste logged: ${r.label} (${peso(r.value)})`);
      } else {
        if (!check(checkStockQty(qty, 'receive'))) return;
        const r = await api.post(`/ingredients/${ingId}/waste`, { qty: +qty, why, note });
        done(`Waste logged: ${qfmt(+qty)} ${ing.unit} ${ing.name} · ${qfmt(r.stock)} ${ing.unit} left`);
      }
    } catch (x) { fromServer(x, toast); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Log waste" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Take off stock'}</button></>}>
      <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
        <button aria-pressed={mode === 'drink'} onClick={() => { setMode('drink'); setQty('1'); clear('qty'); }}>A whole drink</button>
        <button aria-pressed={mode === 'ing'} onClick={() => { setMode('ing'); setQty(''); clear('qty'); }}>An ingredient</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        {mode === 'drink' ? (
          <div className="row">
            <Field id="wsProd" label="Drink" style={{ flex: '2 1 200px' }}><select id="wsProd" value={prodId} onChange={(e) => setProdId(e.target.value)}>{drinks.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></Field>
            {prod?.hasSizes !== false && settings?.sizes?.length > 1 && <Field id="wsSize" label="Size"><select id="wsSize" value={sizeId} onChange={(e) => setSizeId(e.target.value)}>{settings.sizes.map((z) => <option key={z._id} value={z._id}>{z.label}</option>)}</select></Field>}
            <Field id="wsQty" label="Cups" error={errs.qty} style={{ flex: '0 1 90px' }}><input id="wsQty" type="number" inputMode="numeric" min="1" max="50" value={qty} onChange={(e) => { setQty(e.target.value); clear('qty'); }} /></Field>
          </div>
        ) : (
          <div className="row">
            <Field id="wsIng" label="Ingredient" style={{ flex: '2 1 200px' }}><select id="wsIng" value={ingId} onChange={(e) => setIngId(e.target.value)}>{list.map((i) => <option key={i._id} value={i._id}>{i.name} ({qfmt(i.stock)} {i.unit} on hand)</option>)}</select></Field>
            <Field id="wsQty" label={`Amount (${ing?.unit || ''})`} error={errs.qty} style={{ flex: '0 1 130px' }}><input id="wsQty" type="number" inputMode="decimal" min="0" step="any" autoFocus value={qty} onChange={(e) => { setQty(e.target.value); clear('qty'); }} /></Field>
          </div>
        )}
        <Field id="wsWhy" label="What happened" error={errs.why}>
          <div className="checks">{Object.entries(WASTE_WHY).map(([k, v]) => <label key={k} className={`check ${why === k ? 'on' : ''}`}><input type="radio" name="why" checked={why === k} onChange={() => setWhy(k)} />{v}</label>)}</div>
        </Field>
        <Field id="wsNote" label="Note" error={errs.note} hint="Optional"><input id="wsNote" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'drink' ? 'e.g. customer changed their mind' : 'e.g. milk went sour'} /></Field>
      </form>
      {mode === 'drink' && <p className="muted" style={{ fontSize: 12, margin: 0 }}>Takes the drink's full recipe (matcha, milk, cup…) off the stock.</p>}
    </Modal>
  );
}

// Purchases or waste over a period
function MoveLog({ kind, toast, onAdd }) {
  const [range, setRange] = useState('30');
  const [d, setD] = useState(null);
  const recv = kind === 'receive';
  useEffect(() => {
    const n = { 7: 6, 30: 29, 90: 89 }[range];
    const f = new Date(); f.setDate(f.getDate() - n);
    let live = true; setD(null);
    api.get(`/ingredients/log?kind=${kind}&from=${dayKey(f)}&to=${dayKey()}`).then((x) => live && setD(x)).catch((e) => toast(e.message));
    return () => { live = false; };
  }, [range, kind, toast]);
  const csv = () => download(`${recv ? 'purchases' : 'waste'}-${d.from}-to-${d.to}.csv`,
    [recv ? ['date', 'ingredient', 'qty', 'unit', 'paid', 'supplier', 'note', 'by'] : ['date', 'ingredient', 'qty', 'unit', 'value', 'reason', 'note', 'by'],
      ...d.list.map((m) => [new Date(m.at).toLocaleString('en-PH'), m.ing, m.qty, m.unit, m.value ?? '', recv ? m.supplier : WASTE_WHY[m.why] || m.why, m.note, m.by])]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  const byWhy = !recv && d ? Object.entries(d.list.reduce((a, m) => { a[m.why || 'other'] = (a[m.why || 'other'] || 0) + (m.value || 0); return a; }, {})) : [];
  return (
    <>
      <div className="toolbar">
        <div className="cats grow" style={{ margin: 0 }}>
          {[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']].map(([k, n]) => <button key={k} className="chip" aria-pressed={range === k} onClick={() => setRange(k)}>{n}</button>)}
        </div>
        {d?.list.length > 0 && <button className="btn" onClick={csv}>Download CSV</button>}
        <button className="btn primary" onClick={onAdd}>{recv ? 'Receive a delivery' : 'Log waste'}</button>
      </div>
      <div className="stat-row">
        <div className="panel stat"><div className="k">{recv ? 'Spent on stock' : 'Value wasted'}</div><div className="v num" style={{ color: !recv && d?.total ? 'var(--bad)' : undefined }}>{d ? peso(d.total) : '…'}</div></div>
        <div className="panel stat"><div className="k">{recv ? 'Deliveries' : 'Times logged'}</div><div className="v num">{d ? d.list.length : '…'}</div></div>
        {byWhy.map(([k, v]) => <div className="panel stat" key={k}><div className="k">{WASTE_WHY[k] || k}</div><div className="v num">{peso(v)}</div></div>)}
      </div>
      <div className="panel tbl-wrap">
        {!d ? <div className="empty">Loading…</div> : !d.list.length ? <div className="empty">{recv ? 'No deliveries in this period. Use “Receive” when stock arrives.' : 'No waste logged in this period. 🎉'}</div> : (
          <table>
            <thead><tr><th>When</th><th>Ingredient</th><th className="r">Amount</th><th className="r">{recv ? 'Paid' : 'Value'}</th><th>{recv ? 'Supplier' : 'Reason'}</th><th>Note</th><th>By</th></tr></thead>
            <tbody>{d.list.map((m) => (
              <tr key={m._id}>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{when(m.at)}</td>
                <td><b>{m.ing}</b></td>
                <td className="r num">{qfmt(m.qty)} <span className="muted">{m.unit}</span></td>
                <td className="r num">{m.value != null ? peso(m.value) : <span className="muted">—</span>}</td>
                <td>{recv ? m.supplier || <span className="muted">—</span> : <span className="pill mute">{WASTE_WHY[m.why] || 'Other'}</span>}</td>
                <td className="muted" style={{ fontSize: 12 }}>{m.note}</td>
                <td>{m.by}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Suppliers({ list, isAdmin, toast, reload }) {
  const [edit, setEdit] = useState(null); // supplier or {} for new
  return (
    <>
      <div className="toolbar">
        <p className="muted grow" style={{ margin: 0 }}>Choose a supplier when you receive a delivery to see how much you spend with each.</p>
        <AdminBtn allowed={isAdmin} className="btn primary" onClick={() => setEdit({})}>Add supplier</AdminBtn>
      </div>
      <div className="panel tbl-wrap">
        {!list.length ? <div className="empty">No suppliers yet.{isAdmin ? ' Add the people or shops you buy matcha, milk and cups from.' : ''}</div> : (
          <table>
            <thead><tr><th>Supplier</th><th>Contact</th><th className="r">Deliveries</th><th className="r">Total spent</th><th>Last delivery</th><th /></tr></thead>
            <tbody>{list.map((x) => (
              <tr key={x._id}>
                <td><b>{x.name}</b>{x.notes && <div className="muted" style={{ fontSize: 12 }}>{x.notes}</div>}</td>
                <td>{x.phone ? <a href={`tel:${x.phone.replace(/\s/g, '')}`}>{x.phone}</a> : <span className="muted">—</span>}</td>
                <td className="r num">{x.deliveries}</td>
                <td className="r num">{peso(x.total)}</td>
                <td className="num">{x.last ? new Date(x.last).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : <span className="muted">—</span>}</td>
                <td className="r"><AdminBtn allowed={isAdmin} className="btn sm ghost" onClick={() => setEdit(x)}>Edit</AdminBtn></td>
              </tr>))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <SupplierModal s={edit._id ? edit : null} onClose={() => setEdit(null)} done={(m) => { setEdit(null); toast(m); reload(); }} toast={toast} />}
    </>
  );
}

function SupplierModal({ s, onClose, done, toast }) {
  const [f, setF] = useState(s ? { name: s.name, phone: s.phone || '', notes: s.notes || '' } : { name: '', phone: '', notes: '' });
  const { errs, check, clear, fromServer } = useErrors();
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); clear(k); };
  const save = async () => {
    if (!check(checkSupplier(f))) return;
    try { if (s) await api.put(`/suppliers/${s._id}`, f); else await api.post('/suppliers', f); done('Supplier saved'); } catch (e) { fromServer(e, toast); }
  };
  const del = async () => { try { await api.del(`/suppliers/${s._id}`); done('Moved to the Recycle bin (Reports → Recycle bin) for 30 days'); } catch (e) { toast(e.message); } };
  return (
    <Modal title={s ? 'Edit supplier' : 'New supplier'} onClose={onClose}
      footer={<>{s && <ConfirmButton style={{ marginRight: 'auto' }} onConfirm={del} confirmText="Tap again to delete">Delete</ConfirmButton>}<button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <Field id="spName" label="Name" error={errs.name}><input id="spName" autoFocus maxLength={60} value={f.name} onChange={set('name')} placeholder="Matcha supplier, S&R, Puregold…" /></Field>
        <Field id="spPhone" label="Phone" error={errs.phone} hint="Optional"><input id="spPhone" maxLength={40} value={f.phone} onChange={set('phone')} placeholder="0917 123 4567" /></Field>
        <Field id="spNotes" label="Notes" error={errs.notes} hint="Optional · what you buy, delivery days, account number"><input id="spNotes" maxLength={200} value={f.notes} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  );
}

// Owner: tap the cost to change it right in the table
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
