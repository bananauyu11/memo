import { ReactNode, useEffect, useRef, useState } from 'react'
import { COLORS, Color } from './store'

export interface Item {
  id: string
  title: string
  color: Color
  icon?: ReactNode
  detail?: string
}

interface Props {
  items: Item[]
  editing: boolean
  openRow: OpenRow
  setOpenRow: (r: OpenRow) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onColor: (id: string, c: Color) => void
  onReorder: (ids: string[]) => void
}

export type OpenRow = { id: string; side: 'left' | 'right' } | null

interface Drag {
  id: string
  from: number
  y0: number
  dy: number
  h: number
}

const DELETE_W = 88
const PALETTE_W = COLORS.length * 40 + 12
const LONG_PRESS_MS = 450

// While a row is being dragged, stop the page from scrolling under the finger.
// Must be a non-passive listener registered up front for iOS Safari to honor it.
let dragging = false
document.addEventListener(
  'touchmove',
  (e) => {
    if (dragging) e.preventDefault()
  },
  { passive: false },
)

export function SortableList(p: Props) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const rowEls = useRef(new Map<string, HTMLElement>())

  useEffect(() => {
    dragging = drag !== null
  }, [drag])

  const to = drag ? Math.max(0, Math.min(p.items.length - 1, drag.from + Math.round(drag.dy / drag.h))) : -1

  const shiftFor = (i: number) => {
    if (!drag || i === drag.from) return 0
    if (drag.from < to && i > drag.from && i <= to) return -drag.h
    if (to < drag.from && i >= to && i < drag.from) return drag.h
    return 0
  }

  return (
    <div className="group">
      {p.items.map((item, i) => (
        <Row
          key={item.id}
          item={item}
          editing={p.editing}
          side={p.openRow?.id === item.id ? p.openRow.side : null}
          setSide={(side) => p.setOpenRow(side ? { id: item.id, side } : null)}
          onOpen={() => p.onOpen(item.id)}
          onDelete={() => p.onDelete(item.id)}
          onColor={(c) => p.onColor(item.id, c)}
          elRef={(el) => (el ? rowEls.current.set(item.id, el) : rowEls.current.delete(item.id))}
          isDragging={drag?.id === item.id}
          translateY={drag?.id === item.id ? drag.dy : shiftFor(i)}
          animateY={drag !== null && drag.id !== item.id}
          onDragStart={(y) => {
            const h = rowEls.current.get(item.id)?.offsetHeight ?? 56
            dragging = true
            p.setOpenRow(null)
            setDrag({ id: item.id, from: i, y0: y, dy: 0, h })
          }}
          onDragMove={(y) => setDrag((d) => d && { ...d, dy: y - d.y0 })}
          onDragEnd={() => {
            dragging = false
            if (drag && to !== drag.from) {
              const ids = p.items.map((it) => it.id)
              const [moved] = ids.splice(drag.from, 1)
              ids.splice(to, 0, moved)
              p.onReorder(ids)
            }
            setDrag(null)
          }}
        />
      ))}
    </div>
  )
}

interface RowProps {
  item: Item
  editing: boolean
  side: 'left' | 'right' | null
  setSide: (s: 'left' | 'right' | null) => void
  onOpen: () => void
  onDelete: () => void
  onColor: (c: Color) => void
  elRef: (el: HTMLElement | null) => void
  isDragging: boolean
  translateY: number
  animateY: boolean
  onDragStart: (y: number) => void
  onDragMove: (y: number) => void
  onDragEnd: () => void
}

