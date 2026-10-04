// Staff: online orders. New → Preparing → Ready → Paid (or Cancelled).
import { useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { peso, pad, timeOf } from '../lib/format';
import { PAY_LABELS, r2 } from '../shared/pricing.mjs';
import PayPicker from './PayPicker';
import { checkCheckout, LIMITS } from '../shared/rules.mjs';
import Modal from './Modal';
import { Field, useErrors } from './Field';
import ReceiptModal, { printCupLabels, printHtml } from './Receipt';
import { qrPng } from '../lib/payqr';
import { mapsLink } from '../shared/delivery.mjs';
import AdminPin from './AdminPin';
import { QrHint, ShowQr, QR_LABEL } from './PayQr';
import { useFlip, flyInto } from '../lib/motion';

const COLS = [
  ['new', 'New', 'Accept to start making it. Stock is taken when you accept.'],
  ['preparing', 'Preparing', 'Mark ready when the drinks are done.'],
  ['ready', 'Ready', 'Pickups: hand over when the customer arrives. Deliveries: tap Rider picked up when Lalamove takes the drinks.'],
  ['onway', 'On the way', 'Deliveries with the rider show here until you tap Delivered or the customer confirms it on their phone.'],
];
// Which column an order is in: deliveries that left the shop get their own column
const colOf = (o) => (o.status === 'ready' && o.fulfil === 'delivery' && o.delivery?.state === 'picked' ? 'onway' : o.status);
const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : timeOf(d); };

