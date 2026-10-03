// Decorations picked by the owner (Menu → Shop & options → Decorations), for the website and the POS.
// Colors stay in the Matchéa palette: deep matcha green, gold and cream.
import { DECOR, decorKind } from '../shared/decor.mjs';
import './decor.css';

const rand = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
const PALETTE = ['#EFA2B0', '#8DB255', '#FFF6DF', '#F3C94A', '#2B5A20'];

/** Point on a scalloped string: n dips across the width, each `depth` px deep. Returns { left %, top px, angle deg }. */
function onString(f, n, base, depth) {
  const seg = Math.min(n - 1, Math.floor(f * n)), t = f * n - seg;
  return { left: f * 100, top: base + 4 * depth * t * (1 - t), angle: (1 - 2 * t) * -18 };
}
function stringPath(n, base, depth) {
  let d = `M0 ${base}`;
  for (let k = 0; k < n; k++) { const w = 100 / n, x0 = k * w; d += ` Q ${x0 + w / 2} ${base + 2 * depth} ${x0 + w} ${base}`; }
  return d;
}
const Wire = ({ n, base, depth, h, cls }) => (
  <svg className={`dc-wire ${cls || ''}`} viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ height: h }}><path d={stringPath(n, base, depth)} /></svg>
);

/** The string along the top of a header: lights, banderitas or garland. `wide` for the POS header. */
export function DecorString({ decor, wide }) {
  const id = (decor || []).find((x) => decorKind(x) === 'string');
  if (!id) return null;
  if (id === 'lights') {
    const count = wide ? 30 : 22;
    return (
      <div className="dc-string xlights" aria-hidden="true">
        <svg className="xl-wire" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 2 Q 2.5 7 5 2 T 10 2 T 15 2 T 20 2 T 25 2 T 30 2 T 35 2 T 40 2 T 45 2 T 50 2 T 55 2 T 60 2 T 65 2 T 70 2 T 75 2 T 80 2 T 85 2 T 90 2 T 95 2 T 100 2" /></svg>
        {Array.from({ length: count }, (_, i) => <i key={i} className={`c${i % 4}`} style={{ left: `${(i + 0.5) * (100 / count)}%`, animationDelay: `${(rand(i, 1) * 2.4).toFixed(2)}s` }} />)}
      </div>
    );
  }
  if (id === 'banderitas') {
    const n = wide ? 14 : 9, base = 2, depth = 7;
    const flags = [];
    for (let k = 0; k < n; k++) for (const t of [0.3, 0.7]) flags.push(onString((k + t) / n, n, base, depth));
    return (
      <div className="dc-string dc-flags" aria-hidden="true">
        <Wire n={n} base={base} depth={depth} h={20} />
        {flags.map((p, i) => (
          <i key={i} style={{ left: `${p.left}%`, top: p.top - 1, '--c': PALETTE[i % 5], '--a': `${p.angle * 0.4}deg`, animationDelay: `${(-rand(i, 2) * 3).toFixed(2)}s`, animationDuration: `${(2.6 + rand(i, 3) * 1.6).toFixed(2)}s` }} />
        ))}
      </div>
    );
  }
  // garland
  const n = wide ? 12 : 8, base = 3, depth = 6, per = 6;
  const bits = [];
  for (let j = 0; j < n * per; j++) {
    const p = onString((j + 0.5) / (n * per), n, base, depth);
    bits.push(j % per === 2 ? { ...p, bud: true } : { ...p, up: j % 2 === 0 });
  }
  return (
    <div className="dc-string dc-garland" aria-hidden="true">
      <Wire n={n} base={base} depth={depth} h={20} />
      {bits.map((b, i) => b.bud
        ? <b key={i} style={{ left: `${b.left}%`, top: b.top, animationDelay: `${(-rand(i, 4) * 3).toFixed(2)}s` }} />
        : <i key={i} className={b.up ? 'up' : 'dn'} style={{ left: `${b.left}%`, top: b.top, '--a': `${b.angle + (b.up ? -35 : 35) + (rand(i, 5) - 0.5) * 20}deg`, '--g': rand(i, 6) > 0.5 ? '#8DB255' : '#5E8C3E' }} />)}
    </div>
  );
}

