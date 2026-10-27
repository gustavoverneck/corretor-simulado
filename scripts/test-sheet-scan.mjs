import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithEsbuild } from 'vite'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import QRCode from 'qrcode'
import { analyzeSheetImage, analyzeUprightSheet, detectSheetMarkers, layoutBubbleCenter, MARKERS, readSheetQr, rotateImageData } from '../src/lib/omr.js'
import { getSheetFormat, getSheetLayout, FIXED_SHEET_LAYOUT, getLegacySheetLayout } from '../src/lib/sheetFormat.js'
import { crc32, qrPayload } from '../src/lib/utils.js'
import { getAssessmentForStudent } from '../src/lib/assessment.js'

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
  // Printed sheets always carry the bubble outlines; the reader checks that
  // the grid it projects lands on them before trusting the four targets.
  context.strokeStyle = '#4b5651'; context.lineWidth = 1.25
  for (let q=0;q<45;q+=1) {
    for (let option=0;option<5;option+=1) {
      const outline=layoutBubbleCenter(q,option,layout)
      context.beginPath();context.arc(outline.x,outline.y,layout.bubbleRadius,0,Math.PI*2);context.stroke()
    }
    const center=layoutBubbleCenter(q,1,layout)
    context.beginPath();context.arc(center.x,center.y,layout.bubbleRadius*.8,0,Math.PI*2);context.fill()
  }
  const result=analyzeSheetImage(context.getImageData(0,0,794,1123),assessment)
  assert.equal(result.identity.version,version)
  assert.equal(result.correct,45)
  assert.equal(result.answerSheetFormat,layout.id)
  assert.equal(readSheetQr(context.getImageData(0,0,794,1123))?.data,payload)
}
// Test the printed outline and letter too: treating their pixels as ink would
// turn every empty sheet into a marked one after widening the sampling area.
for (const questionCount of [40, 60, 90]) {
  const assessment = { id: 'partial-assessment', title: 'Teste de leitura', code: 'OMR', questionCount, optionCount: 4, answerKey: Array(questionCount).fill('D') }
  const layout = getSheetLayout(getSheetFormat(questionCount, 4))
  const svg = renderToStaticMarkup(React.createElement(AnswerSheet, { student, assessment, school }))
  const row = 12
  const radius = layout.bubbleRadius
  const scenarios = [
    { label: 'empty', marks: [], status: 'blank', selected: [] },
    { label: 'off-centre', marks: [{ option: 3, offset: .65, radius: .42 }], status: 'correct', selected: ['D'] },
    { label: 'weak edge', marks: [{ option: 3, offset: .7, radius: .24 }], status: 'uncertain', selected: ['D'] },
    { label: 'dust', marks: [{ option: 3, offset: .65, radius: .08 }], status: 'blank', selected: [] },
    { label: 'clear and weak', marks: [{ option: 0, offset: 0, radius: .8 }, { option: 3, offset: .7, radius: .24 }], status: 'uncertain', selected: ['A', 'D'] },
    { label: 'two clear', marks: [{ option: 0, offset: 0, radius: .8 }, { option: 3, offset: 0, radius: .8 }], status: 'multiple', selected: ['A', 'D'] },
  ]
  for (const scenario of scenarios) {
    const { context, canvas } = await rasterize(svg)
    for (const mark of scenario.marks) {
      const point = layoutBubbleCenter(row, mark.option, layout)
      context.fillStyle = '#191919'
      context.beginPath()
      context.arc(point.x, point.y + mark.offset * radius, radius * mark.radius, 0, Math.PI * 2)
      context.fill()
    }
    const result = analyzeSheetImage(context.getImageData(0, 0, canvas.width, canvas.height), assessment)
    const answer = result.answers[row]
    assert.equal(answer.status, scenario.status, `${questionCount}: ${scenario.label}`)
    assert.deepEqual(answer.selected, scenario.selected, `${questionCount}: ${scenario.label}`)
    assert.equal(result.answers.filter((item) => item.question !== row + 1 && item.status !== 'blank').length, 0, 'As outras questões devem continuar em branco')
  }
}

