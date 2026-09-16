import Phaser from 'phaser';

const DANGER = 0xff3b3b;
const DEPTH = 20;

/**
 * A ribbon that follows whatever feeds it points (e.g. the sword tip during a
 * dash). Segments thin out and fade with age; the trail destroys itself once it
 * has been ended and every segment has expired.
 */
export class Trail {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly points: { x: number; y: number; t: number }[] = [];
  private ended = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly color: number,
    private readonly width: number,
    private readonly lifeMs: number,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH + 2);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.draw, this);
  }

  add(x: number, y: number): void {
    this.points.push({ x, y, t: this.scene.time.now });
  }

  end(): void {
    this.ended = true;
  }

  private draw(): void {
    const now = this.scene.time.now;
    while (this.points.length && now - this.points[0].t > this.lifeMs) this.points.shift();

    if (this.ended && this.points.length === 0) {
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.draw, this);
      this.g.destroy();
      return;
    }

    this.g.clear();
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const life = 1 - (now - b.t) / this.lifeMs;
      this.g.lineStyle(this.width * life, this.color, 0.25 * life);
      this.g.lineBetween(a.x, a.y, b.x, b.y);
      this.g.lineStyle(this.width * life * 0.4, 0xffffff, 0.7 * life);
      this.g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }
}

/**
 * Transient combat visuals: red outlines of damage areas and floating damage numbers.
 * Everything here is fire-and-forget and cleans itself up.
 */
export class Fx {
  /** Set by the scene to replicate one-shot effects to other players. */
  broadcast: ((kind: 'sweep' | 'streak' | 'impact' | 'burst', args: number[]) => void) | null = null;
  /** True while replaying a remote effect (so it isn't re-broadcast). */
  private replaying = false;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Play a one-shot effect received from another player. */
  replay(kind: 'sweep' | 'streak' | 'impact' | 'burst', a: number[]): void {
    this.replaying = true;
    try {
      switch (kind) {
        case 'sweep': {
          const origin = { x: a[0], y: a[1] };
          this.sweepTrail(() => origin, a[2], a[3], a[4], a[5], a[6]);
          break;
        }
        case 'streak':
          this.dashStreak(a[0], a[1], a[2], a[3]);
          break;
        case 'impact':
          this.impact(a[0], a[1], a[2], a[3]);
          break;
        case 'burst':
          this.burst(a[0], a[1], a[2]);
          break;
      }
    } finally {
      this.replaying = false;
    }
  }

  private share(kind: 'sweep' | 'streak' | 'impact' | 'burst', args: number[]): void {
    if (!this.replaying) this.broadcast?.(kind, args);
  }

