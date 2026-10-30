import { CANCELLED_ANSWER, getAnswerKeyVersions, getAssessmentForSubmission, getAssessmentForVersion } from './assessment.js'
import { getQuestionAreas } from './knowledgeAreas.js'
import { analyzeItems, MIN_RESPONSES, submissionAnswerKey } from './itemAnalysis.js'
import { calculateSubmissionMetrics } from './resultsMetrics.js'
import { pearsonWithInference } from './networkAnalysis.js'

// Leituras pedagógicas da aba Análise: análise de itens (teoria clássica dos testes),
// correlação entre áreas e frases-resumo para o professor.
const GROUP_SHARE = 0.27
export const LOW_SCORE = 40
export const HIGH_BLANK_RATE = 0.25

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
function variance(values) {
  if (values.length < 2) return 0
  const average = mean(values)
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
}
const deviation = (values) => Math.sqrt(variance(values))
function quantile(values, share) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * share
  const lower = Math.floor(position)
  return sorted[lower] + (sorted[Math.min(sorted.length - 1, lower + 1)] - sorted[lower]) * (position - lower)
}
const gradable = (expected) => typeof expected === 'string' && expected !== CANCELLED_ANSWER
const singleSelection = (answer) => Array.isArray(answer?.selected) && answer.selected.length === 1 ? answer.selected[0] : null
const pct = (value) => `${Math.round(value * 100)}%`
const decimal = (value, digits = 2) => Number(value || 0).toFixed(digits).replace('.', ',')

function correlation(first, second) {
  const n = first.length
  if (n < 3) return null
  const meanA = mean(first); const meanB = mean(second)
  let covariance = 0; let varianceA = 0; let varianceB = 0
  for (let index = 0; index < n; index += 1) {
    covariance += (first[index] - meanA) * (second[index] - meanB)
    varianceA += (first[index] - meanA) ** 2
    varianceB += (second[index] - meanB) ** 2
  }
  return varianceA && varianceB ? covariance / Math.sqrt(varianceA * varianceB) : null
}

// Alfa de Cronbach sobre uma matriz aluno × questão de 0/1.
export function cronbachAlpha(matrix) {
  const k = matrix[0]?.length || 0
  if (matrix.length < 3 || k < 2) return null
  const itemVariance = Array.from({ length: k }, (_, column) => variance(matrix.map((row) => row[column]))).reduce((sum, value) => sum + value, 0)
  const totalVariance = variance(matrix.map((row) => row.reduce((sum, value) => sum + value, 0)))
  return totalVariance ? (k / (k - 1)) * (1 - itemVariance / totalVariance) : null
}

export function reliabilityLabel(alpha) {
  if (alpha === null || alpha === undefined) return { tone: 'neutral', label: 'Sem dados suficientes' }
  if (alpha >= 0.8) return { tone: 'green', label: 'Boa' }
  if (alpha >= 0.7) return { tone: 'blue', label: 'Aceitável' }
  if (alpha >= 0.5) return { tone: 'ochre', label: 'Baixa' }
  return { tone: 'red', label: 'Muito baixa' }
}

export function correlationStrength(r) {
  const value = Math.abs(r ?? 0)
  return value >= 0.5 ? 'forte' : value >= 0.3 ? 'moderada' : value >= 0.1 ? 'fraca' : 'desprezível'
}

// Cada versão de gabarito tem questões próprias (série, cor de prova), então a análise de itens
// só junta folhas corrigidas com o mesmo gabarito.
export function answerKeyGroups(assessment, submissions) {
  const versions = getAnswerKeyVersions(assessment)
  const groups = new Map()
  submissions.forEach((submission) => {
    if (submission.assessmentId !== assessment?.id || !Array.isArray(submission.answers)) return
    const answerKey = submissionAnswerKey(assessment, submission)
    const signature = JSON.stringify(answerKey)
    if (!groups.has(signature)) {
      const version = versions.find((item) => JSON.stringify(item.answerKey) === signature) || versions.find((item) => item.id === submission.answerKeyVersionId)
      groups.set(signature, { id: version?.id || signature, label: version?.label || 'Gabarito da turma', answerKey, assessment: version ? getAssessmentForVersion(assessment, version) : getAssessmentForSubmission(assessment, submission), submissions: [] })
    }
    groups.get(signature).submissions.push(submission)
  })
  return [...groups.values()].sort((a, b) => b.submissions.length - a.submissions.length || String(a.label).localeCompare(String(b.label)))
}

