import { CrossbowE } from '@/abilities/crossbow/CrossbowE';
import { CrossbowQ } from '@/abilities/crossbow/CrossbowQ';
import { CrossbowR } from '@/abilities/crossbow/CrossbowR';
import { CrossbowW } from '@/abilities/crossbow/CrossbowW';
import { CROSSBOW, TEXTURES } from '@/config/GameConfig';
import type { Weapon } from '@/weapons/Weapon';

export const CROSSBOWS: Weapon = {
  id: 'crossbows',
  name: 'Dual Crossbows',
  className: 'Marksman',
  texture: TEXTURES.crossbow,
  aa: { ...CROSSBOW.aa, ranged: true },
  usesStacks: false,
  killRefundMs: 0,
  createAbilities: (p) => [new CrossbowQ(p), new CrossbowW(p), new CrossbowE(p), new CrossbowR(p)],
};
