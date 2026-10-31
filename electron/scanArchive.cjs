const fs = require('node:fs/promises')
const path = require('node:path')

// Pasta escolhida pelo professor para guardar os PDFs e imagens escaneados.
// O caminho fica só no processo principal; a página nunca informa a pasta,
// apenas caminhos relativos dentro dela.

function configPath(userDataPath) {
  return path.join(userDataPath, 'arquivo-folhas.json')
}

async function readFolder(userDataPath) {
  try {
    const config = JSON.parse(await fs.readFile(configPath(userDataPath), 'utf8'))
    return typeof config.folder === 'string' && config.folder ? config.folder : null
  } catch {
    return null
  }
}

async function writeFolder(userDataPath, folder) {
  await fs.mkdir(userDataPath, { recursive: true })
  await fs.writeFile(configPath(userDataPath), JSON.stringify({ folder }, null, 2), 'utf8')
}

function resolveInside(folder, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) throw new Error('Caminho de arquivo inválido.')
  const root = path.resolve(folder)
  const target = path.resolve(root, relativePath)
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('O arquivo precisa ficar dentro da pasta das folhas.')
  return target
}

async function requireFolder(userDataPath) {
  const folder = await readFolder(userDataPath)
  if (!folder) throw new Error('Escolha a pasta das folhas escaneadas em Configurações.')
  return folder
}

async function saveFile(userDataPath, relativePath, bytes) {
  const folder = await requireFolder(userDataPath)
  const target = resolveInside(folder, relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  try {
    await fs.writeFile(target, Buffer.from(bytes), { flag: 'wx' })
    return { relativePath, created: true }
  } catch (error) {
    // O nome leva o hash do conteúdo: se já existe, é o mesmo arquivo.
    if (error.code === 'EEXIST') return { relativePath, created: false }
    throw error
  }
}

async function readFile(userDataPath, relativePath) {
  const folder = await requireFolder(userDataPath)
  try {
    return new Uint8Array(await fs.readFile(resolveInside(folder, relativePath)))
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Arquivo não encontrado na pasta das folhas. Ele pode ter sido movido ou apagado.')
    throw error
  }
}

async function fullPath(userDataPath, relativePath) {
  const folder = await requireFolder(userDataPath)
  const target = resolveInside(folder, relativePath)
  await fs.access(target).catch(() => { throw new Error('Arquivo não encontrado na pasta das folhas. Ele pode ter sido movido ou apagado.') })
  return target
}

module.exports = { readFolder, writeFolder, resolveInside, saveFile, readFile, fullPath }
