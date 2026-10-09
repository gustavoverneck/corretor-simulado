import jsQR from 'jsqr'
import { getSheetLayout, getSheetFormat, getLegacySheetLayout, validateSheetFormat } from './sheetFormat.js'
import { CANCELLED_ANSWER, summarizeAnswers } from './assessment.js'
import { parseQrPayload } from './utils.js'

export const SHEET = { width: 794, height: 1123 }
export const MARKERS = {
  topLeft: { x: 50, y: 363 },
  topRight: { x: 744, y: 363 },
  bottomLeft: { x: 50, y: 1013 },
  bottomRight: { x: 744, y: 1013 },
}
export const CURRENT_MARKER_LAYOUT = 'answer-grid'

export function bubbleCenter(questionIndex, optionIndex, questionCount = 40) {
  return layoutBubbleCenter(questionIndex, optionIndex, getSheetLayout(getSheetFormat(questionCount, 5)))
}

export function layoutBubbleCenter(questionIndex, optionIndex, layout) {
  const column = Math.floor(questionIndex / layout.rowsPerColumn)
  const row = questionIndex % layout.rowsPerColumn
  return {
    x: layout.optionX + column * layout.columnStep + optionIndex * layout.optionStep,
    y: layout.bubbleY + row * layout.rowStep,
  }
}

function imageDataFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      const maxDimension = 2400
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

function markerGeometryScore(corners, imageData, templateMarkers) {
  const scales = Object.values(corners).map((point) => point.scale)
  if (Math.max(...scales) / Math.min(...scales) > 1.9) return Number.NEGATIVE_INFINITY
  const topWidth = distance(corners.topLeft, corners.topRight)
  const bottomWidth = distance(corners.bottomLeft, corners.bottomRight)
  const leftHeight = distance(corners.topLeft, corners.bottomLeft)
  const rightHeight = distance(corners.topRight, corners.bottomRight)
  const averageWidth = (topWidth + bottomWidth) / 2
  const averageHeight = (leftHeight + rightHeight) / 2
  if (averageWidth < imageData.width * 0.28 || averageHeight < imageData.height * 0.26) return Number.NEGATIVE_INFINITY
  const ratio = averageHeight / averageWidth
  if (ratio < 0.68 || ratio > 2.2) return Number.NEGATIVE_INFINITY
  const expectedRatio = (templateMarkers.bottomLeft.y - templateMarkers.topLeft.y) / (templateMarkers.topRight.x - templateMarkers.topLeft.x)
  const ratioPenalty = Math.abs(Math.log(ratio / expectedRatio))
  const widthPenalty = Math.abs(topWidth - bottomWidth) / averageWidth
  const heightPenalty = Math.abs(leftHeight - rightHeight) / averageHeight
  const levelPenalty = (Math.abs(corners.topLeft.y - corners.topRight.y) + Math.abs(corners.bottomLeft.y - corners.bottomRight.y)) / (averageWidth * 2)
  const sidePenalty = (Math.abs(corners.topLeft.x - corners.bottomLeft.x) + Math.abs(corners.topRight.x - corners.bottomRight.x)) / (averageHeight * 2)
  const coverage = Math.min(1, (averageWidth * averageHeight) / (imageData.width * imageData.height * 0.38))
  const patternScore = Object.values(corners).reduce((sum, marker) => sum + marker.score, 0) / 4
  return patternScore + coverage * 0.7 - ratioPenalty * 1.4 - widthPenalty * 0.7 - heightPenalty * 0.7 - levelPenalty * 0.45 - sidePenalty * 0.25
}

export function detectSheetMarkers(imageData, qrLocation) {
  const { width, height } = imageData
  const integralData = buildDarknessIntegral(imageData)
  const candidates = []
  const qrPoints = qrLocation ? [qrLocation.topLeftCorner, qrLocation.topRightCorner, qrLocation.bottomLeftCorner, qrLocation.bottomRightCorner] : []
  const qrBounds = qrPoints.length ? {
    minX: Math.min(...qrPoints.map((point) => point.x)) - 12,
    maxX: Math.max(...qrPoints.map((point) => point.x)) + 12,
    minY: Math.min(...qrPoints.map((point) => point.y)) - 12,
    maxY: Math.max(...qrPoints.map((point) => point.y)) + 12,
  } : null
  const scales = [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.1, 1.35, 1.65, 2]
  scales.forEach((scale) => {
    const outerRadius = 15 * scale
    const step = Math.max(2, Math.round(outerRadius / 4))
    const margin = Math.ceil(23 * scale)
    for (let y = margin; y < height - margin; y += step) {
      for (let x = margin; x < width - margin; x += step) {
        if (qrBounds && x >= qrBounds.minX && x <= qrBounds.maxX && y >= qrBounds.minY && y <= qrBounds.maxY) continue
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
          const score = markerGeometryScore(corners, imageData, MARKERS)
          if (Number.isFinite(score) && (!best || score > best.score)) best = { corners, score, markerLayout: CURRENT_MARKER_LAYOUT }
        }
      }
    }
  }
  return best
}

