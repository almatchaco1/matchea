import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function Login({ onLogin, notice }) {
  const [staff, setStaff] = useState([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tries, setTries] = useState(0); // restarts the "wrong PIN" shake

  useEffect(() => {
    api.get('/auth/staff').then((s) => { setStaff(s); if (s.length === 1) setName(s[0].name); }).catch((e) => setErr(e.message)).finally(() => setLoaded(true));
  }, []);

  const submit = async (p = pin) => {
    if (busy) return;
    if (!name) { setErr('Choose your name first.'); return; }
    if (p.length < 4) { setErr('Enter your 4–8 digit PIN.'); return; }
    setBusy(true); setErr('');
    try { const r = await api.post('/auth/login', { name, pin: p }); onLogin(r.token, r.user, r.weakPin); }
    catch (e) { setErr(e.message); setPin(''); setTries((n) => n + 1); }
    finally { setBusy(false); }
  };
  const press = (d) => { if (pin.length < 8) setPin(pin + d); };

  useEffect(() => {
    const k = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  return (
    <div className="login">
      <form className="panel login-card" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {notice && <div className="banner" role="status" style={{ marginBottom: 14 }}>{notice}</div>}
        <div className="brand"><span className="seal-logo"><img src="/brand/matchea-seal.webp" alt="" width="512" height="512" /></span><div><h1>Sign in</h1><small>Staff only</small></div></div>
        <p className="login-tag" aria-hidden="true">Good Matcha, Good Mood</p>
        {staff.length > 1 ? (
          <div className="field">
            <label htmlFor="who">Who's on the register?</label>
            <select id="who" value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">Choose your name</option>
              {staff.map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        ) : staff.length === 1 ? (
          <p className="login-who">Signing in as <b>{staff[0].name}</b>. Enter your PIN.</p>
        ) : loaded && !err ? (
          <p className="login-who">No staff accounts yet. Run <code>npm run seed</code> in the server folder to create the owner account.</p>
        ) : null}
        <div className={`pindots ${tries ? 'shake' : ''}`} key={tries} aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
        </div>
        <div className="pinpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button type="button" key={d} onClick={() => press(d)}>{d}</button>)}
          <button type="button" onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete">⌫</button>
          <button type="button" onClick={() => press('0')}>0</button>
          <button type="submit" className="primary enter" disabled={busy}>{busy ? <span className="pin-spin" aria-label="Signing in" /> : 'Enter'}</button>
        </div>
        <div className="err" role="alert">{err}</div>
        <a className="login-back" href="/">← Customer site</a>
      </form>
    </div>
  );
}
