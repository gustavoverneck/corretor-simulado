// Boletim do aluno em PDF A4: um aluno por página, com evolução entre
// simulados, médias por área comparadas com a turma e as questões erradas do
// último simulado.
import { buildStudentResult } from './studentResult.js'
import { formatDate } from './utils.js'

const PAGE = { width: 210, height: 297, margin: 14 }
const INK = [38, 50, 46]
const MUTED = [118, 130, 125]
const LINE = [205, 213, 209]
const STUDENT = [63, 102, 91]
const CLASS = [150, 160, 156]
const TONES = { red: [166, 84, 77], ochre: [160, 116, 56], green: [63, 121, 104], neutral: [110, 122, 117] }

export const STATUS_LABELS = { done: 'Corrigido', review: 'Em revisão', absent: 'Ausente', pending: 'Sem correção', voided: 'Anulada' }

function text(pdf, value, x, y, { size = 9, bold = false, color = INK, align = 'left', maxWidth } = {}) {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal')
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  let content = String(value ?? '')
  if (maxWidth) while (content.length > 1 && pdf.getTextWidth(content) > maxWidth) content = `${content.slice(0, -2).trimEnd()}…`
  pdf.text(content, x, y, { align, baseline: 'alphabetic' })
}

export function formatDelta(delta) {
  if (delta === null || delta === undefined) return '—'
  return delta > 0 ? `+${delta}` : String(delta)
}

const shortDate = (value) => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '—'

const percent = (value) => value === null || value === undefined ? '—' : `${value}%`

function drawHeader(pdf, { school, report, classroom, issuedAt }) {
  const { margin, width } = PAGE
  text(pdf, school?.name || '', margin, margin + 2, { size: 8, color: MUTED, maxWidth: 120 })
  text(pdf, 'BOLETIM DO ALUNO', width - margin, margin + 2, { size: 8, bold: true, color: MUTED, align: 'right' })
  text(pdf, report.student.name, margin, margin + 11, { size: 15, bold: true, maxWidth: width - margin * 2 })
  const meta = [classroom ? `Turma ${classroom.name}` : '', classroom?.shift, report.student.registration ? `Matrícula ${report.student.registration}` : ''].filter(Boolean).join(' · ')
  text(pdf, meta, margin, margin + 17, { size: 8.5, color: MUTED })
  text(pdf, `Emitido em ${formatDate(issuedAt)}`, width - margin, margin + 17, { size: 8, color: MUTED, align: 'right' })
  pdf.setDrawColor(...LINE)
  pdf.setLineWidth(0.3)
  pdf.line(margin, margin + 21, width - margin, margin + 21)
  return margin + 28
}

function drawSummary(pdf, report, y) {
  const { margin, width } = PAGE
  const boxes = [
    ['MÉDIA DO ALUNO', percent(report.average), `${report.done.length} simulado${report.done.length === 1 ? '' : 's'} corrigido${report.done.length === 1 ? '' : 's'}`],
    ['MÉDIA DA TURMA', percent(report.classAverage), 'nos mesmos simulados'],
    ['ÚLTIMO SIMULADO', percent(report.latest?.score), report.latest ? report.latest.assessment.code || report.latest.assessment.title : '—'],
    ['EVOLUÇÃO', report.delta === null ? '—' : `${formatDelta(report.delta)} pts`, 'em relação ao anterior'],
  ]
  const gap = 3
  const boxWidth = (width - margin * 2 - gap * 3) / 4
  boxes.forEach(([label, value, note], index) => {
    const x = margin + index * (boxWidth + gap)
    pdf.setFillColor(243, 246, 244)
    pdf.roundedRect(x, y, boxWidth, 19, 1.5, 1.5, 'F')
    text(pdf, label, x + 3, y + 5, { size: 6.5, bold: true, color: MUTED })
    text(pdf, value, x + 3, y + 12.5, { size: 13, bold: true })
    text(pdf, note, x + 3, y + 16.6, { size: 6.5, color: MUTED, maxWidth: boxWidth - 6 })
  })
  return y + 25
}

