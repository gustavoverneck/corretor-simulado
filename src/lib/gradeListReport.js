import { calculateSubmissionMetrics } from './resultsMetrics.js'
import { uniqueQuestionAreas } from './knowledgeAreas.js'
import { buildXlsx, cellRef } from './xlsx.js'
import { DEFAULT_ROUNDING, gradeScaleLabel, normalizeRounding, roundingDescription, roundingFormula, scaleGrade } from './gradeScale.js'

const assessmentColors = ['2F6B5B', '9A5B2B', '3E5F7D', '5E5683', '8F4440', '5C7542', '7A5A33', '4B5F6E']
const areaColors = ['47776A', 'C0843F', '52718A', '7D6BA8', 'B35F59', '6E9150', 'A88B45', '4F8C93', 'B0668F', '6B7B86']

function submissionDate(row) {
  const timestamp = Date.parse(row.regradedAt || row.correctedAt || '')
  return Number.isFinite(timestamp) ? timestamp : 0
}

function byName(first, second) {
  return String(first).localeCompare(String(second), 'pt-BR', { numeric: true, sensitivity: 'base' })
}

// Uma linha por aluno e simulado: se houver mais de uma folha, vale a correção mais recente.
function latestRows(rows) {
  const latest = new Map()
  rows.forEach((row) => {
    const key = `${row.assessmentId}:${row.studentId || row.id}`
    const current = latest.get(key)
    if (!current || submissionDate(row) >= submissionDate(current)) latest.set(key, row)
  })
  return [...latest.values()]
}

export function buildGradeList({ school, assessments, rows, selectedAreas = [], title = 'Notas por turma', maxGrade = 10, rounding = DEFAULT_ROUNDING, generatedAt = new Date() }) {
  if (!rows.length) throw new Error('Não há resultados no recorte selecionado. Ajuste os filtros antes de gerar a lista de notas.')
  const uniqueRows = latestRows(rows)
  const classMap = new Map()
  uniqueRows.forEach((row) => {
    const key = row.classId || 'sem-turma'
    if (!classMap.has(key)) classMap.set(key, { label: row.classroom?.name || 'Turma não informada', rows: [] })
    classMap.get(key).rows.push(row)
  })

  const classes = [...classMap.values()].sort((first, second) => byName(first.label, second.label)).map((group) => ({
    label: group.label,
    students: new Set(group.rows.map((row) => row.studentId)).size,
    assessments: assessments.map((assessment) => {
      const assessmentRows = group.rows.filter((row) => row.assessmentId === assessment.id)
      if (!assessmentRows.length) return null
      const areas = uniqueQuestionAreas(assessment).filter((area) => !selectedAreas.length || selectedAreas.includes(area))
      const students = assessmentRows.map((row) => ({
        id: row.studentId || row.id,
        name: row.student?.name || 'Aluno não identificado',
        registration: row.student?.registration || '',
        areas: areas.map((area) => {
          const metrics = calculateSubmissionMetrics(row, assessment, [area])
          return metrics && Array.isArray(row.answers) ? { correct: metrics.correct, total: metrics.total } : null
        }),
        correct: row.correct,
        total: row.total,
        score: row.score,
        grade: scaleGrade(row.correct, row.total, maxGrade, rounding),
        review: row.review,
      })).sort((first, second) => byName(first.name, second.name))
      const areaAverages = areas.map((_, index) => {
        const cells = students.map((student) => student.areas[index]).filter(Boolean)
        const total = cells.reduce((sum, cell) => sum + cell.total, 0)
        return total ? Math.round(cells.reduce((sum, cell) => sum + cell.correct, 0) / total * 100) : null
      })
      const average = Math.round(students.reduce((sum, student) => sum + student.score, 0) / students.length)
      return { id: assessment.id, title: assessment.title, code: assessment.code, areas, students, areaAverages, average }
    }).filter(Boolean),
  }))

  return {
    title: title.trim() || 'Notas por turma',
    maxGrade,
    rounding: normalizeRounding(rounding),
    school: school?.name || '',
    date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(generatedAt),
    dateKey: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(generatedAt),
    classes,
  }
}

