// Real 3D toppings for the 3D cup: each drink gets its own (cream, foam, caramel balls, drizzle, jelly cubes,
// mango, kataifi strands, dango, ube, toasted marshmallows, crème brûlée crust...), so they turn with the cup.
// Made from simple shapes; sizes are in the cup's units (the cup is about 1 wide).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CARAMEL = { base: ['cream', 0.07], heap: { kind: 'ball', n: 40, r: [0.058, 0.078], col: ['#C67A2E', '#B4661F', '#D8913F'], h: 0.13, R: 0.72 }, drizzle: '#C2701A' };
const DANGO = { base: ['cream', 0.05], heap: { kind: 'ball', n: 230, r: [0.027, 0.036], col: ['#D9BC8C', '#CFAE78', '#E6CFA3', '#9DB86A'], h: 0.05, R: 0.9 }, skewer: 'dango' };
const JELLY = { base: ['matcha', 0.05], heap: { kind: 'jelly', n: 14, r: [0.08, 0.095], col: ['#5E9A32', '#6FAB3E', '#4F8A2A'], h: 0.05, R: 0.72 } };
const FOAM = (h) => ({ base: ['matcha', h], heap: { kind: 'dice', n: 40, r: [0.03, 0.04], col: ['#D3E2AA', '#C7DA9B'], h: 0, R: 0.88, sink: 0.55 } });

/** What goes on top of each drink (by its photo name). */
export const TOPPINGS = {
  'caramel-matcha-latte': CARAMEL,
  'salted-caramel-matcha-latte': CARAMEL,
  'cinnamon-bun-matcha-latte': { base: ['cream', 0.07], heap: { kind: 'nugget', n: 210, r: [0.028, 0.04], col: ['#B07A4A', '#C9935F', '#9A6638', '#E3C9A0'], h: 0.1, R: 0.86 } },
  'banana-pudding-matcha-latte': { base: ['cream', 0.06], heap: { kind: 'ball', n: 210, r: [0.028, 0.036], col: ['#D8B676', '#E3C58B', '#C9A15E'], h: 0.06, R: 0.9 }, slices: 'lying' },
  'banana-pudding-matcha': { base: ['crumb', 0.05, '#D9B072'], heap: { kind: 'crumb', n: 260, r: [0.016, 0.03], col: ['#C98F45', '#E2BE7E', '#B2722F', '#F0DDB0', '#A9C46A'], h: 0.04, R: 0.92 }, slices: 'standing' },
  'berry-matcha-strawberry': FOAM(0.15),
  'coconut-matcha-cloud': FOAM(0.17),
  'classic-matcha-latte': FOAM(0.11),
  'caramel-bliss-matcha': { base: ['cream', 0.05], heap: { kind: 'nugget', n: 230, r: [0.024, 0.038], col: ['#D58A35', '#E7A651', '#B9691E'], h: 0.06, R: 0.9 }, drizzle: '#C9781E' },
  'creme-brulee-matcha-latte': { base: ['brulee', 0.07, 'dark'] },
  'creme-brulee-matcha': { base: ['brulee', 0.05, 'gold'] },
  'kinako-dango-matcha-latte': DANGO,
  'kinako-dango-seasalt-matcha': DANGO,
  'mango-matcha-latte': { base: ['cream', 0.06], heap: { kind: 'cube', n: 30, r: [0.055, 0.07], col: ['#F4A81C', '#F7BA2E', '#EE9A12'], h: 0.1, R: 0.74 } },
  'matcha-latte': JELLY,
  'strawberry-matcha-latte': JELLY,
  'pistachio-kataifi-matcha': { base: ['matcha', 0.06], heap: { kind: 'crumb', n: 90, r: [0.012, 0.02], col: ['#8DB04A', '#A6C25E', '#6E9638'], h: 0.02, R: 0.85 }, strands: { n: 120, col: ['#D99A3A', '#E8B65C', '#C7842A'], R: 0.55, h: 0.13 } },
  'putobumbong-matcha-latte': { base: ['cream', 0.05], strands: { n: 230, col: ['#EBCB86', '#F2DAA0', '#D9B068'], R: 0.85, h: 0.11 }, skewer: 'ube' },
  'putobumbong-matcha': { base: ['cream', 0.05], strands: { n: 200, col: ['#E0A955', '#D68F3A', '#EBC27A'], R: 0.9, h: 0.08 }, skewer: 'ube' },
  'smores-matcha-latte': { base: ['crumb', 0.05, '#A87440'], heap: { kind: 'crumb', n: 280, r: [0.012, 0.024], col: ['#A06A35', '#8A5528', '#B98048', '#C79A63'], h: 0.02, R: 0.96 }, skewer: 'smores' },
};

