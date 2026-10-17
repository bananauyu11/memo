import { syntaxTree } from '@codemirror/language'
import { ChangeSpec, EditorSelection, EditorState, Line, SelectionRange } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { ownStep, parseItem, quotePrefix } from './lists'

export type Format =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'link'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'ordered'
  | 'task'
  | 'quote'

type InlineFormat = 'bold' | 'italic' | 'strike' | 'code'

const INLINE: Record<InlineFormat, { node: string; mark: string }> = {
  bold: { node: 'StrongEmphasis', mark: '**' },
  italic: { node: 'Emphasis', mark: '*' },
  strike: { node: 'Strikethrough', mark: '~~' },
  code: { node: 'InlineCode', mark: '`' },
}

const URL_RE = /^https?:\/\/\S+$/

/** Innermost node called `name` that contains [from, to]. */
function enclosing(state: EditorState, from: number, to: number, name: string): SyntaxNode | null {
  for (const side of [1, -1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(from, side); n; n = n.parent) {
      if (n.name === name && n.from <= from && n.to >= to) return n
    }
  }
  return null
}

function dispatchFormat(view: EditorView, spec: ReturnType<EditorState['changeByRange']>) {
  view.dispatch(
    view.state.update(spec, { userEvent: 'input.format', annotations: ownStep(), scrollIntoView: true }),
  )
}

/** Wrap the selection in inline markup, or remove it when already applied. */
export function toggleInline(format: InlineFormat) {
  const { node: nodeName, mark } = INLINE[format]
  return (view: EditorView): boolean => {
    const { state } = view
    dispatchFormat(
      view,
      state.changeByRange((range) => {
        const node = enclosing(state, range.from, range.to, nodeName)
        if (node && node.firstChild && node.lastChild && node.firstChild !== node.lastChild) {
          const open = node.firstChild
          const close = node.lastChild
          const changes = state.changes([
            { from: open.from, to: open.to },
            { from: close.from, to: close.to },
          ])
          return { changes, range: range.map(changes) }
        }
        const len = mark.length
        if (range.empty) {
          // A just-inserted empty pair like "**|**" is removed again
          if (
            state.sliceDoc(range.from - len, range.from) === mark &&
            state.sliceDoc(range.from, range.from + len) === mark
          ) {
            return {
              changes: { from: range.from - len, to: range.from + len },
              range: EditorSelection.cursor(range.from - len),
            }
          }
          return { changes: { from: range.from, insert: mark + mark }, range: EditorSelection.cursor(range.from + len) }
        }
        if (format === 'code' && state.doc.lineAt(range.from).number !== state.doc.lineAt(range.to).number) {
          return wrapFence(state, range)
        }
        return {
          changes: [
            { from: range.from, insert: mark },
            { from: range.to, insert: mark },
          ],
          range: EditorSelection.range(range.from + len, range.to + len),
        }
      }),
    )
    return true
  }
}

function wrapFence(state: EditorState, range: SelectionRange) {
  const first = state.doc.lineAt(range.from)
  const last = state.doc.lineAt(range.to)
  return {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' },
    ],
    range: EditorSelection.range(first.from + 4, last.to + 4),
  }
}

export function toggleLink(view: EditorView): boolean {
  const { state } = view
  dispatchFormat(
    view,
    state.changeByRange((range) => {
      const link = enclosing(state, range.from, range.to, 'Link')
      const marks: SyntaxNode[] = []
      for (let c = link?.firstChild; c; c = c.nextSibling) if (c.name === 'LinkMark') marks.push(c)
      if (link && marks.length >= 2) {
        // Unwrap to the link text
        const text = state.sliceDoc(marks[0].to, marks[1].from)
        const changes = state.changes({ from: link.from, to: link.to, insert: text })
        return { changes, range: EditorSelection.range(link.from, link.from + text.length) }
      }
      const sel = state.sliceDoc(range.from, range.to)
      if (URL_RE.test(sel)) {
        return { changes: { from: range.from, to: range.to, insert: `[](${sel})` }, range: EditorSelection.cursor(range.from + 1) }
      }
      const insert = `[${sel}]()`
      // Cursor inside "[]" when nothing is selected, otherwise inside "()"
      const cursor = range.empty ? range.from + 1 : range.from + insert.length - 1
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(cursor) }
    }),
  )
  return true
}

function selectedLines(state: EditorState) {
  const lines: Line[] = []
  for (const r of state.selection.ranges) {
    const last = state.doc.lineAt(r.to).number
    for (let i = state.doc.lineAt(r.from).number; i <= last; i++) {
      if (!lines.some((l) => l.number === i)) lines.push(state.doc.line(i))
    }
  }
  // When several lines are selected, leave blank ones alone
  return lines.length > 1 ? lines.filter((l) => l.text.trim()) : lines
}

