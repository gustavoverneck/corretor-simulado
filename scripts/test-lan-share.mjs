import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { gunzipSync } from 'node:zlib'
import { createLanPublisher, prepareSharedData } from '../src/lib/lanShare.js'

const require = createRequire(import.meta.url)
const { createLanShare, isLocalClient, localAddresses } = require('../electron/lanShare.cjs')

// Só a rede local entra
assert.equal(isLocalClient('192.168.0.12'), true)
assert.equal(isLocalClient('::ffff:10.1.2.3'), true)
assert.equal(isLocalClient('172.20.0.5'), true)
assert.equal(isLocalClient('127.0.0.1'), true)
assert.equal(isLocalClient('::1'), true)
assert.equal(isLocalClient('172.32.0.5'), false)
assert.equal(isLocalClient('8.8.8.8'), false)
assert.equal(isLocalClient('::ffff:200.10.1.1'), false)
assert.equal(isLocalClient(undefined), false)

// Endereços: IPv4 externos, 192.168 primeiro, sem loopback nem link-local
assert.deepEqual(localAddresses({
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  eth0: [{ address: '10.0.0.4', family: 'IPv4', internal: false }, { address: 'fe80::1', family: 'IPv6', internal: false }],
  wifi: [{ address: '192.168.1.20', family: 4, internal: false }],
  apipa: [{ address: '169.254.3.3', family: 'IPv4', internal: false }],
}), [{ name: 'wifi', address: '192.168.1.20' }, { name: 'eth0', address: '10.0.0.4' }])

// Cópia compartilhada sem caminhos de arquivos locais
const shared = prepareSharedData({ school: { name: 'E' }, submissions: [{ id: 's1', scan: { path: 'C:/x.pdf' }, answers: ['A'] }, { id: 's2' }] })
assert.deepEqual(shared.submissions, [{ id: 's1', answers: ['A'] }, { id: 's2' }])

// Publicador: agrupa alterações e manda só a mais nova
{
  let timers = []
  const sent = []
  const publisher = createLanPublisher({
    publish: async (data) => { sent.push(data.v) },
    setTimer: (fn) => { const t = { fn }; timers.push(t); return t },
    clearTimer: (t) => { timers = timers.filter((x) => x !== t) },
  })
  publisher.changed({ v: 1 }); publisher.changed({ v: 2 })
  assert.equal(timers.length, 1)
  await timers[0].fn(); timers = []
  assert.deepEqual(sent, [2])
  publisher.changed({ v: 3 })
  await publisher.now({ v: 4 })
  assert.deepEqual(sent, [2, 4])
  assert.equal(timers.length, 0)
}

// Servidor
const root = await mkdtemp(path.join(tmpdir(), 'lan-share-'))
const distDir = path.join(root, 'dist')
const userData = path.join(root, 'userData')
await mkdir(path.join(distDir, 'assets'), { recursive: true })
await writeFile(path.join(distDir, 'index.html'), '<!doctype html><html><head><title>x</title></head><body></body></html>')
await writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log(1)')
await writeFile(path.join(root, 'segredo.txt'), 'não pode sair')

