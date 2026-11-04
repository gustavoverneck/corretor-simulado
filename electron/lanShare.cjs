const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const zlib = require('node:zlib')
const crypto = require('node:crypto')

// Compartilhamento na rede local: um servidor HTTP somente leitura que entrega a
// mesma interface do app (pasta dist) e uma cópia dos dados publicada pela janela
// principal. Outros professores abrem o endereço no navegador, digitam o código de
// acesso e consultam Resultados e Análise. O servidor só responde a GET/HEAD e
// nunca grava nada; ele também recusa quem não está na rede local.

const DEFAULT_PORT = 8765
const MAX_FAILURES = 8
const LOCK_MS = 10 * 60 * 1000
const VIEWER_WINDOW_MS = 2 * 60 * 1000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function configPath(userDataPath) {
  return path.join(userDataPath, 'compartilhamento-rede.json')
}

function newCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

async function readConfig(userDataPath) {
  try {
    const config = JSON.parse(await fs.readFile(configPath(userDataPath), 'utf8'))
    return {
      code: /^\d{6}$/.test(config.code) ? config.code : null,
      port: Number.isInteger(config.port) && config.port > 1023 && config.port < 65536 ? config.port : DEFAULT_PORT,
    }
  } catch {
    return { code: null, port: DEFAULT_PORT }
  }
}

async function writeConfig(userDataPath, config) {
  await fs.mkdir(userDataPath, { recursive: true })
  await fs.writeFile(configPath(userDataPath), JSON.stringify(config, null, 2))
}

// Endereços IPv4 da máquina na rede local (Wi-Fi, cabo), sem o loopback.
function localAddresses(interfaces = os.networkInterfaces()) {
  const result = []
  for (const [name, entries] of Object.entries(interfaces || {})) {
    for (const entry of entries || []) {
      const family = typeof entry.family === 'string' ? entry.family : entry.family === 4 ? 'IPv4' : 'IPv6'
      if (family !== 'IPv4' || entry.internal) continue
      if (entry.address.startsWith('169.254.')) continue
      result.push({ name, address: entry.address })
    }
  }
  const rank = (address) => address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2
  return result.sort((a, b) => rank(a.address) - rank(b.address))
}

// Aceita só clientes da rede local (faixas privadas, link-local e a própria máquina).
function isLocalClient(rawAddress) {
  if (!rawAddress) return false
  const address = rawAddress.startsWith('::ffff:') ? rawAddress.slice(7) : rawAddress
  if (address === '::1') return true
  const v4 = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  const lower = address.toLowerCase()
  return lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')
}

