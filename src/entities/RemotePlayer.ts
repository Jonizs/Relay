import Phaser from 'phaser';
import { COMBAT, TEXTURES } from '@/config/GameConfig';
import { TARGET_DATA_KEY } from '@/entities/Target';
import type { Target } from '@/entities/Target';
import type { PlayerState } from '@/net/Net';
import type { Fx } from '@/systems/Fx';
import { weaponById } from '@/weapons';

/** Scene event (RemotePlayer, amount): the LOCAL player damaged another player. */
export const PLAYER_DAMAGED_LOCAL = 'player-damaged-local';

/**
 * Another player in the lobby, driven by their broadcast state and smoothed
 * locally. Attackable: damage we deal is shown optimistically and sent to them;
 * their real HP comes back in their state.
 */
export class RemotePlayer extends Phaser.GameObjects.Container implements Target {
  readonly radius = 26;
  alive = true;
  hp: number = COMBAT.player.hp;
  lastSeen = 0;

  private readonly bodySprite: Phaser.GameObjects.Image;
  private readonly weaponSprite: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private target: PlayerState | null = null;

  constructor(
    scene: Phaser.Scene,
    readonly peerId: string,
    x: number,
    y: number,
    private readonly fx: Fx,
  ) {
    super(scene, x, y);

    this.bodySprite = scene.add.image(0, 0, TEXTURES.player).setTint(0xb8f0c2).setInteractive({ useHandCursor: true });
    this.bodySprite.setData(TARGET_DATA_KEY, this);
    this.weaponSprite = scene.add.image(20, 6, TEXTURES.sword).setOrigin(0.5, 0.85).setAngle(25);
    this.label = scene.add
      .text(0, -52, peerId, { fontFamily: 'monospace', fontSize: '12px', color: '#b8f0c2', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5);
    this.hpBar = scene.add.graphics();

    this.add([this.bodySprite, this.weaponSprite, this.label, this.hpBar]);
    this.setDepth(2);
    this.drawHpBar();
    scene.add.existing(this);
  }

  /** Optimistic local hit: number + flash, and tell the scene so it gets sent to the victim. */
  takeDamage(amount: number, remote = false): void {
    if (!this.alive) return;
    if (remote) return; // other people's hits on this player show up via their HP state
    this.fx.damageNumber(this.x, this.y, amount);
    this.bodySprite.setTint(0xffffff);
    this.scene.time.delayedCall(60, () => this.bodySprite.setTint(this.alive ? 0xb8f0c2 : 0x8a8f99));
    this.scene.events.emit(PLAYER_DAMAGED_LOCAL, this, amount);
  }

  applyState(s: PlayerState, now: number): void {
    this.target = s;
    this.lastSeen = now;

    const weapon = weaponById(s.w);
    if (this.weaponSprite.texture.key !== weapon.texture) {
      this.weaponSprite.setTexture(weapon.texture);
      this.weaponSprite.setOrigin(0.5, weapon.texture === TEXTURES.sword ? 0.85 : 0.5);
    }
    if (s.hp !== this.hp) {
      this.hp = s.hp;
      this.drawHpBar();
    }
    if (s.al !== this.alive) {
      this.alive = s.al;
      this.bodySprite.setTint(this.alive ? 0xb8f0c2 : 0x8a8f99);
      if (this.alive) this.bodySprite.setInteractive({ useHandCursor: true });
      else this.bodySprite.disableInteractive();
    }
    // Label / bar must not flip with the body.
    this.label.setScale(s.f, 1);
  }

  update(): void {
    const t = this.target;
    if (!t) return;
    // Smooth toward the last known position; snap if far (teleport / dash / respawn).
    const d = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
    const k = d > 400 ? 1 : 0.35;
    this.x += (t.x - this.x) * k;
    this.y += (t.y - this.y) * k;
    this.setScale(t.f, 1);
    this.setAlpha(t.al ? t.a : 0.3);
    this.setAngle(t.r);
    this.weaponSprite.setPosition(t.s.x, t.s.y).setAngle(t.s.ang);
  }

  private drawHpBar(): void {
    const w = 52;
    const h = 6;
    const x = -w / 2;
    const y = -this.bodySprite.height / 2 - 12;
    const t = Phaser.Math.Clamp(this.hp / COMBAT.player.hp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.hpBar.fillStyle(0x6fd38a, 1);
    this.hpBar.fillRect(x, y, w * t, h);
  }
}
