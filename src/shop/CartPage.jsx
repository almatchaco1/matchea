import { useEffect, useState } from 'react';
import { call } from './api';
import { shrinkImage } from '../lib/shrinkImage';
import { ONLINE, checkQrRef, checkPaidTime, ONLINE_FEE_PCT, withOnlineFee } from '../shared/rules.mjs';
import { peso } from '../lib/format';
import { rewardsReady, rewardValue } from '../shared/loyalty.mjs';
import { computeTotals } from '../shared/pricing.mjs';
import { RollNum } from './fx';
import { sceneBg } from '../lib/drinkImages';
import { Doodle } from './art';
import { useAmountQr, saveQr, openGcash, isPhone } from '../lib/payqr';
import { checkAddress, findArea, quoteFor } from '../shared/delivery.mjs';
import AddressPicker from './AddressPicker';
import { readReceipt, warmReader } from './receiptRead';
import './pay2.css';
import './qp2.css';
import './pay3.css';

// Payment option icons (same look as the POS)
const PAY_ICON = {
  gcash: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0A6DFF" /><path d="M15.6 9.2A4.4 4.4 0 1 0 16.4 12h-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>,
  gotyme: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0B3954" /><circle cx="12" cy="12" r="8.2" fill="none" stroke="#3FDCEC" strokeWidth="1.2" opacity=".55" /><text x="12" y="15.2" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.6" fontWeight="800" letterSpacing="-.2" fill="#3FDCEC">GT</text></svg>,
  pickup: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5 5.6 4h12.8L20 9.5M5 9.5V20h14V9.5" /><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5" /></svg>,
};

