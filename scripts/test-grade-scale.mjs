import assert from 'node:assert/strict'
import { gradeScaleLabel, parseMaxGrade, scaleGrade } from '../src/lib/gradeScale.js'

assert.equal(parseMaxGrade('10'), 10)
assert.equal(parseMaxGrade('7,5'), 7.5)
assert.equal(parseMaxGrade('0'), null)
assert.equal(parseMaxGrade('101'), null)
assert.equal(parseMaxGrade('abc'), null)
assert.equal(parseMaxGrade(''), null)
assert.equal(scaleGrade(2, 3, 10), 6.7)
assert.equal(scaleGrade(2, 3, 20), 13.3)
assert.equal(scaleGrade(45, 45, 100), 100)
assert.equal(scaleGrade(1, 0, 10), null)
assert.equal(gradeScaleLabel(7.5), 'Nota (0 a 7,5)')
console.log('Escala da nota: ok.')

import { roundGrade, roundingFormula, normalizeRounding } from '../src/lib/gradeScale.js'
import { calculateAssessmentResult } from '../src/lib/segesResults.js'
assert.equal(scaleGrade(2, 3, 10, { mode: 'up', step: 0.1 }), 6.7)
assert.equal(scaleGrade(2, 3, 10, { mode: 'down', step: 0.1 }), 6.6)
assert.equal(scaleGrade(3, 10, 10, { mode: 'up', step: 0.1 }), 3, 'ruído de ponto flutuante não sobe a nota')
assert.equal(scaleGrade(2, 3, 10, { mode: 'up', step: 0.5 }), 7)
assert.equal(scaleGrade(2, 3, 10, { mode: 'down', step: 0.5 }), 6.5)
assert.equal(scaleGrade(2, 3, 10, { mode: 'nearest', step: 1 }), 7)
assert.equal(scaleGrade(2, 3, 10, { mode: 'down', step: 1 }), 6)
assert.equal(roundGrade(6.25, { mode: 'nearest', step: 0.5 }), 6.5)
assert.deepEqual(normalizeRounding({ mode: 'x', step: 3 }), { mode: 'nearest', step: 0.1 })
assert.equal(roundingFormula('F7/G7*10'), 'ROUND(F7/G7*10,1)')
assert.equal(roundingFormula('F7/G7*10', { mode: 'up', step: 0.5 }), 'ROUNDUP((F7/G7*10)*2,0)/2')
assert.equal(roundingFormula('F7/G7*20', { mode: 'down', step: 1 }), 'ROUNDDOWN(F7/G7*20,0)')
const assessment = { id: 'a', questionCount: 3, questionAreas: ['M', 'M', 'M'] }
const submission = { answers: [{ status: 'correct' }, { status: 'correct' }, { status: 'wrong' }] }
assert.equal(calculateAssessmentResult(submission, assessment).grade, 6.7, 'SEGES mantém o padrão')
assert.equal(calculateAssessmentResult(submission, assessment, 'all', 10, { mode: 'down', step: 1 }).grade, 6)
console.log('Arredondamento: ok.')
