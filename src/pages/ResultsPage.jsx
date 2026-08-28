import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowUpRight, Award, BarChart3, BookOpenCheck, Download,
  Lightbulb, MousePointerClick, RotateCcw, SlidersHorizontal, Target,
  TrendingDown, TrendingUp, UsersRound, Network,
} from 'lucide-react'
import { Badge, Button, StatCard } from '../components/ui'
import { average, cn, downloadBlob, initials } from '../lib/utils'
import { getQuestionAreas, uniqueQuestionAreas } from '../lib/knowledgeAreas'
import { isAssessmentClosed } from '../lib/assessment'

const areaColors = ['#47776a', '#a47245', '#6b6682', '#52718a', '#a65f5a', '#748b5f', '#8b6d48', '#5d7180']
const performanceBands = [
  { id: 'low', label: '0–39%', name: 'Insuficiente', min: 0, max: 40, color: '#b9675f' },
  { id: 'basic', label: '40–59%', name: 'Básico', min: 40, max: 60, color: '#c69558' },
  { id: 'adequate', label: '60–79%', name: 'Adequado', min: 60, max: 80, color: '#7b9b72' },
  { id: 'advanced', label: '80–100%', name: 'Avançado', min: 80, max: 101, color: '#3f7968' },
]

function matchesBand(score, bandId) {
  if (bandId === 'all') return true
  const band = performanceBands.find((item) => item.id === bandId)
  return band ? score >= band.min && score < band.max : true
}

function matchesSelectedBands(score, selectedBandIds) {
  return !selectedBandIds.length || selectedBandIds.some((bandId) => matchesBand(score, bandId))
}

function toggleChartSelection(selected, value, allValues) {
  if (selected.length === allValues.length) return [value]
  if (!selected.includes(value)) return [...selected, value]
  const next = selected.filter((item) => item !== value)
  return next.length ? next : allValues
}

function calculateSubmissionMetrics(submission, assessment, selectedAreas = []) {
  const questionAreas = getQuestionAreas(assessment)
  const questionIndexes = questionAreas
    .map((questionArea, index) => !selectedAreas.length || selectedAreas.includes(questionArea) ? index : -1)
    .filter((index) => index >= 0)

  if (!Array.isArray(submission.answers)) {
    if (selectedAreas.length && selectedAreas.length < new Set(questionAreas).size) return null
    return {
      total: Number(submission.gradedTotal ?? Math.max(0, assessment.questionCount - Number(submission.cancelled || 0))),
      correct: Number(submission.correct || 0),
      wrong: Number(submission.wrong || 0),
      blank: Number(submission.blank || 0),
      multiple: Number(submission.multiple || 0),
      uncertain: Number(submission.uncertain || 0),
      cancelled: Number(submission.cancelled || 0),
      review: Number(submission.multiple || 0) + Number(submission.uncertain || 0),
      score: Number(submission.score || 0),
    }
  }

  const metrics = { total: 0, correct: 0, wrong: 0, blank: 0, multiple: 0, uncertain: 0, cancelled: 0, review: 0, score: 0 }
  questionIndexes.forEach((index) => {
    const status = submission.answers[index]?.status || 'blank'
    if (status === 'cancelled') {
      metrics.cancelled += 1
      return
    }
    metrics.total += 1
    if (status === 'correct') metrics.correct += 1
    else if (status === 'wrong') metrics.wrong += 1
    else if (status === 'blank') metrics.blank += 1
    else if (status === 'multiple') metrics.multiple += 1
    else if (status === 'uncertain') metrics.uncertain += 1
    else metrics.review += 1
  })
  metrics.review += metrics.multiple + metrics.uncertain
  metrics.score = metrics.total ? Math.round((metrics.correct / metrics.total) * 100) : 0
  return metrics
}

function calculateAreaResults(assessment, submissions) {
  if (!assessment) return []
  const questionAreas = getQuestionAreas(assessment)
  const summary = new Map()
  questionAreas.forEach((area) => {
    if (!summary.has(area)) summary.set(area, { area, questions: 0, attempts: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, review: 0 })
    summary.get(area).questions += 1
  })
  submissions.forEach((submission) => {
    if (!Array.isArray(submission.answers)) return
    submission.answers.forEach((answer, index) => {
      const item = summary.get(questionAreas[index])
      if (!item) return
      if (answer.status === 'cancelled') {
        item.cancelled += 1
        return
      }
      item.attempts += 1
      if (answer.status === 'correct') item.correct += 1
      else if (answer.status === 'wrong') item.wrong += 1
      else if (answer.status === 'blank') item.blank += 1
      else item.review += 1
    })
  })
  return [...summary.values()].map((item, index) => ({
    ...item,
    score: item.attempts ? Math.round((item.correct / item.attempts) * 100) : 0,
    color: areaColors[index % areaColors.length],
  }))
}

function calculateQuestionResults(assessment, submissions, selectedAreas = []) {
  if (!assessment) return []
  const questionAreas = getQuestionAreas(assessment)
  return questionAreas.map((questionArea, index) => {
    if (selectedAreas.length && !selectedAreas.includes(questionArea)) return null
    const result = { index, number: index + 1, area: questionArea, attempts: 0, correct: 0, wrong: 0, blank: 0, cancelled: 0, review: 0, score: 0 }
    submissions.forEach((submission) => {
      const answer = submission.answers?.[index]
      if (!answer) return
      if (answer.status === 'cancelled') {
        result.cancelled += 1
        return
      }
      result.attempts += 1
      if (answer.status === 'correct') result.correct += 1
      else if (answer.status === 'wrong') result.wrong += 1
      else if (answer.status === 'blank') result.blank += 1
      else result.review += 1
    })
    result.score = result.attempts ? Math.round((result.correct / result.attempts) * 100) : 0
    return result
  }).filter(Boolean)
}