function dispatchLines(view: EditorView, changes: ChangeSpec[]) {
  if (!changes.length) return
  view.dispatch({ changes, userEvent: 'input.format', annotations: ownStep(), scrollIntoView: true })
}

const HEADING_RE = /^(#{1,6})[ \t]+/

/** Cycle the heading level: none → H1 → H2 → H3 → none. */
export function cycleHeading(view: EditorView): boolean {
  dispatchLines(
    view,
    selectedLines(view.state).map((l) => {
      const m = HEADING_RE.exec(l.text)
      const level = m ? m[1].length : 0
      const next = level >= 3 ? '' : '#'.repeat(level + 1) + ' '
      return { from: l.from, to: l.from + (m ? m[0].length : 0), insert: next }
    }),
  )
  return true
}

/** Add, remove or switch list markup on the selected lines. */
export function toggleList(kind: 'bullet' | 'ordered' | 'task') {
  return (view: EditorView): boolean => {
    const lines = selectedLines(view.state)
    const all = lines.every((l) => parseItem(l.text)?.kind === kind)
    dispatchLines(
      view,
      lines.map((l, i) => {
        const item = parseItem(l.text)
        const indent = item ? item.indent : /^[ \t]*/.exec(l.text)![0]
        const end = item ? item.prefixEnd : indent.length
        const insert = all ? '' : kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${i + 1}. `
        return { from: l.from + indent.length, to: l.from + end, insert }
      }),
    )
    return true
  }
}

export function toggleQuote(view: EditorView): boolean {
  const lines = selectedLines(view.state)
  const all = lines.every((l) => quotePrefix(l.text) !== null)
  dispatchLines(
    view,
    lines.flatMap((l): ChangeSpec[] => {
      const q = quotePrefix(l.text)
      if (all) return [{ from: l.from + q!.indexOf('>'), to: l.from + q!.length }]
      return q ? [] : [{ from: l.from, insert: '> ' }]
    }),
  )
  return true
}

/** Formats in effect at the main cursor, for toolbar highlighting. */
export function activeFormats(state: EditorState): Set<Format> {
  const active = new Set<Format>()
  const { head } = state.selection.main
  const names: Record<string, Format> = {
    StrongEmphasis: 'bold',
    Emphasis: 'italic',
    Strikethrough: 'strike',
    InlineCode: 'code',
    FencedCode: 'code',
    Link: 'link',
    Blockquote: 'quote',
  }
  for (const side of [1, -1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(head, side); n; n = n.parent) {
      const f = names[n.name]
      if (!f) continue
      // Inline formats only count when the cursor is strictly inside them
      if (f === 'quote' || n.name === 'FencedCode' || (n.from < head && n.to > head)) active.add(f)
    }
  }
  const text = state.doc.lineAt(head).text
  const level = HEADING_RE.exec(text)?.[1].length
  if (level && level <= 3) active.add(`h${level}` as Format)
  const item = parseItem(text)
  if (item) active.add(item.kind)
  return active
}

/** Turn a pasted URL over selected text into a markdown link. */
export const pasteLink = EditorView.domEventHandlers({
  paste(event, view) {
    const url = event.clipboardData?.getData('text/plain').trim()
    const range = view.state.selection.main
    if (!url || !URL_RE.test(url) || range.empty || view.state.selection.ranges.length > 1) return false
    const text = view.state.sliceDoc(range.from, range.to)
    if (text.includes('\n')) return false
    event.preventDefault()
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: `[${text}](${url})` },
      selection: { anchor: range.from + text.length + url.length + 4 },
      userEvent: 'input.paste',
      annotations: ownStep(),
      scrollIntoView: true,
    })
    return true
  },
})

/**
 * "**" auto-close: typing the second "*" inserts the closing "**". Typing "*"
 * right before an existing "*" (after non-space text) steps over it instead.
 */
export const autoCloseBold = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '*' || view.composing || from !== to || view.state.selection.ranges.length > 1) return false
  const { state } = view
  const before = state.sliceDoc(from - 2, from)
  const after = state.sliceDoc(from, from + 1)
  if (after === '*' && before.length > 0 && !/\s$/.test(before)) {
    view.dispatch({ selection: { anchor: from + 1 }, userEvent: 'select' })
    return true
  }
  if (before.endsWith('*') && !before.endsWith('**') && after !== '*') {
    // The typed "*" and the auto-inserted "**" are separate undo steps
    view.dispatch({ changes: { from, insert: '*' }, selection: { anchor: from + 1 }, userEvent: 'input.type' })
    view.dispatch({
      changes: { from: from + 1, insert: '**' },
      selection: { anchor: from + 1 },
      userEvent: 'input.complete',
      annotations: ownStep(),
    })
    return true
  }
  return false
})
