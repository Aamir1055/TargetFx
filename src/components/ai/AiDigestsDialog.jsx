import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../services/api'

// Sunday-first, matching the backend's weekday numbering (scheduler.py: Sun=0 ... Sat=6) —
// Mon-Fri (1-5) is the default, same as the reference app's "weekdays" alias.
const WEEKDAYS = [{ label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }]
const emptyDraft = { name: '', prompt: '', run_time: '09:00', weekdays: '1,2,3,4,5', deliver_telegram: true }
const fieldClass = 'rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600'

// Recurring automated summaries (e.g. "every weekday at 9am, summarise yesterday's P&L").
// A manual "Run now" drops the result straight into the conversation list.
const AiDigestsDialog = ({ open, onClose, onRan, initialPrompt = '' }) => {
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(null)
  const nameRef = useRef(null)

  // Opened via a message's "Schedule" action: prefill both Name and What-to-include with that
  // exact question (name whitespace-collapsed and capped to 40 chars) and select the name so
  // it's easy to immediately replace — same as the reference app's openDigestsWith().
  useEffect(() => {
    if (!open) return
    setError('')
    aiAPI.getDigests().then(setData).catch(e => setError(e.message))
    // Reset first — this dialog stays mounted between opens, so without this a partially-filled,
    // never-saved form (or a stale prefill from an earlier "Schedule" click) would leak into the
    // next time it's opened normally.
    if (initialPrompt) {
      setDraft({ ...emptyDraft, name: initialPrompt.replace(/\s+/g, ' ').slice(0, 40), prompt: initialPrompt })
      requestAnimationFrame(() => { nameRef.current?.focus(); nameRef.current?.select() })
    } else {
      setDraft(emptyDraft)
    }
  }, [open, initialPrompt])
  if (!open) return null

  const days = new Set(String(draft.weekdays).split(',').filter(Boolean).map(Number))
  const toggleDay = (value) => {
    const next = new Set(days)
    next.has(value) ? next.delete(value) : next.add(value)
    setDraft(d => ({ ...d, weekdays: Array.from(next).sort().join(',') }))
  }

  const save = async () => {
    if (!draft.name.trim() || !draft.prompt.trim() || !days.size) { setError('Name, prompt and at least one day are required'); return }
    setSaving(true); setError('')
    try { setData(await aiAPI.createDigest(draft)); setDraft(emptyDraft) }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  const toggleEnabled = async (d) => { try { setData(await aiAPI.updateDigest(d.id, { enabled: !d.enabled })) } catch (e) { setError(e.message) } }
  const remove = async (id) => { try { setData(await aiAPI.deleteDigest(id)) } catch (e) { setError(e.message) } }
  const runNow = async (id) => {
    setRunning(id)
    try { const r = await aiAPI.runDigest(id); onRan?.(r.conversation_id) } catch (e) { setError(e.message) } finally { setRunning(null) }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-2 sm:p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-16px)] w-full max-w-[340px] flex-col overflow-hidden rounded-[10px] border border-slate-300 bg-white shadow-xl sm:max-h-[calc(100dvh-32px)] sm:max-w-[660px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-baseline gap-2"><h2 className="text-[15px] font-semibold text-slate-900">Scheduled digests</h2><span className="text-xs text-slate-400">{data?.digests?.length ?? 0} of {data?.max ?? 5}</span></div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
          <p className="mb-3 text-xs leading-5 text-slate-500">Summaries the assistant prepares by itself at a set time. They are sent to your Telegram and kept in your conversation list.</p>
          {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {(data?.digests || []).length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.digests.map(d => (
                <div key={d.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <b className="truncate text-[13px] font-semibold text-slate-800">{d.name}</b>
                    <button type="button" onClick={() => toggleEnabled(d)} className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${d.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{d.enabled ? 'On' : 'Off'}</button>
                    <button type="button" disabled={running === d.id} onClick={() => runNow(d.id)} className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50">{running === d.id ? 'Running…' : 'Run now'}</button>
                    <button type="button" onClick={() => remove(d.id)} className="shrink-0 rounded-md p-1 text-slate-400 hover:text-red-600" aria-label="Delete digest">✕</button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{d.next_run_text ? `Next: ${d.next_run_text}` : `${d.run_time} · ${d.weekdays}`}</p>
                </div>
              ))}
            </div>
          ) : data && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center text-xs leading-5 text-slate-400">
              No digests yet. Add one below, or just ask the assistant: &ldquo;every morning at 9 send me yesterday&apos;s deposits and margin calls&rdquo;.
            </p>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New digest</p>
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-slate-600">Name
                <input ref={nameRef} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Morning digest" className={`mt-1 h-9 w-full ${fieldClass}`} />
              </label>
              <label className="text-xs font-medium text-slate-600">What to include
                <textarea value={draft.prompt} onChange={e => setDraft(d => ({ ...d, prompt: e.target.value }))} placeholder="Yesterday's deposits and withdrawals with totals, accounts below margin call, top 5 clients by profit" rows={3} className={`mt-1 w-full py-2 ${fieldClass}`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-600">Time
                  <input type="time" value={draft.run_time} onChange={e => setDraft(d => ({ ...d, run_time: e.target.value }))} className={`mt-1 h-9 w-full ${fieldClass}`} />
                </label>
                <div className="text-xs font-medium text-slate-600">Days
                  <div className="mt-1 flex flex-wrap gap-1">
                    {WEEKDAYS.map(({ label, value }) => (
                      <button key={label} type="button" onClick={() => toggleDay(value)} className={`h-7 rounded-md border px-2.5 text-xs font-medium ${days.has(value) ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={draft.deliver_telegram} onChange={e => setDraft(d => ({ ...d, deliver_telegram: e.target.checked }))} className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Send to Telegram when linked
              </label>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-4 py-2.5 sm:px-5 sm:py-3">
          <button type="button" onClick={onClose} className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={saving} onClick={save} className="h-10 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">{saving ? 'Saving…' : 'Add digest'}</button>
        </div>
      </div>
    </div>
  )
}

export default AiDigestsDialog
