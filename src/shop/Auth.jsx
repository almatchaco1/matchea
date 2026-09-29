// Sign up / sign in: mobile number + password, Google, Facebook. Plus the "add your number" step.
import { useEffect, useRef, useState } from 'react';
import { call, loadScript } from './api';
import { checkSignup, checkPhone, checkCustomerName, checkPassword, normPhone, fmtPhoneInput, cleanName } from '../shared/rules.mjs';

let config = null;
const getConfig = () => { if (!config) config = call('GET', '/customer/config').catch(() => ({})); return config; };

export function AuthPage({ mode, go, onSignedIn, shop }) {
  const signup = mode === 'signup';
  const [f, setF] = useState({ name: '', phone: '', password: '', agree: false, website: '' });
  const [errs, setErrs] = useState({});
  const shownAt = useRef(Date.now()); // bot guard: how long the form took
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [verify, setVerify] = useState(null); // waiting for the emailed / texted code
  const finish = (r) => (r?.verify ? setVerify(r.verify) : onSignedIn(r));
  useEffect(() => { getConfig().then(setCfg); }, []);
  useEffect(() => { setErrs({}); setMsg(''); shownAt.current = Date.now(); }, [mode]);
  // Back from Google: pick up the result the server kept for us (one-time key in the address)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const key = q.get('g'), gerr = q.get('gerr');
    if (!key && !gerr) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (gerr) { setMsg(gerr); return; }
    setBusy(true);
    call('POST', '/customer/google/claim', { key }).then(finish).catch((e) => setMsg(e.message)).finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => {
    const raw = e.target.value;
    // sign-in accepts an email too: only format it as a phone number when it looks like one
    const v = k === 'agree' ? e.target.checked : k === 'phone' && (signup || /^[\d\s+()-]*$/.test(raw)) ? fmtPhoneInput(raw) : raw;
    setF({ ...f, [k]: v }); setErrs((p) => { const n = { ...p }; delete n[k]; return n; });
  };
  const next = window.location.search;

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    const byEmail = !signup && f.phone.includes('@');
    const v = signup ? checkSignup(f) : { ...(byEmail ? (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.phone.trim()) ? {} : { phone: 'Enter an email like name@gmail.com.' }) : checkPhone(f.phone)), ...(f.password ? {} : { password: 'Enter your password.' }) };
    setErrs(v);
    if (Object.keys(v).length) { setTimeout(() => document.querySelector('.au .invalid input')?.focus(), 20); return; }
    setBusy(true);
    const ft = Date.now() - shownAt.current;
    try { finish(await call('POST', signup ? '/customer/signup' : '/customer/login', signup ? { ...f, name: cleanName(f.name), ft } : { phone: f.phone, password: f.password, website: f.website })); }
    catch (err) { if (err.fields) setErrs(err.fields); else setMsg(err.message); }
    finally { setBusy(false); }
  };
  const social = async (kind, body) => {
    setMsg(''); setBusy(true);
    try { finish(await call('POST', `/customer/${kind}`, body)); }
    catch (err) { setMsg(err.message); }
    finally { setBusy(false); }
  };

  if (verify) return <div className="au"><div className="au-card"><CodeStep verify={verify} endpoint="/customer/verify" onDone={onSignedIn} onBack={() => setVerify(null)} /></div></div>;

  return (
    <div className="au">
      <div className="au-card">
        <img className="au-logo" src="/brand/logo.svg" alt="AL Matcha Co" width="72" height="72" />
        <div className="au-tabs" role="tablist">
          <a role="tab" aria-selected={!signup} href={'/signin' + next} onClick={(e) => { e.preventDefault(); go('/signin' + next, { replace: true }); }}>Sign in</a>
          <a role="tab" aria-selected={signup} href={'/signup' + next} onClick={(e) => { e.preventDefault(); go('/signup' + next, { replace: true }); }}>Create account</a>
        </div>
        <h1>{signup ? 'Join AL Matcha Co' : 'Welcome back'}</h1>
        <p className="au-sub">{signup ? 'Order ahead, track your drinks, and pay your way.' : 'Sign in to order ahead and see your orders.'}</p>

        {cfg && (cfg.googleClientId || cfg.facebookAppId) && (
          <>
            <div className="au-social">
              {cfg.googleClientId && <GoogleButton clientId={cfg.googleClientId} signup={signup} onCredential={(credential) => social('google', { credential })} onError={setMsg} />}
              {cfg.facebookAppId && <FacebookButton appId={cfg.facebookAppId} version={cfg.facebookVersion} disabled={busy} onToken={(accessToken) => social('facebook', { accessToken })} onError={setMsg} />}
            </div>
            <p className="au-agree-note">By continuing, you agree to our <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>
            <div className="au-or"><span>or use your mobile number</span></div>
          </>
        )}

        <form onSubmit={submit} noValidate className="au-form">
          {signup && (
            <Field label="Your name" error={errs.name}>
              <input value={f.name} onChange={set('name')} onBlur={() => setF((x) => ({ ...x, name: cleanName(x.name) }))} autoComplete="name" maxLength={40} placeholder="Ana Reyes" />
            </Field>
          )}
          {signup ? (
            <Field label="Mobile number" error={errs.phone}>
              <div className="au-phone"><span>PH</span><input value={f.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" maxLength={13} /></div>
            </Field>
          ) : (
            <Field label="Mobile number or email" error={errs.phone}>
              <input value={f.phone} onChange={set('phone')} autoComplete="username" autoCapitalize="none" placeholder="0917 123 4567 or name@gmail.com" maxLength={80} />
            </Field>
          )}
          <Field label="Password" error={errs.password} hint={signup ? 'At least 8 characters, with letters and numbers.' : ''}>
            <PasswordBox value={f.password} onChange={set('password')} show={show} setShow={setShow} autoComplete={signup ? 'new-password' : 'current-password'} />
          </Field>
          {/* bot guard: people never see or fill this box */}
          <input className="au-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={set('website')} />
          {signup && (
            <label className={`au-check ${errs.agree ? 'invalid' : ''}`}>
              <input type="checkbox" checked={f.agree} onChange={set('agree')} />
              <span>I agree to the <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span>
            </label>
          )}
          {errs.agree && <small className="au-err" role="alert">{errs.agree}</small>}
          {msg && <div className="shop-alert" role="alert">{msg}</div>}
          <button className="sh-btn big" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="au-foot">
          {signup ? 'Already have an account? ' : 'New here? '}
          <a href={(signup ? '/signin' : '/signup') + next} onClick={(e) => { e.preventDefault(); go((signup ? '/signin' : '/signup') + next, { replace: true }); }}>{signup ? 'Sign in' : 'Create an account'}</a>
        </p>
        {!signup && <p className="au-fine"><a href="/forgot" onClick={(e) => { e.preventDefault(); go('/forgot'); }}>Forgot your password?</a></p>}
        {signup && <p className="au-fine">We only use your number for your orders{shop?.name ? ` at ${shop.name}` : ''}.</p>}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children }) {
  return (
    <label className={`au-field ${error ? 'invalid' : ''}`}>
      <span>{label}</span>
      {children}
      {error ? <em role="alert">{error}</em> : hint ? <i>{hint}</i> : null}
    </label>
  );
}

