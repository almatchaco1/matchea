// API client for the customer site (separate token from the staff POS)
const KEY = 'alm.customerToken';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

let onSignedOut = () => {};
export const onUnauthorized = (fn) => { onSignedOut = fn; };

export async function call(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('No internet connection. Check your data or Wi-Fi and try again.'), { offline: true });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.code === 'signin') onSignedOut();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status, fields: data.fields });
  return data;
}

/** Load an external script once (Google / Facebook sign-in). */
const loading = {};
export function loadScript(src) {
  if (!loading[src]) {
    loading[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = () => { delete loading[src]; reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  return loading[src];
}
