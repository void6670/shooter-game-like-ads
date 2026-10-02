import * as THREE from 'three';
import '@fontsource/lilita-one';
import {
  buildHumanoid, animateRig, buildBoss, buildBarrel, buildCrate, buildTires, buildGatePanel, setGateColor,
  buildBridge, coinGeo, coinMat, PALETTES, BOSSES,
} from './models.js';
import { Label, textSprite } from './text.js';
import { generateLevel } from './level.js';
import { save, persist, GUNS, UPGRADES, upgradeCost, isMaxed, stats, fmt } from './save.js';

const RUN_SPEED = 6.5;
const BULLET_SPEED = 46;
const BULLET_RANGE = 40;
const MAX_SOLDIERS = 60;
const MAX_BULLETS = 2000;
const MAX_PARTICLES = 900;
const ROAD_HALF = 4.9;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- renderer / scene
const app = $('app');
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x56aee8);
scene.fog = new THREE.Fog(0x8fcbf0, 70, 150);
const camera = new THREE.PerspectiveCamera(60, 0.5, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7b5, 1.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(6, 14, 8);
scene.add(sun);

const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2b8ad8 }));
sea.position.y = -9;
scene.add(sea);

function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect > 0.75 ? 48 : 60;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- instanced bullets & particles
const bulletMesh = new THREE.InstancedMesh(
  new THREE.CapsuleGeometry(0.1, 1.0, 3, 6).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xaef0ff }),
  MAX_BULLETS,
);
bulletMesh.frustumCulled = false;
bulletMesh.count = 0;
scene.add(bulletMesh);

const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_PARTICLES);
partMesh.frustumCulled = false;
partMesh.count = 0;
partMesh.setColorAt(0, new THREE.Color());
scene.add(partMesh);

const bullets = [];
const particles = [];
const floaters = [];
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const tmpE = new THREE.Euler();

function burst(x, y, z, color, n = 14, power = 5, size = 1) {
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.4 + Math.random() * 0.8);
    particles.push({
      x, y: y + Math.random() * 0.6, z,
      vx: Math.cos(a) * sp, vy: 2 + Math.random() * power, vz: Math.sin(a) * sp,
      rx: Math.random() * 6, ry: Math.random() * 6,
      life: 0.6 + Math.random() * 0.5, max: 1.1,
      s: size * (0.6 + Math.random() * 0.9),
      c: Array.isArray(color) ? color[i % color.length] : color,
    });
  }
}

function floatText(text, x, y, z, opts = {}) {
  const s = textSprite(text, opts);
  s.position.set(x, y, z);
  scene.add(s);
  floaters.push({ obj: s, life: opts.life ?? 1.0, max: opts.life ?? 1.0, vy: opts.vy ?? 1.6, sprite: true });
}

function coinPop(x, y, z, amount) {
  const c = new THREE.Mesh(coinGeo, coinMat);
  c.position.set(x, y + 0.6, z);
  scene.add(c);
  floaters.push({ obj: c, life: 0.9, max: 0.9, vy: 2.2, spin: true });
  floatText(fmt(amount), x, y + 1.5, z, { height: 0.75, life: 0.9, vy: 2.2 });
}

// ---------------------------------------------------------------- game state
let world = null;
let G = null;
let paused = false;
const labels = [];

function coinUnit() {
  return 5 * Math.pow(1.22, G.level - 1) * G.st.income * G.coinMult;
}

function addCoins(amount, pos) {
  amount = Math.max(1, Math.round(amount));
  save.coins += amount;
  G.earned += amount;
  G.gain += amount;
  G.gainT = 1.3;
  if (pos) coinPop(pos.x, pos.y ?? 1, pos.z, amount);
}

function newLabel(w, h, opts) {
  const l = new Label(w, h, opts);
  labels.push(l);
  return l;
}

function buildLevel() {
  if (world) scene.remove(world);
  for (const l of labels) l.dispose();
  labels.length = 0;
  bullets.length = 0;
  particles.length = 0;
  for (const f of floaters) { scene.remove(f.obj); if (f.sprite) f.obj.material.dispose(); }
  floaters.length = 0;

  world = new THREE.Group();
  scene.add(world);
  const lv = generateLevel(save.level);
  const st = stats();
  G = {
    level: save.level, lv, st,
    state: 'menu',
    sx: 0, sz: 0, endZ: -lv.length,
    soldiers: [], enemies: [], obstacles: [], gates: [], coinGates: [], fading: [],
    boss: null,
    coinMult: 1, rateMult: 1, dmgMult: 1, crateBuffs: 0,
    earned: 0, gain: 0, gainT: 0,
    time: 0, shake: 0, endTimer: -1,
  };
  bulletMesh.material.color.set(st.gun.bullet);

  world.add(buildBridge(lv.length + 140));
  for (const ev of lv.events) {
    if (ev.type === 'obstacle') addObstacle(ev);
    else if (ev.type === 'gates') addGates(ev);
    else if (ev.type === 'enemies') ev.list.forEach(addEnemy);
    else if (ev.type === 'coingate') addCoinGate(ev);
  }
  addBoss(lv.boss);
  for (let i = 0; i < st.startSoldiers; i++) addSoldier();
  for (const s of G.soldiers) { const p = slot(G.soldiers.indexOf(s)); s.x = p.x; s.z = p.z; }

  snapCamera();
  $('bossBar').classList.remove('show');
  updateHUD(0);
}

