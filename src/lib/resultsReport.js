import { calculateAreaResults, calculateQuestionResults } from './results.js'

export const REPORT_SECTIONS = [
  { id: 'classes', label: 'Comparativo por turma' },
  { id: 'grades', label: 'Comparativo por série / ano' },
  { id: 'areas', label: 'Áreas de conhecimento' },
  { id: 'assessments', label: 'Comparativo entre simulados' },
  { id: 'questions', label: 'Questões que precisam de atenção' },
]

const bands = [
  { label: 'Mais apoio · 0–39%', min: 0, max: 40, color: '#B9675F' },
  { label: 'Mais prática · 40–59%', min: 40, max: 60, color: '#C69558' },
  { label: 'Consolidar · 60–79%', min: 60, max: 80, color: '#7B9B72' },
  { label: 'Aprofundar · 80–100%', min: 80, max: 101, color: '#3F7968' },
]

const mean = (rows) => rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0
const percent = (part, total) => total ? Math.round(part / total * 100) : 0
const countLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`

function describeRows(rows) {
  return {
    count: rows.length,
    students: new Set(rows.map((row) => row.studentId)).size,
    score: mean(rows),
    correct: rows.reduce((sum, row) => sum + row.correct, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0),
    blank: rows.reduce((sum, row) => sum + row.blank, 0),
    review: rows.reduce((sum, row) => sum + row.review, 0),
    cancelled: rows.reduce((sum, row) => sum + row.cancelled, 0),
  }
}

function groupRows(rows, keyFor, labelFor) {
  const groups = new Map()
  rows.forEach((row) => {
    const key = keyFor(row)
    if (!groups.has(key)) groups.set(key, { key, label: labelFor(row), rows: [] })
    groups.get(key).rows.push(row)
  })
  return [...groups.values()].map((group) => ({ ...group, ...describeRows(group.rows) }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'pt-BR', { numeric: true }))
}

export function buildResultsReport({ school, assessments, rows, selectedAreas, filters, title = 'Relatório de resultados', sections = REPORT_SECTIONS.map((section) => section.id), classDetails = false, generatedAt = new Date() }) {
  if (!rows.length) throw new Error('Não há resultados no recorte selecionado. Ajuste os filtros antes de gerar o relatório.')
  const totals = describeRows(rows)
  const distribution = bands.map((band) => {
    const count = rows.filter((row) => row.score >= band.min && row.score < band.max).length
    return { label: band.label, count, value: percent(count, rows.length), detail: countLabel(count, 'participação', 'participações'), color: band.color }
  })
  const classes = groupRows(rows, (row) => row.classId, (row) => row.classroom?.name || 'Turma não informada')
  const grades = groupRows(rows, (row) => row.classroom?.grade?.trim() || 'Série / ano não informado', (row) => row.classroom?.grade?.trim() || 'Série / ano não informado')
  const byAssessment = groupRows(rows, (row) => row.assessmentId, (row) => row.assessment?.title || assessments.find((item) => item.id === row.assessmentId)?.title || 'Simulado')
  const areas = calculateAreaResults(assessments, rows).filter((item) => selectedAreas.includes(item.area))
  const measuredAreas = areas.filter((item) => item.attempts > 0).sort((a, b) => a.score - b.score)
  const questions = calculateQuestionResults(assessments, rows, selectedAreas).filter((item) => item.attempts > 0).sort((a, b) => a.score - b.score || b.attempts - a.attempts).slice(0, 12)
  const low = rows.filter((row) => row.score < 40).length
  const adequate = rows.filter((row) => row.score >= 60).length
  const weakest = measuredAreas[0]
  const strongest = measuredAreas.at(-1)
  const overview = `${totals.students} estudantes participaram de ${assessments.length} simulado${assessments.length === 1 ? '' : 's'}. A média de acertos foi de ${totals.score}%. A seguir, veja os pontos fortes e onde vale concentrar o apoio.`
  const findings = [
    { label: 'O que está indo bem', metric: `${percent(adequate, totals.count)}%`, caption: 'das participações com 60% ou mais de acertos', icon: 'star', color: '#47776A', text: strongest ? `${strongest.area} teve o maior percentual de acertos: ${strongest.score}%. Vale aproveitar esses conteúdos nas próximas atividades.` : 'Use os resultados gerais para reconhecer os avanços e planejar as próximas atividades.' },
    { label: 'Onde concentrar o apoio', metric: weakest ? `${weakest.score}%` : '—', caption: weakest ? `de acertos em ${weakest.area}` : 'Sem detalhes por área', icon: 'target', color: '#A47245', text: weakest ? `${weakest.area} teve o menor percentual de acertos. Comece a retomada pelos conteúdos das questões com menos acertos.` : 'Novas leituras de respostas ajudarão a identificar quais conteúdos precisam de retomada.' },
    { label: 'Um olhar para as turmas', metric: `${classes.at(-1).score}%`, caption: `média da turma ${classes.at(-1).label}`, icon: 'group', color: '#52718A', text: classes.length > 1 ? `As médias vão de ${classes.at(-1).score}% a ${classes[0].score}%. Observe as necessidades de cada turma ao planejar as atividades.` : 'Acompanhe esta turma e compare seus resultados nas próximas atividades.' },
  ]
  const recommendations = [
    { label: 'Retomar juntos', text: weakest ? `Revisar ${weakest.area} com exemplos e conversar sobre as questões com mais erros.` : 'Conversar com as turmas sobre as dificuldades e revisar os conteúdos trabalhados.' },
    { label: 'Praticar com apoio', text: low ? `Propor atividades em pequenos grupos. Dar atenção aos estudantes que tiveram menos de 40% de acertos.` : 'Propor atividades em pequenos grupos para consolidar o que foi aprendido.' },
    { label: 'Acompanhar de perto', text: totals.review ? `Conferir as ${totals.review} marcações pendentes. Depois da revisão dos conteúdos, aplicar uma atividade semelhante e observar os avanços.` : 'Depois da revisão dos conteúdos, aplicar uma atividade semelhante e observar os avanços.' },
  ]
  const pages = [
    { type: 'overview', title: 'Resultados em perspectiva', subtitle: 'Um retrato das aprendizagens nas atividades selecionadas', overview, totals },
    { type: 'distribution', title: 'Como estão os resultados?', subtitle: 'Um mapa das participações em cada faixa de acertos', items: distribution, note: 'Cada ponto representa cerca de 1% das participações. As porcentagens são arredondadas. Um estudante pode aparecer em mais de um simulado.' },
    { type: 'highlights', title: 'Síntese dos resultados', subtitle: 'Três destaques para conversar com a equipe', items: findings },
  ]
  const comparisons = [
    ['classes', 'Comparativo por turma', classes],
    ['grades', 'Comparativo por série / ano', grades],
    ['assessments', 'Comparativo entre simulados', byAssessment],
  ]
  comparisons.forEach(([id, heading, groups]) => {
    if (sections.includes(id)) pages.push({ type: 'bars', title: heading, subtitle: 'Veja a média de acertos de cada grupo', items: groups.map((group) => ({ label: group.label, value: group.score, detail: `${countLabel(group.count, 'participação', 'participações')} · ${countLabel(group.students, 'estudante', 'estudantes')}`, color: '#47776A' })), note: 'Barras maiores indicam mais acertos. Considere também quantos estudantes participaram e quais provas foram feitas.' })
  })
  if (sections.includes('areas')) pages.push({ type: 'bars', title: 'Áreas de conhecimento', subtitle: 'Em quais áreas houve mais acertos?', items: areas.map((area) => ({ label: area.area, value: area.attempts ? area.score : null, detail: `${area.correct} acertos em ${area.attempts} respostas`, color: '#52718A' })), note: 'As barras mostram a proporção de acertos. As questões canceladas ficam fora dessa conta.' })
  if (sections.includes('questions')) pages.push({ type: 'bars', title: 'Questões que precisam de atenção', subtitle: 'Um ponto de partida para revisar os conteúdos em sala', items: questions.map((question) => ({ label: `${question.assessmentCode || question.assessmentTitle} · Q${question.number}`, value: question.score, detail: `${question.area} · ${question.attempts} respostas`, color: '#A47245' })), note: 'Estas são as até 12 questões com menos acertos. Consulte cada simulado para conversar sobre os enunciados e as dúvidas.' })
  if (classDetails && sections.includes('classes')) classes.forEach((group) => {
    const groupAreas = calculateAreaResults(assessments, group.rows).filter((area) => selectedAreas.includes(area.area))
    pages.push({ type: 'bars', title: `Turma ${group.label}`, subtitle: `${group.students} estudantes · média de ${group.score}% de acertos`, items: groupAreas.map((area) => ({ label: area.area, value: area.attempts ? area.score : null, detail: `${area.correct} acertos em ${area.attempts} respostas`, color: '#47776A' })), note: 'Um retrato desta turma nas áreas e nos simulados selecionados.' })
  })
  pages.push({ type: 'steps', title: 'Próximos passos', subtitle: 'Um caminho simples para apoiar a aprendizagem', items: recommendations })
  pages.push({ type: 'text', title: 'Sobre este relatório', subtitle: 'O que foi escolhido e como ler os resultados', items: [
    { label: 'Instituição', text: school.name },
    ...filters.map(([label, text]) => ({ label, text })),
    { label: 'Como ler as porcentagens', text: '100% significa acertar todas as questões. Na média dos grupos, cada folha conta uma vez. Nas áreas e questões, a porcentagem mostra quantas respostas foram acertadas.' },
    { label: 'Estudantes e participações', text: 'Um estudante pode participar de mais de um simulado. Por isso, o número de participações pode ser maior que o de estudantes. Séries e anos seguem o cadastro das turmas.' },
    { label: 'Uma fotografia da seleção', text: 'O relatório mostra somente os filtros escolhidos. Comparar provas diferentes ajuda a observar os resultados, mas não mostra, sozinho, quanto cada turma avançou.' },
    { label: 'O que entra na conta', text: 'Questões canceladas não contam na nota. Resultados antigos sem respostas por questão aparecem nas médias quando todas as suas áreas estão selecionadas; não aparecem nos gráficos por área e questão.' },
  ] })
  return {
    title: title.trim() || 'Relatório de resultados',
    school: school.name,
    location: [school.city, school.state].filter(Boolean).join(' / '),
    date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(generatedAt),
    dateKey: new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Sao_Paulo' }).format(generatedAt),
    totals, pages,
  }
}
