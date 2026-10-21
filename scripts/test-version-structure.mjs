import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transformWithEsbuild } from 'vite'
import * as assessmentHelpers from '../src/lib/assessment.js'
import * as fullHelpers from '../src/lib/fullAssessment.js'
import * as areas from '../src/lib/knowledgeAreas.js'
import * as sheets from '../src/lib/sheetFormat.js'
import * as utils from '../src/lib/utils.js'
import { calculateSubmissionMetrics, calculateAreaResults, calculateQuestionResults } from '../src/lib/resultsMetrics.js'
import { calculateAssessmentResult } from '../src/lib/segesResults.js'

// Exercise the actual editor handlers and state without mounting presentation components.
const state = []
let cursor = 0
globalThis.window = { location: { search: '' }, requestAnimationFrame: (callback) => callback() }
globalThis.editorDependencies = {
  ...assessmentHelpers, ...fullHelpers, ...areas, ...sheets, ...utils,
  CURRENT_MARKER_LAYOUT: 'corners-v1',
  useMemo: (callback) => callback(),
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useState(initial) {
    const index = cursor++
    if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
    return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
  },
}
let source = await readFile(new URL('../src/pages/AssessmentsPage.jsx', import.meta.url), 'utf8')
source = source.replaceAll('\r\n', '\n')
source = source.replace(/^import .*\r?\n/gm, '')
source = `const { ${Object.keys(globalThis.editorDependencies).join(', ')} } = globalThis.editorDependencies;\n${source}`
source = source.replace('  return (\n    <div className="page-stack assessments-page">', `  return { questionCount, questionAreas, subject, questions, answerKeyVersions,
    activeAnswerKeyVersionId, openNewAssessmentEditor, openAssessmentEditor, updateQuestionCount,
    changeSubject, setQuestionArea, setKey, addAnswerKeyVersion, selectAnswerKeyVersion,
    toggleSelectedClass, toggleVersionClass, createAssessment, setAssessmentTitle, setAssessmentCode,
    setCreationMode, updateActiveVersion };
  return (\n    <div className="page-stack assessments-page">`)
