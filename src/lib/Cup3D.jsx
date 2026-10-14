// The Matchéa cup in real 3D (three.js). Used inside the drink stage on the customer site and the POS.
// - The cup is built from the drink's own photo: its exact shape (round latte cup or square cup), and the drink
//   itself is the photo wrapped around the 3D body, so every drink looks exactly like itself, all the way round.
// - The real Matchéa sticker / print sits on the front, sharp, in the brand artwork.
// - Clear plastic that catches the studio light (soft streaks, bright edges), cold drops of condensation,
//   a soft shadow with a little coloured glow from the drink.
// - Sweetness: golden syrup settles in the cup up to the chosen level, with drizzle streaks down the wall.
//   Extra matcha: a deep green swirl folds into the top of the drink.
// - Drag (or swipe) to spin it; left alone it sways gently. It glides in with a shine when it appears.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildToppings, TOPPINGS } from './toppings3d';

const FOV = 22;
const DIST = 1 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)); // the 2×2 square around the centre fills the box
const ELEV = THREE.MathUtils.degToRad(12); // we look at the cup a little from above, like the photos

// Where the logo is on each bundled photo (measured from the photos).
// c: round sticker [centre u, centre v, radius]   r: printed logo [left, top, right, bottom]
const LOGO = {
  'banana-pudding-matcha-latte': ['c', 0.493, 0.612, 0.145],
  'caramel-matcha-latte': ['c', 0.492, 0.666, 0.163],
  'cinnamon-bun-matcha-latte': ['c', 0.503, 0.675, 0.156],
  'creme-brulee-matcha-latte': ['c', 0.489, 0.636, 0.158],
  'kinako-dango-matcha-latte': ['c', 0.488, 0.621, 0.153],
  'mango-matcha-latte': ['c', 0.507, 0.615, 0.148],
  'matcha-latte': ['c', 0.49, 0.597, 0.152],
  'putobumbong-matcha-latte': ['c', 0.492, 0.616, 0.152],
  'salted-caramel-matcha-latte': ['c', 0.494, 0.662, 0.166],
  'smores-matcha-latte': ['c', 0.494, 0.621, 0.154],
  'strawberry-matcha-latte': ['c', 0.496, 0.598, 0.145],
  'banana-pudding-matcha': ['r', 0.345, 0.593, 0.67, 0.657],
  'berry-matcha-strawberry': ['r', 0.345, 0.605, 0.665, 0.665],
  'caramel-bliss-matcha': ['r', 0.345, 0.598, 0.665, 0.657],
  'classic-matcha-latte': ['r', 0.342, 0.605, 0.672, 0.665],
  'coconut-matcha-cloud': ['r', 0.345, 0.595, 0.672, 0.652],
  'creme-brulee-matcha': ['r', 0.345, 0.59, 0.675, 0.652],
  'kinako-dango-seasalt-matcha': ['r', 0.347, 0.585, 0.677, 0.65],
  'pistachio-kataifi-matcha': ['r', 0.34, 0.588, 0.672, 0.652],
  'putobumbong-matcha': ['r', 0.33, 0.595, 0.66, 0.66],
};
const WORD = '/brand/matchea-word.png'; // the Matchéa wordmark
const WORD_ASPECT = 900 / 274;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// a point on a rounded square (n = 2 is a circle) of half-size r, angle t
const sq = (t, r, n) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * r, Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * r];
};
// how far the front of that rounded square comes out at x
const frontZ = (x, r, n) => (Math.abs(x) >= r ? 0 : r * Math.pow(1 - Math.pow(Math.abs(x) / r, n), 1 / n));

/** A surface of revolution with a rounded-square cross-section: profile = [[y, r], ...] from bottom to top. */
function shell(profile, n, seg = 96, uvOf = null) {
  const pos = [], uvs = [], idx = [];
  const cols = seg + 1;
  profile.forEach(([y, r]) => {
    for (let i = 0; i <= seg; i++) {
      const t = -Math.PI / 2 + (i / seg) * Math.PI * 2; // the seam is at the back
      const [x, z] = sq(t, r, n);
      pos.push(x, y, z);
      if (uvOf) uvs.push(...uvOf(x, y, z));
    }
  });
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < seg; i++) {
    const a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uvOf) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A soft studio for reflections: a dim room with two tall softboxes and a top light. */
function studio() {
  const s = new THREE.Scene();
  const geos = [];
  const room = new THREE.BoxGeometry(14, 14, 14); geos.push(room);
  s.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ color: 0x1c1a17, side: THREE.BackSide })));
  const panel = (w, h, p, k, col = 0xffffff) => {
    const g = new THREE.PlaneGeometry(w, h); geos.push(g);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...p); m.lookAt(0, 0, 0); s.add(m);
  };
  panel(1.1, 7, [-3.6, 0.8, 2.8], 3.4);           // tall softbox, front left: the long bright streak
  panel(0.5, 7, [3.7, 0.4, 1.6], 2.6);             // thin strip, right
  panel(5, 5, [0, 6, 0.8], 1.6);                   // top
  return { scene: s, dispose: () => geos.forEach((g) => g.dispose()) };
}

