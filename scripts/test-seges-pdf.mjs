import assert from 'node:assert/strict'
import { createSegesPdfParser, readSegesPdf } from '../src/lib/segesPdf.js'
import { autoMapHeaders, importSegesRows, validateMapping } from '../src/lib/seges.js'

const item = (str, x, y, width = 20) => ({ str, transform: [1, 0, 0, 1, x, y], width })
const header = (name) => [item(`Turma: ${name}`, 330, 580), item('ID', 67, 550), item('INEP', 124, 550), item('Nome', 220, 550), item('Situação', 725, 550)]
const student = (id, y, name = 'ALUNO DE TESTE') => [
  item(id, 41, y), item('123456789', 111, y), item('001', 111, y - 9),
  item(name, 165, y), item('SOBRENOME', 165, y - 9),
  item('25/11/200', 310, y), item('9', 310, y - 9),
  item('CPF', 590, y), item('000.000.000-00', 590, y - 9),
  item('NOVA', 725, y), item('TO', 725, y - 9),
]
const parser = createSegesPdfParser()
parser.addPage({ items: [...header('2ªM01-EM-MCN'), ...student('123', 500)] }, 1)
parser.addPage({ items: student('456', 560) }, 2) // continuation without headers
parser.addPage({ items: [...header('2ªM01-EM-MCN'), ...student('123', 500)] }, 3) // repeated section
parser.addPage({ items: [...header('3ªIV01-EMI-LOG'), ...student('789', 500, 'OUTRO ALUNO')] }, 4)
const parsed = parser.finish()
assert.equal(parsed.rows.length, 3)
assert.equal(parsed.rows[0]['Nome do aluno'], 'ALUNO DE TESTE SOBRENOME')
assert.equal(parsed.rows[0]['Matrícula'], '123')
assert.equal(parsed.rows[0].Status, 'Matriculado')
assert.equal(parsed.rows[0]['Situação no PDF'], 'NOVATO')
assert.equal(parsed.rows[1].Turma, '2ªM01-EM-MCN')
assert.equal(parsed.rows[2].Turma, '3ªIV01-EMI-LOG')
const mapping = autoMapHeaders(parsed.headers)
assert.deepEqual(validateMapping(mapping, { manualShift: 'Matutino' }), [])
const state = { school: {}, classes: [], students: [], importHistory: [] }
const first = importSegesRows(state, parsed.rows, mapping, 'turmas.pdf', { manualShift: 'Matutino' })
assert.equal(first.summary.added, 3)
assert.ok(first.state.students.every((student) => student.status === 'Ativo' && student.sourceStatus === 'Matriculado'))
const second = importSegesRows(first.state, parsed.rows, mapping, 'turmas.pdf', { manualShift: 'Matutino' })
assert.equal(second.summary.added, 0)
assert.equal(second.summary.updated, 3)
assert.equal(second.state.students.length, 3)
assert.throws(() => createSegesPdfParser().finish(), /texto selecionável/)
const unsupported = createSegesPdfParser()
unsupported.addPage({ items: [item('Um documento sem tabela', 40, 500)] }, 1)
assert.throws(() => unsupported.finish(), /tabela/)
const incomplete = createSegesPdfParser()
assert.throws(() => incomplete.addPage({ items: [...header('1ªM01'), item('123', 41, 500)] }, 1), /incompleto/)
let destroyed = false
await assert.rejects(readSegesPdf({ arrayBuffer: async () => new ArrayBuffer(0) }, () => ({
  promise: Promise.reject(new Error('PDF inválido')), destroy: async () => { destroyed = true },
})), /PDF inválido/)
assert.equal(destroyed, true)
console.log('SEGES PDF: nomes quebrados, datas quebradas, continuação, turmas, repetição, situação, reimportação e erros OK.')
