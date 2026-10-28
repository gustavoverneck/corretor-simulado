import assert from 'node:assert/strict'
import { buildStudentResult } from '../src/lib/studentResult.js'

const assessment = {
  id: 'a', title: 'Prova A', code: 'A', questionCount: 5, optionCount: 5, subjects: [],
  questionAreas: ['Matemática', 'Matemática', 'Português', 'Português', 'Português'],
  answerKey: ['A', 'B', 'C', null, 'CANCELLED'],
}
const submission = {
  id: 's', assessmentId: 'a', studentId: 'x',
  answers: [
    { selected: ['A'], status: 'correct', expected: 'A' },
    { selected: ['B', 'C'], status: 'multiple', expected: 'B' },
    { selected: [], status: 'blank' },
    { selected: ['E'], status: 'correct', expected: null, annulled: true },
    { selected: ['A'], status: 'cancelled', expected: 'CANCELLED', cancelled: true },
  ],
}
const result = buildStudentResult(submission, assessment)
assert.deepEqual(result.questions.map((item) => item.outcome), ['correct', 'multiple', 'blank', 'annulled', 'cancelled'])
assert.equal(result.questions[2].expected, 'C', 'gabarito vem da prova quando a resposta não guarda o esperado')
assert.equal(result.questions[3].expected, null)
assert.equal(result.questions[4].expected, null)
assert.deepEqual(result.areas.map(({ area, total, correct, review, cancelled, score }) => ({ area, total, correct, review, cancelled, score })), [
  { area: 'Matemática', total: 2, correct: 1, review: 1, cancelled: 0, score: 50 },
  { area: 'Português', total: 2, correct: 1, review: 0, cancelled: 1, score: 50 },
])
assert.deepEqual(result.totals, { total: 4, correct: 2, wrong: 0, blank: 1, cancelled: 1, review: 1, score: 50 })

// The snapshot saved at correction time wins over a key edited later.
const snapshot = buildStudentResult({ ...submission, answers: [{ selected: ['D'], status: 'wrong' }], answerKeySnapshot: ['E', 'B', 'C', null, 'CANCELLED'] }, assessment)
assert.equal(snapshot.questions[0].expected, 'E')
assert.equal(snapshot.questions[1].outcome, 'blank')

assert.equal(buildStudentResult({ score: 70 }, assessment), null)
console.log('Detalhes do aluno validados: acertos por questão, áreas, anuladas, canceladas e correções sem detalhamento.')
