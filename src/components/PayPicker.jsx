// Payment method picker (Cash / GCash): equal-width buttons with a small icon each.
import { PAY_METHODS } from '../shared/pricing.mjs';

const ICON = {
  cash: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></svg>,
  gcash: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" className="fill g" /><path d="M15.6 9.2A4.4 4.4 0 1 0 16.4 12h-4" className="on" /></svg>,
};

const SUB = { cash: 'Bills & coins', gcash: 'Scan QR' };

export default function PayPicker({ value, onChange, tiles }) {
  const keys = Object.keys(PAY_METHODS);
  return (
    <div className={`seg pay-pick ${tiles ? 'pp-tiles' : ''}`} role="group" aria-label="Payment method" style={{ '--n': keys.length, '--at': Math.max(0, keys.indexOf(value)) }}>
      {!tiles && <span className="pay-ink" aria-hidden="true" />}
      {keys.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} className={`pp-${k}`} onClick={() => onChange(k)}>
          <span className="pp-ico">{ICON[k]}</span>
          {tiles ? <span className="pp-txt"><b>{PAY_METHODS[k]}</b><small>{SUB[k] || ''}</small></span> : PAY_METHODS[k]}
          {tiles && <i className="pp-tick" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></i>}
        </button>
      ))}
    </div>
  );
}
