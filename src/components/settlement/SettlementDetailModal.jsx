import { useEffect, useMemo, useRef } from 'react'
import { buildRowDetail, fmtMoney, fmtNumber, isSummable, toNumber } from '../../utils/settlementReport'
import { Cell, StatusBadge } from './SettlementCell'

// Number colour on a KPI card: green for a positive amount, red for a negative one, dark otherwise
// (the same treatment as the Exchange Breakdown dialog).
const TONES = {
  positive: 'text-emerald-600',
  negative: 'text-red-500',
  neutral: 'text-slate-900',
}

// Dialog for one settlement row: headline amounts as cards, the remaining values as a list, and any
// nested breakdown (e.g. per exchange) as its own table with totals. Everything is built from the row
// itself, so it shows whatever fields the report returns.
export default function SettlementDetailModal({ row, columns, weekLabel, onClose }) {
  const closeRef = useRef(null)
  const detail = useMemo(() => buildRowDetail(row, columns), [row, columns])

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow }
  }, [onClose])

  const cardTone = value => { const n = toNumber(value); return n === null || n === 0 ? TONES.neutral : n < 0 ? TONES.negative : TONES.positive }
  const cardValue = column => (column.kind === 'money' ? fmtMoney(row[column.key]) : fmtNumber(row[column.key]))

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="settlement-detail-title" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center gap-3.5 bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-3.5 text-white sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8.5L19 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M14 3v5h5M8.5 14.5l2.2 2.2 4.3-4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="settlement-detail-title" className="truncate text-base font-bold sm:text-lg">{detail.login != null ? `Login ${detail.login} — Settlement Details` : 'Settlement Details'}</h2>
            <p className="mt-0.5 truncate text-[13px] text-blue-100">{[detail.name, weekLabel].filter(Boolean).join(' · ')}</p>
          </div>
          {detail.status != null && detail.status !== '' && <span className="hidden shrink-0 sm:block"><StatusBadge value={detail.status} /></span>}
          <button ref={closeRef} type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-white px-5 py-4 sm:px-6">
          {detail.cards.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {detail.cards.map(column => (
                <div key={column.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{column.label}</p>
                  <p className={`mt-1.5 truncate text-xl font-bold tabular-nums ${column.kind === 'money' ? cardTone(row[column.key]) : TONES.neutral}`}>{cardValue(column)}</p>
                </div>
              ))}
            </div>
          )}

          {detail.fields.length > 0 && (
            <section>
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Details</h3>
                <span className="text-xs text-slate-400">{detail.fields.length} {detail.fields.length === 1 ? 'field' : 'fields'}</span>
              </div>
              <dl className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 md:grid-cols-2">
                {detail.fields.map((column, index) => (
                  <div key={column.key} className={`flex items-center justify-between gap-4 border-slate-100 px-4 py-2.5 ${index >= 1 ? 'border-t' : ''} ${index >= 2 ? '' : 'md:border-t-0'} ${index % 2 === 0 ? 'md:border-r' : ''}`}>
                    <dt className="text-sm text-slate-500">{column.label}</dt>
                    <dd className="min-w-0 truncate text-right text-sm font-semibold text-slate-900"><Cell column={column} value={row[column.key]} /></dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {detail.tables.map(table => {
            const summable = table.columns.filter(isSummable)
            const totals = Object.fromEntries(summable.map(column => [column.key, table.rows.reduce((sum, item) => sum + (toNumber(item[column.key]) || 0), 0)]))
            return (
              <section key={table.key}>
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{table.title}</h3>
                  <span className="text-xs text-slate-400">{table.rows.length} {table.rows.length === 1 ? 'row' : 'rows'}</span>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-max border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {table.columns.map(column => <th key={column.key} scope="col" className={`whitespace-nowrap px-4 py-3 ${column.kind === 'money' || column.kind === 'number' ? 'text-right' : 'text-left'}`}>{column.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((item, index) => (
                        <tr key={index} className="border-t border-slate-100">
                          {table.columns.map(column => <td key={column.key} className={`whitespace-nowrap px-4 py-3 text-slate-800 ${column.kind === 'money' || column.kind === 'number' ? 'text-right' : ''}`}><Cell column={column} value={item[column.key]} /></td>)}
                        </tr>
                      ))}
                    </tbody>
                    {summable.length > 0 && (
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                          {table.columns.map((column, index) => (
                            <td key={column.key} className={`whitespace-nowrap px-4 py-3 ${column.kind === 'money' || column.kind === 'number' ? 'text-right' : ''}`}>
                              {index === 0 ? 'Total' : column.key in totals ? <Cell column={column} value={totals[column.key]} /> : ''}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </section>
            )
          })}

          {detail.groups.map(group => (
            <section key={group.key}>
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">{group.title}</h3>
              <dl className="overflow-hidden rounded-2xl border border-slate-200">
                {group.entries.map(([key, value], index) => (
                  <div key={key} className={`flex items-center justify-between gap-4 px-4 py-2.5 ${index ? 'border-t border-slate-100' : ''}`}>
                    <dt className="text-sm text-slate-500">{key.replace(/[_-]+/g, ' ')}</dt>
                    <dd className="min-w-0 truncate text-right text-sm font-semibold text-slate-900">{value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          {!detail.cards.length && !detail.fields.length && !detail.tables.length && !detail.groups.length && (
            <p className="py-10 text-center text-sm text-slate-400">No further details for this row.</p>
          )}
        </div>
      </div>
    </div>
  )
}