// "Sign in with Google" — Google Identity Services renders its own button; we get an ID token back
function GoogleButton({ clientId, signup, onCredential, onError }) {
  const box = useRef(null);
  const cb = useRef(onCredential); cb.current = onCredential;
  useEffect(() => {
    let alive = true;
    loadScript('https://accounts.google.com/gsi/client').then(() => {
      if (!alive || !window.google?.accounts?.id || !box.current) return;
      // Redirect mode: Google sends the customer back to our server (pop-ups get blocked on Safari and phones)
      window.google.accounts.id.initialize({ client_id: clientId, ux_mode: 'redirect', login_uri: `${window.location.origin}/api/customer/google/redirect` });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', shape: 'pill', text: signup ? 'signup_with' : 'continue_with', width: Math.min(360, box.current.offsetWidth || 320), logo_alignment: 'center' });
    }).catch(() => alive && onError('Google sign-in could not load. Check your connection, or use your mobile number.'));
    return () => { alive = false; };
  }, [clientId, signup]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} className="au-google" />;
}

// "Continue with Facebook" — Facebook JS SDK login popup; we get a user access token back
function FacebookButton({ appId, version = 'v25.0', disabled, onToken, onError }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    loadScript('https://connect.facebook.net/en_US/sdk.js').then(() => {
      if (!alive || !window.FB) return;
      window.FB.init({ appId, version, cookie: false, xfbml: false });
      setReady(true);
    }).catch(() => alive && onError('Facebook sign-in could not load. Check your connection, or use your mobile number.'));
    return () => { alive = false; };
  }, [appId, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const click = () => {
    if (!window.FB) return;
    window.FB.login((r) => {
      if (r?.authResponse?.accessToken) onToken(r.authResponse.accessToken);
      else onError('Facebook sign-in was cancelled.');
    }, { scope: 'public_profile,email' });
  };
  return (
    <button type="button" className="au-fb" onClick={click} disabled={!ready || disabled}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" /></svg>
      Continue with Facebook
    </button>
  );
}

