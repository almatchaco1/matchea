// Profit per drink (owner): sales minus what the ingredients cost.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso } from '../lib/format';

const COLS = [['name', 'Drink'], ['qty', 'Sold'], ['sales', 'Sales'], ['cost', 'Ingredients'], ['profit', 'Profit'], ['margin', 'Margin'], ['perCup', 'Profit / cup']];

export default function Profit({ from, to, toast, onData, goInventory, goExpenses }) {
  const [d, setD] = useState(null);
  const [sort, setSort] = useState(['profit', -1]);
  useEffect(() => {
    let live = true; setD(null);
    api.get(`/reports/profit?from=${from}&to=${to}`).then((x) => { if (live) { setD(x); onData?.(x); } }).catch((e) => toast(e.message));
    return () => { live = false; };
  }, [from, to, toast, onData]);
  if (!d) return <div className="empty">Loading…</div>;

  const [k, dir] = sort;
  const rows = [...d.drinks].sort((a, b) => (k === 'name' ? a.name.localeCompare(b.name) * -dir : (a[k] - b[k]) * dir));
  const margin = d.net > 0 ? Math.round((d.profit / d.net) * 1000) / 10 : 0;
  const maxP = Math.max(1, ...d.drinks.map((x) => Math.abs(x.profit)));

  return (
    <>
      <div className="pf-flow panel">
        <div><span>Net sales</span><b className="num">{peso(d.net)}</b><small>after {peso(d.disc)} discounts</small></div>
        <i>−</i>
        <div><span>Ingredients</span><b className="num">{peso(d.ingCost)}</b><small>matcha, milk, cups…</small></div>
        <i>−</i>
        <div><span>Staff drinks</span><b className="num">{peso(d.staff?.cost || 0)}</b><small>{d.staff?.drinks ? `${d.staff.drinks} drinks · ingredient cost` : 'none'}</small></div>
        <i>=</i>
        <div className="pf-gross"><span>Gross profit</span><b className="num">{peso(d.profit)}</b><small>{margin}% of sales</small></div>
        <i>−</i>
        <div><span>Expenses</span><b className="num">{peso(d.expenses || 0)}</b><small>{d.expenses ? 'rent, bills, salaries…' : goExpenses ? <button className="linkbtn" onClick={goExpenses}>add expenses</button> : 'none added'}</small></div>
        <i>=</i>
        <div className={`pf-total ${d.takeHome < 0 ? 'neg' : ''}`}><span>Take-home profit</span><b className="num">{peso(d.takeHome ?? d.profit)}</b><small>{d.net > 0 ? `${Math.round(((d.takeHome ?? d.profit) / d.net) * 1000) / 10}% of sales` : '—'}</small></div>
      </div>
      <p className="muted pf-note">Take-home profit is after the expenses you added for these dates. {d.estimated > 0 && `${d.estimated}% of these drinks were sold before costs were saved with each order, so their cost uses today's ingredient prices. `}
        {d.missingCosts > 0 && <>{d.missingCosts} {d.missingCosts === 1 ? 'ingredient has' : 'ingredients have'} no cost yet, so profit looks higher than it is. {goInventory && <button className="linkbtn" onClick={goInventory}>Add costs in Inventory</button>}</>}</p>

      {d.staff?.drinks > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="card-h"><h3>Staff drinks</h3><span className="muted" style={{ fontSize: 12 }}>{d.staff.drinks} drinks · menu value {peso(d.staff.value)} · cost {peso(d.staff.cost)}</span></div>
          <div className="card-b">{d.staff.people.map((p) => <div className="cl-row" key={p.name}><span>{p.name} <span className="muted">×{p.drinks}</span></span><span className="num">{peso(p.cost)} <span className="muted">(value {peso(p.value)})</span></span></div>)}</div>
        </div>
      )}
      <div className="panel tbl-wrap">
        {!rows.length ? <div className="empty">No sales in this period.</div> : (
          <table className="pf-table">
            <thead><tr>{COLS.map(([key, label]) => (
              <th key={key} className={key === 'name' ? '' : 'r'} aria-sort={k === key ? (dir < 0 ? 'descending' : 'ascending') : 'none'}>
                <button className="th-sort" onClick={() => setSort([key, k === key ? -dir : key === 'name' ? 1 : -1])}>
                  {label}{k === key ? (dir < 0 ? ' ↓' : ' ↑') : ''}</button>
              </th>))}</tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.name}>
                  <td><b>{x.name}</b><div className="pf-bar"><i style={{ width: `${(Math.max(0, x.profit) / maxP) * 100}%` }} /></div></td>
                  <td className="r num">{x.qty}</td>
                  <td className="r num">{peso(x.sales)}</td>
                  <td className="r num muted">{peso(x.cost)}</td>
                  <td className="r num"><b>{peso(x.profit)}</b></td>
                  <td className="r num"><span className={`pill ${x.margin >= 60 ? 'ok' : x.margin >= 40 ? 'warn' : 'bad'}`}>{x.margin}%</span></td>
                  <td className="r num">{peso(x.perCup)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted pf-note">Drink sales are before order discounts. Margin: green 60% or more, amber 40–60%, red below 40%.</p>
    </>
  );
}
