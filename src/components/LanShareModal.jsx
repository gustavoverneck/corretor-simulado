import { useState } from 'react'
import { Check, Copy, Eye, KeyRound, Monitor, RefreshCw, ShieldCheck, Users, Wifi, WifiOff } from 'lucide-react'
import { Badge, Button, Modal } from './ui'
import { formatDateTime } from '../lib/utils'
import { isLanShareSupported } from '../lib/lanShare'

// Modal aberto pelo card "Modo local" no topo: liga/desliga o compartilhamento
// somente leitura na rede local e mostra o endereço e o código para os colegas.
export function LanShareModal({ open, onClose, status, busy, error, onToggle, onRegenerate }) {
  const [tab, setTab] = useState('share')
  const [copied, setCopied] = useState(null)
  const supported = isLanShareSupported()
  const enabled = Boolean(status?.enabled)

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      window.setTimeout(() => setCopied((current) => (current === text ? null : current)), 1800)
    } catch { /* área de transferência indisponível */ }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compartilhar na rede local" subtitle="Outros professores consultam Resultados e Análise pelo navegador, sem poder alterar nada." size="md"
      footer={<><span className="footer-note">{enabled ? 'O compartilhamento desliga quando você fecha o app.' : 'Os dados continuam somente neste computador.'}</span><Button variant="secondary" onClick={onClose}>Fechar</Button></>}>
      <div className="segmented-tabs lan-share-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'share'} className={tab === 'share' ? 'active' : ''} onClick={() => setTab('share')}>Compartilhar</button>
        <button type="button" role="tab" aria-selected={tab === 'help'} className={tab === 'help' ? 'active' : ''} onClick={() => setTab('help')}>Como os colegas acessam</button>
      </div>

      {tab === 'share' && (!supported ? (
        <div className="lan-share-unsupported"><Monitor size={22} /><p><strong>Disponível no aplicativo desktop</strong>Abra o Corretor de Simulados instalado no computador para compartilhar os resultados na rede da escola.</p></div>
      ) : (
        <div className="lan-share-body">
          <div className={`lan-share-switch${enabled ? ' is-on' : ''}`}>
            <span className="lan-share-icon">{enabled ? <Wifi size={20} /> : <WifiOff size={20} />}</span>
            <div><strong>{enabled ? 'Compartilhando na rede local' : 'Compartilhamento desligado'}</strong><small>{enabled ? `${status.viewers || 0} ${status.viewers === 1 ? 'professor consultando' : 'professores consultando'} agora${status.publishedAt ? ` · dados de ${formatDateTime(status.publishedAt)}` : ''}` : 'Ligue para gerar o endereço de acesso.'}</small></div>
            <button type="button" role="switch" aria-checked={enabled} aria-label="Compartilhar na rede local" className="lan-toggle" disabled={busy} onClick={onToggle}><i /></button>
          </div>
          {error && <p className="lan-share-error" role="alert">{error}</p>}

          {enabled && <>
            <section className="lan-share-section">
              <span className="lan-share-label">Endereço para abrir no navegador</span>
              {status.addresses?.length ? status.addresses.map((item) => (
                <div className="lan-share-address" key={item.url}>
                  <code>{item.url}</code>
                  <small>{item.name}</small>
                  <Button size="sm" variant="ghost" icon={copied === item.url ? Check : Copy} onClick={() => copy(item.url)}>{copied === item.url ? 'Copiado' : 'Copiar'}</Button>
                </div>
              )) : <p className="lan-share-muted">Nenhuma rede encontrada. Conecte o computador ao Wi-Fi ou ao cabo da escola.</p>}
            </section>
            <section className="lan-share-section lan-share-code">
              <div><span className="lan-share-label"><KeyRound size={14} /> Código de acesso</span><strong>{status.code?.replace(/(\d{3})(\d{3})/, '$1 $2')}</strong></div>
              <Button size="sm" variant="secondary" icon={RefreshCw} disabled={busy} onClick={onRegenerate} title="Quem já está consultando precisará digitar o novo código">Gerar novo código</Button>
            </section>
          </>}
        </div>
      ))}

      {tab === 'help' && (
        <div className="lan-share-help">
          <div><span><Wifi size={17} /></span><p><strong>Mesma rede</strong>O colega precisa estar na mesma rede (Wi-Fi ou cabo) que este computador, e este app precisa ficar aberto.</p></div>
          <div><span><KeyRound size={17} /></span><p><strong>Endereço e código</strong>Ele abre o endereço no navegador (computador ou celular) e digita o código de 6 dígitos. Para cortar o acesso de todos, gere um novo código ou desligue.</p></div>
          <div><span><Eye size={17} /></span><p><strong>Somente consulta</strong>Ele vê Resultados e Análise, usa os filtros e pode baixar planilhas e relatórios. Não vê a correção, os cadastros nem as configurações, e nada do que ele fizer altera os seus dados.</p></div>
          <div><span><Users size={17} /></span><p><strong>Sempre atualizado</strong>As alterações que você fizer aqui aparecem para ele em poucos segundos.</p></div>
          <div><span><ShieldCheck size={17} /></span><p><strong>Firewall do Windows</strong>Na primeira vez, o Windows pode perguntar se o app pode acessar a rede. Marque <b>Redes privadas</b> e clique em <b>Permitir acesso</b>. Se a rede da escola estiver como pública, os colegas não conseguirão abrir.</p></div>
          <Badge tone="neutral">Endereços de fora da rede local são recusados.</Badge>
        </div>
      )}
    </Modal>
  )
}
