import { useEffect, useRef, useState, useMemo, Fragment, cloneElement } from 'react'
import { useData } from '../contexts/DataContext'
import { useGroups } from '../contexts/GroupContext'
import { brokerAPI } from '../services/api'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import WebSocketIndicator from '../components/WebSocketIndicator'
import LoadingSpinner from '../components/LoadingSpinner'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import PendingOrdersModule from '../components/PendingOrdersModule'
import ColumnChooserList from '../components/ColumnChooserList'
import useColumnResize, { ColumnResizeHandle } from '../hooks/useColumnResize.jsx'

const PendingOrdersPage = () => {
  // Detect mobile device
  const [isMobile, setIsMobile] = useState(false)

  // Use cached data from DataContext - MUST be called before conditional return
  const { orders: cachedOrders, positions: cachedPositions, fetchOrders } = useData()
  const { filterByActiveGroup, activeGroupFilters } = useGroups()
  
  // Server-side polled data
  const [polledOrders, setPolledOrders] = useState([])
  const [serverTotalOrders, setServerTotalOrders] = useState(0)
  const [serverTotals, setServerTotals] = useState({ volumeCurrent: 0, volumeInitial: 0, uniqueLogins: 0 })
  // Global Compact / Full numeric display mode (synced with Sidebar via 'globalDisplayMode')
  const [numericMode, setNumericMode] = useState(() => {
    try {
      const saved = localStorage.getItem('globalDisplayMode')
      return saved === 'full' ? 'full' : 'compact'
    } catch { return 'compact' }
  })
  useEffect(() => {
    const onChange = (e) => {
      const v = (e && e.detail) || localStorage.getItem('globalDisplayMode')
      if (v === 'full' || v === 'compact') setNumericMode(v)
    }
    window.addEventListener('globalDisplayModeChanged', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('globalDisplayModeChanged', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  const [hasFetchedOrders, setHasFetchedOrders] = useState(false)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const prevPageRef = useRef(1)

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v !== null ? JSON.parse(v) : true
    } catch {
      return true
    }
  })
  const [error, setError] = useState('')
  const [selectedLogin, setSelectedLogin] = useState(null) // For login details modal
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(100)
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState('timeSetup')
  const [sortDirection, setSortDirection] = useState('desc')
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const searchRef = useRef(null)
  
  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true)
  
  // Column visibility states
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const columnSelectorRef = useRef(null)
  const [visibleColumns, setVisibleColumns] = useState({
    time: true,
    login: true,
    name: true,
    order: true,
    symbol: true,
    type: true,
    volume: true,
    priceOrder: true,
    priceCurrent: false,
    sl: false,
    tp: false
  })

  const allColumns = [
    { key: 'time', label: 'Time' },
    { key: 'login', label: 'Login', sticky: true },
    { key: 'name', label: 'Name' },
    { key: 'order', label: 'Order' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'type', label: 'Type' },
    { key: 'volume', label: 'Volume' },
    { key: 'priceOrder', label: 'Price' },
    { key: 'priceCurrent', label: 'Trigger' },
    { key: 'sl', label: 'S/L' },
    { key: 'tp', label: 'T/P' }
  ]

  // Column order (persisted) for reorder via Column Chooser
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('pendingOrdersPageColumnOrder')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return null
  })
  useEffect(() => {
    try {
      if (columnOrder) localStorage.setItem('pendingOrdersPageColumnOrder', JSON.stringify(columnOrder))
    } catch {}
  }, [columnOrder])
  const resetColumnOrder = () => {
    setColumnOrder(null)
    try { localStorage.removeItem('pendingOrdersPageColumnOrder') } catch {}
  }
  // Ordered columns (with any new keys appended) for table rendering
  const orderedColumns = (() => {
    if (!Array.isArray(columnOrder) || columnOrder.length === 0) return allColumns
    const map = new Map(allColumns.map(c => [c.key, c]))
    const out = []
    columnOrder.forEach(k => { if (map.has(k)) { out.push(map.get(k)); map.delete(k) } })
    map.forEach(c => out.push(c))
    return out
  })()

  // Pinned (frozen) columns - persisted to localStorage
  const [pinnedColumns, setPinnedColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pendingOrdersPagePinnedColumns'))
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('pendingOrdersPagePinnedColumns', JSON.stringify(pinnedColumns)) } catch {}
  }, [pinnedColumns])
  const togglePinColumn = (key) =>
    setPinnedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  // Column resize (per-column widths persisted to localStorage)
  const { setHeaderRef, getHeaderStyle, handleResizeStart } = useColumnResize('pendingOrdersPageColumnWidths')

  // Cumulative left offsets for pinned columns (default width 150px since no resize tracking)
  const PINNED_DEFAULT_WIDTH = 150
  const pinnedOffsets = useMemo(() => {
    const map = {}
    let offset = 0
    for (const col of orderedColumns) {
      if (!visibleColumns[col.key]) continue
      if (pinnedColumns.includes(col.key)) {
        map[col.key] = offset
        offset += PINNED_DEFAULT_WIDTH
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedColumns, visibleColumns, pinnedColumns])

  // Apply sticky positioning to a header/body cell element when its column is pinned
  const applyPin = (cell, colKey, isHeader) => {
    if (!cell || !pinnedColumns.includes(colKey)) return cell
    const stickyStyle = {
      position: 'sticky',
      left: `${pinnedOffsets[colKey] || 0}px`,
      zIndex: isHeader ? 21 : 5,
      backgroundColor: isHeader ? '#2563eb' : '#ffffff',
      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)'
    }
    return cloneElement(cell, {
      style: { ...(cell.props?.style || {}), ...stickyStyle }
    })
  }

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  // Column filter states
  const [columnFilters, setColumnFilters] = useState({})
  const [pendingColumnFilters, setPendingColumnFilters] = useState({})
  const [showFilterDropdown, setShowFilterDropdown] = useState(null)
  const filterRefs = useRef({})
  const numberFilterButtonRefs = useRef({})
  const [filterSearchQuery, setFilterSearchQuery] = useState({})
  const [showNumberFilterDropdown, setShowNumberFilterDropdown] = useState(null)
  
  // Custom filter modal states
  const [showCustomFilterModal, setShowCustomFilterModal] = useState(false)
  const [customFilterColumn, setCustomFilterColumn] = useState(null)
  const [customFilterType, setCustomFilterType] = useState('equal')
  const [customFilterValue1, setCustomFilterValue1] = useState('')
  const [customFilterValue2, setCustomFilterValue2] = useState('')
  const [customFilterOperator, setCustomFilterOperator] = useState('AND')

  // Define string columns that should show text filters instead of number filters
  const stringColumns = ['symbol', 'type', 'state', 'name']
  const isStringColumn = (key) => stringColumns.includes(key)

  // Column filter helper functions
  const getUniqueColumnValues = (columnKey) => {
    // Use API-fetched values for symbol and login
    if (columnKey === 'symbol') {
      const searchQuery = filterSearchQuery[columnKey]?.toLowerCase() || ''
      const values = allSymbols.length > 0 ? allSymbols : []
      return searchQuery ? values.filter(v => String(v).toLowerCase().includes(searchQuery)) : values
    }
    if (columnKey === 'login') {
      const searchQuery = filterSearchQuery[columnKey]?.toLowerCase() || ''
      const values = allLogins.length > 0 ? allLogins : []
      return searchQuery ? values.filter(v => String(v).toLowerCase().includes(searchQuery)) : values
    }
    // For type column, use API-fetched values
    if (columnKey === 'type') {
      const searchQuery = filterSearchQuery[columnKey]?.toLowerCase() || ''
      const values = allTypes.length > 0 ? allTypes : []
      return searchQuery ? values.filter(v => String(v).toLowerCase().includes(searchQuery)) : values
    }
    return []
  }

  const toggleColumnFilter = (columnKey, value) => {
    setPendingColumnFilters(prev => {
      const currentFilters = prev[columnKey] || []
      const newFilters = currentFilters.includes(value)
        ? currentFilters.filter(v => v !== value)
        : [...currentFilters, value]
      
      if (newFilters.length === 0) {
        const { [columnKey]: _, ...rest } = prev
        return rest
      }
      
      return { ...prev, [columnKey]: newFilters }
    })
  }

  const selectAllFilters = (columnKey) => {
    const allValues = getUniqueColumnValues(columnKey)
    setPendingColumnFilters(prev => ({
      ...prev,
      [columnKey]: allValues
    }))
  }

  const deselectAllFilters = (columnKey) => {
    setPendingColumnFilters(prev => {
      const { [columnKey]: _, ...rest } = prev
      return rest
    })
  }

  const clearColumnFilter = (columnKey) => {
    setColumnFilters(prev => {
      const numberFilterKey = `${columnKey}_number`
      const { [columnKey]: _, [numberFilterKey]: __, ...rest } = prev
      return rest
    })
    setFilterSearchQuery(prev => {
      const { [columnKey]: _, ...rest } = prev
      return rest
    })
    setShowFilterDropdown(null)
  }

  const getActiveFilterCount = (columnKey) => {
    // Check for regular checkbox filters
    const checkboxCount = columnFilters[columnKey]?.length || 0
    
    // Check for number filter
    const numberFilterKey = `${columnKey}_number`
    const hasNumberFilter = columnFilters[numberFilterKey] ? 1 : 0
    
    return checkboxCount + hasNumberFilter
  }

  const isAllSelected = (columnKey) => {
    const allValues = getUniqueColumnValues(columnKey)
    const selectedValues = pendingColumnFilters[columnKey] || []
    return allValues.length > 0 && selectedValues.length === allValues.length
  }

  // Commit pending checkbox selections to actual column filters
  const commitColumnFilters = () => {
    setColumnFilters(prev => {
      const merged = { ...prev }
      const columnKey = showFilterDropdown
      if (!columnKey) return prev
      if (pendingColumnFilters[columnKey] && pendingColumnFilters[columnKey].length > 0) {
        merged[columnKey] = pendingColumnFilters[columnKey]
      } else {
        delete merged[columnKey]
      }
      return merged
    })
    setCurrentPage(1)
    setShowFilterDropdown(null)
  }

  // Apply custom number filter
  const applyCustomNumberFilter = () => {
    if (!customFilterColumn || !customFilterValue1) return

    const filterConfig = {
      type: customFilterType,
      value1: parseFloat(customFilterValue1),
      value2: customFilterValue2 ? parseFloat(customFilterValue2) : null,
      operator: customFilterOperator
    }

    setColumnFilters(prev => ({
      ...prev,
      [`${customFilterColumn}_number`]: filterConfig
    }))

    // Close modal and dropdown
    setShowCustomFilterModal(false)
    setShowFilterDropdown(null)
    setShowNumberFilterDropdown(null)
    setCurrentPage(1)
  }

  // Transient UI flashes for updated orders
  const [flashes, setFlashes] = useState({})
  const flashTimeouts = useRef(new Map())

  const queueFlash = (id, data = {}) => {
    if (!id) return
    const key = String(id)
    const prev = flashTimeouts.current.get(key)
    if (prev) clearTimeout(prev)
    setFlashes((p) => ({ ...p, [key]: { ts: Date.now(), ...data } }))
    const to = setTimeout(() => {
      setFlashes((p) => {
        const n = { ...p }
        delete n[key]
        return n
      })
      flashTimeouts.current.delete(key)
    }, 1500)
    flashTimeouts.current.set(key, to)
  }
  
  // Critical: Set unmounted flag ASAP to unblock route transitions
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])
  
  // Close column selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target)) {
        setShowColumnSelector(false)
      }
    }
    
    if (showColumnSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColumnSelector])

  // API-based symbol/login dropdown values
  const [allSymbols, setAllSymbols] = useState([])
  const fetchSymbols = () => {
    brokerAPI.getOrderSymbols().then(res => {
      const symbols = res?.data?.symbols || []
      if (Array.isArray(symbols)) setAllSymbols(symbols)
    }).catch((err) => { console.warn('[OrderSymbols] Fetch error:', err?.message) })
  }

  const [allLogins, setAllLogins] = useState([])
  const fetchLogins = () => {
    brokerAPI.getOrderLogins().then(res => {
      const logins = res?.data?.logins || res?.data || []
      if (Array.isArray(logins)) setAllLogins(logins.sort((a, b) => a - b))
    }).catch((err) => { console.warn('[OrderLogins] Fetch error:', err?.message) })
  }

  const [allTypes, setAllTypes] = useState([])
  const fetchTypes = () => {
    brokerAPI.getOrderTypes().then(res => {
      const types = res?.data?.types || res?.data || []
      if (Array.isArray(types)) setAllTypes(types)
    }).catch((err) => { console.warn('[OrderTypes] Fetch error:', err?.message) })
  }

  // REST polling with server-side search, sort, filter, pagination
  useEffect(() => {
    let timer = null
    let isCancelled = false

    const poll = async () => {
      if (isCancelled) return
      try {
        const params = {
          page: currentPage,
          limit: itemsPerPage,
          sortBy: sortColumn || 'timeSetup',
          sortOrder: sortDirection || 'desc'
        }
        if (activeSearch.trim()) {
          params.search = activeSearch.trim()
        }
        // Build server-side filters from column condition filters
        const apiFilterTypeMap = {
          startsWith: 'starts_with',
          endsWith: 'ends_with',
          contains: 'contain',
          doesNotContain: 'does_not_contain',
          equal: 'equal',
          notEqual: 'not_equal',
          lessThan: 'less_than',
          lessThanOrEqual: 'less_than_or_equal',
          greaterThan: 'greater_than',
          greaterThanOrEqual: 'greater_than_or_equal'
        }
        const apiFilters = []
        Object.entries(columnFilters).forEach(([key, config]) => {
          if (!key.endsWith('_number') || !config) return
          const field = key.replace('_number', '')
          const operator = apiFilterTypeMap[config.type]
          if (!operator) return
          if (config.type === 'between' && config.value2 != null) {
            apiFilters.push({ field, operator: 'greater_than_or_equal', value: String(config.value1) })
            apiFilters.push({ field, operator: 'less_than_or_equal', value: String(config.value2) })
          } else {
            apiFilters.push({ field, operator, value: String(config.value1) })
          }
        })
        // Add checkbox symbol selections as API filters
        if (Array.isArray(columnFilters['symbol']) && columnFilters['symbol'].length > 0) {
          apiFilters.push({ field: 'symbol', operator: 'in', value: columnFilters['symbol'] })
        }
        // Add checkbox type selections as API filters
        if (Array.isArray(columnFilters['type']) && columnFilters['type'].length > 0) {
          apiFilters.push({ field: 'type', operator: 'in', value: columnFilters['type'] })
        }
        // Add login checkbox selections as API filters
        if (Array.isArray(columnFilters['login']) && columnFilters['login'].length > 0) {
          apiFilters.push({ field: 'login', operator: 'in', value: columnFilters['login'].map(Number) })
        }
        if (apiFilters.length > 0) {
          params.filters = apiFilters
        }

        const response = await brokerAPI.searchOrders(params)
        if (isCancelled) return
        const data = response?.data?.orders || response?.data?.positions || response?.orders || []
        const total = response?.data?.total || response?.total || 0
        const totals = response?.data?.totals || response?.totals || null
        if (Array.isArray(data)) {
          setPolledOrders(data)
          setServerTotalOrders(total)
          if (totals) setServerTotals(totals)
          setIsPageLoading(false)
          setHasFetchedOrders(true)
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[Orders] Polling error:', err?.message)
        }
      }
      if (!isCancelled) {
        timer = setTimeout(poll, 2000)
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!timer) poll()
      } else {
        if (timer) { clearTimeout(timer); timer = null }
      }
    }

    if (document.visibilityState === 'visible') poll()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      isCancelled = true
      if (timer) { clearTimeout(timer); timer = null }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [currentPage, itemsPerPage, sortColumn, sortDirection, activeSearch, columnFilters])

  // Helper to get order id
  const getOrderId = (order) => {
    const id = order?.order ?? order?.ticket ?? order?.id
    return id !== undefined && id !== null ? String(id) : undefined
  }

  const formatNumber = (n, digits = 2) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    return num.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }

  // Indian compact formatter: 2.57Cr, 12.50L, 25.50K
  const formatCompactIndian = (n) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return '0'
    const abs = Math.abs(num)
    const sign = num < 0 ? '-' : ''
    if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`
    if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L`
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K`
    return `${sign}${abs.toFixed(2)}`
  }
  // Volume/qty formatter (compact when global mode is compact)
  const fmtMoney = (n, digits = 2) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    if (numericMode === 'compact') return formatCompactIndian(num)
    return formatNumber(num, digits)
  }
  const fmtMoneyFull = (n, digits = 2) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    return formatNumber(num, digits)
  }
  // Price formatter: only compact when |value| >= 1000
  const fmtPrice = (n, digits = 3) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    if (numericMode === 'compact' && Math.abs(num) >= 1000) return formatCompactIndian(num)
    return formatNumber(num, digits)
  }
  const fmtPriceFull = (n, digits = 3) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    return formatNumber(num, digits)
  }

  // Resolve per-row decimal digits from the API response. Falls back to 3
  // when the field is missing or invalid.
  const getDigits = (row, fallback = 3) => {
    if (!row) return fallback
    const raw = row.digits ?? row.digit ?? row.priceDigits
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }

  // Color mapping for order `type` column
  const getOrderTypeColor = (type) => {
    const t = String(type || '').toUpperCase()
    if (t.startsWith('BUY')) return 'text-green-600'
    if (t.startsWith('SELL')) return 'text-red-600'
    return 'text-gray-900'
  }

  // Badge styles for type/state with tinted background
  const getTypeBadgeClasses = (type) => {
    const t = String(type || '').toUpperCase()
    // Mirror Live Dealing Action UI: BUY -> green, SELL -> red
    if (t.startsWith('BUY')) return 'bg-green-100 text-green-800'
    if (t.startsWith('SELL')) return 'bg-red-100 text-red-800'
    return 'bg-gray-100 text-gray-700'
  }
  const getStateBadgeClasses = (state) => {
    const s = String(state || '').toUpperCase()
    if (s === 'IN') return 'text-green-700 bg-green-100'
    if (s === 'OUT') return 'text-red-700 bg-red-100'
    return 'text-gray-700 bg-gray-100'
  }

  // Get card icon path based on card title
  const getCardIcon = (cardTitle) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'Total Orders': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'Unique Logins': `${baseUrl}Desktop cards icons/Total Clients.svg`,
      'Symbols': `${baseUrl}Desktop cards icons/Total Equity.svg`,
    }
    return iconMap[cardTitle] || `${baseUrl}Desktop cards icons/Total Clients.svg`
  }

  const formatTime = (ts) => {
    if (!ts) return '-'
    try {
      const d = new Date(ts * 1000)
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      const seconds = String(d.getSeconds()).padStart(2, '0')
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
    } catch {
      return '-'
    }
  }

  // Generate dynamic pagination options based on data count (no 'All' option)
  const generatePageSizeOptions = () => {
    const baseSizes = [25, 50, 100, 200]
    return baseSizes
  }
  
  const pageSizeOptions = generatePageSizeOptions()
  
  const handleSearchClick = () => {
    const trimmed = searchQuery.trim()
    if (trimmed === activeSearch) return
    setActiveSearch(trimmed)
    setCurrentPage(1)
  }
  
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      const trimmed = searchQuery.trim()
      if (trimmed === activeSearch) return
      setActiveSearch(trimmed)
      setCurrentPage(1)
    }
  }
  
  // Server data is already sorted/filtered/paginated — use directly
  const displayedOrders = polledOrders
  
  // Handle column header click for sorting
  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }
  
  // Server-side pagination — total pages from API response
  const totalPages = Math.max(1, Math.ceil(serverTotalOrders / itemsPerPage))
  
  // Reset to page 1 when items per page changes
  useEffect(() => {
    setCurrentPage(1)
  }, [itemsPerPage])

  // Show loading skeleton when page changes
  useEffect(() => {
    if (currentPage !== prevPageRef.current) {
      setIsPageLoading(true)
      prevPageRef.current = currentPage
    }
  }, [currentPage])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!isMountedRef.current) return
      
      // Check if click is inside any filter-related element
      const isInsideMainFilter = showFilterDropdown && filterRefs.current[showFilterDropdown] && 
                                  filterRefs.current[showFilterDropdown].contains(event.target)
      
      const numberFilterElements = document.querySelectorAll('[data-number-filter]')
      let isInsideNumberFilter = false
      numberFilterElements.forEach(el => {
        if (el.contains(event.target)) {
          isInsideNumberFilter = true
        }
      })
      
      // If click is outside both main filter and number filter dropdowns, close them
      if (!isInsideMainFilter && !isInsideNumberFilter) {
        if (showFilterDropdown) {
          setShowFilterDropdown(null)
        }
        if (showNumberFilterDropdown) {
          setShowNumberFilterDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterDropdown, showNumberFilterDropdown])
  
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  
  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value)
    setCurrentPage(1)
  }

  // Helper function to render table header with filter
  const renderHeaderCell = (columnKey, label, sortKey = null) => {
    const filterCount = getActiveFilterCount(columnKey)
    const actualSortKey = sortKey || columnKey
    
    return (
      <th
        ref={setHeaderRef(columnKey)}
        style={getHeaderStyle(columnKey)}
        className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider transition-all select-none group"
      >
        <div className="flex items-center gap-1 justify-between">
          <div 
            className="flex items-center gap-1 cursor-pointer flex-1"
            onClick={() => handleSort(actualSortKey)}
          >
            <span>{label}</span>
            {sortColumn === actualSortKey ? (
              <svg
                className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg
                className="w-3 h-3 opacity-0 group-hover:opacity-30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            )}
          </div>
          
          <div className="relative" ref={el => {
            if (!filterRefs.current) filterRefs.current = {}
            filterRefs.current[columnKey] = el
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                const opening = showFilterDropdown !== columnKey
                setShowFilterDropdown(opening ? columnKey : null)
                if (opening) {
                  setPendingColumnFilters(prev => ({ ...prev, [columnKey]: columnFilters[columnKey] || [] }))
                  if (columnKey === 'symbol') fetchSymbols()
                  if (columnKey === 'login') fetchLogins()
                  if (columnKey === 'type') fetchTypes()
                }
              }}
              className={`p-1 rounded hover:bg-blue-800/50 transition-colors ${filterCount > 0 ? 'text-yellow-400' : 'text-white/70'}`}
              title="Filter column"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {filterCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-400 text-blue-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {filterCount}
                </span>
              )}
            </button>

            {showFilterDropdown === columnKey && (
              <div className="fixed bg-white border-2 border-slate-300 rounded-lg shadow-2xl z-[9999] w-64" 
                style={{
                  top: '50%',
                  transform: 'translateY(-50%)',
                  left: (() => {
                    const rect = filterRefs.current[columnKey]?.getBoundingClientRect()
                    if (!rect) return '0px'
                    const dropdownWidth = 256
                    const offset = 30
                    const wouldOverflow = rect.left + offset + dropdownWidth > window.innerWidth
                    return wouldOverflow 
                      ? `${rect.right - dropdownWidth}px`
                      : `${rect.left + offset}px`
                  })()
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitColumnFilters()
                  }
                }}
                tabIndex={0}
              >
                {/* Header */}
                <div className="px-1.5 py-0.5 border-b border-gray-200 bg-gray-50 rounded-t">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-semibold text-gray-700">Filter Menu</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowFilterDropdown(null)
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Quick Clear Filter */}
                <div className="border-b border-slate-200 py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearColumnFilter(columnKey)
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11px] font-semibold hover:bg-slate-50 flex items-center gap-2 text-red-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Filter
                  </button>
                </div>

                {/* Sort Options */}
                <div className="border-b border-slate-200 py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSort(columnKey)
                      setSortDirection('asc')
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11px] font-medium hover:bg-slate-50 flex items-center gap-2 text-slate-700 transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    Sort Smallest to Largest
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSort(columnKey)
                      setSortDirection('desc')
                    }}
                    className="w-full px-3 py-1.5 text-left text-[11px] font-medium hover:bg-slate-50 flex items-center gap-2 text-slate-700 transition-colors"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                    </svg>
                    Sort Largest to Smallest
                  </button>
                </div>
                {/* Number Filters (only for numeric columns) */}
                {!isStringColumn(columnKey) && (
                  <div className="border-b border-slate-200 px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">CONDITION</label>
                      <select
                        value={customFilterType}
                        onChange={(e) => { setCustomFilterType(e.target.value); setCustomFilterColumn(columnKey) }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                      >
                        <option value="equal">Equal...</option>
                        <option value="notEqual">Not Equal...</option>
                        <option value="lessThan">Less Than...</option>
                        <option value="lessThanOrEqual">Less Than Or Equal...</option>
                        <option value="greaterThan">Greater Than...</option>
                        <option value="greaterThanOrEqual">Greater Than Or Equal...</option>
                        <option value="between">Between...</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">VALUE</label>
                      <input
                        type={columnKey === 'timeSetup' ? 'datetime-local' : 'number'}
                        step={columnKey === 'timeSetup' ? '1' : 'any'}
                        placeholder={columnKey === 'timeSetup' ? 'Select date and time' : 'Enter value'}
                        value={columnKey === 'timeSetup' && customFilterValue1 ?
                          (() => {
                            const timestamp = Number(customFilterValue1)
                            if (isNaN(timestamp)) return customFilterValue1
                            const date = new Date(timestamp * 1000)
                            return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`
                          })()
                          : customFilterValue1
                        }
                        onChange={(e) => {
                          setCustomFilterColumn(columnKey)
                          if (columnKey === 'timeSetup') {
                            const dateValue = e.target.value
                            setCustomFilterValue1(dateValue ? String(Math.floor(new Date(dateValue).getTime() / 1000)) : '')
                          } else {
                            setCustomFilterValue1(e.target.value)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            applyCustomNumberFilter()
                            setShowFilterDropdown(null)
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                        style={{ fontWeight: 400 }}
                      />
                    </div>
                    {customFilterType === 'between' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">AND</label>
                        <input
                          type={columnKey === 'timeSetup' ? 'datetime-local' : 'number'}
                          step={columnKey === 'timeSetup' ? '1' : 'any'}
                          placeholder={columnKey === 'timeSetup' ? 'Select date and time' : 'Enter value'}
                          value={columnKey === 'timeSetup' && customFilterValue2 ?
                            (() => {
                              const timestamp = Number(customFilterValue2)
                              if (isNaN(timestamp)) return customFilterValue2
                              const date = new Date(timestamp * 1000)
                              return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`
                            })()
                            : customFilterValue2
                          }
                          onChange={(e) => {
                            setCustomFilterColumn(columnKey)
                            if (columnKey === 'timeSetup') {
                              const dateValue = e.target.value
                              setCustomFilterValue2(dateValue ? String(Math.floor(new Date(dateValue).getTime() / 1000)) : '')
                            } else {
                              setCustomFilterValue2(e.target.value)
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              applyCustomNumberFilter()
                              setShowFilterDropdown(null)
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                          style={{ fontWeight: 400 }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {/* Text Filters (only for string columns) */}
                {isStringColumn(columnKey) && (
                  <div className="border-b border-slate-200 px-3 py-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">CONDITION</label>
                      <select
                        value={customFilterType}
                        onChange={(e) => { setCustomFilterType(e.target.value); setCustomFilterColumn(columnKey) }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                      >
                        <option value="equal">Equal...</option>
                        <option value="notEqual">Not Equal...</option>
                        <option value="startsWith">Starts With...</option>
                        <option value="endsWith">Ends With...</option>
                        <option value="contains">Contains...</option>
                        <option value="doesNotContain">Does Not Contain...</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">VALUE</label>
                      <input
                        type="text"
                        placeholder="Enter value"
                        value={customFilterValue1}
                        onChange={(e) => { setCustomFilterColumn(columnKey); setCustomFilterValue1(e.target.value) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            applyCustomNumberFilter()
                            setShowFilterDropdown(null)
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                        style={{ fontWeight: 400 }}
                      />
                    </div>
                  </div>
                )}

                {/* Search Box, Select All, Checkbox List — only for symbol/type/login */}
                {['symbol', 'type', 'login'].includes(columnKey) && (
                <>
                {/* Search Box */}
                <div className="p-2 border-b border-slate-200">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search values..."
                      value={filterSearchQuery[columnKey] || ''}
                      onChange={(e) => {
                        e.stopPropagation()
                        setFilterSearchQuery(prev => ({
                          ...prev,
                          [columnKey]: e.target.value
                        }))
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full pl-8 pr-3 py-1.5 text-[11px] font-medium border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white text-slate-700 placeholder:text-slate-400"
                    />
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* Select All / Deselect All */}
                <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50">
                  <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isAllSelected(columnKey)}
                      onChange={(e) => {
                        e.stopPropagation()
                        if (e.target.checked) {
                          selectAllFilters(columnKey)
                        } else {
                          deselectAllFilters(columnKey)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] font-medium text-slate-700">Select All</span>
                  </label>
                </div>

                {/* Filter List */}
                <div className="max-h-64 overflow-y-auto">
                  <div className="p-2 space-y-1">
                    {getUniqueColumnValues(columnKey).length === 0 ? (
                      <div className="px-3 py-2 text-center text-[11px] text-slate-500">
                        No items found
                      </div>
                    ) : (
                      getUniqueColumnValues(columnKey).map(value => (
                        <label 
                          key={value} 
                          className="flex items-center gap-2 hover:bg-slate-50 px-2 py-1 rounded cursor-pointer transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={(pendingColumnFilters[columnKey] || []).includes(value)}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleColumnFilter(columnKey, value)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                          />
                          <span className="text-[11px] text-slate-700 truncate">
                            {value}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                </>
                )}

                {/* Footer */}
                <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 rounded-b flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowFilterDropdown(null)
                    }}
                    className="flex-1 px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      applyCustomNumberFilter()
                      commitColumnFilters()
                    }}
                    className="flex-1 px-3 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <ColumnResizeHandle columnKey={columnKey} onResizeStart={handleResizeStart} />
      </th>
    )
  }

  // Detect mobile and update state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // If mobile, use mobile module (after all hooks are called)
  if (isMobile) {
    return <PendingOrdersModule />
  }

  // Only show full-page spinner on initial load (before first API response).
  if (!hasFetchedOrders) return <LoadingSpinner />

  return (
    <div className="h-screen flex bg-gradient-to-br from-blue-50 via-white to-blue-50 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
      />

      <main className={`flex-1 p-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        <div className="max-w-full mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Header Section */}
          <div className="bg-white rounded-2xl shadow-sm px-6 py-3 mb-6">
            {/* Title + Actions */}
            <div className="mb-1.5 pb-1.5 flex items-center justify-between gap-3">
            {/* Title Section */}
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">Pending Orders</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">Live pending orders (ignoring market BUY/SELL)</p>
            </div>

            {/* Action Buttons - All on right side */}
            <div className="flex items-center gap-2">
                  <GroupSelector 
                    moduleName="pendingorders" 
                    onCreateClick={() => {
                      setEditingGroup(null)
                      setShowGroupModal(true)
                    }}
                    onEditClick={(group) => {
                      setEditingGroup(group)
                      setShowGroupModal(true)
                    }}
                  />
                  
              <button
                onClick={fetchOrders}
                className="h-8 w-8 rounded-md border border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50 transition-colors inline-flex items-center justify-center shadow-sm"
                title="Refresh orders"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </div>

          {/* Summary Cards - Client2 Face Card Design */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Total Orders</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Total Orders')} 
                    alt="Total Orders"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span title={numericMode === 'compact' ? String(serverTotalOrders) : undefined}>{numericMode === 'compact' ? fmtPrice(serverTotalOrders, 0) : serverTotalOrders}</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Unique Logins</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Unique Logins')} 
                    alt="Unique Logins"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span title={numericMode === 'compact' ? String(Number(serverTotals.uniqueLogins || 0)) : undefined}>{numericMode === 'compact' ? fmtPrice(Number(serverTotals.uniqueLogins || 0), 0) : Number(serverTotals.uniqueLogins || 0)}</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Volume Current</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Unique Logins')} 
                    alt="Volume Current"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span title={numericMode === 'compact' ? fmtMoneyFull(serverTotals.volumeCurrent, 2) : undefined}>{fmtMoney(serverTotals.volumeCurrent, 2)}</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Volume Initial</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Symbols')} 
                    alt="Volume Initial"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span title={numericMode === 'compact' ? fmtMoneyFull(serverTotals.volumeInitial, 2) : undefined}>{fmtMoney(serverTotals.volumeInitial, 2)}</span>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden flex flex-col flex-1">
            {/* Search and Controls Bar - Inside table container */}
            <div className="border-b border-[#E5E7EB] p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Left: Search and Columns */}
                <div className="flex items-center gap-2 flex-1">
                  {/* Search Bar */}
                  <div className="relative flex-1 max-w-md" ref={searchRef}>
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" fill="none" viewBox="0 0 18 18">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search"
                      className={`w-full h-10 pl-10 ${searchQuery ? 'pr-20' : 'pr-10'} text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all`}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {searchQuery && (
                        <button
                          onClick={() => {
                            setSearchQuery('')
                            setActiveSearch('')
                            setCurrentPage(1)
                          }}
                          className="p-1 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                          title="Clear search"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={handleSearchClick}
                        className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                        title="Search"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18">
                          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* Columns Button (icon only) */}
                  <div className="relative">
                    <button
                      onClick={() => setShowColumnSelector(!showColumnSelector)}
                      className="h-10 w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                      title="Show/Hide Columns"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <line x1="2" y1="4" x2="14" y2="4" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="6" cy="4" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                        <line x1="2" y1="8" x2="14" y2="8" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="11" cy="8" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                        <line x1="2" y1="12" x2="14" y2="12" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                        <circle cx="7" cy="12" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                      </svg>
                    </button>
                    {showColumnSelector && (
                      <div
                        ref={columnSelectorRef}
                        className="absolute left-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-0 z-50 flex flex-col"
                        style={{ width: 280, maxHeight: '60vh' }}
                      >
                        <div className="px-3 py-2 border-b border-[#F3F4F6] flex items-center justify-between">
                          <p className="text-xs font-semibold text-[#1F2937] uppercase">Show/Hide & Reorder</p>
                          <div className="relative group">
                            <button
                              onClick={resetColumnOrder}
                              className="p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              aria-label="Reset column order"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20v-6h-6" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10a8 8 0 0114-3m2 7a8 8 0 01-14 3" />
                              </svg>
                            </button>
                            <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-gray-900 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow">
                              Reset Order
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col">
                          <ColumnChooserList
                            columns={allColumns}
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
                </div>

                {/* Right: Pagination */}
                <div className="flex items-center gap-2">
                  <div className="mr-1">
                    <PageSizeSelect value={itemsPerPage} onChange={handleItemsPerPageChange} />
                  </div>
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      currentPage === 1
                        ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                        : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  <div className="px-3 py-1.5 text-sm font-medium text-[#374151] flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!isNaN(n) && n >= 1 && n <= totalPages) {
                          handlePageChange(n)
                        }
                      }}
                      className="w-12 h-7 border border-[#E5E7EB] rounded-lg text-center text-sm font-semibold text-[#1F2937]"
                      aria-label="Current page"
                    />
                    <span className="text-[#9CA3AF]">/</span>
                    <span className="text-[#6B7280]">{totalPages}</span>
                  </div>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      currentPage === totalPages
                        ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                        : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                    }`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                  <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                    <tr className="divide-x divide-blue-400">
                      {orderedColumns.map(col => {
                        if (!visibleColumns[col.key]) return null
                        let cell = null
                        switch (col.key) {
                          case 'time': cell = renderHeaderCell('timeSetup', 'Time', 'timeSetup'); break
                          case 'login': cell = renderHeaderCell('login', 'Login'); break
                          case 'name': cell = renderHeaderCell('name', 'Name'); break
                          case 'order': cell = renderHeaderCell('order', 'Order'); break
                          case 'symbol': cell = renderHeaderCell('symbol', 'Symbol'); break
                          case 'type': cell = renderHeaderCell('type', 'Type'); break
                          case 'state': cell = renderHeaderCell('state', 'State'); break
                          case 'volume': cell = renderHeaderCell('volume', 'Volume'); break
                          case 'priceOrder': cell = renderHeaderCell('priceOrder', 'Price'); break
                          case 'priceCurrent': cell = renderHeaderCell('priceTrigger', 'Trigger'); break
                          case 'sl': cell = renderHeaderCell('priceSL', 'SL', 'sl'); break
                          case 'tp': cell = renderHeaderCell('priceTP', 'TP', 'tp'); break
                          default: cell = null
                        }
                        if (!cell) return null
                        cell = applyPin(cell, col.key, true)
                        return <Fragment key={col.key}>{cell}</Fragment>
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {isPageLoading ? (
                      Array.from({ length: 8 }, (_, i) => (
                        <tr key={`skeleton-${i}`} className="bg-white border-b border-[#E1E1E1] border-l-2 border-l-[#E1E1E1]">
                          {orderedColumns.map((col, colIdx) => {
                            if (!visibleColumns[col.key]) return null
                            const isPinnedCell = pinnedColumns.includes(col.key)
                            const stickyTdStyle = isPinnedCell ? {
                              position: 'sticky',
                              left: `${pinnedOffsets[col.key] || 0}px`,
                              zIndex: 5,
                              backgroundColor: '#ffffff'
                            } : undefined
                            return (
                              <td
                                key={col.key}
                                className={`px-2${colIdx !== 0 ? ' border-l border-[#E1E1E1]' : ''}`}
                                style={{ height: '38px', ...(stickyTdStyle || {}) }}
                              >
                                <div className="h-3 w-full max-w-[80%] bg-gray-200 rounded animate-pulse" />
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    ) : displayedOrders.length === 0 ? (
                      <tr className="border-l-2 border-l-[#E1E1E1]">
                        <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-4 py-12 text-center text-gray-500">
                          No pending orders
                        </td>
                      </tr>
                    ) : displayedOrders.map((o, index) => {
                      const id = getOrderId(o)
                      const flash = id ? flashes[id] : undefined
                      const priceDelta = flash?.priceDelta
                      const slDelta = flash?.slDelta
                      const tpDelta = flash?.tpDelta
                      return (
                        <tr key={id ?? index} className={`hover:bg-blue-50 transition-colors border-l-2 border-l-[#E1E1E1]`}>
                          {orderedColumns.map((col, colIdx) => {
                            const colKey = col.key
                            const visible = visibleColumns[colKey]
                            if (!visible) return null;
                            // Cell content logic
                            let cellContent = null;
                            if (colKey === 'time') {
                              cellContent = formatTime(o.timeSetup || o.timeUpdate || o.timeCreate || o.updated_at);
                            } else if (colKey === 'login') {
                              cellContent = (
                                <span
                                  className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap cursor-pointer hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedLogin(o.login);
                                  }}
                                  title="Click to view login details"
                                >
                                  {o.login}
                                </span>
                              );
                            } else if (colKey === 'order') {
                              cellContent = id;
                            } else if (colKey === 'name') {
                              cellContent = o.name ?? '-';
                            } else if (colKey === 'symbol') {
                              cellContent = o.symbol;
                            } else if (colKey === 'type') {
                              cellContent = (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${getTypeBadgeClasses(o.type)}`}>
                                  {o.type ?? '-'}
                                </span>
                              );
                            } else if (colKey === 'state') {
                              cellContent = (
                                <span className={`px-2 py-0.5 rounded-full font-medium ${getStateBadgeClasses(o.state)}`}>
                                  {o.state ?? '-'}
                                </span>
                              );
                            } else if (colKey === 'volume') {
                              const volRaw = o.volumeCurrent ?? o.volume ?? o.volumeInitial;
                              cellContent = (
                                <span title={numericMode === 'compact' ? fmtMoneyFull(volRaw, 2) : undefined}>{fmtMoney(volRaw, 2)}</span>
                              );
                            } else if (colKey === 'priceOrder') {
                              const priceRaw = o.priceOrder ?? o.price ?? o.priceOpen ?? o.priceOpenExact ?? o.open_price;
                              const d = getDigits(o);
                              cellContent = (
                                <div className="flex items-center gap-1">
                                  <span>{fmtPriceFull(priceRaw, d)}</span>
                                  {priceDelta !== undefined && priceDelta !== 0 ? (
                                    <span className={`ml-1 text-[11px] font-medium ${priceDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {priceDelta > 0 ? '▲' : '▼'} {Math.abs(priceDelta).toFixed(d)}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            } else if (colKey === 'priceCurrent') {
                              const trigRaw = o.priceTrigger ?? o.trigger ?? 0;
                              cellContent = (
                                <span>{fmtPriceFull(trigRaw, 2)}</span>
                              );
                            } else if (colKey === 'sl') {
                              const slRaw = o.priceSL ?? o.sl ?? o.stop_loss;
                              cellContent = (
                                <div className="flex items-center gap-1">
                                  <span>{fmtPriceFull(slRaw, 2)}</span>
                                  {slDelta !== undefined && slDelta !== 0 ? (
                                    <span className={`ml-1 text-[11px] font-medium ${slDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {slDelta > 0 ? '▲' : '▼'} {Math.abs(slDelta).toFixed(2)}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            } else if (colKey === 'tp') {
                              const tpRaw = o.priceTP ?? o.tp ?? o.take_profit;
                              cellContent = (
                                <div className="flex items-center gap-1">
                                  <span>{fmtPriceFull(tpRaw, 2)}</span>
                                  {tpDelta !== undefined && tpDelta !== 0 ? (
                                    <span className={`ml-1 text-[11px] font-medium ${tpDelta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {tpDelta > 0 ? '▲' : '▼'} {Math.abs(tpDelta).toFixed(2)}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            }
                            const isPinnedCell = pinnedColumns.includes(colKey)
                            const stickyTdStyle = isPinnedCell ? {
                              position: 'sticky',
                              left: `${pinnedOffsets[colKey] || 0}px`,
                              zIndex: 5,
                              backgroundColor: '#ffffff',
                              boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)'
                            } : undefined
                            return (
                              <td
                                key={colKey}
                                className={`px-2 py-1.5 text-sm${colIdx !== 0 ? ' border-l border-[#E1E1E1]' : ''} ${colKey === 'login' ? 'text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap cursor-pointer hover:underline' : colKey === 'type' ? '' : colKey === 'state' ? '' : 'text-gray-900 whitespace-nowrap'}`}
                                style={stickyTdStyle}
                              >
                                {cellContent}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          </div>

          {/* Pagination Controls - Bottom removed as per request */}

          {/* Connection status helper removed per request */}
        </div>
      </main>
      
      {/* Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false)
          setEditingGroup(null)
        }}
        availableItems={cachedOrders}
        loginField="login"
        displayField="symbol"
        secondaryField="order"
        editGroup={editingGroup}
      />

      {/* Custom Filter Modal */}
      {showCustomFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Custom Filter</h3>
              <button
                onClick={() => {
                  setShowCustomFilterModal(false)
                  setCustomFilterValue1('')
                  setCustomFilterValue2('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Show rows where:</p>
                <p className="text-sm text-gray-600 mb-3">{customFilterColumn}</p>
              </div>

              {/* Filter Type Dropdown */}
              <div>
                <select
                  value={customFilterType}
                  onChange={(e) => setCustomFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                >
                  <option value="equal">Equal</option>
                  <option value="notEqual">Not Equal</option>
                  <option value="lessThan">Less Than</option>
                  <option value="lessThanOrEqual">Less Than Or Equal</option>
                  <option value="greaterThan">Greater Than</option>
                  <option value="greaterThanOrEqual">Greater Than Or Equal</option>
                  <option value="between">Between</option>
                  <option value="startsWith">Starts With</option>
                  <option value="endsWith">Ends With</option>
                  <option value="contains">Contains</option>
                  <option value="doesNotContain">Does Not Contain</option>
                </select>
              </div>

              {/* Value Input */}
              <div>
                <input
                  type={['startsWith', 'endsWith', 'contains', 'doesNotContain'].includes(customFilterType) ? 'text' : 'number'}
                  value={customFilterValue1}
                  onChange={(e) => setCustomFilterValue1(e.target.value)}
                  placeholder="Enter the value"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                />
              </div>

              {/* Second Value for Between */}
              {customFilterType === 'between' && (
                <>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={customFilterOperator === 'AND'}
                        onChange={() => setCustomFilterOperator('AND')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">AND</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={customFilterOperator === 'OR'}
                        onChange={() => setCustomFilterOperator('OR')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">OR</span>
                    </label>
                  </div>

                  <div>
                    <input
                      type="number"
                      value={customFilterValue2}
                      onChange={(e) => setCustomFilterValue2(e.target.value)}
                      placeholder="Enter the value"
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowCustomFilterModal(false)
                  setCustomFilterValue1('')
                  setCustomFilterValue2('')
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyCustomNumberFilter}
                disabled={!customFilterValue1}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Positions Modal */}
      {selectedLogin && (
        <ClientPositionsModal
          client={{ login: selectedLogin }}
          onClose={() => setSelectedLogin(null)}
          onClientUpdate={() => {}}
          allPositionsCache={cachedPositions}
          allOrdersCache={cachedOrders}
          onCacheUpdate={() => {}}
        />
      )}
    </div>
  )
}

export default PendingOrdersPage
