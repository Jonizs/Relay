import type Phaser from 'phaser';

/**
 * Keeps the game simulating while the tab is hidden (alt-tabbed).
 *
 * Browsers stop requestAnimationFrame for hidden tabs and throttle page timers,
 * so Phaser's loop freezes. Dedicated Worker timers are not throttled the same
 * way, so a worker posts a message every ~16 ms and we step the game manually.
 * Rendering to the hidden canvas is cheap; input can't arrive anyway, but
 * queued commands (walking, auto-attack, dashes, cooldowns, projectiles, the
 * online broadcast) all keep going.
 */
export function keepRunningInBackground(game: Phaser.Game, intervalMs = 16): void {
  const source = `
    let id = null;
    onmessage = (e) => {
      if (e.data === 'start' && id === null) id = setInterval(() => postMessage(0), ${intervalMs});
      if (e.data === 'stop' && id !== null) { clearInterval(id); id = null; }
    };
  `;
  let worker: Worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'application/javascript' })));
  } catch {
    return; // No worker support: fall back to the browser's default behaviour.
  }

  worker.onmessage = () => {
    if (document.hidden) game.loop.tick();
  };

  const sync = () => worker.postMessage(document.hidden ? 'start' : 'stop');
  document.addEventListener('visibilitychange', sync);
  sync();
}
