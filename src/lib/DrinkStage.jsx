// The drink on its stage, shared by the customer site and the POS.
// It shows the cup photo with what you picked "inside" it, and plays a short animation when a choice changes:
//   sweetness → a honey dipper drizzles into the cup, drops ripple the surface, the honey settles at the new level
//               (less sweet: the honey sinks and a few bubbles rise; 0%: it drains away)
//   size      → the cup springs bigger or smaller with a squash, a ruler beside it shows the new height
//   extra matcha → a sieve dusts matcha powder in, a bamboo whisk whisks it, the top of the drink turns a deeper green
// The honey and the matcha stay in the cup (they glide to new levels, they never start over).
// Everything is skipped when "reduce motion" is on; the cup still shows the right levels.
import { Suspense, lazy, useEffect, useRef, useState } from 'react';

const Cup3D = lazy(() => import('./Cup3D')); // the 3D cup loads separately, so the page opens fast
const has3D = () => { try { if (localStorage.getItem('matchea.no3d') === '1') return false; } catch { /* ignore */ } try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; } };

const calm = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Where things are inside the square cup box (all cup photos are lined up the same way)
const BASE = 94.5; // cup bottom, % from the top
const FULL = 56;   // height of the drink inside the cup, % of the box

export default function DrinkStage({ image, imgRef, sizeAt = 0, sizeCount = 1, sweet = null, matcha = false, fx = null, onImgError }) {
  const body = useRef(null);
  const ownImg = useRef(null);
  const scale = sizeCount > 1 ? 0.86 + (sizeAt / (sizeCount - 1)) * 0.18 : 1;
  const mask = image ? { WebkitMaskImage: `url("${image}")`, maskImage: `url("${image}")` } : undefined;
  const lv = sweet == null ? 0 : Math.max(0, Math.min(100, sweet)) / 100;

  // Squash and stretch when the size changes
  useEffect(() => {
    if (!fx || fx.kind !== 'size' || calm() || !body.current?.animate) return;
    const up = fx.up;
    body.current.animate(up
      ? [{ transform: 'scale(1,1)' }, { transform: 'scale(1.08,.9)', offset: 0.22 }, { transform: 'scale(.96,1.06)', offset: 0.52 }, { transform: 'scale(1.02,.98)', offset: 0.78 }, { transform: 'scale(1,1)' }]
      : [{ transform: 'scale(1,1)' }, { transform: 'scale(.92,1.07)', offset: 0.25 }, { transform: 'scale(1.05,.95)', offset: 0.55 }, { transform: 'scale(1,1)' }],
    { duration: 820, easing: 'cubic-bezier(.3,.7,.4,1)' });
  }, [fx]);
  // The cup hops a little when an add-on goes in or comes out
  useEffect(() => {
    if (!fx || !['add', 'remove'].includes(fx.kind) || calm() || !body.current?.animate) return;
    body.current.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-2.5deg)', offset: 0.3 }, { transform: 'rotate(1.5deg)', offset: 0.65 }, { transform: 'rotate(0)' }], { duration: 900, delay: fx.matcha && fx.kind === 'add' ? 1300 : 0, easing: 'ease-in-out' });
  }, [fx]);

  // The 3D cup replaces the photo once it is ready (the photo shows meanwhile, and stays if 3D isn't possible)
  const [use3D] = useState(() => has3D());
  const [ready3D, setReady3D] = useState(false);
  useEffect(() => { setReady3D(false); }, [image]);
  const setImg = (el) => { ownImg.current = el; if (imgRef) imgRef.current = el; };
  return (
    <div className={`dfx ${ready3D ? 'is-3d' : ''}`} aria-hidden="true">
      <span className="dfx-halo" />
      <span className="dfx-floor" style={{ '--s': scale }} />
      <div className="dfx-cup" style={{ '--s': scale }}>
        <div className="dfx-body" ref={body}>
          {image && <img ref={setImg} src={image} alt="" onError={onImgError} />}
          {image && use3D && <Suspense fallback={null}><Cup3D image={image} sweet={lv} matcha={matcha} onReady={() => setReady3D(true)} /></Suspense>}
          {image && sweet != null && (
            <span className={`dfx-tint dfx-honey ${lv > 0 ? 'on' : ''}`} style={{ ...mask, '--lv': lv }}><i><b /></i></span>
          )}
          {image && <span className={`dfx-tint dfx-matcha ${matcha ? 'on' : ''}`} style={mask}><i /></span>}
        </div>
        {fx && !calm() && <Effect key={fx.n} fx={fx} lv={lv} />}
      </div>
      {fx?.label && <em key={`l${fx.n}`} className={`dfx-label k-${fx.kind}`}>{fx.label}</em>}
    </div>
  );
}

