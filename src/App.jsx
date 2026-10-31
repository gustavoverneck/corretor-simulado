import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard, UsersRound, ClipboardList, ScanLine, BarChart3, Upload,
  Settings, Search, ChevronDown, GraduationCap, Menu, X, HelpCircle, HardDrive,
  PanelLeftClose, PanelLeftOpen, GitCompare, AlertTriangle, Download,
} from 'lucide-react'
import { createInitialState } from './data'
import { DashboardPage } from './pages/DashboardPage'
import { PeoplePage } from './pages/PeoplePage'
import { AssessmentsPage } from './pages/AssessmentsPage'
import { CorrectionPage } from './pages/CorrectionPage'
import { SegesImportPage } from './pages/SegesImportPage'
import { ResultsPage } from './pages/ResultsPage'
import { CorrelationPage } from './pages/CorrelationPage'
import { SettingsPage } from './pages/SettingsPage'
import { Button, Toast } from './components/ui'
import { cn, formatDateTime } from './lib/utils'
import { getQuestionAreas } from './lib/knowledgeAreas'
import { getPendingReviewSubmissions } from './lib/assessment'
import { backupReminder, getStorageStatus, isQuotaError, loadStoredState, readBackupMeta, recordBackup, requestPersistentStorage, saveStoredState, snoozeBackupReminder } from './lib/storage'
import { downloadBackup } from './lib/backup'
import { createAutoBackupScheduler, getAutoBackupFolder, writeAutoBackup } from './lib/autoBackup'
import { normalizeSubmissionVoid } from './lib/voidedSubmission'

const SAVE_DELAY_MS = 400

const navigation = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'people', label: 'Turmas e alunos', icon: UsersRound },
  { id: 'assessments', label: 'Simulados', icon: ClipboardList },
  { id: 'correction', label: 'Correção', icon: ScanLine },
  { id: 'results', label: 'Resultados', icon: BarChart3 },
  { id: 'correlation', label: 'Análise', icon: GitCompare },
  { id: 'import', label: 'Importar SEGES', icon: Upload },
]

const titles = {
  dashboard: ['Visão geral', 'Acompanhe suas aplicações e resultados em um só lugar.'],
  people: ['Turmas e alunos', 'Cadastros organizados e sincronizados com a origem.'],
  assessments: ['Simulados', 'Crie, aplique e acompanhe seus instrumentos avaliativos.'],
  correction: ['Central de correção', 'Digitalize folhas e revise marcações com segurança.'],
  results: ['Resultados', 'Transforme respostas em decisões pedagógicas.'],
  correlation: ['Análise', 'Entenda o desempenho das questões, das áreas e dos alunos em cada simulado.'],
  import: ['Importar do SEGES', 'Atualize alunos e turmas a partir de um relatório oficial.'],
  settings: ['Configurações', 'Ajuste a escola, a leitura óptica e o banco de dados local.'],
}

function normalizeState(parsed) {
  if (!parsed) return createInitialState()
  const assessments = Array.isArray(parsed?.assessments)
    ? parsed.assessments.map((assessment) => ({ ...assessment, questionAreas: getQuestionAreas(assessment) }))
    : parsed.assessments
  const submissions = Array.isArray(parsed?.submissions) ? parsed.submissions.map(normalizeSubmissionVoid) : parsed.submissions
  return { ...parsed, assessments, submissions }
}

