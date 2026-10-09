import { useState } from 'react'

const colors = {
  correct: '#16803c',
  wrong: '#dc2626',
  multiple: '#dc2626',
  uncertain: '#b77900',
  cancelled: '#64748b',
}

export function CorrectedSheetPreview({ result, label = 'Folha digitalizada' }) {
  const [showMarks, setShowMarks] = useState(true)
  const hasPositions = result.previewWidth > 0 && result.previewHeight > 0
    && result.answers?.some((answer) => answer.optionPositions?.length)

  return (
    <div className="corrected-sheet-preview">
      {hasPositions && <div className="sheet-mark-controls">
        <label><input type="checkbox" checked={showMarks} onChange={(event) => setShowMarks(event.target.checked)} /> Mostrar marcações</label>
        <div className="sheet-mark-legend" aria-label="Legenda das marcações">
          <span><i style={{ borderColor: colors.correct }} /> Correta</span>
          <span><i style={{ borderColor: colors.wrong }} /> Incorreta / múltipla</span>
          <span><i style={{ borderColor: colors.uncertain }} /> Revisar</span>
          <span><i style={{ borderColor: colors.cancelled }} /> Anulada / cancelada</span>
        </div>
      </div>}
      {hasPositions ? <svg className="corrected-sheet-image" viewBox={`0 0 ${result.previewWidth} ${result.previewHeight}`} role="img" aria-label={`${label}${showMarks ? ', com marcações da correção' : ''}`}>
        <image href={result.previewUrl} width={result.previewWidth} height={result.previewHeight} />
        {showMarks && result.answers.flatMap((answer) => (answer.selected || []).map((letter) => {
          const point = answer.optionPositions?.[letter.charCodeAt(0) - 65]
          if (!point) return null
          const ignored = answer.annulled || answer.cancelled
          const color = ignored ? colors.cancelled : colors[answer.status] || colors.uncertain
          const description = ignored ? 'Anulada / cancelada' : answer.status === 'correct' ? 'Correta' : answer.status === 'wrong' ? 'Incorreta' : answer.status === 'multiple' ? 'Múltipla marcação' : 'Revisar'
          return <circle key={`${answer.question}-${letter}`} cx={point.x} cy={point.y} r={point.radius} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray={ignored || answer.status === 'uncertain' ? '4 3' : undefined}>
            <title>{`Questão ${answer.question}, alternativa ${letter}: ${description}`}</title>
          </circle>
        }))}
      </svg> : <img src={result.previewUrl} alt={label} />}
    </div>
  )
}
