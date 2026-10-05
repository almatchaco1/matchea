// Owner's view of staff accounts: who's online, today's activity, lock/unlock, PINs, roles.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { peso, pad } from '../lib/format';
import Modal, { ConfirmButton } from './Modal';
import { Field, RowError, useErrors } from './Field';
import { checkStaff, checkStaffName, checkPin, LIMITS } from '../shared/rules.mjs';

const STATUS = {
  online: ['ok', 'Online now'],
  offline: ['mute', 'Offline'],
  paused: ['warn', 'Paused · wrong PINs'],
  locked: ['bad', 'Locked'],
};
const EVENT = {
  created: 'Account created', login: 'Signed in', logout: 'Signed out', wrong_pin: 'Wrong PIN entered',
  pin_lockout: 'Sign-in paused (too many wrong PINs)', blocked_login: 'Tried to sign in while locked',
  locked: 'Account locked', unlocked: 'Account unlocked', signed_out: 'Signed out by owner',
  pin_changed: 'PIN changed', renamed: 'Name changed', role_changed: 'Role changed', lockout_cleared: 'Wrong-PIN pause cleared', removed: 'Account removed', approved: 'Approved a cashier action',
};
const ALERT = new Set(['wrong_pin', 'pin_lockout', 'blocked_login', 'locked']);

