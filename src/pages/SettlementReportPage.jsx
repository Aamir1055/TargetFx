import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import BrokerCreditSummary from '../components/BrokerCreditSummary'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import CustomizeViewModal from '../components/CustomizeViewModal'
import LoginGroupsModal from '../components/LoginGroupsModal'
import LoginGroupModal from '../components/LoginGroupModal'
import PageSizeSelect from '../components/PageSizeSelect'
import ColumnChooserList from '../components/ColumnChooserList'
import { Cell } from '../components/settlement/SettlementCell'
import SettlementDetailModal from '../components/settlement/SettlementDetailModal'
import useSearchAsYouType from '../hooks/useSearchAsYouType'
import { useAuth } from '../contexts/authContextStore'
import { useGroups } from '../contexts/groupContextStore'
import { brokerAPI, settlementReportAPI } from '../services/api'
import { withExportLoading } from '../utils/exportLoading'
import {
  buildSettlementRequest, extractRows, extractPagination,
  scopeRowsToLogins, deriveColumns, applyColumnPrefs, collectAllRows, buildSettlementExcelSpec,
} from '../utils/settlementReport'

const GROUP_MODULE = 'settlement-report'
const COLUMN_PREFS_KEY = 'settlementReportColumns'
const PAGE_SIZE_OPTIONS = [25, 50, 100]

// Same button chrome the Deals report uses for its header actions.
const iconButton = 'h-8 w-8 shrink-0 rounded-md border border-[#E5E7EB] bg-white text-[#374151] shadow-sm flex items-center justify-center transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

const Icon = ({ d, className = 'h-4 w-4', strokeWidth = 1.8 }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={d} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></svg>
)

const readColumnPrefs = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMN_PREFS_KEY))
    return { hidden: Array.isArray(stored?.hidden) ? stored.hidden : [], order: Array.isArray(stored?.order) ? stored.order : [] }
  } catch { return { hidden: [], order: [] } }
}

