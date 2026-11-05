import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithEsbuild } from 'vite'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { analyzeSheetImage, layoutBubbleCenter } from '../src/lib/omr.js'
import { getSheetFormat, getSheetLayout } from '../src/lib/sheetFormat.js'
import { parseQrPayload, qrPayload } from '../src/lib/utils.js'
import { getAssessmentForVersion } from '../src/lib/assessment.js'
import {
  decodeMarkingGrid, findMarkedVersion, resolveSheetVersion, guessMarkingValues, markingGridForSheet, markingLayout, markingProblems, suggestVersionMarking,
} from '../src/lib/versionMarking.js'

// --- QR: v5 leva a grade dos campos; v4 continua igual -----------------------
const format = getSheetFormat(90, 5)
const v4 = qrPayload('aluno', 'prova', format)
assert.equal(parseQrPayload(v4).version, 4)
assert.equal(parseQrPayload(v4).markingGrid, undefined)
const v5 = qrPayload('aluno', 'prova', format, [4, 2])
assert.match(v5, /^LUMA\|5\|aluno\|prova\|balanced-v4\|90\|5\|4\.2\|/)
assert.deepEqual(parseQrPayload(v5).markingGrid, [4, 2])
assert.equal(parseQrPayload(v5.replace('|4.2|', '|4.3|')), null, 'CRC protege a grade')
assert.equal(decodeMarkingGrid('7'), null)
assert.equal(decodeMarkingGrid('1.2'), null)
assert.deepEqual(decodeMarkingGrid('6'), [6])

// --- Sugestão a partir dos nomes das versões ----------------------------------
const enemLabels = ['amarelo-ING', 'verde-ING', 'azul-ING', 'branco-ING', 'amarelo-ESP', 'verde-ESP', 'azul-ESP', 'branco-ESP']
let n = 0
const suggested = suggestVersionMarking(enemLabels.map((label) => ({ label })), () => `f${n++}`)
assert.deepEqual(suggested, [
  { id: 'f0', label: 'Cor da prova', options: ['Amarelo', 'Verde', 'Azul', 'Branco'] },
  { id: 'f1', label: 'Idioma', options: ['Inglês', 'Espanhol'] },
])
assert.deepEqual(guessMarkingValues({ label: 'azul-ESP' }, suggested), { f0: 2, f1: 1 })
assert.deepEqual(guessMarkingValues({ label: 'Branca / Inglês' }, suggested), { f0: 3, f1: 0 })
assert.deepEqual(guessMarkingValues({ label: 'cinza' }, suggested), {}, 'opção inexistente fica sem valor')
assert.deepEqual(guessMarkingValues({ label: 'cinza', markingValues: { f0: 1 } }, suggested), { f0: 1 }, 'não sobrescreve escolha do professor')
assert.deepEqual(suggestVersionMarking([{ label: 'amarelo' }, { label: 'verde' }, { label: 'azul' }, { label: 'cinza' }], () => 'c'), [{ id: 'c', label: 'Cor da prova', options: ['Amarelo', 'Verde', 'Azul', 'Cinza'] }])
assert.deepEqual(suggestVersionMarking([{ label: '1 Serie' }]), [], 'uma versão não vira campo')