function diagnose(item, small) {
  if (item.cancelled) return { tone: 'neutral', label: 'Anulada', hint: 'Fica fora da análise.' }
  if (item.flag === 'key') return { tone: 'red', label: 'Gabarito suspeito', hint: `Os melhores alunos preferiram ${item.suggested}. Confira o gabarito.` }
  if (!small && item.discrimination !== null && item.discrimination < 0) return { tone: 'red', label: 'Discrimina ao contrário', hint: 'Quem vai bem na prova erra mais esta questão. Revise enunciado e alternativas.' }
  if (item.correctRate < 0.2) return { tone: 'ochre', label: 'Muito difícil', hint: 'Quase ninguém acertou. Vale retomar o conteúdo.' }
  if (item.topDistractor && item.topDistractor.share >= Math.max(0.3, item.correctRate)) return { tone: 'purple', label: `Erro comum: ${item.topDistractor.letter}`, hint: `${pct(item.topDistractor.share)} marcaram ${item.topDistractor.letter}. Discuta por que essa alternativa atrai.` }
  if (item.correctRate > 0.9) return { tone: 'blue', label: 'Muito fácil', hint: 'Quase todos acertaram; diferencia pouco os alunos.' }
  if (!small && item.discrimination !== null && item.discrimination < 0.2) return { tone: 'ochre', label: 'Pouco discrimina', hint: 'Acertar esta questão quase não depende do desempenho geral.' }
  if (!small && item.discrimination !== null && item.discrimination >= 0.3) return { tone: 'green', label: 'Boa questão', hint: 'Separa bem quem domina de quem não domina o conteúdo.' }
  return { tone: 'neutral', label: 'Adequada', hint: '' }
}

export function buildItemReport({ assessment, answerKey, submissions, optionCount = 5 }) {
  const sheets = submissions.filter((submission) => Array.isArray(submission.answers))
  const letters = Array.from({ length: optionCount }, (_, index) => String.fromCharCode(65 + index))
  const areas = getQuestionAreas(assessment)
  const gradedIndexes = answerKey.map((key, index) => gradable(key) ? index : -1).filter((index) => index >= 0)
  const matrix = sheets.map((submission) => answerKey.map((key, index) => gradable(key) && submission.answers[index]?.status === 'correct' ? 1 : 0))
  const totals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0))
  const order = totals.map((total, index) => [total, index]).sort((a, b) => b[0] - a[0])
  const groupSize = Math.max(1, Math.round(sheets.length * GROUP_SHARE))
  const top = new Set(order.slice(0, groupSize).map(([, index]) => index))
  const bottom = new Set(order.slice(-groupSize).map(([, index]) => index))
  const flags = analyzeItems({ answerKey, submissions: sheets, optionCount })
  const small = sheets.length < MIN_RESPONSES

  const items = answerKey.map((key, index) => {
    const cancelled = !gradable(key)
    const counts = Object.fromEntries(letters.map((letter) => [letter, 0]))
    let blank = 0; let multiple = 0
    sheets.forEach((submission) => {
      const answer = submission.answers[index]
      const letter = singleSelection(answer)
      if (letter && letter in counts) counts[letter] += 1
      else if ((answer?.selected || []).length > 1) multiple += 1
      else blank += 1
    })
    const n = sheets.length
    const distribution = Object.fromEntries(letters.map((letter) => [letter, n ? counts[letter] / n : 0]))
    const column = matrix.map((row) => row[index])
    const correctRate = n ? column.reduce((sum, value) => sum + value, 0) / n : 0
    const rest = totals.map((total, sheetIndex) => total - column[sheetIndex])
    const discrimination = cancelled ? null : correlation(column, rest)
    const share = (group) => group.size ? [...group].reduce((sum, sheetIndex) => sum + column[sheetIndex], 0) / group.size : 0
    const dIndex = cancelled || n < 4 ? null : share(top) - share(bottom)
    const distractor = cancelled ? null : letters.filter((letter) => letter !== key).sort((a, b) => counts[b] - counts[a])[0]
    const item = {
      index, number: index + 1, area: areas[index], key, cancelled, attempts: n, correctRate, blankRate: n ? blank / n : 0, multipleRate: n ? multiple / n : 0,
      distribution, discrimination, dIndex, topDistractor: distractor && counts[distractor] ? { letter: distractor, share: distribution[distractor] } : null,
      flag: flags[index]?.flag === 'key' ? 'key' : null, suggested: flags[index]?.suggested || null,
    }
    return { ...item, diagnosis: diagnose(item, small) }
  })

  const graded = matrix.map((row) => gradedIndexes.map((index) => row[index]))
  const scores = totals.map((total) => gradedIndexes.length ? total / gradedIndexes.length * 100 : 0)
  const areaAlpha = Object.fromEntries([...new Set(gradedIndexes.map((index) => areas[index]))].map((area) => {
    const columns = gradedIndexes.filter((index) => areas[index] === area)
    return [area, cronbachAlpha(matrix.map((row) => columns.map((index) => row[index])))]
  }))
  return {
    items, sheets: sheets.length, small, alpha: cronbachAlpha(graded), areaAlpha,
    review: items.filter((item) => item.diagnosis.tone === 'red' || item.diagnosis.label === 'Pouco discrimina'),
    meanScore: mean(scores),
  }
}

