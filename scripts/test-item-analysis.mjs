import assert from 'node:assert/strict'
import { regradeAnswers } from '../src/lib/assessment.js'
import { analyzeItems, submissionsForAnswerKey, suspiciousItems } from '../src/lib/itemAnalysis.js'

// Gerador determinístico para que o teste seja reproduzível.
function random(seed) {
  let state = seed
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 }
}

const letters = ['A', 'B', 'C', 'D', 'E']
function simulate({ trueKey, printedKey, students = 60, seed = 7, ambiguous = [] }) {
  const next = random(seed)
  return Array.from({ length: students }, (_, studentIndex) => {
    const ability = 0.15 + 0.8 * (studentIndex / (students - 1))
    const answers = trueKey.map((correct, index) => {
      // Numa questão ambígua, os melhores alunos escolhem a alternativa errada mais elaborada.
      const target = ambiguous.includes(index) && ability > 0.55 ? letters[(letters.indexOf(correct) + 1) % 5] : correct
      const letter = next() < ability ? target : letters[Math.floor(next() * 5)]
      return { question: index + 1, selected: [letter], status: 'wrong' }
    })
    return { id: `s${studentIndex}`, assessmentId: 'a1', answers: regradeAnswers(answers, printedKey).answers, answerKeySnapshot: printedKey }
  })
}

const trueKey = Array.from({ length: 20 }, (_, index) => letters[(index * 3) % 5])
const printedKey = [...trueKey]
printedKey[4] = letters[(letters.indexOf(trueKey[4]) + 2) % 5]

const submissions = simulate({ trueKey, printedKey })
const items = analyzeItems({ answerKey: printedKey, submissions, optionCount: 5 })
const flagged = suspiciousItems(items)
assert.equal(flagged[0]?.number, 5, 'a questão com gabarito trocado deve ser a primeira suspeita')
assert.equal(flagged[0].flag, 'key')
assert.equal(flagged[0].suggested, trueKey[4], 'deve sugerir a alternativa que os melhores alunos marcaram')
assert.equal(flagged.filter((item) => item.flag === 'key').length, 1, 'nenhuma outra questão correta deve ser apontada como gabarito errado')

// Gabarito correto: nenhum alerta de gabarito.
const clean = analyzeItems({ answerKey: trueKey, submissions: simulate({ trueKey, printedKey: trueKey, seed: 11 }), optionCount: 5 })
assert.equal(suspiciousItems(clean).filter((item) => item.flag === 'key').length, 0)

// Poucas folhas: não emite alertas.
const few = analyzeItems({ answerKey: printedKey, submissions: submissions.slice(0, 6), optionCount: 5 })
assert.equal(suspiciousItems(few).length, 0)
assert.equal(few[4].flag, 'insufficient')

// Questões anuladas ou canceladas são ignoradas.
const annulledKey = [...printedKey]; annulledKey[4] = null
assert.equal(analyzeItems({ answerKey: annulledKey, submissions, optionCount: 5 })[4].flag, 'skipped')

// Distribuição conta brancos e múltiplas separadamente.
const mixed = [{ assessmentId: 'a1', answers: [{ selected: [] }, { selected: ['A', 'B'] }] }]
const mixedItems = analyzeItems({ answerKey: ['A', 'A'], submissions: mixed, optionCount: 4 })
assert.equal(mixedItems[0].blank, 1)
assert.equal(mixedItems[1].multiple, 1)

// Apenas as folhas corrigidas com o mesmo gabarito entram na análise.
const other = { ...submissions[0], id: 'other', answerKeySnapshot: trueKey }
assert.equal(submissionsForAnswerKey({ id: 'a1' }, [...submissions, other], printedKey).length, submissions.length)

console.log('item analysis: ok')
