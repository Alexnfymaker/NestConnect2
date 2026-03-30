const { app, BrowserWindow, session, desktopCapturer, ipcMain, Notification, Tray, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

function resolveIcon(...parts) {
  const fullPath = path.join(__dirname, ...parts);
  return fs.existsSync(fullPath) ? fullPath : null;
}

let mainWindow;
let tray;

function createWindow() {
  const windowIcon = resolveIcon('public', 'assets', 'icon.ico') || resolveIcon('public', 'favicon.ico') || undefined;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: "NestConnect",
    icon: windowIcon,
    backgroundColor: '#0a0a0a',
    show: false, // Don't show until ready
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false // Important for background call/message handling
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle close to minimize to tray instead of quit
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Chrome-like UA so WebRTC APIs are fully available
  mainWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  );

  // Load the hosted app
  mainWindow.loadURL('https://nestconnect2-production.up.railway.app/');

  // ── Permissions: allow mic, camera, display-capture, notifications ──
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const allowed = ['media', 'camera', 'microphone', 'display-capture', 'mediaKeySystem', 'geolocation', 'notifications', 'fullscreen'];
    return allowed.includes(permission);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'camera', 'microphone', 'display-capture', 'mediaKeySystem', 'notifications', 'fullscreen'];
    callback(allowed.includes(permission));
  });

  // ── Screen Share Picker via desktopCapturer ──
  // When the page calls getDisplayMedia, we intercept and provide a native picker
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 } }).then((sources) => {
      // Show a native window picker dialog using the preload bridge
      // Send sources to renderer via IPC so user can pick
      mainWindow.webContents.send('show-screen-picker', sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL()
      })));

      // Listen for the picker response from renderer
      ipcMain.once('screen-picker-response', (event, sourceId) => {
        if (!sourceId) {
          callback({ video: null });
          return;
        }
        const chosen = sources.find(s => s.id === sourceId);
        if (chosen) {
          callback({ video: chosen, audio: 'loopback' });
        } else {
          callback({ video: null });
        }
      });
    });
  }, { useSystemPicker: false });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.alexnfymaker.nestconnect');
  }

  createWindow();

  // Create tray icon
  const trayIconPath = resolveIcon('public', 'favicon.ico') || resolveIcon('public', 'assets', 'icon.ico');
  if (trayIconPath) {
    tray = new Tray(trayIconPath);
  } else {
    tray = new Tray(process.platform === 'win32' ? path.join(app.getAppPath(), 'resources', 'app', 'public', 'favicon.ico') : undefined);
  }
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show NestConnect', click: () => { mainWindow.show(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('NestConnect');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.show();
  });

  // Set app to autostart on startup (Windows + macOS)
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe'),
      args: ['--hidden']
    });

    const loginItemSettings = app.getLoginItemSettings();
    console.log('Auto-start login item settings:', loginItemSettings);
  }

  if (process.platform === 'linux') {
    // Linux: app.setLoginItemSettings is unsupported; you can integrate with .desktop file in ~/.config/autostart
    console.log('Auto-start setup suggested for Linux via ~/.config/autostart');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Native notification bridge from renderer to OS
ipcMain.on('desktop-notification', (event, { title, options }) => {
  if (Notification.isSupported()) {
    const n = new Notification({
      title: title || 'NestConnect',
      body: options && options.body ? options.body : '',
      icon: options && options.icon ? options.icon : path.join(__dirname, 'public/favicon.ico')
    });
    n.show();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running with dock icon
  if (process.platform !== 'darwin') {
    // On Windows/Linux, app stays in tray
  }
});

process.on('unhandledRejection', (reason) => {
  console.warn('Unhandled Promise Rejection:', reason);
});
