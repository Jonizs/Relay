import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config/GameConfig';
import { BootScene } from '@/scenes/BootScene';
import { GameScene } from '@/scenes/GameScene';
import { UIScene } from '@/scenes/UIScene';
import { SettingsScene } from '@/scenes/SettingsScene';
import { WeaponsScene } from '@/scenes/WeaponsScene';
import { keepRunningInBackground } from '@/systems/BackgroundTicker';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0f0f14',
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      // Step with the render frame rather than a fixed 60 Hz; avoids judder on 120/144 Hz displays.
      fixedStep: false,
      debug: false,
    },
  },
  scene: [BootScene, GameScene, UIScene, SettingsScene, WeaponsScene],
};

const game = new Phaser.Game(config);
keepRunningInBackground(game);

// Expose for console debugging during development only.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