export default function Online({ data, refresh, toast, orders, meta = {}, reload }) {
  const board = useRef(null);
  useFlip(board); // cards glide to their new column
  const [busy, setBusy] = useState(null);
  const [paying, setPaying] = useState(null);
  const [handing, setHanding] = useState(null); // already paid: hand over after checking the pickup code
  const [cancelling, setCancelling] = useState(null);
  const [shot, setShot] = useState(null); // order whose receipt screenshot is open
  const [receipt, setReceipt] = useState(null);
  const [booking, setBooking] = useState(null); // delivery: booking Lalamove
  const [rider, setRider] = useState(null);     // delivery: the rider picked up the drinks
  const [linking, setLinking] = useState(null); // delivery: add / change the Lalamove tracking link
  const s = data.settings;
  // Tell staff when a customer confirms their delivery arrived (the card then moves to Finished)
  const onway = useRef(null);
  useEffect(() => {
    const now = new Set(orders.filter((o) => colOf(o) === 'onway').map((o) => o._id));
    if (onway.current) for (const o of orders) if (onway.current.has(o._id) && o.delivery?.state === 'delivered' && o.delivery.receivedBy === 'customer') toast(`Order #${pad(o.no)}: the customer confirmed they received it`);
    onway.current = now;
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (o, step, body, msg) => {
    setBusy(o._id + step);
    if (step === 'accept') flyInto(document.querySelector(`.kcard[data-flip="${o._id}"]`), document.querySelector('.tabs [data-tab="barista"]'));
    try { await api.post(`/online/${o._id}/${step}`, body); toast(msg); await reload(); if (step === 'accept') refresh(); }
    catch (e) { toast(e.message); reload(); }
    finally { setBusy(null); }
  };
  const toggleOpen = async () => {
    try { await api.put('/settings', { ...s, onlineOpen: !s.onlineOpen }); toast(s.onlineOpen ? 'Online ordering is closed' : 'Online ordering is open'); refresh(); }
    catch (e) { toast(e.message); }
  };

  const showOnway = !!s?.delivery?.enabled || orders.some((o) => o.fulfil === 'delivery');
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

      <div className={`kanban ${showOnway ? 'has-onway' : ''}`} ref={board}>
        {COLS.filter(([st]) => st !== 'onway' || showOnway).map(([st, title, hint]) => {
          const list = orders.filter((o) => colOf(o) === st);
          return (
            <section key={st} className={`kcol k-${st}`}>
              <div className="kcol-h"><h3>{title}</h3><span className="pill mute">{list.length}</span></div>
              {!list.length ? <p className="muted kempty">{hint}</p> : list.map((o) => (
                <article key={o._id} data-flip={o._id} className={`kcard panel ${o.fulfil === 'delivery' ? 'is-deliv' : ''}`}>
                  <header>
                    <span className="kno num">#{pad(o.no)}</span>
                    {o.fulfil === 'delivery' && <span className="dtag">Delivery · {o.delivery?.km} km</span>}
                    <span className="muted" style={{ fontSize: 12 }}>{o.date !== new Date().toISOString().slice(0, 10) && st === 'new' ? o.date + ' · ' : ''}{ago(o.createdAt)}</span>
                  </header>
                  <div className="kcust"><b>{o.customer}</b> <span className="muted num">{o.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')}</span></div>
                  <ul className="klines">
                    {o.lines.map((l, i) => <li key={i}><b>{l.qty}×</b> {l.name}{l.mods && <small>{l.mods}</small>}</li>)}
                  </ul>
                  {o.pickupNote && <div className="knote">“{o.pickupNote}”</div>}
                  {o.fulfil === 'delivery' && o.delivery && <DeliveryInfo o={o} />}
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
                    {o.fulfil === 'delivery' && st !== 'new' && <>
                      {(o.delivery?.state || 'waiting') === 'waiting' && <button className="btn primary" disabled={!!busy} onClick={() => setBooking(o)}>Book Lalamove</button>}
                      {o.delivery?.state === 'booked' && st === 'ready' && <button className="btn primary" disabled={!!busy} onClick={() => setRider(o)}>Rider picked up</button>}
                      {o.delivery?.state === 'picked' && <button className="btn primary" disabled={!!busy} onClick={() => act(o, 'delivery/delivered', {}, `Order #${pad(o.no)} delivered`)}>Delivered</button>}
                      {['booked', 'picked'].includes(o.delivery?.state) && <button className={`btn sm ${o.delivery.trackUrl ? 'ghost' : 'track-add'}`} disabled={!!busy} onClick={() => setLinking(o)}>{o.delivery.trackUrl ? 'Tracking link ✓' : 'Add tracking link'}</button>}
                      {['booked', 'picked'].includes(o.delivery?.state) && <button className="btn ghost sm" disabled={!!busy} onClick={() => act(o, 'delivery/rebook', {}, `Order #${pad(o.no)}: book a new rider`)}>Rider cancelled</button>}
                      <button className="btn ghost sm" onClick={() => printSlip(o, s)}>Delivery slip</button>
                    </>}
                    {st === 'ready' && o.fulfil !== 'delivery' && (o.paidOnline || o.qrPay?.verified
                      ? <button className="btn primary" disabled={!!busy} onClick={() => (o.hasCode ? setHanding(o) : act(o, 'complete', {}, `Order #${pad(o.no)} picked up`))}>Picked up</button>
                      : <button className="btn primary" onClick={() => setPaying(o)}>Picked up · Take payment</button>)}
                    {st === 'preparing' && <button className="btn ghost sm" onClick={async () => { try { const m = await printCupLabels(o, s); if (m) toast(m); } catch (e) { toast(e.message); } }}>Cup labels</button>}
                    {!(st === 'new' && o.qrPay?.method && !o.qrPay.verified) && st !== 'onway' && <button className="btn ghost sm" onClick={() => setCancelling(o)}>Cancel</button>}
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
                  <td className="num">{pad(o.no)}{o.fulfil === 'delivery' && <span className="dtag sm">Delivery</span>}</td><td>{o.customer}</td>
                  <td style={{ fontSize: 12 }}>{o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</td>
                  <td>{o.status === 'paid' && o.fulfil === 'delivery'
                    ? <span className="pill ok" title={o.delivery?.rider?.name ? `Rider: ${o.delivery.rider.name}` : ''}>Delivered{o.delivery?.deliveredAt ? ` ${timeOf(o.delivery.deliveredAt)}` : ''} · {o.delivery?.receivedBy === 'customer' ? 'customer confirmed' : 'marked by staff'}</span>
                    : o.status === 'paid'
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

      {handing && <HandoverModal order={handing} onClose={() => setHanding(null)} toast={toast}
        onDone={(sale) => { setHanding(null); toast(`Order #${pad(sale.no)} picked up`); reload(); refresh(); }} />}
      {paying && <PayModal order={paying} settings={s} onClose={() => setPaying(null)} toast={toast}
        onDone={(sale) => { setPaying(null); reload(); refresh(); setReceipt(sale); }} />}
      {cancelling && <CancelModal order={cancelling} onClose={() => setCancelling(null)}
        onDone={async (reason, noShow) => { await act(cancelling, 'cancel', { reason, noShow }, `Order #${pad(cancelling.no)} cancelled`); setCancelling(null); }} />}
      {shot && <ShotModal order={shot} onClose={() => setShot(null)} />}
      {receipt && <ReceiptModal sale={receipt} settings={s} onClose={() => setReceipt(null)} />}
      {booking && <BookModal order={booking} settings={s} onClose={() => setBooking(null)}
        onDone={async (cost, trackUrl) => { await act(booking, 'delivery/booked', { cost, trackUrl }, `Order #${pad(booking.no)}: waiting for the rider`); setBooking(null); }} />}
      {linking && <TrackLinkModal order={linking} onClose={() => setLinking(null)} toast={toast} onDone={() => { setLinking(null); toast(`Tracking link saved for order #${pad(linking.no)}`); reload(); }} />}
      {rider && <RiderModal order={rider} onClose={() => setRider(null)} toast={toast} onDone={() => { setRider(null); toast(`Order #${pad(rider.no)} is on the way`); reload(); }} />}
    </>
  );
}

/** The customer's 4-digit pickup code, or an admin's OK when they lost it. */
function PickupCode({ order, code, setCode, err, onAdmin }) {
  if (!order.hasCode) return null;
  return (
    <Field id="pkCode" label="Pickup code (ask the customer)" error={err} hint="It’s on their order page and in the ready text.">
      <div className="pk-row">
        <input id="pkCode" className="pk-in num" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••" value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        <button type="button" className="linkbtn" onClick={onAdmin}>No code? Ask an admin</button>
      </div>
    </Field>
  );
}

function HandoverModal({ order, onClose, onDone, toast }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const go = async (override) => {
    if (!override && code.length !== 4) { setErr('Enter the 4-digit code.'); return; }
    setBusy(true); setErr('');
    try { onDone(await api.post(`/online/${order._id}/complete`, override ? { override } : { code })); }
    catch (e) { setErr(e.fields?.code || e.message); }
    finally { setBusy(false); }
  };
  return (<>
    <Modal title={`Hand over #${pad(order.no)}`} aside={<span className="pill ok">Paid</span>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => go()}>{busy ? 'Saving…' : 'Code matches · Hand over'}</button></>}>
      <p className="muted" style={{ margin: 0 }}>{order.customer} · {order.lines.reduce((a, l) => a + l.qty, 0)} items</p>
      <PickupCode order={order} code={code} setCode={(v) => { setCode(v); setErr(''); }} err={err} onAdmin={() => setAsking(true)} />
    </Modal>
    {asking && <AdminPin action="pickup" detail={`Order #${pad(order.no)}`} onClose={() => setAsking(false)} onApproved={(tok, by) => { setAsking(false); toast(`Approved by ${by}`); go(tok); }} />}
  </>);
}

function PayModal({ order, settings, onClose, onDone, toast }) {
  const [pay, setPay] = useState({ method: 'cash', tendered: '', ref: '' });
  const [code, setCode] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const { errs, check, fromServer } = useErrors();
  const tendered = +pay.tendered || 0;
  const quick = [...new Set([Math.ceil(order.total), 100, 200, 500, 1000].filter((n) => n >= order.total))].slice(0, 4);
  const save = async (override) => {
    const e = checkCheckout({ lineCount: order.lines.length, total: order.total, pay });
    if (order.hasCode && !override && code.length !== 4) e.code = 'Enter the 4-digit code.';
    if (!check(e)) return;
    setBusy(true);
    try { onDone(await api.post(`/online/${order._id}/complete`, { pay: { ...pay, tendered: pay.method === 'cash' ? tendered : undefined }, ...(override ? { override } : { code }) })); toast(`Order #${pad(order.no)} paid`); }
    catch (e) { fromServer(e, toast); }
    finally { setBusy(false); }
  };
  return (<>
    <Modal title={`Take payment · #${pad(order.no)}`} aside={<b className="num">{peso(order.total)}</b>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Mark as paid'}</button></>}>
      <p className="muted" style={{ margin: 0 }}>{order.customer} · {order.lines.reduce((a, l) => a + l.qty, 0)} items</p>
      <PickupCode order={order} code={code} setCode={setCode} err={errs.code} onAdmin={() => setAsking(true)} />
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
    {asking && <AdminPin action="pickup" detail={`Order #${pad(order.no)}`} onClose={() => setAsking(false)} onApproved={(tok, by) => { setAsking(false); toast(`Approved by ${by}`); save(tok); }} />}
  </>);
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

const STATE_PILL = { waiting: ['warn', 'Book a rider'], booked: ['mute', 'Waiting for the rider'], picked: ['ok', 'On the way'], delivered: ['ok', 'Delivered'] };
const since = (t) => { const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`; };
const addrText = (d) => [d.detail, d.landmark && `Landmark: ${d.landmark}`, d.label].filter(Boolean).join('\n');

/** Delivery address and rider status on an order card. */
function DeliveryInfo({ o }) {
  const d = o.delivery;
  const [cls, label] = STATE_PILL[d.state || 'waiting'];
  return (
    <div className="kdeliv">
      <div className="kdeliv-h"><span className={`pill ${cls}`}>{label}</span>
        <span className="num">{d.free ? <>Free delivery <small className="muted">(shop pays ~{peso(d.fee)})</small></> : <>Fee paid {peso(o.deliveryFee)}</>}</span></div>
      <b>{d.detail}</b>
      <small>{d.landmark && <>Landmark: {d.landmark}<br /></>}{d.label}</small>
      {d.note && <small className="knote-r">Rider note: “{d.note}”</small>}
      {d.state === 'picked' && d.rider?.name && <small>Rider: <b>{d.rider.name}</b>{d.rider.plate ? ` · ${d.rider.plate}` : ''}{d.rider.phone ? ` · ${d.rider.phone}` : ''}</small>}
      {d.state === 'picked' && d.pickedAt && <small>Left the shop {timeOf(d.pickedAt)} · {since(d.pickedAt)}</small>}
      {d.state === 'booked' && o.status === 'preparing' && <small className="muted">Mark the drinks ready before the rider takes them.</small>}
      <a className="linkbtn" href={mapsLink(d.lat, d.lng)} target="_blank" rel="noopener noreferrer">Open pin in Google Maps ↗</a>
    </div>
  );
}

const TRACK_RE = /^https:\/\/[\w-]+(\.[\w-]+)+([/?#]\S*)?$/i;
const trackErr = (u) => (u && !TRACK_RE.test(u) ? 'Paste the share link from the Lalamove app (it starts with https://), or leave it empty.' : '');
const TRACK_HINT = 'In the Lalamove app: open the booking → Share → Copy link. The customer can then watch the rider move live.';

const copy = async (text, setMsg) => { try { await navigator.clipboard.writeText(text); setMsg('Copied'); } catch { setMsg('Select and copy it by hand'); } setTimeout(() => setMsg(''), 1600); };

/** Booking Lalamove: everything to type into the Lalamove app, then "I booked it". */
function BookModal({ order, settings, onClose, onDone }) {
  const d = order.delivery;
  const [cost, setCost] = useState('');
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const drop = `${order.customer} · ${order.phone}\n${addrText(d)}`;
  return (
    <Modal title={`Book Lalamove · #${pad(order.no)}`} aside={<span className="pill">{d.km} km</span>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={async () => { const le = trackErr(link); setLinkErr(le); if (le) return; setBusy(true); await onDone(cost, link); setBusy(false); }}>{busy ? 'Saving…' : 'I booked it · Waiting for rider'}</button></>}>
      <ol className="book-steps">
        <li>Open the <b>Lalamove</b> app and choose <b>Motorcycle</b>.</li>
        <li><b>Pick-up:</b> {settings?.name || 'your shop'}{settings?.delivery?.label ? ` (${settings.delivery.label})` : ''}.</li>
        <li><b>Drop-off:</b> paste the pin link, then add the details below for the rider.</li>
        <li>Book it, then tap <b>Share</b> on the booking and paste the link below, so the customer can watch the rider live.</li>
        <li>Tap <b>I booked it</b>. The customer sees “Waiting for a rider”.</li>
      </ol>
      <div className="book-box">
        <div><small>Drop-off pin</small><span className="num">{(+d.lat).toFixed(6)}, {(+d.lng).toFixed(6)}</span></div>
        <button className="btn sm" onClick={() => copy(mapsLink(d.lat, d.lng), setMsg)}>Copy pin link</button>
      </div>
      <div className="book-box">
        <div><small>Details for the rider</small><span style={{ whiteSpace: 'pre-line' }}>{drop}{d.note ? `\nNote: ${d.note}` : ''}</span></div>
        <button className="btn sm" onClick={() => copy(`${drop}${d.note ? `\nNote: ${d.note}` : ''}`, setMsg)}>Copy</button>
      </div>
      {msg && <span className="pill ok">{msg}</span>}
      <p className="muted" style={{ margin: 0 }}>{d.free ? <>Free delivery for the customer (5+ drinks): <b>the shop pays</b> Lalamove (about {peso(d.fee)}).</> : <>The customer already paid {peso(order.deliveryFee)} for delivery.</>}</p>
      <Field id="bkCost" label="Lalamove fee you were charged (optional)" hint="For your reports. Leave empty if you don’t know yet.">
        <input id="bkCost" type="number" inputMode="decimal" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={String(d.fee || '')} />
      </Field>
      <Field id="bkLink" label="Lalamove tracking link (recommended)" error={linkErr} hint={TRACK_HINT}>
        <input id="bkLink" maxLength={300} value={link} onChange={(e) => { setLink(e.target.value.trim()); setLinkErr(''); }} placeholder="https://…" />
      </Field>
    </Modal>
  );
}

/** Add or change the Lalamove share link after booking. */
function TrackLinkModal({ order, onClose, onDone, toast }) {
  const [link, setLink] = useState(order.delivery?.trackUrl || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const e = trackErr(link); setErr(e); if (e) return;
    setBusy(true);
    try { await api.post(`/online/${order._id}/delivery/track`, { trackUrl: link }); onDone(); }
    catch (x) { setErr(x.fields?.trackUrl || ''); toast(x.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Tracking link · #${pad(order.no)}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <Field id="tkLink" label="Lalamove tracking link" error={err} hint={TRACK_HINT}>
        <input id="tkLink" autoFocus maxLength={300} value={link} onChange={(e) => { setLink(e.target.value.trim()); setErr(''); }} placeholder="https://…" />
      </Field>
      {order.delivery?.trackUrl && <a className="linkbtn" href={order.delivery.trackUrl} target="_blank" rel="noopener noreferrer">Open the current link ↗</a>}
    </Modal>
  );
}

/** The rider came: their details from the Lalamove app, so the customer can see who is coming. */
function RiderModal({ order, onClose, onDone, toast }) {
  const [f, setF] = useState({ name: '', phone: '', plate: '', trackUrl: order.delivery?.trackUrl || '' });
  const { errs, check, clear, fromServer } = useErrors();
  const [busy, setBusy] = useState(false);
  const set = (k, v) => { setF({ ...f, [k]: v }); clear(k); };
  const save = async () => {
    if (!check({ ...(f.name.trim().length < 2 ? { name: 'Enter the rider’s name (from the Lalamove app).' } : {}), ...(trackErr(f.trackUrl) ? { trackUrl: trackErr(f.trackUrl) } : {}) })) return;
    setBusy(true);
    try { await api.post(`/online/${order._id}/delivery/picked`, f); onDone(); }
    catch (e) { fromServer(e, toast); }
    finally { setBusy(false); }
  };
  return (
    <Modal title={`Rider picked up · #${pad(order.no)}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'On the way'}</button></>}>
      <p className="muted" style={{ margin: 0 }}>Copy these from the Lalamove app. The customer sees the rider and can follow them.</p>
      <div className="row">
        <Field id="rdName" label="Rider’s name" error={errs.name} style={{ flex: '2 1 180px' }}><input id="rdName" autoFocus maxLength={40} value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field id="rdPlate" label="Plate no. (optional)" error={errs.plate}><input id="rdPlate" maxLength={12} value={f.plate} onChange={(e) => set('plate', e.target.value.toUpperCase())} placeholder="ABC 1234" /></Field>
      </div>
      <Field id="rdPhone" label="Rider’s mobile (optional)" error={errs.phone}><input id="rdPhone" inputMode="tel" maxLength={20} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0917 123 4567" /></Field>
      <Field id="rdLink" label="Lalamove tracking link (optional)" error={errs.trackUrl} hint={TRACK_HINT}><input id="rdLink" maxLength={300} value={f.trackUrl} onChange={(e) => set('trackUrl', e.target.value.trim())} placeholder="https://…lalamove…" /></Field>
    </Modal>
  );
}

const SLIP_CSS = `
  @page { size: 80mm auto; margin: 4mm; }
  body { margin: 0; font: 12px/1.4 "Helvetica Neue", Arial, sans-serif; color: #000; }
  .slip { width: 72mm; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 13px; margin: 8px 0 2px; text-transform: uppercase; letter-spacing: .08em; }
  .big { font-size: 15px; font-weight: 700; }
  .qr { display: flex; gap: 8px; align-items: center; margin-top: 8px; } .qr img { width: 30mm; height: 30mm; }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0; } ul { margin: 0; padding-left: 16px; }
`;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Delivery slip for the rider / the bag: address, landmark, mobile, drinks and a QR that opens the pin in Google Maps. */
function printSlip(o, s) {
  const d = o.delivery;
  const qr = qrPng(mapsLink(d.lat, d.lng));
  printHtml(`<div class="slip"><h1>${esc(s?.name || 'Matchéa')} · #${pad(o.no)}</h1><div>Delivery by Lalamove · ${esc(d.km)} km</div><hr>
    <h2>Deliver to</h2><div class="big">${esc(o.customer)} · ${esc(o.phone)}</div><div>${esc(d.detail)}</div>${d.landmark ? `<div>Landmark: <b>${esc(d.landmark)}</b></div>` : ''}<div>${esc(d.label)}</div>${d.note ? `<div>Note: ${esc(d.note)}</div>` : ''}
    <div class="qr"><img src="${qr}" alt=""><div>Scan to open the pin in Google Maps</div></div><hr>
    <h2>Drinks</h2><ul>${o.lines.map((l) => `<li>${l.qty}× ${esc(l.name)}${l.mods ? ` <small>(${esc(l.mods)})</small>` : ''}</li>`).join('')}</ul><hr>
    <div class="big">PAID${d.free ? ' · Free delivery' : ''}</div></div>`, SLIP_CSS, `Delivery slip #${pad(o.no)}`);
}