function project(point, corners, templateMarkers = MARKERS) {
  const u = (point.x - templateMarkers.topLeft.x) / (templateMarkers.topRight.x - templateMarkers.topLeft.x)
  const v = (point.y - templateMarkers.topLeft.y) / (templateMarkers.bottomLeft.y - templateMarkers.topLeft.y)
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

function sampleDarkness(imageData, center, radius, innerRadius = 0) {
  const { width, height, data } = imageData
  let dark = 0
  let total = 0
  const safeRadius = Math.max(2, radius)
  for (let y = Math.floor(center.y - safeRadius); y <= center.y + safeRadius; y += 1) {
    for (let x = Math.floor(center.x - safeRadius); x <= center.x + safeRadius; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const distance = Math.hypot(x - center.x, y - center.y)
      if (distance > safeRadius || distance < innerRadius) continue
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
      const blueBias = Math.max(0, blue - (red * 0.55 + green * 0.45))
      const saturation = Math.max(red, green, blue) - Math.min(red, green, blue)
      const darkness = 1 - (red * 0.299 + green * 0.587 + blue * 0.114)
      // Somente dominância azul conta como tinta colorida. O cálculo anterior
      // aceitava qualquer cromaticidade e confundia a tonalidade da foto, da
      // mesa ou do papel com caneta em todas as alternativas.
      ink += blueBias * (0.65 + saturation * 0.8 + darkness * 0.35)
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

export function analyzeMarks(imageData, assessment, answerKey, corners = MARKERS, settings = {}, templateMarkers = MARKERS, layout = getSheetLayout(getSheetFormat(assessment.questionCount, assessment.optionCount))) {
  const templateWidth = templateMarkers.topRight.x - templateMarkers.topLeft.x
  const templateHeight = templateMarkers.bottomLeft.y - templateMarkers.topLeft.y
  const horizontalScale = Math.hypot(corners.topRight.x - corners.topLeft.x, corners.topRight.y - corners.topLeft.y) / templateWidth
  const verticalScale = Math.hypot(corners.bottomLeft.x - corners.topLeft.x, corners.bottomLeft.y - corners.topLeft.y) / templateHeight
  const sheetScale = Math.min(horizontalScale, verticalScale)
  const sampleRadius = Math.max(1.8, layout.bubbleRadius * 0.56 * sheetScale)
  // A second pass covers the interior away from the printed letter, while
  // staying inside the outline. It catches partial/off-centre pencil strokes.
  const interiorRadius = layout.bubbleRadius * 0.82 * sheetScale
  const letterRadius = layout.bubbleRadius * 0.38 * sheetScale
  const colorSampleRadius = Math.max(2.4, layout.bubbleRadius * 0.76 * sheetScale)
  const markThreshold = Number(settings.markThreshold ?? 0.38)
  const ambiguityThreshold = Number(settings.ambiguityThreshold ?? 0.22)
  const contrastThreshold = Math.max(0.06, Math.min(0.13, markThreshold * 0.22))
  const possibleContrastThreshold = Math.min(contrastThreshold * 0.92, Math.max(0.045, ambiguityThreshold * 0.34))
  const colorThreshold = Number(settings.colorThreshold ?? 0.065)
  const colorContrastThreshold = Math.max(0.018, colorThreshold * 0.38)
  const possibleColorThreshold = colorThreshold * 0.78
  const possibleColorContrastThreshold = colorContrastThreshold * 0.72
  const interiorThreshold = Math.max(0.12, Math.min(0.22, markThreshold * 0.4))
  const possibleInteriorThreshold = Math.max(0.05, Math.min(0.085, ambiguityThreshold * 0.25))
  const answers = []
  let correct = 0
  let wrong = 0
  let blank = 0
  let multiple = 0
  let uncertain = 0
  let cancelled = 0

  const measured = Array.from({ length: assessment.questionCount }, (_, question) => (
    Array.from({ length: assessment.optionCount }, (_, option) => {
      const center = project(layoutBubbleCenter(question, option, layout), corners, templateMarkers)
      return {
        option,
        value: sampleDarkness(imageData, center, sampleRadius),
        interior: sampleDarkness(imageData, center, interiorRadius, letterRadius),
        color: sampleColorInk(imageData, center, colorSampleRadius),
        center,
      }
    })
  ))

  for (let question = 0; question < assessment.questionCount; question += 1) {
    const scores = measured[question]
    const columnStart = Math.floor(question / layout.rowsPerColumn) * layout.rowsPerColumn
    const columnEnd = Math.min(assessment.questionCount, columnStart + layout.rowsPerColumn)
    const rowBaseline = percentile(scores.map((score) => score.value), 0.25)
    // Black ink lowers the blue channel response. Use the median so it cannot
    // make the remaining blue-tinted paper look like a second weak answer.
    const rowColorBaseline = percentile(scores.map((score) => score.color), 0.5)
    const rowInteriorBaseline = percentile(scores.map((score) => score.interior), 0.25)
    scores.forEach((score) => {
      const nearby = []
      const nearbyColors = []
      const nearbyInterior = []
      for (let index = Math.max(columnStart, question - 6); index < Math.min(columnEnd, question + 7); index += 1) {
        if (measured[index]?.[score.option]) {
          // Estimate paper from the lighter options in each nearby row.
          // Repeated answers (or a one-question sheet) must not become background.
          nearby.push(percentile(measured[index].map((item) => item.value), 0.25))
          nearbyColors.push(measured[index][score.option].color)
          nearbyInterior.push(percentile(measured[index].map((item) => item.interior), 0.25))
        }
      }
      score.localBaseline = percentile(nearby, 0.25)
      score.localColorBaseline = percentile(nearbyColors, 0.25)
      score.localInteriorBaseline = percentile(nearbyInterior, 0.25)
      score.rowContrast = score.value - rowBaseline
      score.localContrast = score.value - score.localBaseline
      score.rowColorContrast = score.color - rowColorBaseline
      score.localColorContrast = score.color - score.localColorBaseline
      score.rowInteriorContrast = score.interior - rowInteriorBaseline
      score.localInteriorContrast = score.interior - score.localInteriorBaseline
    })
    // Para cor, o fundo correto é a própria linha: todas as alternativas estão
    // sob a mesma luz. Comparar com outras questões deixava sombras verticais e
    // diferenças da câmera parecerem tinta azul.
    const hasBlueInk = (score, threshold, contrast) => score.color >= threshold && score.rowColorContrast >= contrast
    const allOptionsRaised = scores.filter((score) => score.value >= markThreshold && score.localContrast >= 0.105).length >= Math.max(3, assessment.optionCount - 1)
    const strong = scores.filter((score) => (
      hasBlueInk(score, colorThreshold, colorContrastThreshold)
      || (score.rowContrast >= contrastThreshold && score.localContrast >= contrastThreshold)
      || (score.value >= markThreshold && score.rowContrast >= contrastThreshold && score.localContrast >= possibleContrastThreshold)
      || (allOptionsRaised && score.value >= markThreshold && score.localContrast >= 0.085)
      || (score.rowInteriorContrast >= interiorThreshold && score.localInteriorContrast >= interiorThreshold)
    ))
    const possible = scores.filter((score) => (
      hasBlueInk(score, possibleColorThreshold, possibleColorContrastThreshold)
      || (score.rowContrast >= possibleContrastThreshold && score.localContrast >= 0.07)
      || (score.rowInteriorContrast >= possibleInteriorThreshold && score.localInteriorContrast >= possibleInteriorThreshold)
    ))
    const candidates = scores.filter((score) => strong.includes(score) || possible.includes(score))
    let status = 'blank'
    let selected = []
    const annulled = answerKey[question] === null
    const isCancelled = answerKey[question] === CANCELLED_ANSWER
    if (isCancelled) {
      selected = candidates.map((item) => String.fromCharCode(65 + item.option))
      status = 'cancelled'
      cancelled += 1
    } else if (annulled) {
      selected = candidates.map((item) => String.fromCharCode(65 + item.option))
      status = 'correct'
      correct += 1
    } else if (strong.length > 1) {
      status = 'multiple'
      selected = strong.map((item) => String.fromCharCode(65 + item.option))
      multiple += 1
    } else if (strong.length === 1 && candidates.length > 1) {
      // A clear mark must not hide a second, weaker one. Send both to review.
      selected = candidates.map((item) => String.fromCharCode(65 + item.option))
      status = 'uncertain'
      uncertain += 1
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
      annulled,
      cancelled: isCancelled,
      status,
      optionPositions: scores.map((item) => ({
        x: item.center.x,
        y: item.center.y,
        radius: layout.bubbleRadius * sheetScale * 1.3,
      })),
      scores: scores.map((item) => Number(item.value.toFixed(3))),
      colorScores: scores.map((item) => Number(item.color.toFixed(3))),
      interiorScores: scores.map((item) => Number(item.interior.toFixed(3))),
      interiorContrastScores: scores.map((item) => Number(Math.min(item.rowInteriorContrast, item.localInteriorContrast).toFixed(3))),
      contrastScores: scores.map((item) => Number(Math.max(item.rowContrast, item.localContrast).toFixed(3))),
      colorContrastScores: scores.map((item) => Number(item.rowColorContrast.toFixed(3))),
    })
  }

  const gradedTotal = Math.max(0, assessment.questionCount - cancelled)
  return {
    answers, correct, wrong, blank, multiple, uncertain, cancelled, gradedTotal,
    score: gradedTotal ? Math.round((correct / gradedTotal) * 100) : 0,
    answerSheetFormat: layout.id,
  }
}

function cropPixels(imageData, bounds) {
  const x = Math.max(0, Math.floor(bounds.x))
  const y = Math.max(0, Math.floor(bounds.y))
  const width = Math.min(imageData.width - x, Math.ceil(bounds.width))
  const height = Math.min(imageData.height - y, Math.ceil(bounds.height))
  if (width < 30 || height < 30) return null
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row += 1) {
    const offset = ((y + row) * imageData.width + x) * 4
    data.set(imageData.data.subarray(offset, offset + width * 4), row * width * 4)
  }
  return { data, width, height, offsetX: x, offsetY: y }
}

function decodeQrPixels(pixels) {
  if (!pixels) return null
  const decoded = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' })
  if (!decoded || !parseQrPayload(decoded.data)) return null
  if (pixels.offsetX || pixels.offsetY) {
    decoded.location = Object.fromEntries(Object.entries(decoded.location).map(([key, point]) => [key, { x: point.x + (pixels.offsetX || 0), y: point.y + (pixels.offsetY || 0) }]))
  }
  return decoded
}

export function readSheetQr(imageData, corners, templateMarkers = MARKERS) {
  const full = decodeQrPixels(imageData)
  if (full) return full
  // The four OMR targets can resemble QR finders. Isolate the printed QR
  // before retrying, including when marker detection itself has failed.
  if (corners) {
    const area = [{ x: 42, y: 128 }, { x: 212, y: 128 }, { x: 212, y: 309 }, { x: 42, y: 309 }]
      .map((point) => project(point, corners, templateMarkers))
    const minX = Math.min(...area.map((point) => point.x))
    const minY = Math.min(...area.map((point) => point.y))
    const cropped = cropPixels(imageData, { x: minX, y: minY, width: Math.max(...area.map((point) => point.x)) - minX, height: Math.max(...area.map((point) => point.y)) - minY })
    const decoded = decodeQrPixels(cropped)
    if (decoded) return decoded
    // Rectify perspective using the same homography as the answer bubbles.
    const width = 400
    const height = 426
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const source = project({ x: 42 + x / width * 170, y: 128 + y / height * 181 }, corners, templateMarkers)
        const sx = Math.round(source.x)
        const sy = Math.round(source.y)
        if (sx < 0 || sy < 0 || sx >= imageData.width || sy >= imageData.height) continue
        const offset = (sy * imageData.width + sx) * 4
        data.set(imageData.data.subarray(offset, offset + 4), (y * width + x) * 4)
      }
    }
    const rectified = decodeQrPixels({ data, width, height })
    if (rectified) {
      rectified.location = Object.fromEntries(Object.entries(rectified.location).map(([key, point]) => [key, project({ x: 42 + point.x / width * 170, y: 128 + point.y / height * 181 }, corners, templateMarkers)]))
      return rectified
    }
  }
  // Independent overlapping regions also support photos with missing targets.
  for (const bounds of [
    { x: 0, y: 0, width: imageData.width, height: imageData.height * .55 },
    { x: 0, y: 0, width: imageData.width * .6, height: imageData.height * .6 },
    { x: imageData.width * .4, y: 0, width: imageData.width * .6, height: imageData.height * .6 },
    { x: 0, y: imageData.height * .4, width: imageData.width, height: imageData.height * .6 },
  ]) {
    const decoded = decodeQrPixels(cropPixels(imageData, bounds))
    if (decoded) return decoded
  }
  return null
}

