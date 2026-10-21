import { useMemo, useRef, useState } from 'react'
import { Info, ScanLine, Upload, RotateCcw } from 'lucide-react'
import { Badge, Button } from './ui'
import { DEFAULT_OMR_SETTINGS, OMR_PROFILES, resolveOmrSettings } from '../lib/omrSettings'
import { prepareOmrCalibration } from '../lib/omr'
import { analyzeOmrCalibration, calibrationLabel, calibrationStatus, createOmrExamples } from '../lib/omrCalibration'

function marksOverlay(answer, selected = false) {
  const status = calibrationStatus(answer)
  return answer.optionPositions.filter((_, index) => answer.selected.includes(String.fromCharCode(65 + index))).map((position, index) => (
    <circle key={`${answer.question}-${index}`} className={`omr-mark omr-mark-${status}`} cx={position.x} cy={position.y} r={position.radius} fill="none" strokeWidth={selected ? 3 : 1.7} />
  ))
}

export function OmrSettingsPanel({ settings: storedSettings, onChange }) {
  const settings = resolveOmrSettings(storedSettings)
  const threshold = Math.round(settings.markThreshold * 100)
  const ambiguity = Math.round(settings.ambiguityThreshold * 100)
  const currentProfile = OMR_PROFILES.find((profile) => profile.settings.markThreshold === settings.markThreshold && profile.settings.ambiguityThreshold === settings.ambiguityThreshold)
  const [photo, setPhoto] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedQuestion, setSelectedQuestion] = useState(1)
  const photoInput = useRef(null)
  const uploadId = useRef(0)
  const examples = useMemo(() => createOmrExamples((width, height) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }), [])
  const prepared = photo || examples
  const reading = useMemo(() => analyzeOmrCalibration(prepared, settings), [prepared, settings.markThreshold, settings.ambiguityThreshold, settings.colorThreshold])
  const bounds = useMemo(() => {
    const points = Object.values(prepared.corners)
    const left = Math.max(0, Math.min(...points.map((point) => point.x)) - 30)
    const top = Math.max(0, Math.min(...points.map((point) => point.y)) - 30)
    return { left, top, width: Math.min(prepared.pixels.width, Math.max(...points.map((point) => point.x)) + 30) - left, height: Math.min(prepared.pixels.height, Math.max(...points.map((point) => point.y)) + 30) - top }
  }, [prepared])

  async function loadPhoto(file) {
    if (!file) return
    const request = ++uploadId.current
    setLoading(true)
    setError('')
    try {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Selecione uma imagem JPG, PNG ou WEBP.')
      if (file.size > 15 * 1024 * 1024) throw new Error('Selecione uma imagem de até 15 MB.')
      const next = await prepareOmrCalibration(file)
      if (request !== uploadId.current) return
      setPhoto(next)
      setSelectedQuestion(1)
    } catch (failure) {
      if (request === uploadId.current) setError(failure.message || 'Não foi possível testar esta imagem.')
    } finally {
      if (request === uploadId.current) setLoading(false)
    }
  }

  return <section id="settings-omr" className="panel settings-section omr-settings-panel">
    <header><span><ScanLine size={20} /></span><div><h3>Leitura óptica</h3><p>Ajuste os critérios e acompanhe a leitura na prévia.</p></div><Badge tone={currentProfile?.id === 'photo' ? 'green' : 'neutral'}>{currentProfile?.label || 'Personalizado'}</Badge></header>
    <div className="omr-profile-picker" aria-label="Perfis de leitura">
      {OMR_PROFILES.map((profile) => <button type="button" key={profile.id} className={currentProfile?.id === profile.id ? 'active' : ''} aria-pressed={currentProfile?.id === profile.id} onClick={() => onChange(profile.settings)}><strong>{profile.label}</strong><span>{profile.description}</span></button>)}
    </div>
    <div className="range-setting"><div><label htmlFor="omr-mark-threshold"><strong>Rigor da marca confirmada</strong></label><p>Maior rigor exige mais contraste. Marcas nítidas de tinta azul também são consideradas.</p></div><input id="omr-mark-threshold" type="range" min="25" max="60" step="1" value={threshold} onChange={(event) => onChange({ markThreshold: Number(event.target.value) / 100 })} /><output htmlFor="omr-mark-threshold">{threshold}%</output></div>
    <div className="range-setting"><div><label htmlFor="omr-ambiguity-threshold"><strong>Limiar da zona de dúvida</strong></label><p>Menor valor detecta mais sinais fracos e pede mais revisões. Maior valor descarta sinais fracos e pode deixar marcas muito leves em branco.</p></div><input id="omr-ambiguity-threshold" type="range" min="10" max="35" step="1" value={ambiguity} onChange={(event) => onChange({ ambiguityThreshold: Number(event.target.value) / 100 })} /><output htmlFor="omr-ambiguity-threshold">{ambiguity}%</output></div>
    <div className="omr-preview">
      <div className="omr-preview-header"><div><h4>{photo ? 'Leitura da sua folha' : 'Veja como o leitor decide'}</h4><p>{photo ? `${photo.format.questionCount} questões · ${photo.name}` : `${examples.labels.length} exemplos com o mesmo leitor usado na correção.`}</p></div><div>
        {photo && <Button variant="ghost" size="sm" onClick={() => { uploadId.current += 1; setPhoto(null); setError(''); setLoading(false) }}>Voltar aos exemplos</Button>}
        <Button variant="secondary" size="sm" icon={Upload} disabled={loading} onClick={() => photoInput.current?.click()}>{loading ? 'Preparando leitura…' : 'Testar minha folha'}</Button>
        <input ref={photoInput} hidden type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto para testar a leitura" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; loadPhoto(file) }} />
      </div></div>
      {error && <p role="alert" className="omr-preview-error">{error}</p>}
      <div className="omr-preview-counts" aria-live="polite" aria-atomic="true">
        <span className="marked"><strong>{reading.counts.marked}</strong> confirmadas</span><span className="uncertain"><strong>{reading.counts.uncertain}</strong> para revisar</span><span className="multiple"><strong>{reading.counts.multiple}</strong> múltiplas</span><span className="blank"><strong>{reading.counts.blank}</strong> em branco</span>
      </div>
      {photo ? <div className="omr-photo-preview">
        <svg viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`} role="img" aria-label="Área de respostas da foto com as marcações identificadas"><image href={photo.preview} width={photo.pixels.width} height={photo.pixels.height} />{reading.answers.map((answer) => <g key={answer.question}>{marksOverlay(answer, answer.question === selectedQuestion)}</g>)}</svg>
        <div className="omr-photo-answers" aria-label="Leitura por questão">{reading.answers.map((answer) => <button type="button" key={answer.question} className={`omr-answer-${calibrationStatus(answer)} ${answer.question === selectedQuestion ? 'active' : ''}`} aria-pressed={answer.question === selectedQuestion} onClick={() => setSelectedQuestion(answer.question)}>Q{String(answer.question).padStart(2, '0')}<span>{calibrationLabel(answer)}</span></button>)}</div>
      </div> : <div className="omr-example-list">{reading.answers.map((answer, index) => {
        const first = answer.optionPositions[0]
        const last = answer.optionPositions.at(-1)
        return <div className="omr-example-row" key={answer.question}><strong>{examples.labels[index]}</strong><svg viewBox={`${first.x - 20} ${first.y - 13} ${last.x - first.x + 40} 26`} role="img" aria-label={`${examples.labels[index]}: ${calibrationLabel(answer)}`}><image href={examples.preview} width={examples.pixels.width} height={examples.pixels.height} />{marksOverlay(answer)}</svg><span className={`omr-status omr-status-${calibrationStatus(answer)}`}>{calibrationLabel(answer)}</span></div>
      })}</div>}
      <div className="omr-preview-legend"><span className="marked">Confirmada</span><span className="uncertain">Revisar</span><span className="multiple">Múltipla</span><span className="blank">Em branco</span></div>
      <p className="omr-preview-footnote">A prévia muda junto com os ajustes. Testar uma foto não salva correções nem altera notas. A imagem fica apenas neste dispositivo.</p>
    </div>
    <div className="setting-guide"><strong>Menos dúvidas, com conferência</strong><p>Comece por “Foto com sombra” para caneta azul ou preta. Se uma marca muito leve desaparecer, reduza o limiar da zona de dúvida. Marcas duplas e preenchimentos incompletos devem continuar visíveis para revisão.</p><dl><div><dt>Rigor maior</dt><dd>Exige mais contraste para confirmar preenchimentos claros.</dd></div><div><dt>Rigor menor</dt><dd>Aceita mais sinais de preenchimento, inclusive marcas leves.</dd></div><div><dt>Limiar da dúvida maior</dt><dd>Descarta mais sinais fracos. Reduz revisões, mas pode ignorar preenchimentos muito leves.</dd></div><div><dt>Limiar da dúvida menor</dt><dd>Preserva mais sinais fracos para conferência, aumentando as revisões.</dd></div></dl></div>
    <div className="omr-settings-footer"><div className="setting-note"><Info size={17} /> Os ajustes são salvos no dispositivo e usados nas próximas leituras. Correções anteriores não são recalculadas.</div><Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => onChange(DEFAULT_OMR_SETTINGS)}>Restaurar ajuste recomendado</Button></div>
  </section>
}
