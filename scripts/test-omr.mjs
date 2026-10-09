import assert from 'node:assert/strict'
import { FIXED_SHEET_LAYOUT, getSheetFormat } from '../src/lib/sheetFormat.js'
import { analyzeMarks, analyzePrintedSheet, requireCurrentQr, bubbleCenter, CURRENT_MARKER_LAYOUT, detectSheetMarkers, MARKERS, SHEET } from '../src/lib/omr.js'
import { CANCELLED_ANSWER, createRandomAnswerKey, getAnswerKeyForStudent, getAnswerKeyVersionForStudent, regradeAnswers } from '../src/lib/assessment.js'
import { parseQrPayload, qrPayload } from '../src/lib/utils.js'

function makeImage(width, height, background = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = background[0]
    data[index + 1] = background[1]
    data[index + 2] = background[2]
    data[index + 3] = 255
  }
  return { width, height, data }
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  const index = (y * image.width + x) * 4
  image.data[index] = color[0]
  image.data[index + 1] = color[1]
  image.data[index + 2] = color[2]
  image.data[index + 3] = 255
}

function drawMarker(image, centerX, centerY, scale) {
  for (let y = Math.floor(centerY - 22 * scale); y <= centerY + 22 * scale; y += 1) {
    for (let x = Math.floor(centerX - 22 * scale); x <= centerX + 22 * scale; x += 1) {
      const distance = Math.max(Math.abs(x - centerX), Math.abs(y - centerY))
      const black = distance <= 15 * scale && (distance >= 8 * scale || distance <= 3 * scale)
      setPixel(image, x, y, black ? [0, 0, 0] : [255, 255, 255])
    }
  }
}

function fillBubble(image, question, option, color, questionCount = 3) {
  const center = bubbleCenter(question, option, questionCount)
  for (let y = Math.floor(center.y - 7); y <= center.y + 7; y += 1) {
    for (let x = Math.floor(center.x - 7); x <= center.x + 7; x += 1) {
      if (Math.hypot(x - center.x, y - center.y) <= 7) setPixel(image, x, y, color)
    }
  }
}

function projectTemplatePoint(point, corners, templateMarkers = MARKERS) {
  const u = (point.x - templateMarkers.topLeft.x) / (templateMarkers.topRight.x - templateMarkers.topLeft.x)
  const v = (point.y - templateMarkers.topLeft.y) / (templateMarkers.bottomLeft.y - templateMarkers.topLeft.y)
  const { topLeft, topRight, bottomLeft, bottomRight } = corners
  const deltaX1 = topRight.x - bottomRight.x
  const deltaX2 = bottomLeft.x - bottomRight.x
  const deltaX3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x
  const deltaY1 = topRight.y - bottomRight.y
  const deltaY2 = bottomLeft.y - bottomRight.y
  const deltaY3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y
  const determinant = deltaX1 * deltaY2 - deltaX2 * deltaY1
  const perspectiveX = (deltaX3 * deltaY2 - deltaX2 * deltaY3) / determinant
  const perspectiveY = (deltaX1 * deltaY3 - deltaX3 * deltaY1) / determinant
  const coefficientX1 = topRight.x - topLeft.x + perspectiveX * topRight.x
  const coefficientX2 = bottomLeft.x - topLeft.x + perspectiveY * bottomLeft.x
  const coefficientY1 = topRight.y - topLeft.y + perspectiveX * topRight.y
  const coefficientY2 = bottomLeft.y - topLeft.y + perspectiveY * bottomLeft.y
  const denominator = perspectiveX * u + perspectiveY * v + 1
  return {
    x: (coefficientX1 * u + coefficientX2 * v + topLeft.x) / denominator,
    y: (coefficientY1 * u + coefficientY2 * v + topLeft.y) / denominator,
  }
}

function drawBubbleOutline(image, center, radius) {
  for (let y = Math.floor(center.y - radius - 1); y <= center.y + radius + 1; y += 1) {
    for (let x = Math.floor(center.x - radius - 1); x <= center.x + radius + 1; x += 1) {
      const distance = Math.hypot(x - center.x, y - center.y)
      if (Math.abs(distance - radius) <= 0.75) setPixel(image, x, y, [78, 86, 82])
    }
  }
}

function fillProjectedBubble(image, center, radius, color) {
  for (let y = Math.floor(center.y - radius); y <= center.y + radius; y += 1) {
    for (let x = Math.floor(center.x - radius); x <= center.x + radius; x += 1) {
      if (Math.hypot(x - center.x, y - center.y) <= radius) setPixel(image, x, y, color)
    }
  }
}

