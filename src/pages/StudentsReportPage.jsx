import { useMemo, useState } from 'react'
import { AlertTriangle, Award, FileDown, Search, Target, TrendingDown, TrendingUp, UserRound, UsersRound, X } from 'lucide-react'
import { Badge, Button, EmptyState, StatCard } from '../components/ui'
import { StudentResultModal } from '../components/StudentResultModal'
import { ATTENTION_DROP, ATTENTION_SCORE, buildClassBenchmarks, buildStudentReport } from '../lib/studentReport'
import { createStudentReportPdf, formatDelta, STATUS_LABELS, studentReportFilename } from '../lib/studentReportPdf'
import { calculateSubmissionMetrics } from '../lib/resultsMetrics'
import { computeTriScores, isTriEnabled } from '../lib/tri'
import { cn, downloadBlob, normalize } from '../lib/utils'

const areaColors = ['#47776a', '#a47245', '#6b6682', '#52718a', '#a65f5a', '#748b5f', '#8b6d48', '#5d7180']
const statusTones = { done: 'green', review: 'ochre', absent: 'red', pending: 'neutral', voided: 'red' }

function band(score) {
  if (score === null || score === undefined) return ''
  return score < 40 ? 'is-low' : score < 60 ? 'is-basic' : score < 80 ? 'is-adequate' : 'is-advanced'
}

function Delta({ value }) {
  if (value === null || value === undefined) return <span className="student-delta">—</span>
  const Icon = value < 0 ? TrendingDown : TrendingUp
  return <span className={cn('student-delta', value < 0 ? 'is-down' : value > 0 ? 'is-up' : '')}>{value !== 0 && <Icon size={13} />}{formatDelta(value)}</span>
}

function EvolutionChart({ report }) {
  const points = report.done
  const [hover, setHover] = useState(null)
  if (points.length < 2) return <p className="student-chart-empty">A evolução aparece quando o aluno tiver pelo menos dois simulados corrigidos.</p>
  const size = { width: 640, height: 210, left: 38, right: 18, top: 18, bottom: 34 }
  const x = (index) => size.left + index * (size.width - size.left - size.right) / (points.length - 1)
  const y = (value) => size.top + (1 - value / 100) * (size.height - size.top - size.bottom)
  const path = (values) => values.map((value, index) => value === null ? null : `${x(index)},${y(value)}`).filter(Boolean).join(' ')
  const active = hover !== null ? points[hover] : null
  return (
    <div className="student-chart">
      <div className="student-chart-legend"><span><i className="is-student" /> {report.student.name.split(' ')[0]}</span><span><i className="is-class" /> Média da turma</span></div>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Evolução do aproveitamento do aluno e da turma por simulado" onMouseLeave={() => setHover(null)}>
        {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={size.left} x2={size.width - size.right} y1={y(value)} y2={y(value)} className="grid" /><text x={size.left - 8} y={y(value) + 3} textAnchor="end">{value}%</text></g>)}
        {active && <line x1={x(hover)} x2={x(hover)} y1={size.top} y2={size.height - size.bottom} className="crosshair" />}
        <polyline points={path(points.map((entry) => entry.classScore))} className="line-class" />
        <polyline points={path(points.map((entry) => entry.score))} className="line-student" />
        {points.map((entry, index) => <g key={entry.assessment.id}>
          {entry.classScore !== null && <circle cx={x(index)} cy={y(entry.classScore)} r="3.5" className="dot-class" />}
          <circle cx={x(index)} cy={y(entry.score)} r="4.5" className="dot-student" />
          <text x={x(index)} y={size.height - 12} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="axis-label">{entry.assessment.code || entry.assessment.title}</text>
          <rect x={x(index) - 30} y={size.top} width="60" height={size.height - size.top - size.bottom} fill="transparent" onMouseEnter={() => setHover(index)} />
        </g>)}
        {points.length <= 6 && points.map((entry, index) => <text key={`label-${entry.assessment.id}`} x={x(index)} y={y(entry.score) - 9} textAnchor="middle" className="value-label">{entry.score}%</text>)}
      </svg>
      {active && <div className="student-chart-tooltip" style={{ left: `${(x(hover) / size.width) * 100}%` }}><strong>{active.assessment.title}</strong><span>Aluno: {active.score}%</span><span>Turma: {active.classScore ?? '—'}%</span>{active.tri?.score && <span>TRI: {active.tri.score}</span>}</div>}
    </div>
  )
}

