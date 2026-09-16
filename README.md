# Relay

2D top-down action prototype: click-to-move, League-style abilities, swappable
weapons. Built with **Phaser 4 + TypeScript + Vite**, wrapped in **Electron**
for desktop and deployed to **GitHub Pages** for the browser.

## Play online

https://jonizs.github.io/Relay/ — closed beta, a tester password is required
(ask the maintainer). Everyone who opens the link lands in the same lobby:
the first player hosts, later players join automatically (WebRTC via PeerJS,
no server). You see other players move and fight; dummy damage is shared.

## Run

| What | Command |
| --- | --- |
| Browser (dev, HMR) | `npm run dev` → http://localhost:5173 |
| Desktop window (dev, HMR) | `npm run desktop` — or double-click `2DPIT.exe` on the Desktop |
| Desktop window from a production build | `npm run build` then `npm run desktop:prod` |
| Type-check | `npm run typecheck` |
| Deploy | push to `main` → GitHub Actions builds and publishes to Pages |

`2DPIT.exe` on the Desktop is a tiny launcher that starts Electron against this
folder, so it always runs the current source. Rebuild it (e.g. if the project
moves) with:

```
powershell -ExecutionPolicy Bypass -File launcher\build.ps1
```

## Controls

- **WEAPONS** button (top) – switch weapon. Blade (Assassin) or Dual Crossbows (Marksman); persists.
- **Click (any button)** – move; click a dummy to auto-attack it (walks into range, can't miss)
- **A** – attack-move to the cursor (no click needed): walks there, fighting anything acquired on the way
- **S** – stop
- **Q** – 120° sword sweep toward the cursor, 3 s. Castable during other animations.
- **W** – dash toward the cursor, up to 300 px, 6 s
- **E** – quick-cast on the enemy under the cursor within 300 px: dash through it and pierce, 12 s.
  Out of range → walks in, then casts.
- **R** – dash to the cursor (max 350 px) damaging everything on the path; 3 activations, each within 10 s of
  the last. 45 s cooldown counted from the first activation.
- **Dual Crossbows**: ranged AA (bolts). **Q** ground shot at the cursor (450 px, 0.85-tile area; hit = +15% speed 1 s, −2.5 s on R).
  **W** shoot forward, recoil 300 px back. **E** brace: 90% damage reduction + 75% slow for 2 s, then +100% speed 3 s, +50% 2 s.
  **R** spinning slow dash, 300 px AoE, 3 activations / 10 s windows / 45 s.
- **Y** (rebindable) – toggle camera lock. Unlocked: move the cursor to a screen edge to pan;
  the camera can go at most two half-screens from the player. **Space** (hold) snaps back.
- **Esc** – settings (camera lock, lock key binding, unlocked camera speed). Persist in localStorage.
- **DEV MODE** button (left edge) – cooldowns reset 1 s after use.

Damage areas flash red; cooldowns are the circles at the bottom (R shows charges + re-cast window).
Numbers live in `COMBAT` in `src/config/GameConfig.ts`.

## Layout

```
src/
  main.ts              Phaser game config + boot
  config/GameConfig.ts Tunables (sizes, speeds, texture/scene keys)
  scenes/BootScene.ts  Generates placeholder textures; replace with real asset loading
  scenes/GameScene.ts  World, camera, input → player commands
  scenes/UIScene.ts    HUD overlay (runs in parallel with GameScene)
  scenes/SettingsScene.ts  Esc overlay: toggles, key rebinding, sliders
  entities/Player.ts   Container (body + sword), movement, auto-attack, dashes, queued casts
  entities/Enemy.ts    Practice dummy: HP bar, damage, respawn, clickable
  abilities/           Ability base, MultiCastAbility (charges + recast windows), blade Q/W/E/R, crossbow/*
  weapons/             Weapon definitions (AA config, sprite, ability factory)
  scenes/WeaponsScene.ts   Weapon picker overlay
  gate.ts              Beta password gate (loads main.ts after unlock)
  net/Net.ts           PeerJS lobby: host/relay, auto-join, reconnect
  entities/RemotePlayer.ts Other players, smoothed from broadcast state
  systems/Projectiles.ts   Straight-line projectiles with enemy hit tests
  systems/Fx.ts        Red damage-area outlines and floating damage numbers
  systems/Geometry.ts  Cone / segment hit tests
  systems/Settings.ts  Persisted settings store (emits 'change')
  systems/CameraController.ts  Lock/unlock, edge-pan, leash
electron/main.mjs      Desktop shell (starts Vite in-process in dev, loads dist/ with --prod)
launcher/              Source + build script for the Desktop 2DPIT.exe
```

## Next steps

- Replace `BootScene` placeholders with spritesheets/tilemaps in `preload()`.
- Give enemies AI / attacks; add more abilities in `src/abilities/`.
- Package a distributable installer with `electron-builder` (`npm run build` first).
