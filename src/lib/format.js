export const peso = (n) => '₱' + (+n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qfmt = (n) => {
  n = +n || 0;
  return Math.abs(n) >= 100 || Number.isInteger(n) ? Math.round(n).toLocaleString('en-PH') : n.toLocaleString('en-PH', { maximumFractionDigits: 1 });
};
export const pad = (n, l = 3) => String(n).padStart(l, '0');
export const dayKey = (d = new Date()) => {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const timeOf = (d) => new Date(d).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
// Cup color on the register: picked from flavor words in the name, matcha green otherwise
const FLAVOR_TONES = [
  [/strawberr/i, '#D9534F'], [/mango/i, '#E8B230'], [/ube|putobumbong|taro/i, '#7B4FA0'],
  [/banana/i, '#E6CF7A'], [/cr[eè]me br[uû]l[eé]e|caramel/i, '#C58B3C'], [/kinako|hojicha|cinnamon/i, '#A0673A'],
  [/s'?mores|chocolate|cocoa/i, '#6B4630'],
];
export const toneFor = (name) => FLAVOR_TONES.find(([re]) => re.test(name))?.[1] || '#6E9A3E';
export const ingStatus = (i) => (i.stock <= 0 ? 'bad' : i.stock <= (i.reorder || 0) ? 'warn' : 'ok');

/** Save text as a file in the browser. */
export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Days of stock left at the recent pace (null when it isn't being used). */
export const daysLeft = (i) => (i.perDay > 0 ? Math.max(0, i.stock) / i.perDay : null);
/** Needs restocking: at/below its reorder level, or less than 3 days left at the recent pace. */
export const needsRestock = (i) => ingStatus(i) !== 'ok' || (daysLeft(i) != null && daysLeft(i) < 3);
/** How much to buy: enough for about a week, and at least up to twice the reorder level. */
export function restockQty(i) {
  const target = Math.max((+i.reorder || 0) * 2, (+i.perDay || 0) * 7);
  let q = target - Math.max(0, +i.stock || 0);
  if (!(q > 0)) q = +i.reorder || 1;
  const step = ['pcs', 'pack'].includes(i.unit) ? 1 : ['kg', 'L'].includes(i.unit) ? 0.5 : q > 200 ? 50 : 10;
  return Math.ceil(q / step) * step;
}
