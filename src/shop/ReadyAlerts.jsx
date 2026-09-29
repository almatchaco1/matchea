// Order-ready alerts in the browser: a chime, a phone/desktop notification and the tab title.
// Works while the ordering site is open (also in a background tab). Texts come from the server.
import { useState } from 'react';
import { pad } from '../lib/format';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

export function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [784, 988, 1319].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

/** Tell the customer their order is ready, whichever page they're on. */
export function alertReady(order, shopName, onClick) {
  chime();
  const title = `Order #${pad(order.no)} is ready!`;
  const body = `${shopName || 'AL Matcha Co'}: come to the counter and show your order number.${order.paidOnline ? ' It’s already paid.' : ''}`;
  if (supported() && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, tag: `ready-${order.code}`, icon: '/logo192.png' });
      n.onclick = () => { window.focus(); onClick?.(); n.close(); };
    } catch {}
  }
  // Blink the tab title until they look
  const old = document.title;
  let on = false;
  const t = setInterval(() => { on = !on; document.title = on ? `✅ ${title}` : old; }, 1000);
  const stop = () => { if (!document.hidden) { clearInterval(t); document.title = old; document.removeEventListener('visibilitychange', stop); } };
  document.addEventListener('visibilitychange', stop);
  setTimeout(stop, 1500);
}

/** "Notify me on this device" switch. */
export default function ReadyAlerts({ compact }) {
  const [perm, setPerm] = useState(() => (supported() ? Notification.permission : 'unsupported'));
  if (perm === 'unsupported') return null;
  const ask = async () => { try { setPerm(await Notification.requestPermission()); } catch {} };
  if (perm === 'granted') return <p className={`notif-on ${compact ? 'center' : ''}`}>✓ This device will notify you when your order is ready.</p>;
  if (perm === 'denied') return compact ? null : <p className="muted small">Notifications are blocked for this site in your browser settings.</p>;
  return (
    <div className={`notif-ask ${compact ? 'compact' : ''}`}>
      <span>Get a notification on this device when your order is ready.</span>
      <button className="sh-btn sm ghost" onClick={ask}>Turn on</button>
    </div>
  );
}
