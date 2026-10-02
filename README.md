# Bridge Squad

A web-based 3D squad runner shooter in the style of the mobile "shoot the barrels, pick the gate" ads.
Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/).

## Play locally

```bash
npm install
npm run dev      # open the printed URL (works on phones on the same Wi-Fi too)
npm run build    # static build in dist/ — host it anywhere (GitHub Pages, Netlify, ...)
```

## Controls

- **Drag** left/right (touch or mouse) to steer the squad.
- **A / D** or **← / →** keys also work. **P / Esc** pauses.

## What's in it

- **Squad of soldiers** that runs forward along a suspension bridge and auto-fires.
- **Barrels** with HP numbers: shoot them for coins, or crash into them and lose soldiers.
- **Red crates** (with the gold gun on top) give an in-run boost: fire rate up, damage up, or +3 soldiers.
- **Tire walls** with big HP that guard the gates behind them.
- **Gates**: `+N`, `-N` and `x2`. Shooting a gate raises its number, so a red `-41` can turn into a green `+5`.
- **Coin gates** (`X1.0`): shoot them to raise the coin multiplier for the rest of the level.
- **Enemy hordes**: zombies, goblins and big brutes with health bars.
- **Boss at the end of every level**: Ogre, Yeti, Goblin King and Mutant, plus a MEGA boss every 5th level.
- **Coins and upgrades** (saved in `localStorage`):
  - Permanent upgrades: Damage, Fire Rate, Starting Soldiers and Income.
  - Guns: Pistol → Rifle → SMG → Shotgun (3 shots) → Minigun → Plasma.
- **Endless procedural levels** that get harder as you go (seeded, so each level number always has the same layout).

## Code map

| File | Purpose |
| --- | --- |
| `src/main.js` | Game loop, squad, shooting/collisions, enemies, boss, HUD & menus |
| `src/models.js` | Low-poly characters, barrels, crates, tires, gates and the bridge |
| `src/level.js` | Seeded procedural level generator & difficulty curve |
| `src/save.js` | Save data, guns, upgrade costs, number formatting |
| `src/text.js` | Canvas-texture labels (HP numbers, gate values, coin pop-ups) |
