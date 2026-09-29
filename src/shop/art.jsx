import { useEffect, useState } from 'react';
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
      <div className="loader-art"><Doodle kind="cart" size={small ? 90 : 120} /></div>
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
          <linearGradient id="tcupTea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9CC46A" /><stop offset=".55" stopColor="#6E9E3E" /><stop offset="1" stopColor="#F6E9EC" /></linearGradient>
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
        <text className="tc-al" x="60" y="92">AL</text>
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

/** Illustrated cup that changes as the customer picks: size, sweetness (syrup level) and add-ons. */
export function LiveCup({ name, sweet, sizeAt = 0, sizes = 1, addons = [] }) {
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
  return (
    <div className="lc" aria-label={`Your cup: ${[sweetWord, ...addons.map((a) => a.label)].filter(Boolean).join(', ') || 'as it comes'}`} role="img">
      <div className="lc-stage" style={{ '--s': scale }}>
        <span className="lc-straw" />
        <span className="lc-lid" />
        <div className="lc-cup">
          {layers.map(([k, h, c]) => { const st = { bottom: `${at}%`, height: `${h}%`, ...(c ? { '--fc': c } : {}) }; at += h; return <i key={k} className={`lc-l lc-${k}`} style={st} />; })}
          {tops.has('pearls') && <span className="lc-pearls">{Array.from({ length: 9 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
          {tops.has('jelly') && <span className="lc-jelly">{Array.from({ length: 5 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
          <span className="lc-ice"><b /><b /><b /></span>
          <span className="lc-shine" />
        </div>
        {tops.has('cream') && <span className="lc-cream" />}
        {extraMatcha && <span className="lc-dust">{Array.from({ length: 10 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
        {tops.has('sprinkles') && <span className="lc-sprinkle">{Array.from({ length: 8 }, (_, i) => <b key={i} style={{ '--i': i }} />)}</span>}
        {pct >= 75 && <span className="lc-spark" key={pct}><b /><b /><b /></span>}
      </div>
      <span className="lc-cap">{sweetWord || 'Your cup'}</span>
    </div>
  );
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
