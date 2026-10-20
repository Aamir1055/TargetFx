import { Fragment, useState } from 'react'

const STATE_STYLE = {
  pending: { border: 'border-l-blue-500', text: 'text-blue-600', label: 'Awaiting confirmation' },
  executing: { border: 'border-l-slate-300', text: 'text-slate-500', label: 'Applying…' },
  executed: { border: 'border-l-emerald-500', text: 'text-emerald-600', label: 'Executed' },
  failed: { border: 'border-l-red-500', text: 'text-red-600', label: 'Failed' },
  cancelled: { border: 'border-l-slate-300', text: 'text-slate-400', label: 'Cancelled' },
  expired: { border: 'border-l-slate-300', text: 'text-slate-400', label: 'Expired' },
}
const ROW_STATE_CLASS = { done: 'text-emerald-700 font-medium', failed: 'text-red-700 font-medium', running: 'text-blue-600 font-medium', skipped: 'text-slate-400' }

// A proposed credit/rule/account action awaiting the broker's confirmation, sent as an
// `action` SSE event: { action: card }. `card` matches store.action_view() in the backend:
// { id, kind, label, summary, payload: { details: [[label,value]], items?: [...bulk] }, status }.
const AiActionCard = ({ action, onConfirm, onCancel, busy }) => {
  const [confirming, setConfirming] = useState(false)
  if (!action) return null
  const style = STATE_STYLE[action.status] || STATE_STYLE.pending
  const details = action.payload?.details || []
  const items = action.payload?.items
  const isPending = action.status === 'pending'

  return (
    <div className={`max-w-[560px] rounded-lg border border-l-[3px] border-slate-200 bg-white px-4 py-3.5 ${style.border}`}>
      <div className="flex items-center gap-2">
        <b className="text-[13.5px] font-semibold text-slate-900">{action.label || action.summary}</b>
        <span className={`ml-auto text-xs font-medium ${style.text}`}>{style.label}</span>
      </div>
      {action.summary && action.label && <p className="mt-1 text-[13px] text-slate-600">{action.summary}</p>}

      {details.length > 0 && (
        <div className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px]">
          {details.map(([label, value], i) => (
            <Fragment key={i}>
              <span className="text-slate-500">{label}</span>
              <span className="min-w-0 break-words text-slate-800">{String(value)}</span>
            </Fragment>
          ))}
        </div>
      )}

      {Array.isArray(items) && items.length > 0 && (
        <div className="mt-3 max-h-56 overflow-auto rounded-md border border-slate-100">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-100 text-slate-500"><th className="px-2 py-1.5 text-left font-semibold">Login</th><th className="px-2 py-1.5 text-left font-semibold">Name</th><th className="px-2 py-1.5 text-right font-semibold">Status</th></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={`${it.login}-${i}`} className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-1">{it.login}</td>
                  <td className="px-2 py-1 text-slate-600">{it.name || '—'}</td>
                  <td className={`px-2 py-1 text-right ${ROW_STATE_CLASS[it.status] || 'text-slate-500'}`}>{it.note || it.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {action.result?.message && <p className="mt-2 text-[13px] text-slate-600">{action.result.message}</p>}
      {action.error && <p className="mt-2 text-[13px] text-red-600">{action.error}</p>}

      {isPending && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => { setConfirming(true); Promise.resolve(onConfirm(action.id)).finally(() => setConfirming(false)) }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {confirming ? 'Confirming…' : 'Confirm'}
          </button>
          <button type="button" disabled={busy} onClick={() => onCancel(action.id)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

export default AiActionCard
