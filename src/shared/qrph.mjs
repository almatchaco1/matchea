// QR Ph (EMVCo) payment codes, like the one GCash / GoTyme give you under "Receive".
// A plain QR asks the customer to type the amount. Putting the amount inside the code
// (tag 54) and marking it one-time (tag 01 = 12) makes the app fill the amount in by itself.

/** CRC-16/CCITT-FALSE, used by EMV QR codes (tag 63). */
export function crc16(str) {
  let c = 0xffff;
  const bytes = new TextEncoder().encode(str);
  for (const b of bytes) {
    c ^= b << 8;
    for (let i = 0; i < 8; i++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

/** Split into [id, value] pairs. Returns null when it isn't a valid EMV code. */
export function parseEmv(s) {
  s = String(s || '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2), len = Number(s.slice(i + 2, i + 4));
    if (!/^\d\d$/.test(id) || !/^\d\d$/.test(s.slice(i + 2, i + 4))) return null;
    const v = s.slice(i + 4, i + 4 + len);
    if (v.length !== len) return null;
    out.push([id, v]);
    i += 4 + len;
  }
  return out;
}

/** Is this a QR Ph / EMV payment code we can add an amount to? */
export function isQrPh(s) {
  s = String(s || '');
  if (s.length < 30 || s.length > 512 || !s.startsWith('000201')) return false;
  const tags = parseEmv(s);
  if (!tags) return false;
  const crc = tags.find(([id]) => id === '63');
  if (!crc || tags[tags.length - 1][0] !== '63') return false;
  return crc16(s.slice(0, -4)) === crc[1].toUpperCase();
}

/** Short summary for the owner: who receives the money. */
export function qrPhInfo(s) {
  const t = parseEmv(s) || [];
  const get = (id) => t.find(([k]) => k === id)?.[1] || '';
  return { name: get('59'), city: get('60'), currency: get('53'), amount: get('54') };
}

/** Same code with the amount built in (e.g. 270 → "270.00"). */
export function withAmount(s, amount) {
  const tags = parseEmv(s);
  if (!tags || !(amount > 0)) return s;
  const amt = (Math.round(amount * 100) / 100).toFixed(2);
  const kept = tags.filter(([id]) => id !== '54' && id !== '63').map(([id, v]) => [id, id === '01' ? '12' : v]);
  kept.push(['54', amt]);
  kept.sort((a, b) => a[0].localeCompare(b[0])); // tags go in number order
  const body = kept.map(([id, v]) => id + String(v.length).padStart(2, '0') + v).join('') + '6304';
  return body + crc16(body);
}
