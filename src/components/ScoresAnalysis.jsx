import { useState } from 'react'
import { calculateSubmissionMetrics } from '../lib/resultsMetrics'
import { median, PERCENT_BIN_WIDTH, ScoreHistogram, triBins } from './ScoreHistogram'

const palette = ['#47776a', '#b98558', '#796e91', '#56758d', '#a56565', '#748b5f', '#8b6d48', '#5d7180']
const decimal = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const deviation = (values) => {
  if (values.length < 2) return null
  const mean = average(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
}
function quantile(values, share) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * share
  const low = Math.floor(position); const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

function Toggle({ label, value, options, onChange }) {
  return <div className="chart-view-toggle" role="group" aria-label={label}>{options.map(([id, text, disabled, title]) => <button type="button" key={id} disabled={disabled} title={title} className={value === id ? 'active' : ''} aria-pressed={value === id} onClick={() => onChange(id)}>{text}</button>)}</div>
}

// Uma linha por turma: caixa do 1º ao 3º quartil, traço na mediana, ponto na média e bigodes até o mínimo e o máximo.
function ClassBoxPlot({ groups, domain, unit }) {
  const [hover, setHover] = useState(null)
  const rowHeight = 34
  const size = { width: 640, left: 92, right: 16, top: 10, bottom: 26 }
  const height = size.top + groups.length * rowHeight + size.bottom
  const plot = size.width - size.left - size.right
  const x = (value) => size.left + (Math.min(domain[1], Math.max(domain[0], value)) - domain[0]) / (domain[1] - domain[0]) * plot
  const tickStep = [10, 20, 25, 50, 100, 200].find((step) => (domain[1] - domain[0]) / step <= 6) || 200
  const ticks = Array.from({ length: Math.floor((domain[1] - domain[0]) / tickStep) + 1 }, (_, index) => domain[0] + index * tickStep)
  const overall = average(groups.flatMap((group) => group.values))
  return (
    <div className="student-chart class-boxplot">
      <div className="student-chart-legend"><span><i className="is-box" /> Metade central dos alunos</span><span><i className="is-median" /> Mediana</span><span><i className="is-dot" /> Média</span><span><i className="is-mean" /> Média geral</span></div>
      <svg viewBox={`0 0 ${size.width} ${height}`} role="img" aria-label="Notas de cada turma" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={size.top} y2={height - size.bottom} className="grid" /><text x={x(tick)} y={height - 8} textAnchor="middle">{tick}{unit}</text></g>)}
        {overall !== null && <line x1={x(overall)} x2={x(overall)} y1={size.top} y2={height - size.bottom} className="line-mean" />}
        {groups.map((group, index) => {
          const center = size.top + index * rowHeight + rowHeight / 2
          const stats = group.stats
          return <g key={group.id} onMouseEnter={() => setHover(index)}>
            <rect x="0" y={center - rowHeight / 2} width={size.width} height={rowHeight} fill={hover === index ? '#f3f6f4' : 'transparent'} />
            <text x={size.left - 10} y={center + 3} textAnchor="end" className="axis-label">{group.name}</text>
            <line x1={x(stats.min)} x2={x(stats.max)} y1={center} y2={center} stroke={group.color} strokeWidth="1.5" />
            <line x1={x(stats.min)} x2={x(stats.min)} y1={center - 5} y2={center + 5} stroke={group.color} strokeWidth="1.5" />
            <line x1={x(stats.max)} x2={x(stats.max)} y1={center - 5} y2={center + 5} stroke={group.color} strokeWidth="1.5" />
            <rect x={x(stats.q1)} y={center - 9} width={Math.max(2, x(stats.q3) - x(stats.q1))} height="18" rx="3" fill={group.color} fillOpacity=".22" stroke={group.color} strokeWidth="1.5" />
            <line x1={x(stats.median)} x2={x(stats.median)} y1={center - 9} y2={center + 9} stroke="#c69558" strokeWidth="2.5" />
            <circle cx={x(stats.mean)} cy={center} r="3.5" fill="#2f4a42" stroke="#fff" strokeWidth="1.5" />
          </g>
        })}
      </svg>
      {hover !== null && <div className="student-chart-tooltip" style={{ left: '50%', top: `${(size.top + hover * rowHeight + rowHeight) / height * 100}%` }}>
        <strong>{groups[hover].name} · {groups[hover].values.length} aluno{groups[hover].values.length !== 1 ? 's' : ''}</strong>
        <span>Média {decimal(groups[hover].stats.mean)}{unit} · mediana {decimal(groups[hover].stats.median)}{unit}</span>
        <span>Metade central entre {decimal(groups[hover].stats.q1)}{unit} e {decimal(groups[hover].stats.q3)}{unit}</span>
        <span>Menor {decimal(groups[hover].stats.min)}{unit} · maior {decimal(groups[hover].stats.max)}{unit}</span>
      </div>}
    </div>
  )
}