function Row(p: RowProps) {
  const [swipeX, setSwipeX] = useState<number | null>(null)
  const front = useRef<HTMLDivElement>(null)
  const g = useRef({ mode: 'idle' as 'idle' | 'pending' | 'swipe' | 'drag', x0: 0, y0: 0, base: 0, x: 0, timer: 0 })
  const restX = p.side === 'left' ? -DELETE_W : p.side === 'right' ? PALETTE_W : 0
  const x = swipeX ?? restX

  const capture = (pointerId: number) => {
    try {
      front.current?.setPointerCapture(pointerId)
    } catch {
      // pointer already released
    }
  }

  const startDrag = (pointerId: number, y: number) => {
    g.current.mode = 'drag'
    capture(pointerId)
    navigator.vibrate?.(10)
    p.onDragStart(y)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const s = g.current
    Object.assign(s, { mode: 'pending', x0: e.clientX, y0: e.clientY, base: restX, x: restX })
    clearTimeout(s.timer)
    const { pointerId, clientY } = e
    s.timer = window.setTimeout(() => {
      if (s.mode === 'pending') startDrag(pointerId, clientY)
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    if (s.mode === 'drag') return p.onDragMove(e.clientY)
    if (s.mode === 'pending') {
      if (!p.editing && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        clearTimeout(s.timer)
        s.mode = 'swipe'
        capture(e.pointerId)
      } else if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        clearTimeout(s.timer)
        s.mode = 'idle'
      }
    }
    if (s.mode === 'swipe') {
      let nx = s.base + dx
      // Rubber-band past the palette width
      if (nx > PALETTE_W) nx = PALETTE_W + (nx - PALETTE_W) / 4
      s.x = nx
      setSwipeX(nx)
    }
  }

  const onPointerUp = () => {
    const s = g.current
    clearTimeout(s.timer)
    if (s.mode === 'drag') {
      p.onDragEnd()
    } else if (s.mode === 'swipe') {
      const width = (front.current?.offsetWidth ?? 360) * 0.6
      if (s.x < -width) p.onDelete()
      else if (s.x < -DELETE_W / 2) p.setSide('left')
      else if (s.x > 60) p.setSide('right')
      else p.setSide(null)
      setSwipeX(null)
    } else if (s.mode === 'pending') {
      if (p.side) p.setSide(null)
      else if (!p.editing) p.onOpen()
    }
    s.mode = 'idle'
  }

  const onPointerCancel = () => {
    const s = g.current
    clearTimeout(s.timer)
    if (s.mode === 'drag') p.onDragEnd()
    s.mode = 'idle'
    setSwipeX(null)
  }

  return (
    <div
      ref={p.elRef}
      className={`row-wrap${p.isDragging ? ' dragging' : ''}`}
      style={{
        transform: p.translateY ? `translateY(${p.translateY}px)` : undefined,
        transition: p.animateY ? 'transform 0.2s ease' : undefined,
      }}
    >
      {x > 0 && (
        <div className="row-behind left">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`swatch c-${c}${p.item.color === c ? ' selected' : ''}`}
              aria-label={c}
              onClick={() => {
                p.onColor(c)
                p.setSide(null)
              }}
            />
          ))}
        </div>
      )}
      {x < 0 && (
        <div className="row-behind right">
          <button className="delete-btn" style={{ width: Math.max(DELETE_W, -x) }} onClick={p.onDelete}>
            削除
          </button>
        </div>
      )}
      <div
        ref={front}
        className={`row c-${p.item.color}`}
        style={{
          transform: x ? `translateX(${x}px)` : undefined,
          transition: swipeX === null ? 'transform 0.25s ease' : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {p.editing && (
          <button className="minus-btn" aria-label="削除" onClick={p.onDelete}>
            <span />
          </button>
        )}
        {p.item.icon}
        <span className="row-title">{p.item.title}</span>
        {p.item.detail && <span className="row-detail">{p.item.detail}</span>}
        {p.editing ? (
          <span
            className="handle"
            onPointerDown={(e) => {
              e.stopPropagation()
              g.current.y0 = e.clientY
              startDrag(e.pointerId, e.clientY)
            }}
          >
            <svg viewBox="0 0 20 14" width="20" height="14">
              <path d="M1 1h18M1 7h18M1 13h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        ) : (
          <svg className="chevron" viewBox="0 0 8 14" width="8" height="14">
            <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  )
}