function MultiFilter({ label, options, selected, onChange, allLabel }) {
  const allSelected = selected.length === options.length
  function toggle(value) {
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
    onChange(next.length ? next : options.map((option) => option.value))
  }
  const summary = allSelected ? allLabel : selected.length === 1 ? options.find((option) => option.value === selected[0])?.label : `${selected.length} selecionadas`
  return <div className="results-multi-field"><span>{label}</span><details><summary>{summary}</summary><div><button type="button" className={allSelected ? 'active' : ''} onClick={() => onChange(options.map((option) => option.value))}>Todas</button>{options.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span></label>)}</div></details></div>
}

function ClassChartLegend({ classes }) {
  return <div className="chart-class-legend" aria-label="Legenda das turmas">{classes.map(({ classroom, color }) => <span key={classroom.id}><i style={{ background: color }} />{classroom.name}</span>)}</div>
}

function pearsonCorrelation(firstValues, secondValues) {
  if (firstValues.length < 2 || firstValues.length !== secondValues.length) return null
  const firstAverage = average(firstValues)
  const secondAverage = average(secondValues)
  const numerator = firstValues.reduce((sum, value, index) => sum + ((value - firstAverage) * (secondValues[index] - secondAverage)), 0)
  const firstDeviation = Math.sqrt(firstValues.reduce((sum, value) => sum + ((value - firstAverage) ** 2), 0))
  const secondDeviation = Math.sqrt(secondValues.reduce((sum, value) => sum + ((value - secondAverage) ** 2), 0))
  if (!firstDeviation || !secondDeviation) return null
  return numerator / (firstDeviation * secondDeviation)
}

function buildAssessmentCorrelation(firstAssessment, secondAssessment, submissions, classId, metric) {
  const firstRows = submissions.filter((submission) => submission.assessmentId === firstAssessment.id && (classId === 'all' || submission.classId === classId) && Array.isArray(submission.answers))
  const secondRows = submissions.filter((submission) => submission.assessmentId === secondAssessment.id && (classId === 'all' || submission.classId === classId) && Array.isArray(submission.answers))
  const secondByStudent = new Map(secondRows.map((submission) => [submission.studentId, submission]))
  const pairedRows = firstRows.map((submission) => ({ first: submission, second: secondByStudent.get(submission.studentId) })).filter((pair) => pair.second)
  if (metric === 'general') {
    const correlation = pearsonCorrelation(pairedRows.map((pair) => Number(pair.first.score || 0)), pairedRows.map((pair) => Number(pair.second.score || 0)))
    return correlation === null ? null : { correlation, observations: pairedRows.length }
  }
  const questionCount = Math.min(firstAssessment.questionCount, secondAssessment.questionCount)
  const firstValues = []
  const secondValues = []
  pairedRows.forEach(({ first, second }) => {
    for (let index = 0; index < questionCount; index += 1) {
      firstValues.push(first.answers[index]?.status === 'correct' ? 1 : 0)
      secondValues.push(second.answers[index]?.status === 'correct' ? 1 : 0)
    }
  })
  const correlation = pearsonCorrelation(firstValues, secondValues)
  return correlation === null ? null : { correlation, observations: pairedRows.length, questionObservations: firstValues.length }
}

export function AssessmentCorrelationNetwork({ assessments, submissions, classId }) {
  const [metric, setMetric] = useState('general')
  const network = useMemo(() => {
    const nodes = assessments.map((assessment, index) => {
      const angle = (Math.PI * 2 * index / Math.max(1, assessments.length)) - Math.PI / 2
      return { assessment, x: 50 + Math.cos(angle) * 34, y: 48 + Math.sin(angle) * 34 }
    })
    const edges = []
    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        const result = buildAssessmentCorrelation(nodes[firstIndex].assessment, nodes[secondIndex].assessment, submissions, classId, metric)
        if (result) edges.push({ ...result, first: nodes[firstIndex], second: nodes[secondIndex] })
      }
    }
    return { nodes, edges }
  }, [assessments, classId, metric, submissions])
  const strongest = [...network.edges].sort((first, second) => Math.abs(second.correlation) - Math.abs(first.correlation)).slice(0, 5)

  return <section className="panel correlation-network-panel"><header className="panel-header"><div><h3>Correlação entre simulados</h3><p>As ligações usam apenas alunos presentes nos dois simulados.</p></div><div className="correlation-mode"><button className={metric === 'general' ? 'active' : ''} onClick={() => setMetric('general')}>Desempenho geral</button><button className={metric === 'question' ? 'active' : ''} onClick={() => setMetric('question')}>Por questão</button></div></header><div className="correlation-network-layout"><div className="correlation-network-graphic"><svg viewBox="0 0 100 100" role="img" aria-label={`Rede de correlação por ${metric === 'general' ? 'desempenho geral' : 'desempenho por questão'}`}><g className="correlation-edges">{network.edges.map((edge) => <line key={`${edge.first.assessment.id}-${edge.second.assessment.id}`} x1={edge.first.x} y1={edge.first.y} x2={edge.second.x} y2={edge.second.y} className={edge.correlation >= 0 ? 'positive' : 'negative'} strokeWidth={1 + Math.abs(edge.correlation) * 4} opacity={.2 + Math.abs(edge.correlation) * .65} />)}</g><g>{network.nodes.map((node) => <g key={node.assessment.id} className="correlation-node"><circle cx={node.x} cy={node.y} r="7" /><text x={node.x} y={node.y + .8}>{node.assessment.code || node.assessment.title.slice(0, 3).toUpperCase()}</text><title>{node.assessment.title}</title></g>)}</g></svg></div><div className="correlation-network-legend"><div><span className="correlation-line positive" /><p><strong>Correlação positiva</strong><small>Alunos com bom desempenho em uma prova tendem a repetir o padrão na outra.</small></p></div><div><span className="correlation-line negative" /><p><strong>Correlação negativa</strong><small>O desempenho varia em sentidos opostos entre as provas.</small></p></div><div className="correlation-network-list"><strong>Ligações mais fortes</strong>{strongest.length ? strongest.map((edge) => <div key={`${edge.first.assessment.id}-${edge.second.assessment.id}`}><span>{edge.first.assessment.code} × {edge.second.assessment.code}</span><b className={edge.correlation >= 0 ? 'positive-text' : 'negative-text'}>{edge.correlation > 0 ? '+' : ''}{Math.round(edge.correlation * 100)}%</b><small>{edge.observations} aluno{edge.observations !== 1 ? 's' : ''} em comum{edge.questionObservations ? ` · ${edge.questionObservations} observações por questão` : ''}</small></div>) : <small>Não há pares com dados suficientes para calcular a correlação.</small>}</div></div></div><footer className="correlation-network-footnote"><Network size={15} /> Pearson: -100% indica relação inversa, 0% indica ausência de relação linear e +100% indica relação positiva perfeita. A correlação por questão compara acerto/erro dos mesmos alunos nas posições correspondentes.</footer></section>
}

