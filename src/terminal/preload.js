'use strict';
// What her terminal page may call, and what it may hear. The window is the only sender that counts.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminal', {
  init: () => ipcRenderer.invoke('terminal:init'),
  run: (text) => ipcRenderer.invoke('terminal:run', text),
  cancel: () => ipcRenderer.send('terminal:cancel'),
  hide: () => ipcRenderer.send('terminal:hide'),
  onChunk: (cb) => ipcRenderer.on('terminal:chunk', (_e, chunk) => cb(chunk)),
  onResult: (cb) => ipcRenderer.on('terminal:result', (_e, result) => cb(result)),
});