// --- small helpers ---
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
const sm = (t) => t * t * (3 - 2 * t);
/** smooth noise 0..1 */
export const noise = (x, y, z) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy), l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
};
const sq = (t, r, n) => { const c = Math.cos(t), s = Math.sin(t); return [Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * r, Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * r]; };
const col = (h) => new THREE.Color(h);

/** A lumpy round piece (cookie ball, cereal, crumb): a sphere pushed in and out by noise. */
function lumpy(detail, amp, freq, seed) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + amp * (noise(x * freq + seed, y * freq, z * freq) - 0.5) * 2 + amp * 0.5 * (noise(x * freq * 2.3, y * freq * 2.3 + seed, z * freq * 2.3) - 0.5);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Build the toppings for a drink.
 * cup = { n, rdAt(y) (inside half-width of the cup), liqTop (top of the drink), baseTop (where the topping starts, near the rim),
 *         height (how tall the toppings are in the photo) }
 * Returns { group, topY (top of the pile, without a skewer) }
 * Returns { group, topY } or null when this drink has no 3D toppings.
 */
export function buildToppings(slug, cup, keep) {
  const T = TOPPINGS[slug];
  if (!T) return null;
  const { n, rdAt, liqTop, baseTop, height = 0.22 } = cup;
  const rd = rdAt(baseTop);
  const rand = rng(slug.length * 7919 + 13);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const between = ([a, b]) => a + (b - a) * rand();
  const group = new THREE.Group();
  // simple materials where that's enough (lighter for the iPad), the glossy kind only where it shows
  const mat = (o) => keep(o.clearcoat || o.sheen ? new THREE.MeshPhysicalMaterial({ roughness: 0.6, envMapIntensity: 0.55, ...o }) : new THREE.MeshStandardMaterial({ roughness: 0.6, envMapIntensity: 0.55, ...o }));
  let topY = liqTop;

  // --- the base on top of the drink: whipped cream, matcha foam, crumbs or a brûlée crust ---
  const [kind, hb0, tone] = T.base;
  // as tall as the toppings in the photo
  const H0 = T.heap ? T.heap.h + T.heap.r[1] : 0;
  const k = kind === 'brulee' ? 1 : Math.max(0.7, Math.min(2.4, height / Math.max(0.03, hb0 + H0)));
  const hb = hb0 * (T.heap && T.heap.h > 0.02 ? Math.min(k, 1.5) : k);
  const heapH = T.heap ? Math.max(0, height - hb - T.heap.r[1] * 0.8) * (T.heap.h > 0.02 ? 1 : 0) : 0;
  const shape = (s) => Math.max(0, 1 - Math.pow(Math.min(1, s), 2.4)); // 1 in the middle, 0 at the wall
  const baseY = (s) => baseTop + hb * shape(s) + 0.008;
  {
    // its side (seen through the cup, from the drink up to the rim), then its top
    const prof = [];
    const inset = T.heap && ['ball', 'nugget', 'crumb', 'cube'].includes(T.heap.kind) ? -0.022 : 0.002; // room for pieces against the cup
    for (let j = 0; j <= 6; j++) { const y = liqTop - 0.02 + ((baseTop - liqTop + 0.024) * j) / 6; prof.push([y, rdAt(Math.min(y, baseTop)) + (j === 6 ? 0.002 : inset)]); }
    for (let k = 1; k <= 16; k++) { const s = 1 - k / 16; prof.push([baseY(s), (rd + 0.002) * s]); }
    const pos = [], uvs = [], idx = [], cols = [];
    const seg = 96;
    prof.forEach(([y, r]) => {
      for (let i = 0; i <= seg; i++) {
        const t = -Math.PI / 2 + (i / seg) * Math.PI * 2;
        const [x, z] = sq(t, r, n);
        let yy = y;
        const s = r / (rd + 0.002);
        if (y > baseTop + 0.006) { // lumpy, like real cream / foam
          const lump = kind === 'cream' ? 0.016 : kind === 'matcha' ? 0.012 : kind === 'crumb' ? 0.008 : 0.004;
          yy += lump * (noise(x * 9, z * 9, 1.7) - 0.4) * (0.4 + 0.6 * Math.min(1, s * 3));
        }
        pos.push(x, yy, z); uvs.push((x / rd + 1) / 2, (z / rd + 1) / 2);
        // colour: tiny speckles in foam / crumbs, soft shading near the wall
        const sp = noise(x * 40, z * 40, yy * 40);
        let c;
        if (kind === 'cream') c = col('#F7F1E5').multiplyScalar(0.96 + 0.06 * noise(x * 14, z * 14, 3));
        else if (kind === 'matcha') c = col('#B8CF84').lerp(col('#8DAE58'), sp > 0.72 ? 0.7 : 0).multiplyScalar(0.94 + 0.1 * noise(x * 12, z * 12, 5));
        else if (kind === 'crumb') c = col(tone).lerp(col('#6E4419'), sp > 0.6 ? 0.45 : 0.05 * sp);
        else c = col('#FFFFFF');
        cols.push(c.r, c.g, c.b);
      }
    });
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, d = a + seg + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idx); g.computeVertexNormals();
    let m;
    if (kind === 'brulee') {
      m = mat({ map: keep(bruleeTexture(tone)), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.18 });
    } else {
      m = mat({ vertexColors: true, roughness: kind === 'crumb' ? 0.85 : 0.62 });
    }
    group.add(new THREE.Mesh(g, m));
    topY = Math.max(topY, baseTop + hb + 0.02);
  }

  // where a piece can sit: on the base, a little higher towards the middle of a heap
  const balls = []; // [x, y, z, r] of every round piece (for the drizzle)
  const heapAt = (s, h, R) => h * Math.max(0, 1 - Math.pow(s / R, 2.6));

  // --- the pile on top ---
  if (T.heap) {
    const H = T.heap, N = H.n;
    let geo, m;
    if (H.kind === 'ball') { geo = keep(lumpy(H.r[1] >= 0.05 ? 3 : 1, 0.09, 2.2, 1)); m = mat({ roughness: 0.78 }); } // small ones need fewer facets
    else if (H.kind === 'nugget') { geo = keep(lumpy(1, 0.18, 1.6, 4)); m = mat({ roughness: 0.75 }); }
    else if (H.kind === 'crumb') { geo = keep(lumpy(0, 0.28, 1.4, 9)); m = mat({ roughness: 0.9 }); }
    else if (H.kind === 'cube') { geo = keep(new RoundedBoxGeometry(1.6, 1.6, 1.6, 3, 0.26)); m = mat({ roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: col('#FFE0A0') }); }
    else if (H.kind === 'jelly') { geo = keep(new RoundedBoxGeometry(1.5, 1.5, 1.5, 3, 0.18)); m = mat({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0, sheen: 0.3, sheenColor: col('#E8FFD0'), emissive: col('#3B6E1C'), emissiveIntensity: 0.18 }); }
    else { geo = keep(new RoundedBoxGeometry(1.4, 1.4, 1.4, 2, 0.2)); m = mat({ roughness: 0.55 }); } // dice of jelly in foam
    const wall = ['ball', 'nugget', 'crumb', 'cube'].includes(H.kind) ? Math.round(N * 0.6) : 0;
    const mesh = new THREE.InstancedMesh(geo, m, N + wall); keep(mesh);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    // pack the pieces over the surface of the pile (evenly, touching each other), so it looks full
    const placed = [];
    const surfAt = (sv) => baseY(sv) + heapAt(sv, heapH, H.R);
    let tries = 0;
    while (placed.length < N && tries < N * 40) {
      tries++;
      const r = between(H.r);
      const t = rand() * Math.PI * 2, sv = Math.min(H.R, 1 - (r * 1.05) / rd) * Math.sqrt(rand()); // stays inside the cup
      const [x, z] = sq(t, sv * rd, n);
      const lying = H.kind === 'crumb' ? 0.55 : H.kind === 'nugget' ? 0.8 : 1;
      const y = surfAt(sv) + r * (H.sink ? 1 - H.sink * 2 : 0.35) * lying;
      const gap = tries < N * 25 ? 1.75 : 1.2; // later tries may squeeze in closer
      if (placed.some(([px, py, pz, pr]) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 < ((pr + r) * gap * 0.5) ** 2)) continue;
      placed.push([x, y, z, r, lying]);
    }
    placed.forEach(([x, y, z, r, lying], i) => {
      e.set(rand() * 6.3, rand() * 6.3, rand() * 6.3);
      if (H.kind === 'dice') e.set((rand() - 0.5) * 0.3, rand() * 6.3, (rand() - 0.5) * 0.3);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r, r * lying, r));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.set(pick(H.col)).multiplyScalar(0.92 + 0.18 * rand()));
      balls.push([x, y, z, r]);
      topY = Math.max(topY, y + r);
    });
    for (let i = placed.length; i < N; i++) { m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); mesh.setColorAt(i, c); }
    // and some pressed against the cup below the rim, seen through the plastic
    if (wall) for (let i = 0; i < wall; i++) {
      const y = liqTop + (baseTop - liqTop) * rand(), r = between(H.r), t = rand() * Math.PI * 2;
      const [x, z] = sq(t, rdAt(y) - 0.004 - r * 0.92, n);
      q.setFromEuler(e.set(rand() * 6.3, rand() * 6.3, rand() * 6.3));
      m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(r, r, r));
      mesh.setMatrixAt(N + i, m4);
      mesh.setColorAt(N + i, c.set(pick(H.col)).multiplyScalar(0.85 + 0.2 * rand()));
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    if (heapH > 0.02) { // the inside of the pile
      const prof = [];
      for (let j = 0; j <= 14; j++) { const sv = H.R * 0.92 * (1 - j / 14); prof.push([baseY(sv) + heapAt(sv, heapH, H.R) - 0.01, sv * rd]); }
      const pos = [], idx = [], seg = 64;
      prof.forEach(([y, r]) => { for (let i = 0; i <= seg; i++) { const [x, z] = sq((i / seg) * Math.PI * 2, r, n); pos.push(x, y, z); } });
      for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, d = a + seg + 1, e2 = d + 1; idx.push(a, b, d, b, e2, d); }
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const avg = new THREE.Color(0, 0, 0); H.col.forEach((h) => avg.add(col(h))); avg.multiplyScalar(0.78 / H.col.length);
      group.add(new THREE.Mesh(g, mat({ color: avg, roughness: 0.9, side: THREE.DoubleSide })));
    }
  }

  // --- caramel drizzle over everything ---
  if (T.drizzle) {
    const surf = (x, z) => {
      const s = Math.pow(Math.pow(Math.abs(x / rd), n) + Math.pow(Math.abs(z / rd), n), 1 / n);
      let y = baseY(s);
      for (const [bx, by, bz, br] of balls) { const d2 = (x - bx) ** 2 + (z - bz) ** 2; if (d2 < br * br) y = Math.max(y, by + Math.sqrt(br * br - d2) * 0.9); }
      return y;
    };
    const tubes = [];
    for (let k = 0; k < 5; k++) {
      const a = rand() * Math.PI, off = (rand() - 0.5) * 0.7 * rd, pts = [];
      const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
      for (let u = -0.92; u <= 0.92; u += 0.035) {
        const w = Math.sin(u * 22 + k) * 0.035; // the zig-zag of a drizzle
        const x = dx * u * rd + nx * (off + w), z = dz * u * rd + nz * (off + w);
        if (Math.abs(x) > rd * 0.95 || Math.abs(z) > rd * 0.95) continue;
        pts.push(new THREE.Vector3(x, surf(x, z) + 0.006, z));
      }
      if (pts.length > 4) tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 0.011 + rand() * 0.005, 8, false));
    }
    if (tubes.length) {
      const g = keep(mergeGeometries(tubes)); tubes.forEach((t) => t.dispose());
      group.add(new THREE.Mesh(g, mat({ color: T.drizzle, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, emissive: col(T.drizzle), emissiveIntensity: 0.12 })));
    }
  }

  // --- kataifi: a nest of thin golden strands ---
  if (T.strands) {
    const S = T.strands, parts = [];
    for (let k = 0; k < S.n; k++) {
      const t = rand() * Math.PI * 2, s = S.R * Math.sqrt(rand());
      const [cx, cz] = sq(t, s * rd, n);
      const loop = 0.06 + rand() * 0.16, a0 = rand() * 6.3, pts = [];
      for (let j = 0; j < 7; j++) {
        const a = a0 + j * (0.9 + rand() * 0.5);
        let x = cx + Math.cos(a) * loop, z = cz + Math.sin(a) * loop;
        const d = Math.hypot(x, z);
        if (d > rd * 0.93) { x *= (rd * 0.93) / d; z *= (rd * 0.93) / d; }
        const ss = Math.min(0.98, Math.hypot(x, z) / rd);
        pts.push(new THREE.Vector3(x, baseY(ss) + 0.006 + S.h * (1 - ss * ss) * (0.3 + 0.7 * rand()), z));
      }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0045, 3, false);
      const c = col(pick(S.col)).multiplyScalar(0.88 + 0.24 * rand());
      const cc = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < cc.length; i += 3) { cc[i] = c.r; cc[i + 1] = c.g; cc[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      parts.push(g);
      topY = Math.max(topY, ...pts.map((p) => p.y));
    }
    const g = keep(mergeGeometries(parts)); parts.forEach((p) => p.dispose());
    group.add(new THREE.Mesh(g, mat({ vertexColors: true, roughness: 0.45, clearcoat: 0.4 })));
  }

  // --- banana slices ---
  if (T.slices) {
    const face = keep(bananaTexture());
    const side = mat({ color: '#EADBA0', roughness: 0.5 });
    const top = mat({ map: face, roughness: 0.42, clearcoat: 0.3 });
    const g = keep(new THREE.CylinderGeometry(0.068, 0.068, 0.02, 40));
    const spots = T.slices === 'lying' ? [[-0.2, -0.12, 0.6, 0.2], [0.05, -0.2, 0.5, -0.3], [0.24, -0.02, 0.7, 0.4]] : [[0.18, -0.18, 1.25, 0.2], [0.27, -0.05, 1.1, 0.5], [0.31, -0.24, 1.35, -0.2]];
    for (const [x, z, tilt, yaw] of spots) {
      const m = new THREE.Mesh(g, [side, top, top]);
      const s = Math.hypot(x, z) / rd;
      const by = baseY(s) + (T.heap ? heapAt(s, heapH, T.heap.R) : 0);
      m.position.set(x * rd / 0.45, by + 0.03 + (T.slices === 'standing' ? 0.07 : 0.02), z * rd / 0.45);
      m.rotation.set(tilt, yaw, (rand() - 0.5) * 0.4, 'YXZ');
      group.add(m);
      topY = Math.max(topY, m.position.y + 0.07);
    }
  }

  // --- a skewer: dango, ube balls or toasted marshmallows ---
  if (T.skewer) {
    const sk = new THREE.Group();
    const stick = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.007, 0.007, 0.72, 10)), mat({ color: '#D8B07A', roughness: 0.7 }));
    stick.position.y = 0.36; sk.add(stick);
    const add = (geo, m, y, sc) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.scale.setScalar(sc); o.rotation.y = y * 11; sk.add(o); };
    if (T.skewer === 'dango') {
      const g = keep(lumpy(3, 0.015, 2, 3));
      ['#F2A2B6', '#F7F1E4', '#9DB86A'].forEach((c, i) => add(g, mat({ color: c, roughness: 0.55, sheen: 0.8, sheenColor: col('#ffffff'), sheenRoughness: 0.4 }), 0.22 + i * 0.13, 0.068));
      sk.position.set(-0.2 * rd / 0.45, baseY(0.3) + heapAt(0.3, heapH, T.heap.R) - 0.01, 0.1);
      sk.rotation.set(0.25, 0, -1.02);
    } else if (T.skewer === 'ube') {
      const g = keep(ubeGeometry());
      const m = mat({ vertexColors: true, roughness: 0.5, sheen: 0.5, sheenColor: col('#E9D6FF') });
      [0.2, 0.32, 0.44, 0.56].forEach((y) => add(g, m, y, 0.06));
      sk.position.set(-0.36 * rd / 0.45, baseY(0.5) + (T.heap ? heapAt(0.5, heapH, T.heap.R) : 0) + 0.07, 0.16);
      sk.rotation.set(0.3, 0, -1.25);
    } else {
      const g = keep(marshmallowGeometry());
      const m = mat({ vertexColors: true, roughness: 0.68, sheen: 0.6, sheenColor: col('#ffffff') });
      [0.2, 0.345, 0.49].forEach((y) => add(g, m, y, 0.075));
      sk.position.set(-0.36 * rd / 0.45, baseY(0.3) + 0.07, 0.08);
      sk.rotation.set(0.15, 0, -1.42);
    }
    // let it rest on top of the pile: lower or raise it until its lowest piece just sits on the surface
    sk.updateMatrix(); sk.updateMatrixWorld(true);
    const surf = (x, z) => { const sv = Math.min(1, Math.pow(Math.pow(Math.abs(x / rd), n) + Math.pow(Math.abs(z / rd), n), 1 / n)); return baseY(sv) + (T.heap ? heapAt(sv, heapH, T.heap.R) : 0) + (T.strands ? T.strands.h * 0.55 * (1 - sv * sv) : 0); };
    let lift = -Infinity; const wp = new THREE.Vector3();
    sk.children.slice(1).forEach((o) => { o.getWorldPosition(wp); lift = Math.max(lift, surf(wp.x, wp.z) + o.scale.x * 0.75 - wp.y); });
    if (Number.isFinite(lift)) sk.position.y += lift;
    group.add(sk);
  }

  return { group, topY };
}

