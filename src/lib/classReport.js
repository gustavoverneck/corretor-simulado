// Relatório da turma: distribuição das notas em cada simulado e no geral,
// dificuldades por área, habilidade e questão, comparação com as demais
// turmas que fizeram os mesmos simulados e conclusões em linguagem simples.
// Provas anuladas ficam fora de todas as contas (só aparecem na contagem).
import { getAssessmentForSubmission } from './assessment.js'
import { getAbsentStudentIds } from './attendance.js'
import { getQuestionAreas } from './knowledgeAreas.js'
import { calculateAreaResults, calculateQuestionResults, calculateSubmissionMetrics } from './resultsMetrics.js'
import { enemTriForSubmission } from './enemItems.js'
import { ENEM_AREA_SHORT } from './enemTri.js'
import enemSkills from '../data/enemSkills.js'

export const BANDS = [
  { id: 'low', name: 'Insuficiente', label: '0–39%', min: 0, max: 40, color: '#b9675f' },
  { id: 'basic', name: 'Básico', label: '40–59%', min: 40, max: 60, color: '#c69558' },
  { id: 'adequate', name: 'Adequado', label: '60–79%', min: 60, max: 80, color: '#7b9b72' },
  { id: 'advanced', name: 'Avançado', label: '80–100%', min: 80, max: 101, color: '#3f7968' },
]
export const HISTOGRAM_BINS = Array.from({ length: 10 }, (_, index) => ({ min: index * 10, max: index === 9 ? 101 : index * 10 + 10, label: index === 9 ? '90–100' : `${index * 10}–${index * 10 + 9}` }))

// Diferenças menores que isso são tratadas como "na mesma faixa".
export const MEANINGFUL_GAP = 5
export const HARD_QUESTION = 30
export const MIN_SKILL_QUESTIONS = 2

const round = (value) => value === null || value === undefined ? null : Math.round(value)
const sum = (values) => values.reduce((total, value) => total + value, 0)
const mean = (values) => values.length ? sum(values) / values.length : null
function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function deviation(values) {
  if (values.length < 2) return 0
  const average = mean(values)
  return Math.sqrt(sum(values.map((value) => (value - average) ** 2)) / (values.length - 1))
}
const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`
const assessmentName = (assessment) => assessment.code || assessment.title
const listNames = (items) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`

function byDate(first, second) {
  return String(first.date || first.createdAt || '').localeCompare(String(second.date || second.createdAt || '')) || String(first.title).localeCompare(String(second.title), 'pt-BR')
}

export function bandOf(score) {
  return BANDS.find((band) => score >= band.min && score < band.max) || BANDS[0]
}

export function describeScores(values) {
  const counts = BANDS.map((band) => ({ ...band, count: values.filter((value) => value >= band.min && value < band.max).length }))
  const histogram = HISTOGRAM_BINS.map((bin) => ({ ...bin, count: values.filter((value) => value >= bin.min && value < bin.max).length }))
  return {
    n: values.length,
    mean: round(mean(values)),
    median: round(median(values)),
    sd: values.length > 1 ? Math.round(deviation(values)) : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    bands: counts.map((band) => ({ ...band, share: values.length ? band.count / values.length : 0 })),
    histogram,
  }
}

// Habilidade de uma questão: a cadastrada no simulado ou, nos simulados do
// ENEM com parâmetros oficiais, a habilidade da Matriz de Referência do item.
export function questionSkill(assessment, submission, index) {
  const manual = assessment.questionSkills?.[index]
  if (manual !== undefined && manual !== null && String(manual).trim()) {
    const area = getQuestionAreas(getAssessmentForSubmission(assessment, submission))[index]
    return { key: `manual:${area}:${String(manual).trim()}`, label: String(manual).trim(), area, source: 'manual' }
  }
  const item = enemTriForSubmission(assessment, submission)?.items?.[index]
  const skill = item?.skill || (item?.item ? enemSkills[item.item] : null)
  if (!skill) return null
  return { key: `enem:${item.area}:${skill}`, label: `H${skill}`, area: ENEM_AREA_SHORT[item.area] || item.area, source: 'enem', item: item.item || null }
}

