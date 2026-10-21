import assert from 'node:assert/strict'
import { importAssessmentPackage, ASSESSMENT_IMPORT_FORMAT } from '../src/lib/assessmentImport.js'
import { getAssessmentForStudent, getAnswerKeyVersionsForClass } from '../src/lib/assessment.js'

const state = {
  school: { name: 'Escola' },
  classes: [{ id: 'current', name: '3ª IV', shift: 'Integral', year: 2026 }],
  students: Array.from({ length: 8 }, (_, index) => ({ id: `student-${index}`, classId: 'current' })),
  assessments: [{ id: 'existing', code: 'EXISTING', title: 'Preservar' }],
  submissions: [{ id: 'submission', assessmentId: 'existing', score: 80 }],
  settings: { preserved: true }, importHistory: [{ id: 'history' }],
}
const payload = {
  format: ASSESSMENT_IMPORT_FORMAT, version: 1,
  classes: [{ id: 'source', name: '3ª IV', shift: 'Integral', year: 2026 }],
  assessments: [{
    id: 'new', title: 'Novo simulado', code: 'ENEM-1', date: '2026-10-27', optionCount: 5,
    classIds: ['source'],
    answerKeyVersions: [
      { id: 'yellow', label: 'amarelo', answerKey: ['A', null], questionAreas: ['Linguagens', 'Humanas'] },
      { id: 'green', label: 'verde', answerKey: ['B', 'C', 'D'], questionAreas: ['Natureza', 'Matemática', 'Matemática'], classIds: ['source'] },
    ],
  }],
}
const original = JSON.stringify(state)
const result = importAssessmentPackage(state, payload, { createdAt: '2026-10-21T12:00:00Z' })
assert.equal(result.added, 1)
assert.equal(result.skipped, 0)
assert.equal(JSON.stringify(state), original, 'A importação deve ser imutável')
for (const key of ['school', 'classes', 'students', 'submissions', 'settings', 'importHistory']) assert.equal(result.state[key], state[key])
assert.equal(result.state.assessments[1], state.assessments[0])
const imported = result.assessments[0]
assert.deepEqual(imported.classIds, ['current'])
assert.deepEqual(getAnswerKeyVersionsForClass(imported, 'current').map((version) => version.label), ['amarelo', 'verde'])
assert.equal(getAssessmentForStudent(imported, state.students[0]).questionCount, 2)
assert.equal(getAssessmentForStudent(imported, state.students[1]).questionCount, 3)
assert.equal(imported.answerKeyVersions[0].answerKey[1], null)
assert.deepEqual(importAssessmentPackage(result.state, payload).added, 0)
assert.equal(importAssessmentPackage(result.state, payload).skipped, 1)
assert.equal(importAssessmentPackage(result.state, payload).state.assessments.length, 2)
assert.throws(() => importAssessmentPackage(state, { format: 'sistema-avaliacoes-backup', data: state }), /pacote/)

for (const modify of [
  (assessment) => { assessment.answerKeyVersions[0].answerKey[0] = '' },
  (assessment) => { assessment.answerKeyVersions[0].questionAreas = [] },
  (assessment) => { assessment.answerKeyVersions[0].answerKey[0] = 'F' },
  (assessment) => { assessment.date = 'invalid' },
  (assessment) => { assessment.date = '2026-02-31' },
  (assessment) => { assessment.classIds = ['missing'] },
  (assessment) => { assessment.answerKeyVersions[1].id = 'yellow' },
]) {
  const invalid = structuredClone(payload)
  modify(invalid.assessments[0])
  assert.throws(() => importAssessmentPackage(state, invalid))
  assert.equal(JSON.stringify(state), original)
}
// A bad second assessment must not cause a partial import of the first.
const partial = structuredClone(payload)
partial.assessments.push({ ...structuredClone(partial.assessments[0]), id: 'bad', code: 'BAD', classIds: ['missing'] })
assert.throws(() => importAssessmentPackage(state, partial))
assert.equal(JSON.stringify(state), original)
console.log('Importação aditiva validada: áreas e versões independentes, conciliação de turmas, preservação da base, duplicações e erros sem importação parcial.')
