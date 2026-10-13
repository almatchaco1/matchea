// A real 3D Matchéa cup, drawn with three.js. Used inside the drink stage (customer site + POS).
// - The cup is a clear plastic, rounded-square tumbler with a dome lid, the Matchéa logo on the front.
// - The drink's colours are read from the drink's own photo (bottom to top), so every drink looks like itself.
// - Toppings sit on top in the photo's topping colours.
// - Honey rises/sinks to the chosen sweetness, extra matcha turns the top a deeper green, all inside the cup.
// - Drag (or swipe) to spin it; when left alone it sways gently so the logo stays mostly in view.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// The visible square is world [-1, 1] on both axes at z = 0 (matches the photo box used by the 2D effects)
const FOV = 22;
const DIST = 1 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const Y_BOT = -0.89;   // cup bottom (94.5% down the box)
const Y_RIM = 0.46;    // top rim of the cup body
const R_BOT = 0.37, R_TOP = 0.47; // half widths
const N = 4.2;         // superellipse power: 2 = round, higher = squarer
const LIQ_TOP = 0.78;  // the drink fills 78% of the cup height (the rest is toppings / foam)

const lerp = (a, b, t) => a + (b - a) * t;
const radiusAt = (y) => lerp(R_BOT, R_TOP, (y - Y_BOT) / (Y_RIM - Y_BOT));
// a point on a rounded square of half-size r, angle t
const sq = (t, r) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [Math.sign(c) * Math.pow(Math.abs(c), 2 / N) * r, Math.sign(s) * Math.pow(Math.abs(s), 2 / N) * r];
};

