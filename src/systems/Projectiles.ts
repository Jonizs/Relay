import Phaser from 'phaser';
import type { Enemy } from '@/entities/Enemy';

export interface ProjectileOptions {
  texture: string;
  /** Display size (px). Collision radius is half of this. */
  size: number;
  speed: number;
  /** Max travel distance before despawning. */
  range: number;
  direction: number;
  /** Called for each enemy hit. Return true to consume the projectile. */
  onHit: (enemy: Enemy) => boolean;
}

/** A projectile moving in a straight line; hit-tests enemies by distance each frame. */
class Projectile {
  readonly sprite: Phaser.GameObjects.Image;
  private travelled = 0;
  private readonly hit = new Set<Enemy>();
  done = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly opts: ProjectileOptions,
  ) {
    this.sprite = scene.add
      .image(x, y, opts.texture)
      .setDisplaySize(opts.size, opts.size * (scene.textures.get(opts.texture).getSourceImage().height / scene.textures.get(opts.texture).getSourceImage().width))
      .setRotation(opts.direction)
      .setDepth(3);
  }

  update(deltaMs: number, enemies: Enemy[]): void {
    const step = (this.opts.speed * deltaMs) / 1000;
    this.sprite.x += Math.cos(this.opts.direction) * step;
    this.sprite.y += Math.sin(this.opts.direction) * step;
    this.travelled += step;

    const r = this.opts.size / 2;
    for (const enemy of enemies) {
      if (!enemy.alive || this.hit.has(enemy)) continue;
      if (Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, enemy.x, enemy.y) <= r + enemy.radius) {
        this.hit.add(enemy);
        if (this.opts.onHit(enemy)) {
          this.destroy();
          return;
        }
      }
    }

    if (this.travelled >= this.opts.range) this.destroy();
  }

  destroy(): void {
    this.done = true;
    this.sprite.destroy();
  }
}

export class ProjectileManager {
  private readonly list: Projectile[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  fire(x: number, y: number, opts: ProjectileOptions): void {
    this.list.push(new Projectile(this.scene, x, y, opts));
  }

  update(deltaMs: number, enemies: Enemy[]): void {
    for (const p of this.list) p.update(deltaMs, enemies);
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].done) this.list.splice(i, 1);
    }
  }
}