// --- Assessment no formato do ENEM dia 1 --------------------------------------
const Q = 90
const keyFor = (index) => Array.from({ length: Q }, (_, q) => 'ABCDE'[(q * 7 + index * 3) % 5])
const versions = enemLabels.map((label, index) => ({
  id: `v-${label}`, label, questionCount: Q, answerKey: keyFor(index),
  markingValues: guessMarkingValues({ label }, suggested),
}))
const assessment = {
  id: 'enem-dia-1', title: 'Simulado ENEM - Dia 1', code: 'ENEM-1', questionCount: Q, optionCount: 5, answerKey: versions[0].answerKey,
  classIds: ['turma-3', 'turma-1'],
  answerKeyVersions: [...versions, { id: 'v-unica', label: '1 Série', questionCount: Q, answerKey: keyFor(9) }],
  answerKeyVersionIdsByClass: { 'turma-3': versions.map((version) => version.id), 'turma-1': ['v-unica'] },
  answerKeyVersionIdByStudent: { 'aluno-3': 'v-amarelo-ING' },
  versionMarking: { fields: suggested },
}
assert.deepEqual(markingProblems(assessment, suggested, assessment.answerKeyVersions), [])
const duplicated = assessment.answerKeyVersions.map((version) => version.id === 'v-verde-ESP' ? { ...version, markingValues: { f0: 0, f1: 1 } } : version)
assert.equal(markingProblems(assessment, suggested, duplicated)[0].kind, 'duplicate')
const missing = assessment.answerKeyVersions.map((version) => version.id === 'v-verde-ESP' ? { ...version, markingValues: { f0: 1 } } : version)
assert.equal(markingProblems(assessment, suggested, missing)[0].kind, 'missing')
assert.deepEqual(markingGridForSheet(assessment, { id: 'x', classId: 'turma-3' }, Q), [4, 2])
assert.equal(markingGridForSheet(assessment, { id: 'x', classId: 'turma-1' }, Q), null, 'turma com uma versão não recebe o campo')
assert.deepEqual(markingGridForSheet(assessment, null, Q), [4, 2], 'folha sem aluno recebe o campo')
assert.equal(markingGridForSheet({ ...assessment, versionMarking: undefined }, null, Q), null)
assert.equal(findMarkedVersion(assessment, 'turma-3', [2, 1], Q).id, 'v-azul-ESP')
assert.equal(findMarkedVersion(assessment, 'turma-3', [2, null], Q), null, 'sem idioma ficam duas versões')
assert.equal(findMarkedVersion(assessment, 'turma-1', [2, 1], Q), null, 'versão de outra turma não vale')

// Na hora de salvar: marcada → versão da folha; sem marcação → cadastrada + motivo.
const answers90 = { answers: Array(Q).fill({}) }
const aluno = { id: 'aluno-3', classId: 'turma-3' }
let choice = resolveSheetVersion(assessment, aluno, { ...answers90, versionMarks: [{ status: 'marked', selected: 2 }, { status: 'marked', selected: 1 }] })
assert.equal(choice.version.id, 'v-azul-ESP'); assert.equal(choice.source, 'sheet'); assert.equal(choice.changed, true); assert.equal(choice.reading, 'Azul · Espanhol'); assert.equal(choice.problem, null)
choice = resolveSheetVersion(assessment, aluno, { ...answers90, versionMarks: [{ status: 'marked', selected: 0 }, { status: 'marked', selected: 0 }] })
assert.equal(choice.changed, false, 'mesma versão cadastrada')
choice = resolveSheetVersion(assessment, aluno, { ...answers90, versionMarks: [{ status: 'blank', selected: null }, { status: 'multiple', selected: null }] })
assert.equal(choice.version.id, 'v-amarelo-ING'); assert.equal(choice.source, 'registered')
assert.equal(choice.problem, 'Cor da prova sem marcação e Idioma com mais de uma marcação; usada a versão cadastrada (amarelo-ING)')
choice = resolveSheetVersion(assessment, aluno, answers90)
assert.equal(choice.problem, null, 'folha antiga, sem campo: nada muda')
assert.equal(choice.version.id, 'v-amarelo-ING')

// --- Folha impressa de verdade ------------------------------------------------
let source = await readFile(new URL('../src/components/AnswerSheet.jsx', import.meta.url), 'utf8')
source = source.replace('import.meta.env.BASE_URL', "'/'").replace(/from '(.*?)'/g, (match, name) => {
  const target = name.startsWith('.') ? resolve('src/components', `${name}.js`) : import.meta.resolve(name)
  return `from '${name.startsWith('.') ? pathToFileURL(target).href : target}'`
})
let { code } = await transformWithEsbuild(source, 'AnswerSheet.jsx', { jsx: 'automatic', loader: 'jsx' })
code = code.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const { AnswerSheet } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const school = { name: 'Escola de Teste', city: 'Cidade', state: 'ES' }
const student = { id: 'aluno-3', name: 'Aluno de Teste', classId: 'turma-3' }
const layout = getSheetLayout(format)
const marking = markingLayout([4, 2])

const sheetSvg = renderToStaticMarkup(React.createElement(AnswerSheet, { student, assessment, school, classroom: { name: '3ª' } }))
assert.ok(sheetSvg.includes('COR DA PROVA') && sheetSvg.includes('IDIOMA') && sheetSvg.includes('Espanhol'))
assert.ok(!sheetSvg.includes('Não rasure, não dobre a folha'), 'instruções saem da caixa')
const otherSvg = renderToStaticMarkup(React.createElement(AnswerSheet, { student: { id: 'aluno-1', name: 'Outro', classId: 'turma-1' }, assessment, school }))
assert.ok(!otherSvg.includes('COR DA PROVA') && otherSvg.includes('Não rasure, não dobre a folha'), 'turma sem escolha mantém a folha de antes')

