import Phaser from 'phaser';
import { Ability } from '@/abilities/Ability';
import type { CastContext } from '@/abilities/Ability';
import { COMBAT } from '@/config/GameConfig';
import type { Target } from '@/entities/Target';
import type { Player } from '@/entities/Player';
import { project } from '@/systems/Geometry';

/**
 * E: quick-cast on the enemy under the cursor. Dash through it, piercing it on the
 * way. If the enemy is out of range the player walks toward it and casts once in range.
 * Cast with full Q stacks: consumes them and refunds the cooldown. Grants brief
 * invulnerability on cast.
 */
export class EAbility extends Ability {
  constructor(player: Player) {
    super('E', player, COMBAT.e.cooldown);
  }

  protected cast(ctx: CastContext): boolean {
    const enemy = ctx.enemy;
    if (!enemy || !enemy.alive) return false;

    const p = this.player;
    const inRange = Phaser.Math.Distance.Between(p.x, p.y, enemy.x, enemy.y) <= COMBAT.e.range;

    if (inRange) {
      this.execute(enemy);
      return true;
    }

    p.castWhenInRange(enemy, COMBAT.e.range, () => {
      if (this.isReady(p.now) && !p.dashing) this.execute(enemy);
    });
    return false;
  }

  private execute(enemy: Target): void {
    const p = this.player;
    const cfg = COMBAT.e;
    const sx = p.x;
    const sy = p.y;
    const direction = Phaser.Math.Angle.Between(sx, sy, enemy.x, enemy.y);
    // End up on the far side of the enemy.
    const travel = Phaser.Math.Distance.Between(sx, sy, enemy.x, enemy.y) + cfg.passDistance;
    const to = project(sx, sy, direction, travel);

    if (p.stacksFull) {
      p.consumeStacks();
      // Full stacks: no cooldown this cast.
    } else {
      this.cooldown.start(p.now);
    }
    p.setInvulnerable(COMBAT.stacks.eInvulnMs);


    // Blade aimed straight through the target's centre for the whole dash,
    // leaving a light trail from the tip.
    p.faceToward(to.x);
    p.pointSword(direction);
    const trail = p.world.fx.trail(0xdfe6ee, 14, 240);

    p.dash(
      to.x,
      to.y,
      () => {
        if (enemy.alive) {
          enemy.takeDamage(cfg.damage);
        }
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
