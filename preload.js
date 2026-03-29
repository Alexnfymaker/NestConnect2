const { contextBridge, ipcRenderer } = require('electron');

// Bridge for screen picker
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
  }
});