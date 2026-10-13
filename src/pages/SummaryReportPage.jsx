import BrokerCreditSummary from '../components/BrokerCreditSummary'
import QuickTimeFilter from '../components/QuickTimeFilter'
import { getPresetRange } from '../utils/dealTimePresets'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/authContextStore'
import Sidebar from '../components/Sidebar'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import CustomizeViewModal from '../components/CustomizeViewModal'
import LoginGroupsModal from '../components/LoginGroupsModal'
import LoginGroupModal from '../components/LoginGroupModal'
import { useGroups } from '../contexts/groupContextStore'
import ClientPositionsModal from '../components/ClientPositionsModal'
import ClientDetailsMobileModal from '../components/ClientDetailsMobileModal'
import PageSizeSelect from '../components/PageSizeSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import ColumnChooserList from '../components/ColumnChooserList'
import { serverNowDate, serverEpochFromParts, fromServerEpoch } from '../utils/dateFormatter'
import DateInputDMY from '../components/DateInputDMY'
import { exportStyledExcel } from '../utils/exportStyledExcel'

const EMPTY_CLIENT_CACHE = []
const ignoreClientUpdate = () => {}
const EXPORT_CHUNK = 500
const PAGE_SIZE_OPTIONS = [50, 100, 250, 500]
const MOBILE_PAGE_SIZE = 15

const formatNumber = (value, digits = 2) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0.00'
  return number.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const toYmd = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 'YYYY-MM-DD' -> server epoch (seconds); endOfDay covers the whole "to" day
const ymdToEpoch = (value, endOfDay = false) => {
  const [year, month, day] = value.split('-').map(Number)
  return endOfDay
    ? serverEpochFromParts(year, month - 1, day, 23, 59, 59)
    : serverEpochFromParts(year, month - 1, day, 0, 0, 0)
}

// Columns: Login, Name, Deposit/Withdrawal, Credit, Additional, Volume, Commission, Profit, Current Balance, Current Equity.
// Field names returned by the API aren't finalised, so each accessor tries a few likely spellings.
const COLUMNS = [
  { key: 'login', label: 'Login', get: r => r.login ?? r.Login ?? r.mt5Account ?? '-' },
  { key: 'name', label: 'Name', get: r => r.name ?? r.clientName ?? r.client_name ?? '-' },
  { key: 'inOut', label: 'Deposit/Withdrawal', numeric: true, signed: true, get: r => Number(r.inOut ?? r.in_out ?? r.depositWithdrawal ?? r.deposit_withdrawal ?? 0) },
  { key: 'credit', label: 'Credit', numeric: true, signed: true, get: r => Number(r.credit ?? 0) },
  { key: 'additional', label: 'Additional', numeric: true, signed: true, get: r => Number(r.additional ?? r.bonus ?? 0) },
  { key: 'volume', label: 'Volume', numeric: true, get: r => Number(r.volume ?? 0) },
  { key: 'commission', label: 'Commission', numeric: true, signed: true, get: r => Number(r.commission ?? 0) },
  { key: 'profit', label: 'Profit', numeric: true, signed: true, get: r => Number(r.profit ?? 0) },
  { key: 'balance', label: 'Current Balance', numeric: true, get: r => Number(r.balance ?? r.currentBalance ?? r.current_balance ?? 0) },
  { key: 'equity', label: 'Current Equity', numeric: true, get: r => Number(r.equity ?? r.currentEquity ?? r.current_equity ?? 0) }
]
const DEFAULT_VISIBLE_KEYS = COLUMNS.map(c => c.key)
const getDefaultVisibleColumns = () => Object.fromEntries(COLUMNS.map(c => [c.key, DEFAULT_VISIBLE_KEYS.includes(c.key)]))
const VISIBLE_COLUMNS_STORAGE_KEY = 'summaryReportVisibleColumns'
const COLUMN_ORDER_STORAGE_KEY = 'summaryReportColumnOrder'

const MOBILE_WIDTHS = { login: 76, name: 110, inOut: 96, credit: 84, additional: 88, volume: 76, commission: 96, profit: 84, balance: 104, equity: 104 }
const mobileGridFor = (columns) => columns.map(c => `${MOBILE_WIDTHS[c.key] || 90}px`).join(' ')

