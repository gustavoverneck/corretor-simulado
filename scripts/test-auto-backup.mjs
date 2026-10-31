import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createAutoBackupScheduler, getAutoBackupFolder, isAutoBackupSupported } from '../src/lib/autoBackup.js'

const require = createRequire(import.meta.url)
const main = require('../electron/autoBackup.cjs')

// Agenda: grava logo na primeira alteração, depois espera o intervalo
let clock = 0
let timers = []
const writes = []
const scheduler = createAutoBackupScheduler({
  interval: 1000,
  now: () => clock,
  setTimer: (fn, wait) => { const timer = { fn, at: clock + wait }; timers.push(timer); return timer },
  clearTimer: (timer) => { timers = timers.filter((item) => item !== timer) },
  write: async (data) => { writes.push(data.v); return { savedAt: new Date(clock).toISOString() } },
})
await scheduler.changed({ v: 1 })
assert.deepEqual(writes, [1])
clock = 200; scheduler.changed({ v: 2 })
clock = 400; scheduler.changed({ v: 3 })
assert.equal(timers.length, 1, 'um único agendamento')
assert.equal(timers[0].at, 1000)
clock = 1000; await timers[0].fn()
assert.deepEqual(writes, [1, 3], 'grava só a versão mais nova')
clock = 1100; scheduler.changed({ v: 4 })
await scheduler.flush()
assert.deepEqual(writes, [1, 3, 4], 'ao fechar grava o que falta')
await scheduler.flush()
assert.deepEqual(writes, [1, 3, 4], 'nada pendente, nada gravado')
assert.equal(isAutoBackupSupported(), false)
assert.equal(await getAutoBackupFolder(), null)

// Retenção: 20 mais novas + uma por dia dos últimos 30 dias
const names = []
for (let day = 1; day <= 40; day += 1) for (let hour = 8; hour < 11; hour += 1) names.push(main.backupName(new Date(2026, 8, day, hour, 0, 0)))
names.push('outro-arquivo.json')
const keep = main.filesToKeep(names)
assert.equal([...keep].filter((name) => name.includes('2026-10-10')).length, 3, 'dia mais recente inteiro')
assert.ok(keep.has(main.backupName(new Date(2026, 8, 11, 10))), 'última cópia de um dia mais antigo')
assert.ok(!keep.has(main.backupName(new Date(2026, 8, 11, 8))))
assert.ok(!keep.has(main.backupName(new Date(2026, 8, 5, 10))), 'mais de 30 dias saem')
assert.equal(keep.size, 20 + 23, '20 recentes (7 dias) + 23 dias anteriores')
assert.ok(!keep.has('outro-arquivo.json'))

// Gravação real
const userData = await mkdtemp(path.join(tmpdir(), 'backup-userdata-'))
const folder = await mkdtemp(path.join(tmpdir(), 'backup-folder-'))
try {
  assert.equal(await main.writeBackup(userData, '{"a":1}'), null, 'sem pasta não grava')
  // Pasta padrão enquanto o professor não escolhe nem desativa
  const fallback = path.join(userData, 'padrao')
  assert.equal(main.defaultFolder({ oneDrive: 'C:\\OneDrive', documents: 'C:\\Docs' }), path.join('C:\\OneDrive', 'Corretor de Simulados', 'Backups'))
  assert.equal(main.defaultFolder({ oneDrive: '', documents: 'D' }), path.join('D', 'Corretor de Simulados', 'Backups'))
  assert.equal(await main.readFolder(userData, { fallback }), fallback)
  const saved = await main.writeBackup(userData, '{"b":2}', new Date(2026, 9, 30, 8), { fallback })
  assert.equal(saved.folder, fallback)
  assert.equal((await readdir(fallback)).length, 1)
  await main.writeFolder(userData, null)
  assert.equal(await main.readFolder(userData, { fallback }), null, 'desativado pelo professor')
  assert.equal(await main.writeBackup(userData, '{"b":2}', new Date(), { fallback }), null)
  await main.writeFolder(userData, folder)
  assert.equal(await main.readFolder(userData, { fallback }), folder, 'pasta escolhida vence a padrão')
  const result = await main.writeBackup(userData, '{"format":"sistema-avaliacoes-backup"}', new Date(2026, 9, 31, 9, 5, 7))
  assert.equal(result.file, 'backup-automatico-2026-10-31_09-05-07.json')
  assert.equal(await readFile(path.join(folder, result.file), 'utf8'), '{"format":"sistema-avaliacoes-backup"}')
  for (let minute = 0; minute < 25; minute += 1) await main.writeBackup(userData, '{}', new Date(2026, 9, 31, 10, minute))
  const files = await readdir(folder)
  assert.equal(files.length, 20, 'mesmo dia: ficam as 20 mais novas')
  assert.ok(!files.some((name) => name.endsWith('.tmp')))
  await assert.rejects(main.writeBackup(userData, 'não é json'), /inválido/)
} finally {
  await rm(userData, { recursive: true, force: true })
  await rm(folder, { recursive: true, force: true })
}
console.log('auto backup ok')
