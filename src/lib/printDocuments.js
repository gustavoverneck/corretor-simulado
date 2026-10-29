// Documentos de apoio à aplicação: gabarito oficial e lista de presença, por turma, em PDF A4.
import { CANCELLED_ANSWER, getAnswerKeyForClass, getAnswerKeyVersionForStudent, getAnswerKeyVersionsForClass, getAssessmentForVersion, hasCustomAnswerKey } from './assessment.js'
import { getAttendance } from './attendance.js'
import { getQuestionAreas } from './knowledgeAreas.js'
import { formatDate } from './utils.js'

const PAGE = { width: 210, height: 297, margin: 14 }
const INK = [38, 50, 46]
const MUTED = [118, 130, 125]
const LINE = [205, 213, 209]

function byName(first, second) {
  return String(first || '').localeCompare(String(second || ''), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

export function answerLabel(answer) {
  if (answer === null) return 'ANU'
  if (answer === CANCELLED_ANSWER) return 'CAN'
  return answer || '-'
}

// Áreas em faixas contínuas: "Matemática: 1–20".
export function areaRanges(areas) {
  const ranges = []
  areas.forEach((area, index) => {
    const last = ranges[ranges.length - 1]
    if (last && last.area === area && last.end === index) last.end = index + 1
    else ranges.push({ area: area || 'Sem área', start: index + 1, end: index + 1 })
  })
  return ranges
}

function selectedClasses(assessment, classes, classIds) {
  return (assessment.classIds || [])
    .filter((classId) => !classIds || classIds.includes(classId))
    .map((classId) => ({ id: classId, classroom: classes.find((item) => item.id === classId) }))
    .sort((first, second) => byName(first.classroom?.name, second.classroom?.name))
}

export function buildAnswerKeyGroups({ assessment, classes = [], classIds }) {
  return selectedClasses(assessment, classes, classIds).map(({ id, classroom }) => {
    const assigned = getAnswerKeyVersionsForClass(assessment, id)
    const versions = assigned.length ? assigned : [{ id: `class-${id}`, label: hasCustomAnswerKey(assessment, id) ? 'Gabarito da turma' : 'Gabarito', answerKey: getAnswerKeyForClass(assessment, id) }]
    return {
      classId: id,
      className: classroom?.name || 'Turma removida',
      versions: versions.map((version) => {
        const areas = getQuestionAreas(getAssessmentForVersion(assessment, version))
        return {
          id: version.id,
          label: version.label,
          answers: (version.answerKey || []).map(answerLabel),
          areas: areaRanges(areas.slice(0, (version.answerKey || []).length)),
        }
      }),
    }
  })
}

export function buildAttendanceGroups({ assessment, classes = [], students = [], submissions = [], classIds, markAbsent = false }) {
  return selectedClasses(assessment, classes, classIds).map(({ id, classroom }) => {
    const showVersion = getAnswerKeyVersionsForClass(assessment, id).length > 1
    const rows = getAttendance(assessment, students, submissions, id).rows.map(({ student, status }, index) => ({
      number: index + 1,
      name: student.name,
      registration: student.registration || '',
      version: showVersion ? getAnswerKeyVersionForStudent(assessment, student)?.label || '' : '',
      status,
      absent: markAbsent && status === 'absent',
    }))
    const count = (status) => rows.filter((row) => row.status === status).length
    return { classId: id, className: classroom?.name || 'Turma removida', shift: classroom?.shift || '', showVersion, rows, corrected: count('corrected'), absent: count('absent'), pending: count('pending') }
  })
}

function text(pdf, value, x, y, { size = 9, bold = false, color = INK, align = 'left', maxWidth } = {}) {
  pdf.setFont('helvetica', bold ? 'bold' : 'normal')
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  let content = String(value ?? '')
  if (maxWidth) while (content.length > 1 && pdf.getTextWidth(content) > maxWidth) content = `${content.slice(0, -2).trimEnd()}…`
  pdf.text(content, x, y, { align, baseline: 'alphabetic' })
}

function drawHeader(pdf, { school, assessment, documentTitle, className, detail }) {
  const { margin, width } = PAGE
  text(pdf, school?.name || '', margin, margin + 2, { size: 8, color: MUTED, maxWidth: 120 })
  text(pdf, documentTitle.toUpperCase(), width - margin, margin + 2, { size: 8, bold: true, color: MUTED, align: 'right' })
  text(pdf, assessment.title || 'Simulado', margin, margin + 10, { size: 14, bold: true, maxWidth: width - margin * 2 })
  const meta = [assessment.code, assessment.date ? `Aplicação em ${formatDate(assessment.date)}` : '', `${assessment.questionCount} questões`].filter(Boolean).join(' · ')
  text(pdf, meta, margin, margin + 16, { size: 8.5, color: MUTED })
  text(pdf, `Turma ${className}`, margin, margin + 24, { size: 11, bold: true })
  if (detail) text(pdf, detail, width - margin, margin + 24, { size: 8.5, color: MUTED, align: 'right' })
  pdf.setDrawColor(...LINE)
  pdf.setLineWidth(0.3)
  pdf.line(margin, margin + 27, width - margin, margin + 27)
  return margin + 34
}

function drawPageNumbers(pdf) {
  const total = pdf.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page)
    text(pdf, `Página ${page} de ${total}`, PAGE.width - PAGE.margin, PAGE.height - 8, { size: 7, color: MUTED, align: 'right' })
  }
}

