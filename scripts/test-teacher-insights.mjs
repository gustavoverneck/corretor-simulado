import assert from 'node:assert/strict'
import { regradeAnswers } from '../src/lib/assessment.js'
import { answerKeyGroups, buildAreaReport, buildItemReport, buildTeacherInsights, cronbachAlpha, pairFor, studentsNeedingAttention } from '../src/lib/teacherInsights.js'
import { buildCorrelationWorkbook } from '../src/lib/correlationReport.js'

function random(seed) {
  let state = seed
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 }
}

const letters = ['A', 'B', 'C', 'D', 'E']
const answerKey = Array.from({ length: 20 }, (_, index) => letters[(index * 3) % 5])
const questionAreas = answerKey.map((_, index) => index < 10 ? 'Matemática' : 'Português')
const assessment = { id: 'a1', title: 'Simulado teste', questionCount: 20, optionCount: 5, answerKey, questionAreas, classIds: ['c1', 'c2'] }
const next = random(3)
const students = Array.from({ length: 60 }, (_, index) => ({ id: `s${index}`, name: `Aluno ${index}`, classId: index % 2 ? 'c2' : 'c1' }))
const submissions = students.map((student, studentIndex) => {
  const ability = 0.1 + 0.85 * (studentIndex / 59)
  const answers = answerKey.map((correct, index) => {
    // Q3: todos com dificuldade marcam a mesma alternativa errada; Q7: ninguém responde com base no conhecimento.
    if (index === 2) return { question: 3, selected: [next() < ability * 0.6 ? correct : 'E'], status: 'wrong' }
    if (index === 6) return { question: 7, selected: [letters[Math.floor(next() * 5)]], status: 'wrong' }
    if (studentIndex < 4 && index >= 12) return { question: index + 1, selected: [], status: 'blank' }
    return { question: index + 1, selected: [next() < ability ? correct : letters[Math.floor(next() * 5)]], status: 'wrong' }
  })
  return { id: `sub${studentIndex}`, assessmentId: 'a1', studentId: student.id, classId: student.classId, answers: regradeAnswers(answers, answerKey).answers, answerKeySnapshot: answerKey }
})

const groups = answerKeyGroups(assessment, submissions)
assert.equal(groups.length, 1)
const itemReport = buildItemReport({ assessment: groups[0].assessment, answerKey: groups[0].answerKey, submissions: groups[0].submissions, optionCount: 5 })
assert.equal(itemReport.items.length, 20)
assert.ok(itemReport.alpha > 0.7, `alfa deveria ser alto para dados com habilidade latente (${itemReport.alpha})`)
const typical = itemReport.items.filter((item) => ![2, 6].includes(item.index))
assert.ok(typical.every((item) => item.discrimination > 0.2), 'questões normais discriminam')
assert.ok(Math.abs(itemReport.items[6].discrimination) < 0.25, 'questão aleatória quase não discrimina')
assert.equal(itemReport.items[2].topDistractor.letter, 'E')
assert.match(itemReport.items[2].diagnosis.label, /Erro comum|Muito difícil/)

assert.equal(cronbachAlpha([[1, 1], [0, 0], [1, 1], [0, 0]]), 1)

const areaReport = buildAreaReport({ assessment, submissions, students, classes: [{ id: 'c1', name: '1A' }, { id: 'c2', name: '1B' }] })
assert.deepEqual(areaReport.areas.map((area) => area.area), ['Matemática', 'Português'])
assert.equal(areaReport.byClass.length, 2)
assert.ok(pairFor(areaReport.pairs, 'Português', 'Matemática').r > 0.4, 'áreas guiadas pela mesma habilidade se correlacionam')

const attention = studentsNeedingAttention(areaReport)
assert.ok(attention.some((row) => row.studentId === 's0'), 'aluno mais fraco aparece em atenção')
assert.ok(attention.filter((row) => row.blankRate >= 0.25).length >= 4, 'alunos com muitas em branco aparecem')

const insights = buildTeacherInsights({ itemReport, areaReport, attention })
const titles = insights.map((insight) => insight.title)
for (const title of ['Desempenho geral', 'Áreas', 'Confiabilidade da prova', 'Relação entre áreas', 'Turmas', 'Alunos que precisam de atenção']) assert.ok(titles.includes(title), `falta a leitura "${title}"`)

// Versões com gabaritos diferentes não se misturam na análise de itens.
const versioned = { ...assessment, answerKeyVersions: [{ id: 'v1', label: '1ª série', answerKey }, { id: 'v2', label: '2ª série', answerKey: [...answerKey].reverse() }] }
const mixed = submissions.map((submission, index) => index % 3 ? submission : { ...submission, answerKeySnapshot: [...answerKey].reverse() })
const versionGroups = answerKeyGroups(versioned, mixed)
assert.deepEqual(versionGroups.map((group) => group.label), ['1ª série', '2ª série'])
assert.equal(versionGroups[0].submissions.length + versionGroups[1].submissions.length, 60)

const { bytes, sheetNames } = buildCorrelationWorkbook({ assessment, scopeLabel: 'todas as turmas', itemReport, itemLabel: '', areaReport, insights, attention })
assert.deepEqual(sheetNames, ['Resumo', 'Questões', 'Áreas', 'Alunos'])
assert.ok(bytes.length > 1000)
console.log('Teacher insights tests passed.')
