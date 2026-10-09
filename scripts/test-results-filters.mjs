import assert from 'node:assert/strict'
import { calculateAreaResults, calculateQuestionResults, calculateSubmissionMetrics, resolveSelection } from '../src/lib/results.js'

const assessments = [
  { id: 'a', title: 'Primeiro', code: 'A', questionCount: 2, subjects: ['Matemática'], questionAreas: ['Matemática', 'Linguagens'] },
  { id: 'b', title: 'Segundo', code: 'B', questionCount: 3, subjects: ['Matemática'], questionAreas: ['Linguagens', 'Matemática', 'Matemática'] },
]
const rows = [
  { assessmentId: 'a', studentId: 's1', answers: [{ status: 'correct' }, { status: 'wrong' }] },
  { assessmentId: 'b', studentId: 's1', answers: [{ status: 'correct' }, { status: 'cancelled' }, { status: 'uncertain' }] },
  { assessmentId: 'other', studentId: 's1', answers: [{ status: 'correct' }] },
]

const areas = calculateAreaResults(assessments, rows)
const math = areas.find((item) => item.area === 'Matemática')
assert.equal(math.questions, 3)
assert.equal(math.attempts, 2)
assert.equal(math.correct, 1)
assert.equal(math.cancelled, 1)
assert.equal(math.review, 1)
assert.equal(math.score, 50)
assert.equal(areas.find((item) => item.area === 'Linguagens').score, 50)

const questions = calculateQuestionResults(assessments, rows)
assert.equal(questions.length, 5)
assert.equal(new Set(questions.map((item) => item.key)).size, 5)
assert.equal(questions.find((item) => item.key === 'a:0').area, 'Matemática')
assert.equal(questions.find((item) => item.key === 'b:0').area, 'Linguagens')
assert.equal(questions.find((item) => item.key === 'a:0').attempts, 1)
assert.equal(questions.find((item) => item.key === 'b:1').attempts, 0)
assert.equal(questions.find((item) => item.key === 'b:1').cancelled, 1)
assert.deepEqual(calculateQuestionResults(assessments, rows, ['Matemática']).map((item) => item.key), ['a:0', 'b:1', 'b:2'])
assert.equal(calculateQuestionResults([assessments[0]], rows).length, 2)

assert.equal(calculateSubmissionMetrics(rows[0], assessments[0]).score, 50)
assert.equal(calculateSubmissionMetrics(rows[1], assessments[1]).total, 2)
assert.equal(calculateSubmissionMetrics(rows[1], assessments[1], ['Linguagens']).score, 100)
assert.equal(calculateSubmissionMetrics(rows[0], assessments[0], ['Biologia']), null)
const legacy = { correct: 1, score: 50 }
assert.equal(calculateSubmissionMetrics(legacy, assessments[0], ['Matemática']), null)
assert.equal(calculateSubmissionMetrics(legacy, assessments[0], ['Matemática', 'Linguagens', 'Biologia']).score, 50)

assert.deepEqual(resolveSelection(['removed', 'b'], ['a', 'b']), ['b'])
assert.deepEqual(resolveSelection(['removed'], ['a', 'b'], ['a']), ['a'])
assert.deepEqual(resolveSelection([], ['a', 'b']), ['a', 'b'])
assert.deepEqual(resolveSelection(['a'], []), [])
assert.deepEqual(calculateAreaResults([], rows), [])
assert.deepEqual(calculateQuestionResults([], rows), [])
console.log('Resultados validados: múltiplos simulados, áreas distintas, questões independentes, filtros e correções antigas.')
