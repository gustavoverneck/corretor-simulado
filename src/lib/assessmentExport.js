import { createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { zipSync } from 'fflate'
import { AnswerSheet } from '../components/AnswerSheet.jsx'
import { AssessmentPaper } from '../components/AssessmentPaper.jsx'

const PAGE = { width: 794, height: 1123, scale: 3 }

function safeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

async function renderSheetCanvas(svg, imageCache) {
  const copy = svg.cloneNode(true)
  for (const element of copy.querySelectorAll('image')) {
    const source = element.getAttribute('href')
    if (!imageCache.has(source)) imageCache.set(source, await imageDataUrl(source))
    element.setAttribute('href', imageCache.get(source))
  }
  const serialized = new XMLSerializer().serializeToString(copy)
  const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = PAGE.width * PAGE.scale
    canvas.height = PAGE.height * PAGE.scale
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(await readImage(url), 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function addPage(pdf, canvas) {
  if (pdf.__hasExportPage) pdf.addPage()
  pdf.__hasExportPage = true
  pdf.addImage(canvas, 'PNG', 0, 0, 210, 297, undefined, 'FAST')
  canvas.width = canvas.height = 1
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

async function addPaperPages(pdf, paper, host, html2canvas) {
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
    if (fits()) addPage(pdf, await capture())
    else {
      // Preserve the full content even when one question is taller than A4.
      const footerText = page.querySelector(':scope > footer').textContent
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
        addPage(pdf, slice)
        pdf.setFontSize(7)
        pdf.text(footerText, 105, 290, { align: 'center', maxWidth: 176 })
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
  } finally {
    page?.remove()
  }
}

export async function exportAssessmentClassesZip({ assessment, classes, students, school, includePaper = false, onProgress = () => {} }) {
  const groups = buildClassExportGroups({ assessment, classes, students })
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
  const files = []
  const imageCache = new Map()
  const total = groups.reduce((sum, group) => sum + group.students.length, 0)
  let completed = 0
  try {
    for (const group of groups) {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
      pdf.setProperties({ title: `${assessment.title} - ${group.classroom?.name || 'Turma'}` })
      for (const student of group.students) {
        onProgress({ completed, total, classroom: group.classroom?.name || 'Turma' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        const props = { student, assessment, classroom: group.classroom, school }
        flushSync(() => root.render(createElement(Fragment, null,
          createElement(AnswerSheet, props),
          includePaper && assessment.contentMode === 'full' ? createElement(AssessmentPaper, props) : null,
        )))
        addPage(pdf, await renderSheetCanvas(mount.querySelector('svg.answer-sheet'), imageCache))
        if (includePaper && assessment.contentMode === 'full') await addPaperPages(pdf, mount.querySelector('.assessment-paper'), host, html2canvas)
        completed += 1
      }
      files.push({ filename: group.filename, bytes: new Uint8Array(pdf.output('arraybuffer')) })
    }
    onProgress({ completed, total, classroom: '' })
    return { ...createClassArchive(files, assessment.code), classCount: groups.length, studentCount: total }
  } finally {
    root.unmount()
    host.remove()
  }
}
