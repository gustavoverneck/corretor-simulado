import assert from 'node:assert/strict'
import {
  closeAssessment,
  getAssessmentStatusLabel,
  getPendingReviewSubmissions,
  isAssessmentClosed,
  reopenAssessment,
} from '../src/lib/assessment.js'

const assessment = { id: 'assessment-1', status: 'Correção em andamento' }
const closed = closeAssessment(assessment, '2026-08-27T12:00:00.000Z')

assert.equal(closed.status, 'Encerrado')
assert.equal(closed.statusBeforeClosing, 'Correção em andamento')
assert.equal(closed.closedAt, '2026-08-27T12:00:00.000Z')
assert.equal(isAssessmentClosed(closed), true)
assert.equal(getAssessmentStatusLabel({ status: 'Finalizado' }), 'Encerrado')
assert.equal(assessment.status, 'Correção em andamento')

const submissions = [
  { id: 'review-open', assessmentId: 'assessment-open', status: 'Revisar' },
  { id: 'review-closed', assessmentId: 'assessment-closed', status: 'Revisar' },
  { id: 'corrected', assessmentId: 'assessment-open', status: 'Corrigido' },
]
assert.deepEqual(
  getPendingReviewSubmissions(submissions, [
    { id: 'assessment-open', status: 'Correção em andamento' },
    { id: 'assessment-closed', status: 'Encerrado' },
  ]).map((submission) => submission.id),
  ['review-open'],
)

const reopened = reopenAssessment(closed, { hasSubmissions: true, reopenedAt: '2026-08-28T12:00:00.000Z' })
assert.equal(reopened.status, 'Correção em andamento')
assert.equal(reopened.statusBeforeClosing, undefined)
assert.equal(reopened.reopenedAt, '2026-08-28T12:00:00.000Z')

assert.equal(reopenAssessment({ id: 'legacy', status: 'Finalizado' }, { hasSubmissions: true }).status, 'Correção em andamento')
assert.equal(reopenAssessment({ id: 'empty', status: 'Encerrado' }, { hasSubmissions: false }).status, 'Pronto para aplicar')

console.log('Ciclo do simulado validado: encerramento, fila de pendências e reabertura.')