function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`
}

export default function App() {
  const [loaded, setLoaded] = useState(null)

  useEffect(() => {
    let active = true
    loadStoredState().then((result) => {
      if (active) setLoaded({ data: normalizeState(result.data), backend: result.backend })
    })
    requestPersistentStorage()
    return () => { active = false }
  }, [])

  if (!loaded) return <div className="app-loading" role="status"><span className="brand-mark"><i /><i /><i /></span><p>Carregando dados locais…</p></div>
  return <Workspace initialData={loaded.data} backend={loaded.backend} />
}

function Workspace({ initialData, backend }) {
  const [data, setData] = useState(initialData)
  const [saveError, setSaveError] = useState(null)
  const [backupMeta, setBackupMeta] = useState(readBackupMeta)
  const [storageStatus, setStorageStatus] = useState(null)
  const [autoBackupFolder, setAutoBackupFolder] = useState(null)
  const [autoBackupStatus, setAutoBackupStatus] = useState({ savedAt: null, file: null, error: null })
  const autoBackupScheduler = useRef(null)
  const latestData = useRef(initialData)
  const [page, setPage] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('page')
    return titles[requested] ? requested : 'dashboard'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toast, setToast] = useState(null)
  const [globalSearch, setGlobalSearch] = useState('')

  const pendingSave = useRef(null)
  const firstRender = useRef(true)

  const persist = useCallback(async (snapshot) => {
    try {
      await saveStoredState(snapshot, backend)
      setSaveError(null)
    } catch (error) {
      setSaveError(isQuotaError(error)
        ? 'O espaço de armazenamento do navegador acabou. Baixe um backup agora e libere espaço antes de continuar.'
        : `As últimas alterações não foram salvas neste navegador (${error?.message || 'erro desconhecido'}). Baixe um backup para não perdê-las.`)
    }
    getStorageStatus().then(setStorageStatus)
  }, [backend])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      getStorageStatus().then(setStorageStatus)
      return undefined
    }
    pendingSave.current = data
    const timer = window.setTimeout(() => { pendingSave.current = null; persist(data) }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [data, persist])

  useEffect(() => {
    // Grava imediatamente quando a aba vai para segundo plano ou está sendo fechada.
    const flush = () => { if (pendingSave.current) { const snapshot = pendingSave.current; pendingSave.current = null; persist(snapshot) } }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', flush) }
  }, [persist])

  // Backup automático (só no desktop, com pasta escolhida em Configurações).
  useEffect(() => { getAutoBackupFolder().then(setAutoBackupFolder).catch(() => {}) }, [])
  useEffect(() => {
    if (!autoBackupFolder) { autoBackupScheduler.current?.cancel(); autoBackupScheduler.current = null; return undefined }
    const scheduler = createAutoBackupScheduler({
      write: (snapshot) => writeAutoBackup(snapshot),
      onSaved: (result) => { setAutoBackupStatus({ savedAt: result.savedAt, file: result.file, error: null }); setBackupMeta(recordBackup(new Date(result.savedAt))) },
      onError: (error) => setAutoBackupStatus((current) => ({ ...current, error: error.message })),
    })
    autoBackupScheduler.current = scheduler
    scheduler.changed(latestData.current)
    return () => { scheduler.flush(); scheduler.cancel() }
  }, [autoBackupFolder])
  useEffect(() => {
    if (latestData.current === data) return
    latestData.current = data
    autoBackupScheduler.current?.changed(data)
  }, [data])
  useEffect(() => window.desktopWindow?.onBeforeClose(async () => {
    const snapshot = pendingSave.current
    pendingSave.current = null
    await Promise.all([snapshot ? persist(snapshot) : null, autoBackupScheduler.current?.flush()])
  }), [persist])

  useEffect(() => {
    if (!toast || toast.tone === 'loading') return undefined
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const context = useMemo(() => ({
    data,
    setData,
    setPage: (next) => {
      setPage(next)
      const url = new URL(window.location.href)
      if (next === 'dashboard') url.searchParams.delete('page')
      else url.searchParams.set('page', next)
      window.history.replaceState({}, '', url)
      setSidebarOpen(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    notify: (title, message, tone = 'success') => setToast({ title, message, tone }),
    exportBackup: () => {
      downloadBackup(data)
      setBackupMeta(recordBackup())
      setToast({ title: 'Backup criado', message: 'Guarde o arquivo em uma pasta segura ou unidade externa.', tone: 'success' })
    },
    backupMeta,
    autoBackup: { folder: autoBackupFolder, setFolder: setAutoBackupFolder, ...autoBackupStatus },
    storageStatus,
    storageBackend: backend,
  }), [data, backupMeta, storageStatus, backend, autoBackupFolder, autoBackupStatus])

  const reminder = backupReminder(data, backupMeta)

  const currentTitle = titles[page] || titles.dashboard
  const activeStudents = data.students.filter((student) => student.status.toLowerCase() === 'ativo').length
  const pendingReviewCount = getPendingReviewSubmissions(data.submissions, data.assessments).length

  return (
    <div className={cn('app-shell', sidebarCollapsed && 'sidebar-collapsed')}>
      <aside className={cn('sidebar', sidebarOpen && 'sidebar-open')}>
        <div className="brand" onClick={() => context.setPage('dashboard')} role="button" tabIndex="0">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Sistema de</strong><small>Avaliações</small></span>
        </div>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X size={19} /></button>
        <button className="sidebar-toggle" onClick={() => setSidebarCollapsed((current) => !current)} aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>

        <div className="school-chip">
          <span className="school-avatar"><GraduationCap size={18} /></span>
          <span><strong>{data.school.name}</strong><small>{data.school.city} · {data.school.state}</small></span>
          <ChevronDown size={15} />
        </div>

        <nav className="main-nav">
          <span className="nav-label">ESPAÇO DE TRABALHO</span>
          {navigation.map((item) => {
            const badge = item.id === 'correction'
              ? pendingReviewCount
              : null
            return (
              <button key={item.id} className={cn(page === item.id && 'active')} onClick={() => context.setPage(item.id)}>
                <item.icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
                {badge > 0 && <em>{badge}</em>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <button className={cn(page === 'settings' && 'active')} onClick={() => context.setPage('settings')}><Settings size={18} /><span>Configurações</span></button>
          <button><HelpCircle size={18} /><span>Central de ajuda</span></button>
          <div className="storage-meter">
            <div><span>Dados locais</span><small>{activeStudents} alunos</small></div>
            <div className="meter"><i style={{ width: `${storageStatus?.quota ? Math.max(2, Math.min(100, (storageStatus.usage / storageStatus.quota) * 100)) : 0}%` }} /></div>
            <small>{storageStatus?.usage != null ? `${formatBytes(storageStatus.usage)} usados` : 'Uso de espaço indisponível'}</small>
            <small>Último backup: {backupMeta.lastBackupAt ? formatDateTime(backupMeta.lastBackupAt) : 'nenhum'}</small>
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="top-search">
            <Search size={17} />
            <input
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && globalSearch.trim()) {
                  context.setPage('people')
                  sessionStorage.setItem('luma-search', globalSearch.trim())
                }
              }}
              placeholder="Buscar aluno, turma ou simulado..."
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <div className="local-mode"><HardDrive size={16} /><span><strong>Modo local</strong><small>Dados neste dispositivo</small></span></div>
          </div>
        </header>

        <section className="content-area">
          {saveError && <div className="storage-alert storage-alert-danger" role="alert"><AlertTriangle size={18} /><p><strong>Falha ao salvar</strong>{saveError}</p><Button size="sm" icon={Download} onClick={context.exportBackup}>Baixar backup</Button></div>}
          {!saveError && reminder && <div className="storage-alert" role="status"><HardDrive size={18} /><p><strong>{reminder.days == null ? 'Nenhum backup baixado ainda' : `Último backup há ${reminder.days} dias`}</strong>Os dados ficam só neste navegador e podem ser perdidos se ele for limpo ou reinstalado.</p><Button size="sm" icon={Download} onClick={context.exportBackup}>Baixar backup</Button><Button size="sm" variant="ghost" onClick={() => setBackupMeta(snoozeBackupReminder())}>Lembrar amanhã</Button></div>}
          <div className="page-heading">
            <div><h1>{currentTitle[0]}</h1><p>{currentTitle[1]}</p></div>
          </div>
          {page === 'dashboard' && <DashboardPage {...context} />}
          {page === 'people' && <PeoplePage {...context} initialSearch={globalSearch} />}
          {page === 'assessments' && <AssessmentsPage {...context} />}
          {page === 'correction' && <CorrectionPage {...context} />}
          {page === 'results' && <ResultsPage {...context} />}
          {page === 'correlation' && <CorrelationPage {...context} />}
          {page === 'import' && <SegesImportPage {...context} />}
          {page === 'settings' && <SettingsPage {...context} />}
        </section>
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
