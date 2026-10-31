const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const path = require('node:path')
const scanArchive = require('./scanArchive.cjs')

if (require('electron-squirrel-startup')) app.quit()

const appName = 'Corretor de Simulados'

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

app.setName(appName)

app.whenReady().then(() => {
  registerScanArchive()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
