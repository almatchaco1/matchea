import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './lib/api';
import { useOffline, syncOutbox, saveCache, loadCache, saveMe, loadMe, ping, removeSale, retrySale } from './lib/offline';
import { isOnline, setOnline as setNetOnline } from './lib/net';
import { ingStatus, needsRestock, peso, pad } from './lib/format';
import Login from './components/Login';
import Register from './components/Register';
import Inventory from './components/Inventory';
import Menu from './components/Menu';
import Reports from './components/Reports';
import Online from './components/Online';
import Staff from './components/Staff';
import Customers from './components/Customers';
import Barista from './components/Barista';
import Inbox from './components/Inbox';
import Home from './components/Home';
import Modal, { ConfirmButton } from './components/Modal';
import PrinterSettings from './components/PrinterSettings';
import { loadPrinterSettings, reconnect } from './lib/printer';
import { usePosRipples } from './lib/motion';
import { DecorString } from './lib/decor';
import { LockIcon } from './components/Locked';
import './styles.css';
import './matchea-pos.css';
import './pos-v3.css';
import './order-v4.css';
import './register-pay.css';
import './pos-v6.css';
import './shell.css';

// Sidebar: [key, label, icon, admins only]
const NAV = [
  ['Sell', [['home', 'Today', 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9Z'], ['register', 'Register', 'M4 7h16v12H4zM8 3h8v4H8zM8 11h2M12 11h2M16 11h0M8 15h2M12 15h2'],
    ['online', 'Online orders', 'M3 7h18l-2 12H5L3 7Zm5 0 2-4m6 4-2-4M9 12v3m6-3v3'], ['messages', 'Messages', 'M12 21a9 9 0 1 0-8-4.9L3 21l4.9-1A9 9 0 0 0 12 21Z'],
    ['barista', 'Barista', 'M6 8h12l-1.3 11.2A2 2 0 0 1 14.7 21H9.3a2 2 0 0 1-2-1.8L6 8Zm-1 0h14M9 8l1-4h4l1 4']]],
  ['Manage', [['inventory', 'Inventory', 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8'], ['menu', 'Menu', 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Zm4 5h6M9 13h6'],
    ['reports', 'Reports', 'M4 20V10M10 20V4M16 20v-7M22 20H2'], ['customers', 'Customers', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3', true],
    ['staff', 'Staff', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0M19 8l1.5 1.5L23 7', true]]],
];
const TABS = NAV.flatMap(([, items]) => items);
const TITLE = Object.fromEntries(TABS.map(([k, n]) => [k, n]));
// Short two-note chime for new online orders (browsers may block sound until the page was clicked once)
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    });
  } catch {}
}
const TRAIN_TABS = ['register', 'barista']; // the only tabs open while training
const IDLE_MIN = 30; // minutes with no activity before the POS signs out by itself
const savedTab = () => { try { return localStorage.getItem('matchaPos.tab') || 'home'; } catch { return 'register'; } };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [tab, setTab] = useState(savedTab);
  const [data, setData] = useState({ settings: null, ingredients: [], products: [], loaded: false });
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  // The cart lives here so switching tabs never loses an order in progress
  const [cart, setCart] = useState([]);
  const [weakPin, setWeakPin] = useState(false);
  const [signedOutMsg, setSignedOutMsg] = useState('');
  const [openRestock, setOpenRestock] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  // Training mode (this device only): practice orders that never reach sales, stock or reports
  const [training, setTrainingState] = useState(() => { try { return sessionStorage.getItem('matchaPos.training') === '1'; } catch { return false; } });
  const [trainTickets, setTrainTickets] = useState([]);
  const trainNo = useRef(0);
  const setTraining = (on) => {
    setTrainingState(on); setCart([]); setTrainTickets([]); trainNo.current = 0;
    try { on ? sessionStorage.setItem('matchaPos.training', '1') : sessionStorage.removeItem('matchaPos.training'); } catch {}
    if (on && !TRAIN_TABS.includes(tab)) go('register');
  };
  const addTrainingSale = (sale) => {
    setTrainTickets((ts) => [...ts, { _id: sale._id, no: sale.no, source: 'training', customer: sale.customer || '', note: '', createdAt: sale.createdAt,
      lines: sale.lines.map((l, i) => ({ i, name: l.name, mods: l.mods || '', qty: l.qty, done: false, product: l.product, sizeId: l.sizeId, milkId: l.milkId, addonIds: l.addonIds })) }]);
  };
  const nextTrainNo = () => (trainNo.current += 1);
  // Reconnect the receipt printer quietly when the POS opens
  useEffect(() => { if (user && loadPrinterSettings().kind) reconnect(); }, [user]);
  // Online orders: polled on every tab so staff notice new ones
  const [online, setOnline] = useState([]);
  const [onlineMeta, setOnlineMeta] = useState({ awaitingPayment: 0, refundsDue: 0, paymentMode: 'off' });
  const seenNew = useRef(null);
  const loadOnline = useCallback(async () => {
    try {
      const { orders: list, awaitingPayment, refundsDue = 0, paymentMode } = await api.get('/online');
      setOnline(list);
      setOnlineMeta({ awaitingPayment, refundsDue, paymentMode });
      const ids = list.filter((o) => o.status === 'new').map((o) => o._id);
      if (seenNew.current && ids.some((id) => !seenNew.current.has(id))) chime();
      seenNew.current = new Set(ids);
    } catch { /* shown by the main refresh */ }
  }, []);

  const toast = useCallback((m) => { setToastMsg(m); clearTimeout(window.__t); window.__t = setTimeout(() => setToastMsg(''), Math.max(2800, String(m).length * 55)); }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); setCart([]); setWeakPin(false); }, []);
  const [askOut, setAskOut] = useState(false); // "Sign out?" confirmation
  const [outBusy, setOutBusy] = useState(false);
  const signOut = () => { setOutBusy(true); api.post('/auth/logout').catch(() => {}).finally(() => { setOutBusy(false); setAskOut(false); logout(); }); };
  // Locked or signed out by the owner (or session expired): back to sign-in with the reason
  // (braces: the handler must not be returned, or React would run it as the effect's clean-up and sign you out on refresh)
  useEffect(() => { setUnauthorizedHandler((d) => { if (d?.error) setSignedOutMsg(d.error); logout(); }); }, [logout]);

  useEffect(() => {
    if (!getToken()) return;
    // Offline: keep the same sign-in from last time, so selling can go on
    api.get('/auth/me').then(setUser).catch((e) => { const m = e.offline && loadMe(getToken()); if (m) setUser(m); else setToken(null); }).finally(() => setChecking(false));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [settings, ingredients, products] = await Promise.all([api.get('/settings'), api.get('/ingredients'), api.get('/products')]);
      setData({ settings, ingredients, products, loaded: true });
      saveCache({ settings, ingredients, products });
      setError('');
    } catch (e) {
      if (!e.offline) { setError(e.message); return; }
      setError('');
      const c = loadCache(); // offline: use the menu and prices this device saw last
      if (c) setData((d) => (d.loaded ? d : { settings: c.settings, ingredients: c.ingredients, products: c.products, loaded: true, cachedAt: c.at }));
    }
  }, []);

  // Load, then keep every register in sync: refresh every 20 s and when the tab regains focus
  useEffect(() => {
    if (!user) return;
    refresh();
    const t = setInterval(refresh, 20000);
    const f = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', f);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', f); };
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return;
    loadOnline();
    const t = setInterval(loadOnline, 10000);
    return () => clearInterval(t);
  }, [user, loadOnline]);
  const newCount = online.filter((o) => o.status === 'new').length;
  // Orders still to make on the Barista screen (number on the Barista tab)
  const [barCount, setBarCount] = useState(0);
  const loadBar = useCallback(() => api.get('/barista/count').then((d) => setBarCount(d.orders || 0)).catch(() => {}), []);
  useEffect(() => {
    if (!user || user.needsNewPin) return undefined;
    loadBar();
    const t = setInterval(loadBar, 5000);
    return () => clearInterval(t);
  }, [user, loadBar, tab, online]);
  // Customer service chats with unread messages (number on the Messages tab)
  const [msgCount, setMsgCount] = useState(0);
  const loadMsgs = useCallback(() => api.get('/support/count').then((d) => setMsgCount(d.n || 0)).catch(() => {}), []);
  useEffect(() => {
    if (!user || user.needsNewPin) return undefined;
    loadMsgs();
    const t = setInterval(loadMsgs, 8000);
    return () => clearInterval(t);
  }, [user, loadMsgs]);
  const trainBar = trainTickets.filter((t) => t.lines.some((l) => !l.done)).length;
  const barShown = training ? trainBar : barCount;

  useEffect(() => {
    if (data.settings?.name) document.title = `${newCount ? `(${newCount}) ` : ''}${data.settings.name} POS`;
  }, [data.settings?.name, newCount]);

  const go = (t) => { setTab(t); try { localStorage.setItem('matchaPos.tab', t); } catch {} };
  const lowCount = useMemo(() => data.ingredients.filter((i) => ingStatus(i) !== 'ok').length, [data.ingredients]);
  const lowList = useMemo(() => data.ingredients.filter(needsRestock), [data.ingredients]);
  const outList = lowList.filter((i) => ingStatus(i) === 'bad');
  const isAdmin = user?.role === 'admin';
  const showNew = newCount > 0 && tab !== 'online' && !training;
  const showRefunds = onlineMeta.refundsDue > 0 && tab !== 'online' && !training;
  usePosRipples();
  // Auto sign-out after 30 minutes with no taps or typing (a warning shows 1 minute before).
  // The Barista screen in full screen (the kitchen display) stays signed in.
  const [idleLeft, setIdleLeft] = useState(null);
  useEffect(() => {
    if (!user) return undefined;
    const KEY = 'matchaPos.lastActive', LIMIT = IDLE_MIN * 60000, WARN = 60000;
    const mark = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} setIdleLeft(null); };
    const last = () => { try { return +localStorage.getItem(KEY) || Date.now(); } catch { return Date.now(); } };
    mark();
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const t = setInterval(() => {
      if (document.fullscreenElement && document.querySelector('.barista')) { mark(); return; }
      if (!isOnline()) { mark(); return; } // offline: no auto sign-out (nobody could sign back in until the internet is back)
      const idle = Date.now() - last();
      if (idle >= LIMIT) { setIdleLeft(null); setSignedOutMsg(`You were signed out after ${IDLE_MIN} minutes with no activity.`); api.post('/auth/logout').catch(() => {}).finally(logout); }
      else if (idle >= LIMIT - WARN) setIdleLeft(Math.ceil((LIMIT - idle) / 1000));
      else setIdleLeft(null);
    }, 1000);
    return () => { clearInterval(t); evs.forEach((e) => window.removeEventListener(e, mark)); };
  }, [user, logout]); // eslint-disable-line react-hooks/exhaustive-deps
  // Offline selling: send saved sales when the server is back; check for it every few seconds while offline
  const net = useOffline();
  const [netOpen, setNetOpen] = useState(false);
  useEffect(() => { if (user && getToken()) saveMe(getToken(), user); }, [user]);
  useEffect(() => {
    if (!user || !net.online || !net.waiting) return;
    syncOutbox().then((n) => { if (n) { toast(`${n} offline ${n === 1 ? 'sale was' : 'sales were'} sent to the server.`); refresh(); } });
  }, [user, net.online, net.waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const off = () => setNetOnline(false), on = () => ping();
    window.addEventListener('offline', off); window.addEventListener('online', on);
    const t = !net.online ? setInterval(ping, 8000) : null;
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on); if (t) clearInterval(t); };
  }, [net.online]);
  useEffect(() => { if (user && net.online && !data.loaded) refresh(); }, [net.online]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sidebar: icons only (remembered on this device); on phones it slides in from the left
  const [slim, setSlimState] = useState(() => { try { return localStorage.getItem('matchaPos.slim') === '1'; } catch { return false; } });
  const setSlim = (v) => { setSlimState(v); try { localStorage.setItem('matchaPos.slim', v ? '1' : '0'); } catch {} };
  const [drawer, setDrawer] = useState(false);
  // iPad width: the menu is icons only; the handle opens the full menu over the page
  const [peek, setPeek] = useState(false);
  const narrow = () => window.matchMedia('(max-width:1180px)').matches;
  const toggleMenu = () => (narrow() ? setPeek(!peek) : setSlim(!slim));
  const compact = narrow() ? !peek : slim;
  const [bell, setBell] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 15000); return () => clearInterval(t); }, []);

  if (checking) return null;
  if (!user || user.needsNewPin) return <Login key={user?._id || 'in'} notice={signedOutMsg} pending={user?.needsNewPin ? user : null} onSignOut={logout}
    onLogin={(token, u, weak) => { setToken(token); setUser(u); setWeakPin(!!weak); setSignedOutMsg(''); }} />;

  const shared = { data, refresh, toast, user, isAdmin };
  // Everything that used to sit in the row of notes now lives in the bell
  const alerts = [
    showNew && { k: 'new', tone: 'green', icon: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4', title: `${newCount} new online ${newCount === 1 ? 'order' : 'orders'}`, sub: 'Tap to open', go: () => go('online') },
    showRefunds && { k: 'refund', tone: 'red', icon: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4', title: `${onlineMeta.refundsDue} ${onlineMeta.refundsDue === 1 ? 'refund' : 'refunds'} to send`, sub: 'Paid orders that were cancelled', go: () => go('online') },
    msgCount > 0 && tab !== 'messages' && !training && { k: 'msg', tone: 'blue', icon: 'M12 21a9 9 0 1 0-8-4.9L3 21l4.9-1A9 9 0 0 0 12 21Z', title: `${msgCount} unread ${msgCount === 1 ? 'chat' : 'chats'}`, sub: 'Customer service', go: () => go('messages') },
    lowList.length > 0 && tab !== 'inventory' && { k: 'stock', tone: outList.length ? 'red' : 'amber', icon: 'M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8', title: outList.length ? `${outList.length} out of stock` : `${lowList.length} running low`, sub: `${lowList.slice(0, 2).map((i) => i.name).join(', ')}${lowList.length > 2 ? ` +${lowList.length - 2}` : ''} · Shopping list`, go: () => { go('inventory'); setOpenRestock(true); } },
    weakPin && { k: 'pin', tone: 'amber', icon: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5zM12 15v2', title: 'Your PIN is easy to guess', sub: isAdmin ? 'Tap to change it' : 'Ask an admin for a new PIN', go: () => { if (isAdmin) { go('staff'); setWeakPin(false); } } },
  ].filter(Boolean);
  const shownTab = training && !TRAIN_TABS.includes(tab) ? 'register' : tab;
  const trainProps = { training, trainTickets, setTrainTickets, addTrainingSale, nextTrainNo };
  return (
    <>
      <div className={`shell ${slim ? 'slim' : ''} ${drawer ? 'drawer-open' : ''} ${peek ? 'wide' : ''}`}>
        <aside className="sb" aria-label="Main menu">
          {data.settings?.decorPos !== false && <DecorString decor={data.settings?.decor} />}
          <div className="sb-brand">
            <img className="sb-word" src="/brand/matchea-word-sm.webp" alt={data.settings?.name || 'Matchéa'} width="420" height="128" />
            <img className="sb-seal" src="/brand/matchea-seal-sm.webp" alt="" width="64" height="64" />
          </div>
          <nav className="tabs sb-nav" role="tablist" aria-orientation="vertical">
            {NAV.map(([group, items]) => (
              <div className="sb-group" key={group}>
                <span className="sb-glabel">{group}</span>
                {items.map(([k, n, icon, adminOnly]) => {
                  const blocked = (adminOnly && !isAdmin) ? 'Admins only' : (training && !TRAIN_TABS.includes(k)) ? 'Not open during training' : '';
                  const badge = k === 'online' ? newCount : k === 'messages' ? msgCount : k === 'barista' ? barShown : k === 'inventory' ? lowCount : 0;
                  return (
                    <button key={k} data-tab={k} role="tab" aria-selected={shownTab === k} onClick={() => { if (!blocked) { go(k); setDrawer(false); setPeek(false); } }} disabled={!!blocked}
                      className={`sb-item ${blocked ? 'locked' : ''}`} title={blocked || (slim ? n : undefined)}>
                      <span className="sb-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={icon} /></svg>{badge > 0 && <i className="sb-pip" />}</span>
                      <span className="sb-label">{n}</span>
                      {blocked ? <LockIcon /> : badge > 0 && <span className={`dot ${k === 'inventory' ? '' : 'new'}`} aria-label={`${badge}`}>{badge}</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sb-foot">
            <button className={`sb-item sb-train ${training ? 'on' : ''}`} onClick={() => setTraining(!training)} title="Practice orders that don't count">
              <span className="sb-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l9-5 9 5-9 5-9-5Zm4 2.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5M21 9v5" /></svg></span>
              <span className="sb-label">{training ? 'Training on' : 'Training'}</span>
              {training && <span className="sb-on">ON</span>}
            </button>
            <button className="sb-item" onClick={() => setPrinterOpen(true)} title="Receipt printer">
              <span className="sb-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z" /></svg></span>
              <span className="sb-label">Printer</span>
            </button>
            <a className="sb-item" href="/" target="_blank" rel="noopener" title="Opens the customer ordering site in a new tab">
              <span className="sb-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg></span>
              <span className="sb-label">Customer site</span>
            </a>
            <div className="sb-user" title={`${user.name} · ${user.superAdmin ? 'Super admin' : isAdmin ? 'Admin' : 'Cashier'}`}>
              <span className="sb-ava" aria-hidden="true">{String(user.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
              <span className="uc-name sb-label"><b>{user.name}</b><span className="uc-role">{user.superAdmin ? 'Super admin' : isAdmin ? 'Admin' : 'Cashier'}</span></span>
              <button className="sb-out" onClick={() => setAskOut(true)} aria-label="Sign out" title="Sign out">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10" /></svg>
              </button>
            </div>
          </div>
        </aside>
        {/* collapse / expand: a round handle on the sidebar's edge */}
        <button className={`sb-handle ${compact ? 'is-compact' : ''}`} onClick={toggleMenu} aria-label={compact ? 'Expand the menu' : 'Collapse the menu to icons'} aria-expanded={!compact}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5" /></svg>
          <span className="sb-handle-tip">{compact ? 'Expand' : 'Collapse'}</span>
        </button>
        <button className="sb-scrim" aria-label="Close menu" tabIndex={drawer || peek ? 0 : -1} onClick={() => { setDrawer(false); setPeek(false); }} />

        <div className="app">
        <header className="tb">
          <button className="tb-menu" onClick={() => setDrawer(true)} aria-label="Open menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="tb-title">
            <h1>{TITLE[shownTab] || 'Matchéa'}</h1>
            <span className="tb-clock num">{clock.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })} · {clock.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          {training && <span className="tb-train">Training</span>}
          {(!net.online || net.waiting > 0 || net.failed > 0) && (
            <button className={`tb-net ${!net.online ? 'off' : net.failed ? 'bad' : 'sync'}`} onClick={() => setNetOpen(true)}>
              <i aria-hidden="true" />
              {!net.online ? <>Offline{net.waiting ? <small> · {net.waiting} to send</small> : null}</> : net.failed ? `${net.failed} offline ${net.failed === 1 ? 'sale needs' : 'sales need'} a look` : `Sending ${net.waiting}…`}
            </button>
          )}
          <div className="tb-bell-wrap">
            <button className={`tb-bell ${alerts.length ? 'has' : ''}`} onClick={() => setBell(!bell)} aria-label={`${alerts.length} alerts`} aria-expanded={bell}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4" /></svg>
              {alerts.length > 0 && <span className="tb-count">{alerts.length}</span>}
            </button>
            {bell && <>
              <button className="tb-bell-scrim" aria-label="Close alerts" onClick={() => setBell(false)} />
              <div className="tb-pop" role="menu">
                <div className="tb-pop-h"><b>Alerts</b><small>{alerts.length ? `${alerts.length} need you` : 'Nothing right now'}</small></div>
                {!alerts.length && <p className="tb-pop-none">All caught up.</p>}
                {alerts.map((a) => (
                  <button key={a.k} role="menuitem" className={`tb-alert a-${a.tone}`} onClick={() => { setBell(false); a.go(); }}>
                    <NoteIcon d={a.icon} />
                    <span><b>{a.title}</b><small>{a.sub}</small></span>
                  </button>
                ))}
              </div>
            </>}
          </div>
        </header>
        {error && net.online && <div className="banner">{error}</div>}
        {training && (
          <div className="banner trainbanner" role="status">
            <span><b>Training mode.</b> Practice orders only: nothing is saved to sales, stock or reports. Only Register and Barista are open.</span>
            <button className="btn sm" onClick={() => setTraining(false)}>End training</button>
          </div>
        )}
        <main key={shownTab} className="tabpane">
          {(shownTab === 'register' || ((shownTab === 'staff' || shownTab === 'customers') && !isAdmin)) && <Register {...shared} {...trainProps} cart={cart} setCart={setCart} />}
          {shownTab === 'barista' && <Barista {...shared} {...trainProps} key={training ? 'train' : 'real'} />}
          {!training && <>
          {tab === 'home' && <Home data={data} user={user} isAdmin={isAdmin} go={go} counts={{ newOrders: newCount, toMake: barShown, messages: msgCount, refunds: onlineMeta.refundsDue || 0 }} />}
          {tab === 'messages' && <Inbox toast={toast} onCount={loadMsgs} onOrders={loadOnline} />}
          {tab === 'online' && <Online {...shared} orders={online} meta={onlineMeta} reload={loadOnline} />}
          {tab === 'inventory' && <Inventory {...shared} openRestock={openRestock} onRestockShown={() => setOpenRestock(false)} />}
          {tab === 'menu' && <Menu {...shared} goInventory={() => go('inventory')} />}
          {tab === 'reports' && <Reports {...shared} goInventory={() => go('inventory')} />}
          {tab === 'customers' && isAdmin && <Customers {...shared} />}
          {tab === 'staff' && isAdmin && <Staff {...shared} onMe={setUser} />}
          </>}
        </main>
        </div>
      </div>
      {printerOpen && <PrinterSettings toast={toast} onClose={() => setPrinterOpen(false)} />}
      {netOpen && (
        <Modal title="Offline sales" onClose={() => setNetOpen(false)} footer={<>{net.online && net.waiting > 0 && <button className="btn" onClick={() => syncOutbox()}>Send now</button>}<button className="btn primary" onClick={() => setNetOpen(false)} autoFocus>Close</button></>}>
          <p className={`net-state ${net.online ? 'on' : 'off'}`}><i aria-hidden="true" />{net.online ? 'Connected. Saved sales are sent automatically.' : 'No internet. Keep selling: cash and GCash sales are saved on this device and sent when the connection is back.'}</p>
          {net.list.length === 0 ? <p className="muted">No sales saved offline.</p> : (
            <ul className="net-list">
              {[...net.list].reverse().map((x) => (
                <li key={x.id} className={`s-${x.status}`}>
                  <span className="net-no">{x.status === 'sent' ? `#${pad(x.no)}` : x.localNo}</span>
                  <span className="net-t"><b>{x.customer || 'Walk-in'} · {peso(x.total)}</b><small>{new Date(x.at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} · {x.method === 'cash' ? 'Cash' : 'GCash'} · {x.status === 'sent' ? `Sent as order #${pad(x.no)}${x.serverTotal != null && Math.abs(x.serverTotal - x.total) > 0.009 ? ` (server total ${peso(x.serverTotal)})` : ''}` : x.status === 'failed' ? x.error : 'Waiting to send'}</small></span>
                  {x.status === 'failed' && <span className="net-act"><button className="btn sm" onClick={() => retrySale(x.id)}>Try again</button><ConfirmButton className="btn sm danger" confirmText="Tap again: not in reports" onConfirm={() => removeSale(x.id)}>Remove</ConfirmButton></span>}
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {askOut && (() => {
        const items = cart.reduce((a, l) => a + (l.qty || 1), 0);
        const warn = [
          !net.online && { tone: 'red', t: 'You’re offline. Nobody can sign in again until the internet is back.' },
          net.waiting > 0 && { tone: 'amber', t: `${net.waiting} offline ${net.waiting === 1 ? 'sale hasn’t' : 'sales haven’t'} been sent yet. ${net.waiting === 1 ? 'It stays' : 'They stay'} on this device and ${net.waiting === 1 ? 'is' : 'are'} sent after the next sign-in.` },
          items > 0 && { tone: 'red', t: `The order in the Register will be cleared (${items} ${items === 1 ? 'item' : 'items'}, not paid yet).` },
          !training && newCount > 0 && { tone: 'amber', t: `${newCount} online ${newCount === 1 ? 'order is' : 'orders are'} waiting to be accepted.` },
          barShown > 0 && { tone: 'amber', t: `${barShown} ${barShown === 1 ? 'order is' : 'orders are'} still on the Barista screen.` },
          !training && msgCount > 0 && { tone: 'blue', t: `${msgCount} unread customer ${msgCount === 1 ? 'chat' : 'chats'}.` },
        ].filter(Boolean);
        return (
          <Modal title="Sign out?" onClose={() => !outBusy && setAskOut(false)}
            footer={<><button className="btn" onClick={() => setAskOut(false)} disabled={outBusy} autoFocus>Stay signed in</button><button className="btn danger so-go" onClick={signOut} disabled={outBusy}>{outBusy ? 'Signing out…' : items > 0 ? 'Clear order and sign out' : 'Sign out'}</button></>}>
            <div className="so-who">
              <span className="so-ava" aria-hidden="true">{String(user.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
              <span><b>{user.name}</b><small>{user.superAdmin ? 'Super admin' : isAdmin ? 'Admin' : 'Cashier'}</small></span>
            </div>
            {warn.length > 0
              ? <><p className="so-lead">Before you go:</p><ul className="so-warn">{warn.map((w) => <li key={w.t} className={`t-${w.tone}`}>{w.t}</li>)}</ul></>
              : <p className="so-lead">Nothing is waiting. The next person will need their own PIN to sign in.</p>}
          </Modal>
        );
      })()}
      {idleLeft != null && (
          <div className="scrim idle-scrim" role="alertdialog" aria-label="Still there?">
            <div className="modal idle-box">
              <div className="modal-h"><h3>Still there?</h3></div>
              <div className="modal-b"><p style={{ margin: 0 }}>For safety, the POS signs out after {IDLE_MIN} minutes with no activity. Signing out in <b className="num">{idleLeft}s</b>.</p></div>
              <div className="modal-f"><button className="btn" onClick={signOut}>Sign out now</button><button className="btn primary" autoFocus onClick={() => setIdleLeft(null)}>I’m still here</button></div>
            </div>
          </div>
        )}
        {toastMsg && <div className="toast" role="status" key={toastMsg}>{toastMsg}</div>}
    </>
  );
}

const NoteIcon = ({ d }) => <svg className="note-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
