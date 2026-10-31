import { useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Lightbulb, Scale, Target, UsersRound } from 'lucide-react'
import { Badge, EmptyState, StatCard } from './ui'
import { BANDS, bandOf, buildClassReport, MIN_SKILL_QUESTIONS } from '../lib/classReport'
import { computeTriScores, isTriEnabled } from '../lib/tri'
import { cn } from '../lib/utils'

const TABS = [['conclusions', 'Conclusões'], ['distribution', 'Distribuição'], ['assessments', 'Simulados'], ['difficulties', 'Dificuldades'], ['students', 'Alunos']]
const DISTRIBUTION_IDS = new Set(['majority-low', 'majority-basic', 'majority-high', 'split', 'spread', 'compact', 'skew-up', 'skew-down'])
const bandTone = { low: 'red', basic: 'ochre', adequate: 'green', advanced: 'green' }
const pct = (value) => value === null || value === undefined ? '—' : `${value}%`
const share = (value) => `${Math.round(value * 100)}%`

function scoreClass(score) {
  if (score === null || score === undefined) return ''
  return score < 40 ? 'is-low' : score < 60 ? 'is-basic' : score < 80 ? 'is-adequate' : 'is-advanced'
}

function Gap({ value }) {
  if (value === null || value === undefined) return <span className="student-delta">—</span>
  return <span className={cn('student-delta', value <= -5 ? 'is-down' : value >= 5 ? 'is-up' : '')}>{value > 0 ? '+' : ''}{value} pts</span>
}

function Conclusions({ items }) {
  if (!items.length) return <p className="student-chart-empty">Ainda não há provas corrigidas suficientes para tirar conclusões.</p>
  return <ul className="class-conclusions">{items.map((item) => <li key={item.id} className={`alert-${item.tone}`}><i /><div><strong>{item.title}</strong><p>{item.text}</p></div></li>)}</ul>
}

// Barras por faixa de acerto: as 4 faixas pedagógicas ou de 10 em 10 pontos.
function DistributionBars({ distribution, detailed, percent }) {
  const bars = detailed ? distribution.histogram.map((bin) => ({ ...bin, color: bandOf(bin.min).color, name: `${bin.label}%` })) : distribution.bands.map((band) => ({ ...band, name: band.name, sub: band.label }))
  const value = (bar) => percent ? (distribution.n ? Math.round(bar.count / distribution.n * 100) : 0) : bar.count
  const max = Math.max(1, ...bars.map(value))
  const size = { width: 640, height: 220, left: 30, right: 10, top: 20, bottom: detailed ? 30 : 42 }
  const slot = (size.width - size.left - size.right) / bars.length
  const y = (v) => size.top + (1 - v / max) * (size.height - size.top - size.bottom)
  return (
    <div className="student-chart">
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Distribuição dos alunos por faixa de acerto">
        <line x1={size.left} x2={size.width - size.right} y1={y(0)} y2={y(0)} className="grid" />
        {bars.map((bar, index) => {
          const x = size.left + index * slot + slot * 0.14
          const width = slot * 0.72
          const v = value(bar)
          return <g key={bar.name}>
            <rect x={x} y={y(v)} width={width} height={Math.max(0, y(0) - y(v))} rx="4" fill={bar.color} opacity=".88"><title>{`${bar.name}: ${bar.count} aluno${bar.count === 1 ? '' : 's'}`}</title></rect>
            {v > 0 && <text x={x + width / 2} y={y(v) - 6} textAnchor="middle" className="value-label">{percent ? `${v}%` : v}</text>}
            <text x={x + width / 2} y={size.height - (detailed ? 12 : 24)} textAnchor="middle" className="axis-label">{bar.name}</text>
            {bar.sub && <text x={x + width / 2} y={size.height - 10} textAnchor="middle">{bar.sub}</text>}
          </g>
        })}
      </svg>
    </div>
  )
}