// After Google/Facebook sign-in: we still need a mobile number for pickup contact
export function AddPhone({ me, setMe, go }) {
  const [f, setF] = useState({ name: me.name || '', phone: me.phone || '' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState(null);
  const next = new URLSearchParams(window.location.search).get('next');
  const done = (customer) => { setMe(customer); go(next && /^\/[a-z/]*$/i.test(next) && next !== '/welcome' ? next : '/menu', { replace: true }); };
  const save = async (e) => {
    e.preventDefault();
    const v = { ...checkCustomerName(f.name), ...checkPhone(f.phone) };
    setErrs(v); if (Object.keys(v).length) return;
    setBusy(true);
    try { const r = await call('PATCH', '/customer/me', { name: cleanName(f.name), phone: normPhone(f.phone) }); if (r.verify) { setMe(r.customer); setVerify(r.verify); } else done(r.customer); }
    catch (err) { setErrs(err.fields || { phone: err.message }); }
    finally { setBusy(false); }
  };
  if (verify) return <div className="au"><div className="au-card"><CodeStep verify={verify} endpoint="/customer/me/phone/verify" onDone={(r) => done(r.customer)} onBack={() => setVerify(null)} /></div></div>;
  return (
    <div className="au">
      <div className="au-card">
        {me.avatar && <img className="au-avatar" src={me.avatar} alt="" referrerPolicy="no-referrer" />}
        <h1>One more step</h1>
        <p className="au-sub">Add your mobile number so the shop can reach you about your orders.</p>
        <form onSubmit={save} noValidate className="au-form">
          <Field label="Your name" error={errs.name}><input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => setF((x) => ({ ...x, name: cleanName(x.name) }))} /></Field>
          <Field label="Mobile number" error={errs.phone}>
            <div className="au-phone"><span>PH</span><input value={f.phone} inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" maxLength={13} autoFocus onChange={(e) => setF({ ...f, phone: fmtPhoneInput(e.target.value) })} /></div>
          </Field>
          <button className="sh-btn big" disabled={busy}>{busy ? 'Saving…' : 'Continue to the menu'}</button>
        </form>
      </div>
    </div>
  );
}

/** Enter the 6-digit code we emailed or texted. */
export function CodeStep({ verify: first, endpoint, onDone, onBack }) {
  const [v, setV] = useState(first);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(first.resendIn || 60);
  const [sent, setSent] = useState('');
  const box = useRef(null);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (!busy) box.current?.focus(); }, [busy]); // ready to type again right after a wrong code
  const submit = async (c = code) => {
    if (busy) return;
    if (c.length !== 6) { setErr('Enter all 6 digits.'); return; }
    setBusy(true); setErr('');
    try { onDone(await call('POST', endpoint, { id: v.id, code: c })); }
    catch (e) { setErr(e.fields?.code || e.message); setCode(''); }
    finally { setBusy(false); }
  };
  const type = (e) => {
    const c = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(c); setErr('');
    if (c.length === 6) submit(c);
  };
  const resend = async () => {
    setErr(''); setSent('');
    try { const r = await call('POST', '/customer/verify/resend', { id: v.id }); setV(r.verify); setWait(r.verify.resendIn || 60); setSent('New code sent.'); setCode(''); box.current?.focus(); }
    catch (e) { setErr(e.message); }
  };
  const email = v.kind === 'email';
  return (
    <div className="code-step">
      <div className={`code-ico ${email ? 'mail' : 'sms'}`} aria-hidden="true">
        {email
          ? <svg viewBox="0 0 24 24"><path d="M3 6h18v12H3zM3 7l9 6 9-6" /></svg>
          : <svg viewBox="0 0 24 24"><path d="M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm4 17h2" /></svg>}
      </div>
      <h1>{email ? 'Check your email' : 'Check your messages'}</h1>
      <p className="au-sub">We sent a 6-digit code to <b>{v.to}</b>. It expires in {v.minutes || 10} minutes.{email ? ' Not there? Check your Spam or Promotions folder.' : ''}</p>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <label className={`code-boxes ${err ? 'bad' : ''} ${busy ? 'busy' : ''}`} aria-label="6-digit code">
          <input ref={box} value={code} onChange={type} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} aria-invalid={!!err} readOnly={busy} />
          {Array.from({ length: 6 }, (_, i) => <span key={i} className={`${i < code.length ? 'on' : ''} ${i === code.length && !busy ? 'cur' : ''}`} aria-hidden="true">{code[i] || ''}</span>)}
        </label>
        {err && <div className="shop-alert" role="alert">{err}</div>}
        {sent && !err && <div className="okbox" role="status">{sent}</div>}
        <button className="sh-btn big" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Confirm'}</button>
      </form>
      <p className="au-foot">
        {wait > 0 ? <span className="muted">Send a new code in {wait}s</span> : <button type="button" className="shop-link" onClick={resend}>Send a new code</button>}
        {' · '}<button type="button" className="shop-link" onClick={onBack}>{email ? 'Use another way' : 'Change number'}</button>
      </p>
    </div>
  );
}