export function ago(d) {
  if (!d) return 'Never';
  const s = Math.max(0, (Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'Yesterday' : days < 7 ? `${days} days ago` : new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
const when = (d) => new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Staff({ toast, user: me, onMe }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null); // { kind: 'lock'|'pin'|'activity', u }
  const [, tick] = useState(0);

  const load = useCallback(() => api.get('/auth/users').then((u) => { setUsers(u); setErr(''); }).catch((e) => setErr(e.message)), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    const t2 = setInterval(() => tick((x) => x + 1), 30000); // keep "5 min ago" fresh
    return () => { clearInterval(t); clearInterval(t2); };
  }, [load]);

  const patch = async (u, body, msg) => {
    try { await api.patch(`/auth/users/${u._id}`, body); toast(msg); load(); return true; }
    catch (e) { toast(e.message); return false; }
  };

  if (!users) return err ? <div className="banner">{err}</div> : <p className="muted">Loading staff…</p>;

  const online = users.filter((u) => u.status === 'online').length;
  const locked = users.filter((u) => u.status === 'locked').length;
  const todayTotal = users.reduce((a, u) => a + u.today.total, 0);
  const wrong = users.reduce((a, u) => a + u.today.wrongPins, 0);
  const order = { online: 0, paused: 1, offline: 2, locked: 3 };
  const iAmSuper = !!users.find((x) => x._id === me._id)?.superAdmin;
  const sorted = [...users].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

  return (
    <>
      <div className="toolbar">
        <h2 className="sec grow">Staff</h2>
        <span className="muted" style={{ fontSize: 13 }}>Updates every 20 seconds</span>
      </div>
      {err && <div className="banner">{err}</div>}

      <div className="stat-row">
        <div className="panel stat"><div className="k">Online now</div><div className="v">{online}<small className="muted" style={{ fontSize: 14 }}> / {users.length - locked}</small></div></div>
        <div className="panel stat"><div className="k">Sales by staff today</div><div className="v">{peso(todayTotal)}</div></div>
        <div className="panel stat"><div className="k">Locked accounts</div><div className="v">{locked}</div></div>
        <div className={`panel stat ${wrong ? 'stat-warn' : ''}`}><div className="k">Wrong PINs today</div><div className="v">{wrong}</div></div>
      </div>

      <div className="staff-grid">
        {sorted.map((u) => {
          const [tone, label] = STATUS[u.status];
          const isMe = u._id === me._id;
          return (
            <article key={u._id} className={`panel staff-card s-${u.status}`}>
              <header>
                <div className="staff-av" aria-hidden="true">{u.name.slice(0, 1).toUpperCase()}<i className={`sdot ${u.status}`} /></div>
                <div className="grow">
                  <b className="staff-nm">{u.name}{isMe && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}
                    {(!u.superAdmin || isMe) && <button type="button" className="staff-rename" onClick={() => setModal({ kind: 'rename', u })} aria-label={`Change ${u.name}'s name`} title="Change name"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l.6-2.7L10.8 3a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2L5.8 12.4 3 13Z" /></svg></button>}</b>
                  <small className="muted">{u.superAdmin ? 'Super admin' : u.role === 'admin' ? 'Admin' : 'Cashier'}</small>
                </div>
                <span className={`pill ${tone}`}>{label}</span>
              </header>

              {u.status === 'locked' && (
                <div className="staff-note bad">
                  Locked {ago(u.lockedAt).toLowerCase()}{u.lockedBy ? ` by ${u.lockedBy}` : ''}.{u.lockReason ? <> Reason: <i>{u.lockReason}</i></> : ''}
                </div>
              )}
              {u.needsNewPin && u.status !== 'locked' && <div className="staff-note warn">Still has an old PIN. They’ll be asked to set a 6-digit PIN when they next sign in, or set one for them with Change PIN.</div>}
              {u.status === 'paused' && <div className="staff-note warn">Too many wrong PINs. Sign-in opens again {new Date(u.lockedUntil).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}.</div>}

              <dl className="staff-facts">
                <div><dt>Last sign-in</dt><dd>{u.lastLoginAt ? ago(u.lastLoginAt) : 'Never'}</dd></div>
                <div><dt>Last active</dt><dd>{u.status === 'online' ? 'Now' : ago(u.lastSeenAt)}</dd></div>
                <div><dt>Sales today</dt><dd>{u.today.sales} · {peso(u.today.total)}</dd></div>
                <div><dt>Last sale</dt><dd>{u.today.lastSaleAt ? ago(u.today.lastSaleAt) : '—'}</dd></div>
                <div className={u.today.voids ? 'hl' : ''}><dt>Voids today</dt><dd>{u.today.voids}</dd></div>
                <div className={u.today.wrongPins ? 'hl' : ''}><dt>Wrong PINs today</dt><dd>{u.today.wrongPins}</dd></div>
              </dl>

              {/* Always the same 3 rows of 2 buttons, so a card never changes shape when someone's role or status changes */}
              <div className="staff-actions">
                <button className="btn sm" onClick={() => setModal({ kind: 'activity', u })}>Activity</button>
                {u.superAdmin && !isMe ? <Slot /> : <button className="btn sm" onClick={() => setModal({ kind: 'pin', u })}>Change PIN</button>}
                {u.superAdmin
                  ? <div className="sa-note"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>Super admin · can’t be locked, changed or removed</div>
                  : <>
                    {isMe ? <Slot /> : u.status === 'locked'
                      ? <button className="btn sm primary" onClick={() => patch(u, { active: true }, `${u.name} can sign in again`)}>Unlock</button>
                      : <button className="btn sm danger" onClick={() => setModal({ kind: 'lock', u })}>Lock</button>}
                    {isMe || u.status === 'locked' || (u.role === 'admin' && !iAmSuper) ? <Slot /> : (
                      <ConfirmButton className="btn sm ghost" confirmText={u.role === 'admin' ? 'Tap: make cashier' : 'Tap: make admin'}
                        onConfirm={() => patch(u, { role: u.role === 'admin' ? 'cashier' : 'admin' }, u.role === 'admin' ? `${u.name} is now a cashier` : `${u.name} is now an admin`)}>
                        {u.role === 'admin' ? 'Make cashier' : 'Make admin'}
                      </ConfirmButton>
                    )}
                    {u.status === 'paused'
                      ? <button className="btn sm ghost" onClick={() => patch(u, { clearLockout: true }, `${u.name} can try again now`)}>Let them try again</button>
                      : !isMe && u.status === 'online'
                        ? <ConfirmButton className="btn sm ghost" confirmText="Tap to sign out" onConfirm={() => patch(u, { signOut: true }, `${u.name} was signed out`)}>Sign out</ConfirmButton>
                        : <Slot />}
                    {isMe || (u.role === 'admin' && !iAmSuper) ? <Slot /> : <button className="btn sm ghost danger-text" onClick={() => setModal({ kind: 'remove', u })}>Remove</button>}
                  </>}
              </div>
            </article>
          );
        })}
      </div>

      <AddStaff toast={toast} onAdded={load} />

      {modal?.kind === 'lock' && <LockModal u={modal.u} onClose={() => setModal(null)} onLock={(reason) => patch(modal.u, { active: false, reason }, `${modal.u.name} is locked and signed out`).then((ok) => ok && setModal(null))} />}
      {modal?.kind === 'pin' && <PinModal u={modal.u} me={me} toast={toast} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.kind === 'rename' && <RenameModal u={modal.u} toast={toast} onClose={() => setModal(null)} onDone={(nu) => { setModal(null); load(); if (nu._id === me._id) onMe?.({ ...me, name: nu.name }); }} />}
      {modal?.kind === 'activity' && <ActivityModal u={modal.u} onClose={() => setModal(null)} />}
      {modal?.kind === 'remove' && <RemoveModal u={modal.u} toast={toast} onClose={() => setModal(null)} onLock={() => setModal({ kind: 'lock', u: modal.u })} onDone={() => { setModal(null); load(); }} />}
    </>
  );
}

// Empty space that keeps the button grid the same on every card
const Slot = () => <span className="sa-slot" aria-hidden="true" />;

function LockModal({ u, onClose, onLock }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState('');
  const go = async (ev) => {
    ev.preventDefault();
    if (reason.trim().length > 120) return setE('Keep the reason under 120 characters.');
    setBusy(true); await onLock(reason.trim()); setBusy(false);
  };
  return (
    <Modal title={`Lock ${u.name}'s account?`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn danger" form="lockf" disabled={busy}>{busy ? 'Locking…' : 'Lock account'}</button></>}>
      <form id="lockf" onSubmit={go} noValidate>
        <p style={{ marginTop: 0 }}>{u.name} will be signed out right away and can't sign in until you unlock the account. Their past sales stay in your reports.</p>
        <Field id="lockReason" label="Reason (optional)" error={e} hint={`${u.name} sees this if they try to sign in.`}>
          <input id="lockReason" value={reason} maxLength={140} placeholder="e.g. On leave until Monday" onChange={(x) => { setReason(x.target.value); setE(''); }} autoFocus />
        </Field>
      </form>
    </Modal>
  );
}

function RemoveModal({ u, toast, onClose, onLock, onDone }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = typed.trim().toLowerCase() === u.name.toLowerCase();
  const go = async (e) => {
    e.preventDefault();
    if (!ok) return setErr(`Type ${u.name} to confirm.`);
    setBusy(true);
    try { await api.del(`/auth/users/${u._id}`); toast(`${u.name} was removed`); onDone(); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <Modal title={`Remove ${u.name}?`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn danger" form="rmf" disabled={busy || !ok}>{busy ? 'Removing…' : 'Remove for good'}</button></>}>
      <form id="rmf" onSubmit={go} noValidate>
        <p style={{ marginTop: 0 }}>This deletes {u.name}'s account and signs them out right away. It can't be undone.</p>
        <ul className="muted" style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 14 }}>
          <li>Their past sales stay in your reports under their name.</li>
          <li>If they might come back, <button type="button" className="linkbtn" onClick={onLock}>lock the account</button> instead.</li>
        </ul>
        <Field id="rmName" label={`Type ${u.name} to confirm`} error={err}>
          <input id="rmName" value={typed} autoComplete="off" autoFocus onChange={(e) => { setTyped(e.target.value); setErr(''); }} />
        </Field>
      </form>
    </Modal>
  );
}

function RenameModal({ u, toast, onClose, onDone }) {
  const [name, setName] = useState(u.name);
  const [e, setE] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (ev) => {
    ev.preventDefault();
    const ne = checkStaffName(name);
    if (ne.name) return setE(ne.name);
    if (name.trim().replace(/\s+/g, ' ') === u.name) return onClose();
    setBusy(true);
    try { const nu = await api.patch(`/auth/users/${u._id}`, { name }); toast(`${u.name} is now ${nu.name}`); onDone(nu); }
    catch (err) { setE(err.fields?.name || err.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Change ${u.name}'s name`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" form="renf" disabled={busy}>{busy ? 'Saving…' : 'Save name'}</button></>}>
      <form id="renf" onSubmit={save} noValidate>
        <Field id="renName" label="Name" error={e} hint="Shown on the sign-in screen and on new sales. Past sales keep the old name.">
          <input id="renName" value={name} maxLength={LIMITS.staffName} autoComplete="off" autoFocus onChange={(x) => { setName(x.target.value); setE(''); }} />
        </Field>
      </form>
    </Modal>
  );
}

function PinModal({ u, me, toast, onClose, onDone }) {
  const [pin, setPin] = useState('');
  const [e, setE] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (ev) => {
    ev.preventDefault();
    const pe = checkPin(pin);
    if (pe.pin) return setE(pe.pin);
    setBusy(true);
    try { await api.patch(`/auth/users/${u._id}`, { pin }); toast(`PIN changed for ${u.name}`); onDone(); }
    catch (err) { setE(err.fields?.pin || err.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`New PIN for ${u.name}`} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" form="pinf" disabled={busy}>{busy ? 'Saving…' : 'Save PIN'}</button></>}>
      <form id="pinf" onSubmit={save} noValidate>
        <Field id="newPin" label="PIN (6 digits)" error={e} hint={u._id === me._id ? 'Use this next time you sign in.' : `${u.name} will be signed out and must use the new PIN.`}>
          <input id="newPin" inputMode="numeric" maxLength={6} value={pin} autoFocus onChange={(x) => { setPin(x.target.value.replace(/\D/g, '')); setE(''); }} />
        </Field>
      </form>
    </Modal>
  );
}

function ActivityModal({ u, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get(`/auth/users/${u._id}/activity`).then(setD).catch((e) => setErr(e.message)); }, [u._id]);
  return (
    <Modal title={`${u.name} · activity`} wide onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      {err && <RowError msg={err} />}
      {!d && !err && <p className="muted">Loading…</p>}
      {d && (
        <div className="act-cols">
          <section>
            <h4>Account activity</h4>
            {!d.log.length ? <p className="muted">Nothing yet.</p> : (
              <ol className="act-log">
                {d.log.map((l) => (
                  <li key={l._id} className={ALERT.has(l.type) ? 'alert' : ''}>
                    <span className="t">{when(l.createdAt)}</span>
                    <span>
                      <b>{EVENT[l.type] || l.type}</b>
                      {l.note && <small> · {l.note}</small>}
                      {l.by && l.by !== u.name && <small> · by {l.by}</small>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            <p className="muted" style={{ fontSize: 12 }}>Kept for 180 days.</p>
          </section>
          <section>
            <h4>Recent sales</h4>
            {!d.sales.length ? <p className="muted">No sales yet.</p> : (
              <table>
                <tbody>
                  {d.sales.map((s) => (
                    <tr key={s._id}>
                      <td>#{pad(s.no)}{s.source === 'online' && <span className="pill mute" style={{ marginLeft: 6 }}>Online</span>}</td>
                      <td className="muted">{when(s.createdAt)}</td>
                      <td className="r">{s.status === 'void' ? <span className="pill bad" title={s.voidReason}>Void</span> : peso(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function AddStaff({ toast, onAdded }) {
  const [f, setF] = useState({ name: '', pin: '', role: 'cashier' });
  const { errs, check, clear, fromServer } = useErrors();
  const add = async (e) => {
    e.preventDefault();
    if (!check(checkStaff(f))) return;
    try { await api.post('/auth/users', f); toast(`${f.name.trim()} added`); setF({ name: '', pin: '', role: 'cashier' }); onAdded(); }
    catch (err) { fromServer(err, toast); }
  };
  return (
    <section className="panel" style={{ marginTop: 16, padding: 16 }}>
      <h3 style={{ margin: '0 0 10px' }}>Add a staff member</h3>
      <form className="row" style={{ alignItems: 'flex-start' }} onSubmit={add} noValidate>
        <Field id="nName" label="Name" error={errs.name} hint="Shown on the sign-in screen">
          <input id="nName" value={f.name} maxLength={LIMITS.staffName} onChange={(e) => { setF({ ...f, name: e.target.value }); clear('name'); }} />
        </Field>
        <Field id="nPin" label="PIN (6 digits)" error={errs.pin} hint="No repeats like 111111, runs like 123456 or patterns like 121212">
          <input id="nPin" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => { setF({ ...f, pin: e.target.value.replace(/\D/g, '') }); clear('pin'); }} />
        </Field>
        <Field id="nRole" label="Role" hint={f.role === 'admin' ? 'Can change menu, prices and staff' : 'Register and online orders only'}>
          <select id="nRole" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="cashier">Cashier</option><option value="admin">Admin</option></select>
        </Field>
        <button className="btn primary" style={{ marginTop: 21 }}>Add staff</button>
      </form>
    </section>
  );
}
