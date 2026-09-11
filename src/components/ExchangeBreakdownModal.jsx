import { useEffect, useMemo, useState } from 'react'

const fmtMoney = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtLots = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtVolume = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const commissionColor = (value) => {
  const num = Number(value)
  if (num < 0) return 'text-[#EF4444]'
  if (num > 0) return 'text-[#059669]'
  return 'text-[#6B7280]'
}

const ExchangeBreakdownModal = ({ client, onFetch, onClose }) => {
  const login = client?.Login ?? client?.login
  const [row, setRow] = useState(client)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (typeof onFetch !== 'function' || login == null) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.resolve(onFetch(login))
      .then(result => { if (!cancelled && result) setRow(result) })
      .catch(() => { if (!cancelled) setError('Failed to load exchange data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [login, onFetch])

  const name = row?.Name ?? row?.name ?? ''
  const agentCommission = Number(row?.AgentCommission ?? row?.agentCommission ?? 0)

  const exchanges = useMemo(() => {
    const list = Array.isArray(row?.Exchanges) ? row.Exchanges : Array.isArray(row?.exchanges) ? row.exchanges : []
    return list.map(e => ({
      name: e.Exchange ?? e.exchange ?? 'UNKNOWN',
      commission: Number(e.Commission ?? e.commission ?? 0),
      lots: Number(e.Lots ?? e.lots ?? 0),
      volume: Number(e.Volume ?? e.volume ?? 0),
    }))
  }, [row])

  const totals = useMemo(() => exchanges.reduce((acc, e) => ({
    commission: acc.commission + e.commission,
    lots: acc.lots + e.lots,
    volume: acc.volume + e.volume,
  }), { commission: 0, lots: 0, volume: 0 }), [exchanges])

  const activeCount = exchanges.filter(e => e.commission !== 0 || e.lots !== 0 || e.volume !== 0).length

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Exchange breakdown">
      <button type="button" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]" aria-label="Close exchange breakdown" />
      <div className="relative flex max-h-[calc(100dvh-24px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-48px)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-white sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 sm:flex" aria-hidden="true">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="5" width="18" height="14" rx="2" /><path strokeLinecap="round" d="M3 10h18M7 15h4" /></svg>
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold sm:text-lg">Login {login} — Exchange Breakdown</h2>
              {name && <p className="truncate text-xs font-medium text-blue-100 sm:text-sm">{name}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-white/90 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60" aria-label="Close">&times;</button>
        </div>

        <div className="min-h-0 overflow-auto p-3 sm:p-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Agent Commission</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-slate-800 sm:text-base">{fmtMoney(agentCommission)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Commission</p>
              <p className={`mt-1 text-sm font-bold tabular-nums sm:text-base ${commissionColor(totals.commission)}`}>{fmtMoney(totals.commission)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lots</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-[#059669] sm:text-base">{fmtLots(totals.lots)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="flex items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Volume</p>
              <p className="mt-1 text-sm font-bold tabular-nums text-[#059669] sm:text-base">{fmtVolume(totals.volume)}</p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Exchange Breakdown</p>
            <p className="text-[11px] text-slate-400">{activeCount} active of {exchanges.length} exchange{exchanges.length !== 1 ? 's' : ''}</p>
          </div>

          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[520px] w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-semibold">Exchange</th>
                  <th className="px-3 py-2 text-right font-semibold">Commission</th>
                  <th className="px-3 py-2 text-right font-semibold">Lots</th>
                  <th className="px-3 py-2 text-right font-semibold">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && exchanges.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">Loading…</td></tr>
                ) : error && exchanges.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-red-600">{error}</td></tr>
                ) : exchanges.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">No exchange data</td></tr>
                ) : (
                  exchanges.map((e, index) => {
                    const active = e.commission !== 0 || e.lots !== 0 || e.volume !== 0
                    return (
                      <tr key={`${e.name}-${index}`} className="bg-white">
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                            {e.name}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${commissionColor(e.commission)}`}>{fmtMoney(e.commission)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#059669]">{fmtLots(e.lots)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#059669]">{fmtVolume(e.volume)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {exchanges.length > 0 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                    <td className="px-3 py-2.5">Total</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${commissionColor(totals.commission)}`}>{fmtMoney(totals.commission)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#059669]">{fmtLots(totals.lots)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#059669]">{fmtVolume(totals.volume)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExchangeBreakdownModal
