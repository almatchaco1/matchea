// Owner: the Archive. Deleted drinks, ingredients, expenses, staff accounts and menu options (sizes, milks,
// add-ons, delivery areas) are kept here until you delete them for good, so a wrong tap can always be undone.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { ConfirmButton } from './Modal';
import { usePage, Pager } from '../lib/Pager';

const KIND = { product: ['Drink', 'Menu'], ingredient: ['Ingredient', 'Inventory'], expense: ['Expense', 'Reports → Expenses'], user: ['Staff', 'Staff'], option: ['Option', 'Menu → Shop & options'] };
const kindOf = (t) => (t.kind === 'option' ? t.what || 'Option' : KIND[t.kind]?.[0] || t.kind);
const when = (d) => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const FILTERS = [['all', 'All'], ['product', 'Drinks'], ['ingredient', 'Ingredients'], ['expense', 'Expenses'], ['user', 'Staff'], ['option', 'Options']];

export default function RecycleBin({ toast, refresh }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const [only, setOnly] = useState('all');
  const [q, setQ] = useState('');
  const load = useCallback(() => api.get('/trash').then(setList).catch((e) => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
  const shown = useMemo(() => (list || []).filter((t) => (only === 'all' || t.kind === only) && (!q.trim() || `${t.name} ${kindOf(t)} ${t.by || ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [list, only, q]);
  const pg = usePage(shown, `${only}|${q}`); // 10 a page
  const restore = async (t) => {
    setBusy(t._id);
    try {
      const r = await api.post(`/trash/${t._id}/restore`);
      toast(`${t.name} is back in ${KIND[t.kind]?.[1] || 'its tab'}.${r.notes?.length ? ' ' + r.notes.join(' ') : ''}`);
      load(); refresh?.();
    } catch (e) { toast(e.message); }
    finally { setBusy(''); }
  };
  const forever = async (t) => { try { await api.del(`/trash/${t._id}`); load(); } catch (e) { toast(e.message); } };
  const count = (k) => (list || []).filter((t) => k === 'all' || t.kind === k).length;
  return (
    <>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Everything you delete comes here: drinks, ingredients, expenses, staff accounts, and sizes, milks, add-ons or delivery areas you remove. It stays until you delete it for good. Tap <b>Restore</b> to put one back exactly as it was.</p>
      {list && list.length > 0 && (
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div className="cats" style={{ margin: 0 }}>
            {FILTERS.filter(([k]) => k === 'all' || count(k)).map(([k, n]) => <button key={k} className="chip" aria-pressed={only === k} onClick={() => setOnly(k)}>{n} <span className="muted num">{count(k)}</span></button>)}
          </div>
          <span className="grow" />
          <input className="search" type="search" placeholder="Find in the archive…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find in the archive" style={{ maxWidth: 260 }} />
        </div>
      )}
      <div className="panel tbl-wrap">
        {!list ? <div className="empty">Loading…</div> : !list.length ? <div className="empty">The archive is empty.</div> : !shown.length ? <div className="empty">Nothing matches.</div> : (
          <table>
            <thead><tr><th>What</th><th>Name</th><th>Deleted</th><th>By</th><th /></tr></thead>
            <tbody>
              {pg.rows.map((t) => (
                <tr key={t._id}>
                  <td><span className="pill mute">{kindOf(t)}</span></td>
                  <td><b>{t.name}</b></td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{when(t.createdAt)}</td>
                  <td>{t.by}</td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm primary" disabled={busy === t._id} onClick={() => restore(t)}>{busy === t._id ? 'Restoring…' : 'Restore'}</button>{' '}
                    <ConfirmButton className="btn sm ghost" confirmText="Delete forever?" onConfirm={() => forever(t)}>Delete</ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pager {...pg} what="items" />
    </>
  );
}
