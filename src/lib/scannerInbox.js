// Pasta do scanner (só no aplicativo desktop): o app acompanha a pasta onde o
// scanner salva os arquivos e corrige cada PDF ou imagem novo que aparece.

function bridge() {
  return typeof window !== 'undefined' ? window.desktopScannerInbox || null : null
}

export function isScannerInboxSupported() {
  return Boolean(bridge())
}

function cleanError(error) {
  const message = String(error?.message || error || '')
  return new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Não foi possível acessar a pasta do scanner.')
}

async function call(method, ...args) {
  const api = bridge()
  if (!api) throw new Error('A pasta do scanner só está disponível no aplicativo desktop.')
  try {
    return await api[method](...args)
  } catch (error) {
    throw cleanError(error)
  }
}

export const getScannerInboxStatus = () => call('status')
export const chooseScannerInboxFolder = () => call('chooseFolder')
export const clearScannerInboxFolder = () => call('clearFolder')
export const setScannerInboxAuto = (auto) => call('setAuto', auto)
export const markScannerFilesSeen = (keys) => call('markSeen', keys)
export const revealScannerInbox = () => call('reveal')

export const MAX_IMAGES_PER_JOB = 100

export function isPdfName(name) {
  return /\.pdf$/i.test(String(name || ''))
}

export function mimeTypeFor(name) {
  const extension = String(name || '').split('.').pop().toLowerCase()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

// Escolhe o próximo lote da fila (que vem do mais antigo para o mais novo):
// um PDF sozinho, ou as imagens seguidas até o próximo PDF (no máximo 100),
// que viram um lote de imagens como no envio manual.
export function nextScannerJob(pending = []) {
  if (!pending.length) return []
  if (isPdfName(pending[0].name)) return [pending[0]]
  const job = []
  for (const file of pending) {
    if (isPdfName(file.name) || job.length >= MAX_IMAGES_PER_JOB) break
    job.push(file)
  }
  return job
}

// Lê os arquivos do lote e devolve objetos File, como se tivessem sido
// arrastados para a tela.
export async function readScannerJob(job) {
  const files = []
  for (const item of job) {
    const bytes = await call('read', item.name)
    files.push(new File([bytes], item.name, { type: mimeTypeFor(item.name), lastModified: item.modifiedAt }))
  }
  return files
}
