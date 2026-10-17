import { syntaxTree } from '@codemirror/language'
import { isolateHistory } from '@codemirror/commands'
import { Annotation, ChangeSpec, EditorState, Line, Text, Transaction, TransactionSpec } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export const INDENT = '    '

/** Marks a transaction whose list numbers should be left alone. */
export const skipRenumber = Annotation.define<boolean>()

/** Annotations for an edit that should be its own undo step. */
export const ownStep = (extra: Annotation<unknown>[] = []) => [isolateHistory.of('full'), ...extra]

export interface ListItem {
  indent: string
  kind: 'bullet' | 'ordered' | 'task'
  bullet?: string
  num?: number
  delim?: string
  gap: string
  checked: boolean
  /** Offset in the line where the item's text starts */
  prefixEnd: number
}

const ITEM_RE = /^([ \t]*)(?:([-*+])|(\d{1,9})([.)]))([ \t]+)(?:\[([ xX])\](?:[ \t]+|$))?/
const QUOTE_RE = /^[ \t]*>[ \t]?/
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/

export function parseItem(text: string): ListItem | null {
  const m = ITEM_RE.exec(text)
  if (!m) return null
  const [whole, indent, bullet, num, delim, gap, check] = m
  return {
    indent,
    kind: check !== undefined ? 'task' : bullet ? 'bullet' : 'ordered',
    bullet,
    num: num ? Number(num) : undefined,
    delim,
    gap,
    checked: check !== undefined && check !== ' ',
    prefixEnd: whole.length,
  }
}

export function quotePrefix(text: string) {
  return QUOTE_RE.exec(text)?.[0] ?? null
}

const indentWidth = (s: string) => s.replace(/\t/g, INDENT).length

function inCodeBlock(state: EditorState, pos: number) {
  for (let n: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === 'FencedCode' || n.name === 'CodeBlock') return true
  }
  return false
}

/** True when the fence on `line` opens a code block that nothing closes yet. */
function opensUnclosedFence(doc: Text, line: Line) {
  const closes = (open: string, fence: string) => fence[0] === open[0] && fence.length >= open.length
  let open: string | null = null
  for (let i = 1; i <= doc.lines; i++) {
    const m = FENCE_RE.exec(doc.line(i).text)
    if (!m) continue
    if (open === null) {
      if (i === line.number) {
        for (let j = i + 1; j <= doc.lines; j++) {
          const c = FENCE_RE.exec(doc.line(j).text)
          if (c && closes(m[1], c[1])) return false
        }
        return true
      }
      open = m[1]
    } else if (closes(open, m[1])) {
      if (i === line.number) return false
      open = null
    } else if (i === line.number) {
      return false
    }
  }
  return false
}

/** Indentation of the closest list item above `line` that is less indented, or null. */
function parentIndent(doc: Text, line: Line, width: number) {
  for (let i = line.number - 1; i >= 1; i--) {
    const text = doc.line(i).text
    if (!text.trim()) return null
    const item = parseItem(text)
    if (item && indentWidth(item.indent) < width) return item.indent
  }
  return null
}

function dispatchAll(view: EditorView, specs: TransactionSpec[]) {
  for (const spec of specs) view.dispatch(spec)
}

/**
 * Enter: continue lists, quotes and indentation; end or outdent empty items;
 * close a just-opened code fence. The newline and the auto-inserted markup are
 * separate history steps, so one undo removes only the markup.
 */
export function enter(view: EditorView): boolean {
  const { state } = view
  if (state.selection.ranges.length > 1) return false
  const range = state.selection.main
  const line = state.doc.lineAt(range.from)
  if (range.to > line.to) return false
  const col = range.from - line.from
  const newline = (insert = '\n', extra: Annotation<unknown>[] = []): TransactionSpec => ({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length },
    userEvent: 'input',
    annotations: ownStep(extra),
    scrollIntoView: true,
  })
  const addAfterNewline = (text: string): TransactionSpec => ({
    changes: { from: range.from + 1, insert: text },
    selection: { anchor: range.from + 1 + text.length },
    userEvent: 'input.complete',
    annotations: ownStep(),
    scrollIntoView: true,
  })

  const fence = FENCE_RE.exec(line.text)
  if (fence && range.empty && range.from === line.to && opensUnclosedFence(state.doc, line)) {
    const indent = /^[ \t]*/.exec(line.text)![0]
    view.dispatch(newline())
    view.dispatch({
      changes: { from: range.from + 1, insert: `${indent}\n${indent}${fence[1]}` },
      selection: { anchor: range.from + 1 + indent.length },
      userEvent: 'input.complete',
      annotations: ownStep(),
    })
    return true
  }

  const leading = /^[ \t]*/.exec(line.text)![0]
  if (inCodeBlock(state, range.from)) {
    dispatchAll(view, col > leading.length && leading ? [newline(), addAfterNewline(leading)] : [newline()])
    return true
  }

  const item = parseItem(line.text)
  const quote = item ? null : quotePrefix(line.text)
  const prefixEnd = item ? item.prefixEnd : quote ? quote.length : 0

  if ((item || quote) && col >= prefixEnd) {
    const rest = line.text.slice(prefixEnd)
    if (!rest.trim() && range.to === line.to) {
      // Empty item: outdent one level, or drop the markup at the top level
      const width = indentWidth(item?.indent ?? '')
      const parent = item && width > 0 ? parentIndent(state.doc, line, width) : null
      const spec: TransactionSpec =
        item && width > 0
          ? {
              changes: { from: line.from, to: line.from + item.indent.length, insert: parent ?? '' },
              selection: { anchor: line.to - item.indent.length + (parent ?? '').length },
            }
          : { changes: { from: line.from, to: line.to }, selection: { anchor: line.from } }
      view.dispatch({ ...spec, userEvent: 'delete.dedent', annotations: ownStep(), scrollIntoView: true })
      return true
    }
    let markup = quote ?? ''
    if (item) {
      const marker = item.kind === 'ordered' ? `${item.num! + 1}${item.delim}` : item.bullet
      markup = `${item.indent}${marker}${item.gap}${item.kind === 'task' ? '[ ] ' : ''}`
    }
    dispatchAll(view, [newline('\n', [skipRenumber.of(true)]), addAfterNewline(markup)])
    return true
  }

  dispatchAll(view, col > leading.length && leading ? [newline(), addAfterNewline(leading)] : [newline()])
  return true
}