const resolveContext = () => ({
  assessment: getAssessmentForVersion(assessment, versions[0]), answerKey: versions[0].answerKey, classId: 'turma-3',
  resolveMarkedVersion: (selections) => {
    const version = findMarkedVersion(assessment, 'turma-3', selections, Q)
    return version ? { version, assessment: getAssessmentForVersion(assessment, version), answerKey: version.answerKey } : null
  },
})

function fill(cx, cy, r, color = '#1c1c1c') {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.92"/>`
}
// Respostas: o gabarito de azul-ESP, menos algumas questões em branco.
const target = versions.find((version) => version.id === 'v-azul-ESP')
const answerMarks = target.answerKey.map((letter, q) => q % 9 === 4 ? '' : (() => {
  const c = layoutBubbleCenter(q, 'ABCDE'.indexOf(letter), layout)
  return fill(c.x, c.y, layout.bubbleRadius * 0.8, q % 3 ? '#202020' : '#1f3a9e')
})()).join('')
const expectedCorrect = target.answerKey.filter((_, q) => q % 9 !== 4).length
const versionFill = (field, option, { scale = 0.82, dx = 0, dy = 0, color = '#1c1c1c' } = {}) => {
  const bubble = marking.rows[field].bubbles[option]
  return fill(bubble.x + dx, bubble.y + dy, marking.radius * scale, color)
}
const withMarks = (extra) => sheetSvg.slice(0, sheetSvg.lastIndexOf('</svg>')) + answerMarks + extra + '</svg>'

