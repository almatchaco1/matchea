import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './lib/api';
import { ingStatus, needsRestock } from './lib/format';
import Login from './components/Login';
import Register from './components/Register';
import Inventory from './components/Inventory';
import Menu from './components/Menu';
import Reports from './components/Reports';
import Online from './components/Online';
import Staff from './components/Staff';
import Barista from './components/Barista';
import PrinterSettings from './components/PrinterSettings';
import { loadPrinterSettings, reconnect } from './lib/printer';
import { usePosRipples, TabInk, useHeaderFit } from './lib/motion';
import { DecorString } from './lib/decor';
import { LockIcon } from './components/Locked';
import './styles.css';
import './matchea-pos.css';

const TABS = [['register', 'Register'], ['online', 'Online'], ['barista', 'Barista'], ['inventory', 'Inventory'], ['menu', 'Menu'], ['reports', 'Reports'], ['staff', 'Staff', 'admin']];
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
const savedTab = () => { try { return localStorage.getItem('matchaPos.tab') || 'register'; } catch { return 'register'; } };

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
  const [hideStock, setHideStock] = useState('');
  // Online orders: polled on every tab so staff notice new ones
  const [online, setOnline] = useState([]);
  const [onlineMeta, setOnlineMeta] = useState({ awaitingPayment: 0, paymentMode: 'off' });
  const seenNew = useRef(null);
  const loadOnline = useCallback(async () => {
    try {
      const { orders: list, awaitingPayment, paymentMode } = await api.get('/online');
      setOnline(list);
      setOnlineMeta({ awaitingPayment, paymentMode });
      const ids = list.filter((o) => o.status === 'new').map((o) => o._id);
      if (seenNew.current && ids.some((id) => !seenNew.current.has(id))) chime();
      seenNew.current = new Set(ids);
    } catch { /* shown by the main refresh */ }
  }, []);

  const toast = useCallback((m) => { setToastMsg(m); clearTimeout(window.__t); window.__t = setTimeout(() => setToastMsg(''), Math.max(2800, String(m).length * 55)); }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); setCart([]); setWeakPin(false); }, []);
  const signOut = () => { api.post('/auth/logout').catch(() => {}).finally(logout); };
  // Locked or signed out by the owner (or session expired): back to sign-in with the reason
  useEffect(() => setUnauthorizedHandler((d) => { if (d?.error) setSignedOutMsg(d.error); logout(); }), [logout]);

  useEffect(() => {
    if (!getToken()) return;
    api.get('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [settings, ingredients, products] = await Promise.all([api.get('/settings'), api.get('/ingredients'), api.get('/products')]);
      setData({ settings, ingredients, products, loaded: true });
      setError('');
    } catch (e) { setError(e.message); }
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

  useEffect(() => {
    if (data.settings?.name) document.title = `${newCount ? `(${newCount}) ` : ''}${data.settings.name} POS`;
  }, [data.settings?.name, newCount]);

  const go = (t) => { setTab(t); try { localStorage.setItem('matchaPos.tab', t); } catch {} };
  const lowCount = useMemo(() => data.ingredients.filter((i) => ingStatus(i) !== 'ok').length, [data.ingredients]);
  const lowList = useMemo(() => data.ingredients.filter(needsRestock), [data.ingredients]);
  const outList = lowList.filter((i) => ingStatus(i) === 'bad');
  const lowKey = lowList.map((i) => i._id).join(',');
  const isAdmin = user?.role === 'admin';
  const showStock = lowList.length > 0 && tab !== 'inventory' && hideStock !== lowKey;
  const showNew = newCount > 0 && tab !== 'online' && !training;
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
      const idle = Date.now() - last();
      if (idle >= LIMIT) { setIdleLeft(null); setSignedOutMsg(`You were signed out after ${IDLE_MIN} minutes with no activity.`); api.post('/auth/logout').catch(() => {}).finally(logout); }
      else if (idle >= LIMIT - WARN) setIdleLeft(Math.ceil((LIMIT - idle) / 1000));
      else setIdleLeft(null);
    }, 1000);
    return () => { clearInterval(t); evs.forEach((e) => window.removeEventListener(e, mark)); };
  }, [user, logout]); // eslint-disable-line react-hooks/exhaustive-deps
  const navRef = useRef(null);
  const topRef = useRef(null);
  useHeaderFit(topRef, `${user?._id}|${training}|${newCount > 0}|${lowCount > 0}|${checking}`);

  if (checking) return null;
  if (!user) return <Login notice={signedOutMsg} onLogin={(token, u, weak) => { setToken(token); setUser(u); setWeakPin(!!weak); setSignedOutMsg(''); }} />;

  const shared = { data, refresh, toast, user, isAdmin };
  const shownTab = training && !TRAIN_TABS.includes(tab) ? 'register' : tab;
  const trainProps = { training, trainTickets, setTrainTickets, addTrainingSale, nextTrainNo };
  return (
    <>
      <div className="app">
        <header className="top" ref={topRef} data-fit="0">
          {data.settings?.decorPos !== false && <DecorString decor={data.settings?.decor} wide />}
          <div className="brand">
            <span className="seal-logo"><img src="/brand/matchea-seal.webp" alt="" width="46" height="46" /></span>
            <div><h1>{data.settings?.name || 'Matchéa'}</h1><small>Point of sale · Inventory</small></div>
          </div>
          <nav className="tabs" role="tablist" ref={navRef}>
            <TabInk nav={navRef} dep={`${shownTab}|${training}|${isAdmin}|${lowCount}|${newCount}`} />
            {TABS.map(([k, n, who]) => {
              const blocked = (who && !isAdmin) ? 'Admins only' : (training && !TRAIN_TABS.includes(k)) ? 'Not open during training' : '';
              return (
              <button key={k} data-tab={k} role="tab" aria-selected={shownTab === k} onClick={() => !blocked && go(k)} disabled={!!blocked} className={blocked ? 'locked' : undefined} title={blocked || undefined}>
                {blocked && <LockIcon />}{n}{k === 'inventory' && lowCount > 0 && <span className="dot">{lowCount}</span>}{k === 'online' && newCount > 0 && <span className="dot new">{newCount}</span>}
              </button>
              );
            })}
          </nav>
          <div className="userchip">
            <span className="uc-name" title={`${user.name} · ${user.superAdmin ? 'Super admin' : isAdmin ? 'Admin' : 'Cashier'}`}><b>{user.name}</b><span className="uc-role">{user.superAdmin ? 'Super admin' : isAdmin ? 'Admin' : 'Cashier'}</span></span>
            <button className={`btn sm ${training ? 'train-on' : 'ghost'}`} onClick={() => setTraining(!training)} title="Practice orders that don't count">{training ? 'Training on' : 'Training'}</button>
            <button className="btn sm ghost" onClick={() => setPrinterOpen(true)} title="Receipt printer">Printer</button>
            <a className="btn sm ghost" href="/" target="_blank" rel="noopener" title="Opens the customer ordering site in a new tab"><span className="hide-sm">Customer site</span><span className="show-sm">Shop</span> ↗</a>
            <button className="btn sm" onClick={signOut}>Sign out</button>
          </div>
        </header>
        {error && <div className="banner">{error}</div>}
        {training && (
          <div className="banner trainbanner" role="status">
            <span><b>Training mode.</b> Practice orders only: nothing is saved to sales, stock or reports. Only Register and Barista are open.</span>
            <button className="btn sm" onClick={() => setTraining(false)}>End training</button>
          </div>
        )}
        {(showNew || showStock || weakPin) && (
          <div className="notes" role="status">
            {showNew && (
              <button className="note n-new" onClick={() => go('online')}>
                <NoteIcon d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4" />
                <span><b>{newCount} new online {newCount === 1 ? 'order' : 'orders'}</b><small>Tap to open</small></span>
              </button>
            )}
            {showStock && (
              <span className={`note n-stock ${outList.length ? 'bad' : ''}`}>
                <button className="note-main" onClick={() => { go('inventory'); setOpenRestock(true); }} title={lowList.map((i) => i.name).join(', ')}>
                  <NoteIcon d="M4 8l8-4 8 4v8l-8 4-8-4V8Zm0 0 8 4 8-4M12 12v8" />
                  <span><b>{outList.length ? `${outList.length} out of stock` : `${lowList.length} running low`}</b><small>{lowList.slice(0, 2).map((i) => i.name).join(', ')}{lowList.length > 2 ? ` +${lowList.length - 2}` : ''} · Restock list</small></span>
                </button>
                <button className="note-x" onClick={() => setHideStock(lowKey)} aria-label="Hide until something else runs low" title="Hide">×</button>
              </span>
            )}
            {weakPin && (
              <span className="note n-pin">
                <button className="note-main" onClick={() => { if (isAdmin) { go('staff'); setWeakPin(false); } }} disabled={!isAdmin}>
                  <NoteIcon d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5zM12 15v2" />
                  <span><b>Your PIN is easy to guess</b><small>{isAdmin ? 'Tap to change it' : 'Ask an admin for a new PIN'}</small></span>
                </button>
                <button className="note-x" onClick={() => setWeakPin(false)} aria-label="Remind me later" title="Later">×</button>
              </span>
            )}
          </div>
        )}
        <main key={shownTab} className="tabpane">
          {(shownTab === 'register' || (shownTab === 'staff' && !isAdmin)) && <Register {...shared} {...trainProps} cart={cart} setCart={setCart} />}
          {shownTab === 'barista' && <Barista {...shared} {...trainProps} key={training ? 'train' : 'real'} />}
          {!training && <>
          {tab === 'online' && <Online {...shared} orders={online} meta={onlineMeta} reload={loadOnline} />}
          {tab === 'inventory' && <Inventory {...shared} openRestock={openRestock} onRestockShown={() => setOpenRestock(false)} />}
          {tab === 'menu' && <Menu {...shared} goInventory={() => go('inventory')} />}
          {tab === 'reports' && <Reports {...shared} goInventory={() => go('inventory')} />}
          {tab === 'staff' && isAdmin && <Staff {...shared} />}
          </>}
        </main>
      </div>
      {printerOpen && <PrinterSettings toast={toast} onClose={() => setPrinterOpen(false)} />}
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
