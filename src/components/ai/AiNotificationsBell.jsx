import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../services/api'
import AiAlertsDialog from './AiAlertsDialog'

const POLL_MS = 60000

// Bell icon with an unread badge; polls /ai/alerts/events so a triggered alert (e.g. a margin
// call watch) shows up without the user asking for it. Opens a dropdown of recent hits, plus
// the Alerts management dialog where rules are created.
const AiNotificationsBell = () => {
  const [open, setOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [events, setEvents] = useState([])
  const [unseen, setUnseen] = useState(0)
  const ref = useRef(null)

  const poll = () => aiAPI.getAlertEvents({ limit: 30 }).then(r => { setEvents(r.events || []); setUnseen(r.unseen || 0) }).catch(() => {})
  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Opening the bell does NOT clear the unread count on its own — same as the reference app,
  // only the explicit "Mark all read" click does, via the latest event's id as the watermark.
  const markAllRead = async () => {
    try { await aiAPI.markAlertEventsSeen(events[0]?.id); poll() } catch { /* Leave the badge as-is; the next poll will reconcile it. */ }
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Alerts" title="Alerts">
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        {unseen > 0 && <span className="absolute right-1 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">{unseen > 9 ? '9+' : unseen}</span>}
      </button>
      {open && (
        <div className="fixed right-3 top-[calc(var(--app-viewport-top,0px)+60px)] z-[60] w-[min(calc(100vw-24px),320px)] overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.18)] md:absolute md:right-0 md:top-11 md:w-[340px] md:shadow-lg">
          <div className="flex min-h-11 items-center gap-2 border-b border-slate-100 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 md:hidden">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-[13px] font-semibold text-slate-800">Alerts</b>
              <span className="block text-[11px] text-slate-400">{unseen > 0 ? `${unseen} new notification${unseen === 1 ? '' : 's'}` : 'No new notifications'}</span>
            </div>
            <button type="button" onClick={markAllRead} disabled={!unseen} className="h-8 rounded-md px-2 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 disabled:text-slate-300 disabled:hover:bg-transparent">Mark all read</button>
            <button type="button" onClick={() => { setOpen(false); setManageOpen(true) }} className="h-8 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">Manage</button>
          </div>
          <div className="max-h-[min(55vh,420px)] overflow-y-auto overscroll-contain">
            {events.length ? events.map(ev => (
              <div key={ev.id} className="border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50">
                <b className="block text-[13px] font-semibold text-slate-800">{ev.alert_name || ev.name}</b>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{ev.message || ev.summary}</p>
                <small className="mt-1 block text-[11px] text-slate-400">{ev.created_at}</small>
              </div>
            )) : <div className="flex flex-col items-center px-5 py-5 text-center"><span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400"><svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></span><b className="text-[13px] font-semibold text-slate-700">No alerts yet</b><p className="mt-1 max-w-[240px] text-[11px] leading-4 text-slate-400">Ask the assistant to alert you when a client&apos;s margin level drops below 120%.</p></div>}
          </div>
        </div>
      )}
      <AiAlertsDialog open={manageOpen} onClose={() => setManageOpen(false)} />
    </div>
  )
}

export default AiNotificationsBell
