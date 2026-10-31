import assert from 'node:assert/strict'
import { strFromU8, unzipSync } from 'fflate'
import {
  activeSubmissions,
  describeVoid,
  inheritVoid,
  isSubmissionVoided,
  normalizeSubmissionVoid,
  restoreVoidedSubmission,
  voidSubmission,
} from '../src/lib/voidedSubmission.js'
import { getPendingReviewSubmissions } from '../src/lib/assessment.js'
import { buildSegesResultRows, SEGES_RESULT_STATUS, serializeSegesResultsCsv } from '../src/lib/segesResults.js'
import { buildGradeList, generateGradeListWorkbook } from '../src/lib/gradeListReport.js'
import { calculateSubmissionMetrics } from '../src/lib/results.js'

const assessment = { id: 'a', code: 'SIM', title: 'Simulado', questionCount: 2, classIds: ['c1'], answerKey: ['A', 'B'], questionAreas: ['Matemática', 'Linguagens'] }
const classes = [{ id: 'c1', name: '1ª A' }]
const students = [
  { id: 's1', name: 'Ana', registration: '1', classId: 'c1', status: 'Ativo' },
  { id: 's2', name: 'Bruno', registration: '2', classId: 'c1', status: 'Ativo' },
]
const answers = (first, second) => [{ status: first }, { status: second }]
const submissions = [
  { id: 'old', assessmentId: 'a', studentId: 's1', classId: 'c1', status: 'Corrigido', correctedAt: '2026-10-01', answers: answers('correct', 'correct') },
  { id: 'new', assessmentId: 'a', studentId: 's1', classId: 'c1', status: 'Revisar', correctedAt: '2026-10-02', answers: answers('correct', 'uncertain') },
  { id: 'b', assessmentId: 'a', studentId: 's2', classId: 'c1', status: 'Corrigido', correctedAt: '2026-10-02', answers: answers('correct', 'wrong') },
]

// Anular marca todas as folhas do aluno naquele simulado e guarda o motivo.
const voided = voidSubmission(submissions, submissions[1], { reason: 'Cola', note: ' bilhete na carteira ', at: '2026-10-30T10:00:00Z' })
assert.deepEqual(voided.filter(isSubmissionVoided).map((item) => item.id), ['old', 'new'])
assert.deepEqual(voided[0].voided, { reason: 'Cola', note: 'bilhete na carteira', at: '2026-10-30T10:00:00Z' })
assert.equal(describeVoid(voided[0].voided), 'Cola: bilhete na carteira')
assert.equal(describeVoid({ reason: 'Outro', note: 'Saiu da sala' }), 'Saiu da sala')
assert.deepEqual(activeSubmissions(voided).map((item) => item.id), ['b'])
assert.equal(submissions[0].voided, undefined, 'não altera o array original')

// Folhas anuladas não ficam na fila de revisão.
assert.deepEqual(getPendingReviewSubmissions(submissions, [assessment]).map((item) => item.id), ['new'])
assert.deepEqual(getPendingReviewSubmissions(voided, [assessment]), [])

// SEGES: mesmo cabeçalho, status ANULADA, sem acertos e sem nota.
const segesRows = buildSegesResultRows({ assessment, classes, students, submissions: voided, classIds: ['c1'] })
assert.equal(segesRows[0].status, SEGES_RESULT_STATUS.voided)
assert.equal(segesRows[0].exportable, false)
assert.equal(segesRows[0].metrics, null)
assert.equal(segesRows[1].status, SEGES_RESULT_STATUS.ready)
const csv = serializeSegesResultsCsv(segesRows, { assessment, exportId: 'x', maxGrade: 10 }).split('\n')
assert.equal(csv[0], '"versao";"exportacao_id";"simulado_id";"simulado_codigo";"simulado_nome";"tipo_recorte";"recorte";"turma";"aluno";"matricula";"acertos";"questoes_validas";"nota";"nota_maxima";"status"')
assert.equal(csv[1], '"1";"x";"a";"SIM";"Simulado";"GERAL";"Nota geral";"1ª A";"Ana";"1";"";"";"";"10,0";"ANULADA"')
assert.match(csv[2], /"5,0";"10,0";"PRONTO"$/)

// Desfazer devolve a nota e guarda o histórico.
const restored = restoreVoidedSubmission(voided, voided[0], '2026-10-31T09:00:00Z')
assert.deepEqual(restored.filter(isSubmissionVoided), [])
assert.deepEqual(restored[1].voidHistory, [{ reason: 'Cola', note: 'bilhete na carteira', at: '2026-10-30T10:00:00Z', restoredAt: '2026-10-31T09:00:00Z' }])
assert.equal(buildSegesResultRows({ assessment, classes, students, submissions: restored, classIds: ['c1'] })[0].status, SEGES_RESULT_STATUS.review)

// Nova leitura da mesma prova continua anulada.
const reread = inheritVoid({ id: 'again', assessmentId: 'a', studentId: 's1' }, voided)
assert.equal(reread.voided.reason, 'Cola')
assert.equal(inheritVoid({ id: 'other', assessmentId: 'a', studentId: 's2' }, voided).voided, undefined)

// Migração: dados antigos ficam iguais; campo malformado é descartado.
const legacy = { id: 'x', status: 'Corrigido' }
assert.equal(normalizeSubmissionVoid(legacy), legacy)
assert.deepEqual(normalizeSubmissionVoid({ id: 'x', voided: null }), { id: 'x' })
assert.deepEqual(normalizeSubmissionVoid({ id: 'x', voided: 'sim' }), { id: 'x' })
assert.deepEqual(normalizeSubmissionVoid({ id: 'x', voided: { reason: 'Cola' } }).voided, { reason: 'Cola', note: '', at: null })

// Planilha de notas: aparece como Anulada e não entra na média.
const rows = voided.map((row) => ({ ...row, ...calculateSubmissionMetrics(row, assessment), assessment, student: students.find((item) => item.id === row.studentId), classroom: classes[0] }))
const list = buildGradeList({ assessments: [assessment], rows: rows.filter((row) => !row.voided), voidedRows: rows.filter((row) => row.voided), selectedAreas: ['Matemática', 'Linguagens'] })
const block = list.classes[0].assessments[0]
assert.deepEqual(block.students.map((student) => [student.name, student.voided || null, student.score]), [['Ana', 'Cola: bilhete na carteira', null], ['Bruno', null, 50]])
assert.equal(block.average, 50)
assert.deepEqual(block.areaAverages, [100, 0])
const file = generateGradeListWorkbook(list)
const zip = unzipSync(new Uint8Array(await file.blob.arrayBuffer()))
const sheet = strFromU8(zip['xl/worksheets/sheet1.xml'])
const shared = strFromU8(zip['xl/sharedStrings.xml'] || new Uint8Array())
assert.ok(`${sheet}${shared}`.includes('Anulada'), 'célula marcada como Anulada')

console.log('voided submission tests passed')
