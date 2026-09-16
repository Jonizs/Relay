/** Central place for tunable constants so gameplay values aren't scattered across scenes. */
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/** Main camera zoom; 1 = native, <1 zooms out. */
export const CAMERA_ZOOM = 1.35;

export const CAMERA = {
  /** 1 = hard lock (no lag). Lower values make the camera trail the player. */
  followLerp: 1,
  /** Cursor distance from a screen edge (game px) that triggers panning when unlocked. */
  edgeMargin: 24,
  /** Max distance of the camera centre from the player, in half-viewports (1 = player at screen edge). */
  leash: 2,
} as const;

export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1800;

export const TILE_SIZE = 64;

export const PLAYER = {
  speed: 260,          // px/s
  arriveRadius: 6,     // stop moving when this close to the target
  attackDuration: 220, // ms for a full sword swing
  dashSpeed: 2200,     // px/s during dashes
} as const;

/** Damage, ranges and cooldowns. Cooldowns/timers are in ms, distances in px. */
export const COMBAT = {
  /** Basic attack: click an enemy, walk into range, swing. Can't miss. */
  aa: { range: 109, damage: 20, cooldown: 400, acquireRange: 280 },
  /** 120 degree cone swing toward the cursor. */
  q: { damage: 80, range: 187, halfAngleDeg: 60, cooldown: 2000 },
  /** Dash toward the cursor, up to `distance`. */
  w: { distance: 300, minDistance: TILE_SIZE * 2, cooldown: 4000 },
  /** Quick-cast on the enemy under the cursor: dash to it and pierce it. */
  e: { damage: 150, range: 300, passDistance: 70, cooldown: 12000, cursorLeniency: 90 },
  /** Up to `activations` dashes, each hitting enemies along the path. */
  r: { damage: 100, distance: 350, minDistance: TILE_SIZE * 2, width: 90, activations: 3, windowMs: 10000, cooldown: 40000 },
  dummy: { hp: 1000, respawnMs: 2000 },
  /** Q hits build stacks; at `max`, E refunds its cooldown. E also grants brief invulnerability. */
  stacks: { max: 3, eInvulnMs: 500, invulnAlpha: 0.2 },
  /** Killing an enemy takes this much off every ability cooldown. */
  killCooldownRefundMs: 15000,
  player: { hp: 1000, respawnMs: 3000 },
} as const;

/** Dual Crossbows weapon. */
export const CROSSBOW = {
  aa: { range: 380, damage: 20, cooldown: 400, acquireRange: 420, boltSpeed: 1100 },
  /** Ground shot at the cursor (clamped to `range`). Hit grants a move-speed buff. */
  q: { damage: 60, cooldown: 1500, size: TILE_SIZE * 1.3, range: 450, travelMs: 280, speedBuff: 1.15, speedBuffMs: 1000 },
  /** Shoot forward, get pushed back. */
  w: { damage: 90, cooldown: 6000, spawnAhead: 15, size: TILE_SIZE * 0.5, speed: 1100, range: 700, pushback: 300, windupMs: 250 },
  /** Block then sprint. */
  e: { cooldown: 12000, blockMs: 2000, blockReduction: 0.9, blockSlow: 0.25, boostMs: 3000, boost: 2.0, tailMs: 2000, tail: 1.5, castShortenMs: 1000 },
  /** Spinning slow dash, AoE around the player. */
  r: { damage: 120, radius: 200, distance: 350, minDistance: TILE_SIZE * 2, speed: 520, activations: 2, windowMs: 10000, cooldown: 45000, qHitRefundMs: 2500 },
} as const;

/** Keyboard keys bound to ability slots 0..3, in order. */
export const ABILITY_KEYS = ['Q', 'W', 'E', 'R'] as const;
export type AbilitySlot = 0 | 1 | 2 | 3;

export const TEXTURES = {
  player: 'player',
  sword: 'sword',
  dummy: 'dummy',
  crossbow: 'crossbow',
  bolt: 'bolt',
  bullet: 'bullet',
  tile: 'tile',
  marker: 'marker',
} as const;

export const SCENES = {
  boot: 'BootScene',
  game: 'GameScene',
  ui: 'UIScene',
  settings: 'SettingsScene',
  weapons: 'WeaponsScene',
} as const;
