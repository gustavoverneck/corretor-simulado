import assert from 'node:assert/strict'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { CANCELLED_ANSWER } from '../src/lib/assessment.js'
import { areaRanges, buildAnswerKeyGroups, buildAttendanceGroups, createAnswerKeyPdf, createAttendancePdf, printDocumentFilename } from '../src/lib/printDocuments.js'

const classes = [{ id: 'c2', name: '3ª B', shift: 'Matutino' }, { id: 'c1', name: '3ª A', shift: 'Matutino' }]
const students = [
  ...Array.from({ length: 34 }, (_, index) => ({ id: `a${index}`, name: `Aluno ${String(index + 1).padStart(2, '0')} da Silva`, registration: `10${index}`, classId: 'c1', status: 'Ativo' })),
  { id: 'b1', name: 'Bruna Araújo', registration: '201', classId: 'c2', status: 'Ativo' },
  { id: 'b2', name: 'Ana Conceição', registration: '202', classId: 'c2', status: 'Ativo' },
  { id: 'b3', name: 'Inativa', classId: 'c2', status: 'Inativo' },
]
const keyA = Array.from({ length: 45 }, (_, index) => 'ABCDE'[index % 5])
keyA[3] = null
keyA[7] = CANCELLED_ANSWER
const keyB = [...keyA].reverse()
const assessment = {
  id: 'sim', title: 'Simulado ENEM — 3º trimestre', code: 'SIM-3TRI', date: '2026-10-30', questionCount: 45, optionCount: 5, classIds: ['c1', 'c2'],
  answerKey: keyA,
  questionAreas: [...Array(20).fill('Linguagens'), ...Array(25).fill('Ciências Humanas')],
  answerKeyVersions: [{ id: 'va', label: 'Versão A', answerKey: keyA }, { id: 'vb', label: 'Versão B', answerKey: keyB }],
  answerKeyVersionIdsByClass: { c1: ['va'], c2: ['va', 'vb'] },
  absentStudentIds: ['b2'],
}

assert.deepEqual(areaRanges(['X', 'X', 'Y', 'X']), [{ area: 'X', start: 1, end: 2 }, { area: 'Y', start: 3, end: 3 }, { area: 'X', start: 4, end: 4 }])

const keyGroups = buildAnswerKeyGroups({ assessment, classes })
assert.deepEqual(keyGroups.map((group) => group.className), ['3ª A', '3ª B'], 'turmas em ordem alfabética')
assert.deepEqual(keyGroups[1].versions.map((version) => version.label), ['Versão A', 'Versão B'])
assert.equal(keyGroups[0].versions[0].answers[3], 'ANU')
assert.equal(keyGroups[0].versions[0].answers[7], 'CAN')
assert.equal(buildAnswerKeyGroups({ assessment, classes, classIds: ['c2'] }).length, 1)

const attendance = buildAttendanceGroups({ assessment, classes, students, submissions: [], markAbsent: true })
assert.equal(attendance[0].showVersion, false, 'turma com uma versão não mostra coluna de versão')
assert.equal(attendance[1].showVersion, true)
assert.deepEqual(attendance[1].rows.map((row) => row.name), ['Ana Conceição', 'Bruna Araújo'], 'inativo fica fora e ordem é alfabética')
assert.equal(attendance[1].rows[0].absent, true, 'ausência registrada aparece quando pedida')
assert.equal(buildAttendanceGroups({ assessment, classes, students, submissions: [] })[1].rows[0].absent, false)

async function pdfText(blob) {
  const document = await getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  const pages = []
  for (let page = 1; page <= document.numPages; page += 1) pages.push((await (await document.getPage(page)).getTextContent()).items.map((item) => item.str).join(' '))
  return pages
}

const school = { name: 'Escola Estadual Exemplo' }
const keyPages = await pdfText(await createAnswerKeyPdf({ assessment, classes, school }))
assert.ok(keyPages.length >= 2, 'uma página por turma')
assert.match(keyPages[0], /Turma 3ª A/)
assert.match(keyPages[0], /Simulado ENEM — 3º trimestre/)
assert.match(keyPages[0], /Linguagens: 1–20/)
assert.match(keyPages[0], /ANU/)
assert.match(keyPages.join(' '), /Versão B/)

const attendancePages = await pdfText(await createAttendancePdf({ assessment, classes, students, submissions: [], school, markAbsent: true }))
assert.equal(attendancePages.length, 3, '34 alunos ocupam duas páginas; a segunda turma, uma')
assert.match(attendancePages[0], /Aluno 01 da Silva/)
assert.match(attendancePages[1], /Aluno 34 da Silva/)
assert.match(attendancePages[1], /ASSINATURA/, 'cabeçalho da tabela se repete na página seguinte')
assert.match(attendancePages[2], /Ana Conceição.*AUSENTE/)
assert.match(attendancePages[2], /Página 3 de 3/)

assert.equal(printDocumentFilename(assessment, 'attendance'), 'lista-presenca-sim-3tri.pdf')
assert.equal(printDocumentFilename(assessment, 'answer-key'), 'gabarito-sim-3tri.pdf')
console.log('print documents: ok')

const checklistSubmissions = [{ assessmentId: 'sim', studentId: 'a0' }, { assessmentId: 'sim', studentId: 'b1' }]
const checklistGroups = buildAttendanceGroups({ assessment, classes, students, submissions: checklistSubmissions })
assert.deepEqual([checklistGroups[1].corrected, checklistGroups[1].absent, checklistGroups[1].pending], [1, 1, 0])
assert.deepEqual([checklistGroups[0].corrected, checklistGroups[0].pending], [1, 33])
const checklistPages = await pdfText(await createAttendancePdf({ assessment, classes, students, submissions: checklistSubmissions, school, layout: 'checklist' }))
assert.match(checklistPages[0], /CONFERÊNCIA DA CORREÇÃO/)
assert.match(checklistPages[0], /FEZ A PROVA.*CORRIGIDO.*AUSENTE.*OBSERVAÇÃO/)
assert.doesNotMatch(checklistPages.join(' '), /ASSINATURA/)
assert.match(checklistPages[2], /Corrigidos: 1 +Ausentes: 1 +Sem correção: 0/)
assert.equal(printDocumentFilename(assessment, 'attendance', 'checklist'), 'conferencia-correcao-sim-3tri.pdf')
console.log('attendance checklist: ok')
