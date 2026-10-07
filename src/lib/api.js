import { setOnline } from './net';

const KEY = 'matchaPos.token';

export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

async function request(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    setOnline(false);
    const e = new Error('Cannot reach the server. Check the internet connection.');
    e.offline = true;
    throw e;
  }
  if (res.status >= 502 && res.status <= 504) { // the host answered but the server is down / starting
    setOnline(false);
    const e = new Error('The server is not answering right now. Try again in a moment.');
    e.offline = true;
    throw e;
  }
  if (navigator.onLine !== false) setOnline(true); // (a reply that was already on its way doesn't count when the device says it's offline)
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onUnauthorized(data);
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.fields = data.fields || null; // per-field messages from the server, shown under inputs
    throw err;
  }
  return data;
}

/** Download a file from the API (with the sign-in token) and save it. */
async function saveFile(path, filename) {
  const token = getToken();
  const res = await fetch('/api' + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Download failed (${res.status})`); }
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const api = {
  saveFile,
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b || {}),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
};
