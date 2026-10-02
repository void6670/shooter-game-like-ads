// Low-poly meshes built from primitives: characters, obstacles, gates and the bridge.
import * as THREE from 'three';

const geoms = new Map();
function geo(key, make) {
  let g = geoms.get(key);
  if (!g) { g = make(); geoms.set(key, g); }
  return g;
}

const mats = new Map();
export function mat(color, extra = null) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, ...extra }); mats.set(key, m); }
  return m;
}

const boxG = (w, h, d, ty = 0) => geo(`box${w},${h},${d},${ty}`, () => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ty) g.translate(0, ty, 0);
  return g;
});

const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
export function blobShadow(r = 0.42) {
  const m = new THREE.Mesh(geo(`blob${r}`, () => new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2)), shadowMat);
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- characters

export const PALETTES = {
  soldier: { helmet: 0x3ccf4a, skin: 0xf3cfb0, shirt: 0x5f7d48, pants: 0x34c23f, gun: true },
  zombie:  { helmet: 0xe03a3a, skin: 0xf0b6a8, shirt: 0xf3efe8, pants: 0xd42c2c },
  goblin:  { helmet: 0xe03a3a, skin: 0x86b33b, shirt: 0xf3efe8, pants: 0xd42c2c, ears: true },
  brute:   { helmet: null, skin: 0x5b5b5e, shirt: 0x48484b, pants: 0x38383b, bulky: true },
  runner:  { helmet: null, skin: 0xebe6d6, shirt: 0x2b2b30, pants: 0x2b2b30, horns: 0xff4a3a },
};

export const BOSSES = {
  ogre:       { name: 'OGRE',        scale: 3.1, pal: { helmet: null, skin: 0x75787b, shirt: 0x5b5e61, pants: 0x3f4245, horns: 0xeee6cf, bulky: true } },
  yeti:       { name: 'YETI',        scale: 3.3, pal: { helmet: null, skin: 0xf2f4f7, shirt: 0xe3e8ee, pants: 0xcdd4dd, bulky: true } },
  goblinKing: { name: 'GOBLIN KING', scale: 3.0, pal: { helmet: 0xffc61a, skin: 0x7aa83a, shirt: 0x8a2a2a, pants: 0x4b2a1a, ears: true, bulky: true, crown: true } },
  mutant:     { name: 'MUTANT',      scale: 3.5, pal: { helmet: null, skin: 0x9b6bd6, shirt: 0x5b3a8a, pants: 0x2b1d45, horns: 0xffffff, bulky: true } },
};

export function buildGun(gun) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxG(0.1, 0.14, gun.len), mat(gun.color));
  g.add(body);
  const barrel = new THREE.Mesh(boxG(0.05, 0.05, 0.3), mat(0x2a2d31));
  barrel.position.set(0, 0.02, -gun.len / 2 - 0.12);
  g.add(barrel);
  const grip = new THREE.Mesh(boxG(0.07, 0.18, 0.08), mat(0x2a2d31));
  grip.position.set(0, -0.12, gun.len * 0.2);
  g.add(grip);
  return g;
}

export function buildHumanoid(p, gun = null) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const k = p.bulky ? 1.35 : 1;

  const legs = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(0.12 * s * k, 0.7, 0);
    piv.add(new THREE.Mesh(boxG(0.2 * k, 0.7, 0.22 * k, -0.35), mat(p.pants)));
    body.add(piv);
    legs.push(piv);
  }
  const torso = new THREE.Mesh(boxG(0.52 * k, 0.56, 0.3 * k), mat(p.shirt));
  torso.position.y = 0.98;
  body.add(torso);
  const head = new THREE.Mesh(boxG(0.34, 0.32, 0.3), mat(p.skin));
  head.position.y = 1.42;
  body.add(head);
  if (p.helmet != null && !p.crown) {
    const h = new THREE.Mesh(geo('helmet', () => new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat(p.helmet));
    h.position.y = 1.5;
    h.scale.set(1.05, 1, 1.1);
    body.add(h);
  }
  if (p.crown) {
    const c = new THREE.Mesh(geo('crown', () => new THREE.CylinderGeometry(0.2, 0.17, 0.16, 8, 1, true)), mat(p.helmet, { side: THREE.DoubleSide }));
    c.position.y = 1.64;
    body.add(c);
  }
  if (p.ears) {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(geo('ear', () => new THREE.ConeGeometry(0.06, 0.24, 6)), mat(p.skin));
      e.position.set(0.22 * s, 1.46, 0);
      e.rotation.z = -s * Math.PI / 2.4;
      body.add(e);
    }
  }
  if (p.horns) {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(geo('horn', () => new THREE.ConeGeometry(0.06, 0.22, 6)), mat(p.horns));
      e.position.set(0.12 * s, 1.64, 0);
      e.rotation.z = -s * 0.5;
      body.add(e);
    }
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(0.33 * s * k, 1.2, 0);
    const arm = new THREE.Mesh(boxG(0.14 * k, 0.5, 0.16 * k, -0.25), mat(p.shirt));
    piv.add(arm);
    const hand = new THREE.Mesh(boxG(0.13 * k, 0.12, 0.14 * k), mat(p.skin));
    hand.position.y = -0.54;
    piv.add(hand);
    body.add(piv);
    arms.push(piv);
  }
  let gunMesh = null;
  if (gun) {
    gunMesh = buildGun(gun);
    gunMesh.scale.setScalar(1.25);
    gunMesh.position.set(0.1, 1.16, -0.52);
    body.add(gunMesh);
    arms[0].rotation.set(1.4, 0, 0.75);
    arms[1].rotation.set(1.4, 0, -0.2);
  }
  root.add(blobShadow(0.4 * k));
  root.userData.rig = { body, legs, arms, gun: gunMesh, armed: !!gun };
  return root;
}

