// TRI com os parâmetros oficiais do INEP para simulados montados com provas
// do ENEM. Os parâmetros vêm do arquivo ITENS_PROVA_<ano>.csv dos microdados
// (um ano já vem com o app; outros anos podem ser importados). Cada versão do
// simulado é reconhecida comparando o seu gabarito com o gabarito oficial de
// cada caderno (cor) e área.

export const ENEM_AREAS = {
  LC: 'Linguagens, Códigos e suas Tecnologias',
  CH: 'Ciências Humanas e suas Tecnologias',
  CN: 'Ciências da Natureza e suas Tecnologias',
  MT: 'Matemática e suas Tecnologias',
}
export const ENEM_AREA_SHORT = { LC: 'Linguagens', CH: 'Humanas', CN: 'Natureza', MT: 'Matemática' }
export const LANGUAGES = { 0: 'Inglês', 1: 'Espanhol' }
export const MIN_MATCH = 0.9

function parseNumber(value) {
  const number = Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function splitLine(line, separator) {
  return line.split(separator).map((value) => value.trim().replace(/^"|"$/g, ''))
}

// Lê o ITENS_PROVA do INEP e agrupa por caderno (CO_PROVA). Para Linguagens,
// as questões 1 a 5 existem em inglês e espanhol (TP_LINGUA 0 e 1).
export function parseItensProva(text, year) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) throw new Error('Arquivo de itens vazio.')
  const separator = lines[0].includes(';') ? ';' : ','
  const header = splitLine(lines[0], separator).map((name) => name.toUpperCase())
  const column = (name) => header.indexOf(name)
  const required = ['CO_POSICAO', 'SG_AREA', 'TX_GABARITO', 'NU_PARAM_A', 'NU_PARAM_B', 'NU_PARAM_C', 'CO_PROVA']
  const missing = required.filter((name) => column(name) < 0)
  if (missing.length) throw new Error(`O arquivo não parece ser o ITENS_PROVA do INEP (faltam ${missing.join(', ')}).`)
  const provas = new Map()
  lines.slice(1).forEach((line) => {
    const cells = splitLine(line, separator)
    const get = (name) => cells[column(name)]
    const co = get('CO_PROVA')
    const area = String(get('SG_AREA') || '').toUpperCase()
    if (!co || !ENEM_AREAS[area]) return
    if (!provas.has(co)) provas.set(co, { co, area, cor: column('TX_COR') >= 0 ? get('TX_COR') : '', items: [] })
    const language = column('TP_LINGUA') >= 0 && get('TP_LINGUA') !== '' ? Number(get('TP_LINGUA')) : null
    provas.get(co).items.push({
      position: Number(get('CO_POSICAO')),
      key: String(get('TX_GABARITO') || '').toUpperCase(),
      item: column('CO_ITEM') >= 0 ? String(get('CO_ITEM') || '') : '',
      a: parseNumber(get('NU_PARAM_A')),
      b: parseNumber(get('NU_PARAM_B')),
      c: parseNumber(get('NU_PARAM_C')),
      language: Number.isFinite(language) ? language : null,
      abandoned: column('IN_ITEM_ABAN') >= 0 && get('IN_ITEM_ABAN') === '1',
      skill: column('CO_HABILIDADE') >= 0 ? get('CO_HABILIDADE') : '',
    })
  })
  const result = [...provas.values()].map((prova) => ({ ...prova, items: prova.items.sort((first, second) => first.position - second.position || (first.language ?? 0) - (second.language ?? 0)) }))
  if (!result.length) throw new Error('Nenhum caderno reconhecido no arquivo.')
  return { year: Number(year) || null, provas: result }
}

// Formato compacto usado no arquivo que acompanha o app:
// item = [posição, gabarito, a, b, c, língua, abandonado, código do item].
export function compactDataset(dataset) {
  return {
    year: dataset.year,
    provas: dataset.provas.map((prova) => ({
      co: prova.co,
      area: prova.area,
      cor: prova.cor,
      items: prova.items.map((item) => [item.position, item.key, item.a, item.b, item.c, item.language, item.abandoned ? 1 : 0, item.item || '']),
    })),
  }
}

export function expandDataset(compact) {
  return {
    year: compact.year,
    provas: compact.provas.map((prova) => ({
      ...prova,
      items: prova.items.map(([position, key, a, b, c, language, abandoned, item = '']) => ({ position, key, a, b, c, language, abandoned: Boolean(abandoned), skill: '', item })),
    })),
  }
}

// Sequência de 45 questões de um caderno na ordem do caderno, para uma
// língua estrangeira (só Linguagens tem duas).
export function provaSequence(prova, language = 0) {
  const byPosition = new Map()
  prova.items.forEach((item) => {
    if (!byPosition.has(item.position)) byPosition.set(item.position, [])
    byPosition.get(item.position).push(item)
  })
  return [...byPosition.entries()]
    .sort((first, second) => first[0] - second[0])
    .map(([, items]) => items.length > 1 ? items.find((item) => item.language === language) || items[0] : items[0])
}

function comparableKey(value) {
  return typeof value === 'string' && /^[A-E]$/.test(value) ? value : null
}