function sameCode(given, expected) {
  if (typeof given !== 'string' || !expected) return false
  const a = Buffer.from(given.trim())
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const VIEWER_META = '<meta name="lan-viewer" content="1" />'

function createLanShare({ distDir, userDataPath, now = () => Date.now() }) {
  let server = null
  let config = null
  let port = null
  let error = null
  let snapshot = null // { body, gzip, etag, version, updatedAt }
  let version = 0
  const failures = new Map() // ip -> { count, lockedUntil }
  const viewers = new Map() // ip -> último acesso
  let indexHtml = null

  async function ensureConfig() {
    if (!config) {
      config = await readConfig(userDataPath)
      if (!config.code) {
        config.code = newCode()
        await writeConfig(userDataPath, config)
      }
    }
    return config
  }

  function activeViewers() {
    const limit = now() - VIEWER_WINDOW_MS
    let count = 0
    for (const [ip, at] of viewers) {
      if (at >= limit) count += 1
      else viewers.delete(ip)
    }
    return count
  }

  function status() {
    return {
      enabled: Boolean(server),
      port,
      code: config?.code || null,
      addresses: server ? localAddresses().map((item) => ({ ...item, url: `http://${item.address}${port === 80 ? '' : `:${port}`}/` })) : [],
      viewers: server ? activeViewers() : 0,
      publishedAt: snapshot?.updatedAt || null,
      error,
    }
  }

  function publish(json) {
    if (typeof json !== 'string') throw new Error('Dados inválidos para compartilhar.')
    const body = Buffer.from(json)
    version += 1
    snapshot = {
      body,
      gzip: zlib.gzipSync(body),
      etag: `"v${version}-${crypto.createHash('sha1').update(body).digest('hex').slice(0, 12)}"`,
      version,
      updatedAt: new Date(now()).toISOString(),
    }
    return status()
  }

  function send(res, statusCode, body, headers = {}) {
    res.writeHead(statusCode, {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      ...headers,
    })
    res.end(res.req.method === 'HEAD' ? undefined : body)
  }

  function sendJson(res, statusCode, value) {
    send(res, statusCode, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  }

  function checkAccess(req, res, ip) {
    const entry = failures.get(ip)
    if (entry?.lockedUntil && entry.lockedUntil > now()) {
      sendJson(res, 429, { error: 'Muitas tentativas com código errado. Aguarde alguns minutos e tente de novo.' })
      return false
    }
    if (!sameCode(req.headers['x-access-code'], config.code)) {
      const count = (entry?.lockedUntil && entry.lockedUntil <= now() ? 0 : entry?.count || 0) + 1
      failures.set(ip, { count, lockedUntil: count >= MAX_FAILURES ? now() + LOCK_MS : null })
      sendJson(res, 401, { error: 'Código de acesso incorreto.' })
      return false
    }
    failures.delete(ip)
    viewers.set(ip, now())
    return true
  }

  async function readIndex() {
    if (!indexHtml) {
      const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8')
      indexHtml = html.replace('<head>', `<head>\n    ${VIEWER_META}`)
    }
    return indexHtml
  }

  async function serveStatic(req, res, pathname) {
    let decoded
    try { decoded = decodeURIComponent(pathname) } catch { return send(res, 400, 'Endereço inválido') }
    const relative = path.normalize(decoded).replace(/^([/\\])+/, '')
    const filePath = path.join(distDir, relative)
    if (relative && !relative.startsWith('..') && filePath.startsWith(distDir + path.sep)) {
      try {
        const stat = await fs.stat(filePath)
        if (stat.isFile() && path.basename(filePath) !== 'index.html') {
          const content = await fs.readFile(filePath)
          const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
          const immutable = relative.startsWith(`assets${path.sep}`)
          return send(res, 200, content, { 'Content-Type': type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
        }
      } catch { /* cai no index */ }
    }
    if (path.extname(relative) && relative !== 'index.html') return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' })
    return send(res, 200, await readIndex(), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
  }

  async function handle(req, res) {
    const ip = req.socket.remoteAddress
    if (!isLocalClient(ip)) return send(res, 403, 'Acesso permitido apenas na rede local.', { 'Content-Type': 'text/plain; charset=utf-8' })
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Somente leitura.', { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' })
    const { pathname } = new URL(req.url, 'http://localhost')
    if (pathname === '/api/version') {
      if (!checkAccess(req, res, ip)) return undefined
      return sendJson(res, 200, { version: snapshot?.version || 0, updatedAt: snapshot?.updatedAt || null })
    }
    if (pathname === '/api/data') {
      if (!checkAccess(req, res, ip)) return undefined
      if (!snapshot) return sendJson(res, 503, { error: 'Os dados ainda estão sendo preparados. Tente de novo em instantes.' })
      if (req.headers['if-none-match'] === snapshot.etag) return send(res, 304, undefined, { ETag: snapshot.etag, 'Cache-Control': 'no-cache' })
      const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
      return send(res, 200, gzip ? snapshot.gzip : snapshot.body, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        ETag: snapshot.etag,
        'X-Data-Updated-At': snapshot.updatedAt,
        Vary: 'Accept-Encoding',
        ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
      })
    }
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Não encontrado' })
    return serveStatic(req, res, pathname)
  }

  function listen(candidate) {
    return new Promise((resolve, reject) => {
      const instance = http.createServer((req, res) => {
        handle(req, res).catch(() => { if (!res.headersSent) send(res, 500, 'Erro interno', { 'Content-Type': 'text/plain; charset=utf-8' }); else res.end() })
      })
      instance.once('error', reject)
      instance.listen(candidate, '0.0.0.0', () => {
        instance.removeListener('error', reject)
        resolve(instance)
      })
    })
  }

  async function start() {
    await ensureConfig()
    if (server) return status()
    error = null
    try {
      server = await listen(config.port)
    } catch (firstError) {
      if (firstError.code !== 'EADDRINUSE') { error = firstError.message; throw firstError }
      server = await listen(0) // porta ocupada: usa qualquer porta livre
    }
    port = server.address().port
    indexHtml = null
    return status()
  }

  async function stop() {
    const current = server
    server = null
    port = null
    viewers.clear()
    if (current) {
      await new Promise((resolve) => {
        current.close(() => resolve())
        current.closeAllConnections?.()
      })
    }
    return status()
  }

  async function regenerateCode() {
    await ensureConfig()
    config.code = newCode()
    failures.clear()
    viewers.clear()
    await writeConfig(userDataPath, config)
    return status()
  }

  async function getStatus() {
    await ensureConfig()
    return status()
  }

  return { start, stop, publish, regenerateCode, getStatus }
}

module.exports = { createLanShare, localAddresses, isLocalClient, readConfig, DEFAULT_PORT }
