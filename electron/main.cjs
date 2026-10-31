const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const scanArchive = require('./scanArchive.cjs')
const autoBackup = require('./autoBackup.cjs')
const updater = require('./updater.cjs')

if (require('electron-squirrel-startup')) app.quit()

const appName = 'Corretor de Simulados'

// Dá ao app até 5 s para gravar o banco e o backup automático antes de fechar
// a janela (ou de instalar uma atualização).
function flushWindow(window) {
  if (window.isDestroyed() || window.flushed) return Promise.resolve()
  if (window.flushing) return window.flushing
  window.flushing = new Promise((resolve) => {
    const done = () => { window.flushed = true; resolve() }
    const listener = (event) => { if (event.sender === window.webContents) { ipcMain.removeListener('app:close-ready', listener); done() } }
    ipcMain.on('app:close-ready', listener)
    setTimeout(() => { ipcMain.removeListener('app:close-ready', listener); done() }, 5000)
    window.webContents.send('app:before-close')
  })
  return window.flushing
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    title: appName,
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    show: false,
    backgroundColor: '#f5f7f4',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== mainWindow.webContents.getURL()) event.preventDefault()
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (event) => {
    if (mainWindow.flushed) return
    event.preventDefault()
    flushWindow(mainWindow).then(() => { if (!mainWindow.isDestroyed()) mainWindow.destroy() })
  })
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function registerScanArchive() {
  const userData = () => app.getPath('userData')
  ipcMain.handle('scan-archive:get-folder', () => scanArchive.readFolder(userData()))
  ipcMain.handle('scan-archive:choose-folder', async (event) => {
    const current = await scanArchive.readFolder(userData())
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Pasta das folhas escaneadas',
      buttonLabel: 'Usar esta pasta',
      defaultPath: current || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return current
    await scanArchive.writeFolder(userData(), result.filePaths[0])
    return result.filePaths[0]
  })
  ipcMain.handle('scan-archive:clear-folder', async () => {
    await scanArchive.writeFolder(userData(), null)
    return null
  })
  ipcMain.handle('scan-archive:save', (_event, relativePath, bytes) => scanArchive.saveFile(userData(), relativePath, bytes))
  ipcMain.handle('scan-archive:read', (_event, relativePath) => scanArchive.readFile(userData(), relativePath))
  ipcMain.handle('scan-archive:open', async (_event, relativePath) => {
    const error = await shell.openPath(await scanArchive.fullPath(userData(), relativePath))
    if (error) throw new Error(error)
  })
  ipcMain.handle('scan-archive:reveal', async (_event, relativePath) => {
    shell.showItemInFolder(await scanArchive.fullPath(userData(), relativePath))
  })
}

function registerUpdates() {
  ipcMain.handle('updates:state', () => updater.getState())
  ipcMain.handle('updates:check', () => { updater.check(); return updater.getState() })
  updater.start({ beforeInstall: () => Promise.all(BrowserWindow.getAllWindows().map(flushWindow)) })
}

function registerAutoBackup() {
  const userData = () => app.getPath('userData')
  ipcMain.handle('auto-backup:get-folder', () => autoBackup.readFolder(userData()))
  ipcMain.handle('auto-backup:choose-folder', async (event) => {
    const current = await autoBackup.readFolder(userData())
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Pasta do backup automático',
      buttonLabel: 'Usar esta pasta',
      defaultPath: current || app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return current
    await autoBackup.writeFolder(userData(), result.filePaths[0])
    return result.filePaths[0]
  })
  ipcMain.handle('auto-backup:clear-folder', async () => {
    await autoBackup.writeFolder(userData(), null)
    return null
  })
  ipcMain.handle('auto-backup:write', (_event, json) => autoBackup.writeBackup(userData(), json))
  ipcMain.handle('auto-backup:reveal', async () => {
    const folder = await autoBackup.readFolder(userData())
    if (folder) await shell.openPath(folder)
  })
}

app.setName(appName)

app.whenReady().then(() => {
  registerScanArchive()
  registerAutoBackup()
  registerUpdates()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
