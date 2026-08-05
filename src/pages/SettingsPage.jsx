import { useRef } from 'react'
import { Building2, ScanLine, Database, Save, RotateCcw, Info, Download, Upload, HardDrive } from 'lucide-react'
import { Badge, Button, Field } from '../components/ui'
import { createInitialState } from '../data'
import { downloadBlob } from '../lib/utils'

export function SettingsPage({ data, setData, notify }) {
  const restoreInput = useRef(null)
  const threshold = Math.round((data.settings?.omr?.markThreshold ?? 0.38) * 100)
  const ambiguity = Math.round((data.settings?.omr?.ambiguityThreshold ?? 0.22) * 100)

  function updateOmrSetting(key, percent) {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        omr: { markThreshold: 0.38, ambiguityThreshold: 0.22, ...current.settings?.omr, [key]: Number(percent) / 100 },
      },
    }))
  }

  function saveSchool(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setData((current) => ({
      ...current,
      school: {
        ...current.school,
        name: String(form.get('name')).trim(),
        inep: String(form.get('inep')).trim(),
        address: String(form.get('address')).trim(),
        city: String(form.get('city')).trim(),
        state: String(form.get('state')).trim().toUpperCase(),
        postalCode: String(form.get('postalCode')).trim(),
      },
    }))
    notify('Configurações salvas', 'Os dados aparecerão nas próximas folhas geradas.')
  }

  function exportBackup() {
    const backup = {
      format: 'sistema-avaliacoes-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      data,
    }
    const date = new Date().toISOString().slice(0, 10)
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `backup-sistema-avaliacoes-${date}.json`)
    notify('Backup criado', 'Guarde o arquivo em uma pasta segura ou unidade externa.')
  }

  async function restoreBackup(file) {
    if (!file) return
    try {
      const backup = JSON.parse(await file.text())
      const restored = ['luma-backup', 'sistema-avaliacoes-backup'].includes(backup?.format) ? backup.data : backup
      if (!restored || !Array.isArray(restored.students) || !Array.isArray(restored.classes) || !Array.isArray(restored.assessments)) {
        throw new Error('Estrutura de dados inválida.')
      }
      if (!window.confirm(`Restaurar o backup “${file.name}” e substituir os dados atuais?`)) return
      setData(restored)
      notify('Backup restaurado', `${restored.students.length} alunos e ${restored.classes.length} turmas recuperados.`)
    } catch (error) {
      notify('Backup inválido', error.message || 'Não foi possível ler esse arquivo.', 'warning')
    } finally {
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav"><button className="active"><Building2 size={17} /> Escola</button><button><ScanLine size={17} /> Leitura óptica</button><button><Database size={17} /> Banco local</button></nav>
      <div className="settings-content page-stack">
        <section className="panel settings-section"><header><span><Building2 size={20} /></span><div><h3>Identificação da escola</h3><p>Informações usadas no cabeçalho das folhas e relatórios.</p></div></header><form onSubmit={saveSchool} className="form-grid two-columns"><Field label="Nome da unidade"><input name="name" defaultValue={data.school.name} /></Field><Field label="Código INEP"><input name="inep" defaultValue={data.school.inep} /></Field><Field label="Endereço"><input name="address" defaultValue={data.school.address || ''} placeholder="Rua, número e bairro" /></Field><Field label="CEP"><input name="postalCode" defaultValue={data.school.postalCode || ''} placeholder="00000-000" /></Field><Field label="Município"><input name="city" defaultValue={data.school.city} /></Field><Field label="UF"><input name="state" defaultValue={data.school.state} maxLength="2" /></Field><div className="settings-save"><Button type="submit" icon={Save}>Salvar alterações</Button></div></form></section>
        <section className="panel settings-section"><header><span><ScanLine size={20} /></span><div><h3>Leitura óptica</h3><p>Parâmetros de confiança para detectar preenchimentos.</p></div><Badge tone="green">Padrão recomendado</Badge></header><div className="range-setting"><div><strong>Marca confirmada</strong><p>Escurecimento mínimo para considerar uma bolha preenchida.</p></div><input type="range" min="25" max="60" value={threshold} onChange={(event) => updateOmrSetting('markThreshold', event.target.value)} /><b>{threshold}%</b></div><div className="range-setting"><div><strong>Zona de ambiguidade</strong><p>Marcações acima deste valor são enviadas para revisão.</p></div><input type="range" min="10" max="35" value={ambiguity} onChange={(event) => updateOmrSetting('ambiguityThreshold', event.target.value)} /><b>{ambiguity}%</b></div><div className="setting-note"><Info size={17} /> As alterações são salvas automaticamente no banco local. Use os valores padrão até concluir testes com as folhas impressas da escola.</div></section>
        <section className="panel settings-section local-database-section"><header><span><Database size={20} /></span><div><h3>Banco de dados local</h3><p>Todos os cadastros e resultados ficam somente neste navegador.</p></div><Badge tone="green"><HardDrive size={13} /> Somente neste dispositivo</Badge></header><div className="local-data-summary"><div><strong>{data.students.length}</strong><span>alunos</span></div><div><strong>{data.classes.length}</strong><span>turmas</span></div><div><strong>{data.assessments.length}</strong><span>simulados</span></div><div><strong>{data.submissions.length}</strong><span>correções</span></div></div><div className="backup-action"><div><strong>Backup manual</strong><p>Exporte regularmente uma cópia completa. Ela pode ser restaurada neste ou em outro computador.</p></div><div><Button variant="secondary" icon={Upload} onClick={() => restoreInput.current?.click()}>Restaurar backup</Button><Button icon={Download} onClick={exportBackup}>Baixar backup</Button><input ref={restoreInput} hidden type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files[0])} /></div></div><div className="danger-action"><p><strong>Restaurar dados iniciais</strong><small>Substitui as alterações locais feitas neste navegador.</small></p><Button variant="danger" icon={RotateCcw} onClick={() => { if (window.confirm('Restaurar todos os dados da demonstração?')) { setData(createInitialState()); notify('Base restaurada', 'Os dados iniciais foram recuperados.') } }}>Restaurar demonstração</Button></div></section>
      </div>
    </div>
  )
}
