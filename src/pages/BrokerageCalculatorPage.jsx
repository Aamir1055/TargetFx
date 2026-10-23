import { useState, useEffect, useRef, Fragment } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import BrokerCreditSummary from '../components/BrokerCreditSummary'
import PageSizeSelect from '../components/PageSizeSelect'
import { brokerAPI, brokerageCalcAPI } from '../services/api'
import {
  calculatorNumber, calculatorData, calculatorReport, changedCalculatorRates,
  calculatorUsdRate, calculatorExportView,
} from '../utils/brokerageCalculator'

const format = (value, decimals = 2) => {
  const number = calculatorNumber(value)
  return number == null ? '—' : number.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
const errorMessage = error => error?.response?.data?.message || error.message || 'Request failed. Please retry.'
const inputCls = 'w-full rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2 font-outfit text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const buttonBaseCls = 'rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50'
const buttonCls = `${buttonBaseCls} border-[#E5E7EB] bg-white text-[#374151] hover:bg-blue-50`
const primaryCls = `${buttonBaseCls} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`
const headerControlCls = 'flex h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 font-outfit text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
const headerButtonCls = `${headerControlCls} border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50`
const headerPrimaryCls = `${headerControlCls} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`
const rateInputCls = `${inputCls} h-10 min-w-0 font-medium`
const rateButtonCls = `${buttonCls} inline-flex h-10 items-center justify-center whitespace-nowrap`
const ratePrimaryCls = `${primaryCls} inline-flex h-10 items-center justify-center whitespace-nowrap`
const cellCls = 'whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums'
const TABS = [
  { id: 'logins', label: 'Final Report' },
  { id: 'exchanges', label: 'Exchange Detail' },
  { id: 'pivot', label: 'Exchange View' },
  { id: 'pending', label: 'Pending' },
]
const ISSUE_LABELS = {
  method_missing: 'Method missing',
  rate_missing: 'Rate missing',
  usd_inr_missing: 'USD-INR missing',
  account_currency_unsupported: 'Unsupported account currency',
}

function StatusBadge({ status }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${status === 'pending' ? 'bg-amber-50 text-amber-700' : status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status || '—'}</span>
}

function Flags({ row }) {
  return <>{(row.flags || []).map(flag => <span key={flag} className="ml-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700" title={flag === 'commission_refund' ? 'MT5 paid commission back on some deals; check before paying.' : flag.replace(/_/g, ' ')}>
    {flag === 'commission_refund' ? 'Commission refund' : flag.replace(/_/g, ' ')}
  </span>)}</>
}

function Amount({ row, field }) {
  const warning = ['our_brokerage_inr', 'balance_inr'].includes(field) && row.flags?.includes('our_brokerage_exceeds_charged')
  return <td className={`${cellCls} ${warning ? 'bg-red-50 text-red-700' : 'text-[#374151]'}`}>{format(row[field])}</td>
}

function Table({ headers, children, label, columnWidths }) {
  return <div className="overflow-x-auto">
    <table aria-label={label} className={`w-full border-collapse bg-white font-outfit text-sm text-[#374151] [&_tbody]:text-[#374151] [&_tfoot]:text-[#374151] ${columnWidths ? 'min-w-[800px] table-fixed' : ''}`}>
      {columnWidths && <colgroup>{columnWidths.map((width, index) => <col key={headers[index]} style={{ width }} />)}</colgroup>}
      <thead><tr className="bg-blue-600 text-left">{headers.map(header => <th key={header} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white">{header}</th>)}</tr></thead>
      {children}
    </table>
  </div>
}

function RateSettings({ client = false, selection = {}, onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [original, setOriginal] = useState([])
  const [exchanges, setExchanges] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const [loginFilter, setLoginFilter] = useState(String(selection.login || ''))
  const [exchangeFilter, setExchangeFilter] = useState(selection.exchange || '')
  const [filters, setFilters] = useState(selection)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = event => { if (event.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey) }
  }, [onClose, saving])

  useEffect(() => {
    let active = true
    setRows(null); setError('')
    const load = async () => {
      try {
        const [exchangeResponse, clientResponse] = await Promise.all([
          brokerageCalcAPI.getExchanges(),
          client ? brokerageCalcAPI.getClientRates(filters) : Promise.resolve(null),
        ])
        const exchangeRows = calculatorData(exchangeResponse).exchanges
        const saved = client ? calculatorData(clientResponse).client_rates : exchangeRows
        if (!Array.isArray(exchangeRows) || !Array.isArray(saved)) throw new Error('Invalid rate settings response. Please retry.')
        const editable = saved.map(row => ({ ...row, method: row.method ?? '', rate: row.rate ?? '' }))
        if (client && filters.login && filters.exchange && !editable.some(row => String(row.login) === String(filters.login) && row.exchange === filters.exchange)) {
          editable.push({ login: filters.login, exchange: filters.exchange, method: '', rate: '' })
        }
        if (active) { setExchanges(exchangeRows); setOriginal(saved); setRows(editable) }
      } catch (failure) { if (active) setError(errorMessage(failure)) }
    }
    load()
    return () => { active = false }
  }, [client, filters, reload])

  const update = (index, key, value) => setRows(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
  const resetRow = index => setRows(current => current.map((row, i) => i === index ? { ...row, method: '', rate: '', ...(!client ? { currency: 'INR' } : {}) } : row))
  const save = async () => {
    setError('')
    try {
      const changes = changedCalculatorRates(rows, original, client)
      if (!changes.length) { onClose(); return }
      setSaving(true)
      calculatorData(await (client ? brokerageCalcAPI.setClientRates(changes) : brokerageCalcAPI.setExchanges(changes)))
      onSaved(client ? 'Client rates saved' : 'Exchange rates saved')
      onClose()
    } catch (failure) { setError(errorMessage(failure)) } finally { setSaving(false) }
  }
  const applyFilters = () => {
    try {
      if (rows && changedCalculatorRates(rows, original, true).length) throw new Error('Save your changes before changing the rate filters.')
      if (loginFilter && (!Number.isSafeInteger(Number(loginFilter)) || Number(loginFilter) <= 0)) throw new Error('Enter a valid client login to filter.')
      setFilters({ ...(loginFilter ? { login: Number(loginFilter) } : {}), ...(exchangeFilter ? { exchange: exchangeFilter } : {}) })
    } catch (failure) { setError(errorMessage(failure)) }
  }

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-3">
    <section role="dialog" aria-modal="true" aria-labelledby="rate-settings-title" className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white font-outfit text-sm text-[#374151] shadow-xl [color-scheme:light]">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E5E7EB] p-4 sm:px-6 sm:py-5">
        <div><h2 id="rate-settings-title" className="text-lg font-semibold text-[#1A1A1A]">{client ? 'Client Rates' : 'Exchange Rates'}</h2>
          <p className="mt-1 text-xs text-slate-600">{client ? 'Leave blank to use broker defaults.' : 'Set rates by exchange. Zero is valid.'}</p>
        </div>
        <button type="button" disabled={saving} onClick={onClose} className={`${rateButtonCls} w-10 shrink-0 !p-0`} aria-label="Close rate settings" title="Close">
          <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <div className="min-h-0 overflow-auto p-4 sm:p-6">
        {client && <div className="mb-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
          <label className="grid min-w-0 gap-1.5 text-xs font-medium text-[#4B5563]">Login filter<input aria-label="Login filter" className={rateInputCls} value={loginFilter} onChange={event => setLoginFilter(event.target.value)} /></label>
          <label className="grid min-w-0 gap-1.5 text-xs font-medium text-[#4B5563]">Exchange filter<select aria-label="Exchange filter" className={rateInputCls} value={exchangeFilter} onChange={event => setExchangeFilter(event.target.value)}>
            <option value="">All exchanges</option>{exchanges.map(row => <option key={row.exchange}>{row.exchange}</option>)}
          </select></label>
          <button type="button" className={rateButtonCls} disabled={saving || !rows} onClick={applyFilters}>Apply filters</button>
        </div>}
        {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-sm text-red-700">{error} {!rows && <button type="button" className={buttonCls} onClick={() => setReload(value => value + 1)}>Retry</button>}</p>}
        {!rows ? !error && <p role="status">Loading rates...</p> : <>
          <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
          <Table label={client ? 'Client rate settings' : 'Exchange rate settings'} columnWidths={client ? ['14%', '17%', '22%', '14%', '11%', '22%'] : ['20%', '20%', '14%', '12%', '16%', '18%']} headers={[...(client ? ['Login'] : []), 'Exchange', 'Method', 'Rate', 'Currency', ...(client ? [] : ['Status']), 'Actions']}>
            <tbody>{rows.map((row, index) => {
              const persisted = original.some(item => item.exchange === row.exchange && (!client || String(item.login) === String(row.login)))
              const currency = client ? exchanges.find(item => item.exchange === row.exchange)?.currency : row.currency
              return <tr key={index} className={`border-b border-[#E5E7EB] last:border-b-0 ${selection.exchange === row.exchange ? 'bg-blue-50' : ''}`}>
                {client && <td className="px-3 py-3"><input aria-label={`Login ${index + 1}`} readOnly={persisted} disabled={saving} inputMode="numeric" className={`${rateInputCls} tabular-nums read-only:bg-[#F9FAFB]`} value={row.login} onChange={event => update(index, 'login', event.target.value)} /></td>}
                <td className="px-3 py-3">{client && !persisted ? <select aria-label={`Exchange ${index + 1}`} disabled={saving} className={rateInputCls} value={row.exchange} onChange={event => update(index, 'exchange', event.target.value)}>
                  <option value="">Choose exchange</option>{exchanges.map(item => <option key={item.exchange}>{item.exchange}</option>)}
                </select> : row.exchange}</td>
                <td className="px-3 py-3"><select aria-label={`Method ${index + 1}`} disabled={saving} className={rateInputCls} value={row.method} onChange={event => update(index, 'method', event.target.value)}>
                  <option value="">{client ? 'Use broker value' : 'Not set'}</option><option value="lot">Per Lot</option><option value="crore">Per Crore</option>
                </select></td>
                <td className="px-3 py-3"><input aria-label={`Rate ${index + 1}`} disabled={saving} inputMode="decimal" className={`${rateInputCls} tabular-nums`} placeholder={client ? 'Inherit' : 'Not set'} value={row.rate} onChange={event => update(index, 'rate', event.target.value)} /></td>
                <td className="px-3 py-3">{client ? <span className="inline-flex h-10 items-center font-medium">{currency || '—'}</span> : <select aria-label={`Currency ${index + 1}`} disabled={saving} className={rateInputCls} value={row.currency} onChange={event => update(index, 'currency', event.target.value)}><option>INR</option><option>USD</option></select>}</td>
                {!client && <td className="whitespace-nowrap px-3 py-3 text-xs">{row.configured ? 'Set (saved)' : 'Not set (saved)'}</td>}
                <td className="px-3 py-3"><button type="button" disabled={saving} className={`${rateButtonCls} w-full`} onClick={() => client && !persisted ? setRows(current => current.filter((_, i) => i !== index)) : resetRow(index)}>{client ? persisted ? 'Use broker defaults' : 'Remove' : 'Clear setting'}</button></td>
              </tr>
            })}</tbody>
          </Table>
          </div>
          {!rows.length && <p className="py-4 text-sm text-slate-500">No {client ? 'client overrides' : 'exchanges'} found.</p>}
        </>}
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[#E5E7EB] bg-[#F9FAFB] p-4 sm:px-6">
        {client && <button type="button" disabled={saving || !rows} className={`${rateButtonCls} min-w-28`} onClick={() => setRows(current => [...current, { login: filters.login || '', exchange: filters.exchange || '', method: '', rate: '' }])}>Add override</button>}
        <div className="ml-auto flex gap-3">
          <button type="button" className={`${rateButtonCls} min-w-28`} disabled={saving} onClick={onClose}>Cancel</button>
          <button type="button" className={`${ratePrimaryCls} min-w-28`} disabled={saving || !rows} onClick={save}>{saving ? 'Saving...' : 'Save rates'}</button>
        </div>
      </footer>
    </section>
  </div>
}

function ExchangeDetail({ entries }) {
  return <Table label="Exchange Detail" headers={['Login', 'Client', 'Exchange', 'Lots', 'Turnover', 'Charged (source)', 'Method', 'Rate', 'Rate currency', 'Rate source', 'Charged INR', 'Our INR', 'Balance INR', 'Rebate INR', 'Status', 'Issues / flags']}>
    <tbody>{entries.map(({ login, name, exchange: row }, index) => <tr key={`${login}:${row.exchange}:${index}`} className="border-b">
      <td className="px-3 py-2">{login}</td><td className="px-3 py-2">{name}</td><td className="whitespace-nowrap px-3 py-2">{row.exchange}</td>
      <td className={cellCls}>{format(row.lots, 4)}</td><td className={cellCls}>{format(row.turnover)}</td><td className={cellCls}>{format(row.charged)} {row.charged_currency}</td>
      <td className="whitespace-nowrap px-3 py-2">{row.method === 'lot' ? 'Per Lot' : row.method === 'crore' ? 'Per Crore' : '—'}</td>
      <td className={cellCls}>{format(row.rate)}</td><td className="px-3 py-2">{row.rate_currency}</td><td className="px-3 py-2">{row.rate_source || '—'}</td>
      {['charged_inr', 'our_brokerage_inr', 'balance_inr', 'rebate_inr'].map(field => <Amount key={field} row={row} field={field} />)}
      <td className="px-3 py-2"><StatusBadge status={row.status} /></td><td className="min-w-[160px] px-3 py-2 text-xs text-amber-700">{(row.issues || []).map(issue => ISSUE_LABELS[issue] || issue).join(', ')}<Flags row={row} /></td>
    </tr>)}</tbody>
  </Table>
}

export default function BrokerageCalculatorPage() {
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebarOpen') !== 'false')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [weeks, setWeeks] = useState([])
  const [weeksError, setWeeksError] = useState('')
  const [weeksReload, setWeeksReload] = useState(0)
  const [query, setQuery] = useState({ week_id: null, search: '', status: 'all', page: 1, limit: 100 })
  const [search, setSearch] = useState('')
  const [report, setReport] = useState(null)
  const [usd, setUsd] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState('logins')
  const [expanded, setExpanded] = useState(() => new Set())
  const [settings, setSettings] = useState(null)
  const [usdDraft, setUsdDraft] = useState('')
  const [usdError, setUsdError] = useState('')
  const [editingUsd, setEditingUsd] = useState(false)
  const [savingUsd, setSavingUsd] = useState(false)
  const [exporting, setExporting] = useState('')
  const [toast, setToast] = useState('')
  const [pendingIssue, setPendingIssue] = useState('')
  const [pendingPage, setPendingPage] = useState(1)
  const usdInput = useRef(null)
  const refresh = () => setReload(value => value + 1)

  useEffect(() => {
    let active = true
    setWeeksError('')
    brokerAPI.getSettlementWeeks({ page: 1, limit: 100 }).then(response => {
      const list = response?.data?.weeks ?? response?.weeks
      if (!Array.isArray(list)) throw new Error('Invalid settlement weeks response.')
      if (active) {
        setWeeks(list)
        setQuery(current => ({ ...current, week_id: current.week_id ?? list[0]?.id ?? null }))
      }
    }).catch(failure => { if (active) setWeeksError(errorMessage(failure)) })
    return () => { active = false }
  }, [weeksReload])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(current => current.search === search ? current : { ...current, search, page: 1 }), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (query.week_id == null) return
    const controller = new AbortController()
    setLoading(true); setError(''); setReport(null); setUsd(null); setExpanded(new Set()); setEditingUsd(false); setPendingPage(1)
    Promise.all([
      brokerageCalcAPI.calculate(query, { signal: controller.signal }),
      brokerageCalcAPI.getUsdInr(query.week_id, { signal: controller.signal }),
    ]).then(([response, usdResponse]) => {
      const data = calculatorReport(response)
      const weeklyUsd = calculatorData(usdResponse)
      if (!controller.signal.aborted) {
        setReport(data)
        setUsd(weeklyUsd)
        setUsdDraft(weeklyUsd.rate == null ? '' : String(weeklyUsd.rate))
      }
    }).catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [query, reload])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!editingUsd) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    usdInput.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [editingUsd])

  const saveUsd = async () => {
    setUsdError('')
    try {
      const rate = calculatorUsdRate(usdDraft)
      setSavingUsd(true)
      calculatorData(await brokerageCalcAPI.setUsdInr(query.week_id, rate))
      setEditingUsd(false); setToast(rate == null ? 'Weekly rate removed; the previous week may now apply.' : 'Weekly USD-INR saved'); refresh()
    } catch (failure) { setUsdError(errorMessage(failure)) } finally { setSavingUsd(false) }
  }

  const doExport = async () => {
    const view = calculatorExportView(tab)
    setExporting('csv'); setError('')
    try {
      await brokerageCalcAPI.exportFile({ ...query, format: 'csv', view }, `brokerage_${query.week_id}_${view}.csv`)
      setToast('All matching records downloaded')
    } catch (failure) { setError(errorMessage(failure)) } finally { setExporting('') }
  }

  const openUsd = () => { setUsdDraft(usd?.rate == null ? '' : String(usd.rate)); setUsdError(''); setEditingUsd(true) }
  const fix = row => {
    if (row.issue === 'usd_inr_missing') { openUsd(); return }
    setSettings({ client: true, selection: { login: row.login, exchange: row.exchange } })
  }
  const toggleRow = login => setExpanded(current => {
    const next = new Set(current)
    if (next.has(login)) next.delete(login); else next.add(login)
    return next
  })
  const toggleSidebar = () => setSidebarOpen(current => {
    localStorage.setItem('sidebarOpen', String(!current))
    return !current
  })
  const rows = report?.logins || []
  const summary = report?.summary
  const pages = report?.pagination.total_pages || 1
  const pending = (report?.pending || []).filter(row => !pendingIssue || row.issue === pendingIssue)
  const pendingPages = Math.max(1, Math.ceil(pending.length / 250))
  const entries = rows.flatMap(row => (row.exchanges || []).map(exchange => ({ login: row.login, name: row.name, exchange })))
  const busy = loading || savingUsd || query.week_id == null
  const switchTab = value => { setTab(value); setPendingPage(1) }
  const tablePage = tab === 'pending' ? pendingPage : query.page
  const tablePages = tab === 'pending' ? pendingPages : pages
  const changeTablePage = value => {
    if (tab === 'pending') setPendingPage(value)
    else setQuery(current => ({ ...current, page: value }))
  }

  return <div className="flex h-[100dvh] overflow-hidden bg-[#F8FAFC] font-outfit text-sm text-[#374151] [color-scheme:light]">
    <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onToggle={toggleSidebar} desktopOnly />
    <Sidebar isOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} mobileOnly />
    <div className={`flex min-w-0 flex-1 flex-col overflow-y-auto ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}>
      <header className="m-3 rounded-xl bg-white p-4 shadow-sm sm:m-5">
        <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
          <div className="w-full shrink-0 lg:w-auto lg:max-w-64"><div className="flex items-center gap-2">
            <button type="button" className={`${buttonCls} lg:hidden`} onClick={() => setMobileSidebarOpen(true)} aria-label="Open navigation">Menu</button>
            <h1 className="text-xl font-bold text-[#1A1A1A]">Brokerage Calculator</h1>
          </div></div>
        <div aria-label="Calculator controls" className="grid min-w-0 flex-1 basis-full grid-cols-[repeat(auto-fit,minmax(110px,1fr))] items-center gap-2 lg:basis-0">
          <select aria-label="Settlement week" title="Settlement week" className={`${headerButtonCls} w-full truncate`} value={query.week_id ?? ''} disabled={savingUsd} onChange={event => { setQuery(current => ({ ...current, week_id: Number(event.target.value), page: 1 })); setPendingIssue('') }}>
            {!weeks.length && <option value="">No weeks available</option>}{weeks.map(week => <option key={week.id} value={week.id}>{week.name || `Week ${week.id}`}</option>)}
          </select>
          <select aria-label="Status" title="Status" className={`${headerButtonCls} w-full`} value={query.status} onChange={event => setQuery(current => ({ ...current, status: event.target.value, page: 1 }))}>
            <option value="all">All</option><option value="ready">Ready</option><option value="pending">Pending</option>
          </select>
          <button type="button" className={headerButtonCls} onClick={refresh} disabled={busy}>Recalculate</button>
          <button type="button" className={headerButtonCls} onClick={() => setSettings({ client: false })}>Exchange Rates</button>
          <button type="button" className={headerButtonCls} onClick={() => setSettings({ client: true })}>Client Rates</button>
          <Link className={headerButtonCls} to="/client-percentage">Manage LD%</Link>
          <button type="button" className={`${headerControlCls} ${usd?.source === 'none' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50'}`} disabled={busy || !report} onClick={openUsd} aria-label="Edit USD-INR rate" aria-haspopup="dialog" aria-expanded={editingUsd} title="Edit USD-INR rate">
            <span>USD-INR</span><span className="tabular-nums">{usd?.rate == null ? 'Set rate' : format(usd.rate)}</span>
          </button>
        </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <BrokerCreditSummary variant="header" />
            <button type="button" className={`${headerPrimaryCls} min-w-[110px] shrink-0`} disabled={busy || !report || !!exporting || search !== query.search} onClick={doExport} title="Export matching records as CSV">
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4" /></svg>
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
        {usd?.source === 'previous_week' && <p className="mt-2 text-xs text-amber-700">From {usd.source_week_name || `week ${usd.source_week_id}`}: confirm or change.</p>}
        {usd?.source === 'none' && <p className="mt-2 text-xs text-amber-700">Missing: USD/USC calculations remain pending.</p>}
        {tab === 'pivot' && <p className="mt-2 text-xs text-slate-500">Exchange View exports use Exchange Detail: the API does not offer a pivot export.</p>}
        {tab === 'pending' && pendingIssue && <p className="mt-2 text-xs text-slate-500">Export includes all matching pending issue types, not just the local issue filter.</p>}
      </header>
      <main className="min-w-0 px-3 pb-8 sm:px-5">
        {weeksError && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-700">{weeksError} <button type="button" className={buttonCls} onClick={() => setWeeksReload(value => value + 1)}>Retry weeks</button></div>}
        {error && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" className={buttonCls} onClick={refresh}>Retry report</button></div>}
        {report?.skipped_logins?.length > 0 && <p role="alert" className="mb-3 bg-amber-50 p-3 text-amber-800">Logins outside your client scope were skipped: {report.skipped_logins.join(', ')}.</p>}
        {summary && <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-6">
          {[
            ['Charged 100% · INR', format(summary.charged_inr)],
            ['Our brokerage · INR', format(summary.our_brokerage_inr)],
            ['Balance 100% · INR', format(summary.balance_inr)],
            ['Rebate at LD% · INR', format(summary.rebate_inr)],
            ['Average login %', summary.average_login_percent == null ? '—' : `${format(summary.average_login_percent)}%`],
          ].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-3"><p className="text-xs text-[#4B5563]">{label}</p><p className="mt-1 text-base font-semibold tabular-nums text-[#1A1A1A]">{value}</p></div>)}
          <button type="button" onClick={() => { setPendingIssue(''); switchTab('pending') }} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-amber-800"><span className="block text-xs">Pending</span><span className="mt-1 block text-base font-semibold tabular-nums">{format(summary.pending_logins, 0)} clients · {format(summary.pending_issues, 0)} issues</span></button>
        </div>}
        <p className="mb-3 text-xs text-slate-600">Charged − Our brokerage = Balance (100%); Balance × LD% / 100 = Rebate. Pending rows are excluded from totals. Verify all amounts before settlement or payment.</p>
        <div className="overflow-hidden rounded-xl border bg-white">
          <div role="tablist" aria-label="Calculator reports" className="flex overflow-x-auto border-b">
            {TABS.map(item => <button key={item.id} id={`calculator-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls="calculator-panel" type="button" className={`whitespace-nowrap px-4 py-3 text-sm font-semibold ${tab === item.id ? 'border-b-2 border-blue-600 text-blue-700' : 'text-[#4B5563]'}`} onClick={() => switchTab(item.id)}>{item.label}</button>)}
          </div>
          <div id="calculator-panel" role="tabpanel" aria-labelledby={`calculator-tab-${tab}`} aria-busy={loading}>
            <div aria-label="Table controls" className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] p-4">
              <form className="relative min-w-[180px] flex-1 sm:max-w-md" role="search" onSubmit={event => { event.preventDefault(); setQuery(current => ({ ...current, search, page: 1 })) }}>
                <input aria-label="Search login or name" placeholder="Search login or name" className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] pl-4 pr-12 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500" value={search} onChange={event => setSearch(event.target.value)} />
                <button type="submit" aria-label="Search calculator report" className="absolute right-1 top-1/2 flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700">
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              </form>
              <div className="ml-auto flex items-center gap-3">
                {tab !== 'pending' && <PageSizeSelect value={query.limit} onChange={limit => setQuery(current => ({ ...current, limit, page: 1 }))} options={[25, 50, 100]} />}
                <button type="button" aria-label="Previous page" className={`${buttonCls} !p-2`} disabled={busy || !report || tablePage <= 1} onClick={() => changeTablePage(tablePage - 1)}>
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <span className="flex items-center gap-2 text-sm text-[#374151]"><span className="min-w-8 rounded-lg border border-[#E5E7EB] px-2 py-1 text-center font-semibold">{tablePage}</span><span className="text-[#6B7280]">/ {tablePages}</span></span>
                <button type="button" aria-label="Next page" className={`${buttonCls} !p-2`} disabled={busy || !report || tablePage >= tablePages} onClick={() => changeTablePage(tablePage + 1)}>
                  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
            {loading ? <p role="status" className="p-10 text-center text-slate-500">Calculating brokerage...</p> : !report ? <p className="p-10 text-center text-slate-500">{error ? 'The report could not be loaded.' : 'Select a settlement week to calculate.'}</p> : <>
              {tab === 'logins' && <Table label="Final Report" headers={['Details', 'Login', 'Client', 'LD%', 'Charged INR', 'Our INR', 'Balance INR', 'Rebate INR', 'Status / flags', 'Actions']}>
                <tbody>{rows.map(row => <Fragment key={row.login}>
                  <tr className="border-b hover:bg-slate-50" onClick={() => toggleRow(row.login)}>
                    <td className="px-3 py-2"><button type="button" aria-label={`Exchange details for ${row.login}`} aria-expanded={expanded.has(row.login)} className={buttonCls} onClick={event => { event.stopPropagation(); toggleRow(row.login) }}>{expanded.has(row.login) ? '−' : '+'}</button></td>
                    <td className="px-3 py-2 font-semibold text-[#1A63BC]">{row.login}</td><td className="px-3 py-2 text-[#1F2937]">{row.name || '—'}</td>
                    <td className={cellCls}>{row.ld_percent == null ? '—' : `${format(row.ld_percent)}%`}{row.ld_is_custom && <span className="ml-1 text-xs text-blue-600">custom</span>}</td>
                    {['charged_inr', 'our_brokerage_inr', 'balance_inr', 'rebate_inr'].map(field => <Amount key={field} row={row} field={field} />)}
                    <td className="px-3 py-2"><StatusBadge status={row.status} /><Flags row={row} /></td>
                    <td className="px-3 py-2"><button type="button" className={`${buttonCls} whitespace-nowrap`} onClick={event => { event.stopPropagation(); setSettings({ client: true, selection: { login: row.login } }) }}>Client rates</button></td>
                  </tr>
                  {expanded.has(row.login) && <tr><td colSpan={10} className="bg-slate-50 p-3"><ExchangeDetail entries={(row.exchanges || []).map(exchange => ({ login: row.login, name: row.name, exchange }))} /></td></tr>}
                </Fragment>)}</tbody>
                <tfoot><tr className="bg-blue-50 font-semibold"><td colSpan={4} className="p-3">TOTAL · all matching logins</td>{['charged_inr', 'our_brokerage_inr', 'balance_inr', 'rebate_inr'].map(field => <Amount key={field} row={summary} field={field} />)}<td colSpan={2} /></tr></tfoot>
              </Table>}
              {tab === 'exchanges' && <ExchangeDetail entries={entries} />}
              {tab === 'pivot' && <Table label="Exchange View" headers={['Login', 'Client', ...report.exchanges, 'Total rebate INR', 'Status']}>
                <tbody>{rows.map(row => <tr key={row.login} className="border-b">
                  <td className="px-3 py-2">{row.login}</td><td className="px-3 py-2">{row.name}</td>
                  {report.exchanges.map(exchange => <td key={exchange} className={cellCls}>{format(row.exchanges?.find(item => item.exchange === exchange)?.rebate_inr)}</td>)}
                  <Amount row={row} field="rebate_inr" /><td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                </tr>)}</tbody>
              </Table>}
              {tab === 'pending' && <>
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <label className="text-xs">Issue<select aria-label="Pending issue" className={inputCls} value={pendingIssue} onChange={event => { setPendingIssue(event.target.value); setPendingPage(1) }}>
                    <option value="">All issues</option>{[...new Set(report.pending.map(row => row.issue))].map(issue => <option key={issue} value={issue}>{ISSUE_LABELS[issue] || issue}</option>)}
                  </select></label>
                  <span className="text-xs text-slate-500">All matching logins, not just the report page.</span>
                </div>
                {report.pending_truncated && <p role="alert" className="mx-3 mb-3 rounded bg-amber-50 p-3 text-sm text-amber-800">Only the first 1,000 issues are shown. Use Export in the header to download every matching pending issue.</p>}
                <Table label="Pending issues" headers={['Login', 'Client', 'Exchange', 'Issue', 'Detail', 'Action']}>
                  <tbody>{pending.slice((pendingPage - 1) * 250, pendingPage * 250).map((row, index) => <tr key={`${row.login}:${row.exchange}:${row.issue}:${index}`} className="border-b">
                    <td className="p-3">{row.login}</td><td className="p-3">{row.name}</td><td className="whitespace-nowrap p-3">{row.exchange}</td>
                    <td className="p-3 text-amber-700">{ISSUE_LABELS[row.issue] || row.issue}</td><td className="min-w-[200px] p-3">{row.detail}</td>
                    <td className="p-3">{['method_missing', 'rate_missing', 'usd_inr_missing'].includes(row.issue) ? <button type="button" className={buttonCls} onClick={() => fix(row)}>Fix</button> : <span className="text-xs text-slate-600">Contact support with this login, exchange and detail.</span>}</td>
                  </tr>)}</tbody>
                </Table>
                {!pending.length && <p className="p-8 text-center text-slate-500">No matching pending issues.</p>}
                <div className="border-t p-3 text-xs">{pending.length} issues · page {pendingPage} of {pendingPages}</div>
              </>}
              {tab !== 'pending' && !rows.length && <p className="p-8 text-center text-slate-500">No brokerage data matches this week and filters.</p>}
            </>}
          </div>
        </div>
      </main>
    </div>
    {settings && <RateSettings {...settings} onClose={() => setSettings(null)} onSaved={message => { setToast(message); refresh() }} />}
    {editingUsd && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-3">
      <form role="dialog" aria-modal="true" aria-labelledby="usd-rate-title" aria-describedby="usd-rate-help" className="w-full max-w-sm overflow-hidden rounded-xl bg-white font-outfit text-sm text-[#374151] shadow-xl"
        onSubmit={event => { event.preventDefault(); if (!busy) saveUsd() }}
        onKeyDown={event => {
          if (event.key === 'Escape' && !savingUsd) { event.preventDefault(); setEditingUsd(false) }
          if (event.key === 'Tab') {
            const controls = Array.from(event.currentTarget.querySelectorAll('input:not(:disabled), button:not(:disabled)'))
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
          }
        }}>
        <div className="border-b border-[#E5E7EB] px-6 py-4">
          <h2 id="usd-rate-title" className="text-lg font-semibold text-[#1A1A1A]">Edit USD-INR rate</h2>
          <p className="mt-1 text-xs text-[#6B7280]">{weeks.find(week => week.id === query.week_id)?.name || `Week ${query.week_id}`}</p>
        </div>
        <div className="space-y-3 p-6">
          <label className="grid gap-1.5 text-xs font-medium">1 USD in INR
            <input ref={usdInput} aria-label="USD-INR rate" aria-invalid={!!usdError} aria-describedby={usdError ? 'usd-rate-help usd-rate-error' : 'usd-rate-help'} className={`${rateInputCls} tabular-nums`} value={usdDraft} disabled={savingUsd} inputMode="decimal" onChange={event => setUsdDraft(event.target.value)} />
          </label>
          <p id="usd-rate-help" className="text-xs text-[#6B7280]">Enter a positive rate. Leave blank to remove this week's saved rate; a previous week's rate may then apply.</p>
          {usdError && <p id="usd-rate-error" role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{usdError}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-[#E5E7EB] bg-[#F9FAFB] px-6 py-4">
          <button type="button" className={`${rateButtonCls} min-w-28`} disabled={savingUsd} onClick={() => setEditingUsd(false)}>Cancel</button>
          <button type="submit" className={`${ratePrimaryCls} min-w-28`} disabled={busy}>{savingUsd ? 'Saving...' : 'Save USD-INR'}</button>
        </div>
      </form>
    </div>}
    {toast && <div role="status" className="pointer-events-none fixed inset-x-3 bottom-5 z-[100] mx-auto w-fit rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{toast}</div>}
  </div>
}