// Mistura a cor com branco para obter tons claros de fundo.
function tint(hex, amount) {
  return hex.match(/../g).map((part) => Math.round(parseInt(part, 16) + (255 - parseInt(part, 16)) * amount).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function generateGradeListWorkbook(list) {
  const maxGrade = list.maxGrade || 10
  const rounding = normalizeRounding(list.rounding)
  const areaColor = new Map()
  list.classes.forEach((group) => group.assessments.forEach((assessment) => assessment.areas.forEach((area) => {
    if (!areaColor.has(area)) areaColor.set(area, areaColors[areaColor.size % areaColors.length])
  })))
  const assessmentColor = new Map()
  list.classes.forEach((group) => group.assessments.forEach((assessment) => {
    if (!assessmentColor.has(assessment.id)) assessmentColor.set(assessment.id, assessmentColors[assessmentColor.size % assessmentColors.length])
  }))

  const head = { bold: true, color: 'FFFFFF', fill: '203B32', align: 'center', border: true, wrap: true }
  const sheets = list.classes.map((group) => {
    const studentMap = new Map()
    group.assessments.forEach((assessment) => assessment.students.forEach((student) => {
      if (!studentMap.has(student.id)) studentMap.set(student.id, { name: student.name, registration: student.registration })
    }))
    const students = [...studentMap.entries()].map(([id, student]) => ({ id, ...student }))
      .sort((first, second) => String(first.name).localeCompare(String(second.name), 'pt-BR', { numeric: true, sensitivity: 'base' }))
    const blocks = []
    let column = 3
    group.assessments.forEach((assessment) => {
      blocks.push({ assessment, start: column, color: assessmentColor.get(assessment.id) })
      column += assessment.areas.length + 4
    })
    const lastColumn = column - 1
    const headerRow = 4
    const firstDataRow = 6
    const rows = [
      [{ v: `Turma ${group.label}`, s: { bold: true, size: 15, color: '203B32' } }],
      [{ v: [list.title, list.school, list.date].filter(Boolean).join(' · '), s: { color: '667A71' } }],
      [{ v: `Áreas: número de acertos. Acertos: soma das áreas. %: acertos ÷ questões válidas (canceladas não contam). ${gradeScaleLabel(maxGrade)}: % × ${String(maxGrade).replace('.', ',')}, ${roundingDescription(rounding)}. * = marcações pendentes de revisão.`, s: { italic: true, size: 9, color: '667A71' } }],
      [],
      [{ v: 'Nº', s: head }, { v: 'Aluno', s: { ...head, align: 'left' } }, { v: 'Matrícula', s: head }],
      [{ v: '', s: head }, { v: '', s: head }, { v: '', s: head }],
    ]
    const merges = [`A1:${cellRef(0, Math.max(lastColumn, 5))}`, `A2:${cellRef(1, Math.max(lastColumn, 5))}`, `A3:${cellRef(2, Math.max(lastColumn, 5))}`, 'A5:A6', 'B5:B6', 'C5:C6']
    blocks.forEach(({ assessment, start, color }) => {
      const blockEnd = start + assessment.areas.length + 3
      rows[headerRow][start] = { v: assessment.title, s: { bold: true, color: 'FFFFFF', fill: color, align: 'center', border: 'strong', borderColor: color, wrap: true } }
      for (let index = start + 1; index <= blockEnd; index += 1) rows[headerRow][index] = { v: '', s: { fill: color, border: true } }
      if (blockEnd > start) merges.push(`${cellRef(headerRow, start)}:${cellRef(headerRow, blockEnd)}`)
      assessment.areas.forEach((area, index) => {
        const totals = assessment.students.map((student) => student.areas[index]?.total).filter(Number.isFinite)
        const questions = totals.length ? Math.max(...totals) : null
        rows[headerRow + 1][start + index] = { v: questions ? `${area} (${questions})` : area, s: { bold: true, fill: tint(areaColor.get(area), 0.6), color: '203B32', align: 'center', wrap: true, border: index ? true : 'strong', borderColor: color } }
      })
      const totalHead = { bold: true, fill: tint(color, 0.45), color: '203B32', align: 'center', wrap: true, border: true }
      const offset = start + assessment.areas.length
      rows[headerRow + 1][offset] = { v: 'Acertos', s: { ...totalHead, border: assessment.areas.length ? true : 'strong', borderColor: color } }
      rows[headerRow + 1][offset + 1] = { v: 'Questões válidas', s: totalHead }
      rows[headerRow + 1][offset + 2] = { v: '%', s: totalHead }
      rows[headerRow + 1][offset + 3] = { v: gradeScaleLabel(maxGrade), s: totalHead }
    })

    students.forEach((student, studentIndex) => {
      const rowIndex = firstDataRow + studentIndex
      const zebra = studentIndex % 2 ? 0.86 : 0.92
      let review = false
      const row = [
        { v: studentIndex + 1, s: { align: 'center', color: '667A71', border: true } },
        null,
        { v: student.registration, s: { align: 'center', border: true } },
      ]
      blocks.forEach(({ assessment, start, color }) => {
        const result = assessment.students.find((item) => item.id === student.id)
        review ||= Boolean(result?.review)
        assessment.areas.forEach((area, index) => {
          const cell = result?.areas[index]
          row[start + index] = { v: cell ? cell.correct : null, s: { fill: tint(areaColor.get(area), zebra), align: 'center', border: index ? true : 'strong', borderColor: color } }
        })
        const offset = start + assessment.areas.length
        const totalStyle = { bold: true, fill: tint(color, zebra - 0.1), align: 'center', border: true }
        const hasAreas = result && assessment.areas.length && result.areas.every(Boolean)
        const correctRef = cellRef(rowIndex, offset)
        const validRef = cellRef(rowIndex, offset + 1)
        row[offset] = result
          ? hasAreas
            ? { f: `SUM(${cellRef(rowIndex, start)}:${cellRef(rowIndex, offset - 1)})`, v: result.correct, s: { ...totalStyle, border: assessment.areas.length ? true : 'strong', borderColor: color } }
            : { v: result.correct, s: { ...totalStyle, border: assessment.areas.length ? true : 'strong', borderColor: color } }
          : { v: null, s: { ...totalStyle, border: assessment.areas.length ? true : 'strong', borderColor: color } }
        row[offset + 1] = { v: result ? result.total : null, s: { ...totalStyle, bold: false } }
        row[offset + 2] = result
          ? { f: `IFERROR(${correctRef}/${validRef},"")`, v: result.total ? result.correct / result.total : '', s: { ...totalStyle, numFmt: 'percent' } }
          : { v: null, s: { ...totalStyle, numFmt: 'percent' } }
        row[offset + 3] = result
          ? { f: `IFERROR(${roundingFormula(`${correctRef}/${validRef}*${maxGrade}`, rounding)},"")`, v: result.grade ?? '', s: { ...totalStyle, numFmt: 'decimal' } }
          : { v: null, s: { ...totalStyle, numFmt: 'decimal' } }
      })
      row[1] = { v: `${student.name}${review ? ' *' : ''}`, s: { border: true } }
      rows.push(row)
    })

    const averageIndex = firstDataRow + students.length
    const lastDataRow = averageIndex - 1
    const averageStyle = { bold: true, fill: 'E4ECE7', align: 'center', border: true, numFmt: 'decimal' }
    const averageRow = [{ v: '', s: averageStyle }, { v: 'Média da turma', s: { ...averageStyle, align: 'left' } }, { v: '', s: averageStyle }]
    const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : ''
    blocks.forEach(({ assessment, start, color }) => {
      const columns = [
        ...assessment.areas.map((_, index) => mean(assessment.students.map((student) => student.areas[index]?.correct).filter(Number.isFinite))),
        mean(assessment.students.map((student) => student.correct)),
        mean(assessment.students.map((student) => student.total)),
        mean(assessment.students.filter((student) => student.total).map((student) => student.correct / student.total)),
        mean(assessment.students.map((student) => student.grade).filter(Number.isFinite)),
      ]
      columns.forEach((value, index) => {
        const col = start + index
        const range = `${cellRef(firstDataRow, col)}:${cellRef(lastDataRow, col)}`
        const isPercent = index === columns.length - 2
        averageRow[col] = { f: `IFERROR(AVERAGE(${range}),"")`, v: value, s: { ...averageStyle, numFmt: isPercent ? 'percent' : 'decimal', border: index ? true : 'strong', borderColor: color } }
      })
    })
    rows.push(averageRow)

    const cols = [5, 38, 13]
    blocks.forEach(({ assessment, start }) => {
      assessment.areas.forEach((_, index) => { cols[start + index] = 13 })
      cols[start + assessment.areas.length] = 9
      cols[start + assessment.areas.length + 1] = 10
      cols[start + assessment.areas.length + 2] = 8
      cols[start + assessment.areas.length + 3] = 10
    })
    const heights = { 0: 22, [headerRow]: 32, [headerRow + 1]: 48 }
    return { name: group.label, rows, merges, cols, heights, freeze: { rows: firstDataRow, columns: 2 } }
  })

  const { bytes } = buildXlsx(sheets, { title: list.title, author: list.school })
  return {
    blob: new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename: `notas-por-turma-${list.dateKey}.xlsx`,
    sheets: sheets.length,
  }
}
