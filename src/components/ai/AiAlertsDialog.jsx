import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../services/api'

const emptyDraft = { name: '', kind: '', threshold: '', hours: 24, logins: '', liquidate_type: '', check_interval_minutes: 5, cooldown_minutes: 240, deliver_telegram: true }
const fieldClass = 'h-8 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600'

// Alert rules management (e.g. "tell me when margin level drops below 150%"). Separate from
// the bell, which just shows triggered *events* for rules created here. The form mirrors the
// reference app's exactly: which fields show (threshold vs. hours vs. logins vs. liquidate
// type) depends on the chosen kind's declared `params` list from GET /ai/alerts.
const AiAlertsDialog = ({ open, onClose }) => {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState(emptyDraft)
  const [saving, setSaving] = useState(false)
  const conditionMenuRef = useRef(null)

  const load = () => aiAPI.getAlerts().then(setData).catch(e => setError(e.message))
  // This dialog stays mounted (just hidden) between opens, so its draft state would otherwise
  // leak a partially-filled, never-saved form across close/reopen cycles.
  useEffect(() => { if (open) { setDraft(emptyDraft); setError(''); load() } }, [open])

  if (!open) return null
  const kinds = data?.kinds || {}
  const kindDef = draft.kind ? kinds[draft.kind] : null
  const has = (name) => !!kindDef?.params?.includes(name)
  const thrLabel = draft.kind === 'margin_level_below' ? 'Margin level % (0 = system level)' : 'Amount'

  const save = async () => {
    if (!draft.name.trim() || !draft.kind) { setError('Name and condition are required'); return }
    setSaving(true); setError('')
    try {
      const params = {}
      if (has('threshold')) params.threshold = draft.threshold
      if (has('hours')) params.hours = draft.hours
      if (has('logins')) params.logins = draft.logins
      if (has('liquidate_type') && draft.liquidate_type) params.liquidate_type = draft.liquidate_type
      setData(await aiAPI.createAlert({
        name: draft.name.trim(), kind: draft.kind, params,
        check_interval_minutes: Number(draft.check_interval_minutes) || 5, cooldown_minutes: Number(draft.cooldown_minutes) || 240,
        deliver_telegram: draft.deliver_telegram,
      }))
      setDraft(emptyDraft)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }
  const toggle = async (alert) => { try { setData(await aiAPI.updateAlert(alert.id, { enabled: !alert.enabled })) } catch (e) { setError(e.message) } }
  const remove = async (id) => { try { setData(await aiAPI.deleteAlert(id)) } catch (e) { setError(e.message) } }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-2 sm:p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-16px)] w-full max-w-[340px] flex-col overflow-hidden rounded-[10px] border border-slate-300 bg-white shadow-xl sm:max-h-[calc(100dvh-32px)] sm:max-w-[600px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-baseline gap-2"><h2 className="text-[15px] font-semibold text-slate-900">Alerts</h2><span className="text-xs text-slate-400">{data?.alerts?.length ?? 0} of {data?.max ?? 10}</span></div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          <p className="mb-2 text-xs leading-5 text-slate-500">Conditions checked every few minutes. Hits are sent to your Telegram and shown under the bell.</p>
          {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          {(data?.alerts || []).length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.alerts.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-800">{a.name}</p>
                    <p className="truncate text-xs text-slate-500">{a.description || kinds[a.kind]?.label || a.kind}</p>
                  </div>
                  <button type="button" onClick={() => toggle(a)} className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${a.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.enabled ? 'On' : 'Off'}</button>
                  <button type="button" onClick={() => remove(a.id)} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete alert"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
                </div>
              ))}
            </div>
          ) : data && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-center text-xs leading-5 text-slate-400">
              No alerts yet. Add one below, or ask the assistant: &ldquo;tell me when a client&apos;s margin level drops below 120%&rdquo;.
            </p>
          )}

          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New alert</p>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="min-w-0 text-xs font-medium text-slate-600">Name
                  <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Margin watch" className={`mt-1 ${fieldClass}`} />
                </label>
                <div className="min-w-0 text-xs font-medium text-slate-600">Condition
                  <details ref={conditionMenuRef} className="relative mt-1 text-sm font-normal">
                    <summary className={`${fieldClass} flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden`}>
                      <span className="truncate">{kindDef?.label || 'Choose…'}</span>
                      <svg className="ml-2 h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 9 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </summary>
                    <div className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                      <button type="button" onClick={() => { setDraft(d => ({ ...emptyDraft, name: d.name })); conditionMenuRef.current?.removeAttribute('open') }} className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50">Choose…</button>
                      {Object.entries(kinds).map(([key, value]) => (
                        <button key={key} type="button" onClick={() => { setDraft(d => ({ ...emptyDraft, name: d.name, kind: key })); conditionMenuRef.current?.removeAttribute('open') }} className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${draft.kind === key ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700'}`}>{value.label}</button>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
              {kindDef?.help && <p className="text-xs text-slate-500">{kindDef.help}</p>}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {has('threshold') && (
                  <label className="text-xs font-medium text-slate-600">{thrLabel}
                    <input type="number" step="any" min="0" value={draft.threshold} onChange={e => setDraft(d => ({ ...d, threshold: e.target.value }))} placeholder="120" className={`mt-1 ${fieldClass}`} />
                  </label>
                )}
                {has('hours') && (
                  <label className="text-xs font-medium text-slate-600">Hours ahead
                    <input type="number" min="1" max="336" value={draft.hours} onChange={e => setDraft(d => ({ ...d, hours: Number(e.target.value) }))} className={`mt-1 ${fieldClass}`} />
                  </label>
                )}
                <label className="text-xs font-medium text-slate-600">Check every (min)
                  <input type="number" min="1" inputMode="numeric" value={draft.check_interval_minutes} onChange={e => setDraft(d => ({ ...d, check_interval_minutes: e.target.value.replace(/^0+(?=\d)/, '') }))} className={`mt-1 ${fieldClass}`} />
                </label>
                <label className="text-xs font-medium text-slate-600">Repeat after (min)
                  <input type="number" min="1" inputMode="numeric" value={draft.cooldown_minutes} onChange={e => setDraft(d => ({ ...d, cooldown_minutes: e.target.value.replace(/^0+(?=\d)/, '') }))} className={`mt-1 ${fieldClass}`} />
                </label>
              </div>

              {has('logins') && (
                <label className="text-xs font-medium text-slate-600">Only these logins (optional, comma-separated)
                  <input value={draft.logins} onChange={e => setDraft(d => ({ ...d, logins: e.target.value }))} placeholder="750001, 750002" className={`mt-1 ${fieldClass}`} />
                </label>
              )}
              {has('liquidate_type') && (
                <label className="text-xs font-medium text-slate-600">Liquidate type
                  <select value={draft.liquidate_type} onChange={e => setDraft(d => ({ ...d, liquidate_type: e.target.value }))} className={`mt-1 ${fieldClass}`}>
                    <option value="">All</option>
                    <option>Liquidate</option>
                    <option>Non-Liquidate</option>
                  </select>
                </label>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={draft.deliver_telegram} onChange={e => setDraft(d => ({ ...d, deliver_telegram: e.target.checked }))} className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                Send to Telegram when linked
              </label>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-4 py-2.5 sm:px-5 sm:py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={saving || !draft.kind} onClick={save} className="h-9 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">{saving ? 'Saving…' : 'Add alert'}</button>
        </div>
      </div>
    </div>
  )
}

export default AiAlertsDialog
