import assert from 'node:assert/strict'
import { strFromU8, unzipSync } from 'fflate'
import { buildGradeList, generateGradeListWorkbook } from '../src/lib/gradeListReport.js'
import { columnName, sheetName } from '../src/lib/xlsx.js'
import { calculateSubmissionMetrics } from '../src/lib/results.js'

const assessments = [
  { id: 'a', title: 'Simulado de diagnóstico', code: 'DIAG', questionCount: 3, subjects: ['Matemática'], questionAreas: ['Matemática', 'Linguagens', 'Linguagens'] },
  { id: 'b', title: 'Simulado de revisão', code: 'REV', questionCount: 2, subjects: ['Linguagens'], questionAreas: ['Linguagens', 'Matemática'] },
]
const classes = [{ id: 'c1', name: '1ª B' }, { id: 'c2', name: '1ª A' }]
const students = [
  { id: 's1', name: 'Bruna Lima', classId: 'c1' },
  { id: 's2', name: 'Ana Souza', classId: 'c1' },
  { id: 's3', name: 'Carlos Dias', classId: 'c2' },
]
const raw = [
  { studentId: 's1', classId: 'c1', assessmentId: 'a', correctedAt: '2026-10-01', answers: [{ status: 'wrong' }, { status: 'wrong' }, { status: 'wrong' }] },
  { studentId: 's1', classId: 'c1', assessmentId: 'a', correctedAt: '2026-10-02', answers: [{ status: 'correct' }, { status: 'correct' }, { status: 'cancelled' }] },
  { studentId: 's2', classId: 'c1', assessmentId: 'a', answers: [{ status: 'wrong' }, { status: 'correct' }, { status: 'blank' }] },
  { studentId: 's2', classId: 'c1', assessmentId: 'b', answers: [{ status: 'correct' }, { status: 'uncertain' }] },
  { studentId: 's3', classId: 'c2', assessmentId: 'b', correct: 1, wrong: 1, score: 50 },
]
const rows = raw.map((row) => {
  const assessment = assessments.find((item) => item.id === row.assessmentId)
  return { ...row, ...calculateSubmissionMetrics(row, assessment), assessment, student: students.find((item) => item.id === row.studentId), classroom: classes.find((item) => item.id === row.classId) }
})
const source = { school: { name: 'Escola de referência' }, assessments, rows, selectedAreas: ['Matemática', 'Linguagens'], generatedAt: new Date('2026-10-09T15:00:00Z') }
const list = buildGradeList(source)

assert.deepEqual(list.classes.map((group) => group.label), ['1ª A', '1ª B'])
const classB = list.classes[1]
assert.equal(classB.students, 2)
assert.deepEqual(classB.assessments.map((item) => item.id), ['a', 'b'])
const diag = classB.assessments[0]
assert.deepEqual(diag.areas, ['Matemática', 'Linguagens'])
assert.deepEqual(diag.students.map((student) => student.name), ['Ana Souza', 'Bruna Lima'])
assert.deepEqual(diag.students[1].areas, [{ correct: 1, total: 1 }, { correct: 1, total: 1 }], 'usa a correção mais recente e ignora canceladas')
assert.equal(diag.students[1].score, 100)
assert.deepEqual(diag.students[0].areas, [{ correct: 0, total: 1 }, { correct: 1, total: 2 }])
assert.deepEqual(diag.areaAverages, [50, 67])
assert.equal(classB.assessments[1].students[0].review, 1)
const legacy = list.classes[0].assessments[0]
assert.deepEqual(legacy.students[0].areas, [null, null], 'resultados sem respostas por questão não têm notas por área')
assert.equal(legacy.students[0].score, 50)

