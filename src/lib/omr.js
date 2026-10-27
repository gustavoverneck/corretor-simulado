import jsQR from 'jsqr'
import { getSheetLayout, getSheetFormat, getLegacySheetLayout, validateSheetFormat } from './sheetFormat.js'
import { CANCELLED_ANSWER, summarizeAnswers } from './assessment.js'
import { parseQrPayload } from './utils.js'
import { resolveOmrSettings } from './omrSettings.js'

export const SHEET = { width: 794, height: 1123 }
export const MARKERS = {
  topLeft: { x: 50, y: 363 },
  topRight: { x: 744, y: 363 },
  bottomLeft: { x: 50, y: 1013 },
  bottomRight: { x: 744, y: 1013 },
}
export const CURRENT_MARKER_LAYOUT = 'answer-grid'
// Centre of the printed QR (AnswerSheet draws it at 50,139 with size 156).
const QR_CENTER = { x: 128, y: 217 }
// Printed bubble outlines must line up with the grid or the alignment is rejected.
const MIN_GRID_ALIGNMENT = 0.035

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
  // Targets far smaller than the sheet they would frame are print details.
  const templateWidth = templateMarkers.topRight.x - templateMarkers.topLeft.x
  const sizePenalty = Math.max(0, Math.log((averageWidth / templateWidth) / (scales.reduce((sum, scale) => sum + scale, 0) / 4)) - 0.4)
  return patternScore + coverage * 0.7 - sizePenalty * 0.5 - ratioPenalty * 1.4 - widthPenalty * 0.7 - heightPenalty * 0.7 - levelPenalty * 0.45 - sidePenalty * 0.25
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
  // Filled bubbles and print details also look like small targets, and on a
  // dark scan they can outscore a real marker. Capping each scale keeps the
  // real markers, which share one scale, among the candidates.
  const distinct = []
  const perScale = new Map()
  candidates.forEach((candidate) => {
    if (distinct.length >= 40 || (perScale.get(candidate.scale) || 0) >= 5) return
    const overlaps = distinct.some((kept) => distance(candidate, kept) < 18 * Math.max(candidate.scale, kept.scale))
    if (overlaps) return
    distinct.push(candidate)
    perScale.set(candidate.scale, (perScale.get(candidate.scale) || 0) + 1)
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
  if (!best) return null
  best.corners = refineMarkerCenters(imageData, best.corners)
  if (qrLocation) best.corners = orientCornersByQr(best.corners, qrLocation)
  return best
}

// The candidate search walks a grid of a quarter marker, so each target can be
// off by a few pixels, and the bubble grid inherits that error: a quarter of a
// bubble radius is enough for the interior sample to reach the printed
// outline. Every marker is a symmetric square, so the centroid of its dark
// pixels is its centre at sub-pixel precision.
function refineMarkerCenters(imageData, corners) {
  const { width, height, data } = imageData
  const scale = distance(corners.topLeft, corners.topRight) / (MARKERS.topRight.x - MARKERS.topLeft.x)
  // The printed square is 30 units wide; nothing else dark is printed within 22.
  const half = 20 * scale
  return Object.fromEntries(Object.entries(corners).map(([key, point]) => {
    let center = { x: point.x, y: point.y }
    for (let pass = 0; pass < 3; pass += 1) {
      let sumX = 0
      let sumY = 0
      let total = 0
      for (let y = Math.max(0, Math.floor(center.y - half)); y <= Math.min(height - 1, center.y + half); y += 1) {
        for (let x = Math.max(0, Math.floor(center.x - half)); x <= Math.min(width - 1, center.x + half); x += 1) {
          const darkness = 1 - luminance(data, (y * width + x) * 4)
          if (darkness < 0.5) continue
          sumX += x * darkness
          sumY += y * darkness
          total += darkness
        }
      }
      if (!total) break
      center = { x: sumX / total, y: sumY / total }
    }
    // A stain or a cut marker drags the centroid away: keep the search result.
    return [key, distance(center, point) <= 6 * scale ? { ...point, x: center.x, y: center.y } : point]
  }))
}

// The four targets form a near-square, so a sheet photographed upside down or
// sideways still passes the geometry checks with its corners swapped. The QR
// sits only at the top left: choose the rotation that projects it there.
function orientCornersByQr(corners, qrLocation, templateMarkers = MARKERS) {
  const qrPoints = [qrLocation.topLeftCorner, qrLocation.topRightCorner, qrLocation.bottomRightCorner, qrLocation.bottomLeftCorner]
  const qrCenter = { x: qrPoints.reduce((sum, point) => sum + point.x, 0) / 4, y: qrPoints.reduce((sum, point) => sum + point.y, 0) / 4 }
  const cyclic = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']
  let best = null
  for (let turn = 0; turn < 4; turn += 1) {
    const rotated = Object.fromEntries(cyclic.map((key, index) => [key, corners[cyclic[(index + turn) % 4]]]))
    const offset = distance(project(QR_CENTER, rotated, templateMarkers), qrCenter)
    if (!best || offset < best.offset) best = { corners: rotated, offset }
  }
  return best.corners
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

// How bright the paper is around a bubble: the brightest tenth of a square
// around it, which print, ink and the outline never fill.
function sampleLight(imageData, center, half) {
  const { width, height, data } = imageData
  const stride = Math.max(1, Math.round(half / 6))
  const values = []
  for (let y = Math.floor(center.y - half); y <= center.y + half; y += stride) {
    for (let x = Math.floor(center.x - half); x <= center.x + half; x += stride) {
      if (x >= 0 && y >= 0 && x < width && y < height) values.push(luminance(data, (y * width + x) * 4))
    }
  }
  return Math.max(0.02, percentile(values, 0.9))
}

// The paper ring is split in eight sectors and the darker side is kept: when a
// shadow edge crosses the bubble, its centre is compared with the shaded paper
// instead of reading the shade as ink. A single sector (a stroke that left the
// outline, a neighbouring mark) cannot set the value on its own.
function samplePaper(imageData, center, radius, innerRadius) {
  const { width, height, data } = imageData
  const sums = new Float64Array(8)
  const counts = new Uint32Array(8)
  for (let y = Math.floor(center.y - radius); y <= center.y + radius; y += 1) {
    for (let x = Math.floor(center.x - radius); x <= center.x + radius; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const distance = Math.hypot(x - center.x, y - center.y)
      if (distance > radius || distance < innerRadius) continue
      const sector = Math.floor(((Math.atan2(y - center.y, x - center.x) + Math.PI) / (Math.PI * 2)) * 8) % 8
      sums[sector] += 1 - luminance(data, (y * width + x) * 4)
      counts[sector] += 1
    }
  }
  const sectors = []
  for (let sector = 0; sector < 8; sector += 1) if (counts[sector]) sectors.push(sums[sector] / counts[sector])
  return percentile(sectors, 0.75)
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

// Divides every channel by a smooth estimate of the paper colour, so dim
// photos, gradients and tinted light become white paper with dark targets.
export function normalizeIllumination(imageData) {
  const { width, height, data } = imageData
  const block = Math.max(16, Math.round(Math.max(width, height) / 24))
  const columns = Math.ceil(width / block)
  const rows = Math.ceil(height / block)
  const paper = new Float32Array(columns * rows * 4)
  const histogram = new Uint32Array(64)
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = column * block
      const y0 = row * block
      const x1 = Math.min(width, x0 + block)
      const y1 = Math.min(height, y0 + block)
      histogram.fill(0)
      let total = 0
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          histogram[Math.min(63, Math.floor(luminance(data, (y * width + x) * 4) * 64))] += 1
          total += 1
        }
      }
      // Paper is the brightest tenth of the block: ink, print and noise are darker.
      let bin = 63
      for (let seen = 0; bin > 0; bin -= 1) {
        seen += histogram[bin]
        if (seen >= total * 0.1) break
      }
      let red = 0
      let green = 0
      let blue = 0
      let count = 0
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const offset = (y * width + x) * 4
          if (luminance(data, offset) * 64 < bin) continue
          red += data[offset]
          green += data[offset + 1]
          blue += data[offset + 2]
          count += 1
        }
      }
      const index = (row * columns + column) * 4
      paper[index] = red / Math.max(1, count)
      paper[index + 1] = green / Math.max(1, count)
      paper[index + 2] = blue / Math.max(1, count)
      paper[index + 3] = bin / 64
    }
  }
  // Each block keeps its own paper estimate: borrowing from neighbours would
  // carry lit paper into the edge of a shadow and darken the bubbles there.
  // Bilinear interpolation between block centres already gives a smooth field.
  const field = paper.map((value, index) => (index % 4 === 3 ? value : Math.max(24, value)))
  const output = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y += 1) {
    const gy = Math.max(0, Math.min(rows - 1, (y + 0.5) / block - 0.5))
    const r0 = Math.floor(gy)
    const r1 = Math.min(rows - 1, r0 + 1)
    const fy = gy - r0
    for (let x = 0; x < width; x += 1) {
      const gx = Math.max(0, Math.min(columns - 1, (x + 0.5) / block - 0.5))
      const c0 = Math.floor(gx)
      const c1 = Math.min(columns - 1, c0 + 1)
      const fx = gx - c0
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const top = field[(r0 * columns + c0) * 4 + channel] * (1 - fx) + field[(r0 * columns + c1) * 4 + channel] * fx
        const bottom = field[(r1 * columns + c0) * 4 + channel] * (1 - fx) + field[(r1 * columns + c1) * 4 + channel] * fx
        output[offset + channel] = data[offset + channel] * 255 / (top * (1 - fy) + bottom * fy)
      }
      output[offset + 3] = 255
    }
  }
  return { data: output, width, height }
}

