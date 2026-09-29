import { useState } from 'react';
import { call } from './api';
import { ONLINE, checkQrRef, checkPaidTime, cleanQrRef } from '../shared/rules.mjs';
import { peso } from '../lib/format';
import { rewardsReady, rewardValue } from '../shared/loyalty.mjs';
import { computeTotals } from '../shared/pricing.mjs';
import { CountUp } from './fx';
import { Loader, Doodle } from './art';
import { useAmountQr, saveQr, openGcash, isPhone } from '../lib/payqr';

export default function CartPage({ menu, me, payFirst, cart, setCart, priced, total: subtotal, go, onEdit, onPlaced }) {
  const payOnline = !!menu?.shop?.payOnline;
  const qrs = menu?.shop?.qr || {};
  const canPayFirst = payOnline || Object.keys(qrs).length > 0;
  const noShowRule = !!payFirst && canPayFirst; // 2 recent orders weren't picked up → pay first this time
  const drinkCount = cart.reduce((a, l) => a + (+l.qty || 0), 0);
  const bigOrder = canPayFirst && (subtotal > ONLINE.payFirstOver || drinkCount > ONLINE.payFirstDrinks); // big orders are paid first
  const pickupOk = menu?.shop?.payAtPickup !== false && !noShowRule && !bigOrder;
  // How to pay: 'gcash' | 'maya' (scan the shop's QR) | 'paymongo' | 'pickup'
  const options = [...Object.keys(qrs), ...(payOnline ? ['paymongo'] : []), ...(pickupOk ? ['pickup'] : [])];
  const [chosen, setMethod] = useState(null); // null = the first option (the menu may still be loading)
  const method = chosen && options.includes(chosen) ? chosen : options[0] || 'pickup';
  const payNow = method === 'paymongo';
  const qrMethod = qrs[method] ? method : null;
  const [ref, setRef] = useState('');
  const [refErr, setRefErr] = useState('');
  const [shot, setShot] = useState('');       // optional receipt screenshot (small JPEG)
  const [shotPrint, setShotPrint] = useState(''); // fingerprint of the original file, to spot a screenshot used before
  const [shotMsg, setShotMsg] = useState('');
  const [paidTime, setPaidTime] = useState(''); // time on the receipt ("HH:MM"), to spot an old receipt
  const [timeErr, setTimeErr] = useState('');
  const canReward = rewardsReady(me.stamps) > 0;
  const [useReward, setUseReward] = useState(false);
  const live = priced.filter((l) => !l.missing);
  const freeValue = rewardValue(live.map((l) => menu?.items.find((i) => i._id === l.productId)?.price));
  const freeItem = live.map((l) => menu?.items.find((i) => i._id === l.productId)).filter(Boolean).sort((a, b) => b.price - a.price)[0];
  const total = useReward && canReward ? computeTotals(subtotal, { type: 'reward', amount: freeValue }).total : subtotal;
  const payable = payOnline && payNow && total > 0;
  const needQr = !!qrMethod && total > 0;
  const qrImg = useAmountQr(qrMethod ? qrs[qrMethod] : null, total, menu?.shop?.name);
  const phone = isPhone();
  const appName = qrMethod === 'maya' ? 'Maya' : 'GCash';
  const [saved, setSaved] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const bad = priced.filter((l) => l.missing || l.soldOut);

  const place = async () => {
    setMsg('');
    if (bad.length) { setMsg('Remove the items that are no longer available first.'); return; }
    if (note.length > ONLINE.pickupNote) { setMsg(`The note can be at most ${ONLINE.pickupNote} characters.`); return; }
    const cleanRef = cleanQrRef(ref);
    if (needQr) {
      const e = checkQrRef(qrMethod, cleanRef), te = checkPaidTime(paidTime).err || '';
      if (e) setRefErr(e);
      if (te) setTimeErr(te);
      if (e || te) return;
    }
    if (total > 0 && !options.length) { setMsg('Online ordering can’t take payments right now. Please order at the counter.'); return; }
    setBusy(true);
    try {
      const o = await call('POST', '/public/orders', {
        pickupNote: note, payNow: payable, useReward: useReward && canReward,
        qrPay: needQr ? { method: qrMethod, ref: cleanRef, paidTime, ...(shot ? { shot, shotPrint } : {}) } : undefined,
        lines: cart.map(({ productId, sizeId, addonIds, sweet, note: n, qty }) => ({ productId, sizeId, addonIds, sweet, note: n, qty })),
      });
      setCart([]); onPlaced();
      if (o.notice) { try { sessionStorage.setItem('alm.notice.' + o.code, o.notice); } catch {} }
      try { sessionStorage.setItem('alm.new.' + o.code, '1'); } catch {}
      if (o.checkoutUrl) window.location.assign(o.checkoutUrl); // PayMongo's secure payment page
      else go('/order/' + o.code);
    } catch (e) {
      if (e.fields?.qrRef) setRefErr(e.fields.qrRef);
      if (e.fields?.qrShot) setShotMsg(e.fields.qrShot);
      if (e.fields?.qrTime) setTimeErr(e.fields.qrTime);
      setMsg(e.fields?.phone ? e.fields.phone : e.message);
    } finally { setBusy(false); }
  };

  if (!menu) return <div className="shop-loading"><Loader /></div>;
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
              {l.image && <img src={l.image} alt="" />}
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
        <div className="ck-who">
          <div><span className="muted">Pickup for</span><b>{me.name}</b>{me.phone ? <span className="num">{me.phone.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')}</span> : me.email ? <span>{me.email}</span> : null}</div>
          <button className="shop-link" onClick={() => go('/account')}>Change</button>
        </div>
        <label className="au-field">
          <span>Note for the shop <i className="opt">optional</i></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={ONLINE.pickupNote} placeholder="Picking up at 3pm" />
        </label>
        {canReward && live.length > 0 && (
          <label className={`reward ${useReward ? 'on' : ''}`}>
            <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
            <span><b>Use my free drink</b><small>{freeItem ? `${freeItem.name}, regular size: −${peso(freeValue)}` : ''}. Upsize and add-ons are still charged.</small></span>
          </label>
        )}
        {bigOrder && !noShowRule && total > 0 && <div className="note-box">For big orders (over {peso(ONLINE.payFirstOver)} or more than {ONLINE.payFirstDrinks} drinks), please pay first with {Object.keys(qrs).map((k) => (k === 'gcash' ? 'GCash' : 'Maya')).join(' or ') || 'online payment'}. Thank you!</div>}
        {noShowRule && total > 0 && <div className="note-box">Because 2 recent orders weren’t picked up, please pay first for this order (GCash, Maya or online). Pay at pickup will be back after a while.</div>}
        {total > 0 && options.length > 1 && (
          <fieldset className="pay">
            <legend>Payment</legend>
            {options.map((k) => (
              <label key={k} className={method === k ? 'on' : ''}>
                <input type="radio" name="pay" checked={method === k} onChange={() => { setMethod(k); setRefErr(''); }} />
                <span>{k === 'gcash' ? <><b>Pay now with GCash</b><small>Scan our QR, then type the reference number</small></>
                  : k === 'maya' ? <><b>Pay now with Maya</b><small>Scan our QR, then type the reference number</small></>
                  : k === 'paymongo' ? <><b>Pay now online</b><small>GCash, Maya or QR Ph · secure checkout by PayMongo</small></>
                  : <><b>Pay at pickup</b><small>Cash, GCash or Maya at the counter</small></>}</span>
              </label>
            ))}
          </fieldset>
        )}
        {needQr && (
          <div className="qrpay">
            <div className="qrpay-h"><b>Pay {peso(total)} with {appName}</b>{qrs[qrMethod].name && <small>to {qrs[qrMethod].name}{qrs[qrMethod].number ? ` · ${qrs[qrMethod].number.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')}` : ''}</small>}</div>
            <img className="qrpay-img" src={qrImg || `/api/public/qr/${qrMethod}?v=${qrs[qrMethod].v}`} alt={`Our ${appName} QR code for ${peso(total)}`} />
            {qrImg && <span className="qrpay-auto">✓ {peso(total)} is already in this QR</span>}
            <div className="qrpay-btns">
              <button type="button" className="sh-btn ghost sm" onClick={async () => { const r = await saveQr(qrImg || `/api/public/qr/${qrMethod}?v=${qrs[qrMethod].v}`, `al-matcha-${qrMethod}-${Math.round(total)}.png`); if (r !== 'cancelled') setSaved(r); }}>{saved ? 'Saved ✓' : 'Save QR'}</button>
              {phone && qrMethod === 'gcash' && <button type="button" className="sh-btn sm" onClick={openGcash}>Open GCash app</button>}
            </div>
            <ol className="qrpay-steps">
              {phone ? <>
                <li>Tap <b>Save QR</b>{saved === 'shared' ? '' : ' (save the picture to your photos)'}.</li>
                <li>{qrMethod === 'gcash' ? <>Tap <b>Open GCash app</b>, then <b>QR</b> → <b>Upload QR</b> and pick the picture.</> : <>Open the Maya app, tap <b>Scan</b> → <b>Upload QR</b> and pick the picture.</>}</li>
                <li>{qrImg ? <>The amount <b>{peso(total)}</b> fills in by itself. Pay it.</> : <>Type exactly <b>{peso(total)}</b> and pay.</>}</li>
                <li>Come back here and type the <b>reference number</b> and <b>time</b> from your receipt.</li>
              </> : <>
                <li>Open {appName} on your phone and scan this QR.</li>
                <li>{qrImg ? <>The amount <b>{peso(total)}</b> fills in by itself. Pay it.</> : <>Type exactly <b>{peso(total)}</b> and pay.</>}</li>
                <li>Type the <b>reference number</b> and <b>time</b> from your receipt below.</li>
              </>}
            </ol>
            <label className="au-field">
              <span>Reference number</span>
              <input value={ref} onChange={(e) => { setRef(fmtRef(qrMethod, e.target.value)); setRefErr(''); }} onBlur={() => { if (ref) setRefErr(checkQrRef(qrMethod, ref)); }}
                inputMode={qrMethod === 'gcash' ? 'numeric' : 'text'} autoCapitalize="characters" maxLength={qrMethod === 'gcash' ? 15 : 24} placeholder={qrMethod === 'gcash' ? '13-digit Ref No. e.g. 1011 234 567890' : 'Reference ID from your Maya receipt'} aria-invalid={!!refErr} />
              {refErr ? <small className="au-err" role="alert">{refErr}</small>
                : qrMethod === 'gcash' && cleanQrRef(ref).length > 0 && <small className="muted">{cleanQrRef(ref).length} of 13 digits</small>}
            </label>
            <label className="au-field">
              <span>Time on your receipt</span>
              <input type="time" value={paidTime} onChange={(e) => { setPaidTime(e.target.value); setTimeErr(''); }} onBlur={() => { if (paidTime) setTimeErr(checkPaidTime(paidTime).err || ''); }} aria-invalid={!!timeErr} />
              {timeErr ? <small className="au-err" role="alert">{timeErr}</small> : <small className="muted">The time shown on your {appName} receipt, e.g. 2:14 PM.</small>}
            </label>
            <div className="qr-shot">
              {shot ? (
                <div className="qr-shot-have">
                  <img src={shot} alt="Your payment screenshot" />
                  <span><b>Screenshot added</b><small>The shop will see it with your order.</small></span>
                  <button type="button" className="shop-link" onClick={() => { setShot(''); setShotPrint(''); setShotMsg(''); }}>Remove</button>
                </div>
              ) : (
                <label className="qr-shot-add">
                  <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setShotMsg(''); try { const [data, print] = await Promise.all([shrinkImage(file), fileFingerprint(file)]); setShot(data); setShotPrint(print); } catch { setShotMsg('That picture couldn’t be used. Try another screenshot.'); } }} />
                  <span>📎 Add a screenshot of your receipt <i className="opt">optional</i></span>
                  <small>Helps the shop confirm your payment faster.</small>
                </label>
              )}
              {shotMsg && <small className="au-err" role="alert">{shotMsg}</small>}
            </div>
            <p className="muted small" style={{ margin: 0 }}>The shop checks your payment, then starts your drinks.</p>
          </div>
        )}
        {useReward && canReward && <div className="ck-disc"><span>Free drink (stamp card)</span><b>−{peso(subtotal - total)}</b></div>}
        <div className="ck-total"><span>Total</span><b className="num"><CountUp value={total} format={peso} /></b></div>
        {msg && <div className="shop-alert" role="alert">{msg}</div>}
        {!menu.shop.open && <div className="shop-alert">{menu.shop.message || 'Online ordering is closed right now.'}</div>}
        <button className="sh-btn big" disabled={busy || !menu.shop.open} onClick={place}>
          {busy ? (payable ? 'Opening secure payment…' : 'Placing order…') : payable ? `Continue to payment · ${peso(total)}` : needQr ? `I’ve paid · Place order` : `Place order · ${peso(total)}`}
        </button>
        <p className="muted center small">{total <= 0 ? 'Nothing to pay. Enjoy your free drink!' : payable ? 'You’ll pay on PayMongo’s secure page, then come back here to track your order.' : needQr ? 'Your order is sent with your reference number.' : 'Pay at the counter by cash, GCash or Maya.'} Pickup only.</p>
      </aside>
    </div>
  );
}

/** GCash refs are digits shown as 1011 234 567890; Maya refs keep letters and numbers. */
function fmtRef(method, v) {
  if (method !== 'gcash') return String(v || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '');
  const d = String(v || '').replace(/\D/g, '').slice(0, 13);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(' ');
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
