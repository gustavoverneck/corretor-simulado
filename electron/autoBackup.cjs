const fs = require('node:fs/promises')
const path = require('node:path')

// Backup automático do banco numa pasta escolhida pelo professor (por exemplo,
// dentro do OneDrive). Enquanto ele não escolhe nem desativa, vale a pasta
// padrão (defaultFolder): Corretor de Simulados/Backups no OneDrive ou em
// Documentos. Cada cópia leva data e hora no nome. Ficam as RECENT
// cópias mais novas e, além delas, a última de cada dia dos DAYS dias mais
// recentes, para um dia de muitas correções não apagar os dias anteriores.
const RECENT = 20
const DAYS = 30
const PREFIX = 'backup-automatico-'

function configPath(userDataPath) {
  return path.join(userDataPath, 'backup-automatico.json')
}

function defaultFolder({ oneDrive = process.env.OneDrive, documents } = {}) {
  const base = oneDrive || documents
  return base ? path.join(base, 'Corretor de Simulados', 'Backups') : null
}

// Sem arquivo de configuração: pasta padrão. Com { folder: null }: desativado
// pelo professor.
async function readFolder(userDataPath, { fallback = null } = {}) {
  let text
  try {
    text = await fs.readFile(configPath(userDataPath), 'utf8')
  } catch {
    return fallback
  }
  try {
    const config = JSON.parse(text)
    return typeof config.folder === 'string' && config.folder ? config.folder : null
  } catch {
    return fallback
  }
}

async function writeFolder(userDataPath, folder) {
  await fs.mkdir(userDataPath, { recursive: true })
  await fs.writeFile(configPath(userDataPath), JSON.stringify({ folder }, null, 2), 'utf8')
}

function backupName(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${PREFIX}${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.json`
}

function filesToKeep(names, { recent = RECENT, days = DAYS } = {}) {
  const sorted = names.filter((name) => name.startsWith(PREFIX) && name.endsWith('.json')).sort().reverse()
  const keep = new Set(sorted.slice(0, recent))
  const seenDays = new Set()
  sorted.forEach((name) => {
    const day = name.slice(PREFIX.length, PREFIX.length + 10)
    if (seenDays.has(day) || seenDays.size >= days) return
    seenDays.add(day)
    keep.add(name)
  })
  return keep
}

async function prune(folder) {
  const names = await fs.readdir(folder)
  const keep = filesToKeep(names)
  await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name.endsWith('.json') && !keep.has(name)).map((name) => fs.rm(path.join(folder, name), { force: true })))
}

// Grava num arquivo temporário e renomeia, para nunca deixar um backup pela
// metade se o computador desligar no meio.
async function writeBackup(userDataPath, json, date = new Date(), { fallback = null } = {}) {
  const folder = await readFolder(userDataPath, { fallback })
  if (!folder) return null
  if (typeof json !== 'string' || !json.startsWith('{')) throw new Error('Backup inválido.')
  await fs.mkdir(folder, { recursive: true })
  const name = backupName(date)
  const target = path.join(folder, name)
  const temporary = `${target}.tmp`
  await fs.writeFile(temporary, json, 'utf8')
  await fs.rename(temporary, target)
  await prune(folder)
  return { file: name, folder, savedAt: date.toISOString() }
}

module.exports = { RECENT, DAYS, PREFIX, defaultFolder, readFolder, writeFolder, backupName, filesToKeep, writeBackup, prune }
