import { getQuestionAreas } from './knowledgeAreas.js'

export const SEGES_RESULT_STATUS = {
  ready: 'PRONTO',
  review: 'REVISAR',
  missing: 'SEM_CORRECAO',
  unavailable: 'SEM_DADOS_DO_RECORTE',
}

function submissionDate(submission) {
  const value = submission?.regradedAt || submission?.correctedAt || ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function indexAssessmentSubmissions(submissions, assessmentId) {
  const indexed = new Map()
  submissions
    .filter((submission) => submission.assessmentId === assessmentId && submission.studentId)
    .forEach((submission) => {
      const current = indexed.get(submission.studentId)
      if (!current || submissionDate(submission) >= submissionDate(current)) {
        indexed.set(submission.studentId, submission)
      }
    })
  return indexed
}

export function calculateAssessmentResult(submission, assessment, scope = 'all', maxGrade = 10) {
  if (!submission || !assessment) return null

  let correct = 0
  let valid = 0
  if (Array.isArray(submission.answers)) {
    const questionAreas = getQuestionAreas(assessment)
    const selectedIndexes = questionAreas
      .map((area, index) => scope === 'all' || area === scope ? index : -1)
      .filter((index) => index >= 0)
    if (!selectedIndexes.length) return null

    selectedIndexes.forEach((index) => {
      const answer = submission.answers[index]
      if (answer?.status === 'cancelled') return
      valid += 1
      if (answer?.status === 'correct') correct += 1
    })
  } else {
    if (scope !== 'all') return null
    correct = Math.max(0, Number(submission.correct || 0))
    valid = Math.max(0, Number(
      submission.gradedTotal
      ?? Math.max(0, Number(assessment.questionCount || 0) - Number(submission.cancelled || 0)),
    ))
  }

  if (!valid) return null
  const percentage = correct / valid * 100
  const grade = Math.round((correct / valid * Number(maxGrade || 0)) * 10) / 10
  return { correct, valid, percentage, grade }
}

export function buildSegesResultRows({ assessment, classes, students, submissions, classIds, scope = 'all', maxGrade = 10 }) {
  const selectedClassIds = new Set(classIds)
  const classOrder = new Map(assessment.classIds.map((classId, index) => [classId, index]))
  const classesById = new Map(classes.map((classroom) => [classroom.id, classroom]))
  const submissionsByStudent = indexAssessmentSubmissions(submissions, assessment.id)

  return students
    .filter((student) => selectedClassIds.has(student.classId) && student.status === 'Ativo')
    .sort((first, second) => (
      (classOrder.get(first.classId) ?? Number.MAX_SAFE_INTEGER) - (classOrder.get(second.classId) ?? Number.MAX_SAFE_INTEGER)
      || String(first.name).localeCompare(String(second.name), 'pt-BR')
    ))
    .map((student) => {
      const submission = submissionsByStudent.get(student.id)
      const metrics = calculateAssessmentResult(submission, assessment, scope, maxGrade)
      let status = SEGES_RESULT_STATUS.ready
      if (!submission) status = SEGES_RESULT_STATUS.missing
      else if (submission.status === 'Revisar') status = SEGES_RESULT_STATUS.review
      else if (!metrics) status = SEGES_RESULT_STATUS.unavailable

      return {
        student,
        classroom: classesById.get(student.classId),
        submission,
        metrics,
        status,
        exportable: status === SEGES_RESULT_STATUS.ready,
      }
    })
}

export function formatSegesGrade(value) {
  if (!Number.isFinite(Number(value))) return ''
  return Number(value).toFixed(1).replace('.', ',')
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export function serializeSegesResultsCsv(rows, {
  assessment,
  exportId,
  scope = 'all',
  maxGrade = 10,
}) {
  const header = [
    'versao', 'exportacao_id', 'simulado_id', 'simulado_codigo', 'simulado_nome',
    'tipo_recorte', 'recorte', 'turma', 'aluno', 'matricula', 'acertos',
    'questoes_validas', 'nota', 'nota_maxima', 'status',
  ]
  const type = scope === 'all' ? 'GERAL' : 'AREA'
  const scopeLabel = scope === 'all' ? 'Nota geral' : scope
  const dataRows = rows.map((row) => [
    1,
    exportId,
    assessment.id,
    assessment.code,
    assessment.title,
    type,
    scopeLabel,
    row.classroom?.name || '',
    row.student.name,
    row.student.registration,
    row.metrics?.correct ?? '',
    row.metrics?.valid ?? '',
    row.exportable ? formatSegesGrade(row.metrics?.grade) : '',
    formatSegesGrade(maxGrade),
    row.status,
  ])

  return [header, ...dataRows]
    .map((row) => row.map(csvCell).join(';'))
    .join('\n')
}

export function segesResultsFilename(assessment, scope = 'all') {
  const slug = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `notas-seges-${slug(assessment.code || assessment.title)}-${slug(scope === 'all' ? 'geral' : scope)}.csv`
}