function matchRate(versionKey, offset, sequence) {
  let compared = 0
  let equal = 0
  sequence.forEach((item, index) => {
    const mine = comparableKey(versionKey[offset + index])
    const official = comparableKey(item.key)
    if (!mine || !official) return
    compared += 1
    if (mine === official) equal += 1
  })
  return compared >= Math.min(10, sequence.length) ? equal / compared : 0
}

// Encontra, em blocos de 45 questões, o caderno e a língua cujo gabarito
// oficial coincide com o gabarito da versão.
export function matchVersion(answerKey, dataset) {
  const segments = []
  for (let offset = 0; offset + 45 <= answerKey.length; offset += 45) {
    let best = null
    dataset.provas.forEach((prova) => {
      const languages = prova.area === 'LC' && prova.items.some((item) => item.language === 1) ? [0, 1] : [null]
      languages.forEach((language) => {
        const sequence = provaSequence(prova, language ?? 0)
        if (sequence.length !== 45) return
        const rate = matchRate(answerKey, offset, sequence)
        // Empate (cadernos com o mesmo gabarito): fica o de código menor, que é
        // o da aplicação regular.
        if (!best || rate > best.rate || (rate === best.rate && Number(prova.co) < Number(best.prova.co))) best = { offset, rate, prova, language, sequence }
      })
    })
    if (best && best.rate >= MIN_MATCH) segments.push(best)
  }
  return segments
}

export function describeSegment(segment) {
  return [ENEM_AREA_SHORT[segment.prova.area], segment.prova.cor && `caderno ${segment.prova.cor.toLowerCase()}`, segment.language !== null && LANGUAGES[segment.language]?.toLowerCase(), `${Math.round(segment.rate * 100)}% do gabarito igual`].filter(Boolean).join(' · ')
}

// Parâmetros gravados na versão do simulado: um item por questão da folha.
export function buildVersionTri(answerKey, dataset) {
  const segments = matchVersion(answerKey, dataset)
  if (!segments.length) return null
  const items = answerKey.map(() => null)
  segments.forEach((segment) => {
    segment.sequence.forEach((item, index) => {
      if (item.abandoned || item.a === null || item.b === null || item.c === null) return
      items[segment.offset + index] = { area: segment.prova.area, a: item.a, b: item.b, c: item.c, ...(item.item ? { item: item.item } : {}), ...(item.skill ? { skill: Number(item.skill) } : {}) }
    })
  })
  return {
    source: `ENEM ${dataset.year || ''}`.trim(),
    segments: segments.map((segment) => ({ offset: segment.offset, area: segment.prova.area, prova: segment.prova.co, cor: segment.prova.cor, language: segment.language, rate: Math.round(segment.rate * 1000) / 1000 })),
    items,
  }
}

// ---------- Cálculo da nota ----------

const QUADRATURE = (() => {
  const points = []
  for (let index = 0; index < 81; index += 1) points.push(-4 + index * 0.1)
  const weights = points.map((theta) => Math.exp(-theta * theta / 2))
  const total = weights.reduce((sum, value) => sum + value, 0)
  return { points, weights: weights.map((value) => value / total) }
})()

// Os parâmetros do INEP estão na escala da proficiência (θ). A nota divulgada
// é o θ por EAP (priori normal padrão) levado à escala do ENEM por
// mean + sd·θ. As constantes foram ajustadas com 2.487 participantes do ENEM
// 2025 (microdados): a diferença para a nota oficial ficou abaixo de 0,1
// ponto em 99% dos casos.
export const ENEM_SCALE = {
  LC: { mean: 499.979, sd: 108.087 },
  CH: { mean: 501.487, sd: 112.312 },
  CN: { mean: 501.143, sd: 113.105 },
  MT: { mean: 500.018, sd: 129.65 },
}

function probability(theta, item) {
  return item.c + (1 - item.c) / (1 + Math.exp(-item.a * (theta - item.b)))
}

export function eapTheta(responses) {
  const weights = QUADRATURE.points.map((theta, q) => {
    let likelihood = QUADRATURE.weights[q]
    responses.forEach(({ item, correct }) => {
      const p = probability(theta, item)
      likelihood *= correct ? p : 1 - p
    })
    return likelihood
  })
  const total = weights.reduce((sum, value) => sum + value, 0) || 1
  return weights.reduce((sum, value, q) => sum + value * QUADRATURE.points[q], 0) / total
}

// Resposta da folha: acerto 1; erro, branco e múltipla 0 (como no ENEM).
// Questão anulada/cancelada no simulado ou leitura incerta fica fora.
export function enemScore(answers, tri, scale = ENEM_SCALE) {
  if (!tri?.items) return null
  const byArea = new Map()
  tri.items.forEach((item, index) => {
    if (!item) return
    const status = answers?.[index]?.status || 'blank'
    if (status === 'cancelled' || status === 'uncertain' || answers?.[index]?.annulled) return
    if (!byArea.has(item.area)) byArea.set(item.area, [])
    byArea.get(item.area).push({ item, correct: status === 'correct' })
  })
  const areas = {}
  byArea.forEach((responses, area) => {
    const { mean, sd } = scale[area] || { mean: 500, sd: 100 }
    areas[area] = Math.round((mean + sd * eapTheta(responses)) * 10) / 10
  })
  const values = Object.values(areas)
  return values.length ? { areas, score: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 } : null
}