function validateCompleteLayout(questionCount, optionCount, background, templateMarkers = MARKERS) {
  const corners = {
    topLeft: { x: 74, y: 58 },
    topRight: { x: 932, y: 84 },
    bottomLeft: { x: 49, y: 1262 },
    bottomRight: { x: 960, y: 1291 },
  }
  const image = makeImage(1020, 1360, background)
  const layout = FIXED_SHEET_LAYOUT
  const horizontalScale = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y) / (templateMarkers.topRight.x - templateMarkers.topLeft.x)
  const verticalScale = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y) / (templateMarkers.bottomLeft.y - templateMarkers.topLeft.y)
  const scale = Math.min(horizontalScale, verticalScale)
  const answerKey = Array.from({ length: questionCount }, (_, index) => String.fromCharCode(65 + ((index * 3 + 1) % optionCount)))

  for (let question = 0; question < questionCount; question += 1) {
    for (let option = 0; option < optionCount; option += 1) {
      const center = projectTemplatePoint(bubbleCenter(question, option, questionCount), corners, templateMarkers)
      drawBubbleOutline(image, center, layout.bubbleRadius * scale)
      if (answerKey[question] === String.fromCharCode(65 + option)) {
        fillProjectedBubble(image, center, layout.bubbleRadius * scale * 0.72, question % 2 ? [25, 25, 25] : [30, 45, 155])
      }
    }
  }

  const result = analyzeMarks(image, { questionCount, optionCount }, answerKey, corners, {}, templateMarkers)
  result.answers.forEach((answer, question) => {
    answer.optionPositions.forEach((point, option) => {
      const expected = projectTemplatePoint(bubbleCenter(question, option, questionCount), corners, templateMarkers)
      if (Math.hypot(point.x - expected.x, point.y - expected.y) > 0.01 || point.radius <= layout.bubbleRadius * scale) {
        throw new Error(`Posição da marcação visual incorreta na questão ${question + 1}, alternativa ${option}.`)
      }
    })
  })
  const changed = result.answers.map((answer, index) => index === 0 ? { ...answer, selected: [answer.expected === 'A' ? 'B' : 'A'] } : answer)
  const regraded = regradeAnswers(changed, answerKey)
  if (regraded.answers[0].status !== 'wrong' || regraded.answers[0].optionPositions !== result.answers[0].optionPositions) {
    throw new Error('A revisão manual deve atualizar o resultado e preservar as posições das marcações.')
  }
  if (result.answerSheetFormat !== layout.id || result.correct !== questionCount || result.wrong || result.blank || result.multiple || result.uncertain) {
    throw new Error(`Leitura completa falhou no formato ${layout.id} com ${questionCount} questões: ${JSON.stringify(result)}`)
  }
}

const photographedAnswerGrid = makeImage(1020, 1360)
const expectedGridCorners = {
  topLeft: [92, 365],
  topRight: [926, 382],
  bottomLeft: [75, 1142],
  bottomRight: [944, 1161],
}
Object.values(expectedGridCorners).forEach(([x, y]) => drawMarker(photographedAnswerGrid, x, y, 0.72))
;[[130, 190], [230, 190], [130, 290]].forEach(([x, y]) => drawMarker(photographedAnswerGrid, x, y, 0.72)) // Os três finders do QR não podem substituir os marcadores OMR.
const detectedGrid = detectSheetMarkers(photographedAnswerGrid)
if (!detectedGrid || detectedGrid.markerLayout !== CURRENT_MARKER_LAYOUT) {
  throw new Error(`Os marcadores ao redor das respostas não foram reconhecidos: ${JSON.stringify(detectedGrid)}`)
}
Object.entries(expectedGridCorners).forEach(([key, [x, y]]) => {
  if (Math.hypot(detectedGrid.corners[key].x - x, detectedGrid.corners[key].y - y) > 14) {
    throw new Error(`Marcador interno ${key} encontrado fora da posição esperada.`)
  }
})

const answerSheet = makeImage(SHEET.width, SHEET.height)
fillBubble(answerSheet, 0, 0, [35, 35, 145]) // Caneta azul.
fillBubble(answerSheet, 1, 0, [25, 25, 25]) // Caneta preta, marcação múltipla.
fillBubble(answerSheet, 1, 1, [25, 25, 25])
const result = analyzeMarks(answerSheet, { questionCount: 3, optionCount: 4 }, ['A', 'B', 'C'], MARKERS)

