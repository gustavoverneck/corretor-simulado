import { createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { zipSync } from 'fflate'
import { AnswerSheet } from '../components/AnswerSheet.jsx'
import { AssessmentPaper } from '../components/AssessmentPaper.jsx'
import { getAnswerKeyVersionForStudent } from './assessment.js'
import { drawAnswerSheetPdf } from './answerSheetPdf.js'

const PAGE = { width: 794, height: 1123, scale: 2 }

function safeName(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'simulado'
}

export function buildClassExportGroups({ assessment, classes, students }) {
  return assessment.classIds.flatMap((classId, index) => {
    const classroom = classes.find((item) => item.id === classId)
    const members = students.filter((student) => student.classId === classId && student.status === 'Ativo')
      .sort((first, second) => first.name.localeCompare(second.name, 'pt-BR', { numeric: true, sensitivity: 'base' }))
    if (!members.length) return []
    const name = classroom?.name || 'Turma'
    return [{ classroom, students: members, filename: `${String(index + 1).padStart(2, '0')}-${safeName(assessment.code)}-${safeName(name)}.pdf` }]
  })
}

export function createClassArchive(files, code) {
  if (!files.length) throw new Error('Nenhuma turma com alunos ativos para baixar.')
  const entries = Object.fromEntries(files.map(({ filename, bytes }) => [filename, bytes]))
  if (Object.keys(entries).length !== files.length) throw new Error('Há nomes de PDF repetidos no arquivo.')
  return {
    blob: new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' }),
    filename: `${safeName(code)}-todas-as-turmas.zip`,
  }
}

async function readImage(source) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

async function imageDataUrl(source) {
  const response = await fetch(source)
  if (!response.ok) throw new Error('Não foi possível carregar o brasão para o PDF.')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem da folha.'))
    reader.readAsDataURL(blob)
  })
}

function nextPage(pdf) {
  if (pdf.__hasExportPage) pdf.addPage()
  pdf.__hasExportPage = true
}

function paperIdentityPosition(page) {
  const bounds = page.getBoundingClientRect()
  const field = page.querySelector('.assessment-paper-student > span')
  const label = field.querySelector('b').getBoundingClientRect()
  return {
    x: (label.right - bounds.left + 4) * 210 / PAGE.width,
    y: (label.bottom - bounds.top - 1) * 297 / PAGE.height,
    width: (field.getBoundingClientRect().right - label.right - 6) * 210 / PAGE.width,
  }
}

function addPaperTemplates(pdf, templates, student, assessment, version) {
  for (const template of templates) {
    nextPage(pdf)
    pdf.addImage(template.image, 'JPEG', 0, 0, 210, 297, template.alias)
    pdf.setTextColor('#111111')
    pdf.setFont('helvetica', 'normal')
    if (template.identity) {
      const position = template.identity
      pdf.setFontSize(9)
      const width = pdf.getTextWidth(student.name)
      if (width > position.width) pdf.setFontSize(9 * position.width / width)
      pdf.text(student.name, position.x, position.y)
    }
    pdf.setFontSize(7)
    pdf.text(`${assessment.title} · ${student.name} · ${version?.label || 'A'}`, 105, 290, { align: 'center', maxWidth: 176 })
  }
}

// Prefer a whitespace row when a single unusually long question spans pages.
function whitespaceCut(canvas, start, proposed) {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const from = Math.max(start + 1, proposed - 48 * PAGE.scale)
  const pixels = context.getImageData(0, from, canvas.width, proposed - from).data
  for (let row = proposed - from - 1; row >= 0; row -= 1) {
    let white = true
    for (let x = 0; x < canvas.width; x += 2) {
      const offset = (row * canvas.width + x) * 4
      if (pixels[offset] < 240 || pixels[offset + 1] < 240 || pixels[offset + 2] < 240) { white = false; break }
    }
    if (white) return from + row + 1
  }
  return proposed
}

