import assert from 'node:assert/strict'
import { assessmentToLatex, createPrintableVersions, resizeQuestions } from '../src/lib/fullAssessment.js'

const questions = resizeQuestions([], 3, 4).map((question, index) => ({ ...question, statement: `Resolva $x_${index} + 1$.`, alternatives: ['1', '2', '3', '4'], correctIndex: index % 4 }))
const versions = createPrintableVersions(questions, [{ id: 'a', label: 'Versão A' }, { id: 'b', label: 'Versão B' }], { shuffleAlternatives: true })
assert.equal(versions.length, 2)
assert.equal(versions[0].answerKey.length, 3)
versions.forEach((version) => version.questions.forEach((question, index) => assert.equal(question.alternatives[question.correctIndex], questions[index].alternatives[questions[index].correctIndex])))
const shuffled = createPrintableVersions(questions, [{ id: 'a', label: 'Versão A' }], { shuffleQuestions: true, shuffleAlternatives: true })[0]
assert.deepEqual([...shuffled.questionOrder].sort(), [0, 1, 2])
shuffled.questions.forEach((question) => assert.equal(question.alternatives[question.correctIndex], questions[question.sourceIndex].alternatives[questions[question.sourceIndex].correctIndex]))
const source = assessmentToLatex({ title: 'Teste', subjects: ['Matemática'], questions }, { name: 'Aluno' }, versions[0])
assert.match(source, /\\documentclass/)
assert.match(source, /\\\(x_0 \+ 1\\\)/)
console.log('Full assessment tests passed.')
