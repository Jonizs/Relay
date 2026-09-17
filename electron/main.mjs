import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/** Dev by default (live Vite server + HMR). `--prod` loads the built dist/ instead. */
const useDist = process.argv.includes('--prod');

let viteServer = null;

async function resolveEntry() {
  if (useDist) {
    const indexHtml = path.join(projectRoot, 'dist', 'index.html');
    if (!existsSync(indexHtml)) {
      throw new Error(`dist/index.html not found – run "npm run build" first.`);
    }
    return { file: indexHtml };
  }

  const { createServer } = await import('vite');
  viteServer = await createServer({
    root: projectRoot,
    configFile: path.join(projectRoot, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 5173, strictPort: false, open: false },
  });
  await viteServer.listen();
  return { url: viteServer.resolvedUrls.local[0] };
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 420,
    title: '2DPIT',
    backgroundColor: '#0f0f14',
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep simulating (and broadcasting online) when the window is not focused.
      backgroundThrottling: false,
    },
  });

  // Open any external links in the system browser rather than inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Surface renderer errors in the terminal so they aren't lost in a hidden devtools.
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') console.error('[renderer]', event.message);
  });
  win.webContents.on('did-finish-load', () => {
    console.log('[2DPIT] loaded', win.webContents.getURL());
  });

  const entry = await resolveEntry();
  if (entry.url) {
    await win.loadURL(entry.url);
  } else {
    await win.loadFile(entry.file);
  }
}

app.whenReady().then(async () => {
  // No application menu: otherwise Alt toggles the hidden menu bar and resizes the view.
  Menu.setApplicationMenu(null);
  try {
    await createWindow();
  } catch (err) {
    console.error(err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', async () => {
  if (viteServer) await viteServer.close();
});
