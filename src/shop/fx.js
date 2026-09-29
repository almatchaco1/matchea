// Motion helpers for the customer site: scroll reveals, count-ups, confetti, button ripples.
// Everything respects "reduce motion" in the phone / computer settings.
import { useEffect, useRef, useState } from 'react';

export const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fade/slide in anything with data-reveal when it scrolls into view (watches for new elements too). */
export function useReveal(root, key) {
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const show = (n) => n.classList.add('in');
    if (calm() || !('IntersectionObserver' in window)) { el.querySelectorAll('[data-reveal]').forEach(show); return undefined; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => el.querySelectorAll('[data-reveal]:not(.in)').forEach((n) => io.observe(n));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [root, key]);
}

/** A number that rolls to its new value (prices, order numbers). */
export function CountUp({ value, format = (n) => n, duration = 500 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current, end = +value || 0;
    if (calm() || start === end) { setShown(end); from.current = end; return undefined; }
    let raf; const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      setShown(start + (end - start) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = end; };
  }, [value, duration]);
  return format(shown);
}

/** A little burst of matcha-coloured confetti from an element (order placed, order ready). */
export function confetti(from, n = 36) {
  if (calm() || typeof document === 'undefined') return;
  const r = (from?.getBoundingClientRect?.() || { left: window.innerWidth / 2, top: window.innerHeight / 3, width: 0, height: 0 });
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const colors = ['#2B5A20', '#8DB255', '#DCE9C4', '#F7E1E4', '#EFC9CF', '#F3C94A'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const size = 6 + Math.random() * 6;
    Object.assign(p.style, {
      position: 'fixed', left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size * (Math.random() > 0.5 ? 1 : 0.45)}px`,
      background: colors[i % colors.length], borderRadius: Math.random() > 0.6 ? '50%' : '2px', zIndex: 1200, pointerEvents: 'none',
    });
    document.body.appendChild(p);
    const a = Math.random() * Math.PI * 2, v = 90 + Math.random() * 170;
    const dx = Math.cos(a) * v, dy = Math.sin(a) * v - 120;
    p.animate([
      { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx * 1.2}px), calc(-50% + ${dy + 260}px)) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
  }
}

/** Soft ripple where a button is pressed. Call once for the whole site. */
export function useRipples(root) {
  useEffect(() => {
    const el = root.current;
    if (!el || calm()) return undefined;
    const down = (e) => {
      const b = e.target.closest?.('.sh-btn, .mn-add, .choice, .mn-cats button, .shop-bar button, .mn-active');
      if (!b || b.disabled) return;
      const r = b.getBoundingClientRect();
      const s = Math.max(r.width, r.height) * 1.2;
      const w = document.createElement('span');
      w.className = 'rip';
      Object.assign(w.style, { width: `${s}px`, height: `${s}px`, left: `${e.clientX - r.left - s / 2}px`, top: `${e.clientY - r.top - s / 2}px` });
      b.appendChild(w);
      setTimeout(() => w.remove(), 600);
    };
    el.addEventListener('pointerdown', down);
    return () => el.removeEventListener('pointerdown', down);
  }, [root]);
}

/** true once the page has scrolled a little (for the header shadow). */
export function useScrolled(px = 8) {
  const [s, set] = useState(false);
  useEffect(() => {
    const f = () => set(window.scrollY > px);
    f(); window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, [px]);
  return s;
}
