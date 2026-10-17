import { syntaxTree } from '@codemirror/language'
import { Range } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { toggleTaskAt } from './lists'

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked
  }
  toDOM(view: EditorView) {
    const box = document.createElement('span')
    box.className = `cm-task-box${this.checked ? ' checked' : ''}`
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    const toggle = (e: Event) => {
      e.preventDefault()
      toggleTaskAt(view, view.posAtDOM(box))
    }
    // touchend (iOS) toggles without focusing the editor or opening the keyboard;
    // preventing it also suppresses the synthetic click.
    box.addEventListener('touchend', toggle)
    box.addEventListener('click', toggle)
    box.addEventListener('mousedown', (e) => e.preventDefault())
    return box
  }
  ignoreEvent() {
    return true
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const dot = document.createElement('span')
    dot.className = 'cm-bullet'
    dot.textContent = '•'
    return dot
  }
}

const hidden = Decoration.replace({})
const faint = Decoration.mark({ class: 'cm-md-mark' })
const bullet = Decoration.replace({ widget: new BulletWidget() })
const mark = (cls: string) => Decoration.mark({ class: cls })
const line = (cls: string) => Decoration.line({ class: cls })

const INLINE: Record<string, { cls: string; marks: string[] }> = {
  StrongEmphasis: { cls: 'cm-strong', marks: ['EmphasisMark'] },
  Emphasis: { cls: 'cm-em', marks: ['EmphasisMark'] },
  Strikethrough: { cls: 'cm-strike', marks: ['StrikethroughMark'] },
  InlineCode: { cls: 'cm-inline-code', marks: ['CodeMark'] },
}

function children(node: SyntaxNode, name?: string) {
  const out: SyntaxNode[] = []
  for (let c = node.firstChild; c; c = c.nextSibling) if (!name || c.name === name) out.push(c)
  return out
}

function build(view: EditorView): DecorationSet {
  const { state } = view
  const doc = state.doc
  const decos: Range<Decoration>[] = []
  const ranges = state.selection.ranges
  // Selection touches [from, to] (edges included)
  const touches = (from: number, to: number) => ranges.some((r) => r.from <= to && r.to >= from)
  const lineTouched = (pos: number) => {
    const l = doc.lineAt(pos)
    return touches(l.from, l.to)
  }
  // Hide markup plus the space that follows it
  const hideWithSpace = (from: number, to: number) => {
    const end = doc.sliceString(to, to + 1) === ' ' ? to + 1 : to
    decos.push(hidden.range(from, end))
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (ref) => {
        const node = ref.node
        const name = node.name

        const heading = /^ATXHeading(\d)$/.exec(name)
        if (heading) {
          decos.push(line(`cm-h cm-h${heading[1]}`).range(doc.lineAt(node.from).from))
          const active = lineTouched(node.from)
          for (const m of children(node, 'HeaderMark')) {
            if (active) decos.push(faint.range(m.from, m.to))
            else hideWithSpace(m.from, m.to)
          }
          return
        }

        if (INLINE[name]) {
          const { cls, marks } = INLINE[name]
          decos.push(mark(cls).range(node.from, node.to))
          const active = touches(node.from, node.to)
          for (const m of children(node).filter((c) => marks.includes(c.name))) {
            decos.push((active ? faint : hidden).range(m.from, m.to))
          }
          return
        }

        switch (name) {
          case 'Link': {
            const linkMarks = children(node, 'LinkMark')
            if (linkMarks.length < 2) return
            const textFrom = linkMarks[0].to
            const textTo = linkMarks[1].from
            decos.push(mark('cm-link').range(textFrom, textTo))
            if (touches(node.from, node.to)) {
              decos.push(faint.range(node.from, textFrom), faint.range(textTo, node.to))
            } else {
              decos.push(hidden.range(node.from, textFrom), hidden.range(textTo, node.to))
            }
            return false
          }
          case 'URL':
          case 'Autolink':
            decos.push(mark('cm-link').range(node.from, node.to))
            return false
          case 'Blockquote': {
            for (let pos = node.from; pos <= node.to; ) {
              const l = doc.lineAt(pos)
              decos.push(line('cm-quote').range(l.from))
              pos = l.to + 1
            }
            return
          }
          case 'QuoteMark':
            if (lineTouched(node.from)) decos.push(faint.range(node.from, node.to))
            else hideWithSpace(node.from, node.to)
            return
          case 'FencedCode': {
            const first = doc.lineAt(node.from).number
            const last = doc.lineAt(node.to).number
            for (let i = first; i <= last; i++) {
              const cls = `cm-codeblock${i === first ? ' cm-codeblock-first' : ''}${i === last ? ' cm-codeblock-last' : ''}`
              decos.push(line(cls).range(doc.line(i).from))
            }
            for (const c of children(node)) {
              if (c.name === 'CodeMark' || c.name === 'CodeInfo') decos.push(faint.range(c.from, c.to))
            }
            return false
          }
          case 'HorizontalRule':
            if (!lineTouched(node.from)) {
              decos.push(line('cm-hr').range(doc.lineAt(node.from).from), hidden.range(node.from, node.to))
            }
            return false
          case 'ListMark': {
            const isTask = node.nextSibling?.name === 'Task'
            const active = lineTouched(node.from)
            const text = doc.sliceString(node.from, node.to)
            if (isTask) {
              if (active) decos.push(faint.range(node.from, node.to))
              else hideWithSpace(node.from, node.to)
            } else if (!active && /^[-*+]$/.test(text)) {
              decos.push(bullet.range(node.from, node.to))
            } else {
              decos.push(mark('cm-list-mark').range(node.from, node.to))
            }
            return
          }
          case 'TaskMarker': {
            const checked = /\[[xX]\]/.test(doc.sliceString(node.from, node.to))
            // Show the raw "[ ]" only while the selection is inside it
            const inside = ranges.some((r) => r.from < node.to && r.to > node.from)
            if (!inside) decos.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to))
            if (checked) {
              const end = doc.lineAt(node.from).to
              if (end > node.to) decos.push(mark('cm-task-done').range(node.to, end))
            }
            return
          }
        }
      },
    })
  }
  return Decoration.set(decos, true)
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = build(view)
    }
    update(u: ViewUpdate) {
      // While an IME composition is in progress, only map existing decorations so
      // the DOM around the composed text isn't rebuilt (avoids breaking iOS input).
      if (u.view.composing) {
        this.decorations = this.decorations.map(u.changes)
        return
      }
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        syntaxTree(u.startState) !== syntaxTree(u.state)
      ) {
        this.decorations = build(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

