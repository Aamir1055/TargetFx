import { useEffect, useState } from 'react'
import { getAiTokenOverride, setAiTokenOverride } from '../../services/api'

// "Use a token instead" — paste a JWT directly rather than relying on the page's usual
// (already-signed-in) Broker Eye session. Stored under its own key (see setAiTokenOverride),
// never the main app's access_token, so it only affects AI requests.
const AiTokenDialog = ({ open, onClose, onSaved }) => {
  const [value, setValue] = useState('')

  useEffect(() => { if (open) setValue(getAiTokenOverride()) }, [open])
  if (!open) return null

  const save = () => {
    setAiTokenOverride(value)
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-2 sm:p-4" onClick={onClose}>
      <div className="w-full max-w-[340px] rounded-[10px] border border-slate-300 bg-white shadow-xl sm:max-w-[500px]" onClick={e => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-4 py-2.5 sm:px-5 sm:py-4">
          <h2 className="text-[15px] font-semibold text-slate-900">Broker token</h2>
        </div>
        <div className="px-4 py-3 sm:px-5 sm:py-4">
          <p className="mb-2 text-xs leading-5 text-slate-500 sm:mb-3">
            Paste the JWT returned by <b className="font-mono font-semibold text-slate-700">POST /api/auth/broker/login</b>. It is stored in this browser only.
          </p>
          <input
            type="password"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            placeholder="eyJhbGciOi…"
            autoComplete="off"
            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-mono outline-none transition focus:border-blue-600 focus:ring-1 focus:ring-blue-600 sm:h-10"
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-2.5 sm:px-5 sm:py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:h-10">Cancel</button>
          <button type="button" onClick={save} className="h-9 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 sm:h-10">Save</button>
        </div>
      </div>
    </div>
  )
}

export default AiTokenDialog
