import { analyzeMarks, bubbleCenter, detectSheetMarkers, getAnswerSheetLayout, MARKERS, SHEET } from '../src/lib/omr.js'
import { createRandomAnswerKey, getAnswerKeyForStudent, getAnswerKeyVersionForStudent } from '../src/lib/assessment.js'
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

function projectTemplatePoint(point, corners) {
  const u = (point.x - MARKERS.topLeft.x) / (MARKERS.topRight.x - MARKERS.topLeft.x)
  const v = (point.y - MARKERS.topLeft.y) / (MARKERS.bottomLeft.y - MARKERS.topLeft.y)
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

function validateCompleteLayout(questionCount, optionCount, background) {
  const corners = {
    topLeft: { x: 74, y: 58 },
    topRight: { x: 932, y: 84 },
    bottomLeft: { x: 49, y: 1262 },
    bottomRight: { x: 960, y: 1291 },
  }
  const image = makeImage(1020, 1360, background)
  const layout = getAnswerSheetLayout(questionCount)
  const horizontalScale = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y) / 708
  const verticalScale = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y) / 1037
  const scale = Math.min(horizontalScale, verticalScale)
  const answerKey = Array.from({ length: questionCount }, (_, index) => String.fromCharCode(65 + ((index * 3 + 1) % optionCount)))

  for (let question = 0; question < questionCount; question += 1) {
    for (let option = 0; option < optionCount; option += 1) {
      const center = projectTemplatePoint(bubbleCenter(question, option, questionCount), corners)
      drawBubbleOutline(image, center, layout.bubbleRadius * scale)
      if (answerKey[question] === String.fromCharCode(65 + option)) {
        fillProjectedBubble(image, center, layout.bubbleRadius * scale * 0.72, question % 2 ? [25, 25, 25] : [30, 45, 155])
      }
    }
  }

  const result = analyzeMarks(image, { questionCount, optionCount }, answerKey, corners)
  if (result.answerSheetFormat !== layout.id || result.correct !== questionCount || result.wrong || result.blank || result.multiple || result.uncertain) {
    throw new Error(`Leitura completa falhou no formato ${layout.id} com ${questionCount} questões: ${JSON.stringify(result)}`)
  }
}

const photographedSheet = makeImage(600, 850)
const expectedCorners = {
  topLeft: [65, 55],
  topRight: [535, 65],
  bottomLeft: [55, 745],
  bottomRight: [545, 760],
}
Object.values(expectedCorners).forEach(([x, y]) => drawMarker(photographedSheet, x, y, 0.6))
drawMarker(photographedSheet, 155, 205, 0.6) // Padrão semelhante dentro do QR não pode confundir os cantos.

const detected = detectSheetMarkers(photographedSheet)
if (!detected) throw new Error('Os quatro marcadores não foram encontrados.')
Object.entries(expectedCorners).forEach(([key, [x, y]]) => {
  if (Math.hypot(detected.corners[key].x - x, detected.corners[key].y - y) > 12) {
    throw new Error(`Marcador ${key} encontrado fora da posição esperada.`)
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

const expectedLayouts = [[10, 1, 20], [20, 1, 20], [21, 2, 20], [40, 2, 20], [41, 3, 20], [60, 3, 20], [61, 3, 30], [90, 3, 30]]
expectedLayouts.forEach(([questionCount, columns, rowsPerColumn]) => {
  const layout = getAnswerSheetLayout(questionCount)
  if (layout.columns !== columns || layout.rowsPerColumn !== rowsPerColumn) {
    throw new Error(`Formato inesperado para ${questionCount} questões: ${JSON.stringify(layout)}`)
  }
  const lastBubble = bubbleCenter(questionCount - 1, 4, questionCount)
  if (lastBubble.x <= MARKERS.topLeft.x || lastBubble.x >= MARKERS.topRight.x || lastBubble.y <= 378 || lastBubble.y >= 998) {
    throw new Error(`Última marca de ${questionCount} questões ficou fora da área útil: ${JSON.stringify(lastBubble)}`)
  }
})

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

const identifiedQr = parseQrPayload(qrPayload('student-1', 'assessment-1'))
const blankQr = parseQrPayload(qrPayload(null, 'assessment-1'))
if (identifiedQr?.studentId !== 'student-1' || identifiedQr.assessmentId !== 'assessment-1'
  || blankQr?.studentId !== null || blankQr.assessmentId !== 'assessment-1') {
  throw new Error('Os QR Codes de folhas identificadas e avulsas não foram interpretados corretamente.')
}

console.log('OMR validado: folhas completas nos 4 formatos, perspectiva, QR avulso, múltiplas versões e aleatorização balanceada.')
