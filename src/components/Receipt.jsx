import { peso, pad } from '../lib/format';
import { PAY_LABELS as PAY_METHODS } from '../shared/pricing.mjs';
import { useRef, useState } from 'react';
import { printSale, printLabels } from '../lib/printer';
import { cupLabels } from '../lib/escpos';
import { STAMPS_PER_REWARD } from '../shared/loyalty.mjs';
import Modal from './Modal';

export function Receipt({ sale, settings: s = {} }) {
  const d = new Date(sale.createdAt || Date.now());
  const R = ({ l, r, big }) => <div className={`r ${big ? 'big' : ''}`}><span>{l}</span><span>{r}</span></div>;
  return (
    <div className="receipt">
      <img className="r-logo" src="/brand/matchea-print.png" alt="" width="600" height="183" />
      <div className="c big">{s.name}</div>
      {s.address && <div className="c">{s.address}</div>}
      {s.tin && <div className="c">TIN {s.tin}</div>}
      <hr />
      <R l={`Order #${pad(sale.no)}`} r={`${d.toLocaleDateString('en-PH')} ${d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`} />
      {sale.customer && <div>For: {sale.customer}</div>}
      {sale.cashierName && <div>Cashier: {sale.cashierName}</div>}
      {sale.status === 'void' && <div className="c big">*** VOID ***</div>}
      {sale.training && <div className="c big">*** TRAINING · NOT A SALE ***</div>}
      {sale.status === 'staff' && <div className="c big">*** STAFF DRINK · {sale.staffForName} ***</div>}
      <hr />
      {sale.lines.map((l, i) => (
        <div key={i}>
          <R l={`${l.qty} × ${l.name}`} r={peso(l.total)} />
          {l.mods && <div style={{ paddingLeft: 14, fontSize: 11 }}>{l.mods}</div>}
        </div>
      ))}
      <hr />
      <R l="Subtotal" r={peso(sale.subtotal)} />
      {sale.discount?.amount > 0 && <R l={sale.discount.type === 'reward' ? 'Free drink (stamp card)' : sale.discount.type === 'scpwd' ? 'Senior / PWD 20%' : `Discount ${sale.discount.pct}%`} r={`−${peso(sale.discount.amount)}`} />}
      {sale.discount?.type === 'scpwd' && sale.discount.idNo && <div style={{ fontSize: 11 }}>SC/PWD ID {sale.discount.idNo} · {sale.discount.idName}</div>}
      {sale.discount?.approvedBy && <div style={{ fontSize: 11 }}>Discount approved by {sale.discount.approvedBy}</div>}
      <R big l="TOTAL" r={peso(sale.total)} />
      <hr />
      <R l={PAY_METHODS[sale.pay.method] || sale.pay.method} r={peso(sale.pay.tendered)} />
      {sale.pay.method === 'cash' && <R l="Change" r={peso(sale.pay.change)} />}
      {sale.pay.ref && <R l="Ref" r={sale.pay.ref} />}
      {sale.stampsAwarded != null && (
        <>
          <hr />
          <div className="c">Stamp card: +{sale.stampsAwarded} {sale.stampsAwarded === 1 ? 'stamp' : 'stamps'}{sale.stampsBalance != null ? ` · now ${sale.stampsBalance % STAMPS_PER_REWARD}/${STAMPS_PER_REWARD}` : ''}</div>
          {sale.stampsBalance >= STAMPS_PER_REWARD && <div className="c">Your next drink is FREE!</div>}
        </>
      )}
      <hr />
      <div className="c">{s.footer}</div>
    </div>
  );
}