// Notas de cada aluno por área; funciona com várias versões porque cada folha usa as áreas da própria versão.
export function buildAreaReport({ assessment, submissions, students = [], classes = [] }) {
  const studentMap = new Map(students.map((student) => [student.id, student]))
  const classMap = new Map(classes.map((item) => [item.id, item]))
  const areaOrder = []
  const rows = submissions.filter((submission) => submission.assessmentId === assessment?.id && Array.isArray(submission.answers)).map((submission) => {
    const version = getAssessmentForSubmission(assessment, submission)
    const questionAreas = getQuestionAreas(version)
    const tally = new Map()
    let blank = 0; let counted = 0
    submission.answers.forEach((answer, index) => {
      const area = questionAreas[index]
      if (!area || answer?.status === 'cancelled') return
      if (!areaOrder.includes(area)) areaOrder.push(area)
      if (!tally.has(area)) tally.set(area, { correct: 0, total: 0 })
      tally.get(area).total += 1
      counted += 1
      if (answer?.status === 'correct') tally.get(area).correct += 1
      if (!answer?.status || answer.status === 'blank') blank += 1
    })
    const student = studentMap.get(submission.studentId)
    return {
      submissionId: submission.id, studentId: submission.studentId, name: student?.name || submission.studentName || 'Aluno sem cadastro', classId: submission.classId,
      className: classMap.get(submission.classId)?.name || '', score: calculateSubmissionMetrics(submission, assessment)?.score ?? Number(submission.score || 0),
      blankRate: counted ? blank / counted : 0, areas: Object.fromEntries([...tally].map(([area, value]) => [area, value.total ? value.correct / value.total * 100 : null])),
    }
  })
  const areas = areaOrder.map((area) => {
    const values = rows.map((row) => row.areas[area]).filter((value) => value !== null && value !== undefined)
    return { area, n: values.length, mean: mean(values), sd: deviation(values) }
  })
  const pairs = []
  areaOrder.forEach((first, index) => areaOrder.slice(index + 1).forEach((second) => {
    const both = rows.filter((row) => Number.isFinite(row.areas[first]) && Number.isFinite(row.areas[second]))
    pairs.push({ first, second, ...pearsonWithInference(both.map((row) => row.areas[first]), both.map((row) => row.areas[second])) })
  }))
  const classIds = [...new Set(rows.map((row) => row.classId))]
  const byClass = classIds.map((classId) => {
    const classRows = rows.filter((row) => row.classId === classId)
    return {
      classId, name: classMap.get(classId)?.name || 'Sem turma', n: classRows.length, mean: mean(classRows.map((row) => row.score)),
      areas: Object.fromEntries(areaOrder.map((area) => [area, mean(classRows.map((row) => row.areas[area]).filter(Number.isFinite))])),
    }
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true }))
  const scores = rows.map((row) => row.score)
  return { rows, areas, pairs, byClass, summary: { n: rows.length, mean: mean(scores), median: quantile(scores, 0.5), q1: quantile(scores, 0.25), q3: quantile(scores, 0.75), sd: deviation(scores) } }
}

