import Phaser from 'phaser';
import { Ability } from '@/abilities/Ability';
import type { CastContext } from '@/abilities/Ability';
import { CROSSBOW, TEXTURES } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';
import { project } from '@/systems/Geometry';

/**
 * Crossbow W: short wind-up (no other casts allowed), then fire a heavy bolt
 * toward the cursor and get kicked back the opposite way.
 */
export class CrossbowW extends Ability {
  constructor(player: Player) {
    super('W', player, CROSSBOW.w.cooldown);
  }

  protected cast(ctx: CastContext): boolean {
    const p = this.player;
    const cfg = CROSSBOW.w;
    const direction = Phaser.Math.Angle.Between(p.x, p.y, ctx.x, ctx.y);

    p.faceToward(ctx.x);
    p.lockCasts(cfg.windupMs);
    p.brace(cfg.windupMs);

    p.scene.time.delayedCall(cfg.windupMs, () => {
      const muzzle = project(p.x, p.y, direction, cfg.spawnAhead);
      p.recoil(direction, 8);
      p.world.projectiles.fire(muzzle.x, muzzle.y, {
        texture: TEXTURES.bullet,
        size: cfg.size,
        speed: cfg.speed,
        range: cfg.range,
        direction,
        onHit: (enemy) => {
          enemy.takeDamage(cfg.damage);
          return true;
        },
      });

      if (p.dashing) return;
      const back = project(p.x, p.y, direction + Math.PI, cfg.pushback);
      p.world.fx.dashStreak(p.x, p.y, back.x, back.y);
      p.dash(back.x, back.y, undefined, undefined, { keepFacing: true });
    });

    this.cooldown.start(ctx.now);
    return true;
  }
}
