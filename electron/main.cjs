const { app, BrowserWindow } = require('electron')
const path = require('node:path')

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
    },
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== mainWindow.webContents.getURL()) event.preventDefault()
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.setName(appName)

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