// Um ponto por aluno: acertos no eixo x e nota TRI no eixo y.
function TriScatter({ rows, classColor }) {
  const [hover, setHover] = useState(null)
  const size = { width: 640, height: 280, left: 44, right: 14, top: 14, bottom: 34 }
  const tri = rows.map((row) => row.tri)
  const low = Math.floor(Math.min(...tri) / 50) * 50; const high = Math.ceil(Math.max(...tri) / 50) * 50 || low + 50
  const x = (value) => size.left + value / 100 * (size.width - size.left - size.right)
  const y = (value) => size.top + (1 - (value - low) / Math.max(1, high - low)) * (size.height - size.top - size.bottom)
  const yTicks = Array.from({ length: 5 }, (_, index) => Math.round(low + index * (high - low) / 4))
  return (
    <div className="student-chart">
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Acertos e nota TRI de cada aluno">
        {yTicks.map((tick) => <g key={tick}><line x1={size.left} x2={size.width - size.right} y1={y(tick)} y2={y(tick)} className="grid" /><text x={size.left - 6} y={y(tick) + 3} textAnchor="end">{tick}</text></g>)}
        {[0, 20, 40, 60, 80, 100].map((tick) => <text key={tick} x={x(tick)} y={size.height - 18} textAnchor="middle">{tick}%</text>)}
        <text x={(size.left + size.width - size.right) / 2} y={size.height - 3} textAnchor="middle">Acertos (%)</text>
        {rows.map((row) => <circle key={row.id} cx={x(row.score)} cy={y(row.tri)} r={hover?.id === row.id ? 5.5 : 4} fill={classColor(row.classId)} fillOpacity=".75" stroke="#fff" strokeWidth="1" onMouseEnter={() => setHover(row)} onMouseLeave={() => setHover(null)} />)}
      </svg>
      {hover && <div className="student-chart-tooltip" style={{ left: `${x(hover.score) / size.width * 100}%`, top: `${Math.max(4, y(hover.tri) / size.height * 100 - 22)}%` }}>
        <strong>{hover.name}</strong><span>{hover.className}</span><span>{hover.correct} de {hover.total} acertos ({decimal(hover.score)}%) · TRI {decimal(hover.tri)}</span>
      </div>}
    </div>
  )
}