// Um ponto por aluno numa régua de 0 a 100%, com média, mediana e demais turmas.
function StudentStrip({ report }) {
  const [hover, setHover] = useState(null)
  const size = { width: 640, height: 118, left: 16, right: 16, axis: 82 }
  const x = (value) => size.left + value / 100 * (size.width - size.left - size.right)
  const stacks = new Map()
  const dots = report.students.map((item) => {
    const bucket = Math.round(item.average / 2)
    const level = stacks.get(bucket) || 0
    stacks.set(bucket, level + 1)
    return { ...item, cx: x(item.average), cy: size.axis - 9 - level * 10 }
  })
  const { mean, median } = report.distribution
  return (
    <div className="student-chart class-strip">
      <div className="student-chart-legend"><span><i className="is-student" /> Média da turma</span><span><i className="is-median" /> Mediana</span>{report.othersMean !== null && <span><i className="is-class" /> Demais turmas</span>}</div>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Nota de cada aluno da turma">
        {BANDS.map((band) => <rect key={band.id} x={x(band.min)} width={x(Math.min(100, band.max)) - x(band.min)} y={size.axis} height="5" fill={band.color} opacity=".55" />)}
        {[0, 20, 40, 60, 80, 100].map((value) => <text key={value} x={x(value)} y={size.axis + 18} textAnchor="middle">{value}%</text>)}
        {report.othersMean !== null && <line x1={x(report.othersMean)} x2={x(report.othersMean)} y1="6" y2={size.axis} className="line-class" />}
        <line x1={x(median)} x2={x(median)} y1="6" y2={size.axis} className="line-median" />
        <line x1={x(mean)} x2={x(mean)} y1="6" y2={size.axis} className="line-student" />
        {dots.map((dot) => <circle key={dot.student?.id || dot.cx} cx={dot.cx} cy={dot.cy} r="4.5" fill={bandOf(dot.average).color} stroke="#fff" strokeWidth="1.5" onMouseEnter={() => setHover(dot)} onMouseLeave={() => setHover(null)} />)}
      </svg>
      {hover && <div className="student-chart-tooltip" style={{ left: `${hover.cx / size.width * 100}%`, top: 4 }}><strong>{hover.student?.name || 'Aluno removido'}</strong><span>{hover.average}%{hover.scores.length > 1 ? ` (média de ${hover.scores.length} simulados)` : ''}</span></div>}
    </div>
  )
}

function EvolutionChart({ report, onSelect }) {
  const points = report.done
  if (points.length < 2) return <p className="student-chart-empty">A evolução aparece quando a turma tiver pelo menos dois simulados corrigidos.</p>
  const size = { width: 640, height: 210, left: 38, right: 18, top: 18, bottom: 34 }
  const x = (index) => size.left + index * (size.width - size.left - size.right) / (points.length - 1)
  const y = (value) => size.top + (1 - value / 100) * (size.height - size.top - size.bottom)
  const path = (values) => values.map((value, index) => value === null ? null : `${x(index)},${y(value)}`).filter(Boolean).join(' ')
  return (
    <div className="student-chart">
      <div className="student-chart-legend"><span><i className="is-student" /> {report.classroom?.name || 'Turma'}</span><span><i className="is-class" /> Demais turmas</span></div>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Média da turma e das demais turmas em cada simulado">
        {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={size.left} x2={size.width - size.right} y1={y(value)} y2={y(value)} className="grid" /><text x={size.left - 8} y={y(value) + 3} textAnchor="end">{value}%</text></g>)}
        <polyline points={path(points.map((entry) => entry.othersMean))} className="line-class" />
        <polyline points={path(points.map((entry) => entry.stats.mean))} className="line-student" />
        {points.map((entry, index) => <g key={entry.assessment.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(entry.assessment.id)}>
          {entry.othersMean !== null && <circle cx={x(index)} cy={y(entry.othersMean)} r="3.5" className="dot-class" />}
          <circle cx={x(index)} cy={y(entry.stats.mean)} r="4.5" className="dot-student"><title>{`${entry.assessment.title}: turma ${entry.stats.mean}%, demais ${entry.othersMean ?? '—'}%`}</title></circle>
          <text x={x(index)} y={size.height - 12} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="axis-label">{entry.assessment.code || entry.assessment.title}</text>
          {points.length <= 8 && <text x={x(index)} y={y(entry.stats.mean) - 9} textAnchor="middle" className="value-label">{entry.stats.mean}%</text>}
        </g>)}
      </svg>
    </div>
  )
}

function BandBar({ bands }) {
  const total = bands.reduce((sum, band) => sum + band.count, 0)
  if (!total) return null
  return <div className="class-band-bar" title={bands.map((band) => `${band.name}: ${band.count}`).join('\n')}>{bands.filter((band) => band.count).map((band) => <span key={band.id} style={{ width: `${band.count / total * 100}%`, background: band.color }}>{band.count}</span>)}</div>
}

