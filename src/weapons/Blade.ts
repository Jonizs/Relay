import { EAbility } from '@/abilities/EAbility';
import { QAbility } from '@/abilities/QAbility';
import { RAbility } from '@/abilities/RAbility';
import { WAbility } from '@/abilities/WAbility';
import { COMBAT, TEXTURES } from '@/config/GameConfig';
import type { Weapon } from '@/weapons/Weapon';

export const BLADE: Weapon = {
  id: 'blade',
  name: 'Blade',
  className: 'Assassin',
  texture: TEXTURES.sword,
  aa: { ...COMBAT.aa, ranged: false },
  usesStacks: true,
  killRefundMs: COMBAT.killCooldownRefundMs,
  createAbilities: (p) => [new QAbility(p), new WAbility(p), new EAbility(p), new RAbility(p)],
};
