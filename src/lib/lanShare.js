// Compartilhamento somente leitura na rede local.
//
// No app desktop, a janela principal liga um pequeno servidor (electron/lanShare.cjs)
// e publica nele uma cópia dos dados a cada alteração. Os outros professores abrem
// o endereço no navegador; a página servida traz <meta name="lan-viewer"> e entra
// no modo de consulta (src/ViewerApp.jsx), que só lê os dados com o código de acesso.

export const LAN_PUBLISH_DELAY_MS = 1500
export const VIEWER_POLL_MS = 15000
const CODE_STORAGE_KEY = 'luma-lan-share-code'

function bridge() {
  return typeof window !== 'undefined' ? window.desktopLanShare || null : null
}

export function isLanShareSupported() {
  return Boolean(bridge())
}

export function isLanViewer() {
  return typeof document !== 'undefined' && Boolean(document.querySelector('meta[name="lan-viewer"]'))
}

function cleanError(error) {
  const message = String(error?.message || error || '')
  if (/EACCES|EADDRINUSE/.test(message)) return new Error('Não foi possível abrir a porta de rede. Feche outros programas que possam estar usando-a e tente de novo.')
  return new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Não foi possível compartilhar na rede local.')
}

async function call(method, ...args) {
  const api = bridge()
  if (!api) throw new Error('O compartilhamento na rede local só está disponível no aplicativo desktop.')
  try {
    return await api[method](...args)
  } catch (error) {
    throw cleanError(error)
  }
}

export const getLanShareStatus = () => call('getStatus')
export const startLanShare = () => call('start')
export const stopLanShare = () => call('stop')
export const regenerateLanShareCode = () => call('regenerateCode')

// Cópia que vai para a rede: tira o que só faz sentido nesta máquina (caminhos das
// folhas escaneadas no disco).
export function prepareSharedData(data) {
  const submissions = Array.isArray(data?.submissions)
    ? data.submissions.map((submission) => {
      if (!submission?.scan) return submission
      const { scan, ...rest } = submission
      return rest
    })
    : data?.submissions
  return { ...data, submissions }
}

export function publishLanShare(data) {
  return call('publish', JSON.stringify(prepareSharedData(data)))
}

// Publica no máximo uma vez a cada LAN_PUBLISH_DELAY_MS, sempre a versão mais nova.
export function createLanPublisher({ publish = publishLanShare, delay = LAN_PUBLISH_DELAY_MS, onError, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null
  let latest = null
  const run = async () => {
    timer = null
    const snapshot = latest
    latest = null
    if (!snapshot) return
    try { await publish(snapshot) } catch (error) { onError?.(error) }
  }
  return {
    changed(data) {
      latest = data
      if (!timer) timer = setTimer(run, delay)
    },
    async now(data) {
      if (timer) { clearTimer(timer); timer = null }
      latest = data
      await run()
    },
    cancel() {
      if (timer) clearTimer(timer)
      timer = null
      latest = null
    },
  }
}

// ---- Lado de quem consulta (navegador de outro professor) ----

export class ViewerAccessError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function viewerFetch(path, code, fetchImpl = fetch) {
  let response
  try {
    response = await fetchImpl(path, { headers: { 'X-Access-Code': code }, cache: 'no-cache' })
  } catch {
    throw new ViewerAccessError('Não foi possível falar com o computador que está compartilhando. Confira se ele está ligado, na mesma rede e com o compartilhamento ativo.', 0)
  }
  if (!response.ok) {
    let message = ''
    try { message = (await response.json()).error || '' } catch { /* sem corpo */ }
    throw new ViewerAccessError(message || `Erro ${response.status} ao carregar os dados.`, response.status)
  }
  return response.json()
}

export function fetchSharedVersion(code, fetchImpl) {
  return viewerFetch('/api/version', code, fetchImpl)
}

export function fetchSharedData(code, fetchImpl) {
  return viewerFetch('/api/data', code, fetchImpl)
}

export function readSavedViewerCode() {
  try { return sessionStorage.getItem(CODE_STORAGE_KEY) || '' } catch { return '' }
}

export function saveViewerCode(code) {
  try {
    if (code) sessionStorage.setItem(CODE_STORAGE_KEY, code)
    else sessionStorage.removeItem(CODE_STORAGE_KEY)
  } catch { /* navegador sem sessionStorage */ }
}