// 5-point star for the parol
const star = (cx, cy, R, r) => Array.from({ length: 10 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 5, m = k % 2 ? r : R;
  return `${(cx + m * Math.cos(a)).toFixed(1)},${(cy + m * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const STAR_OUT = star(30, 30, 23, 9.5), STAR_IN = star(30, 30, 12, 5);

function Parol() {
  return (
    <svg viewBox="0 0 60 92" className="dc-parol">
      <path className="tail t1" d="M22 50 C 18 62, 26 72, 18 90" />
      <path className="tail t2" d="M38 50 C 42 62, 34 72, 42 90" />
      <path className="tail t3" d="M30 54 C 30 66, 28 76, 31 88" />
      <circle cx="30" cy="30" r="26" className="ring" />
      <polygon points={STAR_OUT} className="out" />
      <polygon points={STAR_IN} className="in" />
      <circle cx="30" cy="30" r="3.2" className="dot" />
    </svg>
  );
}
function Lantern({ c = 0 }) {
  return (
    <svg viewBox="0 0 40 66" className={`dc-lantern l${c}`}>
      <rect x="12" y="1" width="16" height="6" rx="2" className="cap" />
      <ellipse cx="20" cy="29" rx="17" ry="22" className="body" />
      <ellipse cx="20" cy="29" rx="9" ry="16" className="glow" />
      {[14, 21, 29, 37, 44].map((y) => <path key={y} className="rib" d={`M${20 - Math.sqrt(Math.max(0, 1 - ((y - 29) / 22) ** 2)) * 17} ${y} Q 20 ${y + 2.4} ${20 + Math.sqrt(Math.max(0, 1 - ((y - 29) / 22) ** 2)) * 17} ${y}`} />)}
      <rect x="12" y="49" width="16" height="6" rx="2" className="cap" />
      <path className="tassel" d="M20 55 V 64 M17 58 L 20 65 L 23 58" />
    </svg>
  );
}

/** Parol stars / paper lanterns hanging from the bottom corners of the website header. */
export function DecorHang({ decor }) {
  const on = (decor || []).filter((x) => decorKind(x) === 'hang');
  if (!on.length) return null;
  const items = [];
  // Left and right corners; with both picked, parols go outside and lanterns inside
  on.forEach((id, k) => {
    for (const side of ['l', 'r']) {
      const pos = on.length === 2 ? (k === 0 ? 0 : 1) : 0;
      items.push({ id, side, pos, len: id === 'parol' ? 14 + pos * 10 : 8 + (1 - pos) * 12 + (side === 'r' ? 6 : 0) });
      if (on.length === 1) items.push({ id, side, pos: 1, len: id === 'parol' ? 30 : 26, small: true, wideOnly: true });
    }
  });
  return (
    <div className="dc-hang" aria-hidden="true">
      {items.map((it, i) => (
        <span key={i} className={`dc-pend ${it.side} p${it.pos} ${it.small ? 'small' : ''} ${it.wideOnly ? 'wide-only' : ''}`} style={{ '--len': `${it.len}px`, animationDelay: `${(-rand(i, 7) * 4).toFixed(2)}s`, animationDuration: `${(4.2 + rand(i, 8) * 1.8).toFixed(2)}s` }}>
          {it.id === 'parol' ? <Parol /> : <Lantern c={i % 2} />}
        </span>
      ))}
    </div>
  );
}

// Background effects: how many of each, and how each one is drawn
const BG = {
  snow: { n: 24, move: 'fall', t: [9, 18] },
  sakura: { n: 16, move: 'sway', t: [10, 18] },
  hearts: { n: 12, move: 'sway', t: [11, 19] },
  tealeaves: { n: 12, move: 'sway', t: [11, 19] },
  autumn: { n: 12, move: 'sway', t: [10, 17] },
  rain: { n: 30, move: 'rain', t: [1.3, 2.4] },
  confetti: { n: 26, move: 'flip', t: [7, 13] },
  balloons: { n: 7, move: 'rise', t: [16, 26] },
  bubbles: { n: 14, move: 'bubble', t: [9, 16] },
  sparkles: { n: 16, move: 'twinkle', t: [2.4, 4.6] },
  fireflies: { n: 14, move: 'wander', t: [7, 12] },
  fireworks: { n: 4, move: 'burst', t: [3.6, 5.2] },
};
const BALLOON = ['#EFA2B0', '#8DB255', '#F3C94A', '#F7C6D0', '#B9DB8F'];
const AUTUMN = ['#D99A3B', '#C9772E', '#E3B04B', '#B5652C'];

function Particles({ id, n, box }) {
  const c = BG[id];
  return (
    <div className={`dc-fx fx-${id} m-${c.move}`}>
      {Array.from({ length: n }, (_, i) => {
        const dur = c.t[0] + rand(i, 4) * (c.t[1] - c.t[0]);
        const style = {
          '--x': `${(rand(i, 2) * 100).toFixed(1)}%`,
          '--y': `${(8 + rand(i, 9) * 78).toFixed(1)}%`,
          '--s': (0.6 + rand(i, 5) * 0.8).toFixed(2),
          '--dx': `${Math.round((rand(i, 6) - 0.5) * (box ? 40 : 140))}px`,
          '--r': `${Math.round(rand(i, 10) * 360)}deg`,
          '--c': id === 'balloons' ? BALLOON[i % 5] : id === 'autumn' ? AUTUMN[i % 4] : PALETTE[i % 4],
          animationDuration: `${dur.toFixed(2)}s`,
          animationDelay: `${(-rand(i, 3) * dur).toFixed(2)}s`,
        };
        if (id === 'fireworks') {
          return (
            <i key={i} style={style}>
              {Array.from({ length: 12 }, (_, k) => <b key={k} style={{ '--k': `${k * 30}deg`, '--c': PALETTE[(i + k) % 4], animationDuration: style.animationDuration, animationDelay: style.animationDelay }} />)}
            </i>
          );
        }
        return <i key={i} style={style} />;
      })}
    </div>
  );
}

/** Effects floating in the website background (or inside a small preview `box`). */
export function DecorBg({ decor, box }) {
  const on = (decor || []).filter((x) => decorKind(x) === 'bg');
  if (!on.length) return null;
  const share = 1 / Math.sqrt(on.length); // fewer of each when several are on, so it never gets busy
  return (
    <div className={`dc-bg ${box ? 'boxed' : ''}`} aria-hidden="true">
      {on.map((id) => <Particles key={id} id={id} box={box} n={Math.max(box ? (id === 'fireworks' || id === 'balloons' ? 4 : 3) : 4, Math.round(BG[id].n * share * (box ? 0.55 : 1)))} />)}
    </div>
  );
}

/** Small icon for the home-page greeting, matching what is on. */
export function greetIcon(decor = []) {
  const first = decor.find((x) => x !== 'lights' && x !== 'garland' && x !== 'banderitas') || decor[0];
  if (['parol', 'snow', 'lights', 'sparkles', 'fireworks', 'fireflies'].includes(first)) return 'star';
  if (['hearts', 'sakura', 'balloons', 'lanterns'].includes(first)) return 'heart';
  return 'leaf';
}

export { DECOR };
