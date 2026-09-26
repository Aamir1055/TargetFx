import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import ClientPositionsModal from '../components/ClientPositionsModal'
import ClientDetailsMobileModal from '../components/ClientDetailsMobileModal'
import PageSizeSelect from '../components/PageSizeSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import ColumnChooserList from '../components/ColumnChooserList'
import { formatTime as apiFormatTime, serverNowDate, serverNowEpoch, serverEpochFromParts, fromServerEpoch } from '../utils/dateFormatter'
import DateInputDMY from '../components/DateInputDMY'
import { exportStyledExcel, actionColor } from '../utils/exportStyledExcel'

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

const formatTime = (value) => apiFormatTime(value, '-')

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

// Same presets (and ranges) as the Deals tab in the login details modal
const QUICK_FILTERS = [
  { value: 'today', label: 'Today' },
  { value: 'lastweek', label: 'Last Week' },
  { value: 'lastmonth', label: 'Last Month' },
  { value: 'last3months', label: 'Last 3 Months' },
  { value: 'last6months', label: 'Last 6 Months' },
  { value: 'allhistory', label: 'All History' }
]
// All ranges are in server (MT5) time: they start at 00:00:00 of the first day and run until now.
// "Today" is the current server calendar day; "Last Week" is today plus the 6 days before it, etc.
const PRESET_DAYS = { today: 1, lastweek: 7, lastmonth: 30, last3months: 90, last6months: 180 }
const getPresetRange = (preset) => {
  const to = serverNowEpoch()
  const today = serverNowDate()
  const startOfDay = (date) => serverEpochFromParts(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
  if (PRESET_DAYS[preset]) {
    const first = new Date(today)
    first.setDate(today.getDate() - (PRESET_DAYS[preset] - 1))
    return { from: startOfDay(first), to }
  }
  if (preset === 'allhistory') return { from: serverEpochFromParts(today.getFullYear() - 2, 0, 1, 0, 0, 0), to }
  return null
}

const DEAL_ACTIONS = {
  0: 'Buy', 1: 'Sell', 2: 'Balance', 3: 'Credit', 4: 'Charge', 5: 'Correction', 6: 'Bonus',
  7: 'Commission', 8: 'Daily Commission', 9: 'Monthly Commission', 10: 'Agent Daily',
  11: 'Agent Monthly', 12: 'Intergroup Agent'
}
const getDealActionLabel = (action) => {
  if (action === null || action === undefined || action === '') return '-'
  const numeric = Number(action)
  if (Number.isInteger(numeric) && DEAL_ACTIONS[numeric]) return DEAL_ACTIONS[numeric]
  return String(action).toUpperCase()
}
const getDealActionClass = (label) => {
  const text = String(label).toUpperCase()
  if (text === 'BUY') return 'bg-green-100 text-green-800'
  if (text === 'SELL') return 'bg-red-100 text-red-800'
  return 'bg-blue-50 text-blue-700'
}

const COLUMNS = [
  { key: 'deal', label: 'Deal', get: d => d.deal ?? d.id ?? '-' },
  { key: 'time', label: 'Time', get: d => formatTime(d.time ?? d.timeStr) },
  { key: 'login', label: 'Login', get: d => d.login ?? '-' },
  { key: 'name', label: 'Name', get: d => d.name || '-' },
  { key: 'action', label: 'Action', get: d => getDealActionLabel(d.action) },
  { key: 'symbol', label: 'Symbol', get: d => d.symbol || '-' },
  { key: 'volume', label: 'Volume', numeric: true, get: d => Number(d.volume || 0) },
  { key: 'price', label: 'Price', numeric: true, get: d => Number(d.price || 0) },
  { key: 'profit', label: 'Profit', numeric: true, get: d => Number(d.profit || 0) },
  { key: 'commission', label: 'Commission', numeric: true, get: d => Number(d.commission || 0) },
  { key: 'storage', label: 'Swap', numeric: true, get: d => Number(d.storage || 0) },
  { key: 'order', label: 'Order', get: d => Number(d.order) > 0 ? d.order : '-' },
  { key: 'position', label: 'Position', get: d => Number(d.position) > 0 ? d.position : '-' },
  { key: 'comment', label: 'Comment', get: d => d.comment || '' }
]

// Mobile grid: Login first and sticky, like the other mobile modules
const MOBILE_WIDTHS = { login: 72, time: 118, deal: 72, name: 90, action: 64, symbol: 110, volume: 64, price: 80, profit: 84, commission: 76, storage: 64, order: 72, position: 72, comment: 120 }
const MOBILE_COLUMNS = [
  COLUMNS.find(c => c.key === 'login'),
  ...COLUMNS.filter(c => c.key !== 'login')
]
const mobileGridFor = (columns) => columns.map(c => `${MOBILE_WIDTHS[c.key] || 80}px`).join(' ')

// Column picker: these are on by default; Commission, Swap, Order, Position and Comment start off
const DEFAULT_VISIBLE_KEYS = ['deal', 'time', 'login', 'name', 'action', 'symbol', 'volume', 'price', 'profit']
const getDefaultVisibleColumns = () => Object.fromEntries(COLUMNS.map(c => [c.key, DEFAULT_VISIBLE_KEYS.includes(c.key)]))
const VISIBLE_COLUMNS_STORAGE_KEY = 'dealsReportVisibleColumns'

const formatPrice =(value) => formatNumber(value, value !== 0 && Math.abs(value) < 10 ? 5 : 2)

const DealsReportPage = () => {
  const [selectedClient, setSelectedClient] = useState(null)
  const { isAuthenticated } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) return false
      const value = localStorage.getItem('sidebarOpen')
      return value === null ? true : JSON.parse(value)
    } catch { return true }
  })
  const [preset, setPreset] = useState('today')
  const [range, setRange] = useState(() => getPresetRange('today'))
  const [customFrom, setCustomFrom] = useState(() => toYmd(serverNowDate()))
  const [customTo, setCustomTo] = useState(() => toYmd(serverNowDate()))
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VISIBLE_COLUMNS_STORAGE_KEY) || 'null')
      if (saved && typeof saved === 'object') return { ...getDefaultVisibleColumns(), ...saved }
    } catch {}
    return getDefaultVisibleColumns()
  })
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  useEffect(() => {
    try { localStorage.setItem(VISIBLE_COLUMNS_STORAGE_KEY, JSON.stringify(visibleColumns)) } catch {}
  }, [visibleColumns])
  const toggleColumn = (key) => setVisibleColumns(value => {
    const next = { ...value, [key]: !value[key] }
    // keep at least one column visible
    return Object.values(next).some(Boolean) ? next : value
  })
  // Column order (drag to reorder in the picker) - persisted, same as Live Dealing
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dealsReportColumnOrder') || 'null')
      return Array.isArray(saved) ? saved : null
    } catch { return null }
  })
  useEffect(() => {
    try {
      if (columnOrder) localStorage.setItem('dealsReportColumnOrder', JSON.stringify(columnOrder))
      else localStorage.removeItem('dealsReportColumnOrder')
    } catch {}
  }, [columnOrder])
  const orderedColumns = (() => {
    if (!Array.isArray(columnOrder) || !columnOrder.length) return COLUMNS
    const map = new Map(COLUMNS.map(c => [c.key, c]))
    const out = []
    columnOrder.forEach(k => { if (map.has(k)) { out.push(map.get(k)); map.delete(k) } })
    map.forEach(c => out.push(c))
    return out
  })()

  // Pinned (frozen) columns - persisted
  const [pinnedColumns, setPinnedColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dealsReportPinnedColumns') || '[]')
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('dealsReportPinnedColumns', JSON.stringify(pinnedColumns)) } catch {}
  }, [pinnedColumns])
  const togglePinColumn = (key) => setPinnedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const resetColumns = () => {
    setColumnOrder(null)
    setPinnedColumns([])
    setVisibleColumns(getDefaultVisibleColumns())
  }

  const shownColumns = orderedColumns.filter(c => visibleColumns[c.key])
  // Mobile keeps Login as the first (sticky) column, the rest follow the chosen order
  const shownMobileColumns = [
    ...(visibleColumns.login ? [COLUMNS.find(c => c.key === 'login')] : []),
    ...orderedColumns.filter(c => c.key !== 'login' && visibleColumns[c.key])
  ]

  // Sticky offsets for pinned columns (pinned cells get a fixed width)
  const PINNED_WIDTH = 150
  const pinnedOffsets = {}
  shownColumns.reduce((offset, c) => {
    if (!pinnedColumns.includes(c.key)) return offset
    pinnedOffsets[c.key] = offset
    return offset + PINNED_WIDTH
  }, 0)
  const pinStyle = (key, isHeader, background) => {
    if (!pinnedColumns.includes(key)) return undefined
    return {
      position: 'sticky',
      left: pinnedOffsets[key] || 0,
      zIndex: isHeader ? 21 : 5,
      width: PINNED_WIDTH,
      minWidth: PINNED_WIDTH,
      maxWidth: PINNED_WIDTH,
      backgroundColor: isHeader ? '#2563eb' : background,
      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)'
    }
  }
  const mobileGrid = mobileGridFor(shownMobileColumns)

  // Close the desktop column picker on outside click
  useEffect(() => {
    if (!columnPickerOpen) return undefined
    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-deals-column-picker]')) setColumnPickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [columnPickerOpen])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  // Mobile view (below md) always shows MOBILE_PAGE_SIZE rows per page
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  useEffect(() => { setPage(1) }, [isMobile])
  const effectivePageSize = isMobile ? MOBILE_PAGE_SIZE : pageSize
  const [sortBy, setSortBy] = useState('time')
  const [sortOrder, setSortOrder] = useState('desc')
  const [deals, setDeals] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [exportProgress, setExportProgress] = useState(null)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const exporting = exportProgress !== null

  useEffect(() => {
    if (!datePickerOpen) return undefined
    const handlePointerDown = (event) => {
      if (!event.target.closest?.('[data-deals-datepicker]')) setDatePickerOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [datePickerOpen])

  // Mobile searches as you type (debounced). Desktop searches on the search button / Enter,
  // but clearing the box still resets the results right away.
  useEffect(() => {
    if (!isMobile && searchInput.trim()) return undefined
    const timer = setTimeout(() => {
      const next = searchInput.trim()
      if (next !== search) {
        setSearch(next)
        setPage(1)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput, search, isMobile])

  const submitSearch = () => {
    const next = searchInput.trim()
    if (next === search) setReloadKey(value => value + 1)
    else setSearch(next)
    setPage(1)
  }

  // POST /api/broker/deals/search: `search` is an ILIKE match on symbol and comment only,
  // so a numeric query is sent as a login filter instead. The time column sorts as `deal_time`.
  const buildExtraBody = () => {
    const body = { sortBy: sortBy === 'time' ? 'deal_time' : sortBy, sortOrder }
    if (/^\d+$/.test(search)) body.filters = [{ field: 'login', operator: 'equal', value: Number(search) }]
    else if (search) body.search = search
    return body
  }

  useEffect(() => {
    if (!isAuthenticated) return undefined
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await brokerAPI.getAllDeals(range.from, range.to, effectivePageSize, page, buildExtraBody())
        if (cancelled) return
        const payload = response?.data ?? response ?? {}
        const rows = payload?.deals || payload?.items || []
        const apiTotal = payload?.total ?? payload?.totalCount ?? payload?.total_count ?? payload?.pagination?.total
        setDeals(Array.isArray(rows) ? rows : [])
        setTotal(apiTotal != null ? Number(apiTotal) || 0 : rows.length)
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError?.response?.data?.message || requestError?.message || 'Failed to load deals')
          setDeals([])
          setTotal(0)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, search, isAuthenticated, page, effectivePageSize, sortBy, sortOrder, reloadKey])

  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))

  const handleSort = (key) => {
    if (sortBy === key) setSortOrder(value => value === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('desc') }
    setPage(1)
  }

  const handlePreset = (value) => {
    const next = getPresetRange(value)
    if (!next) return
    setPreset(value)
    setRange(next)
    // Keep the custom date fields in sync with the chosen preset
    setCustomFrom(toYmd(fromServerEpoch(next.from)))
    setCustomTo(toYmd(fromServerEpoch(next.to)))
    setPage(1)
    setError('')
  }

  // Refresh: presets end at "now", so recompute the range to include new deals
  const refreshDeals = () => {
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

  // Export every deal in the current range/search, fetched in chunks of 500
  const handleExport = async () => {
    if (exporting) return
    setExportProgress({ done: 0, total })
    try {
      const extra = buildExtraBody()
      const getPayload = (res) => res?.data ?? res ?? {}
      const first = getPayload(await brokerAPI.getAllDeals(range.from, range.to, EXPORT_CHUNK, 1, extra))
      let rows = first?.deals || first?.items || []
      const exportTotal = Number(first?.total ?? first?.totalCount ?? rows.length) || rows.length
      const pages = Math.ceil(exportTotal / EXPORT_CHUNK)
      setExportProgress({ done: rows.length, total: exportTotal })
      for (let p = 2; p <= pages; p++) {
        const payload = getPayload(await brokerAPI.getAllDeals(range.from, range.to, EXPORT_CHUNK, p, extra))
        const chunk = payload?.deals || payload?.items || []
        if (!chunk.length) break
        rows = rows.concat(chunk)
        setExportProgress({ done: rows.length, total: exportTotal })
      }
      if (!rows.length) return
      const stamp = toYmd(serverNowDate())
      // Excel columns follow the visible table columns; Time is split into Date + Time
      const SIGNED = new Set(['profit', 'commission', 'storage'])
      const priceDigits = Math.min(5, Math.max(2, ...rows.map(d => (String(d.price ?? '').split('.')[1] || '').length)))
      const excelColumns = shownColumns.flatMap(c => {
        if (c.key === 'time') {
          const parts = (d) => String(c.get(d) || '').split(' ')
          return [
            { key: 'date', label: 'Date', value: d => parts(d)[0] || '', align: 'center' },
            { key: 'time', label: 'Time', value: d => parts(d)[1] || '', align: 'center' }
          ]
        }
        if (c.key === 'action') return [{ key: c.key, label: c.label, value: c.get, align: 'center', colorFor: actionColor }]
        if (c.numeric) return [{ key: c.key, label: c.label, value: c.key, type: 'number', digits: c.key === 'price' ? priceDigits : 2, signed: SIGNED.has(c.key) }]
        return [{ key: c.key, label: c.label, value: c.get }]
      })
      const sum = (key) => rows.reduce((total, d) => total + (Number(d[key]) || 0), 0)
      exportStyledExcel({
        showTitle: false,
        columns: excelColumns,
        sections: [{
          rows,
          totals: { label: 'TOTAL', values: { volume: sum('volume'), profit: sum('profit'), commission: sum('commission'), storage: sum('storage') } }
        }],
        sheetName: 'Deals',
        fileName: `deals_${preset}_${stamp}.xlsx`
      })
    } catch (exportError) {
      setError(exportError?.response?.data?.message || exportError?.message || 'Failed to export deals')
    } finally {
      setExportProgress(null)
    }
  }

  const renderCell = (column, deal) => {
    const value = column.get(deal)
    if (column.key === 'login' && deal.login != null && String(deal.login).trim() !== '' && deal.login !== '-') {
      return (
        <button
          type="button"
          onClick={() => setSelectedClient({ login: deal.login, name: deal.name || '' })}
          className="text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 rounded-sm"
          aria-label={`Open client details for ${deal.login}`}
        >
          {value}
        </button>
      )
    }
    if (column.key === 'action') {
      return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${getDealActionClass(value)}`}>{value}</span>
    }
    if (column.key === 'profit') {
      return <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>{formatNumber(value)}</span>
    }
    if (column.key === 'price') return formatPrice(value)
    if (column.numeric) return formatNumber(value)
    return value
  }

  const quickFilterSelect = (extraClass = '') => (
    <select
      value={QUICK_FILTERS.some(f => f.value === preset) ? preset : ''}
      onChange={(event) => handlePreset(event.target.value)}
      className={`h-8 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs font-medium text-[#374151] shadow-sm transition-colors hover:bg-gray-50 focus:outline-none cursor-pointer ${extraClass}`}
      aria-label="Quick filters"
    >
      <option value="" disabled>{preset === 'custom' ? 'Custom' : 'Quick Filters'}</option>
      {QUICK_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
    </select>
  )

  const iconButton = 'h-8 w-8 shrink-0 rounded-md border border-[#E5E7EB] bg-white text-[#374151] shadow-sm flex items-center justify-center transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'

  // Clear custom dates and go back to the default quick filter (Today)
  const clearCustomDates = () => {
    const today = toYmd(serverNowDate())
    setCustomFrom(today)
    setCustomTo(today)
    setDatePickerOpen(false)
    handlePreset('today')
  }

  const datePickerPopover = datePickerOpen && (
    <div data-deals-datepicker="" className={`${isMobile ? 'fixed inset-x-3 top-28 z-[100] max-h-[calc(100dvh-124px)] overflow-y-auto' : 'absolute right-0 top-10 z-50 w-80'} rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl`} role="dialog" aria-label="Custom date range">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">Custom date range</h3>
        <button type="button" onClick={() => setDatePickerOpen(false)} aria-label="Close date picker" className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Show deals made in the selected period.</p>
      <div className="mt-3 grid grid-cols-1 min-[360px]:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-slate-600">From<DateInputDMY className="mt-1" value={customFrom} max={customTo || undefined} onChange={setCustomFrom} ariaLabel="From date" /></label>
        <label className="text-xs font-semibold text-slate-600">To<DateInputDMY className="mt-1" value={customTo} min={customFrom || undefined} max={toYmd(serverNowDate())} onChange={setCustomTo} ariaLabel="To date" /></label>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2"><button type="button" onClick={clearCustomDates} className="h-8 rounded-md border border-[#E5E7EB] bg-white px-4 text-xs font-semibold text-[#374151] shadow-sm hover:bg-gray-50">Clear</button><button type="button" onClick={applyCustomDates} className="h-8 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-blue-700">Apply dates</button></div>
    </div>
  )

  const actionButtons = (
    <>
      <div className="relative" data-deals-datepicker="">
        <button type="button" onClick={() => setDatePickerOpen(value => !value)} className={iconButton} aria-expanded={datePickerOpen} aria-haspopup="dialog" title="Custom date range">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M8 2.5v4M16 2.5v4M3 9h18" /></svg>
        </button>
        {!isMobile && datePickerPopover}
      </div>
      <button type="button" onClick={handleExport} disabled={exporting || loading || !total} className={iconButton} aria-label="Export deals" title={exporting ? `Exporting ${exportProgress.done} / ${exportProgress.total}...` : 'Export all deals in this range to Excel'}>
        <svg className={`h-4 w-4 ${exporting ? 'animate-pulse text-blue-600' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
      </button>
      <button type="button" onClick={refreshDeals} disabled={loading} className={iconButton} aria-label="Refresh deals" title="Refresh deals">
        <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
      </button>
    </>
  )

  // Full-screen export dialog (same as Bills export), shown in both mobile and desktop views
  const exportingNote = exporting && (
    <LoadingSpinner
      message="Exporting all deals…"
      subtitle={exportProgress.total ? `${exportProgress.done.toLocaleString('en-IN')} / ${exportProgress.total.toLocaleString('en-IN')} deals · Please wait` : 'Please wait'}
      progress={exportProgress.total ? Math.round((exportProgress.done / exportProgress.total) * 100) : null}
    />
  )

  const emptyOrError = error
    ? <div className="flex min-h-[200px] items-center justify-center px-5 text-center text-sm text-red-600">{error}</div>
    : (
      <div className="flex min-h-[200px] flex-col items-center justify-center px-5 text-center">
        <p className="text-sm font-semibold text-slate-700">No deals found</p>
        <p className="mt-1 text-xs text-slate-500">{search ? 'Try a different search.' : 'Try a wider date range from Quick Filters.'}</p>
      </div>
    )

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  const onPageInput = (event) => {
    const next = Number(event.target.value)
    if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next)
  }

  return (
    <div className="h-screen flex bg-[#F8F8F8] md:bg-gradient-to-br md:from-blue-50 md:via-white md:to-blue-50 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(value => { const next = !value; try { localStorage.setItem('sidebarOpen', JSON.stringify(next)) } catch {}; return next })}
      />

      <main className={`flex-1 min-w-0 p-0 md:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        {/* ───────── Mobile (matches the other mobile modules) ───────── */}
        <div className="md:hidden flex flex-1 flex-col overflow-hidden">
          <div className="relative flex items-center px-4 py-4 bg-white border-b border-[#ECECEC]">
            <button type="button" onClick={() => setSidebarOpen(true)} className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center" aria-label="Open menu">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <h1 className="text-lg font-semibold text-[#000000] absolute left-1/2 -translate-x-1/2">Deals</h1>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {/* Toolbar */}
            <div className="pt-3 pb-2 px-2">
              <div className="flex items-center gap-2">
                {quickFilterSelect('h-8 rounded-[12px] text-[11px]')}
                {actionButtons}
              </div>
              {exportingNote}
            </div>

            {/* Search + pagination */}
            <div className="mx-1 mb-1 px-3 py-3">
              <div className="flex items-center gap-1">
                <div className="w-[45%] max-w-[180px] min-w-0 h-7 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md px-2 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-[#9CA3AF]"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  <input placeholder="Search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="flex-1 min-w-0 text-[11px] text-[#1F2937] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit" aria-label="Search deals" />
                </div>
                <button type="button" onClick={() => { setColumnSearch(''); setColumnPickerOpen(true) }} className="h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 flex-shrink-0 mr-auto" title="Show/Hide Columns" aria-label="Show or hide columns">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2" /><rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2" /></svg>
                </button>
                <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={prevDisabled} className={`h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center flex-shrink-0 ${prevDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`} aria-label="Previous page">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M12 14L8 10L12 6" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <div className="flex items-center gap-0.5 text-[11px] text-[#4B5563]">
                  <input type="number" min="1" max={totalPages} value={page} onChange={onPageInput} className="w-8 h-6 border border-[#E5E7EB] rounded-md text-center text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="Current page" />
                  <span className="text-[#9CA3AF]">/</span>
                  <span>{totalPages}</span>
                </div>
                <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={nextDisabled} className={`h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center flex-shrink-0 ${nextDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`} aria-label="Next page">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M8 6L12 10L8 14" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white shadow-sm border border-blue-100 overflow-hidden mx-1">
              <div className="w-full overflow-x-auto overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', maxHeight: 'calc(100dvh - 230px)' }}>
                <div className="relative" style={{ minWidth: 'max-content' }}>
                  <div className="grid bg-blue-500 text-white text-[10px] font-semibold font-outfit sticky top-0 z-20 shadow-[0_2px_4px_rgba(0,0,0,0.1)]" style={{ gridTemplateColumns: mobileGrid }}>
                    {shownMobileColumns.map(column => (
                      <div key={column.key} onClick={() => handleSort(column.key)} className={`h-[32px] flex items-center px-1 cursor-pointer select-none ${column.key === 'login' ? 'sticky left-0 z-30 bg-blue-500 px-2' : ''}`}>
                        <span className="truncate">{column.label}</span>
                        {sortBy === column.key && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                      </div>
                    ))}
                  </div>

                  {loading ? (
                    Array.from({ length: MOBILE_PAGE_SIZE }, (_, row) => (
                      <div key={`sk-${row}`} className="grid bg-white border-b border-[#E1E1E1]" style={{ gridTemplateColumns: mobileGrid }}>
                        {shownMobileColumns.map(column => (
                          <div key={column.key} className={`h-[38px] flex items-center px-1 ${column.key === 'login' ? 'sticky left-0 bg-white z-10' : ''}`}>
                            <div className="h-3 w-full max-w-[80%] rounded bg-gray-200 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    ))
                  ) : deals.length ? (
                    deals.map((deal, index) => (
                      <div key={`${deal.deal ?? deal.id ?? 'd'}-m-${index}`} className={`grid text-[10px] text-[#4B4B4B] font-outfit bg-white border-b border-[#E1E1E1] hover:bg-[#F8FAFC]`} style={{ gridTemplateColumns: mobileGrid }}>
                        {shownMobileColumns.map(column => (
                          <div
                            key={column.key}
                            className={`h-[38px] flex items-center px-1 min-w-0 ${column.key === 'login' ? 'sticky left-0 bg-white z-10 px-2 text-[#1A63BC] font-semibold' : ''}`}
                            style={column.key === 'login' ? { boxShadow: '2px 0 4px rgba(0,0,0,0.05)' } : undefined}
                          >
                            <span className="truncate">{renderCell(column, deal)}</span>
                          </div>
                        ))}
                      </div>
                    ))
                  ) : null}
                </div>
                {!loading && !deals.length && emptyOrError}
              </div>
            </div>
          </div>
        </div>

        {/* ───────── Tablet / desktop (matches Live Dealing) ───────── */}
        <div className="hidden md:flex max-w-full mx-auto w-full flex-col flex-1 overflow-hidden">
          <div className="bg-white rounded-2xl shadow-sm px-6 py-3 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F8F8F8] text-slate-900" aria-label="Open menu">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-bold text-[#1A1A1A]">Deals</h1>
                  <p className="text-xs text-[#6B7280] mt-0.5">All deals across all accounts</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {quickFilterSelect()}
                {actionButtons}
              </div>
            </div>
            {exportingNote}
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
                    placeholder="Search login, symbol, comment"
                    className="w-full h-10 pl-4 pr-20 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    aria-label="Search deals"
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
                <div className="relative mr-auto" data-deals-column-picker="">
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
                          pinnedColumns={pinnedColumns}
                          onPinToggle={togglePinColumn}
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
              {!loading && !deals.length ? emptyOrError
                : (
                  <table className="min-w-full text-xs border-separate border-spacing-0">
                    <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                      <tr>
                        {shownColumns.map(column => (
                          <th key={column.key} style={pinStyle(column.key, true)} className="px-3 py-2.5 text-left text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap bg-blue-600 hover:bg-blue-700 transition-colors select-none border-r border-blue-400 last:border-r-0">
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
                            <td key={column.key} style={pinStyle(column.key, false, row % 2 ? '#F9FAFB' : '#ffffff')} className="px-3 py-3 border-b border-r border-[#E5E7EB] last:border-r-0">
                              <div className="h-3.5 min-w-[48px] rounded bg-gray-200 animate-pulse" style={{ width: column.key === 'comment' || column.key === 'time' ? 110 : 64 }} />
                            </td>
                          ))}
                        </tr>
                      )) : deals.map((deal, index) => (
                        <tr key={`${deal.deal ?? deal.id ?? 'd'}-${index}`} className={`${index % 2 ? 'bg-[#F9FAFB]' : 'bg-white'} hover:bg-blue-50`}>
                          {shownColumns.map(column => (
                            <td
                              key={column.key}
                              style={pinStyle(column.key, false, index % 2 ? '#F9FAFB' : '#ffffff')}
                              className={`px-3 py-2.5 whitespace-nowrap text-sm border-b border-r border-[#E5E7EB] last:border-r-0 ${column.key === 'login' ? 'text-blue-600' : column.key === 'deal' || column.key === 'symbol' || column.key === 'name' ? 'text-gray-900' : 'text-gray-700'} ${column.key === 'comment' ? 'max-w-[220px] truncate' : ''}`}
                              title={column.key === 'comment' ? column.get(deal) : undefined}
                            >
                              {renderCell(column, deal)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
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

      {/* Mobile column picker (bottom sheet, same as Live Dealing mobile) */}
      {columnPickerOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setColumnPickerOpen(false)}>
          <div data-deals-column-picker="" className="bg-white w-full rounded-t-[24px] max-h-[85vh] flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
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
            <div className="flex-1 overflow-y-auto px-5 py-2">
              {MOBILE_COLUMNS.filter(column => column.label.toLowerCase().includes(columnSearch.trim().toLowerCase())).map(column => (
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
    </div>
  )
}

export default DealsReportPage
