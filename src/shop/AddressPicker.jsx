// Delivery address: choose your area from the shop's list, then house no. / street, landmark and a note for the rider.
// The fee comes from the area (free from N drinks). No map: the shop books Lalamove with this address.
import { peso } from '../lib/format';

export default function AddressPicker({ cfg, quote, value, onChange, errs = {} }) {
  const set = (k, v) => onChange({ ...value, [k]: v }, k);
  const fees = new Set(cfg.areas.map((a) => a.fee));
  return (
    <div className="ap">
      <label className="au-field">
        <span>Area</span>
        <select value={value?.area || ''} onChange={(e) => set('area', e.target.value)} aria-invalid={!!errs.area}>
          <option value="">Choose your area…</option>
          {cfg.areas.map((a) => <option key={a.name} value={a.name}>{a.name}{fees.size > 1 ? ` · ${peso(a.fee)}` : ''}</option>)}
        </select>
        {errs.area ? <small className="au-err" role="alert">{errs.area}</small> : <small className="muted">We deliver nearby only. Not on the list? Choose pickup.</small>}
      </label>
      {quote && (
        <div className={`ap-fee ${quote.free ? 'free' : ''}`} aria-live="polite">
          {quote.free ? <span><b>Free delivery</b> · your order has {cfg.freeDrinks}+ drinks <s>{peso(quote.fee)}</s></span>
            : <span><b>Delivery {peso(quote.charge)}</b>{quote.moreForFree > 0 && <> · add {quote.moreForFree} more {quote.moreForFree === 1 ? 'drink' : 'drinks'} for <b>free delivery</b></>}</span>}
        </div>
      )}
      <label className="au-field">
        <span>House / unit no. and street</span>
        <input value={value?.detail || ''} maxLength={120} autoComplete="street-address" onChange={(e) => set('detail', e.target.value)} placeholder="e.g. Blk 4 Lot 12, Mabini St." aria-invalid={!!errs.detail} />
        {errs.detail && <small className="au-err" role="alert">{errs.detail}</small>}
      </label>
      <label className="au-field">
        <span>Landmark</span>
        <input value={value?.landmark || ''} maxLength={120} onChange={(e) => set('landmark', e.target.value)} placeholder="e.g. Green gate beside 7-Eleven" aria-invalid={!!errs.landmark} />
        {errs.landmark && <small className="au-err" role="alert">{errs.landmark}</small>}
      </label>
      <label className="au-field">
        <span>Note for the rider <i className="opt">optional</i></span>
        <input value={value?.note || ''} maxLength={160} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Call when you’re outside" aria-invalid={!!errs.note} />
        {errs.note && <small className="au-err" role="alert">{errs.note}</small>}
      </label>
    </div>
  );
}