function studentAnswerValue(answer) {
  const selected = Array.isArray(answer?.selected) ? [...answer.selected].sort() : []
  return selected.join('+')
}

export function StudentCorrelationNetwork({ assessment, assessments, submissions, students, classId }) {
  const [metric, setMetric] = useState('question')
  const [questionIndex, setQuestionIndex] = useState(0)
  const rows = useMemo(() => submissions
    .filter((submission) => submission.assessmentId === assessment?.id && Array.isArray(submission.answers) && (classId === 'all' || submission.classId === classId))
    .map((submission) => ({ submission, student: students.find((student) => student.id === submission.studentId) }))
    .filter((row) => row.student), [assessment?.id, classId, students, submissions])
  const network = useMemo(() => {
    const nodes = rows.map((row, index) => {
      const angle = (Math.PI * 2 * index / Math.max(1, rows.length)) - Math.PI / 2
      return { ...row, x: 50 + Math.cos(angle) * 35, y: 48 + Math.sin(angle) * 35 }
    })
    const edges = []
    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        const first = nodes[firstIndex]
        const second = nodes[secondIndex]
        let comparable = 0
        let same = 0
        let questionSame = false
        if (metric === 'question') {
          const firstAnswer = studentAnswerValue(first.submission.answers[questionIndex])
          const secondAnswer = studentAnswerValue(second.submission.answers[questionIndex])
          questionSame = Boolean(firstAnswer && secondAnswer && firstAnswer === secondAnswer)
          comparable = firstAnswer || secondAnswer ? 1 : 0
          same = questionSame ? 1 : 0
        } else if (metric === 'assessment') {
          const values = Array.from({ length: assessment.questionCount }, (_, index) => [studentAnswerValue(first.submission.answers[index]), studentAnswerValue(second.submission.answers[index])]).filter(([firstAnswer, secondAnswer]) => firstAnswer || secondAnswer)
          comparable = values.length
          same = values.filter(([firstAnswer, secondAnswer]) => firstAnswer === secondAnswer).length
        } else {
          assessments.forEach((item) => {
            const firstSubmission = submissions.find((submission) => submission.assessmentId === item.id && submission.studentId === first.student.id && Array.isArray(submission.answers))
            const secondSubmission = submissions.find((submission) => submission.assessmentId === item.id && submission.studentId === second.student.id && Array.isArray(submission.answers))
            if (!firstSubmission || !secondSubmission) return
            const count = Math.min(item.questionCount, firstSubmission.answers.length, secondSubmission.answers.length)
            for (let index = 0; index < count; index += 1) {
              const firstCorrect = firstSubmission.answers[index]?.status === 'correct'
              const secondCorrect = secondSubmission.answers[index]?.status === 'correct'
              comparable += 1
              if (firstCorrect === secondCorrect) same += 1
            }
          })
        }
        if (comparable) edges.push({ first, second, similarity: Math.round((same / comparable) * 100), comparable, questionSame })
      }
    }
    return { nodes, edges: edges.filter((edge) => metric === 'question' ? edge.questionSame : edge.similarity >= 65) }
  }, [assessment, assessments, metric, questionIndex, rows, submissions])
  const strongest = [...network.edges].sort((first, second) => second.similarity - first.similarity).slice(0, 6)
  const strongestPair = strongest[0]

  return <section className="panel student-network-panel"><header className="panel-header"><div><h3>Rede de correlação entre alunos</h3><p>Os nós representam alunos; cada ligação mostra um padrão compartilhado dentro da seleção.</p></div><div className="correlation-mode"><button className={metric === 'question' ? 'active' : ''} onClick={() => setMetric('question')}>Por questão</button><button className={metric === 'assessment' ? 'active' : ''} onClick={() => setMetric('assessment')}>No simulado</button><button className={metric === 'cross' ? 'active' : ''} onClick={() => setMetric('cross')}>Entre simulados</button></div></header><div className="student-network-controls">{metric === 'question' && <label><span>Questão analisada</span><select value={questionIndex} onChange={(event) => setQuestionIndex(Number(event.target.value))}>{Array.from({ length: assessment.questionCount }, (_, index) => <option value={index} key={index}>Questão {index + 1}</option>)}</select></label>}<p>{metric === 'question' ? 'A ligação aparece quando os dois alunos marcaram a mesma alternativa, sem contar dois brancos.' : metric === 'assessment' ? 'A ligação aparece a partir de 65% de respostas iguais no simulado.' : 'A ligação compara acerto e erro nas questões dos simulados feitos pelos dois alunos.'}</p></div><div className="student-network-layout"><div className="student-network-graphic"><svg viewBox="0 0 100 100" role="img" aria-label="Rede de correlação entre alunos"><g className="correlation-edges">{network.edges.map((edge) => <line key={`${edge.first.student.id}-${edge.second.student.id}`} x1={edge.first.x} y1={edge.first.y} x2={edge.second.x} y2={edge.second.y} strokeWidth={.7 + edge.similarity / 100 * 2.7} opacity={.25 + edge.similarity / 100 * .65} />)}</g>{network.nodes.map((node) => <g className="student-network-node" key={node.student.id}><circle cx={node.x} cy={node.y} r="5.8" /><text x={node.x} y={node.y + .7}>{node.student.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</text><title>{node.student.name}</title></g>)}</svg></div><div className="student-network-analysis"><div><strong>{network.edges.length}</strong><span>ligações encontradas</span></div><div><strong>{strongestPair ? `${strongestPair.similarity}%` : '—'}</strong><span>maior similaridade</span></div><section><strong>Análise automática</strong>{strongestPair ? <p>{strongestPair.first.student.name} e {strongestPair.second.student.name} formam o par mais próximo neste recorte, com {strongestPair.similarity}% de coincidência em {strongestPair.comparable} observações. Confirme a posição em sala, a aplicação e a folha original antes de interpretar o padrão.</p> : <p>Nenhuma ligação atingiu o critério atual. Selecione outra questão, turma ou modo de comparação.</p>}</section></div></div><footer className="correlation-network-footnote"><Network size={15} /><span>Uma ligação indica semelhança, não causalidade. Ela pode refletir conteúdo aprendido, dificuldade da questão, influência entre colegas ou outras condições da aplicação.</span></footer></section>
}

