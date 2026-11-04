import { useState } from 'react'

// Faixas pedagógicas usadas como régua colorida embaixo dos gráficos de notas em %.
export const PERFORMANCE_BANDS = [
  { id: 'low', label: '0–39%', name: 'Insuficiente', min: 0, max: 40, color: '#b9675f' },
  { id: 'basic', label: '40–59%', name: 'Básico', min: 40, max: 60, color: '#c69558' },
  { id: 'adequate', label: '60–79%', name: 'Adequado', min: 60, max: 80, color: '#7b9b72' },
  { id: 'advanced', label: '80–100%', name: 'Avançado', min: 80, max: 101, color: '#3f7968' },
]

export const PERCENT_BIN_WIDTH = 5

// Intervalos de 5 pontos de 0 a 100%, coloridos pela faixa pedagógica.
export const percentBins = Array.from({ length: 100 / PERCENT_BIN_WIDTH }, (_, index) => {
  const min = index * PERCENT_BIN_WIDTH
  const max = min + PERCENT_BIN_WIDTH
  const last = max === 100
  return { min, max: last ? 100 : max, label: `${min}–${last ? 100 : max - 1}%`, color: PERFORMANCE_BANDS.find((band) => min >= band.min && min < band.max)?.color || '#7b9b72' }
})

// Intervalos para notas na escala TRI (em torno de 500), com largura arredondada.
export function triBins(values, color = '#56758d') {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return []
  const low = Math.min(...finite); const high = Math.max(...finite)
  const width = [10, 20, 25, 50, 100].find((step) => (Math.ceil((high + 0.001) / step) - Math.floor(low / step)) <= 20) || 100
  const start = Math.floor(low / width) * width
  const end = Math.max(start + width, Math.ceil((high + 0.001) / width) * width)
  return Array.from({ length: Math.round((end - start) / width) }, (_, index) => {
    const min = start + index * width
    return { min, max: min + width, label: `${min}–${min + width - 1}`, color }
  })
}

export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function binIndex(bins, value) {
  const index = bins.findIndex((bin) => value >= bin.min && value < bin.max)
  if (index >= 0) return index
  return value >= bins[bins.length - 1].min ? bins.length - 1 : 0
}

const decimal = (value) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

