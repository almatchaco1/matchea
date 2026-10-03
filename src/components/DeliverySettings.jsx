// Menu → Shop & options: delivery by Lalamove. Shop pin on the map, fee by distance, free from N drinks.
import { useState } from 'react';
import { Field } from './Field';
import PlaceSearch from './PlaceSearch';
import MapView from '../lib/map';
import { DELIVERY_DEFAULTS, feeFor } from '../shared/delivery.mjs';
import { peso } from '../lib/format';

export default function DeliverySettings({ f, setF, errs = {} }) {
  const d = { ...DELIVERY_DEFAULTS, ...(f.delivery || {}) };
  const set = (patch) => setF({ ...f, delivery: { ...d, ...patch } });
  const has = d.lat != null && d.lng != null;
  const [goTo, setGoTo] = useState(null); // place picked in the search box
  const num = (k, label, hint, step = 'any') => (
    <Field id={`dl-${k}`} label={label} hint={hint} error={errs[`delivery.${k}`]}>
      <input id={`dl-${k}`} type="number" inputMode="decimal" min="0" step={step} value={d[k]} onChange={(e) => set({ [k]: e.target.value })} />
    </Field>
  );
  return (
    <div className="opt-group dl-set">
      <h4>Delivery <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· you book Lalamove in the Lalamove app</span></h4>
      <label className={`check ${d.enabled ? 'on' : ''}`}>
        <input type="checkbox" checked={!!d.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> <span>Customers can choose delivery (paid first by GCash or Maya)</span>
      </label>
      <p className="muted" style={{ margin: 0 }}>Search your address or move the map so the pin is on your shop. Distances and fees are counted from here.</p>
      <PlaceSearch onGo={(h) => { setGoTo({ lat: h.lat, lng: h.lng }); if (h.label && !d.label) set({ label: h.label }); }} />
      <MapView mode="pick" center={goTo || (has ? { lat: +d.lat, lng: +d.lng } : null)} onPick={(p, byUser) => { if (byUser) setGoTo(null); set({ lat: p.lat, lng: p.lng }); }} />
      <span className="dl-pin">{has ? `Shop pin: ${(+d.lat).toFixed(5)}, ${(+d.lng).toFixed(5)}` : 'No shop pin yet: move the map to your shop.'}</span>
      {errs['delivery.pin'] && <div className="ferr" role="alert">{errs['delivery.pin']}</div>}
      <Field id="dl-label" label="Shop address for the Lalamove pick-up (optional)">
        <input id="dl-label" maxLength={200} value={d.label || ''} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. 123 Rizal St., Brgy. San Roque" />
      </Field>
      <div className="row">
        {num('baseFee', 'Base fee ₱', 'Covers the first km below')}
        {num('baseKm', 'First km included', '')}
        {num('perKm', '₱ per extra km', '')}
      </div>
      <div className="row">
        {num('maxKm', 'Farthest delivery (km)', '')}
        {num('freeDrinks', 'Free delivery from (drinks)', '0 = never free. The shop pays Lalamove.', 1)}
      </div>
      <p className="fhint" style={{ margin: 0 }}>Example: 3 km costs the customer {peso(feeFor(3, d))}, 6 km costs {peso(feeFor(6, d))}. Set these close to what Lalamove charges you.</p>
    </div>
  );
}
