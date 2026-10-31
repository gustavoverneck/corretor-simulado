// Nota pela Teoria de Resposta ao Item (TRI), no mesmo modelo do ENEM
// (logístico de 3 parâmetros), mas com os parâmetros das questões estimados a
// partir dos próprios alunos do simulado. É opcional: só é calculada quando
// o simulado tem `tri.enabled`.
//
// - Cada área é calibrada separadamente, como no ENEM; a nota geral é a média
//   das áreas.
// - Cada versão de gabarito é uma prova diferente, então a calibração junta
//   só as folhas com o mesmo gabarito.
// - A escala é a do grupo: 500 é a média dos alunos que fizeram aquela prova e
//   cada 100 pontos é um desvio-padrão. Não é a escala oficial do INEP.
//
// No modo `enem` (simulado montado com a prova do ENEM), os parâmetros são os
// oficiais do INEP gravados em `tri.enem` (ver enemTri.js) e a nota sai na
// escala do ENEM, para qualquer número de alunos. `tri.classIds` limita a
// nota a algumas turmas.
import { getQuestionAreas } from './knowledgeAreas.js'
import { answerKeyGroups } from './teacherInsights.js'
import { CANCELLED_ANSWER, getAnswerKeyVersions } from './assessment.js'
import { enemScore, ENEM_AREAS } from './enemTri.js'
import { enemTriForSubmission } from './enemItems.js'

export { enemItemGroup, enemItemsReady, enemTriForSubmission } from './enemItems.js'

export const TRI_MIN_SHEETS = 30
export const TRI_RELIABLE_SHEETS = 100
export const TRI_MIN_ITEMS = 5

export function isTriEnabled(assessment) {
  return Boolean(assessment?.tri?.enabled)
}

export function setTriEnabled(assessment, enabled) {
  return { ...assessment, tri: { ...(assessment?.tri || {}), enabled: Boolean(enabled) } }
}

export function triMode(assessment) {
  return assessment?.tri?.mode === 'enem' ? 'enem' : 'estimated'
}

export function updateTri(assessment, changes) {
  return { ...assessment, tri: { ...(assessment?.tri || {}), ...changes } }
}

// Turmas que recebem a nota TRI; vazio = todas as turmas do simulado.
export function triClassIds(assessment) {
  const selected = Array.isArray(assessment?.tri?.classIds) ? assessment.tri.classIds.filter((id) => assessment.classIds?.includes(id)) : []
  return selected.length ? selected : assessment?.classIds || []
}


function computeEnemScores(assessment, valid) {
  const scores = new Map()
  const counts = new Map()
  valid.forEach((submission) => {
    const version = enemTriForSubmission(assessment, submission)
    const key = version?.versionId || 'sem-versao'
    if (!counts.has(key)) counts.set(key, { id: key, label: version?.label || 'Versão sem parâmetros do ENEM', sheets: 0, scored: 0, status: version ? 'ok' : 'unmatched', mode: 'enem', areas: [] })
    const info = counts.get(key)
    info.sheets += 1
    const result = version ? enemScore(submission.answers, version) : null
    if (!result) return
    info.scored += 1
    const areas = Object.fromEntries(Object.entries(result.areas).map(([code, value]) => [ENEM_AREAS[code] || code, value]))
    info.areas = Object.keys(areas).map((area) => ({ area, status: 'ok' }))
    scores.set(submission.id, { areas, score: result.score, scale: 'enem' })
  })
  return { scores, groups: [...counts.values()] }
}

const QUADRATURE = (() => {
  const points = []
  for (let index = 0; index < 41; index += 1) points.push(-4 + index * 0.2)
  const weights = points.map((theta) => Math.exp(-theta * theta / 2))
  const total = weights.reduce((sum, value) => sum + value, 0)
  return { points, weights: weights.map((value) => value / total) }
})()

