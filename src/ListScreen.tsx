import { useRef, useState } from 'react'
import { goBack, navigate } from './App'
import { Item, OpenRow, SortableList } from './List'
import { actions, Data, formatDate, getData, memoTitle, useData } from './store'
import { ActionSheet, BackIcon, FolderIcon, Header, MoreIcon, PromptDialog, SheetAction } from './ui'

type Modal =
  | { type: 'sheet'; title?: string; actions: SheetAction[] }
  | { type: 'prompt'; title: string; initial?: string; onSubmit: (v: string) => void }
  | null

export default function ListScreen({ folderId }: { folderId: string | null }) {
  const data = useData()
  const [editing, setEditing] = useState(false)
  const [openRow, setOpenRow] = useState<OpenRow>(null)
  const [modal, setModal] = useState<Modal>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const folder = folderId ? data.folders.find((f) => f.id === folderId) : null
  if (folderId && !folder) {
    location.replace('#/')
    return null
  }

  const folders = data.folders.filter((f) => f.parentId === folderId).sort((a, b) => a.order - b.order)
  const memos = data.memos.filter((m) => m.folderId === folderId).sort((a, b) => a.order - b.order)

  const folderItems: Item[] = folders.map((f) => ({
    id: f.id,
    title: f.name,
    color: f.color,
    icon: <FolderIcon />,
    detail: String(
      data.folders.filter((c) => c.parentId === f.id).length + data.memos.filter((m) => m.folderId === f.id).length,
    ),
  }))
  const memoItems: Item[] = memos.map((m) => ({
    id: m.id,
    title: memoTitle(m.content),
    color: m.color,
    detail: formatDate(m.updatedAt),
  }))

  const newFolder = () =>
    setModal({ type: 'prompt', title: '新規フォルダ', onSubmit: (name) => actions.addFolder(folderId, name) })

  const newMemo = () => navigate({ type: 'memo', id: actions.addMemo(folderId) })

  const deleteFolder = (id: string) => {
    const size = actions.folderSize(id)
    if (size === 0 || confirm(`フォルダ内の${size}件の項目も削除されます。よろしいですか？`)) actions.deleteFolder(id)
    setOpenRow(null)
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `memo-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importData = async (file: File) => {
    try {
      const d = JSON.parse(await file.text()) as Data
      if (confirm('現在のデータをバックアップの内容で置き換えます。よろしいですか？')) actions.importData(d)
    } catch {
      alert('バックアップファイルを読み込めませんでした。')
    }
  }

  const menu: SheetAction[] = [
    { label: '新規フォルダ', onSelect: newFolder },
    ...(folder
      ? [
          {
            label: 'フォルダ名を変更',
            onSelect: () =>
              setModal({
                type: 'prompt',
                title: 'フォルダ名を変更',
                initial: folder.name,
                onSubmit: (name) => actions.renameFolder(folder.id, name),
              }),
          },
        ]
      : [
          { label: 'バックアップを書き出す', onSelect: exportData },
          { label: 'バックアップを読み込む', onSelect: () => fileInput.current?.click() },
        ]),
  ]

  const empty = folders.length === 0 && memos.length === 0

  return (
    <div className="screen" onPointerDown={(e) => openRow && !(e.target as HTMLElement).closest('.row-wrap') && setOpenRow(null)}>
      <Header
        left={
          folder ? (
            <button className="pill icon" aria-label="戻る" onClick={() => goBack({ type: 'folder', id: folder.parentId })}>
              <BackIcon />
            </button>
          ) : (
            !empty && (
              <button className="pill" onClick={() => setEditing(!editing)}>
                {editing ? '完了' : '編集'}
              </button>
            )
          )
        }
        title={folder ? folder.name : 'リスト'}
        right={
          <>
            {folder && !empty && (
              <button className="pill" onClick={() => setEditing(!editing)}>
                {editing ? '完了' : '編集'}
              </button>
            )}
            <button className="pill icon" aria-label="メニュー" onClick={() => setModal({ type: 'sheet', actions: menu })}>
              <MoreIcon />
            </button>
          </>
        }
      />

      <main className="content">
        {folderItems.length > 0 && (
          <>
            {memoItems.length > 0 && <div className="section-label">フォルダ</div>}
            <SortableList
              items={folderItems}
              editing={editing}
              openRow={openRow}
              setOpenRow={setOpenRow}
              onOpen={(id) => navigate({ type: 'folder', id })}
              onDelete={deleteFolder}
              onColor={actions.setFolderColor}
              onReorder={actions.reorderFolders}
            />
          </>
        )}
        {memoItems.length > 0 && (
          <>
            {folderItems.length > 0 && <div className="section-label">メモ</div>}
            <SortableList
              items={memoItems}
              editing={editing}
              openRow={openRow}
              setOpenRow={setOpenRow}
              onOpen={(id) => navigate({ type: 'memo', id })}
              onDelete={(id) => {
                actions.deleteMemo(id)
                setOpenRow(null)
              }}
              onColor={actions.setMemoColor}
              onReorder={actions.reorderMemos}
            />
          </>
        )}
        {empty && <p className="empty">メモはありません</p>}
      </main>

      <button
        className="fab"
        aria-label="追加"
        onClick={() =>
          setModal({
            type: 'sheet',
            actions: [
              { label: '新規メモ', onSelect: newMemo },
              { label: '新規フォルダ', onSelect: newFolder },
            ],
          })
        }
      >
        <svg viewBox="0 0 24 24" width="30" height="30">
          <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importData(f)
          e.target.value = ''
        }}
      />

      {modal?.type === 'sheet' && <ActionSheet title={modal.title} actions={modal.actions} onClose={() => setModal(null)} />}
      {modal?.type === 'prompt' && (
        <PromptDialog
          title={modal.title}
          initial={modal.initial}
          placeholder="フォルダ名"
          onSubmit={modal.onSubmit}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