/** Crème brûlée crust: golden caramel with darker torched patches. */
function bruleeTexture(tone) {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  const dark = tone === 'dark';
  const g = x.createRadialGradient(N / 2, N / 2, 10, N / 2, N / 2, N / 2);
  g.addColorStop(0, dark ? '#C9822E' : '#F0A82C'); g.addColorStop(0.7, dark ? '#D9A260' : '#E8952A'); g.addColorStop(1, dark ? '#EBD3AE' : '#E9B455');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  const r = rng(dark ? 5 : 8);
  for (let i = 0; i < (dark ? 260 : 140); i++) { // torched spots
    const px = N / 2 + (r() - 0.5) * N * (dark ? 0.75 : 0.85), py = N / 2 + (r() - 0.5) * N * (dark ? 0.75 : 0.85), rr = 4 + r() * (dark ? 28 : 16);
    const sg = x.createRadialGradient(px, py, 0, px, py, rr);
    sg.addColorStop(0, dark ? 'rgba(60,24,6,.85)' : 'rgba(150,60,10,.6)'); sg.addColorStop(1, 'rgba(60,24,6,0)');
    x.fillStyle = sg; x.beginPath(); x.arc(px, py, rr, 0, Math.PI * 2); x.fill();
  }
  x.strokeStyle = dark ? 'rgba(255,220,160,.35)' : 'rgba(255,235,170,.45)'; x.lineWidth = 1.5; // glassy cracks
  for (let i = 0; i < 40; i++) { x.beginPath(); let px = r() * N, py = r() * N; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** The cut face of a banana slice: cream with a soft brown star of seeds in the middle. */
function bananaTexture() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), m = N / 2;
  const g = x.createRadialGradient(m, m, 4, m, m, m);
  g.addColorStop(0, '#E9DDB4'); g.addColorStop(0.55, '#F4ECCD'); g.addColorStop(0.9, '#EFE2B4'); g.addColorStop(1, '#D9C47E');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  x.strokeStyle = 'rgba(150,110,60,.55)'; x.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; x.beginPath(); x.moveTo(m, m); x.lineTo(m + Math.cos(a) * 30, m + Math.sin(a) * 30); x.stroke(); }
  x.fillStyle = 'rgba(110,70,30,.7)';
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; x.beginPath(); x.arc(m + Math.cos(a) * 22, m + Math.sin(a) * 22, 2.5, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** An ube ball: purple with tiny light speckles. */
function ubeGeometry() {
  const g = lumpy(3, 0.02, 2, 6);
  const p = g.attributes.position, cc = new Float32Array(p.count * 3), a = col('#6A3AA2'), b = col('#B79BE0'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const sp = noise(p.getX(i) * 9, p.getY(i) * 9, p.getZ(i) * 9);
    c.copy(a).lerp(b, sp > 0.78 ? 0.8 : 0).multiplyScalar(0.92 + 0.12 * noise(p.getX(i) * 3, p.getY(i) * 3, 2));
    cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return g;
}

/** A toasted marshmallow: soft white, browned in patches. */
function marshmallowGeometry() {
  const g = lumpy(3, 0.05, 1.8, 2);
  g.scale(1, 0.92, 1);
  const p = g.attributes.position, cc = new Float32Array(p.count * 3), w = col('#FBF6EC'), br = col('#A8642A'), dk = col('#5A3214'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const toast = Math.max(0, z) * 0.8 + Math.max(0, y) * 0.7 + (noise(x * 4, y * 4, z * 4) - 0.5) * 1.1 + 0.15;
    c.copy(w).lerp(br, Math.min(1, Math.max(0, toast - 0.15) * 1.4));
    if (toast > 0.75) c.lerp(dk, Math.min(1, (toast - 0.75) * 2));
    cc[i * 3] = c.r; cc[i * 3 + 1] = c.g; cc[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return g;
}