/** phase: animation clock, run: 0..1 running amount, swing: 0..1 attack. */
export function animateRig(rig, phase, run, swing = 0) {
  const s = Math.sin(phase);
  rig.legs[0].rotation.x = s * 0.85 * run;
  rig.legs[1].rotation.x = -s * 0.85 * run;
  rig.body.position.y = Math.abs(Math.cos(phase)) * 0.07 * run;
  if (rig.armed) {
    rig.body.rotation.y = s * 0.05 * run;
  } else {
    const reach = 1.35 + swing * 1.7; // swing > 0 raises the arms overhead, < 0 follows through
    rig.arms[0].rotation.x = reach + Math.sin(phase * 0.5) * 0.15;
    rig.arms[1].rotation.x = reach - Math.sin(phase * 0.5) * 0.15;
    rig.body.rotation.x = 0.12 + swing * 0.3;
  }
}

// [handle, head] colors of each boss's weapon
const BOSS_WEAPONS = {
  ogre: [0x7a4a25, 0x8d8f93],
  yeti: [0x6b8fa8, 0xbfe9ff],
  goblinKing: [0x6b4423, 0xffc61a],
  mutant: [0x2e1d45, 0xb46cff],
};

/** A big hammer held in the right hand; it extends the arm so a slam reaches far forward. */
function buildBossWeapon(type) {
  const [hc, kc] = BOSS_WEAPONS[type];
  const w = new THREE.Group();
  const handle = new THREE.Mesh(geo('wHandle', () => new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8)), mat(hc));
  handle.position.y = -1.05;
  w.add(handle);
  const head = new THREE.Mesh(boxG(0.36, 0.36, 0.62), mat(kc));
  head.position.y = -1.62;
  w.add(head);
  for (const s of [-1, 1]) {
    const spike = new THREE.Mesh(geo('wSpike', () => new THREE.ConeGeometry(0.08, 0.22, 6)), mat(kc));
    spike.position.set(0.24 * s, -1.62, 0);
    spike.rotation.z = -s * Math.PI / 2;
    w.add(spike);
  }
  return w;
}

export function buildBoss(type) {
  const b = BOSSES[type];
  const g = buildHumanoid(b.pal);
  g.userData.rig.arms[1].add(buildBossWeapon(type));
  g.scale.setScalar(b.scale);
  return g;
}

// ---------------------------------------------------------------- obstacles

let barrelTex, crateTex;

export function buildBarrel() {
  barrelTex ||= canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#a8713f'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 21) {
      c.fillStyle = x % 42 ? '#9a6536' : '#b57c48';
      c.fillRect(x, 0, 21, h);
      c.fillStyle = '#6e4423'; c.fillRect(x, 0, 2, h);
    }
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo('barrel', () => {
    const pts = [new THREE.Vector2(0, -0.85)];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(0.7 + 0.13 * Math.sin(Math.PI * t), -0.85 + 1.7 * t));
    }
    pts.push(new THREE.Vector2(0, 0.85));
    return new THREE.LatheGeometry(pts, 22).rotateZ(Math.PI / 2);
  }), new THREE.MeshLambertMaterial({ map: barrelTex }));
  body.position.y = 0.84;
  g.add(body);
  for (const s of [-1, 1]) {
    const band = new THREE.Mesh(geo('band', () => new THREE.CylinderGeometry(0.8, 0.8, 0.13, 22).rotateZ(Math.PI / 2)), mat(0x7d848c));
    band.position.set(0.5 * s, 0.84, 0);
    g.add(band);
  }
  g.add(blobShadow(1.0));
  return g;
}

