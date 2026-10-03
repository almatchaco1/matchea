// Search box for the shop pin map (Menu → Shop & options → Delivery): type a street, building or barangay,
// pick a result and the map jumps there. Also "use my location".
import { useEffect, useState } from 'react';

export default function PlaceSearch({ onGo }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setHits([]); setMsg(''); return undefined; }
    let dead = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/public/geo/search?q=${encodeURIComponent(s)}`);
        const d = await r.json().catch(() => []);
        if (dead) return;
        if (!r.ok) throw new Error(d.error || 'Search is not working right now. Move the map instead.');
        setHits(d); setMsg(d.length ? '' : 'No places found. Try a shorter name, or move the map.');
      } catch (e) { if (!dead) { setHits([]); setMsg(e.message === 'Failed to fetch' ? 'No internet connection.' : e.message); } }
      finally { if (!dead) setBusy(false); }
    }, 450);
    return () => { dead = true; clearTimeout(t); };
  }, [q]);

  const go = (h) => { onGo(h); setHits([]); setQ(''); setMsg(''); };
  const locate = () => {
    if (!navigator.geolocation) { setMsg('This browser can’t share its location. Search or move the map instead.'); return; }
    setLocating(true); setMsg('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); onGo({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); },
      () => { setLocating(false); setMsg('Couldn’t get your location. Allow location for this site, or search instead.'); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="ps">
      <div className="ps-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your shop’s street, building or barangay" aria-label="Search a place"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits[0]) go(hits[0]); } if (e.key === 'Escape') setHits([]); }} />
        <button type="button" className="ps-loc" onClick={locate} disabled={locating} title="Use my location" aria-label="Use my location">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></svg>
        </button>
        {(hits.length > 0 || busy) && (
          <ul className="ps-hits">
            {busy && !hits.length && <li className="muted">Searching…</li>}
            {hits.map((h, i) => <li key={i}><button type="button" onClick={() => go(h)}>{h.label}</button></li>)}
          </ul>
        )}
      </div>
      {msg && <small className="ps-msg">{msg}</small>}
    </div>
  );
}
