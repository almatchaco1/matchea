// Photos and allowed add-ons for the Matchéa menu (shared by the server and the React app).
// Used by seed.js (new databases) and update-menu.js (existing databases).

export const slug = (name) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const PHOTO_V = 9; // bump when the photos in public/drinks change, so browsers fetch the new ones
// Bundled photos are cut-outs (transparent background, .webp); the old .jpg paths saved in the database map to them
export const imageFor = (name) => `/drinks/${slug(name)}.webp?v=${PHOTO_V}`;
/** A bundled photo path saved in the database -> the current cut-out photo. */
export const photoUrl = (src) => {
  const m = /^\/drinks\/([\w-]+)\.(jpe?g|webp|png)$/.exec(src || '');
  return m && BUNDLED.includes(m[1]) ? `/drinks/${m[1]}.webp?v=${PHOTO_V}` : src;
};
/** The flavor scene (cup on its own flavor backdrop) for a bundled photo, or null for other photos. */
export const sceneUrl = (src) => {
  const m = /^\/drinks\/([\w-]+)\.(?:jpe?g|webp|png)(?:\?.*)?$/.exec(src || '');
  return m && BUNDLED.includes(m[1]) ? `/drinks/scene/${m[1]}.webp?v=${PHOTO_V}` : null;
};
// Photos that ship in public/drinks (cropped from the Matchéa menu)
export const BUNDLED = ['matcha-latte', 'strawberry-matcha-latte', 'mango-matcha-latte', 'creme-brulee-matcha-latte', 'kinako-dango-matcha-latte',
  'banana-pudding-matcha-latte', 'putobumbong-matcha-latte', 'smores-matcha-latte', 'caramel-matcha-latte', 'salted-caramel-matcha-latte', 'cinnamon-bun-matcha-latte'];
export const hasBundledImage = (name) => BUNDLED.includes(slug(name));

// Every drink offers only Extra Matcha.
export const EXTRA_MATCHA = 'Extra Matcha';
export const addonLabelsFor = () => [EXTRA_MATCHA];

/** Turn add-on labels into the ids stored in Settings.addons. */
export const addonIdsFor = (name, settingsAddons) =>
  addonLabelsFor(name)
    .map((label) => settingsAddons.find((a) => a.label.toLowerCase() === label.toLowerCase()))
    .filter(Boolean)
    .map((a) => String(a._id));
