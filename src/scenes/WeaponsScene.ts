import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from '@/config/GameConfig';
import type { Player } from '@/entities/Player';
import { normalizeKey } from '@/systems/Settings';
import { WEAPONS } from '@/weapons';

const PANEL_W = 620;
const ROW_H = 76;

/** Weapon picker overlay opened from the WEAPONS button. Click a row to equip. */
export class WeaponsScene extends Phaser.Scene {
  private ready = false;

  constructor() {
    super(SCENES.weapons);
  }

  create(): void {
    const player = this.registry.get('player') as Player | undefined;
    const cx = GAME_WIDTH / 2;
    const panelH = 96 + WEAPONS.length * ROW_H;
    const cy = GAME_HEIGHT / 2;
    const top = cy - panelH / 2;
    const left = cx - PANEL_W / 2;

    // Overlay: clicking outside the panel closes.
    this.add
      .rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
      .setInteractive()
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.scene.stop());
    this.add.rectangle(cx, cy, PANEL_W, panelH, 0x1a1d24).setStrokeStyle(2, 0x3a4050).setInteractive();

    this.add.text(left + 28, top + 22, 'Weapons', { fontFamily: 'monospace', fontSize: '28px', color: '#e8e8e8' });
    this.add
      .text(left + PANEL_W - 28, top + 30, 'Esc to close', { fontFamily: 'monospace', fontSize: '14px', color: '#9aa0ad' })
      .setOrigin(1, 0);

    WEAPONS.forEach((weapon, i) => {
      const y = top + 80 + i * ROW_H;
      const equipped = player?.weapon.id === weapon.id;

      const row = this.add
        .rectangle(cx, y + ROW_H / 2 - 6, PANEL_W - 56, ROW_H - 12, equipped ? 0x3a4255 : 0x2b3140)
        .setStrokeStyle(2, equipped ? 0xffe066 : 0x3a4050)
        .setInteractive({ useHandCursor: true });

      this.add.image(left + 64, y + ROW_H / 2 - 6, weapon.texture).setScale(1.4);
      this.add.text(left + 110, y + 12, weapon.name, { fontFamily: 'monospace', fontSize: '22px', color: '#e8e8e8' });
      this.add.text(left + 110, y + 40, weapon.className, { fontFamily: 'monospace', fontSize: '15px', color: '#9aa0ad' });
      if (equipped) {
        this.add
          .text(left + PANEL_W - 44, y + ROW_H / 2 - 6, 'EQUIPPED', { fontFamily: 'monospace', fontSize: '14px', color: '#ffe066' })
          .setOrigin(1, 0.5);
      }

      row.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => row.setFillStyle(0x3a4255));
      row.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => row.setFillStyle(equipped ? 0x3a4255 : 0x2b3140));
      row.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        player?.equipWeapon(weapon);
        this.scene.stop();
      });
    });

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (!this.ready) return;
      if (normalizeKey(event) === 'ESCAPE') this.scene.stop();
    });
  }

  update(): void {
    this.ready = true;
  }
}
