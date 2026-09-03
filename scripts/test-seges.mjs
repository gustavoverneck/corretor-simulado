import assert from 'node:assert/strict'
import {
  autoMapHeaders,
  gradeFromClassName,
  importSegesRows,
  mappingSources,
  readSegesFile,
  resolveSegesValue,
  validateMapping,
} from '../src/lib/seges.js'
import {
  buildSegesResultRows,
  calculateAssessmentResult,
  formatSegesGrade,
  SEGES_RESULT_STATUS,
  segesResultsFilename,
  serializeSegesResultsCsv,
} from '../src/lib/segesResults.js'

const headers = ['Número', 'Nome do aluno', 'Status', 'Nome da turma', 'Data e hora da captura']
const parsed = await readSegesFile({
  name: 'alunos-ficticios.csv',
  text: async () => `${headers.join(',')}\n1,ESTUDANTE   FICTÍCIO UM,Sem status,2ªIV01-EMI-LOG,2026-08-25T19:13:52.389Z`,
})
assert.deepEqual(parsed.headers, headers)
assert.equal(parsed.rows[0]['Nome do aluno'], 'ESTUDANTE   FICTÍCIO UM')

const mapping = autoMapHeaders(headers)

assert.equal(mapping.registration, '')
assert.equal(mapping.name, 'Nome do aluno')
assert.equal(mapping.status, 'Status')
assert.equal(mapping.className, 'Nome da turma')
assert.equal(mapping.grade, mappingSources.gradeFromClass)
assert.equal(mapping.shift, mappingSources.manualShift)
assert.equal(mapping.school, mappingSources.settingsSchool)
assert.equal(mapping.schoolInep, mappingSources.settingsInep)
assert.deepEqual(validateMapping(mapping), ['Turno (valor manual)'])
assert.deepEqual(validateMapping(mapping, { manualShift: 'Vespertino' }), [])
assert.deepEqual(validateMapping({ ...mapping, status: '' }, { manualShift: 'Vespertino' }), ['Situação'])
assert.equal(gradeFromClassName('2ªIV01-EMI-LOG'), '2ª série')
assert.equal(resolveSegesValue({}, mapping, 'schoolInep', { school: { inep: '00000000' } }), '00000000')

const rows = [
  { Número: '1', 'Nome do aluno': 'ESTUDANTE FICTÍCIO UM', Status: 'Sem status', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.389Z' },
  { Número: '2', 'Nome do aluno': 'ESTUDANTE FICTÍCIO DOIS', Status: 'Transferido', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.390Z' },
  { Número: '3', 'Nome do aluno': 'ESTUDANTE FICTÍCIO TRÊS', Status: 'Em transferência', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.391Z' },
  { Número: 'LANÇAR PARA TODOS', 'Nome do aluno': 'Não avaliado', Status: 'Sem status', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.392Z' },
]
const state = {
  school: { name: 'Escola Fictícia de Teste', inep: '00000000' },
  classes: [],
  students: [],
  importHistory: [],
}
const result = importSegesRows(state, rows, mapping, 'alunos-ficticios.csv', { manualShift: 'Vespertino' })

assert.equal(result.summary.added, 2)
assert.equal(result.summary.updated, 0)
assert.equal(result.summary.skipped, 2)
assert.equal(result.state.classes.length, 1)
assert.equal(result.state.classes[0].grade, '2ª série')
assert.equal(result.state.classes[0].shift, 'Vespertino')
assert.equal(result.state.students[0].name, 'ESTUDANTE FICTÍCIO UM')
assert.equal(result.state.students[0].status, 'Ativo')
assert.equal(result.state.students[0].sourceStatus, 'Sem status')
assert.equal(result.state.students[1].sourceStatus, 'Em transferência')
assert.equal(result.state.students.some((student) => student.name === 'Não avaliado'), false)
assert.equal(result.state.importHistory[0].school, 'Escola Fictícia de Teste')
assert.equal(result.state.importHistory[0].schoolInep, '00000000')

const assessment = {
  id: 'assessment-test',
  code: 'SIM-01',
  title: 'Simulado de teste',
  classIds: ['class-a'],
  questionCount: 4,
  questionAreas: ['Matemática', 'Matemática', 'Linguagens', 'Linguagens'],
  subjects: ['Matemática', 'Linguagens'],
}
const detailedSubmission = {
  id: 'submission-a',
  assessmentId: assessment.id,
  studentId: 'student-a',
  status: 'Corrigido',
  answers: [
    { status: 'correct' },
    { status: 'wrong' },
    { status: 'cancelled' },
    { status: 'correct' },
  ],
}
assert.deepEqual(calculateAssessmentResult(detailedSubmission, assessment, 'all', 10), {
  correct: 2,
  valid: 3,
  percentage: 2 / 3 * 100,
  grade: 6.7,
})
assert.deepEqual(calculateAssessmentResult(detailedSubmission, assessment, 'Matemática', 10), {
  correct: 1,
  valid: 2,
  percentage: 50,
  grade: 5,
})
assert.deepEqual(calculateAssessmentResult(detailedSubmission, assessment, 'Linguagens', 10), {
  correct: 1,
  valid: 1,
  percentage: 100,
  grade: 10,
})
assert.equal(formatSegesGrade(6.7), '6,7')

const resultStudents = [
  { id: 'student-a', registration: 'DEMO-001', name: 'ESTUDANTE FICTÍCIO A', classId: 'class-a', status: 'Ativo' },
  { id: 'student-b', registration: 'DEMO-002', name: 'ESTUDANTE FICTÍCIO B', classId: 'class-a', status: 'Ativo' },
  { id: 'student-c', registration: 'DEMO-003', name: 'ESTUDANTE FICTÍCIO C', classId: 'class-a', status: 'Ativo' },
]
const resultRows = buildSegesResultRows({
  assessment,
  classes: [{ id: 'class-a', name: '1ªIV01-EM-MCN' }],
  students: resultStudents,
  submissions: [
    detailedSubmission,
    { ...detailedSubmission, id: 'submission-b', studentId: 'student-b', status: 'Revisar' },
  ],
  classIds: ['class-a'],
  scope: 'Matemática',
  maxGrade: 10,
})
assert.deepEqual(resultRows.map((row) => row.status), [
  SEGES_RESULT_STATUS.ready,
  SEGES_RESULT_STATUS.review,
  SEGES_RESULT_STATUS.missing,
])
assert.deepEqual(resultRows.map((row) => row.exportable), [true, false, false])

const resultCsv = serializeSegesResultsCsv(resultRows, {
  assessment,
  exportId: 'export-1',
  scope: 'Matemática',
  maxGrade: 10,
})
assert.match(resultCsv, /"AREA";"Matemática"/)
assert.match(resultCsv, /"ESTUDANTE FICTÍCIO A";"DEMO-001";"1";"2";"5,0";"10,0";"PRONTO"/)
assert.match(resultCsv, /"ESTUDANTE FICTÍCIO B";"DEMO-002";"1";"2";"";"10,0";"REVISAR"/)
assert.equal(segesResultsFilename(assessment, 'Matemática'), 'notas-seges-sim-01-matematica.csv')

console.log('Integração SEGES: todos os testes passaram.')
