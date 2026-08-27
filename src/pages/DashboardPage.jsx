import { useMemo, useState } from 'react'
import {
  UsersRound, ClipboardList, ScanLine, TrendingUp, TrendingDown, ArrowRight, Plus,
  Upload, AlertTriangle, CalendarDays, BarChart3, CheckCircle2,
} from 'lucide-react'
import { Badge, Button, StatCard } from '../components/ui'
import { average, formatDate } from '../lib/utils'
import { getAssessmentStatusLabel, getPendingReviewSubmissions, isAssessmentClosed } from '../lib/assessment'

function assessmentDate(value) {
  if (!value) return null
  const parsed = new Date(String(value).length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function assessmentTimestamp(assessment) {
  return assessmentDate(assessment.date)?.getTime() || Date.parse(assessment.createdAt) || 0
}

function getGreeting(date) {
  const hour = date.getHours()
  if (hour < 12) return 'Bom dia.'
  if (hour < 18) return 'Boa tarde.'
  return 'Boa noite.'
}

function getStatusTone(status) {
  if (['Encerrado', 'Finalizado'].includes(String(status))) return 'neutral'
  if (String(status).toLowerCase().includes('andamento')) return 'ochre'
  return 'green'
}

function PerformanceChart({ points }) {
  if (!points.length) {
    return (
      <div className="dashboard-chart-empty">
        <BarChart3 size={28} />
        <strong>Ainda não há desempenho consolidado</strong>
        <p>As médias aparecerão aqui quando houver correções validadas no período.</p>
      </div>
    )
  }

  return (
    <div className="performance-chart">
      <div className="chart-y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <div className="chart-body">
        {[0, 1, 2, 3].map((line) => <i key={line} className="chart-line" style={{ top: `${line * 25}%` }} />)}
        <div className="chart-bars">
          {points.map((point) => (
            <div className="bar-slot" key={point.id} title={`${point.title}: ${point.value}% em ${point.count} correção(ões)`}>
              <div className="bar-value" style={{ height: `${point.value}%` }} role="img" aria-label={`${point.title}: ${point.value}%`}>
                <span>{point.value}%</span>
              </div>
              <small>{point.label}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DashboardPage({ data, setPage }) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const availableYears = useMemo(() => [...new Set(data.assessments
    .map((assessment) => assessmentDate(assessment.date)?.getFullYear())
    .filter(Number.isFinite))]
    .sort((first, second) => second - first), [data.assessments])
  const [requestedYear, setRequestedYear] = useState(null)
  const selectedYear = availableYears.includes(requestedYear)
    ? requestedYear
    : availableYears[0] || currentYear

  const activeStudents = data.students.filter((student) => String(student.status).toLowerCase() === 'ativo')
  const assessments = data.assessments.filter((assessment) => assessmentDate(assessment.date)?.getFullYear() === selectedYear)
  const assessmentIds = new Set(assessments.map((assessment) => assessment.id))
  const periodSubmissions = data.submissions.filter((submission) => assessmentIds.has(submission.assessmentId))
  const corrected = periodSubmissions.filter((submission) => submission.status === 'Corrigido')
  const review = getPendingReviewSubmissions(data.submissions, data.assessments).length
  const avg = average(corrected.map((submission) => submission.score))
  const expectedSubmissions = assessments.reduce((total, assessment) => total + activeStudents.filter((student) => assessment.classIds.includes(student.classId)).length, 0)
  const coverage = expectedSubmissions ? Math.min(100, Math.round(periodSubmissions.length / expectedSubmissions * 100)) : 0
  const recent = [...assessments].sort((first, second) => assessmentTimestamp(second) - assessmentTimestamp(first)).slice(0, 6)

  const performancePoints = [...assessments]
    .sort((first, second) => assessmentTimestamp(first) - assessmentTimestamp(second))
    .map((assessment) => {
      const submissions = corrected.filter((submission) => submission.assessmentId === assessment.id)
      if (!submissions.length) return null
      return {
        id: assessment.id,
        title: assessment.title,
        label: assessment.code || assessment.title,
        value: average(submissions.map((submission) => submission.score)),
        count: submissions.length,
      }
    })
    .filter(Boolean)
    .slice(-7)

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const unfinished = assessments.filter((assessment) => !isAssessmentClosed(assessment))
  const upcomingAssessment = [...unfinished]
    .filter((assessment) => {
      const date = assessmentDate(assessment.date)
      return date && date >= today
    })
    .sort((first, second) => assessmentTimestamp(first) - assessmentTimestamp(second))[0]
  const pendingAssessment = [...unfinished]
    .filter((assessment) => assessment.status === 'Pronto para aplicar')
    .sort((first, second) => assessmentTimestamp(second) - assessmentTimestamp(first))[0]
  const featuredAssessment = upcomingAssessment || pendingAssessment
  const featuredDate = assessmentDate(featuredAssessment?.date)
  const featuredSubmissions = featuredAssessment
    ? data.submissions.filter((submission) => submission.assessmentId === featuredAssessment.id)
    : []
  const featuredStudents = featuredAssessment
    ? activeStudents.filter((student) => featuredAssessment.classIds.includes(student.classId))
    : []
  const featuredProgress = featuredStudents.length
    ? Math.min(100, Math.round(featuredSubmissions.length / featuredStudents.length * 100))
    : 0
  const isOverdue = Boolean(featuredDate && featuredDate < today)

  const latestPoint = performancePoints.at(-1)
  const previousPoint = performancePoints.at(-2)
  const performanceDelta = latestPoint && previousPoint ? latestPoint.value - previousPoint.value : null
  const insight = review > 0
    ? {
        icon: AlertTriangle,
        title: `${review} correção${review !== 1 ? 'ões precisam' : ' precisa'} de revisão`,
        text: 'Resolva marcações múltiplas, incertas ou folhas com enquadramento incompleto antes de consolidar os indicadores.',
        action: 'Abrir fila de revisões',
        page: 'correction',
        tone: 'warning',
      }
    : performanceDelta !== null
      ? {
          icon: performanceDelta >= 0 ? TrendingUp : TrendingDown,
          title: performanceDelta === 0
            ? 'A média permaneceu estável na aplicação mais recente'
            : `A média ${performanceDelta > 0 ? 'subiu' : 'caiu'} ${Math.abs(performanceDelta)} ponto${Math.abs(performanceDelta) !== 1 ? 's' : ''}`,
          text: `${latestPoint.title}: ${latestPoint.value}% · aplicação anterior: ${previousPoint.value}%.`,
          action: 'Explorar resultados',
          page: 'results',
          tone: performanceDelta >= 0 ? 'positive' : 'warning',
        }
      : corrected.length
        ? {
            icon: TrendingUp,
            title: 'Primeiro resultado consolidado no período',
            text: `${corrected.length} correção${corrected.length !== 1 ? 'ões validadas' : ' validada'} com média de ${avg}%.`,
            action: 'Explorar resultados',
            page: 'results',
            tone: 'positive',
          }
        : {
            icon: BarChart3,
            title: 'O painel aguarda as primeiras correções',
            text: 'Cadastre um simulado e corrija as folhas para formar a série histórica de participação e desempenho.',
            action: 'Ir para simulados',
            page: 'assessments',
            tone: 'neutral',
          }
  const InsightIcon = insight.icon

  const formattedToday = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  }).format(now).toUpperCase()

  return (
    <div className="dashboard-page page-stack">
      <div className="welcome-strip">
        <div>
          <span>{formattedToday}</span>
          <h2>{getGreeting(now)}</h2>
          <p>{review > 0
            ? <>Há <b>{review} folha{review !== 1 ? 's' : ''} aguardando revisão</b> antes da consolidação dos resultados.</>
            : 'Não há folhas aguardando revisão neste momento.'}</p>
        </div>
        <div className="welcome-actions">
          <Button variant="secondary" icon={Upload} onClick={() => setPage('correction')}>Corrigir folhas</Button>
          <Button icon={Plus} onClick={() => setPage('assessments')}>Novo simulado</Button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Alunos ativos" value={activeStudents.length} note={`distribuídos em ${data.classes.length} turma${data.classes.length !== 1 ? 's' : ''}`} icon={UsersRound} tone="green" />
        <StatCard label="Simulados no período" value={assessments.length} note={`ano letivo de ${selectedYear}`} icon={ClipboardList} tone="ochre" />
        <StatCard label="Folhas registradas" value={periodSubmissions.length} note={expectedSubmissions ? `${coverage}% do público previsto` : 'sem público previsto no período'} icon={ScanLine} tone="purple" />
        <StatCard label="Média validada" value={corrected.length ? `${avg}%` : '—'} note={corrected.length ? `${corrected.length} correção${corrected.length !== 1 ? 'ões consolidadas' : ' consolidada'}` : 'sem correções consolidadas'} icon={TrendingUp} tone="blue" />
      </div>

      <div className="dashboard-main-grid">
        <section className="panel">
          <header className="panel-header">
            <div><h3>Desempenho por simulado</h3><p>Média de acertos das correções validadas, em ordem de aplicação</p></div>
            <select value={selectedYear} onChange={(event) => setRequestedYear(Number(event.target.value))} aria-label="Ano do painel">
              {(availableYears.length ? availableYears : [selectedYear]).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </header>
          <PerformanceChart points={performancePoints} />
        </section>

        <section className="panel next-event">
          <header className="panel-header">
            <div><h3>{isOverdue ? 'Aplicação pendente' : 'Próxima aplicação'}</h3><p>Acompanhamento do período selecionado</p></div>
            <CalendarDays size={19} />
          </header>
          {featuredAssessment ? <>
            <div className="event-date">
              <strong>{String(featuredDate?.getDate() || '').padStart(2, '0')}</strong>
              <span>{featuredDate?.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}<small>{featuredDate?.toLocaleDateString('pt-BR', { weekday: 'long' })}</small></span>
            </div>
            <div className="event-copy">
              <Badge tone={isOverdue ? 'ochre' : getStatusTone(featuredAssessment.status)}>{isOverdue ? 'Data prevista ultrapassada' : getAssessmentStatusLabel(featuredAssessment)}</Badge>
              <h4>{featuredAssessment.title}</h4>
              <p>{featuredAssessment.classIds.map((id) => data.classes.find((item) => item.id === id)?.name).filter(Boolean).join(' e ') || 'Sem turmas'} <i /> {featuredAssessment.questionCount} questões</p>
            </div>
            <div className="event-progress">
              <span><b>{featuredSubmissions.length} de {featuredStudents.length}</b> correções registradas</span>
              <strong>{featuredProgress}%</strong>
              <i><em style={{ width: `${featuredProgress}%` }} /></i>
            </div>
            <Button variant="secondary" icon={ClipboardList} onClick={() => setPage('assessments')}>Abrir simulado</Button>
          </> : <div className="dashboard-event-empty">
            <CheckCircle2 size={28} />
            <strong>Nenhuma aplicação pendente</strong>
            <p>Não há simulados futuros ou prontos para aplicar em {selectedYear}.</p>
            <Button variant="secondary" icon={Plus} onClick={() => setPage('assessments')}>Criar simulado</Button>
          </div>}
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div><h3>Simulados do período</h3><p>Cobertura das aplicações com base nos alunos ativos das turmas</p></div>
          <button className="text-button" onClick={() => setPage('assessments')}>Ver todos <ArrowRight size={15} /></button>
        </header>
        {recent.length ? <div className="table-wrap">
          <table>
            <thead><tr><th>SIMULADO</th><th>TURMAS</th><th>APLICAÇÃO</th><th>COBERTURA</th><th>STATUS</th><th /></tr></thead>
            <tbody>
              {recent.map((assessment, index) => {
                const submissions = data.submissions.filter((submission) => submission.assessmentId === assessment.id)
                const studentTotal = activeStudents.filter((student) => assessment.classIds.includes(student.classId)).length
                const progress = studentTotal ? Math.min(100, Math.round(submissions.length / studentTotal * 100)) : 0
                return (
                  <tr key={assessment.id}>
                    <td><div className="title-cell"><span className={`doc-icon doc-${index % 3}`}><ClipboardList size={17} /></span><span><strong>{assessment.title}</strong><small>{assessment.questionCount} questões · {assessment.subjects.join(' + ')}</small></span></div></td>
                    <td><div className="class-pills">{assessment.classIds.map((id) => <span key={id}>{data.classes.find((item) => item.id === id)?.name || 'Turma removida'}</span>)}</div></td>
                    <td>{formatDate(assessment.date, { year: false })}</td>
                    <td><div className="mini-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{submissions.length}/{studentTotal}</small></div></td>
                    <td><Badge tone={getStatusTone(assessment.status)} dot>{getAssessmentStatusLabel(assessment)}</Badge></td>
                    <td><button className="text-button" onClick={() => setPage('assessments')}>Abrir <ArrowRight size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div> : <div className="dashboard-table-empty">
          <ClipboardList size={25} />
          <div><strong>Nenhum simulado em {selectedYear}</strong><p>Crie uma aplicação para começar a acompanhar cobertura e desempenho.</p></div>
        </div>}
      </section>

      <div className={`insight-strip insight-${insight.tone}`}>
        <span className="insight-icon"><InsightIcon size={20} /></span>
        <div><strong>{insight.title}</strong><p>{insight.text}</p></div>
        <button onClick={() => setPage(insight.page)}>{insight.action} <ArrowRight size={15} /></button>
        <span className="insight-decoration"><TrendingUp /><AlertTriangle /><CalendarDays /></span>
      </div>
    </div>
  )
}