function CompareBar({ score, others }) {
  return <div className="class-compare-bar"><span style={{ width: `${score}%`, background: bandOf(score).color }} />{others !== null && others !== undefined && <i style={{ left: `${others}%` }} title={`Demais turmas: ${others}%`} />}</div>
}

export function ClassReport({ data, initialClassId = null, onOpenStudent }) {
  const classes = useMemo(() => [...data.classes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })), [data.classes])
  const [classId, setClassId] = useState(() => initialClassId || classes[0]?.id || '')
  const [assessmentId, setAssessmentId] = useState('all')
  const [tab, setTab] = useState('conclusions')
  const [detailed, setDetailed] = useState(false)
  const [percent, setPercent] = useState(false)
  const [difficulty, setDifficulty] = useState('areas')
  const [allQuestions, setAllQuestions] = useState(false)
  const [skillArea, setSkillArea] = useState('all')
  const [singleSkills, setSingleSkills] = useState(false)
  const [allSkills, setAllSkills] = useState(false)

  const triScores = useMemo(() => new Map(data.assessments.filter(isTriEnabled).map((assessment) => [assessment.id, computeTriScores(assessment, data.submissions)])), [data.assessments, data.submissions])
  const report = useMemo(() => classId ? buildClassReport({ classId, data, assessmentId, triScores }) : null, [classId, data, assessmentId, triScores])

  if (!classes.length) return <EmptyState icon={UsersRound} title="Nenhuma turma cadastrada" description="Cadastre turmas e alunos para ver o relatório da turma." />

  const { distribution } = report
  const single = report.scoped.length === 1
  const showTri = report.done.some((entry) => entry.tri !== null)
  const distributionNotes = report.conclusions.filter((item) => DISTRIBUTION_IDS.has(item.id))
  const low = report.students.filter((item) => item.average < 40).length
  const shownQuestions = allQuestions ? report.questions : report.questions.slice(0, 15)
  const skillAreas = [...new Set(report.skills.map((skill) => skill.area))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const filteredSkills = report.skills.filter((skill) => (skillArea === 'all' || skill.area === skillArea) && (singleSkills || skill.questions >= MIN_SKILL_QUESTIONS))
  const shownSkills = allSkills ? filteredSkills : filteredSkills.slice(0, 15)
  const formatTri = (value) => value === null ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const skillSource = report.skills.some((skill) => skill.source === 'enem') ? 'Matriz de Referência do ENEM (código H do item no INEP)' : 'habilidades cadastradas nas questões'
  const scopeLabel = single ? report.scoped[0].assessment.title : report.scoped.length ? `Geral · ${report.scoped.length} simulados` : 'Sem provas corrigidas'
  const scopeReading = single ? `do ${report.scoped[0].assessment.code || report.scoped[0].assessment.title}` : `${report.scoped.length === 1 ? 'do simulado' : `dos ${report.scoped.length} simulados`} da turma`

  function selectAssessment(id) {
    setAssessmentId(id)
    setTab('distribution')
  }

  return (
    <div className="page-stack class-report">
      <section className="panel class-report-header">
        <div className="students-report-filters">
          <label><span>Turma</span><select value={classId} onChange={(event) => { setClassId(event.target.value); setAssessmentId('all') }}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.shift ? ` · ${item.shift}` : ''}</option>)}</select></label>
          <label><span>Simulado</span><select value={assessmentId} onChange={(event) => setAssessmentId(event.target.value)}><option value="all">Todos (média de cada aluno)</option>{report.done.map((entry) => <option key={entry.assessment.id} value={entry.assessment.id}>{entry.assessment.title}</option>)}</select></label>
        </div>
        <div className="segmented-tabs class-report-tabs" role="tablist" aria-label="Seções do relatório da turma">
          {TABS.map(([id, label]) => <button type="button" role="tab" key={id} aria-selected={tab === id} className={cn(tab === id && 'active')} onClick={() => setTab(id)}>{label}{id === 'students' && <span>{report.students.length}</span>}{id === 'assessments' && <span>{report.done.length}</span>}</button>)}
        </div>
      </section>

      {!distribution.n ? <div className="panel"><EmptyState icon={BarChart3} title="Sem provas corrigidas" description={`A turma ${report.classroom?.name || ''} ainda não tem provas corrigidas${assessmentId === 'all' ? '' : ' neste simulado'}. Provas anuladas não entram no relatório.`} /></div> : <>
        {tab === 'conclusions' && <>
          <div className="stats-grid">
            <StatCard label="Média da turma" value={pct(distribution.mean)} note={scopeLabel} icon={Target} tone="green" />
            <StatCard label="Mediana" value={pct(distribution.median)} note="metade da turma está acima" icon={Scale} tone="blue" />
            <StatCard label="Demais turmas" value={pct(report.othersMean)} note={report.othersMean === null ? 'só esta turma fez' : 'nos mesmos simulados'} icon={UsersRound} tone="ochre" />
            <StatCard label="Abaixo de 40%" value={`${low} de ${distribution.n}`} note="alunos com prova corrigida" icon={AlertTriangle} tone="purple" />
          </div>
          <section className="panel student-report-alerts"><header className="panel-header"><div><h3><Lightbulb size={15} /> O que os resultados dizem</h3><p>Leitura automática {scopeReading}. Provas anuladas ficam de fora.</p></div></header><Conclusions items={report.conclusions} /></section>
        </>}

        {tab === 'distribution' && <>
          <section className="panel">
            <header className="panel-header"><div><h3>Como as notas se distribuem</h3><p>{single ? `Nota de cada aluno no ${report.scoped[0].assessment.code || report.scoped[0].assessment.title}.` : 'Média de cada aluno nos simulados que fez.'} {distribution.n} aluno{distribution.n === 1 ? '' : 's'}.</p></div>
              <div className="chart-panel-actions">
                <div className="chart-view-toggle" role="group" aria-label="Faixas"><button type="button" className={!detailed ? 'active' : ''} onClick={() => setDetailed(false)}>4 faixas</button><button type="button" className={detailed ? 'active' : ''} onClick={() => setDetailed(true)}>De 10 em 10</button></div>
                <div className="chart-view-toggle" role="group" aria-label="Valores"><button type="button" className={!percent ? 'active' : ''} onClick={() => setPercent(false)}>Nº de alunos</button><button type="button" className={percent ? 'active' : ''} onClick={() => setPercent(true)}>% da turma</button></div>
              </div>
            </header>
            <div className="class-distribution-grid">
              <DistributionBars distribution={distribution} detailed={detailed} percent={percent} />
              <div className="class-distribution-notes">
                <dl>
                  <div><dt>Média</dt><dd>{distribution.mean}%</dd></div>
                  <div><dt>Mediana</dt><dd>{distribution.median}%</dd></div>
                  <div><dt>Menor e maior</dt><dd>{distribution.min}% a {distribution.max}%</dd></div>
                  <div><dt title="Quanto as notas se afastam da média. Até 10: turma parecida; 20 ou mais: turma muito heterogênea.">Desvio padrão</dt><dd>{distribution.sd ?? '—'} pts</dd></div>
                </dl>
                {distributionNotes.length ? <Conclusions items={distributionNotes} /> : <p className="student-chart-empty">A distribuição não tem nenhum padrão que chame a atenção.</p>}
              </div>
            </div>
          </section>
          <section className="panel"><header className="panel-header"><div><h3>Cada aluno na régua</h3><p>Um ponto por aluno. Passe o mouse para ver o nome.</p></div></header><StudentStrip report={report} /></section>
        </>}

        {tab === 'assessments' && <>
          <section className="panel"><header className="panel-header"><div><h3>Evolução da turma</h3><p>Média da turma e das demais turmas que fizeram o mesmo simulado. Clique em um ponto para ver só aquele simulado.</p></div></header><EvolutionChart report={report} onSelect={selectAssessment} /></section>
          <section className="panel"><header className="panel-header"><div><h3>Por simulado</h3><p>Clique em um simulado para ver a distribuição dele.</p></div></header>
            <div className="table-wrap"><table><thead><tr><th>SIMULADO</th><th>CORRIGIDAS</th><th>MÉDIA</th><th>MEDIANA</th><th>MENOR–MAIOR</th><th>DEMAIS TURMAS</th><th>DIFERENÇA</th>{showTri && <th title="Média da nota TRI dos alunos da turma">TRI</th>}<th>FAIXAS</th></tr></thead><tbody>
              {report.entries.map((entry) => <tr key={entry.assessment.id} className={cn(entry.sheets.length && 'clickable-row', entry.assessment.id === assessmentId && 'is-selected')} onClick={() => entry.sheets.length && selectAssessment(entry.assessment.id)}>
                <td><strong>{entry.assessment.title}</strong><small className="cell-subtitle">{entry.assessment.code}</small></td>
                <td>{entry.sheets.length}<small className="cell-subtitle">{[entry.absent && `${entry.absent} ausente${entry.absent === 1 ? '' : 's'}`, entry.pending && `${entry.pending} pendente${entry.pending === 1 ? '' : 's'}`, entry.voided && `${entry.voided} anulada${entry.voided === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small></td>
                <td className={scoreClass(entry.stats.mean)}><strong>{pct(entry.stats.mean)}</strong></td>
                <td>{pct(entry.stats.median)}</td>
                <td>{entry.stats.n ? `${entry.stats.min}–${entry.stats.max}%` : '—'}</td>
                <td>{pct(entry.othersMean)}{entry.otherClassCount > 0 && <small className="cell-subtitle">{entry.otherClassCount} turma{entry.otherClassCount === 1 ? '' : 's'}</small>}</td>
                <td><Gap value={entry.stats.mean !== null && entry.othersMean !== null ? entry.stats.mean - entry.othersMean : null} /></td>
                {showTri && <td>{formatTri(entry.tri)}</td>}
                <td><BandBar bands={entry.stats.bands} /></td>
              </tr>)}
            </tbody></table></div>
          </section>
        </>}

        {tab === 'difficulties' && <section className="panel">
          <header className="panel-header"><div><h3>Onde a turma mais erra</h3><p>{scopeLabel}. A linha vertical em cada barra é o acerto das demais turmas na mesma prova.</p></div>
            <div className="chart-view-toggle" role="group" aria-label="Dificuldades por"><button type="button" className={difficulty === 'areas' ? 'active' : ''} onClick={() => setDifficulty('areas')}>Disciplinas e áreas</button><button type="button" className={difficulty === 'skills' ? 'active' : ''} onClick={() => setDifficulty('skills')}>Habilidades</button><button type="button" className={difficulty === 'questions' ? 'active' : ''} onClick={() => setDifficulty('questions')}>Questões</button></div>
          </header>
          {difficulty === 'areas' && <div className="table-wrap"><table><thead><tr><th>ÁREA</th><th>ACERTO DA TURMA</th><th></th><th>DEMAIS TURMAS</th><th>DIFERENÇA</th><th>EM BRANCO</th></tr></thead><tbody>
            {report.areas.map((area) => <tr key={area.area}><td><strong>{area.area}</strong><small className="cell-subtitle">{area.questions} questões · {area.attempts} respostas</small></td><td className={scoreClass(area.score)}><strong>{area.score}%</strong></td><td className="class-compare-cell"><CompareBar score={area.score} others={area.others} /></td><td>{pct(area.others)}</td><td><Gap value={area.gap} /></td><td>{share(area.blankRate)}</td></tr>)}
          </tbody></table></div>}
          {difficulty === 'skills' && (report.skills.length ? <>
            <div className="class-skill-filters">
              <div className="chart-view-toggle" role="group" aria-label="Área das habilidades"><button type="button" className={skillArea === 'all' ? 'active' : ''} onClick={() => { setSkillArea('all'); setAllSkills(false) }}>Todas as áreas</button>{skillAreas.map((area) => <button type="button" key={area} className={skillArea === area ? 'active' : ''} onClick={() => { setSkillArea(area); setAllSkills(false) }}>{area}</button>)}</div>
              <label className="students-report-check"><input type="checkbox" checked={singleSkills} onChange={(event) => setSingleSkills(event.target.checked)} /> Incluir habilidades com só 1 questão</label>
            </div>
            <p className="class-report-hint">Habilidades pela {skillSource}, da que a turma mais erra para a que mais acerta.{!singleSkills && ` Ficam de fora as que têm menos de ${MIN_SKILL_QUESTIONS} questões: uma questão só não basta para concluir.`}</p>
            {filteredSkills.length ? <div className="table-wrap"><table><thead><tr><th>HABILIDADE</th><th>ÁREA</th><th>QUESTÕES</th><th>ACERTO DA TURMA</th><th></th><th>DEMAIS TURMAS</th><th>DIFERENÇA</th></tr></thead><tbody>
              {shownSkills.map((skill) => <tr key={skill.key} className={cn(skill.questions < MIN_SKILL_QUESTIONS && 'is-faded')}><td><strong>{skill.label}</strong></td><td>{skill.area}</td><td>{skill.questions}</td><td className={scoreClass(skill.score)}><strong>{skill.score}%</strong></td><td className="class-compare-cell"><CompareBar score={skill.score} others={skill.others} /></td><td>{pct(skill.others)}</td><td><Gap value={skill.gap} /></td></tr>)}
            </tbody></table></div> : <p className="class-report-hint">Nenhuma habilidade com {MIN_SKILL_QUESTIONS} questões ou mais neste recorte. Marque a opção acima para ver todas.</p>}
            {filteredSkills.length > 15 && <button type="button" className="class-report-more" onClick={() => setAllSkills((value) => !value)}>{allSkills ? 'Mostrar só as 15 com mais erros' : `Mostrar todas as ${filteredSkills.length} habilidades`}</button>}
          </> : <EmptyState icon={Target} title="Sem habilidades nestes simulados" description="As habilidades aparecem nos simulados montados com provas do ENEM depois de usar os parâmetros oficiais (Detalhes do simulado → Nota TRI → Usar ENEM). Nos demais simulados, a análise fica por disciplina e área." />)}
          {difficulty === 'questions' && <>
            <div className="table-wrap"><table><thead><tr><th>QUESTÃO</th>{!single && <th>SIMULADO</th>}<th>ÁREA</th><th>ACERTO DA TURMA</th><th></th><th>DEMAIS TURMAS</th><th>EM BRANCO</th></tr></thead><tbody>
              {shownQuestions.map((question) => <tr key={question.id}><td><strong>Q{question.number}</strong></td>{!single && <td>{question.assessmentCode || question.assessmentTitle}</td>}<td>{question.area}</td><td className={scoreClass(question.score)}><strong>{question.score}%</strong><small className="cell-subtitle">{question.correct} de {question.attempts}</small></td><td className="class-compare-cell"><CompareBar score={question.score} others={question.others} /></td><td>{pct(question.others)}</td><td>{share(question.blankRate)}</td></tr>)}
            </tbody></table></div>
            {report.questions.length > 15 && <button type="button" className="class-report-more" onClick={() => setAllQuestions((value) => !value)}>{allQuestions ? 'Mostrar só as 15 mais difíceis' : `Mostrar todas as ${report.questions.length} questões`}</button>}
          </>}
        </section>}

        {tab === 'students' && <section className="panel"><header className="panel-header"><div><h3>Alunos da turma</h3><p>{single ? 'Nota no simulado escolhido' : 'Média nos simulados que cada aluno fez'}. Clique em um aluno para abrir o relatório dele.</p></div></header>
          <div className="table-wrap"><table><thead><tr><th>#</th><th>ALUNO</th><th>{single ? 'NOTA' : 'MÉDIA'}</th><th>FAIXA</th>{!single && <th>SIMULADOS</th>}<th>EM RELAÇÃO À MÉDIA DA TURMA</th></tr></thead><tbody>
            {report.students.map((item, index) => { const band = bandOf(item.average); return <tr key={item.student?.id || index} className={cn(item.student && 'clickable-row')} onClick={() => item.student && onOpenStudent?.(item.student)}>
              <td><span className="rank">{index + 1}</span></td>
              <td><strong>{item.student?.name || 'Aluno removido'}</strong></td>
              <td className={scoreClass(item.average)}><strong>{item.average}%</strong></td>
              <td><Badge tone={bandTone[band.id]}>{band.name}</Badge></td>
              {!single && <td title={item.entries.map((entry) => `${entry.assessment.title}: ${entry.score}%`).join('\n')}>{item.entries.map((entry) => `${entry.assessment.code || entry.assessment.title} ${entry.score}%`).join(' · ')}</td>}
              <td><Gap value={item.average - distribution.mean} /></td>
            </tr> })}
          </tbody></table></div>
          {report.members.length > report.students.length && <p className="class-report-hint">{report.members.length - report.students.length} aluno{report.members.length - report.students.length === 1 ? '' : 's'} ativo{report.members.length - report.students.length === 1 ? '' : 's'} sem prova corrigida {single ? 'neste simulado' : 'nos simulados'} (ausente, pendente ou anulada).</p>}
        </section>}
      </>}
    </div>
  )
}
