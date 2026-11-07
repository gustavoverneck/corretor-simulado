import assert from 'node:assert/strict'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { isScannerInboxSupported, mimeTypeFor, nextScannerJob, MAX_IMAGES_PER_JOB } from '../src/lib/scannerInbox.js'

const require = createRequire(import.meta.url)
const inbox = require('../electron/scannerInbox.cjs')
const windowState = require('../electron/windowState.cjs')

// Fila: um PDF por vez; imagens seguidas viram um lote
const files = (...names) => names.map((name) => ({ name, key: name }))
assert.deepEqual(nextScannerJob([]), [])
assert.deepEqual(nextScannerJob(files('a.pdf', 'b.jpg')).map((f) => f.name), ['a.pdf'])
assert.deepEqual(nextScannerJob(files('a.jpg', 'b.PNG', 'c.pdf', 'd.jpg')).map((f) => f.name), ['a.jpg', 'b.PNG'])
assert.equal(nextScannerJob(Array.from({ length: 130 }, (_, i) => ({ name: `${i}.jpg` }))).length, MAX_IMAGES_PER_JOB)
assert.equal(mimeTypeFor('x.PDF'), 'application/pdf')
assert.equal(mimeTypeFor('x.webp'), 'image/webp')
assert.equal(mimeTypeFor('x.jpeg'), 'image/jpeg')
assert.equal(isScannerInboxSupported(), false)

// Processo principal
const userData = await mkdtemp(path.join(tmpdir(), 'inbox-userdata-'))
const folder = await mkdtemp(path.join(tmpdir(), 'inbox-folder-'))
const old = new Date(Date.now() - 60_000)
const put = async (name, content = 'x', when = old) => {
  await writeFile(path.join(folder, name), content)
  await utimes(path.join(folder, name), when, when)
}
try {
  assert.deepEqual(await inbox.status(userData), { folder: null, auto: true, pending: [], waiting: 0 })
  await assert.rejects(inbox.readFile(userData, 'a.pdf'), /Escolha a pasta/)

  // O que já estava na pasta ao escolher não é corrigido
  await put('antigo.pdf')
  let status = await inbox.setFolder(userData, folder)
  assert.equal(status.folder, folder)
  assert.equal(status.pending.length, 0)

  // Arquivos novos entram na fila; outros formatos e arquivos vazios não
  await put('lote 2.pdf', 'pdf')
  await put('foto.JPG', 'img')
  await put('notas.txt', 'txt')
  await put('vazio.png', '')
  await put('gravando.pdf', 'pdf', new Date())
  status = await inbox.status(userData)
  assert.deepEqual(status.pending.map((f) => f.name).sort(), ['foto.JPG', 'lote 2.pdf'])
  assert.equal(status.waiting, 1)
  assert.deepEqual([...await inbox.readFile(userData, 'lote 2.pdf')], [...Buffer.from('pdf')])

  // Só lê arquivos da própria pasta
  await assert.rejects(inbox.readFile(userData, '../fora.pdf'), /inválido/)
  await assert.rejects(inbox.readFile(userData, 'notas.txt'), /inválido/)
  await assert.rejects(inbox.readFile(userData, 'sumiu.pdf'), /não está mais/)

  // Marcar como lido tira da fila; o mesmo nome com conteúdo novo volta
  status = await inbox.markSeen(userData, status.pending.map((f) => f.key))
  assert.equal(status.pending.length, 0)
  await put('foto.JPG', 'outra imagem', new Date(Date.now() - 30_000))
  status = await inbox.status(userData)
  assert.deepEqual(status.pending.map((f) => f.name), ['foto.JPG'])

  // Pausar é lembrado
  status = await inbox.setAuto(userData, false)
  assert.equal(status.auto, false)
  assert.equal((await inbox.readConfig(userData)).auto, false)

  // Pasta apagada mostra aviso em vez de quebrar
  await inbox.setFolder(userData, path.join(folder, 'nao-existe'))
  status = await inbox.status(userData)
  assert.match(status.error, /não foi encontrada/)

  // Desligar
  status = await inbox.setFolder(userData, null)
  assert.equal(status.folder, null)
} finally {
  await rm(userData, { recursive: true, force: true })
  await rm(folder, { recursive: true, force: true })
}

// Janela: primeira abertura maximizada; tamanho mínimo; posição fora da tela é descartada
const displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }]
assert.deepEqual(windowState.sanitizeState(null, displays), { width: 1440, height: 900, maximized: true })
assert.deepEqual(windowState.sanitizeState({ width: 500, height: 300, maximized: false }, displays), { width: 980, height: 650, maximized: false })
assert.deepEqual(windowState.sanitizeState({ x: 100, y: 50, width: 1200, height: 800, maximized: false }, displays), { x: 100, y: 50, width: 1200, height: 800, maximized: false })
assert.deepEqual(windowState.sanitizeState({ x: 3000, y: 50, width: 1200, height: 800, maximized: true }, displays), { width: 1200, height: 800, maximized: true })
const stateDir = await mkdtemp(path.join(tmpdir(), 'window-state-'))
try {
  assert.equal(windowState.readState(stateDir, displays).maximized, true)
  windowState.writeState(stateDir, { x: 10, y: 10, width: 1300, height: 820, maximized: false })
  assert.deepEqual(windowState.readState(stateDir, displays), { x: 10, y: 10, width: 1300, height: 820, maximized: false })
} finally {
  await rm(stateDir, { recursive: true, force: true })
}

console.log('scanner inbox + window state: ok')
