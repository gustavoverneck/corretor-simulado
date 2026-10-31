import { useEffect, useRef, useState } from 'react'
import { Building2, ScanLine, Database, Save, RotateCcw, Download, Upload, HardDrive, FolderOpen, FileArchive, Monitor, RefreshCw } from 'lucide-react'
import { Badge, Button, Field } from '../components/ui'
import { createInitialState } from '../data'
import { formatDateTime } from '../lib/utils'
import { OmrSettingsPanel } from '../components/OmrSettingsPanel'
import { resolveOmrSettings } from '../lib/omrSettings'
import { chooseAutoBackupFolder, clearAutoBackupFolder, isAutoBackupSupported, openAutoBackupFolder } from '../lib/autoBackup'
import { chooseScanArchiveFolder, clearScanArchiveFolder, getScanArchiveFolder, isScanArchiveSupported } from '../lib/scanArchive'
import { normalizeSubmissionVoid } from '../lib/voidedSubmission'

function updateStatusLabel(updates) {
  if (!updates.supported) return 'Atualização automática indisponível neste modo'
  if (updates.status === 'checking') return 'Procurando atualização...'
  if (updates.status === 'downloading') return 'Baixando a nova versão em segundo plano...'
  if (updates.status === 'ready') return `Nova versão${updates.version ? ` ${updates.version}` : ''} pronta: será instalada ao reiniciar o app`
  if (updates.status === 'current') return 'Você está usando a versão mais recente'
  if (updates.status === 'error') return `Não foi possível verificar agora (${updates.error || 'sem conexão'})`
  return 'Verificação automática ativada'
}

