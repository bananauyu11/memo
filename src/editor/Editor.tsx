import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { indentUnit } from '@codemirror/language'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { autoCloseBold, pasteLink, toggleInline, toggleLink } from './format'
import { INDENT, backspace, enter, indentLines, renumberLists, toggleTasks } from './lists'
import { livePreview } from './livePreview'

const extensions = [
  history(),
  indentUnit.of(INDENT),
  EditorState.tabSize.of(4),
  markdown({ base: markdownLanguage, addKeymap: false }),
  EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '`'] } }]),
  closeBrackets(),
  autoCloseBold,
  pasteLink,
  renumberLists,
  livePreview,
  EditorView.lineWrapping,
  placeholder('マークダウンで入力…'),
  // Keep the cursor clear of the sticky header and the toolbar
  EditorView.scrollMargins.of(() => ({ top: 80, bottom: 90 })),
  Prec.highest(
    keymap.of([
      { key: 'Enter', run: enter },
      { key: 'Backspace', run: backspace },
      { key: 'Tab', run: indentLines(1) },
      { key: 'Shift-Tab', run: indentLines(-1) },
      { key: 'Mod-b', run: toggleInline('bold') },
      { key: 'Mod-i', run: toggleInline('italic') },
      { key: 'Mod-Shift-x', run: toggleInline('strike') },
      { key: 'Mod-k', run: toggleLink },
      { key: 'Mod-Enter', run: toggleTasks },
    ]),
  ),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
]

export function Editor({
  initial,
  autoFocus,
  onChange,
  onUpdate,
}: {
  initial: string
  autoFocus?: boolean
  onChange: (doc: string) => void
  /** Called with the view whenever the document, selection or focus changes (and with null on unmount). */
  onUpdate: (view: EditorView | null) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onChange, onUpdate })
  callbacks.current = { onChange, onUpdate }

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          extensions,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString())
            if (u.docChanged || u.selectionSet || u.focusChanged) callbacks.current.onUpdate(u.view)
          }),
        ],
      }),
    })
    callbacks.current.onUpdate(view)
    if (autoFocus) view.focus()
    return () => {
      callbacks.current.onUpdate(null)
      view.destroy()
    }
    // The editor owns the document after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={host} className="editor-host" />
}