function pixelDarkness(imageData, x, y) {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) return 0
  return 1 - luminance(imageData.data, (py * imageData.width + px) * 4)
}

// Darkness on the printed outline minus the paper just outside it.
const OUTLINE_ANGLES = Array.from({ length: 16 }, (_, step) => [Math.cos(step * Math.PI / 8), Math.sin(step * Math.PI / 8)])

function outlineContrast(imageData, center, radius) {
  let outline = 0
  let outside = 0
  for (const [cos, sin] of OUTLINE_ANGLES) {
    for (const ratio of [0.9, 1, 1.1]) outline += pixelDarkness(imageData, center.x + cos * radius * ratio, center.y + sin * radius * ratio)
    outside += pixelDarkness(imageData, center.x + cos * radius * 1.5, center.y + sin * radius * 1.5)
  }
  return outline / 48 - outside / 16
}

// Four corners cannot follow a curved or wavy sheet. Walk each column from
// the top (closest to the targets) and let every few rows shift by up to
// three quarters of a bubble from the previous ones, to wherever the printed
// outlines are darkest. Smooth drift is followed; a jump to a neighbouring
// bubble is not reachable in one step.
export function projectBubbleGrid(imageData, corners, layout, questionCount, optionCount, templateMarkers = MARKERS) {
  const templateWidth = templateMarkers.topRight.x - templateMarkers.topLeft.x
  const templateHeight = templateMarkers.bottomLeft.y - templateMarkers.topLeft.y
  const horizontalScale = distance(corners.topLeft, corners.topRight) / templateWidth
  const verticalScale = distance(corners.topLeft, corners.bottomLeft) / templateHeight
  const sheetScale = Math.min(horizontalScale, verticalScale)
  const radius = layout.bubbleRadius * sheetScale
  const projected = Array.from({ length: questionCount }, (_, question) => (
    Array.from({ length: optionCount }, (_, option) => project(layoutBubbleCenter(question, option, layout), corners, templateMarkers))
  ))
  const step = radius / 4
  const middle = (optionCount - 1) / 2
  // A row shifts as a whole (x, y) and may stretch sideways (spread per option),
  // which is how a sheet bent across its width moves the outer options.
  const shift = (offset, option) => ({ x: offset.x + offset.spread * (option - middle), y: offset.y })
  const rowScore = (question, offset) => projected[question].reduce((sum, center, option) => {
    const moved = shift(offset, option)
    return sum + outlineContrast(imageData, { x: center.x + moved.x, y: center.y + moved.y }, radius)
  }, 0)
  const largestShift = (offset) => Math.max(...projected[0].map((_, option) => Math.hypot(shift(offset, option).x, offset.y)))
  const none = { x: 0, y: 0, spread: 0 }
  const offsets = Array(questionCount)
  for (let start = 0; start < questionCount; start += layout.rowsPerColumn) {
    const end = Math.min(questionCount, start + layout.rowsPerColumn)
    let previous = none
    for (let question = start; question < end; question += 1) {
      const window = [question - 1, question, question + 1].filter((index) => index >= start && index < end)
      const score = (offset) => window.reduce((sum, index) => sum + rowScore(index, offset), 0)
      const margin = 0.03 * window.length * optionCount
      let best = { offset: previous, score: score(previous) }
      const kept = best.score
      // Translation first, then the sideways stretch around it.
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          if (!dx && !dy) continue
          const offset = { x: previous.x + dx * step, y: previous.y + dy * step, spread: previous.spread }
          const candidate = score(offset)
          if (candidate > best.score) best = { offset, score: candidate }
        }
      }
      const translated = best.offset
      for (const ds of [-2, -1, 1, 2]) {
        const offset = { ...translated, spread: translated.spread + ds * step / 2 }
        const candidate = score(offset)
        if (candidate > best.score) best = { offset, score: candidate }
      }
      // Move only for a clear gain, so print noise cannot make the grid wander.
      if (best.score > kept + margin) previous = best.offset
      // The bubble samples tolerate a third of a radius, and smaller shifts are
      // within the outline search's own noise. Keep the projection unless the
      // shift is larger than that and clearly beats it on these rows.
      offsets[question] = largestShift(previous) >= radius * 0.4 && score(previous) > score(none) + margin ? previous : none
    }
  }
  const centers = projected.map((row, question) => row.map((center, option) => {
    const moved = shift(offsets[question], option)
    return { x: center.x + moved.x, y: center.y + moved.y }
  }))
  return { centers, radius, sheetScale }
}

