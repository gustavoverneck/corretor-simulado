import { downloadBlob } from './utils'

export function createBackup(data, exportedAt = new Date()) {
  return { format: 'sistema-avaliacoes-backup', version: 1, exportedAt: exportedAt.toISOString(), data }
}

export function downloadBackup(data) {
  const date = new Date().toISOString().slice(0, 10)
  downloadBlob(new Blob([JSON.stringify(createBackup(data), null, 2)], { type: 'application/json' }), `backup-sistema-avaliacoes-${date}.json`)
}
