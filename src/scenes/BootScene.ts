import Phaser from 'phaser';
import { SCENES, TEXTURES, TILE_SIZE } from '@/config/GameConfig';

/**
 * Generates placeholder textures at runtime so the project runs with zero art assets.
 * Swap these for real spritesheets in `preload()` later without touching gameplay code.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    // Real assets (spritesheets, tilemaps, audio) go here.
  }

  create(): void {
    this.makePlayerTexture();
    this.makeSwordTexture();
    this.makeDummyTexture();
    this.makeCrossbowTexture();
    this.makeBoltTexture();
    this.makeBulletTexture();
    this.makeTileTexture();
    this.makeMarkerTexture();

    this.scene.start(SCENES.game);
    this.scene.launch(SCENES.ui);
  }

  private makePlayerTexture(): void {
    const g = this.add.graphics();
    const w = 40;
    const h = 56;

    // Body (fill + outline first so the head covers the body's top edge)
    g.fillStyle(0x4a90e2, 1);
    g.fillRoundedRect(4, 18, w - 8, h - 18, 8);
    g.lineStyle(2, 0x1c3a5e, 1);
    g.strokeRoundedRect(4, 18, w - 8, h - 18, 8);
    // Head
    g.fillStyle(0xf5d0a9, 1);
    g.fillCircle(w / 2, 14, 12);
    g.lineStyle(2, 0x1c3a5e, 1);
    g.strokeCircle(w / 2, 14, 12);
    // Eye (marks the facing direction)
    g.fillStyle(0x222222, 1);
    g.fillCircle(w / 2 + 5, 11, 2);

    g.generateTexture(TEXTURES.player, w, h);
    g.destroy();
  }

  private makeSwordTexture(): void {
    const g = this.add.graphics();
    const w = 12;
    const blade = 43; // was 36; +20%
    const h = blade + 26;

    // Blade
    g.fillStyle(0xdfe6ee, 1);
    g.fillRect(4, 0, 4, blade);
    g.fillTriangle(4, 0, 8, 0, 6, -4);
    // Crossguard
    g.fillStyle(0xc9a227, 1);
    g.fillRect(0, blade, w, 4);
    // Grip
    g.fillStyle(0x5b3a1e, 1);
    g.fillRect(4, blade + 4, 4, 14);
    // Pommel
    g.fillStyle(0xc9a227, 1);
    g.fillCircle(6, blade + 22, 3);

    g.generateTexture(TEXTURES.sword, w, h);
    g.destroy();
  }

  private makeDummyTexture(): void {
    const g = this.add.graphics();
    const w = 48;
    const h = 64;
    // Post
    g.fillStyle(0x6b4a2b, 1);
    g.fillRect(w / 2 - 4, 30, 8, h - 30);
    // Torso
    g.fillStyle(0xc0554f, 1);
    g.fillRoundedRect(6, 18, w - 12, 30, 6);
    // Head
    g.fillStyle(0xd9a066, 1);
    g.fillCircle(w / 2, 12, 11);
    // Outline
    g.lineStyle(2, 0x3a1f1c, 1);
    g.strokeRoundedRect(6, 18, w - 12, 30, 6);
    g.strokeCircle(w / 2, 12, 11);
    g.generateTexture(TEXTURES.dummy, w, h);
    g.destroy();
  }

  private makeCrossbowTexture(): void {
    const g = this.add.graphics();
    const w = 30;
    const h = 22;
    // Stock
    g.fillStyle(0x5b3a1e, 1);
    g.fillRect(4, 9, 22, 5);
    // Bow limbs (curved)
    g.lineStyle(3, 0x3a2a1a, 1);
    g.beginPath();
    g.arc(22, 11, 9, Phaser.Math.DegToRad(-100), Phaser.Math.DegToRad(100), false);
    g.strokePath();
    // String
    g.lineStyle(1, 0xdfe6ee, 1);
    g.lineBetween(22, 2, 22, 20);
    // Bolt on the rail
    g.fillStyle(0xdfe6ee, 1);
    g.fillRect(12, 10, 16, 2);
    g.generateTexture(TEXTURES.crossbow, w, h);
    g.destroy();
  }

  private makeBoltTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xdfe6ee, 1);
    g.fillRect(0, 2, 18, 2);
    g.fillTriangle(18, 0, 24, 3, 18, 6);
    g.fillStyle(0xc9a227, 1);
    g.fillRect(0, 1, 4, 4);
    g.generateTexture(TEXTURES.bolt, 24, 6);
    g.destroy();
  }

  private makeBulletTexture(): void {
    const g = this.add.graphics();
    const r = 32;
    g.fillStyle(0xffe066, 0.25);
    g.fillCircle(r, r, r);
    g.fillStyle(0xffe066, 0.7);
    g.fillCircle(r, r, r * 0.7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(r, r, r * 0.35);
    g.generateTexture(TEXTURES.bullet, r * 2, r * 2);
    g.destroy();
  }

  private makeTileTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0x2b3a2e, 1);
    g.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    g.lineStyle(1, 0x34463a, 1);
    g.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
    // A little noise so movement is readable
    g.fillStyle(0x324536, 1);
    g.fillRect(12, 20, 6, 6);
    g.fillRect(40, 44, 4, 4);
    g.fillRect(48, 10, 5, 5);
    g.generateTexture(TEXTURES.tile, TILE_SIZE, TILE_SIZE);
    g.destroy();
  }

  private makeMarkerTexture(): void {
    const g = this.add.graphics();
    g.lineStyle(3, 0xffe066, 1);
    g.strokeCircle(16, 16, 12);
    g.fillStyle(0xffe066, 1);
    g.fillCircle(16, 16, 3);
    g.generateTexture(TEXTURES.marker, 32, 32);
    g.destroy();
  }
}
