// POS v10 motion: the sidebar highlight glides between tabs, cards rise in one after another when a tab opens,
// and a soft light follows the mouse over cards. All of it is skipped when "reduce motion" is on.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The cream highlight behind the selected sidebar tab; it stretches toward the new tab, then settles. */
export function SideInk({ nav, dep }) {
  const [box, setBox] = useState(null);
  const ink = useRef(null);
  const prev = useRef(null);
  const [tries, retry] = useState(0);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) { const r = requestAnimationFrame(() => retry((n) => n + 1)); return () => cancelAnimationFrame(r); } // the nav's ref is set right after this first run
    const measure = () => {
      const on = el.querySelector('button.sb-item[aria-selected="true"]');
      if (!on || !on.offsetHeight) { setBox(null); el.classList.remove('has-sink'); return; }
      const a = on.getBoundingClientRect(), b = el.getBoundingClientRect();
      setBox({ top: a.top - b.top + el.scrollTop, left: a.left - b.left, width: a.width, height: a.height, key: on.textContent });
      el.classList.add('has-sink');
    };
    measure();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, [nav, dep, tries]);
  useLayoutEffect(() => {
    const p = prev.current, n = box, el = ink.current;
    prev.current = box;
    if (!p || !n || !el || p.key === n.key || calm() || !el.animate) return;
    const t = Math.min(p.top, n.top), b = Math.max(p.top + p.height, n.top + n.height);
    el.getAnimations?.().forEach((a) => a.cancel());
    el.animate([
      { transform: `translate(${p.left}px,${p.top}px)`, height: `${p.height}px`, easing: 'cubic-bezier(.5,0,.3,1)' },
      { transform: `translate(${n.left}px,${t}px)`, height: `${b - t}px`, offset: 0.45, easing: 'cubic-bezier(.3,1.3,.45,1)' },
      { transform: `translate(${n.left}px,${n.top}px)`, height: `${n.height}px` },
    ], { duration: 520 });
  }, [box]);
  return <span ref={ink} className="sb-ink" aria-hidden="true" style={box ? { transform: `translate(${box.left}px,${box.top}px)`, width: box.width, height: box.height } : { opacity: 0 }} />;
}

// Cards that rise in when a tab opens
const STAGGER = '.hm-kpi, .hm-card, .hm-hero, .prod, .stk-card, .stk-tile, .panel.stat, .staff-card, .kcol, .ticket';
/** When a tab opens, its cards rise in one after another. */
export function useStaggerIn(dep) {
  useLayoutEffect(() => {
    if (calm()) return undefined;
    let t2 = 0;
    const run = () => {
      const pane = document.querySelector('.tabpane');
      if (!pane) return;
      let i = 0;
      pane.querySelectorAll(STAGGER).forEach((n) => {
        if (n.dataset.v10) return;
        n.dataset.v10 = '1';
        const r = n.getBoundingClientRect();
        if (r.top > window.innerHeight + 40) return; // only what you can see
        n.style.setProperty('--i', Math.min(i++, 14));
        n.classList.add('v10-in');
        const done = (e) => { if (e.target !== n) return; n.classList.remove('v10-in'); n.removeEventListener('animationend', done); };
        n.addEventListener('animationend', done);
      });
    };
    run();
    t2 = setTimeout(run, 700); // tabs that load their data a moment later
    return () => clearTimeout(t2);
  }, [dep]);
}

// Cards that get the soft light under the mouse (and drinks on the register that tilt a little)
const SPOT = '.hm-kpi, .hm-card, .hm-task, .prod, .kcard, .ticket, .stk-card, .stk-tile, .panel.stat, .staff-card, .op-sec, .pp-cash, .pp-gcash';
const TILT = '.prod';
export function usePosSpotlight() {
  useEffect(() => {
    if (calm() || !window.matchMedia?.('(hover: hover)').matches) return undefined;
    let cur = null, raf = 0, last = null;
    const paint = () => {
      raf = 0;
      if (!cur || !last) return;
      const r = cur.getBoundingClientRect();
      const x = last.clientX - r.left, y = last.clientY - r.top;
      cur.style.setProperty('--mx', `${x}px`); cur.style.setProperty('--my', `${y}px`);
      if (cur.matches(TILT)) {
        cur.style.setProperty('--ry', `${((x / r.width) - 0.5) * 8}deg`);
        cur.style.setProperty('--rx', `${(0.5 - (y / r.height)) * 7}deg`);
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
      const ok = c && c.closest('.shell');
      if ((ok ? c : null) !== cur) { if (cur) leave(cur); cur = ok ? c : null; if (cur) light(cur); }
      last = e;
      if (cur && !raf) raf = requestAnimationFrame(paint);
    };
    const out = (e) => { if (cur && !cur.contains(e.relatedTarget)) { leave(cur); cur = null; } };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', out, { passive: true });
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerout', out); cancelAnimationFrame(raf); };
  }, []);
}