  /** Cone from (x, y) facing `direction` (radians). */
  cone(x: number, y: number, direction: number, halfAngle: number, range: number): void {
    this.flash((g) => {
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, range, direction - halfAngle, direction + halfAngle, false);
      g.closePath();
      g.fillPath();
      g.strokePath();
    });
  }

  /** Thick line (capsule-ish rectangle) from A to B. */
  segment(ax: number, ay: number, bx: number, by: number, width: number): void {
    const angle = Math.atan2(by - ay, bx - ax);
    const nx = Math.cos(angle + Math.PI / 2) * (width / 2);
    const ny = Math.sin(angle + Math.PI / 2) * (width / 2);
    const pts = [
      new Phaser.Math.Vector2(ax + nx, ay + ny),
      new Phaser.Math.Vector2(bx + nx, by + ny),
      new Phaser.Math.Vector2(bx - nx, by - ny),
      new Phaser.Math.Vector2(ax - nx, ay - ny),
    ];
    this.flash((g) => {
      g.fillPoints(pts, true);
      g.strokePoints(pts, true);
    });
  }

  /**
   * Slash trail: an arc band that grows from `start` through `sweep` radians over
   * `growMs`, then fades. `origin` is sampled each frame so it can follow a moving player.
   */
  sweepTrail(
    origin: () => { x: number; y: number },
    radius: number,
    start: number,
    sweep: number,
    growMs: number,
    color = 0xffffff,
  ): void {
    {
      const o = origin();
      this.share('sweep', [o.x, o.y, radius, start, sweep, growMs, color]);
    }
    const g = this.scene.add.graphics().setDepth(DEPTH + 2);
    const band = 18;
    const segments = 48;
    const state = { t: 0 };

    // Tapered ribbon: many short segments whose width/alpha follow a smooth bump
    // over the full sweep, so both the origin and the leading tip feather out.
    const draw = () => {
      const { x, y } = origin();
      const r = radius - band / 2;
      const swept = sweep * state.t;
      const n = Math.max(2, Math.round(segments * state.t));
      g.clear();
      let px = x + Math.cos(start) * r;
      let py = y + Math.sin(start) * r;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const a = start + swept * u;
        const cx = x + Math.cos(a) * r;
        const cy = y + Math.sin(a) * r;
        // Profile over the FULL sweep (so the tip stays thin while growing).
        const w = Math.sin(Math.PI * u * state.t);
        const width = band * (0.15 + 0.85 * w);
        g.lineStyle(width, color, 0.16 * w + 0.04);
        g.lineBetween(px, py, cx, cy);
        g.lineStyle(width * 0.45, color, 0.6 * w + 0.05);
        g.lineBetween(px, py, cx, cy);
        px = cx;
        py = cy;
      }
    };

    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: growMs,
      ease: 'Expo.easeOut',
      onUpdate: draw,
      onComplete: () => {
        this.scene.tweens.add({
          targets: g,
          alpha: 0,
          duration: 220,
          ease: 'Quad.easeIn',
          onUpdate: draw,
          onComplete: () => g.destroy(),
        });
      },
    });
  }

  trail(color: number, width: number, lifeMs: number): Trail {
    return new Trail(this.scene, color, width, lifeMs);
  }

  /** Fading afterimage of a texture at a point (for dashes). */
  ghost(x: number, y: number, texture: string, scaleX: number, tint = 0x9fd3ff): void {
    const img = this.scene.add
      .image(x, y, texture)
      .setScale(scaleX, 1)
      .setAlpha(0.45)
      .setTint(tint)
      .setDepth(1);
    this.scene.tweens.add({
      targets: img,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  /** Speed streaks along a dash path. */
  dashStreak(ax: number, ay: number, bx: number, by: number): void {
    this.share('streak', [ax, ay, bx, by]);
    const angle = Math.atan2(by - ay, bx - ax);
    const nx = Math.cos(angle + Math.PI / 2);
    const ny = Math.sin(angle + Math.PI / 2);
    const g = this.scene.add.graphics().setDepth(DEPTH + 1);
    const offsets = [-14, -5, 4, 12];
    offsets.forEach((o, i) => {
      // Vary start along the path so the streaks look ragged rather than a comb.
      const s = 0.1 + (i % 2) * 0.2;
      const e = 0.75 + (i % 3) * 0.08;
      g.lineStyle(i % 2 ? 2 : 3, 0xffffff, 0.55);
      g.lineBetween(
        ax + (bx - ax) * s + nx * o, ay + (by - ay) * s + ny * o,
        ax + (bx - ax) * e + nx * o, ay + (by - ay) * e + ny * o,
      );
    });
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 240,
      ease: 'Quad.easeIn',
      onComplete: () => g.destroy(),
    });
  }

  /**
   * Diagonal cut through a body at (x, y): always top-left shoulder to bottom-right
   * hip, overshooting the body on both ends. Draws in quickly, then fades.
   */
  cutMark(x: number, y: number): void {
    const start = { x: x - 34, y: y - 40 };
    const end = { x: x + 26, y: y + 46 };
    const g = this.scene.add.graphics().setDepth(DEPTH + 3);
    const state = { t: 0 };

    const draw = () => {
      const ex = start.x + (end.x - start.x) * state.t;
      const ey = start.y + (end.y - start.y) * state.t;
      g.clear();
      g.lineStyle(9, DANGER, 0.35);
      g.lineBetween(start.x, start.y, ex, ey);
      g.lineStyle(4, 0xffffff, 0.95);
      g.lineBetween(start.x, start.y, ex, ey);
      g.lineStyle(1.5, 0xffe9e9, 1);
      g.lineBetween(start.x, start.y, ex, ey);
    };

    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: 80,
      ease: 'Expo.easeOut',
      onUpdate: draw,
      onComplete: () => {
        this.scene.tweens.add({
          targets: g,
          alpha: 0,
          delay: 90,
          duration: 260,
          ease: 'Quad.easeIn',
          onComplete: () => g.destroy(),
        });
      },
    });
  }

  /** Persistent ring that follows `origin` for `ms` (block / spin indicators). Returns a handle to end early. */
  private followRing(origin: () => { x: number; y: number }, radius: number, ms: number, color: number, width: number, alpha: number): { end: () => void } {
    const g = this.scene.add.graphics().setDepth(DEPTH + 1);
    let ended = false;
    const draw = () => {
      const { x, y } = origin();
      g.clear();
      g.lineStyle(width, color, alpha);
      g.strokeCircle(x, y, radius);
      g.fillStyle(color, alpha * 0.15);
      g.fillCircle(x, y, radius);
    };
    const end = () => {
      if (ended) return;
      ended = true;
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, draw);
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 150, onComplete: () => g.destroy() });
    };
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, draw);
    this.scene.time.delayedCall(ms, end);
    return { end };
  }

  shield(origin: () => { x: number; y: number }, radius: number, ms: number): { end: () => void } {
    return this.followRing(origin, radius, ms, 0x9fd3ff, 4, 0.9);
  }

  spinRing(origin: () => { x: number; y: number }, radius: number): { end: () => void } {
    return this.followRing(origin, radius, 10000, 0xffe066, 2, 0.35);
  }

  /** Ground impact: a bright disc that pops and fades. */
  impact(x: number, y: number, radius: number, color = 0xffe066): void {
    this.share('impact', [x, y, radius, color]);
    const g = this.scene.add.graphics().setDepth(DEPTH + 1);
    const state = { t: 0 };
    this.scene.tweens.add({
      targets: state,
      t: 1,
      duration: 260,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        const r = radius * (0.6 + 0.4 * state.t);
        g.clear();
        g.fillStyle(color, 0.35 * (1 - state.t));
        g.fillCircle(x, y, r);
        g.lineStyle(3, 0xffffff, 0.9 * (1 - state.t));
        g.strokeCircle(x, y, r);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** Quick tracer line from A to B that fades. */
  tracer(ax: number, ay: number, bx: number, by: number, color = 0xffe066): void {
    const g = this.scene.add.graphics().setDepth(DEPTH + 1);
    g.lineStyle(3, color, 0.9);
    g.lineBetween(ax, ay, bx, by);
    g.lineStyle(1, 0xffffff, 1);
    g.lineBetween(ax, ay, bx, by);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
  }

  /** Expanding ring pop (buff activation). */
  burst(x: number, y: number, color: number): void {
    this.share('burst', [x, y, color]);
    const g = this.scene.add.graphics().setDepth(DEPTH + 1);
    const state = { r: 10 };
    this.scene.tweens.add({
      targets: state,
      r: 70,
      duration: 260,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(4, color, 1 - (state.r - 10) / 60);
        g.strokeCircle(x, y, state.r);
      },
      onComplete: () => g.destroy(),
    });
  }

  circle(x: number, y: number, radius: number): void {
    this.flash((g) => {
      g.fillCircle(x, y, radius);
      g.strokeCircle(x, y, radius);
    });
  }


  damageNumber(x: number, y: number, amount: number): void {
    const text = this.scene.add
      .text(x + Phaser.Math.Between(-10, 10), y - 30, String(amount), {
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ff5a5a',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1);

    this.scene.tweens.add({
      targets: text,
      y: y - 75,
      alpha: 0,
      duration: 750,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private flash(draw: (g: Phaser.GameObjects.Graphics) => void, durationMs = 450): void {
    const g = this.scene.add.graphics().setDepth(DEPTH);
    g.lineStyle(3, DANGER, 1);
    g.fillStyle(DANGER, 0.12);
    draw(g);
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.easeIn',
      onComplete: () => g.destroy(),
    });
  }
}
