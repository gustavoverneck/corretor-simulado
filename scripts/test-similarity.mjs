import assert from 'node:assert/strict'
import { regradeAnswers } from '../src/lib/assessment.js'
import { buildSimilarityReport, compareSubmissions, poissonTail } from '../src/lib/similarity.js'

function random(seed) {
  let state = seed
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 }
}

assert.equal(poissonTail(0, 2), 1)
assert.ok(Math.abs(poissonTail(1, 2) - (1 - Math.exp(-2))) < 1e-9)
assert.ok(poissonTail(9, 1.5) < 0.001)

const letters = ['A', 'B', 'C', 'D', 'E']
const answerKey = Array.from({ length: 40 }, (_, index) => letters[(index * 3) % 5])
const next = random(5)
const students = Array.from({ length: 30 }, (_, index) => ({ id: `s${index}`, name: `Aluno ${String(index).padStart(2, '0')}`, classId: index < 20 ? 'c1' : 'c2' }))
const raw = students.map((student, index) => {
  const ability = 0.3 + 0.6 * (index / 29)
  return answerKey.map((correct, question) => ({ question: question + 1, selected: [next() < ability ? correct : letters[Math.floor(next() * 5)]], status: 'wrong' }))
})
// s3 copia s2 quase inteira; s4 copia s2 em parte, formando um grupo de três.
raw[3] = raw[2].map((answer, index) => index % 10 === 0 ? { ...answer, selected: [answerKey[index]] } : { ...answer })
raw[4] = raw[2].map((answer, index) => index % 4 === 0 ? { ...answer, selected: [answerKey[index]] } : { ...answer })
// s25 (outra turma) também é cópia de s2: não pode ser comparado, porque está em outra sala.
raw[25] = raw[2].map((answer) => ({ ...answer }))
const submissions = students.map((student, index) => ({ id: `sub${index}`, assessmentId: 'a1', studentId: student.id, classId: student.classId, answers: regradeAnswers(raw[index], answerKey).answers }))

const report = buildSimilarityReport({ submissions, students, classes: [{ id: 'c1', name: '1A' }, { id: 'c2', name: '1B' }], questionCount: 40, answerKey })
assert.equal(report.pairs.length, 20 * 19 / 2 + 10 * 9 / 2, 'só pares da mesma turma')
const key = (pair) => [pair.first.id, pair.second.id].sort().join('-')
const top = report.pairs[0]
assert.equal(top.level, 'high')
assert.ok(['s2-s3', 's3-s4', 's2-s4'].includes(key(top)), `par copiado deve ser o primeiro (${key(top)})`)
assert.ok(report.flagged.some((pair) => key(pair) === 's2-s3'))
assert.ok(!report.pairs.some((pair) => key(pair) === 's2-s25' || key(pair) === 's25-s2'))
assert.ok(report.groups.some((group) => ['s2', 's3', 's4'].every((id) => group.students.some((student) => student.id === id))), 'grupo de três alunos')
const falseAlarms = report.flagged.filter((pair) => ![pair.first.id, pair.second.id].some((id) => ['s2', 's3', 's4'].includes(id)))
assert.ok(falseAlarms.length <= 2, `poucos alarmes entre alunos independentes (${falseAlarms.length})`)

// Dois alunos perfeitos têm 100% de respostas iguais, mas nenhum erro igual: não são suspeitos.
const perfect = regradeAnswers(answerKey.map((letter, index) => ({ question: index + 1, selected: [letter], status: 'wrong' })), answerKey).answers
const twins = compareSubmissions({ answers: perfect }, { answers: perfect }, { questionCount: 40, answerKey })
assert.equal(twins.agreement, 100)
assert.equal(twins.sameWrong, 0)
assert.equal(twins.level, 'low')
assert.match(twins.reason, /acertaram quase as mesmas/)

// Folhas idênticas em que os erros são os mais comuns da turma ainda pedem conferência.
const common = Array.from({ length: 12 }, (_, index) => ({ answers: regradeAnswers(answerKey.map((letter, question) => ({ question: question + 1, selected: [question < 4 ? letters[(letters.indexOf(letter) + 1) % 5] : letter], status: 'wrong' })), answerKey).answers }))
const commonReport = buildSimilarityReport({ submissions: common.map((sheet, index) => ({ ...sheet, id: `c${index}`, studentId: `c${index}`, classId: 'c1' })), questionCount: 40, answerKey })
const sameSheets = commonReport.pairs[0]
assert.equal(sameSheets.agreement, 100)
assert.ok(sameSheets.p > 0.01, 'os erros sozinhos parecem acaso')
assert.equal(sameSheets.level, 'medium', 'folhas idênticas com erros em comum ficam em atenção')
assert.match(sameSheets.reason, /Folhas idênticas/)

// Brancos na mesma questão também contam como resposta igual.
const blanks = regradeAnswers(answerKey.map((letter, question) => ({ question: question + 1, selected: question >= 30 ? [] : [letter], status: 'wrong' })), answerKey).answers
const blankPair = compareSubmissions({ answers: blanks }, { answers: blanks }, { questionCount: 40, answerKey })
assert.equal(blankPair.sameWrong, 10)
assert.equal(blankPair.sameBlank, 10)
console.log('Similarity tests passed.')
