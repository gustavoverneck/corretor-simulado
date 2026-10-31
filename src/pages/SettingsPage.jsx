import { useRef, useState } from 'react'
import { Building2, ScanLine, Database, Save, RotateCcw, Download, Upload, HardDrive } from 'lucide-react'
import { Badge, Button, Field } from '../components/ui'
import { createInitialState } from '../data'
import { formatDateTime } from '../lib/utils'
import { OmrSettingsPanel } from '../components/OmrSettingsPanel'
import { resolveOmrSettings } from '../lib/omrSettings'
import { normalizeSubmissionVoid } from '../lib/voidedSubmission'

export function SettingsPage({ data, setData, notify, exportBackup, backupMeta, storageStatus, storageBackend }) {
  const restoreInput = useRef(null)
  const [activeSection, setActiveSection] = useState('school')

  function goToSection(section) {
    setActiveSection(section)
    document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function updateOmrSettings(values) {
    setData((current) => ({
      ...current,
      settings: {
        ...current.settings,
        omr: { ...resolveOmrSettings(current.settings?.omr), ...values },
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

  async function restoreBackup(file) {
    if (!file) return
    try {
      const backup = JSON.parse(await file.text())
      const restored = ['luma-backup', 'sistema-avaliacoes-backup'].includes(backup?.format) ? backup.data : backup
      if (!restored || !Array.isArray(restored.students) || !Array.isArray(restored.classes) || !Array.isArray(restored.assessments)) {
        throw new Error('Estrutura de dados inválida.')
      }
      if (!window.confirm(`Restaurar o backup “${file.name}” e substituir os dados atuais?`)) return
      setData({ ...restored, submissions: Array.isArray(restored.submissions) ? restored.submissions.map(normalizeSubmissionVoid) : [] })
      notify('Backup restaurado', `${restored.students.length} alunos e ${restored.classes.length} turmas recuperados.`)
    } catch (error) {
      notify('Backup inválido', error.message || 'Não foi possível ler esse arquivo.', 'warning')
    } finally {
      if (restoreInput.current) restoreInput.current.value = ''
    }
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav"><button className={activeSection === 'school' ? 'active' : ''} onClick={() => goToSection('school')}><Building2 size={17} /> Escola</button><button className={activeSection === 'omr' ? 'active' : ''} onClick={() => goToSection('omr')}><ScanLine size={17} /> Leitura óptica</button><button className={activeSection === 'database' ? 'active' : ''} onClick={() => goToSection('database')}><Database size={17} /> Banco local</button></nav>
      <div className="settings-content page-stack">
        <section id="settings-school" className="panel settings-section"><header><span><Building2 size={20} /></span><div><h3>Identificação da escola</h3><p>Informações usadas no cabeçalho das folhas e relatórios.</p></div></header><form onSubmit={saveSchool} className="form-grid two-columns"><Field label="Nome da unidade"><input name="name" defaultValue={data.school.name} /></Field><Field label="Código INEP"><input name="inep" defaultValue={data.school.inep} /></Field><Field label="Endereço"><input name="address" defaultValue={data.school.address || ''} placeholder="Rua, número e bairro" /></Field><Field label="CEP"><input name="postalCode" defaultValue={data.school.postalCode || ''} placeholder="00000-000" /></Field><Field label="Município"><input name="city" defaultValue={data.school.city} /></Field><Field label="UF"><input name="state" defaultValue={data.school.state} maxLength="2" /></Field><div className="settings-save"><Button type="submit" icon={Save}>Salvar alterações</Button></div></form></section>
        <OmrSettingsPanel settings={data.settings?.omr} onChange={updateOmrSettings} />
        <section id="settings-database" className="panel settings-section local-database-section"><header><span><Database size={20} /></span><div><h3>Banco de dados local</h3><p>Todos os cadastros e resultados ficam somente neste navegador.</p></div><Badge tone="green"><HardDrive size={13} /> Somente neste dispositivo</Badge></header><div className="storage-status-grid"><div><span>Armazenamento</span><strong>{storageBackend === 'indexeddb' ? 'Banco do navegador (IndexedDB)' : 'Armazenamento simples (limitado)'}</strong></div><div><span>Proteção contra limpeza automática</span><strong>{storageStatus?.persisted ? 'Ativada' : storageStatus?.persisted === false ? 'Não concedida pelo navegador' : 'Indisponível'}</strong></div><div><span>Espaço usado</span><strong>{storageStatus?.usage != null ? `${(storageStatus.usage / 1024 / 1024).toFixed(1).replace('.', ',')} MB${storageStatus.quota ? ` de ${(storageStatus.quota / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB` : ''}` : 'Indisponível'}</strong></div><div><span>Último backup</span><strong>{backupMeta?.lastBackupAt ? formatDateTime(backupMeta.lastBackupAt) : 'Nenhum neste navegador'}</strong></div></div><div className="local-data-summary"><div><strong>{data.students.length}</strong><span>alunos</span></div><div><strong>{data.classes.length}</strong><span>turmas</span></div><div><strong>{data.assessments.length}</strong><span>simulados</span></div><div><strong>{data.submissions.length}</strong><span>correções</span></div></div><div className="backup-action"><div><strong>Backup manual</strong><p>Exporte regularmente uma cópia completa. Ela pode ser restaurada neste ou em outro computador.</p></div><div><Button variant="secondary" icon={Upload} onClick={() => restoreInput.current?.click()}>Restaurar backup</Button><Button icon={Download} onClick={exportBackup}>Baixar backup</Button><input ref={restoreInput} hidden type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files[0])} /></div></div><div className="danger-action"><p><strong>Restaurar dados iniciais</strong><small>Substitui as alterações locais feitas neste navegador.</small></p><Button variant="danger" icon={RotateCcw} onClick={() => { if (window.confirm('Restaurar todos os dados da demonstração?')) { setData(createInitialState()); notify('Base restaurada', 'Os dados iniciais foram recuperados.') } }}>Restaurar demonstração</Button></div></section>
      </div>
    </div>
  )
}