export function SettingsPage({ data, setData, notify, exportBackup, backupMeta, autoBackup, storageStatus, storageBackend }) {
  const restoreInput = useRef(null)
  const [activeSection, setActiveSection] = useState('school')
  const [scanFolder, setScanFolder] = useState(null)
  const scanArchiveSupported = isScanArchiveSupported()
  const [updates, setUpdates] = useState(null)

  useEffect(() => {
    if (!window.desktopUpdates) return undefined
    window.desktopUpdates.getState().then(setUpdates).catch(() => {})
    return window.desktopUpdates.onState((state) => setUpdates((current) => ({ ...current, ...state })))
  }, [])

  useEffect(() => { getScanArchiveFolder().then(setScanFolder).catch(() => {}) }, [])

  async function changeAutoBackupFolder(clear = false) {
    try {
      const folder = clear ? await clearAutoBackupFolder() : await chooseAutoBackupFolder()
      autoBackup?.setFolder(folder)
      if (clear) notify('Backup automático desativado', 'Os backups já gravados continuam na pasta.')
      else if (folder) notify('Backup automático ativado', 'Uma cópia completa é gravada agora. As próximas vêm depois das alterações e ao fechar o app.')
    } catch (error) {
      notify('Não foi possível usar a pasta', error.message, 'warning')
    }
  }

  async function changeScanFolder(clear = false) {
    try {
      const folder = clear ? await clearScanArchiveFolder() : await chooseScanArchiveFolder()
      setScanFolder(folder)
      if (clear) notify('Arquivo das folhas desativado', 'As próximas correções não guardarão cópia do arquivo escaneado. Os arquivos já guardados continuam na pasta.')
      else if (folder) notify('Pasta das folhas definida', 'Cada PDF ou imagem corrigida terá uma cópia guardada nessa pasta.')
    } catch (error) {
      notify('Não foi possível usar a pasta', error.message, 'warning')
    }
  }

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
      <nav className="settings-nav"><button className={activeSection === 'school' ? 'active' : ''} onClick={() => goToSection('school')}><Building2 size={17} /> Escola</button><button className={activeSection === 'omr' ? 'active' : ''} onClick={() => goToSection('omr')}><ScanLine size={17} /> Leitura óptica</button><button className={activeSection === 'scans' ? 'active' : ''} onClick={() => goToSection('scans')}><FileArchive size={17} /> Folhas escaneadas</button><button className={activeSection === 'database' ? 'active' : ''} onClick={() => goToSection('database')}><Database size={17} /> Banco local</button></nav>
      <div className="settings-content page-stack">
        <section id="settings-school" className="panel settings-section"><header><span><Building2 size={20} /></span><div><h3>Identificação da escola</h3><p>Informações usadas no cabeçalho das folhas e relatórios.</p></div></header><form onSubmit={saveSchool} className="form-grid two-columns"><Field label="Nome da unidade"><input name="name" defaultValue={data.school.name} /></Field><Field label="Código INEP"><input name="inep" defaultValue={data.school.inep} /></Field><Field label="Endereço"><input name="address" defaultValue={data.school.address || ''} placeholder="Rua, número e bairro" /></Field><Field label="CEP"><input name="postalCode" defaultValue={data.school.postalCode || ''} placeholder="00000-000" /></Field><Field label="Município"><input name="city" defaultValue={data.school.city} /></Field><Field label="UF"><input name="state" defaultValue={data.school.state} maxLength="2" /></Field><div className="settings-save"><Button type="submit" icon={Save}>Salvar alterações</Button></div></form></section>
        <OmrSettingsPanel settings={data.settings?.omr} onChange={updateOmrSettings} />
        <section id="settings-scans" className="panel settings-section"><header><span><FileArchive size={20} /></span><div><h3>Arquivo das folhas escaneadas</h3><p>Guarda uma cópia de cada PDF ou imagem corrigida, para consultar a folha original depois.</p></div>{scanArchiveSupported ? <Badge tone={scanFolder ? 'green' : 'neutral'}>{scanFolder ? 'Ativado' : 'Desativado'}</Badge> : <Badge tone="neutral"><Monitor size={13} /> Só no aplicativo desktop</Badge>}</header>
          {scanArchiveSupported ? <div className="scan-archive-folder"><div><strong>{scanFolder || 'Nenhuma pasta escolhida'}</strong><p>{scanFolder ? 'Os arquivos ficam em uma subpasta por simulado. Um mesmo PDF enviado de novo não é copiado duas vezes. Se mover a pasta inteira, escolha o novo local aqui.' : 'Escolha uma pasta, por exemplo dentro do OneDrive, para começar a guardar as folhas.'}</p></div><div>{scanFolder && <Button variant="ghost" onClick={() => changeScanFolder(true)}>Desativar</Button>}<Button icon={FolderOpen} onClick={() => changeScanFolder()}>{scanFolder ? 'Trocar pasta' : 'Escolher pasta'}</Button></div></div>
            : <p className="setting-note">No navegador, a folha escaneada é usada só durante a correção. Use o aplicativo desktop para guardar os PDFs numa pasta do computador e abrir a folha original de cada aluno depois.</p>}
        </section>
        {updates && <section id="settings-updates" className="panel settings-section"><header><span><RefreshCw size={20} /></span><div><h3>Atualizações</h3><p>O app instalado procura versões novas no GitHub ao abrir e a cada 4 horas, baixa em segundo plano e pergunta antes de reiniciar.</p></div><Badge tone={updates.status === 'ready' ? 'green' : updates.status === 'error' ? 'ochre' : 'neutral'}>Versão {updates.currentVersion}</Badge></header>
          <div className="scan-archive-folder"><div><strong>{updateStatusLabel(updates)}</strong><p>{updates.supported ? 'Seus dados, as folhas escaneadas e os backups não são afetados pela atualização.' : 'A atualização automática funciona no app instalado pelo Setup.exe. No modo de teste (npm run desktop) ela fica desligada.'}</p></div><div><Button variant="secondary" icon={RefreshCw} disabled={!updates.supported || ['checking', 'downloading', 'ready'].includes(updates.status)} onClick={() => window.desktopUpdates.check().then(setUpdates)}>Verificar agora</Button></div></div>
        </section>}
        <section id="settings-database" className="panel settings-section local-database-section"><header><span><Database size={20} /></span><div><h3>Banco de dados local</h3><p>Todos os cadastros e resultados ficam somente neste navegador.</p></div><Badge tone="green"><HardDrive size={13} /> Somente neste dispositivo</Badge></header><div className="storage-status-grid"><div><span>Armazenamento</span><strong>{storageBackend === 'indexeddb' ? 'Banco do navegador (IndexedDB)' : 'Armazenamento simples (limitado)'}</strong></div><div><span>Proteção contra limpeza automática</span><strong>{storageStatus?.persisted ? 'Ativada' : storageStatus?.persisted === false ? 'Não concedida pelo navegador' : 'Indisponível'}</strong></div><div><span>Espaço usado</span><strong>{storageStatus?.usage != null ? `${(storageStatus.usage / 1024 / 1024).toFixed(1).replace('.', ',')} MB${storageStatus.quota ? ` de ${(storageStatus.quota / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB` : ''}` : 'Indisponível'}</strong></div><div><span>Último backup</span><strong>{backupMeta?.lastBackupAt ? formatDateTime(backupMeta.lastBackupAt) : 'Nenhum neste navegador'}</strong></div></div><div className="local-data-summary"><div><strong>{data.students.length}</strong><span>alunos</span></div><div><strong>{data.classes.length}</strong><span>turmas</span></div><div><strong>{data.assessments.length}</strong><span>simulados</span></div><div><strong>{data.submissions.length}</strong><span>correções</span></div></div>{isAutoBackupSupported() && <div className="scan-archive-folder auto-backup-folder"><div><strong>{autoBackup?.folder ? `Backup automático em ${autoBackup.folder}` : 'Backup automático desativado'}</strong><p>{autoBackup?.folder ? (autoBackup.error ? `Falha na última gravação: ${autoBackup.error}` : `${autoBackup.savedAt ? `Última cópia em ${formatDateTime(autoBackup.savedAt)}. ` : ''}Grava ao abrir o app, no máximo a cada 5 minutos depois de alterações e ao fechar. Ficam as 20 cópias mais novas e uma por dia dos últimos 30 dias.`) : 'Você desativou o backup automático. Escolha uma pasta, por exemplo dentro do OneDrive, para o app voltar a gravar cópias do banco sozinho.'}</p></div><div>{autoBackup?.folder && <Button variant="ghost" onClick={() => changeAutoBackupFolder(true)}>Desativar</Button>}{autoBackup?.folder && <Button variant="secondary" icon={FolderOpen} onClick={() => openAutoBackupFolder().catch(() => {})}>Abrir pasta</Button>}<Button icon={FolderOpen} onClick={() => changeAutoBackupFolder()}>{autoBackup?.folder ? 'Trocar pasta' : 'Escolher pasta'}</Button></div></div>}<div className="backup-action"><div><strong>Backup manual</strong><p>Exporte regularmente uma cópia completa. Ela pode ser restaurada neste ou em outro computador.</p></div><div><Button variant="secondary" icon={Upload} onClick={() => restoreInput.current?.click()}>Restaurar backup</Button><Button icon={Download} onClick={exportBackup}>Baixar backup</Button><input ref={restoreInput} hidden type="file" accept="application/json,.json" onChange={(event) => restoreBackup(event.target.files[0])} /></div></div><div className="danger-action"><p><strong>Restaurar dados iniciais</strong><small>Substitui as alterações locais feitas neste navegador.</small></p><Button variant="danger" icon={RotateCcw} onClick={() => { if (window.confirm('Restaurar todos os dados da demonstração?')) { setData(createInitialState()); notify('Base restaurada', 'Os dados iniciais foram recuperados.') } }}>Restaurar demonstração</Button></div></section>
      </div>
    </div>
  )
}
