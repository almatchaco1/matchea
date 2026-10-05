// Validation rules shared by the React forms and the Express API.
// Each validator returns an object of { fieldName: 'message' }; empty object = valid.
// The server runs the same rules (and adds database checks like "name already used").

export const LIMITS = {
  name: 60,
  cat: 30,
  desc: 120,
  note: 120,
  customer: 40,
  ref: 40,
  address: 120,
  footer: 120,
  optionLabel: 24,
  staffName: 30,
  price: 10000, // ₱ per menu item
  optionPrice: 1000,
  cost: 100000, // ₱ per unit
  qty: 1000000, // stock amounts
  recipeQty: 5000,
  steps: 15, // barista steps per drink
  step: 200,
  milkQty: 2000,
  lineQty: 99,
  lines: 50,
  cashOver: 100000, // cash received can't exceed total by more than this (typo guard)
  maxChange: 1000, // change of ₱1,000 or more means the cash amount was typed wrong (nobody hands over a bill they get fully back)
  cashConfirm: 5000, // cash received of ₱5,000 or more needs a second tap to confirm
  vat: 30,
  reportDays: 366,
};

export const UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'pack'];
export const PACK_NAMES = ['carton', 'pack', 'bottle', 'bag', 'box', 'can', 'tub', 'jar', 'sack', 'case', 'piece'];
/** ₱ per unit from a pack price: ₱150 for 1000 ml → 0.15 */
export const unitCostOf = (packCost, packSize) => Math.round(((+packCost || 0) / (+packSize || 1)) * 10000) / 10000;
export const DISCOUNTS = ['none', 'pct', 'scpwd'];
export const METHODS = ['cash', 'gcash', 'maya'];
export const ROLES = ['admin', 'cashier'];
export const WASTE_WHY = { spilled: 'Spilled / dropped', remade: 'Made wrong / remade', expired: 'Expired / spoiled', other: 'Other' };

const str = (v) => (v == null ? '' : String(v)).trim();
const isNum = (v) => v !== '' && v != null && !Number.isNaN(Number(v)) && Number.isFinite(Number(v));
const decimals = (v) => (String(v).split('.')[1] || '').length;
export const isObjectId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

function text(errs, key, v, { label, required = false, max, min = 0, pattern, patternMsg } = {}) {
  const s = str(v);
  if (!s) { if (required) errs[key] = `Enter ${label}.`; return; }
  if (s.length < min) errs[key] = `${cap(label)} must be at least ${min} characters.`;
  else if (max && s.length > max) errs[key] = `${cap(label)} can be at most ${max} characters.`;
  else if (pattern && !pattern.test(s)) errs[key] = patternMsg;
}

function number(errs, key, v, { label, required = true, min = 0, max, gt, int = false, maxDecimals = 2, unit = '' } = {}) {
  if (v === '' || v == null) { if (required) errs[key] = `Enter ${label}.`; return; }
  if (!isNum(v)) { errs[key] = `${cap(label)} must be a number.`; return; }
  const n = Number(v);
  if (gt != null && !(n > gt)) errs[key] = `${cap(label)} must be more than ${gt}${unit}.`;
  else if (n < min) errs[key] = `${cap(label)} can't be less than ${min}${unit}.`;
  else if (max != null && n > max) errs[key] = `${cap(label)} can't be more than ${max.toLocaleString('en-PH')}${unit}.`;
  else if (int && !Number.isInteger(n)) errs[key] = `${cap(label)} must be a whole number.`;
  else if (!int && decimals(v) > maxDecimals) errs[key] = `${cap(label)} can have at most ${maxDecimals} decimal places.`;
}

// 'a name' → 'Name', 'the cost per unit' → 'Cost per unit' (used at the start of a sentence)
const cap = (s) => { const n = s.replace(/^(a|an|the) /, ''); return n.charAt(0).toUpperCase() + n.slice(1); };

