// Small touches: a drink "flies" into the cart, and the cart count bounces.
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The cart button that's on screen (header on computers, bottom tab on phones)
const cartEl = () => [...document.querySelectorAll('[data-cart]')].find((e) => e.offsetParent !== null) || null;

export function bumpCart() {
  const el = cartEl();
  if (!el) return;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); // restart the animation
}

/** Animate a copy of `img` from where it is to the cart button, then bump the cart. */
export function flyToCart(img) {
  const cart = cartEl();
  if (!img || !cart || calm()) { bumpCart(); return; }
  const a = img.getBoundingClientRect(), b = cart.getBoundingClientRect();
  if (!a.width) { bumpCart(); return; }
  const size = Math.min(a.width, a.height, 160);
  const ghost = img.cloneNode();
  Object.assign(ghost.style, {
    position: 'fixed', left: `${a.left + a.width / 2 - size / 2}px`, top: `${a.top + a.height / 2 - size / 2}px`,
    width: `${size}px`, height: `${size}px`, objectFit: 'contain', zIndex: 1000, pointerEvents: 'none', margin: 0, padding: 0,
    filter: 'drop-shadow(0 10px 12px rgba(29,46,24,.3))',
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = ghost.animate([
    { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 60}px) scale(.55) rotate(-8deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.12) rotate(-14deg)`, opacity: 0.4 },
  ], { duration: 650, easing: 'cubic-bezier(.45,.05,.35,1)' });
  anim.onfinish = () => { ghost.remove(); bumpCart(); };
}
