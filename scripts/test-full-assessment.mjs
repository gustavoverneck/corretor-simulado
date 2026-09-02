import assert from 'node:assert/strict'
import { assessmentToLatex, createPrintableVersions, createStudentPrintableVersions, getPrintableQuestions, resizeQuestions } from '../src/lib/fullAssessment.js'

const questions = resizeQuestions([], 3, 4).map((question, index) => ({ ...question, statement: `Resolva $x_${index} + 1$.`, alternatives: ['1', '2', '3', '4'], correctIndex: index % 4 }))
const versions = createPrintableVersions(questions, [{ id: 'a', label: 'Versão A' }, { id: 'b', label: 'Versão B' }], { shuffleAlternatives: true })
assert.equal(versions.length, 2)
assert.equal(versions[0].answerKey.length, 3)
versions.forEach((version) => version.questions.forEach((question, index) => assert.equal(question.alternatives[question.correctIndex], questions[index].alternatives[questions[index].correctIndex])))
const shuffled = createPrintableVersions(questions, [{ id: 'a', label: 'Versão A' }], { shuffleQuestions: true, shuffleAlternatives: true })[0]
assert.deepEqual([...shuffled.questionOrder].sort(), [0, 1, 2])
shuffled.questions.forEach((question) => assert.equal(question.alternatives[question.correctIndex], questions[question.sourceIndex].alternatives[questions[question.sourceIndex].correctIndex]))
const students = [
  { id: 'student-1', classId: 'class-a' },
  { id: 'student-2', classId: 'class-a' },
  { id: 'student-3', classId: 'class-b' },
]
const studentVersions = createStudentPrintableVersions(questions, students, { shuffleQuestions: true, shuffleAlternatives: false })
assert.equal(studentVersions.length, students.length)
assert.equal(new Set(studentVersions.map((version) => version.id)).size, students.length)
studentVersions.forEach((version, index) => {
  assert.equal(version.studentId, students[index].id)
  assert.deepEqual(version.classIds, [students[index].classId])
  assert.deepEqual([...version.questionOrder].sort(), [0, 1, 2])
  version.questions.forEach((question) => assert.deepEqual(question.alternatives, questions[question.sourceIndex].alternatives))
})
const alternativeStudentVersions = createStudentPrintableVersions(questions, students, { shuffleQuestions: false, shuffleAlternatives: true })
alternativeStudentVersions.forEach((version) => {
  assert.deepEqual(version.questionOrder, [0, 1, 2])
  version.questions.forEach((question, index) => assert.equal(question.alternatives[question.correctIndex], questions[index].alternatives[questions[index].correctIndex]))
})
const fullStudentVersion = createStudentPrintableVersions(questions, students.slice(0, 1), { shuffleQuestions: true, shuffleAlternatives: true })[0]
const compactStudentVersion = { ...fullStudentVersion, questions: undefined }
const rebuiltQuestions = getPrintableQuestions({ contentMode: 'full', questions, printOptions: { shuffleQuestions: true, shuffleAlternatives: true } }, compactStudentVersion)
assert.deepEqual(rebuiltQuestions, fullStudentVersion.questions)
assert.deepEqual(rebuiltQuestions.map((question) => String.fromCharCode(65 + question.correctIndex)), fullStudentVersion.answerKey)
const source = assessmentToLatex({ title: 'Teste', subjects: ['Matemática'], questions }, { name: 'Aluno' }, versions[0])
assert.match(source, /\\documentclass/)
assert.match(source, /\\\(x_0 \+ 1\\\)/)
console.log('Full assessment tests passed.')
