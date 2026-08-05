import { X, CheckCircle2, AlertTriangle, Info, LoaderCircle } from 'lucide-react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/utils'

export function Button({ children, variant = 'primary', size = 'md', icon: Icon, className, type = 'button', ...props }) {
  return (
    <button type={type} className={cn('button', `button-${variant}`, `button-${size}`, className)} {...props}>
      {Icon && <Icon size={size === 'sm' ? 15 : 17} strokeWidth={2} />}
      {children}
    </button>
  )
}

export function Badge({ children, tone = 'neutral', dot = false }) {
  return <span className={cn('badge', `badge-${tone}`)}>{dot && <i />} {children}</span>
}

export function Modal({ open, onClose, title, subtitle, children, size = 'md', footer }) {
  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={cn('modal', `modal-${size}`)} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && <div className="empty-icon"><Icon size={25} /></div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

const toastIcons = { success: CheckCircle2, warning: AlertTriangle, info: Info, loading: LoaderCircle }

export function Toast({ toast, onClose }) {
  if (!toast) return null
  const Icon = toastIcons[toast.tone || 'success']
  return (
    <div className={cn('toast', `toast-${toast.tone || 'success'}`)}>
      <Icon size={19} className={toast.tone === 'loading' ? 'spin' : ''} />
      <div><strong>{toast.title}</strong>{toast.message && <span>{toast.message}</span>}</div>
      <button onClick={onClose}><X size={15} /></button>
    </div>
  )
}

export function Field({ label, hint, children, required }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function StatCard({ label, value, note, icon: Icon, tone = 'green', trend }) {
  return (
    <article className="stat-card">
      <div className={cn('stat-icon', `tone-${tone}`)}><Icon size={20} /></div>
      <div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{trend && <b>{trend}</b>} {note}</small></div>
    </article>
  )
}
