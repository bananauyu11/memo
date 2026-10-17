import { useSyncExternalStore } from 'react'

export const COLORS = ['none', 'pink', 'orange', 'yellow', 'green', 'blue', 'purple'] as const
export type Color = (typeof COLORS)[number]

export interface Folder {
  id: string
  name: string
  color: Color
  parentId: string | null
  order: number
}

export interface Memo {
  id: string
  folderId: string | null
  content: string
  color: Color
  order: number
  updatedAt: number
}

export interface Data {
  folders: Folder[]
  memos: Memo[]
}

const KEY = 'memo-app-v1'

const WELCOME = `# メモへようこそ

**マークダウン**で書けます。

## 使い方
- 左へスワイプで削除
- 右へスワイプで色をつける
- 長押しで順番を入れ替え
- ＋ボタンでメモ・フォルダを追加

## チェックリスト
- [x] メモを書く
- [ ] フォルダを作る

> プレビュー中のチェックボックスはタップで切り替えられます。

\`\`\`js
console.log('code block')
\`\`\`
`

function uid() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function initial(): Data {
  const folderId = uid()
  return {
    folders: [{ id: folderId, name: 'アイデア', color: 'pink', parentId: null, order: 0 }],
    memos: [{ id: uid(), folderId: null, content: WELCOME, color: 'none', order: 0, updatedAt: Date.now() }],
  }
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      if (Array.isArray(d.folders) && Array.isArray(d.memos)) return d
    }
  } catch {
    // fall through to initial data
  }
  return initial()
}

let data: Data = load()
const listeners = new Set<() => void>()

function set(next: Data) {
  data = next
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable; keep in memory
  }
  listeners.forEach((l) => l())
}

export function getData() {
  return data
}

export function useData() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => data,
  )
}

const nextOrder = (items: { order: number }[]) => Math.max(-1, ...items.map((i) => i.order)) + 1

function descendants(folderId: string): Set<string> {
  const ids = new Set([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const f of data.folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id)
        grew = true
      }
    }
  }
  return ids
}

export const actions = {
  addFolder(parentId: string | null, name: string) {
    const id = uid()
    const order = nextOrder(data.folders.filter((f) => f.parentId === parentId))
    set({ ...data, folders: [...data.folders, { id, name, color: 'none', parentId, order }] })
    return id
  },
  renameFolder(id: string, name: string) {
    set({ ...data, folders: data.folders.map((f) => (f.id === id ? { ...f, name } : f)) })
  },
  setFolderColor(id: string, color: Color) {
    set({ ...data, folders: data.folders.map((f) => (f.id === id ? { ...f, color } : f)) })
  },
  deleteFolder(id: string) {
    const ids = descendants(id)
    set({
      folders: data.folders.filter((f) => !ids.has(f.id)),
      memos: data.memos.filter((m) => !m.folderId || !ids.has(m.folderId)),
    })
  },
  /** Number of memos and subfolders inside a folder, recursively. */
  folderSize(id: string) {
    const ids = descendants(id)
    return ids.size - 1 + data.memos.filter((m) => m.folderId && ids.has(m.folderId)).length
  },
  addMemo(folderId: string | null) {
    const id = uid()
    // New memos go to the top of the list
    const order = Math.min(1, ...data.memos.filter((m) => m.folderId === folderId).map((m) => m.order)) - 1
    set({ ...data, memos: [...data.memos, { id, folderId, content: '', color: 'none', order, updatedAt: Date.now() }] })
    return id
  },
  updateMemo(id: string, content: string) {
    set({ ...data, memos: data.memos.map((m) => (m.id === id ? { ...m, content, updatedAt: Date.now() } : m)) })
  },
  setMemoColor(id: string, color: Color) {
    set({ ...data, memos: data.memos.map((m) => (m.id === id ? { ...m, color } : m)) })
  },
  moveMemo(id: string, folderId: string | null) {
    const order = nextOrder(data.memos.filter((m) => m.folderId === folderId))
    set({ ...data, memos: data.memos.map((m) => (m.id === id ? { ...m, folderId, order } : m)) })
  },
  deleteMemo(id: string) {
    set({ ...data, memos: data.memos.filter((m) => m.id !== id) })
  },
  deleteMemoIfEmpty(id: string) {
    const m = data.memos.find((m) => m.id === id)
    if (m && m.content.trim() === '') actions.deleteMemo(id)
  },
  reorderFolders(ids: string[]) {
    set({ ...data, folders: data.folders.map((f) => (ids.includes(f.id) ? { ...f, order: ids.indexOf(f.id) } : f)) })
  },
  reorderMemos(ids: string[]) {
    set({ ...data, memos: data.memos.map((m) => (ids.includes(m.id) ? { ...m, order: ids.indexOf(m.id) } : m)) })
  },
  importData(d: Data) {
    if (!Array.isArray(d?.folders) || !Array.isArray(d?.memos)) throw new Error('invalid')
    set({ folders: d.folders, memos: d.memos })
  },
}

export function memoTitle(content: string) {
  const line = content.split('\n').find((l) => l.trim() !== '')
  if (!line) return '新規メモ'
  return line.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').replace(/[*_`~]/g, '').trim() || '新規メモ'
}

export function formatDate(t: number) {
  const d = new Date(t)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}
