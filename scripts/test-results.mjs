import assert from 'node:assert/strict'
import { calculateSubmissionMetrics, calculateAreaResults, calculateQuestionResults } from '../src/lib/resultsMetrics.js'

const assessments = [
  { id: 'a', title: 'Prova A', code: 'A', questionCount: 2, questionAreas: ['Matemática', 'Português'], subjects: [] },
  { id: 'b', title: 'Prova B', code: 'B', questionCount: 3, questionAreas: ['Português', 'Matemática', 'Matemática'], subjects: [] },
]
const submissions = [
  { assessmentId: 'a', studentId: 'same-student', answers: [{ status: 'correct' }, { status: 'wrong' }] },
  { assessmentId: 'b', studentId: 'same-student', answers: [{ status: 'correct' }, { status: 'wrong' }, { status: 'cancelled' }] },
  { assessmentId: 'not-selected', answers: [{ status: 'correct' }] },
]
const areas = calculateAreaResults(assessments, submissions)
assert.deepEqual(areas.map(({ area, questions, attempts, correct, cancelled, score }) => ({ area, questions, attempts, correct, cancelled, score })), [
  { area: 'Matemática', questions: 3, attempts: 2, correct: 1, cancelled: 1, score: 50 },
  { area: 'Português', questions: 2, attempts: 2, correct: 1, cancelled: 0, score: 50 },
])
const questions = calculateQuestionResults(assessments, submissions)
assert.equal(questions.length, 5)
assert.equal(new Set(questions.map((item) => item.id)).size, 5)
assert.equal(questions.find((item) => item.id === 'a:1').score, 0)
assert.equal(questions.find((item) => item.id === 'b:0').score, 100)
assert.equal(questions.find((item) => item.id === 'b:2').attempts, 0)
assert.deepEqual(calculateQuestionResults(assessments, submissions, ['Português']).map((item) => item.id), ['a:1', 'b:0'])
assert.equal(calculateSubmissionMetrics(submissions[0], assessments[0], ['Matemática']).score, 100)
assert.equal(calculateSubmissionMetrics(submissions[1], assessments[1], ['Matemática']).score, 0)
assert.equal(calculateSubmissionMetrics(submissions[1], assessments[1], ['Matemática']).total, 1)
assert.equal(calculateSubmissionMetrics(submissions[0], assessments[0], ['Ciências']), null)
// Summary-only records cannot supply a partial-area score, even when other
// selected areas come from a different assessment.
assert.equal(calculateSubmissionMetrics({ score: 50 }, assessments[0], ['Matemática', 'Ciências']), null)
assert.equal(calculateSubmissionMetrics({ score: 50 }, assessments[0], ['Matemática', 'Português', 'Ciências']).score, 50)
assert.deepEqual(calculateQuestionResults([], submissions), [])
console.log('Resultados validados: múltiplos simulados, questões distintas, áreas, cancelamentos e dados sem detalhamento.')
