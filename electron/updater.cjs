const { app, autoUpdater, dialog, BrowserWindow } = require('electron')

// Atualização automática pelas Releases do GitHub, via update.electronjs.org.
// Só funciona no app instalado pelo Setup.exe (Squirrel, Windows); no modo de
// teste (npm run desktop) não faz nada.
const REPOSITORY = 'gustavoverneck/corretor-simulado'
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

let state = { status: 'idle', version: null, error: null }
let started = false

function supported() {
  return app.isPackaged && process.platform === 'win32'
}

function setState(next) {
  state = { ...state, ...next }
  BrowserWindow.getAllWindows().forEach((window) => window.webContents.send('updates:state', state))
}

function check() {
  if (!supported() || state.status === 'downloading' || state.status === 'ready') return state
  setState({ status: 'checking', error: null })
  try { autoUpdater.checkForUpdates() } catch (error) { setState({ status: 'error', error: error.message }) }
  return state
}

function start({ beforeInstall }) {
  if (started || !supported()) return
  started = true
  autoUpdater.setFeedURL({ url: `https://update.electronjs.org/${REPOSITORY}/${process.platform}-${process.arch}/${app.getVersion()}` })
  autoUpdater.on('update-available', () => setState({ status: 'downloading' }))
  autoUpdater.on('update-not-available', () => setState({ status: 'current' }))
  autoUpdater.on('error', (error) => setState({ status: 'error', error: error?.message || String(error) }))
  autoUpdater.on('update-downloaded', async (_event, releaseNotes, releaseName) => {
    setState({ status: 'ready', version: releaseName || null })
    const window = BrowserWindow.getAllWindows()[0]
    const { response } = await dialog.showMessageBox(window, {
      type: 'info',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização pronta',
      message: `Uma nova versão${releaseName ? ` (${releaseName})` : ''} do Corretor de Simulados foi baixada.`,
      detail: 'Reinicie para usar a nova versão. Seus dados ficam guardados. Se escolher "Depois", ela é instalada quando você fechar o app.',
    })
    if (response === 0) {
      await beforeInstall()
      autoUpdater.quitAndInstall()
    }
  })
  setTimeout(check, 10 * 1000)
  setInterval(check, CHECK_EVERY_MS)
}

module.exports = {
  start,
  check,
  getState: () => ({ ...state, supported: supported(), currentVersion: app.getVersion() }),
}