async function renderPaperTemplates(paper, host, html2canvas, cacheKey) {
  const templates = []
  const saveTemplate = (canvas, identity) => {
    templates.push({ image: canvas.toDataURL('image/jpeg', 0.96), identity, alias: `${cacheKey}:${templates.length}` })
    canvas.width = canvas.height = 1
  }
  const footer = paper.querySelector(':scope > footer')
  footer.textContent = ''
  footer.style.height = '11px'
  await Promise.all([...paper.querySelectorAll('img')].map((image) => image.decode()))
  await document.fonts.ready
  const questions = [...paper.querySelector(':scope > ol').children]
  let page
  let list
  const makePage = (index) => {
    page = paper.cloneNode(false)
    Object.assign(page.style, { width: `${PAGE.width}px`, height: `${PAGE.height}px`, minHeight: '0', margin: '0' })
    for (const child of paper.children) {
      const copy = child.cloneNode(child.tagName !== 'OL')
      if (child.tagName === 'OL') { list = copy; list.start = index + 1 }
      page.appendChild(copy)
    }
    host.appendChild(page)
  }
  const fits = () => list.lastElementChild.getBoundingClientRect().bottom + 12 <= page.querySelector(':scope > footer').getBoundingClientRect().top
  const capture = () => html2canvas(page, { scale: PAGE.scale, backgroundColor: '#ffffff', logging: false })
  const finishPage = async () => {
    const identity = paperIdentityPosition(page)
    if (fits()) saveTemplate(await capture(), identity)
    else {
      // Preserve the full content even when one question is taller than A4.
      page.querySelector(':scope > footer').remove()
      Object.assign(page.style, { height: 'auto', paddingBottom: '0' })
      const canvas = await capture()
      let start = 0
      while (start < canvas.height) {
        const top = start ? Math.round(57 * PAGE.scale) : 0
        const available = PAGE.height * PAGE.scale - top - 60 * PAGE.scale
        const proposed = Math.min(canvas.height, start + available)
        const end = proposed < canvas.height ? whitespaceCut(canvas, start, proposed) : proposed
        const slice = document.createElement('canvas')
        slice.width = PAGE.width * PAGE.scale
        slice.height = PAGE.height * PAGE.scale
        const context = slice.getContext('2d')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, slice.width, slice.height)
        context.drawImage(canvas, 0, start, canvas.width, end - start, 0, top, canvas.width, end - start)
        saveTemplate(slice, start ? null : identity)
        start = end
      }
      canvas.width = canvas.height = 1
    }
    page.remove()
  }
  makePage(0)
  try {
    for (const [index, question] of questions.entries()) {
      const item = question.cloneNode(true)
      list.appendChild(item)
      if (!fits() && list.children.length > 1) {
        item.remove()
        await finishPage()
        makePage(index)
        list.appendChild(item)
      }
      if (!fits()) {
        await finishPage()
        if (index < questions.length - 1) makePage(index + 1)
        else page = null
      }
    }
    if (page) await finishPage()
    return templates
  } finally {
    page?.remove()
  }
}

export async function exportAssessmentClassPdfs({ assessment, classes, students, school, classIds = assessment.classIds, includePaper = false, onProgress = () => {}, onFile = () => {}, signal }) {
  const checkCancelled = () => { if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError') }
  const groups = buildClassExportGroups({ assessment: { ...assessment, classIds: assessment.classIds.filter((id) => classIds.includes(id)) }, classes, students })
  if (!groups.length) throw new Error('Nenhuma turma com alunos ativos para baixar.')
  const { jsPDF } = await import('jspdf')
  const html2canvas = includePaper ? (await import('html2canvas')).default : null
  const host = document.createElement('div')
  host.className = 'assessment-export-root'
  Object.assign(host.style, { position: 'absolute', left: '-100000px', top: '0', width: `${PAGE.width}px`, background: '#fff', pointerEvents: 'none' })
  host.setAttribute('aria-hidden', 'true')
  const mount = document.createElement('div')
  host.appendChild(mount)
  document.body.appendChild(host)
  const root = createRoot(mount)
  const imageCache = new Map()
  const loadLogo = async (source) => {
    if (!imageCache.has(source)) {
      const data = await imageDataUrl(source)
      const image = await readImage(data)
      imageCache.set(source, { data, width: image.naturalWidth, height: image.naturalHeight })
    }
    return imageCache.get(source)
  }
  const total = groups.reduce((sum, group) => sum + group.students.length, 0)
  let completed = 0
  try {
    for (const [classIndex, group] of groups.entries()) {
      checkCancelled()
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
      pdf.setProperties({ title: `${assessment.title} - ${group.classroom?.name || 'Turma'}` })
      const paperCache = new Map()
      for (const student of group.students) {
        checkCancelled()
        onProgress({ completed, total, classroom: group.classroom?.name || 'Turma', classIndex: classIndex + 1, classTotal: groups.length })
        await new Promise((resolve) => setTimeout(resolve, 0))
        const props = { student, assessment, classroom: group.classroom, school }
        const version = getAnswerKeyVersionForStudent(assessment, student)
        const cacheKey = version?.id || 'default'
        const needsPaper = includePaper && assessment.contentMode === 'full'
        flushSync(() => root.render(createElement(Fragment, null,
          createElement(AnswerSheet, props),
          needsPaper && !paperCache.has(cacheKey) ? createElement(AssessmentPaper, { ...props, student: { ...student, name: '' } }) : null,
        )))
        nextPage(pdf)
        await drawAnswerSheetPdf(pdf, mount.querySelector('svg.answer-sheet'), loadLogo)
        if (needsPaper) {
          if (!paperCache.has(cacheKey)) paperCache.set(cacheKey, await renderPaperTemplates(mount.querySelector('.assessment-paper'), host, html2canvas, cacheKey))
          checkCancelled()
          addPaperTemplates(pdf, paperCache.get(cacheKey), student, assessment, version)
        }
        completed += 1
      }
      const bytes = new Uint8Array(pdf.output('arraybuffer'))
      checkCancelled()
      await onFile({ filename: group.filename, bytes, blob: new Blob([bytes], { type: 'application/pdf' }), classId: group.classroom?.id, studentCount: group.students.length })
    }
    onProgress({ completed, total, classroom: '', classIndex: groups.length, classTotal: groups.length })
    return { classCount: groups.length, studentCount: total }
  } finally {
    root.unmount()
    host.remove()
  }
}

export async function exportAssessmentClassesZip(options) {
  const files = []
  const summary = await exportAssessmentClassPdfs({ ...options, onFile: (file) => { files.push({ filename: file.filename, bytes: file.bytes }) } })
  return { ...createClassArchive(files, options.assessment.code), ...summary }
}
