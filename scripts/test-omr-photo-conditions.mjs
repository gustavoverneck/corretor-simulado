import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transformWithEsbuild } from 'vite'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { analyzeSheetImage, detectSheetMarkers, gridAlignmentScore, layoutBubbleCenter, normalizeIllumination, readSheetQr } from '../src/lib/omr.js'
import { getSheetFormat, getSheetLayout } from '../src/lib/sheetFormat.js'

// Entirely synthetic photos of the real printed sheet: camera angle, rotation,
// paper curvature, exposure, coloured light, shadows, noise and JPEG.
// The reader may send answers to review, but must never grade them wrongly.
let source = await readFile(new URL('../src/components/AnswerSheet.jsx', import.meta.url), 'utf8')
source = source.replace('import.meta.env.BASE_URL', "'/'").replace(/from '(.*?)'/g, (m, name) => {
  const target = name.startsWith('.') ? resolve('src/components', `${name}.js`) : import.meta.resolve(name)
  return `from '${name.startsWith('.') ? pathToFileURL(target).href : target}'`
})
let { code } = await transformWithEsbuild(source, 'AnswerSheet.jsx', { jsx: 'automatic', loader: 'jsx' })
code = code.replace('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
const { AnswerSheet } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const student = { id: 'student-mjhiv57a-a8bcd', name: 'Aluno de Teste', registration: '123' }
const school = { name: 'Escola de Teste', city: 'Cidade', state: 'ES' }
const Q = Number(process.env.Q || 45), O = 5
const assessment = { id: 'assessment-mjhiv57a-a8bcd', title: 'Simulado', code: 'S1', questionCount: Q, optionCount: O, answerKey: Array(Q).fill('A') }
const layout = getSheetLayout(getSheetFormat(Q, O))
let svg = renderToStaticMarkup(React.createElement(AnswerSheet, { student, assessment, school, classroom: { name: 'T' } }))
// truth: every 7th blank, others pseudo-random letter; marks are ~80% fills, some blue
const truth = [], marks = []
let seed = 7
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
for (let q = 0; q < Q; q++) {
  if (q % 7 === 6) { truth.push(''); continue }
  const opt = Math.floor(rnd() * O); truth.push('ABCDE'[opt])
  const c = layoutBubbleCenter(q, opt, layout)
  const color = q % 3 === 0 ? '#1f3a9e' : '#202020'
  marks.push(`<circle cx="${c.x + (rnd()-.5)*2}" cy="${c.y + (rnd()-.5)*2}" r="${layout.bubbleRadius * (0.6 + rnd()*0.3)}" fill="${color}" opacity="0.92"/>`)
}
svg = svg.slice(0, svg.lastIndexOf('</svg>')) + marks.join('') + '</svg>'
const base = createCanvas(794 * 2, 1123 * 2)
base.getContext('2d').drawImage(await loadImage(Buffer.from(svg)), 0, 0, base.width, base.height)
const basePix = base.getContext('2d').getImageData(0, 0, base.width, base.height)

function homography(src, dst) { // solve 8x8
  const A = [], b = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u)
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v)
  }
  for (let i = 0; i < 8; i++) { let p = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
    ;[A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]]
    for (let r = 0; r < 8; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i] } }
  const h = b.map((v, i) => v / A[i][i]); return [...h, 1]
}
// warp: output W x H, mapping output -> source via inverse homography + optional bow
function warp({ W = 1700, H = 2300, quad, bow = 0, rot180 = false, rotDeg = 0 }) {
  const sw = base.width, sh = base.height
  const srcC = [[0, 0], [sw, 0], [sw, sh], [0, sh]]
  const Hm = homography(quad, srcC) // output -> source
  const out = new Uint8ClampedArray(W * H * 4)
  const cos = Math.cos(rotDeg * Math.PI / 180), sin = Math.sin(rotDeg * Math.PI / 180)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ox = x, oy = y
    if (rot180) { ox = W - 1 - x; oy = H - 1 - y }
    if (rotDeg) { const dx = ox - W / 2, dy = oy - H / 2; ox = W / 2 + dx * cos - dy * sin; oy = H / 2 + dx * sin + dy * cos }
    const d = Hm[6] * ox + Hm[7] * oy + 1
    let sx = (Hm[0] * ox + Hm[1] * oy + Hm[2]) / d, sy = (Hm[3] * ox + Hm[4] * oy + Hm[5]) / d
    if (bow) { sx += bow * Math.sin(Math.PI * sy / sh) * ((sx / sw) - 0.5) * 2; sy += bow * 0.6 * Math.sin(Math.PI * sx / sw) }
    const o = (y * W + x) * 4
    const ix = Math.floor(sx), iy = Math.floor(sy)
    if (ix < 0 || iy < 0 || ix >= sw - 1 || iy >= sh - 1) { out[o] = 90; out[o + 1] = 80; out[o + 2] = 70; out[o + 3] = 255; continue }
    const fx = sx - ix, fy = sy - iy
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
    for (let c = 0; c < 3; c++) data[o + c] = Math.max(0, Math.min(255, data[o + c] * g * tint[c] + (noise ? (Math.random() - .5) * noise : 0)))
  }
  return img
}
async function jpeg(img, q = 60) {
  const c = createCanvas(img.width, img.height); const ctx = c.getContext('2d')
  const id = ctx.createImageData(img.width, img.height); id.data.set(img.data); ctx.putImageData(id, 0, 0)
  const im = await loadImage(c.toBuffer('image/jpeg', q)); ctx.drawImage(im, 0, 0); return ctx.getImageData(0, 0, img.width, img.height)
}
const flat = [[50, 50], [1650, 50], [1650, 2250], [50, 2250]]
const keystone = [[220, 120], [1480, 160], [1660, 2250], [40, 2200]]
const strong = [[380, 200], [1350, 260], [1680, 2270], [20, 2150]]
// full: every answer must be read; otherwise only review is acceptable.
const scenarios = {
  flat: [true, () => warp({ quad: flat })],
  strongPerspective: [true, () => warp({ quad: strong })],
  rot20: [true, () => warp({ quad: [[250, 250], [1450, 250], [1450, 1950], [250, 1950]], rotDeg: 20 })],
  rot40: [true, () => warp({ quad: [[350, 400], [1350, 400], [1350, 1800], [350, 1800]], rotDeg: 40 })],
  rot90: [true, () => warp({ quad: [[250, 250], [1450, 250], [1450, 1950], [250, 1950]], rotDeg: 90 })],
  upsideDown: [true, () => warp({ quad: flat, rot180: true })],
  dim: [true, () => light(warp({ quad: flat }), { gain: 0.5 })],
  gradient: [true, () => light(warp({ quad: keystone }), { grad: 0.55 })],
  softShadow: [true, () => light(warp({ quad: flat }), { grad: 0.3, shadow: 0.2 })],
  bowedPaper: [false, () => warp({ quad: flat, bow: 18 })],
  strongBow: [false, () => warp({ quad: flat, bow: 32 })],
  hardShadow: [true, () => light(warp({ quad: flat }), { shadow: 0.45 })],
  warmLight: [true, () => light(warp({ quad: flat }), { tint: [1, 0.86, 0.62], gain: 0.95 })],
  phoneCombo: [true, async () => jpeg(light(warp({ quad: keystone }), { grad: 0.4, tint: [1, .9, .72], noise: 18, gain: .85 }), 55)],
}
for (const [name, [full, make]] of Object.entries(scenarios)) {
  const result = analyzeSheetImage(await make(), assessment)
  assert.equal(result.markersFound, 4, `Marcadores: ${name}`)
  result.answers.forEach((answer, index) => {
    if (answer.status === 'uncertain' || answer.status === 'multiple') {
      assert.ok(!full, `Q${index + 1} enviada à revisão: ${name}`)
      return
    }
    assert.equal(answer.selected.join(''), truth[index], `Q${index + 1}: ${name}`)
  })
}

// Corners that are plausible in shape but not on the printed grid must be rejected.
const shifted = normalizeIllumination(warp({ quad: flat }))
const markers = detectSheetMarkers(shifted, readSheetQr(shifted)?.location)
const aligned = gridAlignmentScore(shifted, markers.corners, layout, Q, O)
const offset = Object.fromEntries(Object.entries(markers.corners).map(([key, point]) => [key, { x: point.x + 40, y: point.y + 28 }]))
assert.ok(aligned > 0.1, `Grade alinhada: ${aligned}`)
assert.ok(gridAlignmentScore(shifted, offset, layout, Q, O) < 0.035, 'Grade deslocada')

console.log('Fotos simuladas: perspectiva, rotação até 180°, papel curvo, pouca luz, gradiente, luz quente, sombra, ruído e JPEG sem respostas erradas.')