export function buildCrate() {
  crateTex ||= canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#b8462c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      c.fillStyle = y % 64 ? '#a83d25' : '#c25234';
      c.fillRect(0, y, w, 32);
      c.fillStyle = '#7a2a1a'; c.fillRect(0, y, w, 3);
    }
    c.strokeStyle = '#6b2314'; c.lineWidth = 12; c.strokeRect(0, 0, w, h);
  });
  const g = new THREE.Group();
  const box = new THREE.Mesh(boxG(1.9, 1.6, 1.5), new THREE.MeshLambertMaterial({ map: crateTex }));
  box.position.y = 0.8;
  g.add(box);
  // floating gold gun = "this crate upgrades your weapon"
  const icon = buildGun({ color: 0xffc61a, len: 0.7 });
  icon.scale.setScalar(1.3);
  icon.position.y = 2.3;
  icon.rotation.y = Math.PI / 2;
  g.add(icon);
  g.userData.icon = icon;
  g.add(blobShadow(1.1));
  return g;
}

export function buildTires() {
  const g = new THREE.Group();
  const tg = geo('tire', () => new THREE.TorusGeometry(0.6, 0.3, 10, 24).rotateX(Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(tg, mat(0x2a2a2c));
    t.position.y = 0.3 + i * 0.56;
    t.rotation.y = i;
    g.add(t);
  }
  g.add(blobShadow(1.0));
  return g;
}

// ---------------------------------------------------------------- gates & coins

export function buildGatePanel(width) {
  const g = new THREE.Group();
  const panelMat = new THREE.MeshBasicMaterial({ color: 0x34d03a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.5), panelMat);
  panel.position.y = 1.25;
  g.add(panel);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2fbf3a });
  const pg = geo('post', () => new THREE.CylinderGeometry(0.13, 0.13, 2.9, 10));
  const cg = geo('postCap', () => new THREE.CylinderGeometry(0.17, 0.17, 0.12, 10));
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(pg, postMat);
    post.position.set(s * width / 2, 1.45, 0);
    g.add(post);
    for (const y of [0.06, 1.0, 2.0, 2.9]) {
      const cap = new THREE.Mesh(cg, postMat);
      cap.position.set(s * width / 2, y, 0);
      g.add(cap);
    }
  }
  g.userData = { panelMat, postMat };
  return g;
}

export function setGateColor(g, good) {
  g.userData.panelMat.color.set(good ? 0x3ddc3d : 0xff3b3b);
  g.userData.postMat.color.set(good ? 0x2fbf3a : 0xd92b2b);
}

export const coinGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.09, 24).rotateX(Math.PI / 2);
export const coinMat = new THREE.MeshLambertMaterial({ color: 0xffc61a, emissive: 0x6b4a00 });

// ---------------------------------------------------------------- environment

/** Free a bridge built by buildBridge (its geometries and deck texture are its own). */
export function disposeBridge(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.userData.own) { o.material.map?.dispose(); o.material.dispose(); }
  });
}

/** Bridge from startZ back to -length. `tint` multiplies the deck colour per world. */
export function buildBridge(length, startZ = 30, tint = 0xffffff) {
  const g = new THREE.Group();
  const total = length + startZ;
  const midZ = startZ - total / 2;

  const deckTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#dcd9d3'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d1cdc6'; c.fillRect(0, 0, w, 4);
    c.fillStyle = '#c9c5be';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      c.beginPath(); c.arc(8 + i * 16, 8 + j * 16, 3.4, 0, Math.PI * 2); c.fill();
    }
  });
  deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping;
  deckTex.repeat.set(5.5, total / 2);
  deckTex.anisotropy = 8;
  const deckMat = new THREE.MeshLambertMaterial({ map: deckTex, color: tint });
  deckMat.userData.own = true;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, total), deckMat);
  deck.position.set(0, -0.3, midZ);
  g.add(deck);

  const under = new THREE.Mesh(new THREE.BoxGeometry(12.5, 1.4, total), mat(0x8d8a85));
  under.position.set(0, -1.3, midZ);
  g.add(under);

  for (const s of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, total), mat(0xc9c6c0));
    curb.position.set(s * 5.9, 0.45, midZ);
    g.add(curb);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, total, 10).rotateX(Math.PI / 2), mat(0xa9a6a0));
    rail.position.set(s * 6.05, 1.05, midZ);
    g.add(rail);
  }

  // Suspension towers + cables
  const cablePts = [];
  const towerMat = mat(0xaeadab);
  const topY = 24;
  for (let z = startZ - 10; z > -length + 5; z -= 75) {
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 36, 1.5), towerMat);
      p.position.set(s * 7.2, topY - 18 + 2, z);
      g.add(p);
      // fan cables from the tower top down to the deck edge
      for (let i = 1; i <= 6; i++) {
        for (const dir of [-1, 1]) {
          cablePts.push(s * 7.2, topY - 1, z, s * 6.1, 1.2, z + dir * i * 6);
        }
      }
    }
    for (const y of [topY, topY - 9]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(15.6, 1.1, 1.3), towerMat);
      beam.position.set(0, y, z);
      g.add(beam);
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePts, 3));
  g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x8e8e8e })));
  return g;
}