export default function CartPage({ menu, me, payFirst, cart, setCart, priced, total: subtotal, go, onEdit, onPlaced }) {
  const payOnline = !!menu?.shop?.payOnline;
  const qrs = menu?.shop?.qr || {};
  const canPayFirst = payOnline || Object.keys(qrs).length > 0;
  const noShowRule = !!payFirst && canPayFirst; // 2 recent orders weren't picked up → pay first this time
  const drinkCount = cart.reduce((a, l) => a + (+l.qty || 0), 0);
  const bigOrder = canPayFirst && (subtotal > ONLINE.payFirstOver || drinkCount > ONLINE.payFirstDrinks); // big orders are paid first
  // Pickup or delivery (delivery is always paid first, so it needs a way to pay first)
  const dcfg = menu?.shop?.delivery || null;
  const canDeliver = !!dcfg && canPayFirst;
  const [fulfil, setFulfil] = useState(() => { try { return sessionStorage.getItem('alm.fulfil') === 'delivery' ? 'delivery' : 'pickup'; } catch { return 'pickup'; } });
  const delivering = canDeliver && fulfil === 'delivery';
  const chooseFulfil = (v) => { setFulfil(v); try { sessionStorage.setItem('alm.fulfil', v); } catch {} };
  // last address is filled in again (the area only if the shop still delivers there)
  const [addr, setAddr] = useState(() => { const a = me.address || {}; return { area: findArea(dcfg, a.area)?.name || '', detail: a.detail || '', landmark: a.landmark || '', note: a.note || '' }; });
  const [addrErrs, setAddrErrs] = useState({});
  const area = delivering ? findArea(dcfg, addr.area) : null;
  const quote = area ? quoteFor(area, drinkCount, dcfg) : null;
  const deliveryCharge = quote ? quote.charge : 0;
  const pickupOk = menu?.shop?.payAtPickup !== false && !noShowRule && !bigOrder && !delivering;
  // How to pay: 'gcash' | 'gotyme' (scan the shop's QR) | 'pm:gcash' (PayMongo, opens the app) | 'pickup'
  const pmTypes = payOnline ? (menu?.shop?.payTypes || []).filter((t) => ONLINE_FEE_PCT[t]) : [];
  const options = [...Object.keys(qrs), ...pmTypes.map((t) => 'pm:' + t), ...(pickupOk ? ['pickup'] : [])];
  const [chosen, setMethod] = useState(null); // null = the first option (the menu may still be loading)
  const method = chosen && options.includes(chosen) ? chosen : options[0] || 'pickup';
  const payNow = method.startsWith('pm:');
  const payType = payNow ? method.slice(3) : '';
  const qrMethod = qrs[method] ? method : null;
  const [shot, setShot] = useState('');       // receipt screenshot (small JPEG): the proof of payment
  const [shotPrint, setShotPrint] = useState(''); // fingerprint of the original file, to spot a screenshot used before
  const [shotMsg, setShotMsg] = useState('');
  const [read, setRead] = useState(null);     // what we read from the screenshot: { status: 'reading'|'done'|'fail', ref, amount, time }
  const [sendAnyway, setSendAnyway] = useState(false); // customer says the receipt is right even though something didn't match
  const canReward = rewardsReady(me.stamps) > 0;
  const [useReward, setUseReward] = useState(false);
  const live = priced.filter((l) => !l.missing);
  const freeValue = rewardValue(live.map((l) => menu?.items.find((i) => i._id === l.productId)?.price));
  const freeItem = live.map((l) => menu?.items.find((i) => i._id === l.productId)).filter(Boolean).sort((a, b) => b.price - a.price)[0];
  const itemsTotal = useReward && canReward ? computeTotals(subtotal, { type: 'reward', amount: freeValue }).total : subtotal;
  const total = Math.round((itemsTotal + deliveryCharge) * 100) / 100; // what the customer pays (with delivery)
  const payable = payOnline && payNow && total > 0;
  const fee = payable ? withOnlineFee(total, payType) : { total, fee: 0 }; // PayMongo's fee, paid by the customer
  const PM_NAME = { gcash: 'GCash' };
  const needQr = !!qrMethod && total > 0;
  const qrImg = useAmountQr(qrMethod ? qrs[qrMethod] : null, total, menu?.shop?.name);
  const phone = isPhone();
  const appName = qrMethod === 'gotyme' ? 'GoTyme' : 'GCash';
  useEffect(() => { if (needQr) warmReader(); }, [needQr]); // start loading the receipt reader early
  // What's wrong with the receipt, if anything (checked again whenever the total changes)
  const readRef = read?.ref && !checkQrRef(qrMethod, read.ref) ? read.ref : '';
  // How long ago the receipt was paid: from its date + time when we could read the date, else from the time alone
  const readTime = !read?.time ? null : read.date ? (() => {
    const [Y, M, D] = read.date.split('-').map(Number), [h, m] = read.time.split(':').map(Number);
    const mins = Math.round((Date.now() - (Date.UTC(Y, M - 1, D, h, m) - 8 * 3600e3)) / 60000);
    return mins < -ONLINE.payTimeAhead ? { err: 'future' } : { mins: Math.max(0, mins) };
  })() : checkPaidTime(read.time);
  const problem = !shot || !read || read.status === 'reading' ? ''
    : read.status === 'fail' || (!readRef && read.amount == null) ? `We couldn’t read this picture. Upload a clear screenshot of the whole ${appName} receipt, showing the amount and the Ref No.`
    : read.amount != null && Math.abs(read.amount - total) > 0.009 ? `This receipt is for ${peso(read.amount)}, but your order is ${peso(total)}. Upload the receipt for ${peso(total)}.`
    : !readRef ? `We couldn’t find the reference number on this picture. Upload a screenshot that shows the Ref No.`
    : readTime?.err === 'future' ? 'The date on this receipt hasn’t come yet. Upload the receipt for this payment.'
    : readTime && !readTime.err && readTime.mins > ONLINE.payTimeOld ? `This receipt is from ${readTime.mins >= 1440 ? fmtDate(read.date) : fmtTime(read.time)}, ${ago(readTime.mins)}. Upload the receipt for this order’s payment.`
    : '';
  const pickShot = async (file) => {
    setShotMsg(''); setSendAnyway(false); setRead({ status: 'reading' });
    try {
      const [data, print] = await Promise.all([shrinkImage(file), fileFingerprint(file)]);
      setShot(data); setShotPrint(print);
    } catch { setShot(''); setRead(null); setShotMsg('That picture couldn’t be used. Try another screenshot.'); return; }
    try { const r = await readReceipt(file, qrMethod); setRead({ status: 'done', ref: r.ref, amount: r.amount, time: r.time, date: r.date }); }
    catch { setRead({ status: 'fail' }); } // the reader didn't load (old phone / no connection): the shop checks the picture
  };
  const clearShot = () => { setShot(''); setShotPrint(''); setShotMsg(''); setRead(null); setSendAnyway(false); };
  const [saved, setSaved] = useState('');
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const bad = priced.filter((l) => l.missing || l.soldOut);

  const place = async () => {
    setMsg('');
    if (bad.length) { setMsg('Remove the items that are no longer available first.'); return; }
    if (note.length > ONLINE.pickupNote) { setMsg(`The note can be at most ${ONLINE.pickupNote} characters.`); return; }
    if (delivering) {
      const e = checkAddress(addr, dcfg);
      setAddrErrs(e);
      if (Object.keys(e).length) { setMsg('Check your delivery address.'); return; }
    }
    if (needQr) {
      if (!shot) { setShotMsg(`Upload a screenshot of your ${appName} receipt.`); setMsg(`Pay with ${appName} first, then upload the receipt screenshot.`); return; }
      if (read?.status === 'reading') { setMsg('Still reading your receipt. One moment…'); return; }
      if (problem && !sendAnyway) { setMsg(problem); return; }
    }
    if (total > 0 && !options.length) { setMsg('Online ordering can’t take payments right now. Please order at the counter.'); return; }
    setBusy(true);
    try {
      const o = await call('POST', '/public/orders', {
        pickupNote: note, payNow: payable,
        ...(delivering ? { fulfil: 'delivery', delivery: { area: addr.area, detail: addr.detail, landmark: addr.landmark, note: addr.note || '' } } : {}), ...(payable ? { payType } : {}), useReward: useReward && canReward,
        qrPay: needQr ? { method: qrMethod, ref: readRef, paidTime: readTime && !readTime.err ? read.time : '', ...(read?.date && readTime && !readTime.err ? { paidDate: read.date } : {}), ...(read?.amount != null ? { readAmount: read.amount } : {}), shot, shotPrint } : undefined,
        lines: cart.map(({ productId, sizeId, addonIds, sweet, note: n, qty }) => ({ productId, sizeId, addonIds, sweet, note: n, qty })),
      });
      setCart([]); onPlaced();
      if (o.notice) { try { sessionStorage.setItem('alm.notice.' + o.code, o.notice); } catch {} }
      try { sessionStorage.setItem('alm.new.' + o.code, '1'); } catch {}
      if (o.checkoutUrl) window.location.assign(o.checkoutUrl); // PayMongo's secure payment page
      else go('/order/' + o.code);
    } catch (e) {
      if (e.fields?.qrShot || e.fields?.qrRef || e.fields?.qrTime) setShotMsg(e.fields.qrShot || e.fields.qrRef || e.fields.qrTime);
      if (e.fields?.pin || e.fields?.detail || e.fields?.landmark) setAddrErrs(e.fields);
      setMsg(e.fields?.phone ? e.fields.phone : e.message);
    } finally { setBusy(false); }
  };

  if (!menu) return (
    <section className="panel skel-cart" aria-busy="true" aria-label="Loading your cart">
      <div className="skel skel-line" style={{ width: 140, height: 26 }} />
      {[0, 1].map((i) => <div key={i} className="row"><div className="skel" style={{ width: 64, height: 64, borderRadius: 14, flex: 'none' }} /><div style={{ flex: 1 }}><div className="skel skel-line" style={{ width: '60%' }} /><div className="skel skel-line" style={{ width: '35%' }} /></div></div>)}
      <div className="skel" style={{ height: 48, borderRadius: 999, marginTop: 8 }} />
    </section>
  );
  if (!cart.length) return (
    <section className="panel center empty-state">
      <Doodle kind="cart" />
      <h1>Your cart is empty</h1>
      <p className="muted">Add a drink from the menu to get started.</p>
      <button className="sh-btn" onClick={() => go('/menu')}>See the menu</button>
    </section>
  );

  const step = !delivering || (addr.area && addr.detail && addr.landmark) ? 3 : 2; // where the customer is: the address is the only thing that can hold them up
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="ck ck7">
      <ol className="ck7-steps" aria-label="Checkout steps">
        {[['ck7-order', 'Your order', `${drinkCount} ${drinkCount === 1 ? 'drink' : 'drinks'}`], ['ck7-get', delivering ? 'Delivery' : 'Pickup', delivering ? (addr.area || 'Add your address') : 'At the shop'], ['ck7-pay', 'Pay', total > 0 ? peso(fee.total) : 'Free']].map(([id, t, sub], k) => (
          <li key={id} className={k + 1 < step ? 'done' : k + 1 === step ? 'now' : ''}>
            <button type="button" onClick={() => scrollTo(id)}>
              <span className="ck7-n">{k + 1 < step ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg> : k + 1}</span>
              <span><b>{t}</b><small>{sub}</small></span>
            </button>
          </li>
        ))}
      </ol>

      <div className="ck7-grid">
        <div className="ck7-main">
          <section className="panel ck-items ck7-card" id="ck7-order">
            <div className="ck-h"><h1><span className="ck7-badge">1</span>Your order</h1><button className="shop-link" onClick={() => go('/menu')}>+ Add more</button></div>
            <ul className="lines">
              {priced.map((l, i) => (
                <li key={i} className={l.missing || l.soldOut ? 'gone' : ''}>
                  {l.image && <img src={l.image} alt="" className={sceneBg(l.image) ? 'scene-bg' : undefined} style={sceneBg(l.image)} />}
                  <div className="grow">
                    <b>{l.name || 'Item no longer on the menu'}</b>
                    <small>{l.missing ? 'No longer available' : l.soldOut ? (l.notAvailable ? 'Not available right now' : 'Sold out right now') : l.mods}</small>
                    <div className="line-actions">
                      {!l.missing && <button className="shop-link" onClick={() => onEdit(i)}>Edit</button>}
                      <button className="shop-link" onClick={() => setCart(cart.filter((_, k) => k !== i))}>Remove</button>
                    </div>
                  </div>
                  <div className="line-r">
                    <div className="qty sm">
                      <button onClick={() => setCart(cart.flatMap((x, k) => (k !== i ? [x] : x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : [])))} aria-label="Fewer">−</button>
                      <span>{l.qty}</span>
                      <button onClick={() => setCart(cart.map((x, k) => (k === i ? { ...x, qty: Math.min(ONLINE.lineQty, x.qty + 1) } : x)))} disabled={l.qty >= ONLINE.lineQty} aria-label="More">+</button>
                    </div>
                    <b>{peso(l.total)}</b>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel ck7-card" id="ck7-get">
            <h2 className="ck7-h"><span className="ck7-badge">2</span>{canDeliver ? 'Pickup or delivery' : 'Pickup'}</h2>
        {canDeliver && (
          <div className="ck-fulfil" role="radiogroup" aria-label="Pickup or delivery">
            <button type="button" role="radio" aria-checked={!delivering} className={!delivering ? 'on' : ''} onClick={() => chooseFulfil('pickup')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16l-1.5 9.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5Z M8 10V7a4 4 0 0 1 8 0v3" /></svg><span><b>Pickup</b><small>At the shop</small></span></button>
            <button type="button" role="radio" aria-checked={delivering} className={delivering ? 'on' : ''} onClick={() => chooseFulfil('delivery')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M9 17h6l-2-7H9M13 10h4l2 4M15 6h3" /></svg><span><b>Delivery</b><small>{dcfg.freeDrinks ? `Free from ${dcfg.freeDrinks} drinks` : 'By Lalamove'}</small></span></button>
          </div>
        )}
        {delivering && <AddressPicker cfg={dcfg} quote={quote} value={addr} onChange={(a, k) => { setAddr(a); setAddrErrs((e) => ({ ...e, [k]: '' })); }} errs={addrErrs} />}
        <div className="ck-who">
          <div><span className="muted">{delivering ? 'Deliver to' : 'Pickup for'}</span><b>{me.name}</b>{me.phone ? <span className="num">{me.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')}</span> : me.email ? <span>{me.email}</span> : null}</div>
          <button className="shop-link" onClick={() => go('/account')}>Change</button>
        </div>
        {!delivering && <label className="au-field">
          <span>Note for the shop <i className="opt">optional</i></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={ONLINE.pickupNote} placeholder="Picking up at 3pm" />
        </label>}
          </section>

          <section className="panel ck7-card ck7-paycard" id="ck7-pay">
            <h2 className="ck7-h"><span className="ck7-badge">3</span>Payment</h2>
        {canReward && live.length > 0 && (
          <label className={`reward ${useReward ? 'on' : ''}`}>
            <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
            <span><b>Use my free drink</b><small>{freeItem ? `${freeItem.name}, regular size: −${peso(freeValue)}` : ''}. Upsize and add-ons are still charged.</small></span>
          </label>
        )}
        {bigOrder && !noShowRule && total > 0 && <div className="note-box">For big orders (over {peso(ONLINE.payFirstOver)} or more than {ONLINE.payFirstDrinks} drinks), please pay first with {Object.keys(qrs).map((k) => (k === 'gcash' ? 'GCash' : 'GoTyme')).join(' or ') || 'online payment'}. Thank you!</div>}
        {noShowRule && total > 0 && <div className="note-box">Because 2 recent orders weren’t picked up, please pay first for this order (GCash, GoTyme or online). Pay at pickup will be back after a while.</div>}
        {total > 0 && options.length > 0 && (
          <fieldset className={`pay pay2 pay3 n-${options.length}`}>
            <legend><span>Payment</span><em>Total <b className="num">{peso(total)}</b></em></legend>
            {options.map((k) => (
              <label key={k} className={`${method === k ? 'on' : ''} pk-${k.replace(':', '-')}`}>
                <input type="radio" name="pay" checked={method === k} onChange={() => { setMethod(k); clearShot(); }} />
                <i className="pay2-ico" aria-hidden="true">{PAY_ICON[k.startsWith('pm:') ? 'gcash' : k] || PAY_ICON.pickup}</i>
                <span>{k === 'gcash' ? <><b>Pay now with GCash</b><small>Scan our QR, then upload your receipt</small></>
                  : k === 'gotyme' ? <><b>Pay now with GoTyme</b><small>Scan our QR, then upload your receipt</small></>
                  : k.startsWith('pm:') ? <><b>Pay in the {PM_NAME[k.slice(3)]} app</b><small>Log in and pay, confirmed right away</small></>
                  : <><b>Pay at pickup</b><small>Cash, GCash or GoTyme at the counter</small></>}</span>
                <em className="pay3-badge">{k === 'pickup' ? 'Pay later' : k.startsWith('pm:') ? `+${peso(withOnlineFee(total, k.slice(3)).fee)} fee` : 'No fee'}</em>
                <i className="pay2-tick" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></i>
              </label>
            ))}
            <p className="pay3-safe"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Zm7 4v2" /></svg>{method === 'pickup' ? 'You pay when you collect your order.' : 'You pay the shop directly. We never ask for your PIN or OTP.'}</p>
          </fieldset>
        )}
        {needQr && (
          <div className={`qrpay qp2 qp3 qp-${qrMethod} ${shot ? 'has-shot' : ''}`}>
            <div className="qp-head">
              <span className={`qp-app ${qrMethod}`}><i aria-hidden="true">{PAY_ICON[qrMethod]}</i>{appName}</span>
              <div className="qp-amt"><small>Amount to pay</small><b className="num">{peso(total)}</b></div>
              {qrs[qrMethod].name && <div className="qp-to"><small>Send to</small><b>{qrs[qrMethod].name}</b>{qrs[qrMethod].number && <span className="num">{qrs[qrMethod].number.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')}
                <button type="button" className="qp3-copy" onClick={() => { try { navigator.clipboard.writeText(qrs[qrMethod].number); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* old browser */ } }}>{copied ? 'Copied ✓' : 'Copy'}</button></span>}</div>}
            </div>
            <ol className="qp3-track" aria-label="Paying by QR">
              <li className={shot ? 'done' : 'now'}><i>{shot ? '✓' : '1'}</i>Pay in {appName}</li>
              <li className={shot && read?.status !== 'reading' && (!problem || sendAnyway) ? 'done' : shot ? 'now' : ''}><i>{shot && read?.status !== 'reading' && (!problem || sendAnyway) ? '✓' : '2'}</i>Upload receipt</li>
              <li className={shot && read?.status !== 'reading' && (!problem || sendAnyway) ? 'now' : ''}><i>3</i>Place order</li>
            </ol>
            <div className="qp-body">
              <div className="qp-code">
                <span className="qp-frame"><i aria-hidden="true" /><img className="qrpay-img" src={qrImg || `/api/public/qr/${qrMethod}?v=${qrs[qrMethod].v}`} alt={`Our ${appName} QR code for ${peso(total)}`} /></span>
                <div className="qrpay-btns">
                  <button type="button" className="sh-btn ghost sm" onClick={async () => { const r = await saveQr(qrImg || `/api/public/qr/${qrMethod}?v=${qrs[qrMethod].v}`, `matchea-${qrMethod}-${Math.round(total)}.png`); if (r !== 'cancelled') setSaved(r); }}>{saved ? 'Saved ✓' : 'Save QR'}</button>
                  {phone && qrMethod === 'gcash' && <button type="button" className="sh-btn sm" onClick={openGcash}>Open GCash</button>}
                </div>
              </div>
              <div className="qp-how">
                <span className="qp-step"><i>1</i>Pay with {appName}</span>
                <ol className="qrpay-steps">
                  {phone ? <>
                    <li>Tap <b>Save QR</b>{saved === 'shared' ? '' : ' to keep it in your photos'}.</li>
                    <li>{qrMethod === 'gcash' ? <>In GCash: <b>QR</b> → <b>Upload QR</b>, pick the picture.</> : <>In GoTyme: <b>Scan QR</b> → upload from your gallery, pick the picture.</>}</li>
                    <li>{qrImg ? <>Pay the <b>{peso(total)}</b> that fills in.</> : <>Type exactly <b>{peso(total)}</b> and pay.</>}</li>
                  </> : <>
                    <li>Scan this QR with {appName} on your phone.</li>
                    <li>{qrImg ? <>Pay the <b>{peso(total)}</b> that fills in.</> : <>Type exactly <b>{peso(total)}</b> and pay.</>}</li>
                  </>}
                </ol>
                {qrImg && <span className="qrpay-auto">✓ Amount is already in the QR</span>}
              </div>
            </div>
            <div className="qp-form">
              <span className="qp-step"><i>2</i>Upload your receipt</span>
              {!shot && read?.status !== 'reading' ? (
                <label className={`qr-up ${dragOver ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer?.files?.[0]; if (file) pickShot(file); }}>
                  <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) pickShot(file); }} />
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
                  <span><b>Upload {appName} receipt screenshot</b><small>Tap to choose{phone ? '' : ' or drop it here'}. We read the amount and Ref No. for you.</small></span>
                </label>
              ) : (
                <div className={`qr-read ${read?.status === 'reading' ? 'busy' : problem ? (sendAnyway ? 'warn' : 'bad') : 'ok'}`} aria-live="polite">
                  {shot ? <img src={shot} alt="Your receipt" /> : <span className="qr-read-ph" aria-hidden="true" />}
                  <div className="qr-read-b">
                    {read?.status === 'reading' ? <><b><span className="qr-dots" aria-hidden="true"><i /><i /><i /></span>Reading your receipt…</b><small>This takes a few seconds.</small></>
                      : <>
                        <b>{problem ? (sendAnyway ? 'The shop will check it' : 'Check this receipt') : 'Receipt checked'}</b>
                        <ul className="qr-facts">
                          {read?.amount != null && <li className={Math.abs(read.amount - total) > 0.009 ? 'no' : 'yes'}>Amount {peso(read.amount)}</li>}
                          {readRef && <li className="yes">Ref {readRef.replace(/^(\d{4})(\d{3})(\d{6})$/, '$1 $2 $3')}</li>}
                          {read?.time && <li className={problem && readTime?.mins > ONLINE.payTimeOld ? 'no' : 'yes'}>Paid {fmtTime(read.time)}</li>}
                        </ul>
                      </>}
                  </div>
                  {read?.status !== 'reading' && <button type="button" className="shop-link" onClick={clearShot}>Change</button>}
                </div>
              )}
              {problem && read && read.status !== 'reading' ? (
                <div className={`qr-problem ${sendAnyway ? 'ok' : ''}`} role="alert">
                  <span>{sendAnyway ? 'OK. The shop will compare this screenshot with their GCash app before making your drinks.'.replace('GCash', appName) : problem}</span>
                  {!sendAnyway && <button type="button" className="shop-link" onClick={() => setSendAnyway(true)}>My receipt is correct, send it anyway</button>}
                </div>
              ) : null}
              {shotMsg && <small className="au-err" role="alert">{shotMsg}</small>}
            </div>
            <p className="qp-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>The shop checks your payment, then starts your drinks.</p>
          </div>
        )}
            {total <= 0 && <p className="muted">Nothing to pay. Enjoy your free drink!</p>}
          </section>
        </div>

        <aside className="panel ck-side ck7-sum">
          <h2 className="ck7-sum-h">Order summary</h2>
          <ul className="ck7-mini">
            {priced.filter((l) => !l.missing).map((l, i) => (
              <li key={i}><span className="ck7-q">{l.qty}×</span><span className="ck7-nm">{l.name}<small>{l.mods}</small></span><b className="num">{peso(l.total)}</b></li>
            ))}
          </ul>
          <div className="ck-disc ck7-sub"><span>Subtotal</span><b className="num">{peso(subtotal)}</b></div>
        {useReward && canReward && <div className="ck-disc"><span>Free drink (stamp card)</span><b>−{peso(subtotal - itemsTotal)}</b></div>}
        {delivering && quote && (
          <div className="ck-disc ck-deliv"><span>Delivery · {quote.area}{quote.free ? ` · free from ${dcfg.freeDrinks} drinks` : ''}</span><b>{quote.free ? <><s>{peso(quote.fee)}</s> Free</> : `+${peso(quote.charge)}`}</b></div>
        )}
        {fee.fee > 0 && <div className="ck-disc ck-fee"><span>Online payment fee ({PM_NAME[payType]})</span><b>+{peso(fee.fee)}</b></div>}
        <div className="ck-total"><span>Total</span><b className="num"><RollNum value={fee.total} format={peso} /></b></div>
        {msg && <div className="shop-alert" role="alert">{msg}</div>}
        {!menu.shop.open && <div className="shop-alert">{menu.shop.message || 'Online ordering is closed right now.'}</div>}
        <button className="sh-btn big" disabled={busy || !menu.shop.open} onClick={place}>
          {busy ? (payable ? 'Opening secure payment…' : 'Placing order…') : payable ? `Pay ${peso(fee.total)} with ${PM_NAME[payType]}` : needQr ? `I’ve paid · Place order` : `Place order · ${peso(total)}`}
        </button>
        <p className="muted center small">{total <= 0 ? 'Nothing to pay. Enjoy your free drink!' : payable ? `You’ll log in to ${PM_NAME[payType]} on PayMongo’s secure page, pay, then come back here to track your order.` : needQr ? 'Your order is sent with your receipt screenshot.' : 'Pay at the counter by cash, GCash or GoTyme.'} {delivering ? 'Delivered by Lalamove: you can follow the rider on your order page.' : canDeliver ? '' : 'Pickup only.'}</p>
        </aside>
      </div>
    </div>
  );
}

/** GCash refs are digits shown as 1011 234 567890; GoTyme refs keep letters and numbers. */
function fmtDate(ymd) {
  const [Y, M, D] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(Y, M - 1, D)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function ago(mins) {
  if (mins >= 2880) return `${Math.floor(mins / 1440)} days ago`;
  if (mins >= 1440) return 'yesterday';
  if (mins >= 120) return `${Math.floor(mins / 60)} hours ago`;
  return `${mins} minutes ago`;
}

function fmtTime(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** SHA-256 of the original picture file, so the exact same screenshot sent again can be spotted ('' if the browser can't). */
async function fileFingerprint(file) {
  try {
    if (!window.crypto?.subtle) return '';
    const h = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}
