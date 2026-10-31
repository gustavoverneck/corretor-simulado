// Backup automático do app desktop: depois de cada alteração, grava uma cópia
// completa do banco na pasta escolhida, no máximo uma vez a cada intervalo, e
// grava a última versão ao fechar o app.
import { createBackup } from './backup.js'

export const AUTO_BACKUP_INTERVAL_MS = 5 * 60 * 1000

function bridge() {
  return typeof window !== 'undefined' ? window.desktopAutoBackup || null : null
}

export function isAutoBackupSupported() {
  return Boolean(bridge())
}

function cleanError(error) {
  const message = String(error?.message || error || '')
  return new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Não foi possível gravar o backup automático.')
}

async function call(method, ...args) {
  const api = bridge()
  if (!api) throw new Error('O backup automático só está disponível no aplicativo desktop.')
  try {
    return await api[method](...args)
  } catch (error) {
    throw cleanError(error)
  }
}

export const getAutoBackupFolder = () => (bridge() ? call('getFolder') : Promise.resolve(null))
export const chooseAutoBackupFolder = () => call('chooseFolder')
export const clearAutoBackupFolder = () => call('clearFolder')
export const openAutoBackupFolder = () => call('reveal')
export const writeAutoBackup = (data, date = new Date()) => call('write', JSON.stringify(createBackup(data, date)))

// Agenda as gravações: a primeira alteração grava logo; as seguintes esperam
// completar o intervalo desde a última gravação. `write` devolve uma Promise.
export function createAutoBackupScheduler({ write, interval = AUTO_BACKUP_INTERVAL_MS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, onSaved = () => {}, onError = () => {} }) {
  let latest = null
  let lastWriteAt = -Infinity
  let timer = null
  let running = Promise.resolve()

  function run() {
    if (timer) { clearTimer(timer); timer = null }
    if (!latest) return running
    const snapshot = latest
    latest = null
    lastWriteAt = now()
    running = running.then(() => write(snapshot)).then((result) => { if (result) onSaved(result) }, onError)
    return running
  }

  return {
    changed(data) {
      latest = data
      const wait = lastWriteAt + interval - now()
      if (wait <= 0) return run()
      if (!timer) timer = setTimer(run, wait)
      return running
    },
    flush: run,
    pending: () => Boolean(latest),
    cancel() { if (timer) clearTimer(timer); timer = null; latest = null },
  }
}
