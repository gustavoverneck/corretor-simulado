import { buildXlsx } from './xlsx.js'
import { pairFor, reliabilityLabel } from './teacherInsights.js'

// Planilha editável com as leituras da aba de correlação (resumo, questões, áreas e alunos).
const header = { bold: true, color: 'FFFFFF', fill: '426F62', border: true, align: 'center', wrap: true }
const cellStyle = { border: true }
const percentStyle = { border: true, numFmt: 'percent', align: 'center' }
const decimalStyle = { border: true, numFmt: 'decimal', align: 'center' }
const title = (value) => [{ v: value, s: { bold: true, size: 14, color: '31594E' } }]
const toneFill = { red: 'F8EAE8', ochre: 'F8EEE3', purple: 'EFEBF3', green: 'E8F1ED', blue: 'E9EFF4', neutral: 'F1F3F2' }
const round = (value, digits = 3) => value === null || value === undefined || !Number.isFinite(value) ? '' : Number(value.toFixed(digits))

export function buildCorrelationWorkbook({ assessment, scopeLabel, itemReport, itemLabel, areaReport, insights, attention }) {
  const summary = [
    title(`${assessment.title} · leitura pedagógica`),
    [{ v: scopeLabel, s: { italic: true, color: '69746F' } }],
    [],
    [{ v: 'Tema', s: header }, { v: 'O que os dados mostram', s: header }],
    ...insights.map((insight) => [{ v: insight.title, s: { ...cellStyle, bold: true, fill: toneFill[insight.tone] || toneFill.neutral } }, { v: insight.text, s: { ...cellStyle, wrap: true } }]),
  ]

  const letters = itemReport ? Object.keys(itemReport.items[0]?.distribution || {}) : []
  const items = [
    title(`Análise das questões${itemLabel ? ` · ${itemLabel}` : ''}`),
    [{ v: `${itemReport?.sheets || 0} folhas · alfa de Cronbach ${itemReport?.alpha === null || itemReport?.alpha === undefined ? '—' : itemReport.alpha.toFixed(2).replace('.', ',')} (${reliabilityLabel(itemReport?.alpha).label})`, s: { italic: true, color: '69746F' } }],
    [],
    ['Questão', 'Área', 'Gabarito', 'Acerto', 'Discriminação', 'Índice D', ...letters, 'Branco', 'Múltipla', 'Diagnóstico', 'Sugestão'].map((v) => ({ v, s: header })),
    ...(itemReport?.items || []).map((item) => [
      { v: item.number, s: { ...cellStyle, align: 'center' } }, { v: item.area, s: cellStyle }, { v: item.cancelled ? 'Anulada' : item.key, s: { ...cellStyle, align: 'center' } },
      { v: item.cancelled ? '' : round(item.correctRate), s: percentStyle }, { v: round(item.discrimination, 2), s: decimalStyle }, { v: round(item.dIndex, 2), s: decimalStyle },
      ...letters.map((letter) => ({ v: round(item.distribution[letter]), s: { ...percentStyle, ...(letter === item.key ? { bold: true, fill: 'E8F1ED' } : {}) } })),
      { v: round(item.blankRate), s: percentStyle }, { v: round(item.multipleRate), s: percentStyle },
      { v: item.diagnosis.label, s: { ...cellStyle, fill: toneFill[item.diagnosis.tone] } }, { v: item.diagnosis.hint, s: { ...cellStyle, wrap: true } },
    ]),
  ]

  const areaNames = areaReport.areas.map((area) => area.area)
  const areas = [
    title('Correlação entre áreas (r de Pearson)'),
    [{ v: 'Cada célula mostra quanto as notas de duas áreas andam juntas: perto de 1, quem vai bem numa vai bem na outra; perto de 0, não há relação.', s: { italic: true, color: '69746F' } }],
    [],
    [{ v: 'Área', s: header }, ...areaNames.map((v) => ({ v, s: header }))],
    ...areaNames.map((first) => [{ v: first, s: { ...cellStyle, bold: true } }, ...areaNames.map((second) => first === second ? { v: 1, s: decimalStyle } : { v: round(pairFor(areaReport.pairs, first, second)?.r, 2), s: decimalStyle })]),
    [],
    ['Área', 'Alunos', 'Média (%)', 'Desvio (p.p.)', 'Alfa da área'].map((v) => ({ v, s: header })),
    ...areaReport.areas.map((area) => [{ v: area.area, s: cellStyle }, { v: area.n, s: { ...cellStyle, align: 'center' } }, { v: round(area.mean, 1), s: decimalStyle }, { v: round(area.sd, 1), s: decimalStyle }, { v: round(itemReport?.areaAlpha?.[area.area], 2), s: decimalStyle }]),
  ]
  if (areaReport.byClass.length > 1) {
    areas.push([], [{ v: 'Turma', s: header }, { v: 'Alunos', s: header }, { v: 'Média (%)', s: header }, ...areaNames.map((v) => ({ v, s: header }))])
    areaReport.byClass.forEach((row) => areas.push([{ v: row.name, s: cellStyle }, { v: row.n, s: { ...cellStyle, align: 'center' } }, { v: round(row.mean, 1), s: decimalStyle }, ...areaNames.map((area) => ({ v: round(row.areas[area], 1), s: decimalStyle }))]))
  }

  const students = [
    title('Alunos que precisam de atenção'),
    [],
    ['Aluno', 'Turma', 'Nota (%)', 'Em branco', 'Área mais fraca', 'Nota na área (%)', 'Motivo'].map((v) => ({ v, s: header })),
    ...attention.map((row) => [{ v: row.name, s: cellStyle }, { v: row.className, s: cellStyle }, { v: row.score, s: { ...cellStyle, align: 'center' } }, { v: round(row.blankRate), s: percentStyle }, { v: row.weakest?.area || '', s: cellStyle }, { v: round(row.weakest?.score, 1), s: decimalStyle }, { v: row.reasons.join('; '), s: cellStyle }]),
  ]

  return buildXlsx([
    { name: 'Resumo', rows: summary, cols: [26, 110] },
    { name: 'Questões', rows: items, cols: [9, 26, 10, 9, 13, 9, ...letters.map(() => 7), 8, 9, 22, 60], freeze: { rows: 4, columns: 1 } },
    { name: 'Áreas', rows: areas, cols: [26, ...areaNames.map(() => 16)] },
    { name: 'Alunos', rows: students, cols: [34, 16, 10, 11, 24, 15, 34], freeze: { rows: 3, columns: 1 } },
  ], { title: assessment.title })
}
