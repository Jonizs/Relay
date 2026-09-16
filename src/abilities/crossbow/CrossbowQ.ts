import Phaser from 'phaser';
import { Ability } from '@/abilities/Ability';
import type { CastContext } from '@/abilities/Ability';
import { CROSSBOW, TEXTURES } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';
import { project } from '@/systems/Geometry';

/**
 * Crossbow Q: shoot the ground at the cursor (clamped to range). Enemies inside
 * the impact area take damage; any hit grants a move-speed buff and shaves time
 * off R's cooldown.
 */
export class CrossbowQ extends Ability {
  override readonly castableWhileBusy = true;

  constructor(player: Player) {
    super('Q', player, CROSSBOW.q.cooldown);
  }

  protected cast(ctx: CastContext): boolean {
    const p = this.player;
    const cfg = CROSSBOW.q;
    const direction = Phaser.Math.Angle.Between(p.x, p.y, ctx.x, ctx.y);
    const dist = Math.min(cfg.range, Phaser.Math.Distance.Between(p.x, p.y, ctx.x, ctx.y));
    const target = project(p.x, p.y, direction, dist);
    const radius = cfg.size / 2;

    p.faceToward(ctx.x);
    p.recoil(direction);

    // Visible shot arcing to the impact point, then the impact lands.
    const shot = p.scene.add.image(p.x, p.y, TEXTURES.bullet).setDisplaySize(22, 22).setDepth(3);
    p.scene.tweens.add({
      targets: shot,
      x: target.x,
      y: target.y,
      duration: cfg.travelMs,
      ease: 'Quad.easeIn',
      onComplete: () => shot.destroy(),
    });
    p.scene.time.delayedCall(cfg.travelMs, () => {
      p.world.fx.impact(target.x, target.y, radius);
      let hit = false;
      for (const enemy of p.world.enemies) {
        if (!enemy.alive) continue;
        if (Phaser.Math.Distance.Between(target.x, target.y, enemy.x, enemy.y) <= radius + enemy.radius) {
          enemy.takeDamage(cfg.damage);
          hit = true;
        }
      }
      if (hit) {
        p.addSpeedMod(cfg.speedBuff, cfg.speedBuffMs);
        p.abilities[3]?.cooldown.reduce(CROSSBOW.r.qHitRefundMs);
      }
    });

    this.cooldown.start(ctx.now);
    return true;
  }
}