function drawEvolution(pdf, report, y) {
  const points = report.done
  if (points.length < 2) return y
  const { margin, width } = PAGE
  const chart = { left: margin + 9, right: width - margin - 4, top: y + 8, bottom: y + 44 }
  text(pdf, 'Evolução do aproveitamento', margin, y + 3, { size: 10, bold: true })
  pdf.setLineWidth(0.6)
  pdf.setDrawColor(...STUDENT)
  pdf.line(width - margin - 62, y + 2, width - margin - 56, y + 2)
  text(pdf, 'Aluno', width - margin - 54, y + 3, { size: 7, color: MUTED })
  pdf.setDrawColor(...CLASS)
  pdf.setLineDashPattern([1, 1], 0)
  pdf.line(width - margin - 38, y + 2, width - margin - 32, y + 2)
  pdf.setLineDashPattern([], 0)
  text(pdf, 'Média da turma', width - margin - 30, y + 3, { size: 7, color: MUTED })
  const yFor = (value) => chart.bottom - (value / 100) * (chart.bottom - chart.top)
  const xFor = (index) => chart.left + (points.length === 1 ? 0 : index * (chart.right - chart.left) / (points.length - 1))
  pdf.setLineWidth(0.15)
  pdf.setDrawColor(...LINE)
  ;[0, 50, 100].forEach((value) => {
    pdf.line(chart.left, yFor(value), chart.right, yFor(value))
    text(pdf, `${value}%`, chart.left - 2, yFor(value) + 1, { size: 6, color: MUTED, align: 'right' })
  })
  const drawLine = (values, color, dashed) => {
    pdf.setDrawColor(...color)
    pdf.setLineWidth(0.6)
    if (dashed) pdf.setLineDashPattern([1, 1], 0)
    for (let index = 1; index < values.length; index += 1) {
      if (values[index - 1] === null || values[index] === null) continue
      pdf.line(xFor(index - 1), yFor(values[index - 1]), xFor(index), yFor(values[index]))
    }
    pdf.setLineDashPattern([], 0)
  }
  drawLine(points.map((entry) => entry.classScore), CLASS, true)
  drawLine(points.map((entry) => entry.score), STUDENT, false)
  points.forEach((entry, index) => {
    pdf.setFillColor(...STUDENT)
    pdf.circle(xFor(index), yFor(entry.score), 0.9, 'F')
    text(pdf, `${entry.score}%`, xFor(index), yFor(entry.score) - 2, { size: 6.5, bold: true, color: STUDENT, align: 'center' })
    const align = index === 0 ? 'left' : index === points.length - 1 ? 'right' : 'center'
    text(pdf, entry.assessment.code || entry.assessment.title, xFor(index), chart.bottom + 4.5, { size: 6.5, color: MUTED, align, maxWidth: 34 })
  })
  return chart.bottom + 11
}

function drawTable(pdf, { title, columns, rows, y, onNewPage }) {
  const { margin, width, height } = PAGE
  const rowHeight = 6.2
  const headerRow = () => {
    pdf.setFillColor(238, 243, 240)
    pdf.rect(margin, y, width - margin * 2, rowHeight, 'F')
    let x = margin
    columns.forEach((column) => {
      text(pdf, column.label, column.align === 'right' ? x + column.width - 2 : x + 2, y + 4.2, { size: 6.8, bold: true, color: MUTED, align: column.align === 'right' ? 'right' : 'left' })
      x += column.width
    })
    y += rowHeight
  }
  text(pdf, title, margin, y + 3, { size: 10, bold: true })
  y += 6
  headerRow()
  rows.forEach((row) => {
    if (y + rowHeight > height - 16) { y = onNewPage(); headerRow() }
    let x = margin
    columns.forEach((column) => {
      const value = column.value(row)
      text(pdf, value, column.align === 'right' ? x + column.width - 2 : x + 2, y + 4.3, { size: 8, bold: column.bold, color: column.color?.(row) || INK, align: column.align === 'right' ? 'right' : 'left', maxWidth: column.width - 4 })
      x += column.width
    })
    pdf.setDrawColor(...LINE)
    pdf.setLineWidth(0.15)
    pdf.line(margin, y + rowHeight, width - margin, y + rowHeight)
    y += rowHeight
  })
  return y + 7
}

export function wrongQuestions(entry) {
  if (!entry?.submission) return []
  const result = buildStudentResult(entry.submission, entry.assessment)
  return (result?.questions || []).filter((question) => ['wrong', 'multiple', 'blank'].includes(question.outcome))
}

function drawWrongQuestions(pdf, entry, y, onNewPage) {
  const questions = wrongQuestions(entry)
  if (!questions.length) return y
  const { margin, width, height } = PAGE
  if (y + 20 > height - 16) y = onNewPage()
  text(pdf, `Questões a retomar · ${entry.assessment.code || entry.assessment.title}`, margin, y + 3, { size: 10, bold: true })
  text(pdf, 'Marcada / correta', width - margin, y + 3, { size: 7, color: MUTED, align: 'right' })
  y += 7
  const cellWidth = (width - margin * 2) / 6
  questions.forEach((question, index) => {
    const column = index % 6
    if (column === 0 && index > 0) y += 5.5
    if (y + 5 > height - 16) y = onNewPage()
    const marked = question.selected.length ? question.selected.join('+') : 'branco'
    text(pdf, `Q${String(question.number).padStart(2, '0')}  ${marked} / ${question.expected || '—'}`, margin + column * cellWidth, y + 3.5, { size: 7.5, color: question.outcome === 'blank' ? MUTED : INK, maxWidth: cellWidth - 2 })
  })
  return y + 11
}

