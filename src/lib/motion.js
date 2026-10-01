// POS motion: button ripples, the sliding tab highlight, gliding cards and swipe-to-remove. Respects "reduce motion".
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const RIPPLE = '.btn, .prod, .chip, .pinpad button, .seg button, .quick button, .opt, .tabs button, .rp-tabs button, .t-check';

/** Soft ripple where a button is pressed, for the whole POS. */
export function usePosRipples() {
  useEffect(() => {
    if (calm()) return undefined;
    const down = (e) => {
      const b = e.target.closest?.(RIPPLE);
      if (!b || b.disabled || b.closest('.shop')) return;
      const r = b.getBoundingClientRect();
      const s = Math.max(r.width, r.height) * 1.3;
      const w = document.createElement('span');
      w.className = 'pos-rip';
      Object.assign(w.style, { width: `${s}px`, height: `${s}px`, left: `${e.clientX - r.left - s / 2}px`, top: `${e.clientY - r.top - s / 2}px` });
      b.appendChild(w);
      setTimeout(() => w.remove(), 650);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, []);
}

/** A green pill that slides under the selected tab, stretching like a drop of matcha on the way. Put it inside the tablist. */
export function TabInk({ nav, dep }) {
  const [box, setBox] = useState(null);
  const ink = useRef(null);
  const prev = useRef(null); // { left, width, key } of the last tab it sat under
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return undefined;
    const measure = () => {
      const on = el.querySelector('[aria-selected="true"]');
      if (!on) { setBox(null); el.classList.remove('has-ink'); return; }
      setBox({ left: on.offsetLeft, width: on.offsetWidth, key: on.textContent });
      el.classList.add('has-ink');
    };
    measure();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    [...el.children].forEach((c) => ro?.observe(c));
    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure).catch(() => {});
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [nav, dep]);
  // Moving to another tab: stretch over both tabs, then settle on the new one (resizes just jump)
  useLayoutEffect(() => {
    const p = prev.current, n = box, el = ink.current;
    prev.current = box;
    if (!p || !n || !el || p.key === n.key || calm() || !el.animate) return;
    const l = Math.min(p.left, n.left), r = Math.max(p.left + p.width, n.left + n.width);
    el.getAnimations?.().forEach((a) => a.cancel());
    el.animate([
      { transform: `translateX(${p.left}px)`, width: `${p.width}px`, easing: 'cubic-bezier(.5,0,.3,1)' },
      { transform: `translateX(${l}px)`, width: `${r - l}px`, offset: 0.42, easing: 'cubic-bezier(.3,1.35,.45,1)' }, // stretched over both tabs
      { transform: `translateX(${n.left}px)`, width: `${n.width}px` },
    ], { duration: 560 });
  }, [box]);
  return <span ref={ink} className="tab-ink" aria-hidden="true" style={box ? { transform: `translateX(${box.left}px)`, width: box.width } : { opacity: 0 }} />;
}

/**
 * Cards glide to their new place when the list changes (an order moves column, or one above it is done).
 * Mark each card with data-flip="<id>". Call inside the component that renders them.
 */
export function useFlip(ref) {
  const last = useRef(new Map());
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const b = box.getBoundingClientRect();
    const now = new Map();
    box.querySelectorAll('[data-flip]').forEach((n) => {
      const moving = n.getAnimations?.().find((a) => a.id === 'flip' && a.playState === 'running');
      const r = n.getBoundingClientRect();
      // Mid-glide the card isn't where it will end up: use the place it is gliding to
      const at = moving && n._flipTo ? n._flipTo : { x: r.left - b.left, y: r.top - b.top };
      now.set(n.dataset.flip, { n, ...at, fresh: !moving });
    });
    if (!calm()) now.forEach((v, k) => {
      const p = last.current.get(k);
      if (!p || !v.fresh) return;
      const dx = p.x - v.x, dy = p.y - v.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
      v.n._flipTo = { x: v.x, y: v.y };
      const a = v.n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 520, easing: 'cubic-bezier(.25,.85,.3,1)', composite: 'add' });
      a.id = 'flip';
    });
    last.current = new Map([...now].map(([k, v]) => [k, { x: v.x, y: v.y }]));
  });
}

