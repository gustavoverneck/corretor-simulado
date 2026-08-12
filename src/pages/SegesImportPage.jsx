import { useRef, useState } from 'react'
import { UploadCloud, FileSpreadsheet, Database, CheckCircle2, AlertTriangle, Download, ArrowRight, RefreshCw, ShieldCheck, Clock3, FileCheck2, Info, X } from 'lucide-react'
import { Badge, Button } from '../components/ui'
import { autoMapHeaders, fieldDefinitions, importSegesRows, readSegesFile, sampleCsv, validateMapping } from '../lib/seges'
import { cn, downloadBlob, formatDateTime } from '../lib/utils'

export function SegesImportPage({ data, setData, setPage, notify }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fileInfo, setFileInfo] = useState(null)
  const [mapping, setMapping] = useState({})
  const [summary, setSummary] = useState(null)

  async function selectFile(file) {
    if (!file) return
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      notify('Formato não reconhecido', 'Envie um relatório CSV ou XLSX. Arquivos XLS antigos devem ser salvos como XLSX.', 'warning')
      return
    }
    setLoading(true); setSummary(null)
    try {
      const parsed = await readSegesFile(file)
      if (!parsed.rows.length) throw new Error('A primeira planilha não contém registros.')
      setFileInfo({ ...parsed, name: file.name, size: file.size })
      setMapping(autoMapHeaders(parsed.headers))
    } catch (error) {
      notify('Falha ao abrir o relatório', error.message || 'Verifique o arquivo exportado.', 'warning')
    } finally {
      setLoading(false)
    }
  }

  function confirmImport() {
    const missing = validateMapping(mapping)
    if (missing.length) {
      notify('Mapeamento incompleto', `Associe as colunas: ${missing.join(', ')}.`, 'warning')
      return
    }
    const imported = importSegesRows(data, fileInfo.rows, mapping, fileInfo.name)
    setData(imported.state)
    setSummary(imported.summary)
    notify('Importação concluída', `${imported.summary.added} novos e ${imported.summary.updated} atualizados.`)
  }

  function clearFile() {
    setFileInfo(null); setMapping({}); setSummary(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function downloadTemplate() {
    downloadBlob(new Blob([`\ufeff${sampleCsv()}`], { type: 'text/csv;charset=utf-8' }), 'modelo-importacao-seges.csv')
  }

  return (
    <div className="page-stack seges-page">
      <div className="seges-intro">
        <div className="seges-logo"><Database size={25} /><span>ES</span></div>
        <div><div className="eyebrow">IMPORTAÇÃO LOCAL</div><h2>Relatório de alunos do SEGES</h2><p>Importe a planilha que você exportou do Sistema Estadual de Gestão Escolar. O Sistema de Avaliações organiza matrículas e cria as turmas automaticamente.</p></div>
        <Badge tone="blue"><ShieldCheck size={14} /> Sem conexão externa</Badge>
      </div>

      <div className="import-stepper">
        <div className={cn('active', fileInfo && 'done')}><span>{fileInfo ? <CheckCircle2 /> : '1'}</span><p><strong>Enviar arquivo</strong><small>CSV ou Excel</small></p></div><i />
        <div className={cn(fileInfo && 'active', summary && 'done')}><span>{summary ? <CheckCircle2 /> : '2'}</span><p><strong>Conferir dados</strong><small>Colunas e prévia</small></p></div><i />
        <div className={cn(summary && 'active')}><span>3</span><p><strong>Concluir</strong><small>Resumo da atualização</small></p></div>
      </div>

      {!fileInfo ? (
        <div className="import-layout">
          <section className="panel import-upload-card">
            <div className="card-heading"><span><FileSpreadsheet size={22} /></span><div><h3>Selecione o relatório exportado</h3><p>A primeira linha deve conter os nomes das colunas.</p></div></div>
            <div className={cn('import-drop-zone', dragging && 'dragging', loading && 'loading')} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files[0]) }}>
              {loading ? <><RefreshCw className="spin" size={30} /><h3>Lendo a planilha...</h3></> : <><span><UploadCloud size={29} /></span><h3>Arraste o arquivo do SEGES aqui</h3><p>ou escolha no seu computador</p><Button variant="secondary" onClick={() => inputRef.current?.click()}>Selecionar arquivo</Button><small>.CSV ou .XLSX · máximo 20 MB</small></>}
              <input ref={inputRef} hidden type="file" accept=".csv,.xlsx" onChange={(event) => selectFile(event.target.files[0])} />
            </div>
            <div className="template-download"><FileSpreadsheet size={18} /><p><strong>Quer conferir o formato antes?</strong><small>Baixe um arquivo modelo com as colunas reconhecidas.</small></p><button onClick={downloadTemplate}><Download size={16} /> Baixar modelo</button></div>
          </section>

          <aside className="panel seges-howto">
            <h3>Como obter o arquivo</h3>
            <ol><li><span>1</span><p>Acesse o <strong>SEGES</strong> com seu acesso institucional.</p></li><li><span>2</span><p>Abra a área de <strong>Relatórios</strong> e gere a relação nominal de alunos.</p></li><li><span>3</span><p>Filtre o <strong>ano letivo, escola e situação da matrícula</strong>.</p></li><li><span>4</span><p>Exporte em <strong>Excel ou CSV</strong> e envie ao lado.</p></li></ol>
            <div className="howto-note"><Info size={17} /><p>Os nomes dos menus podem variar conforme seu nível de acesso no SEGES. Em dúvida, use a relação de alunos que contenha matrícula, nome, turma, série e turno.</p></div>
          </aside>
        </div>
      ) : !summary ? (
        <section className="panel mapping-panel">
          <header className="selected-file"><span><FileCheck2 size={24} /></span><div><strong>{fileInfo.name}</strong><small>{fileInfo.rows.length} linhas · {(fileInfo.size / 1024).toFixed(1)} KB · aba “{fileInfo.sheetName}”</small></div><Badge tone="green">Arquivo lido</Badge><button className="icon-button" onClick={clearFile}><X size={18} /></button></header>
          <div className="mapping-heading"><div><h3>Associe as colunas</h3><p>Já reconhecemos as correspondências mais prováveis. Confira antes de importar.</p></div><Badge tone={validateMapping(mapping).length ? 'ochre' : 'green'}>{validateMapping(mapping).length ? `${validateMapping(mapping).length} obrigatória(s) pendente(s)` : 'Campos obrigatórios OK'}</Badge></div>
          <div className="mapping-grid">
            {fieldDefinitions.map((field) => <label className={cn('mapping-field', field.required && !mapping[field.key] && 'missing')} key={field.key}><span>{field.label}{field.required && <b> obrigatório</b>}</span><select value={mapping[field.key] || ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Não importar</option>{fileInfo.headers.map((header) => <option value={header} key={header}>{header}</option>)}</select><small>Prévia: {mapping[field.key] ? String(fileInfo.rows[0][mapping[field.key]] || '—') : '—'}</small></label>)}
          </div>
          <div className="data-preview"><h3>Prévia dos registros <span>primeiras 5 linhas</span></h3><div className="table-wrap"><table><thead><tr><th>MATRÍCULA</th><th>NOME</th><th>TURMA</th><th>SÉRIE</th><th>TURNO</th><th>SITUAÇÃO</th></tr></thead><tbody>{fileInfo.rows.slice(0, 5).map((row, index) => <tr key={index}><td>{row[mapping.registration] || '—'}</td><td><strong>{row[mapping.name] || '—'}</strong></td><td>{row[mapping.className] || '—'}</td><td>{row[mapping.grade] || '—'}</td><td>{row[mapping.shift] || '—'}</td><td>{row[mapping.status] || 'Ativo'}</td></tr>)}</tbody></table></div></div>
          <footer className="mapping-footer"><div><ShieldCheck size={18} /><p><strong>Matrícula opcional</strong>Quando não houver matrícula, o app criará um número interno automaticamente.</p></div><Button variant="ghost" onClick={clearFile}>Trocar arquivo</Button><Button icon={ArrowRight} onClick={confirmImport}>Importar {fileInfo.rows.length} registros</Button></footer>
        </section>
      ) : (
        <section className="panel import-success">
          <span className="success-mark"><CheckCircle2 size={35} /></span><div className="eyebrow">IMPORTAÇÃO CONCLUÍDA</div><h2>Base atualizada com sucesso</h2><p>O relatório foi processado e a origem dos registros ficou salva no histórico.</p>
          <div className="import-result-cards"><div><strong>{summary.added}</strong><span>alunos adicionados</span></div><div><strong>{summary.updated}</strong><span>cadastros atualizados</span></div><div><strong>{summary.skipped}</strong><span>linhas ignoradas</span></div><div><strong>{data.classes.length}</strong><span>turmas na base</span></div></div>
          {summary.errors.length > 0 && <details className="import-errors"><summary><AlertTriangle size={16} /> Ver {summary.errors.length} aviso(s)</summary>{summary.errors.slice(0, 20).map((error) => <p key={error}>{error}</p>)}</details>}
          <div className="success-actions"><Button variant="secondary" onClick={clearFile}>Importar outro arquivo</Button><Button onClick={() => setPage('people')}>Ir para turmas e alunos</Button></div>
        </section>
      )}

      {!fileInfo && <section className="panel import-history"><header className="panel-header"><div><h3>Histórico de importações</h3><p>Rastreabilidade das atualizações feitas nesta escola</p></div></header><div className="table-wrap"><table><thead><tr><th>ARQUIVO</th><th>DATA</th><th>RESULTADO</th><th>ORIGEM</th></tr></thead><tbody>{data.importHistory.map((item) => <tr key={item.id}><td><div className="title-cell"><span className="file-mini"><FileSpreadsheet size={17} /></span><strong>{item.filename}</strong></div></td><td><Clock3 size={14} /> {formatDateTime(item.createdAt)}</td><td><span className="import-count added">+{item.added} novos</span><span className="import-count updated">{item.updated} atualizados</span>{item.skipped > 0 && <span className="import-count skipped">{item.skipped} ignorados</span>}</td><td><Badge tone="blue">{item.source}</Badge></td></tr>)}</tbody></table></div></section>}
    </div>
  )
}
