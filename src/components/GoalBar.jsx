// Daily sales goal: today's sales against the target the owner set.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso } from '../lib/format';
import { leafBurst } from '../lib/motion';

export default function GoalBar({ refreshKey, isAdmin, toast, big = false }) {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null); // goal being typed
  const load = useCallback(() => api.get('/reports/today').then(setD).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load, refreshKey]);
  // Goal reached: a burst of gold and green leaves, once a day on this device
  const reached = !!d?.goal && d.net >= d.goal;
  useEffect(() => {
    if (!reached) return;
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    try { if (localStorage.getItem('matchaPos.goalParty') === day) return; localStorage.setItem('matchaPos.goalParty', day); } catch {}
    setTimeout(() => leafBurst(document.querySelector('.goal.done')), 300);
  }, [reached]);
  if (!d) return null;

  const save = async () => {
    const g = edit.trim() === '' ? 0 : Math.round(Number(edit.replace(/[₱,\s]/g, '')));
    if (!Number.isFinite(g) || g < 0) { toast('Enter an amount like 5000, or 0 to turn the goal off'); return; }
    try { await api.put('/settings/goal', { goal: g }); setEdit(null); toast(g ? `Daily goal set to ${peso(g)}` : 'Daily goal turned off'); load(); }
    catch (e) { toast(e.message); }
  };
  const editor = edit != null && (
    <form className="goal-edit" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <span>Daily goal ₱</span>
      <input autoFocus inputMode="numeric" value={edit} onChange={(e) => setEdit(e.target.value)} placeholder="5000" aria-label="Daily sales goal" />
      <button className="btn sm primary">Save</button>
      <button type="button" className="btn sm ghost" onClick={() => setEdit(null)}>Cancel</button>
    </form>
  );

  if (!d.goal) {
    if (!big || !isAdmin) return null;
    return editor || <div className="goal none"><span>No daily sales goal yet.</span> <button className="linkbtn" onClick={() => setEdit('')}>Set a goal</button></div>;
  }
  const pct = Math.min(100, Math.round((d.net / d.goal) * 100));
  const done = d.net >= d.goal;
  const left = Math.max(0, d.goal - d.net);
  return (
    <div className={`goal ${big ? 'big' : ''} ${done ? 'done' : ''}`}>
      <div className="goal-top">
        <span className="goal-lbl">{done ? 'Goal reached ✓' : 'Today’s goal'}</span>
        <span className="goal-num num"><b>{peso(d.net)}</b> of {peso(d.goal)} · {Math.round((d.net / d.goal) * 100)}%</span>
        {isAdmin && edit == null && <button className="goal-set" onClick={() => setEdit(String(d.goal))} title="Change the daily goal">✎</button>}
      </div>
      <div className="goal-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Daily sales goal"><i style={{ width: `${pct}%` }} /></div>
      {big && !done && <div className="goal-left muted">{peso(left)} to go · {d.orders} {d.orders === 1 ? 'order' : 'orders'} so far</div>}
      {editor}
    </div>
  );
}
