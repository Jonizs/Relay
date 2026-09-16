import Phaser from 'phaser';
import type { Ability } from '@/abilities/Ability';
import { ABILITY_KEYS, COMBAT, SCENES, TEXTURES, WORLD_HEIGHT, WORLD_WIDTH } from '@/config/GameConfig';
import { ENEMY_DAMAGED_LOCAL, ENEMY_KILLED, Enemy } from '@/entities/Enemy';
import { PLAYER_DAMAGED_LOCAL, RemotePlayer } from '@/entities/RemotePlayer';
import { TARGET_DATA_KEY } from '@/entities/Target';
import type { Target } from '@/entities/Target';
import { Net } from '@/net/Net';
import type { NetMessage } from '@/net/Net';
import { Player } from '@/entities/Player';
import { CameraController } from '@/systems/CameraController';
import { Fx } from '@/systems/Fx';
import { ProjectileManager } from '@/systems/Projectiles';
import { normalizeKey, settings } from '@/systems/Settings';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private fx!: Fx;
  private projectiles!: ProjectileManager;
  private marker!: Phaser.GameObjects.Image;
  private cameraController!: CameraController;
  private net!: Net;
  private readonly remotes = new Map<string, RemotePlayer>();
  /** Peer id of whoever last damaged us (kill credit). */
  private lastAttacker = '';
  private netTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super(SCENES.game);
  }

  create(): void {
    this.createWorld();
    this.fx = new Fx(this);
    this.projectiles = new ProjectileManager(this);

    const cx = WORLD_WIDTH / 2;
    const cy = WORLD_HEIGHT / 2;
    this.enemies = [
      new Enemy(this, cx + 320, cy - 40, this.fx),
      new Enemy(this, cx + 480, cy + 160, this.fx),
      new Enemy(this, cx - 380, cy + 220, this.fx),
    ];

    const remotes = this.remotes;
    const dummies = this.enemies;
    this.player = new Player(this, cx, cy, {
      // Live view: dummies plus whoever is in the lobby right now.
      get enemies(): Target[] {
        return [...dummies, ...remotes.values()];
      },
      fx: this.fx,
      projectiles: this.projectiles,
    });
    this.registry.set('player', this.player);

    this.marker = this.add.image(0, 0, TEXTURES.marker).setVisible(false).setDepth(5);

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameraController = new CameraController(this, this.player);

    this.setupInput();
    this.setupNet();
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
    this.projectiles.update(delta, this.player.world.enemies);
    this.cameraController.update(delta);
    this.updateNet();
  }

  // --- online ---------------------------------------------------------------

  private setupNet(): void {
    this.net = new Net();
    this.registry.set('net', this.net);
    this.net.on('message', (msg: NetMessage) => this.onNetMessage(msg));
    this.net.on('status', () => this.publishNetStatus());
    this.net.start();

    // Broadcast our state on a timer (not the render loop) so a backgrounded tab
    // keeps sending at whatever rate the browser allows instead of freezing.
    this.netTimer = setInterval(() => {
      if (this.net.role === 'host' || this.net.role === 'client') this.net.send(this.player.netState(this.net.id));
    }, 50);
    this.fx.broadcast = (k, a) => this.net.send({ t: 'fx', id: this.net.id, k, a });

    // Damage we deal is broadcast so everyone's dummies stay roughly in sync.
    this.events.on(ENEMY_DAMAGED_LOCAL, (enemy: Enemy, amount: number) => {
      const e = this.enemies.indexOf(enemy);
      if (e !== -1) this.net.send({ t: 'hit', id: this.net.id, e, d: amount });
    });
    this.events.on(PLAYER_DAMAGED_LOCAL, (victim: RemotePlayer, amount: number) => {
      this.net.send({ t: 'pdmg', id: this.net.id, to: victim.peerId, d: amount });
    });
    this.player.on('died', () => {
      this.net.send({ t: 'killed', id: this.net.id, by: this.lastAttacker });
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.netTimer) clearInterval(this.netTimer);
      this.net.stop();
    });
    window.addEventListener('beforeunload', () => this.net.stop());
  }

  private updateNet(): void {
    const now = this.time.now;
    for (const [id, remote] of this.remotes) {
      remote.update(now);
      if (now - remote.lastSeen > 5000) {
        remote.destroy();
        this.remotes.delete(id);
        this.publishNetStatus();
      }
    }
  }

  private publishNetStatus(): void {
    this.registry.set('netStatus', { role: this.net.role, players: this.remotes.size + 1 });
  }

  private onNetMessage(msg: NetMessage): void {
    switch (msg.t) {
      case 'state': {
        if (msg.id === this.net.id) return;
        let remote = this.remotes.get(msg.id);
        if (!remote) {
          remote = new RemotePlayer(this, msg.id, msg.x, msg.y, this.fx);
          this.remotes.set(msg.id, remote);
          this.publishNetStatus();
        }
        remote.applyState(msg, this.time.now);
        break;
      }
      case 'fx': {
        if (msg.id !== this.net.id) this.fx.replay(msg.k, msg.a);
        break;
      }
      case 'hit': {
        const enemy = this.enemies[msg.e];
        if (enemy) enemy.takeDamage(msg.d, true);
        break;
      }
      case 'pdmg': {
        if (msg.to !== this.net.id) return;
        this.lastAttacker = msg.id;
        this.player.takeDamage(msg.d, true);
        break;
      }
      case 'killed': {
        // We got the kill: same reward as killing a dummy.
        if (msg.by === this.net.id && msg.id !== this.net.id) this.events.emit(ENEMY_KILLED, null);
        break;
      }
      case 'leave': {
        this.remotes.get(msg.id)?.destroy();
        this.remotes.delete(msg.id);
        this.publishNetStatus();
        break;
      }
    }
  }

  /** True while an overlay (settings / weapons) is open; gameplay input is ignored then. */
  private get settingsOpen(): boolean {
    return this.scene.isActive(SCENES.settings) || this.scene.isActive(SCENES.weapons);
  }

  private createWorld(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    this.add
      .tileSprite(0, 0, WORLD_WIDTH, WORLD_HEIGHT, TEXTURES.tile)
      .setOrigin(0, 0)
      .setDepth(-10);

    // World edge so the player can see where bounds are.
    this.add
      .rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
      .setOrigin(0, 0)
      .setStrokeStyle(4, 0x6b8f71)
      .setDepth(-9);
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();

    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
        if (this.settingsOpen) return;
        const { x, y } = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
        const enemy = this.enemyFrom(over);

        if (enemy) {
          this.player.attackEnemy(enemy);
          return;
        }

        this.player.setDestination(x, y);
        this.showMarker(x, y);
      },
    );

    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    // All keys are matched by name (event.key) so rebinding works at runtime and
    // the mapping is keyboard-layout independent. Esc opens settings; the
    // settings scene closes itself.
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = normalizeKey(event);
      if (key === 'ESCAPE') {
        if (!this.settingsOpen) this.scene.launch(SCENES.settings);
        return;
      }
      if (this.settingsOpen) return;

      const slot = (ABILITY_KEYS as readonly string[]).indexOf(key);
      if (slot !== -1) {
        this.onAbilityKey(this.player.abilities[slot]);
        return;
      }
      if (key === 'A') this.attackMoveToCursor();
      if (key === 'S') this.player.stop();
      if (key === settings.get('cameraLockKey')) this.cameraController.toggleLock();
    });
  }

  /** A: quick attack-move to the cursor (attacks the enemy under it directly if there is one). */
  private attackMoveToCursor(): void {
    const pointer = this.input.activePointer;
    const { x, y } = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const enemy = this.enemyFrom(this.input.hitTestPointer(pointer));

    if (enemy) {
      this.player.attackEnemy(enemy);
      return;
    }
    this.player.attackMoveTo(x, y);
    this.showMarker(x, y, 0xff5a5a);
  }

  /** Quick-cast: every ability fires immediately using the cursor's world position. */
  private onAbilityKey(ability: Ability): void {
    const pointer = this.input.activePointer;
    const { x, y } = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const enemy = this.enemyFrom(this.input.hitTestPointer(pointer)) ?? this.nearestEnemyTo(x, y, COMBAT.e.cursorLeniency);
    if (this.player.castLocked || (this.player.dashing && !ability.castableWhileBusy)) return;
    ability.tryCast({ x, y, enemy, now: this.time.now });
  }

  /** Closest living enemy within `maxDist` of a world point, for forgiving quick-casts. */
  private nearestEnemyTo(x: number, y: number, maxDist: number): Target | null {
    let best: Target | null = null;
    let bestDist = maxDist;
    for (const enemy of this.player.world.enemies) {
      if (!enemy.alive) continue;
      const d = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) - enemy.radius;
      if (d < bestDist) {
        best = enemy;
        bestDist = d;
      }
    }
    return best;
  }

  private enemyFrom(over: Phaser.GameObjects.GameObject[]): Target | null {
    for (const obj of over) {
      const target = obj.getData(TARGET_DATA_KEY) as Target | undefined;
      if (target?.alive) return target;
    }
    return null;
  }

  private showMarker(x: number, y: number, tint = 0xffffff): void {
    this.tweens.killTweensOf(this.marker);
    this.marker.setPosition(x, y).setVisible(true).setScale(1).setAlpha(1).setTint(tint);
    this.tweens.add({
      targets: this.marker,
      scale: 0.4,
      alpha: 0,
      duration: 450,
      ease: 'Quad.easeOut',
      onComplete: () => this.marker.setVisible(false),
    });
  }
}
