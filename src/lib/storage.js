// Persistência local: IndexedDB como base principal, com migração do antigo localStorage.
export const LEGACY_STORAGE_KEY = 'luma-avaliacoes-state-v1'
const BACKUP_META_KEY = 'luma-avaliacoes-backup-meta-v1'
const DB_NAME = 'luma-avaliacoes'
const DB_VERSION = 1
const STORE = 'state'
const STATE_ID = 'current'

export const BACKUP_REMINDER_DAYS = 7

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('O banco local está bloqueado por outra aba.'))
  })
}

let databasePromise = null
function database() {
  if (!databasePromise) databasePromise = openDatabase().catch((error) => { databasePromise = null; throw error })
  return databasePromise
}

function transaction(mode, run) {
  return database().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = run(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request?.result)
    tx.onerror = () => reject(tx.error || request?.error)
    tx.onabort = () => reject(tx.error || new Error('Gravação cancelada pelo navegador.'))
  }))
}

function readLegacyState() {
  try {
    const saved = localStorage.getItem(LEGACY_STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

// Retorna { data, backend } ou { data: null } quando não há nada salvo.
export async function loadStoredState() {
  try {
    const stored = await transaction('readonly', (store) => store.get(STATE_ID))
    // O estado é gravado como JSON para manter o mesmo formato do backup e do antigo localStorage.
    if (stored) return { data: typeof stored === 'string' ? JSON.parse(stored) : stored, backend: 'indexeddb' }
    const legacy = readLegacyState()
    if (legacy) {
      await transaction('readwrite', (store) => store.put(JSON.stringify(legacy), STATE_ID))
      removeLegacyState()
      return { data: legacy, backend: 'indexeddb', migrated: true }
    }
    return { data: null, backend: 'indexeddb' }
  } catch {
    return { data: readLegacyState(), backend: 'localstorage' }
  }
}

function removeLegacyState() {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { /* sem acesso ao localStorage */ }
}

export function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.code === 22 || error?.code === 1014 || /quota/i.test(error?.message || '')
}

export async function saveStoredState(data, backend = 'indexeddb') {
  if (backend === 'indexeddb') {
    await transaction('readwrite', (store) => store.put(JSON.stringify(data), STATE_ID))
    return
  }
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(data))
}

// Pede ao navegador que não apague os dados automaticamente quando faltar espaço.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

export async function getStorageStatus() {
  const status = { persisted: null, usage: null, quota: null }
  try {
    if (navigator.storage?.persisted) status.persisted = await navigator.storage.persisted()
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate()
      status.usage = estimate.usage ?? null
      status.quota = estimate.quota ?? null
    }
  } catch { /* estimativa indisponível */ }
  return status
}

export function readBackupMeta() {
  try {
    return JSON.parse(localStorage.getItem(BACKUP_META_KEY) || 'null') || {}
  } catch {
    return {}
  }
}

export function recordBackup(date = new Date()) {
  const meta = { ...readBackupMeta(), lastBackupAt: date.toISOString() }
  try { localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta)) } catch { /* lembrete fica sem registro */ }
  return meta
}

export function snoozeBackupReminder(date = new Date()) {
  const meta = { ...readBackupMeta(), snoozedAt: date.toISOString() }
  try { localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta)) } catch { /* lembrete volta na próxima sessão */ }
  return meta
}

// Lembra de baixar backup quando há correções salvas e a última cópia é antiga ou inexistente.
export function backupReminder(data, meta = readBackupMeta(), now = new Date()) {
  if (!data?.submissions?.length) return null
  const day = 24 * 60 * 60 * 1000
  if (meta.snoozedAt && now - new Date(meta.snoozedAt) < day) return null
  if (!meta.lastBackupAt) return { days: null }
  const days = Math.floor((now - new Date(meta.lastBackupAt)) / day)
  return days >= BACKUP_REMINDER_DAYS ? { days } : null
}