function Effect({ fx, lv }) {
  const sy = `${BASE - FULL * lv}%`; // where the honey's surface will be
  if (fx.kind === 'sweet') {
    const down = fx.from != null && fx.level < fx.from;
    if (fx.level === 0) {
      return (
        <div className="dfx-fx dfx-none">
          {Array.from({ length: 7 }, (_, i) => <b key={i} className="dfx-bubble" style={{ '--i': i, '--x': `${42 + ((i * 37) % 17)}%` }} />)}
          <svg className="dfx-nosugar" viewBox="0 0 40 40"><rect x="9" y="9" width="22" height="22" rx="4" /><path d="M6 34 34 6" /></svg>
        </div>
      );
    }
    if (down) {
      return (
        <div className="dfx-fx dfx-sink" style={{ '--sy': sy }}>
          {Array.from({ length: 6 }, (_, i) => <b key={i} className="dfx-bubble" style={{ '--i': i, '--x': `${41 + ((i * 29) % 19)}%` }} />)}
        </div>
      );
    }
    const w = 1.2 + (fx.level / 100) * 1.6; // a bigger pour for sweeter
    return (
      <div className="dfx-fx dfx-pour" style={{ '--sy': sy, '--sw': `${w}%` }}>
        <svg className="dfx-dipper" viewBox="0 0 40 100">
          <path className="h" d="M24 0 21 52" />
          <g className="d"><ellipse cx="20" cy="62" rx="10" ry="4.5" /><ellipse cx="20" cy="70" rx="12" ry="5" /><ellipse cx="20" cy="78" rx="12" ry="5" /><ellipse cx="20" cy="86" rx="10" ry="4.5" /><path d="M20 90v10" /></g>
        </svg>
        <span className="dfx-stream" />
        {[0, 1, 2].map((i) => <b key={i} className="dfx-drop" style={{ '--i': i }} />)}
        <i className="dfx-ripple" /><i className="dfx-ripple r2" /><i className="dfx-ripple r3" />
        {fx.level >= 75 && [[-1, 0], [1, -0.4], [-0.6, 0.9], [0.8, 1.1]].map(([dx, dy], i) => <b key={`s${i}`} className="dfx-spark" style={{ '--i': i, left: `${50 + dx * 24}%`, top: `calc(${sy} + ${dy * 8}%)` }} />)}
      </div>
    );
  }
  if (fx.kind === 'size') {
    return (
      <div className={`dfx-fx dfx-size ${fx.up ? 'up' : 'down'}`}>
        <span className="dfx-ruler"><i /></span>
        <i className="dfx-pop" /><i className="dfx-pop p2" />
      </div>
    );
  }
  if (fx.kind === 'add' && fx.matcha) {
    return (
      <div className="dfx-fx dfx-mt">
        <svg className="dfx-sieve" viewBox="0 0 80 40"><path className="rim" d="M8 10h64" /><path className="bowl" d="M12 10a28 22 0 0 0 56 0" /><path className="mesh" d="M18 16h44M24 22h32M31 27h18" /><path className="hd" d="M72 10h8" /></svg>
        {Array.from({ length: 16 }, (_, i) => <b key={i} className="dfx-powder" style={{ '--i': i, '--x': `${40 + ((i * 53) % 21)}%`, '--d': `${(i % 5) * 2}%` }} />)}
        <svg className="dfx-whisk" viewBox="0 0 40 100"><rect x="15" y="0" width="10" height="40" rx="4" /><path d="M15 40c-10 10-12 40-6 56M18 40c-5 12-6 40-3 57M20 40v58M22 40c5 12 6 40 3 57M25 40c10 10 12 40 6 56" /></svg>
        <svg className="dfx-swirl" viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M100 6c44 0 76 10 76 24s-32 24-76 24-62-9-62-19 28-17 62-17 46 7 46 14-20 13-46 13-32-5-32-10 14-8 32-8" /></svg>
      </div>
    );
  }
  if (fx.kind === 'add') {
    return <div className="dfx-fx dfx-add">{Array.from({ length: 8 }, (_, i) => <b key={i} className="dfx-spark" style={{ '--i': i, left: `${36 + ((i * 41) % 29)}%`, top: `${30 + ((i * 23) % 30)}%` }} />)}</div>;
  }
  if (fx.kind === 'remove') return <div className="dfx-fx dfx-rm"><i className="dfx-puff" /></div>;
  return null;
}