export function StudentQuestionCorrelation({ assessment, submissions, students, classId }) {
  const [questionIndex, setQuestionIndex] = useState(0)
  const studentRows = useMemo(() => {
    const source = submissions
      .filter((submission) => submission.assessmentId === assessment?.id && Array.isArray(submission.answers) && (classId === 'all' || submission.classId === classId))
      .map((submission) => ({ submission, student: students.find((item) => item.id === submission.studentId) }))
    return source.filter((row) => row.student)
  }, [assessment?.id, classId, students, submissions])
  const currentQuestion = studentRows.map((row) => ({ ...row, answer: studentAnswerValue(row.submission.answers[questionIndex]) || 'Em branco' }))
  const answerGroups = [...new Set(currentQuestion.map((row) => row.answer))]
  const pairs = useMemo(() => studentRows.flatMap((first, firstIndex) => studentRows.slice(firstIndex + 1).filter((second) => first.student.classId === second.student.classId).map((second) => {
    const comparable = Array.from({ length: assessment.questionCount }, (_, index) => [studentAnswerValue(first.submission.answers[index]), studentAnswerValue(second.submission.answers[index])]).filter(([firstAnswer, secondAnswer]) => firstAnswer || secondAnswer)
    const same = comparable.filter(([firstAnswer, secondAnswer]) => firstAnswer === secondAnswer).length
    const selectedSame = studentAnswerValue(first.submission.answers[questionIndex]) === studentAnswerValue(second.submission.answers[questionIndex])
      && Boolean(studentAnswerValue(first.submission.answers[questionIndex]))
    return { first, second, same, comparable: comparable.length, selectedSame, similarity: comparable.length ? Math.round((same / comparable.length) * 100) : 0 }
  })).sort((first, second) => Number(second.selectedSame) - Number(first.selectedSame) || second.similarity - first.similarity), [assessment.questionCount, questionIndex, studentRows])
  if (!assessment) return null
  return <section className="panel student-question-correlation"><header className="panel-header"><div><h3>Relação entre alunos por questão</h3><p>Veja como os estudantes responderam a uma questão e compare padrões dentro da mesma turma.</p></div><Badge tone="neutral">{currentQuestion.length} respostas</Badge></header><div className="student-question-toolbar"><label><span>Questão analisada</span><select value={questionIndex} onChange={(event) => setQuestionIndex(Number(event.target.value))}>{Array.from({ length: assessment.questionCount }, (_, index) => <option value={index} key={index}>Questão {index + 1}</option>)}</select></label><div className="student-question-distribution">{answerGroups.map((answer) => <div key={answer}><strong>{currentQuestion.filter((row) => row.answer === answer).length}</strong><span>{answer}</span></div>)}</div></div>{pairs.length ? <div className="table-wrap"><table className="student-question-table"><thead><tr><th>ALUNOS</th><th>QUESTÃO {questionIndex + 1}</th><th>PADRÃO COMPLETO</th><th>LEITURA</th></tr></thead><tbody>{pairs.slice(0, 20).map((pair) => <tr key={`${pair.first.student.id}-${pair.second.student.id}`} className={pair.selectedSame ? 'same-question' : ''}><td><strong>{pair.first.student.name}</strong><small className="cell-subtitle">{pair.second.student.name}</small></td><td><span>{studentAnswerValue(pair.first.submission.answers[questionIndex]) || 'Em branco'}</span><small className="cell-subtitle">{studentAnswerValue(pair.second.submission.answers[questionIndex]) || 'Em branco'}</small></td><td>{pair.same} de {pair.comparable} respostas consideradas <strong className="student-question-score">{pair.similarity}%</strong></td><td><Badge tone={pair.selectedSame ? 'ochre' : 'neutral'}>{pair.selectedSame ? 'Mesma marcação' : 'Diferente'}</Badge></td></tr>)}</tbody></table></div> : <div className="area-analysis-empty"><UsersRound size={24} /><div><strong>Sem pares na turma selecionada</strong><p>São necessárias pelo menos duas folhas corrigidas com respostas detalhadas.</p></div></div>}<footer className="correlation-network-footnote"><Network size={15} /><span>A coluna da questão mostra uma coincidência pontual. O percentual compara o padrão completo e desconsidera questões em branco dos dois estudantes.</span></footer></section>
}

