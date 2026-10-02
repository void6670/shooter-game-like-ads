// Persistent progress: coins, level, guns and permanent upgrades.

const KEY = 'bridgeSquad.save.v1';

export const GUNS = [
  { id: 'pistol',  name: 'Pistol',  cost: 0,       dmg: 1.0, rate: 3.2, bullets: 1, spread: 0.02, color: 0x9aa0a6, len: 0.45, bullet: 0xaef0ff },
  { id: 'rifle',   name: 'Rifle',   cost: 400,     dmg: 1.5, rate: 4.0, bullets: 1, spread: 0.02, color: 0x5b6470, len: 0.8,  bullet: 0xaef0ff },
  { id: 'smg',     name: 'SMG',     cost: 3500,    dmg: 1.2, rate: 7.5, bullets: 1, spread: 0.05, color: 0x2f3742, len: 0.55, bullet: 0xffe08a },
  { id: 'shotgun', name: 'Shotgun', cost: 25000,   dmg: 1.7, rate: 3.4, bullets: 3, spread: 0.09, color: 0x7c4a2d, len: 0.9,  bullet: 0xffb35c },
  { id: 'minigun', name: 'Minigun', cost: 180000,  dmg: 1.7, rate: 11,  bullets: 1, spread: 0.06, color: 0x1f2937, len: 0.95, bullet: 0xff8a8a },
  { id: 'plasma',  name: 'Plasma',  cost: 1.5e6,   dmg: 4.5, rate: 8,   bullets: 1, spread: 0.03, color: 0x7c3aed, len: 0.85, bullet: 0xf0a0ff },
];

export const UPGRADES = {
  damage:   { name: 'Damage',    icon: '💥', base: 40,  growth: 1.42 },
  rate:     { name: 'Fire Rate', icon: '⚡', base: 60,  growth: 1.5, max: 25 },
  soldiers: { name: 'Soldiers',  icon: '🪖', base: 120, growth: 2.1, max: 9 },
  income:   { name: 'Income',    icon: '💰', base: 80,  growth: 1.55 },
};

const defaults = () => ({
  coins: 0,
  level: 1,
  best: 0,
  gun: 'pistol',
  owned: ['pistol'],
  up: { damage: 0, rate: 0, soldiers: 0, income: 0 },
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return { ...defaults(), ...s, up: { ...defaults().up, ...s.up } };
  } catch { /* fresh save */ }
  return defaults();
}

export const save = load();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage blocked */ }
}

export function resetSave() {
  Object.assign(save, defaults());
  persist();
}

export function upgradeCost(key) {
  const u = UPGRADES[key];
  return Math.round(u.base * Math.pow(u.growth, save.up[key]));
}

export function isMaxed(key) {
  const u = UPGRADES[key];
  return u.max != null && save.up[key] >= u.max;
}

export function getGun() {
  return GUNS.find((g) => g.id === save.gun) || GUNS[0];
}

export function stats() {
  const gun = getGun();
  return {
    gun,
    damage: 2 * gun.dmg * Math.pow(1.12, save.up.damage),
    rate: gun.rate * (1 + 0.06 * save.up.rate),
    bullets: gun.bullets,
    spread: gun.spread,
    startSoldiers: 1 + save.up.soldiers,
    income: Math.pow(1.2, save.up.income),
  };
}

export function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  const units = ['K', 'M', 'B', 'T', 'Q'];
  let i = -1;
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; }
  return (n >= 100 ? Math.floor(n) : Math.floor(n * 10) / 10) + units[i];
}
