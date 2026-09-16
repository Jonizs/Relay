import Phaser from 'phaser';
import { ABILITY_KEYS, COMBAT, GAME_HEIGHT, GAME_WIDTH, SCENES } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';
import { settings } from '@/systems/Settings';

const HUD = {
  radius: 36,
  spacing: 96,
  bottomMargin: 64,
} as const;

/** Runs in parallel with GameScene; HUD elements live here so they ignore the world camera. */
export class UIScene extends Phaser.Scene {
  private cooldownGfx!: Phaser.GameObjects.Graphics;
  private cooldownTexts: Phaser.GameObjects.Text[] = [];
  private chargeTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SCENES.ui);
  }

  create(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#e8e8e8',
      backgroundColor: '#00000088',
      padding: { x: 10, y: 6 },
    };

    this.add.text(12, 12, 'Relay - closed beta', style);

    const online = this.add.text(12, 52, 'ONLINE: connecting...', style);
    const renderOnline = () => {
      const st = this.registry.get('netStatus') as { role: string; players: number } | undefined;
      if (!st) return;
      const label = st.role === 'host' ? 'hosting' : st.role === 'client' ? 'joined' : st.role;
      online.setText(`ONLINE: ${label}  -  ${st.players} player${st.players === 1 ? '' : 's'}`);
    };
    this.registry.events.on('changedata-netStatus', renderOnline);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.registry.events.off('changedata-netStatus', renderOnline));

    const help = this.add.text(GAME_WIDTH - 12, 52, '', style).setOrigin(1, 0);
    const refresh = () => {
      const lock = settings.get('cameraLocked') ? 'locked' : 'unlocked';
      help.setText(
        `Click: move / attack   A: attack-move   S: stop   Q/W/E/R: abilities   ${settings.get('cameraLockKey')}: camera ${lock}   Space: centre   Esc: settings`,
      );
    };
    refresh();
    settings.on('change', refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => settings.off('change', refresh));

    this.createCooldownHud();
    this.createDevModeButton();
    this.createWeaponsButton();
  }

  /** Top-centre button opening the weapon picker. */
  private createWeaponsButton(): void {
    const btn = this.add
      .text(GAME_WIDTH / 2, 14, 'WEAPONS', {
        fontFamily: 'monospace',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#e8e8e8',
        backgroundColor: '#000000aa',
        padding: { x: 18, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });

    const render = () => {
      const player = this.registry.get('player') as Player | undefined;
      btn.setText(player ? `WEAPONS  -  ${player.weapon.name} (${player.weapon.className})` : 'WEAPONS');
    };
    render();
    settings.on('change', render);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => settings.off('change', render));
    this.time.delayedCall(0, render);

    btn.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => btn.setBackgroundColor('#3a4255'));
    btn.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => btn.setBackgroundColor('#000000aa'));
    btn.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.input.stopPropagation();
      if (!this.scene.isActive(SCENES.weapons)) this.scene.launch(SCENES.weapons);
    });
  }

  update(): void {
    const player = this.registry.get('player') as Player | undefined;
    if (!player) return;
    this.drawCooldowns(player);
  }

  /** Toggle on the left edge. Clicks here must not fall through to the game as move orders. */
  private createDevModeButton(): void {
    const btn = this.add
      .text(12, GAME_HEIGHT / 2, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });

    const render = () => {
      const on = settings.get('devMode');
      btn.setText(on ? 'DEV MODE: ON' : 'DEV MODE: OFF');
      btn.setColor(on ? '#0f0f14' : '#e8e8e8');
      btn.setBackgroundColor(on ? '#ffe066' : '#000000aa');
    };
    render();

    btn.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      settings.set('devMode', !settings.get('devMode'));
      this.input.stopPropagation();
    });

    settings.on('change', render);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => settings.off('change', render));
  }

  private slotCenter(i: number): { x: number; y: number } {
    return {
      x: GAME_WIDTH / 2 + (i - (ABILITY_KEYS.length - 1) / 2) * HUD.spacing,
      y: GAME_HEIGHT - HUD.bottomMargin,
    };
  }

  private createCooldownHud(): void {
    this.cooldownGfx = this.add.graphics();

    ABILITY_KEYS.forEach((key, i) => {
      const { x, y } = this.slotCenter(i);

      this.add
        .text(x, y + HUD.radius + 14, key, { fontFamily: 'monospace', fontSize: '18px', color: '#e8e8e8' })
        .setOrigin(0.5);

      this.cooldownTexts.push(
        this.add
          .text(x, y, '', { fontFamily: 'monospace', fontSize: '24px', fontStyle: 'bold', color: '#ffffff' })
          .setOrigin(0.5),
      );

      this.chargeTexts.push(
        this.add
          .text(x + HUD.radius - 6, y - HUD.radius + 6, '', {
            fontFamily: 'monospace',
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#ffe066',
            backgroundColor: '#000000aa',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5),
      );
    });
  }

  /** Q-stack pips centred above the ability row. */
  private drawStacks(player: Player): void {
    const g = this.cooldownGfx;
    const max = COMBAT.stacks.max;
    const pipR = 7;
    const gap = 24;
    const y = GAME_HEIGHT - HUD.bottomMargin - HUD.radius - 26;
    const x0 = GAME_WIDTH / 2 - ((max - 1) * gap) / 2;

    for (let i = 0; i < max; i++) {
      const x = x0 + i * gap;
      const lit = i < player.stacks;
      g.fillStyle(lit ? 0xffe066 : 0x1a1d24, lit ? 1 : 0.85);
      g.fillCircle(x, y, pipR);
      g.lineStyle(2, lit ? 0xfff3b0 : 0x555b6b, 1);
      g.strokeCircle(x, y, pipR);
    }
    if (player.stacksFull) {
      g.lineStyle(2, 0xffe066, 0.8);
      g.strokeRoundedRect(x0 - pipR - 8, y - pipR - 6, (max - 1) * gap + pipR * 2 + 16, pipR * 2 + 12, 8);
    }
  }

  private drawCooldowns(player: Player): void {
    const g = this.cooldownGfx;
    const now = this.time.now;
    const r = HUD.radius;
    const top = Phaser.Math.DegToRad(-90);

    g.clear();
    if (player.weapon.usesStacks) this.drawStacks(player);

    player.abilities.forEach((ability, i) => {
      const { x, y } = this.slotCenter(i);
      const info = ability.hud(now);
      const onCooldown = info.fraction > 0;

      // Base disc
      g.fillStyle(onCooldown ? 0x2a2e38 : 0x1a1d24, 0.92);
      g.fillCircle(x, y, r);

      // Cooldown sweep (clockwise from 12 o'clock, shrinking as it recovers)
      if (onCooldown) {
        g.fillStyle(0x000000, 0.6);
        g.slice(x, y, r, top, top + Math.PI * 2 * info.fraction, false);
        g.fillPath();
      }

      // Rim
      g.lineStyle(3, onCooldown ? 0x555b6b : 0xffe066, 1);
      g.strokeCircle(x, y, r);

      // Re-cast window countdown (R) as an outer red arc
      if (info.windowFraction !== undefined) {
        g.lineStyle(4, 0xff3b3b, 1);
        g.beginPath();
        g.arc(x, y, r + 7, top, top + Math.PI * 2 * info.windowFraction, false);
        g.strokePath();
      }

      const secs = info.remainingMs / 1000;
      this.cooldownTexts[i].setText(secs > 0 ? (secs < 10 ? secs.toFixed(1) : Math.ceil(secs).toString()) : '');
      this.chargeTexts[i].setText(info.charges !== undefined ? String(info.charges) : '').setVisible(info.charges !== undefined);
    });
  }
}