function skillResults(assessments, submissions) {
  const results = new Map()
  assessments.forEach((assessment) => {
    submissions.filter((submission) => submission.assessmentId === assessment.id && Array.isArray(submission.answers)).forEach((submission) => {
      submission.answers.forEach((answer, index) => {
        if (!answer || answer.status === 'cancelled') return
        const skill = questionSkill(assessment, submission, index)
        if (!skill) return
        if (!results.has(skill.key)) results.set(skill.key, { ...skill, questions: new Set(), attempts: 0, correct: 0, blank: 0 })
        const entry = results.get(skill.key)
        entry.questions.add(skill.item || `${assessment.id}:${index}:${JSON.stringify(submission.answerKeySnapshot || '')}`)
        entry.attempts += 1
        if (answer.status === 'correct') entry.correct += 1
        if (answer.status === 'blank') entry.blank += 1
      })
    })
  })
  return results
}

// Brancos no último quarto da prova bem acima do resto sugerem falta de tempo.
function blankPattern(sheets) {
  let endBlank = 0; let endTotal = 0; let restBlank = 0; let restTotal = 0
  sheets.forEach(({ submission }) => {
    const answers = Array.isArray(submission.answers) ? submission.answers : []
    const cut = Math.floor(answers.length * 0.75)
    answers.forEach((answer, index) => {
      if (!answer || answer.status === 'cancelled') return
      if (index >= cut) { endTotal += 1; if (answer.status === 'blank') endBlank += 1 } else { restTotal += 1; if (answer.status === 'blank') restBlank += 1 }
    })
  })
  const total = endTotal + restTotal
  return {
    rate: total ? (endBlank + restBlank) / total : 0,
    endRate: endTotal ? endBlank / endTotal : 0,
    restRate: restTotal ? restBlank / restTotal : 0,
  }
}

export function classSubmissionFilter(classId, students) {
  const classOf = new Map(students.map((student) => [student.id, student.classId]))
  return (submission) => (classOf.get(submission.studentId) || submission.classId) === classId
}

