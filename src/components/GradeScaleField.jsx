import { useState } from 'react'
import { GRADE_SCALE_PRESETS, MAX_GRADE_LIMIT, ROUNDING_MODES, ROUNDING_STEPS, formatMaxGrade, parseMaxGrade } from '../lib/gradeScale'
import { Field } from './ui'

// `value` é o texto digitado (aceita vírgula); quem usa valida com parseMaxGrade.
export function GradeScaleField({ value, onChange, disabled, label = 'Escala da nota', hint = 'A nota é proporcional aos acertos (acertos ÷ questões válidas × nota máxima).' }) {
  const parsed = parseMaxGrade(value)
  const [custom, setCustom] = useState(() => !GRADE_SCALE_PRESETS.includes(parsed))
  const selected = custom ? 'custom' : String(parsed)
  return <Field label={label} hint={parsed ? hint : `Informe uma nota máxima maior que zero e até ${MAX_GRADE_LIMIT}.`}>
    <span className="grade-scale-field">
      <select value={selected} disabled={disabled} onChange={(event) => {
        const next = event.target.value
        setCustom(next === 'custom')
        if (next !== 'custom') onChange(next)
      }}>
        {GRADE_SCALE_PRESETS.map((max) => <option key={max} value={String(max)}>0 a {formatMaxGrade(max)}</option>)}
        <option value="custom">Outra nota máxima…</option>
      </select>
      {custom && <input type="text" inputMode="decimal" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-label="Nota máxima" aria-invalid={!parsed} placeholder="Ex.: 5" />}
    </span>
  </Field>
}

export function GradeRoundingField({ value, onChange, disabled }) {
  return <Field label="Arredondamento" hint="Vale para a nota de cada aluno.">
    <span className="grade-scale-field">
      <select value={value.mode} disabled={disabled} aria-label="Direção do arredondamento" onChange={(event) => onChange({ ...value, mode: event.target.value })}>
        {ROUNDING_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
      </select>
      <select value={String(value.step)} disabled={disabled} aria-label="Precisão do arredondamento" onChange={(event) => onChange({ ...value, step: Number(event.target.value) })}>
        {ROUNDING_STEPS.map((step) => <option key={step.value} value={String(step.value)}>{step.label}</option>)}
      </select>
    </span>
  </Field>
}
