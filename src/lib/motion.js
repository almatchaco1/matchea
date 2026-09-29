// POS motion: button ripples and the sliding tab highlight. Respects "reduce motion".
import { useEffect, useLayoutEffect, useState } from 'react';

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

/** A green pill that slides under the selected tab. Put it inside the tablist. */
export function TabInk({ nav, dep }) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return undefined;
    const measure = () => {
      const on = el.querySelector('[aria-selected="true"]');
      if (!on) { setBox(null); el.classList.remove('has-ink'); return; }
      setBox({ left: on.offsetLeft, width: on.offsetWidth });
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
  return <span className="tab-ink" aria-hidden="true" style={box ? { transform: `translateX(${box.left}px)`, width: box.width } : { opacity: 0 }} />;
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