export function buildClassReport({ classId, data, assessmentId = 'all', triScores = new Map() }) {
  const classroom = data.classes.find((item) => item.id === classId) || null
  const members = data.students.filter((student) => student.classId === classId && student.status === 'Ativo')
  const studentsById = new Map(data.students.map((student) => [student.id, student]))
  const inClass = classSubmissionFilter(classId, data.students)
  const counted = data.submissions.filter((submission) => !submission.voided)

  const allAssessments = data.assessments
    .filter((assessment) => assessment.classIds?.includes(classId) || data.submissions.some((submission) => submission.assessmentId === assessment.id && inClass(submission)))
    .sort(byDate)

  const entries = allAssessments.map((assessment) => {
    const own = counted.filter((submission) => submission.assessmentId === assessment.id && inClass(submission))
    const others = counted.filter((submission) => submission.assessmentId === assessment.id && !inClass(submission))
    const sheets = own.map((submission) => ({ submission, student: studentsById.get(submission.studentId) || null, score: calculateSubmissionMetrics(submission, assessment)?.score })).filter((sheet) => sheet.score !== undefined)
    const otherScores = others.map((submission) => calculateSubmissionMetrics(submission, assessment)?.score).filter((score) => score !== undefined)
    const memberIds = new Set(members.map((student) => student.id))
    const submitted = new Set(data.submissions.filter((submission) => submission.assessmentId === assessment.id && inClass(submission)).map((submission) => submission.studentId))
    const absent = getAbsentStudentIds(assessment).filter((id) => memberIds.has(id) && !submitted.has(id)).length
    const voided = new Set(data.submissions.filter((submission) => submission.assessmentId === assessment.id && submission.voided && inClass(submission)).map((submission) => submission.studentId)).size
    const triValues = sheets.map((sheet) => triScores.get(assessment.id)?.scores.get(sheet.submission.id)?.score).filter((value) => Number.isFinite(value))
    const otherClasses = new Set(others.map((submission) => studentsById.get(submission.studentId)?.classId || submission.classId))
    return {
      assessment,
      sheets,
      own,
      others,
      stats: describeScores(sheets.map((sheet) => sheet.score)),
      othersMean: round(mean(otherScores)),
      othersSheets: otherScores.length,
      otherClassCount: otherClasses.size,
      absent,
      voided,
      pending: [...memberIds].filter((id) => !submitted.has(id) && !getAbsentStudentIds(assessment).includes(id)).length,
      tri: triValues.length ? Math.round(mean(triValues) * 10) / 10 : null,
    }
  })
  const done = entries.filter((entry) => entry.sheets.length)

  const scoped = assessmentId === 'all' ? done : done.filter((entry) => entry.assessment.id === assessmentId)
  const scopedAssessments = scoped.map((entry) => entry.assessment)
  const scopedOwn = scoped.flatMap((entry) => entry.own)
  const scopedOthers = scoped.flatMap((entry) => entry.others)

  // Uma nota por aluno: no geral, a média dos simulados que ele fez.
  const perStudent = new Map()
  scoped.forEach((entry) => entry.sheets.forEach((sheet) => {
    const key = sheet.submission.studentId
    if (!perStudent.has(key)) perStudent.set(key, { student: sheet.student, scores: [], entries: [] })
    perStudent.get(key).scores.push(sheet.score)
    perStudent.get(key).entries.push({ assessment: entry.assessment, score: sheet.score, submission: sheet.submission })
  }))
  const students = [...perStudent.values()]
    .map((item) => ({ ...item, average: round(mean(item.scores)) }))
    .sort((a, b) => b.average - a.average || String(a.student?.name).localeCompare(String(b.student?.name), 'pt-BR'))
  const distribution = describeScores(students.map((item) => item.average))
  const othersMean = round(mean(scoped.flatMap((entry) => entry.others.map((submission) => calculateSubmissionMetrics(submission, entry.assessment)?.score).filter((score) => score !== undefined))))

  const ownAreas = calculateAreaResults(scopedAssessments, scopedOwn).filter((item) => item.attempts)
  const otherAreas = new Map(calculateAreaResults(scopedAssessments, scopedOthers).filter((item) => item.attempts).map((item) => [item.area, item]))
  const areas = ownAreas.map((item) => ({ ...item, blankRate: item.attempts ? item.blank / item.attempts : 0, others: otherAreas.get(item.area)?.score ?? null }))
    .map((item) => ({ ...item, gap: item.others === null ? null : item.score - item.others }))
    .sort((a, b) => a.score - b.score)

  const ownSkills = skillResults(scopedAssessments, scopedOwn)
  const otherSkills = skillResults(scopedAssessments, scopedOthers)
  const skills = [...ownSkills.values()].map((item) => {
    const other = otherSkills.get(item.key)
    const score = item.attempts ? Math.round(item.correct / item.attempts * 100) : 0
    const others = other?.attempts ? Math.round(other.correct / other.attempts * 100) : null
    return { key: item.key, label: item.label, area: item.area, source: item.source, questions: item.questions.size, attempts: item.attempts, correct: item.correct, score, others, gap: others === null ? null : score - others }
  }).sort((a, b) => a.score - b.score || b.questions - a.questions)

  const otherQuestions = new Map(calculateQuestionResults(scopedAssessments, scopedOthers).map((item) => [item.id, item]))
  const questions = calculateQuestionResults(scopedAssessments, scopedOwn)
    .filter((item) => item.attempts)
    .map((item) => {
      const other = otherQuestions.get(item.id)
      return { ...item, blankRate: item.attempts ? item.blank / item.attempts : 0, others: other?.attempts ? other.score : null }
    })
    .sort((a, b) => a.score - b.score || a.number - b.number)

  const blanks = blankPattern(scoped.flatMap((entry) => entry.sheets))
  const report = {
    classroom,
    members,
    entries,
    done,
    scoped,
    assessmentId,
    students,
    distribution,
    othersMean,
    areas,
    skills,
    questions,
    blanks,
    voided: scoped.reduce((total, entry) => total + entry.voided, 0),
  }
  report.conclusions = buildConclusions(report)
  return report
}

function compareText(value, others, subject = 'a turma') {
  if (value === null || others === null || others === undefined) return ''
  const gap = value - others
  if (Math.abs(gap) < MEANINGFUL_GAP) return `${subject} ficou na mesma faixa das demais turmas (${others}%)`
  return `${subject} ficou ${Math.abs(gap)} pontos ${gap > 0 ? 'acima' : 'abaixo'} das demais turmas (${others}%)`
}

