// Seasonal decorations, picked from today's date (Philippine "ber months" = Christmas season).
// Colors stay in the AL Matcha palette: matcha green, blush pink, cream and a little gold.
import './season.css';

export function seasonOf(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if (m >= 9) return 'christmas';
  if (m === 1 && day <= 7) return 'newyear';
  if (m === 2 && day <= 14) return 'valentine';
  if (m >= 3 && m <= 5) return 'sakura';
  if (m >= 6 && m <= 8) return 'rain';
  return null;
}

export const GREETING = {
  christmas: 'Maligayang Pasko! Merry Christmas from AL Matcha',
  newyear: 'Happy New Year! Manigong Bagong Taon',
  valentine: 'Happy Valentine’s! Share a matcha with someone sweet',
  sakura: 'Sakura season: spring matcha days',
  rain: 'Tag-ulan? Stay cozy with a warm matcha',
};

const rand = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };

/** A string of twinkling lights along the top of a header (Christmas / New Year). */
export function Lights({ season, count = 22 }) {
  if (season !== 'christmas' && season !== 'newyear') return null;
  return (
    <div className="xlights" aria-hidden="true">
      <svg className="xl-wire" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 2 Q 2.5 7 5 2 T 10 2 T 15 2 T 20 2 T 25 2 T 30 2 T 35 2 T 40 2 T 45 2 T 50 2 T 55 2 T 60 2 T 65 2 T 70 2 T 75 2 T 80 2 T 85 2 T 90 2 T 95 2 T 100 2" /></svg>
      {Array.from({ length: count }, (_, i) => <i key={i} className={`c${i % 4}`} style={{ left: `${(i + 0.5) * (100 / count)}%`, animationDelay: `${(rand(i, 1) * 2.4).toFixed(2)}s` }} />)}
    </div>
  );
}

/** Gently falling snow / petals / hearts / rain in the background. */
export function Falling({ season, count = 18 }) {
  if (!season || season === 'newyear') return null;
  const n = season === 'rain' ? count + 10 : count;
  return (
    <div className={`falling f-${season}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{
          left: `${(rand(i, 2) * 100).toFixed(1)}%`,
          animationDelay: `${(-rand(i, 3) * 14).toFixed(2)}s`,
          animationDuration: `${(season === 'rain' ? 1.4 + rand(i, 4) * 1.2 : 9 + rand(i, 4) * 9).toFixed(2)}s`,
          '--s': (0.6 + rand(i, 5) * 0.8).toFixed(2),
          '--dx': `${Math.round((rand(i, 6) - 0.5) * 120)}px`,
        }} />
      ))}
    </div>
  );
}
