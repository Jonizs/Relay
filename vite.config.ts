import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Relative base so the build works both on GitHub Pages (/Relay/) and when Electron loads dist/ from disk.
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
    // Quick tunnels (cloudflared) get a random *.trycloudflare.com host each run.
    allowedHosts: ['.trycloudflare.com'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep Phaser in its own chunk so app code rebuilds stay small.
        advancedChunks: {
          groups: [{ name: 'phaser', test: /node_modules[\/]phaser/ }],
        },
      },
    },
  },
});