const onlyMath = buildGradeList({ ...source, selectedAreas: ['Matemática'], rows: raw.filter((row) => row.answers).map((row) => {
  const assessment = assessments.find((item) => item.id === row.assessmentId)
  return { ...row, ...calculateSubmissionMetrics(row, assessment, ['Matemática']), assessment, student: students.find((item) => item.id === row.studentId), classroom: classes.find((item) => item.id === row.classId) }
}) })
assert.deepEqual(onlyMath.classes[0].assessments[0].areas, ['Matemática'])
assert.throws(() => buildGradeList({ ...source, rows: [] }), /Não há resultados/)

assert.equal(columnName(0), 'A')
assert.equal(columnName(26), 'AA')
assert.equal(sheetName('1ª A/B: [manhã]'), '1ª A-B- -manhã-')
const used = new Set()
assert.deepEqual([sheetName('Turma', used), sheetName('turma', used)], ['Turma', 'turma 2'])

const file = generateGradeListWorkbook(list)
assert.equal(file.filename, 'notas-por-turma-2026-10-09.xlsx')
assert.equal(file.sheets, 2)
const zip = unzipSync(new Uint8Array(await file.blob.arrayBuffer()))
const workbook = strFromU8(zip['xl/workbook.xml'])
assert.match(workbook, /name="1ª A".*name="1ª B"/)
const sheetB = strFromU8(zip['xl/worksheets/sheet2.xml'])
assert.match(sheetB, /Simulado de diagnóstico/)
assert.match(sheetB, /Matemática \(1\)/)
assert.match(sheetB, /Linguagens \(2\)/)
assert.match(sheetB, /<f>SUM\(D7:E7\)<\/f><v>1<\/v>/, 'Ana: soma das áreas do diagnóstico')
assert.match(sheetB, /<f>IFERROR\(F7\/G7,&quot;&quot;\)<\/f><v>0.3333/)
assert.match(sheetB, /Nota \(0 a 10\)/)
assert.match(sheetB, /<f>IFERROR\(ROUND\(F7\/G7\*10,1\),&quot;&quot;\)<\/f><v>3.3<\/v>/, 'nota de Ana na escala 0 a 10')
assert.match(sheetB, /<f>IFERROR\(ROUND\(L7\/M7\*10,1\),&quot;&quot;\)<\/f><v>5<\/v>/, 'segundo simulado começa depois da coluna de nota')
assert.match(sheetB, /Ana Souza \*/)
assert.match(sheetB, /Média da turma/)
assert.match(sheetB, /<pane xSplit="2" ySplit="6"/)
const styles = strFromU8(zip['xl/styles.xml'])
assert.ok((styles.match(/patternType="solid"/g) || []).length >= 8, 'simulados e áreas recebem cores próprias')
const list20 = buildGradeList({ ...source, maxGrade: 20 })
assert.equal(list20.classes[1].assessments[0].students[0].grade, 6.7, 'Ana: 1 de 3 na escala 0 a 20')
const sheet20 = strFromU8(unzipSync(new Uint8Array(await generateGradeListWorkbook(list20).blob.arrayBuffer()))['xl/worksheets/sheet2.xml'])
assert.match(sheet20, /Nota \(0 a 20\)/)
assert.match(sheet20, /ROUND\(F7\/G7\*20,1\)/)
const listUp = buildGradeList({ ...source, maxGrade: 10, rounding: { mode: 'up', step: 1 } })
assert.equal(listUp.classes[1].assessments[0].students[0].grade, 4, 'Ana: 3,3 arredondado para cima')
const sheetUp = strFromU8(unzipSync(new Uint8Array(await generateGradeListWorkbook(listUp).blob.arrayBuffer()))['xl/worksheets/sheet2.xml'])
assert.match(sheetUp, /ROUNDUP\(F7\/G7\*10,0\)/)
assert.equal(buildGradeList({ ...source, maxGrade: 7.5 }).classes[1].assessments[0].students[1].grade, 7.5)

if (process.env.GRADE_LIST_OUT) {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(process.env.GRADE_LIST_OUT, Buffer.from(await file.blob.arrayBuffer()))
}
console.log(`Planilha de notas: ${file.sheets} abas.`)