/** On-screen receipt: a clean digital receipt card. (Paper uses <Receipt> above, in the thermal-printer layout.) */
export function ReceiptCard({ sale, settings: s = {} }) {
  const d = new Date(sale.createdAt || Date.now());
  const state = sale.status === 'void' ? 'void' : sale.training ? 'practice' : sale.status === 'staff' ? 'staff' : 'paid';
  const badge = { void: 'Void', practice: 'Practice · not a sale', staff: `Staff drink${sale.staffForName ? ` · ${sale.staffForName}` : ''}`, paid: 'Paid' }[state];
  const method = PAY_METHODS[sale.pay?.method] || sale.pay?.method || '';
  const isCash = sale.pay?.method === 'cash';
  const discLabel = sale.discount?.type === 'reward' ? 'Free drink (stamp card)' : sale.discount?.type === 'scpwd' ? 'Senior / PWD 20%' : `Discount ${sale.discount?.pct}%`;
  const drinks = (sale.lines || []).reduce((a, l) => a + (+l.qty || 0), 0);
  const prog = sale.stampsBalance != null ? sale.stampsBalance % STAMPS_PER_REWARD : null;
  const free = sale.stampsBalance >= STAMPS_PER_REWARD;
  return (
    <article className={`rc rc-${state}`} aria-label={`Receipt for order #${pad(sale.no)}`}>
      <header className="rc-top">
        <img className="rc-logo" src="/brand/matchea-word-sm.webp" alt={s.name || 'Matchéa'} width="420" height="128" />
        {(s.address || s.tin) && <small>{[s.address, s.tin && `TIN ${s.tin}`].filter(Boolean).join(' · ')}</small>}
      </header>

      <div className="rc-hero">
        <span className="rc-badge">{state === 'paid' && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}{badge}</span>
        <b className="rc-total num">{peso(sale.total)}</b>
        {state !== 'staff' && method && <span className="rc-via">by {method}</span>}
        {state !== 'staff' && isCash && sale.pay.change > 0 && <span className="rc-change">Change <b className="num">{peso(sale.pay.change)}</b></span>}
      </div>

      <dl className="rc-meta">
        <div><dt>Order</dt><dd className="num">#{pad(sale.no)}</dd></div>
        <div><dt>Date</dt><dd>{d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
        <div><dt>Time</dt><dd>{d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</dd></div>
        {sale.customer && <div><dt>For</dt><dd>{sale.customer}</dd></div>}
        {sale.cashierName && <div><dt>Cashier</dt><dd>{sale.cashierName}</dd></div>}
      </dl>

      <div className="rc-sec">
        <div className="rc-sec-h"><span>Items</span><span>{drinks} {drinks === 1 ? 'drink' : 'drinks'}</span></div>
        <ul className="rc-items">
          {(sale.lines || []).map((l, i) => (
            <li key={i}>
              <span className="rc-q num">{l.qty}×</span>
              <span className="rc-nm">{l.name}{l.mods && <small>{l.mods}</small>}</span>
              <span className="rc-amt num">{peso(l.total)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rc-sums">
        <div><span>Subtotal</span><span className="num">{peso(sale.subtotal)}</span></div>
        {sale.discount?.amount > 0 && <div className="rc-disc"><span>{discLabel}</span><span className="num">−{peso(sale.discount.amount)}</span></div>}
        {sale.discount?.type === 'scpwd' && sale.discount.idNo && <small>SC/PWD ID {sale.discount.idNo} · {sale.discount.idName}</small>}
        {sale.discount?.approvedBy && <small>Discount approved by {sale.discount.approvedBy}</small>}
        <div className="rc-grand"><span>Total</span><b className="num">{peso(sale.total)}</b></div>
      </div>

      {state !== 'staff' && sale.pay && (
        <div className="rc-pay">
          <div><span>{method}</span><span className="num">{peso(sale.pay.tendered)}</span></div>
          {isCash && <div><span>Change</span><span className="num">{peso(sale.pay.change)}</span></div>}
          {sale.pay.ref && <div><span>Reference no.</span><span className="num">{sale.pay.ref}</span></div>}
        </div>
      )}

      {sale.stampsAwarded != null && (
        <div className={`rc-stamps ${free ? 'free' : ''}`}>
          <div className="rc-stamps-h"><b>Stamp card</b><span>+{sale.stampsAwarded} {sale.stampsAwarded === 1 ? 'stamp' : 'stamps'}{prog != null && <> · {prog}/{STAMPS_PER_REWARD}</>}</span></div>
          {prog != null && <div className="rc-dots" aria-hidden="true">{Array.from({ length: STAMPS_PER_REWARD }, (_, i) => <i key={i} className={i < prog ? 'on' : ''} />)}</div>}
          {free && <small>Your next drink is free!</small>}
        </div>
      )}

      {s.footer && <footer className="rc-foot">{s.footer}</footer>}
    </article>
  );
}

// Receipt-printer layout (58/80 mm thermal rolls; also fine on A4 or "Save as PDF")
const PRINT_CSS = `
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font: 12px/1.45 "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace; color: #000;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .receipt { width: 72mm; max-width: 100%; margin: 0 auto; padding: 2mm 0; }
  .receipt .c { text-align: center; }
  .receipt .r { display: flex; justify-content: space-between; gap: 8px; }
  .receipt .r span:last-child { white-space: nowrap; }
  .receipt hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .receipt .big { font-size: 14px; font-weight: 700; }
  .receipt .r-logo { display: block; width: 40mm; height: auto; margin: 0 auto 2mm; }
`;

/** Print only the receipt, in a hidden frame, so the rest of the POS never shows up on paper. */
export function printReceipt(node, title = 'Receipt') {
  if (!node) return;
  printHtml(node.outerHTML, PRINT_CSS, title);
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LABEL_CSS = `
  @page { size: 58mm 40mm; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lbl { width: 58mm; height: 40mm; padding: 1.4mm; page-break-after: always; break-after: page; overflow: hidden; }
  .lbl:last-child { page-break-after: auto; break-after: auto; }
  .in { height: 100%; border: .35mm solid #000; border-radius: 2.6mm; display: flex; flex-direction: column; overflow: hidden; }
  .hd, .ft { display: flex; justify-content: space-between; align-items: center; gap: 2mm; padding: 1mm 2.2mm; font-size: 6.6pt; white-space: nowrap; }
  .hd { border-bottom: .25mm solid #000; }
  .ft { border-top: .25mm solid #000; }
  .shop { font-weight: 800; letter-spacing: .14em; text-transform: uppercase; display: flex; align-items: center; gap: .8mm; overflow: hidden; text-overflow: ellipsis; }
  .shop svg { width: 2.6mm; height: 2.6mm; flex: none; }
  .no { font-weight: 800; font-size: 7.4pt; }
  .no em { font-style: normal; font-weight: 600; font-size: 6pt; letter-spacing: .08em; text-transform: uppercase; border: .25mm solid #000; border-radius: 1mm; padding: 0 .7mm; margin-left: .8mm; }
  .mid { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: .6mm 2.2mm; }
  .nm { font-size: 16pt; font-weight: 800; line-height: 1.02; letter-spacing: -.01em; text-transform: capitalize; word-break: break-word; }
  .nm.m { font-size: 13pt; } .nm.s { font-size: 11pt; }
  .dr { font-size: 8.6pt; font-weight: 700; line-height: 1.15; margin-top: .9mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .md { font-size: 7pt; line-height: 1.2; margin-top: .4mm; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ft b { font-weight: 800; }
`;
const LEAF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20C4 10 10 4 21 3c-1 10-7 17-17 17Z" fill="#000"/><path d="M4 20 13 11" stroke="#fff" stroke-width="1.8"/></svg>';
/** Cup labels: on the receipt printer when set up, otherwise through the print window (58 × 40 mm stickers). */
export async function printCupLabels(sale, settings) {
  if (await printLabels(sale, settings)) return 'Labels sent to the printer.';
  const shop = esc(settings?.name || 'Matchéa');
  const html = cupLabels(sale).map((c) => {
    const name = c.name || '—';
    const size = name.length > 20 ? ' s' : name.length > 13 ? ' m' : '';
    return `<div class="lbl"><div class="in">`
      + `<div class="hd"><span class="shop">${LEAF}${shop}</span><span class="no">#${pad(c.no)}${c.online ? '<em>Online</em>' : ''}</span></div>`
      + `<div class="mid"><div class="nm${size}">${esc(name)}</div><div class="dr">${esc(c.drink)}</div>${c.mods ? `<div class="md">${esc(c.mods)}</div>` : ''}</div>`
      + `<div class="ft"><span>${esc(c.time.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }))}</span><span>cup <b>${c.n}</b> of ${c.of}</span></div>`
      + `</div></div>`;
  }).join('');
  printHtml(html, LABEL_CSS, `Cup labels #${pad(sale.no)}`);
  return '';
}

export function printHtml(body, css, title) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title><style>${css}</style></head><body>${body}</body></html>`);
  doc.close();
  const go = () => {
    const w = frame.contentWindow;
    const cleanup = () => setTimeout(() => frame.remove(), 500);
    w.addEventListener('afterprint', cleanup, { once: true });
    w.focus();
    w.print();
    setTimeout(cleanup, 60000); // in case afterprint never fires
  };
  // Wait for the logo and fonts, then open the print dialog
  const imgs = [...doc.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))).filter(Boolean);
  const loaded = Promise.all([doc.fonts?.ready, ...imgs]);
  Promise.race([loaded, new Promise((r) => setTimeout(r, 3000))]).then(() => setTimeout(go, 50)); // never wait more than 3 s
}

export default function ReceiptModal({ sale, settings, onClose, justPaid, autoPrinted }) {
  const ref = useRef(null);
  const [msg, setMsg] = useState(autoPrinted || '');
  const [busy, setBusy] = useState(false);
  const browserPrint = () => printReceipt(ref.current?.firstElementChild, `Receipt #${pad(sale.no)}`);
  const print = async () => {
    setBusy(true); setMsg('');
    try { if (await printSale(sale, settings)) setMsg('Sent to the receipt printer.'); else browserPrint(); }
    catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal
      title={sale.status === 'staff' ? 'Staff drink saved' : sale.training ? `Practice order #${pad(sale.no)}` : justPaid ? 'Payment complete' : `Receipt · Order #${pad(sale.no)}`}
      aside={sale.status === 'void' ? <span className="pill mute">Void</span> : null}
      onClose={onClose}
      footer={<>
        {msg && <span className={`print-msg ${/^Sent|^Printed|^Labels/.test(msg) ? 'ok' : 'bad'}`} role="status">{msg}{!/^Sent|^Printed|^Labels/.test(msg) && <> <button className="linkbtn" onClick={browserPrint}>Use print window</button></>}</span>}
        {sale.status !== 'void' && sale.lines?.length > 0 && <button className="btn ghost" onClick={async () => { try { const m = await printCupLabels(sale, settings); if (m) setMsg(m); } catch (e) { setMsg(e.message); } }}>Cup labels</button>}
        <button className="btn" onClick={print} disabled={busy}>{busy ? 'Printing…' : 'Print receipt'}</button>
        <button className="btn primary" onClick={onClose} autoFocus>Close</button>
      </>}
    >
      {justPaid && (
        <div className="paid-check" aria-hidden="true">
          <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="23" /><path d="M15 27.5l7.5 7.5L37.5 19" /></svg>
        </div>
      )}
      <div className={`rc-wrap ${justPaid ? 'rc-print' : ''}`}><ReceiptCard sale={sale} settings={settings} /></div>
      <div ref={ref} className="rc-paper" hidden><Receipt sale={sale} settings={settings} /></div>
    </Modal>
  );
}
