// Owner: shop expenses that aren't ingredients (rent, electricity, salaries…), by month.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso, dayKey } from '../lib/format';
import Modal, { ConfirmButton } from './Modal';
import { Field, useErrors } from './Field';
import { checkExpense, EXPENSE_CATS } from '../shared/rules.mjs';

const monthOf = (d) => d.slice(0, 7);
const monthLabel = (m) => new Date(m + '-01T12:00:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
const lastDay = (m) => { const [y, mo] = m.split('-').map(Number); return dayKey(new Date(y, mo, 0)); };
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return dayKey(d).slice(0, 7); };

export default function Expenses({ toast }) {
  const thisMonth = monthOf(dayKey());
  const [month, setMonth] = useState(thisMonth);
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null); // {} new or expense
  const load = useCallback(() => api.get(`/expenses?from=${month}-01&to=${lastDay(month)}`).then(setD).catch((e) => toast(e.message)), [month, toast]);
  useEffect(() => { setD(null); load(); }, [load]);
  const max = Math.max(1, ...(d?.byCat || []).map((c) => c.amount));

  return (
    <>
      <div className="toolbar">
        <div className="cl-date" style={{ margin: 0 }}>
          <button className="btn sm ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <b className="ex-month">{monthLabel(month)}</b>
          <button className="btn sm ghost" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth} aria-label="Next month">›</button>
        </div>
        <span className="grow" />
        <button className="btn primary" onClick={() => setEdit({})}>Add expense</button>
      </div>
      <p className="muted" style={{ marginTop: -4, fontSize: 13 }}>Rent, electricity, salaries and other costs that aren’t ingredients. They’re taken off your profit in Reports → Profit to show what you really take home.</p>

      <div className="two">
        <div className="panel tbl-wrap">
          {!d ? <div className="empty">Loading…</div> : !d.list.length ? <div className="empty">No expenses for {monthLabel(month)} yet. Tap “Add expense” to add one.</div> : (
            <table>
              <thead><tr><th>Date</th><th>For</th><th>Note</th><th className="r">Amount</th><th /></tr></thead>
              <tbody>
                {d.list.map((e) => (
                  <tr key={e._id}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</td>
                    <td><b>{e.cat}</b></td>
                    <td className="muted" style={{ fontSize: 13 }}>{e.note}</td>
                    <td className="r num"><b>{peso(e.amount)}</b></td>
                    <td className="r"><button className="btn sm ghost" onClick={() => setEdit(e)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}><b>Total</b></td><td className="r num"><b>{peso(d.total)}</b></td><td /></tr></tfoot>
            </table>
          )}
        </div>
        <div className="panel">
          <div className="card-h"><h3>By type</h3><span className="num"><b>{d ? peso(d.total) : '…'}</b></span></div>
          <div className="card-b">
            {!d?.byCat.length ? <div className="muted">—</div> : d.byCat.map((c) => (
              <div className="hbar" key={c.cat}><span className="t">{c.cat}</span><span className="n num">{peso(c.amount)}</span><div className="b"><i style={{ width: `${(c.amount / max) * 100}%`, background: 'var(--tan)' }} /></div></div>
            ))}
          </div>
        </div>
      </div>
      {edit && <ExpenseModal e={edit._id ? edit : null} month={month} onClose={() => setEdit(null)} toast={toast} done={(m) => { setEdit(null); toast(m); load(); }} />}
    </>
  );
}

function ExpenseModal({ e, month, onClose, done, toast }) {
  const today = dayKey();
  const [f, setF] = useState(() => (e ? { date: e.date, cat: e.cat, amount: String(e.amount), note: e.note || '' } : { date: monthOf(today) === month ? today : `${month}-01`, cat: '', amount: '', note: '' }));
  const { errs, check, clear, fromServer } = useErrors();
  const set = (k, v) => { setF({ ...f, [k]: v }); clear(k); };
  const save = async () => {
    if (!check(checkExpense(f))) return;
    try { if (e) await api.put(`/expenses/${e._id}`, f); else await api.post('/expenses', f); done(e ? 'Expense updated' : 'Expense added'); }
    catch (x) { fromServer(x, toast); }
  };
  const del = async () => { try { await api.del(`/expenses/${e._id}`); done('Moved to the Recycle bin (Reports → Recycle bin) for 30 days'); } catch (x) { toast(x.message); } };
  return (
    <Modal title={e ? 'Edit expense' : 'Add expense'} onClose={onClose}
      footer={<>{e && <ConfirmButton style={{ marginRight: 'auto' }} onConfirm={del} confirmText="Tap again to delete">Delete</ConfirmButton>}
        <button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
      <form onSubmit={(x) => { x.preventDefault(); save(); }} noValidate>
        <Field id="exCat" label="What was it for" error={errs.cat}>
          <div className="opts" style={{ marginBottom: 6 }}>{EXPENSE_CATS.map((c) => <button type="button" key={c} className="opt" aria-pressed={f.cat === c} onClick={() => set('cat', c)}>{c}</button>)}</div>
          <input id="exCat" maxLength={30} value={f.cat} onChange={(x) => set('cat', x.target.value)} placeholder="Or type your own" />
        </Field>
        <div className="row">
          <Field id="exAmt" label="Amount (₱)" error={errs.amount}>
            <input id="exAmt" type="number" inputMode="decimal" min="0" step="any" value={f.amount} onChange={(x) => set('amount', x.target.value)} placeholder="0.00" />
          </Field>
          <Field id="exDate" label="Date" error={errs.date}>
            <input id="exDate" type="date" max={today} value={f.date} onChange={(x) => set('date', x.target.value)} />
          </Field>
        </div>
        <Field id="exNote" label="Note" error={errs.note} hint="Optional · e.g. Meralco bill for August">
          <input id="exNote" maxLength={120} value={f.note} onChange={(x) => set('note', x.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
