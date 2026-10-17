import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { EditorView } from '@codemirror/view'
import { useEffect, useMemo, useState } from 'react'
import { goBack } from './App'
import { Editor } from './editor/Editor'
import { Toolbar } from './editor/Toolbar'
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

export default function MemoScreen({ id }: { id: string }) {
  const data = useData()
  const memo = data.memos.find((m) => m.id === id)
  // Live preview makes the editor readable, so memos open in it; preview mode is opt-in
  const [editing, setEditing] = useState(true)
  const [isNew] = useState(() => !memo?.content)
  const [sheet, setSheet] = useState<{ title?: string; actions: SheetAction[] } | null>(null)
  // Bumped on every editor update so the toolbar re-reads the editor state
  const [view, setView] = useState<{ view: EditorView | null }>({ view: null })

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
              {editing ? '表示' : '編集'}
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
          <Editor
            initial={memo.content}
            autoFocus={isNew}
            onChange={(doc) => actions.updateMemo(id, doc)}
            onUpdate={(v) => setView({ view: v })}
          />
          <Toolbar view={view.view} />
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