// Frases curtas, em ordem de importância, para o professor ler sem gráficos.
export function buildConclusions(report) {
  const items = []
  const { distribution, scoped, areas, skills, questions, students, blanks } = report
  if (!distribution.n) return items
  const single = scoped.length === 1
  const scopeText = single ? `no ${assessmentName(scoped[0].assessment)}` : `em ${plural(scoped.length, 'simulado')}`

  // 1. Nível geral e comparação com as demais turmas.
  const comparison = compareText(distribution.mean, report.othersMean, 'a turma')
  items.push({
    id: 'level',
    tone: distribution.mean < 40 ? 'red' : distribution.mean < 60 ? 'ochre' : 'green',
    title: `Média de ${distribution.mean}% ${scopeText}`,
    text: `Os ${plural(distribution.n, 'aluno')} com prova corrigida acertaram em média ${distribution.mean}% das questões (metade ficou acima de ${distribution.median}%).${comparison ? ` Nos mesmos simulados, ${comparison}.` : ''}`,
  })

  // 2. Forma da distribuição.
  const share = Object.fromEntries(distribution.bands.map((band) => [band.id, band.share]))
  const count = Object.fromEntries(distribution.bands.map((band) => [band.id, band.count]))
  const pct = (value) => `${Math.round(value * 100)}%`
  if (distribution.n >= 4) {
    const top = share.adequate + share.advanced
    if (share.low >= 0.5) items.push({ id: 'majority-low', tone: 'red', title: 'A maior parte da turma está abaixo de 40%', text: `${count.low} de ${distribution.n} alunos (${pct(share.low)}) acertaram menos de 40%. A dificuldade é coletiva: vale retomar os conteúdos com a turma toda antes de avançar.` })
    else if (share.low + share.basic >= 0.6) items.push({ id: 'majority-basic', tone: 'ochre', title: 'A maioria ainda não chegou a 60%', text: `${count.low + count.basic} de ${distribution.n} alunos (${pct(share.low + share.basic)}) ficaram abaixo de 60%. A turma tem a base, mas precisa de mais prática para consolidar.` })
    else if (top >= 0.6) items.push({ id: 'majority-high', tone: 'green', title: 'A maioria está no nível adequado ou avançado', text: `${count.adequate + count.advanced} de ${distribution.n} alunos (${pct(top)}) acertaram 60% ou mais.${count.low ? ` Ainda assim, ${plural(count.low, 'aluno')} ${count.low === 1 ? 'ficou' : 'ficaram'} abaixo de 40% e ${count.low === 1 ? 'precisa' : 'precisam'} de apoio individual.` : ''}` })

    if (share.low >= 0.25 && top >= 0.25 && share.basic <= 0.25) items.push({ id: 'split', tone: 'ochre', title: 'Turma dividida em dois grupos', text: `Há um grupo que vai bem (${plural(count.adequate + count.advanced, 'aluno')} com 60% ou mais) e outro com muita dificuldade (${plural(count.low, 'aluno')} abaixo de 40%), com poucos no meio. Uma aula única tende a ficar fácil para uns e difícil para outros: considere atividades em grupos por nível.` })
    else if (distribution.sd !== null && distribution.sd >= 20) items.push({ id: 'spread', tone: 'ochre', title: 'Resultados muito diferentes entre os alunos', text: `As notas vão de ${distribution.min}% a ${distribution.max}% (desvio padrão de ${distribution.sd} pontos). A turma é heterogênea: atividades diferenciadas ou monitoria entre colegas ajudam.` })
    else if (distribution.sd !== null && distribution.sd <= 10) items.push({ id: 'compact', tone: 'neutral', title: 'Resultados parecidos entre os alunos', text: `A maioria ficou perto da média (desvio padrão de ${distribution.sd} pontos, de ${distribution.min}% a ${distribution.max}%). A turma avança junta, então ações para o grupo todo têm bom efeito.` })

    if (distribution.mean - distribution.median >= MEANINGFUL_GAP) items.push({ id: 'skew-up', tone: 'neutral', title: 'Poucos alunos puxam a média para cima', text: `A média (${distribution.mean}%) está acima da mediana (${distribution.median}%): alguns alunos com notas altas escondem que a maior parte da turma está abaixo da média.` })
    else if (distribution.median - distribution.mean >= MEANINGFUL_GAP) items.push({ id: 'skew-down', tone: 'neutral', title: 'Poucos alunos puxam a média para baixo', text: `A mediana (${distribution.median}%) está acima da média (${distribution.mean}%): a maior parte da turma foi melhor do que a média sugere, e um grupo pequeno com notas muito baixas pesa no resultado.` })
  }

  // 3. Áreas: a mais fraca, se o problema é da turma ou da prova, e a mais forte.
  if (areas.length >= 2) {
    const weakest = areas[0]
    const strongest = areas.at(-1)
    let context = ''
    if (weakest.others !== null) {
      context = weakest.others - weakest.score >= MEANINGFUL_GAP
        ? ` As demais turmas acertaram ${weakest.others}% nessa área, então a dificuldade é mais desta turma do que da prova.`
        : weakest.others < 45 ? ` As demais turmas também foram mal (${weakest.others}%): pode ser a prova ou um conteúdo pouco trabalhado na série, não só esta turma.` : ` As demais turmas ficaram em ${weakest.others}%.`
    }
    items.push({ id: 'weak-area', tone: weakest.score < 40 ? 'red' : 'ochre', title: `Maior dificuldade: ${weakest.area} (${weakest.score}%)`, text: `É a área com menor aproveitamento da turma${strongest.score - weakest.score >= MEANINGFUL_GAP ? `, ${strongest.score - weakest.score} pontos abaixo de ${strongest.area}` : ''}.${context}` })
    if (strongest.score - weakest.score >= MEANINGFUL_GAP) {
      const solid = strongest.score >= 60 && (strongest.gap === null || strongest.gap > -MEANINGFUL_GAP)
      items.push({ id: 'strong-area', tone: solid ? 'green' : 'neutral', title: solid ? `Ponto forte: ${strongest.area} (${strongest.score}%)` : `Melhor resultado: ${strongest.area} (${strongest.score}%)`, text: `É a área em que a turma mais acerta${strongest.others !== null ? `; ${compareText(strongest.score, strongest.others, 'nela a turma')}` : ''}.${solid ? '' : ' Mesmo assim, ainda não é um ponto forte.'}` })
    }
    const behind = areas.filter((area) => area !== weakest && area !== strongest && area.gap !== null && area.gap <= -10)
    if (behind.length) items.push({ id: 'behind-areas', tone: 'ochre', title: 'Abaixo das demais turmas', text: `${listNames(behind.map((area) => `${area.area} (${area.score}% contra ${area.others}%)`))}. Nessas áreas a turma está pelo menos 10 pontos atrás das outras que fizeram a mesma prova.` })
  }

  // 4. Habilidades com mais erros (só as que têm questões suficientes).
  const reliableSkills = skills.filter((skill) => skill.questions >= MIN_SKILL_QUESTIONS && skill.score < 50)
  if (reliableSkills.length) {
    const worst = reliableSkills.slice(0, 3)
    items.push({ id: 'skills', tone: 'ochre', title: 'Habilidades a retomar', text: `${listNames(worst.map((skill) => `${skill.label}${skill.source === 'enem' ? ` de ${skill.area}` : ''} (${skill.score}% em ${plural(skill.questions, 'questão', 'questões')})`))}. Veja a lista completa na aba Dificuldades.` })
  }

  // 5. Questões em que quase ninguém acertou.
  const hard = questions.filter((question) => question.score < HARD_QUESTION && question.attempts >= 3)
  if (hard.length) {
    const easyElsewhere = hard.filter((question) => question.others !== null && question.others - question.score >= 20)
    items.push({ id: 'hard-questions', tone: 'neutral', title: `${plural(hard.length, 'questão', 'questões')} com menos de ${HARD_QUESTION}% de acerto`, text: `${listNames(hard.slice(0, 4).map((question) => `Q${question.number}${single ? '' : ` do ${question.assessmentCode || question.assessmentTitle}`} (${question.score}%)`))}${hard.length > 4 ? ' e outras' : ''}. ${easyElsewhere.length ? `Em ${easyElsewhere.length === 1 ? 'uma delas' : `${easyElsewhere.length} delas`} as demais turmas foram bem melhor, então vale corrigir em sala.` : 'Confira se o gabarito está certo e se o conteúdo já foi dado.'}` })
  }

  // 6. Brancos no fim da prova: sinal de falta de tempo.
  if (blanks.endRate >= 0.15 && blanks.endRate >= blanks.restRate * 2) items.push({ id: 'time', tone: 'ochre', title: 'Muitas questões em branco no final da prova', text: `${pct(blanks.endRate)} das respostas do último quarto da prova ficaram em branco, contra ${pct(blanks.restRate)} no restante. Pode ser falta de tempo: vale treinar gestão do tempo de prova.` })
  else if (blanks.rate >= 0.1) items.push({ id: 'blanks', tone: 'neutral', title: 'Muitas questões em branco', text: `${pct(blanks.rate)} das respostas ficaram em branco. Incentive a turma a marcar todas: no ENEM e nos vestibulares, branco não pontua.` })

  // 7. Evolução da turma ao longo dos simulados, relativa às demais turmas.
  if (!single && scoped.length >= 2) {
    const last = scoped.at(-1)
    const previous = scoped.at(-2)
    const change = last.stats.mean - previous.stats.mean
    const lastGap = last.othersMean === null ? null : last.stats.mean - last.othersMean
    const previousGap = previous.othersMean === null ? null : previous.stats.mean - previous.othersMean
    if (lastGap !== null && previousGap !== null && Math.abs(lastGap - previousGap) >= MEANINGFUL_GAP) {
      items.push({ id: 'trend', tone: lastGap > previousGap ? 'green' : 'red', title: lastGap > previousGap ? 'A turma melhorou em relação às outras' : 'A turma perdeu terreno em relação às outras', text: `No ${assessmentName(previous.assessment)} a turma estava ${Math.abs(previousGap)} pontos ${previousGap >= 0 ? 'acima' : 'abaixo'} das demais; no ${assessmentName(last.assessment)}, ${Math.abs(lastGap)} pontos ${lastGap >= 0 ? 'acima' : 'abaixo'}. Comparar com as outras turmas desconta a diferença de dificuldade entre as provas.` })
    } else if (Math.abs(change) >= MEANINGFUL_GAP) {
      items.push({ id: 'trend', tone: change > 0 ? 'green' : 'ochre', title: change > 0 ? `Média subiu ${change} pontos` : `Média caiu ${-change} pontos`, text: `Do ${assessmentName(previous.assessment)} (${previous.stats.mean}%) para o ${assessmentName(last.assessment)} (${last.stats.mean}%). Lembre que provas diferentes têm dificuldades diferentes.` })
    }
  }

  // 8. Alunos que precisam de atenção.
  const low = students.filter((item) => item.average < 40)
  if (low.length && low.length < distribution.n * 0.5) items.push({ id: 'students', tone: 'red', title: `${plural(low.length, 'aluno')} abaixo de 40%`, text: `${listNames(low.slice(0, 6).map((item) => item.student?.name?.split(' ').slice(0, 2).join(' ') || 'Aluno removido'))}${low.length > 6 ? ` e mais ${low.length - 6}` : ''}. Na aba Alunos dá para abrir o relatório de cada um e ver em que áreas mais erra.` })

  // 9. Participação.
  const missing = scoped.reduce((total, entry) => total + entry.absent + entry.pending, 0)
  if (missing) items.push({ id: 'participation', tone: 'neutral', title: 'Provas faltando', text: `${plural(missing, 'prova')} de alunos ativos não ${missing === 1 ? 'entrou' : 'entraram'} na análise (ausência ou folha ainda não corrigida)${report.voided ? `, e ${plural(report.voided, 'prova anulada', 'provas anuladas')} ${report.voided === 1 ? 'ficou' : 'ficaram'} fora das contas` : ''}.` })
  else if (report.voided) items.push({ id: 'participation', tone: 'neutral', title: 'Provas anuladas', text: `${plural(report.voided, 'prova anulada', 'provas anuladas')} ${report.voided === 1 ? 'ficou' : 'ficaram'} fora das contas.` })

  return items
}
