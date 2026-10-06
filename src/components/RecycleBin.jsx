// Owner: deleted drinks, ingredients and expenses, kept 30 days so a wrong tap can be undone.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ConfirmButton } from './Modal';

const KIND = { product: ['Drink', 'Menu'], ingredient: ['Ingredient', 'Inventory'], expense: ['Expense', 'Reports → Expenses'] };
const when = (d) => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const daysLeft = (d) => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 864e5));

export default function RecycleBin({ toast, refresh }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => api.get('/trash').then(setList).catch((e) => toast(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);
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
  return (
    <>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Deleted drinks, ingredients and expenses stay here for 30 days. Tap <b>Restore</b> to put one back exactly as it was.</p>
      <div className="panel tbl-wrap">
        {!list ? <div className="empty">Loading…</div> : !list.length ? <div className="empty">The recycle bin is empty.</div> : (
          <table>
            <thead><tr><th>What</th><th>Name</th><th>Deleted</th><th>By</th><th className="r">Kept for</th><th /></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t._id}>
                  <td><span className="pill mute">{KIND[t.kind]?.[0] || t.kind}</span></td>
                  <td><b>{t.name}</b></td>
                  <td className="num" style={{ whiteSpace: 'nowrap' }}>{when(t.createdAt)}</td>
                  <td>{t.by}</td>
                  <td className="r num muted">{daysLeft(t.expiresAt)} days</td>
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
    </>
  );
}
