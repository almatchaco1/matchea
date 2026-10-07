import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { calm } from './fx';
// Hand-drawn style pictures for the customer site: empty states, the loading whisk, and the order cup.

/** A matcha bowl with a bamboo whisk. kind: 'cart' | 'orders' | 'closed' | 'lost' */
export function Doodle({ kind = 'cart', size = 150 }) {
  const closed = kind === 'closed';
  return (
    <svg className={`doodle d-${kind}`} viewBox="0 0 160 140" width={size} height={size * 0.875} aria-hidden="true">
      <ellipse className="d-shadow" cx="80" cy="132" rx="44" ry="5" />
      {!closed && (
        <g className="d-steam">
          <path d="M66 52c-6-7 0-13 0-20s-5-11 0-16" />
          <path d="M80 48c-6-7 0-13 0-20s-5-11 0-16" />
          <path d="M94 52c-6-7 0-13 0-20s-5-11 0-16" />
        </g>
      )}
      {closed && (
        <g className="d-zzz">
          <text x="100" y="40">z</text><text x="112" y="26">z</text><text x="124" y="14">z</text>
        </g>
      )}
      <path className="d-bowl" d="M28 70c2 36 25 54 52 54s50-18 52-54Z" />
      <path className="d-foot" d="M62 123l3 8h30l3-8" />
      <ellipse className="d-tea" cx="80" cy="70" rx="52" ry="9" />
      <path className="d-foam" d="M44 70c8 3 16-3 24 0s16 3 24 0 16-3 24 0" />
      <path className="d-band" d="M36 92c28 8 60 8 88 0" />
      {kind === 'orders' && <g className="d-note"><rect x="10" y="30" width="30" height="38" rx="3" /><path d="M16 40h18M16 48h18M16 56h11" /></g>}
      {kind === 'lost' && <text className="d-q" x="18" y="52">?</text>}
      {!closed && (
        <g className="d-whisk">
          <rect x="113" y="4" width="8" height="30" rx="3" />
          <path d="M113 34l-8 30M115 34l-4 32M117 34v33M119 34l4 32M121 34l8 30" />
        </g>
      )}
    </svg>
  );
}

/** Brand loading screen: a whisk whisking in a bowl. */
export function Loader({ label = 'Whisking…', small }) {
  return (
    <div className={`loader ${small ? 'sm' : ''}`} role="status" aria-live="polite">
      <div className="loader-art">
        <svg className="wk" viewBox="0 0 120 120" width={small ? 80 : 110} height={small ? 80 : 110} aria-hidden="true">
          <defs><linearGradient id="wkGold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2E6424" /><stop offset=".45" stopColor="#9BCB78" /><stop offset="1" stopColor="#2E6424" /></linearGradient></defs>
          <ellipse className="wk-bowl" cx="60" cy="92" rx="44" ry="13" />
          <ellipse className="wk-tea" cx="60" cy="90" rx="36" ry="9" />
          <ellipse className="wk-foam" cx="60" cy="90" rx="24" ry="5.5" />
          <g className="wk-whisk">
            <rect x="54" y="6" width="12" height="40" rx="5" fill="url(#wkGold)" />
            <path d="M53 40h14" stroke="#3F7A2A" strokeWidth="3" strokeLinecap="round" />
            <path className="wk-tines" d="M55 46c-10 10-14 22-12 36M58 46c-5 12-7 24-5 37M60 46v38M62 46c5 12 7 24 5 37M65 46c10 10 14 22 12 36" />
          </g>
          <g className="wk-drops"><circle cx="38" cy="78" r="2" /><circle cx="84" cy="76" r="1.6" /><circle cx="72" cy="70" r="1.3" /></g>
        </svg>
      </div>
      <span>{label}</span>
    </div>
  );
}

const LEVEL = { awaiting_payment: 0.06, new: 0.3, preparing: 0.62, ready: 0.92, paid: 1 };