if (result.correct !== 1 || result.multiple !== 1 || result.blank !== 1) {
  throw new Error(`Classificação inesperada: ${JSON.stringify(result)}`)
}

const exceptionalKeyResult = analyzeMarks(answerSheet, { questionCount: 3, optionCount: 4 }, [null, CANCELLED_ANSWER, 'C'], MARKERS)
if (exceptionalKeyResult.correct !== 1 || exceptionalKeyResult.cancelled !== 1 || exceptionalKeyResult.gradedTotal !== 2
  || exceptionalKeyResult.multiple !== 0 || exceptionalKeyResult.blank !== 1 || exceptionalKeyResult.score !== 50) {
  throw new Error(`Anulação ou cancelamento calculado incorretamente: ${JSON.stringify(exceptionalKeyResult)}`)
}

const expectedLayouts = [1, 10, 20, 21, 40, 41, 60, 61, 90].map((count) => [count, 3, 30])
expectedLayouts.forEach(([questionCount, columns, rowsPerColumn]) => {
  const layout = FIXED_SHEET_LAYOUT
  if (layout.columns !== columns || layout.rowsPerColumn !== rowsPerColumn) {
    throw new Error(`Formato inesperado para ${questionCount} questões: ${JSON.stringify(layout)}`)
  }
  const lastBubble = bubbleCenter(questionCount - 1, 4, questionCount)
  if (lastBubble.x <= MARKERS.topLeft.x || lastBubble.x >= MARKERS.topRight.x || lastBubble.y <= 378 || lastBubble.y >= 998) {
    throw new Error(`Última marca de ${questionCount} questões ficou fora da área útil: ${JSON.stringify(lastBubble)}`)
  }
})

if (MARKERS.topLeft.y < 300 || MARKERS.bottomLeft.y > 1040
  || MARKERS.topLeft.x < 30 || MARKERS.topRight.x > SHEET.width - 30) {
  throw new Error('Os novos marcadores não ficaram protegidos ao redor do quadro de respostas.')
}

;[[10, 4], [20, 5], [21, 4], [40, 5], [41, 4], [60, 5], [61, 4], [90, 5]].forEach(([questionCount, optionCount]) => {
  validateCompleteLayout(questionCount, optionCount)
})

// Uma foto com balanço de branco azulado não pode transformar todas as
// alternativas em marcações, como ocorria com folhas reais de 10 questões.
validateCompleteLayout(10, 4, [185, 195, 215])

const ninetyQuestionSheet = makeImage(SHEET.width, SHEET.height)
fillBubble(ninetyQuestionSheet, 89, 4, [25, 25, 25], 90)
const ninetyQuestionKey = Array(90).fill('A')
ninetyQuestionKey[89] = 'E'
const ninetyQuestionResult = analyzeMarks(ninetyQuestionSheet, { questionCount: 90, optionCount: 5 }, ninetyQuestionKey, MARKERS)
if (ninetyQuestionResult.correct !== 1 || ninetyQuestionResult.blank !== 89) {
  throw new Error(`Formato de 90 questões não foi reconhecido: ${JSON.stringify(ninetyQuestionResult)}`)
}

// A repeated black answer must not be learned as paper/background.
for (const questionCount of [1, 2, 10, 20, 21, 40, 41, 60, 61, 90]) {
  const image = makeImage(SHEET.width, SHEET.height)
  for (let q = 0; q < questionCount; q += 1) fillBubble(image, q, 0, [25, 25, 25], questionCount)
  const result = analyzeMarks(image, { questionCount, optionCount: 5 }, Array(questionCount).fill('A'))
  if (result.correct !== questionCount) throw new Error(`Respostas repetidas perdidas em ${questionCount} questões.`)
}