function probability(theta, item) {
  return item.c + (1 - item.c) / (1 + Math.exp(-item.a * (theta - item.b)))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

// Resposta da questão: 1 acerto, 0 erro (branco e múltipla contam como erro,
// como no ENEM), null quando não entra (anulada, cancelada ou leitura incerta).
function responseValue(answer, key) {
  if (key === null || key === undefined || key === CANCELLED_ANSWER) return null
  const status = answer?.status || 'blank'
  if (status === 'cancelled' || status === 'uncertain') return null
  return status === 'correct' ? 1 : 0
}

// Prioris leves mantêm a estimação estável com poucas centenas de alunos.
const PRIOR = { logA: { mean: 0, sd: 0.5 }, b: { mean: 0, sd: 2 } }

function itemLogPosterior(item, expected) {
  let total = 0
  for (let q = 0; q < QUADRATURE.points.length; q += 1) {
    const { n, r } = expected[q]
    if (!n) continue
    const p = clamp(probability(QUADRATURE.points[q], item), 1e-6, 1 - 1e-6)
    total += r * Math.log(p) + (n - r) * Math.log(1 - p)
  }
  const logA = Math.log(item.a)
  total -= ((logA - PRIOR.logA.mean) ** 2) / (2 * PRIOR.logA.sd ** 2)
  total -= ((item.b - PRIOR.b.mean) ** 2) / (2 * PRIOR.b.sd ** 2)
  return total
}

// Passo M de uma questão: subida de gradiente numérica em (log a, b).
function maximizeItem(item, expected) {
  let logA = Math.log(item.a)
  let b = item.b
  let step = 0.3
  let current = itemLogPosterior(item, expected)
  for (let iteration = 0; iteration < 25 && step > 1e-3; iteration += 1) {
    const h = 1e-3
    const at = (la, bb) => itemLogPosterior({ a: Math.exp(la), b: bb, c: item.c }, expected)
    const gradA = (at(logA + h, b) - at(logA - h, b)) / (2 * h)
    const gradB = (at(logA, b + h) - at(logA, b - h)) / (2 * h)
    const norm = Math.hypot(gradA, gradB) || 1
    const nextLogA = clamp(logA + step * gradA / norm, Math.log(0.2), Math.log(4))
    const nextB = clamp(b + step * gradB / norm, -5, 5)
    const next = at(nextLogA, nextB)
    if (next > current) { logA = nextLogA; b = nextB; current = next; step *= 1.2 } else step /= 2
  }
  return { a: Math.exp(logA), b, c: item.c }
}

function posterior(pattern, items) {
  return QUADRATURE.points.map((theta, q) => {
    let likelihood = QUADRATURE.weights[q]
    pattern.forEach((value, index) => {
      if (value === null) return
      const p = probability(theta, items[index])
      likelihood *= value ? p : 1 - p
    })
    return likelihood
  })
}

function eap(pattern, items) {
  const weights = posterior(pattern, items)
  const total = weights.reduce((sum, value) => sum + value, 0) || 1
  const mean = weights.reduce((sum, value, q) => sum + value * QUADRATURE.points[q], 0) / total
  const variance = weights.reduce((sum, value, q) => sum + value * (QUADRATURE.points[q] - mean) ** 2, 0) / total
  return { theta: mean, se: Math.sqrt(variance) }
}

// Calibra questões por máxima verossimilhança marginal (EM) com c fixo no
// acerto ao acaso (1 / número de alternativas).
export function calibrateItems(patterns, { optionCount = 5, cycles = 40 } = {}) {
  const itemCount = patterns[0]?.length || 0
  const guess = 1 / Math.max(2, optionCount)
  let items = Array.from({ length: itemCount }, (_, index) => {
    const answered = patterns.map((pattern) => pattern[index]).filter((value) => value !== null)
    const rate = clamp(answered.length ? answered.reduce((sum, value) => sum + value, 0) / answered.length : 0.5, 0.02, 0.98)
    const adjusted = clamp((rate - guess) / (1 - guess), 0.02, 0.98)
    return { a: 1, b: clamp(-Math.log(adjusted / (1 - adjusted)), -4, 4), c: guess }
  })
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const expected = items.map(() => QUADRATURE.points.map(() => ({ n: 0, r: 0 })))
    patterns.forEach((pattern) => {
      const weights = posterior(pattern, items)
      const total = weights.reduce((sum, value) => sum + value, 0) || 1
      pattern.forEach((value, index) => {
        if (value === null) return
        for (let q = 0; q < weights.length; q += 1) {
          const share = weights[q] / total
          expected[index][q].n += share
          expected[index][q].r += share * value
        }
      })
    })
    const previous = items
    items = items.map((item, index) => maximizeItem(item, expected[index]))
    const change = Math.max(...items.map((item, index) => Math.max(Math.abs(item.a - previous[index].a), Math.abs(item.b - previous[index].b))))
    if (change < 1e-3) break
  }
  return items
}