// Grade de questões em colunas, com até `rowsPerColumn` linhas cada.
function drawKeyGrid(pdf, answers, x, y, availableWidth) {
  const rowHeight = 6
  const columnCount = Math.min(6, Math.max(1, Math.ceil(answers.length / 15)))
  const rowsPerColumn = Math.ceil(answers.length / columnCount)
  const columnWidth = availableWidth / columnCount
  const cellWidth = Math.min(28, columnWidth - 3)
  for (let column = 0; column < columnCount; column += 1) {
    const left = x + column * columnWidth
    pdf.setFillColor(238, 243, 240)
    pdf.rect(left, y, cellWidth, rowHeight, 'F')
    text(pdf, 'Q', left + 3, y + 4.2, { size: 7, bold: true, color: MUTED })
    text(pdf, 'Resp.', left + cellWidth - 3, y + 4.2, { size: 7, bold: true, color: MUTED, align: 'right' })
    for (let row = 0; row < rowsPerColumn; row += 1) {
      const index = column * rowsPerColumn + row
      if (index >= answers.length) break
      const top = y + rowHeight * (row + 1)
      pdf.setDrawColor(...LINE)
      pdf.setLineWidth(0.2)
      pdf.rect(left, top, cellWidth, rowHeight)
      text(pdf, String(index + 1).padStart(2, '0'), left + 3, top + 4.3, { size: 8.5, color: MUTED })
      text(pdf, answers[index], left + cellWidth - 3, top + 4.4, { size: answers[index].length > 1 ? 8 : 10.5, bold: true, align: 'right' })
    }
  }
  return y + rowHeight * (rowsPerColumn + 1)
}

export async function createAnswerKeyPdf({ assessment, classes, school, classIds }) {
  const groups = buildAnswerKeyGroups({ assessment, classes, classIds })
  if (!groups.length) throw new Error('Selecione ao menos uma turma para imprimir o gabarito.')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({ title: `Gabarito - ${assessment.title}` })
  const contentWidth = PAGE.width - PAGE.margin * 2
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) pdf.addPage()
    const detail = group.versions.length > 1 ? `${group.versions.length} versões` : ''
    let y = drawHeader(pdf, { school, assessment, documentTitle: 'Gabarito oficial', className: group.className, detail })
    group.versions.forEach((version) => {
      const rowsPerColumn = Math.ceil(version.answers.length / Math.min(6, Math.max(1, Math.ceil(version.answers.length / 15))))
      const blockHeight = 10 + 6 * (rowsPerColumn + 1) + 6 + Math.ceil(version.areas.length / 2) * 4.5
      if (y + blockHeight > PAGE.height - 18) {
        pdf.addPage()
        y = drawHeader(pdf, { school, assessment, documentTitle: 'Gabarito oficial', className: group.className, detail })
      }
      text(pdf, version.label, PAGE.margin, y, { size: 11, bold: true })
      y = drawKeyGrid(pdf, version.answers, PAGE.margin, y + 3, contentWidth) + 5
      version.areas.forEach((range, index) => {
        const label = `${range.area}: ${range.start === range.end ? range.start : `${range.start}–${range.end}`}`
        text(pdf, label, PAGE.margin + (index % 2) * (contentWidth / 2), y + Math.floor(index / 2) * 4.5, { size: 7.5, color: MUTED, maxWidth: contentWidth / 2 - 4 })
      })
      y += Math.ceil(version.areas.length / 2) * 4.5 + 7
    })
    const legend = group.versions.some((version) => version.answers.some((answer) => answer === 'ANU' || answer === 'CAN'))
    if (legend) text(pdf, 'ANU = questão anulada (conta como acerto) · CAN = questão cancelada (fora do total)', PAGE.margin, Math.min(y, PAGE.height - 14), { size: 7.5, color: MUTED })
  })
  drawPageNumbers(pdf)
  return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' })
}

function checkbox(pdf, centerX, centerY, checked) {
  const size = 3.8
  pdf.setDrawColor(...INK)
  pdf.setLineWidth(0.3)
  pdf.rect(centerX - size / 2, centerY - size / 2, size, size)
  if (!checked) return
  pdf.setLineWidth(0.55)
  pdf.line(centerX - 1.2, centerY + 0.1, centerX - 0.3, centerY + 1)
  pdf.line(centerX - 0.3, centerY + 1, centerX + 1.4, centerY - 1)
}