/** A tapered rounded-square tube between y0 and y1 (optionally with caps), shrunk by `inset`. */
function tube({ y0, y1, inset = 0, seg = 72, rows = 24, capTop = false, capBottom = false, colorAt = null, t0 = 0, t1 = Math.PI * 2, uv = false }) {
  const pos = [], col = [], uvs = [], idx = [];
  const cols = seg + 1;
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, y = lerp(y0, y1, v), r = radiusAt(y) - inset;
    const c = colorAt ? colorAt(v) : null;
    for (let i = 0; i <= seg; i++) {
      const t = lerp(t0, t1, i / seg);
      const [x, z] = sq(t, r);
      pos.push(x, y, z);
      if (c) col.push(c.r, c.g, c.b);
      if (uv) uvs.push(1 - i / seg, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
    const a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const cap = (y, up, c) => {
    const r = radiusAt(y) - inset, start = pos.length / 3;
    pos.push(0, y, 0); if (colorAt) col.push(c.r, c.g, c.b); if (uv) uvs.push(0.5, 0.5);
    for (let i = 0; i <= seg; i++) { const [x, z] = sq((i / seg) * Math.PI * 2, r); pos.push(x, y, z); if (colorAt) col.push(c.r, c.g, c.b); if (uv) uvs.push(0, 0); }
    for (let i = 1; i <= seg; i++) up ? idx.push(start, start + i + 1, start + i) : idx.push(start, start + i, start + i + 1);
  };
  if (capTop) cap(y1, true, colorAt ? colorAt(1) : null);
  if (capBottom) cap(y0, false, colorAt ? colorAt(0) : null);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Read the drink's colours from its photo: a list of colours from the bottom of the drink to the top, plus topping colours. */
function sampleColors(img) {
  const W = 120, H = 120;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const px = (u, v) => { const i = (Math.round(v * (H - 1)) * W + Math.round(u * (W - 1))) * 4; return d[i + 3] > 200 ? [d[i], d[i + 1], d[i + 2]] : null; };
  const median = (list) => {
    const ok = list.filter(Boolean);
    if (!ok.length) return null;
    const m = (k) => ok.map((p) => p[k]).sort((a, b) => a - b)[ok.length >> 1];
    return new THREE.Color(m(0) / 255, m(1) / 255, m(2) / 255);
  };
  // The drink: rows from just above the cup bottom up to below the lid, both sides of the logo
  const layers = [];
  for (let k = 0; k < 16; k++) {
    const v = lerp(0.915, 0.36, k / 15);
    const samples = [];
    for (const u of [0.34, 0.36, 0.38, 0.62, 0.64, 0.66]) samples.push(px(u, v));
    if (v < 0.58 || v > 0.70) for (const u of [0.45, 0.5, 0.55]) samples.push(px(u, v)); // the logo row only uses the sides
    const col = median(samples) || new THREE.Color('#BFD39A');
    layers.push(col.offsetHSL(0, 0.14, -0.07)); // the photo is seen through plastic: a little richer
  }
  // Toppings: the area above the lid line
  const top = [];
  for (let v = 0.12; v < 0.3; v += 0.02) for (let u = 0.3; u < 0.7; u += 0.04) top.push(px(u, v));
  const ok = top.filter(Boolean);
  let a = (median(ok) || layers[layers.length - 1].clone()).offsetHSL(0, 0.1, -0.04);
  // a second, contrasting topping colour (the darkest / most different third)
  const dist = (p) => Math.abs(p[0] - a.r * 255) + Math.abs(p[1] - a.g * 255) + Math.abs(p[2] - a.b * 255);
  const far = ok.sort((p, q) => dist(q) - dist(p)).slice(0, Math.max(1, Math.floor(ok.length / 3)));
  const b = median(far) || a.clone().offsetHSL(0, 0, -0.15);
  return { layers, top: [a, b], hasTop: ok.length > 20 };
}

/** The Matchéa logo as a texture (same style as on the cups). */
function logoTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.textBaseline = 'middle';
  x.font = '700 150px "Fraunces","Shippori Mincho B1",Georgia,serif';
  const left = 'M', right = 'tchéa';
  const wl = x.measureText(left).width, wr = x.measureText(right).width, gap = 66;
  const total = wl + gap + wr, x0 = (c.width - total) / 2, y = 136;
  x.fillStyle = '#183A12';
  x.fillText(left, x0, y);
  x.fillText(right, x0 + wl + gap, y);
  // the pink whisk-bottle in place of the "a"
  const bx = x0 + wl + gap / 2;
  x.fillStyle = '#E8407A';
  x.beginPath(); x.ellipse(bx, y + 22, 30, 40, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.roundRect(bx - 12, y - 64, 24, 52, 8); x.fill();
  x.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = -2; i <= 2; i++) { x.fillRect(bx + i * 9 - 1.5, y - 8, 3, 54); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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
      renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 2, // sharp screens don't need smoothing (saves battery)
         alpha: true, powerPreference: 'low-power' });
    } catch { return undefined; } // no 3D on this device: the photo stays
    let disposed = false, raf = 0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    camera.position.set(0, 0.35, DIST);
    camera.lookAt(0, 0.02, 0);
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x445533, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(1.5, 2.2, 2.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff0d0, 0.9); rim.position.set(-2, 1, -1.5); scene.add(rim);

    const cup = new THREE.Group(); scene.add(cup);
    // a little bigger than the photo's cup body, growing from the bottom so it still sits on the same spot
    const BIG = 1.14; cup.scale.setScalar(BIG); cup.position.y = Y_BOT * (1 - BIG);
    const disposables = [env, pmrem];
    const keep = (o) => { disposables.push(o); return o; };

    // --- clear plastic cup + lid ---
    const plastic = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.06, transmission: 0, transparent: true, opacity: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4 }));
    const wall = new THREE.Mesh(keep(tube({ y0: Y_BOT, y1: Y_RIM, rows: 8, capBottom: true })), plastic);
    wall.renderOrder = 5; cup.add(wall);
    // the rim and the lid's ridge
    const ridge = new THREE.Mesh(keep(tube({ y0: Y_RIM - 0.01, y1: Y_RIM + 0.05, inset: -0.025, rows: 2 })), keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, transparent: true, opacity: 0.35, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false })));
    ridge.renderOrder = 6; cup.add(ridge);
    // dome lid
    const domeGeo = keep(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2));
    domeGeo.scale(R_TOP * 1.08, 0.22, R_TOP * 1.08);
    const dome = new THREE.Mesh(domeGeo, plastic); dome.position.y = Y_RIM + 0.05; dome.renderOrder = 7; cup.add(dome);

    // --- logo on the front of the cup ---
    const logo = new THREE.Mesh(
      keep(tube({ y0: -0.20, y1: 0.07, inset: -0.004, seg: 32, rows: 2, t0: Math.PI / 2 - 0.62, t1: Math.PI / 2 + 0.62, uv: true })),
      keep(new THREE.MeshStandardMaterial({ map: keep(logoTexture()), transparent: true, roughness: 0.5, depthWrite: false })),
    );
    // the logo font may still be loading: draw it again once it's there
    document.fonts?.load?.('700 150px "Fraunces"').then(() => { if (disposed) return; const t = keep(logoTexture()); logo.material.map = t; logo.material.needsUpdate = true; }).catch(() => {});
    logo.renderOrder = 8; cup.add(logo);

    // --- the drink (colours filled in once the photo is read) ---
    const liqTop = lerp(Y_BOT, Y_RIM, LIQ_TOP);
    const drinkMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.35 }));
    let drink = null;
    // jelly / boba bits floating in the drink
    const bitGeo = keep(new THREE.SphereGeometry(0.022, 10, 8));
    const bitMat = keep(new THREE.MeshStandardMaterial({ color: 0x5E8C3A, roughness: 0.3 }));
    const bits = new THREE.InstancedMesh(bitGeo, bitMat, 90);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) {
      const y = lerp(Y_BOT + 0.05, liqTop - 0.03, Math.random()), t = Math.random() * Math.PI * 2;
      const [x, z] = sq(t, radiusAt(y) - 0.03 - Math.random() * 0.02);
      m4.makeTranslation(x, y, z); bits.setMatrixAt(i, m4);
    }
    cup.add(bits);
    // toppings on top of the drink
    const topGeo = keep(new THREE.IcosahedronGeometry(0.045, 1));
    const topMat = keep(new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.55 }));
    const tops = new THREE.InstancedMesh(topGeo, topMat, 70);
    tops.visible = false; cup.add(tops);

    // --- honey: an amber layer that rises from the bottom to the chosen sweetness ---
    const honeyMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xD07A10, roughness: 0.15, transparent: true, opacity: 0.42, clearcoat: 0.8, depthWrite: false, envMapIntensity: 0.6 }));
    const honey = new THREE.Mesh(keep(tube({ y0: Y_BOT + 0.004, y1: liqTop, inset: 0.012, rows: 12, capTop: true })), honeyMat);
    honey.renderOrder = 3; cup.add(honey);
    const honeyClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), Y_BOT);
    honeyMat.clippingPlanes = [honeyClip];
    renderer.localClippingEnabled = true;
    // the honey's shiny top surface
    const honeyTop = new THREE.Mesh(keep(tube({ y0: Y_BOT, y1: Y_BOT, inset: 0.014, rows: 1, capTop: true })), keep(new THREE.MeshPhysicalMaterial({ color: 0xF6C25A, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85 })));
    // (built at the bottom; moved up and widened to the honey's level each frame)
    cup.add(honeyTop);

    // --- extra matcha: a deep green band in the top of the drink ---
    const mMat = keep(new THREE.MeshStandardMaterial({ color: 0x3E7022, roughness: 0.4, transparent: true, opacity: 0, depthWrite: false }));
    const mBand = new THREE.Mesh(keep(tube({ y0: liqTop - 0.34, y1: liqTop + 0.002, inset: 0.008, rows: 10, capTop: true })), mMat);
    mBand.renderOrder = 4; cup.add(mBand);

    // --- shadow under the cup ---
    const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(20,30,10,.45)'); g.addColorStop(1, 'rgba(20,30,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.25, 1.25)), keep(new THREE.MeshBasicMaterial({ map: keep(shadowTex), transparent: true, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = Y_BOT - 0.005; shadow.renderOrder = 0; scene.add(shadow);

    // --- read the drink's colours from its photo ---
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (disposed) return;
      let pal;
      try { pal = sampleColors(img); } catch { pal = null; }
      if (!pal) return;
      const at = (v) => { const f = v * (pal.layers.length - 1), i = Math.floor(f), k = f - i; return pal.layers[i].clone().lerp(pal.layers[Math.min(i + 1, pal.layers.length - 1)], k); };
      drink = new THREE.Mesh(keep(tube({ y0: Y_BOT + 0.003, y1: liqTop, inset: 0.016, rows: 30, capTop: true, capBottom: true, colorAt: at })), drinkMat);
      drink.renderOrder = 1; cup.add(drink);
      // the bits take a darker shade of the upper drink
      bitMat.color.copy(at(0.75)).offsetHSL(0, 0.05, -0.22);
      if (pal.hasTop) {
        const col = new THREE.Color();
        for (let i = 0; i < 70; i++) {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * (R_TOP - 0.07);
          const h = Math.random() * 0.14 * (1 - rr / R_TOP);
          m4.compose(new THREE.Vector3(Math.cos(a) * rr, liqTop + 0.04 + h, Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)), new THREE.Vector3(1, 0.8 + Math.random() * 0.5, 1).multiplyScalar(0.8 + Math.random() * 0.6));
          tops.setMatrixAt(i, m4);
          col.copy(Math.random() < 0.7 ? pal.top[0] : pal.top[1]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
          tops.setColorAt(i, col);
        }
        tops.instanceColor.needsUpdate = true;
        tops.visible = true;
      }
      onReady?.();
    };
    img.src = image;

    // --- spin: drag to turn it; when left alone it sways gently ---
    let rotY = -0.25, vel = 0, dragging = false, lastX = 0, lastMove = 0;
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
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // --- animate ---
    let hv = 0, mv = 0, skip = 0, t0 = performance.now(), visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 });
    io.observe(el);
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      const dt = Math.min(0.12, (now - t0) / 1000); t0 = now; // slow devices still catch up
      // spin with a little momentum, then drift back to a gentle sway facing front
      if (!dragging) {
        rotY += vel; vel *= 0.92;
        if (now - lastMove > 1600) {
          const target = Math.sin(now / 2600) * 0.38 - 0.1;
          const near = Math.atan2(Math.sin(target - rotY), Math.cos(target - rotY));
          rotY += near * Math.min(1, dt * 1.6);
        }
      }
      cup.rotation.y = rotY;
      cup.rotation.x = Math.sin(now / 3100) * 0.03;
      // honey glides to its level (slow, like syrup)
      const want = Math.max(0, Math.min(1, live.current.sweet || 0));
      hv += (want - hv) * Math.min(1, dt * 1.4);
      const hY = lerp(Y_BOT, liqTop, hv * 0.98);
      honeyClip.constant = hY; // plane (0,-1,0): keeps everything below hY
      honey.visible = hv > 0.01;
      honeyTop.visible = hv > 0.01;
      honeyTop.position.y = hY - Y_BOT + Math.sin(now / 700) * 0.002;
      const s = (radiusAt(hY) - 0.014) / (R_BOT - 0.014);
      honeyTop.scale.set(s, 1, s);
      // extra matcha fades in / out
      mv += ((live.current.matcha ? 1 : 0) - mv) * Math.min(1, dt * 1.2);
      mMat.opacity = mv * 0.5; mBand.visible = mv > 0.01;
      // when nothing is moving much, draw at half speed (saves battery on the iPad)
      const busy = dragging || Math.abs(vel) > 1e-4 || Math.abs(want - hv) > 0.003 || Math.abs((live.current.matcha ? 1 : 0) - mv) > 0.003;
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
      bits.dispose(); tops.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [image]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="dfx-3d" />;
}
