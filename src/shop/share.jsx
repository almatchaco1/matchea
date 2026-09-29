import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// "Share my drink": draws a pretty picture of the customer's drink (with their choices) on a canvas,
// then lets them share it (phones) or save it (computers). Everything happens on the device.

const W = 1080, H = 1350;
const loadImg = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
const cssVar = (name, fallback) => {
  const el = document.querySelector('.shop') || document.documentElement;
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
};

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// Shrinks the font until the text fits the width
function fitText(g, text, maxW, size, weight, family) {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 2; } while (g.measureText(text).width > maxW && s > 20);
  return s + 2;
}
// Splits a name onto at most two lines
function twoLines(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return [text];
  const words = text.split(' ');
  for (let i = words.length - 1; i > 0; i--) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    if (g.measureText(a).width <= maxW) return [a, b];
  }
  return [text];
}

/** Draws the share card and returns it as a PNG Blob. */
export async function makeDrinkCard({ item, size, sweet, addons = [], who, shop }) {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  const serif = cssVar('--serif', 'Georgia, serif'), sans = cssVar('--sans', 'system-ui, sans-serif'), script = cssVar('--script', 'cursive');
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');

  // Background: blush paper with soft matcha + pink glows and paper specks
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#FCF1F2'); bg.addColorStop(1, '#F4DCE0'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); };
  glow(980, 160, 520, 'rgba(196,224,160,.55)'); glow(80, 1180, 560, 'rgba(236,170,186,.45)');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() > .5 ? '120,90,80' : '255,255,255'},${0.05 + rnd() * 0.08})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.5, 1 + rnd() * 2.5); }

  // Header: logo + shop name
  try { const logo = await loadImg('/brand/logo-small.svg'); g.drawImage(logo, 72, 64, 92, 92); } catch {}
  g.fillStyle = '#1F3A1B'; g.font = `700 44px ${serif}`; g.textBaseline = 'middle'; g.fillText(shop?.name || 'AL Matcha Co', 184, 98);
  g.fillStyle = '#5A6852'; g.font = `700 22px ${sans}`; g.fillText('GOOD MATCHA, GOOD MOOD', 186, 140);

  // Arch with the drink photo
  const ax = 190, ay = 200, aw = 700, ah = 700;
  g.save(); g.beginPath(); g.moveTo(ax, ay + ah); g.lineTo(ax, ay + aw / 2); g.arc(ax + aw / 2, ay + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw, ay + ah); g.closePath();
  const ag = g.createRadialGradient(W / 2, ay + 230, 40, W / 2, ay + 380, 520); ag.addColorStop(0, '#3F7A2C'); ag.addColorStop(1, '#1C3F15');
  g.fillStyle = ag; g.shadowColor = 'rgba(31,58,27,.35)'; g.shadowBlur = 60; g.shadowOffsetY = 30; g.fill(); g.restore();
  g.save(); g.beginPath(); g.moveTo(ax + 22, ay + ah); g.lineTo(ax + 22, ay + aw / 2); g.arc(ax + aw / 2, ay + aw / 2, aw / 2 - 22, Math.PI, 0); g.lineTo(ax + aw - 22, ay + ah);
  g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 3; g.stroke(); g.restore();
  // big 抹茶 in the arch
  g.save(); g.fillStyle = 'rgba(255,255,255,.07)'; g.font = `800 250px ${serif}`; g.textAlign = 'center'; g.fillText('抹茶', W / 2, ay + 250); g.restore();
  // floor shadow + photo
  g.save(); const fl = g.createRadialGradient(W / 2, ay + ah - 30, 10, W / 2, ay + ah - 30, 260); fl.addColorStop(0, 'rgba(0,0,0,.35)'); fl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fl; g.scale(1, 0.18); g.fillRect(0, (ay + ah - 110) / 0.18, W, 460); g.restore();
  if (item.image) {
    try {
      const img = await loadImg(item.image);
      const big = size?.big ? 1.06 : 1;
      const ih = 600 * big, iw = ih * (img.width / img.height);
      g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 40; g.shadowOffsetY = 24;
      g.drawImage(img, W / 2 - iw / 2, ay + ah - ih - 26, iw, ih); g.restore();
    } catch {}
  }

  // Hanko stamp
  g.save(); g.translate(868, 830); g.rotate(-0.16);
  roundRect(g, -64, -64, 128, 128, 18); g.fillStyle = 'rgba(252,241,242,.96)'; g.fill(); g.lineWidth = 7; g.strokeStyle = '#C0475F'; g.stroke();
  g.fillStyle = '#C0475F'; g.textAlign = 'center'; g.font = `800 40px ${serif}`; g.fillText('私の', 0, -20); g.fillText('一杯', 0, 28); g.restore();

  // Who it belongs to
  g.textAlign = 'center';
  g.fillStyle = '#C0475F'; g.font = `700 50px ${script}`;
  g.fillText(who ? `Made ${who}’s way` : 'Made my way', W / 2, 960);

  // Drink name
  g.fillStyle = '#1F3A1B';
  const fs = fitText(g, item.name, 900, 78, 800, serif);
  const lines = fs < 58 ? (g.font = `800 64px ${serif}`, twoLines(g, item.name, 900)) : [item.name];
  if (lines.length > 1) g.font = `800 ${fitText(g, lines.reduce((a, b) => (a.length > b.length ? a : b)), 900, 64, 800, serif)}px ${serif}`;
  lines.forEach((t, i) => g.fillText(t, W / 2, 1048 + i * 70 - (lines.length - 1) * 35));

  // Choice chips
  const chips = [size?.label, sweet, ...addons.map((a) => `+ ${a}`)].filter(Boolean);
  if (chips.length) {
    g.font = `700 30px ${sans}`;
    const pads = 28, gap = 14, widths = chips.map((t) => g.measureText(t).width + pads * 2);
    let rows = [[]], rw = [0];
    widths.forEach((w, i) => { const r = rows.length - 1; if (rw[r] + w + (rows[r].length ? gap : 0) > 940 && rows[r].length) { rows.push([]); rw.push(0); } const k = rows.length - 1; rw[k] += w + (rows[k].length ? gap : 0); rows[k].push(i); });
    rows = rows.slice(0, 2);
    rows.forEach((row, ri) => {
      let x = W / 2 - rw[ri] / 2; const y = 1130 + ri * 70 - (lines.length > 1 ? -18 : 0);
      row.forEach((i) => {
        const w = widths[i], add = chips[i].startsWith('+');
        roundRect(g, x, y, w, 56, 28); g.fillStyle = add ? '#F3C94A' : '#2B5A20'; g.fill();
        g.fillStyle = add ? '#3A2A00' : '#fff'; g.textAlign = 'left'; g.fillText(chips[i], x + pads, y + 29); x += w + gap;
      });
    });
    g.textAlign = 'center';
  }

  // Footer
  const host = /localhost|127\.0\.0\.1|trycloudflare/.test(window.location.host) ? '' : window.location.host;
  const ig = (shop?.instagram || '').match(/instagram\.com\/([^/?#]+)/i)?.[1];
  const foot = [host && `Order ahead at ${host}`, ig && `@${ig}`].filter(Boolean).join('   ·   ') || 'Order ahead on our website';
  g.fillStyle = '#5A6852'; g.font = `700 26px ${sans}`; g.fillText(foot, W / 2, 1290);

  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Could not make the picture.'))), 'image/png'));
}

const fileName = (name) => `${(name || 'my-matcha').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;

/** Preview screen: shows the picture with Share and Save buttons. */
export function ShareDrink({ card, onClose }) {
  const [url, setUrl] = useState('');
  const [blob, setBlob] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const closeRef = useRef(null);
  useEffect(() => {
    let live = true, u = '';
    makeDrinkCard(card).then((b) => { if (!live) return; u = URL.createObjectURL(b); setBlob(b); setUrl(u); }).catch((e) => live && setErr(e.message || 'Could not make the picture.'));
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [card]);
  useEffect(() => {
    closeRef.current?.focus();
    const k = (e) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const file = blob ? new File([blob], fileName(card.item.name), { type: 'image/png' }) : null;
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const share = async () => {
    try { await navigator.share({ files: [file], title: card.item.name, text: `My ${card.item.name} from ${card.shop?.name || 'AL Matcha Co'} 🍵` }); }
    catch (e) { if (e?.name !== 'AbortError') setNote('Sharing didn’t work here. Use Save picture instead.'); }
  };
  const save = () => {
    const a = document.createElement('a'); a.href = url; a.download = fileName(card.item.name); document.body.appendChild(a); a.click(); a.remove();
    setNote('Saved! Post it on your story and tag us.');
  };

  // Rendered at the top of the page so it always covers everything (even inside animated panels)
  return createPortal(
    <div className="shop-scrim share-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-box" role="dialog" aria-modal="true" aria-label="Share my drink">
        <button ref={closeRef} className="sheet-x" onClick={onClose} aria-label="Close">×</button>
        <h3>Share my drink</h3>
        <div className="share-pic">
          {url ? <img src={url} alt={`Your ${card.item.name}, ready to share`} /> : err ? <p className="shop-alert">{err}</p> : <div className="share-wait"><span className="spin" />Making your picture…</div>}
        </div>
        <div className="share-btns">
          {canShare && <button className="sh-btn" onClick={share} disabled={!url}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Share</button>}
          <button className={`sh-btn ${canShare ? 'ghost' : ''}`} onClick={save} disabled={!url}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Save picture</button>
        </div>
        {note && <p className="muted center small share-note">{note}</p>}
      </div>
    </div>,
    document.querySelector('.shop') || document.body,
  );
}