// ---------------------------------------------------------------- soldiers
const SLOTS = [];
for (let i = 0; i < MAX_SOLDIERS; i++) {
  const r = 0.62 * Math.sqrt(i);
  const a = i * 2.39996;
  SLOTS.push({ x: r * Math.cos(a), z: r * Math.sin(a) * 0.85 });
}
function slot(i) { return SLOTS[i] || SLOTS[0]; }
function squadRadius() { return 0.62 * Math.sqrt(Math.max(0, G.soldiers.length - 1)) + 0.35; }

function addSoldier() {
  if (G.soldiers.length >= MAX_SOLDIERS) return false;
  const g = buildHumanoid(PALETTES.soldier, G.st.gun);
  const s = {
    g, rig: g.userData.rig,
    x: G.sx + (Math.random() - 0.5), z: G.sz + (Math.random() - 0.5),
    fire: Math.random() / G.st.rate, phase: Math.random() * 6, pop: 0,
  };
  g.position.set(s.x, 0, s.z);
  g.scale.setScalar(0.01);
  world.add(g);
  G.soldiers.push(s);
  return true;
}

function killSoldier(i, fling = false) {
  const s = G.soldiers[i];
  if (!s) return;
  G.soldiers.splice(i, 1);
  world.remove(s.g);
  burst(s.x, 0.9, s.z, [0x3ccf4a, 0x5f7d48, 0xffffff], fling ? 22 : 12, fling ? 8 : 4);
  if (G.soldiers.length === 0) fail();
}

function removeSoldiers(n) {
  // outermost first — they are at the end of the slot spiral
  for (let k = 0; k < n && G.soldiers.length; k++) killSoldier(G.soldiers.length - 1);
}

function nearestSoldier(x, z) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < G.soldiers.length; i++) {
    const s = G.soldiers[i];
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { i: best, d: Math.sqrt(bd) };
}

