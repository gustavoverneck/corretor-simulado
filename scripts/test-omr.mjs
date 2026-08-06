import { analyzeMarks, bubbleCenter, detectSheetMarkers, MARKERS, SHEET } from '../src/lib/omr.js'

function makeImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255
    data[index + 1] = 255
    data[index + 2] = 255
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

function fillBubble(image, question, option, color) {
  const center = bubbleCenter(question, option)
  for (let y = Math.floor(center.y - 7); y <= center.y + 7; y += 1) {
    for (let x = Math.floor(center.x - 7); x <= center.x + 7; x += 1) {
      if (Math.hypot(x - center.x, y - center.y) <= 7) setPixel(image, x, y, color)
    }
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

console.log('OMR validado: perspectiva, caneta azul, caneta preta, múltipla e branco.')
