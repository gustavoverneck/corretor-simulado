import assert from 'node:assert/strict'
import { buildClassReport, describeScores, questionSkill } from '../src/lib/classReport.js'

const key = ['A', 'B', 'C', 'D', 'E', 'A', 'B', 'C', 'D', 'E']
const areas = [...Array(5).fill('Linguagens'), ...Array(5).fill('Matemática')]
const assessment = (id, date, extra = {}) => ({ id, title: `Simulado ${id}`, code: id.toUpperCase(), date, questionCount: 10, optionCount: 5, classIds: ['c1', 'c2'], answerKey: key, questionAreas: areas, ...extra })
const skills = ['H1', 'H1', 'H2', 'H2', 'H2', 'H3', 'H3', 'H4', 'H4', 'H4']
const assessments = [assessment('s2', '2026-08-10', { questionSkills: skills }), assessment('s1', '2026-05-10', { absentStudentIds: ['s4'] })]
const classes = [{ id: 'c1', name: '3ª A' }, { id: 'c2', name: '3ª B' }]
const students = [
  ...['s1', 's2', 's3', 's4', 's5'].map((id) => ({ id, name: `Aluno ${id}`, classId: 'c1', status: 'Ativo' })),
  ...['o1', 'o2', 'o3'].map((id) => ({ id, name: `Outro ${id}`, classId: 'c2', status: 'Ativo' })),
]
const answers = (correct, blankFrom = 99) => key.map((letter, index) => correct.includes(index)
  ? { status: 'correct', selected: [letter], expected: letter }
  : index >= blankFrom ? { status: 'blank', selected: [], expected: letter } : { status: 'wrong', selected: [letter === 'A' ? 'B' : 'A'], expected: letter })
const sheet = (id, assessmentId, studentId, correct, extra = {}) => ({ id, assessmentId, studentId, classId: students.find((s) => s.id === studentId).classId, status: 'Corrigido', answers: answers(correct, extra.blankFrom), answerKeySnapshot: key, ...extra })
const submissions = [
  // s1: turma c1 fraca em Matemática (índices 5–9)
  sheet('a1', 's1', 's1', [0, 1, 2, 3, 4, 5]),
  sheet('a2', 's1', 's2', [0, 1, 2, 3]),
  sheet('a3', 's1', 's3', [0, 1, 2, 3, 4, 5, 6, 7]),
  sheet('a5', 's1', 's5', [0], { voided: { reason: 'Cola' } }),
  sheet('o1', 's1', 'o1', [0, 1, 5, 6, 7, 8]),
  sheet('o2', 's1', 'o2', [0, 2, 5, 6, 7, 9]),
  sheet('o3', 's1', 'o3', [1, 2, 5, 6, 7]),
  // s2
  sheet('b1', 's2', 's1', [0, 1, 2, 3, 4], { blankFrom: 8 }),
  sheet('b2', 's2', 's2', [0, 1, 2], { blankFrom: 8 }),
  sheet('b3', 's2', 's3', [0, 1, 2, 3, 4, 5]),
  sheet('b4', 's2', 's4', [0, 1, 2, 3], { blankFrom: 8 }),
  sheet('p1', 's2', 'o1', [0, 1, 5, 6, 7, 8, 9]),
  sheet('p2', 's2', 'o2', [0, 5, 6, 7, 8]),
]
const data = { classes, students, assessments, submissions }

const report = buildClassReport({ classId: 'c1', data })
assert.deepEqual(report.done.map((entry) => entry.assessment.id), ['s1', 's2'], 'ordem de aplicação')
const first = report.done[0]
assert.equal(first.stats.n, 3, 'prova anulada fica fora')
assert.equal(first.voided, 1)
assert.equal(first.absent, 1)
assert.equal(first.stats.mean, 60)
assert.equal(first.othersMean, 57)
assert.equal(report.distribution.n, 4)
assert.deepEqual(report.students.map((item) => [item.student.id, item.average]), [['s3', 70], ['s1', 55], ['s4', 40], ['s2', 35]])
assert.equal(report.areas[0].area, 'Matemática', 'área mais fraca primeiro')
assert.ok(report.areas[0].others > report.areas[0].score)

// Habilidades cadastradas no simulado
const h4 = report.skills.find((item) => item.label === 'H4')
assert.equal(h4.questions, 3)
assert.equal(h4.score, 0)
assert.ok(h4.others > 0)

const ids = report.conclusions.map((item) => item.id)
assert.ok(ids.includes('level') && ids.includes('weak-area') && ids.includes('skills'), ids.join(','))
const weak = report.conclusions.find((item) => item.id === 'weak-area')
assert.match(weak.text, /mais desta turma do que da prova/)
assert.match(report.conclusions.find((item) => item.id === 'time')?.text || '', /último quarto/)
assert.match(report.conclusions.find((item) => item.id === 'participation').text, /anulada/)

// Um simulado só
const single = buildClassReport({ classId: 'c1', data, assessmentId: 's1' })
assert.equal(single.scoped.length, 1)
assert.deepEqual(single.students.map((item) => item.average), [80, 60, 40])
assert.match(single.conclusions[0].title, /no S1/)

// Distribuição
const stats = describeScores([10, 20, 45, 70, 90, 100])
assert.deepEqual(stats.bands.map((band) => band.count), [2, 1, 1, 2])
assert.equal(stats.histogram.at(-1).count, 2, '100% entra na última faixa')
assert.equal(stats.median, 58)

// Habilidade do ENEM pelo código do item do INEP
const enem = { id: 'e', questionCount: 2, answerKey: ['A', 'B'], tri: { enem: { versions: [{ versionId: 'default', keySignature: JSON.stringify(['A', 'B']), items: [{ area: 'LC', item: '153930' }, { area: 'MT', a: 1 }] }] } } }
const enemSheet = { assessmentId: 'e', answerKeySnapshot: ['A', 'B'], answers: [] }
assert.deepEqual(questionSkill(enem, enemSheet, 0), { key: 'enem:LC:6', label: 'H6', area: 'Linguagens', source: 'enem', item: '153930' })
assert.equal(questionSkill(enem, enemSheet, 1), null)

// Turma sem provas
const empty = buildClassReport({ classId: 'c2', data: { ...data, submissions: [] } })
assert.equal(empty.distribution.n, 0)
assert.deepEqual(empty.conclusions, [])
console.log('class report ok')
for (const item of report.conclusions) console.log(`- [${item.tone}] ${item.title}: ${item.text}`)
