import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso, qfmt } from '../lib/format';
import Modal, { ConfirmButton } from './Modal';
import { Field, useErrors } from './Field';
import { checkIngredient, checkStockQty, LIMITS, UNITS, PACK_NAMES, unitCostOf } from '../shared/rules.mjs';
import { usePage, Pager } from '../lib/Pager';
import StockBoard from './StockBoard';

const REASON = { sale: 'Sale', void: 'Void', receive: 'Received', count: 'Count', create: 'Opening stock', waste: 'Waste (old)', staff: 'Staff drink' };

export default function Inventory({ data, refresh, toast, isAdmin, openRestock, onRestockShown }) {
  const [modal, setModal] = useState(null); // { kind: 'recv'|'count'|'edit'|'new'|'history'|'countall', ing }
  const changed = (m) => { setModal(null); toast(m); refresh(); };
  const list = data.ingredients;

  return (
    <>
      <div className="toolbar rp-head">
        <h2 className="sec grow">Inventory</h2>
      </div>

      <StockBoard data={data} isAdmin={isAdmin} toast={toast} refresh={refresh}
        openList={openRestock} onListShown={onRestockShown}
        onAct={(kind, ing) => setModal({ kind, ing })} />

      {modal?.kind === 'recv' && <ReceiveModal ing={modal.ing} list={list} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal?.kind === 'count' && <QtyModal {...modal} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal?.kind === 'countall' && <CountAllModal list={list} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal && (modal.kind === 'edit' || modal.kind === 'new') && <IngredientModal ing={modal.ing} packFirst={!!modal.pack} onClose={() => setModal(null)} done={changed} toast={toast} />}
      {modal?.kind === 'history' && <HistoryModal ing={modal.ing} onClose={() => setModal(null)} />}
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
  const del = async () => { try { await api.del(`/ingredients/${ing._id}`); done('Moved to the Archive (Reports → Archive). You can restore it there.'); } catch (e) { toast(e.message); } };
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
  const pg = usePage(moves); // 10 a page
  return (
    <Modal title={`History · ${ing.name}`} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Close</button>}>
      {!moves ? <div className="empty">Loading…</div> : !moves.length ? <div className="empty">No stock changes yet.</div> : (
        <div className="tbl-wrap"><table>
          <thead><tr><th>When</th><th>What</th><th className="r">Change</th><th className="r">After</th><th>By</th></tr></thead>
          <tbody>{pg.rows.map((m) => (
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
      {moves && <Pager {...pg} what="changes" />}
    </Modal>
  );
}

const money = (v) => (v === '' ? null : +v);

// Delivery arrived: how much, from whom, and what you paid (updates the cost per unit)
function ReceiveModal({ ing: first, list, onClose, done, toast }) {
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
  const [note, setNote] = useState('');
  const [confirmBig, setConfirmBig] = useState(false);
  const [busy, setBusy] = useState(false);
  const { errs, check, clear, fromServer } = useErrors();
  const n = parseFloat(qty);
  const unit = !isNaN(n) && n > 0 && paid !== '' && +paid >= 0 ? +paid / n : null;
  const bigReceive = ing && !isNaN(n) && ing.reorder > 0 && n > ing.reorder * 20;
  const priceJump = ing && unit != null && ing.cost > 0 && (unit > ing.cost * 2 || unit < ing.cost / 2);
  const save = async () => {
    if (!ing) return;
    const e = { ...checkStockQty(qty, 'receive') };
    if (usePk && !(Number.isFinite(+packs) && +packs > 0)) e.qty = `Enter how many ${pk.name}s you received.`;
    if (paid !== '' && !(+paid >= 0)) e.paid = 'Enter what you paid, like 1250, or leave it blank.';
    if (!check(e)) return;
    if ((bigReceive || priceJump) && !confirmBig) { setConfirmBig(true); return; }
    setBusy(true);
    try {
      const r = await api.post(`/ingredients/${ing._id}/receive`, { qty: n, paid: money(paid), note });
      done(`${ing.name}: ${qfmt(r.stock)} ${ing.unit}${unit != null ? ` · now ${r.pack?.size ? `${peso(r.pack.cost)} per ${r.pack.name}` : `${peso(r.cost)} per ${ing.unit}`}` : ''}`);
    } catch (x) { fromServer(x, toast); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Add stock${ing ? ` · ${ing.name}` : ''}`} aside={ing && <span className="muted num">On hand {qfmt(ing.stock)} {ing.unit}</span>} onClose={onClose}
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
