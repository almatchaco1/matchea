// Map helpers for delivery: road distance (OSRM) and place search / address lookup (OpenStreetMap Nominatim).
// Both are free public services; answers are cached and Nominatim is asked at most once a second (their rule).
// OSRM_URL / NOMINATIM_URL can point somewhere else (for tests or a paid provider).
import { crowKm } from '../../../src/shared/delivery.mjs';

const OSRM = () => (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const NOMI = () => (process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const UA = 'Matchea-POS/1.0 (matcha shop online ordering)';

const cache = new Map();
function remember(key, value) { cache.set(key, { at: Date.now(), value }); if (cache.size > 800) cache.delete(cache.keys().next().value); return value; }
const recall = (key, ms) => { const c = cache.get(key); return c && Date.now() - c.at < ms ? c.value : undefined; };

async function getJson(url, ms = 6000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Road distance from the shop to a pin: { km, route: [[lat,lng],…], approx }. Falls back to straight line × 1.3. */
export async function roadKm(from, to) {
  const key = `r:${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = recall(key, 6 * 3600e3); if (hit) return hit;
  try {
    const j = await getJson(`${OSRM()}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`);
    const rt = j?.routes?.[0];
    if (!rt) throw new Error('no route');
    return remember(key, { km: rt.distance / 1000, route: (rt.geometry?.coordinates || []).map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]), approx: false });
  } catch {
    return { km: crowKm(from, to) * 1.3, route: [[from.lat, from.lng], [to.lat, to.lng]], approx: true }; // not cached: try the road again next time
  }
}

// Nominatim: one request per second, queued
let last = 0, chain = Promise.resolve();
const polite = (fn) => (chain = chain.then(async () => { const wait = Math.max(0, last + 1100 - Date.now()); if (wait) await new Promise((r) => setTimeout(r, wait)); last = Date.now(); return fn(); }).catch((e) => { throw e; }));

const short = (a = {}, name = '') => {
  const ad = a.address || {};
  const parts = [name || ad.amenity || ad.shop || ad.building, [ad.house_number, ad.road].filter(Boolean).join(' '), ad.neighbourhood || ad.suburb || ad.village || ad.quarter, ad.city || ad.town || ad.municipality, ad.state || ad.region];
  return [...new Set(parts.filter(Boolean))].join(', ') || a.display_name || '';
};

/** Search places in the Philippines: [{ label, lat, lng }] */
export async function searchPlaces(q) {
  const key = `s:${q.toLowerCase()}`;
  const hit = recall(key, 24 * 3600e3); if (hit) return hit;
  const j = await polite(() => getJson(`${NOMI()}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=ph&q=${encodeURIComponent(q)}`));
  return remember(key, (Array.isArray(j) ? j : []).map((p) => ({ label: short(p, p.name), lat: +p.lat, lng: +p.lon })));
}

/** Address for a pin: { label } */
export async function placeName(lat, lng) {
  const key = `g:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = recall(key, 24 * 3600e3); if (hit) return hit;
  const j = await polite(() => getJson(`${NOMI()}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`));
  return remember(key, { label: short(j) });
}
