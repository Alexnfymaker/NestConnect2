const { app, BrowserWindow, session, desktopCapturer, ipcMain, Notification, Tray, Menu } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: "NestConnect",
    icon: path.join(__dirname, 'public/assets/icon.ico'), // Ensure icon is loaded if exists
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
  tray = new Tray(path.join(__dirname, 'public/favicon.ico')); // Assuming favicon.ico exists
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show NestConnect', click: () => { mainWindow.show(); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('NestConnect');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.show();
  });

  // Set app to autostart on Windows
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe')
    });
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