/** Read the photo: the cup's outline row by row, and a copy of the drink with the logo taken out (for the 3D body). */
function readPhoto(img, logo) {
  const S = Math.min(768, img.naturalWidth || 768);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, S, S);
  const data = x.getImageData(0, 0, S, S);
  const d = data.data;
  const xl = new Float32Array(S).fill(-1), xr = new Float32Array(S).fill(-1);
  for (let y = 0; y < S; y++) {
    const row = y * S * 4;
    let a = -1, b = -1;
    for (let i = 0; i < S; i++) if (d[row + i * 4 + 3] > 110) { a = i; break; }
    if (a < 0) continue;
    for (let i = S - 1; i >= a; i--) if (d[row + i * 4 + 3] > 110) { b = i; break; }
    xl[y] = a; xr[y] = b;
  }
  const w = (y) => (xl[y] < 0 ? 0 : xr[y] - xl[y]);
  // the rim: the widest row in the top half; the bottom: the last row with cup
  let rim = Math.round(S * 0.25), best = 0;
  for (let y = Math.round(S * 0.12); y < Math.round(S * 0.46); y++) if (w(y) > best) { best = w(y); rim = y; }
  let bot = S - 1;
  while (bot > rim && w(bot) < S * 0.08) bot--;

  // the drink with the logo taken out: fill it from the same row on both sides (mirrored), so the back looks right
  const holes = [];
  if (logo?.[0] === 'c') holes.push({ c: true, cx: logo[1] * S, cy: logo[2] * S, r: logo[3] * S * 1.06 });
  if (logo?.[0] === 'r') { const m = 0.012 * S; holes.push({ c: false, x0: logo[1] * S - m, y0: logo[2] * S - m, x1: logo[3] * S + m, y1: logo[4] * S + m }); }
  const src = new Uint8ClampedArray(d);
  const filled = [];
    for (const h of holes) {
    const ya = Math.max(0, Math.floor(h.c ? h.cy - h.r : h.y0)), yb = Math.min(S - 1, Math.ceil(h.c ? h.cy + h.r : h.y1));
    for (let y = ya; y <= yb; y++) {
      if (xl[y] < 0) continue;
      let a, b;
      if (h.c) { const dy = y - h.cy; if (Math.abs(dy) >= h.r) continue; const hw = Math.sqrt(h.r * h.r - dy * dy); a = Math.round(h.cx - hw); b = Math.round(h.cx + hw); }
      else { a = Math.round(h.x0); b = Math.round(h.x1); }
      const L = xl[y] + S * 0.035, R = xr[y] - S * 0.035;
      a = Math.round(Math.max(a, L + 3)); b = Math.round(Math.min(b, R - 3));
      if (b <= a + 1) continue;
      const mid = (a + b) / 2, fw = Math.max(4, (b - a) * 0.12);
      const row = y * S * 4;
      const at = (sx, k) => { const i0 = Math.floor(sx), f = sx - i0; return src[row + i0 * 4 + k] * (1 - f) + src[row + (i0 + 1) * 4 + k] * f; };
      for (let i = a; i <= b; i++) {
        // mirror the drink beside the hole into it, stretched to fit (no repeats)
        const sl = a - 1 - ((i - a) / Math.max(1, mid - a)) * Math.max(1, a - 1 - L);
        const sr = b + 1 + ((b - i) / Math.max(1, b - mid)) * Math.max(1, R - b - 1);
        const t = clamp((i - (mid - fw)) / (2 * fw), 0, 1); // cross-fade the two halves in the middle
        for (let k = 0; k < 3; k++) d[row + i * 4 + k] = at(clamp(sl, L, a), k) * (1 - t) + at(clamp(sr, b, R), k) * t;
        filled.push(y, i);
        d[row + i * 4 + 3] = 255;
      }
    }
  }
  // smooth the filled part top to bottom: mostly a soft blend between the rows just above and below it
  if (filled.length) {
    const top = new Map(), bot = new Map();
    for (let q = 0; q < filled.length; q += 2) { const y = filled[q], i = filled[q + 1]; if (!top.has(i) || y < top.get(i)) top.set(i, y); if (!bot.has(i) || y > bot.get(i)) bot.set(i, y); }
    const mixed = new Uint8ClampedArray(d);
    for (let q = 0; q < filled.length; q += 2) {
      const y = filled[q], i = filled[q + 1], y0 = Math.max(0, top.get(i) - 2), y1 = Math.min(S - 1, bot.get(i) + 2);
      const f = (y - y0) / Math.max(1, y1 - y0), o = (y * S + i) * 4;
      for (let k = 0; k < 3; k++) mixed[o + k] = (src[(y0 * S + i) * 4 + k] * (1 - f) + src[(y1 * S + i) * 4 + k] * f) * 0.65 + d[o + k] * 0.35;
    }
    d.set(mixed);
  }
  // let the drink's colours run out past its edges (no dark seams where the texture is sampled at the very edge)
  for (let y = 0; y < S; y++) {
    if (xl[y] < 0) continue;
    const row = y * S * 4, a = xl[y] + 3, b = xr[y] - 3;
    for (let i = 0; i < S; i++) {
      if (i >= a && i <= b) continue;
      const s2 = i < a ? a : b;
      for (let k = 0; k < 4; k++) d[row + i * 4 + k] = d[row + s2 * 4 + k];
      d[row + i * 4 + 3] = 255;
    }
  }
  x.putImageData(data, 0, 0);
  // an average colour of the drink, for the glow under the cup
  let rr = 0, gg = 0, bb = 0, nn = 0;
  for (let y = Math.round(lerp(rim, bot, 0.3)); y < Math.round(lerp(rim, bot, 0.9)); y += 6) {
    if (xl[y] < 0) continue;
    for (let i = xl[y] + 10; i < xr[y] - 10; i += 6) { const o = (y * S + i) * 4; rr += src[o]; gg += src[o + 1]; bb += src[o + 2]; nn++; }
  }
  const glow = nn ? new THREE.Color(rr / nn / 255, gg / nn / 255, bb / nn / 255) : new THREE.Color(0.75, 0.85, 0.6);
  glow.convertSRGBToLinear();
  // the top of the toppings (ignoring thin skewers)
  let top = 0;
  while (top < rim && w(top) < best * 0.35) top++;
  return { S, xl, xr, rimV: rim / S, botV: bot / S, topV: top / S, canvas: c, glow };
}

