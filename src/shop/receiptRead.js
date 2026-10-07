// Reads a GCash / GoTyme receipt screenshot in the browser (Tesseract OCR, files served by this site from /vendor/tesseract).
// Returns what it found: { ref, amount, time ("HH:MM", 24 h), text }. Any of them can be missing if the picture is unclear.
import { loadScript } from './api';

const BASE = '/vendor/tesseract';
let workerP = null;

async function worker() {
  if (!workerP) {
    workerP = (async () => {
      await loadScript(`${BASE}/tesseract.min.js`);
      const T = window.Tesseract;
      if (!T) throw new Error('reader unavailable');
      const w = await T.createWorker('eng', 1, {
        workerPath: `${BASE}/worker.min.js`, corePath: `${BASE}/core`, langPath: `${BASE}/lang`, gzip: true,
        logger: () => {},
      });
      await w.setParameters({ tessedit_pageseg_mode: '3' }); // automatic layout: receipts have text spread around
      return w;
    })().catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

/** Start downloading the reader early (e.g. when the customer picks GCash), so reading is quick later. */
export function warmReader() { worker().catch(() => {}); }

/** Make the picture easier to read: grey, bigger if small, stronger contrast. Returns a canvas. */
async function prepare(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(2, Math.max(1, 1400 / img.naturalWidth));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d');
    g.filter = 'grayscale(1) contrast(1.35)';
    g.drawImage(img, 0, 0, c.width, c.height);
    // dark-mode receipts (light text on black) read better flipped to dark text on white
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0; for (let i = 0; i < px.length; i += 4 * 97) { sum += px[i]; n++; }
    if (sum / n < 110) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; const h = d.getContext('2d'); h.filter = 'invert(1)'; h.drawImage(c, 0, 0); return d; }
    return c;
  } finally { URL.revokeObjectURL(url); }
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const to24 = (h, m, ap) => { let H = +h % 12; if (/p/i.test(ap)) H += 12; return `${String(H).padStart(2, '0')}:${m}`; };
const num = (s) => +String(s).replace(/[,\s]/g, '');

/** Pull the reference number, amount and time out of the receipt text. Exported for tests. */
export function parseReceipt(raw, method) {
  const text = String(raw || '').replace(/[|]/g, 'I').replace(/ /g, ' ');
  const flat = text.replace(/\s+/g, ' ');
  const out = { ref: '', amount: null, time: '', date: '' };

  // Reference
  if (method !== 'gcash') { // GoTyme: letters and numbers
    for (const l of text.split(/\n+/)) {
      const m = /(?:reference|ref\.?)\s*(?:id|no\.?|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9 ]{5,30})\s*$/i.exec(l.trim());
      if (m) { out.ref = m[1].replace(/\s+/g, '').toUpperCase().slice(0, 30); break; }
    }
  } else {
    const m = /ref(?:erence)?\.?\s*(?:no\.?|number|#)?\s*[:.]?\s*((?:\d[\s.]?){13})/i.exec(flat);
    const digits = (s) => s.replace(/\D/g, '');
    if (m && digits(m[1]).length === 13) out.ref = digits(m[1]);
    else {
      const any = /(?:^|\D)(\d{4}\s?\d{3}\s?\d{6})(?!\d)/.exec(flat) || /(?:^|\D)(\d{13})(?!\d)/.exec(flat); // no look-behind: older iPhones can't run it
      if (any) out.ref = digits(any[1]);
    }
  }

  // Amount: prefer the "Total" / "Amount" lines, else the biggest peso amount on the receipt
  const money = /(?:₱|PHP|Php|P|®|\?)?\s?(\d{1,3}(?:[,\s]\d{3})*\.\d{2}|\d+\.\d{2})/g;
  const lines = text.split(/\n+/);
  const pick = (re) => { for (const l of lines) if (re.test(l)) { const m = [...l.matchAll(money)].map((x) => num(x[1])).filter((v) => v > 0); if (m.length) return m[m.length - 1]; } return null; };
  out.amount = pick(/total\s*amount/i) ?? pick(/amount/i) ?? pick(/total/i);
  if (out.amount == null) {
    const all = [...flat.matchAll(money)].map((x) => num(x[1])).filter((v) => v > 0 && v < 100000);
    if (all.length) out.amount = Math.max(...all);
  }

  // Time (the receipt shows e.g. "Oct 5, 2026 2:14 PM")
  const near = new RegExp(`(${MONTHS})[a-z]*\\.?\\s*(\\d{1,2}),?\\s*(\\d{4}),?\\s*(\\d{1,2}):(\\d{2})\\s*([AP])\\.?\\s*M`, 'i').exec(flat);
  if (near && +near[4] >= 1 && +near[4] <= 12) {
    out.time = to24(near[4], near[5], near[6]);
    const mo = MONTHS.split('|').indexOf(near[1].toLowerCase()) + 1, day = +near[2], yr = +near[3];
    if (mo && day >= 1 && day <= 31 && yr >= 2020 && yr <= 2100) out.date = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else {
    const t = /(?:^|\D)(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\b/i.exec(flat);
    if (t && +t[1] >= 1 && +t[1] <= 12) out.time = to24(t[1], t[2], t[3]);
  }
  return out;
}

/** Read a receipt picture (File). Throws only if the reader itself can't load. */
export async function readReceipt(file, method) {
  const w = await worker();
  const canvas = await prepare(file);
  const { data } = await w.recognize(canvas);
  let text = data?.text || '';
  const out = parseReceipt(text, method);
  if (out.amount == null || !out.ref || !out.time) {
    // second try for what's missing: sparse-text mode finds lone big lines (like a big amount line)
    await w.setParameters({ tessedit_pageseg_mode: '11' });
    try {
      const again = (await w.recognize(canvas)).data?.text || '';
      const b = parseReceipt(again, method);
      if (out.amount == null) out.amount = b.amount;
      if (!out.ref && /\d/.test(b.ref)) out.ref = b.ref;
      if (!out.time) out.time = b.time;
      text += '\n' + again;
    } finally { await w.setParameters({ tessedit_pageseg_mode: '3' }); }
  }
  return { ...out, text };
}
