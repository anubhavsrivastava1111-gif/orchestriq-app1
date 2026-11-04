// OrchestrIQ desktop app (Windows, macOS, Linux).
//
// The window loads the live site, so login, AI calls and data behave exactly as on the web,
// and every website update reaches desktop users instantly without reinstalling.
// This file adds what a desktop app needs on top: one window, remembered size and position,
// links to other sites open in the normal browser, file exports get a Save dialog,
// microphone access for voice features, and an offline screen.

const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://orchestriq.gorakhai.com';
const APP_ORIGIN = new URL(APP_URL).origin;
// Login and password-reset pages that must stay inside the app window.
const IN_APP_HOSTS = [/^orchestriq\.gorakhai\.com$/, /\.supabase\.co$/];

let mainWindow = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function isInAppUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'blob:' || u.protocol === 'data:') return true;
    return u.protocol === 'https:' && IN_APP_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function openInBrowser(url) {
  try {
    const { protocol } = new URL(url);
    if (['https:', 'http:', 'mailto:'].includes(protocol)) shell.openExternal(url);
  } catch {
    /* ignore malformed links */
  }
}

// Remember window size/position between launches.
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return { width: 1440, height: 900 };
  }
}
function saveWindowState(win) {
  try {
    const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    /* non-critical */
  }
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width || 1440,
    height: state.height || 900,
    minWidth: 960,
    minHeight: 640,
    title: 'OrchestrIQ',
    backgroundColor: '#0C0F18',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => (mainWindow = null));

  const wc = mainWindow.webContents;

  // Links to other sites (LinkedIn share, docs, etc.) open in the user's browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (isInAppUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { backgroundColor: '#0C0F18', autoHideMenuBar: true },
      };
    }
    openInBrowser(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return; // offline screen
    if (!isInAppUrl(url)) {
      event.preventDefault();
      openInBrowser(url);
    }
  });

  // No internet (or site unreachable) → friendly offline screen with a retry button.
  wc.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 /* aborted, e.g. user navigated away */) return;
    if (validatedURL && validatedURL.startsWith('file://')) return;
    mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  });

  mainWindow.loadURL(APP_URL);
}

// ── Permissions & downloads ──────────────────────────────────────────────────
function configureSession() {
  const ses = session.defaultSession;
  const ALLOWED = new Set(['media', 'clipboard-sanitized-write', 'clipboard-read', 'notifications', 'fullscreen']);

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = (() => {
      try { return new URL(details.requestingUrl || wc.getURL()).origin; } catch { return ''; }
    })();
    callback(origin === APP_ORIGIN && ALLOWED.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return requestingOrigin === APP_ORIGIN && ALLOWED.has(permission);
  });

  // Exports (Excel, Word, PDF, CSV, images) → standard "Save as" dialog, starting in Downloads.
  ses.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
    });
  });
}

// ── Menu ─────────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const nav = (fn) => () => mainWindow && fn(mainWindow.webContents);
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: nav((wc) => wc.loadURL(APP_URL)) },
        { label: 'Open in Browser', click: () => mainWindow && openInBrowser(mainWindow.webContents.getURL()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: nav((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
        { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: nav((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'OrchestrIQ Website', click: () => openInBrowser(APP_URL) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    configureSession();
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
