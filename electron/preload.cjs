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

// Pasta do scanner: arquivos novos são corrigidos sozinhos.
contextBridge.exposeInMainWorld('desktopScannerInbox', {
  status: () => ipcRenderer.invoke('scanner-inbox:status'),
  chooseFolder: () => ipcRenderer.invoke('scanner-inbox:choose-folder'),
  clearFolder: () => ipcRenderer.invoke('scanner-inbox:clear-folder'),
  setAuto: (auto) => ipcRenderer.invoke('scanner-inbox:set-auto', auto),
  read: (name) => ipcRenderer.invoke('scanner-inbox:read', name),
  markSeen: (keys) => ipcRenderer.invoke('scanner-inbox:mark-seen', keys),
  reveal: () => ipcRenderer.invoke('scanner-inbox:reveal'),
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

contextBridge.exposeInMainWorld('desktopUpdates', {
  getState: () => ipcRenderer.invoke('updates:state'),
  check: () => ipcRenderer.invoke('updates:check'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('updates:state', listener)
    return () => ipcRenderer.removeListener('updates:state', listener)
  },
})

// Compartilhamento somente leitura na rede local.
contextBridge.exposeInMainWorld('desktopLanShare', {
  getStatus: () => ipcRenderer.invoke('lan-share:status'),
  start: () => ipcRenderer.invoke('lan-share:start'),
  stop: () => ipcRenderer.invoke('lan-share:stop'),
  regenerateCode: () => ipcRenderer.invoke('lan-share:regenerate-code'),
  publish: (json) => ipcRenderer.invoke('lan-share:publish', json),
})
