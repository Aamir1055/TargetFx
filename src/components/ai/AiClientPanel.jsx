import { useEffect, useState } from 'react'
import { aiAPI } from '../../services/api'

const fmt2 = (n) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' }
const valueTone = (value) => Number(value) > 0 ? 'text-emerald-700' : Number(value) < 0 ? 'text-red-700' : 'text-slate-800'
const Row = ({ label, value, className = '' }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,auto)] items-center gap-3 text-[13px]"><span className="min-w-0 text-slate-500">{label}</span><span className={`min-w-0 break-words text-right tabular-nums font-semibold text-slate-800 ${className}`}>{value}</span></div>
)

// Quick-look panel for a login mentioned in chat — account snapshot, credit, last 7 days,
// open positions. Read-only (no account actions here; those go through the chat's own
// confirm/cancel action cards). Backed by /ai/clients/{login}/panel.
const AiClientPanel = ({ login, onClose }) => {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!login) return undefined
    let active = true
    setData(null); setError('')
    aiAPI.getClientPanel(login).then(r => active && setData(r)).catch(e => active && setError(e.message))
    return () => { active = false }
  }, [login])

  if (!login) return null
  const c = data?.client || {}

  return (
    <aside className="absolute inset-0 z-40 flex h-full min-w-0 flex-col overflow-hidden bg-white md:relative md:inset-auto md:z-auto md:w-[340px] md:shrink-0 md:border-l md:border-slate-200">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 ring-1 ring-blue-100">
          {(c.name || String(login)).trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-bold text-slate-900">{login}{c.name ? ` · ${c.name}` : ''}</b>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            {c.currency && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{c.currency}</span>}
            {c.group && <span className="truncate text-[11px] text-slate-400">{c.group}</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close panel"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
        {error && <p className="m-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {!data && !error && <p className="p-4 text-xs text-slate-400">Loading…</p>}
        {data && (
          <>
            <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3.5">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Account overview</p>
              <Row label="Balance" value={fmt2(c.balance)} className={valueTone(c.balance)} />
              <Row label="Credit" value={fmt2(c.credit)} className={valueTone(c.credit)} />
              <Row label="Equity" value={fmt2(c.equity)} className={valueTone(c.equity)} />
              <Row label="Margin level" value={c.marginLevel != null ? `${fmt2(c.marginLevel)}%` : '—'} className={valueTone(c.marginLevel)} />
              <Row label="Floating P&L" value={fmt2(c.floating ?? c.profit)} className={valueTone(c.floating ?? c.profit)} />
              <Row label="Trading" value={data.status?.trading_enabled === false ? 'Disabled' : 'Enabled'} className={data.status?.trading_enabled === false ? 'text-red-700' : 'text-emerald-700'} />
            </div>

            {data.credit && (
              <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/40 px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Credit</p>
                <Row label="Headroom" value={fmt2(data.credit.headroom)} className={valueTone(data.credit.headroom)} />
                <Row label="Reserved" value={fmt2(data.credit.reserved)} className={valueTone(data.credit.reserved)} />
                <Row label="Per-account max" value={fmt2(data.credit.max_per_account)} className={valueTone(data.credit.max_per_account)} />
              </div>
            )}

            {data.last7 && (
              <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last 7 days</p>
                <Row label="Deposit" value={fmt2(data.last7.deposit)} className={valueTone(data.last7.deposit)} />
                <Row label="Withdrawal" value={fmt2(data.last7.withdrawal)} className={valueTone(data.last7.withdrawal)} />
                <Row label="Profit" value={fmt2(data.last7.profit)} className={valueTone(data.last7.profit)} />
                <Row label="Volume" value={fmt2(data.last7.volume)} className={valueTone(data.last7.volume)} />
              </div>
            )}

            {data.positions?.length > 0 && (
              <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-3.5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Open positions ({data.positions_total ?? data.positions.length})</p>
                <div className="flex flex-col gap-1">
                  {data.positions.slice(0, 10).map((p, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(92px,auto)] items-start gap-3 text-xs leading-5">
                      <span className="min-w-0 break-words text-slate-600">{p.symbol} <span className={p.action === 'BUY' ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>{p.action}</span> {fmt2(p.volume)}</span>
                      <span className={`min-w-0 break-words text-right tabular-nums font-semibold ${Number(p.profit) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt2(p.profit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.temp_credits?.length > 0 && (
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pending temp credits</p>
                {data.temp_credits.map(t => (
                  <p key={t.id} className="text-xs text-slate-600">{t.direction} {fmt2(t.amount)} · expires {t.expires_at_text}</p>
                ))}
              </div>
            )}

            {data.errors?.length > 0 && <p className="px-4 py-3 text-xs text-amber-600">{data.errors.join(' · ')}</p>}
          </>
        )}
      </div>
    </aside>
  )
}

export default AiClientPanel