// Acerto de cada questão na ordem da prova, com média móvel e taxa de brancos.
function ItemSequence({ items, areaColor }) {
  const [hover, setHover] = useState(null)
  const valid = items.filter((item) => !item.cancelled)
  if (valid.length < 3) return <p className="student-chart-empty">Poucas questões para traçar a sequência.</p>
  const size = { width: 640, height: 230, left: 34, right: 10, top: 16, bottom: 30 }
  const slot = (size.width - size.left - size.right) / valid.length
  const y = (rate) => size.top + (1 - rate) * (size.height - size.top - size.bottom)
  const span = Math.max(3, Math.min(9, Math.round(valid.length / 9) | 1))
  const moving = valid.map((_, index) => {
    const from = Math.max(0, index - Math.floor(span / 2)); const part = valid.slice(from, from + span)
    return average(part.map((item) => item.correctRate))
  })
  const labelEvery = Math.ceil(valid.length / 30)
  const areas = [...new Set(valid.map((item) => item.area).filter(Boolean))]
  return (
    <div className="student-chart">
      <div className="student-chart-legend">{areas.length > 1 && areas.map((area) => <span key={area}><i style={{ borderTopColor: areaColor(area), borderTopWidth: 6 }} /> {area}</span>)}<span><i /> Média móvel ({span} questões)</span><span><i className="is-blank" /> Em branco</span></div>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label="Acerto de cada questão na ordem da prova" onMouseLeave={() => setHover(null)}>
        {[0, .25, .5, .75, 1].map((tick) => <g key={tick}><line x1={size.left} x2={size.width - size.right} y1={y(tick)} y2={y(tick)} className="grid" /><text x={size.left - 6} y={y(tick) + 3} textAnchor="end">{Math.round(tick * 100)}%</text></g>)}
        {valid.map((item, index) => <g key={item.index} onMouseEnter={() => setHover(index)}>
          <rect x={size.left + index * slot} y={size.top} width={slot} height={y(0) - size.top} fill={hover === index ? '#eef3f0' : 'transparent'} />
          <rect x={size.left + index * slot + slot * .15} y={y(item.correctRate)} width={slot * .7} height={Math.max(0, y(0) - y(item.correctRate))} rx="2" fill={areaColor(item.area)} opacity=".55" />
          {index % labelEvery === 0 && <text x={size.left + (index + .5) * slot} y={size.height - 16} textAnchor="middle">{item.number}</text>}
        </g>)}
        <polyline points={moving.map((rate, index) => `${size.left + (index + .5) * slot},${y(rate)}`).join(' ')} className="line-student" pointerEvents="none" />
        <polyline points={valid.map((item, index) => `${size.left + (index + .5) * slot},${y(item.blankRate)}`).join(' ')} className="line-blank" pointerEvents="none" />
        <text x={(size.left + size.width - size.right) / 2} y={size.height - 3} textAnchor="middle">Questão</text>
      </svg>
      {hover !== null && <div className="student-chart-tooltip" style={{ left: `${(size.left + (hover + .5) * slot) / size.width * 100}%` }}>
        <strong>Questão {valid[hover].number}{valid[hover].area ? ` · ${valid[hover].area}` : ''}</strong>
        <span>{Math.round(valid[hover].correctRate * 100)}% de acerto · {Math.round(valid[hover].blankRate * 100)}% em branco</span>
      </div>}
    </div>
  )
}