// The same assessment can print different QR formats and counts per class.
const versionedAssessment = {
  id: 'versioned-assessment', title: 'Multiple structures', code: 'MULTI', questionCount: 10, optionCount: 4,
  classIds: ['a', 'b', 'c'], answerKey: Array(10).fill('A'),
  answerKeyVersions: [10, 45, 90].map((questionCount, index) => ({ id: `v${index}`, label: `V${index}`, questionCount, answerKey: Array(questionCount).fill('A') })),
  answerKeyVersionIdsByClass: { a: ['v0'], b: ['v1'], c: ['v2'] },
}
for (const [index, classId] of ['a', 'b', 'c'].entries()) {
  const versionStudent = { ...student, id: `version-student-${index}`, classId }
  const resolved = getAssessmentForStudent(versionedAssessment, versionStudent)
  const svg = renderToStaticMarkup(React.createElement(AnswerSheet, { student: versionStudent, assessment: versionedAssessment, school }))
  const { pixels } = await rasterize(svg)
  const scanned = analyzeSheetImage(pixels, versionedAssessment, {}, {}, (identity) => {
    assert.equal(identity.studentId, versionStudent.id)
    return { assessment: resolved, answerKey: resolved.answerKey, classId }
  })
  assert.equal(scanned.answers.length, [10, 45, 90][index])
  assert.equal(scanned.blank, resolved.questionCount)
  assert.equal(scanned.identity.studentId, versionStudent.id)
}

// Scans come sideways or upside down: the page is turned upright before reading,
// and the targets are located to a fraction of a pixel at any scan resolution,
// since a few pixels already push the interior sample onto the printed outline.
{
  const questionCount = 40
  const assessment = { id: 'assessment-mjhiv57a-a8bcd', title: 'Rotação', code: 'ROT', questionCount, optionCount: 5, answerKey: Array(questionCount).fill('A') }
  const layout = getSheetLayout(getSheetFormat(questionCount, 5))
  let svg = renderToStaticMarkup(React.createElement(AnswerSheet, { student, assessment, school, classroom: { name: 'Turma A' } }))
  const marks = Array.from({ length: questionCount }, (_, q) => {
    const center = layoutBubbleCenter(q, q % 3, layout)
    return `<circle cx="${center.x}" cy="${center.y}" r="${layout.bubbleRadius * 1.1}" fill="#333"/>`
  })
  svg = svg.slice(0, svg.lastIndexOf('</svg>')) + marks.join('') + '</svg>'
  for (const scale of [1.3, 1.5, 2.07, 2.9]) {
    const { pixels } = await rasterize(svg, scale)
    const markers = detectSheetMarkers(pixels)
    for (const [key, point] of Object.entries(MARKERS)) {
      // Pixel indices sit half a pixel before the continuous coordinates.
      const error = Math.hypot(markers.corners[key].x + 0.5 - point.x * scale, markers.corners[key].y + 0.5 - point.y * scale) / scale
      assert.ok(error < 0.35, `Marcador ${key} com precisão subpixel na escala ${scale}: ${error.toFixed(2)}`)
    }
  }
  const { pixels } = await rasterize(svg, 1.5)
  for (const turn of [0, 1, 2, 3]) {
    const { result, turns, pixels: upright } = analyzeUprightSheet(rotateImageData(pixels, turn), assessment)
    assert.equal(turns, (4 - turn) % 4, `Página girada ${turn * 90}° volta à posição normal`)
    assert.equal(upright.width, pixels.width)
    assert.ok(result.markerCorners.topLeft.x < upright.width / 2 && result.markerCorners.topLeft.y < upright.height / 2)
    result.answers.forEach((answer, q) => assert.deepEqual(answer.selected, ['ABCDE'[q % 3]], `Q${q + 1} girada ${turn * 90}°`))
    assert.equal(result.uncertain + result.multiple, 0)
  }
  // A covered target: nothing is graded, but the QR still turns the page upright.
  const covered = await rasterize(svg, 1.5)
  covered.context.fillStyle = '#fff'
  covered.context.fillRect((MARKERS.bottomRight.x - 20) * 1.5, (MARKERS.bottomRight.y - 20) * 1.5, 60, 60)
  const flipped = analyzeUprightSheet(rotateImageData(covered.context.getImageData(0, 0, covered.canvas.width, covered.canvas.height), 2), assessment)
  assert.equal(flipped.turns, 2, 'Sem um marcador, o QR indica a orientação')
  assert.equal(flipped.result.markersFound, 0)
  assert.equal(flipped.result.uncertain, questionCount)
}

console.log('Impressão e leitura integradas: QR vetorial, formatos novos/v2/v3, versões com contagens distintas, escalas, marcas parciais, duplas, sujeira, posições, páginas giradas, marcadores com precisão subpixel e ausência de marcador validados.')
