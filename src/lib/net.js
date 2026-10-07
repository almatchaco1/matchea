// Is the server reachable? Set by every API call (a reply = online, a network failure = offline).
let online = typeof navigator === 'undefined' || navigator.onLine !== false;
const subs = new Set();
export const isOnline = () => online;
export function setOnline(v) {
  if (v === online) return;
  online = v;
  subs.forEach((fn) => { try { fn(v); } catch { /* a listener failed */ } });
}
export const onNet = (fn) => { subs.add(fn); return () => subs.delete(fn); };
