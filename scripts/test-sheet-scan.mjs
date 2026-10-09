import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithEsbuild } from 'vite'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import QRCode from 'qrcode'
import { analyzeSheetImage, layoutBubbleCenter, MARKERS, readSheetQr } from '../src/lib/omr.js'
import { getSheetFormat, getSheetLayout, FIXED_SHEET_LAYOUT, getLegacySheetLayout } from '../src/lib/sheetFormat.js'
import { crc32, qrPayload } from '../src/lib/utils.js'

// Render the actual print component, including its vector QR and bubble text.
let source = await readFile(new URL('../src/components/AnswerSheet.jsx', import.meta.url), 'utf8')
source = source.replace('import.meta.env.BASE_URL', "'/'").replace(/from '(.*?)'/g, (match, name) => {
  const target = name.startsWith('.') ? resolve('src/components', `${name}.js`) : import.meta.resolve(name)
  return `from '${name.startsWith('.') ? pathToFileURL(target).href : target}'`
})
let { code } = await transformWithEsbuild(source, 'AnswerSheet.jsx', { jsx: 'automatic', loader: 'jsx' })
code = code.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const { AnswerSheet } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const student = { id: 'student-mjhiv57a-a8bcd', name: 'Aluno de Teste', registration: '123' }
const school = { name: 'Escola de Teste', city: 'Cidade', state: 'ES' }

async function rasterize(svg, scale = 1) {
  const canvas = createCanvas(Math.round(794 * scale), Math.round(1123 * scale))
  const context = canvas.getContext('2d')
  context.drawImage(await loadImage(Buffer.from(svg)), 0, 0, canvas.width, canvas.height)
  return { canvas, context, pixels: context.getImageData(0, 0, canvas.width, canvas.height) }
}

for (const [questionCount, optionCount, scale] of [[10,4,1], [39,5,1], [40,5,1], [45,5,1], [60,5,1], [90,5,1], [45,5,.75], [60,4,1.6]]) {
  const assessment = { id: 'assessment-mjhiv57a-a8bcd', title: 'Simulado de Teste', code: 'SIM01', questionCount, optionCount, answerKey: Array(questionCount).fill('A') }
  const layout = getSheetLayout(getSheetFormat(questionCount, optionCount))
  let svg = renderToStaticMarkup(React.createElement(AnswerSheet, { student, assessment, school, classroom: { name: 'Turma A' } }))
  for (let q = 0; q < questionCount; q += 1) {
    const center = layoutBubbleCenter(q, 0, layout)
    const bubble = `<circle cx="${center.x}" cy="${center.y}" r="${layout.bubbleRadius}" fill="white"`
    assert.ok(svg.includes(bubble), `Bolha impressa Q${q + 1}`)
    svg = svg.replace(bubble, `<circle cx="${center.x}" cy="${center.y}" r="${layout.bubbleRadius}" fill="#181818"`)
  }
  const { pixels, context, canvas } = await rasterize(svg, scale)
  const result = analyzeSheetImage(pixels, assessment)
  assert.equal(result.identity.studentId, student.id)
  assert.equal(result.identity.assessmentId, assessment.id)
  assert.equal(result.markersFound, 4)
  assert.equal(result.correct, questionCount, `Folha impressa ${questionCount} questões, escala ${scale}`)
  assert.equal(result.answerSheetFormat, layout.id)
  for (const q of [0, questionCount - 1]) {
    const printed = layoutBubbleCenter(q, 0, layout)
    assert.ok(Math.hypot(result.answers[q].optionPositions[0].x - printed.x * scale, result.answers[q].optionPositions[0].y - printed.y * scale) < 8)
  }
  if (questionCount === 45 && scale === 1) {
    const blankSvg = renderToStaticMarkup(React.createElement(AnswerSheet, { assessment, school }))
    const blankSheet = await rasterize(blankSvg)
    const blankResult = analyzeSheetImage(blankSheet.pixels, assessment, { studentId: 'manually-selected' })
    assert.equal(blankResult.identity.studentId, 'manually-selected')
    assert.equal(blankResult.studentQrFound, false)
    assert.equal(blankResult.blank, questionCount)
    assert.equal(blankResult.correct, 0)
    // A missing target must not prevent QR identification or fabricate grades.
    context.fillStyle = '#fff'
    context.fillRect(20, 330, 60, 65)
    const missing = analyzeSheetImage(context.getImageData(0,0,canvas.width,canvas.height), assessment)
    assert.equal(missing.qrFound, true)
    assert.equal(missing.markersFound, 0)
    assert.equal(missing.uncertain, questionCount)
    assert.equal(missing.correct, 0)
  }
}

// Scan real QR pixels on historical v2/v3 grids, rather than only parsing text.
for (const version of [2, 3]) {
  const assessment = { id: 'older-assessment', questionCount: 45, optionCount: 5, answerKey: Array(45).fill('B') }
  const layout = version === 2 ? getLegacySheetLayout(45) : FIXED_SHEET_LAYOUT
  const body = `LUMA|2|old-student|${assessment.id}`
  const payload = version === 2 ? `${body}|${crc32(body)}` : qrPayload('old-student', assessment.id, { format: layout.id, questionCount: 45, optionCount: 5 })
  const qr = await QRCode.toString(payload, { type: 'svg', margin: 4, width: 122, errorCorrectionLevel: 'M' })
  const canvas = createCanvas(794,1123)
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'; context.fillRect(0,0,794,1123)
  context.drawImage(await loadImage(Buffer.from(qr)),65,148,122,122)
  for (const marker of Object.values(MARKERS)) {
    context.fillStyle = '#000'; context.fillRect(marker.x-15,marker.y-15,30,30)
    context.fillStyle = '#fff'; context.fillRect(marker.x-7,marker.y-7,14,14)
    context.fillStyle = '#000'; context.fillRect(marker.x-3,marker.y-3,6,6)
  }
  for (let q=0;q<45;q+=1) {
    const center=layoutBubbleCenter(q,1,layout)
    context.beginPath();context.arc(center.x,center.y,layout.bubbleRadius*.8,0,Math.PI*2);context.fill()
  }
  const result=analyzeSheetImage(context.getImageData(0,0,794,1123),assessment)
  assert.equal(result.identity.version,version)
  assert.equal(result.correct,45)
  assert.equal(result.answerSheetFormat,layout.id)
  assert.equal(readSheetQr(context.getImageData(0,0,794,1123))?.data,payload)
}
console.log('Impressão e leitura integradas: QR vetorial, formatos novos/v2/v3, escalas, posições e ausência de marcador validados.')
