import { useEffect, useState } from 'react'
import { ExternalLink, FileImage, FolderOpen, LoaderCircle } from 'lucide-react'
import { Button, EmptyState, Modal } from './ui'
import { getScanArchiveFolder, isScanArchiveSupported, loadArchivedScanImage, openArchivedScan, revealArchivedScan } from '../lib/scanArchive'

export function useScanArchiveFolder() {
  const [folder, setFolder] = useState(null)
  useEffect(() => {
    let active = true
    getScanArchiveFolder().then((value) => { if (active) setFolder(value) }).catch(() => {})
    return () => { active = false }
  }, [])
  return folder
}

function OriginalSheetModal({ scan, title, onClose }) {
  const [state, setState] = useState({ loading: true })
  useEffect(() => {
    let active = true
    let url = null
    setState({ loading: true })
    loadArchivedScanImage(scan)
      .then((value) => { url = value; if (active) setState({ url }); else URL.revokeObjectURL(value) })
      .catch((error) => { if (active) setState({ error: error.message }) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [scan.path, scan.page])

  async function run(action) {
    try { await action(scan) } catch (error) { setState((current) => ({ ...current, error: error.message })) }
  }

  return (
    <Modal open onClose={onClose} title={title || 'Folha original'} subtitle={`${scan.path}${scan.type === 'pdf' ? ` · página ${scan.page}` : ''}`} size="xl" footer={<><Button variant="ghost" icon={FolderOpen} onClick={() => run(revealArchivedScan)}>Mostrar na pasta</Button><Button variant="secondary" icon={ExternalLink} onClick={() => run(openArchivedScan)}>Abrir arquivo</Button><Button onClick={onClose}>Fechar</Button></>}>
      {state.loading && <div className="original-sheet-loading"><LoaderCircle size={22} className="spin" /> Carregando a folha...</div>}
      {state.error && <EmptyState icon={FileImage} title="Não foi possível mostrar a folha" description={state.error} />}
      {state.url && <div className="original-sheet-image"><img src={state.url} alt={title || 'Folha original escaneada'} /></div>}
    </Modal>
  )
}

// Botão "Folha original": aparece só no desktop e quando a correção tem a
// cópia do arquivo escaneado.
export function OriginalSheetButton({ scan, title, size = 'md', variant = 'secondary' }) {
  const [open, setOpen] = useState(false)
  if (!scan?.path || !isScanArchiveSupported()) return null
  return (
    <>
      <Button variant={variant} size={size} icon={FileImage} onClick={() => setOpen(true)}>Folha original</Button>
      {open && <OriginalSheetModal scan={scan} title={title} onClose={() => setOpen(false)} />}
    </>
  )
}
