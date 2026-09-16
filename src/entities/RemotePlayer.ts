import Phaser from 'phaser';
import { COMBAT, TEXTURES } from '@/config/GameConfig';
import { TARGET_DATA_KEY } from '@/entities/Target';
import type { Target } from '@/entities/Target';
import type { PlayerState } from '@/net/Net';
import type { Fx, Trail } from '@/systems/Fx';
import { weaponById } from '@/weapons';

/** Scene event (RemotePlayer, amount): the LOCAL player damaged another player. */
export const PLAYER_DAMAGED_LOCAL = 'player-damaged-local';

/**
 * Another player in the lobby. Position is interpolated between the last two
 * received states (time-based, so it is smooth regardless of frame rate or
 * packet cadence). Ongoing effects (trails, afterimages, rings) are recreated
 * locally from flags in the state; one-shot effects arrive as fx messages.
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

  private latest: PlayerState | null = null;
  // Interpolation: move from `from` to the latest state over the observed packet interval.
  private from = { x: 0, y: 0 };
  private moveStartAt = 0;
  private moveDuration = 66;

  private trail: Trail | null = null;
  private trailColor = 0;
  private lastGhostAt = 0;
  private shield: { end: () => void } | null = null;
  private spin: { end: () => void } | null = null;

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
    this.from = { x, y };
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
    // Start a new interpolation leg from where we currently are.
    if (this.latest) {
      this.moveDuration = Phaser.Math.Clamp(now - this.lastSeen, 30, 250);
    }
    this.from = { x: this.x, y: this.y };
    this.moveStartAt = now;
    this.latest = s;
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
    // Facing-independent: name label must not mirror.
    this.label.setScale(s.f, 1);

    // Ongoing effects driven by flags.
    if (s.tr !== this.trailColor) {
      this.trail?.end();
      this.trail = s.tr ? this.fx.trail(s.tr, 16, 260) : null;
      this.trailColor = s.tr;
    }
    if (s.sh && !this.shield) this.shield = this.fx.shield(() => ({ x: this.x, y: this.y }), s.sh, 60000);
    if (!s.sh && this.shield) {
      this.shield.end();
      this.shield = null;
    }
    if (s.sp && !this.spin) this.spin = this.fx.spinRing(() => ({ x: this.x, y: this.y }), s.sp);
    if (!s.sp && this.spin) {
      this.spin.end();
      this.spin = null;
    }
  }

  update(now: number): void {
    const s = this.latest;
    if (!s) return;

    // Time-based interpolation toward the latest state; snap on big jumps (dash/respawn).
    const far = Phaser.Math.Distance.Between(this.from.x, this.from.y, s.x, s.y) > 500;
    const t = far ? 1 : Phaser.Math.Clamp((now - this.moveStartAt) / this.moveDuration, 0, 1);
    this.x = this.from.x + (s.x - this.from.x) * t;
    this.y = this.from.y + (s.y - this.from.y) * t;

    this.setScale(s.f, 1);
    this.setAlpha(s.al ? s.a : 0.3);
    this.setAngle(s.r);
    this.weaponSprite.setPosition(s.s.x, s.s.y).setAngle(s.s.ang);

    if (this.trail) {
      const tip = this.weaponTip();
      this.trail.add(tip.x, tip.y);
    }
    if (s.gh && now - this.lastGhostAt >= 28) {
      this.lastGhostAt = now;
      this.fx.ghost(this.x, this.y, TEXTURES.player, s.f);
    }
  }

  override destroy(fromScene?: boolean): void {
    this.trail?.end();
    this.shield?.end();
    this.spin?.end();
    super.destroy(fromScene);
  }

  private weaponTip(): { x: number; y: number } {
    const m = this.weaponSprite.getWorldTransformMatrix();
    return m.transformPoint(0, -this.weaponSprite.height * 0.85);
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
