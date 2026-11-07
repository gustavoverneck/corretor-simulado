import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderInput, FolderOpen, Play, Pause } from 'lucide-react'
import { Badge, Button } from './ui'
import {
  chooseScannerInboxFolder, clearScannerInboxFolder, getScannerInboxStatus, isScannerInboxSupported,
  revealScannerInbox, setScannerInboxAuto,
} from '../lib/scannerInbox'

const POLL_MS = 4000

// Acompanha a pasta do scanner enquanto a tela de correção está aberta.
export function useScannerInbox(notify) {
  const supported = isScannerInboxSupported()
  const [status, setStatus] = useState(null)
  const active = useRef(true)
  const refresh = useCallback(async () => {
    if (!supported) return null
    try {
      const next = await getScannerInboxStatus()
      if (active.current) setStatus(next)
      return next
    } catch {
      return null
    }
  }, [supported])

  useEffect(() => {
    active.current = true
    if (!supported) return undefined
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => { active.current = false; clearInterval(timer) }
  }, [supported, refresh])

  const run = useCallback(async (action) => {
    try {
      const next = await action()
      if (next && active.current) setStatus(next)
    } catch (error) {
      notify?.('Pasta do scanner', error.message, 'warning')
    }
  }, [notify])

  return { supported, status, setStatus, refresh, run }
}

export function ScannerInboxCard({ inbox, blockedReason, busy, onProcessNow }) {
  if (!inbox.supported) return null
  const { status, run } = inbox
  const folder = status?.folder
  const pending = status?.pending?.length || 0
  const waiting = status?.waiting || 0
  const auto = status?.auto !== false

  let badge = <Badge tone="neutral">Desligada</Badge>
  if (folder && status?.error) badge = <Badge tone="red">Pasta não encontrada</Badge>
  else if (folder && busy) badge = <Badge tone="blue">Corrigindo</Badge>
  else if (folder && auto) badge = <Badge tone="green">Acompanhando</Badge>
  else if (folder) badge = <Badge tone="ochre">Pausada</Badge>

  let message = 'Escolha a pasta onde o scanner salva os PDFs ou imagens. Cada arquivo novo que aparecer nela é corrigido sozinho, sem precisar arrastar.'
  if (folder && status?.error) message = status.error
  else if (folder && pending && blockedReason) message = `${pending} arquivo(s) novo(s) aguardando. ${blockedReason}`
  else if (folder && pending && !auto) message = `${pending} arquivo(s) novo(s) aguardando. A correção automática está pausada.`
  else if (folder && pending) message = `${pending} arquivo(s) novo(s) na fila.`
  else if (folder && waiting) message = 'Um arquivo está sendo gravado pelo scanner; ele entra na fila assim que terminar.'
  else if (folder) message = 'Nenhum arquivo novo. Os arquivos que já estavam na pasta quando ela foi escolhida não são corrigidos. Os arquivos nunca são movidos nem apagados.'

  return (
    <div className="scanner-inbox">
      <span className="scanner-inbox-icon"><FolderInput size={18} /></span>
      <div className="scanner-inbox-text">
        <div><strong>Pasta do scanner</strong>{badge}</div>
        {folder && <small title={folder}>{folder}</small>}
        <p>{message}</p>
      </div>
      <div className="scanner-inbox-actions">
        {folder && pending > 0 && !auto && !busy && !blockedReason && <Button size="sm" icon={Play} onClick={onProcessNow}>Corrigir agora</Button>}
        {folder && <Button size="sm" variant="ghost" icon={auto ? Pause : Play} onClick={() => run(() => setScannerInboxAuto(!auto))}>{auto ? 'Pausar' : 'Retomar'}</Button>}
        {folder && <Button size="sm" variant="ghost" icon={FolderOpen} onClick={() => run(revealScannerInbox)}>Abrir</Button>}
        {folder && <Button size="sm" variant="ghost" onClick={() => run(clearScannerInboxFolder)}>Desligar</Button>}
        <Button size="sm" variant={folder ? 'secondary' : 'primary'} icon={FolderInput} onClick={() => run(chooseScannerInboxFolder)}>{folder ? 'Trocar pasta' : 'Escolher pasta'}</Button>
      </div>
    </div>
  )
}