// Median contrast between each printed bubble outline and the paper just
// outside it. A wrong set of corners places the grid off the outlines and
// the contrast collapses to zero, so the reading cannot be trusted.
export function gridAlignmentScore(imageData, corners, layout, questionCount, optionCount, templateMarkers = MARKERS) {
  const { centers, radius } = projectBubbleGrid(imageData, corners, layout, questionCount, optionCount, templateMarkers)
  const contrasts = []
  for (const row of centers) {
    for (const center of row) {
      const outline = sampleDarkness(imageData, center, radius * 1.15, radius * 0.85)
      const outside = sampleDarkness(imageData, center, radius * 1.55, radius * 1.3)
      contrasts.push(outline - outside)
    }
  }
  return percentile(contrasts, 0.5)
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
  const interiorRadius = layout.bubbleRadius * 0.86 * sheetScale
  const letterRadius = layout.bubbleRadius * 0.38 * sheetScale
  const colorSampleRadius = Math.max(2.4, layout.bubbleRadius * 0.76 * sheetScale)
  // The paper just outside each outline, between neighbouring bubbles. It
  // lies under the same light as the bubble, so a shadow edge cannot raise
  // one option of a row over the others.
  const paperInnerRadius = layout.bubbleRadius * 1.3 * sheetScale
  const paperOuterRadius = Math.max(paperInnerRadius + 1.5, layout.bubbleRadius * 1.55 * sheetScale)
  const { markThreshold, ambiguityThreshold } = resolveOmrSettings(settings)
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

  const { centers } = projectBubbleGrid(imageData, corners, layout, assessment.questionCount, assessment.optionCount, templateMarkers)
  const measured = Array.from({ length: assessment.questionCount }, (_, question) => (
    Array.from({ length: assessment.optionCount }, (_, option) => {
      const center = centers[question][option]
      return {
        option,
        value: sampleDarkness(imageData, center, sampleRadius),
        interior: sampleDarkness(imageData, center, interiorRadius, letterRadius),
        paper: samplePaper(imageData, center, paperOuterRadius, paperInnerRadius),
        light: sampleLight(imageData, center, paperOuterRadius * 1.25),
        color: sampleColorInk(imageData, center, colorSampleRadius),
        center,
      }
    })
  ))

  // Under even light a row is compared by darkness, as always. When the paper
  // around the options of a row differs (a shadow edge crosses it), darkness
  // would rank the shaded options as marks, so that row is compared by the ink
  // above each bubble's own surrounding paper instead.
  measured.flat().forEach((score) => {
    score.ink = score.value - score.paper
    score.interiorInk = score.interior - score.paper
  })
  const contrasts = (scores, question, columnStart, columnEnd, key) => {
    const rowBaseline = percentile(scores.map((score) => score[key]), 0.25)
    return scores.map((score) => {
      const nearby = []
      for (let index = Math.max(columnStart, question - 6); index < Math.min(columnEnd, question + 7); index += 1) {
        // Estimate paper from the lighter options in each nearby row.
        // Repeated answers (or a one-question sheet) must not become background.
        if (measured[index]?.[score.option]) nearby.push(percentile(measured[index].map((item) => item[key]), 0.25))
      }
      return { row: score[key] - rowBaseline, local: score[key] - percentile(nearby, 0.25) }
    })
  }

  for (let question = 0; question < assessment.questionCount; question += 1) {
    const scores = measured[question]
    const columnStart = Math.floor(question / layout.rowsPerColumn) * layout.rowsPerColumn
    const columnEnd = Math.min(assessment.questionCount, columnStart + layout.rowsPerColumn)
    // Black ink lowers the blue channel response. Use the median so it cannot
    // make the remaining blue-tinted paper look like a second weak answer.
    const rowColorBaseline = percentile(scores.map((score) => score.color), 0.5)
    const lights = scores.map((score) => score.light)
    const unevenLight = Math.max(...lights) > Math.min(...lights) * 1.12
    const darkness = contrasts(scores, question, columnStart, columnEnd, unevenLight ? 'ink' : 'value')
    const interior = contrasts(scores, question, columnStart, columnEnd, unevenLight ? 'interiorInk' : 'interior')
    scores.forEach((score, index) => {
      const nearbyColors = []
      for (let row = Math.max(columnStart, question - 6); row < Math.min(columnEnd, question + 7); row += 1) {
        if (measured[row]?.[score.option]) nearbyColors.push(measured[row][score.option].color)
      }
      score.localColorBaseline = percentile(nearbyColors, 0.25)
      score.rowContrast = darkness[index].row
      score.localContrast = darkness[index].local
      score.rowColorContrast = score.color - rowColorBaseline
      score.localColorContrast = score.color - score.localColorBaseline
      score.rowInteriorContrast = interior[index].row
      score.localInteriorContrast = interior[index].local
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
      confidence: Math.round(readingClarity(status, scores) * 100),
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
    readingClarity: answers.length ? answers.reduce((sum, answer) => sum + answer.confidence, 0) / answers.length / 100 : 0,
    score: gradedTotal ? Math.round((correct / gradedTotal) * 100) : 0,
    answerSheetFormat: layout.id,
  }
}

// How clearly the evidence supports the reading, from 0 to 1: the gap
// between the strongest and second strongest option for one mark, the
// distance from any ink for a blank, the second mark for a double one.
// A question sent to review is, by definition, not a clear reading.
function readingClarity(status, scores) {
  if (status === 'cancelled') return 1
  const evidence = scores.map((score) => Math.max(
    Math.min(score.rowContrast, score.localContrast),
    Math.min(score.rowInteriorContrast, score.localInteriorContrast),
  )).sort((first, second) => second - first)
  const clamp = (value) => Math.max(0, Math.min(1, value))
  if (status === 'uncertain') return 0
  if (status === 'multiple') return clamp(evidence[1] / 0.25)
  if (status === 'blank') return clamp(1 - evidence[0] / 0.1)
  // Correct or wrong, including annulled questions that still carry a mark.
  return evidence[0] < 0.05 ? clamp(1 - evidence[0] / 0.1) : clamp((evidence[0] - evidence[1]) / 0.25)
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
  // Alignment runs on the flat-fielded copy, where dim photos and lighting
  // gradients still show four crisp targets. Marks are graded on the original
  // pixels, whose row and neighbourhood baselines already absorb lighting and
  // do not inherit the field's softened response to a hard shadow edge.
  const flat = normalizeIllumination(data)
  let qr = readSheetQr(flat)
  let detectedMarkers = detectSheetMarkers(flat, qr?.location)
  const estimatedCorners = Object.fromEntries(Object.entries(MARKERS).map(([key, point]) => [key, { x: data.width * point.x / SHEET.width, y: data.height * point.y / SHEET.height }]))
  if (!qr) {
    qr = readSheetQr(flat, detectedMarkers?.corners || estimatedCorners)
    if (qr) detectedMarkers = detectSheetMarkers(flat, qr.location)
  }
  const qrIdentity = requireCurrentQr(qr?.data)
  const identity = { ...qrIdentity, studentId: qrIdentity.studentId || fallbackIdentity.studentId || null }
  const resolved = resolveContext?.(identity) || {}
  const activeAssessment = resolved.assessment || assessment
  const activeAnswerKey = resolved.answerKey || activeAssessment.answerKey

  if (qrIdentity && qrIdentity.assessmentId !== activeAssessment.id) throw new Error('O simulado identificado pelo QR não foi encontrado.')

  const sheetFormat = qrIdentity?.sheetFormat || null
  const layout = qrIdentity.version === 2 ? getLegacySheetLayout(activeAssessment.questionCount) : validateSheetFormat(sheetFormat) ? getSheetLayout(sheetFormat) : null
  const gridAlignment = detectedMarkers && layout ? gridAlignmentScore(flat, detectedMarkers.corners, layout, activeAssessment.questionCount, activeAssessment.optionCount) : null
  // Four targets in a plausible shape can still be the wrong four (a QR finder,
  // a dark mark). Without the printed grid under them, nothing is graded.
  if (gridAlignment !== null && gridAlignment < MIN_GRID_ALIGNMENT) detectedMarkers = null
  const corners = detectedMarkers?.corners || estimatedCorners
  const markersFound = detectedMarkers ? 4 : 0
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
    qrCorners: qr?.location ? { topLeft: qr.location.topLeftCorner, topRight: qr.location.topRightCorner } : null,
    markerLayout: CURRENT_MARKER_LAYOUT,
    alignmentMode: detectedMarkers ? 'answer-grid-markers' : 'estimated',
    gridAlignment: gridAlignment === null ? null : Number(gridAlignment.toFixed(3)),
    ...marks,
    previewWidth: data.width,
    previewHeight: data.height,
    // 48–99, as before: estimated framing stays at the floor; otherwise the
    // mean clarity of every question, reduced when the grid fit is weak.
    confidence: detectedMarkers
      ? Math.max(48, Math.min(99, Math.round(48 + 51 * marks.readingClarity * Math.min(1, gridAlignment === null ? 1 : gridAlignment / 0.12))))
      : 48,
  }
}

// Quarter turns (clockwise) that bring a sheet read sideways or upside down
// back upright, from the direction of its top edge between the targets.
export function uprightQuarterTurns(corners) {
  if (!corners) return 0
  const angle = Math.atan2(corners.topRight.y - corners.topLeft.y, corners.topRight.x - corners.topLeft.x)
  return ((4 - Math.round(angle / (Math.PI / 2))) % 4 + 4) % 4
}

export function rotateImageData(imageData, quarterTurns) {
  const turns = ((quarterTurns % 4) + 4) % 4
  if (!turns) return imageData
  const { width, height, data } = imageData
  const outWidth = turns === 2 ? width : height
  const outHeight = turns === 2 ? height : width
  const output = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [nx, ny] = turns === 1 ? [height - 1 - y, x] : turns === 2 ? [width - 1 - x, height - 1 - y] : [y, width - 1 - x]
      const from = (y * width + x) * 4
      output.set(data.subarray(from, from + 4), (ny * outWidth + nx) * 4)
    }
  }
  return { data: output, width: outWidth, height: outHeight }
}

