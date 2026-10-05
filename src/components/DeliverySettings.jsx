// Menu → Shop & options: delivery by Lalamove. The nearby areas you deliver to, each with its fee; free from N drinks.
import { Field } from './Field';
import { DELIVERY_DEFAULTS, AREA_LIMITS } from '../shared/delivery.mjs';
import { peso } from '../lib/format';

export default function DeliverySettings({ f, setF, errs = {} }) {
  const d = { ...DELIVERY_DEFAULTS, ...(f.delivery || {}) };
  const areas = Array.isArray(d.areas) ? d.areas : [];
  const set = (patch) => setF({ ...f, delivery: { ...d, ...patch } });
  const setArea = (i, patch) => set({ areas: areas.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const addArea = () => set({ areas: [...areas, { name: '', fee: areas.length ? areas[areas.length - 1].fee : 49 }] });
  const removeArea = (i) => set({ areas: areas.filter((_, j) => j !== i) });
  const free = Math.round(+d.freeDrinks) || 0;
  return (
    <div className="opt-group dl-set">
      <h4>Delivery <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· you book Lalamove in the Lalamove app</span></h4>
      <label className={`check ${d.enabled ? 'on' : ''}`}>
        <input type="checkbox" checked={!!d.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> <span>Customers can choose delivery (paid first by GCash or Maya)</span>
      </label>

      <div className="dl-areas">
        <div className="dl-areas-h"><b>Areas you deliver to</b><small className="muted">Customers pick one. Use the same fee for all if you charge one price.</small></div>
        {!areas.length && <p className="muted" style={{ margin: 0 }}>No areas yet. Add the barangays or villages near the shop.</p>}
        {areas.map((a, i) => (
          <div className="dl-area" key={i}>
            <Field id={`dl-an-${i}`} label={i === 0 ? 'Area' : ''} error={errs[`delivery.areas.${i}.name`]} className="grow">
              <input id={`dl-an-${i}`} maxLength={AREA_LIMITS.name} value={a.name || ''} onChange={(e) => setArea(i, { name: e.target.value })} placeholder="e.g. Brgy. Kapitolyo" aria-label={`Area ${i + 1} name`} />
            </Field>
            <Field id={`dl-af-${i}`} label={i === 0 ? 'Fee ₱' : ''} error={errs[`delivery.areas.${i}.fee`]} className="dl-fee">
              <input id={`dl-af-${i}`} type="number" inputMode="numeric" min="0" max={AREA_LIMITS.fee} step="1" value={a.fee ?? ''} onChange={(e) => setArea(i, { fee: e.target.value })} aria-label={`Area ${i + 1} fee`} />
            </Field>
            <button type="button" className="btn ghost sm dl-rm" onClick={() => removeArea(i)} aria-label={`Remove ${a.name || `area ${i + 1}`}`}>Remove</button>
          </div>
        ))}
        {errs['delivery.areas'] && <div className="ferr" role="alert">{errs['delivery.areas']}</div>}
        {areas.length < AREA_LIMITS.max && <button type="button" className="btn sm dl-add" onClick={addArea}>+ Add area</button>}
      </div>

      <div className="row">
        <Field id="dl-free" label="Free from (drinks)" hint="0 = never free. The shop pays Lalamove." error={errs['delivery.freeDrinks']}>
          <input id="dl-free" type="number" inputMode="numeric" min="0" max="100" step="1" value={d.freeDrinks} onChange={(e) => set({ freeDrinks: e.target.value })} />
        </Field>
        <Field id="dl-label" label="Shop address for the Lalamove pick-up (optional)" style={{ flex: '2 1 240px' }}>
          <input id="dl-label" maxLength={200} value={d.label || ''} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. 123 Rizal St., Brgy. San Roque" />
        </Field>
      </div>
      {areas.some((a) => a.name) && (
        <p className="fhint" style={{ margin: 0 }}>
          Example: {areas.filter((a) => a.name)[0].name} costs the customer {peso(+areas.filter((a) => a.name)[0].fee || 0)}{free ? `, free from ${free} drinks` : ''}. Set fees close to what Lalamove charges you.
        </p>
      )}
    </div>
  );
}