// Histograma das notas. rows: [{ value, classId }]. Por turma, desenha uma linha por turma.
export function ScoreHistogram({ rows, bins = percentBins, classes = [], byClass = false, percent = false, unit = '%', axisLabel = 'Nota (% de acertos)', ruler = PERFORMANCE_BANDS }) {
  const [hover, setHover] = useState(null)
  if (!rows.length || !bins.length) return <p className="student-chart-empty">Nenhuma nota no recorte.</p>
  const countBins = (items) => {
    const counts = bins.map(() => 0)
    items.forEach((item) => { counts[binIndex(bins, item.value)] += 1 })
    return counts.map((count) => ({ count, percent: items.length ? count / items.length * 100 : 0 }))
  }
  const general = countBins(rows)
  const series = byClass ? classes.map(({ classroom, color }) => ({ classroom, color, bins: countBins(rows.filter((item) => item.classId === classroom.id)) })).filter((item) => item.bins.some((bin) => bin.count)) : []
  const value = (bin) => percent ? bin.percent : bin.count
  const max = Math.max(1, ...(byClass ? series.flatMap((item) => item.bins.map(value)) : general.map(value)))
  const size = { width: 640, height: 230, left: 30, right: 10, top: 22, bottom: 34 }
  const plotWidth = size.width - size.left - size.right
  const slot = plotWidth / bins.length
  const domain = [bins[0].min, bins[bins.length - 1].max]
  const y = (v) => size.top + (1 - v / max) * (size.height - size.top - size.bottom)
  const x = (score) => size.left + (Math.min(domain[1], Math.max(domain[0], score)) - domain[0]) / (domain[1] - domain[0]) * plotWidth
  const values = rows.map((item) => Number(item.value))
  const mean = values.reduce((sum, score) => sum + score, 0) / values.length
  const middle = median(values)
  const format = (bin) => percent ? `${Math.round(bin.percent)}%` : bin.count
  const ticks = [...new Set([0, 0.5, 1].map((share) => percent ? share * max : Math.round(share * max)))]
  // Marcas do eixo nas bordas dos intervalos, no máximo 7.
  const every = Math.max(1, Math.ceil(bins.length / 6))
  const xTicks = [...bins.filter((_, index) => index % every === 0).map((bin) => bin.min), ...(bins.length % every === 0 ? [domain[1]] : [])]
  const showRuler = ruler && unit === '%'
  return (
    <div className="student-chart score-histogram">
      <div className="student-chart-legend">
        {byClass && series.map((item) => <span key={item.classroom.id}><i style={{ borderTopColor: item.color }} /> {item.classroom.name}</span>)}
        <span><i className="is-mean" /> Média {decimal(mean)}{unit}</span>
        <span><i className="is-median" /> Mediana {decimal(middle)}{unit}</span>
      </div>
      <svg viewBox={`0 0 ${size.width} ${size.height}`} role="img" aria-label={`Distribuição das notas: ${axisLabel}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => <g key={tick}><line x1={size.left} x2={size.width - size.right} y1={y(tick)} y2={y(tick)} className="grid" /><text x={size.left - 6} y={y(tick) + 3} textAnchor="end">{percent ? `${Math.round(tick)}%` : tick}</text></g>)}
        {bins.map((bin, index) => {
          const left = size.left + index * slot
          const data = general[index]
          return <g key={bin.min} onMouseEnter={() => setHover(index)}>
            <rect x={left} y={size.top} width={slot} height={y(0) - size.top} fill={hover === index ? '#eef3f0' : 'transparent'} />
            {!byClass && data.count > 0 && <rect x={left + slot * 0.1} y={y(value(data))} width={slot * 0.8} height={Math.max(0, y(0) - y(value(data)))} rx="3" fill={bin.color} opacity=".9" />}
            {!byClass && data.count > 0 && <text x={left + slot / 2} y={y(value(data)) - 5} textAnchor="middle" className="value-label">{format(data)}</text>}
          </g>
        })}
        {series.map((item) => <polyline key={item.classroom.id} points={item.bins.map((bin, index) => `${size.left + (index + 0.5) * slot},${y(value(bin))}`).join(' ')} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />)}
        {series.map((item) => item.bins.map((bin, index) => bin.count > 0 && <circle key={`${item.classroom.id}-${index}`} cx={size.left + (index + 0.5) * slot} cy={y(value(bin))} r="3" fill={item.color} stroke="#fff" strokeWidth="1.5" pointerEvents="none" />))}
        <line x1={x(middle)} x2={x(middle)} y1={size.top - 8} y2={y(0)} className="line-median" pointerEvents="none" />
        <line x1={x(mean)} x2={x(mean)} y1={size.top - 8} y2={y(0)} className="line-mean" pointerEvents="none" />
        {xTicks.map((tick) => <text key={tick} x={x(tick)} y={size.height - 18} textAnchor="middle">{tick}{unit}</text>)}
        {showRuler && ruler.map((band) => <rect key={band.id} x={x(band.min)} width={x(Math.min(100, band.max)) - x(band.min)} y={y(0) + 2} height="4" fill={band.color} opacity=".55" />)}
        <text x={size.left + plotWidth / 2} y={size.height - 3} textAnchor="middle">{axisLabel}</text>
      </svg>
      {hover !== null && <div className="student-chart-tooltip" style={{ left: `${(size.left + (hover + 0.5) * slot) / size.width * 100}%` }}>
        <strong>{bins[hover].label}</strong>
        {byClass ? series.map((item) => <span key={item.classroom.id}>{item.classroom.name}: {item.bins[hover].count} aluno{item.bins[hover].count !== 1 ? 's' : ''} ({Math.round(item.bins[hover].percent)}% da turma)</span>) : <span>{general[hover].count} aluno{general[hover].count !== 1 ? 's' : ''} ({Math.round(general[hover].percent)}%)</span>}
      </div>}
    </div>
  )
}