// Modelo "signature": lista para os alunos assinarem na aplicação.
// Modelo "checklist": conferência da correção; Corrigido e Ausente já vêm marcados e "Fez a prova" fica
// em branco para comparar com a lista assinada e achar folhas que ainda não foram corrigidas.
export async function createAttendancePdf({ assessment, classes, students, submissions, school, classIds, markAbsent = false, layout = 'signature' }) {
  const checklist = layout === 'checklist'
  const groups = buildAttendanceGroups({ assessment, classes, students, submissions, classIds, markAbsent: markAbsent || checklist })
  if (!groups.length) throw new Error('Selecione ao menos uma turma para imprimir a lista de presença.')
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const documentTitle = checklist ? 'Conferência da correção' : 'Lista de presença'
  pdf.setProperties({ title: `${documentTitle} - ${assessment.title}` })
  const { margin, width, height } = PAGE
  const rowHeight = 8.2
  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) pdf.addPage()
    const detail = [group.shift, `${group.rows.length} aluno${group.rows.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
    const columns = [
      { label: 'Nº', width: 10, value: (row) => String(row.number), align: 'center' },
      { label: 'Aluno', width: group.showVersion ? 70 : 82, value: (row) => row.name },
      { label: 'Matrícula', width: 26, value: (row) => row.registration },
      ...(group.showVersion ? [{ label: 'Versão', width: 18, value: (row) => row.version }] : []),
    ]
    if (checklist) {
      columns.push(
        { label: 'Fez a prova', width: 20, box: () => false },
        { label: 'Corrigido', width: 18, box: (row) => row.status === 'corrected' },
        { label: 'Ausente', width: 16, box: (row) => row.status === 'absent' },
      )
      columns[1].width -= 20
    }
    const lastLabel = checklist ? 'Observação' : 'Assinatura'
    columns.push({ label: lastLabel, width: width - margin * 2 - columns.reduce((sum, column) => sum + column.width, 0), value: (row) => (!checklist && row.absent ? 'AUSENTE' : ''), align: checklist ? 'left' : 'center' })
    const drawTableHeader = (top) => {
      pdf.setFillColor(238, 243, 240)
      pdf.rect(margin, top, width - margin * 2, 7, 'F')
      let x = margin
      columns.forEach((column) => {
        text(pdf, column.label.toUpperCase(), column.box || column.align === 'center' ? x + column.width / 2 : x + 2, top + 4.7, { size: 7, bold: true, color: MUTED, align: column.box ? 'center' : column.align || 'left' })
        x += column.width
      })
      return top + 7
    }
    let y = drawTableHeader(drawHeader(pdf, { school, assessment, documentTitle, className: group.className, detail }) - 3)
    if (!group.rows.length) text(pdf, 'Nenhum aluno ativo nesta turma.', margin + 2, y + 6, { size: 9, color: MUTED })
    group.rows.forEach((row) => {
      if (y + rowHeight > height - 30) {
        pdf.addPage()
        y = drawTableHeader(drawHeader(pdf, { school, assessment, documentTitle, className: group.className, detail }) - 3)
      }
      let x = margin
      if (checklist && row.status === 'pending') {
        pdf.setFillColor(253, 245, 226)
        pdf.rect(margin, y, width - margin * 2, rowHeight, 'F')
      }
      columns.forEach((column) => {
        pdf.setDrawColor(...LINE)
        pdf.setLineWidth(0.2)
        pdf.rect(x, y, column.width, rowHeight)
        if (column.box) {
          checkbox(pdf, x + column.width / 2, y + rowHeight / 2, column.box(row))
          x += column.width
          return
        }
        const value = column.value(row)
        if (value) text(pdf, value, column.align === 'center' ? x + column.width / 2 : x + 2, y + 5.4, { size: column.label === 'Aluno' ? 9 : 8, bold: row.absent && column.label === 'Assinatura', color: column.label === 'Aluno' || column.label === 'Nº' ? INK : MUTED, align: column.align || 'left', maxWidth: column.width - 4 })
        x += column.width
      })
      y += rowHeight
    })
    const footerTop = Math.min(y + 10, height - 24)
    if (checklist) {
      text(pdf, `Corrigidos: ${group.corrected}     Ausentes: ${group.absent}     Sem correção: ${group.pending}`, margin, footerTop, { size: 9, bold: true })
      text(pdf, 'Linhas destacadas: sem folha corrigida e sem ausência registrada.', margin, footerTop + 5, { size: 7.5, color: MUTED })
    } else {
      text(pdf, 'Presentes: ________     Ausentes: ________', margin, footerTop, { size: 9 })
      text(pdf, 'Aplicador(a): ______________________________', width - margin, footerTop, { size: 9, align: 'right' })
    }
  })
  drawPageNumbers(pdf)
  return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' })
}

function slug(value) {
  return String(value || 'simulado').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

export function printDocumentFilename(assessment, kind, layout = 'signature') {
  const prefix = kind === 'answer-key' ? 'gabarito' : layout === 'checklist' ? 'conferencia-correcao' : 'lista-presenca'
  return `${prefix}-${slug(assessment.code || assessment.title)}.pdf`
}
