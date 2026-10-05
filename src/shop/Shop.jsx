// Customer site: landing → sign up / sign in → menu → cart → order tracking.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, getToken, setToken, onUnauthorized } from './api';
import { priceLine } from '../shared/pricing.mjs';
import { peso } from '../lib/format';
import Landing from './Landing';
import { AuthPage, AddPhone, ForgotPage } from './Auth';
import MenuPage, { ItemSheet } from './MenuPage';
import CartPage from './CartPage';
import Track from './Track';
import { AccountPage, OrdersPage } from './Account';
import { alertReady } from './ReadyAlerts';
import { flyToCart, bumpCart } from './motion';
import { useReveal, useRipples, useScrolled, RollNum, usePressSpring } from './fx';
import { Loader, Avatar } from './art';
import { Privacy, Terms } from './Legal';
import { DecorString, DecorHang, DecorBg } from '../lib/decor';
import './shop.css';
import './matchea.css';
import './v3.css';

const PROTECTED = /^\/(menu|cart|account|orders|welcome)(\/|$)/;
const CART = 'alm.cart';
const loadCart = () => { try { return JSON.parse(sessionStorage.getItem(CART) || '[]'); } catch { return []; } };

export default function Shop() {
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  const [menu, setMenu] = useState(null);
  const [menuErr, setMenuErr] = useState('');
  const [me, setMe] = useState(null);          // signed-in customer
  const [payFirst, setPayFirst] = useState(false); // true after 2 recent no-shows: must pay before ordering
  const [checking, setChecking] = useState(!!getToken());
  const [cart, setCart] = useState(loadCart);
  const [picking, setPicking] = useState(null); // { item, index? }
  const [orders, setOrders] = useState([]);

  const go = useCallback((to, { replace = false } = {}) => {
    if (to !== window.location.pathname + window.location.search) window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setPath(to); window.scrollTo(0, 0);
  }, []);
  useEffect(() => { const f = () => setPath(window.location.pathname + window.location.search); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);

  const signOut = useCallback(() => { setToken(null); setMe(null); setOrders([]); setCart([]); go('/'); }, [go]);
  useEffect(() => onUnauthorized(() => { setToken(null); setMe(null); }), []);

  // Who's signed in
  useEffect(() => {
    if (!getToken()) return;
    call('GET', '/customer/me').then((r) => { setMe(r.customer); setPayFirst(!!r.payFirst); }).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);
  const loadOrders = useCallback(() => call('GET', '/customer/orders').then(setOrders).catch(() => {}), []);
  const refreshMe = useCallback(() => call('GET', '/customer/me').then((r) => { setMe(r.customer); setPayFirst(!!r.payFirst); }).catch(() => {}), []);
  const signedIn = !!me;
  const hasActive = orders.some((o) => ['awaiting_payment', 'new', 'preparing', 'ready'].includes(o.status));
  // Check more often while an order is on its way
  useEffect(() => { if (signedIn) { loadOrders(); const t = setInterval(loadOrders, hasActive ? 10000 : 30000); return () => clearInterval(t); } }, [signedIn, hasActive, loadOrders]);
  // Order just became ready → chime + notification; just picked up → refresh stamps
  const seen = useRef(null);
  const [readyBanner, setReadyBanner] = useState(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = Object.fromEntries(orders.map((o) => [o.code, o.status]));
    if (!prev) return;
    const nowReady = orders.find((o) => o.status === 'ready' && prev[o.code] && prev[o.code] !== 'ready');
    if (nowReady) { alertReady(nowReady, menu?.shop?.name, () => go('/order/' + nowReady.code)); setReadyBanner(nowReady); }
    if (orders.some((o) => ['paid', 'cancelled'].includes(o.status) && prev[o.code] && prev[o.code] !== o.status)) refreshMe();
  }, [orders]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMenu = useCallback(() => call('GET', '/public/menu').then((m) => { setMenu(m); setMenuErr(''); }).catch((e) => setMenuErr(e.message)), []);
  // Keep the menu fresh: every 15 s, and right away when the customer comes back to the tab
  useEffect(() => {
    loadMenu();
    const t = setInterval(() => { if (!document.hidden) loadMenu(); }, 15000);
    const onShow = () => { if (!document.hidden) loadMenu(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onShow); };
  }, [loadMenu]);
  useEffect(() => { try { sessionStorage.setItem(CART, JSON.stringify(cart)); } catch {} }, [cart]);
  useEffect(() => { if (menu?.shop?.name) document.title = `${menu.shop.name} · Order ahead`; }, [menu]);

  const pathname = path.split('?')[0];
  const rootRef = useRef(null);
  useReveal(rootRef, pathname + (menu ? 1 : 0) + (me ? 1 : 0));
  useRipples(rootRef);
  usePressSpring(); // buttons squish when pressed
  // Sign-in required for the menu, cart and account
  useEffect(() => {
    if (checking) return;
    if (!me && PROTECTED.test(pathname)) go(`/signin?next=${encodeURIComponent(pathname)}`, { replace: true });
    else if (me && !me.phone && PROTECTED.test(pathname) && pathname !== '/welcome') go(`/welcome?next=${encodeURIComponent(pathname)}`, { replace: true });
    else if (me && /^\/(signin|signup)$/.test(pathname)) go('/menu', { replace: true });
  }, [checking, me, pathname, go]);

  const onSignedIn = (r) => {
    setToken(r.token); setMe(r.customer); setPayFirst(!!r.payFirst);
    const next = new URLSearchParams(window.location.search).get('next');
    const safe = next && /^\/[a-z/]*$/i.test(next) ? next : '/menu';
    go(r.needsPhone ? `/welcome?next=${encodeURIComponent(safe)}` : safe, { replace: true }); // Google / Facebook: add a mobile number next
  };

  const byId = useMemo(() => Object.fromEntries((menu?.items || []).map((i) => [i._id, i])), [menu]);
  const priced = useMemo(() => cart.map((l) => {
    const it = byId[l.productId];
    if (!it || !menu) return { ...l, missing: true, total: 0, mods: '' };
    return { ...l, ...priceLine(l, { ...it, milkQty: 0 }, { sizes: menu.sizes, milks: [], addons: menu.addons }), name: it.name, image: it.image, soldOut: it.soldOut, notAvailable: it.notAvailable };
  }), [cart, byId, menu]);
  const count = priced.reduce((a, l) => a + (l.missing ? 0 : l.qty), 0);
  const total = priced.reduce((a, l) => a + l.total, 0);
  const active = orders.filter((o) => ['awaiting_payment', 'new', 'preparing', 'ready'].includes(o.status));

  if (checking) return <div className="shop"><div className="shop-loading"><Loader /></div></div>;

  const decor = menu?.shop?.decor || [];
  const track = pathname.match(/^\/order\/([\w-]{8,20})$/);
  let page;
  if (pathname === '/forgot') page = <ForgotPage go={go} onSignedIn={onSignedIn} />;
  else if (pathname === '/signin' || pathname === '/signup') page = <AuthPage mode={pathname.slice(1)} go={go} onSignedIn={onSignedIn} shop={menu?.shop} />;
  else if (track) page = <Track code={track[1]} go={go} onChange={loadOrders} signedIn={!!me} menu={menu} who={me?.name} mine={orders.find((o) => o.code === track[1])}
    onReorder={menu ? (lines) => {
      // Put the same drinks back in the cart (skipping anything no longer on the menu or sold out)
      const again = lines.filter((l) => byId[l.productId] && !byId[l.productId].soldOut).map((l) => {
        const it = byId[l.productId];
        return { productId: it._id, qty: l.qty, note: l.note || '',
          sizeId: menu.sizes.some((s) => String(s._id) === String(l.sizeId)) ? l.sizeId : menu.sizes[0]?._id || null,
          sweet: it.sweet ? (menu.sweetness.includes(l.sweet) ? l.sweet : menu.sweetness[Math.min(2, menu.sweetness.length - 1)] || '') : '',
          addonIds: (l.addonIds || []).filter((a) => it.addons.includes(a)) };
      });
      if (again.length) { setCart((c) => [...c, ...again]); bumpCart(); go('/cart'); }
      return again.length;
    } : null} />;
  else if (pathname === '/privacy') page = <Privacy shop={menu?.shop} />;
  else if (pathname === '/terms') page = <Terms shop={menu?.shop} />;
  else if (!me) page = <Landing menu={menu} err={menuErr} go={go} />;
  else if (pathname === '/welcome') page = <AddPhone me={me} setMe={setMe} go={go} />;
  else if (pathname === '/menu') page = <MenuPage menu={menu} err={menuErr} reload={loadMenu} me={me} active={active} go={go} onPick={(item) => setPicking({ item })}
    onQuickAdd={(line, img) => { flyToCart(img); setCart((c) => [...c, { ...line, qty: 1 }]); }}
    onRemoveFav={async (id) => { const r = await call('DELETE', `/customer/favorites/${id}`); setMe(r.customer); }} />;
  else if (pathname === '/cart') page = <CartPage menu={menu} me={me} payFirst={payFirst} cart={cart} setCart={setCart} priced={priced} total={total} go={go} onEdit={(i) => setPicking({ item: byId[cart[i].productId], index: i })} onPlaced={() => { loadOrders(); refreshMe(); }} />;
  else if (pathname === '/orders') page = <OrdersPage orders={orders} go={go} reload={loadOrders} />;
  else if (pathname === '/account') page = <AccountPage me={me} setMe={setMe} go={go} signOut={signOut} />;
  else page = <Landing menu={menu} err={menuErr} go={go} me={me} />;

  const showCartBar = me && count > 0 && pathname === '/menu';
  const tabbar = !!me && !['/signin', '/signup', '/welcome', '/forgot'].includes(pathname);
  return (
    <div className={`shop ${tabbar ? 'has-tabbar' : ''}`} ref={rootRef}>
      <div className="shop-bg" aria-hidden="true"><i /><i /><i /></div>
      <DecorBg decor={decor} />
      <Header me={me} go={go} path={pathname} count={count} shop={menu?.shop} activeCount={active.length} decor={decor} />
      {readyBanner && (
        <div className="ready-banner" role="alert">
          <span><b>Order #{String(readyBanner.no).padStart(3, '0')} {readyBanner.fulfil === 'delivery' ? 'is on the way!' : 'is ready!'}</b> {readyBanner.fulfil === 'delivery' ? 'Your Lalamove rider has your drinks.' : readyBanner.pickupCode ? <>Tell your pickup code <b className="num">{readyBanner.pickupCode}</b> at the counter.</> : 'Come to the counter and show your order number.'}</span>
          <span>
            <button className="sh-btn sm" onClick={() => { go('/order/' + readyBanner.code); setReadyBanner(null); }}>View</button>
            <button className="ready-x" onClick={() => setReadyBanner(null)} aria-label="Dismiss">×</button>
          </span>
        </div>
      )}
      <main className="shop-main"><div className="page" key={pathname}>{page}</div></main>
      {showCartBar && (
        <div className="shop-bar">
          <button onClick={() => go('/cart')}><span className="shop-count">{count}</span> View cart <b className="num"><RollNum value={total} format={peso} /></b></button>
        </div>
      )}
      {picking && menu && (
        <ItemSheet item={menu.items.find((i) => i._id === picking.item._id) || picking.item} menu={menu} who={me?.name} initial={picking.index != null ? cart[picking.index] : null}
          onFavorite={me ? async (line) => { const r = await call('POST', '/customer/favorites', { productId: line.productId, sizeId: line.sizeId, addonIds: line.addonIds, sweet: line.sweet, note: line.note }); setMe(r.customer); } : null}
          onClose={() => setPicking(null)}
          onSave={(line) => {
            if (picking.index != null) setCart(cart.map((l, i) => (i === picking.index ? line : l)));
            else { flyToCart(document.querySelector('.sheet-hero img')); setCart([...cart, line]); }
            setPicking(null);
          }} />
      )}
      <Footer shop={menu?.shop} />
      {tabbar && <TabBar path={pathname} go={go} count={count} activeCount={active.length} me={me} />}
    </div>
  );
}

const TABS = [
  ['/', 'Home', 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1Z'],
  ['/menu', 'Menu', 'M7 8h10l-1.3 11.2a2 2 0 0 1-2 1.8h-3.4a2 2 0 0 1-2-1.8L7 8Zm-1-3h12M12 5V2'],
  ['/orders', 'Orders', 'M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Zm2 5h6M9 12h6'],
  ['/cart', 'Cart', 'M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Zm3 0a3 3 0 0 1 6 0'],
  ['/account', 'Me', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0'],
];

/** Phones: app-style tabs along the bottom. */
function TabBar({ path, go, count, activeCount, me }) {
  const at = TABS.findIndex(([to]) => (to === '/' ? path === '/' : path.startsWith(to) || (to === '/orders' && path.startsWith('/order/'))));
  return (
    <nav className="tabbar" aria-label="Main">
      <span className="tb-ink" style={{ '--at': at, opacity: at < 0 ? 0 : 1 }} aria-hidden="true" />
      {TABS.map(([to, label, icon], i) => (
        <a key={to} href={to} className={`tb-item ${i === at ? 'on' : ''}`} aria-current={i === at ? 'page' : undefined} data-cart={to === '/cart' ? '' : undefined}
          onClick={(e) => { e.preventDefault(); go(to); }}>
          <span className="tb-ico">
            {to === '/account' && me.avatar ? <img src={me.avatar} alt="" referrerPolicy="no-referrer" />
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>}
            {to === '/cart' && count > 0 && <em key={count}>{count}</em>}
            {to === '/orders' && activeCount > 0 && <em className="live">{activeCount}</em>}
          </span>
          <span className="tb-l">{label}</span>
        </a>
      ))}
    </nav>
  );
}

// Shop devices only: a staff member is signed in to the POS in this browser
const toPos = () => window.location.assign('/pos');

function Header({ me, go, path, count, shop, activeCount, decor }) {
  // Hidden way in for staff: tap the logo 5 times quickly
  const taps = useRef([]);
  const brandClick = (e) => {
    e.preventDefault();
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 5) { taps.current = []; toPos(); return; }
    go('/');
  };
  const link = (to, label) => (
    <a href={to} className={path === to ? 'on' : ''} onClick={(e) => { e.preventDefault(); go(to); }}>{label}</a>
  );
  const scrolled = useScrolled();
  return (
    <header className={`sh-head ${scrolled ? 'scrolled' : ''}`}>
      <DecorString decor={decor} />
      <DecorHang decor={decor} />
      <a href="/" className="sh-brand" onClick={brandClick}>
        <img className="sh-logo sh-word" src="/brand/matchea-word-sm.webp" alt={shop?.name || 'Matchéa'} width="420" height="128" />
      </a>
      {me ? (
        <nav className="sh-nav">
          {link('/menu', 'Menu')}
          {link('/orders', <>Orders{activeCount > 0 && <i className="sh-dot">{activeCount}</i>}</>)}
          <button className="sh-cart" data-cart="" onClick={() => go('/cart')} aria-label={`Cart, ${count} items`}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 7h12l-1.2 12.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 7a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            {count > 0 && <span>{count}</span>}
          </button>
          <button className="sh-avatar" onClick={() => go('/account')} aria-label="My account" title={me.name}>
            <Avatar me={me} />
          </button>
        </nav>
      ) : (
        <nav className="sh-nav">
          {path !== '/signin' && <a href="/signin" className="sh-signin" onClick={(e) => { e.preventDefault(); go('/signin'); }}>Sign in</a>}
          {path !== '/signup' && <a href="/signup" className="sh-btn sm" onClick={(e) => { e.preventDefault(); go('/signup'); }}>Sign up</a>}
        </nav>
      )}
    </header>
  );
}

function Footer({ shop }) {
  const s = shop || {};
  const tel = (s.phone || '').replace(/[^\d+]/g, '');
  const socials = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']].filter(([k]) => s[k]);
  const hours = (s.hours || '').split('\n').filter(Boolean);
  return (
    <footer className="sh-foot">
      <svg className="sf-wave" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true"><path d="M0 34c120-22 240-30 360-18s240 40 360 38 240-34 360-40 240 14 360 22v24H0Z" /></svg>
      <div className="sf-brand">
        <img className="sh-foot-logo" src="/brand/matchea-word-sm.webp" alt="" width="420" height="128" />
        <div>
          <b>{s.name || 'Matchéa'}</b>
          <span className="sh-script">Good Matcha, Good Mood</span>
        </div>
      </div>
      <div className="sf-col">
        <h4>Visit</h4>
        {s.address ? <p>{s.address}</p> : <p>Location coming soon</p>}
        <p className="sf-dim">{s.delivery ? 'Pickup & delivery' : 'Pickup only'} · Order ahead online</p>
      </div>
      {hours.length > 0 && (
        <div className="sf-col">
          <h4>Hours</h4>
          {hours.map((h, k) => <p key={k}>{h}</p>)}
        </div>
      )}
      {(s.phone || s.email || socials.length > 0) && (
        <div className="sf-col">
          <h4>Contact</h4>
          {s.phone && <p><a href={`tel:${tel}`}>{s.phone}</a></p>}
          {s.email && <p><a href={`mailto:${s.email}`}>{s.email}</a></p>}
          {socials.length > 0 && (
            <div className="sf-social">
              {socials.map(([k, label]) => <a key={k} href={s[k]} target="_blank" rel="noopener noreferrer">{label}</a>)}
            </div>
          )}
        </div>
      )}
      <p className="sf-copy">© {new Date().getFullYear()} {s.name || 'Matchéa'} · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a></p>
    </footer>
  );
}
