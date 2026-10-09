import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export function MultiFilter({ label, options, selected, onChange, allLabel }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({})
  const trigger = useRef(null)
  const menu = useRef(null)
  const id = useId()
  const allSelected = options.length > 0 && options.every((option) => selected.includes(option.value))
  const summary = allSelected ? allLabel : selected.length === 1 ? options.find((option) => option.value === selected[0])?.label : `${selected.length} selecionados`

  useEffect(() => {
    if (!open) return
    function placeMenu() {
      const rect = trigger.current.getBoundingClientRect()
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24)
      const below = window.innerHeight - rect.bottom - 18
      const above = rect.top - 18
      const showAbove = below < 180 && above > below
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        top: showAbove ? undefined : rect.bottom + 6,
        bottom: showAbove ? window.innerHeight - rect.top + 6 : undefined,
        maxHeight: Math.max(80, Math.min(320, showAbove ? above : below)),
      })
    }
    function outside(event) {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false)
    }
    function escape(event) {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    function focusOutside(event) {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false)
    }
    placeMenu()
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    document.addEventListener('focusin', focusOutside)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    menu.current?.querySelector('button')?.focus()
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('focusin', focusOutside)
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open])

  function toggle(value) {
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
    if (next.length) onChange(next)
  }

  return <div className="results-multi-field">
    <span id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="results-multi-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} disabled={!options.length} onClick={() => setOpen(!open)}>
      <span id={`${id}-value`} title={summary}>{summary || 'Sem opções'}</span><ChevronDown size={15} />
    </button>
    {open && createPortal(<div ref={menu} id={`${id}-menu`} role="group" aria-labelledby={`${id}-label`} className="results-multi-menu" style={position}>
      <button type="button" className={allSelected ? 'active' : ''} onClick={() => onChange(options.map((option) => option.value))}>{allLabel}</button>
      {options.map((option) => <label key={option.value}>
        <input type="checkbox" checked={selected.includes(option.value)} disabled={selected.length === 1 && selected.includes(option.value)} onChange={() => toggle(option.value)} />
        <span>{option.label}</span>
      </label>)}
      <small>Selecione uma ou mais opções.</small>
    </div>, document.body)}
  </div>
}
