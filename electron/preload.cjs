const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopScanArchive', {
  getFolder: () => ipcRenderer.invoke('scan-archive:get-folder'),
  chooseFolder: () => ipcRenderer.invoke('scan-archive:choose-folder'),
  clearFolder: () => ipcRenderer.invoke('scan-archive:clear-folder'),
  save: (relativePath, bytes) => ipcRenderer.invoke('scan-archive:save', relativePath, bytes),
  read: (relativePath) => ipcRenderer.invoke('scan-archive:read', relativePath),
  open: (relativePath) => ipcRenderer.invoke('scan-archive:open', relativePath),
  reveal: (relativePath) => ipcRenderer.invoke('scan-archive:reveal', relativePath),
})