function updateSoldiers(dt, firing, running) {
  const n = G.soldiers.length;
  const k = 1 - Math.exp(-dt * 10);
  const rate = G.st.rate * G.rateMult;
  for (let i = 0; i < n; i++) {
    const s = G.soldiers[i];
    const p = slot(i);
    const tx = THREE.MathUtils.clamp(G.sx + p.x, -ROAD_HALF - 0.2, ROAD_HALF + 0.2);
    s.x += (tx - s.x) * k;
    s.z += (G.sz + p.z - s.z) * k;
    s.pop = Math.min(1, s.pop + dt * 5);
    s.g.position.set(s.x, 0, s.z);
    s.g.scale.setScalar(0.3 + 0.7 * s.pop + Math.sin(s.pop * Math.PI) * 0.25);
    s.phase += dt * (running ? 11 : 3);
    if (G.state === 'win') {
      s.g.position.y = Math.abs(Math.sin(G.time * 7 + i)) * 0.6;
      animateRig(s.rig, s.phase, 0);
    } else {
      animateRig(s.rig, s.phase, running ? 1 : 0.15);
    }

    if (firing) {
      s.fire -= dt;
      if (s.fire < -0.5) s.fire = 0;
      while (s.fire <= 0) {
        s.fire += (1 / rate) * (0.85 + Math.random() * 0.3);
        const aim = aimAt(s);
        for (let b = 0; b < G.st.bullets; b++) {
          const off = G.st.bullets > 1 ? (b - (G.st.bullets - 1) / 2) * G.st.spread : (Math.random() - 0.5) * G.st.spread;
          spawnBullet(s.x + 0.1, s.z - 1.1, (aim + off) * BULLET_SPEED);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- bullets & hits
/** Slight auto-aim: steer toward the closest enemy inside a narrow forward cone. */
function aimAt(s) {
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const dz = s.z - e.z;
    if (dz < 1 || dz > 30) continue;
    const slope = (e.x - s.x) / dz;
    if (Math.abs(slope) > 0.4) continue;
    if (dz < bd) { bd = dz; best = slope; }
  }
  if (best === null && G.boss && G.boss.alive && G.boss.active) {
    const dz = s.z - G.boss.z;
    if (dz > 1) best = THREE.MathUtils.clamp((G.boss.x - s.x) / dz, -0.4, 0.4);
  }
  return best ?? 0;
}

function spawnBullet(x, z, vx) {
  if (bullets.length >= MAX_BULLETS) return;
  bullets.push({ x, z, pz: z, vx, life: BULLET_RANGE / BULLET_SPEED, dmg: G.st.damage * G.dmgMult });
}

function gatherTargets() {
  const zMin = G.sz - BULLET_RANGE - 6, zMax = G.sz + 1;
  const t = [];
  for (const o of G.obstacles) if (o.alive && o.z > zMin && o.z < zMax) t.push({ x: o.x, z: o.z, w: o.w, d: o.d, kind: 'obs', ref: o });
  for (const e of G.enemies) if (e.alive && e.z > zMin && e.z < zMax) t.push({ x: e.x, z: e.z, w: e.r + 0.1, d: e.r, kind: 'enemy', ref: e });
  for (const g of G.gates) {
    if (g.passed || g.z < zMin || g.z > zMax) continue;
    for (const h of g.halves) t.push({ x: (h.x0 + h.x1) / 2, z: g.z, w: (h.x1 - h.x0) / 2, d: 0.15, kind: 'half', ref: h });
  }
  for (const c of G.coinGates) if (!c.passed && c.z > zMin && c.z < zMax) t.push({ x: 0, z: c.z, w: 6, d: 0.15, kind: 'cgate', ref: c });
  const b = G.boss;
  if (b && b.alive && b.z > zMin) t.push({ x: b.x, z: b.z, w: b.r, d: b.r, kind: 'boss', ref: b });
  return t;
}

function updateBullets(dt, collide) {
  const targets = collide ? gatherTargets() : [];
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.pz = b.z;
    b.z -= BULLET_SPEED * dt;
    b.x += b.vx * dt;
    b.life -= dt;
    let hit = null, hz = -Infinity;
    for (const t of targets) {
      if (Math.abs(b.x - t.x) > t.w) continue;
      const front = t.z + t.d;
      if (front < b.z || t.z - t.d > b.pz) continue;
      if (front > hz) { hz = front; hit = t; }
    }
    if (hit) {
      onHit(hit, b);
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
    } else if (b.life <= 0) {
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
    }
  }
}

function onHit(t, b) {
  const o = t.ref;
  switch (t.kind) {
    case 'obs': {
      o.hp -= b.dmg;
      o.punch = 0.1;
      if (Math.random() < 0.3) burst(b.x, 0.9, o.z + o.d, o.kind === 'tires' ? 0x333333 : 0xb07a45, 1, 2, 0.6);
      if (o.hp <= 0) destroyObstacle(o);
      else o.label.set(fmt(Math.ceil(o.hp)));
      break;
    }
    case 'enemy':
      o.hp -= b.dmg;
      o.punch = 0.12;
      if (o.hp <= 0) killEnemy(o, true);
      else if (o.bar) o.bar.fill.scale.x = Math.max(0.001, o.hp / o.maxHp);
      break;
    case 'half':
      if (o.op === 'add') {
        o.val = Math.min(60, o.val + (o.val < 0 ? 1 : 0.25));
        refreshHalf(o);
      }
      o.flash = 0.08;
      break;
    case 'cgate':
      o.val = Math.min(3, o.val + 0.02);
      o.label.set('X' + o.val.toFixed(1));
      break;
    case 'boss':
      o.hp -= b.dmg;
      o.punch = 0.05;
      if (Math.random() < 0.25) burst(b.x, 2 + Math.random() * 3, o.z + o.r, 0xffffff, 1, 2, 0.6);
      if (o.hp <= 0) killBoss();
      break;
  }
}

// ---------------------------------------------------------------- obstacles
function addObstacle(ev) {
  let g, w, d, label;
  if (ev.kind === 'barrel') {
    g = buildBarrel(); w = 0.9; d = 0.85;
    label = newLabel(1.6, 0.8);
    label.mesh.position.set(0, 0.85, 0.88);
  } else if (ev.kind === 'crate') {
    g = buildCrate(); w = 1.0; d = 0.78;
    label = newLabel(1.8, 0.9);
    label.mesh.position.set(0, 0.8, 0.77);
  } else {
    g = buildTires(); w = 0.95; d = 0.95;
    label = newLabel(1.9, 0.75);
    label.mesh.position.set(0, 1.95, 0.5);
  }
  label.set(fmt(ev.hp));
  g.add(label.mesh);
  g.position.set(ev.x, 0, ev.z);
  world.add(g);
  G.obstacles.push({ kind: ev.kind, x: ev.x, z: ev.z, w, d, hp: ev.hp, maxHp: ev.hp, g, label, alive: true, punch: 0 });
}

const CRATE_BUFFS = [
  { text: 'FIRE RATE UP!', apply: () => { G.rateMult *= 1.25; } },
  { text: 'DAMAGE UP!', apply: () => { G.dmgMult *= 1.3; } },
  { text: '+3 SOLDIERS', apply: () => { for (let i = 0; i < 3; i++) addSoldier(); } },
];

function destroyObstacle(o) {
  o.alive = false;
  world.remove(o.g);
  const colors = o.kind === 'tires' ? [0x2a2a2c, 0x444444] : o.kind === 'crate' ? [0xb8462c, 0x7a2a1a, 0xffc61a] : [0xa8713f, 0x6e4423, 0x7d848c];
  burst(o.x, 0.8, o.z, colors, 22, 6, 1.4);
  const mult = o.kind === 'tires' ? 5 : o.kind === 'crate' ? 3 : 2;
  addCoins(coinUnit() * mult, { x: o.x, y: 1, z: o.z });
  if (o.kind === 'crate') {
    const buff = CRATE_BUFFS[G.crateBuffs++ % CRATE_BUFFS.length];
    buff.apply();
    showBanner(buff.text, 'gold');
  }
}

// ---------------------------------------------------------------- gates
function addGates(ev) {
  const gate = { z: ev.z, passed: false, halves: [] };
  [ev.left, ev.right].forEach((h, i) => {
    const x0 = i === 0 ? -ROAD_HALF - 0.4 : 0;
    const x1 = i === 0 ? 0 : ROAD_HALF + 0.4;
    const g = buildGatePanel(x1 - x0);
    g.position.set((x0 + x1) / 2, 0, ev.z);
    const label = newLabel(3.2, 1.6, { stroke: '#1d2b38', strokeRatio: 0.06 });
    label.mesh.position.set(0, 1.35, 0.05);
    g.add(label.mesh);
    world.add(g);
    const half = { x0, x1, op: h.op, val: h.val, g, label, flash: 0 };
    refreshHalf(half);
    gate.halves.push(half);
  });
  G.gates.push(gate);
}

function refreshHalf(h) {
  const good = h.op === 'mul' || h.val > 0;
  setGateColor(h.g, good);
  if (h.op === 'mul') h.label.set('x' + h.val);
  else {
    const v = Math.trunc(h.val);
    h.label.set((v > 0 ? '+' : '') + v);
  }
}

function addCoinGate(ev) {
  const g = buildGatePanel(2 * ROAD_HALF + 0.8);
  g.position.set(0, 0, ev.z);
  const label = newLabel(3.6, 1.5, { stroke: '#1d2b38', strokeRatio: 0.06, icon: 'coin' });
  label.mesh.position.set(0, 1.35, 0.05);
  label.set('X1.0');
  g.add(label.mesh);
  world.add(g);
  G.coinGates.push({ z: ev.z, val: 1, g, label, passed: false });
}

function fadeOut(g) { G.fading.push({ g, t: 0 }); }

function checkGates() {
  for (const gate of G.gates) {
    if (gate.passed || G.sz > gate.z) continue;
    gate.passed = true;
    const h = G.sx < 0 ? gate.halves[0] : gate.halves[1];
    const before = G.soldiers.length;
    if (h.op === 'mul') {
      const add = before * (h.val - 1);
      for (let i = 0; i < add; i++) addSoldier();
    } else {
      const v = Math.trunc(h.val);
      if (v > 0) for (let i = 0; i < v; i++) addSoldier();
      else removeSoldiers(-v);
    }
    const delta = G.soldiers.length - before;
    const good = h.op === 'mul' || h.val > 0;
    floatText((delta >= 0 ? '+' : '') + delta, G.sx, 3, G.sz - 1, { fill: good ? '#6dff6d' : '#ff5b4d', height: 1.4, life: 1.1 });
    for (const x of gate.halves) fadeOut(x.g);
  }
  for (const c of G.coinGates) {
    if (c.passed || G.sz > c.z) continue;
    c.passed = true;
    G.coinMult *= c.val;
    showBanner(`COINS X${c.val.toFixed(1)}`, 'gold');
    fadeOut(c.g);
  }
}

// ---------------------------------------------------------------- enemies
function addEnemy(e) {
  const brute = e.kind === 'brute';
  const g = buildHumanoid(PALETTES[e.kind]);
  if (brute) g.scale.setScalar(1.7);
  g.rotation.y = Math.PI;
  g.position.set(e.x, 0, e.z);
  world.add(g);
  const en = {
    kind: e.kind, x: e.x, z: e.z, hp: e.hp, maxHp: e.hp, g, rig: g.userData.rig,
    r: brute ? 0.75 : 0.38, speed: brute ? 1.5 : 1.8 + Math.random() * 0.8,
    active: false, alive: true, phase: Math.random() * 6, punch: 0, scale: brute ? 1.7 : 1, bar: null,
  };
  if (brute) en.bar = hpBar(g, 2.15, 0.9);
  G.enemies.push(en);
}

function hpBar(parent, y, w) {
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.16), new THREE.MeshBasicMaterial({ color: 0x1b1b1b, depthTest: false }));
  const fillGeo = new THREE.PlaneGeometry(w - 0.06, 0.1).translate((w - 0.06) / 2, 0, 0);
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xe8392b, depthTest: false }));
  fill.position.set(-(w - 0.06) / 2, 0, 0.001);
  bg.renderOrder = 5; fill.renderOrder = 6;
  bar.add(bg, fill);
  bar.position.y = y;
  bar.rotation.y = Math.PI; // parent faces the squad; flip so the bar faces the camera
  parent.add(bar);
  return { bar, fill };
}

