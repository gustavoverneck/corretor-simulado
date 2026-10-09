import { useEffect, useState } from 'react'
import { Download, Eye, FileText, Presentation, LoaderCircle } from 'lucide-react'
import { Button, Field, Modal } from './ui'
import { buildResultsReport, REPORT_SECTIONS } from '../lib/resultsReport'
import { downloadBlob } from '../lib/utils'

const outputs = [
  { id: 'a4', label: 'PDF · A4', description: 'Documento vertical para leitura e impressão.', icon: FileText },
  { id: 'slides', label: 'PDF · Apresentação', description: 'Páginas horizontais em proporção 16:9.', icon: Presentation },
  { id: 'pptx', label: 'PowerPoint', description: 'Arquivo .pptx com textos e gráficos editáveis.', icon: Presentation },
]

export function ResultsReportModal({ open, onClose, source, notify }) {
  const [title, setTitle] = useState('Relatório de resultados')
  const [output, setOutput] = useState('a4')
  const [sections, setSections] = useState(() => REPORT_SECTIONS.map((section) => section.id))
  const [classDetails, setClassDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url) }, [preview])
  useEffect(() => { setPreview(null); setError('') }, [output, sections, classDetails, title, open])

  async function generate(previewOnly = false) {
    setBusy(true)
    setError('')
    try {
      const report = buildResultsReport({ ...source, title, sections, classDetails })
      const { generateReportFile } = await import('../lib/reportExport')
      const file = await generateReportFile(report, previewOnly && output === 'pptx' ? 'slides' : output)
      if (previewOnly) setPreview({ url: URL.createObjectURL(file.blob), pages: file.pages })
      else {
        downloadBlob(file.blob, file.filename)
        notify('Relatório gerado', `${file.pages} ${output === 'pptx' ? 'slides' : 'páginas'} com os resultados do recorte selecionado.`)
      }
    } catch (cause) {
      setError(cause.message || 'Não foi possível gerar o relatório. Tente novamente.')
    } finally { setBusy(false) }
  }

  return <Modal open={open} onClose={busy ? () => {} : onClose} title="Gerar relatório" subtitle="Gráficos e análise dos resultados nos filtros atuais." size="xl" footer={<>
    <Button variant="secondary" onClick={onClose} disabled={busy}>Fechar</Button>
    <Button variant="secondary" icon={Eye} onClick={() => generate(true)} disabled={busy}>Prévia em PDF</Button>
    <Button icon={busy ? LoaderCircle : Download} onClick={() => generate()} disabled={busy}>{busy ? 'Gerando…' : output === 'pptx' ? 'Baixar PowerPoint' : 'Baixar PDF'}</Button>
  </>}>
    <div className="results-report-options">
      <div className="report-scope-note"><strong>O que vai aparecer</strong><span>{source.rows.length} participações · {source.assessments.length} simulados · {source.filters.find(([label]) => label === 'Turmas')?.[1]}</span><p>Os gráficos e destaques mostram somente as atividades, áreas e faixas que você escolheu.</p></div>
      <Field label="Título do documento"><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={90} disabled={busy} /></Field>
      <fieldset className="report-format-options"><legend>Formato</legend><div>{outputs.map(({ id, label, description, icon: Icon }) => <label key={id} className={output === id ? 'selected' : ''}>
        <input type="radio" name="report-output" value={id} checked={output === id} onChange={() => setOutput(id)} disabled={busy} />
        <Icon size={22} /><strong>{label}</strong><span>{description}</span>
      </label>)}</div></fieldset>
      <fieldset className="report-section-options"><legend>O que você quer mostrar?</legend><p>A visão geral, o mapa dos resultados, os destaques e os próximos passos sempre acompanham o documento.</p><div>{REPORT_SECTIONS.map((section) => <label key={section.id}><input type="checkbox" checked={sections.includes(section.id)} onChange={() => setSections((current) => current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id])} disabled={busy} /><span>{section.label}</span></label>)}</div>
        <label className="report-class-detail"><input type="checkbox" checked={classDetails} onChange={(event) => setClassDetails(event.target.checked)} disabled={busy || !sections.includes('classes')} /><span>Adicionar um perfil por área para cada turma</span></label>
      </fieldset>
      {error && <p className="report-error" role="alert">{error}</p>}
      {preview && <section className="report-preview"><header><strong>Prévia do documento</strong><span>{preview.pages} páginas</span></header><iframe title="Prévia do relatório em PDF" src={preview.url} /></section>}
    </div>
  </Modal>
}