let clock = 1_000_000
const share = createLanShare({ distDir, userDataPath: userData, now: () => clock })
try {
  const off = await share.getStatus()
  assert.equal(off.enabled, false)
  assert.match(off.code, /^\d{6}$/)
  const saved = JSON.parse(await readFile(path.join(userData, 'compartilhamento-rede.json'), 'utf8'))
  assert.equal(saved.code, off.code, 'código fica salvo para a próxima vez')

  const on = await share.start()
  assert.equal(on.enabled, true)
  assert.ok(on.port > 0)
  const base = `http://127.0.0.1:${on.port}`
  const code = on.code
  const get = (url, headers = {}) => fetch(base + url, { headers })

  // Interface servida com a marca de modo consulta
  const index = await (await get('/')).text()
  assert.match(index, /<meta name="lan-viewer" content="1" \/>/)
  assert.match(await (await get('/resultados')).text(), /lan-viewer/, 'rotas desconhecidas caem no index')
  const asset = await get('/assets/app.js')
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-type'), /javascript/)
  assert.equal((await get('/assets/nada.js')).status, 404)

  // Fora da pasta dist não sai nada
  for (const attempt of ['/../segredo.txt', '/%2e%2e/segredo.txt', '/assets/..%2f..%2fsegredo.txt', '/..%5csegredo.txt']) {
    const response = await get(attempt)
    const body = await response.text()
    assert.ok(!body.includes('não pode sair'), `não vaza ${attempt}`)
  }

  // Somente leitura
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const response = await fetch(`${base}/api/data`, { method, headers: { 'X-Access-Code': code }, body: method === 'DELETE' ? undefined : '{}' })
    assert.equal(response.status, 405, method)
  }

  // Código obrigatório
  assert.equal((await get('/api/data')).status, 401)
  assert.equal((await get('/api/version', { 'X-Access-Code': '000000' === code ? '111111' : '000000' })).status, 401)
  assert.equal((await get('/api/data', { 'X-Access-Code': code })).status, 503, 'antes da primeira publicação')

  share.publish(JSON.stringify({ school: { name: 'Escola' }, submissions: [] }))
  const version = await (await get('/api/version', { 'X-Access-Code': code })).json()
  assert.equal(version.version, 1)
  const dataResponse = await get('/api/data', { 'X-Access-Code': code })
  assert.equal(dataResponse.status, 200)
  assert.equal((await dataResponse.json()).school.name, 'Escola')
  const etag = dataResponse.headers.get('etag')
  assert.equal((await get('/api/data', { 'X-Access-Code': code, 'If-None-Match': etag })).status, 304)

  share.publish(JSON.stringify({ school: { name: 'Escola 2' } }))
  assert.equal((await (await get('/api/version', { 'X-Access-Code': code })).json()).version, 2)
  assert.equal((await share.getStatus()).viewers, 1, 'conta quem consultou')

  // Bloqueio após muitas tentativas erradas
  const wrong = code === '123456' ? '654321' : '123456'
  for (let attempt = 0; attempt < 8; attempt += 1) assert.equal((await get('/api/version', { 'X-Access-Code': wrong })).status, 401)
  assert.equal((await get('/api/version', { 'X-Access-Code': code })).status, 429, 'bloqueado mesmo com o código certo')
  clock += 11 * 60 * 1000
  assert.equal((await get('/api/version', { 'X-Access-Code': code })).status, 200, 'libera depois do bloqueio')

  // Novo código derruba o antigo
  const renewed = await share.regenerateCode()
  assert.notEqual(renewed.code, code)
  assert.equal((await get('/api/version', { 'X-Access-Code': code })).status, 401)
  assert.equal((await get('/api/version', { 'X-Access-Code': renewed.code })).status, 200)

  // gzip quando o navegador aceita
  const raw = await new Promise((resolve, reject) => {
    import('node:http').then(({ get: httpGet }) => httpGet(`${base}/api/data`, { headers: { 'X-Access-Code': renewed.code, 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ encoding: res.headers['content-encoding'], body: Buffer.concat(chunks) }))
    }).on('error', reject))
  })
  assert.equal(raw.encoding, 'gzip')
  assert.equal(JSON.parse(gunzipSync(raw.body).toString()).school.name, 'Escola 2')

  const stopped = await share.stop()
  assert.equal(stopped.enabled, false)
  await assert.rejects(fetch(`${base}/`), 'servidor desligado')

  // Porta ocupada: usa outra livre
  const blocker = createLanShare({ distDir, userDataPath: userData })
  const first = await blocker.start()
  const second = createLanShare({ distDir, userDataPath: userData })
  const other = await second.start()
  assert.notEqual(other.port, first.port)
  await second.stop()
  await blocker.stop()
} finally {
  await share.stop()
  await rm(root, { recursive: true, force: true })
}

console.log('test-lan-share: ok')