function scaleScores(thetas) {
  const mean = thetas.reduce((sum, value) => sum + value, 0) / thetas.length
  const sd = Math.sqrt(thetas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / thetas.length) || 1
  return (theta) => Math.round(500 + 100 * (theta - mean) / sd)
}

// Calcula a nota TRI de cada folha do simulado. Devolve um Map
// submissionId → { score, areas: { [área]: score } } e o estado de cada grupo.
export function computeTriScores(assessment, submissions) {
  const scores = new Map()
  const groups = []
  if (!isTriEnabled(assessment)) return { scores, groups }
  const classIds = new Set(triClassIds(assessment))
  const valid = submissions.filter((submission) => submission.assessmentId === assessment.id && !submission.voided && Array.isArray(submission.answers) && (!submission.classId || classIds.has(submission.classId)))
  if (triMode(assessment) === 'enem') return computeEnemScores(assessment, valid)
  answerKeyGroups(assessment, valid).forEach((group) => {
    const questionAreas = getQuestionAreas(group.assessment)
    const areas = [...new Set(questionAreas)]
    const info = { id: group.id, label: group.label, sheets: group.submissions.length, areas: [], status: 'ok' }
    groups.push(info)
    if (group.submissions.length < TRI_MIN_SHEETS) { info.status = 'small'; return }
    areas.forEach((area) => {
      const indexes = questionAreas.map((value, index) => value === area && group.answerKey[index] !== null && group.answerKey[index] !== undefined ? index : -1).filter((index) => index >= 0)
      if (indexes.length < TRI_MIN_ITEMS) { info.areas.push({ area, items: indexes.length, status: 'few-items' }); return }
      const patterns = group.submissions.map((submission) => indexes.map((index) => responseValue(submission.answers[index], group.answerKey[index])))
      const items = calibrateItems(patterns, { optionCount: assessment.optionCount || 5 })
      const estimates = patterns.map((pattern) => eap(pattern, items))
      const toScale = scaleScores(estimates.map((item) => item.theta))
      info.areas.push({ area, items: indexes.length, status: 'ok' })
      group.submissions.forEach((submission, index) => {
        const entry = scores.get(submission.id) || { areas: {} }
        entry.areas[area] = toScale(estimates[index].theta)
        scores.set(submission.id, entry)
      })
    })
    if (!info.areas.some((item) => item.status === 'ok')) info.status = 'few-items'
  })
  scores.forEach((entry) => {
    const values = Object.values(entry.areas)
    entry.score = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
  })
  return { scores, groups }
}

export function triGroupMessage(group) {
  if (group.mode === 'enem' && group.status === 'ok') return ''
  if (group.status === 'unmatched') return `${group.sheets} folha(s) com um gabarito que não foi reconhecido como caderno do ENEM. Confira os parâmetros das versões.`
  if (group.status === 'small') return `${group.label}: ${group.sheets} folhas. A TRI precisa de pelo menos ${TRI_MIN_SHEETS} folhas com o mesmo gabarito.`
  if (group.status === 'few-items') return `${group.label}: as áreas têm menos de ${TRI_MIN_ITEMS} questões válidas, poucas para a TRI.`
  if (group.sheets < TRI_RELIABLE_SHEETS) return `${group.label}: ${group.sheets} folhas. A nota TRI já é calculada, mas ainda oscila; fica mais estável a partir de ${TRI_RELIABLE_SHEETS}.`
  return ''
}

