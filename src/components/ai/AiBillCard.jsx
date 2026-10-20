import { useState } from 'react'
import { aiAPI } from '../../services/api'

const fmt2 = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const BillStatement = ({ week, bill }) => {
  const [showTrades, setShowTrades] = useState(false)
  const [downloading, setDownloading] = useState('')
  const download = async (fmt) => {
    setDownloading(fmt)
    try { await aiAPI.downloadBill(week.id, bill.login, fmt, `${bill.login}_${week.label || week.name || week.id}.${fmt}`) }
    catch { /* The user sees nothing change; a retry is the natural next step. */ }
    finally { setDownloading('') }
  }
  return (
    <div className="max-w-[760px] overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start gap-4 border-b border-slate-100 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{week.label || week.name}{bill.currency ? ` · ${bill.currency}` : ''}</p>
          <p className="mt-0.5 text-[15px] font-semibold text-slate-900">{bill.login}{bill.name ? ` · ${bill.name}` : ''}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-slate-500">Net</p>
          <p className={`text-xl font-semibold tabular-nums ${bill.net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt2(bill.net)}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr className="text-slate-500">
              <th className="whitespace-nowrap py-2 pl-4 pr-3 text-left font-semibold">Symbol</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Buy lots</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Sell lots</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Trades</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">P&amp;L</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-semibold">Brokerage</th>
              <th className="whitespace-nowrap py-2 pl-3 pr-4 text-right font-semibold">Net</th>
            </tr>
          </thead>
          <tbody>
            {bill.symbols.map((s, i) => (
              <tr key={`${s.symbol}-${i}`} className="border-t border-slate-100">
                <td className="py-1.5 pl-4 pr-3 text-left">{s.symbol}</td>
                <td className="px-3 py-1.5 text-right">{fmt2(s.buy_lots)}</td>
                <td className="px-3 py-1.5 text-right">{fmt2(s.sell_lots)}</td>
                <td className="px-3 py-1.5 text-right">{s.trades}</td>
                <td className="px-3 py-1.5 text-right">{fmt2(s.pnl)}</td>
                <td className="px-3 py-1.5 text-right">{fmt2(s.brokerage)}</td>
                <td className="py-1.5 pl-3 pr-4 text-right">{fmt2(s.net)}</td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
              <td className="py-1.5 pl-4 pr-3 text-left">Total</td>
              <td className="px-3 py-1.5 text-right" colSpan={3} />
              <td className="px-3 py-1.5 text-right">{fmt2(bill.gross)}</td>
              <td className="px-3 py-1.5 text-right">{fmt2(bill.brokerage)}</td>
              <td className="py-1.5 pl-3 pr-4 text-right">{fmt2(bill.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {Array.isArray(bill.trades) && bill.trades.length > 0 && (
        <div className="border-t border-slate-100">
          <button type="button" onClick={() => setShowTrades(v => !v)} className="w-full px-4 py-2 text-left text-xs font-medium text-blue-600 hover:bg-slate-50">
            {showTrades ? 'Hide trade detail' : `Show ${bill.trades.length} trade${bill.trades.length === 1 ? '' : 's'}${bill.trades_truncated ? ' (truncated)' : ''}`}
          </button>
          {showTrades && (
            <div className="max-h-72 overflow-auto border-t border-slate-100">
              <table className="w-full text-[12.5px] tabular-nums">
                <thead><tr className="text-slate-500"><th className="px-4 py-1.5 text-left font-semibold">Symbol</th><th className="px-3 py-1.5 text-left font-semibold">Side</th><th className="px-3 py-1.5 text-right font-semibold">Qty</th><th className="px-3 py-1.5 text-right font-semibold">Price</th><th className="px-3 py-1.5 text-right font-semibold">Brokerage</th><th className="px-3 py-1.5 text-right font-semibold">P&amp;L</th><th className="px-4 py-1.5 text-left font-semibold">Time</th></tr></thead>
                <tbody>
                  {bill.trades.map((t, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-1 text-left">{t.symbol}</td>
                      <td className={`px-3 py-1 text-left font-medium ${t.side === 'BUY' ? 'text-emerald-700' : 'text-red-700'}`}>{t.side}</td>
                      <td className="px-3 py-1 text-right">{fmt2(t.qty)}</td>
                      <td className="px-3 py-1 text-right">{fmt2(t.price)}</td>
                      <td className="px-3 py-1 text-right">{fmt2(t.brokerage)}</td>
                      <td className="px-3 py-1 text-right">{fmt2(t.pnl)}</td>
                      <td className="px-4 py-1 text-left text-slate-500">{t.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
        <span className="text-xs text-slate-500">Download</span>
        {['pdf', 'xlsx', 'csv'].map(fmt => (
          <button key={fmt} type="button" disabled={!!downloading} onClick={() => download(fmt)} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:opacity-50">
            {downloading === fmt ? '…' : fmt.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )
}

// A settlement bill statement, sent as a `bill` SSE event: { data: { week, bills[], skipped[] } }.
const AiBillCard = ({ data }) => {
  if (!data?.bills?.length) return null
  return (
    <div className="flex flex-col gap-3">
      {data.bills.map(bill => <BillStatement key={bill.login} week={data.week} bill={bill} />)}
      {data.skipped?.length > 0 && (
        <p className="text-xs text-slate-500">Skipped: {data.skipped.map(s => `${s.login} (${s.reason})`).join(', ')}</p>
      )}
    </div>
  )
}

export default AiBillCard
