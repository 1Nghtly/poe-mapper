const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: ipcRenderer.on.bind(ipcRenderer),
    send: ipcRenderer.send.bind(ipcRenderer)
  }
});