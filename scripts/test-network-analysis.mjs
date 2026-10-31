import assert from 'node:assert/strict'
import { createInitialState } from '../src/data.js'
import { buildBipartiteNetwork, buildQuestionNetwork, buildStudentNetwork, buildTemporalAnalysis, pearsonWithInference, adjustPValues, withMultipleComparison } from '../src/lib/networkAnalysis.js'

const perfect = pearsonWithInference([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12])
assert.ok(perfect.r > .999)
assert.equal(perfect.significant, true)

const state = createInitialState()
const assessment = state.assessments.find((item) => item.id === 'assessment-diagnostico')
const students = buildStudentNetwork({ assessment, submissions: state.submissions, students: state.students, threshold: .6 })
const questions = buildQuestionNetwork({ assessment, submissions: state.submissions })
const bipartite = buildBipartiteNetwork({ assessment, submissions: state.submissions, students: state.students })
const timeline = buildTemporalAnalysis({ assessments: state.assessments, submissions: state.submissions, students: state.students })

assert.equal(students.nodes.length, 42)
assert.ok(students.density >= 0 && students.density <= 1)
assert.ok(students.nodes.every((node) => Number.isFinite(node.centrality.degree)))
assert.equal(questions.nodes.length, assessment.questionCount)
assert.equal(bipartite.studentCount, 42)
assert.equal(bipartite.questionCount, assessment.questionCount)
assert.ok(timeline.length >= 2)
// Correção para muitos testes (Benjamini-Hochberg)
const q = adjustPValues([0.01, 0.04, 0.03, 0.5, null])
assert.deepEqual(q.map((value) => value === null ? null : Math.round(value * 1000) / 1000), [0.04, 0.053, 0.053, 0.5, null])
assert.deepEqual(withMultipleComparison([{ p: 0.01 }, { p: 0.04 }, { p: 0.03 }, { p: 0.5 }]).map((test) => test.significant), [true, false, false, false])

// Brancos ficam fora da correlação entre questões
const blankAssessment = { id: 'b', questionCount: 2, questionAreas: ['A', 'A'] }
const blankRows = Array.from({ length: 12 }, (_, index) => ({ assessmentId: 'b', studentId: `s${index}`, answers: index < 6
  ? [{ status: index % 2 ? 'correct' : 'wrong' }, { status: index % 2 ? 'correct' : 'wrong' }]
  : [{ status: 'blank' }, { status: index % 2 ? 'correct' : 'wrong' }] }))
const blankNetwork = buildQuestionNetwork({ assessment: blankAssessment, submissions: blankRows, threshold: 0 })
assert.equal(blankNetwork.edges[0].n, 6, 'só os alunos que responderam as duas')
assert.ok(blankNetwork.edges[0].r > .99)
assert.ok(Number.isFinite(blankNetwork.edges[0].q))

// Evolução respeita o recorte de área
const area = assessment.questionAreas?.[0]
if (area) {
  const filtered = buildTemporalAnalysis({ assessments: state.assessments, submissions: state.submissions, students: state.students, category: area })
  assert.ok(filtered.every((item) => item.meanScore >= 0 && item.meanScore <= 100))
}

console.log('Network analysis tests passed.')
