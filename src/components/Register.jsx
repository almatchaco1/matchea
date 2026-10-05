import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { peso, pad, toneFor } from '../lib/format';
import { priceLine, computeTotals, r2, PAY_METHODS } from '../shared/pricing.mjs';
import { CountUp } from '../shop/fx';
import PayPicker from './PayPicker';
import Modal from './Modal';
import ReceiptModal from './Receipt';
import { printSale, printLabels, loadPrinterSettings } from '../lib/printer';
import { Field } from './Field';
import { allowedAddons, imageOf, sceneBg } from '../lib/drinkImages';
import { SwipeRow } from '../lib/motion';
import { checkCheckout, LIMITS, normPhone, DISC_PIN_OVER } from '../shared/rules.mjs';
import AdminPin from './AdminPin';
import { QrHint, ShowQr } from './PayQr';
import GoalBar from './GoalBar';
import { STAMPS_PER_REWARD, rewardValue, rewardsReady, stampProgress } from '../shared/loyalty.mjs';

let lineKey = 0;

export default function Register({ data, refresh, toast, cart, setCart, user, isAdmin, training, addTrainingSale, nextTrainNo }) {
  const { settings, products, ingredients, loaded } = data;
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // { product, line?, index? }
  const [customer, setCustomer] = useState('');
  const [discount, setDiscount] = useState({ type: 'none', pct: 10, idNo: '', idName: '' });
  const [asking, setAsking] = useState(false); // admin PIN pop-up for a big discount
  const override = useRef(null);
  const [pay, setPay] = useState({ method: 'cash', tendered: '', ref: '', got: false }); // got: cashier saw the GCash / Maya payment
  const [refTaken, setRefTaken] = useState(null); // { ref, msg } from the server
  // Staff drink: free for a staff member, takes stock off, not counted as a sale
  const [staffMode, setStaffMode] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [staffFor, setStaffFor] = useState(user?._id || '');
  useEffect(() => { if (staffMode && !staffList.length) api.get('/auth/staff').then(setStaffList).catch(() => {}); }, [staffMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [nextNo, setNextNo] = useState(null);
  const [armClear, setArmClear] = useState(false);
  const [showQr, setShowQr] = useState(null); // 'gcash' | 'maya' while the QR is shown to the customer
  const [sheet, setSheet] = useState(false); // tablet / phone: order panel slides up from the bottom
  // Stamp card: customer's mobile number, looked up on the server
  const [stampPhone, setStampPhone] = useState('');
  const [stampCust, setStampCust] = useState(null); // { name, stamps }
  const [stampErr, setStampErr] = useState('');
  const [useReward, setUseReward] = useState(false);
  const lookupStamps = async () => {
    setStampErr(''); setStampCust(null); setUseReward(false);
    if (!stampPhone.trim()) return;
    if (!normPhone(stampPhone)) { setStampErr('Enter a PH mobile number like 0917 123 4567.'); return; }
    try { const c = await api.get(`/sales/loyalty?phone=${encodeURIComponent(normPhone(stampPhone))}`); setStampCust(c); if (!customer.trim()) setCustomer(c.name.split(' ')[0]); }
    catch (e) { setStampErr(e.fields?.loyaltyPhone || e.message); }
  };
  const clearStamps = () => { setStampPhone(''); setStampCust(null); setStampErr(''); setUseReward(false); };

  // Names on orders still waiting, so two people with the same name don't get mixed up
  const [openNames, setOpenNames] = useState([]);
  const [dupOk, setDupOk] = useState(''); // cashier chose to keep a repeated name
  const loadNames = () => api.get('/sales/open-names').then(setOpenNames).catch(() => {});
  useEffect(() => { loadNames(); const t = setInterval(loadNames, 20000); return () => clearInterval(t); }, []);
  const normName = (v) => String(v || '').toLowerCase().replace(/[.\s]+/g, ' ').trim();
  const typedName = normName(customer);
  const dupOf = typedName ? openNames.find((o) => { const n = normName(o.name); return n === typedName || n.split(' ')[0] === typedName; }) : null;

  const loadNext = () => api.get('/sales/next-number').then((r) => setNextNo(r.next)).catch(() => {});
  useEffect(() => { loadNext(); }, []);

  const prodById = useMemo(() => Object.fromEntries(products.map((p) => [p._id, p])), [products]);
  const stock = useMemo(() => Object.fromEntries(ingredients.map((i) => [i._id, i])), [ingredients]);

  // Price every cart line with the same rules the server uses
  const priced = useMemo(() => cart.map((l) => {
    const p = prodById[l.productId];
    return p && settings ? { ...l, ...priceLine(l, p, settings), name: p.name } : { ...l, missing: true, unit: 0, total: 0, usage: {}, mods: 'No longer on the menu' };
  }), [cart, prodById, settings]);
  const cartUsage = useMemo(() => {
    const u = {};
    priced.forEach((l) => { for (const k in l.usage) u[k] = (u[k] || 0) + l.usage[k]; });
    return u;
  }, [priced]);
  // An invalid promo % (blank, 0, over 100) is not applied to the preview; the field shows why
  const pctBad = discount.type === 'pct' && !(+discount.pct > 0 && +discount.pct <= 100);
  const freeValue = rewardValue(priced.filter((l) => !l.missing).map((l) => prodById[l.productId]?.price));
  const rewardOn = useReward && stampCust && rewardsReady(stampCust.stamps) > 0 && cart.length > 0;
  const t = computeTotals(priced.reduce((a, l) => a + l.total, 0), rewardOn ? { type: 'reward', amount: freeValue } : pctBad ? { type: 'none' } : discount, settings?.vat);

  const availability = (p) => {
    if (p.available === false) return 'na';
    if (!settings) return 'ok';
    const { usage } = priceLine({}, p, settings);
    let low = false;
    for (const k in usage) {
      const i = stock[k]; if (!i) continue;
      const left = i.stock - (cartUsage[k] || 0);
      if (left < usage[k]) return 'out';
      if (left - usage[k] <= (i.reorder || 0)) low = true;
    }
    return low ? 'low' : 'ok';
  };

  const menu = products.filter((p) => p.active);
  const cats = ['All', ...new Set(menu.map((p) => p.cat || 'Other'))];
  const shown = menu.filter((p) => (cat === 'All' || p.cat === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));

  const tendered = +pay.tendered || 0;
  const change = r2(tendered - t.total);
  const quick = [...new Set([Math.ceil(t.total), 100, 200, 500, 1000].filter((n) => n > 0 && n >= t.total && n - t.total < LIMITS.maxChange))].slice(0, 4);
  // A lot of cash (₱5,000 or more): the Charge button needs a second tap, so a typo like 50000 isn't charged by accident
  const [bigOk, setBigOk] = useState('');
  const bigCash = pay.method === 'cash' && tendered >= LIMITS.cashConfirm;
  const bigArmed = bigCash && bigOk === pay.tendered; // first tap done for this exact amount
  const hasMissing = priced.some((l) => l.missing);
  // Same rules the server uses; errors show once the cashier has typed in that field (or tried to charge)
  const [touched, setTouched] = useState({});
  const [serverErr, setServerErr] = useState('');
  const touch = (k) => setTouched((p) => (p[k] ? p : { ...p, [k]: true }));
  const cErr = checkCheckout({ lineCount: cart.length, total: t.total, discount: rewardOn ? { type: 'none' } : discount, pay, customer, needName: true });
  const errFor = (k) => (touched[k] || touched.all ? cErr[k] : undefined);
  const qrPay = pay.method !== 'cash';
  const needGot = qrPay && !pay.got; // GCash / Maya: tick that the money arrived before charging
  const cashState = !tendered || !cart.length ? 'idle' : cErr.tendered ? (change < 0 ? 'short' : 'warn') : 'ok';
  const stampPending = stampPhone.trim() && !stampCust; // typed a number but it isn't linked yet
  const staffOn = staffMode && !training;
  const staffErr = staffOn && (cart.length > 5 || cart.some((l) => l.qty > 5)) ? 'A staff drink order can have up to 5 drinks.' : '';
  const dupBlock = !training && !!dupOf && dupOk !== typedName; // same name already waiting: add a letter, or keep it on purpose
  const canCharge = staffOn ? cart.length && !busy && !hasMissing && !staffErr && staffFor : cart.length && !busy && !hasMissing && !Object.keys(cErr).length && !stampPending && !dupBlock && !needGot;

  const chargeRef = useRef(null);
  const charge = async () => {
    setTouched({ all: true });
    if (!canCharge) return;
    if (staffOn) {
      setBusy(true);
      try {
        const sale = await api.post('/sales', { staffDrink: { for: staffFor }, lines: cart.map(({ productId, sizeId, milkId, addonIds, sweet, note, qty }) => ({ productId, sizeId, milkId, addonIds, sweet, note, qty })) });
        setSheet(false); setCart([]); setStaffMode(false); setTouched({});
        setReceipt(sale); refresh(); loadNext();
        if (sale.staffToday > 1) toast(`${sale.staffForName} has had ${sale.staffToday} staff drinks today.`);
      } catch (e) { setServerErr(e.message); toast(e.message); }
      finally { setBusy(false); }
      return;
    }
    setServerErr('');
    if (!staffOn && bigCash && !bigArmed) { setBigOk(pay.tendered); return; }
    if (training) { // practice: make the receipt here, save nothing
      const no = nextTrainNo();
      const sale = {
        _id: `train-${Date.now()}`, training: true, no, createdAt: new Date().toISOString(), status: 'paid', source: 'pos',
        cashierName: user?.name || '', customer,
        lines: priced.map((l) => ({ product: l.productId, name: l.name, mods: l.mods, qty: l.qty, unit: l.unit, total: l.total, sizeId: l.sizeId, milkId: l.milkId, addonIds: l.addonIds })),
        subtotal: t.subtotal, discount: t.discount, total: t.total, vat: t.vat, vatExempt: t.vatExempt,
        pay: { method: pay.method, tendered: pay.method === 'cash' ? tendered : t.total, change: pay.method === 'cash' ? change : 0, ref: pay.ref },
      };
      addTrainingSale(sale);
      setSheet(false); setCart([]); setCustomer(''); setDiscount({ type: 'none', pct: discount.pct, idNo: '', idName: '' }); setPay({ method: pay.method, tendered: '', ref: '', got: false }); setTouched({});
      setReceipt(sale);
      return;
    }
    setBusy(true);
    try {
      const sale = await api.post('/sales', {
        lines: cart.map(({ productId, sizeId, milkId, addonIds, sweet, note, qty }) => ({ productId, sizeId, milkId, addonIds, sweet, note, qty })),
        customer, discount: rewardOn ? { type: 'none' } : discount, pay: { method: pay.method, tendered: pay.method === 'cash' ? tendered : undefined, ref: pay.ref },
        loyaltyPhone: stampCust ? normPhone(stampPhone) : undefined, useReward: rewardOn || undefined, override: override.current || undefined,
      });
      override.current = null;
      clearStamps(); setSheet(false); setCart([]); setCustomer(''); setDiscount({ type: 'none', pct: discount.pct, idNo: '', idName: '' }); setPay({ method: pay.method, tendered: '', ref: '', got: false }); setTouched({});
      // Receipt printer: print straight away when set up on this device
      const ps = loadPrinterSettings();
      let printed = '';
      if (ps.kind && ps.auto) {
        try { await printSale(sale, settings); printed = 'Printed.'; } catch (err) { printed = err.message; }
      }
      if (ps.kind && ps.labels) { try { await printLabels(sale, settings); } catch (err) { printed = printed || err.message; } } // one label per cup
      setDupOk(''); loadNames();
      setReceipt({ ...sale, _printed: printed });
      refresh(); loadNext();
    } catch (e) {
      override.current = null;
      if (e.fields?.override === 'discount') { setAsking(true); return; } // a cashier's big discount: ask an admin
      if (e.fields) setTouched({ all: true });
      setServerErr(e.fields ? '' : e.message); // e.g. an item removed from the menu while it was in the cart
      setRefTaken(e.fields?.ref ? { ref: pay.ref, msg: e.message } : null); // the reference no. was already used: show it under the box
      toast(e.message);
    }
    finally { setBusy(false); }
  };

  chargeRef.current = charge;

  // Compact view: small tiles so every drink fits on a tablet without scrolling (remembered on this device)
  const [compact, setCompactState] = useState(() => { try { return localStorage.getItem('matchaPos.compact') === '1'; } catch { return false; } });
  const setCompact = (on) => { setCompactState(on); try { localStorage.setItem('matchaPos.compact', on ? '1' : '0'); } catch {} };
  const setQty = (i, d) => setCart(cart.flatMap((l, k) => (k !== i ? [l] : l.qty + d < 1 ? [] : [{ ...l, qty: Math.min(LIMITS.lineQty, l.qty + d) }])));

  return (
    <div className="register">
      <section>
        {!training && <GoalBar refreshKey={nextNo} isAdmin={isAdmin} toast={toast} />}
        <div className="cats">
          {cats.map((c) => <button key={c} className="chip" aria-pressed={c === cat} onClick={() => setCat(c)}>{c}</button>)}
          <input className="search" type="search" placeholder="Search menu" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search menu" />
          <button className="chip view-toggle" aria-pressed={compact} onClick={() => setCompact(!compact)} title={compact ? 'Show big tiles with photos' : 'Show small tiles so every drink fits'}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">{compact
              ? <path d="M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z" />
              : <path d="M3 4h14M3 8h14M3 12h14M3 16h14" />}</svg>
            <span>{compact ? 'Big tiles' : 'Compact'}</span>
          </button>
        </div>
        <div className={`grid ${compact ? 'compact' : ''}`}>
          {!loaded ? <div className="empty">Loading menu…</div>
            : !shown.length ? <div className="empty">{menu.length ? 'No drinks match.' : 'No menu items yet. Add them in the Menu tab.'}</div>
            : shown.map((p) => {
              const a = availability(p);
              const from = p.price + (p.hasSizes !== false ? +settings?.sizes?.[0]?.price || 0 : 0);
              return (
                <button key={p._id} style={{ '--tone': toneFor(p.name) }} className={`prod ${a === 'out' || a === 'na' ? 'out' : ''} ${p.bestSeller ? 'best' : ''}`} disabled={a === 'na'} title={a === 'na' ? 'Not available. Turn it back on in the Menu tab.' : undefined} onClick={() => setEditing({ product: p })}>
                  {a === 'na' && <span className="pill mute">Not available</span>}
                  {a === 'out' && <span className="pill bad">Out</span>}
                  {a === 'low' && <span className="pill warn">Low</span>}
                  {imageOf(p)
                    ? <img className={`thumb ${sceneBg(imageOf(p)) ? 'scene-bg' : ''}`} style={sceneBg(imageOf(p))} src={imageOf(p)} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                    : <span className="cup" style={{ background: toneFor(p.name) }} />}
                  {p.bestSeller && <span className="best-tag hanko"><b lang="ja">人気</b>Best seller</span>}
                  <span className="nm">{p.name}</span>
                  {p.desc && <span className="desc">{p.desc}</span>}
                  <span className="pr num">{peso(from)}</span>
                </button>
              );
            })}
        </div>
      </section>

      {sheet && <div className="sheet-scrim" onClick={() => setSheet(false)} aria-hidden="true" />}
      <aside className={`cart panel ${sheet ? 'open' : ''}`} id="cart" aria-label="Current order">
        <div className="cart-h">
          <h2 className="sec">Order</h2><span className="ord num">{training ? <span className="pill warn">Practice</span> : nextNo ? `#${pad(nextNo)}` : ''}</span>
          <button className="btn sm ghost sheet-close" onClick={() => setSheet(false)} aria-label="Back to the menu">Back to menu ▾</button>
        </div>
        <div className="lines">
          {!cart.length ? (
            <div className="empty op-empty">
              <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M13 15h22l-2.6 25.2A3 3 0 0 1 29.4 43H18.6a3 3 0 0 1-3-2.8L13 15Z" /><path d="M11 15h26M17 15l1.2-5h11.6l1.2 5M24 4v6" /><path d="M15.2 25h17.6" className="op-fill" /></svg>
              <b>No drinks yet</b><span>Tap a drink to start an order.</span>
            </div>
          ) : priced.map((l, i) => (
            <SwipeRow className="line" key={l.key} onRemove={() => setCart((c) => c.filter((x) => x.key !== l.key))}>
              <div className="qty">
                <button onClick={() => setQty(i, -1)} aria-label="Fewer">−</button><span className="num">{l.qty}</span><button onClick={() => setQty(i, 1)} aria-label="More">+</button>
              </div>
              <div>
                <div className="nm">{l.name || 'Removed item'}</div>
                <div className="mods" style={l.missing ? { color: 'var(--bad)' } : undefined}>{l.mods}</div>
                <div className="op-acts">
                  {!l.missing && <button className="x" onClick={() => setEditing({ product: prodById[l.productId], line: cart[i], index: i })}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l.6-2.7L10.8 3a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2L5.8 12.4 3 13Z" /></svg>Edit</button>}
                  <button className="x x-rm" onClick={() => setCart(cart.filter((_, k) => k !== i))}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>Remove</button>
                </div>
              </div>
              <div className="amt num">{peso(l.total)}</div>
            </SwipeRow>
          ))}
        </div>

        <div className="sum">
          <div className="r"><span>Subtotal</span><span className="num">{peso(t.subtotal)}</span></div>
          {staffOn && <div className="r"><span>Staff drink (free)</span><span className="num">−{peso(t.subtotal)}</span></div>}
          {!staffOn && t.discount.amount > 0 && <div className="r"><span>{rewardOn ? 'Free drink (stamp card)' : discount.type === 'scpwd' ? 'Senior / PWD 20%' : `Discount ${t.discount.pct}%`}</span><span className="num">−{peso(t.discount.amount)}</span></div>}
          <div className="r tot"><span>Total</span><b className="num"><CountUp value={staffOn ? 0 : t.total} format={peso} duration={400} /></b></div>
        </div>

        <div className="pay">
          {!training && (
            <label className={`staff-toggle op-switch ${staffOn ? 'on' : ''}`}>
              <span><b>Staff drink</b><small>Free for staff · uses stock, not counted as a sale</small></span>
              <input type="checkbox" role="switch" checked={staffOn} onChange={(e) => { setStaffMode(e.target.checked); setServerErr(''); if (!staffFor) setStaffFor(user?._id || ''); }} />
              <i className="op-knob" aria-hidden="true" />
            </label>
          )}
          {staffOn ? (
            <div className="staff-box">
              <Field id="staffFor" label="For" error={staffErr}>
                <select id="staffFor" value={staffFor} onChange={(e) => setStaffFor(e.target.value)}>
                  {!staffList.some((x) => x._id === staffFor) && user && <option value={user._id}>{user.name}</option>}
                  {staffList.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
                </select>
              </Field>
            </div>
          ) : (<>
          <section className="op-sec" aria-label="Customer">
          <h3 className="op-h">Customer</h3>
          <div className="row">
            <Field id="custName" label="Name for the cup" error={cart.length && customer.trim() ? cErr.customer : errFor('customer')} hint={customer.trim() ? undefined : 'Needed: called out when the drink is ready'}><input id="custName" placeholder="e.g. Hubert" maxLength={LIMITS.customer} value={customer} autoComplete="off" aria-required="true" onChange={(e) => { setCustomer(e.target.value); touch('customer'); }} onBlur={() => touch('customer')} /></Field>
            <div className="field op-disc"><label id="discLbl">Discount</label>
              <div className="op-seg" id="discSel" role="radiogroup" aria-labelledby="discLbl" title={rewardOn ? 'A free drink can’t be combined with other discounts' : undefined}>
                {[['none', 'None'], ['scpwd', 'Senior / PWD'], ['pct', 'Promo %']].map(([v, lbl]) => (
                  <button key={v} type="button" role="radio" data-v={v} aria-checked={(rewardOn ? 'none' : discount.type) === v} disabled={rewardOn && v !== 'none'} onClick={() => setDiscount({ ...discount, type: v })}>{lbl}</button>
                ))}
              </div></div>
            {discount.type === 'pct' && <Field id="discPct" label="Promo %" style={{ flex: '1 1 100%' }} error={errFor('discountPct')} hint={!isAdmin && +discount.pct > DISC_PIN_OVER ? `Over ${DISC_PIN_OVER}%: an admin’s PIN is needed when you charge` : undefined}><input id="discPct" type="number" inputMode="decimal" min="1" max="100" value={discount.pct} onChange={(e) => { setDiscount({ ...discount, pct: e.target.value }); touch('discountPct'); }} /></Field>}
            {discount.type === 'scpwd' && !rewardOn && <>
              <Field id="scName" label="Name on the ID" error={errFor('scName')}><input id="scName" maxLength={60} autoComplete="off" value={discount.idName} onChange={(e) => { setDiscount({ ...discount, idName: e.target.value }); touch('scName'); }} placeholder="Juan dela Cruz" /></Field>
              <Field id="scIdNo" label="Senior / PWD ID no." error={errFor('scIdNo')}><input id="scIdNo" maxLength={30} autoComplete="off" autoCapitalize="characters" value={discount.idNo} onChange={(e) => { setDiscount({ ...discount, idNo: e.target.value }); touch('scIdNo'); }} placeholder="e.g. 12345-678" /></Field>
            </>}
          </div>
          {dupBlock && <div className="dup-name" role="alert"><span><b>“{customer.trim()}”</b> already has an order waiting (#{pad(dupOf.no)}). Add a letter so you call the right person, e.g. “{customer.trim()} B.”</span><button className="btn sm ghost" onClick={() => setDupOk(typedName)}>Keep “{customer.trim()}”</button></div>}
          {!training && <div className="stamp-box">
            <Field id="stampPhone" label="Stamp card · mobile no." error={stampErr} hint={stampCust ? undefined : stampPending ? 'Press Enter or Find to link the card' : 'Optional: 1 stamp per drink, 10th drink free'}>
              <div className="stamp-in">
                <input id="stampPhone" inputMode="tel" maxLength={16} placeholder="0917 123 4567" value={stampPhone} disabled={!!stampCust}
                  onChange={(e) => { setStampPhone(e.target.value); setStampErr(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); lookupStamps(); } }} />
                {stampCust ? <button className="btn sm ghost" onClick={clearStamps}>Change</button> : <button className="btn sm" onClick={lookupStamps} disabled={!stampPhone.trim()}>Find</button>}
              </div>
            </Field>
            {stampCust && (
              <div className="stamp-found">
                <span><b>{stampCust.name}</b> · {stampProgress(stampCust.stamps)}/{STAMPS_PER_REWARD} stamps{rewardsReady(stampCust.stamps) > 0 && <span className="pill best" style={{ marginLeft: 6 }}>Free drink ready</span>}</span>
                {rewardsReady(stampCust.stamps) > 0 && cart.length > 0 && (
                  <label className="stamp-use"><input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} /> Use free drink (−{peso(freeValue)})</label>
                )}
                {!useReward && cart.length > 0 && (() => { const n = cart.reduce((a, l) => a + l.qty, 0); return <small className="muted">+{n} {n === 1 ? 'stamp' : 'stamps'} with this order</small>; })()}
              </div>
            )}
          </div>}
          </section>
          <section className="op-sec" aria-label="Payment">
          <div className="op-h-row"><h3 className="op-h">Payment</h3>{!staffOn && <span className="pay-due">Due <b className="num">{peso(t.total)}</b></span>}</div>
          <PayPicker tiles value={pay.method} onChange={(k) => setPay({ ...pay, method: k, got: false })} />
          <div className={`pay-box ${qrPay ? 'is-qr' : 'is-cash'}`}>
          {!qrPay ? <>
            <Field id="tendered" label="Cash received" className="pb-cash">
              <div className={`pb-in ${cashState}`}><i aria-hidden="true">₱</i>
                <input id="tendered" type="number" inputMode="decimal" min="0" step="any" placeholder="0.00" value={pay.tendered} aria-invalid={cashState === 'short' || cashState === 'warn'} aria-describedby="pbChange"
                  onChange={(e) => { setPay({ ...pay, tendered: e.target.value }); touch('tendered'); }} onFocus={(e) => e.target.select()} />
                {pay.tendered !== '' && <button type="button" className="pb-clear" onClick={() => setPay({ ...pay, tendered: '' })} aria-label="Clear cash received">×</button>}
              </div></Field>
            {cart.length > 0 && <div className="quick pb-quick">
              <button type="button" className={`num ${+pay.tendered === t.total ? 'on' : ''}`} onClick={() => setPay({ ...pay, tendered: String(t.total) })}>Exact</button>
              {quick.filter((n) => n !== t.total).map((n) => <button type="button" key={n} className={`num ${+pay.tendered === n ? 'on' : ''}`} onClick={() => setPay({ ...pay, tendered: String(n) })}>₱{n.toLocaleString('en-PH')}</button>)}
            </div>}
            <div id="pbChange" className={`change pb-change ${cashState}`} aria-live="polite">
              {cashState === 'idle' ? <><span>Change</span><span className="pb-hint">{cart.length ? 'Type the cash given, or tap an amount' : 'Add a drink first'}</span></>
                : cashState === 'short' ? <><span>Short by</span><b className="num">{peso(-change)}</b><small>Collect {peso(-change)} more before charging.</small></>
                : cashState === 'warn' ? <><span>Check the amount</span><small>{cErr.tendered}</small></>
                : <><span>Change</span><b className="num">{peso(change)}</b>{change === 0 && <small>Exact amount, no change.</small>}</>}
            </div>
          </> : (<>
            <QrHint kind={pay.method} settings={settings} amount={cart.length ? t.total : null} onShow={() => setShowQr(pay.method)} />
            <label className={`pb-got ${pay.got ? 'on' : ''} ${!pay.got && touched.all ? 'need' : ''}`}>
              <input type="checkbox" checked={!!pay.got} disabled={!cart.length} onChange={(e) => setPay({ ...pay, got: e.target.checked })} />
              <span><b>{cart.length ? `I received ${peso(t.total)} in our ${PAY_METHODS[pay.method]} app` : `Payment received in our ${PAY_METHODS[pay.method]} app`}</b>
                <small>Check the amount and the sender’s name in the app before charging.</small></span>
            </label>
            <Field id="payRef" label="Reference no. (optional)" error={pay.ref ? cErr.ref || (refTaken?.ref === pay.ref ? refTaken.msg : undefined) : errFor('ref')} hint={pay.method === 'gcash' ? '13 digits, from the GCash notification' : 'From the Maya notification'}>
              <input id="payRef" maxLength={LIMITS.ref + 6} inputMode={pay.method === 'gcash' ? 'numeric' : 'text'} placeholder={pay.method === 'gcash' ? '1011 234 567890' : 'Reference ID'} value={pay.ref}
                onChange={(e) => { setPay({ ...pay, ref: e.target.value.replace(/[^0-9A-Za-z -]/g, '') }); touch('ref'); }} /></Field>
          </>)}
          </div>
          </section>
          {showQr && <ShowQr kind={showQr} settings={settings} amount={cart.length ? t.total : null} onClose={() => { setShowQr(null); setTimeout(() => document.getElementById('payRef')?.focus(), 50); }} />}
          </>)}
          {serverErr && <div className="formerr" role="alert">{serverErr}</div>}
          {hasMissing && <div className="formerr" role="alert">Remove the items that are no longer on the menu to continue.</div>}
          <button className={`btn primary charge ${!staffOn && bigArmed ? 'big-cash' : ''}`} disabled={!canCharge} onClick={charge} aria-live="polite">{busy ? 'Saving…' : staffOn ? 'Save staff drink' : bigArmed ? `Confirm ${peso(tendered)} cash` : needGot && cart.length ? `Tick “received” to charge` : `Charge ${peso(t.total)}`}</button>
          {cart.length > 0 && <button className="btn ghost sm" onClick={() => { if (armClear) { setCart([]); setArmClear(false); } else { setArmClear(true); setTimeout(() => setArmClear(false), 4000); } }}>{armClear ? 'Tap again to clear' : 'Clear order'}</button>}
        </div>
      </aside>

      {cart.length > 0 && (
        <button className="jump-cart btn primary" onClick={() => setSheet(true)} hidden={sheet}>
          <span className="jc-count">{cart.reduce((a, l) => a + l.qty, 0)}</span> View order <b>{peso(t.total)}</b> <span aria-hidden="true">▴</span>
        </button>
      )}
      {editing && settings && (
        <ItemModal
          product={editing.product} settings={settings} initial={editing.line} stock={stock}
          otherUsage={(() => { const u = { ...cartUsage }; if (editing.index != null) for (const k in priced[editing.index].usage) u[k] -= priced[editing.index].usage[k]; return u; })()}
          onClose={() => setEditing(null)}
          onSave={(line) => {
            if (editing.index != null) setCart(cart.map((l, k) => (k === editing.index ? { ...line, key: l.key } : l)));
            else if (cart.length >= LIMITS.lines) { toast(`An order can have at most ${LIMITS.lines} lines. Charge this one first.`); return; }
            else setCart([...cart, { ...line, key: ++lineKey }]);
            setEditing(null);
          }}
        />
      )}
      {asking && <AdminPin action="discount" detail={`Promo ${discount.pct}%`} onClose={() => setAsking(false)} onApproved={(tok, by) => { override.current = tok; setAsking(false); toast(`Approved by ${by}`); setTimeout(() => chargeRef.current?.(), 0); }} />}
      {receipt && <ReceiptModal sale={receipt} settings={settings} onClose={() => setReceipt(null)} justPaid autoPrinted={receipt._printed} />}
    </div>
  );
}

function ItemModal({ product: p, settings: s, initial, stock, otherUsage, onClose, onSave }) {
  const addons = allowedAddons(p, s);
  const [L, setL] = useState(() => initial ? { ...initial, addonIds: (initial.addonIds || []).filter((id) => addons.some((a) => a._id === id)) } : {
    productId: p._id,
    sizeId: s.sizes?.[0]?._id || null,
    milkId: p.milkQty > 0 ? s.milks?.[0]?._id || null : null,
    sweet: p.sweet !== false ? s.sweetness?.[Math.min(2, s.sweetness.length - 1)] || '' : '',
    addonIds: [], qty: 1, note: '',
  });
  const x = priceLine(L, p, s);
  const short = Object.keys(x.usage).filter((k) => stock[k] && stock[k].stock - (otherUsage[k] || 0) < x.usage[k]).map((k) => stock[k].name);
  const set = (patch) => setL({ ...L, ...patch });

  const Opt = ({ on, label, price, onClick }) => (
    <button className="opt" aria-pressed={on} onClick={onClick}>{label}{price != null && <small>{+price ? '+' + peso(price) : '—'}</small>}</button>
  );

  return (
    <Modal title={p.name} aside={<span className="num" style={{ fontFamily: 'var(--mono)' }}>{peso(x.unit)}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onSave({ ...L, note: L.note.trim() })}>{initial ? 'Update' : 'Add'} · {peso(x.total)}</button></>}>
      {(imageOf(p) || p.desc) && (
        <div className="item-head">
          {imageOf(p) && <img src={imageOf(p)} alt="" className={sceneBg(imageOf(p)) ? 'scene-bg' : undefined} style={sceneBg(imageOf(p))} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          {p.desc && <p>{p.desc}</p>}
        </div>
      )}
      {p.hasSizes !== false && s.sizes.length > 1 && <div className="opt-group"><h4>Size</h4><div className="opts">
        {s.sizes.map((o) => <Opt key={o._id} on={x.sizeId === o._id} label={o.label} price={o.price} onClick={() => set({ sizeId: o._id })} />)}</div></div>}
      {p.milkQty > 0 && s.milks.length > 1 && <div className="opt-group"><h4>Milk</h4><div className="opts">
        {s.milks.map((o) => <Opt key={o._id} on={x.milkId === o._id} label={o.label} price={o.price} onClick={() => set({ milkId: o._id })} />)}</div></div>}
      {p.sweet !== false && <div className="opt-group"><h4>Sweetness</h4><div className="opts">
        {s.sweetness.map((o) => <Opt key={o} on={L.sweet === o} label={o} onClick={() => set({ sweet: o })} />)}</div></div>}
      {addons.length > 0 && <div className="opt-group"><h4>Add-ons</h4><div className="opts">
        {addons.map((o) => { const on = L.addonIds.includes(o._id); return <Opt key={o._id} on={on} label={o.label} price={o.price} onClick={() => set({ addonIds: on ? L.addonIds.filter((a) => a !== o._id) : [...L.addonIds, o._id] })} />; })}</div></div>}
      <div className="row">
        <div className="field" style={{ flex: '0 0 auto' }}><label>Qty</label><div className="qty">
          <button onClick={() => set({ qty: Math.max(1, L.qty - 1) })}>−</button><span className="num">{L.qty}</span><button onClick={() => set({ qty: Math.min(LIMITS.lineQty, L.qty + 1) })} disabled={L.qty >= LIMITS.lineQty}>+</button></div></div>
      </div>
      {short.length > 0 && <div className="warnbox">Stock count shows not enough {short.join(', ')}. You can still sell it, then correct the count in Inventory.</div>}
    </Modal>
  );
}