/** A clear cup that fills with matcha as the order moves along. */
export function TrackCup({ status }) {
  const target = LEVEL[status] ?? 0;
  const [level, setLevel] = useState(0); // fills up from empty when the page opens
  useEffect(() => { const t = setTimeout(() => setLevel(target), 200); return () => clearTimeout(t); }, [target]);
  const top = 22, bottom = 138;
  const y = bottom - (bottom - top) * level;
  return (
    <div className={`tcup s-${status}`} aria-hidden="true">
      <svg viewBox="0 0 120 150">
        <defs>
          <clipPath id="tcupClip"><path d="M20 22h80l-9.5 112a6 6 0 0 1-6 5.5h-49a6 6 0 0 1-6-5.5Z" /></clipPath>
          <linearGradient id="tcupTea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9DB777" /><stop offset=".55" stopColor="#637C41" /><stop offset="1" stopColor="#F5F0E5" /></linearGradient>
        </defs>
        <path className="tc-straw" d="M72 2l-6 40" />
        <g clipPath="url(#tcupClip)">
          <rect x="0" y="0" width="120" height="150" className="tc-glass" />
          <g className="tc-fill" style={{ transform: `translateY(${y}px)` }}>
            <path className="tc-wave" d="M0 6c10-6 20-6 30 0s20 6 30 0 20-6 30 0 20 6 30 0 20-6 30 0 20 6 30 0 20-6 30 0 20 6 30 0V160H0Z" fill="url(#tcupTea)" />
            <g className="tc-bubbles"><circle cx="40" cy="30" r="3" /><circle cx="64" cy="48" r="2" /><circle cx="82" cy="24" r="2.5" /><circle cx="52" cy="70" r="2" /></g>
          </g>
        </g>
        <path className="tc-cup" d="M20 22h80l-9.5 112a6 6 0 0 1-6 5.5h-49a6 6 0 0 1-6-5.5Z" />
        <rect className="tc-lid" x="14" y="14" width="92" height="10" rx="5" />
        <circle className="tc-seal" cx="60" cy="86" r="15" />
        <g className="tc-al"><path d="M60 95c-7.5-1.6-12-7.5-12-15.5 7 1.2 11.4 6.6 12 15.5Z" /><path d="M60 95c.4-9.6 6.2-16 15-18 .2 9.6-6 16.4-15 18Z" /></g>
      </svg>
      {status === 'ready' && <><i className="tc-spark a">✦</i><i className="tc-spark b">✦</i><i className="tc-spark c">✧</i></>}
    </div>
  );
}

// Flavour colour for the bottom layer of the live cup, picked from the drink's name.
const FLAVOURS = [
  [/strawberr/i, '#E24C62'], [/mango/i, '#F2B33A'], [/ube|putobumbong|taro/i, '#7D4CB8'], [/salted caramel/i, '#C98A45'],
  [/caramel/i, '#C07A36'], [/kinako|dango/i, '#C9A06A'], [/cr[eè]me br[uû]l[eé]e/i, '#E4BE74'], [/banana/i, '#EFD36A'],
  [/cinnamon/i, '#B5773F'], [/s.mores|chocolate|choco/i, '#8A5A3B'], [/blueberr/i, '#4E5DB8'], [/coffee|espresso/i, '#6B4630'],
];
const TOPPING = (label) => (/pearl|boba|tapioca|sago/i.test(label) ? 'pearls' : /cream|foam|cheese|cloud/i.test(label) ? 'cream'
  : /jelly/i.test(label) ? 'jelly' : /matcha|shot/i.test(label) ? 'matcha' : 'sprinkles');

