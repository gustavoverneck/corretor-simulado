import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { jsPDF } from 'jspdf'
import { createCanvas } from '@napi-rs/canvas'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

// Use the real PDF reader and page rasterizer with a Node canvas adapter.
const canvases = []
globalThis.window = { requestAnimationFrame: (callback) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout, document: { createElement(tag) {
  assert.equal(tag, 'canvas')
  const canvas = createCanvas(1, 1)
  canvas.toBlob = (callback) => callback(new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }))
  canvases.push(canvas)
  return canvas
} } }
globalThis.pdfPageTest = { getDocument }
let source = await readFile(new URL('../src/lib/pdf.js', import.meta.url), 'utf8')
source = source.replace(/^import .*\r?\n/gm, '').replace('GlobalWorkerOptions.workerSrc = pdfWorker', '')
source = `const { getDocument } = globalThis.pdfPageTest;\n${source}`
const { processPdfPages } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const pdf = new jsPDF({ unit: 'mm', format: [20, 20] })
for (let page = 1; page <= 125; page++) {
  if (page > 1) pdf.addPage()
  pdf.rect(3, 3, page % 10 + 1, 4, 'F')
}
const file = new File([pdf.output('arraybuffer')], 'lote.pdf', { type: 'application/pdf' })
const seen = []
let callbacksInFlight = 0
const total = await processPdfPages(file, async (image, page, pageCount) => {
  callbacksInFlight += 1
  assert.equal(callbacksInFlight, 1, 'Páginas devem ser processadas sequencialmente')
  assert.equal(pageCount, 125)
  assert.equal(image.name, `lote-pagina-${String(page).padStart(3, '0')}.png`)
  assert.ok(image.size > 0)
  await Promise.resolve()
  seen.push(page)
  callbacksInFlight -= 1
}, { scale: 0.5 })
assert.equal(total, 125)
assert.deepEqual(seen, Array.from({ length: 125 }, (_, index) => index + 1))
assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1))

await assert.rejects(processPdfPages(file, async () => { throw new Error('Falha no processamento') }, { scale: 0.5 }), /Falha no processamento/)
assert.ok(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1), 'Liberar a imagem também após falhas')
console.log('PDF de 125 páginas validado: leitura integral, ordem sequencial, progresso e liberação das imagens após sucesso ou erro.')
