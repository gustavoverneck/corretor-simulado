// Arquivo das folhas escaneadas: só existe no aplicativo desktop, que grava
// uma cópia do PDF (ou da imagem) numa pasta escolhida pelo professor. Cada
// correção guarda o caminho relativo do arquivo e a página da folha.

function bridge() {
  return typeof window !== 'undefined' ? window.desktopScanArchive || null : null
}

export function isScanArchiveSupported() {
  return Boolean(bridge())
}

function cleanError(error) {
  const message = String(error?.message || error || '')
  return new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'Não foi possível acessar a pasta das folhas.')
}

async function call(method, ...args) {
  const api = bridge()
  if (!api) throw new Error('O arquivo das folhas só está disponível no aplicativo desktop.')
  try {
    return await api[method](...args)
  } catch (error) {
    throw cleanError(error)
  }
}

export const getScanArchiveFolder = () => (bridge() ? call('getFolder') : Promise.resolve(null))
export const chooseScanArchiveFolder = () => call('chooseFolder')
export const clearScanArchiveFolder = () => call('clearFolder')
export const openArchivedScan = (scan) => call('open', scan.path)
export const revealArchivedScan = (scan) => call('reveal', scan.path)

function slug(value, fallback) {
  const text = String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return text || fallback
}

export function archiveFolderName(assessment) {
  return slug(assessment?.code || assessment?.title, 'simulado')
}

export function archiveFilename(file, hash, date = new Date()) {
  const extension = (String(file?.name || '').match(/\.([A-Za-z0-9]{2,5})$/)?.[1] || 'pdf').toLowerCase()
  const base = slug(String(file?.name || '').replace(/\.[^.]+$/, ''), 'folhas')
  const day = date.toISOString().slice(0, 10)
  return `${day}_${base}_${hash.slice(0, 10)}.${extension}`
}

export async function hashBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Copia o arquivo para <pasta>/<simulado>/<data>_<nome>_<hash>.<ext>. O mesmo
// arquivo enviado de novo cai no mesmo nome e não é duplicado.
export async function archiveScanFile(file, assessment) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const hash = await hashBytes(bytes)
  const path = `${archiveFolderName(assessment)}/${archiveFilename(file, hash)}`
  await call('save', path, bytes)
  return path
}

export function scanReference(path, page, sourceType) {
  return path ? { path, page: page || 1, type: sourceType === 'pdf' ? 'pdf' : 'image' } : null
}

// Devolve uma URL de imagem com a página da folha, para mostrar no app.
export async function loadArchivedScanImage(scan) {
  const bytes = await call('read', scan.path)
  if (scan.type !== 'pdf') {
    const extension = scan.path.split('.').pop().toLowerCase()
    const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg'
    return URL.createObjectURL(new Blob([bytes], { type }))
  }
  const { getDocument } = await import('./pdf')
  const loadingTask = getDocument({ data: bytes })
  try {
    const document = await loadingTask.promise
    if (scan.page > document.numPages) throw new Error(`O PDF guardado tem ${document.numPages} página(s); a página ${scan.page} não existe.`)
    const page = await document.getPage(scan.page)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d', { alpha: false })
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    page.cleanup()
    if (!blob) throw new Error('Não foi possível mostrar a página do PDF.')
    return URL.createObjectURL(blob)
  } finally {
    await loadingTask.destroy()
  }
}
