import { Ability } from '@/abilities/Ability';
import type { CastContext } from '@/abilities/Ability';
import { CROSSBOW } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';

/**
 * Crossbow E: brace. Heavy damage reduction and a hard slow for a moment, then a
 * big speed boost that tapers off. Casting another ability while braced cuts the
 * SHIELD short (damage reduction ends sooner); the slow and the boost timeline
 * still run on the original schedule.
 */
export class CrossbowE extends Ability {
  private blockEndsAt = 0;
  private shieldEndsAt = 0;
  private boostEndsAt = 0;
  private phase: 'idle' | 'block' | 'boost' | 'tail' = 'idle';
  private slowMod: { mult: number; until: number } | null = null;
  private shield: { end: () => void } | null = null;

  constructor(player: Player) {
    super('E', player, CROSSBOW.e.cooldown);
  }

  protected cast(ctx: CastContext): boolean {
    const p = this.player;
    const cfg = CROSSBOW.e;

    // A previous brace still running (e.g. quick re-cast) must not leave its slow behind.
    if (this.slowMod) this.slowMod.until = ctx.now;

    this.phase = 'block';
    this.blockEndsAt = ctx.now + cfg.blockMs;
    this.shieldEndsAt = this.blockEndsAt;
    p.setDamageReduction(cfg.blockReduction, cfg.blockMs);
    this.slowMod = p.addSpeedMod(cfg.blockSlow, cfg.blockMs);
    this.shield?.end();
    this.shield = p.world.fx.shield(() => ({ x: p.x, y: p.y }), 40, 60000);

    this.cooldown.start(ctx.now);
    return true;
  }

  override onOtherAbilityCast(_ability: Ability, now: number): void {
    if (this.phase !== 'block' || now >= this.shieldEndsAt) return;
    this.shieldEndsAt = Math.max(now, this.shieldEndsAt - CROSSBOW.e.castShortenMs);
    this.player.setDamageReductionEnd(this.shieldEndsAt);
    if (now >= this.shieldEndsAt) this.breakShield();
  }

  private breakShield(): void {
    this.shield?.end();
    this.shield = null;
  }

  override update(now: number): void {
    super.update(now);
    const p = this.player;
    const cfg = CROSSBOW.e;

    if (this.phase === 'block' && this.shield && now >= this.shieldEndsAt) this.breakShield();

    if (this.phase === 'block' && now >= this.blockEndsAt) {
      this.phase = 'boost';
      this.breakShield();
      this.boostEndsAt = now + cfg.boostMs;
      p.addSpeedMod(cfg.boost, cfg.boostMs);
      p.world.fx.burst(p.x, p.y, 0x9fd3ff);
    } else if (this.phase === 'boost' && now >= this.boostEndsAt) {
      this.phase = 'tail';
      p.addSpeedMod(cfg.tail, cfg.tailMs);
    } else if (this.phase === 'tail' && now >= this.boostEndsAt + cfg.tailMs) {
      this.phase = 'idle';
    }
  }
}
