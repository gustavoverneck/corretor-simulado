import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, GitCompare, GraduationCap, Eye, KeyRound, LogOut, Menu, RefreshCw, X } from 'lucide-react'
import { ResultsPage } from './pages/ResultsPage'
import { CorrelationPage } from './pages/CorrelationPage'
import { Button, Toast } from './components/ui'
import { cn, formatDateTime } from './lib/utils'
import { normalizeState } from './lib/normalizeState'
import { VIEWER_POLL_MS, fetchSharedData, fetchSharedVersion, readSavedViewerCode, saveViewerCode } from './lib/lanShare'

// Modo de consulta: o que outro professor vê ao abrir o endereço compartilhado na
// rede local. Só Resultados e Análise, com os dados do computador que compartilha.
// Nada é salvo: setData não existe aqui e o servidor só aceita leitura.

const pages = [
  { id: 'results', label: 'Resultados', icon: BarChart3, title: 'Resultados', subtitle: 'Desempenho das turmas e dos alunos nos simulados.' },
  { id: 'correlation', label: 'Análise', icon: GitCompare, title: 'Análise', subtitle: 'Desempenho das questões, das áreas e dos alunos em cada simulado.' },
]

function readOnlyGuard() {}

export default function ViewerApp() {
  const [code, setCode] = useState(readSavedViewerCode)
  const [shared, setShared] = useState(null) // { data, version, updatedAt }
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(Boolean(readSavedViewerCode()))

  const load = useCallback(async (accessCode, { quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const [version, data] = await Promise.all([fetchSharedVersion(accessCode), fetchSharedData(accessCode)])
      setShared({ data: normalizeState(data), version: version.version, updatedAt: version.updatedAt })
      setError(null)
      saveViewerCode(accessCode)
      setCode(accessCode)
      return true
    } catch (loadError) {
      if (loadError.status === 401 || loadError.status === 429) {
        saveViewerCode('')
        setShared(null)
      }
      setError(loadError.message)
      return false
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const saved = readSavedViewerCode()
    if (saved) load(saved)
  }, [load])

  if (!shared) return <ViewerLogin initialCode={code} loading={loading} error={error} onSubmit={(value) => load(value)} />
  return <ViewerWorkspace shared={shared} code={code} error={error} onReload={() => load(code, { quiet: true })} onCheckVersion={async () => {
    try {
      const version = await fetchSharedVersion(code)
      if (version.version !== shared.version) await load(code, { quiet: true })
      else setError(null)
    } catch (checkError) {
      if (checkError.status === 401 || checkError.status === 429) { saveViewerCode(''); setShared(null) }
      setError(checkError.message)
    }
  }} onLeave={() => { saveViewerCode(''); setShared(null); setCode(''); setError(null) }} />
}

function ViewerLogin({ initialCode, loading, error, onSubmit }) {
  const [value, setValue] = useState(initialCode || '')
  const clean = value.replace(/\D/g, '').slice(0, 6)
  return (
    <div className="viewer-login">
      <form className="viewer-login-card" onSubmit={(event) => { event.preventDefault(); if (clean.length === 6) onSubmit(clean) }}>
        <span className="brand-mark"><i /><i /><i /></span>
        <h1>Resultados compartilhados</h1>
        <p>Digite o código de acesso que aparece no computador do professor que está compartilhando os resultados.</p>
        <label className="viewer-code-field">
          <span><KeyRound size={16} /> Código de acesso</span>
          <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={clean} onChange={(event) => setValue(event.target.value)} placeholder="000000" aria-label="Código de acesso" />
        </label>
        {error && <p className="viewer-login-error" role="alert">{error}</p>}
        <Button type="submit" disabled={clean.length !== 6 || loading} icon={loading ? RefreshCw : Eye}>{loading ? 'Carregando…' : 'Ver resultados'}</Button>
        <small>Somente consulta: nada do que você fizer aqui altera os dados.</small>
      </form>
    </div>
  )
}

function ViewerWorkspace({ shared, error, onReload, onCheckVersion, onLeave }) {
  const [page, setPage] = useState('results')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const checkRef = useRef(onCheckVersion)
  checkRef.current = onCheckVersion

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') checkRef.current() }, VIEWER_POLL_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const { data } = shared
  const current = pages.find((item) => item.id === page) || pages[0]
  const context = useMemo(() => ({
    data,
    setData: readOnlyGuard,
    readOnly: true,
    notify: (title, message, tone = 'success') => setToast({ title, message, tone }),
  }), [data])

  return (
    <div className="app-shell viewer-shell">
      <aside className={cn('sidebar', sidebarOpen && 'sidebar-open')}>
        <div className="brand">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Sistema de</strong><small>Avaliações</small></span>
        </div>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={19} /></button>
        <div className="school-chip">
          <span className="school-avatar"><GraduationCap size={18} /></span>
          <span><strong>{data.school?.name}</strong><small>{[data.school?.city, data.school?.state].filter(Boolean).join(' · ')}</small></span>
        </div>
        <nav className="main-nav">
          <span className="nav-label">CONSULTA</span>
          {pages.map((item) => (
            <button key={item.id} className={cn(page === item.id && 'active')} onClick={() => { setPage(item.id); setSidebarOpen(false); window.scrollTo({ top: 0 }) }}>
              <item.icon size={18} strokeWidth={1.9} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={onLeave}><LogOut size={18} /><span>Sair</span></button>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <div className="viewer-topbar-note"><Eye size={16} /><span><strong>Somente consulta</strong><small>{shared.updatedAt ? `Dados de ${formatDateTime(shared.updatedAt)}` : 'Dados compartilhados na rede local'}</small></span></div>
          <div className="viewer-topbar-actions">
            <Button size="sm" variant="secondary" icon={RefreshCw} disabled={refreshing} onClick={async () => { setRefreshing(true); await onReload(); setRefreshing(false) }}>{refreshing ? 'Atualizando…' : 'Atualizar'}</Button>
          </div>
        </header>
        <section className="content-area">
          {error && <div className="storage-alert storage-alert-danger" role="alert"><Eye size={18} /><p><strong>Sem conexão com o computador que compartilha</strong>{error} Você continua vendo os últimos dados carregados.</p></div>}
          <div className="page-heading"><div><h1>{current.title}</h1><p>{current.subtitle}</p></div></div>
          {page === 'results' && <ResultsPage {...context} />}
          {page === 'correlation' && <CorrelationPage {...context} />}
        </section>
      </main>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
