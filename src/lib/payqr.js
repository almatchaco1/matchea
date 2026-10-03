// Draws the shop's payment QR with the order total built in (QR Ph), as a picture customers can scan or save.
import { useMemo } from 'react';
import qrcode from './vendor/qrcode.mjs';
import { withAmount } from '../shared/qrph.mjs';

const peso = (n) => '₱' + (+n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** PNG data URL: the QR with a white border and a caption ("Pay ₱270.00 · JO***H S."). */
export function qrPng(text, { caption = '', sub = '' } = {}) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = Math.max(6, Math.floor(600 / n)), pad = cell * 4;
  const w = n * cell + pad * 2, capH = caption ? 96 : 0;
  const c = document.createElement('canvas'); c.width = w; c.height = w + capH;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect(pad + x * cell, pad + y * cell, cell, cell);
  if (caption) {
    g.textAlign = 'center'; g.fillStyle = '#1E2418';
    g.font = 'bold 40px system-ui, -apple-system, sans-serif'; g.fillText(caption, w / 2, w + 30);
    if (sub) { g.font = '26px system-ui, -apple-system, sans-serif'; g.fillStyle = '#555'; g.fillText(sub, w / 2, w + 72); }
  }
  return c.toDataURL('image/png');
}

/** The code to show for this payment: with the amount inside when we could read the shop's QR. */
export const payText = (q, amount) => (q?.payload ? withAmount(q.payload, amount) : '');

export function useAmountQr(q, amount, label) {
  return useMemo(() => {
    const text = payText(q, amount);
    if (!text) return null;
    try { return qrPng(text, { caption: amount > 0 ? `Pay ${peso(amount)}` : '', sub: [label, q.name].filter(Boolean).join(' · ') }); } catch { return null; }
  }, [q, amount, label]);
}

/** <img> of the QR with the amount built in, or the uploaded picture when the code couldn't be read. */
export function AmountQr({ kind, q, amount, label = 'Matchéa', alt, className }) {
  const src = useAmountQr(q, amount, label);
  return <img className={className} src={src || `/api/public/qr/${kind}?v=${q.v}`} alt={alt || 'Payment QR code'} />;
}

/** Save the QR picture to the phone (share sheet on phones, download elsewhere). */
export async function saveQr(dataUrl, filename) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Payment QR' }); return 'shared'; }
  } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  const a = Object.assign(document.createElement('a'), { href: dataUrl, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  return 'downloaded';
}

/** Open the GCash app (Android: straight to the app, or its Play Store page; iPhone: gcash://). */
export function openGcash() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) window.location.href = 'intent://#Intent;scheme=gcash;package=com.globe.gcash.android;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.globe.gcash.android;end';
  else window.location.href = 'gcash://';
}
export const isPhone = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
