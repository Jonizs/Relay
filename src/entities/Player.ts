import Phaser from 'phaser';
import type { Ability } from '@/abilities/Ability';
import { COMBAT, CROSSBOW, PLAYER, TEXTURES, WORLD_HEIGHT, WORLD_WIDTH } from '@/config/GameConfig';
import { ENEMY_KILLED } from '@/entities/Enemy';
import type { Target } from '@/entities/Target';
import type { PlayerState } from '@/net/Net';
import type { Fx } from '@/systems/Fx';
import type { ProjectileManager } from '@/systems/Projectiles';
import { settings } from '@/systems/Settings';
import { BLADE } from '@/weapons/Blade';
import type { Weapon } from '@/weapons/Weapon';
import { weaponById } from '@/weapons';

type Facing = 1 | -1;

/** What the player needs to know about the world to fight in it. */
export interface World {
  enemies: Target[];
  fx: Fx;
  projectiles: ProjectileManager;
}

export interface DashOptions {
  /** px/s; defaults to PLAYER.dashSpeed. */
  speed?: number;
  /** Don't turn to face the dash direction (e.g. a knockback). */
  keepFacing?: boolean;
}

interface WeaponPose {
  x: number;
  y: number;
  angle: number;
}

interface PendingCast {
  enemy: Target;
  range: number;
  execute: () => void;
}

/**
 * Player is a Container holding the body sprite and a sword sprite.
 * Facing is handled by flipping the container's scaleX so the sword flips with it.
 *
 * Commands are mutually exclusive: a ground click, an attack target, or a queued
 * cast. Dashes interrupt everything and block input until they finish.
 */
export class Player extends Phaser.GameObjects.Container {
  declare body: Phaser.Physics.Arcade.Body;

  abilities: readonly Ability[] = [];
  weapon: Weapon = BLADE;

  private readonly bodySprite: Phaser.GameObjects.Image;
  private readonly sword: Phaser.GameObjects.Image;

  private target: Phaser.Math.Vector2 | null = null;
  /** Attack-move destination: walk there, fighting anything acquired on the way. */
  private attackMove: Phaser.Math.Vector2 | null = null;
  private attackTarget: Target | null = null;
  private pendingCast: PendingCast | null = null;

  /** Q-hit stacks (0..COMBAT.stacks.max). */
  stacks = 0;
  readonly maxHp: number = COMBAT.player.hp;
  hp: number = COMBAT.player.hp;
  alive = true;
  /** Rough radius for other players' hit tests. */
  readonly radius = 26;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private readonly spawn: { x: number; y: number };
  private invulnerableUntil = 0;
  private speedMods: { mult: number; until: number }[] = [];
  /** While set in the future, no ability can be cast (wind-ups). */
  private castLockUntil = 0;
  /** Replication hints for other players' clients (set by abilities). */
  netTrail = 0;
  netGhost = false;
  netShield = 0;
  netSpin = 0;
  private damageReduction = { pct: 0, until: 0 };
  /** Most recent post-reduction hit (until there's player HP to apply it to). */
  lastDamageTaken = 0;

  private facing: Facing = 1;
  /** Sword-animation busy window; a timestamp so an interrupted tween can never leave it stuck. */
  private attackingUntil = 0;
  private nextAttackAt = 0;
  /** The running dash tween; `dashing` derives from it so a killed tween can't leave input blocked. */
  private dashTween: Phaser.Tweens.Tween | null = null;

