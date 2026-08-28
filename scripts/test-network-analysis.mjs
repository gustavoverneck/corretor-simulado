import assert from 'node:assert/strict'
import { createInitialState } from '../src/data.js'
import { buildBipartiteNetwork, buildQuestionNetwork, buildStudentNetwork, buildTemporalAnalysis, pearsonWithInference } from '../src/lib/networkAnalysis.js'

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
console.log('Network analysis tests passed.')
