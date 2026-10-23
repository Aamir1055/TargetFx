import { toNumber, fmtMoney, fmtNumber, fmtDate } from '../../utils/settlementReport'

export function StatusBadge({ value }) {
  const text = String(value ?? '—')
  const s = text.toLowerCase()
  const tone = /(pending|open|due|partial)/.test(s) ? 'bg-amber-50 text-amber-700'
    : /(done|paid|settled|complete|closed|ok|success)/.test(s) ? 'bg-emerald-50 text-emerald-700'
    : /(ready)/.test(s) ? 'bg-blue-50 text-blue-700'
    : /(fail|error|reject|cancel)/.test(s) ? 'bg-red-50 text-red-600'
    : 'bg-slate-100 text-slate-500'
  return <span className={`inline-block rounded px-2 py-0.5 text-[10.5px] font-bold uppercase ${tone}`}>{text}</span>
}

// One value, rendered according to its column kind (login | name | status | date | money | number | text).
// `onOpen` turns a login into a button (the report table opens the row's detail dialog with it).
export function Cell({ column, value, onOpen }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-300">—</span>
  switch (column.kind) {
    case 'login':
      return onOpen
        ? <button type="button" onClick={onOpen} className="rounded-sm text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`Open settlement details for ${value}`}>{String(value)}</button>
        : <span>{String(value)}</span>
    case 'status': return <StatusBadge value={value} />
    case 'date': return <span>{fmtDate(value)}</span>
    case 'money': {
      const n = toNumber(value)
      const tone = n === null ? '' : n < 0 ? 'text-red-600' : n > 0 ? 'text-green-600' : 'text-gray-500'
      return <span className={`tabular-nums ${tone}`}>{fmtMoney(value)}</span>
    }
    case 'number': return <span className="tabular-nums">{fmtNumber(value)}</span>
    default:
      if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>
      if (typeof value === 'object') return <span className="text-slate-500">{JSON.stringify(value)}</span>
      return <span>{String(value)}</span>
  }
}
