import Phaser from 'phaser';
import { Ability } from '@/abilities/Ability';
import type { CastContext } from '@/abilities/Ability';
import { COMBAT } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';
import { inCone } from '@/systems/Geometry';

/** Q: 120 degree sword sweep toward the cursor. */
export class QAbility extends Ability {
  override readonly castableWhileBusy = true;

  constructor(player: Player) {
    super('Q', player, COMBAT.q.cooldown);
  }

  protected cast(ctx: CastContext): boolean {
    const p = this.player;
    const cfg = COMBAT.q;
    const direction = Phaser.Math.Angle.Between(p.x, p.y, ctx.x, ctx.y);
    const halfAngle = Phaser.Math.DegToRad(cfg.halfAngleDeg);

    p.faceToward(ctx.x);
    p.slash(direction, cfg.range, halfAngle);

    let hit = false;
    for (const enemy of p.world.enemies) {
      if (!enemy.alive) continue;
      if (inCone(enemy.x, enemy.y, p.x, p.y, direction, halfAngle, cfg.range, enemy.radius)) {
        enemy.takeDamage(cfg.damage);
        hit = true;
      }
    }
    if (hit) p.addStack();

    this.cooldown.start(ctx.now);
    return true;
  }
}
