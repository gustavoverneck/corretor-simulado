import {
  UsersRound, ClipboardList, ScanLine, TrendingUp, ArrowRight, Plus, Upload,
  Printer, MoreHorizontal, Clock3, CheckCircle2, AlertTriangle, CalendarDays,
} from 'lucide-react'
import { Badge, Button, StatCard } from '../components/ui'
import { average, formatDate } from '../lib/utils'

function PerformanceChart({ submissions }) {
  const bars = [58, 66, 62, 71, 69, 76, average(submissions.map((item) => item.score)) || 74]
  const labels = ['Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago']
  return (
    <div className="performance-chart">
      <div className="chart-y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <div className="chart-body">
        {[0, 1, 2, 3].map((line) => <i key={line} className="chart-line" style={{ top: `${line * 25}%` }} />)}
        <div className="chart-bars">
          {bars.map((value, index) => (
            <div className="bar-slot" key={labels[index]}>
              <div className="bar-value" style={{ height: `${value}%` }}><span>{value}%</span></div>
              <small>{labels[index]}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DashboardPage({ data, setPage }) {
  const activeStudents = data.students.filter((student) => student.status.toLowerCase() === 'ativo').length
  const corrected = data.submissions.filter((item) => item.status === 'Corrigido')
  const review = data.submissions.filter((item) => item.status === 'Revisar').length
  const avg = average(corrected.map((item) => item.score))
  const recent = [...data.assessments].sort((a, b) => new Date(b.date) - new Date(a.date))
  const applied = data.submissions.length

  return (
    <div className="dashboard-page page-stack">
      <div className="welcome-strip">
        <div><span>QUARTA-FEIRA, 05 DE AGOSTO</span><h2>Bom dia.</h2><p>Você tem <b>{review} folhas aguardando revisão</b> antes de fechar a correção.</p></div>
        <div className="welcome-actions">
          <Button variant="secondary" icon={Upload} onClick={() => setPage('correction')}>Corrigir folhas</Button>
          <Button icon={Plus} onClick={() => setPage('assessments')}>Novo simulado</Button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Alunos ativos" value={activeStudents} note={`em ${data.classes.length} turmas`} icon={UsersRound} tone="green" trend="+4" />
        <StatCard label="Simulados" value={data.assessments.length} note="neste trimestre" icon={ClipboardList} tone="ochre" trend="+1" />
        <StatCard label="Folhas corrigidas" value={applied} note="últimos 30 dias" icon={ScanLine} tone="purple" trend="+63" />
        <StatCard label="Média geral" value={`${avg}%`} note="vs. simulado anterior" icon={TrendingUp} tone="blue" trend="+3,8%" />
      </div>

      <div className="dashboard-main-grid">
        <section className="panel">
          <header className="panel-header">
            <div><h3>Desempenho ao longo do ano</h3><p>Média geral de acertos em todos os simulados</p></div>
            <select aria-label="Período"><option>2026</option></select>
          </header>
          <PerformanceChart submissions={corrected} />
        </section>

        <section className="panel next-event">
          <header className="panel-header"><div><h3>Próxima aplicação</h3><p>Agenda da escola</p></div><CalendarDays size={19} /></header>
          <div className="event-date"><strong>12</strong><span>AGO<small>Quarta-feira</small></span></div>
          <div className="event-copy">
            <Badge tone="green">Pronto para aplicar</Badge>
            <h4>Simulado SAEB · Agosto</h4>
            <p>9º A e 9º B <i /> 40 questões</p>
          </div>
          <div className="event-progress"><span><b>60 de 60</b> folhas geradas</span><strong>100%</strong><i><em /></i></div>
          <Button variant="secondary" icon={Printer} onClick={() => setPage('assessments')}>Abrir e imprimir folhas</Button>
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div><h3>Simulados recentes</h3><p>Aplicações criadas e em andamento</p></div>
          <button className="text-button" onClick={() => setPage('assessments')}>Ver todos <ArrowRight size={15} /></button>
        </header>
        <div className="table-wrap">
          <table>
            <thead><tr><th>SIMULADO</th><th>TURMAS</th><th>APLICAÇÃO</th><th>PROGRESSO</th><th>STATUS</th><th /></tr></thead>
            <tbody>
              {recent.map((assessment, index) => {
                const submissions = data.submissions.filter((item) => item.assessmentId === assessment.id)
                const studentTotal = data.students.filter((student) => assessment.classIds.includes(student.classId) && student.status === 'Ativo').length
                const progress = studentTotal ? Math.round(submissions.length / studentTotal * 100) : 0
                const statusTone = assessment.status.includes('Finalizado') ? 'neutral' : assessment.status.includes('andamento') ? 'ochre' : 'green'
                return (
                  <tr key={assessment.id}>
                    <td><div className="title-cell"><span className={`doc-icon doc-${index % 3}`}><ClipboardList size={17} /></span><span><strong>{assessment.title}</strong><small>{assessment.questionCount} questões · {assessment.subjects.join(' + ')}</small></span></div></td>
                    <td><div className="class-pills">{assessment.classIds.map((id) => <span key={id}>{data.classes.find((item) => item.id === id)?.name}</span>)}</div></td>
                    <td>{formatDate(assessment.date, { year: false })}</td>
                    <td><div className="mini-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{submissions.length}/{studentTotal}</small></div></td>
                    <td><Badge tone={statusTone} dot>{assessment.status}</Badge></td>
                    <td><button className="icon-button"><MoreHorizontal size={18} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="insight-strip">
        <span className="insight-icon"><TrendingUp size={20} /></span>
        <div><strong>Um bom sinal nos resultados</strong><p>A média das turmas subiu 3,8 pontos desde a última aplicação. Matemática teve o maior avanço.</p></div>
        <button onClick={() => setPage('results')}>Explorar resultados <ArrowRight size={15} /></button>
        <span className="insight-decoration"><CheckCircle2 /><AlertTriangle /><Clock3 /></span>
      </div>
    </div>
  )
}
