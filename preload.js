const { contextBridge, ipcRenderer } = require('electron');

// Intercept Notification from web layer and forward to Electron native notifications
const originalNotification = window.Notification;

class ElectronNotification {
  constructor(title, options = {}) {
    ipcRenderer.send('desktop-notification', { title, options });
    return new originalNotification(title, options);
  }

  static requestPermission() {
    return originalNotification.requestPermission();
  }

  static get permission() {
    return originalNotification.permission;
  }
}

Object.defineProperty(window, 'Notification', {
  configurable: true,
  enumerable: true,
  value: ElectronNotification
});

contextBridge.exposeInMainWorld('electronBridge', {
  // When main process sends screen sources, show the picker overlay
  onShowScreenPicker: (callback) => {
    ipcRenderer.on('show-screen-picker', (event, sources) => {
      callback(sources);
    });
  },
  // Send selected screen ID back to main
  selectScreen: (sourceId) => {
    ipcRenderer.send('screen-picker-response', sourceId);
  },
  cancelScreenPicker: () => {
    ipcRenderer.send('screen-picker-response', null);
  },
  notify: (title, body) => {
    ipcRenderer.send('desktop-notification', { title, options: { body }});
  }
});