export function ResultsPage({ data, notify }) {
  const correctedAssessments = data.assessments.filter((assessment) => data.submissions.some((submission) => submission.assessmentId === assessment.id))
  const [assessmentId, setAssessmentId] = useState(correctedAssessments[0]?.id || '')
  const [selectedClassIds, setSelectedClassIds] = useState(() => correctedAssessments[0]?.classIds || [])
  const [selectedAreas, setSelectedAreas] = useState(() => uniqueQuestionAreas(correctedAssessments[0]))
  const [selectedBandIds, setSelectedBandIds] = useState(() => performanceBands.map((item) => item.id))
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const [distributionChartMode, setDistributionChartMode] = useState('general')
  const [questionChartMode, setQuestionChartMode] = useState('general')
  const assessment = data.assessments.find((item) => item.id === assessmentId)
  const assessmentClosed = isAssessmentClosed(assessment)
  const assessmentClasses = assessment?.classIds.map((id) => data.classes.find((item) => item.id === id)).filter(Boolean) || []
  const areas = uniqueQuestionAreas(assessment)
  const allBandIds = performanceBands.map((item) => item.id)

  const resultRows = useMemo(() => data.submissions
    .filter((submission) => submission.assessmentId === assessmentId)
    .map((submission) => {
      const student = data.students.find((item) => item.id === submission.studentId)
      const rowClassId = student?.classId || submission.classId
      const classroom = data.classes.find((item) => item.id === rowClassId)
      const metrics = calculateSubmissionMetrics(submission, assessment, selectedAreas)
      return metrics ? { ...submission, ...metrics, student, classroom, classId: rowClassId } : null
    })
    .filter(Boolean), [selectedAreas, assessment, assessmentId, data.classes, data.students, data.submissions])

  const classScopedRows = resultRows.filter((item) => selectedClassIds.includes(item.classId))
  const filteredRows = classScopedRows.filter((item) => matchesSelectedBands(item.score, selectedBandIds))
  const studentRows = [...filteredRows].sort((first, second) => second.score - first.score || String(first.student?.name).localeCompare(String(second.student?.name), 'pt-BR'))
  const avg = average(studentRows.map((item) => item.score))
  const detailedSubmissions = filteredRows.filter((item) => Array.isArray(item.answers))
  const areaResults = calculateAreaResults(assessment, filteredRows)
  const selectedAreaResults = areaResults.filter((item) => selectedAreas.includes(item.area))
  const weakestArea = [...selectedAreaResults].filter((item) => item.attempts > 0).sort((first, second) => first.score - second.score)[0]
  const questionResults = calculateQuestionResults(assessment, filteredRows, selectedAreas)
  const selectedQuestionResult = questionResults.find((item) => item.index === selectedQuestion)
  const chartClasses = assessmentClasses
    .map((classroom, index) => ({ classroom, color: classroom.color || areaColors[index % areaColors.length] }))
    .filter(({ classroom }) => selectedClassIds.includes(classroom.id))
  const classQuestionResults = chartClasses.map(({ classroom, color }) => ({
    classroom,
    color,
    results: new Map(calculateQuestionResults(assessment, filteredRows.filter((item) => item.classId === classroom.id), selectedAreas).map((item) => [item.index, item])),
  }))

  const classResults = assessmentClasses.map((classroom) => {
    const rows = resultRows.filter((item) => item.classId === classroom.id && matchesSelectedBands(item.score, selectedBandIds))
    return { classroom, count: rows.length, avg: average(rows.map((item) => item.score)) }
  })

  const distribution = performanceBands.map((band) => ({
    ...band,
    count: classScopedRows.filter((item) => matchesBand(item.score, band.id)).length,
    classes: chartClasses.map(({ classroom, color }) => ({
      classroom,
      color,
      count: classScopedRows.filter((item) => item.classId === classroom.id && matchesBand(item.score, band.id)).length,
    })),
  }))
  const maxDistribution = Math.max(1, ...distribution.map((item) => item.count))
  const maxClassDistribution = Math.max(1, ...distribution.flatMap((item) => item.classes.map((classResult) => classResult.count)))
  const eligibleStudents = data.students.filter((student) => assessment?.classIds.includes(student.classId)
    && student.status === 'Ativo' && selectedClassIds.includes(student.classId)).length
  const selectedClassNames = assessmentClasses.filter((item) => selectedClassIds.includes(item.id)).map((item) => item.name)
  const selectedBandLabels = performanceBands.filter((item) => selectedBandIds.includes(item.id)).map((item) => `${item.name} (${item.label})`)
  const hasFilters = selectedClassIds.length !== assessmentClasses.length || selectedAreas.length !== areas.length || selectedBandIds.length !== performanceBands.length

  function changeAssessment(nextAssessmentId) {
    setAssessmentId(nextAssessmentId)
    const nextAssessment = data.assessments.find((item) => item.id === nextAssessmentId)
    setSelectedClassIds(nextAssessment?.classIds || [])
    setSelectedAreas(uniqueQuestionAreas(nextAssessment))
    setSelectedBandIds(allBandIds)
    setSelectedQuestion(null)
  }

  function changeAreas(nextAreas) {
    setSelectedAreas(nextAreas)
    setSelectedQuestion(null)
  }

  function toggleClass(classId) {
    const allClassIds = assessmentClasses.map((item) => item.id)
    setSelectedClassIds((current) => toggleChartSelection(current, classId, allClassIds))
  }

  function toggleArea(areaName) {
    setSelectedAreas((current) => toggleChartSelection(current, areaName, areas))
    setSelectedQuestion(null)
  }

  function toggleBand(bandId) {
    setSelectedBandIds((current) => toggleChartSelection(current, bandId, allBandIds))
  }

  function resetFilters() {
    setSelectedClassIds(assessment?.classIds || [])
    setSelectedAreas(areas)
    setSelectedBandIds(allBandIds)
    setSelectedQuestion(null)
  }

  function exportResults() {
    const filterRows = [
      ['Simulado', assessment.title],
      ['Turma', selectedClassIds.length === assessmentClasses.length ? 'Todas' : selectedClassNames.join(', ')],
      ['Área / componente', selectedAreas.length === areas.length ? 'Todas' : selectedAreas.join(', ')],
      ['Faixa de desempenho', selectedBandIds.length === performanceBands.length ? 'Todas' : selectedBandLabels.join(', ')],
    ]
    const header = ['Matrícula', 'Aluno', 'Turma', 'Questões válidas', 'Acertos', 'Erros', 'Brancos', 'Canceladas', 'Revisões', 'Aproveitamento (%)']
    const rows = studentRows.map((item) => [item.student?.registration, item.student?.name, item.classroom?.name, item.total, item.correct, item.wrong, item.blank, item.cancelled, item.review, item.score])
    const areaHeader = ['Área / componente', 'Questões', 'Respostas válidas', 'Acertos', 'Erros', 'Em branco', 'Canceladas', 'Para revisão', 'Aproveitamento (%)']
    const areaRows = selectedAreaResults.map((item) => [item.area, item.questions, item.attempts, item.correct, item.wrong, item.blank, item.cancelled, item.review, item.score])
    const questionHeader = ['Questão', 'Área / componente', 'Respostas válidas', 'Acertos', 'Erros', 'Em branco', 'Canceladas', 'Para revisão', 'Aproveitamento (%)']
    const questionRows = questionResults.map((item) => [item.number, item.area, item.attempts, item.correct, item.wrong, item.blank, item.cancelled, item.review, item.score])
    const csv = [
      ['FILTROS APLICADOS'], ...filterRows, [], header, ...rows,
      [], ['ANÁLISE POR ÁREA'], areaHeader, ...areaRows,
      [], ['ANÁLISE POR QUESTÃO'], questionHeader, ...questionRows,
    ].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n')
    downloadBlob(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `resultados-${assessment.code}.csv`)
    notify('Relatório exportado', `${studentRows.length} resultado${studentRows.length !== 1 ? 's' : ''} do recorte atual foram incluídos.`)
  }

  if (!assessment) return <div className="panel no-results"><BarChart3 size={32} /><h3>Ainda não há resultados</h3><p>Corrija ao menos uma folha para visualizar esta área.</p></div>

  return (
    <div className="page-stack results-page">
      <section className="results-filter-panel">
        <header><div><span><SlidersHorizontal size={17} /></span><div><strong>Explorar resultados</strong><small>Combine os filtros ou clique diretamente nos gráficos.</small></div></div><Button variant="secondary" icon={Download} onClick={exportResults}>Exportar recorte</Button></header>
        <div className="results-filter-grid">
          <label><span>SIMULADO</span><select value={assessmentId} onChange={(event) => changeAssessment(event.target.value)}>{correctedAssessments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <MultiFilter label="TURMAS" options={assessmentClasses.map((item) => ({ value: item.id, label: `${item.name} · ${item.shift}` }))} selected={selectedClassIds} onChange={setSelectedClassIds} allLabel="Todas as turmas" />
          <MultiFilter label="ÁREAS / COMPONENTES" options={areas.map((item) => ({ value: item, label: item }))} selected={selectedAreas} onChange={changeAreas} allLabel="Todas as áreas" />
          <MultiFilter label="FAIXAS" options={performanceBands.map((item) => ({ value: item.id, label: `${item.name} · ${item.label}` }))} selected={selectedBandIds} onChange={setSelectedBandIds} allLabel="Todas as faixas" />
          <Button variant="ghost" icon={RotateCcw} disabled={!hasFilters} onClick={resetFilters}>Limpar filtros</Button>
        </div>
        <div className="results-filter-summary"><Badge tone={hasFilters ? 'blue' : 'neutral'}>{studentRows.length} resultado{studentRows.length !== 1 ? 's' : ''}</Badge><span>{selectedClassIds.length === assessmentClasses.length ? 'Todas as turmas' : selectedClassNames.join(', ')} · {selectedAreas.length === areas.length ? 'Todas as áreas' : selectedAreas.join(', ')} · {selectedBandIds.length === performanceBands.length ? 'Todas as faixas' : selectedBandLabels.join(', ')}</span></div>
      </section>

      <div className="stats-grid">
        <StatCard label="Média do recorte" value={`${avg}%`} note={selectedAreas.length === areas.length ? 'de aproveitamento' : `em ${selectedAreas.length} área${selectedAreas.length !== 1 ? 's' : ''}`} icon={Target} tone="green" />
        <StatCard label="Participação" value={`${studentRows.length}`} note={selectedBandIds.length === performanceBands.length ? `de ${eligibleStudents} alunos elegíveis` : `de ${classScopedRows.length} correções no recorte`} icon={UsersRound} tone="blue" />
        <StatCard label="Maior resultado" value={`${studentRows[0]?.score || 0}%`} note={studentRows[0]?.student?.name?.split(' ')[0] || '—'} icon={Award} tone="ochre" />
        <StatCard label={assessmentClosed ? 'Com ressalva' : 'Para revisão'} value={studentRows.filter((item) => item.status === 'Revisar').length} note={assessmentClosed ? 'registradas no encerramento' : 'folhas com revisão pendente'} icon={AlertTriangle} tone="purple" />
      </div>

      <section className="panel knowledge-area-panel" id="area-analysis">
        <header className="panel-header"><div><h3>Desempenho por área de conhecimento</h3><p>Clique para isolar uma área; continue clicando para combinar outras</p></div><div className="interactive-chart-hint"><MousePointerClick size={14} /><span>Gráfico interativo</span><Badge tone={detailedSubmissions.length === filteredRows.length ? 'green' : 'ochre'}>{detailedSubmissions.length} detalhadas</Badge></div></header>
        {detailedSubmissions.length ? <div className="area-performance-list">{areaResults.map((item) => <button type="button" className={cn('area-performance-row', selectedAreas.includes(item.area) && selectedAreas.length < areas.length && 'selected')} aria-pressed={selectedAreas.includes(item.area) && selectedAreas.length < areas.length} key={item.area} onClick={() => toggleArea(item.area)}>
          <span className="area-performance-icon" style={{ '--area-color': item.color }}><BookOpenCheck size={18} /></span>
          <span className="area-performance-copy"><strong>{item.area}</strong><small>{item.questions} {item.questions === 1 ? 'questão' : 'questões'} · {item.attempts} respostas válidas{item.cancelled ? ` · ${item.cancelled} canceladas` : ''}</small></span>
          <span className="area-performance-bar"><span><i style={{ width: `${item.score}%`, background: item.color }} /></span><strong>{item.score}%</strong></span>
          <span className="area-performance-counts"><span><b>{item.correct}</b> acertos</span><span><b>{item.blank}</b> brancos</span><span><b>{item.review}</b> revisar</span></span>
        </button>)}</div> : <div className="area-analysis-empty"><BookOpenCheck size={24} /><div><strong>Análise indisponível para este recorte</strong><p>As correções antigas possuem apenas o total de acertos. Selecione outro recorte ou faça novas leituras detalhadas.</p></div></div>}
      </section>

      <div className="results-grid">
        <section className="panel class-comparison"><header className="panel-header"><div><h3>Comparativo por turma</h3><p>Clique para isolar uma turma; continue clicando para combinar outras</p></div></header><div className="horizontal-chart">{classResults.map((item) => <button type="button" className={cn(selectedClassIds.includes(item.classroom.id) && selectedClassIds.length < assessmentClasses.length && 'selected')} aria-pressed={selectedClassIds.includes(item.classroom.id) && selectedClassIds.length < assessmentClasses.length} key={item.classroom.id} onClick={() => toggleClass(item.classroom.id)}><span><strong>{item.classroom.name}</strong><small>{item.count} participantes</small></span><span><i style={{ width: `${item.avg}%`, background: item.classroom.color }} /><em>{item.avg}%</em></span></button>)}</div></section>
        <section className="panel distribution-panel">
          <header className="panel-header"><div><h3>Distribuição de desempenho</h3><p>Clique para isolar uma faixa; continue clicando para combinar outras</p></div><div className="chart-view-toggle" role="group" aria-label="Visualização da distribuição"><button type="button" className={distributionChartMode === 'general' ? 'active' : ''} aria-pressed={distributionChartMode === 'general'} onClick={() => setDistributionChartMode('general')}>Geral</button><button type="button" className={distributionChartMode === 'class' ? 'active' : ''} aria-pressed={distributionChartMode === 'class'} onClick={() => setDistributionChartMode('class')}>Por turma</button></div></header>
          {distributionChartMode === 'class' && <ClassChartLegend classes={chartClasses} />}
          <div className={cn('distribution-chart', distributionChartMode === 'class' && 'by-class')}>{distribution.map((item) => <button type="button" className={cn(selectedBandIds.includes(item.id) && selectedBandIds.length < performanceBands.length && 'selected')} aria-pressed={selectedBandIds.includes(item.id) && selectedBandIds.length < performanceBands.length} style={distributionChartMode === 'class' ? { minWidth: `${Math.max(92, chartClasses.length * 24 + 16)}px` } : undefined} key={item.id} onClick={() => toggleBand(item.id)}><span className={cn('distribution-bar', distributionChartMode === 'class' && 'grouped')}>{distributionChartMode === 'general' ? <i style={{ height: item.count ? `${Math.max(7, item.count / maxDistribution * 100)}%` : 0, background: item.color }}><span>{item.count}</span></i> : item.classes.map((classResult) => <i key={classResult.classroom.id} title={`${classResult.classroom.name}: ${classResult.count} aluno${classResult.count !== 1 ? 's' : ''}`} style={{ height: classResult.count ? `${Math.max(7, classResult.count / maxClassDistribution * 100)}%` : 0, background: classResult.color }}><span>{classResult.count}</span></i>)}</span><span className="distribution-label"><small>{item.label}</small><strong>{item.name}</strong></span></button>)}</div>
        </section>
      </div>

      <section className="panel question-performance-panel">
        <header className="panel-header"><div><h3>Desempenho por questão</h3><p>{selectedAreas.length === areas.length ? 'Todas as questões do simulado' : `Questões de ${selectedAreas.join(', ')}`} · clique em uma coluna para ver os detalhes</p></div><div className="chart-panel-actions"><div className="chart-view-toggle" role="group" aria-label="Visualização do desempenho por questão"><button type="button" className={questionChartMode === 'general' ? 'active' : ''} aria-pressed={questionChartMode === 'general'} onClick={() => setQuestionChartMode('general')}>Geral</button><button type="button" className={questionChartMode === 'class' ? 'active' : ''} aria-pressed={questionChartMode === 'class'} onClick={() => setQuestionChartMode('class')}>Por turma</button></div><Badge tone="neutral">{questionResults.length} questões</Badge></div></header>
        {questionChartMode === 'class' && <ClassChartLegend classes={chartClasses} />}
        {detailedSubmissions.length ? <><div className="question-chart-scroll"><div className={cn('question-chart', questionChartMode === 'class' && 'by-class')} style={{ minWidth: `${Math.max(520, questionResults.length * (questionChartMode === 'class' ? Math.max(44, chartClasses.length * 30 + 8) : 36))}px` }}>{questionResults.map((item) => <button type="button" className={cn(selectedQuestion === item.index && 'selected')} style={questionChartMode === 'class' ? { width: `${Math.max(44, chartClasses.length * 30 + 8)}px`, minWidth: `${Math.max(44, chartClasses.length * 30 + 8)}px` } : undefined} key={item.index} title={`Questão ${item.number}: ${item.score}% de acertos${item.cancelled ? ` · ${item.cancelled} cancelada(s)` : ''}`} onClick={() => setSelectedQuestion(selectedQuestion === item.index ? null : item.index)}><span className={cn(questionChartMode === 'class' && 'grouped')}>{questionChartMode === 'general' ? <><i style={{ height: `${item.score}%`, background: item.score < 40 ? '#b9675f' : item.score < 60 ? '#c69558' : item.score < 80 ? '#7b9b72' : '#3f7968' }} /><em>{item.score}%</em></> : classQuestionResults.map((classResult) => { const result = classResult.results.get(item.index); return <i key={classResult.classroom.id} title={`${classResult.classroom.name}: ${result?.attempts ? `${result.score}% de acertos` : 'sem respostas'}`} style={{ height: result?.attempts ? `${result.score}%` : 0, background: classResult.color }}><em>{result?.attempts ? `${result.score}%` : '—'}</em></i> })}</span><small>Q{item.number}</small></button>)}</div></div>{selectedQuestionResult && <div className="question-selection-detail"><span><strong>Questão {selectedQuestionResult.number}</strong><small>{selectedQuestionResult.area}</small></span><div><b>{selectedQuestionResult.score}%</b><small>aproveitamento geral</small></div><div><b>{selectedQuestionResult.correct}</b><small>acertos</small></div><div><b>{selectedQuestionResult.wrong}</b><small>erros</small></div><div><b>{selectedQuestionResult.blank}</b><small>brancos</small></div><div><b>{selectedQuestionResult.cancelled}</b><small>canceladas</small></div><div><b>{selectedQuestionResult.review}</b><small>revisar</small></div></div>}</> : <div className="area-analysis-empty"><BarChart3 size={24} /><div><strong>Sem respostas detalhadas</strong><p>Não há dados por questão disponíveis para o recorte selecionado.</p></div></div>}
      </section>

      <section className="pedagogical-insight">
        <span><Lightbulb size={22} /></span><div><div className="eyebrow">LEITURA PEDAGÓGICA</div><h3>{weakestArea ? `${weakestArea.area} apresenta o menor aproveitamento no recorte: ${weakestArea.score}%.` : 'Ajuste os filtros para gerar uma leitura por área.'}</h3><p>{weakestArea ? `Foram ${weakestArea.correct} acertos em ${weakestArea.attempts} respostas analisadas. Use os gráficos interativos para localizar turmas, faixas e questões prioritárias.` : 'O sistema destacará automaticamente a área que requer maior atenção.'}</p></div><button onClick={() => document.getElementById('area-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver análise por área <ArrowUpRight size={16} /></button>
      </section>

      <section className="panel ranking-panel"><header className="panel-header"><div><h3>Resultados por aluno</h3><p>Ranking atualizado conforme os filtros do painel</p></div><Badge tone="neutral">{studentRows.length} corrigidos</Badge></header>{studentRows.length ? <div className="table-wrap"><table><thead><tr><th>#</th><th>ALUNO</th><th>TURMA</th><th>ACERTOS</th><th>EM BRANCO</th><th>DESEMPENHO</th><th>STATUS</th></tr></thead><tbody>{studentRows.map((item, index) => <tr key={item.id}><td><span className={index < 3 ? 'rank-top' : 'rank'}>{index + 1}</span></td><td><div className="student-name"><span style={{ background: `${item.classroom?.color}1c`, color: item.classroom?.color }}>{initials(item.student?.name)}</span><strong>{item.student?.name || 'Aluno removido'}</strong></div></td><td>{item.classroom?.name || '—'}</td><td><strong>{item.correct}</strong> / {item.total}</td><td>{item.blank}</td><td><div className="student-score"><span><i style={{ width: `${item.score}%` }} /></span><strong>{item.score}%</strong>{item.score >= avg ? <TrendingUp size={15} /> : <TrendingDown size={15} />}</div></td><td><Badge tone={item.status === 'Revisar' ? assessmentClosed ? 'neutral' : 'ochre' : 'green'}>{item.status === 'Revisar' && assessmentClosed ? 'Encerrado com ressalva' : item.status}</Badge></td></tr>)}</tbody></table></div> : <div className="results-empty-filter"><BarChart3 size={25} /><strong>Nenhum resultado neste recorte</strong><p>Altere a turma, a área ou a faixa de desempenho.</p><Button variant="ghost" icon={RotateCcw} onClick={resetFilters}>Limpar filtros</Button></div>}</section>
    </div>
  )
}
