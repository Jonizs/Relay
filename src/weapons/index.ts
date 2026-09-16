import { BLADE } from '@/weapons/Blade';
import { CROSSBOWS } from '@/weapons/Crossbows';
import type { Weapon } from '@/weapons/Weapon';

export const WEAPONS: readonly Weapon[] = [BLADE, CROSSBOWS];

export function weaponById(id: string): Weapon {
  return WEAPONS.find((w) => w.id === id) ?? BLADE;
}
