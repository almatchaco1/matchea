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
      <img className="r-logo" src="/brand/logo.svg" alt="" width="72" height="72" />
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
  .receipt .r-logo { display: block; width: 22mm; height: 22mm; margin: 0 auto 2mm; }
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
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #000; }
  .lbl { width: 58mm; height: 40mm; padding: 2.5mm 3mm; display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; break-after: page; overflow: hidden; }
  .lbl:last-child { page-break-after: auto; break-after: auto; }
  .top { font-size: 8pt; display: flex; justify-content: space-between; }
  .nm { font-size: 20pt; font-weight: 800; line-height: 1.05; margin: 1mm 0; text-transform: uppercase; word-break: break-word; }
  .dr { font-size: 10pt; font-weight: 700; }
  .md { font-size: 8pt; line-height: 1.25; margin-top: .5mm; }
`;
/** Cup labels: on the receipt printer when set up, otherwise through the print window (58 × 40 mm stickers). */
export async function printCupLabels(sale, settings) {
  if (await printLabels(sale, settings)) return 'Labels sent to the printer.';
  const html = cupLabels(sale).map((c) => `<div class="lbl"><div class="top"><span>#${pad(c.no)}${c.online ? ' · Online' : ''}</span><span>${c.n} of ${c.of}</span></div>`
    + `<div class="nm">${esc(c.name || '—')}</div><div class="dr">${esc(c.drink)}</div>${c.mods ? `<div class="md">${esc(c.mods)}</div>` : ''}</div>`).join('');
  printHtml(html, LABEL_CSS, `Cup labels #${pad(sale.no)}`);
  return '';
}

function printHtml(body, css, title) {
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
      title={sale.status === 'staff' ? `Staff drink · ${sale.staffForName || ''}` : sale.training ? `Practice order #${pad(sale.no)}` : justPaid ? `Paid · ${peso(sale.total)}` : `Order #${pad(sale.no)}`}
      aside={justPaid && sale.pay.method === 'cash' ? <span className="pill ok">Change {peso(sale.pay.change)}</span> : sale.status === 'void' ? <span className="pill mute">Void</span> : null}
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
      <div ref={ref} className={justPaid ? 'rc-print' : undefined}><Receipt sale={sale} settings={settings} /></div>
    </Modal>
  );
}
