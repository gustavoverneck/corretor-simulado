import jsQR from 'jsqr'
import { parseQrPayload } from './utils.js'

export const SHEET = { width: 794, height: 1123 }
export const MARKERS = {
  topLeft: { x: 43, y: 43 },
  topRight: { x: 751, y: 43 },
  bottomLeft: { x: 43, y: 1080 },
  bottomRight: { x: 751, y: 1080 },
}

export function bubbleCenter(questionIndex, optionIndex) {
  const column = questionIndex >= 20 ? 1 : 0
  const row = questionIndex % 20
  return {
    x: 164 + column * 382 + optionIndex * 43,
    y: 425 + row * 29.4,
  }
}

function imageDataFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      const maxDimension = 1800
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(image.naturalWidth * scale)
      canvas.height = Math.round(image.naturalHeight * scale)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve({ canvas, context, data: context.getImageData(0, 0, canvas.width, canvas.height) })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Não foi possível abrir a imagem.'))
    }
    image.src = url
  })
}

function luminance(data, index) {
  return (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) / 255
}

function findCornerMarker(imageData, corner) {
  const { width, height, data } = imageData
  const regionWidth = Math.floor(width * 0.18)
  const regionHeight = Math.floor(height * 0.14)
  const startX = corner.includes('Right') ? width - regionWidth : 0
  const startY = corner.includes('bottom') || corner.includes('Bottom') ? height - regionHeight : 0
  const step = Math.max(2, Math.floor(Math.min(width, height) / 500))
  const points = []
  for (let y = startY; y < startY + regionHeight; y += step) {
    for (let x = startX; x < startX + regionWidth; x += step) {
      const offset = (y * width + x) * 4
      if (luminance(data, offset) < 0.14) points.push({ x, y })
    }
  }
  if (points.length < 12) return null

  const expectedX = corner.includes('Right') ? width * 0.945 : width * 0.055
  const expectedY = corner.toLowerCase().includes('bottom') ? height * 0.962 : height * 0.038
  const radius = Math.min(width, height) * 0.045
  const nearby = points.filter((point) => Math.hypot(point.x - expectedX, point.y - expectedY) < radius)
  const source = nearby.length > 8 ? nearby : points
  return {
    x: source.reduce((sum, point) => sum + point.x, 0) / source.length,
    y: source.reduce((sum, point) => sum + point.y, 0) / source.length,
  }
}

function project(point, corners) {
  const u = (point.x - MARKERS.topLeft.x) / (MARKERS.topRight.x - MARKERS.topLeft.x)
  const v = (point.y - MARKERS.topLeft.y) / (MARKERS.bottomLeft.y - MARKERS.topLeft.y)
  const topX = corners.topLeft.x + u * (corners.topRight.x - corners.topLeft.x)
  const topY = corners.topLeft.y + u * (corners.topRight.y - corners.topLeft.y)
  const bottomX = corners.bottomLeft.x + u * (corners.bottomRight.x - corners.bottomLeft.x)
  const bottomY = corners.bottomLeft.y + u * (corners.bottomRight.y - corners.bottomLeft.y)
  return { x: topX + v * (bottomX - topX), y: topY + v * (bottomY - topY) }
}

function sampleDarkness(imageData, center, radius) {
  const { width, height, data } = imageData
  let dark = 0
  let total = 0
  const safeRadius = Math.max(2, radius)
  for (let y = Math.floor(center.y - safeRadius); y <= center.y + safeRadius; y += 1) {
    for (let x = Math.floor(center.x - safeRadius); x <= center.x + safeRadius; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const distance = Math.hypot(x - center.x, y - center.y)
      if (distance > safeRadius) continue
      const value = luminance(data, (y * width + x) * 4)
      dark += 1 - value
      total += 1
    }
  }
  return total ? dark / total : 0
}

