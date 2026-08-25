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

const headers = ['Número', 'Nome do aluno', 'Status', 'Nome da turma', 'Data e hora da captura']
const parsed = await readSegesFile({
  name: 'alunos.csv',
  text: async () => `${headers.join(',')}\n1,AGATHA   PRADO SOUZA,Sem status,2ªIV01-EMI-LOG,2026-08-25T19:13:52.389Z`,
})
assert.deepEqual(parsed.headers, headers)
assert.equal(parsed.rows[0]['Nome do aluno'], 'AGATHA   PRADO SOUZA')

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
assert.equal(resolveSegesValue({}, mapping, 'schoolInep', { school: { inep: '32000001' } }), '32000001')

const rows = [
  { Número: '1', 'Nome do aluno': 'AGATHA   PRADO SOUZA', Status: 'Sem status', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.389Z' },
  { Número: '2', 'Nome do aluno': 'ARIELLY ALVES FERREIRA', Status: 'Transferido', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.390Z' },
  { Número: '3', 'Nome do aluno': 'JOÃO DE SOUZA', Status: 'Em transferência', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.391Z' },
  { Número: 'LANÇAR PARA TODOS', 'Nome do aluno': 'Não avaliado', Status: 'Sem status', 'Nome da turma': '2ªIV01-EMI-LOG', 'Data e hora da captura': '2026-08-25T19:13:52.392Z' },
]
const state = {
  school: { name: 'EEEFM Exemplo', inep: '32000001' },
  classes: [],
  students: [],
  importHistory: [],
}
const result = importSegesRows(state, rows, mapping, 'alunos.csv', { manualShift: 'Vespertino' })

assert.equal(result.summary.added, 2)
assert.equal(result.summary.updated, 0)
assert.equal(result.summary.skipped, 2)
assert.equal(result.state.classes.length, 1)
assert.equal(result.state.classes[0].grade, '2ª série')
assert.equal(result.state.classes[0].shift, 'Vespertino')
assert.equal(result.state.students[0].name, 'AGATHA PRADO SOUZA')
assert.equal(result.state.students[0].status, 'Ativo')
assert.equal(result.state.students[0].sourceStatus, 'Sem status')
assert.equal(result.state.students[1].sourceStatus, 'Em transferência')
assert.equal(result.state.students.some((student) => student.name === 'Não avaliado'), false)
assert.equal(result.state.importHistory[0].school, 'EEEFM Exemplo')
assert.equal(result.state.importHistory[0].schoolInep, '32000001')

console.log('Importador SEGES: todos os testes passaram.')