// ---------- ingredients ----------
export function checkIngredient(b = {}, { isNew = false } = {}) {
  const e = {};
  text(e, 'name', b.name, { label: 'a name', required: true, max: LIMITS.name, min: 2 });
  text(e, 'cat', b.cat, { label: 'group', max: LIMITS.cat });
  if (!UNITS.includes(b.unit)) e.unit = 'Choose a unit.';
  number(e, 'reorder', b.reorder, { label: 'a reorder level', max: LIMITS.qty });
  const filled = (v) => v !== '' && v != null;
  const hasPack = filled(b.packSize) || filled(b.packCost);
  if (hasPack) {
    text(e, 'packName', b.packName, { label: 'what you buy (carton, pack, bottle…)', required: true, max: 20 });
    number(e, 'packSize', b.packSize, { label: `how much is in one ${str(b.packName) || 'pack'}`, gt: 0, max: LIMITS.qty, maxDecimals: 3 });
    number(e, 'packCost', b.packCost, { label: `the price of one ${str(b.packName) || 'pack'}`, max: 1000000, required: false });
  } else number(e, 'cost', b.cost, { label: 'the cost per unit', max: LIMITS.cost, maxDecimals: 4 });
  if (isNew) number(e, 'stock', b.stock, { label: 'the stock on hand', max: LIMITS.qty, maxDecimals: 3 });
  return e;
}

export function checkStockQty(v, mode) {
  const e = {};
  if (mode === 'receive') number(e, 'qty', v, { label: 'the amount received', gt: 0, max: LIMITS.qty, maxDecimals: 3 });
  else number(e, 'qty', v, { label: 'the counted amount', max: LIMITS.qty, maxDecimals: 3 });
  return e;
}

const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// ---------- expenses ----------
export const EXPENSE_CATS = ['Rent', 'Electricity', 'Water', 'Internet', 'Salaries', 'Gas / LPG', 'Supplies', 'Repairs', 'Marketing', 'Permits & fees', 'Transport', 'Other'];
export function checkExpense(b = {}) {
  const e = {};
  if (!isDay(b.date)) e.date = 'Choose a date.';
  text(e, 'cat', b.cat, { label: 'what it was for', required: true, max: 30 });
  number(e, 'amount', b.amount, { label: 'the amount', gt: 0, max: 10000000 });
  text(e, 'note', b.note, { label: 'the note', max: 120 });
  return e;
}

// ---------- suppliers ----------
export function checkSupplier(b = {}) {
  const e = {};
  text(e, 'name', b.name, { label: 'a name', required: true, max: 60, min: 2 });
  text(e, 'phone', b.phone, { label: 'phone', max: 40 });
  text(e, 'notes', b.notes, { label: 'notes', max: 200 });
  return e;
}

