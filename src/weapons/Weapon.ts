import type { Ability } from '@/abilities/Ability';
import type { Player } from '@/entities/Player';

export interface AutoAttackConfig {
  range: number;
  damage: number;
  cooldown: number;
  acquireRange: number;
  /** Ranged auto-attacks fire a bolt instead of swinging. */
  ranged: boolean;
}

export interface Weapon {
  id: string;
  name: string;
  className: string;
  /** Texture drawn in the player's hand. */
  texture: string;
  aa: AutoAttackConfig;
  /** Whether the weapon builds Q stacks (shown as pips in the HUD). */
  usesStacks: boolean;
  /** Cooldown taken off every ability when the player kills an enemy (0 = none). */
  killRefundMs: number;
  createAbilities(player: Player): Ability[];
}
