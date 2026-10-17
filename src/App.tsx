import { useEffect, useState } from 'react'
import ListScreen from './ListScreen'
import MemoScreen from './MemoScreen'

export type Route = { type: 'folder'; id: string | null } | { type: 'memo'; id: string }

function parseHash(): Route {
  const [type, id] = location.hash.replace(/^#\/?/, '').split('/')
  if (type === 'm' && id) return { type: 'memo', id }
  if (type === 'f' && id) return { type: 'folder', id }
  return { type: 'folder', id: null }
}

export function hrefFor(r: Route) {
  if (r.type === 'memo') return `#/m/${r.id}`
  return r.id ? `#/f/${r.id}` : '#/'
}

// Number of entries we pushed ourselves, so "back" can use history when possible
let depth = 0

export function navigate(r: Route) {
  depth++
  location.hash = hrefFor(r)
}

export function goBack(fallback: Route) {
  if (depth > 0) {
    depth--
    history.back()
  } else {
    location.replace(hrefFor(fallback))
  }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route.type === 'memo' ? (
    <MemoScreen key={route.id} id={route.id} />
  ) : (
    <ListScreen key={route.id ?? 'root'} folderId={route.id} />
  )
}
