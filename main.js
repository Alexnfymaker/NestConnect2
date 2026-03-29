const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "NestConnect",
    backgroundColor: '#0a0a0a',
    fullscreen: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
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
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
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
  createWindow();

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