export async function createStudentReportPdf({ reports, classes = [], school, issuedAt = new Date().toISOString() }) {
  if (!reports.length) throw new Error('Nenhum aluno selecionado para o boletim.')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({ title: reports.length === 1 ? `Boletim - ${reports[0].student.name}` : 'Boletins dos alunos' })
  const { margin, width } = PAGE
  const contentWidth = width - margin * 2
  const showTri = reports.some((report) => report.done.some((entry) => entry.tri?.score))
  reports.forEach((report, index) => {
    if (index > 0) pdf.addPage()
    const classroom = classes.find((item) => item.id === report.student.classId)
    const newPage = () => { pdf.addPage(); return drawHeader(pdf, { school, report, classroom, issuedAt }) }
    let y = drawHeader(pdf, { school, report, classroom, issuedAt })
    if (!report.entries.length) {
      text(pdf, 'Nenhum simulado aplicado à turma deste aluno.', margin, y + 4, { size: 9, color: MUTED })
      return
    }
    y = drawSummary(pdf, report, y)
    y = drawEvolution(pdf, report, y)
    const triWidth = showTri ? 18 : 0
    y = drawTable(pdf, {
      title: 'Por simulado',
      y,
      onNewPage: newPage,
      rows: report.entries,
      columns: [
        { label: 'SIMULADO', width: contentWidth - 102 - triWidth, value: (entry) => entry.assessment.title },
        { label: 'DATA', width: 20, value: (entry) => shortDate(entry.assessment.date) },
        { label: 'ACERTOS', width: 18, align: 'right', value: (entry) => entry.total ? `${entry.correct}/${entry.total}` : '—' },
        { label: 'ALUNO', width: 16, align: 'right', bold: true, value: (entry) => entry.status === 'done' || entry.status === 'review' || entry.status === 'voided' ? percent(entry.score) : '—' },
        { label: 'TURMA', width: 16, align: 'right', value: (entry) => percent(entry.classScore) },
        ...(showTri ? [{ label: 'TRI', width: triWidth, align: 'right', value: (entry) => entry.tri?.score ?? '—' }] : []),
        { label: 'SITUAÇÃO', width: 32, value: (entry) => STATUS_LABELS[entry.status], color: (entry) => entry.status === 'absent' || entry.status === 'voided' ? TONES.red : entry.status === 'done' ? INK : MUTED },
      ],
    })
    if (report.areas.length) {
      y = drawTable(pdf, {
        title: 'Por área de conhecimento',
        y,
        onNewPage: newPage,
        rows: report.areas,
        columns: [
          { label: 'ÁREA', width: contentWidth - 100, value: (area) => area.area },
          { label: 'MÉDIA DO ALUNO', width: 26, align: 'right', bold: true, value: (area) => percent(area.average) },
          { label: 'MÉDIA DA TURMA', width: 26, align: 'right', value: (area) => percent(area.classAverage) },
          { label: 'ÚLTIMO', width: 22, align: 'right', value: (area) => percent(area.latest) },
          { label: 'VARIAÇÃO', width: 26, align: 'right', value: (area) => area.delta === null ? '—' : `${formatDelta(area.delta)} pts`, color: (area) => area.delta < 0 ? TONES.red : area.delta > 0 ? TONES.green : INK },
        ],
      })
    }
    if (report.alerts.length) {
      text(pdf, 'Pontos de atenção', margin, y + 3, { size: 10, bold: true })
      y += 8
      report.alerts.forEach((alert) => {
        if (y > PAGE.height - 20) y = newPage()
        pdf.setFillColor(...TONES[alert.tone])
        pdf.circle(margin + 1.2, y - 1, 0.9, 'F')
        text(pdf, alert.text, margin + 4, y, { size: 8, maxWidth: contentWidth - 4 })
        y += 5
      })
      y += 4
    }
    drawWrongQuestions(pdf, report.latest, y, newPage)
  })
  const total = pdf.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page)
    const triScales = new Set(reports.flatMap((report) => report.done).filter((entry) => entry.tri?.score).map((entry) => entry.tri.scale === 'enem' ? 'enem' : 'grupo'))
    const triNote = !showTri ? '' : triScales.has('enem') && triScales.has('grupo') ? ' TRI: escala do ENEM nos simulados com parâmetros oficiais; nos demais, 500 = média de quem fez a prova.' : triScales.has('enem') ? ' TRI na escala do ENEM (parâmetros oficiais do INEP).' : ' TRI na escala do grupo: 500 = média de quem fez a prova.'
    text(pdf, `Percentuais = acertos sobre questões válidas. Média da turma sem provas anuladas.${triNote}`, margin, PAGE.height - 8, { size: 6.5, color: MUTED })
    text(pdf, `Página ${page} de ${total}`, PAGE.width - margin, PAGE.height - 8, { size: 7, color: MUTED, align: 'right' })
  }
  return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' })
}

export function studentReportFilename(reports, classroom) {
  const slug = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  if (reports.length === 1) return `boletim-${slug(reports[0].student.name)}.pdf`
  return `boletins-${slug(classroom?.name) || 'alunos'}.pdf`
}
