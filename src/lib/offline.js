// Selling without internet: counter sales are saved on this device (the "outbox") and sent to the
// server when the connection is back. Each sale has its own id, so the server never saves it twice.
import { useEffect, useState } from 'react';
import { api } from './api';
import { isOnline, onNet, setOnline } from './net';

const OUT = 'matchaPos.outbox', CACHE = 'matchaPos.cache', ME = 'matchaPos.me', NO = 'matchaPos.offNo';
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

const subs = new Set();
const emit = () => subs.forEach((fn) => fn());

export const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/** Everything saved offline on this device: { id, body, at, localNo, total, method, customer, status: 'waiting'|'sent'|'failed', error?, no? } */
export const outbox = () => read(OUT, []);
const saveOutbox = (list) => { const ok = write(OUT, list); emit(); return ok; };
/** Next number for a sale made offline (OFF-1, OFF-2 … per device and day). */
export function nextOfflineNo() {
  const day = new Date().toDateString();
  const cur = read(NO, {});
  const n = cur.day === day ? (cur.n || 0) + 1 : 1;
  write(NO, { day, n });
  return `OFF-${n}`;
}
export function queueSale(entry) {
  const list = outbox().filter((x) => x.id !== entry.id);
  list.push({ ...entry, status: 'waiting' });
  if (!saveOutbox(list)) throw new Error('This device has no room left to save the sale. Free up space or reconnect.');
}
export function removeSale(id) { saveOutbox(outbox().filter((x) => x.id !== id)); }
export function retrySale(id) { saveOutbox(outbox().map((x) => (x.id === id ? { ...x, status: 'waiting', error: '' } : x))); return syncOutbox(); }
/** Sent sales are kept for a day so staff can see what went through, then dropped. */
const tidy = (list) => list.filter((x) => x.status !== 'sent' || Date.now() - (x.sentAt || 0) < 24 * 3600e3);

let syncing = null;
/** Send waiting sales, oldest first. Stops at the first network failure; a refused sale is marked for staff to look at. */
export function syncOutbox() {
  if (syncing) return syncing;
  syncing = (async () => {
    let sent = 0;
    for (const item of outbox().filter((x) => x.status === 'waiting')) {
      try {
        const sale = await api.post('/sales', { ...item.body, clientId: item.id, offline: { at: item.at, localNo: item.localNo, charged: item.total } });
        saveOutbox(tidy(outbox().map((x) => (x.id === item.id ? { ...x, status: 'sent', no: sale.no, serverTotal: sale.total, sentAt: Date.now() } : x))));
        sent += 1;
      } catch (e) {
        if (e.offline) break;
        if (e.status === 401) break; // signed out: try again after the next sign-in
        saveOutbox(outbox().map((x) => (x.id === item.id ? { ...x, status: 'failed', error: e.message } : x)));
      }
    }
    return sent;
  })().finally(() => { syncing = null; emit(); });
  return syncing;
}

/** Last menu / settings / stock this device saw, to keep selling when offline. */
export const saveCache = (data) => write(CACHE, { at: Date.now(), settings: data.settings, products: data.products, ingredients: data.ingredients });
export const loadCache = () => read(CACHE, null);
/** The signed-in staff member, to stay signed in when the page reloads offline (only with the same sign-in). */
export const saveMe = (token, user) => write(ME, { token, user });
export const loadMe = (token) => { const m = read(ME, null); return m && m.token === token ? m.user : null; };

/** Ask the server if it's back (cheap). */
export async function ping() {
  try { const r = await fetch('/api/health', { cache: 'no-store' }); setOnline(r.ok || r.status < 500); return r.ok; } catch { setOnline(false); return false; }
}

/** React: { online, list, waiting, failed } that updates by itself. */
export function useOffline() {
  const [state, setState] = useState(() => ({ online: isOnline(), list: outbox() }));
  useEffect(() => {
    const up = () => setState({ online: isOnline(), list: outbox() });
    subs.add(up);
    const off = onNet(up);
    const st = (e) => { if (e.key === OUT) up(); };
    window.addEventListener('storage', st);
    return () => { subs.delete(up); off(); window.removeEventListener('storage', st); };
  }, []);
  return { ...state, waiting: state.list.filter((x) => x.status === 'waiting').length, failed: state.list.filter((x) => x.status === 'failed').length };
}