export function analyzeMarks(imageData, assessment, answerKey, corners = MARKERS, settings = {}) {
  const horizontalScale = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y) / 708
  const verticalScale = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y) / 1037
  const sampleRadius = Math.max(2.5, 5.2 * Math.min(horizontalScale, verticalScale))
  const markThreshold = Number(settings.markThreshold ?? 0.38)
  const ambiguityThreshold = Number(settings.ambiguityThreshold ?? 0.22)
  const answers = []
  let correct = 0
  let wrong = 0
  let blank = 0
  let multiple = 0
  let uncertain = 0

  for (let question = 0; question < assessment.questionCount; question += 1) {
    const scores = Array.from({ length: assessment.optionCount }, (_, option) => {
      const center = project(bubbleCenter(question, option), corners)
      return { option, value: sampleDarkness(imageData, center, sampleRadius), center }
    })
    const sorted = [...scores].sort((a, b) => b.value - a.value)
    const strong = scores.filter((score) => score.value >= markThreshold)
    const possible = scores.filter((score) => score.value >= ambiguityThreshold)
    let status = 'blank'
    let selected = []
    if (strong.length > 1) {
      status = 'multiple'
      selected = strong.map((item) => String.fromCharCode(65 + item.option))
      multiple += 1
    } else if (strong.length === 1) {
      selected = [String.fromCharCode(65 + strong[0].option)]
      status = selected[0] === answerKey[question] ? 'correct' : 'wrong'
      if (status === 'correct') correct += 1
      else wrong += 1
    } else if (possible.length || (sorted[0].value > 0.15 && sorted[0].value - sorted[1].value < 0.08)) {
      status = 'uncertain'
      selected = possible.length ? possible.map((item) => String.fromCharCode(65 + item.option)) : [String.fromCharCode(65 + sorted[0].option)]
      uncertain += 1
    } else {
      blank += 1
    }
    answers.push({ question: question + 1, selected, expected: answerKey[question], status, scores: scores.map((item) => Number(item.value.toFixed(2))) })
  }

  return { answers, correct, wrong, blank, multiple, uncertain, score: Math.round((correct / assessment.questionCount) * 100) }
}

export async function analyzeAnswerSheet(file, assessment, fallbackIdentity = {}, settings = {}, resolveContext) {
  const { data, canvas } = await imageDataFromFile(file)
  const qr = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })
  const qrIdentity = qr ? parseQrPayload(qr.data) : null
  const identity = qrIdentity || fallbackIdentity
  const resolved = resolveContext?.(identity) || {}
  const activeAssessment = resolved.assessment || assessment
  const activeAnswerKey = resolved.answerKey || activeAssessment.answerKey

  const corners = {
    topLeft: findCornerMarker(data, 'topLeft'),
    topRight: findCornerMarker(data, 'topRight'),
    bottomLeft: findCornerMarker(data, 'bottomLeft'),
    bottomRight: findCornerMarker(data, 'bottomRight'),
  }
  const markersFound = Object.values(corners).filter(Boolean).length
  if (markersFound < 4) {
    corners.topLeft ||= { x: data.width * 0.055, y: data.height * 0.038 }
    corners.topRight ||= { x: data.width * 0.945, y: data.height * 0.038 }
    corners.bottomLeft ||= { x: data.width * 0.055, y: data.height * 0.962 }
    corners.bottomRight ||= { x: data.width * 0.945, y: data.height * 0.962 }
  }

  const marks = analyzeMarks(data, activeAssessment, activeAnswerKey, corners, settings)

  return {
    identity,
    assessmentId: activeAssessment.id,
    classId: resolved.classId || null,
    qrFound: Boolean(qrIdentity),
    rawQr: qr?.data || null,
    markersFound,
    ...marks,
    previewUrl: canvas.toDataURL('image/jpeg', 0.82),
    confidence: Math.max(48, Math.min(99, Math.round(55 + markersFound * 7 + (qrIdentity ? 15 : 0) - marks.uncertain * 1.5))),
  }
}
