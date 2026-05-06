import { useState, useEffect, useRef, useMemo, Fragment, cloneElement } from 'react'
import websocketService from '../services/websocket'
import { brokerAPI } from '../services/api'
import { useData } from '../contexts/DataContext'
import { useGroups } from '../contexts/GroupContext'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import WebSocketIndicator from '../components/WebSocketIndicator'
import LoadingSpinner from '../components/LoadingSpinner'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import LiveDealingModule from '../components/LiveDealingModule'
import ColumnChooserList from '../components/ColumnChooserList'
import useColumnResize, { ColumnResizeHandle } from '../hooks/useColumnResize.jsx'

const DEBUG_LOGS = import.meta?.env?.VITE_DEBUG_LOGS === 'true'

const LiveDealingPage = () => {
  // Detect mobile device — initialize synchronously so the correct view renders on first paint
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  )
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
  
  const { positions: cachedPositions, orders: cachedOrders } = useData() // Get positions and orders from DataContext
  const { filterByActiveGroup, activeGroupFilters } = useGroups()
  const getInitialSidebarOpen = () => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      if (v === null) return true
      return JSON.parse(v)
    } catch { return true }
  }
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const [selectedLogin, setSelectedLogin] = useState(null) // For login details modal
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  
  const [deals, setDeals] = useState([])
  const [newDealIds, setNewDealIds] = useState(new Set()) // Track new deals for blinking
  
  const [connectionState, setConnectionState] = useState('disconnected')
  const [loading, setLoading] = useState(true)
  const [pageLoading, setPageLoading] = useState(false)
  const [error, setError] = useState('')
  const { isAuthenticated } = useAuth()
  const [unauthorized, setUnauthorized] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasInitialLoad = useRef(false)
  const isInitialMount = useRef(true)
  const isPageEffectFirstRun = useRef(true)
  const isAuthEffectFirstRun = useRef(true)
  const fetchRef = useRef(null) // always holds latest fetchAllDealsOnce
  const currentPageRef = useRef(1) // always holds latest currentPage
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(100)
  const [totalDealsCount, setTotalDealsCount] = useState(0)

  // Module filter: Deal (buy/sell) vs Money transactions (others) vs Both
  const [moduleFilter, setModuleFilter] = useState('both') // 'deal' | 'money' | 'both'
  const [showModuleFilter, setShowModuleFilter] = useState(false)
  const moduleFilterRef = useRef(null)
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState('time')
  const [sortDirection, setSortDirection] = useState('desc')
  
  // Filter states
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [timeFilter, setTimeFilter] = useState('24h') // '24h' (default), '7d', 'custom'
  const [customFromDate, setCustomFromDate] = useState('')
  const [customToDate, setCustomToDate] = useState('')
  const [appliedFromDate, setAppliedFromDate] = useState('')
  const [appliedToDate, setAppliedToDate] = useState('')
  const [customDateError, setCustomDateError] = useState('')
  const filterMenuRef = useRef(null)
  const filterButtonRef = useRef(null)
  // Display mode: 'value' | 'percentage' | 'both'
  const [displayMode, setDisplayMode] = useState('value')
  const [showDisplayMenu, setShowDisplayMenu] = useState(false)
  const displayMenuRef = useRef(null)
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)

  // Persist recent WebSocket deals across refresh
  const WS_CACHE_KEY = 'liveDealsWsCache'
  const loadWsCache = () => {
    try {
      const raw = localStorage.getItem(WS_CACHE_KEY)
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }
  const saveWsCache = (list) => {
    try {
      localStorage.setItem(WS_CACHE_KEY, JSON.stringify(list))
    } catch {}
  }
  
  // Column visibility states
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const columnSelectorRef = useRef(null)
  
  // Load visible columns from localStorage or use defaults
  const getInitialVisibleColumns = () => {
    const defaults = {
      deal: true,
      time: true,
      login: true,
      name: true,
      action: true,
      symbol: true,
      volume: true,
      price: true,
      profit: true,
      commission: true,
      storage: true,
      entry: true,
      order: false,
      position: false,
      reason: false
    }
    
    const saved = localStorage.getItem('liveDealingPageVisibleColumns')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Merge saved with defaults to ensure new columns appear even if localStorage is old
        return { ...defaults, ...parsed }
      } catch (e) {
        console.error('Failed to parse saved columns:', e)
      }
    }
    return defaults
  }
  
  const [visibleColumns, setVisibleColumns] = useState(getInitialVisibleColumns)

  const allColumns = [
    { key: 'deal', label: 'Deal' },
    { key: 'time', label: 'Time' },
    { key: 'login', label: 'Login', sticky: true },
    { key: 'name', label: 'Name' },
    { key: 'action', label: 'Action' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'volume', label: 'Volume' },
    { key: 'price', label: 'Price' },
    { key: 'profit', label: 'Profit' },
    { key: 'commission', label: 'Commission' },
    { key: 'storage', label: 'Storage' },
    { key: 'entry', label: 'Entry' },
    { key: 'order', label: 'Order' },
    { key: 'position', label: 'Position' },
    { key: 'reason', label: 'Reason' }
  ]

  // Column order (persisted) for reorder via Column Chooser
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('liveDealingPageColumnOrder')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return null
  })
  useEffect(() => {
    try {
      if (columnOrder) localStorage.setItem('liveDealingPageColumnOrder', JSON.stringify(columnOrder))
    } catch {}
  }, [columnOrder])
  const resetColumnOrder = () => {
    setColumnOrder(null)
    try { localStorage.removeItem('liveDealingPageColumnOrder') } catch {}
  }
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
      const saved = JSON.parse(localStorage.getItem('liveDealingPagePinnedColumns'))
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('liveDealingPagePinnedColumns', JSON.stringify(pinnedColumns)) } catch {}
  }, [pinnedColumns])
  const togglePinColumn = (key) =>
    setPinnedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  // Column resize (per-column widths persisted to localStorage)
  const { setHeaderRef, getHeaderStyle, handleResizeStart } = useColumnResize('liveDealingPageColumnWidths')

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
  const [showFilterDropdown, setShowFilterDropdown] = useState(null)
  const filterRefs = useRef({})
  const [filterSearchQuery, setFilterSearchQuery] = useState({})
  const [showNumberFilterDropdown, setShowNumberFilterDropdown] = useState(null)
  
  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true)
  
  // Define string columns that should show text filters instead of number filters
  const stringColumns = ['symbol', 'action', 'reason', 'entry']
  const isStringColumn = (key) => stringColumns.includes(key)
  
  // Custom filter modal states
  const [showCustomFilterModal, setShowCustomFilterModal] = useState(false)
  const [customFilterColumn, setCustomFilterColumn] = useState(null)
  const [customFilterType, setCustomFilterType] = useState('equal')
  const [customFilterValue1, setCustomFilterValue1] = useState('')
  const [customFilterValue2, setCustomFilterValue2] = useState('')
  const [customFilterOperator, setCustomFilterOperator] = useState('AND')

  // Column filter helper functions
  const getUniqueColumnValues = (columnKey) => {
    const values = new Set()
    deals.forEach(deal => {
      // Most deal properties are in rawData, except top-level ones like login, time, dealer, etc.
      let value
      if (columnKey === 'login' || columnKey === 'time' || columnKey === 'dealer') {
        value = deal[columnKey]
      } else if (columnKey === 'deal') {
        value = deal.rawData?.deal || deal.id
      } else {
        // For columns like symbol, action, volume, price, profit, etc., check rawData
        value = deal.rawData?.[columnKey]
      }
      
      // Format time column to show readable date format in filter
      if (columnKey === 'time' && value) {
        value = formatTime(value)
      }
      
      if (value !== null && value !== undefined && value !== '') {
        values.add(value)
      }
    })
    const sortedValues = Array.from(values).sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') {
        return a - b
      }
      return String(a).localeCompare(String(b))
    })
    
    // Filter by search query if exists
    const searchQuery = filterSearchQuery[columnKey]?.toLowerCase() || ''
    if (searchQuery) {
      return sortedValues.filter(value => 
        String(value).toLowerCase().includes(searchQuery)
      )
    }
    
    return sortedValues
  }

  const toggleColumnFilter = (columnKey, value) => {
    setColumnFilters(prev => {
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
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: allValues
    }))
  }

  const deselectAllFilters = (columnKey) => {
    setColumnFilters(prev => {
      const { [columnKey]: _, ...rest } = prev
      return rest
    })
  }

  const clearColumnFilter = (columnKey) => {
    setColumnFilters(prev => {
      const numberFilterKey = `${columnKey}_custom`
      const { [columnKey]: _, [numberFilterKey]: __, ...rest } = prev
      return rest
    })
    setFilterSearchQuery(prev => {
      const { [columnKey]: _, ...rest } = prev
      return rest
    })
    if (customFilterColumn === columnKey) {
      setCustomFilterValue1('')
      setCustomFilterValue2('')
      setCustomFilterType('equal')
      setCustomFilterColumn(null)
    }
    setShowFilterDropdown(null)
  }

  const getActiveFilterCount = (columnKey) => {
    // Check for regular checkbox filters
    const checkboxCount = columnFilters[columnKey]?.length || 0
    
    // Check for custom filter (text or number)
    const customFilterKey = `${columnKey}_custom`
    const hasCustomFilter = columnFilters[customFilterKey] ? 1 : 0
    
    return checkboxCount + hasCustomFilter
  }

  const isAllSelected = (columnKey) => {
    const allValues = getUniqueColumnValues(columnKey)
    const selectedValues = columnFilters[columnKey] || []
    return allValues.length > 0 && selectedValues.length === allValues.length
  }

  // Apply custom number filter
  const applyCustomNumberFilter = () => {
    if (!customFilterColumn || !customFilterValue1) return

    const isTextColumn = ['login', 'symbol', 'action', 'reason', 'entry'].includes(customFilterColumn)
    
    const filterConfig = {
      type: customFilterType,
      value1: isTextColumn ? customFilterValue1 : parseFloat(customFilterValue1),
      value2: customFilterValue2 ? (isTextColumn ? customFilterValue2 : parseFloat(customFilterValue2)) : null,
      operator: customFilterOperator,
      isText: isTextColumn
    }

    setColumnFilters(prev => ({
      ...prev,
      [`${customFilterColumn}_custom`]: filterConfig
    }))

    // Close modal and dropdown
    setShowCustomFilterModal(false)
    setShowFilterDropdown(null)
    setShowNumberFilterDropdown(null)
  }

  // Check if value matches number filter
  const matchesNumberFilter = (value, filterConfig) => {
    if (!filterConfig) return true
    
    const numValue = parseFloat(value)
    if (isNaN(numValue)) return false

    const { type, value1, value2 } = filterConfig

    switch (type) {
      case 'equal':
        return numValue === value1
      case 'notEqual':
        return numValue !== value1
      case 'lessThan':
        return numValue < value1
      case 'lessThanOrEqual':
        return numValue <= value1
      case 'greaterThan':
        return numValue > value1
      case 'greaterThanOrEqual':
        return numValue >= value1
      case 'between':
        return value2 !== null && numValue >= value1 && numValue <= value2
      default:
        return true
    }
  }

  // Check if value matches text filter
  const matchesTextFilter = (value, filterConfig) => {
    if (!filterConfig) return true
    
    const strValue = String(value || '')
    const { type, value1 } = filterConfig
    const searchValue = String(value1 || '')

    // Convert to lowercase for case-insensitive comparison
    const strValueLower = strValue.toLowerCase()
    const searchValueLower = searchValue.toLowerCase()

    switch (type) {
      case 'equal':
        return strValueLower === searchValueLower
      case 'notEqual':
        return strValueLower !== searchValueLower
      case 'startsWith':
        return strValueLower.startsWith(searchValueLower)
      case 'endsWith':
        return strValueLower.endsWith(searchValueLower)
      case 'contains':
        return strValueLower.includes(searchValueLower)
      case 'notContains':
        return !strValueLower.includes(searchValueLower)
      default:
        return true
    }
  }

  // Critical: Set unmounted flag ASAP to unblock route transitions
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('liveDealingPageVisibleColumns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  // Keep fetchRef always pointing to the latest fetchAllDealsOnce (fixes stale closure in interval)
  useEffect(() => {
    fetchRef.current = fetchAllDealsOnce
  })

  // Keep currentPageRef in sync so WS handlers can check the latest page
  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  // Reset to page 1 and refetch when time filter or module filter changes; refetch when page/itemsPerPage changes
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (!hasInitialLoad.current) return
    // If the time/module filter changed, reset to page 1 (the page change will trigger another run)
    if (currentPage !== 1) {
      setCurrentPage(1)
      return
    }
    fetchAllDealsOnce()
  }, [timeFilter, appliedFromDate, appliedToDate, moduleFilter])

  // API call on every page or itemsPerPage change
  useEffect(() => {
    if (isPageEffectFirstRun.current) {
      isPageEffectFirstRun.current = false
      return
    }
    if (!hasInitialLoad.current) return
    fetchAllDealsOnce()
  }, [currentPage, itemsPerPage])
  
  // Close filter menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target) && 
          filterButtonRef.current && !filterButtonRef.current.contains(event.target)) {
        setShowFilterMenu(false)
      }
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target)) {
        setShowColumnSelector(false)
      }
      if (displayMenuRef.current && !displayMenuRef.current.contains(event.target)) {
        setShowDisplayMenu(false)
      }
    }
    
    if (showFilterMenu || showColumnSelector || showDisplayMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilterMenu, showColumnSelector, showDisplayMenu])
  
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }
    
    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSuggestions])

  useEffect(() => {
    // Skip entirely when the mobile view is active — LiveDealingModule handles its own fetch
    if (isMobile) return

    // Initial fetch — runs once on mount only
    if (!hasInitialLoad.current) {
      hasInitialLoad.current = true
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (isAuthenticated && !unauthorized && !hidden) {
        fetchAllDealsOnce()
        websocketService.connect()
      }
    }

    // Subscribe to connection state changes
    const unsubscribeConnectionState = websocketService.onConnectionStateChange((state) => {
      setConnectionState(state)
    })

    // Subscribe to ALL DEAL events
    const unsubscribeDealAdded = websocketService.subscribe('DEAL_ADDED', handleDealAddedEvent)
    const unsubscribeDealCreated = websocketService.subscribe('DEAL_CREATED', handleDealAddedEvent)
    const unsubscribeNewDeal = websocketService.subscribe('NEW_DEAL', handleDealAddedEvent)
    const unsubscribeDeal = websocketService.subscribe('deal', handleDealAddedEvent)
    
    const unsubscribeDealUpdated = websocketService.subscribe('DEAL_UPDATED', handleDealUpdatedEvent)
    const unsubscribeDealUpdate = websocketService.subscribe('DEAL_UPDATE', handleDealUpdatedEvent)
    
    const unsubscribeDealDeleted = websocketService.subscribe('DEAL_DELETED', handleDealDeleteEvent)
    const unsubscribeDealDelete = websocketService.subscribe('DEAL_DELETE', handleDealDeleteEvent)

    // Refresh every minute so the 24h window slides forward in time
    const timeWindowInterval = setInterval(() => {
      if (!isMobile && hasInitialLoad.current && fetchRef.current) {
        fetchRef.current()
      }
    }, 60000)

    return () => {
      clearInterval(timeWindowInterval)
      unsubscribeConnectionState()
      unsubscribeDealAdded()
      unsubscribeDealCreated()
      unsubscribeNewDeal()
      unsubscribeDeal()
      unsubscribeDealUpdated()
      unsubscribeDealUpdate()
      unsubscribeDealDeleted()
      unsubscribeDealDelete()
    }
  }, [])

  useEffect(() => {
    const onRefreshed = () => setUnauthorized(false)
    const onLogout = () => setUnauthorized(true)
    window.addEventListener('auth:token_refreshed', onRefreshed)
    window.addEventListener('auth:logout', onLogout)
    return () => {
      window.removeEventListener('auth:token_refreshed', onRefreshed)
      window.removeEventListener('auth:logout', onLogout)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || unauthorized) return
    if (isAuthEffectFirstRun.current) {
      isAuthEffectFirstRun.current = false
      return
    }
    if (!hasInitialLoad.current) return
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (hidden) return
    // Resume data refresh and WS on auth restored
    fetchAllDealsOnce()
    if (connectionState !== 'connected') {
      websocketService.connect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unauthorized, isAuthenticated])

  // Robust date parsing to support dd/mm/yyyy and yyyy-mm-dd
  const parseDateInput = (val) => {
    if (!val) return null
    const s = String(val).trim().replace(/\s+/g, '')
    // ISO yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
    }
    // dd/mm/yyyy (allow spaces around slashes handled above)
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/').map(Number)
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0))
    }
    const dt = new Date(val)
    return isNaN(dt.getTime()) ? null : dt
  }

  // Fetch ALL deals from API ONE TIME on initial load
  const fetchAllDealsOnce = async () => {
    try {
      setError('')
      if (deals.length > 0) {
        setPageLoading(true)
      } else {
        setLoading(true)
      }
      
      let from, to

      // Calculate time range based on filter, recalculated on every call
      if (timeFilter === '24h') {
        const now = Math.floor(Date.now() / 1000)
        from = now - (24 * 60 * 60)
        to = now
      } else if (timeFilter === '7d') {
        const now = Math.floor(Date.now() / 1000)
        from = now - (7 * 24 * 60 * 60)
        to = now
      } else if (timeFilter === 'custom' && appliedFromDate && appliedToDate) {
        const fromDate = parseDateInput(appliedFromDate)
        const toDate = parseDateInput(appliedToDate)
        if (!fromDate || !toDate) {
          throw new Error('Invalid custom date range')
        }
        from = Math.floor(fromDate.getTime() / 1000)
        to = Math.floor(toDate.getTime() / 1000)
      } else {
        const now = Math.floor(Date.now() / 1000)
        from = now - (24 * 60 * 60)
        to = now
      }

      console.log('[LiveDealing] 📅 Time range:', {
        filter: timeFilter,
        from,
        to,
        fromDate: new Date(from * 1000).toISOString(),
        toDate: new Date(to * 1000).toISOString()
      })
      
      // Build server-side action filter for Deal/Money/Both toggle
      const apiFilters = []
      if (moduleFilter === 'deal') {
        apiFilters.push({ field: 'action', operator: 'in', value: ['BUY', 'SELL'] })
      } else if (moduleFilter === 'money') {
        apiFilters.push({ field: 'action', operator: 'not_in', value: ['BUY', 'SELL'] })
      }
      const extraBody = apiFilters.length > 0 ? { filters: apiFilters } : {}

      // Fetch deals using the user-selected row limit and current page
      const response = await brokerAPI.getAllDeals(from, to, itemsPerPage, currentPage, extraBody)

      const payload = response?.data ?? response
      const dealsData = payload?.deals || payload?.items || []
      const apiTotal =
        payload?.total ??
        payload?.totalCount ??
        payload?.total_count ??
        payload?.count ??
        payload?.pagination?.total ??
        null
      const rawTotal = apiTotal != null ? Number(apiTotal) : dealsData.length
      console.log('[LiveDealing] 📊 Fetch result:', { dealsCount: dealsData.length, total: rawTotal, page: currentPage })
      setTotalDealsCount(rawTotal)
      
      // Transform deals
      const transformedDeals = dealsData.map(deal => ({
        id: deal.deal || deal.id,
        time: deal.time || deal.timestamp,
        dealer: deal.dealer || '-',
        login: deal.login,
        request: formatRequestFromDeal(deal),
        answer: 'Done',
        rawData: deal
      }))

      // Sort newest first
      transformedDeals.sort((a, b) => b.time - a.time)

      // On page 1: merge with existing deals (preserves WS deals + survives stale API responses)
      // On other pages: replace (we want exactly the page contents)
      if (currentPage === 1) {
        setDeals(prevDeals => {
          const apiIds = new Set(transformedDeals.map(d => d.id))
          // Keep any existing deals that aren't in the API result (WS-added or recent)
          const extras = prevDeals.filter(d => !apiIds.has(d.id))
          const merged = [...transformedDeals, ...extras]
          merged.sort((a, b) => b.time - a.time)
          return merged.slice(0, 1000)
        })
      } else {
        setDeals(transformedDeals)
      }

      setLoading(false)
      setPageLoading(false)
    } catch (error) {
      console.error('[LiveDealing] ❌ Error loading deals:', error)
      if (error?.response?.status === 401) setUnauthorized(true)
      setError('Failed to load deals')
      setLoading(false)
      setPageLoading(false)
    }
  }

  // Handle DEAL_ADDED events
  const handleDealAddedEvent = (data) => {
    setLoading(false)

    // Only show newly added deals when user is on page 1
    if (currentPageRef.current !== 1) {
      return
    }

    try {
      const dealData = data.data || data
      const login = data.login || dealData.login
      
      // Use the actual deal timestamp from server, fallback to current time if not available
      const timestamp = dealData.time || dealData.timestamp || Math.floor(Date.now() / 1000)
      
      const dealEntry = {
        id: dealData.deal || Date.now() + Math.random(),
        time: timestamp,
        dealer: dealData.dealer || '-',
        login: login,
        request: formatRequestFromDeal(dealData, login),
        answer: 'Done',
        rawData: dealData,
        isWebSocketDeal: true // Mark as WebSocket deal
      }

      setDeals(prevDeals => {
        // Check if deal already exists
        if (prevDeals.some(d => d.id === dealEntry.id)) {
          return prevDeals
        }
        
        // Mark this deal as new for highlight effect
        setNewDealIds(prev => new Set(prev).add(dealEntry.id))
        
        // Remove the highlight effect after 6 seconds (matching animation duration)
        setTimeout(() => {
          setNewDealIds(prev => {
            const updated = new Set(prev)
            updated.delete(dealEntry.id)
            return updated
          })
        }, 6000)
        
        // Add new deal at the beginning (newest first)
        const newDeals = [dealEntry, ...prevDeals]
        
        // Keep max 1000 deals (increased from 500)
        const trimmed = newDeals.slice(0, 1000)
        // Persist a lightweight cache of WS-added deals to survive page refresh
        try {
          const cache = loadWsCache()
          const existing = new Set(cache.map(d => d.id))
          const updatedCache = [dealEntry, ...cache.filter(d => !existing.has(d.id))].slice(0, 200)
          saveWsCache(updatedCache)
        } catch {}
        return trimmed
      })
    } catch (error) {
      console.error('[LiveDealing] Error processing DEAL_ADDED event:', error)
    }
  }

  // Handle DEAL_UPDATED events
  const handleDealUpdatedEvent = (data) => {
    try {
      const dealData = data.data || data
      const dealId = dealData.deal || dealData.id
      
      if (!dealId) {
        return
      }

      setDeals(prevDeals => {
        const index = prevDeals.findIndex(d => d.id === dealId)
        
        if (index === -1) {
          return prevDeals
        }

        const updatedDeals = [...prevDeals]
        const login = data.login || dealData.login || updatedDeals[index].login
        
        updatedDeals[index] = {
          ...updatedDeals[index],
          time: dealData.time || updatedDeals[index].time,
          dealer: dealData.dealer || updatedDeals[index].dealer,
          login: login,
          request: formatRequestFromDeal(dealData, login),
          answer: dealData.answer || updatedDeals[index].answer,
          rawData: data
        }

        return updatedDeals
      })
    } catch (error) {
      console.error('[LiveDealing] Error processing DEAL_UPDATED event:', error)
    }
  }

  // Handle DEAL_DELETED events
  const handleDealDeleteEvent = (data) => {
    try {
      const dealId = data.data?.deal || data.deal || data.data?.id || data.id
      
      if (!dealId) {
        return
      }

      setDeals(prevDeals => {
        const filtered = prevDeals.filter(d => d.id !== dealId)
        return filtered
      })
    } catch (error) {
      console.error('[LiveDealing] Error processing DEAL_DELETED event:', error)
    }
  }

  const formatRequestFromDeal = (dealData, login = null) => {
    const action = getActionLabel(dealData.action)
    const volume = dealData.volume ? (dealData.volume / 10000).toFixed(2) : ''
    const symbol = dealData.symbol || ''
    const price = dealData.price || ''
    const dealLogin = login || dealData.login || ''
    const comment = dealData.comment || ''

    // For BALANCE/CREDIT operations, show comment and profit
    if (action === 'Balance' || action === 'Credit') {
      const profit = dealData.profit || 0
      return `for '${dealLogin}' ${action} ${profit > 0 ? '+' : ''}${profit.toFixed(2)} ${comment ? `(${comment})` : ''}`
    }

    // For trading operations
    if (action && volume && symbol && price) {
      return `for '${dealLogin}' ${action} ${volume} ${symbol} at ${parseFloat(price).toFixed(5)}`
    }
    
    // Fallback
    return `${action || 'Operation'} for '${dealLogin}'${comment ? ` - ${comment}` : ''}`
  }

  const getActionLabel = (action) => {
    const actionMap = {
      'BUY': 'buy',
      'SELL': 'sell',
      'BALANCE': 'Balance',
      'CREDIT': 'Credit',
      'CHARGE': 'Charge',
      'CORRECTION': 'Correction',
      'BONUS': 'Bonus',
      'COMMISSION': 'Commission',
      'DAILY': 'Daily',
      'MONTHLY': 'Monthly',
      'AGENT_DAILY': 'Agent Daily',
      'AGENT_MONTHLY': 'Agent Monthly',
      'INTERESTRATE': 'Interest',
      'CANCEL_BUY': 'Cancel Buy',
      'CANCEL_SELL': 'Cancel Sell',
      'SO_CLOSE': 'Stop Out',
      'TP_CLOSE': 'TP Close',
      'SL_CLOSE': 'SL Close'
    }
    return actionMap[action] || action || 'Unknown'
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  // Format number with Indian comma separator (1,00,000)
  const formatIndianNumber = (num, decimals = 2) => {
    if (num === null || num === undefined || num === '') return '-'
    const number = typeof num === 'string' ? parseFloat(num) : num
    if (isNaN(number)) return '-'
    
    const fixed = number.toFixed(decimals)
    const [integer, decimal] = fixed.split('.')
    
    // Indian number system: last 3 digits, then groups of 2
    const lastThree = integer.slice(-3)
    const otherNumbers = integer.slice(0, -3)
    const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (otherNumbers ? ',' : '') + lastThree
    
    return decimal ? `${formatted}.${decimal}` : formatted
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
  // Money/volume formatter that honors compact mode
  const fmtMoney = (n, digits = 2) => {
    if (n === null || n === undefined || n === '') return '-'
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    if (numericMode === 'compact') return formatCompactIndian(num)
    return formatIndianNumber(num, digits)
  }
  const fmtMoneyFull = (n, digits = 2) => {
    if (n === null || n === undefined || n === '') return '-'
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    return formatIndianNumber(num, digits)
  }
  // Price formatter: only compact when |value| >= 1000
  const fmtPrice = (n, digits = 5) => {
    if (n === null || n === undefined || n === '') return '-'
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    if (numericMode === 'compact' && Math.abs(num) >= 1000) return formatCompactIndian(num)
    return formatIndianNumber(num, digits)
  }
  const fmtPriceFull = (n, digits = 5) => {
    if (n === null || n === undefined || n === '') return '-'
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    return formatIndianNumber(num, digits)
  }
  // Resolve per-row decimal digits from the API response. Falls back to 3
  // when the field is missing or invalid.
  const getDigits = (row, fallback = 3) => {
    if (!row) return fallback
    const raw = row.digits ?? row.digit ?? row.priceDigits
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }
  // Count formatter: compacts when value >= 1000
  const fmtCount = (n) => {
    const num = Number(n) || 0
    if (numericMode === 'compact' && Math.abs(num) >= 1000) return formatCompactIndian(num)
    return formatIndianNumber(num, 0)
  }

  // Get card icon path based on card title
  const getCardIcon = (cardTitle) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'DEALS (24H)': `${baseUrl}desktop-icons/P&L.svg`,
      'DEALS (7D)': `${baseUrl}desktop-icons/P&L.svg`,
      'FILTERED DEALS': `${baseUrl}desktop-icons/P&L.svg`,
      'CONNECTION STATUS': `${baseUrl}desktop-icons/Credit.svg`,
      'UNIQUE LOGINS': `${baseUrl}desktop-icons/Unique Logins.svg`,
      'SYMBOLS': `${baseUrl}desktop-icons/Equity.svg`,
    }
    return iconMap[cardTitle] || `${baseUrl}desktop-icons/Clients.svg`
  }

  const handleRefresh = () => {
    console.log('[LiveDealing] 🔄 Refresh: Reloading all deals from API')
    if (currentPage !== 1) setCurrentPage(1)
    else fetchAllDealsOnce()
  }

  const handleClear = () => {
    console.log('[LiveDealing] 🗑️ Clearing all deals')
    setDeals([])
  }

  // Sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const handleApplyCustomDates = () => {
    // Clear any previous error
    setCustomDateError('')
    
    // Validate that both dates are filled
    if (!customFromDate || !customToDate) {
      setCustomDateError('Please select both From Date and To Date')
      return
    }
    
    // Validate that From date is not after To date
    const fromDate = parseDateInput(customFromDate)
    const toDate = parseDateInput(customToDate)
    
    if (!fromDate || !toDate) {
      setCustomDateError('Invalid date format')
      return
    }
    if (fromDate.getTime() > toDate.getTime()) {
      setCustomDateError('From Date cannot be after To Date')
      return
    }
    
    // Apply the dates
    setAppliedFromDate(customFromDate)
    setAppliedToDate(customToDate)
    setCustomDateError('')
    // Close the dropdown for better feedback
    setShowFilterMenu(false)
  }

  const sortDeals = (dealsToSort) => {
    if (!sortColumn) return dealsToSort

    return [...dealsToSort].sort((a, b) => {
      // Check top-level first, then rawData
      let aVal, bVal
      
      if (sortColumn === 'login' || sortColumn === 'time' || sortColumn === 'dealer') {
        aVal = a[sortColumn]
        bVal = b[sortColumn]
      } else if (sortColumn === 'deal') {
        aVal = a.rawData?.deal || a.id
        bVal = b.rawData?.deal || b.id
      } else {
        aVal = a.rawData?.[sortColumn]
        bVal = b.rawData?.[sortColumn]
      }

      // Handle time sorting
      if (sortColumn === 'time') {
        aVal = parseInt(aVal) || 0
        bVal = parseInt(bVal) || 0
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      // Handle numeric values (including profit, commission, storage, etc.)
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      // Try to parse as numbers if they look numeric
      const aNum = parseFloat(aVal)
      const bNum = parseFloat(bVal)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }

      // Handle string values
      const aStr = String(aVal || '').toLowerCase()
      const bStr = String(bVal || '').toLowerCase()
      
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr)
      } else {
        return bStr.localeCompare(aStr)
      }
    })
  }
  
  // Search and filter deals
  const searchDeals = (dealsToSearch) => {
    if (!searchQuery.trim()) {
      return dealsToSearch
    }
    
    const query = searchQuery.toLowerCase().trim()
    return dealsToSearch.filter(deal => {
      // Search across common fields
      const fields = ['login', 'id', 'dealer', 'action']
      for (const key of fields) {
        const val = deal[key]
        if (val !== null && val !== undefined && String(val).toLowerCase().includes(query)) return true
      }
      // Search in rawData
      if (deal.rawData) {
        const rawFields = ['symbol', 'deal', 'action', 'comment', 'entry']
        for (const key of rawFields) {
          const val = deal.rawData[key]
          if (val !== null && val !== undefined && String(val).toLowerCase().includes(query)) return true
        }
        // Fallback: scan all primitives in rawData
        for (const v of Object.values(deal.rawData)) {
          if (v === null || v === undefined) continue
          const t = typeof v
          if (t === 'string' || t === 'number' || t === 'boolean') {
            if (String(v).toLowerCase().includes(query)) return true
          }
        }
      }
      return false
    })
  }
  
  const handleSuggestionClick = (suggestion) => {
    // Extract the value after the colon
    const value = suggestion.split(': ')[1]
    setSearchQuery(value)
    setShowSuggestions(false)
  }
  
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false)
    }
  }

  // Treat all trading operations (open/close/cancel/stop/tp/sl) as "deal" module
  const isTradeAction = (label) => {
    const l = String(label || '').toLowerCase()
    return (
      l === 'buy' ||
      l === 'sell' ||
      l === 'cancel buy' ||
      l === 'cancel sell' ||
      l === 'stop out' ||
      l === 'tp close' ||
      l === 'sl close'
    )
  }
  const filterByModule = (list) => {
    if (moduleFilter === 'both') return list
    return list.filter((d) => {
      const label = getActionLabel(d?.rawData?.action)
      if (moduleFilter === 'deal' && isTradeAction(label)) return true
      if (moduleFilter === 'money' && !isTradeAction(label)) return true
      return false
    })
  }

  // Pagination
  const trimmedDeals = deals.slice(0, 1000) // Trim to max 1000 deals for display
  const moduleFiltered = filterByModule(trimmedDeals)
  const searchedDeals = searchDeals(moduleFiltered)
  
  // Apply group filter
  let ibFilteredDeals = filterByActiveGroup(searchedDeals, 'login', 'livedealing')
  
  // Apply column filters
  Object.entries(columnFilters).forEach(([columnKey, values]) => {
    if (columnKey.endsWith('_custom')) {
      // Custom filter (text or number)
      const actualColumnKey = columnKey.replace('_custom', '')
      ibFilteredDeals = ibFilteredDeals.filter(deal => {
        let dealValue
        if (actualColumnKey === 'login' || actualColumnKey === 'time' || actualColumnKey === 'dealer') {
          dealValue = deal[actualColumnKey]
        } else if (actualColumnKey === 'deal') {
          dealValue = deal.rawData?.deal || deal.id
        } else {
          dealValue = deal.rawData?.[actualColumnKey]
        }
        
        if (values.isText) {
          return matchesTextFilter(dealValue, values)
        } else {
          return matchesNumberFilter(dealValue, values)
        }
      })
    } else if (values && values.length > 0) {
      // Regular checkbox filter
      ibFilteredDeals = ibFilteredDeals.filter(deal => {
        let dealValue
        if (columnKey === 'login' || columnKey === 'time' || columnKey === 'dealer') {
          dealValue = deal[columnKey]
        } else if (columnKey === 'deal') {
          dealValue = deal.rawData?.deal || deal.id
        } else {
          dealValue = deal.rawData?.[columnKey]
        }
        
        // For time column, format to match displayed format in filter
        if (columnKey === 'time' && dealValue) {
          dealValue = formatTime(dealValue)
        }
        return values.includes(dealValue)
      })
    }
  })
  
  const sortedDeals = sortDeals(ibFilteredDeals)
  
  // Get search suggestions from current deals
  const getSuggestions = () => {
    if (!searchQuery.trim() || searchQuery.length < 1) {
      return []
    }
    
    const query = searchQuery.toLowerCase().trim()
    const suggestions = new Set()
    
    // Get unique values from current deals
    sortedDeals.forEach(deal => {
      const login = String(deal.login || '')
      const symbol = String(deal.rawData?.symbol || '')
      const dealId = String(deal.id || '')
      
      if (login.toLowerCase().includes(query)) {
        suggestions.add(`Login: ${login}`)
      }
      if (symbol.toLowerCase().includes(query) && symbol) {
        suggestions.add(`Symbol: ${symbol}`)
      }
      if (dealId.toLowerCase().includes(query)) {
        suggestions.add(`Deal: ${dealId}`)
      }
    })
    
    return Array.from(suggestions).slice(0, 10)
  }
  
  // Server-side pagination capped at 1000 records total
  const totalPages = Math.ceil(totalDealsCount / itemsPerPage) || 1
  const displayedDeals = sortedDeals

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value)
    setCurrentPage(1)
  }

  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  // Reset to first page when display mode changes
  useEffect(() => {
    setCurrentPage(1)
  }, [displayMode])

  // Reset pagination when time filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [timeFilter, appliedFromDate, appliedToDate])

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
      
      // Close module filter dropdown when clicking outside
      if (showModuleFilter && moduleFilterRef.current && !moduleFilterRef.current.contains(event.target)) {
        setShowModuleFilter(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterDropdown, showModuleFilter, showNumberFilterDropdown])

  // Helper function to render table header with filter
  const renderHeaderCell = (columnKey, label, sortKey = null) => {
    const filterCount = getActiveFilterCount(columnKey)
    const actualSortKey = sortKey || columnKey
    
    return (
      <th
        ref={setHeaderRef(columnKey)}
        style={getHeaderStyle(columnKey)}
        className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider hover:bg-blue-700 transition-all select-none group bg-blue-600"
      >
        <div className="flex items-center gap-1 justify-between">
          <div 
            className="flex items-center gap-1 cursor-pointer flex-1"
            onClick={() => handleSort(actualSortKey)}
          >
            <span className="text-white font-bold">{label}</span>
            {getSortIcon(actualSortKey)}
          </div>
          
          <div className="relative" ref={el => {
            if (!filterRefs.current) filterRefs.current = {}
            filterRefs.current[columnKey] = el
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                const next = showFilterDropdown === columnKey ? null : columnKey
                setShowFilterDropdown(next)
                if (next) {
                  const existing = columnFilters[`${next}_custom`]
                  if (existing) {
                    setCustomFilterColumn(next)
                    setCustomFilterType(existing.type || 'equal')
                    setCustomFilterValue1(existing.value1 != null ? String(existing.value1) : '')
                    setCustomFilterValue2(existing.value2 != null ? String(existing.value2) : '')
                  } else {
                    setCustomFilterColumn(next)
                    setCustomFilterValue1('')
                    setCustomFilterValue2('')
                    setCustomFilterType('equal')
                  }
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
                    // Check if dropdown would go off-screen on the right
                    const dropdownWidth = 256 // w-64 in pixels
                    const offset = 30 // Offset to the right to keep filter icon visible
                    const wouldOverflow = rect.left + offset + dropdownWidth > window.innerWidth
                    // If would overflow, align to the right edge of the button
                    return wouldOverflow 
                      ? `${rect.right - dropdownWidth}px`
                      : `${rect.left + offset}px`
                  })()
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-700">Filter Menu</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowFilterDropdown(null)
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
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
                        type={columnKey === 'time' ? 'datetime-local' : 'number'}
                        step={columnKey === 'time' ? '1' : 'any'}
                        placeholder={columnKey === 'time' ? 'Select date and time' : 'Enter value'}
                        value={columnKey === 'time' && customFilterValue1 ?
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
                          if (columnKey === 'time') {
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
                          type={columnKey === 'time' ? 'datetime-local' : 'number'}
                          step={columnKey === 'time' ? '1' : 'any'}
                          placeholder={columnKey === 'time' ? 'Select date and time' : 'Enter value'}
                          value={columnKey === 'time' && customFilterValue2 ?
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
                            if (columnKey === 'time') {
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

                {/* Footer */}
                <div className="px-2 py-1 border-t border-gray-200 bg-gray-50 rounded-b-lg flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowFilterDropdown(null)
                    }}
                    className="flex-1 px-2 py-1 text-[11px] text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      applyCustomNumberFilter()
                      setShowFilterDropdown(null)
                    }}
                    className="flex-1 px-2 py-1 text-[10px] text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
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

  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    let endPage = Math.min(totalPages, startPage + maxVisible - 1)
    
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1)
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }
    return pages
  }

  const getAvailableOptions = () => {
    const options = []
    const maxOption = Math.ceil(sortedDeals.length / 50) * 50
    for (let i = 50; i <= Math.max(maxOption, 50); i += 50) {
      options.push(i)
      if (options.length >= 10) break
    }
    return options
  }

  const getSortIcon = (column) => {
    if (sortColumn !== column) {
      return (
        <svg className="w-3 h-3 opacity-0 group-hover:opacity-30 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortDirection === 'asc' 
      ? (
        <svg className="w-3 h-3 text-white transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      )
      : (
        <svg className="w-3 h-3 text-white transition-transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      )
  }

  // Mobile detection effect - Must be after all other hooks
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Use mobile view on small screens
  if (isMobile) {
    return <LiveDealingModule />
  }

  return (
    <div className="h-screen flex bg-gradient-to-br from-blue-50 via-white to-blue-50 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false)
          try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {}
        }}
        onToggle={() => setSidebarOpen(v => {
          const n = !v
          try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}
          return n
        })}
      />
      
      <main className={`flex-1 p-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        <div className="max-w-full mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Header Section */}
          <div className="bg-white rounded-2xl shadow-sm px-6 py-3 mb-6">
            {/* Title + Actions */}
            <div className="mb-1.5 pb-1.5 flex items-center justify-between gap-3">
            {/* Title Section */}
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">Live Dealing</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">Real-time trading activity monitor</p>
            </div>

            {/* Action Buttons - All on right side */}
            <div className="flex items-center gap-2">
                  <GroupSelector 
                    moduleName="livedealing" 
                    onCreateClick={() => {
                      setEditingGroup(null)
                      setShowGroupModal(true)
                    }}
                    onEditClick={(group) => {
                      setEditingGroup(group)
                      setShowGroupModal(true)
                    }}
                  />
                  
                  {/* Time Filter Button */}
                  <div className="relative" ref={filterButtonRef}>
                    <button
                      onClick={() => setShowFilterMenu(!showFilterMenu)}
                      className="h-8 px-2.5 rounded-md border border-[#E5E7EB] bg-white text-[#374151] hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5 text-xs font-medium shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                      </svg>
                      {timeFilter === '24h' ? '24h' : timeFilter === '7d' ? '7d' : 'Custom'}
                    </button>
                    {showFilterMenu && (
                      <div
                        ref={filterMenuRef}
                        className="absolute right-0 top-full mt-1 bg-white rounded-md shadow-lg border border-gray-200 py-1.5 z-50 w-72"
                      >
                        <div className="px-3 py-1.5 border-b border-gray-200">
                          <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">Time Period</p>
                        </div>
                        
                        {/* Time Filter Options */}
                        <div className="py-1">
                          <label className="flex items-center px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name="timeFilter"
                              checked={timeFilter === '24h'}
                              onChange={() => setTimeFilter('24h')}
                              className="w-3 h-3 text-blue-600 border-gray-300 focus:ring-blue-500 focus:ring-1"
                            />
                            <span className="ml-2 text-xs font-medium text-gray-700">Last 24 Hours</span>
                          </label>
                          
                          <label className="flex items-center px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name="timeFilter"
                              checked={timeFilter === '7d'}
                              onChange={() => setTimeFilter('7d')}
                              className="w-3 h-3 text-blue-600 border-gray-300 focus:ring-blue-500 focus:ring-1"
                            />
                            <span className="ml-2 text-xs font-medium text-gray-700">Last 7 Days</span>
                          </label>
                          
                          <label className="flex items-center px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors">
                            <input
                              type="radio"
                              name="timeFilter"
                              checked={timeFilter === 'custom'}
                              onChange={() => setTimeFilter('custom')}
                              className="w-3 h-3 text-blue-600 border-gray-300 focus:ring-blue-500 focus:ring-1"
                            />
                            <span className="ml-2 text-xs font-medium text-gray-700">Custom Range</span>
                          </label>
                        </div>
                        
                        {/* Custom Date Range */}
                        {timeFilter === 'custom' && (
                          <div className="px-3 py-2 border-t border-gray-100 space-y-2">
                            <div>
                              <label className="text-xs text-gray-600 mb-1 block">From Date</label>
                              <input
                                type="date"
                                value={customFromDate}
                                onChange={(e) => setCustomFromDate(e.target.value)}
                                lang="en-GB"
                                className="w-full px-2 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 mb-1 block">To Date</label>
                              <input
                                type="date"
                                value={customToDate}
                                onChange={(e) => setCustomToDate(e.target.value)}
                                lang="en-GB"
                                className="w-full px-2 py-1.5 text-sm text-gray-900 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            {customDateError && (
                              <p className="text-xs text-red-600 mt-1">{customDateError}</p>
                            )}
                            <button
                              onClick={handleApplyCustomDates}
                              className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                            >
                              Apply
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Module Filter — segmented Deal / Money / Both */}
                  <div className="flex items-center h-8 bg-[#F3F4F6] rounded-md p-0.5 shadow-inner gap-0">
                    {[
                      { value: 'deal',  label: 'Deal' },
                      { value: 'money', label: 'Money' },
                      { value: 'both',  label: 'Both' },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setModuleFilter(value)}
                        className={`h-full px-3 text-xs font-semibold rounded-[4px] transition-all duration-150 focus:outline-none
                          ${moduleFilter === value
                            ? 'bg-[#3B5BDB] text-white shadow-sm'
                            : 'text-[#374151] hover:bg-white/70'
                          }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={() => {
                      if (isRefreshing) return
                      setIsRefreshing(true)
                      fetchAllDealsOnce().finally(() => setTimeout(() => setIsRefreshing(false), 1000))
                    }}
                    disabled={isRefreshing}
                    className={`h-8 w-8 rounded-md border shadow-sm flex items-center justify-center transition-all ${
                      isRefreshing
                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-50'
                        : 'bg-white border-[#E5E7EB] hover:bg-gray-50 cursor-pointer'
                    }`}
                    title={isRefreshing ? 'Refreshing...' : 'Refresh deals'}
                  >
                    <svg
                      className={`w-4 h-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

          {/* Table with Search Inside */}
          <div className="bg-white rounded-lg shadow-sm border border-[#E5E7EB] overflow-hidden flex flex-col flex-1">
            {/* Search and Controls Bar - Inside table container */}
            <div className="border-b border-[#E5E7EB] p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Left Side - Search and Columns */}
                <div className="flex items-center gap-2 flex-1">
                  {/* Search Bar */}
                  <div className="relative flex-1 max-w-md" ref={searchRef}>
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4B5563]" fill="none" viewBox="0 0 18 18">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setShowSuggestions(true)
                        setCurrentPage(1)
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder="Search"
                      className="w-full h-10 pl-10 pr-10 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('')
                          setShowSuggestions(false)
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                        title="Clear search"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    
                    {/* Suggestions Dropdown */}
                    {showSuggestions && getSuggestions().length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-1 z-50 max-h-60 overflow-y-auto">
                        {getSuggestions().map((suggestion, index) => (
                          <button
                            key={index}
                            onClick={() => handleSuggestionClick(suggestion)}
                            className="w-full text-left px-3 py-2 text-sm text-[#374151] hover:bg-blue-50 transition-colors"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Columns Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowColumnSelector(!showColumnSelector)}
                      className="h-10 w-10 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
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

                {/* Right Side - Pagination */}
                <div className="flex items-center gap-3">
                  <PageSizeSelect value={itemsPerPage} onChange={handleItemsPerPageChange} />
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
                      min="1"
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const page = Number(e.target.value);
                        if (!isNaN(page) && page >= 1 && page <= totalPages) {
                          handlePageChange(page);
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
            <div className="overflow-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9ca3af #e5e7eb' }}>
              {/* Smooth fade animation for new deals */}
              <style>{`
                @keyframes dealFadeOut {
                  0% { background-color: #60a5fa; }
                  30% { background-color: #93c5fd; }
                  60% { background-color: #dbeafe; }
                  100% { background-color: #ffffff; }
                }
                .new-deal-blink {
                  animation: dealFadeOut 6s ease-out forwards !important;
                }
              `}</style>
              <table className="min-w-full divide-y text-xs border-separate border-spacing-0" style={{ borderCollapse: 'separate', borderColor: '#888888' }}>
              <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                <tr className="divide-x divide-blue-400">
                  {orderedColumns.map(col => {
                    if (!visibleColumns[col.key]) return null
                    let cell = null
                    switch (col.key) {
                      case 'time': cell = renderHeaderCell('time', 'Time'); break
                      case 'deal': cell = renderHeaderCell('deal', 'Deal'); break
                      case 'login': cell = renderHeaderCell('login', 'Login'); break
                      case 'name': cell = renderHeaderCell('name', 'Name'); break
                      case 'action': cell = renderHeaderCell('action', 'Action'); break
                      case 'symbol': cell = renderHeaderCell('symbol', 'Symbol'); break
                      case 'volume': cell = renderHeaderCell('volume', 'Volume'); break
                      case 'price': cell = renderHeaderCell('price', 'Price'); break
                      case 'profit': cell = renderHeaderCell('profit', 'Profit'); break
                      case 'commission': cell = renderHeaderCell('commission', 'Commission'); break
                      case 'storage': cell = renderHeaderCell('storage', 'Storage'); break
                      case 'entry': cell = renderHeaderCell('entry', 'Entry'); break
                      case 'order': cell = renderHeaderCell('order', 'Order'); break
                      case 'position': cell = renderHeaderCell('position', 'Position'); break
                      case 'reason': cell = renderHeaderCell('reason', 'Reason'); break
                      default: cell = null
                    }
                    if (!cell) return null
                    cell = applyPin(cell, col.key, true)
                    return <Fragment key={col.key}>{cell}</Fragment>
                  })}
                </tr>
                {loading && (
                  <tr>
                    <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="p-0 bg-blue-600">
                      <div className="table-loading-bar" />
                    </td>
                  </tr>
                )}
              </thead>

              <tbody className="bg-white divide-y-2 text-sm" style={{ borderColor: '#888888' }}>
                {(loading && deals.length === 0) || pageLoading ? (
                  Array.from({ length: itemsPerPage > 20 ? 12 : itemsPerPage }, (_, i) => (
                    <tr key={`deal-skeleton-${i}`} className="bg-white border-b border-[#E1E1E1]">
                      {orderedColumns.map(col => (
                        visibleColumns[col.key] ? (
                          <td key={col.key} className="px-2" style={{ height: '38px' }}>
                            <div className="h-3 w-full max-w-[80%] skeleton-shimmer-pos" />
                          </td>
                        ) : null
                      ))}
                    </tr>
                  ))
                ) : displayedDeals.length === 0 ? (
                  <tr>
                    <td colSpan={Object.values(visibleColumns).filter(v => v).length} className="px-6 py-12 text-center">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No deals yet
                      </h3>
                      <p className="text-sm text-gray-500">
                        Waiting for live trades...
                      </p>
                    </td>
                  </tr>
                  ) : (
                    displayedDeals.map((deal, index) => (
                    <tr 
                      key={deal.id} 
                      className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${newDealIds.has(deal.id) ? 'new-deal-blink' : ''}`}
                      style={{ borderLeft: '3px solid #e5e7eb' }}
                    >
                      {orderedColumns.map(col => {
                        if (!visibleColumns[col.key]) return null
                        const isPinnedCell = pinnedColumns.includes(col.key)
                        const cellStyle = isPinnedCell ? {
                          borderRight: '1px solid #e5e7eb',
                          position: 'sticky',
                          left: `${pinnedOffsets[col.key] || 0}px`,
                          zIndex: 5,
                          backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9fafb',
                          boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)'
                        } : { borderRight: '1px solid #e5e7eb' }
                        switch (col.key) {
                          case 'time':
                            return <td key="time" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle}>{formatTime(deal.time)}</td>
                          case 'deal':
                            return <td key="deal" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900" style={cellStyle}>{deal.rawData?.deal || deal.id}</td>
                          case 'login':
                            return (
                              <td 
                                key="login"
                                className="px-3 py-2.5 whitespace-nowrap text-sm text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                                style={cellStyle}
                                onClick={(e) => { e.stopPropagation(); setSelectedLogin(deal.login) }}
                                title="Click to view login details"
                              >
                                {deal.login}
                              </td>
                            )
                          case 'name':
                            return <td key="name" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900" style={cellStyle}>{deal.rawData?.name ?? deal.name ?? '-'}</td>
                          case 'action':
                            return (
                              <td key="action" className="px-3 py-2.5 whitespace-nowrap text-sm" style={cellStyle}>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  deal.rawData?.action === 'BUY' 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {deal.rawData?.action || '-'}
                                </span>
                              </td>
                            )
                          case 'symbol':
                            return <td key="symbol" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-900" style={cellStyle}>{deal.rawData?.symbol || '-'}</td>
                          case 'volume':
                            return <td key="volume" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle} title={numericMode === 'compact' ? fmtMoneyFull(deal.rawData?.volume, 2) : undefined}>{fmtMoney(deal.rawData?.volume, 2)}</td>
                          case 'price':
                            return <td key="price" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle}>{fmtPriceFull(deal.rawData?.price, getDigits(deal.rawData))}</td>
                          case 'profit':
                            return (
                              <td key="profit" className={`px-3 py-2.5 whitespace-nowrap text-sm ${
                                (deal.rawData?.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`} style={cellStyle} title={numericMode === 'compact' ? fmtMoneyFull(deal.rawData?.profit, 2) : undefined}>
                                {fmtMoney(deal.rawData?.profit, 2)}
                              </td>
                            )
                          case 'commission':
                            return <td key="commission" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle} title={numericMode === 'compact' ? fmtMoneyFull(deal.rawData?.commission, 2) : undefined}>{fmtMoney(deal.rawData?.commission, 2)}</td>
                          case 'storage':
                            return <td key="storage" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle} title={numericMode === 'compact' ? fmtMoneyFull(deal.rawData?.storage, 2) : undefined}>{fmtMoney(deal.rawData?.storage, 2)}</td>
                          case 'entry':
                            return <td key="entry" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle}>{deal.rawData?.entry || 0}</td>
                          case 'order':
                            return <td key="order" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle}>{deal.rawData?.order || '-'}</td>
                          case 'position':
                            return <td key="position" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-700" style={cellStyle}>{deal.rawData?.position || '-'}</td>
                          case 'reason':
                            return <td key="reason" className="px-3 py-2.5 whitespace-nowrap text-sm text-gray-600" style={cellStyle}>{deal.rawData?.reason || '-'}</td>
                          default:
                            return null
                        }
                      })}
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
              </div>
            </div>

          {/* Pagination - Bottom */}
        </div>
      </main>
      
      {/* Create Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false)
          setEditingGroup(null)
        }}
        availableItems={deals}
        loginField="login"
        displayField="symbol"
        secondaryField="id"
        editGroup={editingGroup}
      />

      {/* Client Positions Modal */}
      {selectedLogin && (
        <ClientPositionsModal
          client={{ login: selectedLogin }}
          onClose={() => setSelectedLogin(null)}
          onClientUpdate={() => {}}
          allPositionsCache={[]}
          allOrdersCache={[]}
          onCacheUpdate={() => {}}
        />
      )}

      {/* Custom Filter Modal */}
      {showCustomFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]" onClick={() => setShowCustomFilterModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
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

            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Show rows where:</p>
                <p className="text-sm text-gray-600 mb-3">{customFilterColumn}</p>
              </div>

              <div>
                <select
                  value={customFilterType}
                  onChange={(e) => setCustomFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                >
                  {['login', 'symbol', 'action', 'reason'].includes(customFilterColumn) ? (
                    <>
                      <option value="equal">Equal</option>
                      <option value="notEqual">Not Equal</option>
                      <option value="startsWith">Starts With</option>
                      <option value="endsWith">Ends With</option>
                      <option value="contains">Contains</option>
                      <option value="notContains">Does Not Contain</option>
                    </>
                  ) : (
                    <>
                      <option value="equal">Equal</option>
                      <option value="notEqual">Not Equal</option>
                      <option value="lessThan">Less Than</option>
                      <option value="lessThanOrEqual">Less Than Or Equal</option>
                      <option value="greaterThan">Greater Than</option>
                      <option value="greaterThanOrEqual">Greater Than Or Equal</option>
                      <option value="between">Between</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <input
                  type={['login', 'symbol', 'action', 'reason'].includes(customFilterColumn) ? 'text' : 'number'}
                  value={customFilterValue1}
                  onChange={(e) => setCustomFilterValue1(e.target.value)}
                  placeholder="Enter the value"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                />
              </div>

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
                      type={['login', 'symbol', 'action', 'reason'].includes(customFilterColumn) ? 'text' : 'number'}
                      value={customFilterValue2}
                      onChange={(e) => setCustomFilterValue2(e.target.value)}
                      placeholder="Enter the value"
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                    />
                  </div>
                </>
              )}
            </div>

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
    </div>
  )
}

export default LiveDealingPage
