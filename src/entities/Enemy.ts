import Phaser from 'phaser';
import { COMBAT, TEXTURES } from '@/config/GameConfig';
import type { Fx } from '@/systems/Fx';
import { TARGET_DATA_KEY } from '@/entities/Target';
import type { Target } from '@/entities/Target';

/** Scene event emitted (with the Enemy) when one dies. */
export const ENEMY_KILLED = 'enemy-killed';
/** Scene event (enemy, amount) for damage dealt by the LOCAL player - used to sync online. */
export const ENEMY_DAMAGED_LOCAL = 'enemy-damaged-local';

/**
 * Practice dummy: has HP, shows a health bar, takes damage, and respawns after dying.
 * The body image is the interactive hit area; clicking it is how AA/E pick a target.
 */
export class Enemy extends Phaser.GameObjects.Container implements Target {
  readonly maxHp: number = COMBAT.dummy.hp;
  hp: number = COMBAT.dummy.hp;
  alive = true;

  /** Rough collision radius used by cone/segment damage tests. */
  readonly radius = 28;
  /** Whether the most recent hit came from another player (kill credit / refunds are local-only). */
  private lastHitRemote = false;

  private readonly bodySprite: Phaser.GameObjects.Image;
  private readonly hpBar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly fx: Fx) {
    super(scene, x, y);

    this.bodySprite = scene.add.image(0, 0, TEXTURES.dummy).setInteractive({ useHandCursor: true });
    this.bodySprite.setData(TARGET_DATA_KEY, this);

    this.hpBar = scene.add.graphics();
    this.add([this.bodySprite, this.hpBar]);
    this.setDepth(1);
    this.drawHpBar();

    scene.add.existing(this);
  }

  takeDamage(amount: number, remote = false): void {
    if (!this.alive) return;

    this.hp = Math.max(0, this.hp - amount);
    this.lastHitRemote = remote;
    if (!remote) this.scene.events.emit(ENEMY_DAMAGED_LOCAL, this, amount);
    this.fx.damageNumber(this.x, this.y, amount);
    this.drawHpBar();

    // Hit flash
    this.bodySprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(60, () => {
      this.bodySprite.clearTint();
    });

    if (this.hp === 0) this.die();
  }

  private die(): void {
    this.alive = false;
    if (!this.lastHitRemote) this.scene.events.emit(ENEMY_KILLED, this);
    this.bodySprite.disableInteractive();
    this.scene.tweens.add({ targets: this, alpha: 0.25, angle: 80, duration: 250, ease: 'Quad.easeIn' });
    this.scene.time.delayedCall(COMBAT.dummy.respawnMs, () => this.respawn());
  }

  private respawn(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.setAngle(0);
    this.bodySprite.setInteractive({ useHandCursor: true });
    this.drawHpBar();
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 200 });
  }

  private drawHpBar(): void {
    const w = 56;
    const h = 7;
    const x = -w / 2;
    const y = -this.bodySprite.height / 2 - 14;
    const t = this.hp / this.maxHp;

    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.hpBar.fillStyle(t > 0.5 ? 0x4caf50 : t > 0.25 ? 0xffc107 : 0xf44336, 1);
    this.hpBar.fillRect(x, y, w * t, h);
  }
}