function killEnemy(e, reward) {
  e.alive = false;
  world.remove(e.g);
  const pal = PALETTES[e.kind];
  burst(e.x, 1, e.z, [0xffffff, 0xffffff, pal.skin, pal.pants], e.kind === 'brute' ? 30 : 12, 4, e.kind === 'brute' ? 1.6 : 1);
  if (reward) addCoins(coinUnit() * (e.kind === 'brute' ? 6 : 1), { x: e.x, y: 1.2, z: e.z });
}

function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (!e.alive) continue;
    if (!e.active && e.z > G.sz - 34) e.active = true;
    e.phase += dt * (e.active ? 8 : 2);
    e.punch = Math.max(0, e.punch - dt);
    e.g.scale.setScalar(e.scale * (1 + e.punch));
    if (!e.active || !G.soldiers.length) { animateRig(e.rig, e.phase, 0); continue; }

    const n = nearestSoldier(e.x, e.z);
    const s = G.soldiers[n.i];
    const dx = s.x - e.x, dz = s.z - e.z;
    const len = Math.hypot(dx, dz) || 1;
    // drift sideways toward the target, but always keep advancing
    e.x += (dx / len) * e.speed * dt;
    e.z += Math.max(0.5, dz / len) * e.speed * dt;
    e.g.position.set(e.x, 0, e.z);
    e.g.rotation.y = Math.atan2(-dx, -dz);
    animateRig(e.rig, e.phase, 1);

    if (n.d < e.r + 0.32) {
      killSoldier(n.i);
      if (e.kind === 'brute') {
        e.hp -= e.maxHp * 0.25;
        if (e.hp <= 0) killEnemy(e, false);
        else e.bar.fill.scale.x = e.hp / e.maxHp;
      } else killEnemy(e, false);
    }
    if (e.alive && e.z > G.sz + 6) { e.alive = false; world.remove(e.g); }
  }
}

