import { useBrokerCredit } from '../contexts/brokerCreditStore'
import { formatCredit, showCreditSummary } from '../utils/brokerCredit'

export default function BrokerCreditSummary({ variant = 'card', className = '' }) {
  const { credit, error, refresh } = useBrokerCredit()
  if (!showCreditSummary(credit)) return null
  const unavailable = credit.live_data === false || !!error
  if (variant === 'desktop-header') return <section aria-label="Broker credit" className={`mt-2 hidden w-full shrink-0 basis-full flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-blue-100 px-2 pt-2 text-xs text-slate-600 md:flex ${className}`}>
    <div className="flex items-center gap-2"><span>Credit limit</span><strong className="text-slate-800">{formatCredit(credit.credit_limit)}</strong></div>
    <div className="flex items-center gap-2"><span>Available credit</span><strong className="text-blue-700">{unavailable ? 'Unavailable' : formatCredit(credit.available_credit)}</strong></div>
    {unavailable && <button type="button" onClick={refresh} className="text-amber-700 underline">Retry credit refresh</button>}
  </section>
  if (variant === 'header') return <section aria-label="Broker credit" className={`ml-2 grid shrink-0 grid-cols-[auto_auto] items-center gap-x-2 gap-y-1 text-[9px] leading-tight text-slate-600 sm:text-[11px] md:hidden ${className}`}>
    <span>Credit limit</span><strong className="text-right text-slate-800">{formatCredit(credit.credit_limit)}</strong>
    <span>Available credit</span><strong className="text-right text-blue-700">{unavailable ? 'Unavailable' : formatCredit(credit.available_credit)}</strong>
    {unavailable && <button type="button" onClick={refresh} className="text-amber-700 underline">Retry credit refresh</button>}
  </section>
  return <section aria-label="Broker credit" className="mb-2 rounded-lg border border-blue-100 bg-blue-50 p-2 text-[11px] text-slate-700">
    <div className="flex items-center justify-between gap-2"><span>Credit limit</span><strong>{formatCredit(credit.credit_limit)}</strong></div>
    <div className="mt-1 flex items-center justify-between gap-2"><span>Available credit</span><strong className="text-blue-700">{unavailable ? 'Unavailable' : formatCredit(credit.available_credit)}</strong></div>
    {unavailable && <button type="button" onClick={refresh} className="mt-1 text-left text-amber-700 underline">Credit data unavailable. Retry</button>}
  </section>
}
