// Procedural, seeded level layout. Same level number => same level.

export const BOSS_ORDER = ['ogre', 'yeti', 'goblinKing', 'mutant'];
export const LANES = [-3.3, 0, 3.3];

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function difficulty(level) {
  return Math.pow(1.25, level - 1);
}

export function generateLevel(level) {
  const r = mulberry32(level * 7919 + 13);
  const rint = (a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
  const D = difficulty(level);
  const length = Math.round(230 + Math.min(level, 25) * 14);
  const events = [];

  const barrels = (z, opening = false) => {
    const rows = level > 2 && r() < 0.5 ? 2 : 1;
    for (let row = 0; row < rows; row++) {
      const lanes = [...LANES].sort(() => r() - 0.5).slice(0, opening ? rint(1, 2) : rint(1, 3));
      let crateUsed = false;
      for (const x of lanes) {
        const crate = !crateUsed && r() < 0.28;
        crateUsed ||= crate;
        events.push({
          type: 'obstacle', kind: crate ? 'crate' : 'barrel',
          x: x + (r() - 0.5) * 0.6, z: z - row * 6,
          hp: r5((crate ? rint(25, 50) : opening ? rint(10, 25) : rint(10, 40) + row * 25) * D),
        });
      }
    }
  };

  const gates = (z) => {
    const good = r() < 0.25 && level > 1
      ? { op: 'mul', val: 2 }
      : { op: 'add', val: rint(2, 4 + Math.min(level, 8)) };
    const bad = r() < 0.2
      ? { op: 'add', val: rint(1, 3) }
      : { op: 'add', val: -rint(5, 15 + level * 4) };
    const flip = r() < 0.5;
    events.push({ type: 'gates', z, left: flip ? good : bad, right: flip ? bad : good });
  };

  const enemies = (z) => {
    const count = Math.min(8 + level * 3 + rint(0, 6), 45);
    const list = [];
    for (let i = 0; i < count; i++) {
      const goblin = level > 1 && r() < 0.45;
      list.push({
        kind: goblin ? 'goblin' : 'zombie',
        x: (r() - 0.5) * 8.6, z: z - r() * 10,
        hp: Math.ceil((goblin ? 6 : 4) * D),
      });
    }
    if (level > 1 && r() < 0.55) {
      list.push({ kind: 'brute', x: (r() - 0.5) * 5, z: z - 11, hp: Math.ceil(70 * D) });
    }
    events.push({ type: 'enemies', z, list });
  };

  const tires = (z) => {
    const base = rint(40, 90) * D;
    LANES.forEach((x, i) => events.push({ type: 'obstacle', kind: 'tires', x, z, hp: r5(base * (1 + i * 0.07)) }));
    gates(z - 4.5);
  };

  const coinGate = (z) => events.push({ type: 'coingate', z });

  // Opening is always the same shape so the player learns the loop fast.
  const plan = [barrels, gates, enemies];
  const pool = level > 1 ? [barrels, barrels, gates, gates, enemies, enemies, tires] : [barrels, gates, gates, enemies, enemies];
  let coinGates = 0;
  let z = -26;
  let i = 0;
  while (z > -length + 18) {
    let fn = i < plan.length ? plan[i] : pick(pool);
    if (i >= plan.length && coinGates < 2 && r() < 0.14) { fn = coinGate; coinGates++; }
    if (fn === barrels) barrels(z, i === 0); else fn(z);
    z -= fn === coinGate ? 14 : rint(30, 40);
    i++;
  }

  const bossType = BOSS_ORDER[(level - 1) % BOSS_ORDER.length];
  const mega = level % 5 === 0;
  return {
    level,
    length,
    events,
    boss: { type: bossType, mega, hp: Math.round(900 * D * (mega ? 1.7 : 1) * (level === 1 ? 0.6 : 1)) },
  };
}
