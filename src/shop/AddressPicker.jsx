// Delivery address: move the map under the pin (or search / use my location), then house no. and landmark.
// Shows the road distance and the delivery fee (free from 5 drinks).
import { useEffect, useRef, useState } from 'react';
import { call } from './api';
import { peso } from '../lib/format';
import MapView from '../lib/map';

export default function AddressPicker({ cfg, drinks, value, onChange, quote, onQuote, errs = {} }) {
  const shop = { lat: cfg.lat, lng: cfg.lng };
  const [center, setCenter] = useState(value?.lat ? { lat: value.lat, lng: value.lng } : null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [locating, setLocating] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [qErr, setQErr] = useState('');
  const set = (patch) => onChange({ ...value, ...patch });
  const valRef = useRef(value); valRef.current = value;

  // Search places (debounced)
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setHits([]); setSearchMsg(''); return undefined; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { const r = await call('GET', `/public/geo/search?q=${encodeURIComponent(s)}`); setHits(r); setSearchMsg(r.length ? '' : 'No places found. Try a shorter name, or move the map.'); }
      catch (e) { setHits([]); setSearchMsg(e.message); }
      finally { setSearching(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  // Distance + fee whenever the pin or the number of drinks changes
  const pinKey = value?.pinned ? `${value.lat},${value.lng}` : '';
  useEffect(() => {
    if (!pinKey) { onQuote(null); return undefined; }
    let dead = false;
    setQuoting(true); setQErr('');
    const t = setTimeout(async () => {
      try { const r = await call('GET', `/public/delivery/quote?lat=${valRef.current.lat}&lng=${valRef.current.lng}&drinks=${drinks}`); if (!dead) onQuote(r); }
      catch (e) { if (!dead) { onQuote(null); setQErr(e.message); } }
      finally { if (!dead) setQuoting(false); }
    }, 300);
    return () => { dead = true; clearTimeout(t); };
  }, [pinKey, drinks]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (p) => {
    set({ lat: p.lat, lng: p.lng, pinned: true, label: '' });
    try { const r = await call('GET', `/public/geo/reverse?lat=${p.lat}&lng=${p.lng}`); if (valRef.current.lat === p.lat && valRef.current.lng === p.lng) onChange({ ...valRef.current, label: r.label || '' }); } catch { /* the label is only a help */ }
  };
  const goTo = (h) => { setCenter({ lat: h.lat, lng: h.lng }); setHits([]); setQ(''); };
  const locate = () => {
    if (!navigator.geolocation) { setSearchMsg('Your browser can’t share your location. Move the map instead.'); return; }
    setLocating(true); setSearchMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setCenter({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) }); },
      () => { setLocating(false); setSearchMsg('We couldn’t get your location. Allow location for this site, or move the map.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="ap">
      <div className="ap-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your street, building or barangay" aria-label="Search a place" />
        <button type="button" className="ap-locate" onClick={locate} disabled={locating} title="Use my location" aria-label="Use my location">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
        </button>
        {(hits.length > 0 || searching) && (
          <ul className="ap-hits">
            {searching && !hits.length && <li className="muted">Searching…</li>}
            {hits.map((h, i) => <li key={i}><button type="button" onClick={() => goTo(h)}>{h.label}</button></li>)}
          </ul>
        )}
      </div>
      {searchMsg && <small className="au-err">{searchMsg}</small>}
      <MapView mode="pick" center={center || (value?.lat ? { lat: value.lat, lng: value.lng } : shop)} shop={shop} route={quote?.route} onPick={pick} />
      <div className={`ap-where ${value?.pinned ? '' : 'hint'}`} aria-live="polite">
        {value?.pinned
          ? <><b>{value.label || 'Pinned on the map'}</b>{quoting ? <span>Checking the distance…</span> : quote && <span>{quote.km} km from the shop{quote.approx ? ' (about)' : ''}</span>}</>
          : <b>Move the map so the pin is on your place</b>}
      </div>
      {errs.pin && <small className="au-err" role="alert">{errs.pin}</small>}
      {qErr && <small className="au-err" role="alert">{qErr}</small>}
      {quote && (
        <div className={`ap-fee ${quote.tooFar ? 'far' : quote.free ? 'free' : ''}`}>
          {quote.tooFar ? <span>Sorry, that’s too far. We deliver up to {cfg.maxKm} km.</span>
            : quote.free ? <span><b>Free delivery</b> · your order has {cfg.freeDrinks}+ drinks <s>{peso(quote.fee)}</s></span>
            : <span><b>Delivery {peso(quote.charge)}</b>{quote.moreForFree > 0 && <> · add {quote.moreForFree} more {quote.moreForFree === 1 ? 'drink' : 'drinks'} for <b>free delivery</b></>}</span>}
        </div>
      )}
      <label className="au-field">
        <span>House / unit no. and street</span>
        <input value={value?.detail || ''} maxLength={120} onChange={(e) => set({ detail: e.target.value })} placeholder="e.g. Blk 4 Lot 12, Mabini St." aria-invalid={!!errs.detail} />
        {errs.detail && <small className="au-err" role="alert">{errs.detail}</small>}
      </label>
      <label className="au-field">
        <span>Landmark</span>
        <input value={value?.landmark || ''} maxLength={120} onChange={(e) => set({ landmark: e.target.value })} placeholder="e.g. Green gate beside 7-Eleven" aria-invalid={!!errs.landmark} />
        {errs.landmark && <small className="au-err" role="alert">{errs.landmark}</small>}
      </label>
      <label className="au-field">
        <span>Note for the rider <i className="opt">optional</i></span>
        <input value={value?.note || ''} maxLength={160} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Call when you’re outside" />
      </label>
    </div>
  );
}
