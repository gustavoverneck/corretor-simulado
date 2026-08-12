import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowUpRight, Award, BarChart3, BookOpenCheck, Download,
  Lightbulb, MousePointerClick, RotateCcw, SlidersHorizontal, Target,
  TrendingDown, TrendingUp, UsersRound,
} from 'lucide-react'
import { Badge, Button, StatCard } from '../components/ui'
import { average, cn, downloadBlob, initials } from '../lib/utils'
import { getQuestionAreas, uniqueQuestionAreas } from '../lib/knowledgeAreas'

const areaColors = ['#47776a', '#a47245', '#6b6682', '#52718a', '#a65f5a', '#748b5f', '#8b6d48', '#5d7180']
const performanceBands = [
  { id: 'low', label: '0–39%', min: 0, max: 40, color: '#b9675f' },
  { id: 'basic', label: '40–59%', min: 40, max: 60, color: '#c69558' },
  { id: 'adequate', label: '60–79%', min: 60, max: 80, color: '#7b9b72' },
  { id: 'advanced', label: '80–100%', min: 80, max: 101, color: '#3f7968' },
]

function matchesBand(score, bandId) {
  if (bandId === 'all') return true
  const band = performanceBands.find((item) => item.id === bandId)
  return band ? score >= band.min && score < band.max : true
}

