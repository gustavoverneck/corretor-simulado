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

function buildDarknessIntegral(imageData) {
  const { width, height, data } = imageData
  const stride = width + 1
  const integral = new Float32Array(stride * (height + 1))
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0
    for (let x = 0; x < width; x += 1) {
      rowSum += 1 - luminance(data, (y * width + x) * 4)
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum
    }
  }
  return { integral, stride }
}

function regionStats(integralData, width, height, centerX, centerY, radius) {
  const x0 = Math.max(0, Math.floor(centerX - radius))
  const y0 = Math.max(0, Math.floor(centerY - radius))
  const x1 = Math.min(width, Math.floor(centerX + radius + 1))
  const y1 = Math.min(height, Math.floor(centerY + radius + 1))
  const { integral, stride } = integralData
  const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0]
  return { sum, count: Math.max(1, (x1 - x0) * (y1 - y0)), mean: sum / Math.max(1, (x1 - x0) * (y1 - y0)) }
}

function ringMean(integralData, width, height, centerX, centerY, outerRadius, innerRadius) {
  const outer = regionStats(integralData, width, height, centerX, centerY, outerRadius)
  const inner = regionStats(integralData, width, height, centerX, centerY, innerRadius)
  return (outer.sum - inner.sum) / Math.max(1, outer.count - inner.count)
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

function orderMarkerSet(points) {
  const byY = [...points].sort((first, second) => first.y - second.y)
  const top = byY.slice(0, 2).sort((first, second) => first.x - second.x)
  const bottom = byY.slice(2).sort((first, second) => first.x - second.x)
  return { topLeft: top[0], topRight: top[1], bottomLeft: bottom[0], bottomRight: bottom[1] }
}

function markerGeometryScore(corners, imageData) {
  const topWidth = distance(corners.topLeft, corners.topRight)
  const bottomWidth = distance(corners.bottomLeft, corners.bottomRight)
  const leftHeight = distance(corners.topLeft, corners.bottomLeft)
  const rightHeight = distance(corners.topRight, corners.bottomRight)
  const averageWidth = (topWidth + bottomWidth) / 2
  const averageHeight = (leftHeight + rightHeight) / 2
  if (averageWidth < imageData.width * 0.28 || averageHeight < imageData.height * 0.26) return Number.NEGATIVE_INFINITY
  const ratio = averageHeight / averageWidth
  if (ratio < 0.9 || ratio > 2.2) return Number.NEGATIVE_INFINITY
  const expectedRatio = (MARKERS.bottomLeft.y - MARKERS.topLeft.y) / (MARKERS.topRight.x - MARKERS.topLeft.x)
  const ratioPenalty = Math.abs(Math.log(ratio / expectedRatio))
  const widthPenalty = Math.abs(topWidth - bottomWidth) / averageWidth
  const heightPenalty = Math.abs(leftHeight - rightHeight) / averageHeight
  const levelPenalty = (Math.abs(corners.topLeft.y - corners.topRight.y) + Math.abs(corners.bottomLeft.y - corners.bottomRight.y)) / (averageWidth * 2)
  const sidePenalty = (Math.abs(corners.topLeft.x - corners.bottomLeft.x) + Math.abs(corners.topRight.x - corners.bottomRight.x)) / (averageHeight * 2)
  const coverage = Math.min(1, (averageWidth * averageHeight) / (imageData.width * imageData.height * 0.38))
  const patternScore = Object.values(corners).reduce((sum, marker) => sum + marker.score, 0) / 4
  return patternScore + coverage * 0.7 - ratioPenalty * 1.4 - widthPenalty * 0.7 - heightPenalty * 0.7 - levelPenalty * 0.45 - sidePenalty * 0.25
}

export function detectSheetMarkers(imageData) {
  const { width, height } = imageData
  const integralData = buildDarknessIntegral(imageData)
  const candidates = []
  const scales = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.1, 1.35, 1.65, 2]
  scales.forEach((scale) => {
    const outerRadius = 15 * scale
    const step = Math.max(2, Math.round(outerRadius / 4))
    const margin = Math.ceil(23 * scale)
    for (let y = margin; y < height - margin; y += step) {
      for (let x = margin; x < width - margin; x += step) {
        const center = regionStats(integralData, width, height, x, y, 3 * scale).mean
        if (center < 0.48) continue
        const whiteRing = ringMean(integralData, width, height, x, y, 8 * scale, 4 * scale)
        if (whiteRing > 0.46) continue
        const blackRing = ringMean(integralData, width, height, x, y, 15 * scale, 8 * scale)
        if (blackRing < 0.42) continue
        const surround = ringMean(integralData, width, height, x, y, 21 * scale, 17 * scale)
        const score = center * 0.25 + blackRing * 0.55 + (1 - whiteRing) * 0.14 + (1 - surround) * 0.06
        if (score >= 0.56) candidates.push({ x, y, scale, score })
      }
    }
  })

  candidates.sort((first, second) => second.score - first.score)
  const distinct = []
  candidates.forEach((candidate) => {
    if (distinct.length >= 24) return
    const overlaps = distinct.some((kept) => distance(candidate, kept) < 18 * Math.max(candidate.scale, kept.scale))
    if (!overlaps) distinct.push(candidate)
  })
  if (distinct.length < 4) return null

  let best = null
  for (let first = 0; first < distinct.length - 3; first += 1) {
    for (let second = first + 1; second < distinct.length - 2; second += 1) {
      for (let third = second + 1; third < distinct.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < distinct.length; fourth += 1) {
          const corners = orderMarkerSet([distinct[first], distinct[second], distinct[third], distinct[fourth]])
          const score = markerGeometryScore(corners, imageData)
          if (Number.isFinite(score) && (!best || score > best.score)) best = { corners, score }
        }
      }
    }
  }
  return best
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
  if (nearby.length <= 8) return null
  const source = nearby
  return {
    x: source.reduce((sum, point) => sum + point.x, 0) / source.length,
    y: source.reduce((sum, point) => sum + point.y, 0) / source.length,
  }
}