const SummaryReportPage = () => {
  const { groups, getActiveGroupFilter, getGroupLogins, setActiveGroupFilter, deleteGroup } = useGroups()
  const activeGroupName = getActiveGroupFilter('summary-report')
  const activeGroup = groups.find(group => group.name === activeGroupName) || null
  const groupKey = JSON.stringify(activeGroup)
  const previousGroupKey = useRef(groupKey)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [mobileFilterView, setMobileFilterView] = useState(null)
  const [pendingGroupName, setPendingGroupName] = useState(null)
  const openMobileFilters = () => {
    setPendingGroupName(activeGroupName)
    setMobileFilterView('customize')
  }
  const applyMobileGroup = (name) => {
    setActiveGroupFilter('summary-report', name)
    setPage(1)
    setMobileFilterView(null)
  }

  const [selectedClient, setSelectedClient] = useState(null)
  const { isAuthenticated } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) return false
      const value = localStorage.getItem('sidebarOpen')
      return value === null ? true : JSON.parse(value)
    } catch { return true }
  })
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  // Measured in JS (not CSS vh/dvh) so the mobile column-picker sheet below sizes correctly even in
  // webviews/browsers that don't handle viewport units well. We read `visualViewport.height` in
  // preference to `window.innerHeight` because — unlike innerHeight — it shrinks when the on-screen
  // keyboard opens, so the sheet resizes to stay above the keyboard instead of having its (now
  // filtered, often single-row) list rendered underneath it where it can't be seen or scrolled to.
  const getViewportHeight = () => (typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 800)
  const [viewportHeight, setViewportHeight] = useState(getViewportHeight)
  useEffect(() => {
    const updateHeight = () => setViewportHeight(getViewportHeight())
    const onResize = () => { setIsMobile(window.innerWidth < 768); updateHeight() }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', updateHeight)
    window.visualViewport?.addEventListener('scroll', updateHeight)
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', updateHeight)
      window.visualViewport?.removeEventListener('scroll', updateHeight)
    }
  }, [])

  // Mobile table: bounded to its own scroll area (sticky header, like every other report page)
  // instead of scrolling with the whole page. Its height is measured live from the header + the
  // toolbar above it — rather than a hardcoded guess — so it's always correct.
  const mobileHeaderRef = useRef(null)
  const mobileAboveTableRef = useRef(null)
  const mobileScrollAreaRef = useRef(null)
  const mobileCardRef = useRef(null)
  const [mobileTableMaxHeight, setMobileTableMaxHeight] = useState(300)
  useEffect(() => {
    if (!isMobile) return undefined
    const recompute = () => {
      const area = mobileScrollAreaRef.current
      const card = mobileCardRef.current
      if (area && card) {
        // Position of the table card inside the scroll area (stable while the area is scrolled),
        // minus the card's 2px border, so the table ends exactly at the bottom of the screen.
        const cardTop = card.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop
        setMobileTableMaxHeight(Math.max(180, Math.round(area.clientHeight - cardTop - 2)))
        return
      }
      const headerH = mobileHeaderRef.current?.getBoundingClientRect().height || 0
      const aboveH = mobileAboveTableRef.current?.getBoundingClientRect().height || 0
      setMobileTableMaxHeight(Math.max(180, Math.round(viewportHeight - headerH - aboveH - 2)))
    }
    recompute()
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(recompute)
      if (mobileHeaderRef.current) observer.observe(mobileHeaderRef.current)
      if (mobileAboveTableRef.current) observer.observe(mobileAboveTableRef.current)
      if (mobileScrollAreaRef.current) observer.observe(mobileScrollAreaRef.current)
    }
    window.addEventListener('resize', recompute)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [isMobile, viewportHeight])

  // ───────── Date range ─────────
  const [preset, setPreset] = useState('today')
  const [range, setRange] = useState(() => getPresetRange('today'))
  const [customFrom, setCustomFrom] = useState(() => toYmd(serverNowDate()))
  const [customTo, setCustomTo] = useState(() => toYmd(serverNowDate()))
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  useEffect(() => {
    if (!datePickerOpen) return undefined
    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-summary-datepicker]')) setDatePickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [datePickerOpen])

  // ───────── Search (debounced, same as Deals) ─────────
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim()
      if (next !== search) { setSearch(next); setPage(1) }
    }, 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])
  const submitSearch = () => {
    const next = searchInput.trim()
    if (next === search) setReloadKey(value => value + 1)
    else setSearch(next)
    setPage(1)
  }

  // ───────── Columns ─────────
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY) || 'null')
      if (saved && typeof saved === 'object') return { ...getDefaultVisibleColumns(), ...saved }
    } catch (error) { console.warn('[SummaryReport] Failed to load column visibility:', error) }
    return getDefaultVisibleColumns()
  })
  useEffect(() => {
    try { localStorage.setItem(VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns)) } catch (error) { console.warn('[SummaryReport] Failed to save column visibility:', error) }
  }, [visibleColumns])
  const toggleColumn = (key) => setVisibleColumns(value => {
    const next = { ...value, [key]: !value[key] }
    return Object.values(next).some(Boolean) ? next : value
  })
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMN_ORDER_STORAGE_KEY) || 'null')
      return Array.isArray(saved) ? saved : null
    } catch { return null }
  })
  useEffect(() => {
    try {
      if (columnOrder) localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder))
      else localStorage.removeItem(COLUMN_ORDER_STORAGE_KEY)
    } catch (error) { console.warn('[SummaryReport] Failed to save column order:', error) }
  }, [columnOrder])
  const orderedColumns = useMemo(() => {
    if (!Array.isArray(columnOrder) || !columnOrder.length) return COLUMNS
    const map = new Map(COLUMNS.map(c => [c.key, c]))
    const out = []
    columnOrder.forEach(k => { if (map.has(k)) { out.push(map.get(k)); map.delete(k) } })
    map.forEach(c => out.push(c))
    return out
  }, [columnOrder])
  const resetColumns = () => { setColumnOrder(null); setVisibleColumns(getDefaultVisibleColumns()) }
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  useEffect(() => {
    if (!columnPickerOpen) return undefined
    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-summary-column-picker]')) setColumnPickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [columnPickerOpen])

  const shownColumns = orderedColumns.filter(c => visibleColumns[c.key])
  const shownMobileColumns = [
    ...(visibleColumns.login ? [COLUMNS.find(c => c.key === 'login')] : []),
    ...orderedColumns.filter(c => c.key !== 'login' && visibleColumns[c.key])
  ]
  const mobileGrid = mobileGridFor(shownMobileColumns)

  // ───────── Pagination / sorting / data ─────────
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  useEffect(() => { setPage(1) }, [isMobile])
  const effectivePageSize = isMobile ? MOBILE_PAGE_SIZE : pageSize
  const [sortBy, setSortBy] = useState('login')
  const [sortOrder, setSortOrder] = useState('asc')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exportProgress, setExportProgress] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const exporting = exportProgress !== null
  const exportControllerRef = useRef(null)
  useEffect(() => () => exportControllerRef.current?.abort(), [])
  const cancelExport = () => {
    exportControllerRef.current?.abort()
    exportControllerRef.current = null
    setExportProgress(null)
  }

  // POST /api/broker/reports/summary: an active login group becomes `mt5Accounts` (groups expand
  // to concrete logins — whether created by picking individual logins or by a login range — via
  // getGroupLogins, same as the Deals report). Search text (numeric logins included) is always
  // sent as `search`, which the server matches against login/name.
  const buildExtraBody = () => {
    const body = { sortBy, sortOrder }
    if (activeGroup) body.mt5Accounts = [...new Set(getGroupLogins(activeGroup.name).map(Number).filter(Number.isFinite))]
    if (search) body.search = search
    return body
  }

  useEffect(() => {
    if (!isAuthenticated) return undefined
    if (previousGroupKey.current !== groupKey) {
      previousGroupKey.current = groupKey
      if (page !== 1) {
        setPage(1)
        return undefined
      }
    }
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await brokerAPI.getSummaryReport({ from: range.from, to: range.to, page, limit: effectivePageSize, ...buildExtraBody() })
        if (cancelled) return
        const payload = response?.data ?? response ?? {}
        const data = payload?.summary || payload?.items || payload?.clients || payload?.rows || payload?.data || []
        const apiTotal = payload?.pagination?.total ?? payload?.total ?? payload?.totalCount ?? payload?.total_count
        setRows(Array.isArray(data) ? data : [])
        setTotal(apiTotal != null ? Number(apiTotal) || 0 : (Array.isArray(data) ? data.length : 0))
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError?.response?.data?.message || requestError?.message || 'Failed to load summary report')
          setRows([])
          setTotal(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, search, isAuthenticated, page, effectivePageSize, sortBy, sortOrder, reloadKey, groupKey])

  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  // When the on-screen keyboard has shrunk the visible viewport, let the mobile column-picker
  // sheet use nearly all of it (instead of the usual 85%) so its list has the most room above the keyboard.
  const keyboardLikelyOpen = typeof window !== 'undefined' && window.innerHeight - viewportHeight > 80
  const columnSheetMaxHeight = Math.round(viewportHeight * (keyboardLikelyOpen ? 0.98 : 0.85))
  // ~140px covers the sheet's header row + search row (incl. their padding/borders) — whatever's
  // left is what the list itself is allowed, as a hard pixel cap rather than a flex-based guess.
  const columnListMaxHeight = Math.max(160, columnSheetMaxHeight - 140)

  const handleSort = (key) => {
    if (sortBy === key) setSortOrder(value => value === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('asc') }
    setPage(1)
  }

  const handlePreset = (value) => {
    const next = getPresetRange(value)
    if (!next) return
    setPreset(value)
    setRange(next)
    setCustomFrom(toYmd(fromServerEpoch(next.from)))
    setCustomTo(toYmd(fromServerEpoch(next.to)))
    setPage(1)
    setError('')
  }

  const refreshData = () => {
    const next = getPresetRange(preset)
    if (next) setRange(next)
    else setReloadKey(value => value + 1)
  }

  const applyCustomDates = () => {
    if (!customFrom || !customTo || customFrom > customTo) {
      setError('Choose a valid date range before applying dates.')
      return
    }
    setError('')
    setDatePickerOpen(false)
    setPreset('custom')
    setRange({ from: ymdToEpoch(customFrom), to: ymdToEpoch(customTo, true) })
    setPage(1)
  }

  const clearCustomDates = () => {
    const today = toYmd(serverNowDate())
    setCustomFrom(today)
    setCustomTo(today)
    setDatePickerOpen(false)
    handlePreset('today')
  }

  // Page totals for the numeric columns currently shown (sum of the loaded page, not the full dataset)
  const pageTotals = useMemo(() => {
    const sums = {}
    shownColumns.forEach(col => {
      if (!col.numeric) return
      sums[col.key] = rows.reduce((total, row) => total + (Number(col.get(row)) || 0), 0)
    })
    return sums
  }, [rows, shownColumns])

  // Export every row for the current date range/group/search, fetched in chunks of EXPORT_CHUNK
  const handleExport = async () => {
    if (exportControllerRef.current) return
    const controller = new AbortController()
    exportControllerRef.current = controller
    setExportProgress({ done: 0, total })
    try {
      const extra = buildExtraBody()
      const getPayload = (res) => res?.data ?? res ?? {}
      const getRows = (payload) => payload?.summary || payload?.items || payload?.clients || payload?.rows || payload?.data || []
      const first = getPayload(await brokerAPI.getSummaryReport({ from: range.from, to: range.to, page: 1, limit: EXPORT_CHUNK, ...extra }, { signal: controller.signal }))
      if (controller.signal.aborted) return
      let all = getRows(first)
      const exportTotal = Number(first?.pagination?.total ?? first?.total ?? first?.totalCount ?? first?.total_count ?? all.length) || all.length
      const pages = Math.ceil(exportTotal / EXPORT_CHUNK)
      setExportProgress({ done: all.length, total: exportTotal })
      for (let p = 2; p <= pages; p++) {
        const payload = getPayload(await brokerAPI.getSummaryReport({ from: range.from, to: range.to, page: p, limit: EXPORT_CHUNK, ...extra }, { signal: controller.signal }))
        if (controller.signal.aborted) return
        const chunk = getRows(payload)
        if (!chunk.length) break
        all = all.concat(chunk)
        setExportProgress({ done: all.length, total: exportTotal })
      }
      if (controller.signal.aborted || !all.length) return
      const stamp = toYmd(serverNowDate())
      const excelColumns = shownColumns.map(c => c.numeric
        ? { key: c.key, label: c.label, value: c.get, type: 'number', digits: 2, signed: !!c.signed }
        : { key: c.key, label: c.label, value: c.get })
      const sum = (key) => all.reduce((total, r) => total + (Number(COLUMNS.find(c => c.key === key)?.get(r)) || 0), 0)
      const totals = {}
      shownColumns.forEach(c => { if (c.numeric) totals[c.key] = sum(c.key) })
      exportStyledExcel({
        title: 'Summary Report',
        meta: [
          `Period: ${toYmd(fromServerEpoch(range.from))} – ${toYmd(fromServerEpoch(range.to))}`,
          ...(activeGroupName ? [`Group: ${activeGroupName}`] : []),
          ...(search ? [`Search: ${search}`] : [])
        ],
        columns: excelColumns,
        sections: [{ rows: all, totals: { label: 'TOTAL', values: totals } }],
        sheetName: 'Summary',
        fileName: `summary_${stamp}.csv`
      })
    } catch (exportError) {
      if (controller.signal.aborted) return
      setError(exportError?.response?.data?.message || exportError?.message || 'Failed to export summary report')
    } finally {
      if (exportControllerRef.current === controller) {
        exportControllerRef.current = null
        setExportProgress(null)
      }
    }
  }

  const renderCell = (column, row) => {
    const value = column.get(row)
    if (column.key === 'login' && row.login != null && String(row.login).trim() !== '' && row.login !== '-') {
      return (
        <button
          type="button"
          onClick={() => setSelectedClient({ login: row.login, name: row.name || '' })}
          className="text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded-sm"
          aria-label={`Open client details for ${row.login}`}
        >
          {value}
        </button>
      )
    }
    if (column.numeric) {
      const cls = column.signed ? (value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-700') : 'text-gray-700'
      return <span className={cls}>{formatNumber(value)}</span>
    }
    return value
  }

  const iconButton = 'h-8 w-8 shrink-0 rounded-md border border-[#E5E7EB] bg-white text-[#374151] shadow-sm flex items-center justify-center transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

  const mobileDatePicker = (
    <div data-summary-datepicker="" role="dialog" aria-label="Custom date range" onKeyDown={event => { if (event.key === 'Escape') setDatePickerOpen(false) }} className="fixed left-1/2 top-28 z-[100] w-[280px] max-w-[calc(100vw-24px)] -translate-x-1/2 max-h-[calc(100dvh-124px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-left shadow-lg">
      <h3 className="text-sm font-semibold text-slate-800">Custom date range</h3>
      <p className="mt-1 text-[11px] text-slate-500">Filter the summary report for the selected period.</p>
      <div className="mt-4 space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          From
          <input type="date" aria-label="From date" value={customFrom} max={customTo || toYmd(serverNowDate())} onChange={event => setCustomFrom(event.target.value)} className="mt-1.5 block h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          To
          <input type="date" aria-label="To date" value={customTo} min={customFrom || undefined} max={toYmd(serverNowDate())} onChange={event => setCustomTo(event.target.value)} className="mt-1.5 block h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
        </label>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => { setCustomFrom(''); setCustomTo('') }} disabled={!customFrom && !customTo} className="h-9 rounded-md px-2 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:text-slate-300">Clear</button>
        <button type="button" onClick={applyCustomDates} disabled={!customFrom || !customTo || customFrom > customTo || customTo > toYmd(serverNowDate())} className="h-9 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Apply dates</button>
      </div>
    </div>
  )

  const datePickerPopover = datePickerOpen && (isMobile ? mobileDatePicker : (
    <div data-summary-datepicker="" className="absolute right-0 top-10 z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_12px_40px_rgba(15,23,42,0.16)]" role="dialog" aria-label="Date range" onKeyDown={event => { if (event.key === 'Escape') setDatePickerOpen(false) }}>
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M16 3v4M8 3v4M3 11h18" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Date range</h3>
          <p className="mt-0.5 text-xs text-slate-500">Choose the period for the summary</p>
        </div>
        <button type="button" onClick={() => setDatePickerOpen(false)} aria-label="Close date picker" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-blue-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-4 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-600">From date</p>
          <DateInputDMY className="mt-2 [&>input[type=text]]:h-11 [&>input[type=text]]:font-medium [&>button]:h-10 [&>button]:w-8 [&>button]:right-0.5" value={customFrom} max={customTo || undefined} onChange={setCustomFrom} ariaLabel="From date" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-600">To date</p>
          <DateInputDMY className="mt-2 [&>input[type=text]]:h-11 [&>input[type=text]]:font-medium [&>button]:h-10 [&>button]:w-8 [&>button]:right-0.5" value={customTo} min={customFrom || undefined} max={toYmd(serverNowDate())} onChange={setCustomTo} ariaLabel="To date" />
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
        <button type="button" onClick={clearCustomDates} className="h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-blue-600">Reset to today</button>
        <button type="button" onClick={applyCustomDates} className="h-11 flex-1 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-blue-600">Apply dates</button>
      </div>
    </div>
  ))

  const groupSelector = <GroupSelector
    moduleName="summary-report"
    onCreateClick={() => { setEditingGroup(null); setShowGroupModal(true) }}
    onEditClick={(group) => { setEditingGroup(group); setShowGroupModal(true) }}
  />

  const actionButtons = (
    <>
      <QuickTimeFilter value={preset} onChange={value => { handlePreset(value); setDatePickerOpen(false) }} />
      <div className="relative" data-summary-datepicker="">
        <button type="button" onClick={() => { if (isMobile && !datePickerOpen && preset !== 'custom') { setCustomFrom(''); setCustomTo('') } setDatePickerOpen(value => !value) }} className={iconButton} aria-expanded={datePickerOpen} aria-haspopup="dialog" aria-label="Choose custom dates">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
        </button>
        {!isMobile && datePickerPopover}
      </div>
      <button type="button" onClick={handleExport} disabled={exporting || loading} className={iconButton} aria-label="Export summary" title={exporting ? `Exporting ${exportProgress.done} / ${exportProgress.total}...` : 'Export this report to CSV'}>
        <svg className={`h-4 w-4 ${exporting ? 'animate-pulse text-blue-600' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
      </button>
      <button type="button" onClick={refreshData} disabled={loading} className={iconButton} aria-label="Refresh summary" title="Refresh">
        <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>
    </>
  )

  const exportingNote = exporting && (
    <LoadingSpinner
      onCancel={cancelExport}
      message="Exporting summary report…"
      subtitle={exportProgress.total ? `${exportProgress.done.toLocaleString('en-IN')} / ${exportProgress.total.toLocaleString('en-IN')} rows · Please wait` : 'Please wait'}
      progress={exportProgress.total ? Math.round((exportProgress.done / exportProgress.total) * 100) : null}
    />
  )

  const emptyOrError = error
    ? <div className="flex min-h-[200px] items-center justify-center px-5 text-center text-sm text-red-600">{error}</div>
    : (
      <div className="flex min-h-[200px] flex-col items-center justify-center px-5 text-center">
        <p className="text-sm font-semibold text-slate-700">No results found</p>
        <p className="mt-1 text-xs text-slate-500">{search ? 'Try a different search.' : 'Try a wider date range or a different group.'}</p>
      </div>
    )

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  const onPageInput = (event) => {
    const next = Number(event.target.value)
    if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next)
  }

  return (
    <div className="mobile-responsive-page h-screen flex bg-[#F8F8F8] md:bg-gradient-to-br md:from-blue-50 md:via-white md:to-blue-50 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch (error) { console.warn('[SummaryReport] Failed to save sidebar state:', error) } }}
        onToggle={() => setSidebarOpen(value => { const next = !value; try { localStorage.setItem('sidebarOpen', JSON.stringify(next)) } catch (error) { console.warn('[SummaryReport] Failed to save sidebar state:', error) }; return next })}
      />

      <main className={`flex-1 min-w-0 p-0 md:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        {/* ───────── Mobile ───────── */}
        <div className="md:hidden flex flex-1 flex-col overflow-hidden">
          <div ref={mobileHeaderRef} className="flex-wrap relative flex items-center px-4 py-4 bg-white border-b border-[#ECECEC]">
            <button type="button" onClick={() => setSidebarOpen(true)} className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center" aria-label="Open menu">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3"><h1 className="text-lg font-semibold text-[#000000] min-w-0 max-sm:text-sm">Summary</h1><BrokerCreditSummary variant="header" /></div>
          


<BrokerCreditSummary variant="desktop-header" />
</div>

          <div ref={mobileScrollAreaRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <div ref={mobileAboveTableRef}>
              <div className="pt-3 pb-2 px-2">
                <div className="flex w-full flex-nowrap items-center gap-1 overflow-x-auto py-1 [&>select]:w-[72px] [&>select]:h-7 [&>select]:px-1 [&>select]:text-[10px] [&>button]:h-7 [&>button]:w-7 [&>div]:shrink-0 [&>div[data-summary-datepicker]>button]:h-7 [&>div[data-summary-datepicker]>button]:w-7">
                  <div className="shrink-0">
                    <button type="button" onClick={openMobileFilters} aria-haspopup="dialog" aria-expanded={mobileFilterView !== null} title={activeGroupName ? `Group filter: ${activeGroupName}` : 'Customize view'} className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-medium shadow-sm ${activeGroupName ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-[#E5E7EB] bg-white text-[#374151]'}`}>
                      <svg className="h-3 w-3" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 3h14M4 6h10M6 9h6" /></svg>
                      Filter
                      {activeGroupName && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
                    </button>
                  </div>
                  {actionButtons}
                </div>
                {exportingNote}
              </div>

              <div className="mx-1 mb-2 bg-white rounded-xl border border-[#E5E7EB] shadow-sm px-2.5 py-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-[40%] max-w-[160px] min-w-0 h-7 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md px-2 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-[#9CA3AF]"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <input placeholder="Search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="flex-1 min-w-0 text-[11px] text-[#1F2937] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit" aria-label="Search clients" />
                  </div>
                  <button type="button" onClick={() => { setColumnSearch(''); setColumnPickerOpen(true) }} className="h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 flex-shrink-0 mr-auto" title="Show/Hide Columns" aria-label="Show or hide columns">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2" /><rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2" /></svg>
                  </button>
                  <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={prevDisabled} className={`h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center flex-shrink-0 ${prevDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`} aria-label="Previous page">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M12 14L8 10L12 6" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <div className="flex items-center gap-0.5 text-[11px] text-[#4B5563] flex-shrink-0">
                    <input type="number" min="1" max={totalPages} value={page} onChange={onPageInput} className="w-8 h-6 border border-[#E5E7EB] rounded-md text-center text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="Current page" />
                    <span className="text-[#9CA3AF]">/</span>
                    <span>{totalPages}</span>
                  </div>
                  <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={nextDisabled} className={`h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center flex-shrink-0 ${nextDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`} aria-label="Next page">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 6L12 10L8 14" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <div ref={mobileCardRef} className="bg-white shadow-sm border border-blue-100 overflow-hidden mx-1">
              {/* Fixed `height` (not `maxHeight`): the card's white background always fills the
                  remaining screen space down to the bottom, even when a page has few rows, so there's
                  no gray page background showing through below it. */}
              <div className="mobile-table-scroll w-full overflow-x-auto overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y', scrollbarWidth: 'none', height: mobileTableMaxHeight }}>
                <div className="relative" style={{ minWidth: 'max-content' }}>
                  <div data-mobile-data-row="header" className="grid bg-blue-500 text-white text-[10px] font-semibold font-outfit sticky top-0 z-20 shadow-[0_2px_4px_rgba(0,0,0,0.1)]" style={{ gridTemplateColumns: mobileGrid }}>
                    {shownMobileColumns.map(column => (
                      <div key={column.key} onClick={() => handleSort(column.key)} className={`h-[32px] flex items-center px-1 cursor-pointer select-none ${column.key === 'login' ? 'sticky left-0 z-30 bg-blue-500 px-2' : ''}`}>
                        <span className="truncate">{column.label}</span>
                        {sortBy === column.key && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                      </div>
                    ))}
                  </div>

                  {loading ? (
                    Array.from({ length: MOBILE_PAGE_SIZE }, (_, row) => (
                      <div data-mobile-data-row="body" key={`sk-${row}`} className="grid bg-white border-b border-[#E1E1E1]" style={{ gridTemplateColumns: mobileGrid }}>
                        {shownMobileColumns.map(column => (
                          <div key={column.key} className={`h-[38px] flex items-center px-1 ${column.key === 'login' ? 'sticky left-0 bg-white z-10' : ''}`}>
                            <div className="h-3 w-full max-w-[80%] rounded bg-gray-200 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    ))
                  ) : rows.length ? (
                    rows.map((row, index) => (
                      <div data-mobile-data-row="body" key={`${row.login ?? 'r'}-m-${index}`} className="grid text-[10px] text-[#4B4B4B] font-outfit bg-white border-b border-[#E1E1E1] hover:bg-[#F8FAFC]" style={{ gridTemplateColumns: mobileGrid }}>
                        {shownMobileColumns.map(column => (
                          <div
                            key={column.key}
                            className={`h-[38px] flex items-center px-1 min-w-0 ${column.key === 'login' ? 'sticky left-0 bg-white z-10 px-2 text-[#1A63BC] font-semibold' : ''}`}
                            style={column.key === 'login' ? { boxShadow: '2px 0 4px rgba(0,0,0,0.05)' } : undefined}
                          >
                            <span className="truncate">{renderCell(column, row)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : null}
                  <div aria-hidden="true" className="mobile-table-end" />
                </div>
                {!loading && !rows.length && emptyOrError}
              </div>
            </div>
          </div>
        </div>

        {/* ───────── Tablet / desktop ───────── */}
        <div className="hidden md:flex max-w-full mx-auto w-full flex-col flex-1 overflow-hidden">
          <div className="bg-white rounded-2xl shadow-sm px-6 py-3 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F8F8F8] text-slate-900" aria-label="Open menu">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3"><h1 className="truncate text-xl font-bold text-[#1A1A1A] min-w-0 max-sm:text-sm">Summary Report</h1><BrokerCreditSummary variant="header" /></div>
                  <p className="text-xs text-[#6B7280] mt-0.5">Client balances, volume and P&amp;L for the selected period</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {groupSelector}
                {actionButtons}
              </div>
            </div>
            {exportingNote}
          


<BrokerCreditSummary variant="desktop-header" />
</div>

          <div className="bg-white rounded-lg shadow-sm border border-[#E5E7EB] overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="border-b border-[#E5E7EB] p-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') submitSearch() }}
                    placeholder="Search login or name"
                    className="w-full h-10 pl-4 pr-20 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    aria-label="Search clients"
                  />
                  {searchInput && (
                    <button type="button" onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }} className="absolute right-12 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563]" title="Clear search">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                  <button type="button" onClick={submitSearch} className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-9 rounded-md bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-sm" title="Search" aria-label="Search">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                </div>
                <div className="relative mr-auto" data-summary-column-picker="">
                  <button type="button" onClick={() => { setColumnSearch(''); setColumnPickerOpen(value => !value) }} className="h-10 w-10 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors" title="Show/Hide Columns" aria-label="Show or hide columns" aria-expanded={columnPickerOpen}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <line x1="2" y1="4" x2="14" y2="4" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" /><circle cx="6" cy="4" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5" />
                      <line x1="2" y1="8" x2="14" y2="8" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" /><circle cx="11" cy="8" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5" />
                      <line x1="2" y1="12" x2="14" y2="12" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round" /><circle cx="7" cy="12" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5" />
                    </svg>
                  </button>
                  {columnPickerOpen && (
                    <div className="hidden md:flex absolute left-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-0 z-50 flex-col" style={{ width: 280, maxHeight: '60vh' }}>
                      <div className="px-3 py-2 border-b border-[#F3F4F6] flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#1F2937] uppercase">Show/Hide & Reorder</p>
                        <div className="relative group">
                          <button type="button" onClick={resetColumns} className="p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors" aria-label="Reset columns">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20v-6h-6" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10a8 8 0 0114-3m2 7a8 8 0 01-14 3" />
                            </svg>
                          </button>
                          <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-gray-900 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow">Reset Columns</span>
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 flex flex-col">
                        <ColumnChooserList
                          columns={COLUMNS}
                          visibleColumns={visibleColumns}
                          onToggle={toggleColumn}
                          columnOrder={columnOrder}
                          onReorder={(newOrder) => setColumnOrder(newOrder)}
                          accent="blue"
                          title={null}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <PageSizeSelect value={pageSize} onChange={(value) => { setPageSize(Number(value)); setPage(1) }} options={PAGE_SIZE_OPTIONS} />
                  <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={prevDisabled} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${prevDisabled ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed' : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'}`} aria-label="Previous page">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <div className="flex items-center gap-1 text-sm font-medium text-[#374151]">
                    <input type="number" min="1" max={totalPages} value={page} onChange={onPageInput} className="w-12 h-7 border border-[#E5E7EB] rounded-lg text-center text-sm font-semibold text-[#1F2937]" aria-label="Current page" />
                    <span className="text-[#9CA3AF]">/</span>
                    <span className="text-[#6B7280]">{totalPages}</span>
                  </div>
                  <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={nextDisabled} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${nextDisabled ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed' : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'}`} aria-label="Next page">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9ca3af #e5e7eb' }}>
              {(
                  <table className="min-w-full text-xs border-separate border-spacing-0">
                    <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                      <tr>
                        {shownColumns.map(column => (
                          <th key={column.key} className="px-3 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap bg-blue-600 hover:bg-blue-700 transition-colors select-none border-r border-blue-400 last:border-r-0">
                            <button type="button" onClick={() => handleSort(column.key)} className="inline-flex items-center gap-1 uppercase">
                              {column.label}
                              {sortBy === column.key && <span className="text-[9px]" aria-hidden="true">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody aria-busy={loading}>
                      {loading ? Array.from({ length: Math.min(effectivePageSize, 20) }, (_, row) => (
                        <tr key={`sk-${row}`} className={row % 2 ? 'bg-[#F9FAFB]' : 'bg-white'}>
                          {shownColumns.map(column => (
                            <td key={column.key} className="px-3 py-3 border-b border-r border-[#E5E7EB] last:border-r-0">
                              <div className="h-3.5 min-w-[48px] rounded bg-gray-200 animate-pulse" style={{ width: column.key === 'name' ? 110 : 64 }} />
                            </td>
                          ))}
                        </tr>
                      )) : !rows.length ? (
                        <tr>
                          <td colSpan={Math.max(1, shownColumns.length)} className="p-0">
                            <div className="sticky left-0 w-full">{emptyOrError}</div>
                          </td>
                        </tr>
                      ) : rows.map((row, index) => (
                        <tr key={`${row.login ?? 'r'}-${index}`} className={`${index % 2 ? 'bg-[#F9FAFB]' : 'bg-white'} hover:bg-blue-50`}>
                          {shownColumns.map(column => (
                            <td
                              key={column.key}
                              className={`px-3 py-2.5 whitespace-nowrap text-sm border-b border-r border-[#E5E7EB] last:border-r-0 ${column.key === 'login' ? 'text-blue-600' : column.key === 'name' ? 'text-gray-900' : 'text-gray-700'}`}
                            >
                              {renderCell(column, row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {!loading && rows.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100 font-semibold sticky bottom-0">
                          {shownColumns.map((column, i) => (
                            <td key={column.key} className="px-3 py-2 border-t-2 border-slate-300 whitespace-nowrap text-gray-700" style={column.numeric && pageTotals[column.key] < 0 ? { color: '#dc2626' } : undefined}>
                              {i === 0 ? 'Total' : column.numeric ? formatNumber(pageTotals[column.key]) : ''}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                )}
            </div>
          </div>
        </div>
      </main>

      {selectedClient && (isMobile ? (
        <ClientDetailsMobileModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          allPositionsCache={EMPTY_CLIENT_CACHE}
          allOrdersCache={EMPTY_CLIENT_CACHE}
        />
      ) : (
        <ClientPositionsModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onClientUpdate={ignoreClientUpdate}
          allPositionsCache={EMPTY_CLIENT_CACHE}
          allOrdersCache={EMPTY_CLIENT_CACHE}
          onCacheUpdate={ignoreClientUpdate}
        />
      ))}

      {isMobile && datePickerOpen && createPortal(datePickerPopover, document.body)}
      {isMobile && (
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
            onClose={() => setMobileFilterView(view => view === 'groups' ? null : view)}
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

      {/* Mobile column picker (bottom sheet) */}
      {columnPickerOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setColumnPickerOpen(false)}>
          <div data-summary-column-picker="" className="bg-white w-full rounded-t-[24px] overflow-hidden" style={{ maxHeight: columnSheetMaxHeight, display: 'flex', flexDirection: 'column' }} onClick={(event) => event.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-[#000000]">Show/Hide Columns</h3>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setVisibleColumns(getDefaultVisibleColumns())} className="text-xs font-medium text-blue-600">Reset</button>
                <button type="button" onClick={() => setColumnPickerOpen(false)} aria-label="Close">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#404040" strokeWidth="2" /></svg>
                </button>
              </div>
            </div>
            <div className="px-5 py-3 border-b border-[#E5E7EB] flex-shrink-0">
              <div className="relative h-11">
                <input type="text" placeholder="Search Columns" value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} className="w-full h-11 pl-11 pr-4 bg-gray-100 border-0 rounded-xl text-xs text-black font-semibold font-outfit placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </div>
            </div>
            {/* An explicit pixel max-height (not flex-1/min-h-0) guarantees this list scrolls —
                flex-based auto-sizing is what kept silently failing to shrink in testing. */}
            <div
              className="overflow-y-auto overscroll-contain px-5 py-2"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', maxHeight: columnListMaxHeight }}
            >
              {COLUMNS.filter(column => column.label.toLowerCase().includes(columnSearch.trim().toLowerCase())).map(column => (
                <label key={column.key} className="flex items-center justify-between py-3 border-b border-[#F2F2F7] last:border-0">
                  <span className="text-sm text-[#000000] font-outfit">{column.label}</span>
                  <div className="relative inline-block w-12 h-6">
                    <input type="checkbox" checked={!!visibleColumns[column.key]} onChange={() => toggleColumn(column.key)} className="sr-only peer" />
                    <div className="w-12 h-6 bg-gray-300 rounded-full peer-checked:bg-blue-600 transition-colors" />
                    <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6" />
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <GroupModal
        isOpen={showGroupModal}
        onClose={() => { setShowGroupModal(false); setEditingGroup(null) }}
        availableItems={rows}
        loginField="login"
        displayField="name"
        editGroup={editingGroup}
      />
    </div>
  )
}

export default SummaryReportPage