export function ScoresAnalysis({ assessment, submissions, students, classes, triResult, itemReport, itemLabel }) {
  const [metric, setMetric] = useState('score')
  const [chartMode, setChartMode] = useState('general')
  const [valueMode, setValueMode] = useState('count')
  const studentMap = new Map(students.map((student) => [student.id, student]))
  const classMap = new Map(classes.map((item, index) => [item.id, { ...item, color: item.color || palette[index % palette.length] }]))
  const rows = submissions.map((submission) => {
    const metrics = calculateSubmissionMetrics(submission, assessment)
    if (!metrics) return null
    const student = studentMap.get(submission.studentId)
    const classId = student?.classId || submission.classId
    const tri = triResult?.scores.get(submission.id)
    return { id: submission.id, name: student?.name || submission.studentName || 'Aluno sem cadastro', classId, className: classMap.get(classId)?.name || '', correct: metrics.correct, total: metrics.total, score: Number(metrics.score), blank: metrics.blank, tri: Number.isFinite(tri?.score) ? tri.score : null, triAreas: tri?.areas || {} }
  }).filter(Boolean)
  if (!rows.length) return <section className="panel"><div className="research-empty"><div><strong>Sem notas neste recorte</strong><p>Corrija folhas deste simulado para ver as médias e a distribuição.</p></div></div></section>

  const triRows = rows.filter((row) => row.tri !== null)
  const hasTri = triRows.length > 0
  const activeMetric = metric === 'tri' && hasTri ? 'tri' : 'score'
  const scores = rows.map((row) => row.score)
  const meanCorrect = average(rows.map((row) => row.correct))
  const meanTotal = average(rows.map((row) => row.total))
  const above = rows.filter((row) => row.score >= 60).length
  const triValues = triRows.map((row) => row.tri)
  const triAreaNames = [...new Set(triRows.flatMap((row) => Object.keys(row.triAreas)))]
  const triAreas = triAreaNames.map((area) => {
    const values = triRows.map((row) => row.triAreas[area]).filter(Number.isFinite)
    return { area, n: values.length, mean: average(values), min: Math.min(...values), max: Math.max(...values) }
  })
  const chartClasses = [...classMap.values()].filter((item) => rows.some((row) => row.classId === item.id)).map((item) => ({ classroom: item, color: item.color }))
  const classColor = (classId) => classMap.get(classId)?.color || palette[0]
  const metricRows = activeMetric === 'tri' ? triRows.map((row) => ({ value: row.tri, classId: row.classId })) : rows.map((row) => ({ value: row.score, classId: row.classId }))
  const bins = activeMetric === 'tri' ? triBins(triValues) : undefined
  const domain = activeMetric === 'tri' && bins.length ? [bins[0].min, bins[bins.length - 1].max] : [0, 100]
  const unit = activeMetric === 'tri' ? '' : '%'
  const classGroups = chartClasses.map(({ classroom, color }) => {
    const values = metricRows.filter((row) => row.classId === classroom.id).map((row) => row.value)
    return { id: classroom.id, name: classroom.name, color, values, stats: { mean: average(values), median: median(values), q1: quantile(values, .25), q3: quantile(values, .75), min: Math.min(...values), max: Math.max(...values) } }
  }).filter((group) => group.values.length)
  const classTable = chartClasses.map(({ classroom, color }) => {
    const classRows = rows.filter((row) => row.classId === classroom.id)
    const classTri = classRows.map((row) => row.tri).filter((value) => value !== null)
    return { id: classroom.id, name: classroom.name, color, n: classRows.length, correct: average(classRows.map((row) => row.correct)), total: average(classRows.map((row) => row.total)), score: average(classRows.map((row) => row.score)), median: median(classRows.map((row) => row.score)), above: classRows.filter((row) => row.score >= 60).length, tri: average(classTri) }
  }).filter((item) => item.n)
  const areaNames = [...new Set((itemReport?.items || []).map((item) => item.area).filter(Boolean))]
  const areaColor = (area) => palette[Math.max(0, areaNames.indexOf(area)) % palette.length]
  const metricToggle = hasTri && <Toggle label="Nota exibida" value={activeMetric} onChange={setMetric} options={[['score', 'Acertos (%)'], ['tri', 'Nota TRI']]} />

  return <>
    <section className="panel"><div className="research-metrics">
      <div><span>Média de acertos</span><strong>{decimal(meanCorrect)}</strong><small>de {decimal(meanTotal, Number.isInteger(meanTotal) ? 0 : 1)} questões · {decimal(average(scores))}% · {rows.length} folhas</small></div>
      <div><span>Mediana</span><strong>{decimal(median(scores))}%</strong><small>metade da turma tirou até esse valor · de {decimal(Math.min(...scores), 0)}% a {decimal(Math.max(...scores), 0)}%</small></div>
      <div><span>Desvio padrão</span><strong>{decimal(deviation(scores))}</strong><small>pontos percentuais · quanto maior, mais desigual a turma</small></div>
      {hasTri
        ? <div><span>Média TRI</span><strong>{decimal(average(triValues))}</strong><small>{triRows.length} folhas · de {decimal(Math.min(...triValues))} a {decimal(Math.max(...triValues))}</small></div>
        : <div><span>Com 60% ou mais</span><strong>{Math.round(above / rows.length * 100)}%</strong><small>{above} de {rows.length} alunos · TRI desligada neste simulado</small></div>}
    </div></section>

    <section className="panel scores-panel"><header className="panel-header"><div><h3>Distribuição das notas</h3><p>{activeMetric === 'tri' ? 'Nota TRI de cada aluno, agrupada em intervalos' : `Acertos de cada aluno em intervalos de ${PERCENT_BIN_WIDTH} pontos`} · passe o mouse para ver quantos alunos há em cada intervalo</p></div>
      <div className="chart-panel-actions">{metricToggle}<Toggle label="Valores" value={valueMode} onChange={setValueMode} options={[['count', 'Nº de alunos'], ['percent', '% de alunos', false, chartMode === 'class' ? 'Percentual dos alunos de cada turma' : 'Percentual do total']]} />{chartClasses.length > 1 && <Toggle label="Turmas" value={chartMode} onChange={setChartMode} options={[['general', 'Geral'], ['class', 'Por turma']]} />}</div></header>
      <ScoreHistogram rows={metricRows} bins={bins} classes={chartClasses} byClass={chartMode === 'class' && chartClasses.length > 1} percent={valueMode === 'percent'} unit={unit} axisLabel={activeMetric === 'tri' ? 'Nota TRI' : 'Nota (% de acertos)'} />
    </section>

    <section className="panel scores-panel"><header className="panel-header"><div><h3>Comparação entre turmas</h3><p>Onde está a maioria dos alunos de cada turma e quanto as notas variam dentro dela.</p></div><div className="chart-panel-actions">{metricToggle}</div></header>
      {classGroups.length ? <ClassBoxPlot groups={classGroups} domain={domain} unit={unit} /> : <p className="student-chart-empty">Sem notas para comparar.</p>}
      <div className="table-wrap"><table className="insight-table"><thead><tr><th>TURMA</th><th>FOLHAS</th><th>MÉDIA DE ACERTOS</th><th>MÉDIA</th><th>MEDIANA</th><th>60% OU MAIS</th>{hasTri && <th>MÉDIA TRI</th>}</tr></thead><tbody>{classTable.map((item) => <tr key={item.id}><td><strong style={{ color: item.color }}>{item.name}</strong></td><td>{item.n}</td><td>{decimal(item.correct)} de {decimal(item.total, Number.isInteger(item.total) ? 0 : 1)}</td><td>{decimal(item.score)}%</td><td>{decimal(item.median)}%</td><td>{Math.round(item.above / item.n * 100)}% ({item.above})</td>{hasTri && <td>{decimal(item.tri)}</td>}</tr>)}</tbody></table></div>
    </section>

    {hasTri && <section className="panel scores-panel"><header className="panel-header"><div><h3>Acertos e nota TRI</h3><p>Alunos com o mesmo número de acertos podem ter notas TRI diferentes: a TRI valoriza quem acerta as questões fáceis e não só as difíceis, o que indica menos chute.</p></div></header>
      <TriScatter rows={triRows} classColor={classColor} />
      {triAreas.length > 1 && <div className="table-wrap"><table className="insight-table"><thead><tr><th>ÁREA</th><th>FOLHAS</th><th>MÉDIA TRI</th><th>MENOR</th><th>MAIOR</th></tr></thead><tbody>{triAreas.map((item) => <tr key={item.area}><td><strong>{item.area}</strong></td><td>{item.n}</td><td>{decimal(item.mean)}</td><td>{decimal(item.min)}</td><td>{decimal(item.max)}</td></tr>)}</tbody></table></div>}
    </section>}

    {itemReport && <section className="panel scores-panel"><header className="panel-header"><div><h3>Acerto ao longo da prova</h3><p>Acerto de cada questão na ordem em que aparece{itemLabel ? ` (${itemLabel})` : ''}. Queda no fim da prova e brancos subindo costumam indicar falta de tempo ou cansaço.</p></div></header>
      <ItemSequence items={itemReport.items} areaColor={areaColor} />
    </section>}
  </>
}