function project(point, corners) {
  const u = (point.x - MARKERS.topLeft.x) / (MARKERS.topRight.x - MARKERS.topLeft.x)
  const v = (point.y - MARKERS.topLeft.y) / (MARKERS.bottomLeft.y - MARKERS.topLeft.y)
  const topLeft = corners.topLeft
  const topRight = corners.topRight
  const bottomRight = corners.bottomRight
  const bottomLeft = corners.bottomLeft
  const deltaX1 = topRight.x - bottomRight.x
  const deltaX2 = bottomLeft.x - bottomRight.x
  const deltaX3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x
  const deltaY1 = topRight.y - bottomRight.y
  const deltaY2 = bottomLeft.y - bottomRight.y
  const deltaY3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y
  const determinant = deltaX1 * deltaY2 - deltaX2 * deltaY1
  if (Math.abs(determinant) < 0.000001) {
    const topX = topLeft.x + u * (topRight.x - topLeft.x)
    const topY = topLeft.y + u * (topRight.y - topLeft.y)
    const bottomX = bottomLeft.x + u * (bottomRight.x - bottomLeft.x)
    const bottomY = bottomLeft.y + u * (bottomRight.y - bottomLeft.y)
    return { x: topX + v * (bottomX - topX), y: topY + v * (bottomY - topY) }
  }
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

function sampleColorInk(imageData, center, radius) {
  const { width, height, data } = imageData
  let ink = 0
  let total = 0
  const safeRadius = Math.max(2, radius)
  for (let y = Math.floor(center.y - safeRadius); y <= center.y + safeRadius; y += 1) {
    for (let x = Math.floor(center.x - safeRadius); x <= center.x + safeRadius; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height || Math.hypot(x - center.x, y - center.y) > safeRadius) continue
      const offset = (y * width + x) * 4
      const red = data[offset] / 255
      const green = data[offset + 1] / 255
      const blue = data[offset + 2] / 255
      const blueBias = Math.max(0, blue - (red + green) / 2)
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
      ink += Math.max(blueBias, chroma * 0.68)
      total += 1
    }
  }
  return total ? ink / total : 0
}

function percentile(values, ratio) {
  if (!values.length) return 0
  const sorted = [...values].sort((first, second) => first - second)
  const position = (sorted.length - 1) * ratio
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function analyzeMarks(imageData, assessment, answerKey, corners = MARKERS, settings = {}) {
  const horizontalScale = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y) / 708
  const verticalScale = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y) / 1037
  const sampleRadius = Math.max(2.5, 5.2 * Math.min(horizontalScale, verticalScale))
  const colorSampleRadius = Math.max(3.2, 7.2 * Math.min(horizontalScale, verticalScale))
  const markThreshold = Number(settings.markThreshold ?? 0.38)
  const ambiguityThreshold = Number(settings.ambiguityThreshold ?? 0.22)
  const contrastThreshold = Math.max(0.06, Math.min(0.13, markThreshold * 0.22))
  const possibleContrastThreshold = Math.min(contrastThreshold * 0.92, Math.max(0.045, ambiguityThreshold * 0.34))
  const colorThreshold = Number(settings.colorThreshold ?? 0.065)
  const possibleColorThreshold = colorThreshold * 0.8
  const answers = []
  let correct = 0
  let wrong = 0
  let blank = 0
  let multiple = 0
  let uncertain = 0

  const measured = Array.from({ length: assessment.questionCount }, (_, question) => (
    Array.from({ length: assessment.optionCount }, (_, option) => {
      const center = project(bubbleCenter(question, option), corners)
      return {
        option,
        value: sampleDarkness(imageData, center, sampleRadius),
        color: sampleColorInk(imageData, center, colorSampleRadius),
        center,
      }
    })
  ))

  for (let question = 0; question < assessment.questionCount; question += 1) {
    const scores = measured[question]
    const columnStart = question >= 20 ? 20 : 0
    const columnEnd = Math.min(assessment.questionCount, columnStart + 20)
    const rowBaseline = percentile(scores.map((score) => score.value), 0.25)
    scores.forEach((score) => {
      const nearby = []
      for (let index = Math.max(columnStart, question - 6); index < Math.min(columnEnd, question + 7); index += 1) {
        if (measured[index]?.[score.option]) nearby.push(measured[index][score.option].value)
      }
      score.localBaseline = percentile(nearby, 0.25)
      score.rowContrast = score.value - rowBaseline
      score.localContrast = score.value - score.localBaseline
    })
    const allOptionsRaised = scores.filter((score) => score.localContrast >= 0.105).length >= Math.max(3, assessment.optionCount - 1)
    const strong = scores.filter((score) => (
      score.color >= colorThreshold
      || (score.rowContrast >= contrastThreshold && score.localContrast >= contrastThreshold)
      || (allOptionsRaised && score.localContrast >= 0.085)
    ))
    const possible = scores.filter((score) => (
      score.color >= possibleColorThreshold
      || (score.rowContrast >= possibleContrastThreshold && score.localContrast >= 0.07)
    ))
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
    } else if (possible.length) {
      status = 'uncertain'
      selected = possible.map((item) => String.fromCharCode(65 + item.option))
      uncertain += 1
    } else {
      blank += 1
    }
    answers.push({
      question: question + 1,
      selected,
      expected: answerKey[question],
      status,
      scores: scores.map((item) => Number(item.value.toFixed(3))),
      colorScores: scores.map((item) => Number(item.color.toFixed(3))),
      contrastScores: scores.map((item) => Number(Math.max(item.rowContrast, item.localContrast).toFixed(3))),
    })
  }

  return { answers, correct, wrong, blank, multiple, uncertain, score: Math.round((correct / assessment.questionCount) * 100) }
}

