/** Anything the player can attack: practice dummies and other players. */
export interface Target {
  x: number;
  y: number;
  alive: boolean;
  /** Rough collision radius for cone / segment / area tests. */
  radius: number;
  /** Apply damage. `remote` marks damage that originated from another player's client. */
  takeDamage(amount: number, remote?: boolean): void;
}

/** Data key on a clickable child sprite pointing back at its Target. */
export const TARGET_DATA_KEY = 'target';
