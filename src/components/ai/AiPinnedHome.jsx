import { useState } from 'react'
import { aiAPI } from '../../services/api'

// Pinned answers shown on the Home screen — a live tile (figure + caption) for a question
// worth checking often (e.g. "today's P&L"), refreshable with one tap.
const AiPinnedHome = ({ pins, onChange, onAsk }) => {
  const [busyId, setBusyId] = useState(null)
  if (!pins?.length) return null

  const refresh = async (id) => {
    setBusyId(id)
    try { const r = await aiAPI.refreshPin(id); onChange(prev => prev.map(p => (p.id === id && r.item) ? r.item : p)) }
    catch { /* The stale tile just stays as-is; the user can try again. */ }
    finally { setBusyId(null) }
  }
  const remove = async (id) => {
    try { await aiAPI.deletePin(id); onChange(prev => prev.filter(p => p.id !== id)) } catch { /* Leave the tile if the delete failed. */ }
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {pins.map(pin => (
        <div key={pin.id} className="group relative rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300">
          <button type="button" onClick={() => onAsk(pin.question)} className="block w-full text-left">
            <div className="flex items-center gap-1.5">
              <b className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{pin.title || pin.question}</b>
            </div>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{pin.figure || '—'}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{pin.caption || pin.last_error || 'Tap to refresh'}</p>
          </button>
          <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
            <button type="button" onClick={() => refresh(pin.id)} disabled={busyId === pin.id} className="rounded-md bg-white/90 p-1 text-slate-400 hover:text-blue-600" aria-label="Refresh pin" title="Refresh">
              <svg className={`h-3.5 w-3.5 ${busyId === pin.id ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none"><path d="M4 4v5h.6M20 20v-5h-.6M4.6 9A8 8 0 0 1 19 7m1 4a8 8 0 0 1-14.4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
            <button type="button" onClick={() => remove(pin.id)} className="rounded-md bg-white/90 p-1 text-slate-400 hover:text-red-600" aria-label="Unpin">✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default AiPinnedHome
