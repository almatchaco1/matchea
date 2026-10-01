// "Ask an admin" pop-up: an admin types their PIN to approve one cashier action (big discount, void, pickup without code).
import { useState } from 'react';
import { api } from '../lib/api';
import Modal from './Modal';
import { Field } from './Field';

const WHAT = { discount: 'give this discount', void: 'void this sale', pickup: 'hand over this order without its pickup code' };

export default function AdminPin({ action, detail, onApproved, onClose }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) { setErr('Enter the admin’s 4–8 digit PIN.'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post('/auth/override', { action, pin }); onApproved(r.token, r.by); }
    catch (e2) { setErr(e2.fields?.pin || e2.message); setPin(''); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Admin approval needed" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" form="adminPinF" disabled={busy}>{busy ? 'Checking…' : 'Approve'}</button></>}>
      <p className="muted" style={{ margin: 0 }}>Ask an admin to type their PIN to {WHAT[action] || 'continue'}.{detail ? <> <b>{detail}</b></> : null}</p>
      <form id="adminPinF" onSubmit={submit} noValidate>
        <Field id="adminPin" label="Admin PIN" error={err}>
          <input id="adminPin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} autoFocus
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setErr(''); }} className="pin-in" />
        </Field>
      </form>
      <p className="fhint" style={{ margin: 0 }}>The admin’s name is saved with the sale.</p>
    </Modal>
  );
}
