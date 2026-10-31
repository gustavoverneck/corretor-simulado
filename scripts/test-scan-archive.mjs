import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { archiveFilename, archiveFolderName, archiveScanFile, isScanArchiveSupported, getScanArchiveFolder, scanReference } from '../src/lib/scanArchive.js'

const require = createRequire(import.meta.url)
const main = require('../electron/scanArchive.cjs')

// Nomes de arquivo e pasta
assert.equal(archiveFolderName({ code: 'SIM 3º TRI/2026', title: 'x' }), 'SIM-3-TRI-2026')
assert.equal(archiveFolderName({ title: 'Simulado ENEM — 1º dia' }), 'Simulado-ENEM-1-dia')
assert.equal(archiveFolderName(null), 'simulado')
assert.equal(archiveFilename({ name: 'Turma 3M01 (scan).PDF' }, 'abcdef0123456789', new Date('2026-10-30T12:00:00Z')), '2026-10-30_Turma-3M01-scan_abcdef0123.pdf')
assert.equal(archiveFilename({ name: 'foto.jpeg' }, 'ffffffffffff', new Date('2026-10-30T12:00:00Z')), '2026-10-30_foto_ffffffffff.jpeg')
assert.deepEqual(scanReference('a/b.pdf', 7, 'pdf'), { path: 'a/b.pdf', page: 7, type: 'pdf' })
assert.deepEqual(scanReference('a/b.png', undefined, 'image'), { path: 'a/b.png', page: 1, type: 'image' })
assert.equal(scanReference(undefined, 3, 'pdf'), null)

// Sem o app desktop, nada fica disponível
assert.equal(isScanArchiveSupported(), false)
assert.equal(await getScanArchiveFolder(), null)
await assert.rejects(archiveScanFile(new Blob(['x']), {}), /aplicativo desktop/)

// Processo principal: grava só dentro da pasta escolhida
const userData = await mkdtemp(path.join(tmpdir(), 'scan-userdata-'))
const folder = await mkdtemp(path.join(tmpdir(), 'scan-folder-'))
try {
  await assert.rejects(main.saveFile(userData, 'a/b.pdf', new Uint8Array([1])), /Escolha a pasta/)
  await main.writeFolder(userData, folder)
  assert.equal(await main.readFolder(userData), folder)
  for (const bad of ['../fora.pdf', 'a/../../fora.pdf', path.resolve(folder, 'x.pdf'), '']) {
    await assert.rejects(main.saveFile(userData, bad, new Uint8Array([1])), /inválido|dentro da pasta/, `bloqueia ${bad}`)
  }
  const first = await main.saveFile(userData, 'SIM-1/2026-10-30_lote_abc.pdf', new Uint8Array([1, 2, 3]))
  assert.equal(first.created, true)
  const again = await main.saveFile(userData, 'SIM-1/2026-10-30_lote_abc.pdf', new Uint8Array([9]))
  assert.equal(again.created, false, 'mesmo nome não sobrescreve')
  assert.deepEqual([...await readFile(path.join(folder, 'SIM-1', '2026-10-30_lote_abc.pdf'))], [1, 2, 3])
  assert.deepEqual([...await main.readFile(userData, 'SIM-1/2026-10-30_lote_abc.pdf')], [1, 2, 3])
  await assert.rejects(main.readFile(userData, 'SIM-1/nao-existe.pdf'), /não encontrado/)

  // Ponte do navegador ligada ao processo principal
  globalThis.window = { desktopScanArchive: {
    getFolder: () => main.readFolder(userData),
    save: (relativePath, bytes) => main.saveFile(userData, relativePath, bytes),
    read: () => Promise.reject(new Error("Error invoking remote method 'scan-archive:read': Error: Arquivo não encontrado na pasta das folhas.")),
  } }
  assert.equal(isScanArchiveSupported(), true)
  assert.equal(await getScanArchiveFolder(), folder)
  const file = new File([new Uint8Array([5, 6, 7])], 'Lote 3M01.pdf', { type: 'application/pdf' })
  const saved = await archiveScanFile(file, { code: 'SIM-3' })
  assert.match(saved, /^SIM-3\/\d{4}-\d{2}-\d{2}_Lote-3M01_[0-9a-f]{10}\.pdf$/)
  assert.equal(await archiveScanFile(file, { code: 'SIM-3' }), saved, 'mesmo arquivo, mesmo caminho')
  assert.deepEqual([...await readFile(path.join(folder, saved))], [5, 6, 7])
  const { loadArchivedScanImage } = await import('../src/lib/scanArchive.js')
  await assert.rejects(loadArchivedScanImage({ path: saved, page: 1, type: 'pdf' }), (error) => error.message === 'Arquivo não encontrado na pasta das folhas.')
} finally {
  await rm(userData, { recursive: true, force: true })
  await rm(folder, { recursive: true, force: true })
}

console.log('scan archive ok')