export function pairFor(pairs, first, second) {
  return pairs.find((pair) => (pair.first === first && pair.second === second) || (pair.first === second && pair.second === first))
}

export function studentsNeedingAttention(areaReport) {
  return areaReport.rows.map((row) => {
    const weakest = Object.entries(row.areas).filter(([, value]) => Number.isFinite(value)).sort((a, b) => a[1] - b[1])[0]
    const reasons = []
    if (row.score < LOW_SCORE) reasons.push(`nota abaixo de ${LOW_SCORE}%`)
    if (row.blankRate >= HIGH_BLANK_RATE) reasons.push(`${pct(row.blankRate)} em branco`)
    return { ...row, weakest: weakest ? { area: weakest[0], score: weakest[1] } : null, reasons }
  }).filter((row) => row.reasons.length).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'pt-BR'))
}

// Frases curtas, em ordem de importância, a partir das análises acima.
export function buildTeacherInsights({ itemReport, areaReport, attention = studentsNeedingAttention(areaReport), versionLabel = '', similarity = null }) {
  const insights = []
  const { summary } = areaReport
  if (summary.n) insights.push({ tone: 'blue', title: 'Desempenho geral', text: `Média de ${Math.round(summary.mean)}% e mediana de ${Math.round(summary.median)}%. Metade dos alunos ficou entre ${Math.round(summary.q1)}% e ${Math.round(summary.q3)}%.` })

  const areas = areaReport.areas.filter((area) => area.n && area.mean !== null)
  if (areas.length > 1) {
    const sorted = [...areas].sort((a, b) => a.mean - b.mean)
    insights.push({ tone: sorted[0].mean < 50 ? 'ochre' : 'blue', title: 'Áreas', text: `A área mais fraca foi ${sorted[0].area} (${Math.round(sorted[0].mean)}%) e a mais forte, ${sorted.at(-1).area} (${Math.round(sorted.at(-1).mean)}%).` })
  }

  if (itemReport) {
    const reliability = reliabilityLabel(itemReport.alpha)
    if (itemReport.alpha !== null) insights.push({ tone: reliability.tone, title: 'Confiabilidade da prova', text: itemReport.alpha >= 0.7 ? `Alfa de Cronbach ${decimal(itemReport.alpha)} (${reliability.label.toLowerCase()}): as questões medem um desempenho consistente e a nota é um bom retrato do aluno.` : `Alfa de Cronbach ${decimal(itemReport.alpha)} (${reliability.label.toLowerCase()}): as questões medem coisas pouco relacionadas, então compare alunos com cautela. Revisar as questões marcadas ajuda.` })
    const active = itemReport.items.filter((item) => !item.cancelled)
    const suspect = active.filter((item) => item.flag === 'key')
    if (suspect.length) insights.push({ tone: 'red', title: 'Gabarito suspeito', text: `${suspect.map((item) => `Q${item.number} (melhores marcaram ${item.suggested}, gabarito ${item.key})`).join(', ')}. Confira antes de divulgar as notas.` })
    const hardest = active.filter((item) => item.flag !== 'key' && item.correctRate < 0.3).sort((a, b) => a.correctRate - b.correctRate).slice(0, 5)
    if (hardest.length) insights.push({ tone: 'ochre', title: 'Conteúdos para retomar', text: `${hardest.map((item) => `Q${item.number} · ${item.area} (${pct(item.correctRate)})`).join('; ')}.` })
    const misconceptions = active.filter((item) => item.flag !== 'key' && item.topDistractor && item.topDistractor.share >= 0.3 && item.topDistractor.share >= item.correctRate).sort((a, b) => b.topDistractor.share - a.topDistractor.share).slice(0, 4)
    if (misconceptions.length) insights.push({ tone: 'purple', title: 'Erros em comum', text: `${misconceptions.map((item) => `na Q${item.number}, ${pct(item.topDistractor.share)} marcaram ${item.topDistractor.letter} (gabarito ${item.key})`).join('; ')}. Indica um equívoco compartilhado que vale discutir na correção em sala.` })
    const inverse = active.filter((item) => item.flag !== 'key' && item.diagnosis.label === 'Discrimina ao contrário')
    if (inverse.length) insights.push({ tone: 'red', title: 'Questões com problema', text: `${inverse.map((item) => `Q${item.number}`).join(', ')}: os alunos que vão melhor na prova erram mais. Pode haver ambiguidade no enunciado ou duas alternativas defensáveis.` })
    if (itemReport.small) insights.push({ tone: 'neutral', title: 'Amostra pequena', text: `A análise de questões${versionLabel ? ` (${versionLabel})` : ''} usa ${itemReport.sheets} folhas. Com menos de ${MIN_RESPONSES}, discriminação e gabarito suspeito não são avaliados.` })
  }

  const significant = areaReport.pairs.filter((pair) => pair.r !== null && pair.n >= 10)
  if (significant.length) {
    const strongest = [...significant].sort((a, b) => b.r - a.r)[0]
    const weakest = [...significant].sort((a, b) => a.r - b.r)[0]
    insights.push({ tone: 'green', title: 'Relação entre áreas', text: `Quem vai bem em ${strongest.first} tende a ir bem em ${strongest.second} (correlação ${correlationStrength(strongest.r)}, r = ${decimal(strongest.r)}).${weakest !== strongest && weakest.r < 0.3 ? ` Já ${weakest.first} e ${weakest.second} quase não se relacionam (r = ${decimal(weakest.r)}): são dificuldades independentes.` : ''}` })
  }

  const classes = areaReport.byClass.filter((item) => item.n >= 3 && item.mean !== null)
  if (classes.length > 1) {
    const sorted = [...classes].sort((a, b) => b.mean - a.mean)
    let gap = null
    areas.forEach(({ area }) => {
      const values = classes.map((item) => [item.name, item.areas[area]]).filter(([, value]) => Number.isFinite(value)).sort((a, b) => b[1] - a[1])
      if (values.length > 1 && (!gap || values[0][1] - values.at(-1)[1] > gap.diff)) gap = { area, best: values[0], worst: values.at(-1), diff: values[0][1] - values.at(-1)[1] }
    })
    const close = sorted[0].mean - sorted.at(-1).mean < 3
    insights.push({ tone: 'blue', title: 'Turmas', text: `${close ? `As turmas tiveram médias parecidas (entre ${Math.round(sorted.at(-1).mean)}% e ${Math.round(sorted[0].mean)}%).` : `${sorted[0].name} teve a maior média (${Math.round(sorted[0].mean)}%) e ${sorted.at(-1).name} a menor (${Math.round(sorted.at(-1).mean)}%).`}${gap && gap.diff >= 10 ? ` A maior diferença está em ${gap.area}: ${Math.round(gap.best[1])}% em ${gap.best[0]} contra ${Math.round(gap.worst[1])}% em ${gap.worst[0]}.` : ''}` })
  }

  if (similarity?.flagged.length) {
    const top = similarity.flagged[0]
    insights.push({ tone: similarity.high ? 'red' : 'ochre', title: 'Respostas muito parecidas', text: `${similarity.flagged.length} par(es) de alunos com erros iguais demais para ser acaso${similarity.high ? ` (${similarity.high} em nível alto)` : ''}. O mais forte: ${top.first.name} e ${top.second.name}, ${top.sameWrong} erros iguais de ${top.bothWrong} em comum. Confira as folhas na aba Similaridade.` })
  }

  if (attention.length) {
    const blanks = attention.filter((row) => row.blankRate >= HIGH_BLANK_RATE).length
    insights.push({ tone: 'ochre', title: 'Alunos que precisam de atenção', text: `${attention.length} aluno(s) com nota abaixo de ${LOW_SCORE}% ou muitas questões em branco${blanks ? ` (${blanks} deixaram ${pct(HIGH_BLANK_RATE)} ou mais em branco, talvez por falta de tempo)` : ''}. A lista está abaixo.` })
  }
  return insights
}
