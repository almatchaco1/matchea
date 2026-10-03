import { useState } from 'react';
import { usePullRefresh } from './fx';
import { call } from './api';
import { checkCustomerName, checkPhone, checkPassword, normPhone, fmtPhoneInput, cleanName } from '../shared/rules.mjs';
import { peso, pad } from '../lib/format';
import StampCard from './StampCard';
import ReadyAlerts from './ReadyAlerts';
import { Stars } from './RateOrder';
import { Doodle, Avatar } from './art';
import { Field, CodeStep, PasswordBox } from './Auth';

const LABEL = { awaiting_payment: 'Waiting for payment', new: 'Order received', preparing: 'Preparing', ready: 'Ready for pickup', paid: 'Picked up', cancelled: 'Cancelled' };
// Delivery orders: the rider's step instead
const DLABEL = { waiting: 'Preparing', booked: 'Waiting for a rider', picked: 'On the way', delivered: 'Delivered' };
const labelOf = (o) => (o.fulfil === 'delivery' && ['preparing', 'ready', 'paid'].includes(o.status) ? DLABEL[o.status === 'paid' ? 'delivered' : o.riderState] : LABEL[o.status]) || o.status;

export function OrdersPage({ orders, go, reload }) {
  const { pull, busy } = usePullRefresh(reload);
  return (
    <section className="panel">
      <div className={`ptr ${busy ? 'busy' : ''}`} style={{ '--p': Math.min(1, pull), height: busy ? 56 : Math.min(1.3, pull) * 56 }} aria-hidden={!busy} role="status">
        <svg className="ptr-whisk" viewBox="0 0 24 40" style={{ transform: busy ? undefined : `rotate(${pull * 300}deg)` }}><rect x="9" y="1" width="6" height="15" rx="2.5" /><path d="M9 16l-6 22M10.5 16l-3 23M12 16v23.5M13.5 16l3 23M15 16l6 22" /></svg>
        <span>{busy ? 'Refreshing…' : pull >= 0.8 ? 'Let go to refresh' : 'Pull to refresh'}</span>
      </div>
      <h1>My orders</h1>
      {!orders.length ? (
        <div className="empty-state"><Doodle kind="orders" /><p className="muted">No orders yet. Your first matcha is waiting for you!</p><button className="sh-btn" onClick={() => go('/menu')}>Order something</button></div>
      ) : (
        <ul className="olist">
          {orders.map((o) => (
            <li key={o.code}>
              <button className="olist-row" onClick={() => go('/order/' + o.code)}>
                <div>
                  <b>#{pad(o.no)}</b>{o.fulfil === 'delivery' && <i className="olist-dl">Delivery</i>} <span className="muted">· {new Date(o.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} {new Date(o.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
                  <small>{o.items}</small>
                </div>
                <div className="olist-r">
                  <span className={`pill s-${o.status}`}>{labelOf(o)}</span>
                  {o.rating ? <Stars value={o.rating.stars} small /> : o.canRate && <span className="rate-link">Rate ★</span>}
                  <b>{peso(o.total)}</b>
                </div>
              </button>
              {o.status === 'cancelled' && (
                <button className="olist-rm" onClick={async () => { try { await call('POST', `/customer/orders/${o.code}/hide`); await reload?.(); } catch { /* stays in the list */ } }}>
                  Remove from my orders
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AccountPage({ me, setMe, go, signOut }) {
  const [f, setF] = useState({ name: me.name, phone: me.phone ? fmtPhoneInput(me.phone) : '', email: me.email || '' });
  const [verifyEmail, setVerifyEmail] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [errs, setErrs] = useState({});
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');
  const [verify, setVerify] = useState(null);

  const save = async (e) => {
    e.preventDefault(); setOk('');
    const v = { ...checkCustomerName(f.name), ...(f.phone.trim() ? checkPhone(f.phone) : {}) };
    const em = f.email.trim().toLowerCase();
    if (em && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(em)) v.email = 'Enter an email like name@gmail.com.';
    setErrs(v); if (Object.keys(v).length) return;
    setBusy('profile');
    try {
      const socialEmail = me.google || me.facebook;
      const r = await call('PATCH', '/customer/me', { name: cleanName(f.name), phone: f.phone.trim() ? normPhone(f.phone) : '', ...(socialEmail ? {} : { email: em }) });
      setMe(r.customer); setF((x) => ({ ...x, name: r.customer.name }));
      if (r.verify?.kind === 'email') setVerifyEmail(r.verify); else if (r.verify) setVerify(r.verify); else setOk('Saved.');
    }
    catch (err) { setErrs(err.fields || { phone: err.message }); }
    finally { setBusy(''); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setOk('');
    const v = checkPassword(pw.newPassword, 'newPassword');
    if (me.hasPassword && !pw.currentPassword) v.currentPassword = 'Enter your current password.';
    setErrs(v); if (Object.keys(v).length) return;
    setBusy('pw');
    try { const r = await call('PATCH', '/customer/me', pw); setMe(r.customer); setPw({ currentPassword: '', newPassword: '' }); setOk(me.hasPassword ? 'Password changed.' : 'Password set. You can now also sign in with your mobile number.'); }
    catch (err) { setErrs(err.fields || { newPassword: err.message }); }
    finally { setBusy(''); }
  };

  const toggleSms = async () => {
    setBusy('sms');
    try { const r = await call('PATCH', '/customer/me', { smsReady: !me.smsReady }); setMe(r.customer); }
    catch (err) { setOk(''); setErrs({ sms: err.message }); }
    finally { setBusy(''); }
  };

  if (verifyEmail) return <div className="au"><div className="au-card"><CodeStep verify={verifyEmail} endpoint="/customer/me/email/verify" onDone={(r) => { setMe(r.customer); setVerifyEmail(null); setOk('Your email is saved. You can use it to reset your password.'); }} onBack={() => { setVerifyEmail(null); setF((x) => ({ ...x, email: me.email || '' })); }} /></div></div>;
  if (verify) return <div className="au"><div className="au-card"><CodeStep verify={verify} endpoint="/customer/me/phone/verify" onDone={(r) => { setMe(r.customer); setF((x) => ({ ...x, phone: r.customer.phone })); setVerify(null); setOk('Your new number is saved.'); }} onBack={() => { setVerify(null); setF((x) => ({ ...x, phone: me.phone || '' })); }} /></div></div>;
  return (
    <div className="acct">
      <StampCard stamps={me.stamps} />
      <section className="panel">
        <h2>Order-ready alerts</h2>
        <label className="toggle-row">
          <input type="checkbox" checked={me.smsReady !== false} disabled={busy === 'sms'} onChange={toggleSms} />
          <span><b>Text me when my order is ready</b><small>We'll send one SMS to {me.phone ? me.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3') : 'your number'}.</small></span>
        </label>
        {errs.sms && <div className="shop-alert">{errs.sms}</div>}
        <ReadyAlerts />
      </section>
      <section className="panel">
        <div className="acct-h">
          <div className="acct-av"><Avatar me={me} /></div>
          <div><h1>{me.name}</h1><p className="muted">{[me.google && 'Google', me.facebook && 'Facebook', me.hasPassword && 'Mobile number'].filter(Boolean).join(' · ')} sign-in</p></div>
        </div>
        {ok && <div className="okbox" role="status">{ok}</div>}
        <form onSubmit={save} noValidate className="au-form">
          <Field label="Name" error={errs.name}><input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} onBlur={() => setF((x) => ({ ...x, name: cleanName(x.name) }))} /></Field>
          <Field label="Mobile number" error={errs.phone} hint={me.phone ? "The shop uses this if there's a problem with your order." : 'Optional. Add it if you want a text when your order is ready.'}><input value={f.phone} inputMode="tel" maxLength={13} placeholder="0917 123 4567" onChange={(e) => setF({ ...f, phone: fmtPhoneInput(e.target.value) })} /></Field>
          {!(me.google || me.facebook) && (
            <Field label="Email" error={errs.email} hint={me.email ? 'Used to reset your password if you forget it.' : 'Optional. Add it so you can reset your password by email.'}>
              <input type="email" value={f.email} maxLength={80} autoComplete="email" placeholder="name@gmail.com" onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
          )}
          <button className="sh-btn" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save changes'}</button>
        </form>
      </section>
      <section className="panel">
        <h2>{me.hasPassword ? 'Change password' : 'Set a password'}</h2>
        {!me.hasPassword && <p className="muted small">Optional. Lets you also sign in with your mobile number.</p>}
        <form onSubmit={changePw} noValidate className="au-form">
          {me.hasPassword && <Field label="Current password" error={errs.currentPassword}><PasswordBox autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>}
          {me.hasPassword && (me.email
            ? <p className="au-fine acct-forgot"><a href="/forgot" onClick={(e) => { e.preventDefault(); go('/forgot?who=' + encodeURIComponent(me.email)); }}>Forgot your current password?</a> We’ll email a code to {me.email.replace(/^(.)(.*?)(.?)@/, (_, a, m, b) => `${a}${'•'.repeat(Math.min(6, Math.max(2, m.length)))}${b}@`)}.</p>
            : <p className="au-fine acct-forgot">Forgot your current password? Add your email above first, then you can reset it by email.</p>)}
          <Field label="New password" error={errs.newPassword} hint="At least 8 characters, with letters and numbers."><PasswordBox autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <button className="sh-btn ghost" disabled={busy === 'pw'}>{busy === 'pw' ? 'Saving…' : me.hasPassword ? 'Change password' : 'Set password'}</button>
        </form>
      </section>
      <div className="acct-actions">
        <button className="sh-btn ghost" onClick={() => go('/orders')}>My orders</button>
        <button className="shop-link" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}
