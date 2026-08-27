import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, UsersRound, ClipboardList, ScanLine, BarChart3, Upload,
  Settings, Search, ChevronDown, GraduationCap, Menu, X, HelpCircle, HardDrive,
} from 'lucide-react'
import { createInitialState } from './data'
import { DashboardPage } from './pages/DashboardPage'
import { PeoplePage } from './pages/PeoplePage'
import { AssessmentsPage } from './pages/AssessmentsPage'
import { CorrectionPage } from './pages/CorrectionPage'
import { SegesImportPage } from './pages/SegesImportPage'
import { ResultsPage } from './pages/ResultsPage'
import { SettingsPage } from './pages/SettingsPage'
import { Toast } from './components/ui'
import { cn, formatDateTime } from './lib/utils'
import { getQuestionAreas } from './lib/knowledgeAreas'
import { getPendingReviewSubmissions } from './lib/assessment'

const STORAGE_KEY = 'luma-avaliacoes-state-v1'

const navigation = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'people', label: 'Turmas e alunos', icon: UsersRound },
  { id: 'assessments', label: 'Simulados', icon: ClipboardList },
  { id: 'correction', label: 'Correção', icon: ScanLine },
  { id: 'results', label: 'Resultados', icon: BarChart3 },
  { id: 'import', label: 'Importar SEGES', icon: Upload },
]

const titles = {
  dashboard: ['Visão geral', 'Acompanhe suas aplicações e resultados em um só lugar.'],
  people: ['Turmas e alunos', 'Cadastros organizados e sincronizados com a origem.'],
  assessments: ['Simulados', 'Crie, aplique e acompanhe seus instrumentos avaliativos.'],
  correction: ['Central de correção', 'Digitalize folhas e revise marcações com segurança.'],
  results: ['Resultados', 'Transforme respostas em decisões pedagógicas.'],
  import: ['Importar do SEGES', 'Atualize alunos e turmas a partir de um relatório oficial.'],
  settings: ['Configurações', 'Ajuste a escola, a leitura óptica e o banco de dados local.'],
}

function loadInitialState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      const assessments = Array.isArray(parsed?.assessments)
        ? parsed.assessments.map((assessment) => ({ ...assessment, questionAreas: getQuestionAreas(assessment) }))
        : parsed.assessments
      if (parsed?.school?.id === 'school-1' && parsed.school.name === 'EEEFM Maria Ortiz') {
        return { ...parsed, school: createInitialState().school, assessments }
      }
      return { ...parsed, assessments }
    }
  } catch {
    // O estado demonstrativo é usado quando o armazenamento está indisponível.
  }
  return createInitialState()
}

export default function App() {
  const [data, setData] = useState(loadInitialState)
  const [page, setPage] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('page')
    return titles[requested] ? requested : 'dashboard'
  })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [globalSearch, setGlobalSearch] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])

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
  }), [data])

  const currentTitle = titles[page] || titles.dashboard
  const activeStudents = data.students.filter((student) => student.status.toLowerCase() === 'ativo').length
  const pendingReviewCount = getPendingReviewSubmissions(data.submissions, data.assessments).length

  return (
    <div className="app-shell">
      <aside className={cn('sidebar', sidebarOpen && 'sidebar-open')}>
        <div className="brand" onClick={() => context.setPage('dashboard')} role="button" tabIndex="0">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Sistema de</strong><small>Avaliações</small></span>
        </div>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X size={19} /></button>

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
          <button className={cn(page === 'settings' && 'active')} onClick={() => context.setPage('settings')}><Settings size={18} /> Configurações</button>
          <button><HelpCircle size={18} /> Central de ajuda</button>
          <div className="storage-meter">
            <div><span>Dados locais</span><small>{activeStudents} alunos</small></div>
            <div className="meter"><i style={{ width: `${Math.min(92, 18 + activeStudents / 4)}%` }} /></div>
            <small>Última importação: {data.importHistory?.[0] ? formatDateTime(data.importHistory[0].createdAt) : 'nenhuma'}</small>
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
          <div className="page-heading">
            <div><h1>{currentTitle[0]}</h1><p>{currentTitle[1]}</p></div>
          </div>
          {page === 'dashboard' && <DashboardPage {...context} />}
          {page === 'people' && <PeoplePage {...context} initialSearch={globalSearch} />}
          {page === 'assessments' && <AssessmentsPage {...context} />}
          {page === 'correction' && <CorrectionPage {...context} />}
          {page === 'results' && <ResultsPage {...context} />}
          {page === 'import' && <SegesImportPage {...context} />}
          {page === 'settings' && <SettingsPage {...context} />}
        </section>
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
