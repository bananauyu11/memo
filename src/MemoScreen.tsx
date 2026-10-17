import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useMemo, useRef, useState } from 'react'
import { goBack } from './App'
import { actions, Folder, useData } from './store'
import { ActionSheet, BackIcon, Header, MoreIcon, SheetAction } from './ui'

marked.setOptions({ gfm: true, breaks: true })

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
  // marked renders task list checkboxes as disabled; enable them so they can be toggled
  if (node.tagName === 'INPUT' && node.getAttribute('type') === 'checkbox') node.removeAttribute('disabled')
})

const TASK_RE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/gm

function toggleTask(content: string, index: number) {
  let i = 0
  return content.replace(TASK_RE, (match, prefix: string, mark: string) =>
    i++ === index ? `${prefix}[${mark === ' ' ? 'x' : ' '}]` : match,
  )
}

/** Folders as a flat list in tree order, with their depth for indentation. */
function folderTree(folders: Folder[], parentId: string | null = null, depth = 0): { folder: Folder; depth: number }[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .flatMap((f) => [{ folder: f, depth }, ...folderTree(folders, f.id, depth + 1)])
}

const TOOLS: { label: string; title: string; prefix?: string; wrap?: string }[] = [
  { label: 'H', title: '見出し', prefix: '# ' },
  { label: 'B', title: '太字', wrap: '**' },
  { label: 'I', title: '斜体', wrap: '*' },
  { label: '•', title: 'リスト', prefix: '- ' },
  { label: '☑', title: 'チェックリスト', prefix: '- [ ] ' },
  { label: '❝', title: '引用', prefix: '> ' },
  { label: '</>', title: 'コード', wrap: '`' },
]

export default function MemoScreen({ id }: { id: string }) {
  const data = useData()
  const memo = data.memos.find((m) => m.id === id)
  const [editing, setEditing] = useState(() => !memo?.content)
  const [sheet, setSheet] = useState<{ title?: string; actions: SheetAction[] } | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  // Drop memos that were created and left empty. Deferred so StrictMode's
  // remount in development doesn't delete a memo that is still open.
  useEffect(
    () => () => {
      setTimeout(() => {
        if (!location.hash.endsWith(`/m/${id}`)) actions.deleteMemoIfEmpty(id)
      })
    },
    [id],
  )

  useEffect(() => {
    if (editing) textarea.current?.focus()
  }, [editing])

  const html = useMemo(
    () => (memo && !editing ? DOMPurify.sanitize(marked.parse(memo.content) as string) : ''),
    [memo, editing],
  )

  if (!memo) {
    location.replace('#/')
    return null
  }

  const folder = data.folders.find((f) => f.id === memo.folderId)
  const back = () => goBack({ type: 'folder', id: memo.folderId })

  const applyTool = (t: (typeof TOOLS)[number]) => {
    const el = textarea.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    let next: string
    let cursor: [number, number]
    if (t.prefix) {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1
      next = value.slice(0, lineStart) + t.prefix + value.slice(lineStart)
      cursor = [s + t.prefix.length, e + t.prefix.length]
    } else {
      const w = t.wrap!
      next = value.slice(0, s) + w + value.slice(s, e) + w + value.slice(e)
      cursor = [s + w.length, e + w.length]
    }
    actions.updateMemo(id, next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(...cursor)
    })
  }

  const onPreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      const boxes = Array.from(e.currentTarget.querySelectorAll('input[type=checkbox]'))
      actions.updateMemo(id, toggleTask(memo.content, boxes.indexOf(target)))
    }
  }

  const moveSheet = () =>
    setSheet({
      title: '移動先のフォルダ',
      actions: [
        { label: 'リスト（トップ）', onSelect: () => actions.moveMemo(id, null) },
        ...folderTree(data.folders).map(({ folder: f, depth }) => ({
          label: `${'　'.repeat(depth)}${f.name}`,
          onSelect: () => actions.moveMemo(id, f.id),
        })),
      ].filter((_, i) => (i === 0 ? memo.folderId !== null : true)),
    })

  return (
    <div className="screen memo-screen">
      <Header
        left={
          <button className="pill back" onClick={back}>
            <BackIcon />
            <span>{folder?.name ?? 'リスト'}</span>
          </button>
        }
        right={
          <>
            <button className="pill" onClick={() => setEditing(!editing)}>
              {editing ? '完了' : '編集'}
            </button>
            <button
              className="pill icon"
              aria-label="メニュー"
              onClick={() =>
                setSheet({
                  actions: [
                    { label: 'フォルダへ移動', onSelect: moveSheet },
                    {
                      label: 'メモを削除',
                      destructive: true,
                      onSelect: () => {
                        actions.deleteMemo(id)
                        back()
                      },
                    },
                  ],
                })
              }
            >
              <MoreIcon />
            </button>
          </>
        }
      />

      {editing ? (
        <>
          <textarea
            ref={textarea}
            className="editor"
            value={memo.content}
            placeholder="マークダウンで入力…"
            onChange={(e) => actions.updateMemo(id, e.target.value)}
          />
          <div className="toolbar">
            {TOOLS.map((t) => (
              <button
                key={t.title}
                title={t.title}
                aria-label={t.title}
                // Keep focus (and the keyboard) in the textarea
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => applyTool(t)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <article
          className="md"
          onClick={onPreviewClick}
          onDoubleClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: html || '<p class="placeholder">（空のメモ）</p>' }}
        />
      )}

      {sheet && <ActionSheet title={sheet.title} actions={sheet.actions} onClose={() => setSheet(null)} />}
    </div>
  )
}