export function analyzePrintedSheet(imageData, assessment, answerKey, corners, settings, templateMarkers, sheetFormat) {
  if (!validateSheetFormat(sheetFormat) || sheetFormat.questionCount !== assessment.questionCount || sheetFormat.optionCount !== assessment.optionCount) {
    throw new Error('A estrutura impressa não corresponde ao simulado. Confira a quantidade de questões e alternativas.')
  }
  return analyzeMarks(imageData, assessment, answerKey, corners, settings, templateMarkers, getSheetLayout(sheetFormat))
}

export function requireCurrentQr(payload) {
  const identity = parseQrPayload(payload)
  if (identity?.version === 1) throw new Error('QR antigo v1 identificado. Esse formato não registra a grade impressa; gere uma nova folha para evitar corrigir posições incorretas.')
  if (identity) return identity
  throw new Error('QR atual não reconhecido ou inválido. Use uma folha gerada no formato atual e digitalize novamente com o QR completo e nítido.')
}

export function analyzeSheetImage(data, assessment, fallbackIdentity = {}, settings = {}, resolveContext) {
  let qr = readSheetQr(data)
  let detectedMarkers = detectSheetMarkers(data, qr?.location)
  const estimatedCorners = Object.fromEntries(Object.entries(MARKERS).map(([key, point]) => [key, { x: data.width * point.x / SHEET.width, y: data.height * point.y / SHEET.height }]))
  if (!qr) {
    qr = readSheetQr(data, detectedMarkers?.corners || estimatedCorners)
    if (qr) detectedMarkers = detectSheetMarkers(data, qr.location)
  }
  const corners = detectedMarkers?.corners || estimatedCorners
  const markersFound = detectedMarkers ? 4 : 0
  const qrIdentity = requireCurrentQr(qr?.data)
  const identity = { ...qrIdentity, studentId: qrIdentity.studentId || fallbackIdentity.studentId || null }
  const resolved = resolveContext?.(identity) || {}
  const activeAssessment = resolved.assessment || assessment
  const activeAnswerKey = resolved.answerKey || activeAssessment.answerKey

  if (qrIdentity && qrIdentity.assessmentId !== activeAssessment.id) throw new Error('O simulado identificado pelo QR não foi encontrado.')

  const sheetFormat = qrIdentity?.sheetFormat || null
  let marks = qrIdentity.version === 2
    ? analyzeMarks(data, activeAssessment, activeAnswerKey, corners, settings, MARKERS, getLegacySheetLayout(activeAssessment.questionCount))
    : analyzePrintedSheet(data, activeAssessment, activeAnswerKey, corners, settings, MARKERS, sheetFormat)
  // Estimated coordinates are only a review aid, never evidence of blank answers.
  if (!detectedMarkers) {
    const answers = marks.answers.map((answer) => ({ ...answer, selected: [], status: 'uncertain' }))
    marks = { ...marks, answers, ...summarizeAnswers(answers) }
  }

  return {
    identity,
    sheetFormat,
    assessmentId: activeAssessment.id,
    classId: resolved.classId || null,
    qrFound: Boolean(qrIdentity),
    studentQrFound: Boolean(qrIdentity?.studentId),
    rawQr: qr?.data || null,
    markersFound,
    markerCorners: detectedMarkers ? Object.fromEntries(Object.entries(corners).map(([key, point]) => [key, { x: Math.round(point.x), y: Math.round(point.y) }])) : null,
    markerLayout: CURRENT_MARKER_LAYOUT,
    alignmentMode: detectedMarkers ? 'answer-grid-markers' : 'estimated',
    ...marks,
    previewWidth: data.width,
    previewHeight: data.height,
    confidence: Math.max(48, Math.min(99, Math.round(55 + markersFound * 7 + (qrIdentity ? 15 : 0) - marks.uncertain * 1.5))),
  }
}

export async function analyzeAnswerSheet(file, assessment, fallbackIdentity = {}, settings = {}, resolveContext) {
  const { data, canvas } = await imageDataFromFile(file)
  const result = analyzeSheetImage(data, assessment, fallbackIdentity, settings, resolveContext)
  return { ...result, previewUrl: canvas.toDataURL('image/jpeg', 0.82) }
}
