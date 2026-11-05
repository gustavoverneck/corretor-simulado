import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { Badge, Button } from './ui'
import { getAnswerKeyVersions } from '../lib/assessment'
import { uid } from '../lib/utils'
import {
  getVersionMarking, guessMarkingValues, markingLayout, markingProblems, MAX_MARKING_FIELDS, MAX_MARKING_OPTIONS, MIN_MARKING_OPTIONS, suggestVersionMarking,
} from '../lib/versionMarking'

const parseOptions = (text) => text.split(/[,;\n]/).map((option) => option.trim()).filter(Boolean)

function fieldsToDraft(fields) {
  return fields.map((field) => ({ ...field, optionsText: field.options.join(', ') }))
}

function draftToFields(draft) {
  return draft.map((field) => ({ id: field.id, label: field.label.trim(), options: parseOptions(field.optionsText) }))
}

// Miniatura da caixa impressa, nas mesmas coordenadas da folha.
function MarkingPreview({ fields }) {
  const grid = fields.map((field) => field.options.length)
  const layout = markingLayout(grid)
  if (!layout) return null
  return (
    <svg className="version-marking-preview" viewBox={`${layout.box.left - 6} ${layout.box.top - 6} ${layout.box.width + 12} ${layout.box.height + 12}`} role="img" aria-label="Prévia do campo na folha">
      <rect x={layout.box.left} y={layout.box.top} width={layout.box.width} height={layout.box.height} rx="7" fill="#f1f4f2" />
      {layout.rows.map((row, field) => <g key={field}>
        <text x={layout.labelX} y={row.y + 3.2} fontFamily="Arial" fontSize="8.5" fontWeight="700" fill="#26312d">{fields[field].label.toUpperCase().slice(0, 22)}</text>
        {row.bubbles.map((bubble, option) => <g key={option}>
          <circle cx={bubble.x} cy={bubble.y} r={layout.radius} fill="white" stroke="#4b5651" strokeWidth="1.2" />
          <text x={bubble.x + layout.radius + 4} y={row.y + 3.2} fontFamily="Arial" fontSize="9" fill="#26312d">{fields[field].options[option].slice(0, 14)}</text>
        </g>)}
      </g>)}
    </svg>
  )
}

