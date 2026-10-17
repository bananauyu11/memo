import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { ReactNode, useEffect, useState } from 'react'
import { activeFormats, cycleHeading, Format, toggleInline, toggleLink, toggleList, toggleQuote } from './format'
import { indentLines } from './lists'

/** Distance from the bottom of the layout viewport to the top of the on-screen keyboard. */
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

interface Tool {
  label: ReactNode
  title: string
  run: (view: EditorView) => boolean
  active?: Format | Format[]
  disabled?: (view: EditorView) => boolean
}

const svg = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const TOOLS: Tool[] = [
  { label: 'H', title: '見出し', run: cycleHeading, active: ['h1', 'h2', 'h3'] },
  { label: <b>B</b>, title: '太字', run: toggleInline('bold'), active: 'bold' },
  { label: <i style={{ fontFamily: 'Georgia, serif' }}>I</i>, title: '斜体', run: toggleInline('italic'), active: 'italic' },
  { label: <s>S</s>, title: '取り消し線', run: toggleInline('strike'), active: 'strike' },
  { label: svg('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'), title: 'リスト', run: toggleList('bullet'), active: 'bullet' },
  { label: svg('M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 15.5a1.2 1.2 0 0 1 2.3.5L3.5 19h2.8'), title: '番号リスト', run: toggleList('ordered'), active: 'ordered' },
  { label: svg('M4 5h5v5H4zM5.5 7.5l1 1 1.5-2M13 7.5h7M4 14h5v5H4zM13 16.5h7'), title: 'チェック', run: toggleList('task'), active: 'task' },
  { label: svg('M3 6h18M11 12h10M11 18h10M3 10l4 3-4 3'), title: 'インデント', run: indentLines(1) },
  { label: svg('M3 6h18M11 12h10M11 18h10M7 10l-4 3 4 3'), title: 'インデント解除', run: indentLines(-1) },
  { label: svg('M6 17c-1.5 0-2.5-1-2.5-3 0-3 2-6 5-7M15 17c-1.5 0-2.5-1-2.5-3 0-3 2-6 5-7'), title: '引用', run: toggleQuote, active: 'quote' },
  { label: svg('M8 7l-5 5 5 5M16 7l5 5-5 5'), title: 'コード', run: toggleInline('code'), active: 'code' },
  { label: svg('M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1'), title: 'リンク', run: toggleLink, active: 'link' },
  { label: svg('M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3'), title: '取り消す', run: undo, disabled: (v) => undoDepth(v.state) === 0 },
  { label: svg('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3'), title: 'やり直す', run: redo, disabled: (v) => redoDepth(v.state) === 0 },
]

export function Toolbar({ view }: { view: EditorView | null }) {
  const inset = useKeyboardInset()
  const active = view ? activeFormats(view.state) : new Set<Format>()
  const headingLevel = (['h1', 'h2', 'h3'] as const).find((h) => active.has(h))

  return (
    <div className="toolbar" style={{ transform: inset ? `translateY(${-inset}px)` : undefined }}>
      <div className="toolbar-scroll">
        {TOOLS.map((t) => {
          const on = t.active && [t.active].flat().some((f) => active.has(f))
          return (
            <button
              key={t.title}
              title={t.title}
              aria-label={t.title}
              aria-pressed={t.active ? Boolean(on) : undefined}
              className={on ? 'on' : undefined}
              disabled={!view || t.disabled?.(view)}
              // Keep focus (and the keyboard) in the editor
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => view && t.run(view)}
            >
              {t.title === '見出し' && headingLevel ? headingLevel.toUpperCase() : t.label}
            </button>
          )
        })}
      </div>
      {view?.hasFocus && (
        <button
          className="toolbar-close"
          title="キーボードを閉じる"
          aria-label="キーボードを閉じる"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => view.contentDOM.blur()}
        >
          {svg('M4 6h16v8H4zM7 9h.01M10 9h.01M13 9h.01M16 9h.01M8 12h8M9 18l3 3 3-3')}
        </button>
      )}
    </div>
  )
}