/** Backspace right after list/quote markup removes just the markup (keeping indentation). */
export function backspace(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  if (state.selection.ranges.length > 1 || !range.empty) return false
  const line = state.doc.lineAt(range.from)
  const item = parseItem(line.text)
  const quote = item ? null : quotePrefix(line.text)
  if (!item && !quote) return false
  const from = line.from + (item ? item.indent.length : 0)
  const to = line.from + (item ? item.prefixEnd : quote!.length)
  if (range.from !== to) return false
  view.dispatch({ changes: { from, to }, userEvent: 'delete.markup', annotations: ownStep(), scrollIntoView: true })
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
  return lines
}

export function indentLines(dir: 1 | -1) {
  return (view: EditorView): boolean => {
    const lines = selectedLines(view.state)
    const skipBlank = lines.length > 1
    const changes = lines.flatMap((l): ChangeSpec[] => {
      if (skipBlank && !l.text.trim()) return []
      if (dir > 0) return [{ from: l.from, insert: INDENT }]
      const m = /^( {1,4}|\t)/.exec(l.text)
      return m ? [{ from: l.from, to: l.from + m[0].length }] : []
    })
    if (changes.length) {
      view.dispatch({
        changes,
        userEvent: dir > 0 ? 'input.indent' : 'delete.dedent',
        annotations: ownStep(),
        scrollIntoView: true,
      })
    }
    return true
  }
}

/** Flip the task checkbox whose "[" is at `pos`. */
export function toggleTaskAt(view: EditorView, pos: number) {
  const ch = view.state.doc.sliceString(pos + 1, pos + 2)
  view.dispatch({
    changes: { from: pos + 1, to: pos + 2, insert: ch === ' ' ? 'x' : ' ' },
    userEvent: 'input.toggle',
    annotations: ownStep(),
  })
}

/** Ctrl/Cmd+Enter: flip the checkboxes on the selected lines. */
export function toggleTasks(view: EditorView): boolean {
  const changes = selectedLines(view.state).flatMap((l) => {
    const item = parseItem(l.text)
    if (item?.kind !== 'task') return []
    const pos = l.from + l.text.lastIndexOf('[', item.prefixEnd) + 1
    return [{ from: pos, to: pos + 1, insert: item.checked ? ' ' : 'x' }]
  })
  if (changes.length) view.dispatch({ changes, userEvent: 'input.toggle', annotations: ownStep() })
  return true
}

const isListLine = (text: string) => parseItem(text) !== null || /^[ \t]+\S/.test(text)

/** Number changes that make every ordered list touching lines [first, last] count up from its first item. */
function renumberChanges(doc: Text, lineNumbers: number[]) {
  const changes: { from: number; to: number; insert: string }[] = []
  const seen = new Set<number>()
  for (const n of lineNumbers) {
    if (n < 1 || n > doc.lines || !isListLine(doc.line(n).text)) continue
    let start = n
    while (start > 1 && isListLine(doc.line(start - 1).text)) start--
    if (seen.has(start)) continue
    seen.add(start)
    const stack: { width: number; ordered: boolean; delim?: string; next: number }[] = []
    for (let i = start; i <= doc.lines; i++) {
      const line = doc.line(i)
      if (!isListLine(line.text)) break
      const item = parseItem(line.text)
      const width = indentWidth(/^[ \t]*/.exec(line.text)![0])
      while (stack.length && stack[stack.length - 1].width > width) stack.pop()
      if (!item) continue
      const top = stack[stack.length - 1]
      const ordered = item.kind === 'ordered'
      if (top && top.width === width) {
        if (ordered && top.ordered && top.delim === item.delim) {
          if (item.num !== top.next) {
            const from = line.from + item.indent.length
            changes.push({ from, to: from + String(item.num).length, insert: String(top.next) })
          }
          top.next++
        } else {
          stack[stack.length - 1] = { width, ordered, delim: item.delim, next: (item.num ?? 0) + 1 }
        }
      } else {
        stack.push({ width, ordered, delim: item.delim, next: (item.num ?? 0) + 1 })
      }
    }
  }
  return changes
}

/**
 * Keeps ordered lists numbered after user edits, folded into the same
 * transaction so undo restores the old numbers too. Skips IME composition,
 * undo/redo and programmatic updates.
 */
export const renumberLists = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.annotation(skipRenumber)) return tr
  if (!tr.annotation(Transaction.userEvent) || tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr
  if (tr.isUserEvent('input.type.compose')) return tr
  const doc = tr.newDoc
  const lines: number[] = []
  tr.changes.iterChangedRanges((_fa, _ta, fromB, toB) => {
    const a = doc.lineAt(fromB).number
    const b = doc.lineAt(toB).number
    lines.push(a - 1, a, b, b + 1)
  })
  const changes = renumberChanges(doc, lines)
  return changes.length ? [tr, { changes, sequential: true }] : tr
})
