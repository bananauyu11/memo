import { ReactNode, useEffect, useRef, useState } from 'react'

export interface SheetAction {
  label: string
  destructive?: boolean
  onSelect: () => void
}

export function ActionSheet({ title, actions, onClose }: { title?: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-group">
          {title && <div className="sheet-title">{title}</div>}
          {actions.map((a) => (
            <button
              key={a.label}
              className={`sheet-btn${a.destructive ? ' destructive' : ''}`}
              onClick={() => {
                onClose()
                a.onSelect()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="sheet-group">
          <button className="sheet-btn cancel" onClick={onClose}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}

export function PromptDialog({
  title,
  initial = '',
  placeholder,
  onSubmit,
  onClose,
}: {
  title: string
  initial?: string
  placeholder?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const submit = () => {
    if (!value.trim()) return
    onSubmit(value.trim())
    onClose()
  }
  return (
    <div className="backdrop center" onClick={onClose}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="dialog-title">{title}</div>
        <input ref={input} value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="primary" disabled={!value.trim()}>
            OK
          </button>
        </div>
      </form>
    </div>
  )
}

export function Header({ left, title, right }: { left?: ReactNode; title?: ReactNode; right?: ReactNode }) {
  return (
    <header className="header">
      <div className="header-side">{left}</div>
      <div className="header-title">{title}</div>
      <div className="header-side right">{right}</div>
    </header>
  )
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <circle cx="5" cy="12" r="2.2" />
      <circle cx="12" cy="12" r="2.2" />
      <circle cx="19" cy="12" r="2.2" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 12 20" width="12" height="20">
      <path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FolderIcon() {
  return (
    <svg className="folder-icon" viewBox="0 0 24 20" width="24" height="20">
      <path d="M2 4a2 2 0 0 1 2-2h5l2 2.5h9a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="currentColor" />
    </svg>
  )
}