// ---------- products ----------
export function checkProduct(b = {}) {
  const e = {};
  text(e, 'name', b.name, { label: 'a name', required: true, max: LIMITS.name, min: 2 });
  text(e, 'cat', b.cat, { label: 'a category', required: true, max: LIMITS.cat });
  text(e, 'desc', b.desc, { label: 'description', max: LIMITS.desc });
  number(e, 'price', b.price, { label: 'a price', gt: 0, max: LIMITS.price, unit: '' });
  number(e, 'milkQty', b.milkQty ?? 0, { label: 'the milk per drink', max: LIMITS.milkQty, maxDecimals: 1 });
  const recipe = Array.isArray(b.recipe) ? b.recipe : [];
  const seen = new Set();
  recipe.forEach((r, i) => {
    if (!r || !isObjectId(String(r.ing || ''))) e[`recipe.${i}.ing`] = 'Choose an ingredient.';
    else if (seen.has(String(r.ing))) e[`recipe.${i}.ing`] = 'This ingredient is already in the recipe.';
    else seen.add(String(r.ing));
    const qe = {};
    number(qe, 'q', r?.qty, { label: 'an amount', gt: 0, max: LIMITS.recipeQty, maxDecimals: 2 });
    if (qe.q) e[`recipe.${i}.qty`] = qe.q;
  });
  if (!recipe.length && !(Number(b.milkQty) > 0)) e.recipe = 'Add at least one ingredient so stock is tracked.';
  if (b.steps != null) {
    if (!Array.isArray(b.steps) || b.steps.some((x) => typeof x !== 'string')) e.steps = 'Write one step per line.';
    else if (b.steps.filter((x) => x.trim()).length > LIMITS.steps) e.steps = `Keep it to ${LIMITS.steps} steps or fewer.`;
    else {
      const k = b.steps.findIndex((x) => x.trim().length > LIMITS.step);
      if (k >= 0) e.steps = `Step ${k + 1} is too long (at most ${LIMITS.step} characters).`;
    }
  }
  const img = str(b.image);
  if (img && (img.length > 300 || !/^(\/drinks\/[\w.-]+\.(jpe?g|png|webp)|https:\/\/\S+)$/i.test(img)))
    e.image = 'Use a picture from the list, or a link starting with https://';
  if (b.addons != null) {
    if (!Array.isArray(b.addons) || b.addons.some((a) => !isObjectId(String(a)))) e.addons = 'Choose add-ons from the list.';
    else if (new Set(b.addons.map(String)).size !== b.addons.length) e.addons = 'An add-on is listed twice.';
  }
  return e;
}

// ---------- settings ----------
export function checkSettings(b = {}) {
  const e = {};
  text(e, 'name', b.name, { label: 'the shop name', required: true, max: LIMITS.name, min: 2 });
  number(e, 'vat', b.vat, { label: 'VAT', max: LIMITS.vat, maxDecimals: 2, unit: '%' });
  text(e, 'address', b.address, { label: 'address', max: LIMITS.address });
  text(e, 'footer', b.footer, { label: 'receipt footer', max: LIMITS.footer });
  text(e, 'tin', b.tin, { label: 'TIN', pattern: /^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/, patternMsg: 'Use the TIN format 000-000-000 or 000-000-000-000.' });

  const group = (key, rows, extra) => {
    if (!Array.isArray(rows)) return;
    const labels = new Set();
    rows.forEach((o, i) => {
      const p = `${key}.${i}`;
      const lbl = str(o?.label);
      if (!lbl) e[`${p}.label`] = 'Enter a label.';
      else if (lbl.length > LIMITS.optionLabel) e[`${p}.label`] = `At most ${LIMITS.optionLabel} characters.`;
      else if (labels.has(lbl.toLowerCase())) e[`${p}.label`] = 'This label is already used.';
      labels.add(lbl.toLowerCase());
      const pe = {};
      number(pe, 'x', o?.price ?? 0, { label: 'price', max: LIMITS.optionPrice });
      if (pe.x) e[`${p}.price`] = pe.x;
      extra(o || {}, p);
    });
  };
  group('sizes', b.sizes, (o, p) => {
    const m = {};
    number(m, 'x', o.mult, { label: 'a multiplier', gt: 0, max: 5, maxDecimals: 2 });
    if (m.x) e[`${p}.mult`] = m.x;
    if (o.cup && !isObjectId(String(o.cup))) e[`${p}.cup`] = 'Choose a cup.';
  });
  group('milks', b.milks, (o, p) => {
    if (!o.ing || !isObjectId(String(o.ing))) e[`${p}.ing`] = 'Choose which milk to deduct.';
  });
  group('addons', b.addons, (o, p) => {
    if (o.ing && !isObjectId(String(o.ing))) e[`${p}.ing`] = 'Choose an ingredient.';
    const q = {};
    number(q, 'x', o.qty ?? 0, { label: 'an amount', max: LIMITS.recipeQty });
    if (q.x) e[`${p}.qty`] = q.x;
    else if (o.ing && !(Number(o.qty) > 0)) e[`${p}.qty`] = 'Enter how much it uses.';
  });
  if (Array.isArray(b.sizes) && !b.sizes.length) e.sizes = 'Keep at least one size.';
  return e;
}

