import { useCallback, useEffect, useState } from 'react';
import { call } from './api';
import { peso, pad } from '../lib/format';
import { PAY_LABELS } from '../shared/pricing.mjs';
import ReadyAlerts from './ReadyAlerts';
import RateOrder from './RateOrder';
import { confetti } from './fx';
import { Loader, Doodle, TrackCup } from './art';
import { ShareDrink } from './share';

const STEPS = [
  ['new', 'Order received', 'The shop will confirm it shortly.'],
  ['preparing', 'Preparing', 'Your matcha is being whisked.'],
  ['ready', 'Ready for pickup', 'Come to the counter, show your order number and pay.'],
  ['paid', 'Picked up', 'Enjoy! Good Matcha, Good Mood.'],
];

// Order status page. Public by code, so PayMongo's return link always works.
export default function Track({ code, go, onChange, signedIn, mine, onReorder, menu, who }) {
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [again, setAgain] = useState('');
  const [sharing, setSharing] = useState(null);
  const cameBack = new URLSearchParams(window.location.search).get('paid') === '1';
  const [notice] = useState(() => { try { const n = sessionStorage.getItem('alm.notice.' + code); sessionStorage.removeItem('alm.notice.' + code); return n || ''; } catch { return ''; } });

  const load = useCallback(() => call('GET', `/public/orders/${code}`)
    .then((x) => { setO((prev) => { if (prev && prev.status !== x.status) { onChange?.(); if (['ready', 'paid'].includes(x.status)) setTimeout(() => confetti(document.querySelector('.track-no')), 60); } return x; }); setErr(''); })
    .catch((e) => setErr(e.status === 404 ? 'We couldn’t find this order. Check the link, or ask at the counter.' : e.message)),
  [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const loaded = !!o;
  useEffect(() => { // a little celebration right after placing the order (once)
    if (!loaded) return undefined;
    let fresh = false;
    try { fresh = !!sessionStorage.getItem('alm.new.' + code); sessionStorage.removeItem('alm.new.' + code); } catch {}
    if (!fresh) return undefined;
    setTimeout(() => confetti(document.querySelector('.track-no'), 48), 250);
    return undefined;
  }, [loaded, code]);
  const waiting = o?.status === 'awaiting_payment';
  useEffect(() => { load(); const t = setInterval(load, waiting && cameBack ? 3000 : 8000); return () => clearInterval(t); }, [load, waiting, cameBack]);
  useEffect(() => { if (o && !waiting && cameBack) window.history.replaceState(null, '', window.location.pathname); }, [o, waiting, cameBack]);

  const post = async (what) => {
    setBusy(what); setErr('');
    try { setO(await call('POST', `/public/orders/${code}/${what}`)); setConfirmCancel(false); onChange?.(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  };

  if (!o) return <section className="panel center">{err ? <div className="empty-state"><Doodle kind="lost" /><div className="shop-alert">{err}</div><button className="sh-btn" onClick={() => go('/')}>Go home</button></div> : <div className="shop-loading"><Loader label="Finding your order…" /></div>}</section>;

  const cancelled = o.status === 'cancelled';
  // The first drink in the order that is still on the menu, for "Share my drink"
  const shareLine = (() => {
    if (!menu) return null;
    for (const l of o.lines || []) {
      const item = menu.items.find((i) => String(i._id) === String(l.productId));
      if (!item) continue;
      const si = menu.sizes.findIndex((z) => String(z._id) === String(l.sizeId));
      return { item, who: (who || '').trim().split(/\s+/)[0] || '', shop: menu.shop,
        size: item.hasSizes && menu.sizes.length > 1 && si >= 0 ? { label: menu.sizes[si].label, big: si > 0 } : null,
        sweet: item.sweet && l.sweet ? `${l.sweet} sweet` : '',
        addons: (l.addonIds || []).map((id) => menu.addons.find((a) => String(a._id) === String(id))?.label).filter(Boolean) };
    }
    return null;
  })();
  const idx = STEPS.findIndex((s) => s[0] === o.status);
  const mins = o.payDeadline ? Math.max(0, Math.round((new Date(o.payDeadline) - Date.now()) / 60000)) : 0;
  const payLabel = PAY_LABELS[o.payMethod] || 'online';
  const qr = o.qrPay?.method ? PAY_LABELS[o.qrPay.method] : '';
  const prepaid = o.paidOnline || !!o.qrPay?.verified;
  const slowCheck = !!o.qrPay && !o.qrPay.verified && o.status === 'new' && Date.now() - new Date(o.qrPay.at || o.createdAt) > 15 * 60000; // 15+ minutes
  const orderAgain = () => { const n = onReorder?.(o.lines) || 0; if (!n) setAgain('These drinks aren’t available right now. Take a look at the menu instead.'); };

  return (
    <section className="panel track">
      <p className="muted center">Order number <span className="jp" lang="ja">ご注文番号</span></p>
      <div className="track-no-wrap">{o.status === 'ready' && <span className="hanko-stamp" lang="ja" aria-hidden="true">完成</span>}<div className={`track-no ${o.status === 'ready' ? 'is-ready' : ''}`}>#{pad(o.no)}</div></div>
      <p className="center">{o.customer ? `Thanks, ${o.customer}!` : 'Thank you!'}</p>
      {!cancelled && <TrackCup status={o.status} />}
      {notice && <div className="note">{notice}</div>}
      {err && <div className="shop-alert">{err}</div>}

      {waiting ? (
        cameBack ? (
          <div className="wait"><span className="spin" aria-hidden="true" /><div><b>Confirming your payment…</b><small>This usually takes a few seconds. Please keep this page open.</small></div></div>
        ) : (
          <div className="paybox">
            <b>Waiting for payment</b>
            <p>Your order goes to the shop as soon as you pay.{mins > 0 ? ` Please pay within ${mins} minute${mins === 1 ? '' : 's'}.` : ''}</p>
            {o.checkoutUrl && <a className="sh-btn big" href={o.checkoutUrl}>Pay {peso(o.total + (o.onlineFee || 0))} now</a>}
            <button className="sh-btn ghost" disabled={!!busy} onClick={() => post('pay-later')}>{busy === 'pay-later' ? 'Switching…' : 'Pay at pickup instead'}</button>
          </div>
        )
      ) : cancelled ? (
        <div className="shop-alert">
          This order was cancelled{o.cancelReason ? `: ${o.cancelReason}` : '.'}{' '}
          {o.paidOnline || o.refundDue ? `Your ${qr || payLabel} payment of ${peso(o.total + (o.onlineFee || 0))} will be refunded. The shop may contact you.` : o.qrPay ? '' : 'You were not charged.'}
        </div>
      ) : (<>
        {o.pickupCode && (
          <div className={`pk-code ${o.status === 'ready' ? 'ready' : ''}`}>
            <span className="pk-l">Pickup code</span>
            <span className="pk-d" aria-label={`Pickup code ${o.pickupCode.split('').join(' ')}`}>{o.pickupCode.split('').map((d, i) => <b key={i}>{d}</b>)}</span>
            <small>{o.status === 'ready' ? 'Tell this code at the counter to get your order.' : 'You’ll tell this code at the counter when you pick up. Keep it to yourself.'}</small>
          </div>
        )}
        <ol className="steps">
          {STEPS.map(([k, title, text], i) => (
            <li key={k} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
              <span className="dot" aria-hidden="true" />
              <div><b>{title}</b>{i === idx && <small>{k === 'ready' && o.pickupCode ? `Come to the counter and tell your pickup code.${prepaid ? ' It’s already paid.' : ' Pay when you pick up.'}` : k === 'ready' && prepaid ? 'Come to the counter and show your order number. It’s already paid.' : k === 'new' && o.qrPay && !o.qrPay.verified ? (slowCheck ? `Still checking your ${qr} payment (ref ${o.qrPay.ref}). Sorry for the wait. If it takes much longer, please message the shop.` : `The shop is checking your ${qr} payment (ref ${o.qrPay.ref}). This usually takes a few minutes.`) : text}</small>}</div>
            </li>
          ))}
        </ol>
      </>)}
      <ul className="lines compact">
        {o.lines.map((l, i) => <li key={i}><div className="grow"><b>{l.qty}× {l.name}</b><small>{l.mods}</small></div><b>{peso(l.total)}</b></li>)}
      </ul>
      {o.discount && (
        <div className="ck-disc">
          <span>{o.freeDrink ? 'Free drink (stamp card)' : 'Discount'}</span><b>−{peso(o.discount.amount)}</b>
        </div>
      )}
      {o.onlineFee > 0 && <div className="ck-disc ck-fee"><span>Online payment fee</span><b>+{peso(o.onlineFee)}</b></div>}
      <div className="ck-total">
        <span>{o.paidOnline ? `Paid online · ${payLabel}` : o.qrPay?.verified ? `Paid · ${qr}` : o.qrPay && !cancelled ? `Sent by ${qr} · being checked` : o.status === 'paid' ? `Paid · ${payLabel}` : cancelled ? 'Total' : waiting ? 'To pay' : 'Pay at the counter'}</span>
        <b>{peso(o.total + (o.onlineFee || 0))}</b>
      </div>
      {o.status === 'paid' && mine && (mine.canRate || mine.rating) && <RateOrder code={code} rating={mine.rating} onDone={onChange} />}
      {o.stampsAwarded > 0 && <div className="okbox center">+{o.stampsAwarded} {o.stampsAwarded === 1 ? 'stamp' : 'stamps'} added to your card{o.stampsBalance != null ? ` · ${o.stampsBalance % 9}/9` : ''}</div>}
      {!cancelled && !['paid', 'ready'].includes(o.status) && !waiting && <ReadyAlerts compact />}
      {!cancelled && o.status !== 'paid' && <p className="muted center small">This page updates by itself. You can also find it anytime in Orders.</p>}
      {again && <div className="note">{again}</div>}
      <div className="actions">
        {signedIn && onReorder ? (
          <button className="sh-btn" onClick={orderAgain}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Order again
          </button>
        ) : <button className="sh-btn" onClick={() => go('/signin')}>Sign in to order</button>}
        <button className="sh-btn ghost" onClick={async () => {
          // A cancelled order is done with: closing it also takes it off "My orders"
          if (cancelled && signedIn && mine) { try { await call('POST', `/customer/orders/${code}/hide`); await onChange?.(); } catch { /* keep it listed */ } go('/orders'); return; }
          go(signedIn ? '/menu' : '/');
        }}>Close</button>
      </div>
      {shareLine && !cancelled && (
        <button className="shop-link center-link share-link" onClick={() => setSharing(shareLine)}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Share my drink
        </button>
      )}
      {sharing && <ShareDrink card={sharing} onClose={() => setSharing(null)} />}
      {(waiting || (o.status === 'new' && !o.paidOnline && !o.qrPay)) && !cameBack && (
        confirmCancel
          ? <div className="confirm"><span>Cancel this order?</span><button className="shop-link" disabled={!!busy} onClick={() => post('cancel')}>Yes, cancel it</button><button className="shop-link" onClick={() => setConfirmCancel(false)}>No</button></div>
          : <button className="shop-link center-link" onClick={() => setConfirmCancel(true)}>Cancel order</button>
      )}
    </section>
  );
}