let { code } = await transformWithEsbuild(source, 'AssessmentsPage.jsx', { loader: 'jsx', jsx: 'automatic' })
code = code.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const { AssessmentsPage } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
let data = {
  assessments: [], submissions: [], school: {},
  classes: ['a', 'b', 'c'].map((id) => ({ id, name: id })),
  students: ['a', 'b', 'c'].map((classId) => ({ id: `student-${classId}`, classId, name: classId, status: 'Ativo' })),
}
const notices = []
const render = () => {
  cursor = 0
  return AssessmentsPage({ data, setData: (update) => { data = update(data) }, setPage() {}, notify: (...args) => notices.push(args) })
}
let editor = render()
editor.openNewAssessmentEditor()
editor = render()
editor.setAssessmentTitle('Different structures')
editor.setAssessmentCode('VERSIONS')
for (const id of ['a', 'b', 'c']) { editor.toggleSelectedClass(id); editor = render() }
const ids = []
for (const [index, count] of [10, 45, 90].entries()) {
  if (index) { editor.addAnswerKeyVersion(); editor = render() }
  ids.push(editor.activeAnswerKeyVersionId)
  editor.updateQuestionCount(count)
  editor = render()
  editor.changeSubject(['Math', 'History', 'Science'][index])
  editor = render()
  // Each class gets a single version.
  for (const classId of [...editor.answerKeyVersions.find((v) => v.id === ids[index]).classIds]) editor.toggleVersionClass(classId)
  editor = render()
  editor.toggleVersionClass(['a', 'b', 'c'][index])
  for (let q = 0; q < count; q++) editor.setKey(q, ['A', 'B', 'C'][index])
  editor = render()
}
editor.selectAnswerKeyVersion(ids[0]); editor = render()
assert.equal(editor.questionCount, 10)
assert.equal(editor.subject, 'Math')
assert.equal(editor.questionAreas[0], 'Math')
editor.setQuestionArea(0, 'Algebra'); editor = render()
editor.selectAnswerKeyVersion(ids[1]); editor = render()
assert.equal(editor.questionCount, 45)
assert.equal(editor.subject, 'History')
assert.equal(editor.questionAreas[0], 'History')
editor.createAssessment({ preventDefault() {} })
assert.equal(data.assessments.length, 1, JSON.stringify(notices))
let assessment = data.assessments[0]
assert.deepEqual(assessment.answerKeyVersions.map((v) => v.answerKey.length), [10, 45, 90])
assert.deepEqual(assessment.answerKeyVersions.map((v) => v.questionAreas[0]), ['Algebra', 'History', 'Science'])
editor = render(); editor.openAssessmentEditor(assessment); editor = render()
for (const [index, count] of [10, 45, 90].entries()) {
  editor.selectAnswerKeyVersion(ids[index]); editor = render()
  assert.equal(editor.questionCount, count)
  const resolved = assessmentHelpers.getAssessmentForStudent(assessment, data.students[index])
  assert.equal(resolved.questionCount, count)
  assert.equal(resolved.answerKey[0], ['A', 'B', 'C'][index])
}
const submissions = assessment.answerKeyVersions.map((version, index) => ({
  id: `submission-${index}`, assessmentId: assessment.id, studentId: data.students[index].id,
  classId: data.students[index].classId, answerKeyVersionId: version.id,
  answers: version.answerKey.map((answer) => ({ selected: [answer], status: 'correct' })),
}))
submissions.forEach((submission, index) => {
  const count = [10, 45, 90][index]
  assert.equal(calculateSubmissionMetrics(submission, assessment).total, count)
  assert.equal(calculateAssessmentResult(submission, assessment).valid, count)
})
const areaResults = calculateAreaResults([assessment], submissions)
assert.equal(areaResults.find((item) => item.area === 'History').attempts, 45)
assert.equal(areaResults.find((item) => item.area === 'Science').attempts, 90)
assert.equal(calculateQuestionResults([assessment], submissions).length, 145)
const revised = assessmentHelpers.applyAssessmentRevision({ ...data, submissions }, assessment, { regradeSubmissions: true }).data
assert.deepEqual(revised.submissions.map((item) => item.answers.length), [10, 45, 90])

// Full assessments retain each version's source questions across save/reopen.
state.length = 0
data = { ...data, assessments: [], submissions: [] }
editor = render(); editor.openNewAssessmentEditor(); editor = render()
editor.setAssessmentTitle('Full versions'); editor.setAssessmentCode('FULL'); editor.setCreationMode('full')
editor = render()
for (const classId of ['a', 'b']) { editor.toggleSelectedClass(classId); editor = render() }
for (const [index, count] of [2, 3].entries()) {
  if (index) { editor.addAnswerKeyVersion(); editor = render() }
  editor.updateQuestionCount(count); editor = render()
  editor.updateActiveVersion({ questions: fullHelpers.resizeQuestions([], count, 4).map((question, i) => ({ ...question, statement: `Version ${index} item ${i}`, alternatives: ['a', 'b', 'c', 'd'], correctIndex: index })) })
  editor = render()
  if (index) editor.toggleVersionClass('b')
  else editor.toggleVersionClass('b')
  editor = render()
}
editor.createAssessment({ preventDefault() {} })
assert.equal(data.assessments.length, 1, JSON.stringify(notices))
assessment = data.assessments[0]
assert.deepEqual(assessment.answerKeyVersions.map((v) => v.questions.length), [2, 3])
editor = render(); editor.openAssessmentEditor(assessment); editor = render()
editor.selectAnswerKeyVersion(assessment.answerKeyVersions[1].id); editor = render()
assert.equal(editor.questions[0].statement, 'Version 1 item 0')
assert.equal(editor.questionCount, 3)
console.log('Version-specific counts, keys, areas, save/reopen, printing context, grading, results and full exams validated.')
