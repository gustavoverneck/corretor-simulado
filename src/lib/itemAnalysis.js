import { CANCELLED_ANSWER, getAssessmentForSubmission } from './assessment.js'

// Análise de itens para detectar gabaritos suspeitos: compara a escolha de cada
// alternativa com o desempenho do aluno nas demais questões (correlação ponto-bisserial)
// e com o que marcou o grupo de melhor desempenho.
export const MIN_RESPONSES = 15
const GROUP_SHARE = 0.27

function singleSelection(answer) {
  const selected = Array.isArray(answer?.selected) ? answer.selected : []
  return answer?.status !== 'uncertain' && selected.length === 1 ? selected[0] : null
}

function correlation(values, scores) {
  const n = values.length
  if (n < 2) return 0
  const meanX = values.reduce((sum, value) => sum + value, 0) / n
  const meanY = scores.reduce((sum, value) => sum + value, 0) / n
  let covariance = 0
  let varianceX = 0
  let varianceY = 0
  for (let index = 0; index < n; index += 1) {
    const dx = values[index] - meanX
    const dy = scores[index] - meanY
    covariance += dx * dy
    varianceX += dx * dx
    varianceY += dy * dy
  }
  return varianceX && varianceY ? covariance / Math.sqrt(varianceX * varianceY) : 0
}

function gradable(expected) {
  return typeof expected === 'string' && expected !== CANCELLED_ANSWER
}

export function submissionAnswerKey(assessment, submission) {
  return Array.isArray(submission?.answerKeySnapshot) ? submission.answerKeySnapshot : getAssessmentForSubmission(assessment, submission)?.answerKey || []
}

// Submissões corrigidas com exatamente este gabarito (mesma versão e ordem das questões).
export function submissionsForAnswerKey(assessment, submissions, answerKey) {
  const signature = JSON.stringify(answerKey)
  return submissions.filter((submission) => submission.assessmentId === assessment?.id
    && Array.isArray(submission.answers)
    && JSON.stringify(submissionAnswerKey(assessment, submission)) === signature)
}

export function analyzeItems({ answerKey = [], submissions = [], optionCount = 5 }) {
  const letters = Array.from({ length: optionCount }, (_, index) => String.fromCharCode(65 + index))
  const sheets = submissions.filter((submission) => Array.isArray(submission.answers))
  const choices = sheets.map((submission) => answerKey.map((_, index) => singleSelection(submission.answers[index])))
  const correctMatrix = choices.map((row) => row.map((letter, index) => gradable(answerKey[index]) && letter === answerKey[index] ? 1 : 0))
  const totals = correctMatrix.map((row) => row.reduce((sum, value) => sum + value, 0))

  return answerKey.map((key, index) => {
    const item = { index, number: index + 1, key, responses: 0, distribution: Object.fromEntries(letters.map((letter) => [letter, 0])), blank: 0, multiple: 0, correlations: {}, topShares: {}, difficulty: null, flag: null, suggested: null }
    sheets.forEach((submission, sheetIndex) => {
      const letter = choices[sheetIndex][index]
      if (letter && letter in item.distribution) { item.distribution[letter] += 1; item.responses += 1 }
      else if ((submission.answers[index]?.selected || []).length > 1) item.multiple += 1
      else item.blank += 1
    })
    if (!gradable(key)) return { ...item, flag: 'skipped' }

    // Considera apenas quem marcou uma única alternativa; a nota exclui a própria questão.
    const respondents = choices.map((row, sheetIndex) => ({ letter: row[index], rest: totals[sheetIndex] - correctMatrix[sheetIndex][index] })).filter((row) => row.letter && row.letter in item.distribution)
    item.difficulty = item.responses ? item.distribution[key] / item.responses : null
    if (respondents.length < MIN_RESPONSES) return { ...item, flag: 'insufficient' }

    const rest = respondents.map((row) => row.rest)
    letters.forEach((letter) => { item.correlations[letter] = correlation(respondents.map((row) => row.letter === letter ? 1 : 0), rest) })
    const groupSize = Math.max(3, Math.round(respondents.length * GROUP_SHARE))
    const top = [...respondents].sort((a, b) => b.rest - a.rest).slice(0, groupSize)
    letters.forEach((letter) => { item.topShares[letter] = top.filter((row) => row.letter === letter).length / top.length })

    const rival = letters.filter((letter) => letter !== key).sort((a, b) => item.topShares[b] - item.topShares[a] || item.correlations[b] - item.correlations[a])[0]
    const keyCorrelation = item.correlations[key]
    const rivalShare = rival ? item.distribution[rival] / item.responses : 0
    // Dois sinais: quem vai bem no restante da prova prefere outra alternativa, ou a turma
    // inteira (incluindo os melhores) converge para outra alternativa e quase ninguém marca o gabarito.
    const discriminatesRival = item.correlations[rival] >= 0.2 && item.correlations[rival] - keyCorrelation >= 0.3
    const consensusOnRival = rivalShare >= 0.5 && item.topShares[rival] >= Math.max(0.5, 2 * item.topShares[key]) && item.difficulty <= 0.2
    if (rival && item.topShares[rival] > item.topShares[key] && (discriminatesRival || consensusOnRival)) {
      item.flag = 'key'
      item.suggested = rival
    } else if (keyCorrelation < -0.1) {
      item.flag = 'weak'
    }
    return item
  })
}

export function suspiciousItems(items) {
  return items.filter((item) => item.flag === 'key' || item.flag === 'weak')
    .sort((a, b) => (a.flag === 'key' ? 0 : 1) - (b.flag === 'key' ? 0 : 1) || a.number - b.number)
}

// Quantidade de questões com possível gabarito errado, somando todas as versões do simulado.
export function countAnswerKeyAlerts(assessment, submissions) {
  const groups = new Map()
  submissions.forEach((submission) => {
    if (submission.assessmentId !== assessment?.id || !Array.isArray(submission.answers)) return
    const answerKey = submissionAnswerKey(assessment, submission)
    const signature = JSON.stringify(answerKey)
    if (!groups.has(signature)) groups.set(signature, { answerKey, submissions: [] })
    groups.get(signature).submissions.push(submission)
  })
  return [...groups.values()].reduce((total, group) => total + (group.submissions.length < MIN_RESPONSES ? 0
    : analyzeItems({ ...group, optionCount: assessment.optionCount }).filter((item) => item.flag === 'key').length), 0)
}
