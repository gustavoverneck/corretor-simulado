import assert from 'node:assert/strict'
import { calibrateItems, computeTriScores, isTriEnabled, setTriEnabled, TRI_MIN_SHEETS } from '../src/lib/tri.js'

let seed = 7
const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const normal = () => Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random())
const correlation = (x, y) => {
  const mx = x.reduce((s, v) => s + v, 0) / x.length
  const my = y.reduce((s, v) => s + v, 0) / y.length
  const cov = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0)
  return cov / Math.sqrt(x.reduce((s, v) => s + (v - mx) ** 2, 0) * y.reduce((s, v) => s + (v - my) ** 2, 0))
}

// Simulado com duas áreas de 15 questões e 250 alunos
const letters = ['A', 'B', 'C', 'D', 'E']
const questionCount = 30
const trueItems = Array.from({ length: questionCount }, (_, index) => ({ a: 0.7 + random() * 1.3, b: -2 + (index % 15) * 0.28, c: 0.2 }))
const answerKey = trueItems.map((_, index) => letters[index % 5])
const assessment = {
  id: 'a1', title: 'Simulado', questionCount, optionCount: 5, answerKey, classIds: ['c1'],
  questionAreas: Array.from({ length: questionCount }, (_, index) => index < 15 ? 'Linguagens' : 'Matemática'),
}
const thetas = Array.from({ length: 250 }, normal)
const submissions = thetas.map((theta, studentIndex) => ({
  id: `s${studentIndex}`, assessmentId: 'a1', studentId: `st${studentIndex}`, classId: 'c1',
  answers: trueItems.map((item) => {
    const p = item.c + (1 - item.c) / (1 + Math.exp(-item.a * (theta - item.b)))
    return { status: random() < p ? 'correct' : 'wrong' }
  }),
}))

assert.equal(isTriEnabled(assessment), false)
assert.equal(computeTriScores(assessment, submissions).scores.size, 0, 'desligada não calcula nada')
const enabled = setTriEnabled(assessment, true)
assert.equal(isTriEnabled(enabled), true)

const started = performance.now()
const { scores, groups } = computeTriScores(enabled, submissions)
const elapsed = performance.now() - started
assert.ok(elapsed < 8000, `TRI demorou ${Math.round(elapsed)} ms`)
assert.equal(scores.size, 250)
assert.equal(groups[0].status, 'ok')
assert.deepEqual(groups[0].areas.map((item) => item.area), ['Linguagens', 'Matemática'])

const tri = submissions.map((submission) => scores.get(submission.id).score)
const mean = tri.reduce((s, v) => s + v, 0) / tri.length
assert.ok(Math.abs(mean - 500) < 5, `média ${mean}`)
assert.ok(correlation(tri, thetas) > 0.85, `TRI acompanha a proficiência real (${correlation(tri, thetas).toFixed(3)})`)
const entry = scores.get('s0')
assert.equal(entry.score, Math.round((entry.areas.Linguagens + entry.areas.Matemática) / 2), 'geral é a média das áreas')

// Coerência: mesmo número de acertos, acertando as fáceis vale mais que acertar as difíceis
const easyFirst = { id: 'coerente', assessmentId: 'a1', studentId: 'x1', classId: 'c1', answers: trueItems.map((_, index) => ({ status: index % 15 < 7 ? 'correct' : 'wrong' })) }
const hardFirst = { id: 'chute', assessmentId: 'a1', studentId: 'x2', classId: 'c1', answers: trueItems.map((_, index) => ({ status: index % 15 >= 8 ? 'correct' : 'wrong' })) }
const withPair = computeTriScores(enabled, [...submissions, easyFirst, hardFirst]).scores
assert.ok(withPair.get('coerente').score > withPair.get('chute').score + 20, `coerente ${withPair.get('coerente').score} x chute ${withPair.get('chute').score}`)

// Anulada pelo professor fica fora; questões anuladas no gabarito não entram
const voided = { ...submissions[1], id: 'anulada', voided: { reason: 'cola' } }
assert.equal(computeTriScores(enabled, [...submissions, voided]).scores.has('anulada'), false)
const annulledKey = { ...enabled, answerKey: answerKey.map((letter, index) => index < 12 ? null : letter) }
const annulledGroups = computeTriScores(annulledKey, submissions.map((item) => ({ ...item, answerKeySnapshot: annulledKey.answerKey }))).groups
assert.deepEqual(annulledGroups[0].areas.map((item) => [item.area, item.items, item.status]), [['Linguagens', 3, 'few-items'], ['Matemática', 15, 'ok']])

// Poucas folhas: não calcula
const few = computeTriScores(enabled, submissions.slice(0, TRI_MIN_SHEETS - 1))
assert.equal(few.scores.size, 0)
assert.equal(few.groups[0].status, 'small')

// Parâmetros recuperados ficam próximos dos reais
const items = calibrateItems(submissions.map((s) => s.answers.slice(0, 15).map((a) => a.status === 'correct' ? 1 : 0)))
assert.ok(correlation(items.map((i) => i.b), trueItems.slice(0, 15).map((i) => i.b)) > 0.9)

console.log(`tri ok (${Math.round(elapsed)} ms)`)
