import assert from 'node:assert/strict'
import {
  applyAssessmentRevision,
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

const revisionData = {
  assessments: [
    { id: 'assessment-1', title: 'Antes' },
    { id: 'assessment-2', title: 'Outro' },
  ],
  students: [{ id: 'student-1', classId: 'class-1' }],
  submissions: [
    { id: 'answer-1', assessmentId: 'assessment-1', studentId: 'student-1', classId: 'class-1', answers: [{ selected: ['A'], status: 'correct' }] },
    { id: 'answer-2', assessmentId: 'assessment-1' },
    { id: 'answer-3', assessmentId: 'assessment-2', answers: [{ selected: ['A'], status: 'correct' }] },
  ],
}
const revisedAssessment = {
  id: 'assessment-1',
  title: 'Depois',
  questionCount: 2,
  answerKey: ['B', 'A'],
  answerKeysByClass: { 'class-1': ['B', 'A'] },
}
const preservedRevision = applyAssessmentRevision(revisionData, revisedAssessment)
assert.equal(preservedRevision.data.assessments[0].title, 'Depois')
assert.equal(preservedRevision.data.submissions.length, 3)
assert.deepEqual(preservedRevision.regradedSubmissionIds, [])
assert.equal(preservedRevision.data.submissions[0], revisionData.submissions[0])

const regradedRevision = applyAssessmentRevision(revisionData, revisedAssessment, { regradeSubmissions: true, regradedAt: '2026-09-02T12:00:00.000Z' })
assert.deepEqual(regradedRevision.data.submissions.map((submission) => submission.id), ['answer-1', 'answer-2', 'answer-3'])
assert.deepEqual(regradedRevision.regradedSubmissionIds, ['answer-1'])
assert.equal(regradedRevision.data.submissions[0].wrong, 1)
assert.equal(regradedRevision.data.submissions[0].blank, 1)
assert.equal(regradedRevision.data.submissions[0].score, 0)
assert.equal(regradedRevision.data.submissions[0].answers.length, 2)
assert.equal(regradedRevision.data.submissions[0].regradedAt, '2026-09-02T12:00:00.000Z')
assert.equal(regradedRevision.data.submissions[1], revisionData.submissions[1])
assert.equal(regradedRevision.data.submissions[2], revisionData.submissions[2])
assert.equal(regradedRevision.data.assessments[1], revisionData.assessments[1])

console.log('Ciclo do simulado validado: encerramento, revisão, recorreção seletiva e reabertura.')