/** The round Matchéa sticker (cream, gold ring, wordmark), drawn sharp. */
function stickerCanvas(word) {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), m = N / 2;
  const g = x.createRadialGradient(m * 0.8, m * 0.7, 10, m, m, m);
  g.addColorStop(0, '#FBF7EC'); g.addColorStop(0.75, '#F5EEDC'); g.addColorStop(1, '#EADDBF');
  x.fillStyle = g; x.beginPath(); x.arc(m, m, m - 2, 0, Math.PI * 2); x.fill();
  x.lineWidth = 13; x.strokeStyle = '#D8BF8C'; x.beginPath(); x.arc(m, m, m - 10, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.strokeStyle = 'rgba(255,250,235,.9)'; x.beginPath(); x.arc(m, m, m - 17, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 2; x.strokeStyle = 'rgba(190,160,105,.55)'; x.beginPath(); x.arc(m, m, m - 34, 0, Math.PI * 2); x.stroke();
  if (word) { const w = N * 0.88, h = w / WORD_ASPECT; x.drawImage(word, m - w / 2, m - h / 2 + 4, w, h); }
  return c;
}

const NOISE = /* glsl */`
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

/** Clear plastic: only reflections and a soft haze at the edges, so you see the drink through it. */
function plasticMaterial(u, { hazeMin = 0.02, hazeMax = 0.5, side = THREE.FrontSide, env = 1.5 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.5, specularIntensity: 1, envMapIntensity: env, transparent: true, premultipliedAlpha: true, depthWrite: false, side });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHaze = { value: new THREE.Vector2(hazeMin, hazeMax) };
    sh.uniforms.uSweep = u.uSweep; sh.uniforms.uRes = u.uRes;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec2 uHaze; uniform float uSweep; uniform vec2 uRes;\nvoid main() {')
      .replace('#include <opaque_fragment>', `
        float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
        float haze = uHaze.x + uHaze.y * pow(1.0 - ndv, 3.0);
        vec2 sp = gl_FragCoord.xy / uRes;
        float sweep = exp(-pow((sp.x * 0.9 + sp.y * 0.45 - uSweep) / 0.045, 2.0)) * 0.55 * (0.4 + 0.6 * ndv);
        gl_FragColor = vec4(outgoingLight + vec3(1.0, 0.99, 0.96) * haze + vec3(sweep), clamp(haze + sweep * 0.4, 0.0, 1.0));`)
      .replace('#include <premultiplied_alpha_fragment>', '');
  };
  m.customProgramCacheKey = () => `plastic-${hazeMin}-${hazeMax}`;
  return m;
}

export default function Cup3D({ image, sweet = 0, matcha = false, onReady }) {
  const host = useRef(null);
  const live = useRef({ sweet, matcha });
  live.current.sweet = sweet; live.current.matcha = matcha;

  useEffect(() => {
    const el = host.current;
    if (!el || !image) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'low-power', premultipliedAlpha: true });
    } catch { return undefined; } // no 3D on this device: the photo stays
    let disposed = false, raf = 0, built = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const disposables = [];
    const keep = (o) => { disposables.push(o); return o; };

    const scene = new THREE.Scene();
    const pmrem = keep(new THREE.PMREMGenerator(renderer));
    const st = studio();
    scene.environment = keep(pmrem.fromScene(st.scene, 0.025).texture);
    st.dispose();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    camera.position.set(0, DIST * Math.sin(ELEV), DIST * Math.cos(ELEV));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    scene.add(new THREE.HemisphereLight(0xfff8ec, 0x6a7456, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(-1.6, 2.4, 2.6); scene.add(key);
    const back = new THREE.DirectionalLight(0xfff0d6, 1.2); back.position.set(2, 1.5, -2); scene.add(back);

    const u = { uSweep: { value: -1 }, uRes: { value: new THREE.Vector2(1, 1) } };
    const holder = new THREE.Group(); scene.add(holder);   // grows in when it appears
    const pivot = new THREE.Group(); holder.add(pivot);    // sits where the photo's cup is
    const spin = new THREE.Group(); pivot.add(spin);       // turns

    // where a point lands in the box (0..1, like the photo), seen in the resting pose
    const v3 = new THREE.Vector3();
    const toPhoto = (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x + 1) / 2, (1 - v3.y) / 2]; };
    // the height (at the cup's middle depth) that lands on photo row v
    const yAt = (v, z = 0) => { let a = -2, b = 2; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (toPhoto(0, m, z)[1] > v) a = m; else b = m; } return (a + b) / 2; };

    // drink texture uniforms (filled in once the photo is read)
    const du = {
      map: { value: null }, uTime: { value: 0 }, uHoneyY: { value: -9 }, uSweet: { value: 0 }, uMatcha: { value: 0 }, uSwirl: { value: 0 },
      uTopY: { value: 0 }, uBotY: { value: -1 },
      uHoney: { value: new THREE.Color('#F6C453').convertSRGBToLinear() }, uMatchaC: { value: new THREE.Color('#5C9A2C').convertSRGBToLinear() },
    };
    const drinkMat = keep(new THREE.ShaderMaterial({
      uniforms: du,
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
        void main(){ vUv = uv; vL = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform float uTime, uHoneyY, uSweet, uMatcha, uSwirl, uTopY, uBotY; uniform vec3 uHoney, uMatchaC;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vL;
        ${NOISE}
        float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        void main(){
          vec3 c = texture2D(map, vUv).rgb;
          vec3 n = normalize(vN), v = normalize(vV);
          float ndv = clamp(dot(n, v), 0.0, 1.0);
          float lam = clamp(dot(n, normalize(vec3(-0.35, 0.55, 0.75))), 0.0, 1.0);
          c *= 0.9 + 0.16 * lam;                                   // soft light from the front left
          c *= mix(0.8, 1.0, smoothstep(0.05, 0.6, ndv));           // a little deeper towards the sides
          float ang = atan(vL.z, vL.x), y = vL.y;
          // sweetness: golden syrup up to the level, with drizzle streaks above it
          float hv = smoothstep(0.0, 0.03, uSweet);
          if (hv > 0.0) {
            float n1 = vnoise(vec3(ang * 1.7, y * 9.0, uTime * 0.35));
            float inH = 1.0 - smoothstep(uHoneyY - 0.012, uHoneyY + 0.012, y + (n1 - 0.5) * 0.035);
            float span = max(0.001, (uTopY - uHoneyY) * (0.25 + 0.55 * uSweet));
            float s = sin(ang * 7.0 + vnoise(vec3(ang * 2.0, y * 2.6, 3.0)) * 6.0);
            float drz = smoothstep(0.8, 0.97, s) * (1.0 - smoothstep(0.0, span, y - uHoneyY)) * step(uHoneyY, y);
            float k = max(inH * (0.2 + 0.14 * uSweet), drz * 0.6) * hv;
            vec3 gold = uHoney / lum(uHoney) * (0.06 + 0.98 * lum(c));   // the same brightness, in gold
            c = mix(c, gold, k) + uHoney * 0.06 * k;   // a soft golden glow
            c += uHoney * 0.22 * exp(-pow((y - uHoneyY) / 0.006, 2.0)) * hv * (1.0 - step(0.985, uSweet)); // the shiny line on top
          }
          // extra matcha: a deep green swirl folding into the top of the drink
          if (uMatcha > 0.001) {
            float n2 = vnoise(vec3(ang * 1.3 + uTime * uSwirl * 1.6, y * 4.0, uTime * 0.12));
            float band = smoothstep(uTopY - 1.15, uTopY - 0.5, y + (n2 - 0.5) * 0.4);
            float sw = smoothstep(0.45, 0.9, sin(ang * 3.0 + y * 11.0 + n2 * 6.0 + uTime * uSwirl * 3.5));
            float m = clamp(band * (0.62 + 0.38 * sw), 0.0, 1.0) * uMatcha;
            c = mix(c, uMatchaC / lum(uMatchaC) * (0.04 + 0.5 * lum(c)), m * 0.9);
          }
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));

    // the toppings and the top of the drink: straight from the photo, always facing you
    const bu = { map: { value: null }, uCut: { value: 0.3 }, uDip: { value: 0.03 }, uCx: { value: 0.5 }, uHw: { value: 0.25 }, uIn: { value: 0 } };
    const billMat = keep(new THREE.ShaderMaterial({
      uniforms: bu, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform float uCut, uDip, uCx, uHw, uIn; varying vec2 vUv;
        void main(){
          vec4 t = texture2D(map, vUv);
          float v = 1.0 - vUv.y, e = clamp((vUv.x - uCx) / uHw, -1.0, 1.0);
          float cut = uCut + uDip * sqrt(1.0 - e * e);             // the front rim of the cup
          float a = t.a * (1.0 - smoothstep(cut - 0.012, cut + 0.002, v)) * uIn;
          gl_FragColor = vec4(t.rgb, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    const bill = new THREE.Mesh(keep(new THREE.PlaneGeometry(2, 2)), billMat);
    bill.quaternion.copy(camera.quaternion); bill.renderOrder = 3; bill.visible = false; holder.add(bill);

    // pieces that are made once the photo is read
    let drink = null, rimY = 0, botY = -0.9, liqTop = 0, liqBot = -0.85;

    const build = (img) => {
      const slug = (String(image).match(/\/drinks\/([a-z0-9-]+)\.webp/) || [])[1];
      const logo = LOGO[slug] || null;
      const p = readPhoto(img, logo);
      const { S, xl, xr } = p;
      const round = logo ? logo[0] === 'c' : true;
      const n = round ? 2 : 3.6;
      // the photo's cup is a little left or right of centre: move the 3D cup there too
      let cxs = 0, cn = 0;
      for (let y = Math.round(lerp(p.rimV, p.botV, 0.2) * S); y < Math.round(lerp(p.rimV, p.botV, 0.8) * S); y++) if (xl[y] >= 0) { cxs += (xl[y] + xr[y]) / 2 / S; cn++; }
      const cxU = cn ? cxs / cn : 0.5;
      // the outline: a smooth curve through the photo's cup sides (rim to near the bottom)
      const pts = [];
      for (let v = p.rimV + 0.025; v < p.botV - 0.06; v += 1 / 160) {
        const y = Math.round(v * S); if (xl[y] < 0) continue;
        const yy = yAt(v);
        const sx = toPhoto(1, yy, 0)[0] - toPhoto(0, yy, 0)[0]; // photo width of one unit at that height
        pts.push([yy, ((xr[y] - xl[y]) / S / 2) / sx]);
      }
      // least squares: r = a + b·y + c·y²
      const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
      pts.forEach(([y, r]) => { const f = [1, y, y * y]; for (let i = 0; i < 3; i++) { B[i] += f[i] * r; for (let j = 0; j < 3; j++) A[i][j] += f[i] * f[j]; } });
      const solve = (M, b) => { const m = M.map((row, i) => [...row, b[i]]); for (let i = 0; i < 3; i++) { let piv = i; for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[piv][i])) piv = k; [m[i], m[piv]] = [m[piv], m[i]]; for (let k = i + 1; k < 3; k++) { const f = m[k][i] / m[i][i]; for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]; } } const x = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let s = m[i][3]; for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j]; x[i] = s / m[i][i]; } return x; };
      const [ca, cb, cc] = pts.length > 8 ? solve(A, B) : [0.42, 0.05, 0];
      const rAt = (y) => clamp(ca + cb * y + cc * y * y, 0.2, 0.7);
      rimY = yAt(p.rimV);
      // the bottom: its front edge lands on the photo's lowest row
      botY = yAt(p.botV);
      for (let i = 0; i < 6; i++) { const z = frontZ(0, rAt(botY), n); botY += (yAt(p.botV, z) - botY); }
      pivot.position.x = ((cxU - 0.5) * 2) / (toPhoto(1, 0, 0)[0] * 2 - 1);

      // --- clear plastic cup with a rolled rim ---
      const rb = rAt(botY), rr = rAt(rimY);
      const prof = [[botY, 0], [botY, rb * 0.6], [botY, rb - 0.03], [botY + 0.006, rb - 0.01], [botY + 0.024, rAt(botY + 0.024)]];
      for (let k = 1; k <= 24; k++) { const y = lerp(botY + 0.024, rimY - 0.012, k / 24); prof.push([y, rAt(y)]); }
      for (let k = 0; k <= 12; k++) { const a = lerp(-Math.PI / 2, Math.PI * 1.05, k / 12); prof.push([rimY + 0.002 + Math.sin(a) * 0.014, rr + 0.008 + Math.cos(a) * 0.014]); }
      const cupGeo = keep(shell(prof, n, 120));
      const backMat = keep(plasticMaterial(u, { hazeMin: 0.0, hazeMax: 0.06, side: THREE.BackSide, env: 0.35 }));
      const frontMat = keep(plasticMaterial(u, { hazeMin: 0.01, hazeMax: 0.16, env: 0.75 }));
      const cupBack = new THREE.Mesh(cupGeo, backMat); cupBack.renderOrder = 1; spin.add(cupBack);
      const cupFront = new THREE.Mesh(cupGeo, frontMat); cupFront.renderOrder = 6; spin.add(cupFront);

      // --- the drink: the photo wrapped around a body just inside the plastic ---
      const has3DTop = !!TOPPINGS[slug];
      liqTop = rimY - (has3DTop ? 0.13 : 0.045); liqBot = botY + 0.034; // with 3D toppings, they fill the cup's top part
      const ins = 0.028;
      const ring = (k, y, r) => [y, r * k];
      const dprof = [[liqBot, 0], ring(0.5, liqBot, rAt(liqBot) - ins), [liqBot, rAt(liqBot) - ins - 0.012], [liqBot + 0.012, rAt(liqBot + 0.012) - ins]];
      for (let k = 1; k <= 40; k++) { const y = lerp(liqBot + 0.012, liqTop, k / 40); dprof.push([y, rAt(y) - ins]); }
      for (const k of [0.75, 0.5, 0.25, 0]) dprof.push([liqTop, (rAt(liqTop) - ins) * k]);
      const off = pivot.position.x;
      const tex = keep(new THREE.CanvasTexture(p.canvas));
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
      du.map.value = tex; du.uTopY.value = liqTop; du.uBotY.value = liqBot;
      drink = new THREE.Mesh(keep(shell(dprof, n, 120, (x, y, z) => { const [pu, pv] = toPhoto(x + off, y, Math.abs(z)); return [pu, 1 - pv]; })), drinkMat);
      drink.renderOrder = 0; spin.add(drink);

      // --- toppings: real 3D ones for our drinks (with a clear dome lid over them) ---
      const baseTop = rimY - 0.035;
      const tp = has3DTop ? buildToppings(slug, { n, rdAt: (y) => rAt(y) - ins, liqTop, baseTop, height: clamp(yAt(p.topV) - baseTop - 0.05, 0.08, 0.3) }, keep) : null;
      if (tp) {
        spin.add(tp.group);
        const y0 = rimY + 0.02, R0 = rr + 0.014, H = clamp(tp.topY - y0 + 0.025, 0.08, 0.36);
        const lid = [[rimY - 0.006, rr + 0.012], [rimY + 0.012, rr + 0.024], [y0, rr + 0.02], [y0, R0]];
        for (let k = 1; k <= 18; k++) { const a = (k / 18) * Math.PI / 2; lid.push([y0 + H * Math.pow(Math.sin(a), 0.85), R0 * Math.pow(Math.cos(a), 0.6) * (k === 18 ? 0 : 1)]); }
        const lidGeo = keep(shell(lid, n, 120));
        const lidBack = new THREE.Mesh(lidGeo, backMat); lidBack.renderOrder = 1; spin.add(lidBack);
        const lidFront = new THREE.Mesh(lidGeo, keep(plasticMaterial(u, { hazeMin: 0.004, hazeMax: 0.08, env: 0.18 }))); lidFront.renderOrder = 6; spin.add(lidFront);
      }
      // --- other drinks: their toppings straight from the photo, facing you ---
      const otex = keep(new THREE.Texture(img)); otex.colorSpace = THREE.SRGBColorSpace; otex.anisotropy = 4; otex.needsUpdate = true;
      bu.map.value = otex;
      const sideV = toPhoto(rr + off, rimY, 0)[1];
      bu.uCut.value = sideV; bu.uDip.value = toPhoto(off, rimY, frontZ(0, rr, n))[1] - sideV;
      bu.uCx.value = toPhoto(off, rimY, 0)[0]; bu.uHw.value = toPhoto(rr + off, rimY, 0)[0] - bu.uCx.value;
      bill.visible = !tp;

      // --- the logo on the front: the round sticker, or the printed wordmark ---
      if (logo) {
        const word = new Image(); word.decoding = 'async';
        word.onload = () => {
          if (disposed) return;
          let cxN, cyN, hw, hh, tx;
          if (logo[0] === 'c') {
            cxN = logo[1]; cyN = logo[2]; hw = hh = logo[3] * 1.04;
            tx = keep(new THREE.CanvasTexture(stickerCanvas(word)));
          } else {
            cxN = (logo[1] + logo[3]) / 2; cyN = (logo[2] + logo[4]) / 2 + 0.002; hw = ((logo[3] - logo[1]) / 0.94) / 2; hh = hw / WORD_ASPECT;
            { const wc = document.createElement("canvas"); wc.width = 1024; wc.height = Math.round(1024 / WORD_ASPECT); wc.getContext("2d").drawImage(word, 0, 0, wc.width, wc.height); tx = keep(new THREE.CanvasTexture(wc)); }
          }
          tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
          // lay a grid over that spot of the photo onto the front of the cup
          const G = 28, pos = [], uvs = [], idx = [], ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
          for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
            const pu = cxN - hw + (2 * hw * i) / G, pv = cyN + hh - (2 * hh * j) / G;
            ndc.set(pu * 2 - 1, 1 - pv * 2); ray.setFromCamera(ndc, camera);
            let zc = rr; const hit = new THREE.Vector3();
            for (let k = 0; k < 8; k++) { // where the ray meets the front of the cup
              const t = (zc - ray.ray.origin.z) / ray.ray.direction.z; hit.copy(ray.ray.direction).multiplyScalar(t).add(ray.ray.origin);
              zc = frontZ(hit.x - off, rAt(hit.y), n);
            }
            const r0 = rAt(hit.y), nx = Math.pow(Math.abs(hit.x - off) / r0, n - 1) * Math.sign(hit.x - off), nz = Math.pow(zc / r0, n - 1);
            const ln = Math.hypot(nx, nz) || 1;
            pos.push(hit.x - off + (nx / ln) * 0.004, hit.y, zc + (nz / ln) * 0.004); uvs.push(i / G, j / G);
          }
          for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = j * (G + 1) + i; idx.push(a, a + 1, a + G + 1, a + 1, a + G + 2, a + G + 1); }
          const g = keep(new THREE.BufferGeometry());
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
          const mat = keep(new THREE.MeshPhysicalMaterial({ map: tx, transparent: true, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.3, envMapIntensity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
          mat.color.setScalar(0.55);
          const decal = new THREE.Mesh(g, mat); decal.renderOrder = 8; spin.add(decal);
          // keep the drops of water off the sticker
          dropsAvoid = { cx: cxN, cy: cyN, hw: hw * 1.05, hh: hh * 1.05 };
          placeDrops();
        };
        word.src = WORD;
      }

      // --- cold drops on the plastic ---
      const D = 150;
      const dropGeo = keep(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
      const dropMat = keep(plasticMaterial(u, { hazeMin: 0.06, hazeMax: 0.75, env: 2.4 }));
      const drops = new THREE.InstancedMesh(dropGeo, dropMat, D); drops.renderOrder = 7; drops.frustumCulled = false; spin.add(drops); keep(drops);
      let dropsAvoid = null;
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const placeDrops = () => {
        seed = 7;
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
        let k = 0, tries = 0;
        while (k < D && tries < D * 6) {
          tries++;
          const y = lerp(botY + 0.05, liqTop - 0.01, Math.pow(rnd(), 0.8)), t = rnd() * Math.PI * 2, r0 = rAt(y);
          const [x, z] = sq(t, r0, n);
          if (dropsAvoid && z > 0) { const [pu, pv] = toPhoto(x + off, y, z); if (Math.abs(pu - dropsAvoid.cx) < dropsAvoid.hw && Math.abs(pv - dropsAvoid.cy) < dropsAvoid.hh) continue; }
          const nx = Math.pow(Math.abs(x) / r0, n - 1) * Math.sign(x), nz = Math.pow(Math.abs(z) / r0, n - 1) * Math.sign(z);
          nrm.set(nx, 0, nz).normalize(); q.setFromUnitVectors(up, nrm);
          const big = rnd() < 0.18, s = big ? 0.009 + rnd() * 0.007 : 0.0035 + rnd() * 0.004;
          const run = big && rnd() < 0.35 ? 2.4 : 1; // a few drops running down
          m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * 0.45, s * run));
          drops.setMatrixAt(k++, m4);
        }
        drops.count = k; drops.instanceMatrix.needsUpdate = true;
      };
      placeDrops();

      // --- soft shadow + a little glow of the drink's colour on the floor ---
      const blob = (stops) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 2, 64, 64, 64); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return keep(new THREE.CanvasTexture(c)); };
      const floor = (tex2, w, d, op, add, x = 0, z = 0) => {
        const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), keep(new THREE.MeshBasicMaterial({ map: tex2, transparent: true, depthWrite: false, opacity: op, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false })));
        m.rotation.x = -Math.PI / 2; m.position.set(x, botY - 0.004, z); m.renderOrder = -1; pivot.add(m); return m;
      };
      floor(blob([[0, 'rgba(30,36,18,.55)'], [0.5, 'rgba(30,36,18,.22)'], [1, 'rgba(30,36,18,0)']]), rb * 3.4, rb * 2.4, 1, false);
      floor(blob([[0, 'rgba(20,24,12,.7)'], [0.6, 'rgba(20,24,12,.25)'], [1, 'rgba(20,24,12,0)']]), rb * 2.3, rb * 1.5, 1, false);
      const glowTex = blob([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
      const glow = floor(glowTex, rb * 2.6, rb * 1.4, 0.32, true, 0.1, rb * 0.55);
      glow.material.color.copy(p.glow);

      built = true;
      intro = performance.now();
      onReady?.();
    };

    // --- read the photo, then build ---
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { if (disposed) return; try { build(img); } catch (e) { console.warn('3D cup', e); } };
    img.src = image;

    // --- spin: drag to turn it; left alone it sways gently ---
    const still = calm();
    let rotY = still ? 0 : -0.55, vel = 0, dragging = false, lastX = 0, lastMove = 0;
    const down = (e) => { dragging = true; lastX = e.clientX; vel = 0; lastMove = performance.now(); el.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; const d = (dx / Math.max(1, el.clientWidth)) * Math.PI * 1.6; rotY += d; vel = d; lastMove = performance.now(); };
    const up = () => { dragging = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    // --- size to the box ---
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`; renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.getDrawingBufferSize(u.uRes.value);
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // --- animate ---
    let hv = 0, mv = 0, swirl = 0, wasM = false, skip = 0, t0 = performance.now(), visible = true, intro = 0, nextShine = 0;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden || !built) return;
      const dt = Math.min(0.12, (now - t0) / 1000); t0 = now;
      // glide in: a little bigger, a quarter turn, then a shine across the plastic
      const ti = still ? 1 : clamp((now - intro) / 1100, 0, 1), e = ease(ti);
      const s = lerp(0.93, 1, e);
      holder.scale.setScalar(s); holder.position.y = botY * (1 - s);
      bu.uIn.value = still ? 1 : clamp((now - intro) / 450, 0, 1);
      if (!still && !nextShine) nextShine = intro + 650;
      let shining = false;
      if (!still && now >= nextShine) {
        const k = (now - nextShine) / 1300;
        u.uSweep.value = lerp(-0.25, 1.75, k);
        shining = k < 1;
        if (k >= 1) nextShine = now + 9000; // and now and then again, softly
      } else u.uSweep.value = -1;
      // spin with a little momentum, then drift back to a gentle sway facing front
      if (!dragging) {
        rotY += vel; vel *= 0.92;
        if (now - lastMove > 1600) {
          const target = still ? 0 : Math.sin((now - intro) / 2600) * 0.3;
          const near = Math.atan2(Math.sin(target - rotY), Math.cos(target - rotY));
          rotY += near * Math.min(1, dt * (ti < 1 ? 3.2 : 1.6));
        }
      }
      spin.rotation.y = rotY;
      spin.rotation.x = still ? 0 : Math.sin(now / 3100) * 0.025;
      // syrup glides to its level (slow, like syrup)
      const want = clamp(live.current.sweet || 0, 0, 1);
      hv += (want - hv) * Math.min(1, dt * 1.4);
      du.uSweet.value = hv;
      du.uHoneyY.value = lerp(liqBot, liqTop + 0.02, hv);
      // extra matcha folds in with a swirl
      const wm = live.current.matcha ? 1 : 0;
      if (wm && !wasM) swirl = 1;
      wasM = !!wm;
      mv += (wm - mv) * Math.min(1, dt * 1.2);
      swirl = Math.max(0, swirl - dt * 0.4);
      du.uMatcha.value = mv; du.uSwirl.value = swirl;
      du.uTime.value = now / 1000;
      // when nothing is moving much, draw at half speed (saves battery on the iPad)
      const busy = dragging || ti < 1 || shining || swirl > 0 || Math.abs(vel) > 1e-4 || Math.abs(want - hv) > 0.003 || Math.abs(wm - mv) > 0.003;
      skip = busy ? 0 : skip + 1;
      if (skip % 2) return;
      el.dataset.honey = hv.toFixed(2); el.dataset.matcha = mv.toFixed(2); // what is in the cup right now
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      disposables.forEach((o) => o.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [image]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="dfx-3d" />;
}
