import { useEffect, useState } from 'react';
import { call } from './api';
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

// Payment option icons (same look as the POS)
const PAY_ICON = {
  gcash: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0A6DFF" /><path d="M15.6 9.2A4.4 4.4 0 1 0 16.4 12h-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>,
  maya: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#00A86B" /><path d="M7.5 15.5v-5.2c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v5.2-5.2c0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8v5.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>,
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
  // How to pay: 'gcash' | 'maya' (scan the shop's QR) | 'pm:gcash' | 'pm:paymaya' (PayMongo, opens the app) | 'pickup'
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
  const PM_NAME = { gcash: 'GCash', paymaya: 'Maya' };
  const needQr = !!qrMethod && total > 0;
  const qrImg = useAmountQr(qrMethod ? qrs[qrMethod] : null, total, menu?.shop?.name);
  const phone = isPhone();
  const appName = qrMethod === 'maya' ? 'Maya' : 'GCash';
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

  return (
    <div className="ck">
      <section className="panel ck-items">
        <div className="ck-h"><h1>Your order</h1><button className="shop-link" onClick={() => go('/menu')}>+ Add more</button></div>
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

      <aside className="panel ck-side">
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
        {canReward && live.length > 0 && (
          <label className={`reward ${useReward ? 'on' : ''}`}>
            <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
            <span><b>Use my free drink</b><small>{freeItem ? `${freeItem.name}, regular size: −${peso(freeValue)}` : ''}. Upsize and add-ons are still charged.</small></span>
          </label>
        )}
        {bigOrder && !noShowRule && total > 0 && <div className="note-box">For big orders (over {peso(ONLINE.payFirstOver)} or more than {ONLINE.payFirstDrinks} drinks), please pay first with {Object.keys(qrs).map((k) => (k === 'gcash' ? 'GCash' : 'Maya')).join(' or ') || 'online payment'}. Thank you!</div>}
        {noShowRule && total > 0 && <div className="note-box">Because 2 recent orders weren’t picked up, please pay first for this order (GCash, Maya or online). Pay at pickup will be back after a while.</div>}
        {total > 0 && options.length > 1 && (
          <fieldset className="pay pay2">
            <legend><span>Payment</span><em>Total <b className="num">{peso(total)}</b></em></legend>
            {options.map((k) => (
              <label key={k} className={`${method === k ? 'on' : ''} pk-${k.replace(':', '-')}`}>
                <input type="radio" name="pay" checked={method === k} onChange={() => { setMethod(k); clearShot(); }} />
                <i className="pay2-ico" aria-hidden="true">{PAY_ICON[k.startsWith('pm:') ? (k.endsWith('gcash') ? 'gcash' : 'maya') : k] || PAY_ICON.pickup}</i>
                <span>{k === 'gcash' ? <><b>Pay now with GCash</b><small>Scan our QR, then upload your receipt</small></>
                  : k === 'maya' ? <><b>Pay now with Maya</b><small>Scan our QR, then upload your receipt</small></>
                  : k.startsWith('pm:') ? <><b>Pay in the {PM_NAME[k.slice(3)]} app</b><small>Log in and pay, confirmed right away · +{peso(withOnlineFee(total, k.slice(3)).fee)} online fee</small></>
                  : <><b>Pay at pickup</b><small>Cash, GCash or Maya at the counter</small></>}</span>
                <i className="pay2-tick" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></i>
              </label>
            ))}
          </fieldset>
        )}
        {needQr && (
          <div className={`qrpay qp2 qp-${qrMethod}`}>
            <div className="qp-head">
              <span className={`qp-app ${qrMethod}`}><i aria-hidden="true">{PAY_ICON[qrMethod]}</i>{appName}</span>
              <div className="qp-amt"><small>Amount to pay</small><b className="num">{peso(total)}</b></div>
              {qrs[qrMethod].name && <div className="qp-to"><small>Send to</small><b>{qrs[qrMethod].name}</b>{qrs[qrMethod].number && <span className="num">{qrs[qrMethod].number.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')}</span>}</div>}
            </div>
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
                    <li>{qrMethod === 'gcash' ? <>In GCash: <b>QR</b> → <b>Upload QR</b>, pick the picture.</> : <>In Maya: <b>Scan</b> → <b>Upload QR</b>, pick the picture.</>}</li>
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
                <label className="qr-up">
                  <input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) pickShot(file); }} />
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
                  <span><b>Upload {appName} receipt screenshot</b><small>We read the amount and Ref No. for you. Nothing to type.</small></span>
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
        <p className="muted center small">{total <= 0 ? 'Nothing to pay. Enjoy your free drink!' : payable ? `You’ll log in to ${PM_NAME[payType]} on PayMongo’s secure page, pay, then come back here to track your order.` : needQr ? 'Your order is sent with your receipt screenshot.' : 'Pay at the counter by cash, GCash or Maya.'} {delivering ? 'Delivered by Lalamove: you can follow the rider on your order page.' : canDeliver ? '' : 'Pickup only.'}</p>
      </aside>
    </div>
  );
}

/** GCash refs are digits shown as 1011 234 567890; Maya refs keep letters and numbers. */
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

/** Makes a phone screenshot small (max 1080px, JPEG) so it uploads quickly. */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type) || file.size > 15e6) { reject(new Error('bad')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1080 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = 0.75, out = c.toDataURL('image/jpeg', q);
      while (out.length > 650000 && q > 0.35) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      out.length > 680000 ? reject(new Error('big')) : resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad')); };
    img.src = url;
  });
}

/** SHA-256 of the original picture file, so the exact same screenshot sent again can be spotted ('' if the browser can't). */
async function fileFingerprint(file) {
  try {
    if (!window.crypto?.subtle) return '';
    const h = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}
