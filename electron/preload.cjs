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

contextBridge.exposeInMainWorld('desktopAutoBackup', {
  getFolder: () => ipcRenderer.invoke('auto-backup:get-folder'),
  chooseFolder: () => ipcRenderer.invoke('auto-backup:choose-folder'),
  clearFolder: () => ipcRenderer.invoke('auto-backup:clear-folder'),
  write: (json) => ipcRenderer.invoke('auto-backup:write', json),
  reveal: () => ipcRenderer.invoke('auto-backup:reveal'),
})

// Antes de fechar a janela, o app grava o que falta (banco e backup automático).
contextBridge.exposeInMainWorld('desktopWindow', {
  onBeforeClose: (callback) => {
    const listener = () => Promise.resolve(callback()).catch(() => {}).finally(() => ipcRenderer.send('app:close-ready'))
    ipcRenderer.on('app:before-close', listener)
    return () => ipcRenderer.removeListener('app:before-close', listener)
  },
})
