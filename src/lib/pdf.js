import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

function canvasToFile(canvas, filename) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Não foi possível converter uma página do PDF em imagem.'))
        return
      }
      resolve(new File([blob], filename, { type: 'image/png', lastModified: Date.now() }))
    }, 'image/png')
  })
}

export async function processPdfPages(file, onPage, { maxPages = 100, scale = 2 } = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({ data: bytes })
  const document = await loadingTask.promise
  const totalPages = document.numPages

  if (totalPages > maxPages) {
    await loadingTask.destroy()
    throw new Error(`O PDF possui ${totalPages} páginas. O limite por lote é ${maxPages}.`)
  }

  const baseName = file.name.replace(/\.pdf$/i, '')
  try {
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const viewport = page.getViewport({ scale })
      const canvas = window.document.createElement('canvas')
      const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise
      const imageFile = await canvasToFile(canvas, `${baseName}-pagina-${String(pageNumber).padStart(3, '0')}.png`)
      await onPage(imageFile, pageNumber, totalPages)
      page.cleanup()
      canvas.width = 1
      canvas.height = 1
    }
  } finally {
    await loadingTask.destroy()
  }

  return totalPages
}
