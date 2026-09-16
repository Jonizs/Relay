import Phaser from 'phaser';
import type { CastContext } from '@/abilities/Ability';
import { MultiCastAbility } from '@/abilities/MultiCastAbility';
import { CROSSBOW } from '@/config/GameConfig';
import type { Target } from '@/entities/Target';
import type { Player } from '@/entities/Player';
import { project } from '@/systems/Geometry';

/**
 * Crossbow R: spin and slowly dash toward the cursor, hitting every enemy that
 * comes within `radius` once per activation. 3 activations; cooldown runs from
 * the first and is shortened by Q hits.
 */
export class CrossbowR extends MultiCastAbility {
  constructor(player: Player) {
    super('R', player, CROSSBOW.r);
  }

  protected activate(ctx: CastContext): void {
    const p = this.player;
    const cfg = CROSSBOW.r;
    const direction = Phaser.Math.Angle.Between(p.x, p.y, ctx.x, ctx.y);
    const dist = Phaser.Math.Clamp(Phaser.Math.Distance.Between(p.x, p.y, ctx.x, ctx.y), cfg.minDistance, cfg.distance);
    const to = project(p.x, p.y, direction, dist);
    const hit = new Set<Target>();

    p.faceToward(to.x);
    p.spin((dist / cfg.speed) * 1000, 2);
    const ring = p.world.fx.spinRing(() => ({ x: p.x, y: p.y }), cfg.radius);

    p.dash(
      to.x,
      to.y,
      () => ring.end(),
      () => {
        for (const enemy of p.world.enemies) {
          if (!enemy.alive || hit.has(enemy)) continue;
          if (Phaser.Math.Distance.Between(p.x, p.y, enemy.x, enemy.y) <= cfg.radius + enemy.radius) {
            hit.add(enemy);
            enemy.takeDamage(cfg.damage);
          }
        }
      },
      { speed: cfg.speed, keepFacing: true },
    );
  }
}
