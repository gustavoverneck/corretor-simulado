const fs = require('node:fs/promises')
const path = require('node:path')

// Pasta do scanner: o professor escolhe a pasta onde o scanner salva os
// arquivos e o app corrige cada PDF ou imagem novo que aparece nela. Os
// arquivos nunca são movidos nem apagados; o app só lembra quais já leu.

const SUPPORTED = /\.(pdf|jpe?g|png|webp)$/i
// Um arquivo só entra na fila depois de ficar alguns segundos sem mudar, para
// não ler um PDF que o scanner ainda está gravando.
const SETTLE_MS = 4000
const MAX_REMEMBERED = 3000

function configPath(userDataPath) {
  return path.join(userDataPath, 'pasta-scanner.json')
}

async function readConfig(userDataPath) {
  try {
    const config = JSON.parse(await fs.readFile(configPath(userDataPath), 'utf8'))
    return {
      folder: typeof config.folder === 'string' && config.folder ? config.folder : null,
      auto: config.auto !== false,
      seen: Array.isArray(config.seen) ? config.seen.filter((item) => typeof item === 'string') : [],
    }
  } catch {
    return { folder: null, auto: true, seen: [] }
  }
}

async function writeConfig(userDataPath, config) {
  await fs.mkdir(userDataPath, { recursive: true })
  const seen = config.seen.slice(-MAX_REMEMBERED)
  await fs.writeFile(configPath(userDataPath), JSON.stringify({ folder: config.folder, auto: config.auto, seen }, null, 2), 'utf8')
}

function fileKey(name, stats) {
  return `${name}|${stats.size}|${Math.round(stats.mtimeMs)}`
}

// Lista os arquivos suportados da pasta (sem subpastas), do mais antigo para
// o mais novo.
async function scanFolder(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || !SUPPORTED.test(entry.name) || entry.name.startsWith('~$') || entry.name.startsWith('.')) continue
    try {
      const stats = await fs.stat(path.join(folder, entry.name))
      files.push({ name: entry.name, size: stats.size, modifiedAt: stats.mtimeMs, key: fileKey(entry.name, stats) })
    } catch {
      // O arquivo pode ter sido apagado entre a listagem e a leitura.
    }
  }
  return files.sort((a, b) => a.modifiedAt - b.modifiedAt || a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}

async function status(userDataPath, now = Date.now()) {
  const config = await readConfig(userDataPath)
  if (!config.folder) return { folder: null, auto: config.auto, pending: [], waiting: 0 }
  let files
  try {
    files = await scanFolder(config.folder)
  } catch (error) {
    return { folder: config.folder, auto: config.auto, pending: [], waiting: 0, error: error.code === 'ENOENT' ? 'A pasta do scanner não foi encontrada. Ela pode ter sido movida ou apagada.' : 'Não foi possível abrir a pasta do scanner.' }
  }
  const seen = new Set(config.seen)
  const fresh = files.filter((file) => !seen.has(file.key) && file.size > 0)
  const pending = fresh.filter((file) => now - file.modifiedAt >= SETTLE_MS)
  return { folder: config.folder, auto: config.auto, pending, waiting: fresh.length - pending.length }
}

// Ao escolher a pasta, os arquivos que já estão nela são marcados como lidos:
// só o que chegar depois é corrigido.
async function setFolder(userDataPath, folder) {
  const config = await readConfig(userDataPath)
  const seen = folder ? (await scanFolder(folder).catch(() => [])).map((file) => file.key) : []
  await writeConfig(userDataPath, { ...config, folder: folder || null, seen })
  return status(userDataPath)
}

async function setAuto(userDataPath, auto) {
  const config = await readConfig(userDataPath)
  await writeConfig(userDataPath, { ...config, auto: Boolean(auto) })
  return status(userDataPath)
}

function resolveName(folder, name) {
  if (typeof name !== 'string' || !name || name !== path.basename(name) || name === '.' || name === '..' || !SUPPORTED.test(name)) throw new Error('Arquivo inválido.')
  return path.join(folder, name)
}

async function readFile(userDataPath, name) {
  const config = await readConfig(userDataPath)
  if (!config.folder) throw new Error('Escolha a pasta do scanner primeiro.')
  try {
    return new Uint8Array(await fs.readFile(resolveName(config.folder, name)))
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${name} não está mais na pasta do scanner.`)
    throw error
  }
}

async function markSeen(userDataPath, keys) {
  const config = await readConfig(userDataPath)
  const list = (Array.isArray(keys) ? keys : [keys]).filter((key) => typeof key === 'string')
  const seen = [...config.seen.filter((key) => !list.includes(key)), ...list]
  await writeConfig(userDataPath, { ...config, seen })
  return status(userDataPath)
}

module.exports = { SETTLE_MS, readConfig, scanFolder, status, setFolder, setAuto, readFile, markSeen, resolveName }
