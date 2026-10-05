// Delivery by Lalamove (booked by the shop). Shared by the server (to charge the right fee) and the website (to show it).
// The shop delivers nearby: it lists the areas it delivers to, each with a fee. Free from N drinks (the shop pays Lalamove).

export const DELIVERY_DEFAULTS = { enabled: false, label: '', areas: [], freeDrinks: 5 };
export const AREA_LIMITS = { max: 30, name: 40, fee: 2000 };
// Rider steps, after the shop books Lalamove in the Lalamove app
export const RIDER_STATES = ['waiting', 'booked', 'picked', 'delivered'];

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
export const sameArea = (a, b) => clean(a, 80).toLowerCase() === clean(b, 80).toLowerCase();

/** The area the customer picked, from the shop's list (or undefined). */
export const findArea = (cfg, name) => (cfg?.areas || []).find((a) => sameArea(a.name, name));

/** What the customer pays for delivery: the area's fee, free when the order has enough drinks (the shop pays Lalamove). */
export function quoteFor(area, drinks, cfg = DELIVERY_DEFAULTS) {
  const fee = Math.round(+area?.fee || 0);
  const free = (+cfg.freeDrinks || 0) > 0 && drinks >= +cfg.freeDrinks;
  return { area: area?.name || '', fee, free, charge: free ? 0 : fee, moreForFree: free || !cfg.freeDrinks ? 0 : Math.max(0, cfg.freeDrinks - drinks) };
}

/** Check a delivery address from the website. Returns { field: message }. */
export function checkAddress(a = {}, cfg = null) {
  const e = {};
  const area = clean(a.area, 80), detail = clean(a.detail, 200), landmark = clean(a.landmark, 200), note = clean(a.note, 200);
  if (!area) e.area = 'Choose your area.';
  else if (cfg && !findArea(cfg, area)) e.area = 'We don’t deliver to that area. Choose one from the list, or pick up at the shop.';
  if (detail.length < 5) e.detail = 'Add your house or unit number and street.';
  else if (detail.length > 120) e.detail = 'At most 120 characters.';
  if (landmark.length < 3) e.landmark = 'Add a landmark so the rider can find you (e.g. “beside 7-Eleven”).';
  else if (landmark.length > 120) e.landmark = 'At most 120 characters.';
  if (note.length > 160) e.note = 'At most 160 characters.';
  return e;
}

/** Clean the owner's list of delivery areas: trimmed names, whole-peso fees, no blanks. */
export const cleanAreas = (areas) => (Array.isArray(areas) ? areas : [])
  .map((a) => ({ name: clean(a?.name, AREA_LIMITS.name), fee: a?.fee === '' || a?.fee == null ? NaN : Math.round(+a.fee) }))
  .filter((a) => a.name || Number.isFinite(a.fee));

/** Check the owner's delivery settings. */
export function checkDeliverySettings(d = {}) {
  const e = {};
  const areas = cleanAreas(d.areas);
  if (areas.length > AREA_LIMITS.max) e['delivery.areas'] = `At most ${AREA_LIMITS.max} areas.`;
  const seen = new Set();
  areas.forEach((a, i) => {
    if (a.name.length < 2) e[`delivery.areas.${i}.name`] = 'Type the area name.';
    else if (seen.has(a.name.toLowerCase())) e[`delivery.areas.${i}.name`] = 'This area is already on the list.';
    seen.add(a.name.toLowerCase());
    if (!Number.isFinite(a.fee) || a.fee < 0 || a.fee > AREA_LIMITS.fee) e[`delivery.areas.${i}.fee`] = `Fee from ₱0 to ₱${AREA_LIMITS.fee}.`;
  });
  const fd = +d.freeDrinks;
  if (!Number.isFinite(fd) || fd < 0 || fd > 100) e['delivery.freeDrinks'] = 'Free delivery from must be between 0 and 100 drinks.';
  if (d.enabled && !areas.length) e['delivery.areas'] = 'Add at least one area you deliver to.';
  return e;
}

/** One line for the rider / Lalamove drop-off. */
export const addressLine = (d = {}) => [d.detail, d.area || d.label].filter(Boolean).join(', ');

/** Google Maps search for an address (for the rider / delivery slip). Older orders with a pin use the pin. */
export const mapsLink = (d = {}) => (d.lat != null && d.lng != null && !d.area
  ? `https://www.google.com/maps/search/?api=1&query=${(+d.lat).toFixed(6)},${(+d.lng).toFixed(6)}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(d))}`);