export function StudentsReportPage({ data, notify }) {
  const classes = useMemo(() => [...data.classes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })), [data.classes])
  const [classId, setClassId] = useState(() => classes[0]?.id || '')
  const [search, setSearch] = useState('')
  const [onlyAttention, setOnlyAttention] = useState(false)
  const [studentId, setStudentId] = useState(null)
  const [openAssessmentId, setOpenAssessmentId] = useState(null)
  const [exporting, setExporting] = useState(false)

  const benchmarks = useMemo(() => buildClassBenchmarks(data.assessments, data.submissions, data.students), [data.assessments, data.submissions, data.students])
  const triScores = useMemo(() => new Map(data.assessments.filter(isTriEnabled).map((assessment) => [assessment.id, computeTriScores(assessment, data.submissions)])), [data.assessments, data.submissions])
  const classroom = data.classes.find((item) => item.id === classId)
  const reports = useMemo(() => data.students
    .filter((student) => student.classId === classId && student.status === 'Ativo')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((student) => buildStudentReport({ student, assessments: data.assessments, submissions: data.submissions, benchmarks, triScores })),
  [benchmarks, classId, data.assessments, data.students, data.submissions, triScores])
  const query = normalize(search)
  const visible = reports.filter((report) => (!onlyAttention || report.attention) && (!query || normalize(`${report.student.name} ${report.student.registration}`).includes(query)))
  const report = reports.find((item) => item.student.id === studentId) || null
  const attentionCount = reports.filter((item) => item.attention).length
  const showTri = Boolean(report?.done.some((entry) => entry.tri?.score))
  const assessmentsInMatrix = report?.done || []

  const openEntry = report?.entries.find((entry) => entry.assessment.id === openAssessmentId && entry.submission && entry.status !== 'voided')
  const toRow = (submission, assessment) => {
    const student = data.students.find((item) => item.id === submission.studentId)
    const metrics = calculateSubmissionMetrics(submission, assessment)
    return metrics ? { ...submission, ...metrics, student, classroom: data.classes.find((item) => item.id === (student?.classId || submission.classId)), assessment, classId: student?.classId || submission.classId } : null
  }
  const openRow = openEntry ? toRow(openEntry.submission, openEntry.assessment) : null
  const studentRows = report ? report.done.map((entry) => toRow(entry.submission, entry.assessment)).filter(Boolean) : []
  const peerRows = openEntry ? data.submissions.filter((item) => item.assessmentId === openEntry.assessment.id && !item.voided).map((item) => toRow(item, openEntry.assessment)).filter(Boolean) : []

  async function exportPdf(selected) {
    if (!selected.length) return
    setExporting(true)
    try {
      const blob = await createStudentReportPdf({ reports: selected, classes: data.classes, school: data.school })
      downloadBlob(blob, studentReportFilename(selected, classroom))
      notify('Boletim gerado', selected.length === 1 ? `Boletim de ${selected[0].student.name}.` : `${selected.length} boletins, um aluno por página.`)
    } catch (error) {
      notify('Não foi possível gerar o boletim', error.message, 'warning')
    } finally {
      setExporting(false)
    }
  }

  if (!classes.length) return <EmptyState icon={UsersRound} title="Nenhuma turma cadastrada" description="Cadastre turmas e alunos para ver o relatório de cada aluno." />

  return (
    <div className="students-report-page">
      <section className="panel students-report-list">
        <header className="panel-header"><div><h3>Alunos da turma</h3><p>{reports.length} aluno{reports.length === 1 ? '' : 's'} · {attentionCount} em atenção</p></div></header>
        <div className="students-report-filters">
          <label><span>Turma</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId(null) }}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.shift ? ` · ${item.shift}` : ''}</option>)}</select></label>
          <label className="responses-search"><span>Buscar aluno</span><div><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou matrícula" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca"><X size={13} /></button>}</div></label>
          <label className="students-report-check"><input type="checkbox" checked={onlyAttention} onChange={(event) => setOnlyAttention(event.target.checked)} /> Só alunos em atenção</label>
          <Button variant="secondary" icon={FileDown} disabled={!reports.length || exporting} onClick={() => exportPdf(visible)}>{exporting ? 'Gerando...' : `Boletins da turma (${visible.length})`}</Button>
        </div>
        <div className="table-wrap"><table><thead><tr><th>ALUNO</th><th>MÉDIA</th><th>ÚLTIMO</th><th>EVOLUÇÃO</th></tr></thead><tbody>
          {visible.map((item) => <tr key={item.student.id} className={cn('clickable-row', item.student.id === studentId && 'is-selected')} onClick={() => setStudentId(item.student.id)}>
            <td><strong>{item.student.name}</strong>{item.attention && <Badge tone="ochre"><AlertTriangle size={11} /> Atenção</Badge>}</td>
            <td className={band(item.average)}>{item.average ?? '—'}{item.average !== null && '%'}</td>
            <td>{item.latest ? `${item.latest.score}%` : '—'}</td>
            <td><Delta value={item.delta} /></td>
          </tr>)}
        </tbody></table>{!visible.length && <p className="students-report-none">Nenhum aluno neste filtro.</p>}</div>
      </section>

      <section className="students-report-detail page-stack">
        {!report ? <div className="panel"><EmptyState icon={UserRound} title="Escolha um aluno" description="Clique em um aluno para ver a nota de cada simulado, as áreas comparadas com a turma, a evolução e o boletim em PDF." /></div> : <>
          <header className="panel student-report-header">
            <div><h2>{report.student.name}</h2><p>{[classroom?.name && `Turma ${classroom.name}`, report.student.registration && `Matrícula ${report.student.registration}`].filter(Boolean).join(' · ')}</p></div>
            <Button icon={FileDown} disabled={exporting} onClick={() => exportPdf([report])}>Boletim em PDF</Button>
          </header>

          <div className="stats-grid">
            <StatCard label="Média do aluno" value={report.average === null ? '—' : `${report.average}%`} note={`em ${report.done.length} simulado${report.done.length === 1 ? '' : 's'}`} icon={Target} tone="green" />
            <StatCard label="Média da turma" value={report.classAverage === null ? '—' : `${report.classAverage}%`} note="nos mesmos simulados" icon={UsersRound} tone="blue" />
            <StatCard label="Último simulado" value={report.latest ? `${report.latest.score}%` : '—'} note={report.latest?.assessment.code || report.latest?.assessment.title || 'sem correção'} icon={Award} tone="ochre" />
            <StatCard label="Evolução" value={report.delta === null ? '—' : `${formatDelta(report.delta)} pts`} note="em relação ao anterior" icon={report.delta < 0 ? TrendingDown : TrendingUp} tone={report.delta < 0 ? 'purple' : 'green'} />
          </div>

          {report.alerts.length > 0 && <section className="panel student-report-alerts"><header className="panel-header"><div><h3>Pontos de atenção</h3><p>Quedas de {ATTENTION_DROP} pontos ou mais e áreas abaixo de {ATTENTION_SCORE}% no último simulado.</p></div></header><ul>{report.alerts.map((alert, index) => <li key={index} className={`alert-${alert.tone}`}><i />{alert.text}</li>)}</ul></section>}

          <section className="panel"><header className="panel-header"><div><h3>Evolução</h3><p>Aproveitamento do aluno e média da turma em cada simulado, em ordem de aplicação.</p></div></header><EvolutionChart report={report} /></section>

          <section className="panel"><header className="panel-header"><div><h3>Por simulado</h3><p>Clique em um simulado corrigido para ver as respostas questão por questão.</p></div></header>
            <div className="table-wrap"><table><thead><tr><th>SIMULADO</th><th>ACERTOS</th><th>ALUNO</th><th>TURMA</th>{showTri && <th title="Nota TRI na escala do grupo: 500 = média de quem fez a prova">TRI</th>}<th>SITUAÇÃO</th></tr></thead><tbody>
              {report.entries.map((entry) => { const clickable = entry.submission && entry.status !== 'voided'; return <tr key={entry.assessment.id} className={cn(clickable && 'clickable-row')} onClick={() => clickable && setOpenAssessmentId(entry.assessment.id)}>
                <td><strong>{entry.assessment.title}</strong><small className="cell-subtitle">{entry.assessment.code}</small></td>
                <td>{entry.total ? `${entry.correct}/${entry.total}` : '—'}</td>
                <td className={band(entry.score)}>{entry.score === undefined ? '—' : `${entry.score}%`}</td>
                <td>{entry.classScore === null ? '—' : `${entry.classScore}%`}</td>
                {showTri && <td>{entry.tri?.score ?? '—'}</td>}
                <td><Badge tone={statusTones[entry.status]}>{STATUS_LABELS[entry.status]}</Badge></td>
              </tr> })}
            </tbody></table></div>
          </section>

          {report.areas.length > 0 && <section className="panel"><header className="panel-header"><div><h3>Por área e simulado</h3><p>Aproveitamento do aluno em cada área; abaixo, a média da turma no mesmo simulado.</p></div></header>
            <div className="table-wrap"><table className="student-area-matrix"><thead><tr><th>ÁREA</th>{assessmentsInMatrix.map((entry) => <th key={entry.assessment.id} title={entry.assessment.title}>{entry.assessment.code || entry.assessment.title}</th>)}<th>MÉDIA</th><th>TURMA</th><th>VARIAÇÃO</th></tr></thead><tbody>
              {report.areas.map((area, index) => <tr key={area.area}>
                <td><span className="student-area-name"><i style={{ background: areaColors[index % areaColors.length] }} />{area.area}</span></td>
                {assessmentsInMatrix.map((entry) => { const point = area.points.find((item) => item.assessmentId === entry.assessment.id); const tri = entry.areas.find((item) => item.area === area.area)?.tri; return <td key={entry.assessment.id} className={band(point?.score)}>{point ? <><strong>{point.score}%</strong><small>turma {point.classScore ?? '—'}%{tri ? ` · TRI ${tri}` : ''}</small></> : '—'}</td> })}
                <td className={band(area.average)}><strong>{area.average}%</strong></td>
                <td>{area.classAverage ?? '—'}{area.classAverage !== null && '%'}</td>
                <td><Delta value={area.delta} /></td>
              </tr>)}
            </tbody></table></div>
          </section>}
        </>}
      </section>

      <StudentResultModal row={openRow} studentRows={studentRows} peerRows={peerRows} areaColors={areaColors} onSelectRow={(row) => setOpenAssessmentId(row.assessmentId)} onClose={() => setOpenAssessmentId(null)} />
    </div>
  )
}
