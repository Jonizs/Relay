import type { Enemy } from '@/entities/Enemy';
import type { Player } from '@/entities/Player';
import { Cooldown } from '@/systems/Cooldown';
import { DEV_COOLDOWN_RESET_MS, settings } from '@/systems/Settings';

export interface CastContext {
  /** Cursor position in world space. */
  x: number;
  y: number;
  /** Enemy under (or nearest to) the cursor, if any. */
  enemy: Enemy | null;
  now: number;
}

/** What the HUD needs to draw one ability slot. */
export interface AbilityHud {
  /** 0 = ready, 1 = cooldown just started. */
  fraction: number;
  remainingMs: number;
  /** Remaining activations (multi-cast abilities). */
  charges?: number;
  /** 1 → 0 countdown of a re-cast window, if one is open. */
  windowFraction?: number;
}

export abstract class Ability {
  readonly cooldown: Cooldown;
  /** If true the ability can be cast mid-dash / mid-swing. */
  readonly castableWhileBusy: boolean = false;

  constructor(
    readonly key: string,
    protected readonly player: Player,
    cooldownMs: number,
  ) {
    this.cooldown = new Cooldown(cooldownMs);
  }

  /** Called every frame; subclasses with time-based state should call super. */
  update(now: number): void {
    if (
      settings.get('devMode') &&
      !this.cooldown.isReady(now) &&
      this.cooldown.elapsed(now) >= DEV_COOLDOWN_RESET_MS
    ) {
      this.cooldown.setReadyAt(now);
    }
  }

  isReady(now: number): boolean {
    return this.cooldown.isReady(now);
  }

  /** Attempts the cast. Returns true if the ability fired. */
  tryCast(ctx: CastContext): boolean {
    if (this.player.castLocked) return false;
    if ((this.player.dashing && !this.castableWhileBusy) || !this.isReady(ctx.now)) return false;
    const fired = this.cast(ctx);
    if (fired) {
      for (const other of this.player.abilities) {
        if (other !== this) other.onOtherAbilityCast(this, ctx.now);
      }
    }
    return fired;
  }

  /** Called when a different ability of the same weapon fires. */
  onOtherAbilityCast(_ability: Ability, _now: number): void {}

  hud(now: number): AbilityHud {
    return { fraction: this.cooldown.fraction(now), remainingMs: this.cooldown.remaining(now) };
  }

  /** Perform the ability. Implementations start their own cooldown when they actually fire. */
  protected abstract cast(ctx: CastContext): boolean;
}