function readQrFromSheet(context, imageData, corners) {
  const qrArea = [
    project({ x: 50, y: 135 }, corners),
    project({ x: 205, y: 135 }, corners),
    project({ x: 205, y: 295 }, corners),
    project({ x: 50, y: 295 }, corners),
  ]
  const minX = Math.max(0, Math.floor(Math.min(...qrArea.map((point) => point.x)) - 8))
  const minY = Math.max(0, Math.floor(Math.min(...qrArea.map((point) => point.y)) - 8))
  const maxX = Math.min(imageData.width, Math.ceil(Math.max(...qrArea.map((point) => point.x)) + 8))
  const maxY = Math.min(imageData.height, Math.ceil(Math.max(...qrArea.map((point) => point.y)) + 8))
  if (maxX - minX < 40 || maxY - minY < 40) return null
  const cropped = context.getImageData(minX, minY, maxX - minX, maxY - minY)
  return jsQR(cropped.data, cropped.width, cropped.height, { inversionAttempts: 'attemptBoth' })
}

export async function analyzeAnswerSheet(file, assessment, fallbackIdentity = {}, settings = {}, resolveContext) {
  const { data, canvas, context } = await imageDataFromFile(file)
  const detectedMarkers = detectSheetMarkers(data)
  const corners = detectedMarkers?.corners || {
    topLeft: findCornerMarker(data, 'topLeft'),
    topRight: findCornerMarker(data, 'topRight'),
    bottomLeft: findCornerMarker(data, 'bottomLeft'),
    bottomRight: findCornerMarker(data, 'bottomRight'),
  }
  const markersFound = detectedMarkers ? 4 : Object.values(corners).filter(Boolean).length
  if (markersFound < 4) {
    corners.topLeft ||= { x: data.width * 0.055, y: data.height * 0.038 }
    corners.topRight ||= { x: data.width * 0.945, y: data.height * 0.038 }
    corners.bottomLeft ||= { x: data.width * 0.055, y: data.height * 0.962 }
    corners.bottomRight ||= { x: data.width * 0.945, y: data.height * 0.962 }
  }

  let qr = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })
  if (!qr && detectedMarkers) qr = readQrFromSheet(context, data, corners)
  const qrIdentity = qr ? parseQrPayload(qr.data) : null
  const identity = qrIdentity || fallbackIdentity
  const resolved = resolveContext?.(identity) || {}
  const activeAssessment = resolved.assessment || assessment
  const activeAnswerKey = resolved.answerKey || activeAssessment.answerKey

  const marks = analyzeMarks(data, activeAssessment, activeAnswerKey, corners, settings)

  return {
    identity,
    assessmentId: activeAssessment.id,
    classId: resolved.classId || null,
    qrFound: Boolean(qrIdentity),
    rawQr: qr?.data || null,
    markersFound,
    markerCorners: detectedMarkers ? Object.fromEntries(Object.entries(corners).map(([key, point]) => [key, { x: Math.round(point.x), y: Math.round(point.y) }])) : null,
    alignmentMode: detectedMarkers ? 'sheet-markers' : markersFound === 4 ? 'corner-markers' : 'estimated',
    ...marks,
    previewUrl: canvas.toDataURL('image/jpeg', 0.82),
    confidence: Math.max(48, Math.min(99, Math.round(55 + markersFound * 7 + (qrIdentity ? 15 : 0) - marks.uncertain * 1.5))),
  }
}
