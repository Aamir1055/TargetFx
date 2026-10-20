import { useEffect, useMemo, useRef, useState } from 'react'

// Ctrl+K quick-switcher: jump to a past conversation, re-ask a saved question, or trigger a
// quick action (new conversation, open Memory/Alerts/Digests) without leaving the keyboard.
const AiCommandPalette = ({ open, onClose, conversations, saved, onSelectConversation, onAsk, onNewConversation, onOpenMemory, onOpenAlerts, onOpenDigests }) => {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (s) => !q || (s || '').toLowerCase().includes(q)
    const actions = [
      { key: 'new', label: 'New conversation', run: onNewConversation },
      { key: 'memory', label: 'Open Memory', run: onOpenMemory },
      { key: 'alerts', label: 'Open Alerts', run: onOpenAlerts },
      { key: 'digests', label: 'Open Scheduled digests', run: onOpenDigests },
    ].filter(a => match(a.label))
    const savedItems = (saved || []).filter(s => match(s.title) || match(s.question)).slice(0, 8)
      .map(s => ({ key: `saved-${s.id}`, label: s.title || s.question, run: () => onAsk(s.question) }))
    const convItems = (conversations || []).filter(c => match(c.title)).slice(0, 8)
      .map(c => ({ key: `conv-${c.id}`, label: c.title || 'Untitled conversation', run: () => onSelectConversation(c.id) }))
    return [
      { name: 'Actions', items: actions },
      { name: 'Saved questions', items: savedItems },
      { name: 'Conversations', items: convItems },
    ].filter(g => g.items.length)
  }, [query, conversations, saved, onAsk, onSelectConversation, onNewConversation, onOpenMemory, onOpenAlerts, onOpenDigests])

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups])

  if (!open) return null

  const run = (item) => { item.run(); onClose() }
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat[selected]) run(flat[selected]) }
  }

  let runningIndex = -1
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/30 px-4 pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setSelected(0) }} onKeyDown={onKeyDown} placeholder="Jump to a conversation, saved question or action…" className="flex-1 border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {groups.length === 0 && <p className="px-3 py-8 text-center text-xs text-slate-400">No matches</p>}
          {groups.map(g => (
            <div key={g.name}>
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.name}</p>
              {g.items.map(item => {
                runningIndex += 1
                const isSel = runningIndex === selected
                return (
                  <button key={item.key} type="button" onMouseEnter={() => setSelected(runningIndex)} onClick={() => run(item)} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${isSel ? 'bg-slate-100 text-slate-900' : 'text-slate-700'}`}>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AiCommandPalette
