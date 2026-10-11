import { useCallback, useEffect, useRef, useState } from 'react'
import { applyReportGroupFilter } from '../utils/reportGroupFilter'
import useSearchAsYouType from '../hooks/useSearchAsYouType'
import { createPortal } from 'react-dom'
import ColumnChooserList from '../components/ColumnChooserList'
import Sidebar from '../components/Sidebar'
import QuickTimeFilter from '../components/QuickTimeFilter'
import PageSizeSelect from '../components/PageSizeSelect'
import DateInputDMY from '../components/DateInputDMY'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import ClientPositionsModal from '../components/ClientPositionsModal'
import ClientDetailsMobileModal from '../components/ClientDetailsMobileModal'
import { useGroups } from '../contexts/groupContextStore'
import { getPresetRange } from '../utils/dealTimePresets'
import { useAuth } from '../contexts/authContextStore'
import { brokerAPI } from '../services/api'
import { serverNowDate, serverEpochFromParts, formatTime } from '../utils/dateFormatter'
import { buildCreditRequest, parseCreditReport } from '../utils/creditReport'

const EMPTY_CLIENT_CACHE = []
const ignoreCacheUpdate = () => {}

const today = () => {
  const date = serverNowDate()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const epoch = (value, end = false) => {
  if (!value) return NaN
  const [year, month, day] = value.split('-').map(Number)
  return serverEpochFromParts(year, month - 1, day, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0)
}
const initialFilters = () => ({ from: today(), to: today(), search: '', logins: '', amount: '', amountOperator: 'greater_than', sortOrder: 'desc', sortBy: 'time' })
const requestFilters = filters => ({ ...filters, from: epoch(filters.from), to: epoch(filters.to, true) })
const field = (row, key) => row[key] ?? row[key[0].toUpperCase() + key.slice(1)]
const columns = [ ['time', 'Time'], ['login', 'Login'], ['name', 'Name'], ['deal', 'Deal'], ['amount', 'Amount'], ['comment', 'Comment'] ]
const display = (row, key) => {
  const value = field(row, key)
  if (value == null || value === '') return '—'
  if (key === 'time') return formatTime(value, '—')
  if (key === 'amount') return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(value)
  return String(value)
}
const inputClass = 'mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function CreditReportPage() {
  const { isAuthenticated } = useAuth()
  const [selectedClient, setSelectedClient] = useState(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (window.innerWidth < 1024) return false
    try { return JSON.parse(localStorage.getItem('sidebarOpen') ?? 'true') } catch { return true }
  })
  const { groups, getActiveGroupFilter } = useGroups()
  const groupName = getActiveGroupFilter('credit-report')
  const groupKey = JSON.stringify(groupName ? groups.find(group => group.name === groupName) ?? { loginIds: [] } : null)
  const previousGroup = useRef(groupKey)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [preset, setPreset] = useState('today')
  const [panel, setPanel] = useState(null)
  const [datePosition, setDatePosition] = useState(null)
  const panelRef = useRef(null)
  const [visibleKeys, setVisibleKeys] = useState(columns.map(([key]) => key))
  const [columnOrder, setColumnOrder] = useState(columns.map(([key]) => key))
  const [pinnedColumns, setPinnedColumns] = useState([])
  const [columnPickerPosition, setColumnPickerPosition] = useState(null)
  const columnButtonRef = useRef(null)
  const columnPickerRef = useRef(null)
  useEffect(() => {
    if (!columnPickerPosition) return
    const close = event => {
      if (!columnPickerRef.current?.contains(event.target) && !columnButtonRef.current?.contains(event.target)) setColumnPickerPosition(null)
    }
    const key = event => { if (event.key === 'Escape') { setColumnPickerPosition(null); columnButtonRef.current?.focus() } }
    const resize = () => setColumnPickerPosition(null)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', resize)
    }
  }, [columnPickerPosition])
  const toggleColumnPicker = () => {
    if (columnPickerPosition) { setColumnPickerPosition(null); return }
    const rect = columnButtonRef.current.getBoundingClientRect()
    setColumnPickerPosition({ top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), maxHeight: Math.min(window.innerHeight * 0.6, window.innerHeight - rect.bottom - 16) })
  }
  const resetColumns = () => {
    setVisibleKeys(columns.map(([key]) => key))
    setColumnOrder(columns.map(([key]) => key))
    setPinnedColumns([])
  }
  const [searchInput, setSearchInput] = useState('')
  const [draft, setDraft] = useState(initialFilters)
  const [applied, setApplied] = useState(() => requestFilters(initialFilters()))
  const [page, setPage] = useState(1)
  const applySearch = useCallback(search => {
    setApplied(previous => ({ ...previous, search }))
  }, [])
  useSearchAsYouType(searchInput, applied.search, applySearch, setPage)
  const [limit, setLimit] = useState(100)
  const [result, setResult] = useState({ rows: [], total: null, pages: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [validation, setValidation] = useState('')
  const [refresh, setRefresh] = useState(0)
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }))
  const toggleSidebar = () => setSidebarOpen(previous => {
    try { localStorage.setItem('sidebarOpen', JSON.stringify(!previous)) } catch { /* Storage may be unavailable. */ }
    return !previous
  })

  useEffect(() => {
    if (!isAuthenticated) return
    if (previousGroup.current !== groupKey) {
      previousGroup.current = groupKey
      if (page !== 1) { setPage(1); return }
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const body = buildCreditRequest(applied, page, limit)
    if (!applyReportGroupFilter(body, JSON.parse(groupKey))) {
      setResult({ rows: [], total: 0, pages: 1 })
      setLoading(false)
      return () => controller.abort()
    }
    brokerAPI.getCreditReport(body, { signal: controller.signal })
      .then(response => {
        if (!controller.signal.aborted) setResult(parseCreditReport(response))
      })
      .catch(requestError => {
        if (!controller.signal.aborted) {
          setResult({ rows: [], total: null, pages: null })
          setError(requestError?.response?.data?.message || requestError.message || 'Unable to load credit report.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [applied, page, limit, refresh, isAuthenticated, groupKey])

  useEffect(() => {
    if (!panel) return
    const previous = document.activeElement
    const dialog = panelRef.current
    const focusable = () => [...dialog.querySelectorAll('button, input, select, [tabindex="0"]')].filter(element => !element.disabled)
    focusable()[0]?.focus()
    const onKey = event => {
      if (event.key === 'Escape') setPanel(null)
      if (event.key === 'Tab') {
        const elements = focusable()
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    const outside = event => { if (panel === 'dates' && !dialog.contains(event.target) && !event.target.closest('[data-credit-calendar]')) setPanel(null) }
    const resize = () => { if (panel === 'dates') setPanel(null) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', resize)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', resize); document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [panel])

  const apply = event => {
    event.preventDefault()
    try {
      const next = panel === 'dates'
        ? { ...applied, from: epoch(draft.from), to: epoch(draft.to, true) }
        : { ...applied, logins: draft.logins, amount: draft.amount }
      buildCreditRequest(next)
      setValidation('')
      setPage(1)
      setApplied(next)
      if (panel === 'dates') setPreset('custom')
      setPanel(null)
    } catch (err) { setValidation(err.message) }
  }
  const reset = () => {
    update('logins', '')
    update('amount', '')
    setApplied(previous => ({ ...previous, logins: '', amount: '' }))
    setPage(1)
    setValidation('')
    setPanel(null)
  }
  const submitSearch = event => {
    event.preventDefault()
    setApplied(previous => ({ ...previous, search: searchInput.trim() }))
    setPage(1)
  }
  const changePreset = value => {
    setPreset(value)
    setApplied(previous => ({ ...previous, ...getPresetRange(value) }))
    setPage(1)
  }
  const exportPage = () => {
    const csv = [columns.map(([, label]) => label), ...result.rows.map(row => columns.map(([key]) => display(row, key)))]
      .map(row => row.map(value => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"').join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `credit-report-page-${page}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const totalPages = result.pages ?? (result.total == null ? null : Math.max(1, Math.ceil(result.total / limit)))
  const hasNext = totalPages == null ? result.rows.length === limit : page < totalPages

  const shownColumns = columnOrder.map(key => columns.find(([columnKey]) => columnKey === key)).filter(column => column && visibleKeys.includes(column[0]))
  const pinnedStyle = (key, header = false) => {
    if (!pinnedColumns.includes(key)) return undefined
    const before = shownColumns.slice(0, shownColumns.findIndex(([value]) => value === key)).filter(([value]) => pinnedColumns.includes(value)).length
    return { position: 'sticky', left: before * 160, width: 160, minWidth: 160, maxWidth: 160, zIndex: header ? 30 : 10, boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)' }
  }
  const mobileColumns = shownColumns
  const iconButton = 'h-8 w-8 shrink-0 rounded-md border border-[#E5E7EB] bg-white text-[#4B5563] shadow-sm flex items-center justify-center hover:bg-gray-50 disabled:opacity-40'
  const openPanel = value => { setValidation(''); setPanel(value) }
  const actions = <>
    <GroupSelector refreshOnOpen moduleName="credit-report" onCreateClick={() => { setEditingGroup(null); setShowGroupModal(true) }} onEditClick={group => { setEditingGroup(group); setShowGroupModal(true) }} />
    <QuickTimeFilter value={preset} onChange={changePreset} />
    <button type="button" data-credit-calendar="" onClick={event => {
      if (panel === 'dates') { setPanel(null); return }
      const rect = event.currentTarget.getBoundingClientRect()
      const width = Math.min(360, window.innerWidth - 24)
      setDatePosition({ width, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), top: Math.min(rect.bottom + 8, Math.max(12, window.innerHeight - 340)) })
      openPanel('dates')
    }} className={iconButton} aria-label="Choose custom dates" title="Choose custom dates"><Icon name="calendar" /></button>
    <button type="button" onClick={exportPage} disabled={loading || !!error || !result.rows.length} className={iconButton} aria-label="Export current page" title="Export current page to CSV"><Icon name="download" /></button>
    <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className={iconButton} aria-label="Refresh credit report" title="Refresh"><Icon name="refresh" /></button>
  </>
  const pagination = <div className="flex shrink-0 items-center gap-1 md:gap-3">
    <div className="hidden md:block"><PageSizeSelect value={limit} onChange={value => { setLimit(Number(value)); setPage(1) }} options={[25, 50, 100]} /></div>
    <button type="button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} className={iconButton} aria-label="Previous page"><Icon name="left" /></button>
    <div className="flex items-center gap-1 text-[11px] text-[#6B7280] md:text-sm"><input aria-label="Current page" type="number" min="1" max={totalPages ?? page} value={page} disabled={loading} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= (totalPages ?? page)) setPage(value) }} className="h-7 w-8 rounded-lg border border-[#E5E7EB] bg-white text-center font-semibold text-[#1F2937] md:w-12" /><span>/</span><span>{totalPages == null ? '-' : Math.max(1, totalPages)}</span></div>
    <button type="button" disabled={loading || !!error || !hasNext} onClick={() => setPage(value => value + 1)} className={iconButton} aria-label="Next page"><Icon name="right" /></button>
  </div>
  const table = (tableColumns, mobile = false) => <table className="w-full min-w-full border-separate border-spacing-0 text-xs">
    <thead className="sticky top-0 z-20 bg-blue-600 shadow-md"><tr>{tableColumns.map(([key, label]) => <th key={key} style={pinnedStyle(key, true)} aria-sort={key === applied.sortBy ? applied.sortOrder === 'asc' ? 'ascending' : 'descending' : undefined} className={`whitespace-nowrap border-r border-blue-400 bg-blue-600 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white ${mobile ? 'h-8 px-2 py-1 text-[10px]' : ''} ${mobile && !pinnedColumns.length && key === tableColumns[0][0] ? 'sticky left-0 z-30' : ''}`}>
      <button type="button" className="inline-flex w-full items-center gap-1 uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label={`Sort by ${label}, ${applied.sortBy === key && applied.sortOrder === 'desc' ? 'ascending' : 'descending'}`} onClick={() => { setApplied(previous => ({ ...previous, sortBy: key, sortOrder: previous.sortBy === key && previous.sortOrder === 'desc' ? 'asc' : 'desc' })); setPage(1) }}>{label}{applied.sortBy === key && <Icon name={applied.sortOrder === 'asc' ? 'up' : 'down'} />}</button>
    </th>)}</tr></thead>
    <tbody aria-busy={loading}>{loading ? Array.from({ length: 15 }, (_, index) => <tr key={index}>{tableColumns.map(([key]) => <td key={key} className="border-b border-r border-[#E5E7EB] px-3 py-3"><div className="h-3 min-w-16 animate-pulse rounded bg-gray-200" /></td>)}</tr>) : error || !result.rows.length ? <tr><td colSpan={tableColumns.length} className="p-10 text-center"><div role={error ? 'alert' : 'status'} className={error ? 'text-red-600' : 'text-slate-500'}>{error || 'No credit records found'}<p className="mt-1 text-xs">{error ? <button type="button" onClick={() => setRefresh(value => value + 1)} className="text-blue-600 underline">Retry</button> : 'Try a wider date range or adjust your filters.'}</p></div></td></tr> : result.rows.map((row, index) => <tr key={index} className="group">{tableColumns.map(([key]) => <td key={key} style={pinnedStyle(key)} title={display(row, key)} className={`whitespace-nowrap border-b border-r border-[#E5E7EB] px-3 py-2.5 text-sm group-hover:bg-blue-50 ${index % 2 ? 'bg-[#F9FAFB]' : 'bg-white'} ${mobile ? 'h-[38px] px-2 py-1 text-[10px]' : ''} ${mobile && !pinnedColumns.length && key === tableColumns[0][0] ? 'sticky left-0 z-10' : ''} ${key === 'login' ? 'text-blue-600' : key === 'amount' ? Number(field(row, key)) < 0 ? 'text-red-500' : 'text-green-600' : 'text-gray-900'} ${key === 'comment' ? 'max-w-[220px] truncate' : ''}`}>{key === 'login' && field(row, 'login') != null && String(field(row, 'login')).trim() !== '' && field(row, 'login') !== '-' ? <button type="button" onClick={() => setSelectedClient({ login: field(row, 'login'), name: field(row, 'name') || '' })} className="rounded-sm text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`Open client details for ${field(row, 'login')}`}>{display(row, key)}</button> : display(row, key)}</td>)}</tr>)}</tbody>
  </table>

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#F8F8F8] md:bg-gradient-to-br md:from-blue-50 md:via-white md:to-blue-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} onToggle={toggleSidebar} />
      <main className={`flex min-w-0 flex-1 flex-col overflow-hidden p-0 transition-all duration-300 md:p-4 lg:p-6 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}>
        <header className="relative flex shrink-0 items-center border-b border-[#ECECEC] bg-white px-4 py-4 md:mb-6 md:justify-between md:gap-3 md:rounded-2xl md:border-0 md:px-6 md:py-3 md:shadow-sm md:flex-wrap">
          <div className="flex items-center gap-2"><button type="button" onClick={() => setSidebarOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F8F8F8] text-black md:h-9 md:w-9 md:rounded-lg lg:hidden" aria-label="Open menu"><Icon name="menu" /></button><div><h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold text-black max-md:top-7 md:static md:translate-x-0 md:text-xl md:font-bold">Credit</h1><p className="mt-0.5 hidden text-xs text-[#6B7280] md:block">All credits across all accounts</p></div></div>
          <div className="hidden flex-wrap items-center gap-2 md:flex">{actions}</div>
        </header>
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-2 py-3 md:hidden">{actions}</div>
        <section aria-label="Credit records" className="mx-1 flex min-h-0 flex-1 flex-col overflow-hidden md:mx-0 md:rounded-lg md:border md:border-[#E5E7EB] md:bg-white md:shadow-sm">
          <div className="shrink-0 px-2 py-3 md:border-b md:border-[#E5E7EB] md:p-4"><div className="flex items-center gap-1 md:gap-2">
            <form onSubmit={submitSearch} className="relative min-w-0 flex-1 md:max-w-md"><input type="search" aria-label="Search credit records" placeholder="Search credit records" value={searchInput} onChange={event => setSearchInput(event.target.value)} className="h-8 w-full rounded-md border border-[#E5E7EB] bg-[#F9FAFB] pl-2 pr-16 [&::-webkit-search-cancel-button]:appearance-none text-[11px] text-[#1F2937] outline-none placeholder:text-[#9CA3AF] focus:ring-2 focus:ring-blue-500 md:h-10 md:rounded-lg md:pl-4 md:pr-20 md:text-sm" />{searchInput && <button type="button" onClick={() => setSearchInput('')} className="absolute right-8 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:text-gray-600 md:right-12" aria-label="Clear search"><Icon name="close" /></button>}<button type="submit" className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-blue-600 text-white md:h-8 md:w-9" aria-label="Search"><Icon name="search" /></button></form>
            <button ref={columnButtonRef} type="button" onClick={toggleColumnPicker} aria-expanded={!!columnPickerPosition} aria-haspopup="dialog" className={`${iconButton} mr-auto md:h-10 md:w-10`} aria-label="Show or hide columns" title="Show/Hide Columns"><Icon name="sliders" /></button>
            {pagination}
          </div></div>
          <div className="hidden min-h-0 flex-1 overflow-auto md:block" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9ca3af #e5e7eb' }}>{table(shownColumns)}</div>
          <div className="min-h-0 flex-1 overflow-auto border border-blue-100 bg-white md:hidden" style={{ WebkitOverflowScrolling: 'touch' }}>{table(mobileColumns, true)}</div>
        </section>
      </main>
      {columnPickerPosition && createPortal(
        <div ref={columnPickerRef} role="dialog" aria-label="Show, hide and reorder columns" className="fixed z-[60] flex w-[280px] flex-col rounded-lg border border-[#E5E7EB] bg-white shadow-lg" style={columnPickerPosition}>
          <div className="flex items-center justify-between border-b border-[#F3F4F6] px-3 py-2">
            <p className="text-xs font-semibold uppercase text-[#1F2937]">Show/Hide &amp; Reorder</p>
            <button type="button" onClick={resetColumns} className="rounded p-1 text-gray-500 hover:bg-blue-50 hover:text-blue-600" aria-label="Reset columns" title="Reset Columns"><Icon name="refresh" /></button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <ColumnChooserList
              columns={columns.map(([key, label]) => ({ key, label }))}
              visibleColumns={Object.fromEntries(columns.map(([key]) => [key, visibleKeys.includes(key)]))}
              onToggle={key => setVisibleKeys(previous => previous.includes(key) ? previous.length > 1 ? previous.filter(value => value !== key) : previous : [...previous, key])}
              columnOrder={columnOrder}
              onReorder={setColumnOrder}
              accent="blue"
              title={null}
              pinnedColumns={pinnedColumns}
              onPinToggle={key => setPinnedColumns(previous => previous.includes(key) ? previous.filter(value => value !== key) : [...previous, key])}
            />
          </div>
        </div>, document.body
      )}
      {selectedClient && (isMobile ? (
        <ClientDetailsMobileModal key={selectedClient.login} client={selectedClient} onClose={() => setSelectedClient(null)} allPositionsCache={EMPTY_CLIENT_CACHE} allOrdersCache={EMPTY_CLIENT_CACHE} />
      ) : (
        <ClientPositionsModal key={selectedClient.login} client={selectedClient} onClose={() => setSelectedClient(null)} allPositionsCache={EMPTY_CLIENT_CACHE} allOrdersCache={EMPTY_CLIENT_CACHE} onCacheUpdate={ignoreCacheUpdate} />
      ))}
      <GroupModal isOpen={showGroupModal} onClose={() => setShowGroupModal(false)} editGroup={editingGroup} />
      {panel && <div className={panel === 'dates' ? 'fixed z-50' : 'fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 sm:items-center'} style={panel === 'dates' ? datePosition : undefined} onMouseDown={event => { if (event.target === event.currentTarget) setPanel(null) }}>
        <div ref={panelRef} role="dialog" aria-modal={panel === 'dates' ? undefined : true} aria-labelledby="credit-panel-title" className={panel === 'dates' ? 'max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white text-left shadow-[0_12px_40px_rgba(15,23,42,0.16)]' : 'max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-xl'}>
          <div className={panel === 'dates' ? 'flex items-center gap-3 border-b border-slate-100 px-4 py-3' : 'mb-4 flex items-center justify-between'}>
            {panel === 'dates' && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Icon name="calendar" /></span>}
            <div className="flex-1"><h2 id="credit-panel-title" className="text-sm font-semibold text-slate-900">{panel === 'dates' ? 'Date range' : 'Credit filters'}</h2>{panel === 'dates' && <p className="mt-0.5 text-xs text-slate-500">Choose the period for your credits</p>}</div>
            <button type="button" onClick={() => setPanel(null)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close dialog"><Icon name="close" /></button>
          </div>
          <form onSubmit={apply}>
            {panel === 'dates' ? <div className="grid grid-cols-2 gap-4 px-4 py-4">
              <div className="min-w-0"><p className="text-xs font-medium text-slate-600">From date</p><DateInputDMY value={draft.from} max={draft.to || undefined} onChange={value => update('from', value)} className="mt-2 [&>input[type=text]]:h-11 [&>input[type=text]]:font-medium [&>input[type=text]]:pr-9 [&>button]:h-10 [&>button]:w-8 [&>button]:right-0.5" ariaLabel="From date" /></div>
              <div className="min-w-0"><p className="text-xs font-medium text-slate-600">To date</p><DateInputDMY value={draft.to} min={draft.from} onChange={value => update('to', value)} className="mt-2 [&>input[type=text]]:h-11 [&>input[type=text]]:font-medium [&>input[type=text]]:pr-9 [&>button]:h-10 [&>button]:w-8 [&>button]:right-0.5" ariaLabel="To date" /></div>
            </div> : <div className="space-y-4"><label className="block text-xs text-gray-600">Logins<input value={draft.logins} onChange={event => update('logins', event.target.value)} placeholder="750001, 750002" className={inputClass} /></label><label className="block text-xs text-gray-600">Amount greater than<input type="number" step="any" value={draft.amount} onChange={event => update('amount', event.target.value)} placeholder="Any amount" className={inputClass} /></label></div>}
            {validation && <p role="alert" className="px-4 pb-3 text-sm text-red-600">{validation}</p>}
            <div className={panel === 'dates' ? 'flex gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3' : 'mt-4 flex justify-end gap-2'}>
              <button type="button" onClick={panel === 'dates' ? () => { const value = today(); setDraft(previous => ({ ...previous, from: value, to: value })); setValidation('') } : reset} className="h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">{panel === 'dates' ? 'Reset to today' : 'Reset'}</button>
              <button type="submit" className="h-11 flex-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">{panel === 'dates' ? 'Apply dates' : 'Apply'}</button>
            </div>
          </form>
        </div>
      </div>}

    </div>
  )
}

function Icon({ name }) {
  const paths = {
    close: <path d="m6 6 12 12M18 6 6 18" />,
    up: <path d="m7 14 5-5 5 5" />,
    down: <path d="m7 10 5 5 5-5" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></>,
    search: <><circle cx="10" cy="10" r="7" /><path d="m15 15 5 5" /></>,
    sliders: <><path d="M3 5h18M3 12h18M3 19h18" /><circle cx="8" cy="5" r="2" fill="white" /><circle cx="16" cy="12" r="2" fill="white" /><circle cx="10" cy="19" r="2" fill="white" /></>,
    left: <path d="m14 6-6 6 6 6" />,
    right: <path d="m10 6 6 6-6 6" />
  }
  return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
