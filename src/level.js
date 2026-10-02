// Procedural, seeded level layout. Same level number => same level.
// The same generator also streams an endless run, one event at a time.

export const BOSS_ORDER = ['ogre', 'yeti', 'goblinKing', 'mutant'];
export const LANES = [-3.3, 0, 3.3];
export const LEVELS_PER_WORLD = 10;

// Each world re-skins the bridge: sky, sea, fog, light and deck tint.
export const WORLDS = [
  { name: 'BAY BRIDGE',        sky: 0x56aee8, fog: 0x8fcbf0, sea: 0x2b8ad8, deck: 0xffffff, hemi: 1.7, sun: 0xffffff, sunI: 1.9 },
  { name: 'SUNSET STRAIT',     sky: 0xf39a5b, fog: 0xf6b98a, sea: 0x5a5ea8, deck: 0xffe6d2, hemi: 1.5, sun: 0xffc48a, sunI: 2.0 },
  { name: 'MIDNIGHT CROSSING', sky: 0x101a3a, fog: 0x1d2a55, sea: 0x0d1838, deck: 0xa9b4d8, hemi: 1.15, sun: 0xaabfff, sunI: 1.5 },
  { name: 'FROZEN PASS',       sky: 0xbfd9ec, fog: 0xe3eef6, sea: 0x7fb1cf, deck: 0xf2f8ff, hemi: 1.8, sun: 0xffffff, sunI: 1.6 },
  { name: 'TOXIC CANAL',       sky: 0x7aa36a, fog: 0xa6c48c, sea: 0x4e8a2d, deck: 0xe6f2d8, hemi: 1.5, sun: 0xf4ffd0, sunI: 1.7 },
];

export function worldOf(level) {
  const i = Math.floor((level - 1) / LEVELS_PER_WORLD);
  return { index: i, ...WORLDS[i % WORLDS.length], stage: ((level - 1) % LEVELS_PER_WORLD) + 1 };
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function difficulty(level) {
  return Math.pow(1.28, level - 1);
}

export function bossFor(level) {
  const D = difficulty(level);
  const mega = Math.round(level) % 5 === 0;
  return {
    type: BOSS_ORDER[(Math.round(level) - 1) % BOSS_ORDER.length],
    mega,
    hp: Math.round(1100 * D * (mega ? 1.7 : 1) * (level <= 1 ? 0.5 : 1)),
  };
}

/**
 * Event generator. `gen.level` may be fractional and may change between calls
 * (endless mode raises it with distance). Each call pushes into `gen.events`.
 */
export function createGenerator(seed) {
  const r = mulberry32(seed);
  const rint = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
  const gen = { level: 1, events: [], coinGates: 0, last: null, sinceGate: 0 };
  const L = () => Math.floor(gen.level);
  const D = () => difficulty(gen.level);

  const barrels = (z, opening = false) => {
    const level = L();
    const rows = level > 2 && r() < 0.5 ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      const lanes = [...LANES].sort(() => r() - 0.5).slice(0, opening ? rint(1, 2) : rint(1, 3));
      let crateUsed = false;
      for (const x of lanes) {
        const crate = !crateUsed && r() < 0.28;
        crateUsed ||= crate;
        // from level 6 some barrels slide side to side
        const move = !crate && !opening && level >= 6 && r() < 0.35 ? 1.4 + r() * 1.2 : 0;
        gen.events.push({
          type: 'obstacle', kind: crate ? 'crate' : 'barrel',
          x: move ? 0 : x + (r() - 0.5) * 0.6, z: z - row * 6, move, movePhase: r() * 6,
          hp: r5((crate ? rint(25, 50) : opening ? rint(15, 30) : rint(15, 45) + row * 30) * D()),
        });
        if (move) break; // one slider per row keeps a path open
      }
    }
  };

  const gates = (z) => {
    const level = L();
    const good = r() < 0.15 && level > 2
      ? { op: 'mul', val: 2 }
      : { op: 'add', val: level === 1 ? rint(3, 5) : rint(2, 3 + Math.min(level, 6)) };
    const bad = r() < 0.12
      ? { op: 'add', val: rint(1, 2) }
      : { op: 'add', val: -rint(8, 18 + Math.min(level, 20) * 5) };
    const flip = r() < 0.5;
    gen.events.push({ type: 'gates', z, left: flip ? good : bad, right: flip ? bad : good });
  };

  const enemies = (z) => {
    const level = L();
    const count = level === 1 ? 8 + rint(0, 4) : Math.min(10 + level * 3 + rint(0, 8), 50);
    const list = [];
    for (let i = 0; i < count; i++) {
      const roll = r();
      const kind = level >= 4 && roll < 0.18 ? 'runner' : level > 1 && roll < 0.6 ? 'goblin' : 'zombie';
      const hp = { zombie: 5, goblin: 8, runner: 3 }[kind];
      list.push({ kind, x: (r() - 0.5) * 8.6, z: z - r() * 10, hp: Math.ceil(hp * D()) });
    }
    const brutes = level > 1 ? (r() < 0.6 ? 1 : 0) + (level > 5 && r() < 0.5 ? 1 : 0) : 0;
    for (let b = 0; b < brutes; b++) {
      list.push({ kind: 'brute', x: (r() - 0.5) * 6, z: z - 11 - b * 3, hp: Math.ceil(90 * D()) });
    }
    gen.events.push({ type: 'enemies', z, list });
  };

  const tires = (z) => {
    const base = rint(55, 110) * D();
    LANES.forEach((x, i) => gen.events.push({ type: 'obstacle', kind: 'tires', x, z, hp: r5(base * (1 + i * 0.07)) }));
    gates(z - 4.5);
  };

  const coinGate = (z) => gen.events.push({ type: 'coingate', z });

  /** Push one random event at z; returns the z of the next free slot. */
  gen.next = (z, maxCoinGates = 2) => {
    let pool = L() > 1 ? [barrels, barrels, gates, gates, enemies, enemies, tires] : [barrels, gates, gates, enemies, enemies];
    // pacing: never two hordes back to back, and a soldier gate at least every third event
    if (gen.last === enemies) pool = pool.filter((f) => f !== enemies);
    let fn = gen.sinceGate >= 2 ? gates : pick(pool);
    if (fn !== gates && gen.coinGates < maxCoinGates && r() < 0.14) { fn = coinGate; gen.coinGates++; }
    fn(z);
    gen.last = fn;
    gen.sinceGate = fn === gates || fn === tires ? 0 : gen.sinceGate + 1;
    return z - (fn === coinGate ? 14 : rint(30, 40));
  };
  gen.opening = (z) => {
    barrels(z, true); z -= rint(30, 40);
    gates(z); z -= rint(30, 40);
    enemies(z); z -= rint(30, 40);
    gen.last = enemies;
    gen.sinceGate = 1;
    return z;
  };
  return gen;
}

export function generateLevel(level) {
  const gen = createGenerator(level * 7919 + 13);
  gen.level = level;
  const length = Math.round(230 + Math.min(level, 25) * 14);
  // Opening is always the same shape so the player learns the loop fast.
  let z = gen.opening(-26);
  while (z > -length + 18) z = gen.next(z);
  return { level, length, events: gen.events, boss: bossFor(level), world: worldOf(level) };
}
