// v10 motion layer for the customer site: smooth page changes, light that follows the mouse on cards,
// a gentle 3D tilt on drink cards, and the sliding highlight in the top menu.
// Everything is skipped when "reduce motion" is on.
import { useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { calm } from './fx';

/** Run a page change as a smooth cross-fade (browsers that support it); otherwise just change. */
export function smoothly(update) {
  if (calm() || !document.startViewTransition || document.hidden) { update(); return; }
  try { document.startViewTransition(() => flushSync(update)); } catch { update(); }
}

// Cards that get the soft light under the mouse
const SPOT = '.m7-card, .m7-spot, .m7-mini, .fav-card, .o7-card, .o7-live-card, .ac2-card, .ac2-quick button, .ck7-card, .pay4-opt, .hx-perk, .ld-steps li, .ck7-sum, .track-card, .panel';
// Cards that also tilt a little
const TILT = '.m7-card, .m7-spot';

export function useSpotlight(root) {
  useEffect(() => {
    const el = root.current;
    if (!el || calm() || !window.matchMedia?.('(hover: hover)').matches) return undefined;
    let cur = null, raf = 0, last = null;
    const paint = () => {
      raf = 0;
      if (!cur || !last) return;
      const r = cur.getBoundingClientRect();
      const x = last.clientX - r.left, y = last.clientY - r.top;
      cur.style.setProperty('--mx', `${x}px`); cur.style.setProperty('--my', `${y}px`);
      if (cur.matches(TILT)) {
        cur.style.setProperty('--ry', `${((x / r.width) - 0.5) * 7}deg`);
        cur.style.setProperty('--rx', `${(0.5 - (y / r.height)) * 6}deg`);
      }
    };
    const light = (c) => {
      if (!c.querySelector(':scope > .fx-spot')) {
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
        const i = document.createElement('i'); i.className = 'fx-spot'; i.setAttribute('aria-hidden', 'true'); c.appendChild(i);
      }
      c.classList.add('fx-lit');
    };
    const leave = (c) => { c.classList.remove('fx-lit'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); };
    const move = (e) => {
      if (e.pointerType !== 'mouse') return;
      const c = e.target.closest?.(SPOT);
      if (c !== cur) { if (cur) leave(cur); cur = c; if (c) light(c); }
      last = e;
      if (cur && !raf) raf = requestAnimationFrame(paint);
    };
    const out = (e) => { if (cur && !cur.contains(e.relatedTarget)) { leave(cur); cur = null; } };
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerout', out, { passive: true });
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerout', out); cancelAnimationFrame(raf); };
  }, [root]);
}

/** The highlight behind the current link in the top menu slides from link to link. */
export function useNavInk(nav, key) {
  useLayoutEffect(() => {
    const n = nav.current;
    if (!n) return undefined;
    const place = () => {
      const a = n.querySelector(':scope > a.on');
      if (!a) { n.style.setProperty('--ink-o', 0); return; }
      n.style.setProperty('--ink-x', `${a.offsetLeft}px`); n.style.setProperty('--ink-y', `${a.offsetTop}px`); n.style.setProperty('--ink-w', `${a.offsetWidth}px`); n.style.setProperty('--ink-h', `${a.offsetHeight}px`); n.style.setProperty('--ink-o', 1);
    };
    place();
    window.addEventListener('resize', place);
    document.fonts?.ready?.then(place);
    return () => window.removeEventListener('resize', place);
  }, [nav, key]);
}

/** Greeting that fits the time of day. */
export const greeting = (d = new Date()) => {
  const h = d.getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
