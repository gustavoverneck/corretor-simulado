import { analyzePrintedSheet, MARKERS, SHEET, layoutBubbleCenter } from './omr.js'
import { getSheetFormat, getSheetLayout } from './sheetFormat.js'

export function createOmrExamples(createCanvas) {
  const canvas = createCanvas(SHEET.width, SHEET.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const format = getSheetFormat(40, 5)
  const layout = getSheetLayout(format)
  const labels = ['Caneta azul bem preenchida', 'Marca clara', 'Preenchimento na borda', 'Duas marcas nítidas', 'Marca forte e outra fraca', 'Marca sob sombra leve', 'Sem preenchimento', 'Sombra sem preenchimento']
  for (let question = 0; question < 40; question++) {
    if (question === 7) {
      const center = layoutBubbleCenter(question, 0, layout)
      context.fillStyle = '#f0f0f0'
      context.fillRect(center.x - 14, center.y - 14, 28, 28)
    }
    if (question === 5) {
      const center = layoutBubbleCenter(question, 0, layout)
      const gradient = context.createLinearGradient(center.x - 15, 0, center.x + 190, 0)
      gradient.addColorStop(0, '#d7dde4')
      gradient.addColorStop(1, '#e3e8ec')
      context.fillStyle = gradient
      context.fillRect(center.x - 18, center.y - 15, 208, 30)
    }
    for (let option = 0; option < 5; option++) {
      const center = layoutBubbleCenter(question, option, layout)
      context.beginPath()
      context.arc(center.x, center.y, layout.bubbleRadius, 0, Math.PI * 2)
      context.strokeStyle = '#4b5651'
      context.lineWidth = 1.25
      context.stroke()
      context.fillStyle = '#5c6662'
      context.font = '7.5px Arial'
      context.textAlign = 'center'
      context.fillText('ABCDE'[option], center.x, center.y + 3.2)
    }
  }
  const mark = (question, option, radius, offset = 0, color = '#191919') => {
    const center = layoutBubbleCenter(question, option, layout)
    context.beginPath()
    context.arc(center.x, center.y + offset * layout.bubbleRadius, radius * layout.bubbleRadius, 0, Math.PI * 2)
    context.fillStyle = color
    context.fill()
  }
  mark(0, 2, 0.8, 0, '#23318a')
  mark(1, 1, 0.6, 0, '#d2d2d2')
  mark(2, 3, 0.24, 0.78)
  mark(3, 0, 0.8)
  mark(3, 4, 0.8)
  mark(4, 2, 0.8)
  mark(4, 0, 0.24, 0.78)
  mark(5, 3, 0.8, 0, '#23318a')
  return { pixels: context.getImageData(0, 0, canvas.width, canvas.height), preview: canvas.toDataURL('image/png'), corners: MARKERS, format, labels }
}

export function analyzeOmrCalibration(prepared, settings) {
  const assessment = { questionCount: prepared.format.questionCount, optionCount: prepared.format.optionCount }
  // A calibration measures marks only; these placeholder keys never produce grades or submissions.
  const result = analyzePrintedSheet(prepared.pixels, assessment, Array(assessment.questionCount).fill('A'), prepared.corners, settings, MARKERS, prepared.format)
  const answers = prepared.labels ? result.answers.slice(0, prepared.labels.length) : result.answers
  const counts = { marked: 0, uncertain: 0, multiple: 0, blank: 0 }
  for (const answer of answers) counts[calibrationStatus(answer)] += 1
  return { answers, counts }
}

export function calibrationStatus(answer) {
  return ['correct', 'wrong'].includes(answer.status) ? 'marked' : answer.status
}

export function calibrationLabel(answer) {
  const status = calibrationStatus(answer)
  const letters = answer.selected.join(' / ')
  return { marked: `Confirmada: ${letters}`, uncertain: `Revisar: ${letters}`, multiple: `Múltipla: ${letters}`, blank: 'Em branco' }[status]
}
