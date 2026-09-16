import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '@/config/GameConfig';
import { RESERVED_KEYS, SETTINGS_LIMITS, normalizeKey, settings } from '@/systems/Settings';

const PANEL_W = 560;
const PANEL_H = 360;
const ROW_H = 64;

const COLORS = {
  overlay: 0x000000,
  panel: 0x1a1d24,
  panelStroke: 0x3a4050,
  track: 0x3a4050,
  accent: 0xffe066,
  button: '#2b3140',
  buttonHover: '#3a4255',
  text: '#e8e8e8',
  muted: '#9aa0ad',
} as const;

/**
 * Esc overlay. Runs on top of GameScene without pausing it; GameScene ignores
 * gameplay input while this scene is active.
 */
export class SettingsScene extends Phaser.Scene {
  private listeningForKey = false;
  private bindButton!: Phaser.GameObjects.Text;
  /** The Esc that opened us can still be dispatching when create() runs; ignore keys until the next tick. */
  private ready = false;

  constructor() {
    super(SCENES.settings);
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, COLORS.overlay, 0.55);
    this.add.rectangle(cx, cy, PANEL_W, PANEL_H, COLORS.panel).setStrokeStyle(2, COLORS.panelStroke);

    const left = cx - PANEL_W / 2 + 32;
    const right = cx + PANEL_W / 2 - 32;
    const top = cy - PANEL_H / 2 + 24;

    this.add.text(left, top, 'Settings', { fontFamily: 'monospace', fontSize: '28px', color: COLORS.text });
    this.add
      .text(right, top + 6, 'Esc to close', { fontFamily: 'monospace', fontSize: '14px', color: COLORS.muted })
      .setOrigin(1, 0);

    let y = top + 72;

    // --- Camera lock toggle ---
    this.label(left, y, 'Camera');
    const lockBtn = this.button(left + 260, y, this.lockLabel(), () => {
      settings.set('cameraLocked', !settings.get('cameraLocked'));
    });
    y += ROW_H;

    // --- Camera lock key binding ---
    this.label(left, y, 'Lock toggle key');
    this.bindButton = this.button(left + 260, y, this.bindLabel(), () => this.startListening());
    y += ROW_H;

    // --- Camera speed slider ---
    this.label(left, y, 'Unlocked camera speed');
    const speedValue = this.add
      .text(right, y, '', { fontFamily: 'monospace', fontSize: '18px', color: COLORS.muted })
      .setOrigin(1, 0.5);
    y += 34;
    this.slider(
      left,
      y,
      PANEL_W - 64,
      SETTINGS_LIMITS.cameraSpeed.min,
      SETTINGS_LIMITS.cameraSpeed.max,
      settings.get('cameraSpeed'),
      (v) => settings.set('cameraSpeed', Math.round(v)),
    );
    y += ROW_H;

    // --- Reset ---
    this.button(left, y, 'Reset to defaults', () => settings.reset());

    // Keep labels in sync with the store (changes can come from hotkeys too).
    const refresh = () => {
      lockBtn.setText(this.lockLabel());
      if (!this.listeningForKey) this.bindButton.setText(this.bindLabel());
      speedValue.setText(`${settings.get('cameraSpeed')} px/s`);
    };
    refresh();
    settings.on('change', refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => settings.off('change', refresh));

    this.input.keyboard?.on('keydown', this.onKeyDown, this);
  }

  update(): void {
    this.ready = true;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.ready) return;
    const key = normalizeKey(event);

    if (this.listeningForKey) {
      this.listeningForKey = false;
      if (key === 'ESCAPE') {
        this.bindButton.setText(this.bindLabel());
      } else if (RESERVED_KEYS.has(key)) {
        this.bindButton.setText(`${key} is reserved`);
        this.time.delayedCall(900, () => this.bindButton.setText(this.bindLabel()));
      } else {
        settings.set('cameraLockKey', key);
        this.bindButton.setText(this.bindLabel());
      }
      return;
    }

    if (key === 'ESCAPE') this.scene.stop();
  }

  private startListening(): void {
    this.listeningForKey = true;
    this.bindButton.setText('Press a key...');
  }

  private lockLabel(): string {
    return settings.get('cameraLocked') ? 'Locked' : 'Unlocked';
  }

  private bindLabel(): string {
    return `[ ${settings.get('cameraLockKey')} ]`;
  }

  // --- tiny widget helpers -------------------------------------------------

  private label(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '18px', color: COLORS.text })
      .setOrigin(0, 0.5);
  }

  private button(x: number, y: number, text: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, text, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: COLORS.text,
        backgroundColor: COLORS.button,
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    btn.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => btn.setBackgroundColor(COLORS.buttonHover));
    btn.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => btn.setBackgroundColor(COLORS.button));
    btn.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onClick);
    return btn;
  }

  private slider(
    x: number,
    y: number,
    width: number,
    min: number,
    max: number,
    initial: number,
    onChange: (value: number) => void,
  ): void {
    const toT = (v: number) => Phaser.Math.Clamp((v - min) / (max - min), 0, 1);

    const track = this.add.rectangle(x, y, width, 6, COLORS.track).setOrigin(0, 0.5).setInteractive();
    const fill = this.add.rectangle(x, y, width * toT(initial), 6, COLORS.accent).setOrigin(0, 0.5);
    const handle = this.add
      .circle(x + width * toT(initial), y, 12, COLORS.accent)
      .setInteractive({ useHandCursor: true, draggable: true });

    const setFromX = (px: number) => {
      const t = Phaser.Math.Clamp((px - x) / width, 0, 1);
      handle.x = x + t * width;
      fill.width = t * width;
      onChange(min + t * (max - min));
    };

    handle.on(Phaser.Input.Events.GAMEOBJECT_DRAG, (_p: Phaser.Input.Pointer, dragX: number) => setFromX(dragX));
    track.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => setFromX(p.x));

    // External changes (e.g. reset) move the handle.
    const sync = (key: string, value: unknown) => {
      if (key !== 'cameraSpeed') return;
      const t = toT(value as number);
      handle.x = x + t * width;
      fill.width = t * width;
    };
    settings.on('change', sync);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => settings.off('change', sync));
  }
}
