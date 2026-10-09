import assert from 'node:assert/strict'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { analyzePrintedSheet, detectSheetMarkers, layoutBubbleCenter, MARKERS, SHEET } from '../src/lib/omr.js'
import { getSheetFormat, getSheetLayout } from '../src/lib/sheetFormat.js'

// Entirely synthetic data: no pixels or answers from an uploaded document.
const source = createCanvas(SHEET.width, SHEET.height)
const printed = source.getContext('2d')
printed.fillStyle = '#fff'
printed.fillRect(0, 0, source.width, source.height)
const expected = Array.from({ length: 40 }, (_, index) => 'ABCD'[(index * 3 + 3) % 4])
const assessment = { questionCount: 40, optionCount: 4 }
const format = getSheetFormat(40, 4)
const layout = getSheetLayout(format)
for (const marker of Object.values(MARKERS)) {
  printed.fillStyle = '#000'; printed.fillRect(marker.x - 15, marker.y - 15, 30, 30)
  printed.fillStyle = '#fff'; printed.fillRect(marker.x - 7, marker.y - 7, 14, 14)
  printed.fillStyle = '#000'; printed.fillRect(marker.x - 3, marker.y - 3, 6, 6)
}
for (let question = 0; question < 40; question += 1) {
  for (let option = 0; option < 4; option += 1) {
    const centre = layoutBubbleCenter(question, option, layout)
    printed.beginPath(); printed.arc(centre.x, centre.y, layout.bubbleRadius, 0, Math.PI * 2)
    printed.strokeStyle = '#4b5651'; printed.lineWidth = 1.25; printed.stroke()
    printed.fillStyle = '#5c6662'; printed.font = '7.5px Arial'; printed.textAlign = 'center'
    printed.fillText('ABCD'[option], centre.x, centre.y + 3.2)
    if (expected[question] === 'ABCD'[option]) {
      printed.beginPath(); printed.arc(centre.x, centre.y, layout.bubbleRadius * .65, 0, Math.PI * 2)
      printed.fillStyle = '#191919'; printed.fill()
    }
  }
}
for (const scenario of [
  { label: 'original', scale: 1 },
  { label: 'reduced', scale: .65 },
  { label: 'enlarged', scale: 1.4 },
  { label: 'pale scan', scale: 1, contrast: .35 },
  { label: 'JPEG compression', scale: 1, jpeg: true },
  { label: 'small rotation', scale: 1, rotation: 2 },
]) {
  const canvas = createCanvas(Math.round(source.width * scenario.scale), Math.round(source.height * scenario.scale))
  const context = canvas.getContext('2d')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (scenario.rotation) {
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate(scenario.rotation * Math.PI / 180)
    context.translate(-canvas.width / 2, -canvas.height / 2)
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  if (scenario.jpeg) {
    context.drawImage(await loadImage(canvas.toBuffer('image/jpeg', 35)), 0, 0)
  }
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  if (scenario.contrast) {
    const printedTargets = detectSheetMarkers(pixels)
    assert.ok(printedTargets)
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const x = offset / 4 % pixels.width
      const y = Math.floor(offset / 4 / pixels.width)
      // Keep the printed alignment targets dark, as on a light-pencil sheet.
      if (Object.values(printedTargets.corners).some((point) => Math.abs(x - point.x) < 24 * point.scale && Math.abs(y - point.y) < 24 * point.scale)) continue
      for (let channel = 0; channel < 3; channel += 1) {
        pixels.data[offset + channel] = 255 - (255 - pixels.data[offset + channel]) * scenario.contrast
      }
    }
  }
  const alignment = detectSheetMarkers(pixels)
  assert.ok(alignment, `Quatro marcadores: ${scenario.label}`)
  const result = analyzePrintedSheet(pixels, assessment, expected, alignment.corners, {}, MARKERS, getSheetFormat(40, 4))
  assert.deepEqual(result.answers.map((answer) => answer.selected.join('')), expected, scenario.label)
  assert.equal(result.answers[12].selected[0], 'D', `Questão 13: ${scenario.label}`)
  assert.equal(result.correct, 40, scenario.label)
  assert.equal(result.blank, 0, scenario.label)
  assert.equal(result.uncertain, 0, scenario.label)
}
console.log('Qualidade de leitura: grade sintética validada com escalas, contraste, JPEG e rotação.')
