import { useMemo, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, UsersRound, Target, Download, Award, AlertTriangle, ArrowUpRight, Lightbulb, BookOpenCheck } from 'lucide-react'
import { Badge, Button, StatCard } from '../components/ui'
import { average, downloadBlob, initials } from '../lib/utils'
import { getQuestionAreas } from '../lib/knowledgeAreas'

const areaColors = ['#47776a', '#a47245', '#6b6682', '#52718a', '#a65f5a', '#748b5f', '#8b6d48', '#5d7180']

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
      const area = questionAreas[index]
      const item = summary.get(area)
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

export function ResultsPage({ data, notify }) {
  const correctedAssessments = data.assessments.filter((assessment) => data.submissions.some((submission) => submission.assessmentId === assessment.id))
  const [assessmentId, setAssessmentId] = useState(correctedAssessments[0]?.id || '')
  const assessment = data.assessments.find((item) => item.id === assessmentId)
  const submissions = data.submissions.filter((item) => item.assessmentId === assessmentId)
  const avg = average(submissions.map((item) => item.score))
  const studentRows = useMemo(() => submissions.map((submission) => ({
    ...submission,
    student: data.students.find((item) => item.id === submission.studentId),
  })).sort((a, b) => b.score - a.score), [submissions, data.students])
  const detailedSubmissions = submissions.filter((item) => Array.isArray(item.answers))
  const areaResults = calculateAreaResults(assessment, submissions)
  const weakestArea = [...areaResults].filter((item) => item.attempts > 0).sort((a, b) => a.score - b.score)[0]

  const classResults = assessment?.classIds.map((classId) => {
    const classroom = data.classes.find((item) => item.id === classId)
    const ids = new Set(data.students.filter((student) => student.classId === classId).map((student) => student.id))
    const classSubmissions = submissions.filter((item) => ids.has(item.studentId))
    return { classroom, count: classSubmissions.length, avg: average(classSubmissions.map((item) => item.score)) }
  }) || []

  const distribution = [
    { label: '0–39%', count: submissions.filter((item) => item.score < 40).length, color: '#b9675f' },
    { label: '40–59%', count: submissions.filter((item) => item.score >= 40 && item.score < 60).length, color: '#c69558' },
    { label: '60–79%', count: submissions.filter((item) => item.score >= 60 && item.score < 80).length, color: '#7b9b72' },
    { label: '80–100%', count: submissions.filter((item) => item.score >= 80).length, color: '#3f7968' },
  ]
  const maxDistribution = Math.max(1, ...distribution.map((item) => item.count))

  function exportResults() {
    const header = ['Matrícula', 'Aluno', 'Acertos', 'Erros', 'Brancos', 'Múltiplas', 'Nota (%)']
    const rows = studentRows.map((item) => [item.student?.registration, item.student?.name, item.correct, item.wrong, item.blank, item.multiple, item.score])
    const areaHeader = ['Área / componente', 'Questões', 'Respostas analisadas', 'Acertos', 'Erros', 'Em branco', 'Para revisão', 'Aproveitamento (%)']
    const areaRows = areaResults.map((item) => [item.area, item.questions, item.attempts, item.correct, item.wrong, item.blank, item.review, item.score])
    const csv = [header, ...rows, [], ['ANÁLISE POR ÁREA'], areaHeader, ...areaRows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n')
    downloadBlob(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }), `resultados-${assessment?.code || 'simulado'}.csv`)
    notify('Relatório exportado', 'O arquivo CSV está pronto para abrir no Excel.')
  }

  if (!assessment) return <div className="panel no-results"><BarChart3 size={32} /><h3>Ainda não há resultados</h3><p>Corrija ao menos uma folha para visualizar esta área.</p></div>

  return (
    <div className="page-stack results-page">
      <div className="page-actions-row results-selector"><label><span>SIMULADO ANALISADO</span><select value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)}>{correctedAssessments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><Button variant="secondary" icon={Download} onClick={exportResults}>Exportar relatório</Button></div>
      <div className="stats-grid">
        <StatCard label="Média geral" value={`${avg}%`} note="de aproveitamento" icon={Target} tone="green" trend="+3,8%" />
        <StatCard label="Participação" value={`${submissions.length}`} note={`de ${data.students.filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo').length} alunos`} icon={UsersRound} tone="blue" />
        <StatCard label="Maior resultado" value={`${studentRows[0]?.score || 0}%`} note={studentRows[0]?.student?.name?.split(' ')[0] || '—'} icon={Award} tone="ochre" />
        <StatCard label="Para revisão" value={submissions.filter((item) => item.status === 'Revisar').length} note="folhas com ressalva" icon={AlertTriangle} tone="purple" />
      </div>

      <section className="panel knowledge-area-panel" id="area-analysis">
        <header className="panel-header"><div><h3>Desempenho por área de conhecimento</h3><p>Acertos agregados conforme a classificação de cada questão</p></div><Badge tone={detailedSubmissions.length === submissions.length ? 'green' : 'ochre'}>{detailedSubmissions.length} de {submissions.length} correções detalhadas</Badge></header>
        {detailedSubmissions.length ? <div className="area-performance-list">{areaResults.map((item) => <article key={item.area}>
          <span className="area-performance-icon" style={{ '--area-color': item.color }}><BookOpenCheck size={18} /></span>
          <div className="area-performance-copy"><strong>{item.area}</strong><small>{item.questions} {item.questions === 1 ? 'questão' : 'questões'} · {item.attempts} respostas analisadas</small></div>
          <div className="area-performance-bar"><div><i style={{ width: `${item.score}%`, background: item.color }} /></div><strong>{item.score}%</strong></div>
          <div className="area-performance-counts"><span><b>{item.correct}</b> acertos</span><span><b>{item.blank}</b> brancos</span><span><b>{item.review}</b> revisar</span></div>
        </article>)}</div> : <div className="area-analysis-empty"><BookOpenCheck size={24} /><div><strong>Análise indisponível para estas correções</strong><p>As correções antigas possuem apenas o total de acertos. Novas leituras guardarão as respostas necessárias para calcular cada área.</p></div></div>}
      </section>

      <div className="results-grid">
        <section className="panel class-comparison"><header className="panel-header"><div><h3>Comparativo por turma</h3><p>Percentual médio de acertos</p></div></header><div className="horizontal-chart">{classResults.map((item) => <div key={item.classroom?.id}><span><strong>{item.classroom?.name}</strong><small>{item.count} participantes</small></span><div><i style={{ width: `${item.avg}%`, background: item.classroom?.color }} /><em>{item.avg}%</em></div></div>)}</div></section>
        <section className="panel distribution-panel"><header className="panel-header"><div><h3>Distribuição de desempenho</h3><p>Alunos por faixa de acertos</p></div></header><div className="distribution-chart">{distribution.map((item) => <div key={item.label}><div className="distribution-bar"><i style={{ height: `${Math.max(5, item.count / maxDistribution * 100)}%`, background: item.color }}><span>{item.count}</span></i></div><small>{item.label}</small></div>)}</div></section>
      </div>

      <section className="pedagogical-insight">
        <span><Lightbulb size={22} /></span><div><div className="eyebrow">LEITURA PEDAGÓGICA</div><h3>{weakestArea ? `${weakestArea.area} apresenta o menor aproveitamento: ${weakestArea.score}%.` : 'Classifique as questões para gerar uma leitura por área.'}</h3><p>{weakestArea ? `Foram ${weakestArea.correct} acertos em ${weakestArea.attempts} respostas analisadas nesta área. Use esse recorte para priorizar a próxima intervenção pedagógica.` : 'Depois das próximas correções detalhadas, o sistema destacará automaticamente a área que requer maior atenção.'}</p></div><button onClick={() => document.getElementById('area-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Ver análise por área <ArrowUpRight size={16} /></button>
      </section>

      <section className="panel ranking-panel"><header className="panel-header"><div><h3>Resultados por aluno</h3><p>Classificação apenas para apoio pedagógico</p></div><Badge tone="neutral">{studentRows.length} corrigidos</Badge></header><div className="table-wrap"><table><thead><tr><th>#</th><th>ALUNO</th><th>TURMA</th><th>ACERTOS</th><th>EM BRANCO</th><th>DESEMPENHO</th><th>STATUS</th></tr></thead><tbody>{studentRows.map((item, index) => { const classroom = data.classes.find((entry) => entry.id === item.student?.classId); return <tr key={item.id}><td><span className={index < 3 ? 'rank-top' : 'rank'}>{index + 1}</span></td><td><div className="student-name"><span style={{ background: `${classroom?.color}1c`, color: classroom?.color }}>{initials(item.student?.name)}</span><strong>{item.student?.name}</strong></div></td><td>{classroom?.name}</td><td><strong>{item.correct}</strong> / {assessment.questionCount}</td><td>{item.blank}</td><td><div className="student-score"><span><i style={{ width: `${item.score}%` }} /></span><strong>{item.score}%</strong>{item.score >= avg ? <TrendingUp size={15} /> : <TrendingDown size={15} />}</div></td><td><Badge tone={item.status === 'Revisar' ? 'ochre' : 'green'}>{item.status}</Badge></td></tr> })}</tbody></table></div></section>
    </div>
  )
}
