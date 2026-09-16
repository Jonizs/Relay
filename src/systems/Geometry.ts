import Phaser from 'phaser';

/** Distance from point P to the segment AB. */
export function distanceToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);

  const t = Phaser.Math.Clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1);
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

/** True if P is within `range` of the origin and within `halfAngle` (radians) of `direction`. */
export function inCone(
  px: number, py: number,
  ox: number, oy: number,
  direction: number, halfAngle: number, range: number,
  targetRadius = 0,
): boolean {
  const dist = Math.hypot(px - ox, py - oy);
  if (dist - targetRadius > range) return false;
  const angle = Math.atan2(py - oy, px - ox);
  return Math.abs(Phaser.Math.Angle.Wrap(angle - direction)) <= halfAngle;
}

/** Point at `distance` from (x, y) along `direction` (radians). */
export function project(x: number, y: number, direction: number, distance: number): { x: number; y: number } {
  return { x: x + Math.cos(direction) * distance, y: y + Math.sin(direction) * distance };
}