/** Shrink a card away, then run `then` (removing it from the list). */
export function leave(el, then) {
  if (!el || calm() || !el.animate) { then(); return; }
  el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.9) translateY(-8px)' }],
    { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = then;
}

/** A row you can swipe left to reveal a red Remove button (touch or mouse). Long swipes remove straight away. */
export function SwipeRow({ onRemove, className = '', children, label = 'Remove' }) {
  const row = useRef(null), slide = useRef(null);
  const [open, setOpen] = useState(false);
  const drag = useRef(null);
  const OPEN = 88;
  const collapse = () => {
    const el = row.current;
    if (!el || calm() || !el.animate) { onRemove(); return; }
    const h = el.offsetHeight;
    el.style.overflow = 'hidden';
    slide.current.animate([{ transform: `translateX(${slide.current._x || -OPEN}px)` }, { transform: 'translateX(-105%)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    el.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 240, delay: 120, easing: 'ease-in-out', fill: 'forwards' }).onfinish = onRemove;
  };
  const setX = (x, smooth) => {
    const s = slide.current; if (!s) return;
    s._x = x;
    s.style.transition = smooth ? 'transform .32s cubic-bezier(.3,1.3,.5,1)' : 'none';
    s.style.transform = x ? `translateX(${x}px)` : '';
  };
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!row.current?.contains(e.target)) { setOpen(false); setX(0, true); } };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const down = (e) => {
    if (e.button > 0 || e.target.closest('button,input,select,a')) return;
    drag.current = { x0: e.clientX, y0: e.clientY, base: open ? -OPEN : 0, on: false, id: e.pointerId };
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; } // scrolling the list
      if (Math.abs(dx) < 8) return;
      d.on = true; row.current?.setPointerCapture?.(d.id);
    }
    const x = Math.min(0, d.base + dx);
    setX(x < -OPEN ? -OPEN + (x + OPEN) * 0.5 : x, false); // a little resistance past the button
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d?.on) return;
    const x = slide.current?._x || 0, w = row.current?.offsetWidth || 300;
    if (x < -w * 0.45) { collapse(); return; }
    const o = x < -OPEN / 2;
    setOpen(o); setX(o ? -OPEN : 0, true);
  };
  return (
    <div ref={row} className={`swipe ${open ? 'open' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <button className="swipe-del" tabIndex={open ? 0 : -1} aria-hidden={!open} onClick={collapse}>{label}</button>
      <div ref={slide} className={`swipe-in ${className}`}>{children}</div>
    </div>
  );
}

/**
 * Keeps the POS header on one tidy line whatever the screen, font or account:
 * tries compact levels 0→5 (see styles.css "POS HEADER") and keeps the first one that fits.
 */
export function useHeaderFit(ref, dep) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fits = (level) => {
      const q = (s) => el.querySelector(s);
      const tabs = q(':scope > .tabs'), chip = q(':scope > .userchip'), brand = q(':scope > .brand');
      if (!tabs || !chip || !brand) return true;
      const box = el.getBoundingClientRect(), pad = parseFloat(getComputedStyle(el).paddingRight) || 0;
      const r = (e) => e.getBoundingClientRect();
      if (tabs.scrollWidth > tabs.clientWidth + 1 && level < 5) return false;          // tabs would need scrolling
      const kids = [...chip.children].map(r), c = r(chip);
      if (kids.some((k) => k.right > c.right + 1 || k.left < c.left - 1 || (level < 5 && k.top > kids[0].top + 4))) return false; // name bar buttons don't fit
      if (c.right > box.right - pad + 1 || r(tabs).right > box.right - pad + 1) return false;
      const b = r(brand), t = r(tabs);
      const hit = (a, z) => a.left < z.right - 1 && z.left < a.right - 1 && a.top < z.bottom - 1 && z.top < a.bottom - 1;
      return !(hit(b, t) || hit(b, c) || hit(t, c));
    };
    let busy = false;
    const fit = () => {
      if (busy) return; busy = true;
      let level = 0;
      for (; level < 5; level++) { el.dataset.fit = String(level); if (fits(level)) break; }
      el.dataset.fit = String(level);
      busy = false;
    };
    fit();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => requestAnimationFrame(fit)) : null;
    ro?.observe(el.parentElement || el);
    window.addEventListener('resize', fit);
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, [ref, dep]);
}