  /** Rest poses of the weapon in hand, relative to the container origin. */
  private static readonly POSES: Record<string, WeaponPose> = {
    [TEXTURES.sword]: { x: 20, y: 6, angle: 25 },
    [TEXTURES.crossbow]: { x: 16, y: 2, angle: 0 },
  };
  /** Sheathed pose: strapped diagonally across the back, drawn behind the body. */
  private static readonly SWORD_BACK = { x: -4, y: 12, angle: -35 };
  private sheathed = false;
  /** Current in-hand rest pose (depends on the weapon). */
  private rest: WeaponPose = Player.POSES[TEXTURES.sword];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly world: World,
  ) {
    super(scene, x, y);

    this.bodySprite = scene.add.image(0, 0, TEXTURES.player);

    this.sword = scene.add.image(this.rest.x, this.rest.y, TEXTURES.sword);
    // Pivot at the grip so swings rotate around the hand.
    this.sword.setOrigin(0.5, 0.85);
    this.sword.setAngle(this.rest.angle);

    this.hpBar = scene.add.graphics();
    this.add([this.bodySprite, this.sword, this.hpBar]);
    this.setDepth(2);
    this.spawn = { x, y };
    this.drawHpBar();

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Container physics bodies default to 0x0 – size it to the body sprite.
    this.body.setSize(this.bodySprite.width, this.bodySprite.height);
    this.body.setOffset(-this.bodySprite.width / 2, -this.bodySprite.height / 2);
    this.body.setCollideWorldBounds(true);

    this.equipWeapon(weaponById(settings.get('weapon')));

    // Kills refund part of every cooldown.
    scene.events.on(ENEMY_KILLED, this.onEnemyKilled, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(ENEMY_KILLED, this.onEnemyKilled, this));
  }

  private onEnemyKilled(): void {
    // Weapon-dependent. Only the cooldown timer; multi-cast charges / recast windows are untouched.
    const refund = this.weapon.killRefundMs;
    if (refund <= 0) return;
    for (const ability of this.abilities) ability.cooldown.reduce(refund);
  }

  // --- weapon ---------------------------------------------------------------

  equipWeapon(weapon: Weapon): void {
    this.weapon = weapon;
    this.abilities = weapon.createAbilities(this);
    this.stacks = 0;
    this.sheathed = false;
    this.scene.tweens.killTweensOf(this.sword);
    this.bringToTop(this.sword);

    this.rest = Player.POSES[weapon.texture] ?? Player.POSES[TEXTURES.sword];
    this.sword.setTexture(weapon.texture);
    // Sword pivots at the grip (bottom); crossbow is held level at its centre.
    this.sword.setOrigin(0.5, weapon.texture === TEXTURES.sword ? 0.85 : 0.5);
    this.sword.setPosition(this.rest.x, this.rest.y).setAngle(this.rest.angle);
    settings.set('weapon', weapon.id);
  }

  // --- movement / damage modifiers ------------------------------------------

  /** Multiply move speed by `mult` for `ms`. Stacks multiplicatively with others. Returns the mod (its `until` may be edited). */
  addSpeedMod(mult: number, ms: number): { mult: number; until: number } {
    const mod = { mult, until: this.now + ms };
    this.speedMods.push(mod);
    return mod;
  }

  get speedMultiplier(): number {
    const now = this.now;
    this.speedMods = this.speedMods.filter((m) => m.until > now);
    return this.speedMods.reduce((acc, m) => acc * m.mult, 1);
  }

  setDamageReduction(pct: number, ms: number): void {
    this.damageReduction = { pct, until: this.now + ms };
  }

  /** End the current damage reduction at an explicit time. */
  setDamageReductionEnd(time: number): void {
    this.damageReduction.until = time;
  }

  get now(): number {
    return this.scene.time.now;
  }

  get dashing(): boolean {
    return this.dashTween !== null && this.dashTween.isPlaying();
  }

  get isAttacking(): boolean {
    return this.now < this.attackingUntil;
  }

  private setAttacking(ms: number): void {
    this.attackingUntil = this.now + ms;
  }

  get castLocked(): boolean {
    return this.now < this.castLockUntil;
  }

  /** Block all ability casts for `ms`. */
  lockCasts(ms: number): void {
    this.castLockUntil = this.now + ms;
  }

  get invulnerable(): boolean {
    return this.now < this.invulnerableUntil;
  }

  // --- stacks / status --------------------------------------------------------

  addStack(): void {
    if (!this.weapon.usesStacks) return;
    this.stacks = Math.min(COMBAT.stacks.max, this.stacks + 1);
  }

  get stacksFull(): boolean {
    return this.stacks >= COMBAT.stacks.max;
  }

  consumeStacks(): void {
    this.stacks = 0;
  }

  /** Ignore enemy damage for `ms` and fade the sprite to show it. */
  setInvulnerable(ms: number): void {
    this.invulnerableUntil = this.now + ms;
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(COMBAT.stacks.invulnAlpha);
    this.scene.time.delayedCall(ms, () => {
      if (!this.invulnerable) this.scene.tweens.add({ targets: this, alpha: 1, duration: 120 });
    });
  }

  /** Damage entry point (other players, later enemies). Returns true if it landed. */
  takeDamage(amount: number, _remote = false): boolean {
    if (!this.alive || this.invulnerable) return false;
    const reduction = this.now < this.damageReduction.until ? this.damageReduction.pct : 0;
    const final = Math.round(amount * (1 - reduction));
    this.lastDamageTaken = final;
    this.hp = Math.max(0, this.hp - final);
    this.world.fx.damageNumber(this.x, this.y, final);
    this.drawHpBar();
    this.bodySprite.setTint(0xff6b6b);
    this.scene.time.delayedCall(70, () => {
      if (this.alive) this.bodySprite.clearTint();
    });
    if (this.hp === 0) this.die();
    return true;
  }

  private die(): void {
    this.alive = false;
    this.stop();
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(0.3);
    this.bodySprite.clearTint();
    this.emit('died');
    this.scene.time.delayedCall(COMBAT.player.respawnMs, () => this.respawn());
  }

  private respawn(): void {
    this.hp = this.maxHp;
    this.alive = true;
    this.stacks = 0;
    this.setPosition(this.spawn.x, this.spawn.y);
    this.setAlpha(1);
    this.drawHpBar();
    this.world.fx.burst(this.x, this.y, 0xffe066);
  }

  private drawHpBar(): void {
    const w = 52;
    const h = 6;
    const x = -w / 2;
    const y = -this.bodySprite.height / 2 - 12;
    const t = this.hp / this.maxHp;
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(x - 1, y - 1, w + 2, h + 2);
    this.hpBar.fillStyle(0x4a90e2, 1);
    this.hpBar.fillRect(x, y, w * t, h);
  }

  // --- commands -------------------------------------------------------------

  /** Walk to a point (ground click). */
  setDestination(x: number, y: number): void {
    this.clearCommands();
    this.target = new Phaser.Math.Vector2(x, y);
  }

  /** Basic attack: chase the enemy and swing whenever in range. */
  attackEnemy(enemy: Target): void {
    this.clearCommands();
    this.attackTarget = enemy;
  }

  /** League-style attack-move: head to a point, engaging the nearest enemy that comes into acquire range. */
  attackMoveTo(x: number, y: number): void {
    this.clearCommands();
    this.attackMove = new Phaser.Math.Vector2(x, y);
  }

  /** Walk toward `enemy` until within `range`, then run `execute` once. */
  castWhenInRange(enemy: Target, range: number, execute: () => void): void {
    this.clearCommands();
    this.pendingCast = { enemy, range, execute };
  }

  stop(): void {
    this.clearCommands();
    this.body.setVelocity(0, 0);
  }

  private clearCommands(): void {
    this.target = null;
    this.attackMove = null;
    this.attackTarget = null;
    this.pendingCast = null;
  }

  // --- actions --------------------------------------------------------------

  faceToward(x: number): void {
    this.setFacing(x >= this.x ? 1 : -1);
  }

  /** Puts the sword on the back (e.g. while sprinting). */
  sheatheSword(duration = 90): void {
    this.scene.tweens.killTweensOf(this.sword);
    this.sheathed = true;
    this.sendToBack(this.sword);
    this.scene.tweens.add({
      targets: this.sword,
      ...Player.SWORD_BACK,
      duration,
      ease: 'Quad.easeOut',
    });
  }

  /** Draws the sword back into the hand. */
  unsheatheSword(duration = 120): void {
    if (!this.sheathed) return;
    this.scene.tweens.killTweensOf(this.sword);
    this.sheathed = false;
    this.bringToTop(this.sword);
    if (duration === 0) {
      this.sword.setPosition(this.rest.x, this.rest.y).setAngle(this.rest.angle);
      return;
    }
    this.scene.tweens.add({
      targets: this.sword,
      ...this.rest,
      duration,
      ease: 'Quad.easeOut',
    });
  }

  /** Sword animation: wind up to `windup`, slash through to `through`, return to rest. */
  swing(windup = -50, through = 110, duration: number = PLAYER.attackDuration): void {
    this.unsheatheSword(0);
    this.scene.tweens.killTweensOf(this.sword);
    this.setAttacking(duration);
    this.scene.tweens.chain({
      targets: this.sword,
      tweens: [
        { angle: windup, duration: duration * 0.25, ease: 'Quad.easeOut' },
        { angle: through, duration: duration * 0.35, ease: 'Quad.easeIn' },
        { angle: this.rest.angle, duration: duration * 0.4, ease: 'Quad.easeOut' },
      ],
    });
  }

  /**
   * Big flourish slash toward `direction`: quick wind-up, whip-crack sweep with
   * the blade extended, squash-and-stretch on the body, and a slash trail.
   */
  slash(direction: number, range: number, halfAngle: number): void {
    this.unsheatheSword(0);
    this.scene.tweens.killTweensOf(this.sword);
    this.scene.tweens.killTweensOf(this.bodySprite);

    const rest = this.rest;
    const windup = 70;
    const sweep = 110;
    const recover = 220;
    this.setAttacking(windup + sweep + recover);

    // Sword angle: back over the shoulder, then crack through past the front.
    this.scene.tweens.chain({
      targets: this.sword,
      tweens: [
        { angle: -120, duration: windup, ease: 'Back.easeOut' },
        { angle: 165, duration: sweep, ease: 'Expo.easeOut' },
        { angle: rest.angle, duration: recover, ease: 'Quad.easeOut' },
      ],
    });
    // Sword reach: pull in on the wind-up, thrust out during the sweep.
    this.scene.tweens.chain({
      targets: this.sword,
      tweens: [
        { x: rest.x - 8, y: rest.y - 6, duration: windup, ease: 'Quad.easeOut' },
        { x: rest.x + 12, y: rest.y - 2, duration: sweep, ease: 'Expo.easeOut' },
        { x: rest.x, y: rest.y, duration: recover, ease: 'Quad.easeOut' },
      ],
    });
    // Body: coil then snap.
    this.scene.tweens.chain({
      targets: this.bodySprite,
      tweens: [
        { scaleX: 0.9, scaleY: 1.08, duration: windup, ease: 'Quad.easeOut' },
        { scaleX: 1.16, scaleY: 0.9, duration: sweep * 0.6, ease: 'Expo.easeOut' },
        { scaleX: 1, scaleY: 1, duration: recover, ease: 'Back.easeOut' },
      ],
    });

    // Trail stays where the slash was cast (like the damage indicator); clockwise
    // when facing right, mirrored when facing left.
    const f = this.facing;
    const origin = { x: this.x, y: this.y };
    this.scene.time.delayedCall(windup, () => {
      this.world.fx.sweepTrail(() => origin, range, direction - halfAngle * f, 2 * halfAngle * f, sweep);
    });
    this.scene.cameras.main.shake(70, 0.0025);
  }

  /**
   * Two-hit cross slash toward `direction`: a fast downward diagonal cut, then a
   * reverse upward cut, leaving an X-shaped trail. Includes a short lunge forward.
   */
  slashCross(direction: number, range: number): void {
    this.unsheatheSword(0);
    this.scene.tweens.killTweensOf(this.sword);
    this.scene.tweens.killTweensOf(this.bodySprite);

    const rest = this.rest;
    const cut = 90;
    const gap = 40;
    const recover = 200;
    this.setAttacking(40 + cut * 2 + gap + recover);
    const f = this.facing;

    // Cut 1: high-back to low-front. Cut 2: low-front back up to high-front.
    this.scene.tweens.chain({
      targets: this.sword,
      tweens: [
        { angle: -60, duration: 40, ease: 'Quad.easeOut' },
        { angle: 150, duration: cut, ease: 'Expo.easeOut' },
        { angle: 160, duration: gap },
        { angle: -30, duration: cut, ease: 'Expo.easeOut' },
        { angle: rest.angle, duration: recover, ease: 'Quad.easeOut' },
      ],
    });
    // Reach: blade extended for both cuts.
    this.scene.tweens.chain({
      targets: this.sword,
      tweens: [
        { x: rest.x + 14, y: rest.y - 4, duration: 40, ease: 'Quad.easeOut' },
        { x: rest.x + 14, y: rest.y - 4, duration: cut * 2 + gap },
        { x: rest.x, y: rest.y, duration: recover, ease: 'Quad.easeOut' },
      ],
    });
    // Lunge a step forward on the first cut (skip if a dash is already moving us).
    if (!this.dashing) {
      const step = 22;
      this.scene.tweens.add({
        targets: this,
        x: this.x + Math.cos(direction) * step,
        y: this.y + Math.sin(direction) * step,
        duration: cut,
        ease: 'Expo.easeOut',
      });
    }
    // Body: lean into each cut.
    this.scene.tweens.chain({
      targets: this.bodySprite,
      tweens: [
        { scaleX: 1.12, scaleY: 0.94, duration: cut, ease: 'Expo.easeOut' },
        { scaleX: 0.96, scaleY: 1.04, duration: gap },
        { scaleX: 1.1, scaleY: 0.95, duration: cut, ease: 'Expo.easeOut' },
        { scaleX: 1, scaleY: 1, duration: recover, ease: 'Back.easeOut' },
      ],
    });

    // Two trails: diagonal down, then diagonal up (each ~110 degrees of arc).
    const arc = Phaser.Math.DegToRad(110);
    const at = { x: this.x, y: this.y };
    const origin = () => at;
    this.scene.time.delayedCall(40, () => {
      this.world.fx.sweepTrail(origin, range, direction - arc * 0.5 * f, arc * f, cut);
    });
    this.scene.time.delayedCall(40 + cut + gap, () => {
      this.world.fx.sweepTrail(origin, range * 0.92, direction + arc * 0.5 * f, -arc * f, cut, 0xffe066);
    });
    this.scene.cameras.main.shake(60, 0.002);
  }

  /**
   * Points the blade along a world direction (radians, plus an optional offset in
   * degrees) and holds it there. Sword angle 0 = blade up; a flipped container mirrors it.
   */
  pointSword(direction: number, offsetDeg = 0, ahead = 0): void {
    this.unsheatheSword(0);
    this.scene.tweens.killTweensOf(this.sword);
    this.setAttacking(1000);
    const deg = Phaser.Math.RadToDeg(direction) + offsetDeg;
    this.sword.setAngle(this.facing === 1 ? deg + 90 : 270 - deg);
    // Hold the grip `ahead` px along the direction (local x is mirrored when facing left).
    const ox = Math.cos(direction) * ahead * this.facing;
    const oy = Math.sin(direction) * ahead;
    this.sword.setPosition(this.rest.x + ox, this.rest.y + oy);
  }

  /** Returns the sword to its rest pose after pointSword(). */
  restSword(duration = 150): void {
    this.scene.tweens.killTweensOf(this.sword);
    this.setAttacking(duration);
    this.scene.tweens.add({
      targets: this.sword,
      ...this.rest,
      duration,
      ease: 'Quad.easeOut',
    });
  }

  /** Small weapon kick against `direction` (ranged shots). */
  recoil(direction: number, px = 5): void {
    this.scene.tweens.killTweensOf(this.sword);
    this.setAttacking(120);
    const ox = -Math.cos(direction) * px * this.facing;
    const oy = -Math.sin(direction) * px;
    this.sword.setPosition(this.rest.x + ox, this.rest.y + oy);
    this.scene.tweens.add({ targets: this.sword, x: this.rest.x, y: this.rest.y, duration: 120, ease: 'Quad.easeOut' });
  }

  /** Crouch/coil for a wind-up, then release. */
  brace(durationMs: number): void {
    this.scene.tweens.killTweensOf(this.bodySprite);
    this.scene.tweens.chain({
      targets: this.bodySprite,
      tweens: [
        { scaleX: 1.08, scaleY: 0.9, duration: durationMs * 0.8, ease: 'Quad.easeOut' },
        { scaleX: 1, scaleY: 1, duration: 120, ease: 'Back.easeOut' },
      ],
    });
  }

  /** Whole-body spin over `durationMs`. */
  spin(durationMs: number, turns = 2): void {
    this.scene.tweens.killTweensOf(this);
    this.setAngle(0);
    this.scene.tweens.add({
      targets: this,
      angle: 360 * turns * this.facing,
      duration: durationMs,
      ease: 'Sine.easeInOut',
      onComplete: () => this.setAngle(0),
    });
  }

  /** Snapshot broadcast to other players. */
  netState(id: string): PlayerState {
    return {
      t: 'state',
      id,
      x: Math.round(this.x),
      y: Math.round(this.y),
      f: this.facing,
      w: this.weapon.id,
      a: this.invulnerable ? 0 : +this.alpha.toFixed(2),
      r: Math.round(this.angle),
      s: { x: Math.round(this.sword.x), y: Math.round(this.sword.y), ang: Math.round(this.sword.angle) },
      hp: this.hp,
      al: this.alive,
      tr: this.netTrail,
      gh: this.netGhost,
      sh: this.netShield,
      sp: this.netSpin,
    };
  }

  /** World-space position of the blade tip (for trails). */
  swordTip(): { x: number; y: number } {
    const m = this.sword.getWorldTransformMatrix();
    const local = { x: 0, y: -this.sword.height * 0.85 };
    return m.transformPoint(local.x, local.y);
  }

  /** Instant movement to a point (clamped to the world). Blocks input until done. */
  dash(toX: number, toY: number, onComplete?: () => void, onUpdate?: () => void, opts: DashOptions = {}): void {
    this.clearCommands();
    this.body.setVelocity(0, 0);

    const halfW = this.bodySprite.width / 2;
    const halfH = this.bodySprite.height / 2;
    const tx = Phaser.Math.Clamp(toX, halfW, WORLD_WIDTH - halfW);
    const ty = Phaser.Math.Clamp(toY, halfH, WORLD_HEIGHT - halfH);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);

    if (dist < 1) {
      onComplete?.();
      return;
    }

    if (!opts.keepFacing) this.faceToward(tx);
    const duration = (dist / (opts.speed ?? PLAYER.dashSpeed)) * 1000;

    // Drive onUpdate from the scene tick (a tween's onUpdate fires once per
    // property, i.e. twice a frame with y lagging x - bad for trails).
    const events = this.scene.events;
    const tick = () => {
      if (!this.dashing) {
        events.off(Phaser.Scenes.Events.UPDATE, tick);
        return;
      }
      onUpdate?.();
    };
    if (onUpdate) events.on(Phaser.Scenes.Events.UPDATE, tick);

    this.dashTween = this.scene.tweens.add({
      targets: this,
      x: tx,
      y: ty,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.dashTween = null;
        events.off(Phaser.Scenes.Events.UPDATE, tick);
        onComplete?.();
      },
    });
  }

  // --- per-frame --------------------------------------------------------------

  update(deltaMs: number): void {
    const now = this.now;
    for (const ability of this.abilities) ability.update(now);

    if (!this.alive || this.dashing) return;

    if (this.attackMove) {
      this.updateAttackMove(deltaMs, now);
    } else if (this.pendingCast) {
      this.updatePendingCast(deltaMs);
    } else if (this.attackTarget) {
      this.updateAutoAttack(deltaMs, now);
    } else if (this.target) {
      this.moveToward(this.target.x, this.target.y, deltaMs);
    }
  }

  private updatePendingCast(deltaMs: number): void {
    const cast = this.pendingCast!;
    if (!cast.enemy.alive) {
      this.stop();
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, cast.enemy.x, cast.enemy.y);
    if (dist <= cast.range) {
      this.pendingCast = null;
      this.body.setVelocity(0, 0);
      cast.execute();
      return;
    }
    this.moveToward(cast.enemy.x, cast.enemy.y, deltaMs);
  }

  private updateAttackMove(deltaMs: number, now: number): void {
    const dest = this.attackMove!;

    if (!this.attackTarget?.alive) {
      this.attackTarget = this.nearestEnemy(this.weapon.aa.acquireRange);
    }
    if (this.attackTarget) {
      this.updateAutoAttack(deltaMs, now);
      return;
    }

    if (Phaser.Math.Distance.Between(this.x, this.y, dest.x, dest.y) <= PLAYER.arriveRadius) {
      this.stop();
      return;
    }
    this.moveToward(dest.x, dest.y, deltaMs);
  }

  private nearestEnemy(maxDist: number): Target | null {
    let best: Target | null = null;
    let bestDist = maxDist;
    for (const enemy of this.world.enemies) {
      if (!enemy.alive) continue;
      const d = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
      if (d < bestDist) {
        best = enemy;
        bestDist = d;
      }
    }
    return best;
  }

  private updateAutoAttack(deltaMs: number, now: number): void {
    const enemy = this.attackTarget!;
    if (!enemy.alive) {
      // Attack-move keeps going after a kill; a plain attack order ends here.
      if (this.attackMove) this.attackTarget = null;
      else this.stop();
      return;
    }

    const cfg = this.weapon.aa;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);

    if (dist > cfg.range) {
      this.moveToward(enemy.x, enemy.y, deltaMs);
      return;
    }

    this.body.setVelocity(0, 0);
    if (this.isAttacking || now < this.nextAttackAt) return;

    this.faceToward(enemy.x);
    this.nextAttackAt = now + cfg.cooldown;

    if (cfg.ranged) {
      // Bolt that homes only in the sense that it's aimed at the target's current spot.
      const direction = Phaser.Math.Angle.Between(this.x, this.y, enemy.x, enemy.y);
      this.recoil(direction);
      this.world.projectiles.fire(this.x, this.y, {
        texture: TEXTURES.bolt,
        size: 24,
        speed: CROSSBOW.aa.boltSpeed,
        range: cfg.range * 1.5,
        direction,
        onHit: (e) => {
          e.takeDamage(cfg.damage);
          return true;
        },
      });
      return;
    }

    this.swing();

    // Land the hit at the point of the slash. Guaranteed unless the target died meanwhile.
    this.scene.time.delayedCall(PLAYER.attackDuration * 0.45, () => {
      if (!enemy.alive) return;
      this.world.fx.circle(enemy.x, enemy.y, enemy.radius);
      enemy.takeDamage(cfg.damage);
    });
  }

  /** Steps toward (x, y) at walking speed; stops (and clears the ground target) on arrival. */
  private moveToward(x: number, y: number, deltaMs: number): void {
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.hypot(dx, dy);

    // Snap when within the arrive radius, or when this frame's step would overshoot.
    const speed = PLAYER.speed * this.speedMultiplier;
    const stepThisFrame = (speed * deltaMs) / 1000;
    if (dist <= Math.max(PLAYER.arriveRadius, stepThisFrame)) {
      this.setPosition(x, y);
      this.body.setVelocity(0, 0);
      this.target = null;
      return;
    }

    this.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);

    if (!this.isAttacking && Math.abs(dx) > 1) {
      this.setFacing(dx > 0 ? 1 : -1);
    }
  }

  private setFacing(dir: Facing): void {
    if (dir === this.facing) return;
    this.facing = dir;
    this.setScale(dir, 1);
  }
}
