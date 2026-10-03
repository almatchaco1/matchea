// Delivery by Lalamove (booked by the shop). Shared by the server (to charge the right fee) and the website (to show it).

export const DELIVERY_DEFAULTS = { enabled: false, lat: null, lng: null, label: '', baseFee: 49, baseKm: 2, perKm: 10, maxKm: 10, freeDrinks: 5 };
// Rider steps, after the shop books Lalamove in the Lalamove app
export const RIDER_STATES = ['waiting', 'booked', 'picked', 'delivered'];

/** Straight-line distance in km between two { lat, lng } points. */
export function crowKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Delivery fee for a road distance: base fee covers the first baseKm, then perKm for every started km. */
export function feeFor(km, cfg = DELIVERY_DEFAULTS) {
  const extra = Math.max(0, Math.ceil((+km || 0) - (+cfg.baseKm || 0) - 1e-9));
  return Math.round((+cfg.baseFee || 0) + extra * (+cfg.perKm || 0));
}

/** What the customer pays for delivery: free when the order has enough drinks (the shop pays Lalamove). */
export function quoteFor(km, drinks, cfg = DELIVERY_DEFAULTS) {
  const fee = feeFor(km, cfg);
  const free = (+cfg.freeDrinks || 0) > 0 && drinks >= +cfg.freeDrinks;
  const tooFar = (+cfg.maxKm || 0) > 0 && km > +cfg.maxKm;
  return { km: Math.round(km * 10) / 10, fee, free, charge: free ? 0 : fee, tooFar, moreForFree: free || !cfg.freeDrinks ? 0 : Math.max(0, cfg.freeDrinks - drinks) };
}

// The Philippines, roughly (so a pin in the sea far away is caught early)
export const inPH = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat > 4.2 && lat < 21.6 && lng > 116 && lng < 127.2;

/** Check a delivery address from the website. Returns { field: message }. */
export function checkAddress(a = {}) {
  const e = {};
  const lat = +a.lat, lng = +a.lng;
  if (!inPH(lat, lng)) e.pin = 'Move the map so the pin is on your place.';
  const detail = String(a.detail || '').trim(), landmark = String(a.landmark || '').trim(), note = String(a.note || '').trim();
  if (detail.length < 3) e.detail = 'Add your house or unit number and street.';
  else if (detail.length > 120) e.detail = 'At most 120 characters.';
  if (landmark.length < 3) e.landmark = 'Add a landmark so the rider can find you (e.g. “beside 7-Eleven”).';
  else if (landmark.length > 120) e.landmark = 'At most 120 characters.';
  if (note.length > 160) e.note = 'At most 160 characters.';
  return e;
}

/** Check the owner's delivery settings. */
export function checkDeliverySettings(d = {}) {
  const e = {};
  const num = (k, label, min, max) => { const v = +d[k]; if (!Number.isFinite(v) || v < min || v > max) e[`delivery.${k}`] = `${label} must be between ${min} and ${max}.`; };
  num('baseFee', 'Base fee', 0, 2000); num('baseKm', 'Base distance', 0, 50); num('perKm', 'Fee per km', 0, 500);
  num('maxKm', 'Farthest distance', 1, 100); num('freeDrinks', 'Free delivery from', 0, 100);
  if (d.enabled && !inPH(+d.lat, +d.lng)) e['delivery.pin'] = 'Set your shop’s location on the map first.';
  return e;
}

/** Google Maps link for a pin (for the rider / delivery slip). */
export const mapsLink = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${(+lat).toFixed(6)},${(+lng).toFixed(6)}`;
