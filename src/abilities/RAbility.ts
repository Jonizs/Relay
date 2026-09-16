import Phaser from 'phaser';
import type { CastContext } from '@/abilities/Ability';
import { MultiCastAbility } from '@/abilities/MultiCastAbility';
import { COMBAT } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';
import { distanceToSegment, project } from '@/systems/Geometry';

/**
 * Blade R: dash to the cursor (capped at `distance`), damaging enemies along the
 * path. 3 activations with a recast window; cooldown runs from the first cast.
 */
export class RAbility extends MultiCastAbility {
  constructor(player: Player) {
    super('R', player, COMBAT.r);
  }

  protected activate(ctx: CastContext): void {
    const p = this.player;
    const cfg = COMBAT.r;
    const direction = Phaser.Math.Angle.Between(p.x, p.y, ctx.x, ctx.y);
    const dist = Phaser.Math.Clamp(Phaser.Math.Distance.Between(p.x, p.y, ctx.x, ctx.y), cfg.minDistance, cfg.distance);
    const from = { x: p.x, y: p.y };
    const to = project(p.x, p.y, direction, dist);

    // Damage everything the dash passes through. Applied up-front for reliability;
    // the dash itself is fast enough that it reads as "hit while passing".
    for (const enemy of p.world.enemies) {
      if (!enemy.alive) continue;
      const d = distanceToSegment(enemy.x, enemy.y, from.x, from.y, to.x, to.y);
      if (d <= cfg.width / 2 + enemy.radius) enemy.takeDamage(cfg.damage);
    }

    // Blade held out ahead of the player, across (90 degrees to) the dash direction.
    p.faceToward(to.x);
    p.pointSword(direction, -90, 40);

    const trail = p.world.fx.trail(0xff3b3b, 18, 280);
    p.dash(
      to.x,
      to.y,
      () => {
        p.restSword();
        trail.end();
      },
      () => {
        const tip = p.swordTip();
        trail.add(tip.x, tip.y);
      },
    );
  }
}
