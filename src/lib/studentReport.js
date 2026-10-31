// Relatório do aluno ao longo dos simulados: nota de cada aplicação, acertos
// por área comparados com a turma, evolução e pontos de atenção.
import { calculateAreaResults, calculateSubmissionMetrics } from './resultsMetrics.js'
import { getAbsentStudentIds } from './attendance.js'
import { getAssessmentForSubmission } from './assessment.js'
import { getQuestionAreas } from './knowledgeAreas.js'

export const ATTENTION_SCORE = 40
export const ATTENTION_DROP = 15

function mean(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
}

function byDate(first, second) {
  return String(first.date || first.createdAt || '').localeCompare(String(second.date || second.createdAt || '')) || String(first.title).localeCompare(String(second.title), 'pt-BR')
}

// Folhas que entram nas médias: anuladas (cola) ficam fora, como nas análises.
function countedSubmissions(submissions, assessmentId) {
  return submissions.filter((submission) => submission.assessmentId === assessmentId && !submission.voided)
}

// Médias da turma por simulado, calculadas uma vez para todos os alunos.
export function buildClassBenchmarks(assessments, submissions, students) {
  const classOf = new Map(students.map((student) => [student.id, student.classId]))
  const benchmarks = new Map()
  assessments.forEach((assessment) => {
    const perClass = new Map()
    countedSubmissions(submissions, assessment.id).forEach((submission) => {
      const classId = classOf.get(submission.studentId) || submission.classId
      if (!perClass.has(classId)) perClass.set(classId, [])
      perClass.get(classId).push(submission)
    })
    perClass.forEach((items, classId) => {
      const scores = items.map((submission) => calculateSubmissionMetrics(submission, assessment)?.score).filter((value) => value !== undefined)
      const areas = new Map(calculateAreaResults([assessment], items).filter((item) => item.attempts).map((item) => [item.area, item.score]))
      benchmarks.set(`${assessment.id}:${classId}`, { score: mean(scores), areas, sheets: items.length })
    })
  })
  return benchmarks
}

function submissionAreas(submission, assessment) {
  const resolved = getAssessmentForSubmission(assessment, submission)
  return [...new Set(getQuestionAreas(resolved))]
    .map((area) => ({ area, metrics: calculateSubmissionMetrics(submission, assessment, [area]) }))
    .filter((item) => item.metrics?.total)
    .map((item) => ({ area: item.area, score: item.metrics.score, correct: item.metrics.correct, total: item.metrics.total }))
}

export function buildStudentReport({ student, assessments, submissions, benchmarks, triScores = new Map() }) {
  if (!student) return null
  const relevant = assessments
    .filter((assessment) => assessment.classIds?.includes(student.classId) || submissions.some((item) => item.assessmentId === assessment.id && item.studentId === student.id))
    .sort(byDate)

  const entries = relevant.map((assessment) => {
    const submission = submissions.find((item) => item.assessmentId === assessment.id && item.studentId === student.id)
    const benchmark = benchmarks.get(`${assessment.id}:${student.classId}`) || { score: null, areas: new Map(), sheets: 0 }
    const base = { assessment, submission, classScore: benchmark.score, classSheets: benchmark.sheets }
    if (!submission) return { ...base, status: getAbsentStudentIds(assessment).includes(student.id) ? 'absent' : 'pending', areas: [] }
    if (submission.voided) return { ...base, status: 'voided', score: 0, areas: [] }
    const metrics = calculateSubmissionMetrics(submission, assessment)
    const tri = triScores.get(assessment.id)?.scores.get(submission.id) || null
    return {
      ...base,
      status: submission.status === 'Revisar' ? 'review' : 'done',
      score: metrics?.score ?? Number(submission.score || 0),
      correct: metrics?.correct ?? Number(submission.correct || 0),
      total: metrics?.total ?? Number(submission.gradedTotal || assessment.questionCount || 0),
      tri,
      areas: submissionAreas(submission, assessment).map((item) => ({ ...item, classScore: benchmark.areas.get(item.area) ?? null, tri: tri?.areas?.[item.area] ?? null })),
    }
  })

  const done = entries.filter((entry) => entry.status === 'done' || entry.status === 'review')
  const last = done.at(-1) || null
  const previous = done.at(-2) || null
  const areaNames = [...new Set(done.flatMap((entry) => entry.areas.map((item) => item.area)))]
  const areas = areaNames.map((area) => {
    const points = done.map((entry) => ({ entry, item: entry.areas.find((value) => value.area === area) })).filter((point) => point.item)
    const latest = points.at(-1)
    const before = points.at(-2)
    return {
      area,
      average: mean(points.map((point) => point.item.score)),
      classAverage: mean(points.map((point) => point.item.classScore).filter((value) => value !== null)),
      latest: latest?.item.score ?? null,
      latestAssessment: latest?.entry.assessment || null,
      delta: latest && before ? latest.item.score - before.item.score : null,
      points: points.map((point) => ({ assessmentId: point.entry.assessment.id, score: point.item.score, classScore: point.item.classScore })),
    }
  })

  const alerts = []
  if (last && previous && last.score - previous.score <= -ATTENTION_DROP) alerts.push({ tone: 'red', text: `Caiu ${previous.score - last.score} pontos no aproveitamento geral, de ${previous.score}% em ${previous.assessment.code || previous.assessment.title} para ${last.score}% em ${last.assessment.code || last.assessment.title}.` })
  areas.forEach((area) => {
    if (area.delta !== null && area.delta <= -ATTENTION_DROP) alerts.push({ tone: 'ochre', text: `${area.area}: caiu ${-area.delta} pontos em relação ao simulado anterior.` })
    else if (area.latest !== null && area.latest < ATTENTION_SCORE) alerts.push({ tone: 'ochre', text: `${area.area}: ${area.latest}% no último simulado, abaixo de ${ATTENTION_SCORE}%.` })
  })
  const absences = entries.filter((entry) => entry.status === 'absent').length
  if (absences) alerts.push({ tone: 'neutral', text: `${absences} ausência${absences === 1 ? '' : 's'} registrada${absences === 1 ? '' : 's'} em simulados.` })
  if (last && previous && last.score - previous.score >= ATTENTION_DROP) alerts.push({ tone: 'green', text: `Subiu ${last.score - previous.score} pontos em relação ao simulado anterior.` })

  return {
    student,
    entries,
    done,
    areas,
    alerts,
    average: mean(done.map((entry) => entry.score)),
    classAverage: mean(done.map((entry) => entry.classScore).filter((value) => value !== null)),
    latest: last,
    delta: last && previous ? last.score - previous.score : null,
    attention: alerts.some((alert) => alert.tone === 'red' || alert.tone === 'ochre'),
  }
}