/** Password box with Show/Hide and a Caps Lock warning. */
export function PasswordBox({ value, onChange, show, setShow, autoComplete, id, placeholder }) {
  const [caps, setCaps] = useState(false);
  const [own, setOwn] = useState(false);
  const visible = setShow ? show : own;
  const toggle = () => (setShow ? setShow(!show) : setOwn(!own));
  const check = (e) => { if (e.getModifierState) setCaps(e.getModifierState('CapsLock')); };
  return (<>
    <div className="au-pw">
      <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} onKeyDown={check} onKeyUp={check} autoComplete={autoComplete} maxLength={72} placeholder={placeholder} />
      <button type="button" onClick={toggle} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'Hide' : 'Show'}</button>
    </div>
    {caps && <small className="au-caps" role="status">⇪ Caps Lock is on</small>}
  </>);
}

/** Forgot password: email → 6-digit code → new password. */
export function ForgotPage({ go, onSignedIn }) {
  const [who, setWho] = useState(() => new URLSearchParams(window.location.search).get('who') || '');
  const [setting, setSetting] = useState(''); // 'Google' / 'Facebook' when the account has no password yet
  const [verify, setVerify] = useState(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  const send = async (e) => {
    e?.preventDefault(); setMsg(''); setErrs({});
    const w = who.trim();
    if (!w) { setErrs({ who: 'Enter your email or mobile number.' }); return; }
    if (!w.includes('@') && !normPhone(w)) { setErrs({ who: 'Enter your email, or a mobile number like 0917 123 4567.' }); return; }
    setBusy(true);
    try { const r = await call('POST', '/customer/forgot', { who: w }); setVerify(r.verify); setWait(r.verify.resendIn || 60); setSetting(r.setting ? r.social || 'Google' : ''); }
    catch (err) { if (err.fields?.who) setErrs({ who: err.fields.who }); setMsg(err.message); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setMsg('');
    try { const r = await call('POST', '/customer/verify/resend', { id: verify.id }); setVerify(r.verify); setWait(r.verify.resendIn || 60); setMsg(''); }
    catch (err) { setMsg(err.message); }
  };
  const reset = async (e) => {
    e.preventDefault(); setMsg('');
    const v = { ...(code.length === 6 ? {} : { code: 'Enter the 6-digit code from the email.' }), ...checkPassword(pw) };
    setErrs(v); if (Object.keys(v).length) return;
    setBusy(true);
    try { onSignedIn(await call('POST', '/customer/reset', { id: verify.id, code, password: pw })); }
    catch (err) { if (err.fields) setErrs(err.fields); else setMsg(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="au">
      <div className="au-card">
        <img className="au-logo" src="/brand/logo.svg" alt="AL Matcha Co" width="72" height="72" />
        <h1>{setting ? 'Set a password' : 'Reset your password'}</h1>
        {!verify ? (<>
          <p className="au-sub">Enter the email or mobile number of your account. We’ll email you a 6-digit code.</p>
          <form onSubmit={send} noValidate className="au-form">
            <Field label="Email or mobile number" error={errs.who}>
              <input value={who} onChange={(e) => { setWho(e.target.value); setErrs({}); }} autoComplete="username" placeholder="name@gmail.com or 0917 123 4567" maxLength={80} autoFocus />
            </Field>
            {msg && !errs.who && <div className="shop-alert" role="alert">{msg}</div>}
            <button className="sh-btn big" disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
          </form>
        </>) : (<>
          <p className="au-sub">We sent a 6-digit code to <b>{verify.to}</b>. It expires in {verify.minutes || 10} minutes. Not there? Check Spam or Promotions.</p>
          {setting && <div className="okbox">This account uses {setting} sign-in and has no password yet. Set one here, and you can also sign in with your email{' '}or mobile number. {setting} sign-in keeps working too.</div>}
          <form onSubmit={reset} noValidate className="au-form">
            <Field label="6-digit code" error={errs.code}>
              <input value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrs((p) => ({ ...p, code: undefined })); }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" className="au-code-in" autoFocus />
            </Field>
            <Field label="New password" error={errs.password} hint="At least 8 characters, with letters and numbers.">
              <PasswordBox value={pw} onChange={(e) => { setPw(e.target.value); setErrs((p) => ({ ...p, password: undefined })); }} autoComplete="new-password" />
            </Field>
            {msg && <div className="shop-alert" role="alert">{msg}</div>}
            <button className="sh-btn big" disabled={busy}>{busy ? 'Saving…' : setting ? 'Set password and sign in' : 'Save new password and sign in'}</button>
            <button type="button" className="shop-link" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>
          </form>
        </>)}
        <p className="au-foot"><a href="/signin" onClick={(e) => { e.preventDefault(); go('/signin'); }}>Back to sign in</a></p>
      </div>
    </div>
  );
}