export function VersionMarkingSettings({ assessment, setData, notify, closed }) {
  const versions = getAnswerKeyVersions(assessment).filter((version) => version.id !== 'default')
  const saved = getVersionMarking(assessment)?.fields || []
  const [draft, setDraft] = useState(() => fieldsToDraft(saved))
  const [values, setValues] = useState(() => Object.fromEntries(versions.map((version) => [version.id, version.markingValues || {}])))
  useEffect(() => {
    setDraft(fieldsToDraft(getVersionMarking(assessment)?.fields || []))
    setValues(Object.fromEntries(getAnswerKeyVersions(assessment).map((version) => [version.id, version.markingValues || {}])))
  }, [assessment.id])

  const fields = draftToFields(draft)
  const fieldErrors = fields.map((field) => !field.label ? 'Dê um nome ao campo.'
    : field.options.length < MIN_MARKING_OPTIONS ? `Informe ao menos ${MIN_MARKING_OPTIONS} opções, separadas por vírgula.`
    : field.options.length > MAX_MARKING_OPTIONS ? `Cabem até ${MAX_MARKING_OPTIONS} opções por campo na folha.`
    : new Set(field.options.map((option) => option.toLowerCase())).size !== field.options.length ? 'Há opções repetidas.'
    : null)
  const versionsWithValues = versions.map((version) => ({ ...version, markingValues: values[version.id] || {} }))
  const problems = useMemo(() => fieldErrors.some(Boolean) || !fields.length ? [] : markingProblems(assessment, fields, versionsWithValues), [JSON.stringify(fields), JSON.stringify(values), assessment])
  const multiVersionClasses = assessment.classIds.filter((classId) => (assessment.answerKeyVersionIdsByClass?.[classId] || []).length >= 2)
  const dirty = JSON.stringify(fields) !== JSON.stringify(saved)
    || versions.some((version) => JSON.stringify(values[version.id] || {}) !== JSON.stringify(version.markingValues || {}))

  function suggest() {
    const suggested = suggestVersionMarking(versions, () => uid('campo'))
    if (!suggested.length) {
      notify('Sem sugestão', 'Os nomes das versões não seguem um padrão como "amarelo-ING". Crie os campos manualmente.', 'warning')
      return
    }
    setDraft(fieldsToDraft(suggested))
    setValues(Object.fromEntries(versions.map((version) => [version.id, guessMarkingValues({ label: version.label }, suggested)])))
  }

  function addField() {
    setDraft((current) => [...current, { id: uid('campo'), label: current.length ? 'Idioma' : 'Cor da prova', optionsText: current.length ? 'Inglês, Espanhol' : 'Amarelo, Verde, Azul, Branco' }])
  }

  function changeField(index, changes) {
    setDraft((current) => current.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...changes } : field))
  }

  function removeField(index) {
    const fieldId = draft[index].id
    setDraft((current) => current.filter((_, fieldIndex) => fieldIndex !== index))
    setValues((current) => Object.fromEntries(Object.entries(current).map(([versionId, value]) => {
      const { [fieldId]: _removed, ...rest } = value
      return [versionId, rest]
    })))
  }

  function fillFromNames() {
    setValues((current) => Object.fromEntries(versions.map((version) => [version.id, guessMarkingValues({ label: version.label, markingValues: current[version.id] }, fields)])))
  }

  function chooseValue(versionId, fieldId, value) {
    setValues((current) => {
      const next = { ...(current[versionId] || {}) }
      if (value === '') delete next[fieldId]
      else next[fieldId] = Number(value)
      return { ...current, [versionId]: next }
    })
  }

  function save() {
    if (fieldErrors.some(Boolean)) {
      notify('Confira os campos', fieldErrors.find(Boolean), 'warning')
      return
    }
    const fieldIds = new Set(fields.map((field) => field.id))
    setData((current) => ({
      ...current,
      assessments: current.assessments.map((item) => {
        if (item.id !== assessment.id) return item
        const { versionMarking: _old, ...rest } = item
        return {
          ...rest,
          ...(fields.length ? { versionMarking: { fields } } : {}),
          answerKeyVersions: (item.answerKeyVersions || []).map((version) => {
            const kept = Object.fromEntries(Object.entries(values[version.id] || {}).filter(([fieldId, option]) => fieldIds.has(fieldId) && Number.isInteger(option)))
            const { markingValues: _values, ...versionRest } = version
            return Object.keys(kept).length ? { ...versionRest, markingValues: kept } : versionRest
          }),
        }
      }),
    }))
    notify(
      fields.length ? 'Campos salvos' : 'Campos removidos',
      fields.length
        ? `As próximas folhas impressas terão ${fields.map((field) => field.label.toLowerCase()).join(' e ')} para o aluno marcar. Folhas já impressas continuam sendo corrigidas pela versão cadastrada.`
        : 'As próximas folhas saem sem o campo de tipo de prova.',
      problems.length ? 'warning' : 'success',
    )
  }

  if (versions.length < 2) {
    return <div className="version-marking-empty">Este simulado tem uma só versão de gabarito. O campo de cor/idioma aparece quando uma turma tem duas ou mais versões.</div>
  }

  return (
    <div className="version-marking">
      {!multiVersionClasses.length && <div className="scan-notice is-info"><p>Nenhuma turma tem mais de uma versão associada, então a folha não mostrará o campo. Associe as versões às turmas em <strong>Editar</strong>.</p></div>}

      <section className="version-marking-fields">
        <header>
          <div><strong>Campos na folha</strong><small>Até {MAX_MARKING_FIELDS} campos, com {MIN_MARKING_OPTIONS} a {MAX_MARKING_OPTIONS} opções cada. Escreva as opções separadas por vírgula.</small></div>
          <div>
            <Button type="button" variant="secondary" size="sm" icon={Sparkles} disabled={closed} onClick={suggest}>Sugerir pelos nomes das versões</Button>
            {draft.length < MAX_MARKING_FIELDS && <Button type="button" variant="secondary" size="sm" icon={Plus} disabled={closed} onClick={addField}>Adicionar campo</Button>}
          </div>
        </header>
        {!draft.length && <p className="version-marking-hint">Nenhum campo ainda. Use a sugestão (por exemplo, versões "amarelo-ING" e "azul-ESP" viram Cor da prova e Idioma) ou adicione os campos.</p>}
        {draft.map((field, index) => <div className="version-marking-field" key={field.id}>
          <label><span>Nome do campo</span><input value={field.label} maxLength={22} disabled={closed} onChange={(event) => changeField(index, { label: event.target.value })} /></label>
          <label><span>Opções</span><input value={field.optionsText} disabled={closed} onChange={(event) => changeField(index, { optionsText: event.target.value })} placeholder="Amarelo, Verde, Azul, Branco" /></label>
          <button type="button" className="version-marking-remove" disabled={closed} onClick={() => removeField(index)} aria-label={`Remover ${field.label || 'campo'}`}><Trash2 size={14} /></button>
          {fieldErrors[index] && <small className="version-marking-error">{fieldErrors[index]}</small>}
        </div>)}
        {fields.length > 0 && !fieldErrors.some(Boolean) && <MarkingPreview fields={fields} />}
      </section>

      {fields.length > 0 && !fieldErrors.some(Boolean) && <section className="version-marking-versions">
        <header>
          <div><strong>O que cada versão marca</strong><small>Na correção, a versão é escolhida pelas bolhas marcadas. Se o aluno não marcar ou marcar duas opções, vale a versão cadastrada e a folha vai para revisão.</small></div>
          <Button type="button" variant="ghost" size="sm" icon={Sparkles} disabled={closed} onClick={fillFromNames}>Preencher pelos nomes</Button>
        </header>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Versão</th>{fields.map((field) => <th key={field.id}>{field.label}</th>)}</tr></thead>
            <tbody>{versions.map((version) => <tr key={version.id}>
              <td><strong>{version.label}</strong></td>
              {fields.map((field) => <td key={field.id}>
                <select value={values[version.id]?.[field.id] ?? ''} disabled={closed} onChange={(event) => chooseValue(version.id, field.id, event.target.value)} aria-label={`${field.label} de ${version.label}`}>
                  <option value="">—</option>
                  {field.options.map((option, optionIndex) => <option value={optionIndex} key={optionIndex}>{option}</option>)}
                </select>
              </td>)}
            </tr>)}</tbody>
          </table>
        </div>
        {problems.length > 0 && <div className="scan-notice is-warning"><X size={16} /><p><strong>Ajuste antes de imprimir.</strong> {problems.map((problem) => problem.message).join(' ')}</p></div>}
        {!problems.length && <div className="scan-notice is-success"><CheckCircle2 size={16} /><p>Cada versão tem uma combinação própria. A correção vai escolher a versão sozinha.</p></div>}
      </section>}

      <footer className="version-marking-actions">
        {saved.length > 0 && <Badge tone="green">Ativo nas próximas folhas</Badge>}
        <Button type="button" size="sm" icon={CheckCircle2} disabled={closed || !dirty} onClick={save}>Salvar</Button>
      </footer>
    </div>
  )
}