function obstacleCollisions() {
  for (const o of G.obstacles) {
    if (!o.alive || Math.abs(o.z - G.sz) > 6) continue;
    for (let i = G.soldiers.length - 1; i >= 0; i--) {
      const s = G.soldiers[i];
      if (Math.abs(s.x - o.x) < o.w + 0.22 && Math.abs(s.z - o.z) < o.d + 0.22) {
        // crashing soldiers sacrifice themselves and smash the obstacle
        killSoldier(i);
        o.hp -= Math.max(o.maxHp * 0.15, G.st.damage * 8);
        o.punch = 0.2;
        if (o.hp <= 0) { destroyObstacle(o); break; }
        o.label.set(fmt(Math.ceil(o.hp)));
      }
    }
  }
}

// ---------------------------------------------------------------- boss
function addBoss(cfg) {
  const def = BOSSES[cfg.type];
  const g = buildBoss(cfg.type);
  const scale = def.scale * (cfg.mega ? 1.2 : 1);
  g.scale.setScalar(scale);
  g.rotation.y = Math.PI;
  const z = G.endZ - 24;
  g.position.set(0, 0, z);
  world.add(g);
  G.boss = {
    name: (cfg.mega ? 'MEGA ' : '') + def.name, g, rig: g.userData.rig,
    hp: cfg.hp, maxHp: cfg.hp, x: 0, z, r: 0.42 * scale, scale,
    alive: true, active: false, attackT: 1, swing: 0, phase: 0, punch: 0,
  };
}

function startBoss() {
  G.state = 'boss';
  G.boss.active = true;
  $('bossName').textContent = G.boss.name;
  $('bossBar').classList.add('show');
  showBanner('BOSS FIGHT!', 'red');
}

