/** A simple timestamp-based cooldown. All times are scene-time ms. */
export class Cooldown {
  private readyAt = 0;
  private startedAt = -Infinity;

  constructor(public readonly duration: number) {}

  start(now: number): void {
    this.startedAt = now;
    this.readyAt = now + this.duration;
  }

  /** Time since the current cooldown started (Infinity if never started). */
  elapsed(now: number): number {
    return now - this.startedAt;
  }

  /** Force the cooldown to end at an explicit time (used by R's shared window). */
  setReadyAt(time: number): void {
    this.readyAt = time;
  }

  /** Shorten the remaining cooldown by `ms`. */
  reduce(ms: number): void {
    this.readyAt -= ms;
  }

  isReady(now: number): boolean {
    return now >= this.readyAt;
  }

  remaining(now: number): number {
    return Math.max(0, this.readyAt - now);
  }

  /** 0 = ready, 1 = just started. */
  fraction(now: number): number {
    return this.duration > 0 ? this.remaining(now) / this.duration : 0;
  }
}