function calculateSubmissionMetrics(submission, assessment, area = 'all') {
  const questionAreas = getQuestionAreas(assessment)
  const questionIndexes = questionAreas
    .map((questionArea, index) => area === 'all' || questionArea === area ? index : -1)
    .filter((index) => index >= 0)

  if (!Array.isArray(submission.answers)) {
    if (area !== 'all') return null
    return {
      total: assessment.questionCount,
      correct: Number(submission.correct || 0),
      wrong: Number(submission.wrong || 0),
      blank: Number(submission.blank || 0),
      multiple: Number(submission.multiple || 0),
      uncertain: Number(submission.uncertain || 0),
      review: Number(submission.multiple || 0) + Number(submission.uncertain || 0),
      score: Number(submission.score || 0),
    }
  }

  const metrics = { total: questionIndexes.length, correct: 0, wrong: 0, blank: 0, multiple: 0, uncertain: 0, review: 0, score: 0 }
  questionIndexes.forEach((index) => {
    const status = submission.answers[index]?.status || 'blank'
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
    if (!summary.has(area)) summary.set(area, { area, questions: 0, attempts: 0, correct: 0, wrong: 0, blank: 0, review: 0 })
    summary.get(area).questions += 1
  })
  submissions.forEach((submission) => {
    if (!Array.isArray(submission.answers)) return
    submission.answers.forEach((answer, index) => {
      const item = summary.get(questionAreas[index])
      if (!item) return
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

function calculateQuestionResults(assessment, submissions, area) {
  if (!assessment) return []
  const questionAreas = getQuestionAreas(assessment)
  return questionAreas.map((questionArea, index) => {
    if (area !== 'all' && questionArea !== area) return null
    const result = { index, number: index + 1, area: questionArea, attempts: 0, correct: 0, wrong: 0, blank: 0, review: 0, score: 0 }
    submissions.forEach((submission) => {
      const answer = submission.answers?.[index]
      if (!answer) return
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

export function ResultsPage({ data, notify }) {
  const correctedAssessments = data.assessments.filter((assessment) => data.submissions.some((submission) => submission.assessmentId === assessment.id))
  const [assessmentId, setAssessmentId] = useState(correctedAssessments[0]?.id || '')
  const [classId, setClassId] = useState('all')
  const [area, setArea] = useState('all')
  const [bandId, setBandId] = useState('all')
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const assessment = data.assessments.find((item) => item.id === assessmentId)
  const assessmentClasses = assessment?.classIds.map((id) => data.classes.find((item) => item.id === id)).filter(Boolean) || []
  const areas = uniqueQuestionAreas(assessment)

  const resultRows = useMemo(() => data.submissions
    .filter((submission) => submission.assessmentId === assessmentId)
    .map((submission) => {
      const student = data.students.find((item) => item.id === submission.studentId)
      const rowClassId = student?.classId || submission.classId
      const classroom = data.classes.find((item) => item.id === rowClassId)
      const metrics = calculateSubmissionMetrics(submission, assessment, area)
      return metrics ? { ...submission, ...metrics, student, classroom, classId: rowClassId } : null
    })
    .filter(Boolean), [area, assessment, assessmentId, data.classes, data.students, data.submissions])

  const classScopedRows = resultRows.filter((item) => classId === 'all' || item.classId === classId)
  const filteredRows = classScopedRows.filter((item) => matchesBand(item.score, bandId))
  const studentRows = [...filteredRows].sort((first, second) => second.score - first.score || String(first.student?.name).localeCompare(String(second.student?.name), 'pt-BR'))
  const avg = average(studentRows.map((item) => item.score))
  const detailedSubmissions = filteredRows.filter((item) => Array.isArray(item.answers))
  const areaResults = calculateAreaResults(assessment, filteredRows)
  const weakestArea = [...areaResults].filter((item) => item.attempts > 0).sort((first, second) => first.score - second.score)[0]
  const questionResults = calculateQuestionResults(assessment, filteredRows, area)
  const selectedQuestionResult = questionResults.find((item) => item.index === selectedQuestion)

  const classResults = assessmentClasses.map((classroom) => {
    const rows = resultRows.filter((item) => item.classId === classroom.id && matchesBand(item.score, bandId))
    return { classroom, count: rows.length, avg: average(rows.map((item) => item.score)) }
  })

  const distribution = performanceBands.map((band) => ({
    ...band,
    count: classScopedRows.filter((item) => matchesBand(item.score, band.id)).length,
  }))
  const maxDistribution = Math.max(1, ...distribution.map((item) => item.count))
  const eligibleStudents = data.students.filter((student) => assessment?.classIds.includes(student.classId)
    && student.status === 'Ativo' && (classId === 'all' || student.classId === classId)).length
  const activeClass = data.classes.find((item) => item.id === classId)
  const activeBand = performanceBands.find((item) => item.id === bandId)
  const hasFilters = classId !== 'all' || area !== 'all' || bandId !== 'all'

  function changeAssessment(nextAssessmentId) {
    setAssessmentId(nextAssessmentId)
    setClassId('all')
    setArea('all')
    setBandId('all')
    setSelectedQuestion(null)
  }

  function changeArea(nextArea) {
    setArea(nextArea)
    setSelectedQuestion(null)
  }

  function resetFilters() {
    setClassId('all')
    setArea('all')
    setBandId('all')
    setSelectedQuestion(null)
  }

  function exportResults() {
    const filterRows = [
      ['Simulado', assessment.title],
      ['Turma', activeClass?.name || 'Todas'],
      ['Área / componente', area === 'all' ? 'Todas' : area],
      ['Faixa de desempenho', activeBand?.label || 'Todas'],
    ]
    const header = ['Matrícula', 'Aluno', 'Turma', 'Acertos', 'Erros', 'Brancos', 'Revisões', 'Aproveitamento (%)']
    const rows = studentRows.map((item) => [item.student?.registration, item.student?.name, item.classroom?.name, item.correct, item.wrong, item.blank, item.review, item.score])
    const areaHeader = ['Área / componente', 'Questões', 'Respostas analisadas', 'Acertos', 'Erros', 'Em branco', 'Para revisão', 'Aproveitamento (%)']
    const areaRows = areaResults.map((item) => [item.area, item.questions, item.attempts, item.correct, item.wrong, item.blank, item.review, item.score])
    const questionHeader = ['Questão', 'Área / componente', 'Respostas analisadas', 'Acertos', 'Erros', 'Em branco', 'Para revisão', 'Aproveitamento (%)']
    const questionRows = questionResults.map((item) => [item.number, item.area, item.attempts, item.correct, item.wrong, item.blank, item.review, item.score])
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
          <label><span>TURMA</span><select value={classId} onChange={(event) => setClassId(event.target.value)}><option value="all">Todas as turmas</option>{assessmentClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.shift}</option>)}</select></label>
          <label><span>ÁREA / COMPONENTE</span><select value={area} onChange={(event) => changeArea(event.target.value)}><option value="all">Todas as áreas</option>{areas.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>FAIXA</span><select value={bandId} onChange={(event) => setBandId(event.target.value)}><option value="all">Todas as faixas</option>{performanceBands.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
          <Button variant="ghost" icon={RotateCcw} disabled={!hasFilters} onClick={resetFilters}>Limpar filtros</Button>
        </div>
        <div className="results-filter-summary"><Badge tone={hasFilters ? 'blue' : 'neutral'}>{studentRows.length} resultado{studentRows.length !== 1 ? 's' : ''}</Badge><span>{activeClass?.name || 'Todas as turmas'} · {area === 'all' ? 'Todas as áreas' : area} · {activeBand?.label || 'Todas as faixas'}</span></div>
      </section>

      <div className="stats-grid">
        <StatCard label="Média do recorte" value={`${avg}%`} note={area === 'all' ? 'de aproveitamento' : `em ${area}`} icon={Target} tone="green" />
        <StatCard label="Participação" value={`${studentRows.length}`} note={bandId === 'all' ? `de ${eligibleStudents} alunos elegíveis` : `de ${classScopedRows.length} correções no recorte`} icon={UsersRound} tone="blue" />
        <StatCard label="Maior resultado" value={`${studentRows[0]?.score || 0}%`} note={studentRows[0]?.student?.name?.split(' ')[0] || '—'} icon={Award} tone="ochre" />
        <StatCard label="Para revisão" value={studentRows.filter((item) => item.status === 'Revisar').length} note="folhas com ressalva" icon={AlertTriangle} tone="purple" />
      </div>

      <section className="panel knowledge-area-panel" id="area-analysis">
        <header className="panel-header"><div><h3>Desempenho por área de conhecimento</h3><p>Clique em uma área para analisar somente as questões daquele componente</p></div><div className="interactive-chart-hint"><MousePointerClick size={14} /><span>Gráfico interativo</span><Badge tone={detailedSubmissions.length === filteredRows.length ? 'green' : 'ochre'}>{detailedSubmissions.length} detalhadas</Badge></div></header>
        {detailedSubmissions.length ? <div className="area-performance-list">{areaResults.map((item) => <button type="button" className={cn('area-performance-row', area === item.area && 'selected')} key={item.area} onClick={() => changeArea(area === item.area ? 'all' : item.area)}>
          <span className="area-performance-icon" style={{ '--area-color': item.color }}><BookOpenCheck size={18} /></span>
          <span className="area-performance-copy"><strong>{item.area}</strong><small>{item.questions} {item.questions === 1 ? 'questão' : 'questões'} · {item.attempts} respostas analisadas</small></span>
          <span className="area-performance-bar"><span><i style={{ width: `${item.score}%`, background: item.color }} /></span><strong>{item.score}%</strong></span>
          <span className="area-performance-counts"><span><b>{item.correct}</b> acertos</span><span><b>{item.blank}</b> brancos</span><span><b>{item.review}</b> revisar</span></span>
        </button>)}</div> : <div className="area-analysis-empty"><BookOpenCheck size={24} /><div><strong>Análise indisponível para este recorte</strong><p>As correções antigas possuem apenas o total de acertos. Selecione outro recorte ou faça novas leituras detalhadas.</p></div></div>}
      </section>

      <div className="results-grid">
        <section className="panel class-comparison"><header className="panel-header"><div><h3>Comparativo por turma</h3><p>Clique em uma turma para filtrar todo o painel</p></div></header><div className="horizontal-chart">{classResults.map((item) => <button type="button" className={cn(classId === item.classroom.id && 'selected')} key={item.classroom.id} onClick={() => setClassId(classId === item.classroom.id ? 'all' : item.classroom.id)}><span><strong>{item.classroom.name}</strong><small>{item.count} participantes</small></span><span><i style={{ width: `${item.avg}%`, background: item.classroom.color }} /><em>{item.avg}%</em></span></button>)}</div></section>
        <section className="panel distribution-panel"><header className="panel-header"><div><h3>Distribuição de desempenho</h3><p>Clique em uma faixa para selecionar os alunos</p></div></header><div className="distribution-chart">{distribution.map((item) => <button type="button" className={cn(bandId === item.id && 'selected')} key={item.id} onClick={() => setBandId(bandId === item.id ? 'all' : item.id)}><span className="distribution-bar"><i style={{ height: item.count ? `${Math.max(7, item.count / maxDistribution * 100)}%` : 0, background: item.color }}><span>{item.count}</span></i></span><small>{item.label}</small></button>)}</div></section>
      </div>

      <section className="panel question-performance-panel">
        <header className="panel-header"><div><h3>Desempenho por questão</h3><p>{area === 'all' ? 'Todas as questões do simulado' : `Questões classificadas em ${area}`} · clique em uma barra para ver os detalhes</p></div><Badge tone="neutral">{questionResults.length} questões</Badge></header>
        {detailedSubmissions.length ? <><div className="question-chart-scroll"><div className="question-chart" style={{ minWidth: `${Math.max(520, questionResults.length * 36)}px` }}>{questionResults.map((item) => <button type="button" className={cn(selectedQuestion === item.index && 'selected')} key={item.index} title={`Questão ${item.number}: ${item.score}% de acertos`} onClick={() => setSelectedQuestion(selectedQuestion === item.index ? null : item.index)}><span><i style={{ height: `${item.score}%`, background: item.score < 40 ? '#b9675f' : item.score < 60 ? '#c69558' : item.score < 80 ? '#7b9b72' : '#3f7968' }} /><em>{item.score}%</em></span><small>Q{item.number}</small></button>)}</div></div>{selectedQuestionResult && <div className="question-selection-detail"><span><strong>Questão {selectedQuestionResult.number}</strong><small>{selectedQuestionResult.area}</small></span><div><b>{selectedQuestionResult.score}%</b><small>aproveitamento</small></div><div><b>{selectedQuestionResult.correct}</b><small>acertos</small></div><div><b>{selectedQuestionResult.wrong}</b><small>erros</small></div><div><b>{selectedQuestionResult.blank}</b><small>brancos</small></div><div><b>{selectedQuestionResult.review}</b><small>revisar</small></div></div>}</> : <div className="area-analysis-empty"><BarChart3 size={24} /><div><strong>Sem respostas detalhadas</strong><p>Não há dados por questão disponíveis para o recorte selecionado.</p></div></div>}
      </section>

      <section className="pedagogical-insight">
        <span><Lightbulb size={22} /></span><div><div className="eyebrow">LEITURA PEDAGÓGICA</div><h3>{weakestArea ? `${weakestArea.area} apresenta o menor aproveitamento no recorte: ${weakestArea.score}%.` : 'Ajuste os filtros para gerar uma leitura por área.'}</h3><p>{weakestArea ? `Foram ${weakestArea.correct} acertos em ${weakestArea.attempts} respostas analisadas. Use os gráficos interativos para localizar turmas, faixas e questões prioritárias.` : 'O sistema destacará automaticamente a área que requer maior atenção.'}</p></div><button onClick={() => document.getElementById('area-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver análise por área <ArrowUpRight size={16} /></button>
      </section>

      <section className="panel ranking-panel"><header className="panel-header"><div><h3>Resultados por aluno</h3><p>Ranking atualizado conforme os filtros do painel</p></div><Badge tone="neutral">{studentRows.length} corrigidos</Badge></header>{studentRows.length ? <div className="table-wrap"><table><thead><tr><th>#</th><th>ALUNO</th><th>TURMA</th><th>ACERTOS</th><th>EM BRANCO</th><th>DESEMPENHO</th><th>STATUS</th></tr></thead><tbody>{studentRows.map((item, index) => <tr key={item.id}><td><span className={index < 3 ? 'rank-top' : 'rank'}>{index + 1}</span></td><td><div className="student-name"><span style={{ background: `${item.classroom?.color}1c`, color: item.classroom?.color }}>{initials(item.student?.name)}</span><strong>{item.student?.name || 'Aluno removido'}</strong></div></td><td>{item.classroom?.name || '—'}</td><td><strong>{item.correct}</strong> / {item.total}</td><td>{item.blank}</td><td><div className="student-score"><span><i style={{ width: `${item.score}%` }} /></span><strong>{item.score}%</strong>{item.score >= avg ? <TrendingUp size={15} /> : <TrendingDown size={15} />}</div></td><td><Badge tone={item.status === 'Revisar' ? 'ochre' : 'green'}>{item.status}</Badge></td></tr>)}</tbody></table></div> : <div className="results-empty-filter"><BarChart3 size={25} /><strong>Nenhum resultado neste recorte</strong><p>Altere a turma, a área ou a faixa de desempenho.</p><Button variant="ghost" icon={RotateCcw} onClick={resetFilters}>Limpar filtros</Button></div>}</section>
    </div>
  )
}