function updateBoss(dt) {
  const b = G.boss;
  if (!b || !b.alive) return;
  b.phase += dt * 4;
  b.punch = Math.max(0, b.punch - dt);
  b.swing = Math.max(0, b.swing - dt * 3);
  b.g.scale.setScalar(b.scale * (1 + b.punch));
  if (!b.active || !G.soldiers.length) { animateRig(b.rig, b.phase, 0, b.swing); return; }

  let front = Infinity;
  for (const s of G.soldiers) front = Math.min(front, s.z);
  const stopZ = front - b.r - 0.6;
  const moving = b.z < stopZ;
  if (moving) b.z = Math.min(stopZ, b.z + (2.2 + G.level * 0.04) * dt);
  b.x += (G.sx - b.x) * Math.min(1, dt * 0.8);
  b.g.position.set(b.x, 0, b.z);
  animateRig(b.rig, b.phase, moving ? 1 : 0, b.swing);

  if (!moving) {
    b.attackT -= dt;
    if (b.attackT <= 0) {
      b.attackT = 0.85;
      b.swing = 1;
      G.shake = 0.35;
      const kills = 1 + Math.floor(G.level / 6);
      for (let k = 0; k < kills && G.soldiers.length; k++) killSoldier(nearestSoldier(b.x, b.z).i, true);
    }
  }
}

function killBoss() {
  const b = G.boss;
  b.alive = false;
  world.remove(b.g);
  const pal = BOSSES[G.lv.boss.type].pal;
  for (let i = 0; i < 4; i++) burst(b.x, 1 + i, b.z, [0xffffff, pal.skin, pal.shirt], 30, 9, 2.2);
  G.shake = 0.6;
  addCoins(coinUnit() * 40, { x: b.x, y: 3, z: b.z });
  $('bossBar').classList.remove('show');
  win();
}

// ---------------------------------------------------------------- flow
function win() {
  if (G.state === 'win' || G.state === 'lose') return;
  G.state = 'win';
  addCoins(coinUnit() * 25);
  save.level++;
  persist();
  showBanner('VICTORY!', 'gold');
  G.endTimer = 1.8;
}

function fail() {
  if (G.state === 'win' || G.state === 'lose' || G.state === 'menu') return;
  G.state = 'lose';
  persist();
  $('bossBar').classList.remove('show');
  G.endTimer = 1.2;
}

function showEndScreen() {
  if (G.state === 'win') {
    $('winCoins').textContent = '+' + fmt(G.earned);
    show('winScreen');
  } else {
    $('loseCoins').textContent = '+' + fmt(G.earned);
    show('loseScreen');
  }
}

function startRun() {
  hideAll();
  G.state = 'play';
  G.gain = 0;
  $('hint').classList.toggle('show', save.level <= 2);
  setTimeout(() => $('hint').classList.remove('show'), 3000);
}

function goHome() {
  buildLevel();
  paused = false;
  renderMenu();
  show('menu');
}

// ---------------------------------------------------------------- update loop
function update(dt) {
  G.time += dt;
  const running = G.state === 'play';
  const fighting = G.state === 'play' || G.state === 'boss';

  if (running) {
    G.sz -= RUN_SPEED * dt;
    if (G.sz <= G.endZ) { G.sz = G.endZ; startBoss(); }
  }
  if (fighting) {
    if (keys.left) G.sx -= 9 * dt;
    if (keys.right) G.sx += 9 * dt;
  }
  const lim = Math.max(0, ROAD_HALF - Math.min(squadRadius(), ROAD_HALF) * 0.85);
  G.sx = THREE.MathUtils.clamp(G.sx, -lim, lim);

  updateSoldiers(dt, fighting, running);
  updateBullets(dt, fighting);
  if (fighting) {
    checkGates();
    obstacleCollisions();
    updateEnemies(dt);
  }
  updateBoss(dt);

  for (const o of G.obstacles) {
    if (!o.alive) continue;
    o.punch = Math.max(0, o.punch - dt);
    o.g.scale.setScalar(1 + o.punch);
    if (o.g.userData.icon) {
      o.g.userData.icon.rotation.y += dt * 2;
      o.g.userData.icon.position.y = 2.3 + Math.sin(G.time * 3) * 0.12;
    }
  }
  for (const g of G.gates) for (const h of g.halves) {
    if (h.flash > 0) { h.flash -= dt; h.g.userData.panelMat.opacity = h.flash > 0 ? 0.75 : 0.5; }
  }
  for (let i = G.fading.length - 1; i >= 0; i--) {
    const f = G.fading[i];
    f.t += dt;
    f.g.scale.y = Math.max(0.001, 1 - f.t * 4);
    if (f.t > 0.25) { world.remove(f.g); G.fading.splice(i, 1); }
  }

  if (G.endTimer > 0) {
    G.endTimer -= dt;
    if (G.endTimer <= 0) showEndScreen();
  }
}