// ---------- staff ----------
const WEAK_PINS = /^(\d)\1+$|^(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)/;
export function checkPin(pin, key = 'pin') {
  const e = {};
  const p = str(pin);
  if (!p) e[key] = 'Enter a PIN.';
  else if (!/^\d{4,8}$/.test(p)) e[key] = 'PIN must be 4–8 digits.';
  else if (WEAK_PINS.test(p)) e[key] = 'Too easy to guess. Avoid repeated or sequential digits.';
  return e;
}
export function checkStaff(b = {}) {
  const e = {};
  text(e, 'name', b.name, { label: 'a name', required: true, min: 2, max: LIMITS.staffName,
    pattern: /^[\p{L}][\p{L} .'-]*$/u, patternMsg: 'Use letters, spaces, dots, apostrophes or hyphens.' });
  Object.assign(e, checkPin(b.pin));
  if (b.role && !ROLES.includes(b.role)) e.role = 'Choose a role.';
  return e;
}

// ---------- checkout ----------
export function checkCheckout({ lineCount, total, discount = {}, pay = {}, customer, needName = false }) {
  const e = {};
  if (!lineCount) e.lines = 'The order is empty.';
  else if (lineCount > LIMITS.lines) e.lines = `An order can have at most ${LIMITS.lines} lines.`;
  if (!DISCOUNTS.includes(discount.type || 'none')) e.discount = 'Choose a discount.';
  if (discount.type === 'pct') number(e, 'discountPct', discount.pct, { label: 'a discount', gt: 0, max: 100, unit: '%' });
  if (discount.type === 'scpwd') { // Senior / PWD: ID details are kept for the records and printed on the receipt
    text(e, 'scIdNo', discount.idNo, { label: 'the ID number', required: true, min: 3, max: 30, pattern: /^[A-Za-z0-9 -]+$/, patternMsg: 'Use letters, numbers, spaces and dashes only.' });
    text(e, 'scName', discount.idName, { label: 'the name on the ID', required: true, min: 2, max: 60, pattern: /^[\p{L}][\p{L} .,'-]*$/u, patternMsg: 'Use letters only (spaces, dots and hyphens are fine).' });
  }
  if (needName) Object.assign(e, checkCupName(customer)); // counter orders: the name to call when the drink is ready
  else text(e, 'customer', customer, { label: 'customer name', max: LIMITS.customer });
  if (!METHODS.includes(pay.method)) e.method = 'Choose a payment method.';
  if (pay.method === 'cash') {
    const t = {};
    number(t, 'x', pay.tendered, { label: 'the cash received', max: total + LIMITS.cashOver });
    if (t.x) e.tendered = t.x;
    else if (Number(pay.tendered) + 1e-9 < total) e.tendered = `That's ₱${(total - Number(pay.tendered)).toFixed(2)} short.`;
    else if (Number(pay.tendered) - total >= LIMITS.maxChange - 1e-9) e.tendered = `That would be ₱${(Number(pay.tendered) - total).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} change. Check the cash received.`;
  } else {
    // Reference no. is optional at the counter, but when typed it must look like a real one
    const ref = String(pay.ref || '').replace(/[\s-]/g, '');
    if (ref.length > LIMITS.ref) e.ref = `At most ${LIMITS.ref} characters.`;
    else if (ref && pay.method === 'gcash' && !/^\d{13}$/.test(ref)) e.ref = /\D/.test(ref) ? 'A GCash reference no. has numbers only.' : `A GCash reference no. has 13 digits (this has ${ref.length}).`;
    else if (ref && pay.method === 'maya' && !/^[A-Za-z0-9]{6,20}$/.test(ref)) e.ref = 'A Maya reference ID has 6 to 20 letters or numbers.';
  }
  return e;
}

// ---------- online orders (customer side) ----------
export const ONLINE = { lines: 20, lineQty: 10, name: 40, pickupNote: 120, openOrdersPerPhone: 3,
  payFirstOver: 3000, payFirstDrinks: 10, // big orders (over ₱3,000 or more than 10 drinks) must be paid first
  payTimeOld: 30, payTimeAhead: 5 }; // receipt time more than 30 min before the order is flagged; up to 5 min ahead is allowed (phone clocks differ)
/** PayMongo's cut for online GCash / Maya payments (%). The customer pays it, so the shop still gets the full price. */
export const ONLINE_FEE_PCT = { gcash: 2.23, paymaya: 1.79 };
/** ₱250 by GCash → { total: 255.7, fee: 5.7 }: after PayMongo takes its % of the total, the shop receives ₱250. */
export function withOnlineFee(amount, type) {
  const pct = ONLINE_FEE_PCT[type], a = Number(amount) || 0;
  if (!pct || a <= 0) return { total: a, fee: 0 };
  const total = Math.round((a / (1 - pct / 100)) * 100) / 100;
  return { total, fee: Math.round((total - a) * 100) / 100 };
}
/** Discounts above this % need an admin's PIN when a cashier is signed in. */
export const DISC_PIN_OVER = 20;
/** Normalise a PH mobile number to 09XXXXXXXXX, or '' when it isn't one. */
export const normPhone = (v) => {
  const d = str(v).replace(/[\s()-]/g, '');
  const m = d.match(/^(?:\+?63|0)?(9\d{9})$/);
  return m ? '0' + m[1] : '';
};
export function checkOnlineOrder(b = {}) {
  const e = {};
  text(e, 'customer', b.customer, { label: 'your name', required: true, min: 2, max: ONLINE.name,
    pattern: /^[\p{L}][\p{L} .'-]*$/u, patternMsg: 'Use letters only (spaces, dots and hyphens are fine).' });
  // Mobile number is optional (Google / Facebook customers may not have added one)
  if (str(b.phone) && !normPhone(b.phone)) e.phone = 'Enter a PH mobile number like 0917 123 4567.';
  text(e, 'pickupNote', b.pickupNote, { label: 'the note', max: ONLINE.pickupNote });
  const n = Array.isArray(b.lines) ? b.lines.length : 0;
  if (!n) e.lines = 'Your cart is empty.';
  else if (n > ONLINE.lines) e.lines = `Online orders can have at most ${ONLINE.lines} items. Call the shop for bigger orders.`;
  return e;
}

// ---------- customer accounts ----------
export const PASSWORD_MIN = 8;
export function checkPassword(pw, key = 'password') {
  const e = {};
  const p = pw == null ? '' : String(pw);
  if (!p) e[key] = 'Enter a password.';
  else if (p.length < PASSWORD_MIN) e[key] = `Use at least ${PASSWORD_MIN} characters.`;
  else if (p.length > 72) e[key] = 'Use at most 72 characters.';
  else if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) e[key] = 'Use both letters and numbers.';
  return e;
}
/** Tidies a name: trims, single spaces, and fixes ALL CAPS / all lowercase → Title Case. */
export const cleanName = (v) => {
  const t = str(v).replace(/\s+/g, ' ');
  if (!t) return t;
  const letters = t.replace(/[^\p{L}]/gu, '');
  if (letters && (letters === letters.toLowerCase() || letters === letters.toUpperCase()))
    return t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  return t;
};
const FAKE_NAMES = new Set(['asdf', 'asd', 'qwe', 'qwer', 'qwerty', 'zxc', 'zxcv', 'test', 'tester', 'sample', 'name', 'noname', 'none', 'na', 'n a', 'abc', 'abcd', 'xxx', 'xyz', 'customer', 'user', 'anonymous', 'anon', 'unknown', 'hello', 'hi']);
export function checkCustomerName(v, key = 'name') {
  const e = {};
  const n = cleanName(v);
  text(e, key, n, { label: 'your name', required: true, min: 2, max: ONLINE.name,
    pattern: /^[\p{L}][\p{L} .'-]*$/u, patternMsg: 'Use letters only (spaces, dots and hyphens are fine).' });
  if (e[key]) return e;
  const low = n.toLowerCase(), bare = low.replace(/[^\p{L} ]/gu, '').trim();
  if (FAKE_NAMES.has(bare) || /(\p{L})\1\1/u.test(low) || /asdf|qwer|zxcv|hjkl/.test(low) || (bare.replace(/ /g, '').length >= 4 && !/[aeiouy]/i.test(bare)))
    e[key] = 'Please enter your real name, so the shop knows whose order it is.';
  return e;
}
/** The name written on the cup and called out when the drink is ready (nicknames are fine). */
export function checkCupName(v) {
  const e = {}, n = str(v).replace(/\s+/g, ' ');
  if (!n) return { customer: 'Type the customer’s name, so you can call it when the drink is ready.' };
  text(e, 'customer', n, { label: 'the name', min: 2, max: LIMITS.customer,
    pattern: /^[\p{L}0-9][\p{L}0-9 .'&-]*$/u, patternMsg: 'Use letters (numbers, spaces, dots and hyphens are fine).' });
  if (e.customer) return e;
  const bare = n.toLowerCase().replace(/[^\p{L} ]/gu, '').trim();
  if (!/\p{L}/u.test(n) || FAKE_NAMES.has(bare) || /(\p{L})\1\1/u.test(n.toLowerCase()) || /asdf|qwer|zxcv/.test(bare))
    e.customer = 'Type the customer’s real name or nickname, so you can call it.';
  return e;
}
/** True for numbers that can't be real: all one digit, 1234567… runs, or 7 same digits at the end. */
export const isFakePhone = (p) => {
  const n = normPhone(p); if (!n) return false;
  const d = n.slice(1); // 9XXXXXXXXX
  if (new Set(d.slice(1)).size <= 2) return true;                   // 0900 000 0000, 0911 111 1111, 0912 121 2121
  if (/(\d)\1{6}$/.test(d)) return true;                            // 0917 777 7777
  if ('9876543210987'.includes(d.slice(1)) || '0123456789012345'.includes(d.slice(1))) return true; // 0912 345 6789 style runs
  if ('0123456789'.includes(d.slice(-7)) || '9876543210'.includes(d.slice(-7))) return true; // 0917 123 4567 (the example number)
  return false;
};
/** Formats what someone types as 0917 123 4567 (also turns +63 / 63 into 0). */
export const fmtPhoneInput = (v) => {
  let d = String(v || '').replace(/[^\d]/g, '');
  if (d.startsWith('63')) d = '0' + d.slice(2);
  else if (d.startsWith('9')) d = '0' + d;
  d = d.slice(0, 11);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(' ');
};
export function checkPhone(v, key = 'phone') {
  const e = {};
  if (!str(v)) e[key] = 'Enter your mobile number.';
  else if (!normPhone(v)) e[key] = 'Enter a PH mobile number like 0917 123 4567.';
  else if (isFakePhone(v)) e[key] = 'That number doesn’t look real. Please check it.';
  return e;
}
export const checkSignup = (b = {}) => ({ ...checkCustomerName(b.name), ...checkPhone(b.phone), ...checkPassword(b.password),
  ...(b.agree === true ? {} : { agree: 'Please agree to the Terms and Privacy Policy.' }) });

// ---------- store info (footer) ----------
const SOCIAL = {
  facebook: { hosts: /^(www\.|m\.)?(facebook\.com|fb\.com)$/i, base: 'https://www.facebook.com/', label: 'Facebook' },
  instagram: { hosts: /^(www\.)?instagram\.com$/i, base: 'https://www.instagram.com/', label: 'Instagram' },
  tiktok: { hosts: /^(www\.)?tiktok\.com$/i, base: 'https://www.tiktok.com/@', label: 'TikTok' },
};
/** A page link or @handle -> a full https link on that site, or null when it isn't one. '' stays ''. */
export function socialUrl(kind, v) {
  const s = str(v).replace(/\s+/g, '');
  if (!s) return '';
  const cfg = SOCIAL[kind];
  const handle = /^@?[A-Za-z0-9._-]{2,60}$/.exec(s);
  if (handle) return cfg.base + s.replace(/^@/, '');
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    if (!cfg.hosts.test(u.hostname) || u.pathname.length < 2) return null;
    return 'https://' + u.hostname.replace(/^m\./, 'www.') + u.pathname.replace(/\/$/, '') + u.search;
  } catch { return null; }
}
export function checkStoreInfo(b = {}) {
  const e = {};
  text(e, 'contactPhone', b.contactPhone, { label: 'the phone number', max: 20, pattern: /^\+?[\d\s()-]{7,20}$/, patternMsg: 'Use numbers only, like 0917 123 4567 or (02) 8123 4567.' });
  text(e, 'contactEmail', b.contactEmail, { label: 'the email', max: 80, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, patternMsg: 'Enter an email like hello@matchea.com.' });
  const hours = str(b.hours);
  if (hours.length > 160) e.hours = 'Keep the hours under 160 characters.';
  else if (hours.split('\n').length > 4) e.hours = 'Use at most 4 lines.';
  for (const k of Object.keys(SOCIAL)) if (socialUrl(k, b[k]) === null) e[k] = `Paste your ${SOCIAL[k].label} page link, or just the @name.`;
  return e;
}

/** Checks a GCash / Maya reference number. GCash: 13 digits. Maya: 6–20 letters or numbers. Returns an error or ''. */
export function checkQrRef(method, raw) {
  const ref = String(raw || '').replace(/[\s-]/g, '').toUpperCase();
  if (!ref) return 'Type the reference number from your payment receipt.';
  if (method === 'gcash') {
    if (!/^\d+$/.test(ref)) return 'A GCash reference number has numbers only.';
    if (ref.length !== 13) return `A GCash reference number has 13 digits (you typed ${ref.length}).`;
  } else if (!/^[A-Z0-9]{6,20}$/.test(ref)) return 'Type the reference ID exactly as it shows on your Maya receipt (letters and numbers).';
  const digits = ref.replace(/\D/g, '');
  if (new Set(ref).size <= 2 || (digits.length >= 8 && ('01234567890123456789'.includes(digits) || '98765432109876543210'.includes(digits))))
    return 'That reference number doesn’t look right. Please copy it from your receipt.';
  return '';
}
/**
 * The time on the customer's GCash / Maya receipt ("HH:MM", 24-hour, Philippine time).
 * Returns { err } or { paidAt, mins } where mins = how long before `now` the payment was made.
 * A time a little later than now is allowed (phone clocks differ); just after midnight a late-evening time counts as yesterday.
 */
export function checkPaidTime(raw, now = Date.now()) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(raw || '').trim());
  if (!m) return { err: raw ? 'Enter the time like 2:14 PM.' : 'Enter the time shown on your receipt.' };
  const PH = 8 * 3600e3; // Philippine time is UTC+8 all year
  const local = new Date(now + PH);
  let paidAt = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), +m[1], +m[2]) - PH;
  if (paidAt > now + ONLINE.payTimeAhead * 60e3) { // later than now: only makes sense just after midnight (11:58 PM typed at 12:05 AM)
    paidAt -= 86400e3;
    if (now - paidAt > 3 * 3600e3) return { err: 'That time hasn’t come yet today. Check the time on your receipt.' };
  }
  const mins = Math.floor((now - paidAt) / 60e3);
  return { paidAt: new Date(paidAt), mins: Math.max(0, mins) };
}
export const cleanQrRef = (raw) => String(raw || '').replace(/[\s-]/g, '').toUpperCase();