// New single-page format: fixed coordinates independent of question count.
for (const questionCount of [1, 10, 20, 21, 30, 31, 40, 41, 60, 61, 90]) {
  for (const optionCount of [4, 5]) {
    const format = getSheetFormat(questionCount, optionCount)
    const payload = qrPayload('student-new', 'assessment-new', format)
    assert.deepEqual(parseQrPayload(payload)?.sheetFormat, format)
    assert.equal(parseQrPayload(payload + 'X'), null)
    const image = makeImage(SHEET.width, SHEET.height)
    const key = Array.from({ length: questionCount }, (_, q) => 'ABCDE'[q % optionCount])
    for (let q = 0; q < questionCount; q += 1) {
      for (let option = 0; option < optionCount; option += 1) {
        const center = { x: 137 + Math.floor(q / 30) * 219 + option * 29, y: 420 + q % 30 * 19.5 }
        drawBubbleOutline(image, center, 7)
        if (option === q % optionCount) fillProjectedBubble(image, center, 5.5, q % 2 ? [25, 25, 25] : [25, 35, 145])
      }
    }
    const assessment = { questionCount, optionCount }
    const result = analyzePrintedSheet(image, assessment, key, MARKERS, {}, MARKERS, format)
    assert.equal(result.correct, questionCount, `Página única de ${questionCount} questões / ${optionCount} alternativas`)
    assert.equal(result.answerSheetFormat, FIXED_SHEET_LAYOUT.id)
    assert.equal(result.answers.at(-1).question, questionCount)
    assert.throws(() => analyzePrintedSheet(image, { ...assessment, questionCount: questionCount + 1 }, key, MARKERS, {}, MARKERS, format), /estrutura impressa/)
  }
}
assert.throws(() => getSheetFormat(91, 5), /inválido/)
assert.throws(() => qrPayload('s', 'a', { format: 'unknown', questionCount: 90, optionCount: 5 }), /inválidos/)
assert.equal(parseQrPayload(qrPayload(null, 'a', getSheetFormat(90, 5))).studentId, null)

// Unsupported or unidentified sheets must never fall back to another grid.
for (const oldQr of ['LUMA|1|student-old|assessment-old|ZQSVZL', 'LUMA|2|student-old|assessment-old|1031XAU']) {
  assert.equal(parseQrPayload(oldQr), null)
  assert.throws(() => requireCurrentQr(oldQr), /Folha antiga não compatível/)
}
assert.throws(() => requireCurrentQr(null), /QR atual não reconhecido/)
assert.throws(() => requireCurrentQr('invalid'), /QR atual não reconhecido/)
assert.throws(() => analyzePrintedSheet(makeImage(SHEET.width, SHEET.height), { questionCount: 10, optionCount: 5 }, Array(10).fill('A'), MARKERS, {}, MARKERS, null), /estrutura impressa/)

const versionedAssessment = {
  id: 'assessment-versioned', questionCount: 2, answerKey: ['A', 'A'],
  answerKeyVersions: [
    { id: 'version-a', label: 'Versão A', answerKey: ['A', 'B'] },
    { id: 'version-b', label: 'Versão B', answerKey: ['C', 'D'] },
  ],
  answerKeyVersionIdsByClass: { 'class-1': ['version-a', 'version-b'], 'class-2': ['version-b'] },
  answerKeyVersionIdByStudent: { 'student-1': 'version-a', 'student-2': 'version-b', 'student-3': 'version-b' },
}
const versionStudents = [
  { id: 'student-1', classId: 'class-1' },
  { id: 'student-2', classId: 'class-1' },
  { id: 'student-3', classId: 'class-2' },
]
if (getAnswerKeyVersionForStudent(versionedAssessment, versionStudents[0])?.label !== 'Versão A'
  || getAnswerKeyVersionForStudent(versionedAssessment, versionStudents[1])?.label !== 'Versão B'
  || getAnswerKeyForStudent(versionedAssessment, versionStudents[2]).join('') !== 'CD') {
  throw new Error('As versões de gabarito não foram resolvidas corretamente por aluno e turma.')
}

const randomKey = createRandomAnswerKey(10, 4, () => 0.37)
const randomKeyCounts = ['A', 'B', 'C', 'D'].map((letter) => randomKey.filter((answer) => answer === letter).length)
if (randomKey.length !== 10 || randomKey.some((answer) => !['A', 'B', 'C', 'D'].includes(answer))
  || Math.max(...randomKeyCounts) - Math.min(...randomKeyCounts) > 1) {
  throw new Error(`Gabarito aleatório inválido ou desbalanceado: ${JSON.stringify(randomKey)}`)
}

const currentFormat = getSheetFormat(90, 5)
const identifiedQr = requireCurrentQr(qrPayload('student-1', 'assessment-1', currentFormat))
const blankQr = requireCurrentQr(qrPayload(null, 'assessment-1', currentFormat))
assert.equal(identifiedQr.studentId, 'student-1')
assert.equal(identifiedQr.version, 3)
assert.equal(blankQr.studentId, null)
assert.deepEqual(blankQr.sheetFormat, currentFormat)

console.log('OMR validado: marcadores, formatos, perspectiva, QR, múltiplos gabaritos, anulações e cancelamentos.')
