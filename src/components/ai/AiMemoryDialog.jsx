import { useEffect, useState } from 'react'
import { aiAPI } from '../../services/api'

// "What the assistant remembers about you" — free-text notes (e.g. "Always show figures in
// lakh/crore") that get folded into every future answer. Backed by /ai/preferences.
const AiMemoryDialog = ({ open, onClose }) => {
  const [items, setItems] = useState([])
  const [max, setMax] = useState(20)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    aiAPI.getPreferences().then(r => { setItems(r.preferences || []); setMax(r.max || 20) }).catch(e => setError(e.message))
  }, [open])

  if (!open) return null

  const add = async () => {
    if (!note.trim()) return
    setSaving(true); setError('')
    try { const r = await aiAPI.addPreference(note.trim()); setItems(r.preferences || []); setNote('') }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  const remove = async (id) => {
    try { const r = await aiAPI.deletePreference(id); setItems(r.preferences || []) }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-2 sm:p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-16px)] w-full max-w-[340px] flex-col overflow-hidden rounded-[10px] border border-slate-300 bg-white shadow-xl sm:max-h-[94vh] sm:max-w-[500px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-baseline gap-2"><h2 className="text-[15px] font-semibold text-slate-900">Memory</h2><span className="text-xs text-slate-400">{items.length} of {max}</span></div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs leading-5 text-slate-500 sm:mb-3">What the assistant remembers about you in every conversation. Add a note here or just tell it &ldquo;remember &hellip;&rdquo; / &ldquo;forget &hellip;&rdquo;.</p>
          {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <ul className="flex flex-col gap-2">
            {items.map(it => (
              <li key={it.id} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 text-[13px] leading-5 text-slate-700">
                <span className="flex-1">{it.note}</span>
                <button type="button" onClick={() => remove(it.id)} className="shrink-0 text-slate-400 hover:text-red-600" aria-label="Forget this">✕</button>
              </li>
            ))}
            {!items.length && <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 py-4 text-center text-xs text-slate-400 sm:py-6">No notes yet</li>}
          </ul>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-slate-100 px-4 py-2.5 sm:px-5 sm:py-3">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            placeholder='e.g. "Show INR in lakh and crore"'
            disabled={items.length >= max}
            maxLength={240}
            className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:bg-slate-50 disabled:text-slate-400 sm:h-10"
          />
          <button type="button" disabled={saving || !note.trim() || items.length >= max} onClick={add} className="h-9 rounded-md bg-blue-700 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 sm:h-10 sm:px-4">Add</button>
        </div>
      </div>
    </div>
  )
}

export default AiMemoryDialog
