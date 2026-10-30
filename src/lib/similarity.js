// Similaridade entre folhas da mesma versão e da mesma turma. Acertos iguais dizem pouco
// (dois bons alunos acertam as mesmas questões); o sinal forte é errar do mesmo jeito
// (mesma alternativa errada, mesma marcação múltipla ou branco na mesma questão).
export const SIMILARITY_LEVELS = { high: { p: 0.001, sameWrong: 5 }, medium: { p: 0.01, sameWrong: 3 } }
export const HIGH_AGREEMENT = 80
export const IDENTICAL_MIN_ANSWERS = 10

export function answerSignature(answer) {
  return Array.isArray(answer?.selected) ? [...answer.selected].sort().join('+') : ''
}

// P(X >= k) para X ~ Poisson(lambda): chance de tantos erros iguais só por coincidência.
export function poissonTail(k, lambda) {
  if (k <= 0) return 1
  if (lambda <= 0) return 0
  let term = Math.exp(-lambda); let cumulative = term
  for (let index = 1; index < k; index += 1) { term *= lambda / index; cumulative += term }
  return Math.max(0, Math.min(1, 1 - cumulative))
}

// Respostas que não são acerto: alternativa errada, marcação múltipla ou branco.
const missed = (answer) => answer && !['correct', 'cancelled'].includes(answer.status)

// Para cada questão, a chance de dois alunos que não acertaram darem a mesma resposta
// (mesma alternativa errada, mesma marcação múltipla ou os dois em branco).
export function wrongMatchChances(submissions, questionCount) {
  return Array.from({ length: questionCount }, (_, index) => {
    const counts = new Map(); let total = 0
    submissions.forEach((submission) => {
      const answer = submission.answers?.[index]
      if (!missed(answer)) return
      const signature = answerSignature(answer)
      counts.set(signature, (counts.get(signature) || 0) + 1); total += 1
    })
    if (total < 2) return 0.25
    // Sem reposição, para não contar o próprio aluno; piso evita chance zero com poucos erros.
    const chance = [...counts.values()].reduce((sum, count) => sum + count * (count - 1), 0) / (total * (total - 1))
    return Math.max(0.05, chance)
  })
}

const decimal = (value) => value.toFixed(1).replace('.', ',')

// Explica em uma frase por que o par recebeu esse nível.
function similarityReason(pair) {
  if (pair.identical && pair.level !== 'low' && pair.p >= SIMILARITY_LEVELS.medium.p) return `Folhas idênticas, inclusive em ${pair.sameWrong} erro(s) ou branco(s). Esses erros são comuns na turma, então confira a folha original.`
  if (pair.level !== 'low') return `${pair.sameWrong} erro(s) iguais; por acaso seriam cerca de ${decimal(pair.expectedWrong)}.`
  if (pair.sameWrong < SIMILARITY_LEVELS.medium.sameWrong) return pair.agreement >= HIGH_AGREEMENT ? `Iguais porque acertaram quase as mesmas questões: só ${pair.sameWrong} erro(s) em comum, pouco para indicar cópia.` : 'Poucos erros iguais.'
  return `Os erros iguais são os mais comuns da turma: por acaso seriam cerca de ${decimal(pair.expectedWrong)}.`
}

export function compareSubmissions(first, second, { questionCount, answerKey = [], chances = [] }) {
  let sameAnswers = 0; let comparable = 0; let sameWrong = 0; let bothWrong = 0; let sameCorrect = 0; let sameBlank = 0; let expectedWrong = 0
  let run = 0; let longestRun = 0
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const a = first.answers?.[index]; const b = second.answers?.[index]
    const firstSignature = answerSignature(a); const secondSignature = answerSignature(b)
    const same = firstSignature === secondSignature
    let kind = 'different'
    if (!firstSignature && !secondSignature) { kind = 'blank'; sameBlank += 1 } else {
      comparable += 1
      if (same) { sameAnswers += 1; kind = a?.status === 'correct' ? 'correct' : 'wrong' }
      if (a?.status === 'correct' && same) sameCorrect += 1
    }
    if (missed(a) && missed(b)) {
      bothWrong += 1; expectedWrong += chances[index] ?? 0.25
      if (same) sameWrong += 1
    }
    // Sequência de respostas marcadas idênticas (brancos interrompem).
    run = same && firstSignature ? run + 1 : 0
    longestRun = Math.max(longestRun, run)
    return { number: index + 1, key: answerKey[index] || '', first: firstSignature || '—', second: secondSignature || '—', kind }
  })
  const p = poissonTail(sameWrong, expectedWrong)
  const agreement = comparable ? sameAnswers / comparable * 100 : 0
  // Folhas inteiras iguais com erros em comum sempre pedem conferência, mesmo que os erros sejam os mais comuns.
  const identical = agreement === 100 && comparable >= IDENTICAL_MIN_ANSWERS
  const byChance = sameWrong >= SIMILARITY_LEVELS.high.sameWrong && p < SIMILARITY_LEVELS.high.p ? 'high' : sameWrong >= SIMILARITY_LEVELS.medium.sameWrong && p < SIMILARITY_LEVELS.medium.p ? 'medium' : 'low'
  const level = byChance === 'low' && identical && sameWrong >= SIMILARITY_LEVELS.medium.sameWrong ? 'medium' : byChance
  const pair = { questions, comparable, sameAnswers, agreement, sameWrong, bothWrong, sameCorrect, sameBlank, expectedWrong, p, longestRun, level, identical }
  return { ...pair, reason: similarityReason(pair) }
}

// Pares na mesma turma, para todas as folhas de uma mesma versão.
export function buildSimilarityReport({ submissions, students = [], classes = [], questionCount, answerKey = [] }) {
  const studentMap = new Map(students.map((student) => [student.id, student]))
  const classMap = new Map(classes.map((item) => [item.id, item]))
  const sheets = submissions.filter((submission) => Array.isArray(submission.answers))
  const chances = wrongMatchChances(sheets, questionCount)
  const people = sheets.map((submission) => ({ submission, id: submission.studentId, name: studentMap.get(submission.studentId)?.name || submission.studentName || 'Aluno sem cadastro', classId: submission.classId, className: classMap.get(submission.classId)?.name || 'Sem turma' }))
  const pairs = []
  people.forEach((first, index) => people.slice(index + 1).forEach((second) => {
    if (first.classId !== second.classId) return
    pairs.push({ first, second, ...compareSubmissions(first.submission, second.submission, { questionCount, answerKey, chances }) })
  }))
  const rank = { high: 0, medium: 1, low: 2 }
  pairs.sort((a, b) => rank[a.level] - rank[b.level] || a.p - b.p || b.sameWrong - a.sameWrong || b.agreement - a.agreement)
  const flagged = pairs.filter((pair) => pair.level !== 'low')
  return { people, pairs, flagged, groups: similarityGroups(flagged), chances, high: pairs.filter((pair) => pair.level === 'high').length }
}

// Alunos ligados por pares em alerta formam um grupo (ex.: três alunos sentados juntos).
export function similarityGroups(pairs) {
  const parent = new Map()
  const find = (id) => { while (parent.get(id) !== id) id = parent.get(id); return id }
  const people = new Map()
  pairs.forEach(({ first, second }) => {
    [first, second].forEach((person) => { if (!parent.has(person.id)) { parent.set(person.id, person.id); people.set(person.id, person) } })
    parent.set(find(first.id), find(second.id))
  })
  const groups = new Map()
  people.forEach((person, id) => { const root = find(id); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(person) })
  return [...groups.values()].filter((group) => group.length > 2).map((group) => ({ students: group.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), className: group[0].className }))
}
