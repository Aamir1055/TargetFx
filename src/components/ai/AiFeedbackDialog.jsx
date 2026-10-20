import { useEffect, useRef, useState } from 'react'

// "Something was wrong" follow-up — a short note goes to the admins and may become a rule
// the assistant follows next time. Mirrors the reference app's #fbDlg exactly.
const AiFeedbackDialog = ({ open, onClose, onSend }) => {
  const [note, setNote] = useState('')
  const textRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setNote('')
    requestAnimationFrame(() => textRef.current?.focus())
  }, [open])
  if (!open) return null

  const send = () => {
    const trimmed = note.trim()
    if (!trimmed) return
    onSend(trimmed)
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">What was wrong?</h2>
        </div>
        <div className="px-5 py-4">
          <p className="mb-3 text-xs leading-5 text-slate-500">Your note goes to the admins and may become a rule the assistant follows next time.</p>
          <textarea
            ref={textRef}
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }}
            placeholder='e.g. "show INR in lakh / crore, not million"'
            rows={3}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" disabled={!note.trim()} onClick={send} className="h-9 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Send</button>
        </div>
      </div>
    </div>
  )
}

export default AiFeedbackDialog
