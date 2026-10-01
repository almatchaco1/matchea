// ESC/POS: the command language almost every 58 mm / 80 mm receipt printer understands.
// Builds the receipt as raw bytes so it prints straight away, with no print dialog.
import { PAY_LABELS } from '../shared/pricing.mjs';
import { STAMPS_PER_REWARD } from '../shared/loyalty.mjs';

const ESC = 0x1b, GS = 0x1d;
export const CMD = {
  init: [ESC, 0x40],
  left: [ESC, 0x61, 0], center: [ESC, 0x61, 1], right: [ESC, 0x61, 2],
  boldOn: [ESC, 0x45, 1], boldOff: [ESC, 0x45, 0],
  big: [GS, 0x21, 0x11], tall: [GS, 0x21, 0x01], normal: [GS, 0x21, 0x00],
  feed: (n) => [ESC, 0x64, n],
  cut: [GS, 0x56, 0x42, 0x00], // feed a little and cut (printers without a cutter ignore it)
  drawer: [ESC, 0x70, 0x00, 0x19, 0xfa], // pulse on pin 2: opens the cash drawer
};

// Receipt printers use simple character sets: swap anything fancy for plain text
export function plain(s) {
  return String(s ?? '')
    .replace(/₱/g, 'P').replace(/[×✕]/g, 'x').replace(/[·•]/g, '-').replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, '-').replace(/…/g, '...')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // Crème Brûlée -> Creme Brulee
    .replace(/[^\x20-\x7e]/g, '');
}
const money = (n) => 'P' + (+n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Wrap text to the paper width. */
function wrap(text, w) {
  const out = []; let line = '';
  for (const word of plain(text).split(' ')) {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= w) line += ' ' + word;
    else { out.push(line); line = word; }
    while (line.length > w) { out.push(line.slice(0, w)); line = line.slice(w); }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}
/** "Left ......... Right" on one line (left side wraps if it's long). */
function lr(left, right, w) {
  right = plain(right);
  const lines = wrap(left, Math.max(8, w - right.length - 1));
  const last = lines.pop();
  return [...lines, last + ' '.repeat(Math.max(1, w - last.length - right.length)) + right];
}

/** Build the bytes for one receipt. width: characters per line (32 for 58 mm, 48 for 80 mm). */
export function receiptBytes(sale, s = {}, { width = 32, drawer = false, copy = '', logo = null } = {}) {
  const w = width;
  const bytes = [];
  const cmd = (c) => bytes.push(...c);
  const text = (t = '') => { for (const ch of plain(t)) bytes.push(ch.charCodeAt(0)); bytes.push(0x0a); };
  const rule = () => text('-'.repeat(w));
  const d = new Date(sale.createdAt || Date.now());

  cmd(CMD.init);
  if (drawer) cmd(CMD.drawer);
  cmd(CMD.center);
  if (logo) { bytes.push(...logo); cmd(CMD.feed(1)); }
  cmd(CMD.boldOn); cmd(CMD.tall); text(s.name || 'AL Matcha Co'); cmd(CMD.normal); cmd(CMD.boldOff);
  if (s.address) wrap(s.address, w).forEach(text);
  if (s.tin) text(`TIN ${s.tin}`);
  if (copy) text(copy);
  cmd(CMD.left); rule();
  cmd(CMD.center); cmd(CMD.big); text(`#${String(sale.no).padStart(3, '0')}`); cmd(CMD.normal); cmd(CMD.left);
  text(`${d.toLocaleDateString('en-PH')} ${d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}`);
  if (sale.customer) text(`For: ${sale.customer}`);
  if (sale.cashierName) text(`Cashier: ${sale.cashierName}`);
  if (sale.source === 'online') text('Online order');
  if (sale.status === 'void') { cmd(CMD.center); cmd(CMD.boldOn); text('*** VOID ***'); cmd(CMD.boldOff); cmd(CMD.left); }
  if (sale.status === 'staff') { cmd(CMD.center); cmd(CMD.boldOn); text(`*** STAFF DRINK - ${sale.staffForName || ''} ***`); cmd(CMD.boldOff); cmd(CMD.left); }
  if (sale.training) { cmd(CMD.center); cmd(CMD.boldOn); text('*** TRAINING - NOT A SALE ***'); cmd(CMD.boldOff); cmd(CMD.left); }
  rule();
  for (const l of sale.lines || []) {
    lr(`${l.qty} x ${l.name}`, money(l.total), w).forEach(text);
    if (l.mods) wrap(l.mods, w - 2).forEach((m) => text('  ' + m));
  }
  rule();
  lr('Subtotal', money(sale.subtotal), w).forEach(text);
  if (sale.discount?.amount > 0) {
    const label = sale.discount.type === 'reward' ? 'Free drink (stamp card)' : sale.discount.type === 'scpwd' ? 'Senior/PWD 20%' : `Discount ${sale.discount.pct}%`;
    lr(label, '-' + money(sale.discount.amount), w).forEach(text);
    if (sale.discount.type === 'scpwd' && sale.discount.idNo) wrap(`SC/PWD ID ${sale.discount.idNo} - ${sale.discount.idName || ''}`, w).forEach(text);
    if (sale.discount.approvedBy) wrap(`Approved by ${sale.discount.approvedBy}`, w).forEach(text);
  }
  cmd(CMD.boldOn); cmd(CMD.tall); lr('TOTAL', money(sale.total), w).forEach(text); cmd(CMD.normal); cmd(CMD.boldOff);
  rule();
  if (sale.pay) {
    lr(PAY_LABELS[sale.pay.method] || sale.pay.method, money(sale.pay.tendered), w).forEach(text);
    if (sale.pay.method === 'cash') lr('Change', money(sale.pay.change), w).forEach(text);
    if (sale.pay.ref) lr('Ref', sale.pay.ref, w).forEach(text);
  }
  if (sale.stampsAwarded != null) {
    rule(); cmd(CMD.center);
    text(`Stamp card: +${sale.stampsAwarded}${sale.stampsBalance != null ? `  (${sale.stampsBalance % STAMPS_PER_REWARD}/${STAMPS_PER_REWARD})` : ''}`);
    if (sale.stampsBalance >= STAMPS_PER_REWARD) text('Your next drink is FREE!');
    cmd(CMD.left);
  }
  rule();
  cmd(CMD.center); if (s.footer) wrap(s.footer, w).forEach(text);
  cmd(CMD.feed(3)); cmd(CMD.cut);
  return new Uint8Array(bytes);
}

/** One label per cup: the name to call out, the drink and how it's made. Cut between cups. */
export function cupLabels(sale) {
  const cups = [];
  for (const l of sale.lines || []) for (let k = 0; k < (+l.qty || 1); k++) cups.push(l);
  return cups.map((l, i) => ({ name: sale.customer || '', drink: l.name, mods: l.mods || '', no: sale.no, n: i + 1, of: cups.length,
    online: sale.source === 'online', time: new Date(sale.createdAt || Date.now()) }));
}
export function labelBytes(sale, s = {}, { width = 32 } = {}) {
  const w = width, bytes = [];
  const cmd = (x) => bytes.push(...x);
  const text = (t = '') => { for (const ch of plain(t)) bytes.push(ch.charCodeAt(0)); bytes.push(0x0a); };
  cmd(CMD.init);
  for (const c of cupLabels(sale)) {
    cmd(CMD.center);
    text(`${plain(s.name || 'AL Matcha Co')}  #${String(c.no).padStart(3, '0')}${c.online ? ' ONLINE' : ''}`);
    cmd(CMD.boldOn); cmd(CMD.big); wrap((c.name || '-').toUpperCase(), Math.floor(w / 2)).forEach(text); cmd(CMD.normal);
    wrap(c.drink.replace(/ Matcha Latte$/, ' Matcha'), w).forEach(text); cmd(CMD.boldOff);
    cmd(CMD.left);
    if (c.mods) wrap(c.mods, w).forEach(text);
    cmd(CMD.center);
    text(`${c.n} of ${c.of}  -  ${c.time.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`);
    cmd(CMD.feed(3)); cmd(CMD.cut);
  }
  return new Uint8Array(bytes);
}

/** End-of-day summary slip. c: data from /reports/closing */
export function closingBytes(c, s = {}, { width = 32, cash = '', note = '' } = {}) {
  const w = width, bytes = [];
  const cmd = (x) => bytes.push(...x);
  const text = (t = '') => { for (const ch of plain(t)) bytes.push(ch.charCodeAt(0)); bytes.push(0x0a); };
  const rule = () => text('-'.repeat(w));
  const row = (l, r) => lr(l, String(r), w).forEach(text);
  const DISC = { pct: 'Discounts', scpwd: 'Senior/PWD', reward: 'Free drinks' };
  cmd(CMD.init); cmd(CMD.center);
  cmd(CMD.boldOn); cmd(CMD.tall); text(s.name || 'AL Matcha Co'); cmd(CMD.normal); cmd(CMD.boldOff);
  text('END OF DAY'); text(c.date);
  if (c.closed) text(`Closed by ${c.closed.by}`);
  cmd(CMD.left); rule();
  cmd(CMD.boldOn); cmd(CMD.tall); row('NET SALES', money(c.net)); cmd(CMD.normal); cmd(CMD.boldOff);
  row('Orders', c.orders); row('Drinks & items', c.cups);
  if (c.first) row('First / last', `${c.first} / ${c.last}`);
  rule();
  for (const m of c.methods) row(`${PAY_LABELS[m.method] || m.method} (${m.orders})`, money(m.net));
  rule();
  row('Cash from sales', money(c.cashExpected));
  if (cash !== '' && cash != null) { const d = Math.round((+cash - c.cashExpected) * 100) / 100; row('Cash counted', money(+cash)); row(d < 0 ? 'Short' : d > 0 ? 'Over' : 'Difference', money(Math.abs(d))); }
  rule();
  for (const [k, v] of Object.entries(c.discounts || {})) if (v.count) row(`${DISC[k]} (${v.count})`, '-' + money(v.amount));
  row(`Voids (${c.voids.length})`, money(c.voids.reduce((a, v) => a + v.total, 0)));
  row(`Waste (${c.waste.count})`, money(c.waste.value));
  if (c.staff?.drinks) row(`Staff drinks (${c.staff.drinks})`, money(c.staff.cost));
  if (c.refs.length) row('E-payments checked', `${c.refs.filter((r) => r.checked).length}/${c.refs.length}`);
  if (c.top.length) { rule(); text('Best sellers'); for (const t of c.top) row(`${t.qty} x ${t.name}`, money(t.sales)); }
  if (note) { rule(); wrap(`Note: ${note}`, w).forEach(text); }
  rule(); cmd(CMD.center); text(`Printed ${new Date().toLocaleString('en-PH')}`);
  cmd(CMD.feed(3)); cmd(CMD.cut);
  return new Uint8Array(bytes);
}

export function testBytes({ width = 32 } = {}) {
  const bytes = [...CMD.init, ...CMD.center, ...CMD.boldOn];
  const text = (t) => { for (const ch of plain(t)) bytes.push(ch.charCodeAt(0)); bytes.push(0x0a); };
  text('AL Matcha Co'); bytes.push(...CMD.boldOff);
  text('Printer test'); text('-'.repeat(width)); text(`${width} characters per line`); text('1234567890'.repeat(5).slice(0, width));
  text('If this looks right, you are set!');
  bytes.push(...CMD.feed(3), ...CMD.cut);
  return new Uint8Array(bytes);
}

/**
 * The shop logo as printer dots (GS v 0 raster image). dots: width in printer dots
 * (58 mm paper = 384 dots wide, 80 mm = 576), we use about half of that.
 */
export async function logoRaster(dots = 192, src = '/brand/logo.svg') {
  const img = new Image();
  img.src = src;
  await img.decode();
  const w = Math.ceil(dots / 8) * 8, h = w;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const row = w / 8;
  const out = new Uint8Array(8 + row * h);
  out.set([GS, 0x76, 0x30, 0x00, row & 0xff, row >> 8, h & 0xff, h >> 8]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (lum < 150) out[8 + y * row + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return out;
}