async function rasterize(svg, scale = 1) {
  const canvas = createCanvas(Math.round(794 * scale), Math.round(1123 * scale))
  const context = canvas.getContext('2d')
  context.drawImage(await loadImage(Buffer.from(svg)), 0, 0, canvas.width, canvas.height)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

const scenarios = [
  { label: 'azul + espanhol', extra: versionFill(0, 2) + versionFill(1, 1), statuses: ['marked', 'marked'], selections: [2, 1], version: 'v-azul-ESP' },
  { label: 'caneta azul', extra: versionFill(0, 2, { color: '#1f3a9e' }) + versionFill(1, 1, { color: '#1f3a9e' }), statuses: ['marked', 'marked'], selections: [2, 1], version: 'v-azul-ESP' },
  { label: 'fora do centro', extra: versionFill(0, 2, { scale: 0.6, dx: 2, dy: -1.5 }) + versionFill(1, 1, { scale: 0.6, dx: -2 }), statuses: ['marked', 'marked'], selections: [2, 1], version: 'v-azul-ESP' },
  { label: 'em branco', extra: '', statuses: ['blank', 'blank'], selections: [null, null], version: null },
  { label: 'só a cor', extra: versionFill(0, 3), statuses: ['marked', 'blank'], selections: [3, null], version: null },
  { label: 'duas cores', extra: versionFill(0, 0) + versionFill(0, 2) + versionFill(1, 0), statuses: ['multiple', 'marked'], selections: [null, 0], version: null },
  { label: 'risco fraco', extra: versionFill(0, 1, { scale: 0.35, dy: 2 }) + versionFill(1, 0), statuses: ['uncertain', 'marked'], selections: [null, 0], version: null },
]
for (const scenario of scenarios) {
  for (const scale of [1, 2]) {
    const result = analyzeSheetImage(await rasterize(withMarks(scenario.extra), scale), assessment, {}, {}, resolveContext)
    const name = `${scenario.label} (escala ${scale})`
    assert.deepEqual(result.identity.markingGrid, [4, 2], name)
    assert.deepEqual(result.versionMarks.map((field) => field.status), scenario.statuses, name)
    assert.deepEqual(result.versionMarks.map((field) => field.selected), scenario.selections, name)
    assert.equal(result.markedVersionId, scenario.version, name)
    // Com a versão marcada, a prova é corrigida pelo gabarito dela.
    if (scenario.version) assert.equal(result.correct, expectedCorrect, name)
    assert.equal(result.answers.filter((answer) => answer.status === 'uncertain' || answer.status === 'multiple').length, 0, `Respostas: ${name}`)
  }
}

// --- Fotos: perspectiva, luz e JPEG -----------------------------------------------
const base = createCanvas(794 * 2, 1123 * 2)
base.getContext('2d').drawImage(await loadImage(Buffer.from(withMarks(versionFill(0, 2) + versionFill(1, 1)))), 0, 0, base.width, base.height)
const basePix = base.getContext('2d').getImageData(0, 0, base.width, base.height)
function homography(src, dst) {
  const A = []; const b = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]; const [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  for (let i = 0; i < 8; i++) {
    let p = i
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    ;[A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]
    for (let r = 0; r < 8; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i] }
  }
  return [...b.map((v, i) => v / A[i][i]), 1]
}
function warp(quad, { W = 1700, H = 2300, bow = 0 } = {}) {
  const sw = base.width; const sh = base.height
  const Hm = homography(quad, [[0, 0], [sw, 0], [sw, sh], [0, sh]])
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Hm[6] * x + Hm[7] * y + 1
    let sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / d; let sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / d
    if (bow) { sx += bow * Math.sin(Math.PI * sy / sh) * ((sx / sw) - 0.5) * 2; sy += bow * 0.6 * Math.sin(Math.PI * sx / sw) }
    const o = (y * W + x) * 4
    const ix = Math.floor(sx); const iy = Math.floor(sy)
    if (ix < 0 || iy < 0 || ix >= sw - 1 || iy >= sh - 1) { out[o] = 90; out[o + 1] = 80; out[o + 2] = 70; out[o + 3] = 255; continue }
    const fx = sx - ix; const fy = sy - iy
    for (let c = 0; c < 3; c++) {
      const p = (k, l) => basePix.data[((iy + l) * sw + ix + k) * 4 + c]
      out[o + c] = p(0, 0) * (1 - fx) * (1 - fy) + p(1, 0) * fx * (1 - fy) + p(0, 1) * (1 - fx) * fy + p(1, 1) * fx * fy
    }
    out[o + 3] = 255
  }
  return { data: out, width: W, height: H }
}
function light(img, { gain = 1, grad = 0, shadow = 0, tint = [1, 1, 1], noise = 0 }) {
  const { data, width, height } = img
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let g = gain * (1 - grad * (x / width) * 0.9 - grad * 0.4 * (y / height))
    if (shadow && x > width * 0.45 && x < width * 0.8) g *= 1 - shadow
    const o = (y * width + x) * 4
    for (let c = 0; c < 3; c++) data[o + c] = Math.max(0, Math.min(255, data[o + c] * g * tint[c] + (noise ? (Math.random() - 0.5) * noise : 0)))
  }
  return img
}
async function jpeg(img, quality = 55) {
  const canvas = createCanvas(img.width, img.height); const context = canvas.getContext('2d')
  const data = context.createImageData(img.width, img.height); data.data.set(img.data); context.putImageData(data, 0, 0)
  context.drawImage(await loadImage(canvas.toBuffer('image/jpeg', quality)), 0, 0)
  return context.getImageData(0, 0, img.width, img.height)
}
const flat = [[50, 50], [1650, 50], [1650, 2250], [50, 2250]]
const keystone = [[220, 120], [1480, 160], [1660, 2250], [40, 2200]]
const strong = [[380, 200], [1350, 260], [1680, 2270], [20, 2150]]
const photos = {
  flat: () => warp(flat),
  keystone: () => warp(keystone),
  strongPerspective: () => warp(strong),
  bowed: () => warp(flat, { bow: 18 }),
  dim: () => light(warp(flat), { gain: 0.5 }),
  hardShadow: () => light(warp(flat), { shadow: 0.45 }),
  warmLight: () => light(warp(flat), { tint: [1, 0.86, 0.62], gain: 0.95 }),
  phoneCombo: async () => jpeg(light(warp(keystone), { grad: 0.4, tint: [1, 0.9, 0.72], noise: 18, gain: 0.85 })),
}
for (const [name, make] of Object.entries(photos)) {
  const result = analyzeSheetImage(await make(), assessment, {}, {}, resolveContext)
  assert.equal(result.markersFound, 4, `Marcadores: ${name}`)
  // Pode pedir revisão, mas nunca escolher a versão errada.
  const wrong = result.versionMarks.filter((field, index) => field.status === 'marked' && field.selected !== [2, 1][index])
  assert.equal(wrong.length, 0, `Versão errada: ${name}`)
  assert.deepEqual(result.versionMarks.map((field) => field.selected), [2, 1], `Leitura da versão: ${name}`)
  assert.equal(result.markedVersionId, 'v-azul-ESP', name)
}

console.log('Marcação de versão: QR v5, sugestão pelos nomes, folha impressa, leitura em escala 1 e 2 e fotos simuladas.')
