// Decorations the owner can turn on for the website (and the top string for the POS).
// Shared by the server (to check what is saved) and the browser (to draw them).

/** kind: 'string' hangs along the top of the header (one at a time),
 *        'hang' hangs from the bottom corners of the website header,
 *        'bg' floats in the website background. */
export const DECOR = [
  { id: 'lights', kind: 'string', label: 'Christmas lights', sub: 'Twinkling bulbs along the top' },
  { id: 'banderitas', kind: 'string', label: 'Fiesta banderitas', sub: 'Little flags that flutter' },
  { id: 'garland', kind: 'string', label: 'Leafy garland', sub: 'Matcha leaves and pink buds' },
  { id: 'parol', kind: 'hang', label: 'Parol stars', sub: 'Glowing star lanterns' },
  { id: 'lanterns', kind: 'hang', label: 'Paper lanterns', sub: 'Swaying pink lanterns' },
  { id: 'snow', kind: 'bg', label: 'Snow', sub: 'Soft falling snowflakes' },
  { id: 'sakura', kind: 'bg', label: 'Sakura petals', sub: 'Drifting cherry blossoms' },
  { id: 'hearts', kind: 'bg', label: 'Hearts', sub: 'Floating pink hearts' },
  { id: 'tealeaves', kind: 'bg', label: 'Matcha leaves', sub: 'Green tea leaves drifting' },
  { id: 'autumn', kind: 'bg', label: 'Autumn leaves', sub: 'Golden leaves tumbling' },
  { id: 'rain', kind: 'bg', label: 'Rain', sub: 'Gentle rainy-day drops' },
  { id: 'confetti', kind: 'bg', label: 'Confetti', sub: 'Party confetti twirling' },
  { id: 'balloons', kind: 'bg', label: 'Balloons', sub: 'Balloons rising up' },
  { id: 'bubbles', kind: 'bg', label: 'Bubbles', sub: 'Little bubbles floating up' },
  { id: 'sparkles', kind: 'bg', label: 'Sparkles', sub: 'Stars that twinkle' },
  { id: 'fireflies', kind: 'bg', label: 'Fireflies', sub: 'Glowing dots wandering' },
  { id: 'fireworks', kind: 'bg', label: 'Fireworks', sub: 'Bursts in the sky' },
];

export const GREETINGS = [
  'Maligayang Pasko! Merry Christmas from AL Matcha',
  'Happy New Year! Manigong Bagong Taon',
  'Happy Valentine’s! Share a matcha with someone sweet',
  'Sakura season: spring matcha days',
  'Tag-ulan? Stay cozy with a warm matcha',
  'Mabuhay! Happy fiesta from AL Matcha',
  'Happy anniversary to us! Thank you for your support',
];

export const GREETING_MAX = 80;
const IDS = new Set(DECOR.map((d) => d.id));
const KIND = Object.fromEntries(DECOR.map((d) => [d.id, d.kind]));

/** Keep only known decorations, in catalog order, and at most one top string. */
export function cleanDecor(list) {
  const want = new Set((Array.isArray(list) ? list : []).map(String).filter((x) => IDS.has(x)));
  let string = false;
  return DECOR.map((d) => d.id).filter((id) => {
    if (!want.has(id)) return false;
    if (KIND[id] === 'string') { if (string) return false; string = true; }
    return true;
  });
}

export const decorKind = (id) => KIND[id];
