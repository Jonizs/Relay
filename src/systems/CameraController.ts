import Phaser from 'phaser';
import { CAMERA, CAMERA_ZOOM } from '@/config/GameConfig';
import { settings } from '@/systems/Settings';

type Target = { x: number; y: number };

/**
 * League-style camera:
 *  - Locked: follows the target.
 *  - Unlocked: pans when the cursor touches a screen edge, at the configured speed.
 *  - Holding the snap key re-centres on the target while held.
 *  - The camera centre is leashed to within CAMERA.leash half-viewports of the target.
 */
export class CameraController {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private readonly snapKey?: Phaser.Input.Keyboard.Key;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly target: Target,
  ) {
    this.cam = scene.cameras.main;
    this.cam.setZoom(CAMERA_ZOOM);

    this.snapKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.cam.centerOn(target.x, target.y);
    this.applyLock(settings.get('cameraLocked'));
    settings.on('change', this.onSettingChange, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      settings.off('change', this.onSettingChange, this);
    });
  }

  get locked(): boolean {
    return settings.get('cameraLocked');
  }

  toggleLock(): void {
    settings.set('cameraLocked', !this.locked);
  }

  update(deltaMs: number): void {
    if (this.locked) return;

    if (this.snapKey?.isDown) {
      this.cam.centerOn(this.target.x, this.target.y);
      return;
    }

    this.edgePan(deltaMs);
    this.applyLeash();
  }

  private onSettingChange(key: string, value: unknown): void {
    if (key === 'cameraLocked') this.applyLock(value as boolean);
  }

  private applyLock(locked: boolean): void {
    if (locked) {
      this.cam.startFollow(this.target, true, CAMERA.followLerp, CAMERA.followLerp);
    } else {
      this.cam.stopFollow();
    }
  }

  private edgePan(deltaMs: number): void {
    const p = this.scene.input.activePointer;
    const m = CAMERA.edgeMargin;
    let dx = 0;
    let dy = 0;

    if (p.x <= m) dx = -1;
    else if (p.x >= this.cam.width - m) dx = 1;
    if (p.y <= m) dy = -1;
    else if (p.y >= this.cam.height - m) dy = 1;

    if (dx === 0 && dy === 0) return;

    // Speed is in screen px/s; convert to world units by dividing by zoom.
    const step = (settings.get('cameraSpeed') * deltaMs) / 1000 / this.cam.zoom;
    this.cam.scrollX += dx * step;
    this.cam.scrollY += dy * step;
  }

  /** Keep the camera centre within `leash` half-viewports of the target. */
  private applyLeash(): void {
    const halfW = this.cam.width / this.cam.zoom / 2;
    const halfH = this.cam.height / this.cam.zoom / 2;
    const maxDx = halfW * CAMERA.leash;
    const maxDy = halfH * CAMERA.leash;

    // midPoint is only refreshed at render time, so derive the centre from scroll
    // (Phaser zooms about the centre, so centre = scroll + half the unzoomed size).
    const cx = this.cam.scrollX + this.cam.width / 2;
    const cy = this.cam.scrollY + this.cam.height / 2;
    this.cam.centerOn(
      Phaser.Math.Clamp(cx, this.target.x - maxDx, this.target.x + maxDx),
      Phaser.Math.Clamp(cy, this.target.y - maxDy, this.target.y + maxDy),
    );
  }
}
