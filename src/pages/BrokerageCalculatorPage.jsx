import { useState, useEffect, useRef, Fragment } from 'react'
import { Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import BrokerCreditSummary from '../components/BrokerCreditSummary'
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
const mobileIconCls = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
const mobileIconButtonCls = `${mobileIconCls} border-[#E5E7EB] bg-white text-[#374151] hover:bg-blue-50`
const mobileIconPrimaryCls = `${mobileIconCls} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`
const rateInputCls = `${inputCls} h-10 min-w-0 font-medium`
const rateButtonCls = `${buttonCls} inline-flex h-10 items-center justify-center whitespace-nowrap`
const ratePrimaryCls = `${primaryCls} inline-flex h-10 items-center justify-center whitespace-nowrap`
const cellCls = 'whitespace-nowrap px-2 py-2 text-right text-xs tabular-nums sm:px-3 sm:py-2.5 sm:text-sm'
const tdCls = 'px-2 py-1.5 align-middle text-xs sm:px-3 sm:py-2 sm:text-sm'
const compactButtonCls = '!px-2 !py-1 !text-[10px] sm:!px-3 sm:!py-2 sm:!text-xs'
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
  return <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase sm:px-2 sm:py-1 sm:text-xs ${status === 'pending' ? 'bg-amber-50 text-amber-700' : status === 'ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status || '—'}</span>
}

function Flags({ row }) {
  return <>{(row.flags || []).map(flag => <span key={flag} className="ml-1 inline-block rounded bg-red-50 px-1 py-0.5 text-[9px] text-red-700 sm:px-1.5 sm:text-xs" title={flag === 'commission_refund' ? 'MT5 paid commission back on some deals; check before paying.' : flag.replace(/_/g, ' ')}>
    {flag === 'commission_refund' ? 'Commission refund' : flag.replace(/_/g, ' ')}
  </span>)}</>
}

function Amount({ row, field }) {
  const warning = ['our_brokerage_inr', 'balance_inr'].includes(field) && row.flags?.includes('our_brokerage_exceeds_charged')
  return <td className={`${cellCls} ${warning ? 'bg-red-50 text-red-700' : 'text-[#374151]'}`}>{format(row[field])}</td>
}

function Table({ headers, children, label, columnWidths }) {
  return <div className="max-h-[60vh] overflow-auto sm:max-h-[65vh]">
    <table aria-label={label} className={`w-full border-collapse bg-white font-outfit text-sm text-[#374151] [&_tbody]:text-[#374151] [&_tfoot]:text-[#374151] ${columnWidths ? 'min-w-[800px] table-fixed' : ''}`}>
      {columnWidths && <colgroup>{columnWidths.map((width, index) => <col key={headers[index]} style={{ width }} />)}</colgroup>}
      <thead className="sticky top-0 z-10 shadow-[0_1px_0_#E5E7EB]"><tr className="bg-blue-600 text-left">{headers.map(header => <th key={header} className="whitespace-nowrap bg-blue-600 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-white sm:px-3 sm:py-2.5 sm:text-[11px]">{header}</th>)}</tr></thead>
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
      <td className={tdCls}>{login}</td><td className={tdCls}>{name}</td><td className={`${tdCls} whitespace-nowrap`}>{row.exchange}</td>
      <td className={cellCls}>{format(row.lots, 4)}</td><td className={cellCls}>{format(row.turnover)}</td><td className={cellCls}>{format(row.charged)} {row.charged_currency}</td>
      <td className={`${tdCls} whitespace-nowrap`}>{row.method === 'lot' ? 'Per Lot' : row.method === 'crore' ? 'Per Crore' : '—'}</td>
      <td className={cellCls}>{format(row.rate)}</td><td className={tdCls}>{row.rate_currency}</td><td className={tdCls}>{row.rate_source || '—'}</td>
      {['charged_inr', 'our_brokerage_inr', 'balance_inr', 'rebate_inr'].map(field => <Amount key={field} row={row} field={field} />)}
      <td className={tdCls}><StatusBadge status={row.status} /></td><td className={`${tdCls} min-w-[140px] !text-[10px] text-amber-700 sm:min-w-[160px] sm:!text-xs`}>{(row.issues || []).map(issue => ISSUE_LABELS[issue] || issue).join(', ')}<Flags row={row} /></td>
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
      <header className="mx-3 mb-4 mt-3 rounded-xl bg-white px-3 py-3 shadow-sm sm:m-5 sm:p-4">
        <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap">
          <div className="w-full shrink-0 lg:w-auto lg:max-w-64"><div className="flex items-center gap-3">
            <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1F5FB] text-[#4B4B4B] shadow-inner lg:hidden" onClick={() => setMobileSidebarOpen(true)} aria-label="Open navigation">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect y="3.75" width="20" height="2.5" rx="1.25" fill="currentColor"/><rect y="8.75" width="20" height="2.5" rx="1.25" fill="currentColor"/><rect y="13.75" width="20" height="2.5" rx="1.25" fill="currentColor"/></svg>
            </button>
            <h1 className="min-w-0 flex-1 truncate text-left text-base font-semibold text-[#4B4B4B] sm:flex-none sm:text-xl sm:font-bold sm:text-[#1A1A1A]">Brokerage Calculator</h1>
          </div></div>

          {/* Desktop controls */}
        <div aria-label="Calculator controls" className="hidden min-w-0 flex-1 basis-full grid-cols-[repeat(auto-fit,minmax(110px,1fr))] items-center gap-2 sm:grid lg:basis-0">
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
          <div className="ml-auto hidden shrink-0 items-center gap-3 sm:flex">
            <button type="button" className={`${headerPrimaryCls} min-w-[110px] shrink-0`} disabled={busy || !report || !!exporting || search !== query.search} onClick={doExport} title="Export matching records as CSV">
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4" /></svg>
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
        {usd?.source === 'previous_week' && <p className="mt-2 text-xs text-amber-700">From {usd.source_week_name || `week ${usd.source_week_id}`}: confirm or change.</p>}
        {usd?.source === 'none' && <p className="mt-2 text-xs text-amber-700">Missing: USD/USC calculations remain pending.</p>}
      </header>
      <main className="min-w-0 px-3 pb-8 sm:px-5">
        {/* Mobile: controls sit in their own row below the header bar, like the Clients module */}
        <div aria-label="Calculator controls" className="scrollbar-hide mb-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:hidden">
          <select aria-label="Settlement week" title="Settlement week" className="h-9 min-w-[128px] flex-1 truncate rounded-lg border border-[#E5E7EB] bg-white px-2 font-outfit text-[11px] font-medium text-[#374151] outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={query.week_id ?? ''} disabled={savingUsd} onChange={event => { setQuery(current => ({ ...current, week_id: Number(event.target.value), page: 1 })); setPendingIssue('') }}>
            {!weeks.length && <option value="">No weeks available</option>}{weeks.map(week => <option key={week.id} value={week.id}>{week.name || `Week ${week.id}`}</option>)}
          </select>
          <select aria-label="Status" title="Status" className="h-9 w-[72px] shrink-0 rounded-lg border border-[#E5E7EB] bg-white px-1.5 font-outfit text-[11px] font-medium text-[#374151] outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" value={query.status} onChange={event => setQuery(current => ({ ...current, status: event.target.value, page: 1 }))}>
            <option value="all">All</option><option value="ready">Ready</option><option value="pending">Pending</option>
          </select>
          <button type="button" className={mobileIconButtonCls} onClick={refresh} disabled={busy} title="Recalculate" aria-label="Recalculate">
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
          </button>
          <button type="button" className={mobileIconButtonCls} onClick={() => setSettings({ client: false })} title="Exchange Rates" aria-label="Exchange Rates">
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21v-8M9.5 21v-8M14.5 21v-8M19 21v-8"/><path d="M12 3l9 6H3l9-6z"/></svg>
          </button>
          <button type="button" className={mobileIconButtonCls} onClick={() => setSettings({ client: true })} title="Client Rates" aria-label="Client Rates">
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></svg>
          </button>
          <Link className={mobileIconButtonCls} to="/client-percentage" title="Manage LD%" aria-label="Manage LD%">
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>
          </Link>
          <button type="button" className={`${mobileIconButtonCls} ${usd?.source === 'none' ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100' : ''}`} disabled={busy || !report} onClick={openUsd} title={usd?.rate == null ? 'Set USD-INR rate' : `USD-INR: ${format(usd.rate)}`} aria-label="Edit USD-INR rate" aria-haspopup="dialog" aria-expanded={editingUsd}>
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </button>
          <button type="button" className={mobileIconPrimaryCls} disabled={busy || !report || !!exporting || search !== query.search} onClick={doExport} title="Export matching records as CSV" aria-label="Export">
            {exporting ? <svg aria-hidden="true" className="h-[18px] w-[18px] animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> : <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/></svg>}
          </button>
          <BrokerCreditSummary variant="header" className="ml-auto shrink-0" />
        </div>
        {weeksError && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-700">{weeksError} <button type="button" className={buttonCls} onClick={() => setWeeksReload(value => value + 1)}>Retry weeks</button></div>}
        {error && <div role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-red-700">{error} <button type="button" className={buttonCls} onClick={refresh}>Retry report</button></div>}
        {report?.skipped_logins?.length > 0 && <p role="alert" className="mb-3 bg-amber-50 p-3 text-amber-800">Logins outside your client scope were skipped: {report.skipped_logins.join(', ')}.</p>}
        {summary && <div className="scrollbar-hide mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 lg:grid lg:snap-none lg:grid-cols-6 lg:overflow-visible lg:pb-0">
          {[
            ['Charged 100% · INR', format(summary.charged_inr)],
            ['Our brokerage · INR', format(summary.our_brokerage_inr)],
            ['Balance 100% · INR', format(summary.balance_inr)],
            ['Rebate at LD% · INR', format(summary.rebate_inr)],
            ['Average login %', summary.average_login_percent == null ? '—' : `${format(summary.average_login_percent)}%`],
          ].map(([label, value]) => <div key={label} className="w-[168px] shrink-0 snap-start rounded-xl border bg-white p-3 lg:w-auto lg:shrink"><p className="text-[10px] text-[#4B5563] sm:text-xs">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-[#1A1A1A] sm:text-base">{value}</p></div>)}
          <button type="button" onClick={() => { setPendingIssue(''); switchTab('pending') }} className="w-[168px] shrink-0 snap-start rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-amber-800 lg:w-auto lg:shrink"><span className="block text-[10px] sm:text-xs">Pending</span><span className="mt-1 block text-sm font-semibold tabular-nums sm:text-base">{format(summary.pending_logins, 0)} clients · {format(summary.pending_issues, 0)} issues</span></button>
        </div>}
        <div className="overflow-hidden rounded-xl border bg-white">
          <div role="tablist" aria-label="Calculator reports" className="scrollbar-hide flex overflow-x-auto border-b">
            {TABS.map(item => <button key={item.id} id={`calculator-tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls="calculator-panel" type="button" className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold sm:px-4 sm:py-3 sm:text-sm ${tab === item.id ? 'border-b-2 border-blue-600 text-blue-700' : 'text-[#4B5563]'}`} onClick={() => switchTab(item.id)}>{item.label}</button>)}
          </div>
          <div id="calculator-panel" role="tabpanel" aria-labelledby={`calculator-tab-${tab}`} aria-busy={loading}>
            <div aria-label="Table controls" className="flex items-center gap-1.5 border-b border-[#E5E7EB] p-2.5 sm:gap-3 sm:p-4">
              <form className="relative min-w-0 flex-1 sm:max-w-md" role="search" onSubmit={event => { event.preventDefault(); setQuery(current => ({ ...current, search, page: 1 })) }}>
                <input aria-label="Search login or name" placeholder="Search login or name" className="h-9 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] pl-3 pr-10 text-xs text-[#1F2937] placeholder:text-[#9CA3AF] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:h-10 sm:pl-4 sm:pr-12 sm:text-sm" value={search} onChange={event => setSearch(event.target.value)} />
                <button type="submit" aria-label="Search calculator report" className="absolute right-1 top-1/2 flex h-7 w-8 -translate-y-1/2 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 sm:h-8 sm:w-9">
                  <svg aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              </form>
              {tab === 'pending' && report && <select aria-label="Pending issue" title="All matching logins, not just this page" className="h-9 w-[86px] shrink-0 rounded-lg border border-[#E5E7EB] bg-white px-1.5 font-outfit text-[11px] text-[#1F2937] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:h-10 sm:w-36 sm:px-2 sm:text-xs" value={pendingIssue} onChange={event => { setPendingIssue(event.target.value); setPendingPage(1) }}>
                <option value="">All issues</option>{[...new Set(report.pending.map(row => row.issue))].map(issue => <option key={issue} value={issue}>{ISSUE_LABELS[issue] || issue}</option>)}
              </select>}
              <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
                <button type="button" aria-label="Previous page" className={`${buttonCls} !p-1.5 sm:!p-2`} disabled={busy || !report || tablePage <= 1} onClick={() => changeTablePage(tablePage - 1)}>
                  <svg aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <span className="flex items-center gap-1 whitespace-nowrap text-xs text-[#374151] sm:gap-2 sm:text-sm"><span className="min-w-7 rounded-lg border border-[#E5E7EB] px-1.5 py-0.5 text-center font-semibold sm:min-w-8 sm:px-2 sm:py-1">{tablePage}</span><span className="text-[#6B7280]">/ {tablePages}</span></span>
                <button type="button" aria-label="Next page" className={`${buttonCls} !p-1.5 sm:!p-2`} disabled={busy || !report || tablePage >= tablePages} onClick={() => changeTablePage(tablePage + 1)}>
                  <svg aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
            {loading ? <p role="status" className="p-6 text-center text-xs text-slate-500 sm:p-10 sm:text-sm">Calculating brokerage...</p> : !report ? <p className="p-6 text-center text-xs text-slate-500 sm:p-10 sm:text-sm">{error ? 'The report could not be loaded.' : 'Select a settlement week to calculate.'}</p> : <>
              {tab === 'logins' && <Table label="Final Report" headers={['Details', 'Login', 'Client', 'LD%', 'Charged INR', 'Our INR', 'Balance INR', 'Rebate INR', 'Status / flags', 'Actions']}>
                <tbody>{rows.map(row => <Fragment key={row.login}>
                  <tr className="border-b hover:bg-slate-50" onClick={() => toggleRow(row.login)}>
                    <td className={tdCls}><button type="button" aria-label={`Exchange details for ${row.login}`} aria-expanded={expanded.has(row.login)} className={`${buttonCls} !p-1.5 sm:!p-2`} onClick={event => { event.stopPropagation(); toggleRow(row.login) }}>{expanded.has(row.login) ? '−' : '+'}</button></td>
                    <td className={`${tdCls} font-semibold text-[#1A63BC]`}>{row.login}</td><td className={`${tdCls} text-[#1F2937]`}>{row.name || '—'}</td>
                    <td className={cellCls}>{row.ld_percent == null ? '—' : `${format(row.ld_percent)}%`}{row.ld_is_custom && <span className="ml-1 text-[9px] text-blue-600 sm:text-xs">custom</span>}</td>
                    {['charged_inr', 'our_brokerage_inr', 'balance_inr', 'rebate_inr'].map(field => <Amount key={field} row={row} field={field} />)}
                    <td className={tdCls}><StatusBadge status={row.status} /><Flags row={row} /></td>
                    <td className={tdCls}><button type="button" className={`${buttonCls} whitespace-nowrap ${compactButtonCls}`} onClick={event => { event.stopPropagation(); setSettings({ client: true, selection: { login: row.login } }) }}>Client rates</button></td>
                  </tr>
                  {expanded.has(row.login) && <tr><td colSpan={10} className="bg-slate-50 p-2 sm:p-3"><ExchangeDetail entries={(row.exchanges || []).map(exchange => ({ login: row.login, name: row.name, exchange }))} /></td></tr>}
                </Fragment>)}</tbody>
                <tfoot><tr className="bg-blue-50 font-semibold"><td colSpan={4} className="p-2 text-xs sm:p-3 sm:text-sm">TOTAL · all matching logins</td>{['charged_inr', 'our_brokerage_inr', 'balance_inr', 'rebate_inr'].map(field => <Amount key={field} row={summary} field={field} />)}<td colSpan={2} /></tr></tfoot>
              </Table>}
              {tab === 'exchanges' && <ExchangeDetail entries={entries} />}
              {tab === 'pivot' && <Table label="Exchange View" headers={['Login', 'Client', ...report.exchanges, 'Total rebate INR', 'Status']}>
                <tbody>{rows.map(row => <tr key={row.login} className="border-b">
                  <td className={tdCls}>{row.login}</td><td className={tdCls}>{row.name}</td>
                  {report.exchanges.map(exchange => <td key={exchange} className={cellCls}>{format(row.exchanges?.find(item => item.exchange === exchange)?.rebate_inr)}</td>)}
                  <Amount row={row} field="rebate_inr" /><td className={tdCls}><StatusBadge status={row.status} /></td>
                </tr>)}</tbody>
              </Table>}
              {tab === 'pending' && <>
                {report.pending_truncated && <p role="alert" className="mx-2 mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800 sm:mx-3 sm:mb-3 sm:p-3 sm:text-sm">Only the first 1,000 issues are shown. Use Export in the header to download every matching pending issue.</p>}
                <Table label="Pending issues" headers={['Login', 'Client', 'Exchange', 'Issue', 'Detail', 'Action']}>
                  <tbody>{pending.slice((pendingPage - 1) * 250, pendingPage * 250).map((row, index) => <tr key={`${row.login}:${row.exchange}:${row.issue}:${index}`} className="border-b">
                    <td className={tdCls}>{row.login}</td><td className={tdCls}>{row.name}</td><td className={`${tdCls} whitespace-nowrap`}>{row.exchange}</td>
                    <td className={`${tdCls} text-amber-700`}>{ISSUE_LABELS[row.issue] || row.issue}</td><td className={`${tdCls} min-w-[160px] sm:min-w-[200px]`}>{row.detail}</td>
                    <td className={tdCls}>{['method_missing', 'rate_missing', 'usd_inr_missing'].includes(row.issue) ? <button type="button" className={`${buttonCls} ${compactButtonCls}`} onClick={() => fix(row)}>Fix</button> : <span className="text-[10px] text-slate-600 sm:text-xs">Contact support with this login, exchange and detail.</span>}</td>
                  </tr>)}</tbody>
                </Table>
                {!pending.length && <p className="p-6 text-center text-xs text-slate-500 sm:p-8 sm:text-sm">No matching pending issues.</p>}
                <div className="border-t p-2 text-[10px] sm:p-3 sm:text-xs">{pending.length} issues · page {pendingPage} of {pendingPages}</div>
              </>}
              {tab !== 'pending' && !rows.length && <p className="p-6 text-center text-xs text-slate-500 sm:p-8 sm:text-sm">No brokerage data matches this week and filters.</p>}
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
