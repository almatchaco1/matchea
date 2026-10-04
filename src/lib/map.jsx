// Real map for delivery (OpenStreetMap, no API key needed), loaded only when a map is shown.
//  mode="pick": the pin stays in the middle and the map moves under it (like Grab); onPick({lat,lng}) after each move.
//  mode="view": shows the shop, the customer's place and the road between them.
import { useEffect, useRef, useState } from 'react';
import './map.css';

let loading;
const loadLeaflet = () => (loading ||= Promise.all([import('./vendor/leaflet/leaflet-src.esm.js'), import('./vendor/leaflet/leaflet.css')]).then(([m]) => m));

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const shopIcon = (L) => L.divIcon({ className: 'mp-shop', html: '<span><img src="/brand/matchea-seal.webp" alt=""></span>', iconSize: [44, 44], iconAnchor: [22, 22] });
const homeIcon = (L) => L.divIcon({ className: 'mp-home', html: '<span><svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="10" r="2.6"/></svg></span>', iconSize: [40, 48], iconAnchor: [20, 46] });

export default function MapView({ mode = 'view', center, shop, dest, route, onPick, zoom = 16, className = '' }) {
  const box = useRef(null);
  const map = useRef(null);
  const L = useRef(null);
  const layers = useRef({});
  const lastPick = useRef(null);
  const [moving, setMoving] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPickRef = useRef(onPick); onPickRef.current = onPick;

  // Create the map once
  useEffect(() => {
    let dead = false;
    loadLeaflet().then((Lf) => {
      if (dead || !box.current) return;
      L.current = Lf;
      const start = center || dest || shop || { lat: 14.5995, lng: 120.9842 };
      const m = Lf.map(box.current, { zoomControl: mode === 'pick', attributionControl: true, scrollWheelZoom: mode === 'pick' ? 'center' : false, tap: true }).setView([start.lat, start.lng], zoom);
      Lf.tileLayer(TILES, { maxZoom: 19, attribution: ATTR, referrerPolicy: 'strict-origin-when-cross-origin', className: 'mp-tiles' }).addTo(m);
      if (mode === 'pick') {
        m.on('movestart', () => setMoving(true));
        m.on('moveend', () => {
          setMoving(false);
          const c = m.getCenter(); const p = { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) };
          if (lastPick.current && Math.abs(lastPick.current.lat - p.lat) < 1e-6 && Math.abs(lastPick.current.lng - p.lng) < 1e-6) return;
          lastPick.current = p;
          onPickRef.current?.(p, m.__byUser !== false);
          m.__byUser = true;
        });
      }
      map.current = m; setReady(true);
      setTimeout(() => m.invalidateSize(), 60);
    }).catch(() => setFailed(true));
    return () => { dead = true; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick mode: follow a new center from outside (search result, "use my location")
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || mode !== 'pick' || !center) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - center.lat) < 1e-5 && Math.abs(c.lng - center.lng) < 1e-5) return;
    m.__byUser = false;
    lastPick.current = null;
    m.flyTo([center.lat, center.lng], Math.max(m.getZoom(), zoom), { duration: 0.8 });
  }, [ready, center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Shop marker, customer marker and the road between them
  useEffect(() => {
    const m = map.current, Lf = L.current;
    if (!ready || !m || !Lf) return;
    const lay = layers.current;
    for (const k of Object.keys(lay)) { lay[k].remove(); delete lay[k]; }
    if (shop) lay.shop = Lf.marker([shop.lat, shop.lng], { icon: shopIcon(Lf), interactive: false, keyboard: false }).addTo(m);
    if (dest && mode === 'view') lay.dest = Lf.marker([dest.lat, dest.lng], { icon: homeIcon(Lf), interactive: false, keyboard: false }).addTo(m);
    if (route?.length > 1) {
      lay.glow = Lf.polyline(route, { color: '#FFF1D6', weight: 9, opacity: 0.9, lineCap: 'round' }).addTo(m);
      lay.route = Lf.polyline(route, { color: '#1F4A17', weight: 4.5, opacity: 0.95, lineCap: 'round', dashArray: mode === 'pick' ? '1 9' : null, className: 'mp-route' }).addTo(m);
    }
    if (mode === 'view') {
      const pts = [shop, dest].filter(Boolean).map((p) => [p.lat, p.lng]).concat(route || []);
      if (pts.length > 1) m.fitBounds(pts, { padding: [36, 36], maxZoom: 17 });
      else if (pts.length) m.setView(pts[0], zoom);
    }
  }, [ready, shop?.lat, shop?.lng, dest?.lat, dest?.lng, route, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`mp ${mode === 'pick' ? 'mp-pick' : 'mp-view'} ${moving ? 'moving' : ''} ${className}`}>
      <div ref={box} className="mp-map" />
      {mode === 'pick' && (
        <div className="mp-pin" aria-hidden="true">
          <svg viewBox="0 0 40 52"><path d="M20 50s16-14.5 16-28A16 16 0 0 0 4 22c0 13.5 16 28 16 28Z" /><circle cx="20" cy="21" r="6.5" /></svg>
          <i />
        </div>
      )}
      {!ready && !failed && <div className="mp-loading"><span className="spin" aria-hidden="true" />Loading map…</div>}
      {failed && <div className="mp-loading">The map couldn’t load. Check your connection.</div>}
    </div>
  );
}
