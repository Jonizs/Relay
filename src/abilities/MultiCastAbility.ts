import Phaser from 'phaser';
import { Ability } from '@/abilities/Ability';
import type { AbilityHud, CastContext } from '@/abilities/Ability';
import type { Player } from '@/entities/Player';

export interface MultiCastConfig {
  activations: number;
  windowMs: number;
  cooldown: number;
}

/**
 * An ability with several activations: after the first cast, each further cast
 * must happen within `windowMs` of the previous one. The full cooldown starts at
 * the FIRST activation. Activation count and recast window are independent of the
 * cooldown timer - a cooldown refund never changes how many casts remain.
 */
export abstract class MultiCastAbility extends Ability {
  protected used = 0;
  protected windowEndsAt = 0;

  constructor(
    key: string,
    player: Player,
    protected readonly multi: MultiCastConfig,
  ) {
    super(key, player, multi.cooldown);
  }

  override update(now: number): void {
    super.update(now);
    // Recast window expired: remaining activations are lost; the cooldown
    // (already running since the first cast) simply continues.
    if (this.used > 0 && now > this.windowEndsAt) this.used = 0;
  }

  override isReady(now: number): boolean {
    return this.used > 0 || this.cooldown.isReady(now);
  }

  override hud(now: number): AbilityHud {
    if (this.used > 0) {
      const windowFraction = Phaser.Math.Clamp((this.windowEndsAt - now) / this.multi.windowMs, 0, 1);
      return { fraction: 0, remainingMs: 0, charges: this.multi.activations - this.used, windowFraction };
    }
    return { fraction: this.cooldown.fraction(now), remainingMs: this.cooldown.remaining(now) };
  }

  protected cast(ctx: CastContext): boolean {
    if (this.used === 0) this.cooldown.start(ctx.now);

    this.used += 1;
    const last = this.used >= this.multi.activations;
    this.windowEndsAt = last ? 0 : ctx.now + this.multi.windowMs;
    if (last) this.used = 0;

    this.activate(ctx, this.used === 0 ? this.multi.activations : this.used);
    return true;
  }

  /** One activation. `index` is 1-based. */
  protected abstract activate(ctx: CastContext, index: number): void;
}