export default function SettlementReportPage() {
  const { isAuthenticated } = useAuth()
  const { groups, getActiveGroupFilter, getGroupLogins, setActiveGroupFilter, deleteGroup } = useGroups()

  // ---------- layout ----------
  const [isMobile, setIsMobile] = useState(() => { try { return window.innerWidth < 1024 } catch { return false } })
  const [isPhone, setIsPhone] = useState(() => { try { return window.innerWidth < 768 } catch { return false } })
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (window.innerWidth < 1024) return false
    try { return JSON.parse(localStorage.getItem('sidebarOpen') ?? 'true') } catch { return true }
  })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  useEffect(() => {
    const onResize = () => { setIsMobile(window.innerWidth < 1024); setIsPhone(window.innerWidth < 768) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const setSidebar = next => { try { localStorage.setItem('sidebarOpen', JSON.stringify(next)) } catch { /* storage may be unavailable */ } setSidebarOpen(next) }

  // ---------- group (same module-wide selection the other reports use) ----------
  const activeGroupName = getActiveGroupFilter(GROUP_MODULE)
  const groupKey = activeGroupName ? JSON.stringify(groups.find(group => group.name === activeGroupName) ?? null) : ''
  // null = no group; an array (possibly empty) = a group is active. getGroupLogins expands login
  // lists and account ranges alike. An active group with no accounts must never show everyone.
  const groupLogins = useMemo(
    () => (activeGroupName ? getGroupLogins(activeGroupName).map(Number).filter(n => Number.isSafeInteger(n) && n > 0) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeGroupName, groupKey]
  )
  const groupEmpty = groupLogins !== null && groupLogins.length === 0
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const previousGroup = useRef(groupKey)
  // Phone filter flow (same as Deals): Filter -> "Customize view" -> Groups -> create/edit a group.
  const [mobileFilterView, setMobileFilterView] = useState(null) // null | 'customize' | 'groups' | 'edit'
  const [pendingGroupName, setPendingGroupName] = useState(null)
  const openMobileFilters = () => {
    setPendingGroupName(activeGroupName)
    setMobileFilterView('customize')
  }
  const applyMobileGroup = name => {
    setActiveGroupFilter(GROUP_MODULE, name)
    setPage(1)
    setMobileFilterView(null)
  }

  // ---------- weeks ----------
  const [weeks, setWeeks] = useState([])
  const [weekId, setWeekId] = useState(null)
  const [weeksLoading, setWeeksLoading] = useState(true)

  // ---------- data ----------
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(100)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(null)
  const [pages, setPages] = useState(null)
  const [outsideGroup, setOutsideGroup] = useState(0)
  const [selectedRow, setSelectedRow] = useState(null) // the row whose detail dialog is open
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const showToast = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400) }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const applySearch = useCallback(value => setSearch(value), [])
  useSearchAsYouType(searchInput, search, applySearch, setPage)

  useEffect(() => {
    if (!isAuthenticated) return undefined
    let active = true
    brokerAPI.getSettlementWeeks({ page: 1, limit: 100 })
      .then(response => {
        if (!active) return
        const list = response?.data?.weeks ?? response?.weeks ?? []
        setWeeks(list)
        setWeekId(current => current ?? list[0]?.id ?? null)
        // With no week there is nothing to fetch, so the table must not stay in its loading state.
        if (!list.length) setLoading(false)
      })
      .catch(err => {
        if (!active) return
        setError(err?.response?.data?.message || err.message || 'Could not load settlement weeks')
        setLoading(false)
      })
      .finally(() => { if (active) setWeeksLoading(false) })
    return () => { active = false }
    // `refresh` re-fetches the weeks too, so Retry recovers from a failed weeks request.
  }, [isAuthenticated, refresh])

  useEffect(() => {
    if (!isAuthenticated || weekId === null) return undefined
    // A new group starts from page 1 (the page change re-runs this effect).
    if (previousGroup.current !== groupKey) {
      previousGroup.current = groupKey
      if (page !== 1) { setPage(1); return undefined }
    }
    if (groupEmpty) { setRows([]); setTotal(null); setPages(null); setOutsideGroup(0); setError(''); setLoading(false); return undefined }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    let body
    try { body = buildSettlementRequest({ weekId, search, page, limit, logins: groupLogins }) } catch (err) { setError(err.message); setLoading(false); return undefined }
    settlementReportAPI.get(body, { signal: controller.signal })
      .then(response => {
        const scoped = scopeRowsToLogins(extractRows(response), groupLogins)
        const pagination = extractPagination(response)
        setRows(scoped.rows)
        setOutsideGroup(scoped.removed)
        setTotal(pagination.total)
        setPages(pagination.pages)
      })
      .catch(err => {
        if (controller.signal.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return
        setRows([]); setTotal(null); setPages(null); setOutsideGroup(0)
        setError(err?.response?.data?.message || err.message || 'Could not load the settlement report')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [isAuthenticated, weekId, search, page, limit, groupKey, groupLogins, groupEmpty, refresh])

  // ---------- columns (derived from the rows, then shown/hidden/ordered by the user) ----------
  useEffect(() => { setSelectedRow(null) }, [weekId, page, search, limit, groupKey])
  const derivedColumns = useMemo(() => deriveColumns(rows), [rows])
  // Keep the last known columns so the header and column chooser survive a loading or empty page.
  const [columns, setColumns] = useState([])
  useEffect(() => { if (derivedColumns.length) setColumns(derivedColumns) }, [derivedColumns])
  const [columnPrefs, setColumnPrefs] = useState(readColumnPrefs)
  useEffect(() => { try { localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(columnPrefs)) } catch { /* storage may be unavailable */ } }, [columnPrefs])
  const hiddenSet = useMemo(() => new Set(columnPrefs.hidden), [columnPrefs.hidden])
  const { ordered: orderedColumns, shown: shownColumns } = useMemo(() => applyColumnPrefs(columns, columnPrefs), [columns, columnPrefs])
  const visibleMap = useMemo(() => Object.fromEntries(columns.map(column => [column.key, !hiddenSet.has(column.key)])), [columns, hiddenSet])
  const toggleColumn = key => setColumnPrefs(prefs => {
    const hidden = new Set(prefs.hidden)
    if (hidden.has(key)) hidden.delete(key)
    else if (columns.filter(column => !hidden.has(column.key)).length > 1) hidden.add(key) // never hide the last column
    return { ...prefs, hidden: [...hidden] }
  })
  const resetColumns = () => setColumnPrefs({ hidden: [], order: [] })

  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const columnPickerRef = useRef(null)
  useEffect(() => {
    if (!columnPickerOpen) return undefined
    const close = event => { if (!columnPickerRef.current?.contains(event.target)) setColumnPickerOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setColumnPickerOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey) }
  }, [columnPickerOpen])

  // ---------- export ----------
  const selectedWeek = weeks.find(week => week.id === weekId) || null
  const weekLabel = selectedWeek?.name || selectedWeek?.label || (weekId !== null ? `Week ${weekId}` : '')
  // The Excel is built here (same navy-band layout as the other reports) from the whole week, not just
  // the page on screen: every page is fetched, honouring the active group. It uses the columns you have
  // chosen to show, in your order. The library is loaded only when you export.
  const exportReport = withExportLoading(async () => {
    const all = await collectAllRows(
      (pageNumber, size) => settlementReportAPI.get(buildSettlementRequest({ weekId, search: '', page: pageNumber, limit: size, logins: groupLogins })),
      { limit: 100 }
    )
    const { rows: scoped } = scopeRowsToLogins(all, groupLogins)
    if (!scoped.length) throw new Error('There is no settlement data to export for this week.')
    const { ordered, shown } = applyColumnPrefs(deriveColumns(scoped), columnPrefs)
    const spec = buildSettlementExcelSpec(scoped, shown.length ? shown : ordered, weekLabel)
    const { exportStyledExcel } = await import('../utils/exportStyledExcel')
    const safeWeek = (weekLabel || `week-${weekId}`).replace(/[^a-z0-9\-_ ]/gi, '_').trim()
    exportStyledExcel({ showTitle: false, sections: spec.sections, columns: spec.columns, sheetName: weekLabel || 'Settlement report', fileName: `settlement_report_${safeWeek}.xlsx`, bookType: 'xlsx' })
  })
  const doExport = async () => {
    if (weekId === null || exporting || groupEmpty) return
    setExporting(true)
    try { await exportReport(); showToast('Settlement report downloaded') }
    catch (err) { setError(err?.response?.data?.message || err.message || 'Export failed') }
    finally { setExporting(false) }
  }

  // ---------- pagination ----------
  const lastPage = pages ?? (total !== null ? Math.max(1, Math.ceil(total / limit)) : null)
  const canNext = lastPage !== null ? page < lastPage : rows.length >= limit
  const totalPages = Math.max(1, lastPage ?? (canNext ? page + 1 : page))
  const prevDisabled = page <= 1 || loading
  const nextDisabled = !canNext || loading
  const onPageInput = event => {
    const next = Number(event.target.value)
    if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next)
  }
  // Keep the week's own id (number or string, whatever the API uses) so lookups by id still match.
  const changeWeek = value => { setWeekId(weeks.find(week => String(week.id) === String(value))?.id ?? value); setPage(1) }

  // ---------- header controls (right side of the header card, like Deals) ----------
  const headerControls = (
    <div className="flex flex-wrap items-center gap-2">
      <GroupSelector refreshOnOpen moduleName={GROUP_MODULE} onCreateClick={() => { setEditingGroup(null); setShowGroupModal(true) }} onEditClick={group => { setEditingGroup(group); setShowGroupModal(true) }} />
      <select value={weekId ?? ''} onChange={event => changeWeek(event.target.value)} disabled={!weeks.length} aria-label="Settlement week" className="h-8 w-40 shrink-0 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#374151] shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60">
        {!weeks.length && <option value="">{weeksLoading ? 'Loading weeks…' : 'No weeks'}</option>}
        {weeks.map(week => <option key={week.id} value={week.id}>{week.name || week.label || `Week ${week.id}`}</option>)}
      </select>
      <button type="button" onClick={doExport} disabled={exporting || loading || weekId === null || groupEmpty} className={iconButton} aria-label="Export settlement report" title={exporting ? 'Exporting…' : 'Export this week as XLSX'}>
        <Icon d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeWidth={2} className={`h-4 w-4 ${exporting ? 'animate-pulse text-blue-600' : ''}`} />
      </button>
      <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className={iconButton} aria-label="Refresh settlement report" title="Refresh">
        <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2} className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )

  // ---------- table body ----------
  // One message for every "nothing to show" case, used by the desktop table and the phone layout.
  let empty = null
  if (!loading && !weeksLoading) {
    if (error) empty = ['Could not load the report', 'Use Retry above, or refresh.']
    else if (!weeks.length) empty = ['No settlement weeks yet', 'Weeks appear here once a settlement is generated.']
    else if (groupEmpty) empty = ['This group has no accounts', 'Choose another group, or add accounts to it.']
    else if (!rows.length) empty = [`No settlement data for ${weekLabel || 'this week'}`, search ? 'Try a different search.' : activeGroupName ? `No rows for the “${activeGroupName}” group.` : '']
  }
  const emptyBlock = empty && (
    <div className="flex min-h-[200px] flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-semibold text-slate-700">{empty[0]}</p>
      {empty[1] && <p className="mt-1 text-xs text-slate-500">{empty[1]}</p>}
    </div>
  )

  let bodyRows
  if (loading || weeksLoading) {
    bodyRows = Array.from({ length: Math.min(limit, 15) }, (_, row) => (
      <tr key={`sk-${row}`} className={row % 2 ? 'bg-[#F9FAFB]' : 'bg-white'}>
        {Array.from({ length: Math.max(shownColumns.length, 6) }, (_, col) => (
          <td key={col} className="border-b border-r border-[#E5E7EB] px-3 py-3 last:border-r-0"><div className="h-3.5 w-16 min-w-[48px] animate-pulse rounded bg-gray-200" /></td>
        ))}
      </tr>
    ))
  } else if (empty) {
    bodyRows = <tr><td colSpan={Math.max(shownColumns.length, 1)}>{emptyBlock}</td></tr>
  } else {
    bodyRows = rows.map((row, index) => {
      const zebra = index % 2 ? 'bg-[#F9FAFB]' : 'bg-white'
      return (
        <tr key={index} className={`group ${zebra}`}>
          {shownColumns.map(column => (
            <td key={column.key} className={`whitespace-nowrap border-b border-r border-[#E5E7EB] px-3 py-2.5 text-sm last:border-r-0 group-hover:bg-blue-50 ${zebra} ${column.kind === 'login' ? 'sticky left-0 z-[1] text-blue-600' : column.kind === 'name' ? 'text-gray-900' : 'text-gray-700'}`}>
              <Cell column={column} value={row?.[column.key]} onOpen={column.kind === 'login' ? () => setSelectedRow(row) : undefined} />
            </td>
          ))}
        </tr>
      )
    })
  }

  // Phone rows: white, 38px tall, thin grey separators — the same look as the Deals phone table.
  const phoneRows = loading || weeksLoading
    ? Array.from({ length: 12 }, (_, row) => (
      <tr key={`sk-${row}`}>
        {Array.from({ length: Math.max(shownColumns.length, 5) }, (_, col) => (
          <td key={col} className="h-[38px] border-b border-[#E1E1E1] bg-white px-1"><div className="h-3 w-full max-w-[80%] animate-pulse rounded bg-gray-200" /></td>
        ))}
      </tr>
    ))
    : empty ? null : rows.map((row, index) => (
      <tr key={index} className="bg-white hover:bg-[#F8FAFC]">
        {shownColumns.map(column => (
          <td key={column.key} className={`h-[38px] whitespace-nowrap border-b border-[#E1E1E1] px-1 text-[10px] text-[#4B4B4B] ${column.kind === 'login' ? 'sticky left-0 z-[1] bg-white px-2 font-semibold text-[#1A63BC]' : ''}`} style={column.kind === 'login' ? { boxShadow: '2px 0 4px rgba(0,0,0,0.05)' } : undefined}>
            <Cell column={column} value={row?.[column.key]} onOpen={column.kind === 'login' ? () => setSelectedRow(row) : undefined} />
          </td>
        ))}
      </tr>
    ))

  // The show/hide + reorder panel: a dropdown on desktop, a bottom sheet on phones.
  const columnPickerPanel = (
    <>
      <div className="flex items-center justify-between border-b border-[#F3F4F6] px-3 py-2">
        <p className="text-xs font-semibold uppercase text-[#1F2937]">Show/Hide & Reorder</p>
        <button type="button" onClick={resetColumns} className="rounded p-1 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600" aria-label="Reset columns" title="Reset columns">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20v-6h-6" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10a8 8 0 0114-3m2 7a8 8 0 01-14 3" /></svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <ColumnChooserList
          columns={columns}
          visibleColumns={visibleMap}
          onToggle={toggleColumn}
          columnOrder={orderedColumns.map(column => column.key)}
          onReorder={order => setColumnPrefs(prefs => ({ ...prefs, order }))}
          accent="blue"
          title={null}
        />
      </div>
    </>
  )

  // ---------- phone layout (same structure as the Deals phone view) ----------
  const phoneIconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#374151] shadow-sm disabled:cursor-not-allowed disabled:opacity-50'
  const phonePagerButton = disabled => `flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-white shadow-sm ${disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-gray-50'}`
  const phoneLayout = (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="relative flex flex-wrap items-center border-b border-[#ECECEC] bg-white px-4 py-4">
        <button type="button" onClick={() => setMobileNavOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F8F8F8]" aria-label="Open menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3"><h1 className="min-w-0 text-lg font-semibold text-[#000000] max-sm:text-sm">Settlement Report</h1><BrokerCreditSummary variant="header" /></div>
        <BrokerCreditSummary variant="desktop-header" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {/* Toolbar */}
        <div className="px-2 pb-2 pt-3">
          <div className="flex w-full flex-nowrap items-center justify-between gap-1 overflow-x-auto py-1">
            <div className="shrink-0">
              <button type="button" onClick={openMobileFilters} aria-haspopup="dialog" aria-expanded={mobileFilterView !== null} title={activeGroupName ? `Group filter: ${activeGroupName}` : 'Customize view'} className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-medium shadow-sm ${activeGroupName ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-[#E5E7EB] bg-white text-[#374151]'}`}>
                <svg className="h-3 w-3" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 3h14M4 6h10M6 9h6" /></svg>
                Filter
                {activeGroupName && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
              </button>
            </div>
            <select value={weekId ?? ''} onChange={event => changeWeek(event.target.value)} disabled={!weeks.length} aria-label="Settlement week" className="h-7 min-w-0 max-w-[170px] flex-1 rounded-md border border-[#E5E7EB] bg-white px-1 text-[10px] font-medium text-[#374151] shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60">
              {!weeks.length && <option value="">{weeksLoading ? 'Loading…' : 'No weeks'}</option>}
              {weeks.map(week => <option key={week.id} value={week.id}>{week.name || week.label || `Week ${week.id}`}</option>)}
            </select>
            <button type="button" onClick={doExport} disabled={exporting || loading || weekId === null || groupEmpty} className={phoneIconButton} aria-label="Export settlement report" title={exporting ? 'Exporting…' : 'Export this week as XLSX'}>
              <Icon d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" strokeWidth={2} className={`h-4 w-4 ${exporting ? 'animate-pulse text-blue-600' : ''}`} />
            </button>
            <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className={phoneIconButton} aria-label="Refresh settlement report" title="Refresh">
              <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth={2} className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && !loading && (
          <div role="alert" className="mx-2 mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <span className="text-[11px] font-medium text-red-700">{error}</span>
            <button type="button" onClick={() => { setError(''); setRefresh(value => value + 1) }} className="shrink-0 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">Retry</button>
          </div>
        )}
        {outsideGroup > 0 && !loading && (
          <div role="status" className="mx-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            Showing only the “{activeGroupName}” accounts on this page. The server also returned {outsideGroup} other {outsideGroup === 1 ? 'account' : 'accounts'}, so counts may be higher than the group.
          </div>
        )}

        {/* Search + pagination */}
        <div className="mx-1 mb-1 px-3 py-3">
          <div className="flex items-center gap-1">
            <div className="flex h-7 w-[45%] min-w-0 max-w-[180px] items-center gap-1.5 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2">
              <svg width="12" height="12" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-[#9CA3AF]"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <input placeholder="Search" value={searchInput} onChange={event => setSearchInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { setSearch(searchInput.trim()); setPage(1) } }} className="min-w-0 flex-1 bg-transparent text-[11px] text-[#1F2937] outline-none placeholder-[#9CA3AF]" aria-label="Search settlement report" />
            </div>
            <button type="button" onClick={() => setColumnPickerOpen(true)} disabled={!columns.length} className="mr-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-white shadow-sm hover:bg-gray-50 disabled:opacity-50" title="Show/Hide Columns" aria-label="Show or hide columns">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2" /><rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2" /></svg>
            </button>
            <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={prevDisabled} className={phonePagerButton(prevDisabled)} aria-label="Previous page">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M12 14L8 10L12 6" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="flex items-center gap-0.5 text-[11px] text-[#4B5563]">
              <input type="number" min="1" max={totalPages} value={page} onChange={onPageInput} className="h-6 w-8 rounded-md border border-[#E5E7EB] text-center text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="Current page" />
              <span className="text-[#9CA3AF]">/</span>
              <span>{totalPages}</span>
            </div>
            <button type="button" onClick={() => setPage(value => value + 1)} disabled={nextDisabled} className={phonePagerButton(nextDisabled)} aria-label="Next page">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 6L12 10L8 14" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="mx-1 overflow-hidden border border-blue-100 bg-white shadow-sm" style={{ marginBottom: 'calc(8px + var(--app-safe-bottom, 0px))' }}>
          <div className="mobile-table-scroll w-full overflow-auto" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', maxHeight: 'max(152px, calc(var(--app-viewport-height, 100dvh) - 230px))' }}>
            <table className="min-w-full border-separate border-spacing-0">
              {shownColumns.length > 0 && (
                <thead>
                  <tr>
                    {shownColumns.map(column => (
                      <th key={column.key} scope="col" className={`sticky top-0 h-[32px] whitespace-nowrap bg-blue-500 px-1 text-left text-[10px] font-semibold text-white ${column.kind === 'login' ? 'left-0 z-30 px-2' : 'z-20'}`}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody aria-busy={loading}>{phoneRows}</tbody>
            </table>
          </div>
          {!loading && emptyBlock}
        </div>
      </div>

      {columnPickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-end bg-black/30">
          <div ref={columnPickerRef} className="flex max-h-[70vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl" style={{ paddingBottom: 'var(--app-safe-bottom, 0px)' }}>{columnPickerPanel}</div>
        </div>
      )}
    </div>
  )

  return (
    <div className={`flex h-screen overflow-hidden ${isPhone ? 'bg-[#F8F8F8]' : 'bg-[#F8FAFC]'}`}>
      {isMobile
        ? <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} onToggle={() => setMobileNavOpen(value => !value)} mobileOnly />
        : <Sidebar isOpen={sidebarOpen} onClose={() => setSidebar(false)} onToggle={() => setSidebar(!sidebarOpen)} />}

      <main className={`flex min-w-0 flex-1 flex-col overflow-hidden ${isPhone ? '' : 'p-4 lg:p-6'} ${isMobile ? '' : `transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}`}>
        {isPhone ? phoneLayout : (<>
        {/* Header card — same layout as Deals: title on the left, controls on the right */}
        <div className="mb-4 shrink-0 rounded-2xl bg-white px-4 py-3 shadow-sm sm:px-6 lg:mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {isMobile && (
                <button type="button" onClick={() => setMobileNavOpen(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F8F8F8] text-slate-900" aria-label="Open menu">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              )}
              <div className="min-w-0">
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3"><h1 className="min-w-0 truncate text-xl font-bold text-[#1A1A1A] max-sm:text-base">Settlement Report</h1><BrokerCreditSummary variant="header" /></div>
                <p className="mt-0.5 text-xs text-[#6B7280]">Week-wise settlement across all accounts</p>
              </div>
            </div>
            {headerControls}
          </div>
          <BrokerCreditSummary variant="desktop-header" />
        </div>

        {error && !loading && (
          <div role="alert" className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <span className="text-[13px] font-medium text-red-700">{error}</span>
            <button type="button" onClick={() => { setError(''); setRefresh(value => value + 1) }} className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700">Retry</button>
          </div>
        )}

        {outsideGroup > 0 && !loading && (
          <div role="status" className="mb-3 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
            Showing only the “{activeGroupName}” accounts on this page. The server also returned {outsideGroup} other {outsideGroup === 1 ? 'account' : 'accounts'}, so the row count and page total may be higher than the group.
          </div>
        )}

        {/* Table card — search, column chooser and pagination on top, like Deals */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm" style={{ marginBottom: 'var(--app-safe-bottom, 0px)' }}>
          <div className="shrink-0 border-b border-[#E5E7EB] p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] max-w-md flex-1">
                <input
                  type="text"
                  value={searchInput}
                  onChange={event => setSearchInput(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { setSearch(searchInput.trim()); setPage(1) } }}
                  placeholder="Search login or name"
                  aria-label="Search settlement report"
                  className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] pl-4 pr-20 text-sm text-[#1F2937] transition-all placeholder:text-[#9CA3AF] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchInput && (
                  <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }} className="absolute right-12 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563]" title="Clear search" aria-label="Clear search">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
                <button type="button" onClick={() => { setSearch(searchInput.trim()); setPage(1) }} className="absolute right-1 top-1/2 flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700" title="Search" aria-label="Search">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 18 18"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>
              </div>

              <div className="relative mr-auto" ref={columnPickerRef}>
                <button type="button" onClick={() => setColumnPickerOpen(open => !open)} disabled={!columns.length} className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50" title="Show/Hide Columns" aria-label="Show or hide columns" aria-expanded={columnPickerOpen}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <line x1="2" y1="4" x2="14" y2="4" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" /><circle cx="6" cy="4" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5" />
                    <line x1="2" y1="8" x2="14" y2="8" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" /><circle cx="11" cy="8" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5" />
                    <line x1="2" y1="12" x2="14" y2="12" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" /><circle cx="7" cy="12" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5" />
                  </svg>
                </button>
                {columnPickerOpen && (
                  <div className="absolute left-0 top-full z-50 mt-2 flex flex-col rounded-lg border border-[#E5E7EB] bg-white py-0 shadow-lg" style={{ width: 280, maxHeight: '60vh' }}>{columnPickerPanel}</div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden md:block"><PageSizeSelect value={limit} onChange={value => { setLimit(Number(value)); setPage(1) }} options={PAGE_SIZE_OPTIONS} /></div>
                <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={prevDisabled} className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${prevDisabled ? 'cursor-not-allowed bg-[#F9FAFB] text-[#D1D5DB]' : 'border border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50'}`} aria-label="Previous page">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div className="flex items-center gap-1 text-sm font-medium text-[#374151]">
                  <input type="number" min="1" max={totalPages} value={page} onChange={onPageInput} className="h-7 w-12 rounded-lg border border-[#E5E7EB] text-center text-sm font-semibold text-[#1F2937]" aria-label="Current page" />
                  <span className="text-[#9CA3AF]">/</span>
                  <span className="text-[#6B7280]">{totalPages}</span>
                </div>
                <button type="button" onClick={() => setPage(value => value + 1)} disabled={nextDisabled} className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${nextDisabled ? 'cursor-not-allowed bg-[#F9FAFB] text-[#D1D5DB]' : 'border border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50'}`} aria-label="Next page">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9ca3af #e5e7eb', WebkitOverflowScrolling: 'touch' }}>
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              {shownColumns.length > 0 && (
                <thead>
                  <tr>
                    {shownColumns.map(column => (
                      <th key={column.key} scope="col" className={`sticky top-0 whitespace-nowrap border-r border-blue-400 bg-blue-600 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white last:border-r-0 ${column.kind === 'login' ? 'left-0 z-20' : 'z-10'}`}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody aria-busy={loading}>{bodyRows}</tbody>
            </table>
          </div>
        </div>
        </>)}
      </main>

      <GroupModal isOpen={showGroupModal} onClose={() => setShowGroupModal(false)} editGroup={editingGroup} />

      {isPhone && (
        <>
          <CustomizeViewModal
            isOpen={mobileFilterView === 'customize'}
            onClose={() => setMobileFilterView(null)}
            onGroupsClick={() => setMobileFilterView('groups')}
            onReset={() => applyMobileGroup(null)}
            onApply={() => applyMobileGroup(pendingGroupName)}
            hasPendingChanges={pendingGroupName !== activeGroupName}
          />
          <LoginGroupsModal
            isOpen={mobileFilterView === 'groups'}
            onClose={() => setMobileFilterView(view => (view === 'groups' ? null : view))}
            onBack={() => setMobileFilterView('customize')}
            groups={groups.map(group => ({ ...group, loginCount: group.range ? Number(group.range.to) - Number(group.range.from) + 1 : (group.loginIds?.length || 0) }))}
            activeGroupName={activeGroupName}
            onSelectGroup={group => applyMobileGroup(group?.name || null)}
            onPendingChange={(_hasPending, name) => setPendingGroupName(name || null)}
            onCreateGroup={() => { setEditingGroup(null); setMobileFilterView('edit') }}
            onEditGroup={group => { setEditingGroup(group); setMobileFilterView('edit') }}
            onDeleteGroup={group => deleteGroup(group.name)}
          />
          <LoginGroupModal
            isOpen={mobileFilterView === 'edit'}
            editGroup={editingGroup}
            onClose={() => { setEditingGroup(null); setMobileFilterView('groups') }}
            onBack={() => { setEditingGroup(null); setMobileFilterView('groups') }}
            onSave={() => { setEditingGroup(null); setMobileFilterView('groups') }}
          />
        </>
      )}

      {selectedRow && <SettlementDetailModal row={selectedRow} columns={columns} weekLabel={weekLabel} onClose={() => setSelectedRow(null)} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[110] flex justify-center">
          <div className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  )
}
