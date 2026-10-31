import assert from 'node:assert/strict'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildClassBenchmarks, buildStudentReport } from '../src/lib/studentReport.js'
import { createStudentReportPdf, studentReportFilename, wrongQuestions } from '../src/lib/studentReportPdf.js'

const key = ['A', 'B', 'C', 'D', 'E', 'A', 'B', 'C', 'D', 'E']
const areas = [...Array(5).fill('Linguagens'), ...Array(5).fill('Matemática')]
const assessment = (id, date) => ({ id, title: `Simulado ${id}`, code: id.toUpperCase(), date, questionCount: 10, optionCount: 5, classIds: ['c1'], answerKey: key, questionAreas: areas })
const assessments = [assessment('s2', '2026-08-10'), assessment('s1', '2026-05-10'), assessment('s3', '2026-10-10')]
const students = [
  { id: 'ana', name: 'Ana Souza', registration: '1', classId: 'c1', status: 'Ativo' },
  { id: 'bia', name: 'Bia Lima', registration: '2', classId: 'c1', status: 'Ativo' },
]
const answers = (correctIndexes) => key.map((letter, index) => correctIndexes.includes(index)
  ? { status: 'correct', selected: [letter], expected: letter }
  : { status: 'wrong', selected: [letter === 'A' ? 'B' : 'A'], expected: letter })
const submission = (id, assessmentId, studentId, correct, extra = {}) => ({ id, assessmentId, studentId, classId: 'c1', status: 'Corrigido', answers: answers(correct), answerKeySnapshot: key, ...extra })
const submissions = [
  submission('a1', 's1', 'ana', [0, 1, 2, 3, 4, 5, 6, 7, 8]),
  submission('a2', 's2', 'ana', [0, 1, 2, 3, 4, 5, 6]),
  submission('b1', 's1', 'bia', [0, 1, 2, 3, 4]),
  submission('b2', 's2', 'bia', [0, 1, 2, 3, 4, 5]),
  submission('b3', 's3', 'bia', [0, 1, 2]),
  submission('x3', 's3', 'ana', [0], { voided: { reason: 'cola' } }),
]

const benchmarks = buildClassBenchmarks(assessments, submissions, students)
assert.equal(benchmarks.get('s1:c1').score, 70)
assert.equal(benchmarks.get('s3:c1').score, 30, 'prova anulada não entra na média da turma')
assert.equal(benchmarks.get('s1:c1').areas.get('Matemática'), 40)

const ana = buildStudentReport({ student: students[0], assessments, submissions, benchmarks })
assert.deepEqual(ana.entries.map((entry) => [entry.assessment.id, entry.status]), [['s1', 'done'], ['s2', 'done'], ['s3', 'voided']], 'ordem de aplicação')
assert.deepEqual(ana.done.map((entry) => entry.score), [90, 70])
assert.equal(ana.average, 80)
assert.equal(ana.delta, -20)
assert.equal(ana.classAverage, 68)
const math = ana.areas.find((area) => area.area === 'Matemática')
assert.deepEqual([math.average, math.latest, math.delta, math.classAverage], [60, 40, -40, 35])
assert.ok(ana.alerts.some((alert) => alert.tone === 'red' && /Caiu 20 pontos/.test(alert.text)))
assert.ok(ana.alerts.some((alert) => /Matemática: caiu 40/.test(alert.text)))
assert.equal(ana.attention, true)

const bia = buildStudentReport({ student: students[1], assessments: [...assessments, { ...assessment('s4', '2026-11-01'), absentStudentIds: ['bia'] }], submissions, benchmarks })
assert.equal(bia.entries.at(-1).status, 'absent')
assert.ok(bia.alerts.some((alert) => /1 ausência/.test(alert.text)))
assert.ok(bia.alerts.some((alert) => /Matemática: caiu 20/.test(alert.text)))

// Questões a retomar do último simulado
assert.deepEqual(wrongQuestions(ana.latest).map((question) => question.number), [8, 9, 10])

// TRI aparece quando informada
const tri = new Map([['s1', { scores: new Map([['a1', { score: 612, areas: { Linguagens: 600, Matemática: 624 } }]]) }]])
const withTri = buildStudentReport({ student: students[0], assessments, submissions, benchmarks, triScores: tri })
assert.equal(withTri.done[0].tri.score, 612)
assert.equal(withTri.done[0].areas.find((area) => area.area === 'Matemática').tri, 624)

const blob = await createStudentReportPdf({ reports: [withTri, bia], classes: [{ id: 'c1', name: '3ª A', shift: 'Matutino' }], school: { name: 'Escola Teste' }, issuedAt: '2026-10-31' })
const pdf = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
assert.equal(pdf.numPages, 2, 'um aluno por página')
const pageText = async (number) => (await (await pdf.getPage(number)).getTextContent()).items.map((item) => item.str).join(' ')
const first = await pageText(1)
for (const expected of ['BOLETIM DO ALUNO', 'Ana Souza', 'Turma 3ª A', 'Simulado s1', 'Anulada', 'Por área de conhecimento', 'Matemática', '-40 pts', 'Pontos de atenção', 'Questões a retomar', 'TRI', '612']) assert.ok(first.includes(expected), `boletim contém ${expected}`)
assert.ok((await pageText(2)).includes('Ausente'))
assert.equal(studentReportFilename([ana]), 'boletim-ana-souza.pdf')
assert.equal(studentReportFilename([ana, bia], { name: '3ª A' }), 'boletins-3-a.pdf')

console.log('student report ok')