/** Illustrated cup that changes as the customer picks: size, sweetness (syrup level) and add-ons. Sloshes on every change. */
export function LiveCup({ name, sweet, sizeAt = 0, sizes = 1, sizeLabel = '', addons = [], pulse = 0 }) {
  const flavour = (FLAVOURS.find(([re]) => re.test(name || '')) || [])[1];
  const pct = sweet === '' || sweet == null ? null : Math.max(0, Math.min(100, parseInt(sweet, 10) || 0));
  const tops = new Set(addons.map((a) => TOPPING(a.label)));
  const extraMatcha = tops.has('matcha');
  const syrup = pct == null ? 0 : 3 + pct * 0.13;
  const flav = flavour ? 22 : 0;
  const matcha = extraMatcha ? 36 : 26;
  const milk = Math.max(8, 86 - syrup - flav - matcha);
  const layers = [['syrup', syrup, null], ['flav', flav, flavour], ['milk', milk, null], ['matcha', matcha, null]];
  let at = 0;
  const scale = sizes > 1 ? 0.9 + (sizeAt / (sizes - 1)) * 0.16 : 1;
  const sweetWord = pct == null ? '' : pct === 0 ? 'No sugar' : `${pct}% sweet`;
  const stage = useRef(null);
  useEffect(() => { // a little slosh when something changes
    if (!pulse || calm() || !stage.current?.animate) return;
    stage.current.animate([{ rotate: '0deg' }, { rotate: '-5deg', offset: 0.25 }, { rotate: '3deg', offset: 0.55 }, { rotate: '-1deg', offset: 0.8 }, { rotate: '0deg' }], { duration: 1200, easing: 'cubic-bezier(.45,0,.25,1)' });
  }, [pulse]);
  const dots = pct == null ? 0 : Math.round(pct / 25);
  return (
    <div className="lc" aria-label={`Your cup: ${[sizeLabel, sweetWord, ...addons.map((a) => a.label)].filter(Boolean).join(', ') || 'as it comes'}`} role="img">
      <span className="lc-title">Your cup</span>
      <div className="lc-stage" ref={stage} style={{ '--s': scale }}>
        <span className="lc-straw" />
        <span className="lc-lid" />
        <div className="lc-cup">
          {layers.map(([k, h, c]) => { const st = { bottom: `${at}%`, height: `${h}%`, ...(c ? { '--fc': c } : {}) }; at += h; return <i key={k} className={`lc-l lc-${k}`} style={st} />; })}
          <i className="lc-wave" style={{ bottom: 'calc(86% - 5px)' }} />
          {tops.has('pearls') && <span className="lc-pearls">{Array.from({ length: 9 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
          {tops.has('jelly') && <span className="lc-jelly">{Array.from({ length: 5 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
          <span className="lc-ice"><b /><b /><b /></span>
          <span className="lc-bubbles" key={`b${pulse}`}><b /><b /><b /><b /></span>
          <span className="lc-shine" />
        </div>
        {tops.has('cream') && <span className="lc-cream" />}
        {extraMatcha && <span className="lc-dust">{Array.from({ length: 10 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
        {tops.has('sprinkles') && <span className="lc-sprinkle">{Array.from({ length: 8 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
        {pct >= 75 && <span className="lc-spark" key={pct}><b /><b /><b /></span>}
        {pct != null && pct > 0 && <span className="lc-drip" key={`d${pct}`} aria-hidden="true"><b /><b /></span>}
      </div>
      {pct != null && <span className="lc-meter" aria-hidden="true">{[1, 2, 3, 4].map((k) => <i key={k} className={k <= dots ? 'on' : ''} style={{ '--k': k }} />)}</span>}
      <span className="lc-cap">{[sizes > 1 ? sizeLabel : '', sweetWord].filter(Boolean).join(' · ') || 'Your cup'}</span>
    </div>
  );
}

/** Big, smooth moment on the drink photo when the customer changes something:
 *  sweetness → a ribbon of honey pours into the cup; size → a measuring guide grows beside the cup;
 *  extra matcha → a whisk swirls and a ribbon of matcha spirals in. A label glides up to say what changed. */
export function HeroFx({ kind, label, level = 50, up = true, matcha = true, spot }) {
  if (calm()) return label ? <div className="hfx calm" style={spot || undefined} aria-hidden="true"><em className="hfx-label">{label}</em></div> : null;
  return (
    <div className={`hfx hfx-${kind}`} style={spot || undefined} aria-hidden="true">
      {kind === 'sweet' && (level === 0
        ? Array.from({ length: 6 }, (_, i) => <b key={i} className="hfx-leaf" style={{ '--a': `${i * 60 - 150}deg`, '--i': i }} />)
        : (<>
          <span className="hfx-stream" style={{ '--w': `${6 + level / 12}px` }}><i /></span>
          <i className="hfx-ring" /><i className="hfx-ring r2" />
          {level >= 75 && [[-1, -0.1], [1.05, 0.2], [-0.75, 0.95], [0.85, 1.1]].map(([dx, dy], i) => <b key={`t${i}`} className="hfx-twinkle" style={{ '--i': i, left: `calc(50% + var(--cupw) * ${dx * 0.62} - 8px)`, top: `calc(var(--top) + var(--cupw) * ${dy * 0.5})` }} />)}
        </>))}
      {kind === 'size' && (<>
        <span className={`hfx-ruler ${up ? 'up' : 'down'}`}><i /><b>{label?.split(' · ')[0]}</b></span>
        <i className="hfx-floor" />
      </>)}
      {kind === 'add' && (<>
        {matcha && <svg className="hfx-whisk" viewBox="0 0 40 80"><path d="M20 2v30" /><path d="M20 32c-12 6-14 30-6 44M20 32c-6 8-7 30-2 44M20 32v44M20 32c6 8 7 30 2 44M20 32c12 6 14 30 6 44" /></svg>}
        <svg className={`hfx-spiral ${matcha ? 'm' : 'g'}`} viewBox="0 0 200 120" preserveAspectRatio="none"><path d="M100 4c40 0 70 14 70 30s-30 30-70 30-58-12-58-24 26-22 58-22 44 9 44 18-18 18-44 18-30-7-30-13 13-11 30-11" /></svg>
        <i className="hfx-puff" />
        {Array.from({ length: 8 }, (_, i) => <b key={i} className={`hfx-mote ${matcha ? 'm' : 'g'}`} style={{ '--i': i, '--x': `${(i - 3.5) * 14}px` }} />)}
      </>)}
      {kind === 'remove' && <i className="hfx-puff" />}
      {label && kind !== 'size' && <em className={`hfx-label k-${kind}`}>{label}</em>}
      {label && kind === 'size' && <em className="hfx-label k-size">{label}</em>}
    </div>
  );
}

/** The drink photo itself fills with colour: honey rising from the bottom (sweetness), or matcha
 *  thickening from the top (extra matcha). A copy of the photo is used as a mask, so only the cup is tinted. */
export function CupTint({ fx, img }) {
  const box = useRef(null);
  useLayoutEffect(() => {
    const el = img.current, t = box.current;
    if (!el || !t) return;
    const cs = getComputedStyle(el);
    Object.assign(t.style, { padding: cs.padding, left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px` });
    const u = `url("${el.currentSrc || el.src}")`;
    t.style.webkitMaskImage = u; t.style.maskImage = u;
  }, [img]);
  if (calm() || !['add', 'remove'].includes(fx.kind)) return null;
  const k = fx.kind === 'add' ? (fx.matcha ? 'matcha' : 'gold') : 'fade';
  return <span ref={box} className={`hfx-tint t-${k}`} style={{ ...fx.spot, '--lv': (fx.level ?? 50) / 100 }} aria-hidden="true"><i /></span>;
}

/** The sweetness you chose, shown as honey sitting in the bottom of the cup photo.
 *  It stays there and glides up or down to the new level (it never starts again from empty). */
export function HoneyLevel({ img, level, spot }) {
  const box = useRef(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = img.current, t = box.current;
      if (!el || !t) return;
      const cs = getComputedStyle(el);
      Object.assign(t.style, { padding: cs.padding, left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px` });
      const u = `url("${el.currentSrc || el.src}")`;
      t.style.webkitMaskImage = u; t.style.maskImage = u;
    };
    fit();
    const el = img.current;
    el?.addEventListener('load', fit);
    window.addEventListener('resize', fit);
    return () => { el?.removeEventListener('load', fit); window.removeEventListener('resize', fit); };
  }, [img, spot]);
  if (level == null || !spot) return null;
  return <span ref={box} className={`hfx-tint honey-level ${level > 0 ? 'on' : ''}`} style={{ ...spot, '--lv': level / 100 }} aria-hidden="true"><i /></span>;
}

/** Profile picture with the first letter underneath, so it never shows as an empty circle if the photo can't load. */
export function Avatar({ me }) {
  const [broken, setBroken] = useState(false);
  const letter = (me.name || '?').trim().slice(0, 1).toUpperCase();
  return (<>
    <span className="av-letter" aria-hidden="true">{letter}</span>
    {me.avatar && !broken && <img src={me.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
  </>);
}
