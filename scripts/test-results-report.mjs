import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildResultsReport, REPORT_SECTIONS } from '../src/lib/resultsReport.js'
import { createReportScenes, generateReportFile } from '../src/lib/reportExport.js'
import { calculateSubmissionMetrics } from '../src/lib/results.js'

const assessments = [
  { id: 'a', title: 'Simulado de diagnóstico', code: 'DIAG', questionCount: 2, subjects: ['Matemática'], questionAreas: ['Matemática', 'Linguagens'] },
  { id: 'b', title: 'Simulado de revisão', code: 'REV', questionCount: 3, subjects: ['Linguagens'], questionAreas: ['Linguagens', 'Matemática', 'Matemática'] },
]
const classes = [
  { id: 'c1', name: '1ª A', grade: '1ª série EM' },
  { id: 'c2', name: '2ª A', grade: '2ª série EM' },
  { id: 'c3', name: 'Turma extra', grade: '' },
]
const raw = [
  { studentId: 's1', classId: 'c1', assessmentId: 'a', answers: [{ status: 'correct' }, { status: 'wrong' }] },
  { studentId: 's1', classId: 'c1', assessmentId: 'b', answers: [{ status: 'correct' }, { status: 'cancelled' }, { status: 'uncertain' }] },
  { studentId: 's2', classId: 'c2', assessmentId: 'a', answers: [{ status: 'wrong' }, { status: 'blank' }] },
  { studentId: 's3', classId: 'c3', assessmentId: 'b', answers: [{ status: 'correct' }, { status: 'correct' }, { status: 'correct' }] },
]
const rows = raw.map((row) => {
  const assessment = assessments.find((item) => item.id === row.assessmentId)
  return { ...row, ...calculateSubmissionMetrics(row, assessment), assessment, classroom: classes.find((item) => item.id === row.classId) }
})
const source = {
  school: { name: 'Escola de referência', city: 'Cariacica', state: 'ES' }, assessments, rows,
  selectedAreas: ['Matemática', 'Linguagens'], filters: [['Simulados', assessments.map((item) => item.title).join(', ')], ['Turmas', classes.map((item) => item.name).join(', ')]],
  generatedAt: new Date('2026-10-09T01:00:00Z'),
}
const report = buildResultsReport(source)
assert.equal(report.totals.count, 4)
assert.equal(report.totals.students, 3)
assert.equal(report.totals.score, 50)
assert.equal(report.totals.cancelled, 1)
assert.equal(report.totals.review, 1)
assert.equal(report.dateKey, '2026-10-08')
const highlights = report.pages.find((page) => page.type === 'highlights')
assert.equal(highlights.items.length, 3)
assert.equal(highlights.items[0].metric, '25%')
assert.equal(report.pages.find((page) => page.type === 'steps').items.length, 3)
assert.ok(!JSON.stringify(report.pages).includes('denominador'))
const gradePage = report.pages.find((page) => page.title === 'Comparativo por série / ano')
assert.equal(gradePage.items.length, 3)
assert.equal(gradePage.items.find((item) => item.label === '1ª série EM').value, 50)
assert.equal(gradePage.items.find((item) => item.label === 'Série / ano não informado').value, 100)
const classPage = report.pages.find((page) => page.title === 'Comparativo por turma')
assert.equal(classPage.items.find((item) => item.label === '1ª A').detail, '2 participações · 1 estudante')
const areaPage = report.pages.find((page) => page.title === 'Áreas de conhecimento')
assert.equal(areaPage.items.find((item) => item.label === 'Matemática').value, 60)
assert.equal(report.pages.find((page) => page.title === 'Questões que precisam de atenção').items.length, 5)
assert.throws(() => buildResultsReport({ ...source, rows: [] }), /Não há resultados/)
const limited = buildResultsReport({ ...source, rows: rows.filter((row) => row.score >= 60), sections: [] })
assert.equal(limited.totals.count, 1)
assert.equal(limited.totals.score, 100)
assert.equal(limited.pages.length, 5)
assert.equal(buildResultsReport({ ...source, classDetails: true }).pages.length, report.pages.length + 3)

const measuringPdf = new jsPDF({ unit: 'pt' })
const measure = (text, width, size, bold) => {
  measuringPdf.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
  return measuringPdf.splitTextToSize(text, width)
}
const stress = buildResultsReport({ ...source, title: 'Relatório de acompanhamento dos resultados e do desempenho pedagógico das turmas selecionadas', filters: [['Simulados', 'Nome extenso de um simulado com diversas áreas de conhecimento. '.repeat(100)]], classDetails: true })
for (const format of ['a4', 'slides']) {
  const distributionScene = createReportScenes({ ...report, pages: report.pages.filter((page) => page.type === 'distribution') }, format, measure)[0]
  const mapPoints = distributionScene.elements.filter((element) => element.type === 'circle' && element.w > 10)
  assert.equal(mapPoints.length, 100, 'O mapa deve representar 100% das participações, mesmo após arredondamentos.')
  assert.equal(mapPoints.filter((element) => element.color === '#B9675F').length, 25)
  const scenes = createReportScenes(stress, format, measure)
  assert.ok(scenes.length > stress.pages.length)
  for (const [pageIndex, scene] of scenes.entries()) {
    for (const element of scene.elements) {
      assert.ok(element.x >= 0 && element.y >= 0 && element.x + element.w <= scene.width + 1 && element.y + element.h <= scene.height + 1, `Elemento fora da página ${pageIndex + 1} (${format}): ${JSON.stringify(element)}`)
    }
  }
}

for (const output of ['a4', 'slides']) {
  const file = await generateReportFile(report, output)
  const bytes = new Uint8Array(await file.blob.arrayBuffer())
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-')
  const loadingTask = getDocument({ data: bytes, useSystemFonts: true })
  const pdf = await loadingTask.promise
  assert.equal(pdf.numPages, file.pages)
  const first = await pdf.getPage(1)
  const viewport = first.getViewport({ scale: 1 })
  if (output === 'a4') { assert.ok(Math.abs(viewport.width - 595.28) < 1); assert.ok(Math.abs(viewport.height - 841.89) < 1) }
  else assert.equal(viewport.width / viewport.height, 16 / 9)
  let text = ''
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index)
    text += (await page.getTextContent()).items.map((item) => item.str).join(' ')
  }
  for (const heading of ['Relatório de resultados', 'Comparativo por turma', 'Comparativo por série / ano', 'Síntese dos resultados', 'Matemática']) assert.ok(text.includes(heading), heading)
  await loadingTask.destroy()
}
const presentation = await generateReportFile(report, 'pptx')
const zip = await JSZip.loadAsync(await presentation.blob.arrayBuffer())
const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
assert.equal(slides.length, presentation.pages)
const firstSlide = await zip.file('ppt/slides/slide1.xml').async('string')
assert.ok(firstSlide.includes('Relatório de resultados'))
assert.ok(firstSlide.includes('<p:sp>'), 'Textos e barras devem ser editáveis, não imagens da página inteira.')
assert.ok(!firstSlide.includes('<p:pic>'))
assert.equal(zip.file('ppt/presentation.xml') !== null, true)
console.log(`Relatórios validados: filtros, séries, participações, paginação, PDFs A4 e 16:9, PowerPoint editável e ${REPORT_SECTIONS.length} análises opcionais.`)
