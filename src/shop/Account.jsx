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
import './ac2.css';

const LABEL = { awaiting_payment: 'Waiting for payment', new: 'Order received', preparing: 'Preparing', ready: 'Ready for pickup', paid: 'Picked up', cancelled: 'Cancelled' };
// Delivery orders: the rider's step instead
const DLABEL = { waiting: 'Preparing', booked: 'Waiting for a rider', picked: 'On the way', delivered: 'Delivered' };
const labelOf = (o) => (o.fulfil === 'delivery' && ['preparing', 'ready', 'paid'].includes(o.status) ? (o.status === 'ready' && (o.riderState || 'waiting') === 'waiting' ? 'Ready · booking a rider' : DLABEL[o.status === 'paid' ? 'delivered' : o.riderState]) : LABEL[o.status]) || o.status;

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
  const [pwOpen, setPwOpen] = useState(false);

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
  const since = me.createdAt ? new Date(me.createdAt).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : '';
  const via = [me.google && 'Google', me.facebook && 'Facebook', me.hasPassword && 'Mobile number'].filter(Boolean).join(' · ');
  const Ico = ({ d }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="acct ac2">
      <header className="ac2-hero">
        <div className="acct-av ac2-av"><Avatar me={me} /></div>
        <div className="ac2-who">
          <p className="ac2-hi">Hello,</p>
          <h1>{me.name}</h1>
          <p className="ac2-meta">{since && <>Member since {since}</>}{since && via && ' · '}{via && <>{via} sign-in</>}</p>
        </div>
        <div className="ac2-stats">
          <div><b>{me.lifetimeStamps || 0}</b><small>stamps earned</small></div>
          <div><b>{me.rewardsUsed || 0}</b><small>free drinks</small></div>
          <div><b>{(me.favorites || []).length}</b><small>saved drinks</small></div>
        </div>
      </header>

      <nav className="ac2-quick" aria-label="Shortcuts">
        <button type="button" onClick={() => go('/orders')}><Ico d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6" /><span><b>My orders</b><small>Track and reorder</small></span></button>
        <button type="button" onClick={() => go('/menu')}><Ico d="M6 8h12l-1.3 11.2A2 2 0 0 1 14.7 21H9.3a2 2 0 0 1-2-1.8L6 8Zm-1 0h14M9 8l1-4h4l1 4" /><span><b>Order a drink</b><small>Open the menu</small></span></button>
      </nav>

      <StampCard stamps={me.stamps} />

      {ok && <div className="okbox ac2-ok" role="status">{ok}</div>}

      <section className="ac2-card">
        <div className="ac2-h"><span className="ac2-ico"><Ico d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" /></span><div><h2>Your details</h2><p>How we know you and reach you about orders.</p></div></div>
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

      <section className="ac2-card">
        <div className="ac2-h"><span className="ac2-ico"><Ico d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2Zm4 4h4" /></span><div><h2>Order-ready alerts</h2><p>We let you know the moment your drink is ready.</p></div></div>
        <label className={`ac2-switch ${me.smsReady !== false ? 'on' : ''}`}>
          <span><b>Text me when my order is ready</b><small>One SMS to {me.phone ? me.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3') : 'your number'}.</small></span>
          <input type="checkbox" role="switch" checked={me.smsReady !== false} disabled={busy === 'sms'} onChange={toggleSms} />
          <i className="ac2-knob" aria-hidden="true" />
        </label>
        {errs.sms && <div className="shop-alert">{errs.sms}</div>}
        <ReadyAlerts />
      </section>

      <section className={`ac2-card ac2-pw ${pwOpen || errs.currentPassword || errs.newPassword ? 'open' : ''}`}>
        <button type="button" className="ac2-h ac2-toggle" onClick={() => setPwOpen(!pwOpen)} aria-expanded={pwOpen}>
          <span className="ac2-ico"><Ico d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Zm7 4v2" /></span>
          <div><h2>{me.hasPassword ? 'Password' : 'Set a password'}</h2><p>{me.hasPassword ? 'Change the password you sign in with.' : 'Optional. Lets you also sign in with your mobile number.'}</p></div>
          <i className="ac2-chev" aria-hidden="true">▾</i>
        </button>
        {(pwOpen || errs.currentPassword || errs.newPassword) && (
          <form onSubmit={changePw} noValidate className="au-form">
            {me.hasPassword && <Field label="Current password" error={errs.currentPassword}><PasswordBox autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>}
            {me.hasPassword && (me.email
              ? <p className="au-fine acct-forgot"><a href="/forgot" onClick={(e) => { e.preventDefault(); go('/forgot?who=' + encodeURIComponent(me.email)); }}>Forgot your current password?</a> We’ll email a code to {me.email.replace(/^(.)(.*?)(.?)@/, (_, a, m, b) => `${a}${'•'.repeat(Math.min(6, Math.max(2, m.length)))}${b}@`)}.</p>
              : <p className="au-fine acct-forgot">Forgot your current password? Add your email above first, then you can reset it by email.</p>)}
            <Field label="New password" error={errs.newPassword} hint="At least 8 characters, with letters and numbers."><PasswordBox autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
            <button className="sh-btn ghost" disabled={busy === 'pw'}>{busy === 'pw' ? 'Saving…' : me.hasPassword ? 'Change password' : 'Set password'}</button>
          </form>
        )}
      </section>

      <div className="acct-actions ac2-out">
        <button className="shop-link" onClick={signOut}><Ico d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" />Sign out</button>
      </div>
    </div>
  );
}
