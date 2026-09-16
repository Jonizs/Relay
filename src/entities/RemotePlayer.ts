import Phaser from 'phaser';
import { TEXTURES } from '@/config/GameConfig';
import type { PlayerState } from '@/net/Net';
import { weaponById } from '@/weapons';

/** Another player in the lobby, driven by their broadcast state and smoothed locally. */
export class RemotePlayer extends Phaser.GameObjects.Container {
  private readonly bodySprite: Phaser.GameObjects.Image;
  private readonly weaponSprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private target: PlayerState | null = null;
  lastSeen = 0;

  constructor(scene: Phaser.Scene, readonly peerId: string, x: number, y: number) {
    super(scene, x, y);

    this.bodySprite = scene.add.image(0, 0, TEXTURES.player).setTint(0xb8f0c2);
    this.weaponSprite = scene.add.image(20, 6, TEXTURES.sword).setOrigin(0.5, 0.85).setAngle(25);
    this.label = scene.add
      .text(0, -44, peerId, { fontFamily: 'monospace', fontSize: '12px', color: '#b8f0c2', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5);

    this.add([this.bodySprite, this.weaponSprite, this.label]);
    this.setDepth(2);
    scene.add.existing(this);
  }

  applyState(s: PlayerState, now: number): void {
    this.target = s;
    this.lastSeen = now;

    const weapon = weaponById(s.w);
    if (this.weaponSprite.texture.key !== weapon.texture) {
      this.weaponSprite.setTexture(weapon.texture);
      this.weaponSprite.setOrigin(0.5, weapon.texture === TEXTURES.sword ? 0.85 : 0.5);
    }
    // Label must not flip with the body.
    this.label.setScale(s.f, 1);
  }

  update(): void {
    const t = this.target;
    if (!t) return;
    // Smooth toward the last known position; snap if far (teleport / dash).
    const d = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
    const k = d > 400 ? 1 : 0.35;
    this.x += (t.x - this.x) * k;
    this.y += (t.y - this.y) * k;
    this.setScale(t.f, 1);
    this.setAlpha(t.a);
    this.setAngle(t.r);
    this.weaponSprite.setPosition(t.s.x, t.s.y).setAngle(t.s.ang);
  }
}
