import { useEffect, useRef, useState, useMemo, useCallback, Fragment, useDeferredValue } from 'react'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { useGroups } from '../contexts/GroupContext'
import { brokerAPI } from '../services/api'
import Sidebar from '../components/Sidebar'
import WebSocketIndicator from '../components/WebSocketIndicator'
import LoadingSpinner from '../components/LoadingSpinner'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import PositionModule from '../components/PositionModule'
import DateFilterModal from '../components/DateFilterModal'
import { normalizePositions } from '../utils/currencyNormalization'

const PositionsPage = () => {
  // Mobile detection - initialize with actual window width to prevent flash
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 768
    }
    return false
  })

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Use cached data from DataContext (orders, clients etc.)
  const { orders: cachedOrders, loading, connectionState, rawClients } = useData()
  const { isAuthenticated } = useAuth()
  const { filterByActiveGroup, activeGroupFilters } = useGroups()

  // --- Positions are fetched via REST polling (1s) when this page is active ---
  const [polledPositions, setPolledPositions] = useState([])
  const [serverTotalPositions, setServerTotalPositions] = useState(0)
  const [hasFetchedPositions, setHasFetchedPositions] = useState(false)
  // Server-provided totals across ALL positions (not just current page)
  const [serverTotals, setServerTotals] = useState({ profit: 0, storage: 0, volume: 0, uniqueLogins: 0 })

  // --- NET positions fetched via REST polling (1s) when NET tab is active ---
  const [polledNetPositions, setPolledNetPositions] = useState([])
  const [serverTotalNetPositions, setServerTotalNetPositions] = useState(0)
  const [hasFetchedNetPositions, setHasFetchedNetPositions] = useState(false)
  const [serverNetTotals, setServerNetTotals] = useState({ profit: 0, storage: 0, volume: 0 })

  // --- Client NET positions fetched via REST polling (1s) when Client NET tab is active ---
  const [polledClientNetPositions, setPolledClientNetPositions] = useState([])
  const [serverTotalClientNetPositions, setServerTotalClientNetPositions] = useState(0)
  const [hasFetchedClientNetPositions, setHasFetchedClientNetPositions] = useState(false)
  const [serverClientNetTotals, setServerClientNetTotals] = useState({ profit: 0, storage: 0, volume: 0 })
  
  // Build client currency map from rawClients for USC detection
  const clientCurrencyMap = useMemo(() => {
    if (!rawClients || rawClients.length === 0) return {}
    const map = {}
    rawClients.forEach(client => {
      if (client && client.login && client.currency) {
        map[client.login] = client.currency
      }
    })
    return map
  }, [rawClients])
  
  // Apply USD normalization to all positions automatically with USC handling
  const displayPositions = useMemo(() => {
    if (!polledPositions || polledPositions.length === 0) return polledPositions
    return normalizePositions(polledPositions, clientCurrencyMap)
  }, [polledPositions, clientCurrencyMap])
  
  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true)
  
  // Critical: Set unmounted flag ASAP to unblock route transitions
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])
  
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v ? JSON.parse(v) : false
    } catch {
      return false
    }
  })
  const [netShowColumnSelector, setNetShowColumnSelector] = useState(false)
  // Include all position module columns + NET-specific aggregations (some will render '-')
  const [netVisibleColumns, setNetVisibleColumns] = useState({
    // NET-specific columns only
    symbol: true,
    netType: true,
    netVolume: true,
    totalProfit: true,
    totalStorage: false,
    totalCommission: false,
    loginCount: true,
    totalPositions: true,
    variantCount: false
  })
  const toggleNetColumn = (col) => setNetVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))
  // NET Position sorting
  const [netSortColumn, setNetSortColumn] = useState(null)
  const [netSortDirection, setNetSortDirection] = useState('asc')
  // Search for NET view
  const [netSearchQuery, setNetSearchQuery] = useState('')
  const [netActiveSearch, setNetActiveSearch] = useState('') // only sent to API on Enter or search icon click
  const netSearchRef = useRef(null)
  const netCardFilterRef = useRef(null)
  // Card filter for NET summary cards
  const [netCardFilterOpen, setNetCardFilterOpen] = useState(false)
  const [netCardsVisible, setNetCardsVisible] = useState({
    netSymbols: true,
    totalNetVolume: true,
    totalNetPL: true,
    totalLogins: true
  })
  // NET positions column selector ref
  const netColumnSelectorRef = useRef(null)
  // Client NET controls and visibility
  const [clientNetShowColumnSelector, setClientNetShowColumnSelector] = useState(false)
  const clientNetColumnSelectorRef = useRef(null)
  const [clientNetVisibleColumns, setClientNetVisibleColumns] = useState({
    login: true,
    symbol: true,
    netType: true,
    netVolume: true,
    avgPrice: true,
    totalProfit: true,
    totalPositions: true
  })
  const toggleClientNetColumn = (col) => setClientNetVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))
  const [clientNetCardFilterOpen, setClientNetCardFilterOpen] = useState(false)
  const [clientNetCardsVisible, setClientNetCardsVisible] = useState({
    clientNetRows: true,
    totalNetVolume: true,
    totalNetPL: true,
    totalLogins: true
  })
  // Client NET sorting
  const [clientNetSortColumn, setClientNetSortColumn] = useState(null)
  const [clientNetSortDirection, setClientNetSortDirection] = useState('asc')
  // Client NET search
  const [clientNetSearchQuery, setClientNetSearchQuery] = useState('')
  const [clientNetActiveSearch, setClientNetActiveSearch] = useState('') // only sent to API on Enter or search icon click
  const clientNetSearchRef = useRef(null)
  const clientNetCardFilterRef = useRef(null)
  // Client NET pagination
  const [clientNetCurrentPage, setClientNetCurrentPage] = useState(1)
  const [clientNetItemsPerPage, setClientNetItemsPerPage] = useState(() => {
    try {
      const saved = localStorage.getItem('client_net_items_per_page')
      if (saved) return saved === 'All' ? 'All' : parseInt(saved)
      return 50
    } catch {
      return 50
    }
  })
  
  // Column visibility states
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const columnSelectorRef = useRef(null)
  const [displayMode, setDisplayMode] = useState('value') // 'value' or 'percentage'
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({
    position: false,
    time: true,
    login: true,
    action: true,
    symbol: true,
    volume: true,
    priceOpen: true,
    priceCurrent: true,
    sl: false,
    tp: false,
    profit: true,
    profitPercentage: false,
    storage: false,
    storagePercentage: false,
    volumePercentage: false,
    appliedPercentage: false,
    reason: false,
    comment: false,
    commission: false
  })

  const allColumns = [
    { key: 'position', label: 'Position' },
    { key: 'login', label: 'Login', sticky: true },
    { key: 'action', label: 'Action' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'volume', label: 'Volume' },
    { key: 'priceOpen', label: 'Price Open' },
    { key: 'priceCurrent', label: 'Price Current' },
    { key: 'sl', label: 'S/L' },
    { key: 'tp', label: 'T/P' },
    { key: 'profit', label: 'Profit' },
    { key: 'storage', label: 'Storage' },
    { key: 'reason', label: 'Reason' },
    { key: 'comment', label: 'Comment' },
    { key: 'commission', label: 'Commission' }
  ]

  // Map base metric keys to their percentage field names from API
  const percentageFieldMap = {
    volume: 'volume_percentage',
    profit: 'profit_percentage',
    storage: 'storage_percentage'
  }

  const isMetricColumn = (key) => Object.prototype.hasOwnProperty.call(percentageFieldMap, key)

  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }
  
  const formatPercent = (value) => {
    if (value === null || value === undefined || value === '') return '-'
    const num = Number(value)
    if (isNaN(num)) return '-'
    return num.toFixed(2)
  }

  // Get effective visible columns based on display mode
  const getEffectiveVisibleColumns = () => {
    const effective = { ...visibleColumns }
    
    if (displayMode === 'value') {
      // Without Percentage: Hide all percentage columns
      effective.volumePercentage = false
      effective.profitPercentage = false
      effective.storagePercentage = false
    } else if (displayMode === 'percentage') {
      // Show Percentage: Replace value columns with percentage columns (only if base column is checked)
      effective.volumePercentage = visibleColumns.volume
      effective.profitPercentage = visibleColumns.profit
      effective.storagePercentage = visibleColumns.storage
      effective.volume = false
      effective.profit = false
      effective.storage = false
    }
    
    return effective
  }

  // Define string columns that should not show number filters
  const stringColumns = ['symbol', 'action', 'reason', 'comment', 'login']
  const isStringColumn = (key) => stringColumns.includes(key)

  // Column filter states
  const [columnFilters, setColumnFilters] = useState({})
  const [pendingColumnFilters, setPendingColumnFilters] = useState({})
  const [showFilterDropdown, setShowFilterDropdown] = useState(null)
  const filterRefs = useRef({})
  const numberFilterButtonRefs = useRef({})
  const [filterSearchQuery, setFilterSearchQuery] = useState({})
  const [showNumberFilterDropdown, setShowNumberFilterDropdown] = useState(null)
  
  // Date filter states
  const [dateFilter, setDateFilter] = useState(null) // null, 3, 5, or 7 for days
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false)
  const dateFilterRef = useRef(null)
  const [hasPendingDateChanges, setHasPendingDateChanges] = useState(false)
  const [pendingDateDraft, setPendingDateDraft] = useState(null)
  
  // Sorting states for ALL positions view
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  
  // Search state for ALL positions view
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearch, setActiveSearch] = useState('') // only sent to API on Enter or search icon click
  
  // Pagination states for ALL positions view
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(() => isMobile ? 12 : 25)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const prevPageRef = useRef(currentPage)
  
  // NET positions toggle and grouping
  const [showNetPositions, setShowNetPositions] = useState(false)
  const [groupByBaseSymbol, setGroupByBaseSymbol] = useState(false)
  const [expandedNetKeys, setExpandedNetKeys] = useState(new Set())
  
  // NET positions pagination
  const [netCurrentPage, setNetCurrentPage] = useState(1)
  const [netItemsPerPage, setNetItemsPerPage] = useState(50)
  
  // Client NET toggle
  const [showClientNet, setShowClientNet] = useState(false)
  
  // Group modal states
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  
  // Client positions modal state
  const [selectedLogin, setSelectedLogin] = useState(null)
  
  // Search ref for ALL positions view
  const searchRef = useRef(null)
  
  // Flash timeouts for row highlighting
  const flashTimeouts = useRef(new Map())
  const [flashes, setFlashes] = useState({})
  
  // Custom filter modal states
  const [showCustomFilterModal, setShowCustomFilterModal] = useState(false)
  const [customFilterColumn, setCustomFilterColumn] = useState(null)
  const [customFilterType, setCustomFilterType] = useState('equal')
  const [customFilterValue1, setCustomFilterValue1] = useState('')
  const [customFilterValue2, setCustomFilterValue2] = useState('')
  const [customFilterOperator, setCustomFilterOperator] = useState('AND')

  // Column filter helper functions
  const getUniqueColumnValues = (columnKey) => {
    // For symbol column, use server-provided list
    if (columnKey === 'symbol' && allSymbols.length > 0) {
      const searchQ = filterSearchQuery[columnKey]?.toLowerCase() || ''
      if (searchQ) {
        return allSymbols.filter(s => s.toLowerCase().includes(searchQ))
      }
      return allSymbols
    }

    // For action column, use server-provided list (fallback to BUY/SELL)
    if (columnKey === 'action') {
      const actions = allActions.length > 0 ? allActions : ['BUY', 'SELL']
      const searchQ = filterSearchQuery[columnKey]?.toLowerCase() || ''
      if (searchQ) {
        return actions.filter(a => a.toLowerCase().includes(searchQ))
      }
      return actions
    }

    // For login column, use server-provided login list from API
    if (columnKey === 'login' && allLogins.length > 0) {
      const searchQ = filterSearchQuery[columnKey]?.toLowerCase() || ''
      if (searchQ) {
        return allLogins.filter(l => String(l).toLowerCase().includes(searchQ))
      }
      return allLogins
    }

    const values = new Set()
    const isTimeColumn = columnKey === 'timeUpdate'
    const originalTimestamps = new Map() // Store original timestamps for sorting
    
    polledPositions.forEach(position => {
      let value = position[columnKey]
      
      // Format timeUpdate (epoch) to dd/mm/yyyy hh:mm:ss for display in filter
      if (isTimeColumn && value) {
        const formatted = formatTime(value)
        // Only add if formatting was successful (not '-')
        if (formatted && formatted !== '-') {
          originalTimestamps.set(formatted, value) // Map formatted -> original timestamp
          value = formatted
        }
      }
      
      if (value !== null && value !== undefined && value !== '' && value !== '-') {
        values.add(value)
      }
    })
    
    const sortedValues = Array.from(values).sort((a, b) => {
      // For time column, sort by original timestamp (chronological order)
      if (isTimeColumn && originalTimestamps.has(a) && originalTimestamps.has(b)) {
        return originalTimestamps.get(b) - originalTimestamps.get(a) // Newest first
      }
      
      // For numeric values
      if (typeof a === 'number' && typeof b === 'number') {
        return a - b
      }
      
      // For string values
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

  // Commit pending checkbox filters to actual columnFilters (called on OK / Enter)
  const commitColumnFilters = () => {
    setColumnFilters(prev => {
      const merged = { ...prev }
      // Get the column that's currently open
      const columnKey = showFilterDropdown
      if (!columnKey) return prev
      // Update only the open column's checkbox filters from pending
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
    setCurrentPage(1)
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

  // Apply custom number filter
  const applyCustomNumberFilter = () => {
    if (!customFilterColumn || !customFilterValue1) return

    const isTextFilter = ['startsWith', 'endsWith', 'contains', 'doesNotContain'].includes(customFilterType)
    const isStringCol = isStringColumn(customFilterColumn)
    
    const filterConfig = {
      type: customFilterType,
      value1: (isTextFilter || isStringCol) ? customFilterValue1 : parseFloat(customFilterValue1),
      value2: customFilterValue2 ? ((isTextFilter || isStringCol) ? customFilterValue2 : parseFloat(customFilterValue2)) : null,
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

  // Check if value matches number or text filter
  const matchesNumberFilter = (value, filterConfig) => {
    if (!filterConfig) return true
    
    const { type, value1, value2 } = filterConfig

    // Handle text filters
    if (['startsWith', 'endsWith', 'contains', 'doesNotContain'].includes(type)) {
      const strValue = String(value || '').toLowerCase()
      const searchValue = String(value1 || '').toLowerCase()
      
      switch (type) {
        case 'startsWith':
          return strValue.startsWith(searchValue)
        case 'endsWith':
          return strValue.endsWith(searchValue)
        case 'contains':
          return strValue.includes(searchValue)
        case 'doesNotContain':
          return !strValue.includes(searchValue)
        default:
          return true
      }
    }

    // Handle number filters
    const numValue = parseFloat(value)
    if (isNaN(numValue)) return false

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

  // Helper to queue a transient highlight for a given position id
  const queueFlash = (id, data = {}) => {
    if (!id) return
    const key = String(id)

    
    // Clear previous timeout if any
    const prevTo = flashTimeouts.current.get(key)
    if (prevTo) clearTimeout(prevTo)

    setFlashes((prev) => ({
      ...prev,
      [key]: {
        ts: Date.now(),
        ...data,
      },
    }))

    const to = setTimeout(() => {
      setFlashes((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      flashTimeouts.current.delete(key)
    }, 1500)
    flashTimeouts.current.set(key, to)
  }
  const hasInitialLoad = useRef(false)
  const prevPositionsRef = useRef([])

  // Server-provided symbol list for column filter
  const [allSymbols, setAllSymbols] = useState([])
  const fetchSymbols = () => {
    if (!isAuthenticated) return
    brokerAPI.getPositionSymbols().then(res => {
      const symbols = res?.data?.symbols || []
      if (Array.isArray(symbols)) setAllSymbols(symbols)
    }).catch((err) => { console.warn('[Symbols] Fetch error:', err?.message) })
  }

  // Server-provided login list for column filter
  const [allLogins, setAllLogins] = useState([])
  const fetchLogins = () => {
    if (!isAuthenticated) return
    brokerAPI.getPositionLogins().then(res => {
      const logins = res?.data?.logins || res?.data || []
      if (Array.isArray(logins)) setAllLogins(logins.sort((a, b) => a - b))
    }).catch((err) => { console.warn('[Logins] Fetch error:', err?.message) })
  }

  // Server-provided action list for column filter
  const [allActions, setAllActions] = useState([])
  const fetchActions = () => {
    if (!isAuthenticated) return
    brokerAPI.getPositionActions().then(res => {
      const actions = res?.data?.actions || res?.data || []
      if (Array.isArray(actions) && actions.length > 0) {
        setAllActions(actions.map(a => String(a).toUpperCase()))
      }
    }).catch((err) => { console.warn('[Actions] Fetch error:', err?.message) })
  }

  // Show loading skeleton when page changes
  useEffect(() => {
    if (currentPage !== prevPageRef.current) {
      setIsPageLoading(true)
      prevPageRef.current = currentPage
    }
  }, [currentPage])

    useEffect(() => {
    if (!isAuthenticated || isMobile || showNetPositions || showClientNet) {
      return
    }

    let timer = null
    let isCancelled = false

    const poll = async () => {
      if (isCancelled) return
      try {
        const params = {
          page: currentPage,
          limit: itemsPerPage,
          sortBy: sortColumn || 'timeCreate',
          sortOrder: sortDirection || 'desc'
        }
        if (displayMode === 'percentage') params.percentage = true
        if (activeSearch.trim()) {
          params.search = activeSearch.trim()
        }
        if (dateFilter) {
          const now = Math.floor(Date.now() / 1000)
          const daysInSeconds = dateFilter * 24 * 60 * 60
          params.dateFrom = now - daysInSeconds
          params.dateTo = now
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
        // Add checkbox action selections as API filters
        if (Array.isArray(columnFilters['action']) && columnFilters['action'].length > 0) {
          apiFilters.push({ field: 'action', operator: 'in', value: columnFilters['action'] })
        }
        // Add login checkbox selections as API filters
        if (Array.isArray(columnFilters['login']) && columnFilters['login'].length > 0) {
          apiFilters.push({ field: 'login', operator: 'in', value: columnFilters['login'].map(Number) })
        }
        if (apiFilters.length > 0) {
          params.filters = apiFilters
        }

        const response = await brokerAPI.searchPositions(params)
        if (isCancelled) return
        const data = response?.data?.positions || response?.positions || []
        const total = response?.data?.total || response?.total || 0
        const totals = response?.data?.totals || response?.totals || null
        if (Array.isArray(data)) {
          setPolledPositions(data)
          setServerTotalPositions(total)
          if (totals) setServerTotals(totals)
          setIsPageLoading(false)
          setHasFetchedPositions(true)
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('[Positions] Polling error:', err?.message)
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
      // Mark component as unmounted to prevent state updates
      isMountedRef.current = false
      
      // Clear any pending flash timeouts
      try {
        flashTimeouts.current.forEach((to) => clearTimeout(to))
        flashTimeouts.current.clear()
      } catch {}
    }
  }, [isAuthenticated, isMobile, showNetPositions, showClientNet, currentPage, itemsPerPage, sortColumn, sortDirection, activeSearch, dateFilter, columnFilters, displayMode])

  // REST polling for NET positions (netPosition: true) when NET tab is active
  useEffect(() => {
    if (!isAuthenticated || isMobile || !showNetPositions) {
      return
    }

    let timer = null
    let isCancelled = false

    const poll = async () => {
      if (isCancelled) return
      try {
        const params = {
          page: netCurrentPage,
          limit: netItemsPerPage === 'All' ? 10000 : netItemsPerPage,
          netPosition: true,
          sortBy: netSortColumn || 'netVolume',
          sortOrder: netSortDirection || 'desc'
        }
        if (groupByBaseSymbol) params.groupBaseSymbol = true
        if (netActiveSearch.trim()) params.search = netActiveSearch.trim()

        const response = await brokerAPI.searchPositions(params)
        if (isCancelled) return
        const data = response?.data?.positions || response?.positions || []
        const total = response?.data?.total || response?.total || 0
        const totals = response?.data?.totals || response?.totals || null
        if (Array.isArray(data)) {
          if (totals) {
            // Map API field names (netVolume, totalProfit, totalStorage) to our state field names
            setServerNetTotals({
              volume: totals.netVolume ?? totals.volume ?? 0,
              profit: totals.totalProfit ?? totals.profit ?? 0,
              storage: totals.totalStorage ?? totals.storage ?? 0
            })
          }
          // Map API fields to UI field names
          // When groupBaseSymbol is true, API returns 'baseSymbol' instead of 'symbol'
          const mapped = data.map(item => ({
            symbol: item.symbol || item.baseSymbol,
            netType: item.action === 'BUY' ? 'Buy' : item.action === 'SELL' ? 'Sell' : (item.action === 'FLAT' ? 'Flat' : (item.action || 'Flat')),
            netVolume: item.netVolume || 0,
            avgPrice: item.avgPrice || 0,
            totalProfit: item.totalProfit || 0,
            totalStorage: item.totalStorage || 0,
            totalCommission: item.totalCommission || 0,
            loginCount: item.clientCount || 0,
            totalPositions: item.positionCount || 0,
            variantCount: item.variants?.length || 1,
            variants: (item.variants || []).map(v => ({
              exactSymbol: v.symbol || v.exactSymbol,
              netType: v.action === 'BUY' ? 'Buy' : v.action === 'SELL' ? 'Sell' : (v.action === 'FLAT' ? 'Flat' : (v.action || 'Flat')),
              netVolume: v.netVolume || 0,
              avgPrice: v.avgPrice || 0,
              totalProfit: v.totalProfit || 0,
              totalStorage: v.totalStorage || 0,
              totalCommission: v.totalCommission || 0
            }))
          }))
          setPolledNetPositions(mapped)
          setServerTotalNetPositions(total)
          setHasFetchedNetPositions(true)
        }
      } catch (err) {
        if (!isCancelled) console.warn('[NET Positions] Polling error:', err?.message)
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
  }, [isAuthenticated, isMobile, showNetPositions, netCurrentPage, netItemsPerPage, netSortColumn, netSortDirection, netActiveSearch, groupByBaseSymbol])

  // REST polling for Client NET positions (clientNet: true) when Client NET tab is active
  useEffect(() => {
    if (!isAuthenticated || isMobile || !showClientNet) {
      return
    }

    let timer = null
    let isCancelled = false

    const poll = async () => {
      if (isCancelled) return
      try {
        const params = {
          page: clientNetCurrentPage,
          limit: clientNetItemsPerPage === 'All' ? 10000 : clientNetItemsPerPage,
          clientNet: true,
          sortBy: clientNetSortColumn || 'login',
          sortOrder: clientNetSortDirection || 'asc'
        }
        if (clientNetActiveSearch.trim()) params.search = clientNetActiveSearch.trim()

        const response = await brokerAPI.searchPositions(params)
        if (isCancelled) return
        const data = response?.data?.positions || response?.positions || []
        const total = response?.data?.total || response?.total || 0
        const totals = response?.data?.totals || response?.totals || null
        if (Array.isArray(data)) {
          if (totals) {
            // Map API field names (netVolume, totalProfit, totalStorage) to our state field names
            setServerClientNetTotals({
              volume: totals.netVolume ?? totals.volume ?? 0,
              profit: totals.totalProfit ?? totals.profit ?? 0,
              storage: totals.totalStorage ?? totals.storage ?? 0
            })
          }
          // Map API fields to UI field names
          const mapped = data.map(item => ({
            login: item.login,
            symbol: item.symbol,
            netType: item.action === 'BUY' ? 'Buy' : item.action === 'SELL' ? 'Sell' : (item.action || 'Flat'),
            netVolume: item.netVolume || 0,
            avgPrice: item.avgPrice || 0,
            totalProfit: item.totalProfit || 0,
            totalPositions: item.positionCount || 0,
            variantCount: item.variants?.length || 1,
            variants: (item.variants || []).map(v => ({
              exactSymbol: v.symbol || v.exactSymbol,
              netType: v.action === 'BUY' ? 'Buy' : v.action === 'SELL' ? 'Sell' : (v.action || 'Flat'),
              netVolume: v.netVolume || 0,
              avgPrice: v.avgPrice || 0,
              totalProfit: v.totalProfit || 0
            }))
          }))
          setPolledClientNetPositions(mapped)
          setServerTotalClientNetPositions(total)
          setHasFetchedClientNetPositions(true)
        }
      } catch (err) {
        if (!isCancelled) console.warn('[Client NET Positions] Polling error:', err?.message)
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
  }, [isAuthenticated, isMobile, showClientNet, clientNetCurrentPage, clientNetItemsPerPage, clientNetSortColumn, clientNetSortDirection, clientNetActiveSearch])

  // Track position changes for flash indicators (polling updates)
  useEffect(() => { if (!isAuthenticated) return;
    
    if (polledPositions.length === 0) {
      prevPositionsRef.current = polledPositions
      return
    }

    const prevPositions = prevPositionsRef.current
    const prevMap = new Map(prevPositions.map(p => [getPosKey(p), p]))

    let newCount = 0
    let updateCount = 0
    let deletedCount = prevPositions.length - polledPositions.length

    polledPositions.forEach(pos => {
      const key = getPosKey(pos)
      if (!key) return

      const prev = prevMap.get(key)
      if (!prev) {
        // New position added
        newCount++
        queueFlash(key, { type: 'add' })
      } else {
        // Check for updates
        const priceDelta = Number(pos.priceCurrent || 0) - Number(prev.priceCurrent || 0)
        const profitDelta = Number(pos.profit || 0) - Number(prev.profit || 0)

        if (Math.abs(priceDelta) > 0.00001 || Math.abs(profitDelta) > 0.01) {
          updateCount++
          queueFlash(key, { type: 'update', priceDelta, profitDelta })
        }
      }
    })

    // Re-enable refresh button when positions update
    if (isRefreshing && (newCount > 0 || updateCount > 0 || deletedCount > 0)) {
      setIsRefreshing(false)
    }

    prevPositionsRef.current = polledPositions
  }, [polledPositions, isRefreshing])
  
  // Close suggestions when clicking outside
  useEffect(() => { if (!isAuthenticated) return;
    const handleClickOutside = (event) => {
      if (!isMountedRef.current) return

      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target)) {
        setShowColumnSelector(false)
      }
      if (netCardFilterRef.current && !netCardFilterRef.current.contains(event.target)) {
        setNetCardFilterOpen(false)
      }
      if (clientNetCardFilterRef.current && !clientNetCardFilterRef.current.contains(event.target)) {
        setClientNetCardFilterOpen(false)
      }
      if (netColumnSelectorRef.current && !netColumnSelectorRef.current.contains(event.target)) {
        setNetShowColumnSelector(false)
      }
      if (clientNetColumnSelectorRef.current && !clientNetColumnSelectorRef.current.contains(event.target)) {
        setClientNetShowColumnSelector(false)
      }
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target)) {
        setIsDateFilterOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (!isMountedRef.current) return
      if (event.key === 'Escape') {
        if (showColumnSelector) setShowColumnSelector(false)
        if (netCardFilterOpen) setNetCardFilterOpen(false)
        if (clientNetCardFilterOpen) setClientNetCardFilterOpen(false)
        if (netShowColumnSelector) setNetShowColumnSelector(false)
        if (clientNetShowColumnSelector) setClientNetShowColumnSelector(false)
        if (isDateFilterOpen) setIsDateFilterOpen(false)
      }
    }

    if (showColumnSelector || netCardFilterOpen || clientNetCardFilterOpen || netShowColumnSelector || clientNetShowColumnSelector || isDateFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside, true)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [showColumnSelector, netCardFilterOpen, clientNetCardFilterOpen, netShowColumnSelector, clientNetShowColumnSelector, isDateFilterOpen, isAuthenticated])

  // Helper to get position key/id
  const getPosKey = (obj) => {
    const id = obj?.position
    return id !== undefined && id !== null ? String(id) : undefined
  }

  const formatNumber = (n, digits = 2) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    return num.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }

  // Indian numbering format (12,34,567.89)
  const formatIndianNumber = (n, digits = 2) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    try {
      return num.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    } catch {
      // Fallback if locale unsupported
      const [intPart, decPart = ''] = Math.abs(num).toFixed(digits).split('.')
      const lastThree = intPart.slice(-3)
      const otherNumbers = intPart.slice(0, -3)
      const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (otherNumbers ? ',' : '') + lastThree
      return decPart ? `${formatted}.${decPart}` : formatted
    }
  }

  // Get card icon path based on card title
  const getCardIcon = (cardTitle) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'Total Positions': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'Floating Profit': `${baseUrl}Desktop cards icons/Floating Profit.svg`,
      'Floating Profit %': `${baseUrl}Desktop cards icons/Floating Profit.svg`,
      'Unique Logins': `${baseUrl}Desktop cards icons/Total Clients.svg`,
      'Symbols': `${baseUrl}Desktop cards icons/Total Equity.svg`,
      // NET Position cards
      'NET Symbols': `${baseUrl}Desktop cards icons/Total Clients.svg`,
      'Total NET Volume': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'Total NET P/L': `${baseUrl}Desktop cards icons/PNL.svg`,
      'Total Logins': `${baseUrl}Desktop cards icons/Total Clients.svg`,
      // Client NET cards
      'Client NET Rows': `${baseUrl}Desktop cards icons/Total Clients.svg`,
    }
    return iconMap[cardTitle] || `${baseUrl}Desktop cards icons/Total Clients.svg`
  }

  // Helper function to adjust value for USC symbols (divide by 100)
  const adjustValueForSymbol = (value, symbol, isCentField = false) => {
    if (!symbol || value === null || value === undefined) return value
    const symbolStr = String(symbol).toUpperCase()
    if (symbolStr.includes('USC')) {
      return Number(value) / 100
    }
    if (isCentField && /[cC]$/.test(String(symbol))) {
      return Number(value) / 100
    }
    return value
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

  // Normalize action label and chip classes to match Live Dealing
  const getActionLabel = (action) => {
    if (action === 0 || action === '0') return 'Buy'
    if (action === 1 || action === '1') return 'Sell'
    const s = String(action || '').toLowerCase()
    if (s.includes('buy')) return 'Buy'
    if (s.includes('sell')) return 'Sell'
    return String(action || '-')
  }
  const getActionChipClasses = (action) => {
    const s = String(action ?? '').toLowerCase()
    const isBuy = action === 0 || action === '0' || s.includes('buy')
    return isBuy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  }

  // Calculate NET positions for all clients with reversed type display
  // Robust to multiple action encodings: 0/1, 'Buy'/'Sell', 'BUY'/'SELL', 'buy'/'sell'
  const calculateGlobalNetPositions = (positions) => {
    if (!positions || positions.length === 0) return []

    const symbolMap = new Map()
    const getBaseSymbol = (s) => {
      if (!s || typeof s !== 'string') return s
      // Split on first dot or hyphen to collapse variants like XAUUSD.f, XAUUSD-z, etc.
      const parts = s.split(/[\.\-]/)
      return parts[0] || s
    }

    positions.forEach(pos => {
      const symbol = pos.symbol
      if (!symbol) return
      const key = groupByBaseSymbol ? getBaseSymbol(symbol) : symbol

      if (!symbolMap.has(key)) {
        symbolMap.set(key, {
          key, // grouping key (base or exact)
          buyPositions: [],
          sellPositions: [],
          logins: new Set(),
          variantMap: new Map() // exactSymbol -> { buyPositions:[], sellPositions:[] }
        })
      }

      const group = symbolMap.get(key)
      group.logins.add(pos.login)

      // If symbol ends with 'c' or 'C' (cent symbols), scale monetary fields by 1/100
      const isCent = /[cC]$/.test(symbol)
      const adj = isCent
        ? {
            ...pos,
            profit: (pos.profit || 0) / 100,
            storage: (pos.storage || 0) / 100,
            commission: (pos.commission || 0) / 100
          }
        : pos

      // Normalize action to handle various formats from API/WS
      const rawAction = adj.action
      let actionNorm = null
      if (rawAction === 0 || rawAction === '0') actionNorm = 'buy'
      else if (rawAction === 1 || rawAction === '1') actionNorm = 'sell'
      else if (typeof rawAction === 'string') actionNorm = rawAction.toLowerCase()

      if (actionNorm === 'buy') {
        group.buyPositions.push(adj)
      } else if (actionNorm === 'sell') {
        group.sellPositions.push(adj)
      } else {
        // Fallback: try to infer from sign conventions if available
        // If action cannot be determined, skip adding to buy/sell buckets
      }

      // Track exact symbol variants when grouping by base
      if (groupByBaseSymbol) {
        const exact = symbol
        if (!group.variantMap.has(exact)) {
          group.variantMap.set(exact, { buyPositions: [], sellPositions: [] })
        }
        const v = group.variantMap.get(exact)
        if (actionNorm === 'buy') v.buyPositions.push(adj)
        else if (actionNorm === 'sell') v.sellPositions.push(adj)
      }
    })

    const netPositionsData = []

    symbolMap.forEach(group => {
      const buyVolume = group.buyPositions.reduce((sum, p) => sum + (p.volume || 0), 0)
      const sellVolume = group.sellPositions.reduce((sum, p) => sum + (p.volume || 0), 0)
      const netVolume = buyVolume - sellVolume

      if (netVolume === 0) return

  let totalWeightedPrice = 0
  let totalVolume = 0
  let totalProfit = 0
  let totalStorage = 0
  let totalCommission = 0

      if (netVolume > 0) {
        // Net Buy - use buy positions for average
        group.buyPositions.forEach(p => {
          const vol = p.volume || 0
          const price = p.priceOpen || 0
          totalWeightedPrice += price * vol
          totalVolume += vol
          totalProfit += p.profit || 0
          totalStorage += p.storage || 0
          totalCommission += p.commission || 0
        })
      } else {
        // Net Sell - use sell positions for average
        group.sellPositions.forEach(p => {
          const vol = p.volume || 0
          const price = p.priceOpen || 0
          totalWeightedPrice += price * vol
          totalVolume += vol
          totalProfit += p.profit || 0
          totalStorage += p.storage || 0
          totalCommission += p.commission || 0
        })
      }

      const avgPrice = totalVolume > 0 ? totalWeightedPrice / totalVolume : 0
      
      // Reversed type: if net is Buy, show Sell (what action to take to close)
      const netType = netVolume > 0 ? 'Sell' : 'Buy'
      const loginCount = group.logins.size
      const totalPositions = group.buyPositions.length + group.sellPositions.length

      // Build variant breakdown when grouping by base symbol
      let variantCount = 1
      let variants = []
      if (groupByBaseSymbol) {
        variantCount = group.variantMap.size
        variants = Array.from(group.variantMap.entries()).map(([exact, data]) => {
          const vBuyVol = data.buyPositions.reduce((s, p) => s + (p.volume || 0), 0)
          const vSellVol = data.sellPositions.reduce((s, p) => s + (p.volume || 0), 0)
          const vNet = vBuyVol - vSellVol
          if (vNet === 0) return null
          let tw = 0, tv = 0, tp = 0, ts = 0, tc = 0
          const use = vNet > 0 ? data.buyPositions : data.sellPositions
          use.forEach(p => { const vol = p.volume || 0; const price = p.priceOpen || 0; tw += price * vol; tv += vol; tp += p.profit || 0; ts += p.storage || 0; tc += p.commission || 0 })
          const vAvg = tv > 0 ? tw / tv : 0
          return {
            exactSymbol: exact,
            netType: vNet > 0 ? 'Sell' : 'Buy',
            netVolume: Math.abs(vNet),
            avgPrice: /[cC]$/.test(exact) ? vAvg / 100 : vAvg,
            totalProfit: /[cC]$/.test(exact) ? tp / 100 : tp,
            totalStorage: ts,
            totalCommission: tc
          }
        }).filter(Boolean)
      }

      netPositionsData.push({
        symbol: group.key,
        netType,
        netVolume: Math.abs(netVolume),
        avgPrice: /[cC]$/.test(group.key) ? avgPrice / 100 : avgPrice,
        totalProfit: /[cC]$/.test(group.key) ? totalProfit / 100 : totalProfit,
        totalStorage,
        totalCommission,
        loginCount,
        totalPositions,
        variantCount,
        variants
      })
    })

    return netPositionsData.sort((a, b) => b.netVolume - a.netVolume)
  }

  // Generate pagination options; ensure common sizes always present for stable UI
  const generatePageSizeOptions = () => {
    const base = [25, 50, 100, 200, 500]
    return base
  }
  
  const pageSizeOptions = generatePageSizeOptions()
  
  // Generate NET Position page size options based on data count
  const generateNetPageSizeOptions = () => {
    const base = [25, 50, 100, 200]
    const totalCount = serverTotalNetPositions
    
    // Only include options that are less than or equal to total count
    const validOptions = base.filter(size => size < totalCount)
    
    // If total count is greater than 0 and not already in the list, add it
    if (totalCount > 0 && !base.includes(totalCount)) {
      validOptions.push(totalCount)
    } else if (totalCount > 0 && totalCount <= 200) {
      // If total is a base number, include it
      if (!validOptions.includes(totalCount)) {
        validOptions.push(totalCount)
      }
    }
    
    return validOptions.length > 0 ? validOptions.sort((a, b) => a - b) : [25]
  }
  
  // Generate Client NET page size options based on data count
  const generateClientNetPageSizeOptions = () => {
    const base = [25, 50, 100, 200]
    const totalCount = serverTotalClientNetPositions
    
    // Only include options that are less than or equal to total count
    const validOptions = base.filter(size => size < totalCount)
    
    // If total count is greater than 0 and not already in the list, add it
    if (totalCount > 0 && !base.includes(totalCount)) {
      validOptions.push(totalCount)
    } else if (totalCount > 0 && totalCount <= 200) {
      // If total is a base number, include it
      if (!validOptions.includes(totalCount)) {
        validOptions.push(totalCount)
      }
    }
    
    return validOptions.length > 0 ? validOptions.sort((a, b) => a - b) : [25]
  }
  
  // Search function
  const searchPositions = (positionsToSearch) => {
    if (!searchQuery.trim()) {
      return positionsToSearch
    }
    
    const query = searchQuery.toLowerCase().trim()
    return positionsToSearch.filter(position => {
      // Search through all primitive fields
      for (const key in position) {
        if (position.hasOwnProperty(key)) {
          const value = position[key]
          
          // Handle action field specially (0=Buy, 1=Sell)
          if (key === 'action') {
            let actionText = ''
            if (value === 0 || value === '0') actionText = 'buy'
            else if (value === 1 || value === '1') actionText = 'sell'
            else actionText = String(value || '').toLowerCase()
            
            if (actionText.includes(query)) return true
          }
          // Check primitive values (string, number)
          else if (value !== null && value !== undefined) {
            const strValue = String(value).toLowerCase()
            if (strValue.includes(query)) return true
          }
        }
      }
      return false
    })
  }
  
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setActiveSearch(searchQuery.trim())
      setCurrentPage(1)
    }
  }

  const handleSearchClick = () => {
    setActiveSearch(searchQuery.trim())
    setCurrentPage(1)
  }

  // Defer heavy list processing so route changes remain responsive
  const deferredPositions = useDeferredValue(displayPositions)

  // Memoize filtered positions — server already handles pagination/sort/search,
  // but we still apply IB, group, date, and column filters client-side.
  const { sortedPositions, ibFilteredPositions } = useMemo(() => {
    if (!isAuthenticated) {
      return { sortedPositions: [], ibFilteredPositions: [] }
    }
    
    // Server already did search + sort + pagination — start from the page of data we got
    let ibFiltered = [...deferredPositions]
    
    // Apply group filter
    ibFiltered = filterByActiveGroup(ibFiltered, 'login', 'positions')
    
    // Apply column filters (checkbox filters only — condition filters handled by API)
    Object.entries(columnFilters).forEach(([columnKey, values]) => {
      if (columnKey.endsWith('_number')) {
        // Condition filters are now handled server-side via API filters[]
        return
      } else if (columnKey === 'symbol' || columnKey === 'action' || columnKey === 'login') {
        // Symbol, action, and login checkbox filters are now handled server-side via API
        return
      } else if (values && values.length > 0) {
        ibFiltered = ibFiltered.filter(position => {
          let positionValue = position[columnKey]
          if (columnKey === 'timeUpdate' && positionValue) {
            const formatted = formatTime(positionValue)
            if (formatted && formatted !== '-') {
              positionValue = formatted
            }
          }
          return values.includes(positionValue)
        })
      }
    })
    
    return { sortedPositions: ibFiltered, ibFilteredPositions: ibFiltered }
  }, [deferredPositions, columnFilters, isAuthenticated, filterByActiveGroup, activeGroupFilters])

  // Memoized summary statistics - use server-provided totals across ALL positions
  const summaryStats = useMemo(() => {
    const totalPositions = serverTotalPositions
    // Invert profit to show broker perspective (client loss = broker gain)
    const totalFloatingProfit = -(serverTotals.profit || 0)
    const totalFloatingProfitPercentage = -ibFilteredPositions.reduce((sum, p) => sum + (p.profit_percentage || 0), 0)
    const uniqueLogins = Number(serverTotals.uniqueLogins || 0)
    const uniqueSymbols = new Set(ibFilteredPositions.map(p => p.symbol)).size
    const totalVolume = Number(serverTotals.volume || 0)

    return {
      totalPositions,
      totalFloatingProfit,
      totalFloatingProfitPercentage,
      uniqueLogins,
      uniqueSymbols,
      totalVolume
    }
  }, [ibFilteredPositions, serverTotalPositions, serverTotals])
  
  // Handle column header click for sorting
  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }
  
  // Pagination — server handles page/limit, we use serverTotalPositions for total pages
  const totalPages = Math.ceil(serverTotalPositions / itemsPerPage)
  const displayedPositions = sortedPositions // server already paginated
  
  // Reset to page 1 when items per page changes
  useEffect(() => { if (!isAuthenticated) return;
    setCurrentPage(1)
  }, [itemsPerPage])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!isMountedRef.current) return
      
      // Check if clicking outside main filter dropdown
      if (showFilterDropdown && filterRefs.current[showFilterDropdown]) {
        if (!filterRefs.current[showFilterDropdown].contains(event.target)) {
          setShowFilterDropdown(null)
          setShowNumberFilterDropdown(null)
        }
      }
      
      // Check if clicking outside number filter dropdown (when it's open independently)
      if (showNumberFilterDropdown && !showFilterDropdown) {
        const numberFilterElements = document.querySelectorAll('[data-number-filter]')
        let clickedInside = false
        numberFilterElements.forEach(el => {
          if (el.contains(event.target)) {
            clickedInside = true
          }
        })
        if (!clickedInside) {
          setShowNumberFilterDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterDropdown, showNumberFilterDropdown])
  
  // NET positions data — fetched from server via polling (netPosition: true)
  const netPositionsData = polledNetPositions

  const handleNetSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setNetActiveSearch(netSearchQuery.trim())
      setNetCurrentPage(1)
    }
  }
  const handleNetSearchClick = () => {
    setNetActiveSearch(netSearchQuery.trim())
    setNetCurrentPage(1)
  }

  // NET Position sorting handler
  const handleNetSort = (columnKey) => {
    if (netSortColumn === columnKey) {
      setNetSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setNetSortColumn(columnKey)
      setNetSortDirection('asc')
    }
  }

  const netFilteredPositions = useMemo(() => {
    // Server handles search and sort — just return server data directly
    return netPositionsData
  }, [netPositionsData])

  // Pagination — server handles page/limit for NET positions
  const netTotalPages = netItemsPerPage === 'All' ? 1 : Math.ceil(serverTotalNetPositions / (netItemsPerPage || 50))
  const netDisplayedPositions = netFilteredPositions // server already paginated
  useEffect(() => { if (!isAuthenticated) return; setNetCurrentPage(1) }, [netItemsPerPage])
  const handleNetPageChange = (p) => { setNetCurrentPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const handleNetItemsPerPageChange = (v) => {
    const next = v === 'All' ? 'All' : parseInt(v)
    setNetItemsPerPage(next)
    try { localStorage.setItem('net_items_per_page', String(next)) } catch {}
    setNetCurrentPage(1)
  }

  // Calculate Client NET positions (group first by login then by symbol)
  // Client NET positions data — fetched from server via polling (clientNet: true)
  const clientNetPositionsData = polledClientNetPositions

  const handleClientNetSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setClientNetActiveSearch(clientNetSearchQuery.trim())
      setClientNetCurrentPage(1)
    }
  }
  const handleClientNetSearchClick = () => {
    setClientNetActiveSearch(clientNetSearchQuery.trim())
    setClientNetCurrentPage(1)
  }

  // Client NET sorting handler
  const handleClientNetSort = (columnKey) => {
    if (clientNetSortColumn === columnKey) {
      setClientNetSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setClientNetSortColumn(columnKey)
      setClientNetSortDirection('asc')
    }
  }

  const clientNetFilteredPositions = useMemo(() => {
    // Server handles search and sort — just return server data directly
    return clientNetPositionsData
  }, [clientNetPositionsData])

  // Pagination — server handles page/limit for Client NET positions
  const clientNetTotalPages = clientNetItemsPerPage === 'All' ? 1 : Math.ceil(serverTotalClientNetPositions / (clientNetItemsPerPage || 50))
  const clientNetDisplayedPositions = clientNetFilteredPositions // server already paginated
  useEffect(() => { if (!isAuthenticated) return; setClientNetCurrentPage(1) }, [clientNetItemsPerPage])
  const handleClientNetPageChange = (p) => { setClientNetCurrentPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const handleClientNetItemsPerPageChange = (v) => {
    const next = v === 'All' ? 'All' : parseInt(v)
    setClientNetItemsPerPage(next)
    try { localStorage.setItem('client_net_items_per_page', String(next)) } catch {}
    setClientNetCurrentPage(1)
  }

  // CSV helpers and export handlers
  const toCSV = (rows, headers) => {
    if (!rows || rows.length === 0) return headers.map(h => h.label).join(',')
    const esc = (v) => {
      if (v === null || v === undefined) return ''
      let s = String(v)
      s = s.replace(/"/g, '""')
      if (/[",\n]/.test(s)) s = '"' + s + '"'
      return s
    }
    const headerRow = headers.map(h => h.label).join(',')
    const body = rows.map(r => headers.map(h => esc(h.accessor ? h.accessor(r) : r[h.key])).join(',')).join('\n')
    return headerRow + '\n' + body
  }

  const downloadFile = (filename, content, mime = 'text/csv;charset=utf-8') => {
    try {
      const blob = new Blob([content], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('CSV download failed:', e)
    }
  }

  const handleExportPositions = () => {
    const effectiveCols = getEffectiveVisibleColumns()
    const order = [
      'time','login','position','symbol','action','volume','volumePercentage','priceOpen','priceCurrent','sl','tp','profit','profitPercentage','storage','storagePercentage','appliedPercentage','reason','comment','commission'
    ]
    const labelMap = {
      time: 'Time',
      login: 'Login',
      position: 'Position',
      symbol: 'Symbol',
      action: 'Action',
      volume: 'Volume',
      volumePercentage: 'Volume %',
      priceOpen: 'Open',
      priceCurrent: 'Current',
      sl: 'S/L',
      tp: 'T/P',
      profit: 'Profit',
      profitPercentage: 'Profit %',
      storage: 'Storage',
      storagePercentage: 'Storage %',
      appliedPercentage: 'Applied %',
      reason: 'Reason',
      comment: 'Comment',
      commission: 'Commission'
    }
    const accessors = {
      time: (p) => formatTime(p.timeUpdate || p.timeCreate),
      login: (p) => p.login,
      position: (p) => p.position,
      symbol: (p) => p.symbol,
      action: (p) => p.action,
      volume: (p) => p.volume,
      volumePercentage: (p) => p.volume_percentage,
      priceOpen: (p) => p.priceOpen,
      priceCurrent: (p) => p.priceCurrent,
      sl: (p) => p.priceSL,
      tp: (p) => p.priceTP,
      profit: (p) => p.profit,
      profitPercentage: (p) => p.profit_percentage,
      storage: (p) => p.storage,
      storagePercentage: (p) => p.storage_percentage,
      appliedPercentage: (p) => p.applied_percentage,
      reason: (p) => p.reason,
      comment: (p) => p.comment,
      commission: (p) => p.commission
    }
    const headers = order
      .filter(k => effectiveCols[k])
      .map(k => ({ key: k, label: labelMap[k], accessor: accessors[k] }))
    const csv = toCSV(sortedPositions, headers)
    downloadFile(`positions_${Date.now()}.csv`, csv)
  }

  const handleExportNetPositions = () => {
    const headers = [
      { key: 'symbol', label: 'Symbol' },
      { key: 'netType', label: 'NET Type' },
      { key: 'netVolume', label: 'NET Volume' },
      { key: 'totalProfit', label: 'Total Profit' },
      { key: 'loginCount', label: 'Logins' },
      { key: 'totalPositions', label: 'Positions' }
    ]
    const csv = toCSV(netFilteredPositions, headers)
    downloadFile(`net_positions_${Date.now()}.csv`, csv)
  }

  // NET table dynamic columns: order, labels, and cell renderers
  const netColumnOrder = [
    'symbol','netType','netVolume','totalProfit','totalStorage','totalCommission','loginCount','totalPositions','variantCount'
  ]
  const netColumnLabels = {
    symbol: 'Symbol',
    netType: 'NET Type',
    netVolume: 'NET Volume',
    totalProfit: 'Total Profit',
    totalStorage: 'Total Storage',
    totalCommission: 'Total Commission',
    loginCount: 'Logins',
    totalPositions: 'Positions',
    variantCount: 'Variant Count'
  }
  const renderNetCell = (key, netPos) => {
    switch (key) {
      case 'symbol':
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-sm font-medium text-gray-900">{netPos.symbol}</span>
            {groupByBaseSymbol && netPos.variantCount > 1 && (
              <>
                <span className="text-[11px] text-gray-500">(+{netPos.variantCount - 1} variants)</span>
                <button
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => {
                    const next = new Set(expandedNetKeys)
                    if (next.has(netPos.symbol)) next.delete(netPos.symbol); else next.add(netPos.symbol)
                    setExpandedNetKeys(next)
                  }}
                >
                  {expandedNetKeys.has(netPos.symbol) ? 'Hide variants' : 'Show variants'}
                </button>
              </>
            )}
          </div>
        )
      case 'netType':
        return (
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${netPos.netType === 'Buy' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{netPos.netType}</span>
        )
      case 'netVolume':
        return formatNumber(netPos.netVolume, 2)
      case 'avgPrice':
        return formatNumber(netPos.avgPrice, 5)
      case 'totalProfit':
      case 'profit': {
        const val = key === 'profit' ? netPos.totalProfit : netPos.totalProfit
        return (
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${val >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{formatNumber(val, 2)}</span>
        )
      }
      case 'totalStorage':
      case 'storage':
        return formatNumber(netPos.totalStorage ?? '-', 2)
      case 'totalCommission':
      case 'commission':
        return formatNumber(netPos.totalCommission ?? '-', 2)
      case 'loginCount':
        return netPos.loginCount
      case 'totalPositions':
        return netPos.totalPositions
      case 'variantCount':
        return netPos.variantCount
      default:
        return String(netPos[key] ?? '-')
    }
  }

  const handleExportClientNetPositions = () => {
    const headers = [
      { key: 'login', label: 'Login' },
      { key: 'symbol', label: 'Symbol' },
      { key: 'netType', label: 'NET Type' },
      { key: 'netVolume', label: 'NET Volume' },
      { key: 'avgPrice', label: 'Avg Price' },
      { key: 'totalProfit', label: 'Total Profit' }
    ]
    const csv = toCSV(clientNetPositionsData, headers)
    downloadFile(`client_net_${Date.now()}.csv`, csv)
  }
  
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  
  const handleItemsPerPageChange = (value) => {
    const numValue = parseInt(value)
    setItemsPerPage(numValue)
    try { localStorage.setItem('positions_items_per_page', String(numValue)) } catch {}
    setCurrentPage(1)
  }

  // Helper function to render table header with filter and single-click sorting
  const renderHeaderCell = (columnKey, label, sortKey = null) => {
    const filterCount = getActiveFilterCount(columnKey)
    const actualSortKey = sortKey || columnKey
    
    return (
      <th className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider transition-all select-none group border-r border-gray-200 last:border-r-0">
        <div className="flex items-center gap-1 justify-between">
          <div 
            className="flex items-center gap-1 cursor-pointer flex-1 text-white"
            onClick={() => handleSort(actualSortKey)}
          >
            <span className="text-white">{label}</span>
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
                  // Initialize pending filters from current committed filters
                  setPendingColumnFilters(prev => ({ ...prev, [columnKey]: columnFilters[columnKey] || [] }))
                  if (columnKey === 'symbol') fetchSymbols()
                  if (columnKey === 'login') fetchLogins()
                  if (columnKey === 'action') fetchActions()
                  // Initialize filter state for string/numeric columns
                  setCustomFilterColumn(columnKey)
                  const existing = columnFilters[`${columnKey}_number`]
                  if (existing) {
                    setCustomFilterType(existing.type || 'equal')
                    setCustomFilterValue1(existing.value1 != null ? String(existing.value1) : '')
                    setCustomFilterValue2(existing.value2 != null ? String(existing.value2) : '')
                  } else {
                    setCustomFilterType('equal')
                    setCustomFilterValue1('')
                    setCustomFilterValue2('')
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    commitColumnFilters()
                  }
                }}
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
                    <span className="text-xs text-gray-700">Text Filters</span>
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
                <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSort(columnKey, 'asc')
                      setShowFilterDropdown(null)
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-200 ${
                      sortColumn === columnKey && sortDirection === 'asc' ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                    {isStringColumn(columnKey) ? 'Sort A to Z' : 'Sort Smallest to Largest'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSort(columnKey, 'desc')
                      setShowFilterDropdown(null)
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-200 mt-1 ${
                      sortColumn === columnKey && sortDirection === 'desc' ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                    </svg>
                    {isStringColumn(columnKey) ? 'Sort Z to A' : 'Sort Largest to Smallest'}
                  </button>
                </div>

                {/* Clear Filter Button */}
                <div className="px-3 py-2 border-b border-gray-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearColumnFilter(columnKey)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Filter
                  </button>
                </div>


                {/* Number Filters (only for numeric columns) */}
                {!isStringColumn(columnKey) && (
                  <div className="border-b border-slate-200 px-3 py-2 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">CONDITION</label>
                      <select
                        value={customFilterType}
                        onChange={(e) => setCustomFilterType(e.target.value)}
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
                        type={columnKey === 'timeUpdate' ? 'datetime-local' : 'number'}
                        step={columnKey === 'timeUpdate' ? '1' : 'any'}
                        placeholder={columnKey === 'timeUpdate' ? 'Select date and time' : 'Enter value'}
                        value={columnKey === 'timeUpdate' && customFilterValue1 ?
                          (() => {
                            const timestamp = Number(customFilterValue1)
                            if (isNaN(timestamp)) return customFilterValue1
                            const date = new Date(timestamp * 1000)
                            return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`
                          })()
                          : customFilterValue1
                        }
                        onChange={(e) => {
                          if (columnKey === 'timeUpdate') {
                            const dateValue = e.target.value
                            setCustomFilterValue1(dateValue ? String(Math.floor(new Date(dateValue).getTime() / 1000)) : '')
                          } else {
                            setCustomFilterValue1(e.target.value)
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (customFilterType === 'between' && !customFilterValue2) return
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
                          type={columnKey === 'timeUpdate' ? 'datetime-local' : 'number'}
                          step={columnKey === 'timeUpdate' ? '1' : 'any'}
                          placeholder={columnKey === 'timeUpdate' ? 'Select date and time' : 'Enter value'}
                          value={columnKey === 'timeUpdate' && customFilterValue2 ?
                            (() => {
                              const timestamp = Number(customFilterValue2)
                              if (isNaN(timestamp)) return customFilterValue2
                              const date = new Date(timestamp * 1000)
                              return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`
                            })()
                            : customFilterValue2
                          }
                          onChange={(e) => {
                            if (columnKey === 'timeUpdate') {
                              const dateValue = e.target.value
                              setCustomFilterValue2(dateValue ? String(Math.floor(new Date(dateValue).getTime() / 1000)) : '')
                            } else {
                              setCustomFilterValue2(e.target.value)
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (!customFilterValue1 || !customFilterValue2) return
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
                  <div className="border-b border-slate-200 px-3 py-2 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">CONDITION</label>
                      <select
                        value={customFilterType}
                        onChange={(e) => setCustomFilterType(e.target.value)}
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
                        onChange={(e) => setCustomFilterValue1(e.target.value)}
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

                {/* Search Box + Checkbox list — only for symbol and action columns */}
                {(columnKey === 'symbol' || columnKey === 'action' || columnKey === 'login') && <>
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
                <div className="max-h-40 overflow-y-auto">
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
                </>}

                {/* Footer */}
                <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 rounded-b flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      // Discard pending changes
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
      </th>
    )
  }

  // Only show local loading inside cards/tables; keep the page chrome interactive
  const isInitialPositionsLoading = !hasFetchedPositions
  const isInitialNetLoading = !hasFetchedNetPositions && showNetPositions
  const isInitialClientNetLoading = !hasFetchedClientNetPositions && showClientNet

  // Early return for mobile - render mobile component
  if (isMobile) {
    return (
      <div className="w-full min-h-screen bg-neutral-900/5">
        <PositionModule />
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gradient-to-br from-blue-50 via-white to-blue-50 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
      />

      <main className={`flex-1 p-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden bg-[#F8FAFC]`}>
        <div className="max-w-full mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Header Section */}
          <div className="bg-white rounded-2xl shadow-sm px-6 py-3 mb-6">
            {/* Title + Actions */}
            <div className="mb-1.5 pb-1.5 flex items-center justify-between gap-3">
            {/* Title Section */}
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">Positions</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">Live open positions across all accounts</p>
            </div>

            {/* Action Buttons - All on right side */}
            <div className="flex items-center gap-2">
              {/* Groups Dropdown */}
              <GroupSelector 
                moduleName="positions" 
                onCreateClick={() => {
                  setEditingGroup(null)
                  setShowGroupModal(true)
                }}
                onEditClick={(group) => {
                  setEditingGroup(group)
                  setShowGroupModal(true)
                }}
              />
              
              {/* NET Position Toggle */}
              <button
                onClick={() => { setShowNetPositions((v)=>!v) }}
                className={`h-8 px-2.5 rounded-md border shadow-sm transition-all inline-flex items-center gap-1.5 text-xs font-medium ${
                  showNetPositions 
                    ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' 
                    : 'bg-white text-gray-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300'
                }`}
                title="Toggle NET Position View"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 10h10M10 14h7M13 18h4" />
                </svg>
                NET Position
              </button>

              {/* Date Filter Button */}
              <div className="relative" ref={dateFilterRef}>
                <button
                  onClick={() => setIsDateFilterOpen(v => !v)}
                  className={`h-8 px-2.5 rounded-md border shadow-sm transition-colors inline-flex items-center gap-1.5 text-xs font-medium ${
                    dateFilter 
                      ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700' 
                      : 'bg-white text-[#374151] border-[#E5E7EB] hover:bg-gray-50'
                  }`}
                  title="Filter by Date Range"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {dateFilter ? `${dateFilter} Days` : 'Date Filter'}
                </button>

                {isDateFilterOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
                    {[3, 5, 7].map(days => (
                      <button
                        key={days}
                        onClick={() => {
                          setDateFilter(days)
                          setCurrentPage(1)
                          setIsDateFilterOpen(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-blue-50 flex items-center justify-between ${
                          dateFilter === days ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <span>{days} Days</span>
                        {dateFilter === days && (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                    {dateFilter && (
                      <>
                        <div className="border-t border-gray-100 my-1" />
                        <button
                          onClick={() => {
                            setDateFilter(null)
                            setCurrentPage(1)
                            setIsDateFilterOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Clear filter
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>


              {/* Percentage Toggle Switch */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-[#4B4B4B]">%</span>
                <button
                  onClick={() => setDisplayMode(displayMode === 'percentage' ? 'value' : 'percentage')}
                  className={`relative w-10 h-6 flex items-center rounded-full transition-colors duration-300 focus:outline-none border ${displayMode === 'percentage' ? 'bg-blue-600 border-blue-600' : 'bg-gray-200 border-gray-300'}`}
                  aria-pressed={displayMode === 'percentage'}
                  title="Toggle percentage view"
                  style={{ minWidth: '40px' }}
                >
                  <span className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-300 ${displayMode === 'percentage' ? 'translate-x-4' : ''}`}></span>
                  <span className="sr-only">Toggle percentage view</span>
                </button>
              </div>

              {/* Export CSV */}
              <button
                onClick={handleExportPositions}
                className="h-8 w-8 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                title="Export current positions to CSV"
              >
                <svg className="w-4 h-4 text-[#374151]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16"/>
                </svg>
              </button>
              
              <button
                onClick={async () => {
                  if (isRefreshing) return
                  console.log('[Positions] Requesting fresh positions from API...')
                  setIsRefreshing(true)
                  try {
                    const response = await brokerAPI.searchPositions({
                      page: currentPage,
                      limit: itemsPerPage,
                      sortBy: sortColumn || 'timeCreate',
                      sortOrder: sortDirection || 'desc',
                      ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
                      ...(displayMode === 'percentage' ? { percentage: true } : {})
                    })
                    const data = response?.data?.positions || response?.positions || []
                    const total = response?.data?.total || response?.total || 0
                    if (Array.isArray(data)) {
                      setPolledPositions(data)
                      setServerTotalPositions(total)
                    }
                  } catch (err) {
                    console.error('[Positions] Refresh failed:', err)
                  }
                  setIsRefreshing(false)
                }}
                disabled={isRefreshing}
                className={`h-8 w-8 rounded-md border shadow-sm flex items-center justify-center transition-all ${
                  isRefreshing 
                    ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-50' 
                    : 'bg-white border-[#E5E7EB] hover:bg-gray-50 cursor-pointer'
                }`}
                title={isRefreshing ? "Refreshing..." : "Refresh positions"}
              >
                <svg 
                  className={`w-4 h-4 text-[#374151] ${isRefreshing ? 'animate-spin' : ''}`} 
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

          {/* Stats Summary - Client2 Face Card Design */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Total Positions</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Total Positions')} 
                    alt="Total Positions"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              {isInitialPositionsLoading ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              ) : (
                <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                  <span>{summaryStats.totalPositions}</span>
                  <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">POS</span>
                </div>
              )}
            </div>
            
            {/* Total Floating Profit - shown in 'value' mode */}
            {displayMode === 'value' && (
              <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Floating Profit</span>
                  <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                    <img 
                      src={getCardIcon('Floating Profit')} 
                      alt="Floating Profit"
                      style={{ width: '100%', height: '100%' }}
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  </div>
                </div>
                {isInitialPositionsLoading ? (
                  <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <div className={`text-sm md:text-base font-bold flex items-center gap-1.5 leading-none ${
                    summaryStats.totalFloatingProfit >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }`}>
                    <span>{formatNumber(Math.abs(summaryStats.totalFloatingProfit))}</span>
                    <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">USD</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Total Floating Profit Percentage - shown in 'percentage' mode */}
            {displayMode === 'percentage' && (
              <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Floating Profit %</span>
                  <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                    <img 
                      src={getCardIcon('Floating Profit %')} 
                      alt="Floating Profit %"
                      style={{ width: '100%', height: '100%' }}
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  </div>
                </div>
                {isInitialPositionsLoading ? (
                  <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
                ) : (
                  <div className={`text-sm md:text-base font-bold flex items-center gap-1.5 leading-none ${
                    summaryStats.totalFloatingProfitPercentage >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                  }`}>
                    <span>{formatIndianNumber(Math.abs(summaryStats.totalFloatingProfitPercentage), 2)}</span>
                  </div>
                )}
              </div>
            )}
            
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
              {isInitialPositionsLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : (
                <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                  <span>{summaryStats.uniqueLogins}</span>
                  <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">ACCT</span>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Total Volume</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Symbols')} 
                    alt="Total Volume"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              {isInitialPositionsLoading ? (
                <div className="h-6 w-10 bg-gray-200 rounded animate-pulse" />
              ) : (
                <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                  <span>{formatIndianNumber(summaryStats.totalVolume, 2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* NET Position View */}
          {showNetPositions ? (
            <div className="space-y-4 flex flex-col flex-1 overflow-hidden">
              {/* NET Position Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
                {netCardsVisible.netSymbols && (
                  <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                      <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">NET Symbols</span>
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                        <img 
                          src={getCardIcon('NET Symbols')} 
                          alt="NET Symbols"
                          style={{ width: '100%', height: '100%' }}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    </div>
                    <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                      <span>{serverTotalNetPositions}</span>
                      <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">SYM</span>
                    </div>
                  </div>
                )}
                {netCardsVisible.totalNetVolume && (
                  <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                      <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Total NET Volume</span>
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                        <img 
                          src={getCardIcon('Total NET Volume')} 
                          alt="Total NET Volume"
                          style={{ width: '100%', height: '100%' }}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    </div>
                    <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                      <span>{formatNumber(serverNetTotals.volume || 0,2)}</span>
                      <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">VOL</span>
                    </div>
                  </div>
                )}
                {netCardsVisible.totalNetPL && (
                  <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                      <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Total NET P/L</span>
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                        <img 
                          src={getCardIcon('Total NET P/L')} 
                          alt="Total NET P/L"
                          style={{ width: '100%', height: '100%' }}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    </div>
                    <div className={`text-sm md:text-base font-bold flex items-center gap-1.5 leading-none ${
                      (serverNetTotals.profit || 0) >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                    }`}>
                      {(serverNetTotals.profit || 0) >= 0 && (
                        <svg width="8" height="8" viewBox="0 0 10 10" className="md:w-[10px] md:h-[10px]">
                          <polygon points="5,0 10,10 0,10" fill="#16A34A"/>
                        </svg>
                      )}
                      {(serverNetTotals.profit || 0) < 0 && (
                        <svg width="8" height="8" viewBox="0 0 10 10" style={{transform: 'rotate(180deg)'}} className="md:w-[10px] md:h-[10px]">
                          <polygon points="5,0 10,10 0,10" fill="#DC2626"/>
                        </svg>
                      )}
                      <span>{formatNumber(serverNetTotals.profit || 0,2)}</span>
                      <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">USD</span>
                    </div>
                  </div>
                )}
                {/* Removed grouping toggle card per new layout */}
              </div>

              {/* NET Position Table */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden flex flex-col" style={{ maxHeight: '60vh' }}>
                {/* NET module controls */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-shrink-0 flex items-center px-4 py-3">
                  <div className="flex flex-row items-center justify-between gap-3 w-full">
                    <div className="flex items-center flex-wrap gap-3">
                      {/* NET search on the left */}
                      <div className="relative" ref={netSearchRef}>
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" fill="none" viewBox="0 0 18 18">
                          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <input
                          type="text"
                          value={netSearchQuery}
                          onChange={(e) => setNetSearchQuery(e.target.value)}
                          onKeyDown={handleNetSearchKeyDown}
                          placeholder="Search symbol or NET type"
                          className={`pl-9 ${netSearchQuery ? 'pr-16' : 'pr-9'} py-1.5 text-xs border border-indigo-200 rounded-lg bg-white text-gray-700 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-85 shadow-sm transition-all`}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {netSearchQuery && (
                            <button
                              onClick={() => { setNetSearchQuery(''); setNetActiveSearch(''); setNetCurrentPage(1) }}
                              className="p-0.5 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                              title="Clear search"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          )}
                          <button
                            onClick={handleNetSearchClick}
                            className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                            title="Search"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 18 18">
                              <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                              <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      {/* Card Filter */}
                      <div className="relative" ref={netCardFilterRef}>
                        <button onClick={()=>setNetCardFilterOpen(v=>!v)} className="px-2 py-1.5 text-xs rounded-lg border border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition-all flex items-center gap-1.5 text-gray-700 font-medium shadow-sm" title="Toggle summary cards">
                          <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                          Card Filter
                        </button>
                        {netCardFilterOpen && (
                          <div className="absolute left-0 top-full mt-2 bg-white rounded shadow-lg border border-gray-200 p-2 z-50 w-48">
                            <p className="text-[10px] font-semibold text-gray-600 mb-1">Summary Cards</p>
                            {Object.entries(netCardsVisible).map(([k,v]) => (
                              <label key={k} className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-blue-50 cursor-pointer">
                                <input type="checkbox" checked={v} onChange={()=>setNetCardsVisible(prev=>({...prev,[k]:!prev[k]}))} className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                                <span className="text-[11px] text-gray-700">{k==='netSymbols'?'NET Symbols':k==='totalNetVolume'?'Total NET Volume':k==='totalNetPL'?'Total NET P/L':'Total Logins'}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Export - icon only */}
                      <button onClick={handleExportNetPositions} className="p-2 rounded-lg border border-green-200 bg-white hover:bg-green-50 hover:border-green-300 transition-all text-gray-700 shadow-sm" title="Export NET positions to CSV">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16"/></svg>
                      </button>
                      
                      {/* Group Base Symbols toggle */}
                      <button
                        onClick={() => setGroupByBaseSymbol(v => !v)}
                        className={`px-2 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1.5 font-medium shadow-sm transition-all ${groupByBaseSymbol ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'bg-white text-gray-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300'}`}
                        title="Toggle grouping by base symbol"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 10h10M10 14h7M13 18h4"/></svg>
                        Group Base Symbols
                      </button>
                      
                      {/* Columns selector - icon only */}
                      <div className="relative" ref={netColumnSelectorRef}>
                        <button onClick={()=>setNetShowColumnSelector(v=>!v)} className="p-2 rounded-lg border border-purple-200 bg-white hover:bg-purple-50 hover:border-purple-300 transition-all text-gray-700 shadow-sm" title="Show/Hide NET columns">
                          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                        </button>
                        {netShowColumnSelector && (
                          <div className="absolute left-0 top-full mt-2 bg-white rounded shadow-lg border border-gray-200 p-2 z-50 w-56 max-h-72 overflow-y-auto">
                            <p className="text-[10px] font-semibold text-gray-600 mb-1">NET Columns</p>
                            {Object.keys(netVisibleColumns).map(k => (
                              <label key={k} className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-blue-50 cursor-pointer">
                                <input type="checkbox" checked={netVisibleColumns[k]} onChange={()=>toggleNetColumn(k)} className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                                <span className="text-[11px] text-gray-700">{netColumnLabels[k] || k}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Pagination controls with button styling */}
                      <div className="flex items-center gap-2">
                          <button
                            onClick={()=>handleNetPageChange(netCurrentPage-1)}
                            disabled={netCurrentPage===1}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                              netCurrentPage === 1
                                ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                                : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                            }`}
                            aria-label="Previous page"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <div className="px-3 py-1.5 text-sm font-medium text-[#374151] flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              max={netTotalPages}
                              value={netCurrentPage}
                              onChange={(e) => {
                                const n = Number(e.target.value)
                                if (!isNaN(n) && n >= 1 && n <= netTotalPages) {
                                  handleNetPageChange(n)
                                }
                              }}
                              className="w-12 h-7 border border-[#E5E7EB] rounded-lg text-center text-sm font-semibold text-[#1F2937]"
                              aria-label="Current page"
                            />
                            <span className="text-[#9CA3AF]">/</span>
                            <span className="text-[#6B7280]">{netTotalPages}</span>
                          </div>
                          <button
                            onClick={()=>handleNetPageChange(netCurrentPage+1)}
                            disabled={netCurrentPage===netTotalPages}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                              netCurrentPage === netTotalPages
                                ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                                : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                            }`}
                            aria-label="Next page"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                    </div>
                  </div>
                </div>
                <div className="overflow-auto flex-1" style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#9ca3af #e5e7eb',
                  overflowY: 'scroll',
                  overflowX: 'auto'
                }}>
                  <style>{`
                    .overflow-auto::-webkit-scrollbar {
                      width: 14px;
                      height: 14px;
                    }
                    .overflow-auto::-webkit-scrollbar-track {
                      background: #e5e7eb;
                      border-radius: 0;
                    }
                    .overflow-auto::-webkit-scrollbar-thumb {
                      background: #6b7280;
                      border-radius: 4px;
                      border: 2px solid #e5e7eb;
                    }
                    .overflow-auto::-webkit-scrollbar-thumb:hover {
                      background: #4b5563;
                    }
                    .overflow-auto::-webkit-scrollbar-thumb:active {
                      background: #374151;
                    }
                  `}</style>
                  {netDisplayedPositions.length === 0 && !isInitialNetLoading ? (
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
                      </svg>
                      <p className="text-gray-500 text-sm">No NET positions available</p>
                    </div>
                  ) : (
                    <table className="w-full" style={{ minWidth: '1200px' }}>
                      <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                        <tr>
                          {netVisibleColumns.symbol && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('symbol')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Symbol</span>
                                {netSortColumn === 'symbol' ? (
                                  <svg
                                    className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`}
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
                            </th>
                          )}
                          {netVisibleColumns.netType && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('netType')}
                            >
                              <div className="flex items-center gap-1">
                                <span>NET Type</span>
                                {netSortColumn === 'netType' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.netVolume && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('netVolume')}
                            >
                              <div className="flex items-center gap-1">
                                <span>NET Volume</span>
                                {netSortColumn === 'netVolume' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.avgPrice && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('avgPrice')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Avg Price</span>
                                {netSortColumn === 'avgPrice' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.totalProfit && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('totalProfit')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Total Profit</span>
                                {netSortColumn === 'totalProfit' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.totalStorage && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('totalStorage')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Total Storage</span>
                                {netSortColumn === 'totalStorage' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.totalCommission && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('totalCommission')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Total Commission</span>
                                {netSortColumn === 'totalCommission' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.loginCount && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('loginCount')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Logins</span>
                                {netSortColumn === 'loginCount' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.totalPositions && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('totalPositions')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Positions</span>
                                {netSortColumn === 'totalPositions' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {netVisibleColumns.variantCount && (
                            <th 
                              className="px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleNetSort('variantCount')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Variant Count</span>
                                {netSortColumn === 'variantCount' ? (
                                  <svg className={`w-3 h-3 transition-transform ${netSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                        </tr>
                      </thead>

                      {/* YouTube-style Loading Progress Bar */}
                      {isInitialNetLoading && (
                        <thead className="sticky z-40" style={{ top: '48px' }}>
                          <tr>
                            <th colSpan={Object.values(netVisibleColumns).filter(v => v).length} className="p-0" style={{ height: '3px' }}>
                              <div className="relative w-full h-full bg-gray-200 overflow-hidden">
                                <style>{`
                                  @keyframes shimmerSlide {
                                    0% { transform: translateX(-100%); }
                                    100% { transform: translateX(400%); }
                                  }
                                  .shimmer-loading-bar {
                                    width: 30%;
                                    height: 100%;
                                    background: #2563eb;
                                    animation: shimmerSlide 0.9s linear infinite;
                                  }
                                `}</style>
                                <div className="shimmer-loading-bar absolute top-0 left-0 h-full" />
                              </div>
                            </th>
                          </tr>
                        </thead>
                      )}

                      <tbody className="bg-white text-sm">
                        {netDisplayedPositions.map((netPos, idx) => (
                          <Fragment key={netPos.symbol || idx}>
                          <tr className="hover:bg-blue-50 transition-all duration-300">
                            {netVisibleColumns.symbol && (
                              <td className="px-2 py-1.5 text-sm font-medium text-gray-900 whitespace-nowrap">
                                {netPos.symbol}
                                {groupByBaseSymbol && netPos.variantCount > 1 && (
                                  <span className="ml-2 text-[11px] text-gray-500">(+{netPos.variantCount - 1} variants)</span>
                                )}
                              </td>
                            )}
                            {netVisibleColumns.netType && (
                              <td className="px-2 py-1.5 text-sm whitespace-nowrap">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${netPos.netType === 'Buy' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{netPos.netType}</span>
                              </td>
                            )}
                            {netVisibleColumns.netVolume && (
                              <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{formatNumber(netPos.netVolume, 2)}</td>
                            )}
                            {netVisibleColumns.avgPrice && (
                              <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{formatNumber(netPos.avgPrice, 5)}</td>
                            )}
                            {netVisibleColumns.totalProfit && (
                              <td className="px-2 py-1.5 text-sm whitespace-nowrap">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${netPos.totalProfit >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{formatNumber(netPos.totalProfit, 2)}</span>
                              </td>
                            )}
                            {netVisibleColumns.totalStorage && (
                              <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{formatNumber(netPos.totalStorage ?? 0, 2)}</td>
                            )}
                            {netVisibleColumns.totalCommission && (
                              <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{formatNumber(netPos.totalCommission ?? 0, 2)}</td>
                            )}
                            {netVisibleColumns.loginCount && (
                              <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{netPos.loginCount}</td>
                            )}
                            {netVisibleColumns.totalPositions && (
                              <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">
                                {netPos.totalPositions}
                                {groupByBaseSymbol && netPos.variantCount > 1 && netVisibleColumns.symbol && (
                                  <button
                                    className="ml-3 text-xs text-blue-600 hover:underline"
                                    onClick={() => {
                                      const next = new Set(expandedNetKeys)
                                      if (next.has(netPos.symbol)) next.delete(netPos.symbol); else next.add(netPos.symbol)
                                      setExpandedNetKeys(next)
                                    }}
                                  >
                                    {expandedNetKeys.has(netPos.symbol) ? 'Hide variants' : 'Show variants'}
                                  </button>
                                )}
                              </td>
                            )}
                            {netVisibleColumns.variantCount && (
                              <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{netPos.variantCount || 1}</td>
                            )}
                          </tr>
                          {groupByBaseSymbol && expandedNetKeys.has(netPos.symbol) && netPos.variants && netPos.variants.length > 0 && (
                            <tr className="bg-gray-50">
                              <td colSpan={Object.values(netVisibleColumns).filter(Boolean).length} className="px-3 py-2">
                                <div className="text-[12px] text-gray-700 font-medium mb-1">Variants</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {netPos.variants.map((v, i) => (
                                    <div key={i} className="border border-gray-200 rounded p-2 bg-white">
                                      <div className="flex items-center justify-between">
                                        <div className="font-semibold text-gray-900">{v.exactSymbol}</div>
                                        <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${v.netType === 'Buy' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{v.netType}</span>
                                      </div>
                                      <div className="mt-1 text-[12px] text-gray-600 flex gap-4">
                                        <div>NET Vol: <span className="font-semibold text-gray-900">{formatNumber(v.netVolume, 2)}</span></div>
                                        <div>Avg: <span className="font-semibold text-gray-900">{formatNumber(v.avgPrice, 5)}</span></div>
                                        <div>P/L: <span className={`font-semibold ${v.totalProfit>=0?'text-green-700':'text-red-700'}`}>{formatNumber(v.totalProfit, 2)}</span></div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          ) : showClientNet ? (
            <div className="space-y-4 flex flex-col flex-1 overflow-hidden">
              {/* Client NET Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3 mb-6">
                {clientNetCardsVisible.clientNetRows && (
                  <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                      <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Client NET Rows</span>
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                        <img 
                          src={getCardIcon('Client NET Rows')} 
                          alt="Client NET Rows"
                          style={{ width: '100%', height: '100%' }}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    </div>
                    <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                      <span>{serverTotalClientNetPositions}</span>
                    </div>
                  </div>
                )}
                {clientNetCardsVisible.totalNetVolume && (
                  <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                      <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Total NET Volume</span>
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                        <img 
                          src={getCardIcon('Total NET Volume')} 
                          alt="Total NET Volume"
                          style={{ width: '100%', height: '100%' }}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    </div>
                    <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                      <span>{formatNumber(serverClientNetTotals.volume || 0, 2)}</span>
                    </div>
                  </div>
                )}
                {clientNetCardsVisible.totalNetPL && (
                  <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                      <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Total NET P/L</span>
                      <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                        <img 
                          src={getCardIcon('Total NET P/L')} 
                          alt="Total NET P/L"
                          style={{ width: '100%', height: '100%' }}
                          onError={(e) => { e.target.style.display = 'none' }}
                        />
                      </div>
                    </div>
                    <div className={`text-sm md:text-base font-bold flex items-center gap-1.5 leading-none ${
                      (serverClientNetTotals.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      <span>
                        {(serverClientNetTotals.profit || 0) >= 0 ? '▲ ' : '▼ '}
                        {formatNumber(serverClientNetTotals.profit || 0, 2)}
                      </span>
                    </div>
                  </div>
                )}

              </div>

              {/* Client NET Table */}
              <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden flex flex-col" style={{ maxHeight: '60vh' }}>
                {/* Controls: search and pagination left; actions right */}
                <div className="p-3 border-b border-blue-100 bg-gradient-to-r from-white to-blue-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Left: search */}
                  <div className="flex items-center flex-wrap gap-3">
                    {/* Client NET search at extreme left */}
                    <div className="relative" ref={clientNetSearchRef}>
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" fill="none" viewBox="0 0 18 18">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      <input
                        type="text"
                        value={clientNetSearchQuery}
                        onChange={(e) => setClientNetSearchQuery(e.target.value)}
                        onKeyDown={handleClientNetSearchKeyDown}
                        placeholder="Search login, symbol or NET"
                        className={`pl-9 ${clientNetSearchQuery ? 'pr-16' : 'pr-9'} py-1.5 text-xs border border-indigo-200 rounded-lg bg-white text-gray-700 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-56 shadow-sm transition-all`}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {clientNetSearchQuery && (
                          <button
                            onClick={() => { setClientNetSearchQuery(''); setClientNetActiveSearch(''); setClientNetCurrentPage(1) }}
                            className="p-0.5 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                            title="Clear search"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                        <button
                          onClick={handleClientNetSearchClick}
                          className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                          title="Search"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 18 18">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Card Filter next to search */}
                    <div className="relative" ref={clientNetCardFilterRef}>
                      <button onClick={()=>setClientNetCardFilterOpen(v=>!v)} className="px-2 py-1.5 text-xs rounded-lg border border-blue-200 bg-white hover:bg-blue-50 hover:border-blue-300 transition-all flex items-center gap-1.5 text-gray-700 font-medium shadow-sm" title="Toggle summary cards">
                        <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                        Card Filter
                      </button>
                      {clientNetCardFilterOpen && (
                        <div className="absolute left-0 top-full mt-2 bg-white rounded shadow-lg border border-gray-200 p-2 z-50 w-48">
                          <p className="text-[10px] font-semibold text-gray-600 mb-1">Summary Cards</p>
                          {Object.entries(clientNetCardsVisible).map(([k,v]) => (
                            <label key={k} className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-blue-50 cursor-pointer">
                              <input type="checkbox" checked={v} onChange={()=>setClientNetCardsVisible(prev=>({...prev,[k]:!prev[k]}))} className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                              <span className="text-[11px] text-gray-700">{
                                k==='clientNetRows'?'Client NET Rows':
                                k==='totalNetVolume'?'Total NET Volume':
                                k==='totalNetPL'?'Total NET P/L':'Total Logins'
                              }</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Export CSV button */}
                    <button onClick={handleExportClientNetPositions} className="p-2 rounded-lg border border-green-200 bg-white hover:bg-green-50 hover:border-green-300 transition-all text-gray-700 shadow-sm" title="Export Client NET to CSV">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16"/></svg>
                    </button>
                    
                    {/* Groups button */}
                    <button
                      onClick={() => setGroupByBaseSymbol(v => !v)}
                      className={`px-2 py-1.5 text-xs rounded-lg border inline-flex items-center gap-1.5 ${groupByBaseSymbol ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'} shadow-sm font-medium`}
                      title="Toggle grouping by base symbol"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 10h10M10 14h7M13 18h4"/></svg>
                      Groups base Symbols
                    </button>
                    
                    {/* Columns selector */}
                    <div className="relative" ref={clientNetColumnSelectorRef}>
                      <button onClick={()=>setClientNetShowColumnSelector(v=>!v)} className="p-2 rounded-lg border border-purple-200 bg-white hover:bg-purple-50 hover:border-purple-300 transition-all text-gray-700 shadow-sm" title="Show/Hide Client NET columns">
                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                      </button>
                      {clientNetShowColumnSelector && (
                        <div className="absolute left-0 top-full mt-2 bg-white rounded shadow-lg border border-gray-200 p-2 z-50 w-56 max-h-72 overflow-y-auto">
                          <p className="text-[10px] font-semibold text-gray-600 mb-1">Client NET Columns</p>
                          {Object.keys(clientNetVisibleColumns).map(k => (
                            <label key={k} className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-blue-50 cursor-pointer">
                              <input type="checkbox" checked={clientNetVisibleColumns[k]} onChange={()=>toggleClientNetColumn(k)} className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                              <span className="text-[11px] text-gray-700 capitalize">{
                                k==='netType'?'NET Type':
                                k==='netVolume'?'NET Volume':
                                k==='avgPrice'?'Avg Price':
                                k==='totalProfit'?'Total Profit':
                                k==='totalPositions'?'Positions':
                                k
                              }</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Right: pagination */}
                  <div className="flex items-center gap-2">
                      <button
                        onClick={()=>handleClientNetPageChange(clientNetCurrentPage-1)}
                        disabled={clientNetCurrentPage===1}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          clientNetCurrentPage === 1
                            ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                            : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                        }`}
                        aria-label="Previous page"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      <div className="px-3 py-1.5 text-sm font-medium text-[#374151] flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={clientNetTotalPages}
                          value={clientNetCurrentPage}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            if (!isNaN(n) && n >= 1 && n <= clientNetTotalPages) {
                              handleClientNetPageChange(n)
                            }
                          }}
                          className="w-12 h-7 border border-[#E5E7EB] rounded-lg text-center text-sm font-semibold text-[#1F2937]"
                          aria-label="Current page"
                        />
                        <span className="text-[#9CA3AF]">/</span>
                        <span className="text-[#6B7280]">{clientNetTotalPages}</span>
                      </div>

                      <button
                        onClick={()=>handleClientNetPageChange(clientNetCurrentPage+1)}
                        disabled={clientNetCurrentPage===clientNetTotalPages}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          clientNetCurrentPage === clientNetTotalPages
                            ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                            : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                        }`}
                        aria-label="Next page"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                </div>
                <div className="overflow-auto flex-1" style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#9ca3af #e5e7eb',
                  overflowY: 'scroll',
                  overflowX: 'auto'
                }}>
                  <style>{`
                    .overflow-auto::-webkit-scrollbar {
                      width: 14px;
                      height: 14px;
                    }
                    .overflow-auto::-webkit-scrollbar-track {
                      background: #e5e7eb;
                      border-radius: 0;
                    }
                    .overflow-auto::-webkit-scrollbar-thumb {
                      background: #6b7280;
                      border-radius: 4px;
                      border: 2px solid #e5e7eb;
                      min-height: 200px;
                    }
                    .overflow-auto::-webkit-scrollbar-thumb:hover {
                      background: #4b5563;
                    }
                    .overflow-auto::-webkit-scrollbar-thumb:active {
                      background: #374151;
                    }
                  `}</style>
                  {clientNetDisplayedPositions.length === 0 && !isInitialClientNetLoading ? (
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
                      </svg>
                      <p className="text-gray-500 text-sm">No Client NET data</p>
                    </div>
                  ) : (<>
                    <table className="w-full">
                      <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 30, backgroundColor: '#2563eb' }}>
                        <tr>
                          {clientNetVisibleColumns.login && (
                            <th 
                              className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group sticky left-0"
                              onClick={() => handleClientNetSort('login')}
                              style={{ backgroundColor: '#2563eb', zIndex: 31 }}
                            >
                              <div className="flex items-center gap-1">
                                <span>Login</span>
                                {clientNetSortColumn === 'login' ? (
                                  <svg className={`w-3 h-3 transition-transform ${clientNetSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {clientNetVisibleColumns.symbol && (
                            <th 
                              className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleClientNetSort('symbol')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Symbol</span>
                                {clientNetSortColumn === 'symbol' ? (
                                  <svg className={`w-3 h-3 transition-transform ${clientNetSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {clientNetVisibleColumns.netType && (
                            <th 
                              className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleClientNetSort('netType')}
                            >
                              <div className="flex items-center gap-1">
                                <span>NET Type</span>
                                {clientNetSortColumn === 'netType' ? (
                                  <svg className={`w-3 h-3 transition-transform ${clientNetSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {clientNetVisibleColumns.netVolume && (
                            <th 
                              className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleClientNetSort('netVolume')}
                            >
                              <div className="flex items-center gap-1">
                                <span>NET Volume</span>
                                {clientNetSortColumn === 'netVolume' ? (
                                  <svg className={`w-3 h-3 transition-transform ${clientNetSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {clientNetVisibleColumns.avgPrice && (
                            <th 
                              className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleClientNetSort('avgPrice')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Avg Price</span>
                                {clientNetSortColumn === 'avgPrice' ? (
                                  <svg className={`w-3 h-3 transition-transform ${clientNetSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {clientNetVisibleColumns.totalProfit && (
                            <th 
                              className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleClientNetSort('totalProfit')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Total Profit</span>
                                {clientNetSortColumn === 'totalProfit' ? (
                                  <svg className={`w-3 h-3 transition-transform ${clientNetSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                          {clientNetVisibleColumns.totalPositions && (
                            <th 
                              className="px-3 py-3 text-left text-xs font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                              onClick={() => handleClientNetSort('totalPositions')}
                            >
                              <div className="flex items-center gap-1">
                                <span>Positions</span>
                                {clientNetSortColumn === 'totalPositions' ? (
                                  <svg className={`w-3 h-3 transition-transform ${clientNetSortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-3 h-3 opacity-0 group-hover:opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                  </svg>
                                )}
                              </div>
                            </th>
                          )}
                        </tr>
                      </thead>

                      {/* YouTube-style Loading Progress Bar */}
                      {isInitialClientNetLoading && (
                        <thead className="sticky z-40" style={{ top: '48px' }}>
                          <tr>
                            <th colSpan={Object.values(clientNetVisibleColumns).filter(v => v).length} className="p-0" style={{ height: '3px' }}>
                              <div className="relative w-full h-full bg-gray-200 overflow-hidden">
                                <style>{`
                                  @keyframes shimmerSlideClient {
                                    0% { transform: translateX(-100%); }
                                    100% { transform: translateX(400%); }
                                  }
                                  .shimmer-loading-bar-client {
                                    width: 30%;
                                    height: 100%;
                                    background: #2563eb;
                                    animation: shimmerSlideClient 0.9s linear infinite;
                                  }
                                `}</style>
                                <div className="shimmer-loading-bar-client absolute top-0 left-0 h-full" />
                              </div>
                            </th>
                          </tr>
                        </thead>
                      )}

                      <tbody className="bg-white text-sm">
                        {clientNetDisplayedPositions.map((row, idx) => {
                          const key = `${row.login}|${row.symbol}`
                          return (
                            <Fragment key={key}>
                              <tr className="hover:bg-blue-50 transition-all duration-300">
                                {clientNetVisibleColumns.login && (
                                  <td 
                                    className="px-2 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap cursor-pointer hover:underline sticky left-0 z-10 bg-white"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedLogin(row.login)
                                    }}
                                    title="Click to view client details"
                                  >
                                    {row.login}
                                  </td>
                                )}
                                {clientNetVisibleColumns.symbol && (<td className="px-2 py-1.5 text-sm font-medium text-gray-900 whitespace-nowrap">
                                  {groupByBaseSymbol ? (row.symbol || '').split(/[.\-]/)[0] : row.symbol}
                                </td>)}
                                {clientNetVisibleColumns.netType && (<td className="px-2 py-1.5 text-sm whitespace-nowrap">
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${row.netType === 'Buy' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{row.netType}</span>
                                </td>)}
                                {clientNetVisibleColumns.netVolume && (<td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{formatNumber(row.netVolume, 2)}</td>)}
                                {clientNetVisibleColumns.avgPrice && (<td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">{formatNumber(row.avgPrice, 5)}</td>)}
                                {clientNetVisibleColumns.totalProfit && (<td className="px-2 py-1.5 text-sm whitespace-nowrap">
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${row.totalProfit >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{formatNumber(row.totalProfit, 2)}</span>
                                </td>)}
                                {clientNetVisibleColumns.totalPositions && (<td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums">
                                  {row.totalPositions ?? '-'}
                                </td>)}
                              </tr>
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                    {/* Add bottom padding to keep scrollbar visible */}
                    <div style={{ height: '20px' }}></div>
                  </>)}
                </div>
              </div>
            </div>
          ) : <>
          
          {/* Positions Table */}
          <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden flex flex-col flex-1 min-h-0 mb-4">
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
                  <div className="relative" ref={columnSelectorRef}>
                    <button
                      onClick={() => setShowColumnSelector(!showColumnSelector)}
                      className="h-10 w-10 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                      title="Show/Hide Columns"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                        <rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                      </svg>
                    </button>
                    {showColumnSelector && (
                      <div
                        className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-2 z-50 w-56"
                        style={{ maxHeight: '400px', overflowY: 'auto' }}
                      >
                        <div className="px-3 py-2 border-b border-[#F3F4F6]">
                          <p className="text-xs font-semibold text-[#1F2937] uppercase">Show/Hide Columns</p>
                        </div>
                        {allColumns.map(col => (
                          <label
                            key={col.key}
                            className="flex items-center px-3 py-1.5 hover:bg-blue-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={visibleColumns[col.key]}
                              onChange={() => toggleColumn(col.key)}
                              className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-1"
                            />
                            <span className="ml-2 text-sm text-[#374151]">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Pagination */}
                <div className="flex items-center gap-2">
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

            <div className="overflow-y-scroll overflow-x-auto flex-1 pb-10" style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
              scrollbarColor: '#CBD5E0 #F7FAFC',
              maxHeight: '55vh'
            }}>
              <table className="w-full border border-gray-200">
                  <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                    <tr className="divide-x divide-gray-200">
                      {(() => {
                        const effectiveCols = getEffectiveVisibleColumns()
                        return (
                          <>
                          {effectiveCols.time && renderHeaderCell('timeUpdate', 'Time', 'timeUpdate')}
                          {effectiveCols.login && renderHeaderCell('login', 'Login')}
                          {effectiveCols.position && renderHeaderCell('position', 'Position')}
                          {effectiveCols.symbol && renderHeaderCell('symbol', 'Symbol')}
                          {effectiveCols.action && renderHeaderCell('action', 'Action')}
                          {effectiveCols.volume && renderHeaderCell('volume', displayMode === 'percentage' ? 'Volume %' : 'Volume')}
                          {effectiveCols.volumePercentage && renderHeaderCell('volume', 'Volume %')}
                          {effectiveCols.priceOpen && renderHeaderCell('priceOpen', 'Open')}
                          {effectiveCols.priceCurrent && renderHeaderCell('priceCurrent', 'Current')}
                          {effectiveCols.sl && renderHeaderCell('priceSL', 'S/L')}
                          {effectiveCols.tp && renderHeaderCell('priceTP', 'T/P')}
                          {effectiveCols.profit && renderHeaderCell('profit', displayMode === 'percentage' ? 'Profit %' : 'Profit')}
                          {effectiveCols.profitPercentage && renderHeaderCell('percentage', 'Profit %')}
                          {effectiveCols.storage && renderHeaderCell('storage', displayMode === 'percentage' ? 'Storage %' : 'Storage')}
                          {effectiveCols.storagePercentage && renderHeaderCell('storage', 'Storage %')}
                          {effectiveCols.appliedPercentage && renderHeaderCell('applied_percentage', 'Applied %')}
                          {effectiveCols.reason && renderHeaderCell('reason', 'Reason')}
                          {effectiveCols.comment && renderHeaderCell('comment', 'Comment')}
                          {effectiveCols.commission && renderHeaderCell('commission', 'Commission')}
                          </>
                        )
                      })()}
                    </tr>
                  </thead>

                  {/* YouTube-style Loading Progress Bar */}
                  {isInitialPositionsLoading && (
                    <thead className="sticky z-40" style={{ top: '48px' }}>
                      <tr>
                        <th colSpan={Object.values(getEffectiveVisibleColumns()).filter(v => v).length} className="p-0" style={{ height: '3px' }}>
                          <div className="relative w-full h-full bg-gray-200 overflow-hidden">
                            <style>{`
                              @keyframes shimmerSlidePos {
                                0% { transform: translateX(-100%); }
                                100% { transform: translateX(400%); }
                              }
                              .shimmer-loading-bar-pos {
                                width: 30%;
                                height: 100%;
                                background: #2563eb;
                                animation: shimmerSlidePos 0.9s linear infinite;
                              }
                            `}</style>
                            <div className="shimmer-loading-bar-pos absolute top-0 left-0 h-full" />
                          </div>
                        </th>
                      </tr>
                    </thead>
                  )}

                  <tbody className="bg-white">
                    {isPageLoading ? (
                      Array.from({ length: 8 }, (_, i) => (
                        <tr key={`skeleton-${i}`} className="bg-white border-b border-[#E1E1E1]">
                          {Object.values(getEffectiveVisibleColumns()).map((visible, colIdx) => (
                            visible ? (
                              <td key={colIdx} className="px-2" style={{ height: '38px' }}>
                                <div className="h-3 w-full max-w-[80%] bg-gray-200 rounded animate-pulse" />
                              </td>
                            ) : null
                          ))}
                        </tr>
                      ))
                    ) : displayedPositions.length === 0 && !isInitialPositionsLoading ? (
                      <tr>
                        <td colSpan={Object.values(getEffectiveVisibleColumns()).filter(v => v).length} className="px-4 py-12 text-center text-gray-500">
                          No open positions
                        </td>
                      </tr>
                    ) : displayedPositions.map((p) => {
                      const effectiveCols = getEffectiveVisibleColumns()
                      const rowClass = 'hover:bg-blue-50'
                      return (
                        <tr key={p.position} className={`${rowClass} transition-all duration-300 divide-x divide-gray-200`}>
                          {effectiveCols.time && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap border-r border-gray-200 last:border-r-0">{formatTime(p.timeUpdate || p.timeCreate)}</td>
                          )}
                          {effectiveCols.login && (
                            <td 
                              className="px-2 py-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap cursor-pointer hover:underline border-r border-gray-200 last:border-r-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedLogin(p.login)
                              }}
                              title="Click to view login details"
                            >
                              {p.login}
                            </td>
                          )}
                          {effectiveCols.position && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap border-r border-gray-200 last:border-r-0">{p.position}</td>
                          )}
                          {effectiveCols.symbol && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap border-r border-gray-200 last:border-r-0">{p.symbol}</td>
                          )}
                          {effectiveCols.action && (
                            <td className="px-2 py-1.5 text-sm whitespace-nowrap border-r border-gray-200 last:border-r-0">
                              <span className={`px-1.5 py-0.5 rounded text-[12px] font-semibold ${getActionChipClasses(p.action)}`}>
                                {getActionLabel(p.action)}
                              </span>
                            </td>
                          )}
                          {effectiveCols.volume && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">{formatNumber(adjustValueForSymbol(p.volume, p.symbol), 2)}</td>
                          )}
                          {effectiveCols.volumePercentage && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">
                              {(p.volume != null && p.volume !== '') ? formatNumber(p.volume, 2) : '-'}
                            </td>
                          )}
                          {effectiveCols.priceOpen && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">{formatNumber(p.priceOpen, 5)}</td>
                          )}
                          {effectiveCols.priceCurrent && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">
                              {formatNumber(p.priceCurrent, 5)}
                            </td>
                          )}
                          {effectiveCols.sl && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">{formatNumber(p.priceSL, 5)}</td>
                          )}
                          {effectiveCols.tp && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">{formatNumber(p.priceTP, 5)}</td>
                          )}
                          {effectiveCols.profit && (
                            <td className="px-2 py-1.5 text-sm whitespace-nowrap border-r border-gray-200 last:border-r-0">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded transition-all duration-300 ${
                                (p.profit || 0) >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {formatNumber(adjustValueForSymbol(p.profit, p.symbol, true), 2)}
                              </span>
                            </td>
                          )}
                          {effectiveCols.profitPercentage && (
                            <td className="px-2 py-1.5 text-sm whitespace-nowrap border-r border-gray-200 last:border-r-0">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                (p.profit || 0) >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {(p.profit != null && p.profit !== '') ? formatNumber(adjustValueForSymbol(p.profit, p.symbol, true), 2) : '-'}
                              </span>
                            </td>
                          )}
                          {effectiveCols.storage && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">{formatNumber(adjustValueForSymbol(p.storage, p.symbol, true), 2)}</td>
                          )}
                          {effectiveCols.storagePercentage && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">
                              {(p.storage != null && p.storage !== '') ? formatNumber(p.storage, 2) : '-'}
                            </td>
                          )}
                          {effectiveCols.appliedPercentage && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">
                              {(p.applied_percentage != null && p.applied_percentage !== '') ? `${formatNumber(p.applied_percentage, 2)}%` : '-'}
                            </td>
                          )}
                          {effectiveCols.reason && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap border-r border-gray-200 last:border-r-0">
                              <span className={`px-2 py-0.5 text-xs rounded ${
                                p.reason === 'DEALER' ? 'bg-blue-100 text-blue-800' :
                                p.reason === 'EXPERT' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {p.reason || '-'}
                              </span>
                            </td>
                          )}
                          {effectiveCols.comment && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 max-w-xs truncate border-r border-gray-200 last:border-r-0" title={p.comment}>
                              {p.comment || '-'}
                            </td>
                          )}
                          {effectiveCols.commission && (
                            <td className="px-2 py-1.5 text-sm text-gray-900 whitespace-nowrap tabular-nums border-r border-gray-200 last:border-r-0">{formatNumber(adjustValueForSymbol(p.commission, p.symbol, true), 2)}</td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            </div>
          </div>
          </>
          }
        </div>
      </main>
      
      {/* Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false)
          setEditingGroup(null)
        }}
        availableItems={polledPositions}
        loginField="login"
        displayField="symbol"
        secondaryField="position"
        editGroup={editingGroup}
      />

      {/* Client Positions Modal */}
      {selectedLogin && (
        <ClientPositionsModal
          client={{ login: selectedLogin }}
          onClose={() => setSelectedLogin(null)}
          onClientUpdate={() => {}}
          allPositionsCache={polledPositions}
          allOrdersCache={cachedOrders}
          onCacheUpdate={() => {}}
        />
      )}

      {/* Date Filter Dropdown is rendered inline near the button */}
    </div>
  )
}

export default PositionsPage