function updateEffects(dt) {
  // bullets
  bulletMesh.count = bullets.length;
  tmpS.set(1, 1, 1);
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    tmpQ.setFromEuler(tmpE.set(0, Math.atan2(-b.vx, BULLET_SPEED), 0));
    tmpM.compose(tmpP.set(b.x, 1.12, b.z), tmpQ, tmpS);
    bulletMesh.setMatrixAt(i, tmpM);
  }
  bulletMesh.instanceMatrix.needsUpdate = true;

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0 || p.y < -2) { particles[i] = particles[particles.length - 1]; particles.pop(); continue; }
    p.vy -= 22 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.1 && Math.abs(p.x) < 5.5) { p.y = 0.1; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
    p.rx += dt * 8; p.ry += dt * 6;
  }
  partMesh.count = particles.length;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const s = p.s * Math.min(1, p.life / 0.3);
    tmpQ.setFromEuler(tmpE.set(p.rx, p.ry, 0));
    tmpM.compose(tmpP.set(p.x, p.y, p.z), tmpQ, tmpS.set(s, s, s));
    partMesh.setMatrixAt(i, tmpM);
    partMesh.setColorAt(i, tmpC.set(p.c));
  }
  partMesh.instanceMatrix.needsUpdate = true;
  if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;

  // floating coins / texts
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= dt;
    f.obj.position.y += f.vy * dt;
    f.vy *= 1 - dt * 2;
    if (f.spin) f.obj.rotation.y += dt * 10;
    const k = f.life / f.max;
    if (f.sprite) f.obj.material.opacity = Math.min(1, k * 3);
    else f.obj.scale.setScalar(Math.min(1, k * 4));
    if (f.life <= 0) {
      scene.remove(f.obj);
      if (f.sprite) f.obj.material.dispose();
      floaters.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- camera
const camLook = new THREE.Vector3();
const camWant = new THREE.Vector3();
const lookWant = new THREE.Vector3();

function cameraTargets() {
  const boss = G.state === 'boss' || (G.state === 'win' && G.boss && G.sz <= G.endZ);
  camWant.set(G.sx * 0.45, boss ? 11.5 : 9.3, G.sz + (boss ? 12.5 : 10.2));
  lookWant.set(G.sx * 0.3, 0.5, G.sz - (boss ? 14 : 12));
}

function snapCamera() {
  cameraTargets();
  camera.position.copy(camWant);
  camLook.copy(lookWant);
  camera.lookAt(camLook);
}

function updateCamera(dt) {
  cameraTargets();
  const k = 1 - Math.exp(-dt * 5);
  camera.position.lerp(camWant, k);
  camLook.lerp(lookWant, k);
  G.shake = Math.max(0, G.shake - dt);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake;
    camera.position.y += (Math.random() - 0.5) * G.shake;
  }
  camera.lookAt(camLook);
  sea.position.set(camera.position.x, -9, camera.position.z);
}

// ---------------------------------------------------------------- HUD
const hud = {
  progFill: $('progFill'), progText: $('progText'), coinText: $('coinText'), coinGain: $('coinGain'),
  bossFill: $('bossFill'), bossHp: $('bossHp'), squad: $('squadCount'), levelTag: $('levelTag'),
};
const projV = new THREE.Vector3();

function updateHUD(dt) {
  const pct = Math.round(THREE.MathUtils.clamp(G.sz / G.endZ, 0, 1) * 100);
  hud.progFill.style.width = pct + '%';
  hud.progText.textContent = pct + '%';
  hud.levelTag.textContent = 'LEVEL ' + G.level;
  hud.coinText.textContent = fmt(save.coins);

  G.gainT -= dt;
  if (G.gainT > 0 && G.gain > 0) {
    hud.coinGain.textContent = '+' + fmt(G.gain);
    hud.coinGain.classList.add('show');
  } else {
    hud.coinGain.classList.remove('show');
    G.gain = 0;
  }

  if (G.boss) {
    hud.bossFill.style.width = Math.max(0, G.boss.hp / G.boss.maxHp * 100) + '%';
    hud.bossHp.textContent = fmt(Math.max(0, Math.ceil(G.boss.hp)));
  }

  const showCount = G.soldiers.length > 0 && (G.state === 'play' || G.state === 'boss');
  hud.squad.style.display = showCount ? 'block' : 'none';
  if (showCount) {
    projV.set(G.sx, 2.2 + squadRadius() * 0.3, G.sz).project(camera);
    hud.squad.style.left = ((projV.x + 1) / 2 * 100) + '%';
    hud.squad.style.top = ((1 - projV.y) / 2 * 100) + '%';
    hud.squad.textContent = G.soldiers.length;
  }
}

let bannerTimer = 0;
function showBanner(text, cls = '') {
  const el = $('banner');
  el.textContent = text;
  el.className = 'stroke ' + cls;
  void el.offsetWidth; // restart the animation
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 1700);
}

// ---------------------------------------------------------------- menus
const SCREENS = ['menu', 'gunShop', 'pauseScreen', 'winScreen', 'loseScreen'];
function show(id) { for (const s of SCREENS) $(s).classList.toggle('show', s === id); }
function hideAll() { show(null); }

