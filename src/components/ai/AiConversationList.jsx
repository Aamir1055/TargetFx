import { useEffect, useRef, useState } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000

// Buckets a conversation's `updated_at` the same way the reference app's sidebar does:
// Today / Yesterday / Previous 7 Days / Previous 30 Days / Older.
const bucketOf = (value) => {
  const ts = value ? new Date(value).getTime() : NaN
  if (Number.isNaN(ts)) return 'Older'
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime() }
  const today = startOfDay(Date.now())
  const day = startOfDay(ts)
  const diffDays = Math.round((today - day) / DAY_MS)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 7) return 'Previous 7 Days'
  if (diffDays <= 30) return 'Previous 30 Days'
  return 'Older'
}
const BUCKET_ORDER = ['Today', 'Yesterday', 'Previous 7 Days', 'Previous 30 Days', 'Older']

const groupConversations = (list) => {
  const byBucket = new Map()
  list.forEach(item => {
    const bucket = bucketOf(item.updated_at || item.created_at)
    if (!byBucket.has(bucket)) byBucket.set(bucket, [])
    byBucket.get(bucket).push(item)
  })
  return BUCKET_ORDER.filter(b => byBucket.has(b)).map(name => ({ name, items: byBucket.get(name) }))
}

function ConversationRow({ item, active, onSelect, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    <div ref={ref} className={`group relative flex items-center gap-1 rounded-lg border px-2.5 py-2 transition ${active ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'}`}>
      <button type="button" onClick={() => onSelect(item.id)} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[11px] font-semibold leading-4">{item.title || 'Untitled conversation'}</p>
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen(v => !v)}
        aria-label="Conversation options"
        className={`shrink-0 overflow-hidden rounded-md text-slate-400 transition-all hover:bg-slate-200 hover:text-slate-700 ${menuOpen ? 'w-5 p-1 opacity-100' : 'w-0 p-0 opacity-0 group-hover:w-5 group-hover:p-1 group-hover:opacity-100'}`}
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            disabled={deleting}
            onClick={async () => { setDeleting(true); await onDelete(item.id); setDeleting(false); setMenuOpen(false) }}
            className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

// Saved questions sit in their own group, always first, with a plain inline delete button
// rather than the conversations' "..." menu — matches the reference app's renderConversations().
function SavedRow({ item, onAsk, onDelete }) {
  const [deleting, setDeleting] = useState(false)
  return (
    <div className="group flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-2 text-slate-600 transition hover:border-slate-200 hover:bg-slate-50">
      <button type="button" onClick={() => onAsk(item.question)} title={item.question} className="min-w-0 flex-1 text-left">
        <p className="truncate text-[11px] font-semibold leading-4">{item.title || item.question}</p>
      </button>
      <button
        type="button"
        disabled={deleting}
        onClick={async () => { setDeleting(true); await onDelete(item.id); setDeleting(false) }}
        aria-label="Remove saved question"
        className="w-0 shrink-0 overflow-hidden rounded-md p-0 text-slate-400 opacity-0 transition-all hover:bg-slate-200 hover:text-red-600 group-hover:w-5 group-hover:p-1 group-hover:opacity-100 disabled:opacity-50"
      >
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg>
      </button>
    </div>
  )
}

// The conversation history list, grouped by recency (reused for both the desktop rail and the
// mobile drawer so the two never drift apart), with Saved Questions pinned above it.
const AiConversationList = ({ conversations, saved = [], activeId, searchActive, onSelect, onDelete, onAskSaved, onDeleteSaved }) => {
  if (!conversations.length && !saved.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-[11px] leading-4 text-slate-500">
        {searchActive ? 'No conversations match that search.' : 'Your conversations will appear here after your first question.'}
      </div>
    )
  }
  const groups = groupConversations(conversations)
  return (
    <div className="space-y-3">
      {saved.length > 0 && (
        <div>
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Saved questions</p>
          <div className="space-y-1">
            {saved.map(item => <SavedRow key={item.id} item={item} onAsk={onAskSaved} onDelete={onDeleteSaved} />)}
          </div>
        </div>
      )}
      {groups.map(group => (
        <div key={group.name}>
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group.name}</p>
          <div className="space-y-1">
            {group.items.map(item => (
              <ConversationRow key={item.id} item={item} active={item.id === activeId} onSelect={onSelect} onDelete={onDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default AiConversationList
