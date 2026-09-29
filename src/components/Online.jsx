// Staff: online orders. New → Preparing → Ready → Paid (or Cancelled).
import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import { peso, pad, timeOf } from '../lib/format';
import { PAY_LABELS, r2 } from '../shared/pricing.mjs';
import PayPicker from './PayPicker';
import { checkCheckout, LIMITS } from '../shared/rules.mjs';
import Modal from './Modal';
import { Field, useErrors } from './Field';
import ReceiptModal from './Receipt';
import { QrHint, ShowQr, QR_LABEL } from './PayQr';

const COLS = [
  ['new', 'New', 'Accept to start making it. Stock is taken when you accept.'],
  ['preparing', 'Preparing', 'Mark ready when the drinks are done.'],
  ['ready', 'Ready for pickup', 'Take payment when the customer arrives.'],
];
const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : timeOf(d); };

export default function Online({ data, refresh, toast, orders, meta = {}, reload }) {
  const [busy, setBusy] = useState(null);
  const [paying, setPaying] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [shot, setShot] = useState(null); // order whose receipt screenshot is open
  const [receipt, setReceipt] = useState(null);
  const s = data.settings;

  const act = async (o, step, body, msg) => {
    setBusy(o._id + step);
    try { await api.post(`/online/${o._id}/${step}`, body); toast(msg); await reload(); if (step === 'accept') refresh(); }
    catch (e) { toast(e.message); reload(); }
    finally { setBusy(null); }
  };
  const toggleOpen = async () => {
    try { await api.put('/settings', { ...s, onlineOpen: !s.onlineOpen }); toast(s.onlineOpen ? 'Online ordering is closed' : 'Online ordering is open'); refresh(); }
    catch (e) { toast(e.message); }
  };

  const done = orders.filter((o) => ['paid', 'cancelled', 'void'].includes(o.status)).reverse();
  const shopUrl = window.location.origin + '/';

  return (
    <>
      <div className="toolbar">
        <h2 className="sec grow">Online orders</h2>
        {s && (
          <span className={`pill ${s.onlineOpen !== false ? 'ok' : 'bad'}`} style={{ fontSize: 12 }}>{s.onlineOpen !== false ? 'Accepting orders' : 'Closed'}</span>
        )}
        {s && <button className="btn" onClick={toggleOpen}>{s.onlineOpen !== false ? 'Close online orders' : 'Open online orders'}</button>}
      </div>
      <p className="muted" style={{ marginTop: -4 }}>
        Customers order at <b className="num">{shopUrl}</b>. This list refreshes every 10 seconds.{' '}
        {meta.paymentMode === 'live' && <span className="pill ok">Online payment on</span>}
        {meta.paymentMode === 'test' && <span className="pill warn" title="PayMongo test keys: no real money moves">Online payment · test mode</span>}
        {meta.paymentMode === 'off' && <span className="pill mute" title="Add PayMongo keys to server/.env to turn on">Online payment off · pay at pickup only</span>}
        {meta.awaitingPayment > 0 && <span className="muted"> · {meta.awaitingPayment} waiting for the customer to pay</span>}
      </p>

      <div className="kanban">
        {COLS.map(([st, title, hint]) => {
          const list = orders.filter((o) => o.status === st);
          return (
            <section key={st} className={`kcol k-${st}`}>
              <div className="kcol-h"><h3>{title}</h3><span className="pill mute">{list.length}</span></div>
              {!list.length ? <p className="muted kempty">{hint}</p> : list.map((o) => (
                <article key={o._id} className="kcard panel">
                  <header>
                    <span className="kno num">#{pad(o.no)}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{o.date !== new Date().toISOString().slice(0, 10) && st === 'new' ? o.date + ' · ' : ''}{ago(o.createdAt)}</span>
                  </header>
                  <div className="kcust"><b>{o.customer}</b> <span className="muted num">{o.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')}</span></div>
                  <ul className="klines">
                    {o.lines.map((l, i) => <li key={i}><b>{l.qty}×</b> {l.name}{l.mods && <small>{l.mods}</small>}</li>)}
                  </ul>
                  {o.pickupNote && <div className="knote">“{o.pickupNote}”</div>}
                  <div className="ktotal">
                    {o.paidOnline
                      ? <><span className="pill ok">Paid online · {PAY_LABELS[o.pay.method] || 'Online'}</span><b className="num">{peso(o.total)}</b></>
                      : o.qrPay?.verified
                        ? <><span className="pill ok">Paid · {QR_LABEL[o.qrPay.method]} QR</span><b className="num">{peso(o.total)}</b></>
                        : o.qrPay?.method
                          ? <><span className="pill warn">{QR_LABEL[o.qrPay.method]} QR · check first</span><b className="num">{peso(o.total)}</b></>
                          : <><span>To collect at pickup</span><b className="num">{peso(o.total)}</b></>}
                  </div>
                  {o.qrPay?.method && !o.qrPay.verified && (() => {
                    const mins = Math.floor((Date.now() - new Date(o.qrPay.at || o.createdAt)) / 60000);
                    return (<>
                      <div className={`kqr ${mins >= 15 ? 'late' : ''}`}>
                        {mins >= 15 && <b className="kqr-late">Waiting {mins} min for a payment check</b>}
                        Open your <b>{QR_LABEL[o.qrPay.method]}</b> app and look for <b className="num">{peso(o.total)}</b> with reference <b className="num">{o.qrPay.ref}</b>{o.qrPay.paidAt && <>, paid at <b className="num">{phTime(o.qrPay.paidAt)}</b></>}.
                      </div>
                      {o.qrPay.timeOld && <div className="kqr-dup" role="alert"><b>⏱ Old payment time</b> The receipt says {phTime(o.qrPay.paidAt)}, {minsText(o.qrPay.timeOld)} before this order was placed. It may be an old receipt: check the date and time of this payment in your {QR_LABEL[o.qrPay.method]} app.</div>}
                      {o.qrPay.shotReused && <div className="kqr-dup" role="alert"><b>⚠ Screenshot used before</b> This exact picture was already sent with order #{pad(o.qrPay.shotReused.no)} ({o.qrPay.shotReused.date}). Check your {QR_LABEL[o.qrPay.method]} app carefully before accepting.</div>}
                      {o.qrPay.shot && <button className="btn sm" onClick={() => setShot(o)}>View payment screenshot</button>}
                    </>);
                  })()}
                  {o.qrPay?.verified && o.qrPay.shot && <button className="btn sm ghost" onClick={() => setShot(o)}>View payment screenshot</button>}
                  <div className="kactions">
                    {st === 'new' && (o.qrPay?.method && !o.qrPay.verified
                      ? <><button className="btn primary" disabled={!!busy} onClick={() => act(o, 'accept', { paymentOk: true }, `Payment confirmed · order #${pad(o.no)} accepted`)}>Payment received · Accept</button>
                        <button className="btn ghost sm" onClick={() => setCancelling({ ...o, notFound: true })}>Not received</button></>
                      : <button className="btn primary" disabled={!!busy} onClick={() => act(o, 'accept', {}, `Order #${pad(o.no)} accepted`)}>Accept</button>)}
                    {st === 'preparing' && <button className="btn primary" disabled={!!busy} onClick={() => act(o, 'ready', {}, `Order #${pad(o.no)} is ready`)}>Mark ready</button>}
                    {st === 'ready' && (o.paidOnline || o.qrPay?.verified
                      ? <button className="btn primary" disabled={!!busy} onClick={() => act(o, 'complete', {}, `Order #${pad(o.no)} picked up`)}>Picked up</button>
                      : <button className="btn primary" onClick={() => setPaying(o)}>Picked up · Take payment</button>)}
                    {!(st === 'new' && o.qrPay?.method && !o.qrPay.verified) && <button className="btn ghost sm" onClick={() => setCancelling(o)}>Cancel</button>}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="card-h"><h3>Finished today</h3><span className="muted" style={{ fontSize: 12 }}>{done.length ? 'tap a paid order for its receipt' : ''}</span></div>
        <div className="tbl-wrap">
          {!done.length ? <div className="empty">No finished online orders yet today.</div> : (
            <table>
              <thead><tr><th>#</th><th>Customer</th><th>Items</th><th>Status</th><th className="r">Total</th></tr></thead>
              <tbody>{done.map((o) => (
                <tr key={o._id} onClick={() => o.status === 'paid' && setReceipt(o)} style={{ cursor: o.status === 'paid' ? 'pointer' : 'default' }}>
                  <td className="num">{pad(o.no)}</td><td>{o.customer}</td>
                  <td style={{ fontSize: 12 }}>{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</td>
                  <td>{o.status === 'paid'
                    ? <span className="pill ok">Paid · {PAY_LABELS[o.pay.method] || o.pay.method}{o.paidOnline ? ' (online)' : o.qrPay?.verified ? ' (QR)' : ''}</span>
                    : o.refundDue
                      ? <span className="pill bad" title={o.qrPay?.verified ? `Send ${peso(o.total)} back to the customer by ${QR_LABEL[o.qrPay.method]} (ref ${o.qrPay.ref})` : `Refund ${peso(o.total)} in the PayMongo dashboard (ref ${o.pay.ref})`}>Cancelled · refund due</span>
                      : <span className="pill mute" title={o.cancelReason}>Cancelled</span>}</td>
                  <td className="r num">{peso(o.total)}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {paying && <PayModal order={paying} settings={s} onClose={() => setPaying(null)} toast={toast}
        onDone={(sale) => { setPaying(null); reload(); refresh(); setReceipt(sale); }} />}
      {cancelling && <CancelModal order={cancelling} onClose={() => setCancelling(null)}
        onDone={async (reason, noShow) => { await act(cancelling, 'cancel', { reason, noShow }, `Order #${pad(cancelling.no)} cancelled`); setCancelling(null); }} />}
      {shot && <ShotModal order={shot} onClose={() => setShot(null)} />}
      {receipt && <ReceiptModal sale={receipt} settings={s} onClose={() => setReceipt(null)} />}
    </>
  );
}

function PayModal({ order, settings, onClose, onDone, toast }) {
  const [pay, setPay] = useState({ method: 'cash', tendered: '', ref: '' });
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const { errs, check, fromServer } = useErrors();
  const tendered = +pay.tendered || 0;
  const quick = [...new Set([Math.ceil(order.total), 100, 200, 500, 1000].filter((n) => n >= order.total))].slice(0, 4);
  const save = async () => {
    if (!check(checkCheckout({ lineCount: order.lines.length, total: order.total, pay }))) return;
    setBusy(true);
    try { onDone(await api.post(`/online/${order._id}/complete`, { pay: { ...pay, tendered: pay.method === 'cash' ? tendered : undefined } })); toast(`Order #${pad(order.no)} paid`); }
    catch (e) { fromServer(e, toast); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Take payment · #${pad(order.no)}`} aside={<b className="num">{peso(order.total)}</b>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Mark as paid'}</button></>}>
      <p className="muted" style={{ margin: 0 }}>{order.customer} · {order.lines.reduce((a, l) => a + l.qty, 0)} items</p>
      <PayPicker value={pay.method} onChange={(k) => setPay({ ...pay, method: k })} />
      {pay.method === 'cash' ? <>
        <Field id="oTend" label="Cash received" error={errs.tendered}>
          <input id="oTend" type="number" inputMode="decimal" min="0" step="any" autoFocus value={pay.tendered} onChange={(e) => setPay({ ...pay, tendered: e.target.value })} />
        </Field>
        <div className="quick">{quick.map((n) => <button key={n} className="num" onClick={() => setPay({ ...pay, tendered: String(n) })}>₱{n.toLocaleString('en-PH')}</button>)}</div>
        <div className="change"><span>Change</span><span className="num" style={{ color: tendered - order.total < 0 ? 'var(--bad)' : 'var(--ok)' }}>{tendered ? peso(r2(tendered - order.total)) : '—'}</span></div>
      </> : (<>
        <QrHint kind={pay.method} settings={settings} amount={order.total} onShow={() => setShowQr(pay.method)} />
        <Field id="oRef" label="Reference no. (optional)" error={errs.ref}>
          <input id="oRef" maxLength={LIMITS.ref} value={pay.ref} onChange={(e) => setPay({ ...pay, ref: e.target.value.trim() })} />
        </Field>
      </>)}
      {showQr && <ShowQr kind={showQr} settings={settings} amount={order.total} onClose={() => setShowQr(null)} />}
    </Modal>
  );
}

function CancelModal({ order, onClose, onDone }) {
  const qr = order.qrPay?.method ? QR_LABEL[order.qrPay.method] : '';
  const notFound = qr ? `We couldn't find your ${qr} payment (ref ${order.qrPay.ref}). Please message us.` : '';
  const presets = order.notFound ? [notFound] : ['Sold out of an ingredient', 'Shop is closing', 'Customer asked to cancel', 'Did not pick up'];
  const [reason, setReason] = useState(order.notFound ? notFound : '');
  const [err, setErr] = useState('');
  const submit = () => {
    const r = reason.trim();
    if (r.length < 3) return setErr('Tell the customer why. They will see this.');
    onDone(r, r === 'Did not pick up');
  };
  return (
    <Modal title={`Cancel order #${pad(order.no)}?`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Keep order</button><button className="btn danger" onClick={submit}>{order.notFound ? 'Cancel · payment not found' : 'Cancel order'}</button></>}>
      <p className="muted" style={{ margin: 0 }}>{order.customer} will see the reason on their order page.{order.stockDeducted ? ' Ingredients go back into stock.' : ''}</p>
      {order.qrPay?.verified && <div className="warnbox">This order was paid by {qr} QR ({peso(order.total)}, ref <b>{order.qrPay.ref}</b>). After cancelling, send the money back to the customer by {qr}.</div>}
      {order.notFound && <div className="warnbox">Only do this after checking your {qr} app for {peso(order.total)} with reference <b>{order.qrPay.ref}</b>. The customer will see the reason below.</div>}
      {order.paidOnline && <div className="warnbox">This order was paid online ({PAY_LABELS[order.pay.method] || 'Online'}, {peso(order.total)}). After cancelling, refund it in your PayMongo dashboard using reference <b>{order.pay.ref}</b>.</div>}
      <div className="opts">{presets.map((p) => <button key={p} className="opt" aria-pressed={reason === p} onClick={() => { setReason(p); setErr(''); }}>{p}</button>)}</div>
      {reason === 'Did not pick up' && !order.paidOnline && !order.qrPay?.method && <p className="fhint" style={{ margin: 0 }}>This counts as a no-show. After 2 no-shows in 60 days, this customer has to pay first (GCash, Maya or online) for new orders.</p>}
      <Field id="cReason" label="Reason" error={err}>
        <input id="cReason" maxLength={120} value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} placeholder="Sorry, we ran out of matcha" />
      </Field>
    </Modal>
  );
}

/** "2:14 PM" in Philippine time (the time on the customer's receipt) */
const phTime = (d) => new Date(d).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
/** 71 → "1 hr 11 min", 1500 → "25 hr" */
const minsText = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 && m < 600 ? ` ${m % 60} min` : ''}`);

/** The GCash / Maya screenshot the customer attached (loaded with the staff sign-in). */
function ShotModal({ order, onClose }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true, u = '';
    fetch(`/api/online/${order._id}/receipt`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Could not load the screenshot.'))))
      .then((b) => { if (live) { u = URL.createObjectURL(b); setUrl(u); } })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [order._id]);
  return (
    <Modal title={`Payment screenshot · #${pad(order.no)}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <p className="muted" style={{ margin: 0 }}>Check it matches <b className="num">{peso(order.total)}</b> and reference <b className="num">{order.qrPay.ref}</b>, then confirm in your {QR_LABEL[order.qrPay.method]} app too.</p>
      {order.qrPay.timeOld && <div className="warnbox">The receipt time ({phTime(order.qrPay.paidAt)}) is {minsText(order.qrPay.timeOld)} before this order was placed. It may be an old receipt.</div>}
      {order.qrPay.shotReused && <div className="warnbox">This screenshot was already used with order #{pad(order.qrPay.shotReused.no)} on {order.qrPay.shotReused.date}. It may be an old receipt.</div>}
      {err ? <div className="banner">{err}</div> : url ? <img className="shot-img" src={url} alt="Customer's payment screenshot" /> : <p className="muted">Loading…</p>}
    </Modal>
  );
}
