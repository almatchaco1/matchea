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

/** A price whose digits roll up or down like an odometer when it changes (cart total). */
export function RollNum({ value, format = (n) => String(n) }) {
  const str = format(+value || 0);
  const chars = str.split('');
  return (
    <span className="rn" aria-label={str}>
      {chars.map((ch, i) => {
        const p = chars.length - 1 - i; // place from the right, so the same digit keeps its slot
        if (!/\d/.test(ch)) return <span key={`c${p}`} className="rn-c" aria-hidden="true">{ch}</span>;
        return (
          <span key={`d${p}`} className="rn-d" aria-hidden="true">
            <span className="rn-s" style={{ transform: `translateY(${-ch * 10}%)`, transitionDelay: `${Math.min(p, 6) * 35}ms` }}>
              {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Menu cards further down the page rise in as they scroll into view, a few at a time. */
export function useScrollIn(ref, key) {
  useEffect(() => {
    const el = ref.current;
    if (!el || calm() || !('IntersectionObserver' in window)) return undefined;
    const below = [...el.children].filter((c) => c.getBoundingClientRect().top > window.innerHeight - 10);
    if (!below.length) return undefined;
    below.forEach((c) => c.classList.add('rv-wait'));
    const io = new IntersectionObserver((entries) => {
      let k = 0;
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const n = e.target;
        n.style.setProperty('--rv', k++);
        n.classList.replace('rv-wait', 'rv-in');
        io.unobserve(n);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.1 });
    below.forEach((c) => io.observe(c));
    return () => { io.disconnect(); below.forEach((c) => c.classList.remove('rv-wait')); };
  }, [ref, key]);
}

/** A little burst of matcha-coloured confetti from an element (order placed, order ready). */
export function confetti(from, n = 36) {
  if (calm() || typeof document === 'undefined') return;
  const r = (from?.getBoundingClientRect?.() || { left: window.innerWidth / 2, top: window.innerHeight / 3, width: 0, height: 0 });
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const colors = ['#324623', '#8BA562', '#DAE4C9', '#F3EDE0', '#EADFC9', '#F3C94A'];
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

// ---------- Photo grows from the menu card into the drink sheet (and back when it closes) ----------
let fromImg = null; // the menu photo the sheet opened from
let openedFrom = null; // the photo to fly back to when the sheet closes
/** Call with the menu card's <img> just before opening the drink sheet. */
export const photoFrom = (img) => { fromImg = img && img.getBoundingClientRect().width ? img : null; };
// The picture area inside an <img> (without its padding), on screen
const inner = (img) => {
  const r = img.getBoundingClientRect(), s = getComputedStyle(img);
  const p = (k) => parseFloat(s[k]) || 0;
  return { left: r.left + p('paddingLeft'), top: r.top + p('paddingTop'), width: r.width - p('paddingLeft') - p('paddingRight'), height: r.height - p('paddingTop') - p('paddingBottom') };
};
function fly(src, getTo, hide, duration, done) {
  const a = inner(src);
  const g = new Image();
  g.src = src.currentSrc || src.src; g.alt = '';
  Object.assign(g.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, objectFit: 'contain', zIndex: 2000, pointerEvents: 'none', margin: 0, filter: 'drop-shadow(0 16px 18px rgba(30,36,24,.25))' });
  document.body.appendChild(g);
  hide.forEach((h) => { h.style.visibility = 'hidden'; });
  const t0 = performance.now();
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / duration), e = ease(k), b = getTo(); // b: null when the target is gone
    const lerp = (x, y) => x + (y - x) * e;
    if (b) Object.assign(g.style, { left: `${lerp(a.left, b.left)}px`, top: `${lerp(a.top, b.top)}px`, width: `${lerp(a.width, b.width)}px`, height: `${lerp(a.height, b.height)}px` });
    if (k < 1 && b) requestAnimationFrame(step);
    else { g.remove(); hide.forEach((h) => { h.style.visibility = ''; }); done?.(); }
  };
  requestAnimationFrame(step);
}
/** In the drink sheet: fly the menu photo into `target` (the sheet's big photo). */
export function morphIn(target) {
  const src = fromImg; fromImg = null; openedFrom = src;
  if (!src || !target || calm() || !src.isConnected) return;
  fly(src, () => (target.isConnected ? inner(target) : null), [target, src], 460);
}
/** Closing the drink sheet: fly its photo back to the menu card it came from (if that card is on screen). */
export function morphOut(img) {
  const dst = openedFrom; openedFrom = null;
  if (!dst || !img || calm() || !dst.isConnected) return;
  const b = dst.getBoundingClientRect();
  if (b.bottom < 0 || b.top > window.innerHeight || !b.width) return;
  fly(img, () => (dst.isConnected ? inner(dst) : null), [dst], 380);
}

// ---------- Every button gives a soft squish when pressed ----------
const PRESSABLE = 'button, .sh-btn, a.sh-btn, [role="button"], .shop-link';
/** Buttons shrink a little while pressed and spring back when let go. Call once for the whole site. */
export function usePressSpring() {
  useEffect(() => {
    if (calm() || !Element.prototype.animate) return undefined;
    let held = null;
    const down = (e) => {
      const b = e.target.closest?.(PRESSABLE);
      if (!b || b.disabled || !b.closest('.shop') || b.closest('.sheet-x')) return;
      held?.anim?.cancel();
      held = { b, anim: b.animate([{ scale: '1' }, { scale: b.offsetWidth > 260 ? '.97' : '.94' }], { duration: 110, easing: 'ease-out', fill: 'forwards' }) };
    };
    const up = () => {
      if (!held) return;
      const { b, anim } = held; held = null;
      const from = getComputedStyle(b).scale || '.95';
      anim.cancel();
      b.animate([{ scale: from === 'none' ? '.95' : from }, { scale: '1.03', offset: 0.45 }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.4,1)' });
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { document.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);
}

// ---------- Pull down to refresh (phones), with a spinning matcha whisk ----------
/** Returns { pull, busy }: how far it's pulled (0–1+) and whether it's refreshing. Only when the page is at the top. */
export function usePullRefresh(onRefresh) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const st = useRef({ y0: null, d: 0, busy: false });
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    if (!('ontouchstart' in window)) return undefined;
    const root = document.documentElement, was = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain'; // stop the browser's own pull-to-reload on this page
    const s = st.current, MAX = 90;
    const start = (e) => { s.y0 = window.scrollY <= 0 && !s.busy ? e.touches[0].clientY : null; s.d = 0; };
    const move = (e) => {
      if (s.y0 == null) return;
      const dy = e.touches[0].clientY - s.y0;
      if (dy <= 0 || window.scrollY > 0) { if (s.d) { s.d = 0; setPull(0); } return; }
      s.d = Math.min(MAX * 1.4, dy * 0.5);
      setPull(s.d / MAX);
    };
    const end = async () => {
      if (s.y0 == null) return;
      s.y0 = null;
      if (s.d < MAX * 0.8) { s.d = 0; setPull(0); return; }
      s.busy = true; setBusy(true); setPull(1);
      const t0 = Date.now();
      try { await cb.current?.(); } catch { /* keep the old list */ }
      await new Promise((r) => setTimeout(r, Math.max(0, 700 - (Date.now() - t0)))); // let the whisk spin a moment
      s.busy = false; s.d = 0; setBusy(false); setPull(0);
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      root.style.overscrollBehaviorY = was;
      window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', end);
    };
  }, []);
  return { pull, busy };
}
