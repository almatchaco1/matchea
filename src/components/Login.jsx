// Staff sign-in: pick your name, type your 6-digit PIN. Accounts with an older 4–8 digit PIN sign in once,
// then must set a new 6-digit PIN before the POS opens.
import { useEffect, useRef, useState } from 'react';
import { api, setToken } from '../lib/api';
import { checkPin, PIN_LEN } from '../shared/rules.mjs';
import '../login-v2.css';

const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const TILE_MAX = 6; // more staff than this: a dropdown instead of name tiles

export default function Login({ onLogin, notice, pending, onSignOut }) {
  const [staff, setStaff] = useState([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tries, setTries] = useState(0); // restarts the "wrong PIN" shake
  // New-PIN steps: 'current' (only when we don't know it) → 'new' → 'confirm'
  const [step, setStep] = useState(pending ? 'current' : 'signin');
  const [who, setWho] = useState(pending || null); // the signed-in user who must set a new PIN
  const cur = useRef(''), next = useRef(''), tokenRef = useRef('');
  // Keep the server awake while this screen is showing (free hosting sleeps after 15 minutes with no visits),
  // so the next person to sign in doesn't wait for it to wake up. Only while the page is visible.
  useEffect(() => {
    const ping = () => { if (document.visibilityState === 'visible') fetch('/api/health', { cache: 'no-store' }).catch(() => {}); };
    const t = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (pending) { setLoaded(true); return; }
    api.get('/auth/staff').then((s) => { setStaff(s); if (s.length === 1) setName(s[0].name); }).catch((e) => setErr(e.message)).finally(() => setLoaded(true));
  }, [pending]);

  const fail = (msg) => { setErr(msg); setPin(''); setTries((n) => n + 1); };

  const submit = async (p = pin) => {
    if (busy) return;
    if (step === 'signin') {
      if (!name) { setErr('Tap your name first.'); return; }
      if (p.length < 4) { setErr(`Enter your ${PIN_LEN}-digit PIN.`); return; }
      setBusy(true); setErr('');
      try {
        const r = await api.post('/auth/login', { name, pin: p });
        if (r.newPin) { setToken(r.token); tokenRef.current = r.token; cur.current = p; setWho(r.user); setPin(''); setStep('new'); }
        else onLogin(r.token, r.user, r.weakPin);
      } catch (e) { fail(e.message); }
      finally { setBusy(false); }
      return;
    }
    if (step === 'current') {
      if (p.length < 4) { setErr('Enter the PIN you use now.'); return; }
      cur.current = p; setPin(''); setErr(''); setStep('new'); return;
    }
    if (p.length !== PIN_LEN) { setErr(`Your new PIN needs ${PIN_LEN} digits.`); return; }
    if (step === 'new') {
      const e = checkPin(p).pin || (p === cur.current ? 'Choose a different PIN from your old one.' : '');
      if (e) { fail(e); return; }
      next.current = p; setPin(''); setErr(''); setStep('confirm'); return;
    }
    // confirm
    if (p !== next.current) { next.current = ''; setStep('new'); fail('The PINs didn’t match. Type your new PIN again.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.post('/auth/me/pin', { current: cur.current, pin: p });
      setToken(r.token);
      onLogin(r.token, r.user, false);
    } catch (e) {
      if (e.fields?.current) { cur.current = ''; next.current = ''; setStep('current'); fail(e.fields.current); }
      else { next.current = ''; setStep('new'); fail(e.fields?.pin || e.message); }
    } finally { setBusy(false); }
  };

  const max = step === 'signin' || step === 'current' ? 8 : PIN_LEN;
  const press = (d) => {
    if (busy || pin.length >= max) return;
    const p = pin + d;
    setPin(p); setErr('');
    if (p.length === PIN_LEN && (step !== 'signin' || name)) setTimeout(() => submit(p), 120); // 6 digits: go
  };
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const k = (e) => {
      if (e.target.closest?.('select,input')) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const leave = () => { setToken(null); tokenRef.current = ''; cur.current = ''; next.current = ''; setPin(''); setErr(''); setWho(null); setStep('signin'); onSignOut?.(); };
  const newPin = step !== 'signin';
  const slots = Math.max(PIN_LEN, pin.length);
  const title = { signin: 'Staff sign in', current: 'Set a new PIN', new: 'Choose a new PIN', confirm: 'Confirm your new PIN' }[step];
  const sub = {
    signin: staff.length > 1 ? 'Tap your name, then enter your PIN.' : 'Enter your PIN.',
    current: `PINs are now ${PIN_LEN} digits. First, enter the PIN you use now.`,
    new: `PINs are now ${PIN_LEN} digits. Choose one only you know.`,
    confirm: 'Type the same 6 digits again.',
  }[step];

  return (
    <div className="lg2">
      <div className="lg2-card">
        <aside className="lg2-brand" aria-hidden="true">
          <span className="lg2-lights">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
          <img className="lg2-word" src="/brand/matchea-word-sm.webp" alt="" width="420" height="128" />
          <p className="lg2-tag">Good Matcha, Good Mood</p>
          <p className="lg2-for">Point of sale · staff only</p>
        </aside>

        <form className="lg2-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {notice && !newPin && <div className="lg2-note" role="status">{notice}</div>}
          <header className="lg2-h">
            <h1>{title}</h1>
            <p>{sub}</p>
            {newPin && (
              <ol className="lg2-steps" aria-label="Steps">
                {(pending ? ['current', 'new', 'confirm'] : ['new', 'confirm']).map((s, i, all) => (
                  <li key={s} className={s === step ? 'on' : all.indexOf(step) > i ? 'done' : ''}>{{ current: 'Current PIN', new: 'New PIN', confirm: 'Confirm' }[s]}</li>
                ))}
              </ol>
            )}
          </header>

          {step === 'signin' && (staff.length > 1 && staff.length <= TILE_MAX ? (
            <div className="lg2-who" role="radiogroup" aria-label="Who's on the register?">
              {staff.map((s) => (
                <button type="button" key={s._id} role="radio" aria-checked={name === s.name} className={name === s.name ? 'on' : ''}
                  onClick={() => { setName(s.name); setErr(''); setPin(''); }}>
                  <span className="lg2-av">{initials(s.name)}</span>
                  <span className="lg2-nm">{s.name}<small>{s.role === 'admin' ? 'Admin' : 'Cashier'}</small></span>
                </button>
              ))}
            </div>
          ) : staff.length > TILE_MAX ? (
            <label className="lg2-select"><span>Who's on the register?</span>
              <select id="who" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }}>
                <option value="">Choose your name</option>
                {staff.map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
              </select>
            </label>
          ) : staff.length === 1 ? (
            <div className="lg2-one"><span className="lg2-av">{initials(staff[0].name)}</span><span>Signing in as <b>{staff[0].name}</b></span></div>
          ) : loaded && !err ? (
            <p className="lg2-empty">No staff accounts yet. Run <code>npm run seed</code> in the server folder to create the owner account.</p>
          ) : null)}

          {newPin && who && <div className="lg2-one"><span className="lg2-av">{initials(who.name)}</span><span>{who.name}</span></div>}

          <div className={`lg2-pin ${tries ? 'shake' : ''} ${err ? 'bad' : ''}`} key={tries} role="img" aria-label={`${pin.length} of ${PIN_LEN} digits entered`}>
            {Array.from({ length: slots }, (_, i) => <span key={i} className={i < pin.length ? 'on' : i === pin.length ? 'cur' : ''}><i /></span>)}
          </div>
          <div className="lg2-err" role="alert">{err}</div>

          <div className="lg2-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button type="button" key={d} onClick={() => press(d)}>{d}</button>)}
            <button type="button" className="lg2-del" onClick={back} aria-label="Delete">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z" /><path d="m12 9.5 5 5m0-5-5 5" /></svg>
            </button>
            <button type="button" onClick={() => press('0')}>0</button>
            <button type="submit" className="lg2-go" disabled={busy || pin.length < (step === 'signin' || step === 'current' ? 4 : PIN_LEN)} aria-label={step === 'signin' ? 'Sign in' : 'Next'}>
              {busy ? <span className="lg2-spin" aria-label="Please wait" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" /></svg>}
            </button>
          </div>

          {newPin
            ? <button type="button" className="lg2-link" onClick={leave}>Not you? Sign out</button>
            : <a className="lg2-link" href="/">← Customer site</a>}
          {step === 'new' && <p className="lg2-rules">No repeats like 111111, runs like 123456 or patterns like 121212.</p>}
        </form>
      </div>
    </div>
  );
}