function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  const context = canvas.getContext('2d')
  const target = context.createImageData(imageData.width, imageData.height)
  target.data.set(imageData.data)
  context.putImageData(target, 0, 0)
  return canvas
}

// Reads the sheet and, when it was scanned sideways or upside down, turns the
// page upright and reads it again, so the preview and its marks stand upright.
export function analyzeUprightSheet(data, ...args) {
  const result = analyzeSheetImage(data, ...args)
  // Without the four targets the QR still shows which way is up.
  const turns = uprightQuarterTurns(result.markersFound ? result.markerCorners : result.qrCorners)
  if (!turns) return { result, pixels: data, turns: 0 }
  const pixels = rotateImageData(data, turns)
  return { result: analyzeSheetImage(pixels, ...args), pixels, turns }
}

export async function analyzeAnswerSheet(file, assessment, fallbackIdentity = {}, settings = {}, resolveContext) {
  const { data, canvas } = await imageDataFromFile(file)
  const { result, pixels, turns } = analyzeUprightSheet(data, assessment, fallbackIdentity, settings, resolveContext)
  return { ...result, previewUrl: (turns ? imageDataToCanvas(pixels) : canvas).toDataURL('image/jpeg', 0.82) }
}

export async function prepareOmrCalibration(file) {
  let { data, canvas } = await imageDataFromFile(file)
  let flat = normalizeIllumination(data)
  const turns = uprightQuarterTurns(detectSheetMarkers(flat, readSheetQr(flat)?.location)?.corners)
  if (turns) {
    data = rotateImageData(data, turns)
    canvas = imageDataToCanvas(data)
    flat = normalizeIllumination(data)
  }
  const qr = readSheetQr(flat)
  const identity = requireCurrentQr(qr?.data)
  if (!validateSheetFormat(identity.sheetFormat)) throw new Error('Para testar os ajustes, use uma folha com QR Code no formato atual (v3 ou v4).')
  const markers = detectSheetMarkers(flat, qr?.location)
  if (!markers) throw new Error('Os quatro marcadores precisam estar completos e nítidos para testar a leitura.')
  return { pixels: data, corners: markers.corners, format: identity.sheetFormat, preview: canvas.toDataURL('image/jpeg', 0.9), name: file.name }
}
