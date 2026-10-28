import { CANCELLED_ANSWER, getAssessmentForSubmission } from './assessment.js'
import { getQuestionAreas } from './knowledgeAreas.js'

export const ANSWER_STATUS_LABELS = {
  correct: 'Acerto',
  wrong: 'Erro',
  blank: 'Em branco',
  multiple: 'Múltipla',
  uncertain: 'Revisar',
  cancelled: 'Cancelada',
  annulled: 'Anulada',
}

function questionOutcome(status, annulled) {
  if (status === 'cancelled') return 'cancelled'
  if (annulled) return 'annulled'
  if (status === 'correct' || status === 'wrong' || status === 'blank') return status
  return status === 'multiple' ? 'multiple' : 'uncertain'
}

// Builds the per-question and per-area view of one corrected sheet. Summary-only
// records (older corrections without answers) return null, since there is no
// question-level data to show.
export function buildStudentResult(submission, assessment) {
  if (!submission || !assessment || !Array.isArray(submission.answers)) return null
  const resolved = getAssessmentForSubmission(assessment, submission)
  const questionAreas = getQuestionAreas(resolved)
  const answerKey = submission.answerKeySnapshot || resolved.answerKey || []
  const questions = questionAreas.map((area, index) => {
    const answer = submission.answers[index] || {}
    const expected = answer.expected !== undefined ? answer.expected : answerKey[index]
    const status = answer.status || 'blank'
    const annulled = Boolean(answer.annulled) || (expected === null && status !== 'cancelled')
    const selected = Array.isArray(answer.selected) ? answer.selected : []
    return {
      index,
      number: index + 1,
      area,
      selected,
      expected: expected === CANCELLED_ANSWER || expected === null ? null : expected,
      status,
      outcome: questionOutcome(status, annulled),
    }
  })

  const areaMap = new Map()
  questions.forEach((question) => {
    if (!areaMap.has(question.area)) areaMap.set(question.area, { area: question.area, questions: 0, total: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, review: 0, score: 0 })
    const item = areaMap.get(question.area)
    item.questions += 1
    if (question.status === 'cancelled') { item.cancelled += 1; return }
    item.total += 1
    if (question.status === 'correct') item.correct += 1
    else if (question.status === 'wrong') item.wrong += 1
    else if (question.status === 'blank') item.blank += 1
    else item.review += 1
  })
  const areas = [...areaMap.values()].map((item) => ({ ...item, score: item.total ? Math.round(item.correct / item.total * 100) : 0 }))
  const totals = areas.reduce((sum, item) => ({
    total: sum.total + item.total,
    correct: sum.correct + item.correct,
    wrong: sum.wrong + item.wrong,
    blank: sum.blank + item.blank,
    cancelled: sum.cancelled + item.cancelled,
    review: sum.review + item.review,
  }), { total: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, review: 0 })
  return {
    versionLabel: submission.answerKeyVersionLabel || '',
    questions,
    areas,
    totals: { ...totals, score: totals.total ? Math.round(totals.correct / totals.total * 100) : 0 },
  }
}
