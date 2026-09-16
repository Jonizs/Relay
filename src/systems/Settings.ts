import Phaser from 'phaser';

export interface GameSettings {
  /** Whether the camera follows the player (true) or is free-panned (false). */
  cameraLocked: boolean;
  /** Edge-pan speed of the unlocked camera, in screen px/s. */
  cameraSpeed: number;
  /** Key that toggles the camera lock (normalised via normalizeKey). */
  cameraLockKey: string;
  /** Dev mode: ability cooldowns reset shortly after use. */
  devMode: boolean;
  /** Equipped weapon id. */
  weapon: string;
}

export const SETTINGS_DEFAULTS: Readonly<GameSettings> = {
  cameraLocked: true,
  cameraSpeed: 1400,
  cameraLockKey: 'Y',
  devMode: false,
  weapon: 'blade',
};

/** In dev mode, a cooldown is cleared this long after it started. */
export const DEV_COOLDOWN_RESET_MS = 1000;

/** Keys that can't be rebound because gameplay/UI already owns them. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['ESCAPE', 'Q', 'W', 'E', 'R', 'A', 'S', 'SPACE']);

/** Turns a KeyboardEvent into the display/compare form used for bindings ("Y", "SPACE", "F1"). */
export function normalizeKey(event: KeyboardEvent): string {
  if (event.key === ' ') return 'SPACE';
  return event.key.toUpperCase();
}

export const SETTINGS_LIMITS = {
  cameraSpeed: { min: 300, max: 4000 },
} as const;

const STORAGE_KEY = '2dpit.settings';

/**
 * Global settings store. Persists to localStorage and emits 'change' with
 * (key, value) whenever a field changes so live systems can react.
 */
class SettingsStore extends Phaser.Events.EventEmitter {
  private data: GameSettings;

  constructor() {
    super();
    this.data = { ...SETTINGS_DEFAULTS, ...load() };
  }

  get<K extends keyof GameSettings>(key: K): GameSettings[K] {
    return this.data[key];
  }

  set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    save(this.data);
    this.emit('change', key, value);
  }

  reset(): void {
    (Object.keys(SETTINGS_DEFAULTS) as (keyof GameSettings)[]).forEach((k) => {
      this.set(k, SETTINGS_DEFAULTS[k]);
    });
  }
}

function load(): Partial<GameSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<GameSettings>) : {};
  } catch {
    return {};
  }
}

function save(data: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode etc.) – settings just won't persist.
  }
}

export const settings = new SettingsStore();
