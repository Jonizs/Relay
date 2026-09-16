import Phaser from 'phaser';
import { Ability } from '@/abilities/Ability';
import type { CastContext } from '@/abilities/Ability';
import { COMBAT, TEXTURES } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';
import { project } from '@/systems/Geometry';

/** W: dash toward the cursor, up to a fixed distance. No damage. */
export class WAbility extends Ability {
  constructor(player: Player) {
    super('W', player, COMBAT.w.cooldown);
  }

  protected cast(ctx: CastContext): boolean {
    const p = this.player;
    const toCursor = Phaser.Math.Distance.Between(p.x, p.y, ctx.x, ctx.y);
    const dist = Phaser.Math.Clamp(toCursor, COMBAT.w.minDistance, COMBAT.w.distance);

    const direction = Phaser.Math.Angle.Between(p.x, p.y, ctx.x, ctx.y);
    const to = project(p.x, p.y, direction, dist);
    p.sheatheSword();
    p.world.fx.dashStreak(p.x, p.y, to.x, to.y);

    // Afterimages every few ms along the way.
    let lastGhost = 0;
    p.dash(
      to.x,
      to.y,
      () => p.unsheatheSword(),
      () => {
        if (p.now - lastGhost >= 28) {
          lastGhost = p.now;
          p.world.fx.ghost(p.x, p.y, TEXTURES.player, p.scaleX);
        }
      },
    );

    this.cooldown.start(ctx.now);
    return true;
  }
}
