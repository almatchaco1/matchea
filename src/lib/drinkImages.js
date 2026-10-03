import { BUNDLED, imageFor, hasBundledImage, addonLabelsFor, photoUrl, sceneUrl } from '../shared/menu-defaults.mjs';

// Photos in public/drinks, for the picker in the drink editor.
export const DRINK_IMAGES = BUNDLED.map((s) => ({
  path: `/drinks/${s}.webp`,
  label: s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
}));

/** The drink's photo; falls back to the bundled one with the same name. */
export const imageOf = (p) => (p?.image ? photoUrl(p.image) : p && hasBundledImage(p.name) ? imageFor(p.name) : '');

/** Add-ons this drink allows. Drinks without their own list use the defaults for their name. */
export const allowedAddons = (product, settings) => {
  const all = settings?.addons || [];
  if (Array.isArray(product?.addons)) return all.filter((a) => product.addons.includes(String(a._id)));
  const labels = addonLabelsFor(product?.name || '').map((l) => l.toLowerCase());
  return all.filter((a) => labels.includes(a.label.toLowerCase()));
};

/** Flavor backdrop for a bundled drink photo: style for a box (as --scene) or for the <img> itself. */
export const sceneVar = (src) => { const u = sceneUrl(src); return u ? { '--scene': `url("${u}")` } : undefined; };
export const sceneBg = (src) => { const u = sceneUrl(src); return u ? { backgroundImage: `url("${u}")` } : undefined; };
