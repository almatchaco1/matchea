import { useEffect, useRef, useState } from 'react';
import { sceneBg } from '../lib/drinkImages';
import { calm } from './fx';
import { greetIcon } from '../lib/decor';
import { peso } from '../lib/format';
import { call } from './api';

const nav = (go, to) => (e) => { e.preventDefault(); go(to); };

export default function Landing({ menu, err, go, me }) {
  const [rating, setRating] = useState(null);
  useEffect(() => { call('GET', '/public/rating').then(setRating).catch(() => {}); }, []);
  const items = menu?.items || [];
  const strip = [...items].sort((a, b) => (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0));
  const start = me ? '/menu' : '/signup';
  const dlv = menu?.shop?.delivery; // set only when the shop has delivery turned on
  const freeFrom = +dlv?.freeDrinks || 0;
  const priceOf = (it) => it.price + (it.hasSizes ? +menu.sizes[0]?.price || 0 : 0);

  return (
    <div className="ld">
      <section className="ld-hero">
        <div className="ld-copy">
          {menu?.shop?.greeting && <p className={`ld-season s-${greetIcon(menu.shop.decor)}`}><i aria-hidden="true" />{menu.shop.greeting}</p>}
          <p className="ld-eyebrow"><span className="ld-leaf" aria-hidden="true" />{menu?.shop?.name || 'Matchéa'} · Order ahead</p>
          <h1><span className="ld-line"><span>Good matcha,</span></span><br /><span className="ld-line"><em>good mood.</em></span></h1>
          <p className="ld-lede">Whisked-to-order matcha lattes, from classic to Putobumbong. {dlv ? 'Order on your phone, then pick it up at the counter or have it delivered to your door by Lalamove.' : 'Order on your phone, pay online or at the counter, and skip the line at pickup.'}</p>
          <div className="ld-ctas">
            <a href={start} className="sh-btn" onClick={nav(go, start)}>{me ? 'Start your order' : 'Create an account'}</a>
            {!me && <a href="/signin" className="sh-btn ghost" onClick={nav(go, '/signin')}>I already have one</a>}
          </div>
          <ul className="ld-perks">
            {dlv
              ? <li><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M9 17h6l-2-7H9M13 10h4l2 4M15 6h3" /></svg><span><b>Pickup or delivery</b>{freeFrom ? `Free delivery from ${freeFrom} drinks` : 'Delivered by Lalamove'}</span></li>
              : <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8Z M9 8a3 3 0 0 1 6 0" /></svg><span><b>Pickup only</b>Skip the line</span></li>}
            <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 5 6.5 5 10a5 5 0 0 1-10 0c0-3.5 2-6 5-10Z" /></svg><span><b>Oatside milk</b>In every latte</span></li>
            <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7Z" /></svg><span><b>10th drink free</b>With your stamp card</span></li>
          </ul>
          {rating?.avg != null && (
            <p className="ld-rating" aria-label={`Rated ${rating.avg} out of 5 by ${rating.count} customers`}>
              <span className="ld-rating-stars" aria-hidden="true"><i style={{ width: `${(rating.avg / 5) * 100}%` }}>★★★★★</i>★★★★★</span>
              <b>{rating.avg.toFixed(1)}</b> from {rating.count.toLocaleString('en-PH')} customer ratings
            </p>
          )}
          {menu && !menu.shop.open && <p className="ld-closed">{menu.shop.message || 'Online ordering is closed right now. You can still browse and sign up.'}</p>}
        </div>
        <Showcase items={items} priceOf={priceOf} start={start} go={go} count={items.length} />
      </section>

      {items.length > 0 && (
        <div className="ld-marquee" aria-hidden="true">
          <div className="ld-track">
            {[0, 1].map((k) => <span key={k}>{items.map((it) => <em key={it._id + k}>{it.name.replace(/ Matcha Latte$/, '')}<i>✦</i></em>)}</span>)}
          </div>
        </div>
      )}

      <section className="ld-steps">
        <p className="ld-kicker" data-reveal><span className="jp" lang="ja">ご注文</span>Easy as 1, 2, 3, 4</p>
        <h2 data-reveal>How ordering works</h2>
        <ol>
          {[['Sign in', 'With your mobile number, Google or Facebook.', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0'],
            ['Pick your drinks', 'Choose size, sweetness and Extra Matcha.', 'M7 8h10l-1.3 11.2a2 2 0 0 1-2 1.8h-3.4a2 2 0 0 1-2-1.8L7 8Zm-1-3h12M12 5V2'],
            ['Pay your way', 'GCash or Maya QR, or pay at the counter.', 'M3 7h18v10H3zM3 11h18M7 15h3'],
            ['Pick up', 'We show you when it’s ready. Just give your order number.', 'M5 12l4 4 10-10']].map(([t, d, icon], i) => (
            <li key={t} data-reveal style={{ '--i': i }}>
              <span className="ld-num">{i + 1}</span>
              <svg className="ld-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
              <div><b>{t}</b><p>{d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="ld-menu">
        <p className="ld-kicker" data-reveal><span className="jp" lang="ja">お品書き</span>Whisked to order</p>
        <div className="ld-menu-h" data-reveal>
          <h2>On the menu</h2>
          <a href={start} onClick={nav(go, start)}>{me ? 'Order now →' : 'Sign up to order →'}</a>
        </div>
        {!menu && !err ? <div className="ld-strip" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="ld-drink skel-card"><div className="skel" style={{ aspectRatio: '1 / 1' }} /><div style={{ padding: '10px 12px 12px' }}><div className="skel skel-line" style={{ width: '70%' }} /><div className="skel skel-line" style={{ width: '45%' }} /></div></div>)}</div> : err && !menu ? <p className="shop-alert">{err}</p> : (
          <div className="ld-strip">
            {strip.map((it, i) => (
              <a key={it._id} href={start} className={`ld-drink ${it.soldOut ? 'off' : ''}`} onClick={nav(go, start)} data-reveal style={{ '--i': Math.min(i, 8) }}>
                <img src={it.image} alt="" loading="lazy" className={sceneBg(it.image) ? 'scene-bg' : undefined} style={sceneBg(it.image)} />
                {it.soldOut ? <i className="ld-best ld-na">{it.notAvailable ? 'Not available' : 'Sold out'}</i> : it.bestSeller && <i className="ld-best hanko"><b lang="ja">人気</b>Best seller</i>}
                <b>{it.name.replace(/ Matcha Latte$/, '')}</b>
                <span>{peso(priceOf(it))}</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="ld-info">
        {[dlv
          ? ['Pickup or delivery', `Collect at the counter, or get it delivered by Lalamove${freeFrom ? `. Free delivery from ${freeFrom} drinks` : ''}.`, 'M6 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 17h6l-2-7H9m4 0h4l2 4M15 6h3']
          : ['Pickup only', 'Order ahead and collect at the counter.', 'M4 9h16l-1 11H5L4 9Zm4 0V7a4 4 0 0 1 8 0v2'],
          ['Oatside oat milk', 'Every latte is made with Oatside.', 'M12 21c-4 0-7-3-7-7 0-5 7-11 7-11s7 6 7 11c0 4-3 7-7 7Z'],
          ['Upsize anytime', `+${peso(menu?.sizes?.[1]?.price || 40).replace('.00', '')} for a bigger cup.`, 'M8 3h8l-1 18H9L8 3Zm-1 4h10'],
          ['Stamp card', 'Buy 9 drinks, get the 10th free.', 'M12 3l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 16.5 6.8 19.3l1-5.9L3.5 9.3l5.9-.9L12 3Z']].map(([t, d, icon], i) => (
          <div key={t} data-reveal style={{ '--i': i }}>
            <svg className="ld-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>
            <b>{t}</b><span>{d}</span>
          </div>
        ))}
      </section>

      <section className="ld-cta" data-reveal>
        <div>
          <p className="ld-script">Good Matcha, Good Mood <span className="jp" lang="ja">いただきます</span></p>
          <h2>Your matcha is one tap away.</h2>
          <p>Order now, skip the line, and collect a stamp with every drink.</p>
        </div>
        <a href={start} className="sh-btn light" onClick={nav(go, start)}>{me ? 'Start your order' : 'Create a free account'}</a>
      </section>
    </div>
  );
}

/** Home hero: drinks stand in a row in front of a matcha arch; the middle one is featured and they take turns. */
function Showcase({ items, priceOf, start, go, count }) {
  const list = items.filter((i) => i.image);
  const n = list.length;
  const first = Math.max(0, list.findIndex((i) => /putobumbong/i.test(i.name)));
  const [cur, setCur] = useState(null);
  const [paused, setPaused] = useState(false);
  const at = cur ?? first;
  useEffect(() => {
    if (n < 2 || paused || calm()) return undefined;
    const t = setTimeout(() => setCur((c) => ((c ?? first) + 1) % n), 4200);
    return () => clearTimeout(t);
  }, [at, n, paused, first]);
  const swipe = useRef(null);
  if (!n) return <div className="ld-show"><div className="ld-stage"><div className="ld-arch"><i /></div><div className="ld-floor" /></div></div>;
  const pos = (i) => { const d = (((i - at) % n) + n) % n; return d === 0 ? 'c' : d === 1 ? 'r' : d === n - 1 ? 'l' : 'h'; };
  const move = (k) => setCur((((at + k) % n) + n) % n);
  const it = list[at];
  const name = it.name.replace(/ Matcha Latte$/, '');
  // Swipe left / right on the cups (phones)
  const down = (e) => { swipe.current = { x: e.clientX, y: e.clientY, t: Date.now() }; };
  const up = (e) => {
    const s0 = swipe.current; swipe.current = null;
    if (!s0) return;
    const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - s0.t < 800) { setPaused(true); move(dx < 0 ? 1 : -1); }
  };
  return (
    <div className="ld-show" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="ld-stage" onPointerDown={down} onPointerUp={up} onPointerCancel={() => { swipe.current = null; }}>
        <div className="ld-arch" aria-hidden="true"><i /></div>
        <span className="ld-kanji" lang="ja" aria-hidden="true">抹茶</span>
        <div className="ld-floor" aria-hidden="true" />
        {list.map((x, i) => {
          const p = pos(i);
          return (
            <button key={x._id} type="button" className={`ld-cup pos-${p}`} tabIndex={-1} aria-hidden="true"
              onClick={() => { if (p === 'l') move(-1); else if (p === 'r') move(1); }}>
              <img src={x.image} alt="" loading={p === 'h' ? 'lazy' : 'eager'} />
            </button>
          );
        })}
        <span className="ld-spark s1" aria-hidden="true">✦</span><span className="ld-spark s2" aria-hidden="true">✦</span><span className="ld-spark s3" aria-hidden="true">✧</span>
        <span className="ld-badge" aria-hidden="true"><b>{count}</b> drinks<br />on the menu</span>
      </div>
      <div className="ld-feat">
        <button type="button" className="ld-nav" onClick={() => move(-1)} aria-label="Previous drink">‹</button>
        <a key={it._id} href={start} className="ld-cap" onClick={(e) => { e.preventDefault(); go(start); }} aria-live="polite">
          <small>{it.bestSeller ? '★ Best seller' : 'Featured'}</small>
          <b>{name}</b>
          <span>{peso(priceOf(it))}</span>
        </a>
        <button type="button" className="ld-nav" onClick={() => move(1)} aria-label="Next drink">›</button>
      </div>
      <div className="ld-dots" aria-hidden="true">{list.map((x, i) => <i key={x._id} className={i === at ? 'on' : ''} />)}</div>
    </div>
  );
}