function renderMenu() {
  $('menuLevel').textContent = 'LEVEL ' + save.level;
  const box = $('upgrades');
  box.innerHTML = '';
  for (const [key, u] of Object.entries(UPGRADES)) {
    const maxed = isMaxed(key);
    const cost = upgradeCost(key);
    const afford = save.coins >= cost;
    const card = document.createElement('button');
    card.className = 'card' + (maxed ? ' maxed' : afford ? '' : ' locked');
    card.innerHTML = `<div class="ico">${u.icon}</div><div>${u.name}</div><div class="lv">LV ${save.up[key] + 1}</div>` +
      `<div class="cost">${maxed ? 'MAX' : fmt(cost)}</div>`;
    card.onclick = () => {
      if (maxed || save.coins < cost) { card.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 200); return; }
      save.coins -= cost;
      save.up[key]++;
      persist();
      // refresh squad / stats on the waiting level
      buildLevel();
      renderMenu();
    };
    box.appendChild(card);
  }
}

function renderGuns() {
  const list = $('gunList');
  list.innerHTML = '';
  for (const g of GUNS) {
    const owned = save.owned.includes(g.id);
    const equipped = save.gun === g.id;
    const row = document.createElement('div');
    row.className = 'gun-row' + (equipped ? ' equipped' : '');
    const dps = Math.round(2 * g.dmg * g.rate * g.bullets * 10) / 10;
    row.innerHTML = `<div class="gun-swatch" style="background:#${g.color.toString(16).padStart(6, '0')}"></div>` +
      `<div class="grow"><div class="name">${g.name}</div><div class="meta">DMG ${g.dmg}x · RATE ${g.rate}/s${g.bullets > 1 ? ` · ${g.bullets} SHOTS` : ''} · DPS ${dps}</div></div>`;
    const btn = document.createElement('button');
    if (equipped) { btn.className = 'btn-gray'; btn.textContent = 'EQUIPPED'; btn.disabled = true; }
    else if (owned) { btn.className = 'btn-blue'; btn.textContent = 'EQUIP'; }
    else { btn.className = 'btn-green'; btn.textContent = fmt(g.cost); btn.disabled = save.coins < g.cost; }
    btn.onclick = () => {
      if (!owned) {
        if (save.coins < g.cost) return;
        save.coins -= g.cost;
        save.owned.push(g.id);
      }
      save.gun = g.id;
      persist();
      buildLevel();
      renderGuns();
    };
    row.appendChild(btn);
    list.appendChild(row);
  }
}

$('playBtn').onclick = startRun;
$('gunsBtn').onclick = () => { renderGuns(); show('gunShop'); };
$('gunsClose').onclick = () => { renderMenu(); show('menu'); };
$('pauseBtn').onclick = () => {
  if (!G || !(G.state === 'play' || G.state === 'boss')) return;
  paused = true;
  show('pauseScreen');
};
$('resumeBtn').onclick = () => { paused = false; hideAll(); };
$('restartBtn').onclick = () => { paused = false; persist(); buildLevel(); startRun(); };
$('homeBtn').onclick = () => { persist(); goHome(); };
$('nextBtn').onclick = goHome;
$('retryBtn').onclick = goHome;

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G && (G.state === 'play' || G.state === 'boss') && !paused) $('pauseBtn').onclick();
});

// ---------------------------------------------------------------- input
const keys = { left: false, right: false };
let drag = null;

app.addEventListener('pointerdown', (e) => {
  if (e.target !== canvas && e.target.closest('button, .panel')) return;
  drag = { x: e.clientX, sx: G ? G.sx : 0 };
});
window.addEventListener('pointermove', (e) => {
  if (!drag || !G || paused) return;
  G.sx = drag.sx + (e.clientX - drag.x) / app.clientWidth * 12;
});
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('pointercancel', () => { drag = null; });
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  if ((e.key === ' ' || e.key === 'Enter') && G && G.state === 'menu' && $('menu').classList.contains('show')) startRun();
  if (e.key === 'Escape' || e.key === 'p') {
    if (paused) $('resumeBtn').onclick(); else $('pauseBtn').onclick();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

// ---------------------------------------------------------------- boot
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G) return;
  if (!paused) {
    update(dt);
    updateEffects(dt);
    updateCamera(dt);
  }
  updateHUD(paused ? 0 : dt);
  renderer.render(scene, camera);
}

async function boot() {
  // Wait briefly for the display font so canvas labels use it.
  try {
    await Promise.race([document.fonts.load('64px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))]);
  } catch { /* fallback font */ }
  goHome();
  requestAnimationFrame(frame);
  // debug/testing hook
  window.__game = { get G() { return G; }, save, startRun, buildLevel, addSoldier,
    sim(sec, bot) { for (let t = 0; t < sec; t += 1 / 60) { if (bot) bot(G); update(1 / 60); updateEffects(1 / 60); } } };
}
boot();
