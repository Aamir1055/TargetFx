import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
// ...existing code...
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useGroups } from '../contexts/GroupContext'
import { useIB } from '../contexts/IBContext'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import ClientPositionsModal from '../components/ClientPositionsModal'
import WebSocketIndicator from '../components/WebSocketIndicator'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import MobileClientsView from '../components/MobileClientsViewNew'
import ColumnChooserList from '../components/ColumnChooserList'
// import ClientDashboardDesignC from '../components/dashboard/ClientDashboardDesignC'
import workerManager from '../workers/workerManager'
import { brokerAPI } from '../services/api'

const ClientsPage = () => {
    // Card filter search query for filter modal
    const [cardFilterSearchQuery, setCardFilterSearchQuery] = useState('');
  const navigate = useNavigate()
  const { clients: cachedClients, rawClients, positions: cachedPositions, orders: cachedOrders, clientStats, latestServerTimestamp, lastWsReceiveAt, latestMeasuredLagMs, fetchClients, fetchPositions, loading, connectionState, statsDrift } = useData()
  
  // Always use rawClients (unnormalized) for Clients module - USC values are handled by backend
  // rawClients contains data without frontend USC normalization
  const clients = rawClients.length > 0 ? rawClients : []
  const { filterByActiveGroup, activeGroupFilters, setActiveGroupFilter } = useGroups()
  const { filterByActiveIB, selectedIB, ibMT5Accounts, refreshIBList, clearIBSelection } = useIB()
  
  // Mobile detection with redirect
  const [isMobile] = useState(false)
  
  // Redirect to mobile view on mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      const isMobileView = window.innerWidth <= 768
      if (isMobileView) {
        navigate('/client-dashboard-c')
      }
    }
    
    // Check on mount
    checkMobile()
    
    // Check on resize
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [navigate])
  
  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true)
  
  // Ensure IB list is prefetched when entering Clients module (navigation)
  useEffect(() => {
    try {
      refreshIBList?.()
    } catch (e) {
      console.warn('[ClientsPage] Failed to prefetch IB list:', e)
    }
    
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false
    }
  }, [])
  const getInitialSidebarOpen = () => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      if (v === null) return true
      return JSON.parse(v)
    } catch { return true }
  }
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const [error, setError] = useState('')
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [columnSearchQuery, setColumnSearchQuery] = useState('')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showDisplayMenu, setShowDisplayMenu] = useState(false)
  // faceCardTotals will be computed later in the file (after state and derived values are defined)
  const [customTextFilterColumn, setCustomTextFilterColumn] = useState(null)
  const [customTextFilterType, setCustomTextFilterType] = useState('contains')
  const [customTextFilterValue, setCustomTextFilterValue] = useState('')
  const [customTextFilterCaseSensitive, setCustomTextFilterCaseSensitive] = useState(false)
  
  // IB Commission totals state (fetched from API every hour)
  const [commissionTotals, setCommissionTotals] = useState(null)
  
  // Web Worker states for stats calculation
  const [workerStats, setWorkerStats] = useState(null)
  const [isCalculatingInWorker, setIsCalculatingInWorker] = useState(false)
  const workerCalculationTimeoutRef = useRef(null)
  const lastWorkerInputRef = useRef(null) // Track last input to prevent duplicate calculations
  
  const tableRef = useRef(null)

  // Column resizing states
  const [columnWidths, setColumnWidths] = useState({})
  const [resizingColumn, setResizingColumn] = useState(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const resizeRightStartWidth = useRef(0)
  const resizeRAF = useRef(null)
  const headerRefs = useRef({})
  const measureCanvasRef = useRef(null)
  const resizeRightNeighborKey = useRef(null)

  // Page zoom states
  const [zoomLevel, setZoomLevel] = useState(100)
  const [faceCardTheme, setFaceCardTheme] = useState('default')

  // Verification handler removed

  // Default visible columns - load from localStorage or use defaults
  const getInitialVisibleColumns = () => {
    const saved = localStorage.getItem('clientsPageVisibleColumns')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse saved columns:', e)
      }
    }
    return {
      login: true,
      name: true,
      group: true,
      country: true,
      clientID: true,
      balance: true,
      equity: true,
      profit: true,
      dailyDeposit: true,
      
      // Hidden by default
      pnl: false,
      lastName: false,
      middleName: false,
      email: false,
      phone: false,
    credit: false,
    margin: false,
    marginFree: false,
    marginLevel: false,
    leverage: false,
    currency: false,
    registration: false,
    lastAccess: false,
    rights: false,
    applied_percentage: false,
    applied_percentage_is_custom: false,
    assets: false,
    blockedCommission: false,
    blockedProfit: false,
    city: false,
    address: false,
    zipCode: false,
    state: false,
    company: false,
    comment: false,
    color: false,
    agent: false,
    leadCampaign: false,
    leadSource: false,
    liabilities: false,
    marginInitial: false,
    marginMaintenance: false,
    marginLeverage: false,
    soActivation: false,
    soEquity: false,
    soLevel: false,
    soMargin: false,
    soTime: false,
    status: false,
    storage: false,
    mqid: false,
    language: false,
    currencyDigits: false,
    rightsMask: false,
    accountLastUpdate: false,
    userLastUpdate: false,
    lastUpdate: false,
    dailyWithdrawal: false,
    lifetimePnL: false,
    dailyPnL: false,
    thisMonthPnL: false,
    thisWeekPnL: false
    }
  }

  const [visibleColumns, setVisibleColumns] = useState(getInitialVisibleColumns)
  
  // Column order state - load from localStorage or use default order
  const getInitialColumnOrder = () => {
    const saved = localStorage.getItem('clientsPageColumnOrder')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse saved column order:', e)
      }
    }
    return null // Will use default order from allColumns
  }
  
  const [columnOrder, setColumnOrder] = useState(getInitialColumnOrder)
  const [draggingColumn, setDraggingColumn] = useState(null)

  // ----- Missing UI state and refs (initialized here to avoid TDZ/ReferenceErrors) -----
  // Time and latency
  const [systemTime, setSystemTime] = useState(Date.now())
  const [appTime, setAppTime] = useState(null)
  const [latencyStats, setLatencyStats] = useState({ last: null, median: null, max: null })
  const latencySamplesRef = useRef([])

  // Filtering, searching, sorting and pagination
  const [filterByPositions, setFilterByPositions] = useState(false)
  const [filterByCredit, setFilterByCredit] = useState(false)
  const [filterNoDeposit, setFilterNoDeposit] = useState(false)
  
  // Initialize columnFilters from localStorage
  const getInitialColumnFilters = () => {
    try {
      const saved = localStorage.getItem('clientsColumnFilters')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Failed to load column filters:', e)
    }
    return {}
  }
  
  const [columnFilters, setColumnFilters] = useState(getInitialColumnFilters)
  const [filterSearchQuery, setFilterSearchQuery] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const getInitialDisplayMode = () => {
    try {
      const saved = localStorage.getItem('clientsPageDisplayMode')
      if (saved && ['value', 'percentage', 'both'].includes(saved)) {
        return saved
      }
    } catch (e) {
      console.error('Failed to load display mode:', e)
    }
    return 'value' // Default
  }

  const [searchInput, setSearchInput] = useState('')
  const [itemsPerPage, setItemsPerPage] = useState(100)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [displayMode, setDisplayMode] = useState(getInitialDisplayMode)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSorting, setIsSorting] = useState(false)

  // Dropdowns, modals, and refs
  const [showFilterDropdown, setShowFilterDropdown] = useState(null)
  const [filterPosition, setFilterPosition] = useState(null)
  const [showNumberFilterDropdown, setShowNumberFilterDropdown] = useState(null)
  const [showTextFilterDropdown, setShowTextFilterDropdown] = useState(null)
  const [showCustomFilterModal, setShowCustomFilterModal] = useState(false)
  const [showCustomTextFilterModal, setShowCustomTextFilterModal] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showThemeMenu, setShowThemeMenu] = useState(false)
  const [showCardFilterMenu, setShowCardFilterMenu] = useState(false)
  const [showFaceCards, setShowFaceCards] = useState(true)
  const [selectedClient, setSelectedClient] = useState(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const filterRefs = useRef({})
  const filterPanelRef = useRef(null)
  const columnSelectorRef = useRef(null)
  const filterMenuRef = useRef(null)
  const displayMenuRef = useRef(null)
  const searchRef = useRef(null)
  const cardFilterMenuRef = useRef(null)
  const themeMenuRef = useRef(null)
  const exportMenuRef = useRef(null)

  // Custom filter (number/text)
  const [customFilterColumn, setCustomFilterColumn] = useState(null)
  const [customFilterType, setCustomFilterType] = useState('equal')
  const [customFilterValue1, setCustomFilterValue1] = useState('')
  const [customFilterValue2, setCustomFilterValue2] = useState('')
  const [customFilterOperator, setCustomFilterOperator] = useState('AND')
  const [showCustomNumberFilter, setShowCustomNumberFilter] = useState(false)
  const [showCustomTextFilter, setShowCustomTextFilter] = useState(false)

  // Face cards: visibility, order, theme
  const defaultFaceCardOrder = [
    // Core financial metrics
    1,   // Total Clients
    2,   // Total Balance
    3,   // Total Credit
    4,   // Total Equity
    5,   // PNL
    6,   // Floating Profit
    
    // Daily metrics
    8,   // Daily Deposit
    9,   // Daily Withdrawal
    10,  // Daily PNL
    
    // Period PNL
    11,  // This Week PNL
    12,  // This Month PNL
    13,  // Lifetime PNL
    
    // Additional metrics
    14,  // Daily Net D/W
    15,  // Total Rebate
    16,  // Available Rebate
    66,  // Net Lifetime PNL
  ]
  const getInitialFaceCardOrder = () => {
    try {
      const saved = localStorage.getItem('clientsFaceCardOrder')
      if (saved) return JSON.parse(saved)
    } catch {}
    return defaultFaceCardOrder
  }
  const [faceCardOrder, setFaceCardOrder] = useState(getInitialFaceCardOrder)
  const [draggedFaceCard, setDraggedFaceCard] = useState(null)

  const getInitialCardVisibility = (() => {
    try {
      const saved = localStorage.getItem('clientsCardVisibility')
      if (saved) return JSON.parse(saved)
    } catch {}
    // Only show cards in defaultFaceCardOrder, hide all others
    const map = {}
    // Set all cards to false first
    for (let i = 1; i <= 67; i++) {
      map[i] = false
    }
    // Then enable only the default cards
    defaultFaceCardOrder.forEach(id => { map[id] = true })
    return map
  })()

  // Default card visibility map for resetting
  const defaultCardVisibility = (() => {
    const map = {}
    defaultFaceCardOrder.forEach(id => { map[id] = true })
    return map
  })()

  const [cardVisibility, setCardVisibility] = useState(getInitialCardVisibility)

  const allColumns = [
    { key: 'login', label: 'Login', sticky: true },
    { key: 'name', label: 'Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'middleName', label: 'Middle Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'group', label: 'Group' },
    { key: 'country', label: 'Country' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'address', label: 'Address' },
    { key: 'zipCode', label: 'Zip Code' },
    { key: 'clientID', label: 'Client ID' },
    { key: 'balance', label: 'Balance' },
    { key: 'credit', label: 'Credit' },
    { key: 'equity', label: 'Equity' },
    { key: 'margin', label: 'Margin' },
    { key: 'marginFree', label: 'Margin Free' },
    { key: 'marginLevel', label: 'Margin Level' },
    { key: 'marginInitial', label: 'Margin Initial' },
    { key: 'marginMaintenance', label: 'Margin Maintenance' },
    { key: 'marginLeverage', label: 'Margin Leverage' },
    { key: 'leverage', label: 'Leverage' },
    { key: 'profit', label: 'Floating Profit' },
    { key: 'pnl', label: 'PNL' },
    { key: 'currency', label: 'Currency' },
    { key: 'currencyDigits', label: 'Currency Digits' },
    { key: 'applied_percentage', label: 'Applied %' },
    { key: 'applied_percentage_is_custom', label: 'Custom %' },
    { key: 'assets', label: 'Assets' },
    { key: 'liabilities', label: 'Liabilities' },
    { key: 'blockedCommission', label: 'Blocked Rebate' },
    { key: 'blockedProfit', label: 'Blocked Profit' },
    { key: 'storage', label: 'Storage' },
    { key: 'company', label: 'Company' },
    { key: 'comment', label: 'Comment' },
    { key: 'color', label: 'Color' },
    { key: 'agent', label: 'Agent' },
    { key: 'leadCampaign', label: 'Lead Campaign' },
    { key: 'leadSource', label: 'Lead Source' },
    { key: 'soActivation', label: 'SO Activation' },
    { key: 'soEquity', label: 'SO Equity' },
    { key: 'soLevel', label: 'SO Level' },
    { key: 'soMargin', label: 'SO Margin' },
    { key: 'soTime', label: 'SO Time' },
    { key: 'status', label: 'Status' },
    { key: 'mqid', label: 'MQID' },
    { key: 'language', label: 'Language' },
    { key: 'registration', label: 'Registration' },
    { key: 'lastAccess', label: 'Last Access' },
    { key: 'lastUpdate', label: 'Last Update' },
    { key: 'accountLastUpdate', label: 'Account Last Update' },
    { key: 'userLastUpdate', label: 'User Last Update' },
    { key: 'rights', label: 'Rights' },
    { key: 'rightsMask', label: 'Rights Mask' },
    { key: 'dailyDeposit', label: 'Daily Deposit' },
    { key: 'dailyWithdrawal', label: 'Daily Withdrawal' },
    
    { key: 'lifetimePnL', label: 'Lifetime PnL' },
    // dailyPnL removed - using percentage display column only
    { key: 'thisMonthPnL', label: 'This Month PnL' },
    { key: 'thisWeekPnL', label: 'This Week PnL' }
  ]

  // Map base metric keys to their percentage field names from API
  const percentageFieldMap = {
    balance: 'balance_percentage',
    credit: 'credit_percentage',
    equity: 'equity_percentage',
    marginFree: 'marginFree_percentage',
    margin: 'margin_percentage',
    profit: 'profit_percentage',
    storage: 'storage_percentage',
    pnl: 'pnl_percentage',
    lifetimePnL: 'lifetimePnL_percentage'
    // Removed dailyDeposit and dailyWithdrawal - they have separate percentage cards
  }

  const isMetricColumn = (key) => Object.prototype.hasOwnProperty.call(percentageFieldMap, key)
  
  // Metrics that should NOT show virtual percentage display columns (raw % column already visible)
  const metricsWithoutVirtualPercentage = new Set([])

  // Define string/text columns (no number filters)
  const stringColumns = [
    'name', 'lastName', 'middleName', 'email', 'phone', 'group', 
    'country', 'city', 'state', 'address', 'zipCode', 'currency',
    'company', 'comment', 'color', 'leadCampaign', 'leadSource',
    'status', 'mqid', 'language', 'rights', 'rightsMask'
  ]

  // Dynamically detect all columns from API data
  const dynamicColumns = useMemo(() => {
    if (!clients || clients.length === 0) return allColumns

    // Exclude raw percentage fields that are already surfaced via display modes
    const excludedAutoColumns = new Set([
      ...Object.values(percentageFieldMap),
      // Also exclude DW percent helpers from appearing as standalone columns
      'dailyDeposit_percentage',
      'dailyWithdrawal_percentage',
      'dailyPnLPercentage' // Backend sends both dailyPnL_percentage and dailyPnLPercentage
    ])

    // Get all unique keys from the actual data
    const allKeys = new Set()
    clients.forEach(client => {
      if (client && typeof client === 'object') {
        Object.keys(client).forEach(key => allKeys.add(key))
      }
    })

    // Create a map of existing columns for quick lookup
    const existingColumnsMap = new Map(
      allColumns.map(col => [col.key, col])
    )

    // Combine predefined columns with dynamically detected ones
    const detectedColumns = Array.from(allKeys)
      .filter(key => !excludedAutoColumns.has(key))
      .map(key => {
        if (existingColumnsMap.has(key)) {
          return existingColumnsMap.get(key)
        }
        // Create a new column entry for keys not in allColumns
        return {
          key: key,
          label: key
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim()
        }
      })

    // Sort columns: predefined ones first (in order), then alphabetically
    return detectedColumns.sort((a, b) => {
      const aIndex = allColumns.findIndex(col => col.key === a.key)
      const bIndex = allColumns.findIndex(col => col.key === b.key)
      
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return a.label.localeCompare(b.label)
    })
  }, [clients])

  const isStringColumn = (key) => stringColumns.includes(key)

  // Memoize visible columns list for performance
  const visibleColumnsList = useMemo(() => {
    const visibleCols = dynamicColumns.filter(c => visibleColumns[c.key] === true)
    
    // Apply custom column order if it exists
    if (columnOrder && Array.isArray(columnOrder)) {
      const orderedCols = []
      const colMap = new Map(visibleCols.map(col => [col.key, col]))
      
      // First, add columns in the saved order
      columnOrder.forEach(key => {
        if (colMap.has(key)) {
          orderedCols.push(colMap.get(key))
          colMap.delete(key)
        }
      })
      
      // Then add any remaining columns that weren't in the saved order
      colMap.forEach(col => orderedCols.push(col))
      
      return orderedCols
    }
    
    return visibleCols
  }, [dynamicColumns, visibleColumns, columnOrder])

  // Compute total table width (including virtual percentage columns in 'both' mode)
  const totalTableWidth = useMemo(() => {
    if (!visibleColumnsList || visibleColumnsList.length === 0) return 0
    const baseWidth = visibleColumnsList.reduce((sum, col) => {
      const w = columnWidths[col.key]
      return sum + (typeof w === 'number' && w > 0 ? w : 150)
    }, 0)
    if (displayMode === 'both') {
      const extra = visibleColumnsList.filter(c => isMetricColumn(c.key) && !metricsWithoutVirtualPercentage.has(c.key)).reduce((sum, col) => {
        const vw = columnWidths[col.key + '_percentage_display']
        return sum + (typeof vw === 'number' && vw > 0 ? vw : 120)
      }, 0)
      return baseWidth + extra
    }
    return baseWidth
  }, [visibleColumnsList, columnWidths, displayMode])

  // Pinned (frozen) columns - persisted to localStorage
  const [pinnedColumns, setPinnedColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('clientsPagePinnedColumns'))
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('clientsPagePinnedColumns', JSON.stringify(pinnedColumns)) } catch {}
  }, [pinnedColumns])
  const togglePinColumn = (key) =>
    setPinnedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  // Cumulative left offsets for pinned columns in display order (using current widths)
  const pinnedOffsets = useMemo(() => {
    const map = {}
    let offset = 0
    for (const col of (visibleColumnsList || [])) {
      if (pinnedColumns.includes(col.key)) {
        map[col.key] = offset
        const w = columnWidths[col.key]
        offset += (typeof w === 'number' && w > 0 ? w : 150)
      }
    }
    return map
  }, [visibleColumnsList, pinnedColumns, columnWidths])

  // Clear all filters on component mount (when navigating to this page)
  useEffect(() => {
    setFilterByPositions(false)
    setFilterByCredit(false)
    setFilterNoDeposit(false)
    clearIBSelection()
    setActiveGroupFilter('clients', null)
    setSearchQuery('')
  }, [])

  // Save visible columns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('clientsPageVisibleColumns', JSON.stringify(visibleColumns))
  }, [visibleColumns])
  
  // Save column order to localStorage whenever it changes
  useEffect(() => {
    if (columnOrder) {
      localStorage.setItem('clientsPageColumnOrder', JSON.stringify(columnOrder))
    }
  }, [columnOrder])

  // Save card visibility to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('clientsCardVisibility', JSON.stringify(cardVisibility))
  }, [cardVisibility])

  // Save display mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('clientsPageDisplayMode', displayMode)
  }, [displayMode])

  // Save column filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('clientsColumnFilters', JSON.stringify(columnFilters))
    } catch (e) {
      console.error('Failed to save column filters:', e)
    }
  }, [columnFilters])

  // Remove page-level initial fetch to avoid duplicate REST calls; DataContext handles initial sync

  // Update system time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Note: WebSocket is handled by DataContext, we get updates via clients array changes

  // Track latest server timestamp; clamp to prevent backward drift & convert seconds to ms if needed
  useEffect(() => {
    const toMs = (ts) => {
      if (!ts) return 0
      const n = Number(ts)
      if (!isFinite(n) || n <= 0) return 0
      return n < 10000000000 ? n * 1000 : n
    }
    const incoming = toMs(latestServerTimestamp)
    if (incoming > 0) {
      setAppTime(prev => {
        // Prevent regression to older timestamps (which inflates perceived lag)
        if (prev && incoming < prev) return prev
        return incoming
      })
    }
  }, [latestServerTimestamp])
  
  // Separate effect for client timestamp fallback to avoid infinite loop
  useEffect(() => {
    // Only run fallback if we don't have a server timestamp
    if (latestServerTimestamp) return
    
    if (clients && clients.length > 0) {
      const toMs = (ts) => {
        if (!ts) return 0
        const n = Number(ts)
        if (!isFinite(n) || n <= 0) return 0
        return n < 10000000000 ? n * 1000 : n
      }
      
      let maxTs = 0
      for (let i = 0; i < Math.min(clients.length, 50); i++) {
        const rawTs = clients[i]?.serverTimestamp || clients[i]?.lastUpdate || 0
        const tsMs = toMs(rawTs)
        if (tsMs > maxTs) maxTs = tsMs
      }
      if (maxTs > 0) {
        setAppTime(prev => (prev && maxTs < prev) ? prev : maxTs)
      }
    }
  }, [clients.length, latestServerTimestamp]) // Only depend on length, not full clients array

  // Performance monitor - log lag warnings (throttled) - DISABLED
  // The lag warning was misleading because appTime (latestServerTimestamp) doesn't update
  // every second, only when stats recalculate. WebSocket is actually working fine.
  // Keeping the code structure but disabling the warning.
  // Simplified safety: auto refresh only if no server timestamp progress for >120s
  const lastProgressRef = useRef(Date.now())
  useEffect(() => {
    if (appTime) {
      lastProgressRef.current = Date.now()
    }
  }, [appTime])
  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastProgressRef.current > 120000) {
        // Hard recovery (rare)
        window.location.reload()
      }
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Fetch IB Commission Totals on mount and every hour
  useEffect(() => {
    const fetchCommissionTotals = async () => {
      try {
        console.log('Fetching IB Commission Totals...')
        const response = await brokerAPI.getIBCommissionTotals()
        let data = response?.data?.data || response?.data || null
        // Backend handles USC normalization; use values as-is
        console.log('Commission Totals (normalized if USC):', data)
        setCommissionTotals(data)
      } catch (err) {
        console.error('Failed to fetch commission totals:', err)
      }
    }

    // Initial fetch
    fetchCommissionTotals()

    // Refresh every hour (3600000 ms)
    const interval = setInterval(fetchCommissionTotals, 3600000)

    return () => clearInterval(interval)
  }, [])

  // Handle manual refresh - force fetch without full page reload
  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      // Fetch commission totals along with clients and positions
      const fetchCommissions = async () => {
        try {
          const response = await brokerAPI.getIBCommissionTotals()
          let data = response?.data?.data || response?.data || null
          // Backend handles USC normalization; use values as-is
          setCommissionTotals(data)
        } catch (err) {
          console.error('Failed to fetch commission totals:', err)
        }
      }

      await Promise.all([
        fetchClients(true), // Force refresh bypassing cache
        fetchPositions(true), // Also refresh positions for face cards
        fetchCommissions() // Refresh commission totals
      ])
    } catch (err) {
      console.error('Failed to refresh data:', err)
    } finally {
      setIsRefreshing(false)
    }
  }, [fetchClients, fetchPositions])

  // Column resize handlers with RAF for smooth performance
  const handleResizeStart = useCallback((e, columnKey) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    resizeStartX.current = e.clientX
    // Measure the actual current width of the header cell for accurate resizing
    const measured = headerRefs.current?.[columnKey]?.getBoundingClientRect()?.width
    resizeStartWidth.current = (typeof measured === 'number' && measured > 0)
      ? measured
      : (columnWidths[columnKey] || 150) // Fallback to last set width or 150px
    // New behavior: do NOT shrink neighbor; allow table to grow horizontally
    resizeRightNeighborKey.current = null
    resizeRightStartWidth.current = 0
  }, [columnWidths])

  const handleResizeMove = useCallback((e) => {
    if (!resizingColumn) return
    // Use requestAnimationFrame for smooth rendering
    if (resizeRAF.current) {
      cancelAnimationFrame(resizeRAF.current)
    }
    resizeRAF.current = requestAnimationFrame(() => {
      const diff = e.clientX - resizeStartX.current
      // Allow both directions with min width 50px
      const leftWidth = Math.max(50, resizeStartWidth.current + diff)
      // Only adjust the active column; overall table width increases
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: leftWidth }))
    })
  }, [resizingColumn])

  const handleResizeEnd = useCallback(() => {
    if (resizeRAF.current) {
      cancelAnimationFrame(resizeRAF.current)
      resizeRAF.current = null
    }
    setResizingColumn(null)
  }, [])

  useEffect(() => {
    if (resizingColumn) {
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
      return () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
      }
    }
  }, [resizingColumn, handleResizeMove, handleResizeEnd])

  // Auto-fit like Excel on double click
  const ensureCanvas = () => {
    if (!measureCanvasRef.current) {
      const c = document.createElement('canvas')
      measureCanvasRef.current = c.getContext('2d')
    }
    return measureCanvasRef.current
  }

  const measureText = (text) => {
    try {
      const ctx = ensureCanvas()
      if (!ctx) return String(text || '').length * 8
      // Match table cell font (Tailwind text-sm -> 14px)
      ctx.font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial'
      return ctx.measureText(String(text ?? '')).width
    } catch {
      return String(text || '').length * 8
    }
  }

  

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev + 10, 200)) // Max 200%
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev - 10, 50)) // Min 50%
  }, [])

  const handleResetZoom = useCallback(() => {
    setZoomLevel(100)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target)) {
        setShowColumnSelector(false)
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setShowFilterMenu(false)
      }
      if (displayMenuRef.current && !displayMenuRef.current.contains(event.target)) {
        setShowDisplayMenu(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
      if (cardFilterMenuRef.current && !cardFilterMenuRef.current.contains(event.target)) {
        setShowCardFilterMenu(false)
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target)) {
        setShowThemeMenu(false)
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])


  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }
  
  // Column drag and drop handlers for reordering
  const handleColumnDragStart = (e, columnKey) => {
    setDraggingColumn(columnKey)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.currentTarget)
  }

  const handleColumnDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleColumnDrop = (e, targetColumnKey) => {
    e.preventDefault()
    
    if (!draggingColumn || draggingColumn === targetColumnKey) {
      setDraggingColumn(null)
      return
    }

    // Get current order from visibleColumnsList
    const currentOrder = visibleColumnsList.map(col => col.key)
    const draggedIndex = currentOrder.indexOf(draggingColumn)
    const targetIndex = currentOrder.indexOf(targetColumnKey)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggingColumn(null)
      return
    }

    // Create new order array
    const newOrder = [...currentOrder]
    const [removed] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, removed)

    setColumnOrder(newOrder)
    setDraggingColumn(null)
  }

  const handleColumnDragEnd = () => {
    setDraggingColumn(null)
  }

  // Reset column order to default
  const resetColumnOrder = () => {
    setColumnOrder(null)
    localStorage.removeItem('clientsPageColumnOrder')
  }

  // Reset column visibility to defaults
  const resetColumnVisibility = () => {
    const defaultVisible = getInitialVisibleColumns()
    setVisibleColumns(defaultVisible)
    localStorage.removeItem('clientsPageVisibleColumns')
  }

  // Column filter helper functions - Memoized for performance
  const getUniqueColumnValues = useMemo(() => {
    // Create a cache object for all columns
    const cache = {}
    
    return (columnKey) => {
      // Return cached result if search query hasn't changed
      const cacheKey = `${columnKey}_${filterSearchQuery[columnKey] || ''}`
      if (cache[cacheKey]) {
        return cache[cacheKey]
      }
      
      const values = new Set()
      if (!Array.isArray(clients)) return []
      
      clients.forEach(client => {
        if (!client) return
        const value = client[columnKey]
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
      const result = searchQuery
        ? sortedValues.filter(value => 
            String(value).toLowerCase().includes(searchQuery)
          )
        : sortedValues
      
      // Cache the result
      cache[cacheKey] = result
      return result
    }
  }, [clients, filterSearchQuery])

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
      const numberFilterKey = `${columnKey}_number`
      const textFilterKey = `${columnKey}_text`
      const { [columnKey]: _, [numberFilterKey]: __, [textFilterKey]: ___, ...rest } = prev
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
    // Check for text filter
    const textFilterKey = `${columnKey}_text`
    const hasTextFilter = columnFilters[textFilterKey] ? 1 : 0
    
    return checkboxCount + hasNumberFilter + hasTextFilter
  }

  const isAllSelected = (columnKey) => {
    const allValues = getUniqueColumnValues(columnKey)
    const selectedValues = columnFilters[columnKey] || []
    return allValues.length > 0 && selectedValues.length === allValues.length
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
    
    // Reset form
    setCustomFilterValue1('')
    setCustomFilterValue2('')
    setCustomFilterType('equal')
  }

  // Apply custom text filter
  const applyCustomTextFilter = () => {
    if (!customTextFilterColumn) return

    const filterConfig = {
      type: customTextFilterType, // 'equal' | 'notEqual' | 'startsWith' | 'endsWith' | 'contains' | 'doesNotContain'
      value: customTextFilterValue || '',
      caseSensitive: !!customTextFilterCaseSensitive
    }

    setColumnFilters(prev => ({
      ...prev,
      [`${customTextFilterColumn}_text`]: filterConfig
    }))

    // Close modal and dropdown
    setShowCustomTextFilterModal(false)
    setShowFilterDropdown(null)
    setShowTextFilterDropdown(null)

    // Reset form
    setCustomTextFilterValue('')
    setCustomTextFilterType('contains')
    setCustomTextFilterCaseSensitive(false)
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
    const { type, value: needle, caseSensitive } = filterConfig
    if (needle == null || needle === '') return true
    const hayRaw = value == null ? '' : String(value)
    const needleRaw = String(needle)
    const hay = caseSensitive ? hayRaw : hayRaw.toLowerCase()
    const n = caseSensitive ? needleRaw : needleRaw.toLowerCase()

    switch (type) {
      case 'equal':
        return hay === n
      case 'notEqual':
        return hay !== n
      case 'startsWith':
        return hay.startsWith(n)
      case 'endsWith':
        return hay.endsWith(n)
      case 'contains':
        return hay.includes(n)
      case 'doesNotContain':
        return !hay.includes(n)
      default:
        return true
    }
  }
  
  // Get filtered clients based on filter settings
  const getFilteredClients = useCallback(() => {
    // Safety check: ensure clients is an array
    if (!Array.isArray(clients)) return []
    
    let filtered = [...clients].filter(c => c != null)
    
    if (filterByPositions) {
      // Filter clients who have floating values
      filtered = filtered.filter(c => c && c.floating && Math.abs(c.floating) > 0)
    }
    
    if (filterByCredit) {
      // Filter clients who have credit (positive or negative, but not zero)
      filtered = filtered.filter(c => {
        if (!c) return false
        const credit = Number(c.credit)
        return Number.isFinite(credit) && credit !== 0
      })
    }

    if (filterNoDeposit) {
      // Filter clients whose Lifetime Deposit is zero
      filtered = filtered.filter(c => {
        if (!c) return false
        const lifeDep = Number(c.lifetimeDeposit)
        return !(Number.isFinite(lifeDep) ? lifeDep !== 0 : false)
      })
    }

    // Apply column filters
    Object.entries(columnFilters).forEach(([columnKey, values]) => {
      if (columnKey.endsWith('_number')) {
        // Number filter
        const actualColumnKey = columnKey.replace('_number', '')
        filtered = filtered.filter(client => {
          if (!client) return false
          const clientValue = client[actualColumnKey]
          return matchesNumberFilter(clientValue, values)
        })
      } else if (columnKey.endsWith('_text')) {
        // Text filter
        const actualColumnKey = columnKey.replace('_text', '')
        filtered = filtered.filter(client => {
          if (!client) return false
          const clientValue = client[actualColumnKey]
          return matchesTextFilter(clientValue, values)
        })
      } else if (values && values.length > 0) {
        // Regular checkbox filter - use string comparison for consistent matching
        filtered = filtered.filter(client => {
          if (!client) return false
          const clientValue = client[columnKey]
          const strValue = String(clientValue)
          return values.some(filterVal => String(filterVal) === strValue)
        })
      }
    })
    
    return filtered
  }, [clients, filterByPositions, filterByCredit, filterNoDeposit, columnFilters])
  
  // Sorting function with type detection
  const sortClients = useCallback((clientsToSort) => {
    if (!sortColumn) return clientsToSort
    
    // Deduplication now happens in filteredClients useMemo, not here
    // This avoids double processing
    
    const sorted = [...clientsToSort].sort((a, b) => {
      // Determine actual field to sort by
      let sortKey = sortColumn
      let aVal
      let bVal

      // If sorting a virtual percentage display column in 'both' mode
      if (sortKey.endsWith('_percentage_display')) {
        const baseKey = sortKey.replace('_percentage_display', '')
        const percKey = percentageFieldMap[baseKey]
        aVal = percKey ? a[percKey] : undefined
        bVal = percKey ? b[percKey] : undefined
      } else if (displayMode === 'percentage' && isMetricColumn(sortKey)) {
        // In percentage mode, sort by percentage field for metric columns
        const percKey = percentageFieldMap[sortKey]
        aVal = percKey ? a[percKey] : undefined
        bVal = percKey ? b[percKey] : undefined
      } else {
        aVal = a[sortKey]
        bVal = b[sortKey]
      }
      
      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      
      // Detect data type and sort accordingly
      // Check if it's a number (including balance, equity, profit, etc.)
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }
      
      // Check if it's a date/timestamp (registration, lastAccess)
      if ((sortColumn === 'registration' || sortColumn === 'lastAccess') && !isNaN(aVal) && !isNaN(bVal)) {
        const aTime = Number(aVal)
        const bTime = Number(bVal)
        return sortDirection === 'asc' ? aTime - bTime : bTime - aTime
      }
      
      // Default to string comparison (alphabetical)
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr)
      } else {
        return bStr.localeCompare(aStr)
      }
    })
    
    return sorted
  }, [sortColumn, sortDirection, displayMode, percentageFieldMap])
  
  // Search helpers
  const searchClients = useCallback((list) => {
    if (!searchQuery || typeof searchQuery !== 'string' || !searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter(c => {
      const login = String(c.login || '').toLowerCase()
      const name = String(c.name || '').toLowerCase()
      const email = String(c.email || '').toLowerCase()
      const phone = String(c.phone || '').toLowerCase()
      const group = String(c.group || '').toLowerCase()
      return login.includes(q) || name.includes(q) || email.includes(q) || phone.includes(q) || group.includes(q)
    })
  }, [searchQuery])

  const getSuggestions = useCallback((sorted) => {
    if (!searchQuery || typeof searchQuery !== 'string' || !searchQuery.trim() || searchQuery.length < 1) return []
    const q = searchQuery.toLowerCase().trim()
    const matchedClients = []
    // SAFETY: Filter out null clients before processing
    sorted.filter(c => c != null).forEach(c => {
      const login = String(c.login || '')
      const name = String(c.name || '')
      const email = String(c.email || '')
      const phone = String(c.phone || '')
      if (login.toLowerCase().includes(q) || name.toLowerCase().includes(q) || 
          email.toLowerCase().includes(q) || phone.toLowerCase().includes(q)) {
        matchedClients.push(c)
      }
    })
    return matchedClients.slice(0, 10)
  }, [searchQuery])

  const handleSuggestionClick = useCallback((client) => {
    const login = String(client.login || '')
    setSearchInput(login)
    setSearchQuery(login)
    setShowSuggestions(false)
    setCurrentPage(1)
  }, [])

  // (moved) latency effect will come after checksum definition to avoid TDZ

  // Offload filter/sort/dedup to filter worker; keep group filter on main thread for parity
  const [filteredClients, setFilteredClients] = useState([])
  
  // Use refs to track previous values and avoid infinite loops
  const prevDepsRef = useRef({})
  
  useEffect(() => {
    if (!Array.isArray(clients) || clients.length === 0) {
      setFilteredClients([])
      return
    }

    // Create stable dependency tracking with data checksum to detect value changes
    const currentDeps = {
      clientsLength: clients.length,
      // Add checksum to detect when client data values change (not just array length)
      clientsChecksum: lastWsReceiveAt || 0, // Use WebSocket receive timestamp as proxy for data freshness
      filterByPositions,
      filterByCredit,
      filterNoDeposit,
      columnFiltersKeys: Object.keys(columnFilters || {}).sort().join(','),
      searchQuery: searchQuery || '',
      sortColumn: sortColumn || '',
      sortDirection,
      displayMode,
      selectedIB: selectedIB || '',
      hasActiveGroupFilters: !!(activeGroupFilters?.clients),
      hasIBMT5Accounts: Array.isArray(ibMT5Accounts) && ibMT5Accounts.length > 0
    }
    
    // Check if dependencies actually changed
    const depsChanged = JSON.stringify(currentDeps) !== JSON.stringify(prevDepsRef.current)
    if (!depsChanged) return
    
    prevDepsRef.current = currentDeps

    // Resolve sort column with percentage-aware logic
    let resolvedSortColumn = null
    if (sortColumn) {
      if (String(sortColumn).endsWith('_percentage_display')) {
        const baseKey = String(sortColumn).replace('_percentage_display', '')
        resolvedSortColumn = percentageFieldMap[baseKey] || baseKey
      } else if (displayMode === 'percentage' && isMetricColumn(sortColumn)) {
        resolvedSortColumn = percentageFieldMap[sortColumn] || sortColumn
      } else {
        resolvedSortColumn = sortColumn
      }
    }

    // Fast path: when there are no filters, no search, and no sort, avoid worker lag.
    const hasAnyFilters = !!(
      filterByPositions ||
      filterByCredit ||
      filterNoDeposit ||
      (searchQuery && String(searchQuery).trim()) ||
      (columnFilters && Object.keys(columnFilters).length > 0)
    )
    const hasGroupIB = !!(activeGroupFilters?.clients) || !!(selectedIB && Array.isArray(ibMT5Accounts) && ibMT5Accounts.length > 0)
    const hasSort = !!resolvedSortColumn

    if (!hasAnyFilters && !hasGroupIB && !hasSort) {
      // Identity list; keep table and face cards perfectly in sync with source clients
      setFilteredClients(clients)
      return
    }

    let canceled = false
    const t = setTimeout(async () => {
      try {
        // If server-side filtering is needed (e.g., login IN or global search), fetch from API
        let clientsSource = clients
        try {
          const payload = { page: 1, limit: itemsPerPage || 100 }
          const q = (searchQuery || '').trim()
          if (q) payload.search = q
          // Map columnFilters for login IN to API payload
          const loginCheckbox = columnFilters?.login_checkbox?.values || []
          const loginText = columnFilters?.login_text?.value
          const filters = []
          if (Array.isArray(loginCheckbox) && loginCheckbox.length > 0) {
            const vals = Array.from(new Set(loginCheckbox.map(v => Number(v)).filter(Number.isFinite)))
            if (vals.length > 0) filters.push({ field: 'login', operator: 'in', value: vals })
          }
          if (loginText != null && String(loginText).trim().length > 0) {
            filters.push({ field: 'login', operator: 'contains', value: String(loginText).trim() })
          }
          if (filters.length > 0) payload.filters = filters
          if (payload.search || payload.filters) {
            const resp = await brokerAPI.searchClients(payload)
            const data = (resp?.data?.data) || (resp?.data) || {}
            const list = Array.isArray(data?.clients) ? data.clients.filter(c => c && c.login != null) : []
            if (list.length > 0) clientsSource = list
          }
        } catch (e) {
          console.warn('[ClientsPage] Server-side search/filter failed, using cached clients:', e?.message || e)
        }
        const result = await workerManager.execute('FILTER_SORT_DEDUP', {
          clients: clientsSource,
          filters: {
            filterByPositions,
            filterByCredit,
            filterNoDeposit,
            columnFilters,
            searchQuery
          },
          sortConfig: resolvedSortColumn ? { column: resolvedSortColumn, direction: sortDirection } : null
        }, 0)
        if (canceled) return
        const list = Array.isArray(result?.clients) ? result.clients : []
        // Apply IB filter first (after quick filters from worker)
        const ibFiltered = filterByActiveIB(list, 'login')
        // Apply group filter on top of IB filter
        const grouped = filterByActiveGroup(ibFiltered, 'login', 'clients')
        setFilteredClients(grouped)
      } catch (err) {
        console.error('[ClientsPage] FILTER_SORT_DEDUP worker failed, falling back:', err?.message || err)
        // Fallback to previous synchronous pipeline
        try {
          const base = getFilteredClients()
          const searched = searchClients(base)
          // Apply IB filter first in fallback path
          const ibFiltered = filterByActiveIB(searched, 'login')
          // Apply group filter on top of IB filter
          const grouped = filterByActiveGroup(ibFiltered, 'login', 'clients')
          const sorted = sortClients(grouped)
          const seen = new Set()
          const deduped = sorted.filter(client => {
            if (!client) return false
            const key = client.login ?? client.clientID ?? client.mqid
            if (key == null || key === '') return true
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          if (!canceled) setFilteredClients(deduped)
        } catch (e) {
          if (!canceled) setFilteredClients([])
        }
      }
    }, 100) // tightened debounce for faster responsiveness

    return () => { canceled = true; clearTimeout(t) }
  }, [
    clients,
    lastWsReceiveAt, // Track WebSocket updates to trigger data refresh
    filterByPositions,
    filterByCredit,
    filterNoDeposit,
    columnFilters,
    searchQuery,
    sortColumn,
    sortDirection,
    displayMode,
    filterByActiveGroup,
    activeGroupFilters,
    filterByActiveIB,
    selectedIB,
    ibMT5Accounts,
    percentageFieldMap,
    isMetricColumn
  ])

  // Financial checksum (filtered) – detect value-only changes for worker recalculation
  const filteredClientsChecksum = useMemo(() => {
    if (!filteredClients || filteredClients.length === 0) return '0'
    // Robust numeric coercion to prevent string concatenation and drift
    const toNum = (v) => {
      if (v == null || v === '') return 0
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0
      if (typeof v === 'string') {
        const n = Number(v.replace(/,/g, '').trim())
        return Number.isFinite(n) ? n : 0
      }
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }

    let sumBalance = 0, sumCredit = 0, sumEquity = 0, sumProfit = 0, sumPnl = 0,
      sumDaily = 0, sumWeek = 0, sumMonth = 0, sumLife = 0
    for (let i = 0; i < filteredClients.length; i++) {
      const c = filteredClients[i]
      if (!c) continue
      sumBalance += toNum(c.balance)
      sumCredit += toNum(c.credit)
      sumEquity += toNum(c.equity)
      sumProfit += toNum(c.profit)
      // Use raw pnl and bucket values directly (backend already provides correct sign)
      sumPnl += toNum(c.pnl)
      sumDaily += toNum(c.dailyPnL)
      sumWeek += toNum(c.thisWeekPnL)
      sumMonth += toNum(c.thisMonthPnL)
      sumLife += toNum(c.lifetimePnL)
    }
    return [sumBalance, sumCredit, sumEquity, sumProfit, sumPnl, sumDaily, sumWeek, sumMonth, sumLife]
      .map(v => Math.round(v * 100))
      .join('|')
  }, [filteredClients])

  // Compute render latency whenever filtered data signature changes or stats update (after checksum defined)
  useEffect(() => {
    if (!lastWsReceiveAt) return
    const now = Date.now()
    const delta = now - lastWsReceiveAt
    if (delta < 60000) {
      latencySamplesRef.current.push(delta)
      if (latencySamplesRef.current.length > 50) latencySamplesRef.current.shift()
      const sorted = [...latencySamplesRef.current].sort((a,b) => a-b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const max = Math.max(...sorted)
      setLatencyStats({ last: delta, median, max })
    }
  }, [filteredClientsChecksum, workerStats, lastWsReceiveAt])

  // Web Worker effect - calculate stats in background thread (after checksum is defined)
  useEffect(() => {
    if (!showFaceCards) {
      setWorkerStats(null)
      return
    }
    const hasFilters = filterByPositions || filterByCredit || filterNoDeposit || searchQuery || Object.keys(columnFilters).length > 0
    if (!hasFilters) {
      setWorkerStats(null)
      return
    }
    const inputSignature = `${filteredClientsChecksum}_${filterByPositions}_${filterByCredit}_${filterNoDeposit}_${searchQuery}_${Object.keys(columnFilters).length}`
    if (lastWorkerInputRef.current === inputSignature) return
    lastWorkerInputRef.current = inputSignature
    if (workerCalculationTimeoutRef.current) {
      clearTimeout(workerCalculationTimeoutRef.current)
    }
    workerCalculationTimeoutRef.current = setTimeout(async () => {
      try {
        setIsCalculatingInWorker(true)
        const stats = await workerManager.execute('CALCULATE_STATS', { clients: filteredClients }, 1)
        setWorkerStats(stats)
      } catch (error) {
        console.error('[ClientsPage] Worker stats calculation failed:', error)
      } finally {
        setIsCalculatingInWorker(false)
      }
    }, 300) // tightened stats debounce
    return () => {
      if (workerCalculationTimeoutRef.current) {
        clearTimeout(workerCalculationTimeoutRef.current)
      }
    }
  }, [
    filteredClientsChecksum,
    filterByPositions,
    filterByCredit,
    filterNoDeposit,
    searchQuery,
    Object.keys(columnFilters).length,
    showFaceCards
  ])
  
  // Handle column header click for sorting with debounce protection
  const sortTimeoutRef = useRef(null)
  const handleSort = useCallback((columnKey) => {
    // Trigger loading animation
    setIsSorting(true)
    setTimeout(() => setIsSorting(false), 1200) // Match animation duration
    
    // Clear any pending sort operation
    if (sortTimeoutRef.current) {
      clearTimeout(sortTimeoutRef.current)
    }
    
    // Debounce rapid clicks (150ms) to prevent duplicate key errors during rapid sorting
    sortTimeoutRef.current = setTimeout(() => {
      if (sortColumn === columnKey) {
        // Toggle direction if same column
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
      } else {
        // New column, default to ascending
        setSortColumn(columnKey)
        setSortDirection('asc')
      }
    }, 150)
  }, [sortColumn])
  
  // Generate dynamic pagination options based on data count
  const generatePageSizeOptions = () => {
    const totalCount = filteredClients.length
    
    if (totalCount === 0) return [50]
    
    const options = []
    
    // Add standard options up to 500 max
    const standardSizes = [50, 100, 200, 500]
    standardSizes.forEach(size => {
      if (size <= totalCount) {
        options.push(size)
      }
    })
    
    // If no options were added (totalCount < 50), add at least one option
    if (options.length === 0) {
      options.push(Math.min(50, totalCount))
    }
    
    return options
  }
  
  const pageSizeOptions = generatePageSizeOptions()
  
  // Pagination logic - optimized (deduplication already done in filteredClients)
  const { totalPages, displayedClients } = useMemo(() => {
    const total = Math.ceil(filteredClients.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    
    // Simple slice - deduplication already handled in filteredClients useMemo
    const sliced = filteredClients.slice(startIndex, endIndex)
    
    return {
      totalPages: total || 1,
      displayedClients: sliced
    }
  }, [filteredClients, itemsPerPage, currentPage])

  // ------------------------
  // Virtualization state
  // ------------------------
  const scrollContainerRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const BASE_ROW_HEIGHT = 40 // px at 100% zoom

  // Measure viewport height when layout changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      setViewportHeight(scrollContainerRef.current.clientHeight)
    }
  }, [showFaceCards, zoomLevel, displayedClients.length])

  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop)
  }, [])

  const effectiveRowHeight = useMemo(() => {
    return (BASE_ROW_HEIGHT * (zoomLevel / 100))
  }, [zoomLevel])

  const virtualizationMetrics = useMemo(() => {
    const total = displayedClients.length
    if (total === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        topPadding: 0,
        bottomPadding: 0,
        virtualizedClients: []
      }
    }
    const buffer = 5
    const start = Math.max(0, Math.floor(scrollTop / effectiveRowHeight) - buffer)
    const visibleRowsEstimate = Math.ceil(viewportHeight / effectiveRowHeight) + buffer * 2
    const end = Math.min(total, start + visibleRowsEstimate)
    const topPad = start * effectiveRowHeight
    const bottomPad = (total - end) * effectiveRowHeight
    return {
      startIndex: start,
      endIndex: end,
      topPadding: topPad,
      bottomPadding: bottomPad,
      virtualizedClients: displayedClients.slice(start, end)
    }
  }, [displayedClients, scrollTop, effectiveRowHeight, viewportHeight])

  const { virtualizedClients, topPadding, bottomPadding } = virtualizationMetrics


  // Export to Excel (placed after filteredClients is defined)
  const handleExportToExcel = useCallback((exportType = 'table') => {
    try {
      // Use full clients array for 'all' export, filtered for table export
      const dataToExport = exportType === 'all' ? clients : filteredClients
      
      if (!dataToExport || dataToExport.length === 0) {
        alert('No data to export')
        return
      }

      // Get columns based on export type
      const columnsToExport = exportType === 'all' 
        ? dynamicColumns  // Export all columns
        : dynamicColumns.filter(col => visibleColumns[col.key] === true)  // Export only visible columns
      
      // Prepare CSV content
      const headers = columnsToExport.map(col => col.label).join(',')
      // SAFETY: Filter out null/undefined clients before mapping
      const rows = dataToExport.filter(client => client != null).map(client => {
        return columnsToExport.map(col => {
          // SAFETY: Use optional chaining for property access
          let value = client?.[col.key]
          
          // Handle different data types
          if (value === null || value === undefined) {
            return ''
          }
          
          // Format numbers
          if (typeof value === 'number') {
            value = value.toString()
          }
          
          // Escape commas and quotes in strings
          if (typeof value === 'string') {
            value = value.replace(/"/g, '""')
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              value = `"${value}"`
            }
          }
          
          return value
        }).join(',')
      }).join('\n')

      const csvContent = headers + '\n' + rows

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      const exportLabel = exportType === 'all' ? 'all-columns' : 'table-columns'
      link.setAttribute('download', `clients_${exportLabel}_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Close the export menu after export
      setShowExportMenu(false)
    } catch (error) {
      console.error('[ClientsPage] Export failed:', error)
      alert('Export failed. Please check the console for details.')
    }
  }, [clients, filteredClients, visibleColumns, allColumns])

  // Auto-fit like Excel on double click (placed after displayedClients to avoid TDZ)
  const handleAutoFit = useCallback((visKey, baseKey) => {
    // Compute header label width
    const colMeta = allColumns.find(c => c.key === baseKey)
    const headerLabel = (visKey && visKey.endsWith('_percentage_display')) && colMeta ? `${colMeta.label} %` : (colMeta?.label || baseKey)
    let maxW = measureText(headerLabel)

    // Sample displayed rows (up to 100) for visible text widths
    // SAFETY: Filter out null clients before slicing
    const sample = Array.isArray(displayedClients) ? displayedClients.filter(c => c != null).slice(0, 100) : []
    for (let i = 0; i < sample.length; i++) {
      const client = sample[i]
      if (!client) continue
      let str
      if (visKey && visKey.endsWith('_percentage_display')) {
        // percentage
  const percKey = percentageFieldMap[baseKey]
  const val = percKey ? client[percKey] : undefined
  str = formatPercent(val, client)
      } else {
        str = formatValue(baseKey, client[baseKey], client)
      }
      maxW = Math.max(maxW, measureText(str))
    }

    // Add padding and small buffer for icons
    const paddingLR = 24 // px-3 left+right
    const buffer = 20
    const target = Math.max(50, Math.min(Math.ceil(maxW + paddingLR + buffer), 450))
    setColumnWidths(prev => ({ ...prev, [visKey]: target }))
  }, [displayedClients, percentageFieldMap])
  
  // Reset to page 1 when filters or items per page changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filterByPositions, filterByCredit, filterNoDeposit, itemsPerPage, searchQuery, displayMode])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterDropdown) {
        const clickedInsideButton = filterRefs.current[showFilterDropdown]?.contains(event.target)
        const clickedInsidePanel = filterPanelRef.current?.contains(event.target)
        
        if (!clickedInsideButton && !clickedInsidePanel) {
          setShowFilterDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterDropdown])
  
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage)
    // Scroll to top of table
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  
  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(parseInt(value))
    setCurrentPage(1)
  }

  const formatPercent = (value, client = null) => {
    if (value === null || value === undefined || value === '') return '-'
    let num = Number(value)
    if (isNaN(num)) return '-'
    // Backend handles USC scaling; show percentage with % sign
    return `${num.toFixed(2)}%`
  }

  // Format numbers in Indian currency style (lakhs/crores)
  // Drag and drop handlers for face cards
  const handleFaceCardDragStart = (e, cardId) => {
    setDraggedFaceCard(cardId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.target)
    e.target.style.opacity = '0.5'
  }

  const handleFaceCardDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDraggedFaceCard(null)
  }

  const handleFaceCardDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleFaceCardDrop = (e, targetCardId) => {
    e.preventDefault()
    
    if (draggedFaceCard === targetCardId) return

    const newOrder = [...faceCardOrder]
    const draggedIndex = newOrder.indexOf(draggedFaceCard)
    const targetIndex = newOrder.indexOf(targetCardId)

    // Swap positions
    newOrder[draggedIndex] = targetCardId
    newOrder[targetIndex] = draggedFaceCard

    setFaceCardOrder(newOrder)
    localStorage.setItem('clientsFaceCardOrder', JSON.stringify(newOrder))
  }

  // Reset face card order to default
  const resetFaceCardOrder = () => {
    setFaceCardOrder(defaultFaceCardOrder)
    localStorage.setItem('clientsFaceCardOrder', JSON.stringify(defaultFaceCardOrder))
    // Also reset card visibility to default
    setCardVisibility(defaultCardVisibility)
    localStorage.setItem('clientsCardVisibility', JSON.stringify(defaultCardVisibility))
  }

  const formatIndianNumber = (num) => {
    const numStr = num.toString()
    const [integerPart, decimalPart] = numStr.split('.')
    
    // Handle negative numbers
    const isNegative = integerPart.startsWith('-')
    const absoluteInteger = isNegative ? integerPart.substring(1) : integerPart
    
    if (absoluteInteger.length <= 3) {
      return decimalPart ? `${integerPart}.${decimalPart}` : integerPart
    }
    
    // Indian format: last 3 digits, then groups of 2
    const lastThree = absoluteInteger.substring(absoluteInteger.length - 3)
    const otherNumbers = absoluteInteger.substring(0, absoluteInteger.length - 3)
    const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    const formatted = `${formattedOther},${lastThree}`
    
    const result = (isNegative ? '-' : '') + formatted
    return decimalPart ? `${result}.${decimalPart}` : result
  }

  // Get face card configuration by ID
  // Apply theme colors based on selected theme
  const getThemedColors = (defaultBorder, defaultText, defaultValue) => {
    if (faceCardTheme === 'subtle') {
      // Subtle theme - 3-color system: Teal (increase), Rose (decrease), Slate (neutral)
      // Softer, muted colors for a calm, professional look
      const subtleMap = {
        // Teal cards (deposits, profits, credits, positive metrics)
        'border-emerald-200': 'border-teal-400', 'text-emerald-600': 'text-teal-400', 'text-emerald-700': 'text-teal-400',
        'border-green-200': 'border-teal-400', 'text-green-600': 'text-teal-400', 'text-green-700': 'text-teal-400',
        'border-teal-200': 'border-teal-400', 'text-teal-600': 'text-teal-400', 'text-teal-700': 'text-teal-400',
        'border-lime-200': 'border-teal-400', 'text-lime-600': 'text-teal-400', 'text-lime-700': 'text-teal-400',
        
        // Rose cards (withdrawals, losses, negative metrics)
        'border-red-200': 'border-rose-400', 'text-red-600': 'text-rose-400', 'text-red-700': 'text-rose-400',
        'border-rose-200': 'border-rose-400', 'text-rose-600': 'text-rose-400', 'text-rose-700': 'text-rose-400',
        'border-pink-200': 'border-rose-400', 'text-pink-600': 'text-rose-400', 'text-pink-700': 'text-rose-400',
        'border-orange-200': 'border-rose-400', 'text-orange-600': 'text-rose-400', 'text-orange-700': 'text-rose-400',
        'border-amber-200': 'border-rose-400', 'text-amber-600': 'text-rose-400', 'text-amber-700': 'text-rose-400',
        
        // Slate cards (totals, counts, neutral metrics)
        'border-blue-200': 'border-blue-300', 'text-blue-600': 'text-blue-700', 'text-blue-700': 'text-blue-800',
        'border-indigo-200': 'border-indigo-300', 'text-indigo-600': 'text-indigo-700', 'text-indigo-700': 'text-indigo-800',
        'border-sky-200': 'border-sky-300', 'text-sky-600': 'text-sky-700', 'text-sky-700': 'text-sky-800',
        'border-cyan-200': 'border-cyan-300', 'text-cyan-600': 'text-cyan-700', 'text-cyan-700': 'text-cyan-800',
        'border-violet-200': 'border-violet-300', 'text-violet-600': 'text-violet-700', 'text-violet-700': 'text-violet-800',
        'border-purple-200': 'border-purple-300', 'text-purple-600': 'text-purple-700', 'text-purple-700': 'text-purple-800',
        'border-fuchsia-200': 'border-fuchsia-300', 'text-fuchsia-600': 'text-fuchsia-700', 'text-fuchsia-700': 'text-fuchsia-800',
      }
      
      return {
        borderColor: subtleMap[defaultBorder] || defaultBorder,
        textColor: subtleMap[defaultText] || defaultText,
        valueColor: subtleMap[defaultValue] || defaultValue
      }
    } else if (faceCardTheme === 'vibrant') {
      // Vibrant theme - 3-color system: Green (increase), Red (decrease), Blue (neutral)
      // Green for: deposits, profits, credits, rebates (positive metrics)
      // Red for: withdrawals, losses, negative values
      // Blue for: totals, counts, neutral metrics
      
      const vibrantMap = {
        // Green cards (deposits, profits, credits, positive metrics)
        'border-emerald-200': 'border-green-600', 'text-emerald-600': 'text-green-600', 'text-emerald-700': 'text-green-600',
        'border-green-200': 'border-green-600', 'text-green-600': 'text-green-600', 'text-green-700': 'text-green-600',
        'border-teal-200': 'border-green-600', 'text-teal-600': 'text-green-600', 'text-teal-700': 'text-green-600',
        'border-lime-200': 'border-green-600', 'text-lime-600': 'text-green-600', 'text-lime-700': 'text-green-600',
        
        // Red cards (withdrawals, losses, negative metrics)
        'border-red-200': 'border-red-600', 'text-red-600': 'text-red-600', 'text-red-700': 'text-red-600',
        'border-rose-200': 'border-red-600', 'text-rose-600': 'text-red-600', 'text-rose-700': 'text-red-600',
        'border-pink-200': 'border-red-600', 'text-pink-600': 'text-red-600', 'text-pink-700': 'text-red-600',
        'border-orange-200': 'border-red-600', 'text-orange-600': 'text-red-600', 'text-orange-700': 'text-red-600',
        'border-amber-200': 'border-red-600', 'text-amber-600': 'text-red-600', 'text-amber-700': 'text-red-600',
        
        // Blue cards (totals, counts, neutral metrics)
        'border-blue-200': 'border-blue-400', 'text-blue-600': 'text-blue-700', 'text-blue-700': 'text-blue-800',
        'border-indigo-200': 'border-indigo-400', 'text-indigo-600': 'text-indigo-700', 'text-indigo-700': 'text-indigo-800',
        'border-sky-200': 'border-sky-400', 'text-sky-600': 'text-sky-700', 'text-sky-700': 'text-sky-800',
        'border-cyan-200': 'border-cyan-400', 'text-cyan-600': 'text-cyan-700', 'text-cyan-700': 'text-cyan-800',
        'border-violet-200': 'border-violet-400', 'text-violet-600': 'text-violet-700', 'text-violet-700': 'text-violet-800',
        'border-purple-200': 'border-purple-400', 'text-purple-600': 'text-purple-700', 'text-purple-700': 'text-purple-800',
        'border-fuchsia-200': 'border-fuchsia-400', 'text-fuchsia-600': 'text-fuchsia-700', 'text-fuchsia-700': 'text-fuchsia-800',
      }
      
      return {
        borderColor: vibrantMap[defaultBorder] || defaultBorder,
        textColor: vibrantMap[defaultText] || defaultText,
        valueColor: vibrantMap[defaultValue] || defaultValue
      }
    }
    // Default theme - return original colors
    return {
      borderColor: defaultBorder,
      textColor: defaultText,
      valueColor: defaultValue
    }
  }
  
  // Get icon path for each card based on title
  const getCardIcon = (cardTitle) => {
    const iconMap = {
      'Total Clients': '/Desktop cards icons/Total Clients.svg',
      'Total Balance': '/Desktop cards icons/Total Balance.svg',
      'Total Credit': '/Desktop cards icons/Total Credit.svg',
      'Total Equity': '/Desktop cards icons/Total Equity.svg',
      'PNL': '/Desktop cards icons/PNL.svg',
      'Floating Profit': '/Desktop cards icons/Floating Profit.svg',
      'Daily Deposit': '/Desktop cards icons/Daily Deposite.svg',
      'Daily Withdrawal': '/Desktop cards icons/Daily WITHDRAWL.svg',
      'Daily PnL': '/Desktop cards icons/Daily PNL.svg',
      'This Week PnL': '/Desktop cards icons/This week pnl.svg',
      'This Month PnL': '/Desktop cards icons/THIS MONTH PNL.svg',
      'Lifetime PnL': '/Desktop cards icons/LIFETIME PNL.svg',
      'Daily Net D/W': '/Desktop cards icons/NET WD.svg',
      'Total Rebate': '/Desktop cards icons/TOTAL COMMISION.svg',
      'Available Rebate': '/Desktop cards icons/AVAILABLE Commision.svg',
      'Total Rebate %': '/Desktop cards icons/TOTAL COMMISION%25.svg',
      'Available Rebate %': '/Desktop cards icons/AVAILABLE Commision%25.svg',
      'Blocked Rebate': '/Desktop cards icons/Blocked commision.svg',
      'Daily Bonus IN': '/Desktop cards icons/Daily BONUS IN.svg',
      'Daily Bonus OUT': '/Desktop cards icons/Daily BONUS OUT.svg',
      'NET Daily Bonus': '/Desktop cards icons/Net Daily Bonus.svg',
      'Week Bonus IN': '/Desktop cards icons/Weekly bonus in.svg',
      'Week Bonus OUT': '/Desktop cards icons/WEEK BONUS OUT.svg',
      'NET Week Bonus': '/Desktop cards icons/NET WEEK BONUS.svg',
      'Monthly Bonus IN': '/Desktop cards icons/MONTHLY BONUS IN.svg',
      'Monthly Bonus OUT': '/Desktop cards icons/MONTHLY BONUS OUt.svg',
      'NET Monthly Bonus': '/Desktop cards icons/NET MONTHLY BONUS.svg',
      'Lifetime Bonus IN': '/Desktop cards icons/LIFETIME BONUS IN.svg',
      'Lifetime Bonus OUT': '/Desktop cards icons/LIFETIME BONUS OUT.svg',
      'NET Lifetime Bonus': '/Desktop cards icons/NET LIFETIME BONUS.svg',
      'Week Deposit': '/Desktop cards icons/WEEK DEPOSITE.svg',
      'Week Withdrawal': '/Desktop cards icons/WEEK WITHDRAWL.svg',
      'NET Week DW': '/Desktop cards icons/NET WEEK DAY.svg',
      'Monthly Deposit': '/Desktop cards icons/MONTLY DEPOSITE.svg',
      'Monthly Withdrawal': '/Desktop cards icons/MONTLY WITHDRAWL.svg',
      'NET Monthly DW': '/Desktop cards icons/NET MONTHLY DW.svg',
      'Lifetime Deposit': '/Desktop cards icons/Daily Deposite.svg',
      'Lifetime Withdrawal': '/Desktop cards icons/Daily WITHDRAWL.svg',
      'NET Lifetime DW': '/Desktop cards icons/NET WD.svg',
      'Weekly Credit IN': '/Desktop cards icons/WEEKLY Credit IN.svg',
      'Monthly Credit IN': '/Desktop cards icons/MONTHLY CREDIT IN.svg',
      'Lifetime Credit IN': '/Desktop cards icons/LIFETIME CREDIT IN.svg',
      'Weekly Credit OUT': '/Desktop cards icons/WEEKLY CREDIT OUT.svg',
      'Monthly Credit OUT': '/Desktop cards icons/MOnthly CREDIT OUT.svg',
      'Lifetime Credit OUT': '/Desktop cards icons/LIFETIME CREDIT OUT.svg',
      'NET Credit': '/Desktop cards icons/NET CREDIT.svg',
      'Previous Equity': '/Desktop cards icons/PREVIOUS EQUITY.svg',
      'Weekly Previous Equity': '/Desktop cards icons/Weekly PREVIOUS EQUITY.svg',
      'Monthly Previous Equity': '/Desktop cards icons/Monthly PREVIOUS EQUITY.svg',
      'Book PnL': '/Desktop cards icons/PNL.svg',
      'Daily Deposit %': '/Desktop cards icons/Daily Deposite.svg',
      'Daily Withdrawal %': '/Desktop cards icons/Daily WITHDRAWL.svg',
      'Total Balance %': '/Desktop cards icons/Total Balance.svg',
      'Total Credit %': '/Desktop cards icons/Total Credit.svg',
      'Total Equity %': '/Desktop cards icons/Total Equity.svg',
      'PNL %': '/Desktop cards icons/PNL.svg',
      'Floating Profit %': '/Desktop cards icons/Floating Profit.svg',
      'Book PnL %': '/Desktop cards icons/PNL.svg',
      'Net Lifetime PnL': '/Desktop cards icons/NET LIFETIME BONUS.svg',
    }
    return iconMap[cardTitle] || '/Desktop cards icons/Total Clients.svg' // Default icon
  }

  // Get face card configuration by ID (for draggable cards)
  const getFaceCardConfig = (cardId, stats) => {
    // Calculate Net DW (Deposit - Withdrawal)
    const netDW = (stats.dailyDeposit || 0) - (stats.dailyWithdrawal || 0)
    
    const configs = {
      1: { id: 1, title: 'Total Clients', value: Number(stats.totalClients || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), numericValue: stats.totalClients || 0, unit: '', simple: true, borderColor: 'border-blue-200', textColor: 'text-blue-600' },
      2: { id: 2, title: 'Total Balance', value: formatIndianNumber(stats.totalBalance.toFixed(2)), numericValue: stats.totalBalance || 0, unit: 'USD', simple: true, borderColor: 'border-indigo-200', textColor: 'text-indigo-600' },
      3: { id: 3, title: 'Total Credit', value: formatIndianNumber(stats.totalCredit.toFixed(2)), numericValue: stats.totalCredit || 0, unit: 'USD', simple: true, borderColor: 'border-emerald-200', textColor: 'text-emerald-600' },
      4: { id: 4, title: 'Total Equity', value: formatIndianNumber(stats.totalEquity.toFixed(2)), numericValue: stats.totalEquity || 0, unit: 'USD', simple: true, borderColor: 'border-sky-200', textColor: 'text-sky-600' },
      5: { id: 5, title: 'PNL', value: stats.totalPnl, numericValue: stats.totalPnl || 0, unit: 'USD', withIcon: true, isPositive: stats.totalPnl >= 0, formattedValue: formatIndianNumber(Math.abs(stats.totalPnl).toFixed(2)) },
      6: { id: 6, title: 'Floating Profit', value: stats.totalProfit, numericValue: stats.totalProfit || 0, unit: 'USD', withIcon: true, isPositive: stats.totalProfit >= 0, formattedValue: formatIndianNumber(Math.abs(stats.totalProfit).toFixed(2)), iconColor: stats.totalProfit >= 0 ? 'teal' : 'orange' },
      8: { id: 8, title: 'Daily Deposit', value: formatIndianNumber(stats.dailyDeposit.toFixed(2)), numericValue: stats.dailyDeposit || 0, unit: 'USD', simple: true, borderColor: 'border-green-200', textColor: 'text-green-600', valueColor: 'text-green-700' },
      9: { id: 9, title: 'Daily Withdrawal', value: formatIndianNumber(stats.dailyWithdrawal.toFixed(2)), numericValue: stats.dailyWithdrawal || 0, unit: 'USD', simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      10: { id: 10, title: 'Daily PnL', value: stats.dailyPnL, withArrow: true, isPositive: stats.dailyPnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.dailyPnL).toFixed(2)), borderColor: stats.dailyPnL >= 0 ? 'border-emerald-200' : 'border-rose-200', textColor: stats.dailyPnL >= 0 ? 'text-emerald-600' : 'text-rose-600', valueColor: stats.dailyPnL >= 0 ? 'text-emerald-700' : 'text-rose-700' },
      11: { id: 11, title: 'This Week PnL', value: stats.thisWeekPnL, withArrow: true, isPositive: stats.thisWeekPnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.thisWeekPnL).toFixed(2)), borderColor: stats.thisWeekPnL >= 0 ? 'border-cyan-200' : 'border-amber-200', textColor: stats.thisWeekPnL >= 0 ? 'text-cyan-600' : 'text-amber-600', valueColor: stats.thisWeekPnL >= 0 ? 'text-cyan-700' : 'text-amber-700' },
      12: { id: 12, title: 'This Month PnL', value: stats.thisMonthPnL, withArrow: true, isPositive: stats.thisMonthPnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.thisMonthPnL).toFixed(2)), borderColor: stats.thisMonthPnL >= 0 ? 'border-teal-200' : 'border-orange-200', textColor: stats.thisMonthPnL >= 0 ? 'text-teal-600' : 'text-orange-600', valueColor: stats.thisMonthPnL >= 0 ? 'text-teal-700' : 'text-orange-700' },
      13: { id: 13, title: 'Lifetime PnL', value: stats.lifetimePnL, withArrow: true, isPositive: stats.lifetimePnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.lifetimePnL).toFixed(2)), borderColor: stats.lifetimePnL >= 0 ? 'border-violet-200' : 'border-pink-200', textColor: stats.lifetimePnL >= 0 ? 'text-violet-600' : 'text-pink-600', valueColor: stats.lifetimePnL >= 0 ? 'text-violet-700' : 'text-pink-700' },
  14: { id: 14, title: 'Daily Net D/W', value: netDW, withArrow: true, isPositive: netDW >= 0, formattedValue: formatIndianNumber(Math.abs(netDW).toFixed(2)), borderColor: netDW >= 0 ? 'border-green-200' : 'border-red-200', textColor: netDW >= 0 ? 'text-green-600' : 'text-red-600', valueColor: netDW >= 0 ? 'text-green-700' : 'text-red-700' },
      15: { id: 15, title: 'Total Rebate', value: stats.totalCommission, withArrow: true, isPositive: stats.totalCommission >= 0, formattedValue: formatIndianNumber(Math.abs(stats.totalCommission || 0).toFixed(2)), borderColor: 'border-amber-200', textColor: 'text-amber-600', valueColor: 'text-amber-700' },
      16: { id: 16, title: 'Available Rebate', value: stats.availableCommission, withArrow: true, isPositive: stats.availableCommission >= 0, formattedValue: formatIndianNumber(Math.abs(stats.availableCommission || 0).toFixed(2)), borderColor: 'border-lime-200', textColor: 'text-lime-600', valueColor: 'text-lime-700' },
      17: { id: 17, title: 'Total Rebate %', value: stats.totalCommissionPercent, withArrow: true, isPositive: stats.totalCommissionPercent >= 0, formattedValue: `${formatIndianNumber(Math.abs(stats.totalCommissionPercent || 0).toFixed(4))}`, borderColor: 'border-amber-300', textColor: 'text-amber-700', valueColor: 'text-amber-800' },
      18: { id: 18, title: 'Available Rebate %', value: stats.availableCommissionPercent, withArrow: true, isPositive: stats.availableCommissionPercent >= 0, formattedValue: `${formatIndianNumber(Math.abs(stats.availableCommissionPercent || 0).toFixed(4))}`, borderColor: 'border-lime-300', textColor: 'text-lime-700', valueColor: 'text-lime-800' },
      19: { id: 19, title: 'Blocked Rebate', value: formatIndianNumber((stats.blockedCommission || 0).toFixed(2)), simple: true, borderColor: 'border-gray-300', textColor: 'text-gray-600', valueColor: 'text-gray-700' },
      // Daily Bonus
      20: { id: 20, title: 'Daily Bonus IN', value: formatIndianNumber((stats.dailyBonusIn || 0).toFixed(2)), simple: true, borderColor: 'border-emerald-200', textColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
      21: { id: 21, title: 'Daily Bonus OUT', value: formatIndianNumber((stats.dailyBonusOut || 0).toFixed(2)), simple: true, borderColor: 'border-rose-200', textColor: 'text-rose-600', valueColor: 'text-rose-700' },
      22: { id: 22, title: 'NET Daily Bonus', value: stats.netDailyBonus || 0, withArrow: true, isPositive: (stats.netDailyBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netDailyBonus || 0).toFixed(2)), borderColor: (stats.netDailyBonus || 0) >= 0 ? 'border-green-200' : 'border-red-200', textColor: (stats.netDailyBonus || 0) >= 0 ? 'text-green-600' : 'text-red-600', valueColor: (stats.netDailyBonus || 0) >= 0 ? 'text-green-700' : 'text-red-700' },
      // Weekly Bonus
      23: { id: 23, title: 'Week Bonus IN', value: formatIndianNumber((stats.weekBonusIn || 0).toFixed(2)), simple: true, borderColor: 'border-cyan-200', textColor: 'text-cyan-600', valueColor: 'text-cyan-700' },
      24: { id: 24, title: 'Week Bonus OUT', value: formatIndianNumber((stats.weekBonusOut || 0).toFixed(2)), simple: true, borderColor: 'border-orange-200', textColor: 'text-orange-600', valueColor: 'text-orange-700' },
      25: { id: 25, title: 'NET Week Bonus', value: stats.netWeekBonus || 0, withArrow: true, isPositive: (stats.netWeekBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netWeekBonus || 0).toFixed(2)), borderColor: (stats.netWeekBonus || 0) >= 0 ? 'border-cyan-200' : 'border-orange-200', textColor: (stats.netWeekBonus || 0) >= 0 ? 'text-cyan-600' : 'text-orange-600', valueColor: (stats.netWeekBonus || 0) >= 0 ? 'text-cyan-700' : 'text-orange-700' },
      // Monthly Bonus
      26: { id: 26, title: 'Monthly Bonus IN', value: formatIndianNumber((stats.monthBonusIn || 0).toFixed(2)), simple: true, borderColor: 'border-blue-200', textColor: 'text-blue-600', valueColor: 'text-blue-700' },
      27: { id: 27, title: 'Monthly Bonus OUT', value: formatIndianNumber((stats.monthBonusOut || 0).toFixed(2)), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      28: { id: 28, title: 'NET Monthly Bonus', value: stats.netMonthBonus || 0, withArrow: true, isPositive: (stats.netMonthBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netMonthBonus || 0).toFixed(2)), borderColor: (stats.netMonthBonus || 0) >= 0 ? 'border-blue-200' : 'border-red-200', textColor: (stats.netMonthBonus || 0) >= 0 ? 'text-blue-600' : 'text-red-600', valueColor: (stats.netMonthBonus || 0) >= 0 ? 'text-blue-700' : 'text-red-700' },
      // Lifetime Bonus
      29: { id: 29, title: 'Lifetime Bonus IN', value: formatIndianNumber((stats.lifetimeBonusIn || 0).toFixed(2)), simple: true, borderColor: 'border-purple-200', textColor: 'text-purple-600', valueColor: 'text-purple-700' },
      30: { id: 30, title: 'Lifetime Bonus OUT', value: formatIndianNumber((stats.lifetimeBonusOut || 0).toFixed(2)), simple: true, borderColor: 'border-pink-200', textColor: 'text-pink-600', valueColor: 'text-pink-700' },
      31: { id: 31, title: 'NET Lifetime Bonus', value: stats.netLifetimeBonus || 0, withArrow: true, isPositive: (stats.netLifetimeBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netLifetimeBonus || 0).toFixed(2)), borderColor: (stats.netLifetimeBonus || 0) >= 0 ? 'border-purple-200' : 'border-pink-200', textColor: (stats.netLifetimeBonus || 0) >= 0 ? 'text-purple-600' : 'text-pink-600', valueColor: (stats.netLifetimeBonus || 0) >= 0 ? 'text-purple-700' : 'text-pink-700' },
      // Weekly Deposit/Withdrawal
      32: { id: 32, title: 'Week Deposit', value: formatIndianNumber((stats.weekDeposit || 0).toFixed(2)), simple: true, borderColor: 'border-teal-200', textColor: 'text-teal-600', valueColor: 'text-teal-700' },
      33: { id: 33, title: 'Week Withdrawal', value: formatIndianNumber((stats.weekWithdrawal || 0).toFixed(2)), simple: true, borderColor: 'border-rose-200', textColor: 'text-rose-600', valueColor: 'text-rose-700' },
      34: { id: 34, title: 'NET Week DW', value: stats.netWeekDW || 0, withArrow: true, isPositive: (stats.netWeekDW || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netWeekDW || 0).toFixed(2)), borderColor: (stats.netWeekDW || 0) >= 0 ? 'border-teal-200' : 'border-rose-200', textColor: (stats.netWeekDW || 0) >= 0 ? 'text-teal-600' : 'text-rose-600', valueColor: (stats.netWeekDW || 0) >= 0 ? 'text-teal-700' : 'text-rose-700' },
      // Monthly Deposit/Withdrawal
      35: { id: 35, title: 'Monthly Deposit', value: formatIndianNumber((stats.monthDeposit || 0).toFixed(2)), simple: true, borderColor: 'border-indigo-200', textColor: 'text-indigo-600', valueColor: 'text-indigo-700' },
      36: { id: 36, title: 'Monthly Withdrawal', value: formatIndianNumber((stats.monthWithdrawal || 0).toFixed(2)), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      37: { id: 37, title: 'NET Monthly DW', value: stats.netMonthDW || 0, withArrow: true, isPositive: (stats.netMonthDW || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netMonthDW || 0).toFixed(2)), borderColor: (stats.netMonthDW || 0) >= 0 ? 'border-indigo-200' : 'border-red-200', textColor: (stats.netMonthDW || 0) >= 0 ? 'text-indigo-600' : 'text-red-600', valueColor: (stats.netMonthDW || 0) >= 0 ? 'text-indigo-700' : 'text-red-700' },
      // Lifetime Deposit/Withdrawal
      38: { id: 38, title: 'Lifetime Deposit', value: formatIndianNumber((stats.lifetimeDeposit || 0).toFixed(2)), simple: true, borderColor: 'border-green-200', textColor: 'text-green-600', valueColor: 'text-green-700' },
      39: { id: 39, title: 'Lifetime Withdrawal', value: formatIndianNumber((stats.lifetimeWithdrawal || 0).toFixed(2)), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      40: { id: 40, title: 'NET Lifetime DW', value: stats.netLifetimeDW || 0, withArrow: true, isPositive: (stats.netLifetimeDW || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netLifetimeDW || 0).toFixed(2)), borderColor: (stats.netLifetimeDW || 0) >= 0 ? 'border-green-200' : 'border-red-200', textColor: (stats.netLifetimeDW || 0) >= 0 ? 'text-green-600' : 'text-red-600', valueColor: (stats.netLifetimeDW || 0) >= 0 ? 'text-green-700' : 'text-red-700' },
      // Credit IN
      41: { id: 41, title: 'Weekly Credit IN', value: formatIndianNumber((stats.weekCreditIn || 0).toFixed(2)), simple: true, borderColor: 'border-sky-200', textColor: 'text-sky-600', valueColor: 'text-sky-700' },
      42: { id: 42, title: 'Monthly Credit IN', value: formatIndianNumber((stats.monthCreditIn || 0).toFixed(2)), simple: true, borderColor: 'border-blue-200', textColor: 'text-blue-600', valueColor: 'text-blue-700' },
      43: { id: 43, title: 'Lifetime Credit IN', value: formatIndianNumber((stats.lifetimeCreditIn || 0).toFixed(2)), simple: true, borderColor: 'border-indigo-200', textColor: 'text-indigo-600', valueColor: 'text-indigo-700' },
      // Credit OUT
      44: { id: 44, title: 'Weekly Credit OUT', value: formatIndianNumber((stats.weekCreditOut || 0).toFixed(2)), simple: true, borderColor: 'border-orange-200', textColor: 'text-orange-600', valueColor: 'text-orange-700' },
      45: { id: 45, title: 'Monthly Credit OUT', value: formatIndianNumber((stats.monthCreditOut || 0).toFixed(2)), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      46: { id: 46, title: 'Lifetime Credit OUT', value: formatIndianNumber((stats.lifetimeCreditOut || 0).toFixed(2)), simple: true, borderColor: 'border-rose-200', textColor: 'text-rose-600', valueColor: 'text-rose-700' },
      // NET Credit
      47: { id: 47, title: 'NET Credit', value: stats.netCredit || 0, withArrow: true, isPositive: (stats.netCredit || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netCredit || 0).toFixed(2)), borderColor: (stats.netCredit || 0) >= 0 ? 'border-green-200' : 'border-red-200', textColor: (stats.netCredit || 0) >= 0 ? 'text-green-600' : 'text-red-600', valueColor: (stats.netCredit || 0) >= 0 ? 'text-green-700' : 'text-red-700' },
      // Previous Equity
      48: { id: 48, title: 'Weekly Previous Equity', value: formatIndianNumber((stats.weekPreviousEquity || 0).toFixed(2)), simple: true, borderColor: 'border-violet-200', textColor: 'text-violet-600', valueColor: 'text-violet-700' },
      49: { id: 49, title: 'Monthly Previous Equity', value: formatIndianNumber((stats.monthPreviousEquity || 0).toFixed(2)), simple: true, borderColor: 'border-purple-200', textColor: 'text-purple-600', valueColor: 'text-purple-700' },
  50: { id: 50, title: 'Previous Equity', value: formatIndianNumber((stats.previousEquity || 0).toFixed(2)), simple: true, borderColor: 'border-fuchsia-200', textColor: 'text-fuchsia-600', valueColor: 'text-fuchsia-700' },
  // Book PnL (Lifetime PnL + Floating Profit)
  53: { id: 53, title: 'Book PnL', value: (stats.lifetimePnL || 0) + (stats.totalProfit || 0), withArrow: true, isPositive: ((stats.lifetimePnL || 0) + (stats.totalProfit || 0)) >= 0, formattedValue: formatIndianNumber(Math.abs((stats.lifetimePnL || 0) + (stats.totalProfit || 0)).toFixed(2)), borderColor: ((stats.lifetimePnL || 0) + (stats.totalProfit || 0)) >= 0 ? 'border-emerald-200' : 'border-rose-200', textColor: ((stats.lifetimePnL || 0) + (stats.totalProfit || 0)) >= 0 ? 'text-emerald-600' : 'text-rose-600', valueColor: ((stats.lifetimePnL || 0) + (stats.totalProfit || 0)) >= 0 ? 'text-emerald-700' : 'text-rose-700' },
  // Daily Deposit & Withdrawal % (sum of percentage columns)
  54: { id: 54, title: 'Daily Deposit %', value: stats.dailyDepositPercent || 0, simple: true, formattedValue: `${formatIndianNumber(Math.abs(stats.dailyDepositPercent || 0).toFixed(4))}`, borderColor: 'border-green-300', textColor: 'text-green-700', valueColor: 'text-green-800' },
  55: { id: 55, title: 'Daily Withdrawal %', value: stats.dailyWithdrawalPercent || 0, simple: true, formattedValue: `${formatIndianNumber(Math.abs(stats.dailyWithdrawalPercent || 0).toFixed(4))}`, borderColor: 'border-red-300', textColor: 'text-red-700', valueColor: 'text-red-800' },
      
      // Percentage variants for main metrics
      56: { id: 56, title: 'Total Balance %', value: stats.totalBalancePercent || 0, formattedValue: `${formatIndianNumber(Math.abs(stats.totalBalancePercent || 0).toFixed(4))}`, simple: true, borderColor: 'border-indigo-300', textColor: 'text-indigo-700' },
      57: { id: 57, title: 'Total Credit %', value: stats.totalCreditPercent || 0, formattedValue: `${formatIndianNumber(Math.abs(stats.totalCreditPercent || 0).toFixed(4))}`, simple: true, borderColor: 'border-emerald-300', textColor: 'text-emerald-700' },
      58: { id: 58, title: 'Total Equity %', value: stats.totalEquityPercent || 0, formattedValue: `${formatIndianNumber(Math.abs(stats.totalEquityPercent || 0).toFixed(4))}`, simple: true, borderColor: 'border-sky-300', textColor: 'text-sky-700' },
      59: { id: 59, title: 'PNL %', value: stats.totalPnlPercent || 0, withIcon: true, isPositive: (stats.totalPnlPercent || 0) >= 0, formattedValue: `${formatIndianNumber(Math.abs(stats.totalPnlPercent || 0).toFixed(4))}` },
      60: { id: 60, title: 'Floating Profit %', value: stats.totalProfitPercent || 0, withIcon: true, isPositive: (stats.totalProfitPercent || 0) >= 0, formattedValue: `${formatIndianNumber(Math.abs(stats.totalProfitPercent || 0).toFixed(4))}`, iconColor: (stats.totalProfitPercent || 0) >= 0 ? 'teal' : 'orange' },
      65: { id: 65, title: 'Book PnL %', value: (stats.lifetimePnLPercent || 0) + (stats.totalProfitPercent || 0), withArrow: true, isPositive: ((stats.lifetimePnLPercent || 0) + (stats.totalProfitPercent || 0)) >= 0, formattedValue: `${formatIndianNumber(Math.abs((stats.lifetimePnLPercent || 0) + (stats.totalProfitPercent || 0)).toFixed(4))}`, borderColor: ((stats.lifetimePnLPercent || 0) + (stats.totalProfitPercent || 0)) >= 0 ? 'border-emerald-300' : 'border-rose-300', textColor: ((stats.lifetimePnLPercent || 0) + (stats.totalProfitPercent || 0)) >= 0 ? 'text-emerald-700' : 'text-rose-700', valueColor: ((stats.lifetimePnLPercent || 0) + (stats.totalProfitPercent || 0)) >= 0 ? 'text-emerald-800' : 'text-rose-800' },
      // Net Lifetime PnL (Lifetime PnL - Total Rebate)
      66: { id: 66, title: 'Net Lifetime PnL', value: (stats.lifetimePnL || 0) - (stats.totalCommission || 0), withArrow: true, isPositive: ((stats.lifetimePnL || 0) - (stats.totalCommission || 0)) >= 0, formattedValue: formatIndianNumber(Math.abs((stats.lifetimePnL || 0) - (stats.totalCommission || 0)).toFixed(2)), borderColor: ((stats.lifetimePnL || 0) - (stats.totalCommission || 0)) >= 0 ? 'border-green-200' : 'border-red-200', textColor: ((stats.lifetimePnL || 0) - (stats.totalCommission || 0)) >= 0 ? 'text-green-600' : 'text-red-600', valueColor: ((stats.lifetimePnL || 0) - (stats.totalCommission || 0)) >= 0 ? 'text-green-700' : 'text-red-700' }
    }
    return configs[cardId]
  }

  // Removed USC scaling helper; backend normalizes percentages/amounts now

  // Per-column dynamic sums based on currently displayed (filtered & paginated) clients
  // (Removed columnTotals debug aggregation; not required now that totals footer is gone)

  // Face cards derive from ALL filtered data (ignores pagination and column visibility).
  // This ensures face cards always show global sums over the filtered dataset, and still show
  // metrics even if their columns are hidden in the table.
  // Memoized to ensure reactivity when filteredClients changes
  const faceCardTotals = useMemo(() => {
    console.log('🔄 [faceCardTotals] Recalculating...')
    try {
    // Always derive from the same list the table uses to prevent drift/flicker under load
    const list = Array.isArray(filteredClients) ? filteredClients : []

    // Enhanced robust numeric sum helper with deep value inspection
    const sum = (key) => list.reduce((acc, c) => {
      if (!c || typeof c !== 'object') return acc
      const v = c[key]
      // Handle null/undefined explicitly
      if (v == null) return acc
      // If already a finite number, use directly
      if (typeof v === 'number' && Number.isFinite(v)) return acc + v
      // Attempt string coercion with comma removal
      if (typeof v === 'string') {
        const cleaned = v.replace(/,/g, '').trim()
        if (cleaned === '' || cleaned === '-') return acc
        const n = Number(cleaned)
        return acc + (Number.isFinite(n) ? n : 0)
      }
      // Coerce other types
      const n = Number(v)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)

    // Lightweight numeric coercion helper for weighted percentage calculations
    const toNum = (v) => {
      if (v == null) return 0
      if (typeof v === 'number') return Number.isFinite(v) ? v : 0
      if (typeof v === 'string') {
        const cleaned = v.replace(/,/g, '').trim()
        if (cleaned === '' || cleaned === '-') return 0
        const n = Number(cleaned)
        return Number.isFinite(n) ? n : 0
      }
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }

    // Bonus calculations
    const dailyBonusIn = sum('dailyBonusIn')
    const dailyBonusOut = sum('dailyBonusOut')
    const weekBonusIn = sum('thisWeekBonusIn')
    const weekBonusOut = sum('thisWeekBonusOut')
    const monthBonusIn = sum('thisMonthBonusIn')
    const monthBonusOut = sum('thisMonthBonusOut')
    const lifetimeBonusIn = sum('lifetimeBonusIn')
    const lifetimeBonusOut = sum('lifetimeBonusOut')

    // Deposit/Withdrawal calculations
    const weekDeposit = sum('thisWeekDeposit')
    const weekWithdrawal = sum('thisWeekWithdrawal')
    const monthDeposit = sum('thisMonthDeposit')
    const monthWithdrawal = sum('thisMonthWithdrawal')
    const lifetimeDeposit = sum('lifetimeDeposit')
    const lifetimeWithdrawal = sum('lifetimeWithdrawal')

    // Credit IN/OUT calculations
    const weekCreditIn = sum('thisWeekCreditIn')
    const monthCreditIn = sum('thisMonthCreditIn')
    const lifetimeCreditIn = sum('lifetimeCreditIn')
    const weekCreditOut = sum('thisWeekCreditOut')
    const monthCreditOut = sum('thisMonthCreditOut')
    const lifetimeCreditOut = sum('lifetimeCreditOut')

    // Previous Equity calculations
    const weekPreviousEquity = sum('thisWeekPreviousEquity')
    const monthPreviousEquity = sum('thisMonthPreviousEquity')
    const previousEquity = sum('previousEquity')

    // Derived totals
    const depositTotal = sum('dailyDeposit')
    const withdrawalTotal = sum('dailyWithdrawal')
    const dwTotalAbs = Math.abs(Number(depositTotal) || 0) + Math.abs(Number(withdrawalTotal) || 0)
    const dailyDepositSharePercent = dwTotalAbs > 0 ? (Math.abs(depositTotal) / dwTotalAbs) * 100 : 0
    const dailyWithdrawalSharePercent = dwTotalAbs > 0 ? (Math.abs(withdrawalTotal) / dwTotalAbs) * 100 : 0

    const totalPnl = list.reduce((acc, c) => {
      const pnlField = Number(c?.pnl)
      if (Number.isFinite(pnlField)) return acc + pnlField
      const credit = Number(c?.credit)
      const equity = Number(c?.equity)
      const fallback = (Number.isFinite(credit) ? credit : 0) - (Number.isFinite(equity) ? equity : 0)
      return acc + fallback
    }, 0)

    const totals = {
      totalClients: list.length,
      totalBalance: sum('balance'),
      totalCredit: sum('credit'),
      totalEquity: sum('equity'),
      totalPnl,
      totalProfit: sum('profit'),
      dailyDeposit: depositTotal,
      dailyWithdrawal: withdrawalTotal,
      dailyDepositSharePercent,
      dailyWithdrawalSharePercent,
      dailyDepositPercent: list.reduce((acc, c) => acc + (c?.dailyDeposit_percentage || 0), 0),
      dailyWithdrawalPercent: list.reduce((acc, c) => acc + (c?.dailyWithdrawal_percentage || 0), 0),
      dailyPnL: sum('dailyPnL'),
      thisWeekPnL: sum('thisWeekPnL'),
      thisMonthPnL: sum('thisMonthPnL'),
      lifetimePnL: sum('lifetimePnL'),
      // Commission metrics: amounts from API, percentage cards from column sums
      totalCommission: commissionTotals?.total_commission || 0,
      availableCommission: commissionTotals?.total_available_commission || 0,
      totalCommissionPercent: commissionTotals?.total_commission_percentage || 0,
      availableCommissionPercent: commissionTotals?.total_available_commission_percentage || 0,
      blockedCommission: sum('blockedCommission'),
      // Bonus metrics
      dailyBonusIn,
      dailyBonusOut,
      netDailyBonus: dailyBonusIn - dailyBonusOut,
      weekBonusIn,
      weekBonusOut,
      netWeekBonus: weekBonusIn - weekBonusOut,
      monthBonusIn,
      monthBonusOut,
      netMonthBonus: monthBonusIn - monthBonusOut,
      lifetimeBonusIn,
      lifetimeBonusOut,
      netLifetimeBonus: lifetimeBonusIn - lifetimeBonusOut,
      // Deposit/Withdrawal metrics
      weekDeposit,
      weekWithdrawal,
      netWeekDW: weekDeposit - weekWithdrawal,
      monthDeposit,
      monthWithdrawal,
      netMonthDW: monthDeposit - monthWithdrawal,
      lifetimeDeposit,
      lifetimeWithdrawal,
      netLifetimeDW: lifetimeDeposit - lifetimeWithdrawal,
      // Credit IN/OUT metrics
      weekCreditIn,
      monthCreditIn,
      lifetimeCreditIn,
      weekCreditOut,
      monthCreditOut,
      lifetimeCreditOut,
      netCredit: lifetimeCreditIn - lifetimeCreditOut,
      // Previous Equity metrics
      weekPreviousEquity,
      monthPreviousEquity,
      previousEquity,
      // Percentage values (raw sums for consistency across all percentage cards)
      totalBalancePercent: sum('balance_percentage'),
      totalCreditPercent: sum('credit_percentage'),
      totalEquityPercent: sum('equity_percentage'),
      totalPnlPercent: sum('pnl_percentage'),
      totalProfitPercent: sum('profit_percentage'),
      // Lifetime: keep existing backend lifetime percentage sum behavior
      lifetimePnLPercent: sum('lifetimePnL_percentage')
    }
    
    return totals
    } catch (error) {
      console.error('[ClientsPage] ❌ Error calculating face card totals:', error)
      return {
        totalClients: 0,
        totalBalance: 0,
        totalCredit: 0,
        totalEquity: 0,
        totalPnl: 0,
        totalProfit: 0,
        lifetimePnLPercent: 0
      }
    }
  }, [filteredClients, commissionTotals, filteredClientsChecksum])



  // Removed totals helpers (no longer needed)

  

  const formatValue = (key, value, client = null) => {
    if (value === null || value === undefined || value === '') {
      // Handle PNL calculation fallback
      if (key === 'pnl' && client) {
        const pnlVal = client.pnl
        if (pnlVal != null && typeof pnlVal === 'number' && Number.isFinite(pnlVal)) {
          return formatIndianNumber(pnlVal.toFixed(2))
        }
        // Fallback: credit - equity
        const credit = Number(client.credit) || 0
        const equity = Number(client.equity) || 0
        const pnl = credit - equity
        return formatIndianNumber(pnl.toFixed(2))
      }
      return '-'
    }
    
    // Handle Processor Type (boolean) - display as Connected/Not Connected (text)
    if (key === 'processorType' || key === 'processor_type' || key === 'PROCESSOR_TYPE') {
      if (typeof value === 'boolean') {
        return value ? 'Connected' : 'Not Connected'
      }
      // Handle other value types
      return String(value)
    }
    
  // Numeric currency fields
    if (['balance', 'credit', 'equity', 'margin', 'marginFree', 'profit', 'floating', 'pnl', 'assets', 'liabilities', 
         'blockedCommission', 'blockedProfit', 'storage', 'marginInitial', 'marginMaintenance', 
         'soEquity', 'soMargin'].includes(key)) {
      // For PNL, use existing field or fallback to credit - equity
      if (key === 'pnl' && client) {
        const pnlVal = client.pnl
        if (pnlVal != null && typeof pnlVal === 'number' && Number.isFinite(pnlVal)) {
          return formatIndianNumber(pnlVal.toFixed(2))
        }
        // Fallback calculation
        const credit = Number(client.credit) || 0
        const equity = Number(client.equity) || 0
        const pnl = credit - equity
        return formatIndianNumber(pnl.toFixed(2))
      }
      // Ensure value is a clean number
      let num = value
      if (typeof value === 'string') {
        num = Number(value.replace(/,/g, '').trim())
      } else {
        num = Number(value)
      }
      if (!Number.isFinite(num)) return '-'
      return formatIndianNumber(num.toFixed(2))
    }

    // PnL buckets (table display should preserve sign)
    if (['dailyPnL', 'thisWeekPnL', 'thisMonthPnL', 'lifetimePnL'].includes(key)) {
      const num = parseFloat(value || 0)
      const formatted = formatIndianNumber(num.toFixed(2))
      return formatted
    }
    
    // Percentage fields
    if (key === 'marginLevel' || key === 'applied_percentage' || key === 'soLevel') {
      return value != null && value !== '' ? `${parseFloat(value).toFixed(2)}%` : '-'
    }
    
    // Other percentage fields (balance, credit, equity, pnl, profit, etc.)
    if (key.includes('_percentage') || key.includes('Percentage')) {
      if (value == null || value === '') return '-'
      const num = parseFloat(value)
      if (!Number.isFinite(num)) return '-'
      return `${num.toFixed(4)}%`
    }
    
    // Integer fields
    if (['leverage', 'marginLeverage', 'agent', 'clientID', 'soActivation', 'soTime', 
         'currencyDigits', 'rightsMask', 'language'].includes(key)) {
      const formatted = formatIndianNumber(parseInt(value))
      return formatted
    }
    
    // Boolean fields
    if (key === 'applied_percentage_is_custom') {
      return value ? 'Yes' : 'No'
    }
    
    // Date/timestamp fields (Unix timestamps in seconds)
    if (['registration', 'lastAccess', 'lastUpdate', 'accountLastUpdate', 'userLastUpdate'].includes(key)) {
      return new Date(value * 1000).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
    
    // Array fields (rights)
    if (key === 'rights' && Array.isArray(value)) {
      return value.join(', ')
    }
    
    return value
  }

  // Track face card value trends to color values based on movement over time
  const lastValuesRef = useRef({})
  const lastTrendRef = useRef({}) // 'inc' | 'dec' | 'flat'
  const lastChangeRef = useRef({})
  const STABLE_THRESHOLD_MS = 60000 // 60s without change -> treat as stable/black

  // Removed full-page loading spinner to prevent page reload effect on refresh
  // Data updates will happen in place for better UX

  // Unified layout: no early return. Mobile handled inside main render.
  const renderMobile = isMobile

  // Early return for mobile - render only mobile component like /client-dashboard-c
  if (renderMobile) {
    return (
      <div className="w-full min-h-screen bg-neutral-900/5">
        <ClientDashboardDesignC />
        {selectedClient && (
          <ClientPositionsModal
            client={selectedClient}
            onClose={() => setSelectedClient(null)}
            allPositionsCache={cachedPositions}
            allOrdersCache={cachedOrders}
          />
        )}
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* Clean White Background */}
      <div className="absolute inset-0 bg-white"></div>
      
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
      
      <main className={`flex-1 p-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} overflow-auto relative z-10`}>
        <div className="max-w-full mx-auto flex flex-col min-h-0">

          {/* Desktop header */}
          <div className="bg-white rounded-2xl shadow-sm px-6 py-3 mb-6">
            {/* Title */}
            <div className="mb-2.5 pb-2.5 border-b border-gray-200">
              <h1 className="text-xl font-bold text-[#1A1A1A]">Clients</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">Manage and view all client accounts</p>
              {/* Timestamp Info */}
              <div className="mt-2 flex items-center gap-4 text-[10px] font-mono">
                <div className="flex items-center gap-1" title="Current system time">
                  <span className="text-gray-500 font-semibold">System:</span>
                  <span className="text-blue-600 font-bold">{Math.floor(systemTime / 1000)}</span>
                </div>
                {appTime && (
                  <>
                    <div className="flex items-center gap-1" title="Latest WebSocket event timestamp from server">
                      <span className="text-gray-500 font-semibold">Event:</span>
                      <span className="text-purple-600 font-bold">{Math.floor(appTime / 1000)}</span>
                    </div>
                    <div className="flex items-center gap-1" title="Processing lag (difference between now and latest server event)">
                      <span className="text-gray-500 font-semibold">Lag:</span>
                      <span className={`font-bold ${
                        latestMeasuredLagMs != null && latestMeasuredLagMs <= 2000
                          ? 'text-green-600'
                          : latestMeasuredLagMs != null && latestMeasuredLagMs <= 5000
                            ? 'text-orange-500'
                            : 'text-red-600'
                      }`}>
                        {latestMeasuredLagMs != null ? `${Math.round(latestMeasuredLagMs/1000)}s` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1" title="UI render latency since last WS message (median/max)">
                      <span className="text-gray-500 font-semibold">UI:</span>
                      <span className={`font-bold ${
                        latencyStats.median != null && latencyStats.median <= 5000 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {latencyStats.median != null ? `${latencyStats.median}ms` : '-'}
                      </span>
                      <span className="text-gray-500">/</span>
                      <span className={`font-bold ${
                        latencyStats.max != null && latencyStats.max <= 5000 ? 'text-gray-700' : 'text-red-600'
                      }`}>
                        {latencyStats.max != null ? `${latencyStats.max}ms` : '-'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden text-gray-700 hover:text-gray-900 p-2.5 rounded-lg hover:bg-gray-100 border border-gray-300 transition-all"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <WebSocketIndicator />
              
              {/* Filter Button */}
              <div className="relative">
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className="h-8 px-2.5 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                  title="Filter Options"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6H12M5.5 9H10.5M7 12H9" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span className="text-xs font-medium text-[#374151]">Filter</span>
                  {(filterByPositions || filterByCredit || filterNoDeposit) && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold h-4 min-w-4 px-1 leading-none">
                      {(filterByPositions ? 1 : 0) + (filterByCredit ? 1 : 0) + (filterNoDeposit ? 1 : 0)}
                    </span>
                  )}
                </button>
                {showFilterMenu && (
                  <div
                    ref={filterMenuRef}
                    className="absolute left-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-[#E5E7EB] z-50"
                  >
                    <div className="p-4">
                      <div className="text-sm font-semibold text-[#1F2937] mb-3">Quick Filters</div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-md transition-all">
                          <input
                            type="checkbox"
                            checked={filterByPositions}
                            onChange={(e) => setFilterByPositions(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-[#374151]">Has Floating</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-md transition-all">
                          <input
                            type="checkbox"
                            checked={filterByCredit}
                            onChange={(e) => setFilterByCredit(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-[#374151]">Has Credit</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-md transition-all">
                          <input
                            type="checkbox"
                            checked={filterNoDeposit}
                            onChange={(e) => setFilterNoDeposit(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-[#374151]">No Deposit</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Filter Button */}
              <div className="relative">
                <button
                  onClick={() => setShowCardFilterMenu(!showCardFilterMenu)}
                  className="h-8 px-2.5 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="5" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                    <rect x="9" y="3" width="5" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                  </svg>
                  <span className="text-xs font-medium text-[#374151]">Card Filter</span>
                </button>
                {showCardFilterMenu && (
                  <div
                    ref={cardFilterMenuRef}
                    className="absolute right-0 top-full mt-2 bg-pink-50 rounded-lg shadow-xl border-2 border-pink-200 py-2 z-50 w-56"
                    style={{ maxHeight: '400px', overflowY: 'auto' }}
                  >
                    <div className="px-3 py-2 border-b border-pink-200">
                      <p className="text-[10px] font-bold text-pink-700 uppercase tracking-wide">Show/Hide Cards</p>
                    </div>
                    <div className="px-3 py-2 border-b border-pink-200">
                      <input
                        type="text"
                        placeholder="Search cards..."
                        value={cardFilterSearchQuery}
                        onChange={(e) => setCardFilterSearchQuery(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs text-gray-700 border border-pink-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent placeholder:text-gray-400"
                      />
                    </div>
                    {(() => {
                      // All available face card options (values and percentage variants)
                      const allCardOptions = [ 
                      { id: 1, label: 'Total Clients' },
                      { id: 2, label: 'Total Balance' },
                      { id: 3, label: 'Total Credit' },
                      { id: 4, label: 'Total Equity' },
                      { id: 5, label: 'PNL' },
                      { id: 6, label: 'Floating Profit' },
                      { id: 8, label: 'Daily Deposit' },
                      { id: 9, label: 'Daily Withdrawal' },
                      { id: 54, label: 'Daily Deposit %' },
                      { id: 55, label: 'Daily Withdrawal %' },
                      { id: 14, label: 'Daily Net D/W' },
                      { id: 10, label: 'Daily PnL' },
                      { id: 11, label: 'This Week PnL' },
                      { id: 12, label: 'This Month PnL' },
                      { id: 13, label: 'Lifetime PnL' },
                      { id: 15, label: 'Total Rebate' },
                      { id: 16, label: 'Available Rebate' },
                      { id: 17, label: 'Total Rebate %' },
                      { id: 18, label: 'Available Rebate %' },
                      { id: 19, label: 'Blocked Rebate' },
                      { id: 20, label: 'Daily Bonus IN' },
                      { id: 21, label: 'Daily Bonus OUT' },
                      { id: 22, label: 'NET Daily Bonus' },
                      { id: 23, label: 'Week Bonus IN' },
                      { id: 24, label: 'Week Bonus OUT' },
                      { id: 25, label: 'NET Week Bonus' },
                      { id: 26, label: 'Monthly Bonus IN' },
                      { id: 27, label: 'Monthly Bonus OUT' },
                      { id: 28, label: 'NET Monthly Bonus' },
                      { id: 29, label: 'Lifetime Bonus IN' },
                      { id: 30, label: 'Lifetime Bonus OUT' },
                      { id: 31, label: 'NET Lifetime Bonus' },
                      { id: 32, label: 'Week Deposit' },
                      { id: 33, label: 'Week Withdrawal' },
                      { id: 34, label: 'NET Week DW' },
                      { id: 35, label: 'Monthly Deposit' },
                      { id: 36, label: 'Monthly Withdrawal' },
                      { id: 37, label: 'NET Monthly DW' },
                      { id: 38, label: 'Lifetime Deposit' },
                      { id: 39, label: 'Lifetime Withdrawal' },
                      { id: 40, label: 'NET Lifetime DW' },
                      { id: 41, label: 'Weekly Credit IN' },
                      { id: 42, label: 'Monthly Credit IN' },
                      { id: 43, label: 'Lifetime Credit IN' },
                      { id: 44, label: 'Weekly Credit OUT' },
                      { id: 45, label: 'Monthly Credit OUT' },
                      { id: 46, label: 'Lifetime Credit OUT' },
                      { id: 47, label: 'NET Credit' },
                      { id: 48, label: 'Weekly Previous Equity' },
                      { id: 49, label: 'Monthly Previous Equity' },
                      { id: 50, label: 'Previous Equity' },
                      { id: 53, label: 'Book PnL' },
                      { id: 56, label: 'Total Balance %' },
                      { id: 57, label: 'Total Credit %' },
                      { id: 58, label: 'Total Equity %' },
                      { id: 59, label: 'PNL %' },
                      { id: 60, label: 'Floating Profit %' },
                      { id: 65, label: 'Book PnL %' },
                      { id: 66, label: 'Net Lifetime PnL' }
                      ]

                      // Filter by search text
                      .filter(card => card.label.toLowerCase().includes(cardFilterSearchQuery.toLowerCase()))

                      // Filter by display mode
                      .filter(card => {
                        const isPercent = card.label.includes('%')
                        // Show all fields in percentage and both modes; filter only in value mode
                        if (displayMode === 'value') return !isPercent
                        return true
                      })

                      // Render each option with robust toggle
                      .map(card => (
                        <label
                          key={`${card.id}-${card.value}`}
                          className="flex items-center px-3 py-2 hover:bg-pink-100 cursor-pointer transition-colors rounded-md mx-2"
                        >
                          <input
                            type="checkbox"
                            checked={cardVisibility[card.id] !== false}
                            onChange={() => {
                              // Toggle visibility explicitly between true/false
                              setCardVisibility(prev => ({
                                ...prev,
                                [card.id]: prev[card.id] === false ? true : false
                              }))
                              // Ensure the card exists in the face card order when turned on
                              setFaceCardOrder(prev => {
                                if (prev.includes(card.id)) return prev
                                const updated = [...prev, card.id]
                                try { localStorage.setItem('clientsFaceCardOrder', JSON.stringify(updated)) } catch {}
                                return updated
                              })
                            }}
                            className="w-3.5 h-3.5 text-pink-600 border-gray-300 rounded focus:ring-pink-500 focus:ring-1"
                          />
                          <span className="ml-2 text-xs font-semibold text-gray-700">{card.label}</span>
                        </label>
                      ))
                      
                      return allCardOptions
                    })()}
                  </div>
                )}
              </div>

              {/* Groups Button */}
              <GroupSelector 
                moduleName="clients" 
                onCreateClick={() => {
                  setEditingGroup(null)
                  setShowGroupModal(true)
                }}
                onEditClick={(group) => {
                  setEditingGroup(group)
                  setShowGroupModal(true)
                }}
              />
              
              {/* Show Face Cards Toggle (moved before Columns button) */}
              {/* Show Face Cards Toggle (moved before Columns button) */}
              <button
                onClick={() => setShowFaceCards(!showFaceCards)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#E5E7EB] transition-all shadow-sm text-sm font-semibold h-9 bg-white hover:bg-gray-50"
                title={showFaceCards ? "Hide cards" : "Show cards"}
              >
                <span className="text-gray-700">Cards</span>
                <div className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors p-0.5 ${
                  showFaceCards ? 'bg-blue-600' : 'bg-gray-400'
                }`}>
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      showFaceCards ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </button>
              
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className={`p-2 rounded-lg border border-[#E5E7EB] hover:bg-gray-50 bg-white transition-all shadow-sm h-9 w-9 flex items-center justify-center ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Refresh clients data"
              >
                <svg className={`w-4 h-4 text-gray-700 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* Excel Export with Dropdown */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="p-2 rounded-lg border border-[#E5E7EB] hover:bg-gray-50 bg-white transition-all shadow-sm h-9 w-9 flex items-center justify-center"
                  title="Download as Excel (CSV)"
                >
                  <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 18h16" />
                  </svg>
                </button>

                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border-2 border-green-300 z-50 overflow-hidden">
                    <div className="py-1">
                      <button
                        onClick={() => handleExportToExcel('table')}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Table Columns
                      </button>
                      <button
                        onClick={() => handleExportToExcel('all')}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors flex items-center gap-2 border-t border-gray-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                        All Columns
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Removed drift diagnostics panel per user request */}

          {error && (
            <div className="mb-3 bg-red-50 border-l-4 border-red-500 rounded-r p-3 shadow-sm">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Stats Summary - Hidden on mobile */}
          {showFaceCards && (
          <>
            {/* Drag and Drop Instructions */}
            <div className="flex items-center justify-between mb-2 px-2">
              <div className="flex items-center gap-2 text-gray-600 text-xs">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>Drag cards to reorder</span>
              </div>
              <button
                onClick={resetFaceCardOrder}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
              >
                Reset Order
              </button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-[8px] mb-4 md:mb-6">
            {displayMode === 'value' && (
              <>
                {faceCardOrder.map((cardId) => {
                  // Map percentage card IDs to their normal equivalents when in value mode
                  let effectiveCardId = cardId
                  const percentToNormalMap = {
                    56: 2, // Total Balance % -> Total Balance
                    57: 3, // Total Credit % -> Total Credit
                    58: 4, // Total Equity % -> Total Equity
                    59: 5, // PNL % -> PNL
                    60: 6, // Floating Profit % -> Floating Profit
                    64: 13, // Lifetime PnL % -> Lifetime PnL
                    65: 53, // Book PnL % -> Book PnL
                    17: 15, // Total Rebate % -> Total Rebate
                    18: 16, // Available Rebate % -> Available Rebate
                    54: 8, // Daily Deposit % -> Daily Deposit
                    55: 9  // Daily Withdrawal % -> Daily Withdrawal
                  }
                  // If a percentage variant is present alongside its normal counterpart in the order,
                  // skip rendering the percentage one to avoid duplicate keys in value mode
                  if (percentToNormalMap[cardId] && faceCardOrder.includes(percentToNormalMap[cardId])) {
                    return null
                  }
                  if (percentToNormalMap[cardId]) {
                    effectiveCardId = percentToNormalMap[cardId]
                  }
                  
                  const card = getFaceCardConfig(effectiveCardId, faceCardTotals)
                  
                  if (!card || cardVisibility[cardId] === false) return null
                  
                  // Determine color based on value: green (>0), red (<0), black (=0)
                  const numericValue = Number(card.numericValue) || 0
                  const valueColor = numericValue > 0 ? 'text-[#16A34A]' : numericValue < 0 ? 'text-[#DC2626]' : 'text-[#000000]'
                  
                  return (
                    <div
                      key={`${card.id}-${card.value}`}
                      draggable
                      onDragStart={(e) => handleFaceCardDragStart(e, card.id)}
                      onDragEnd={handleFaceCardDragEnd}
                      onDragOver={handleFaceCardDragOver}
                      onDrop={(e) => handleFaceCardDrop(e, card.id)}
                      className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-3 md:p-3 md:hover:shadow-md md:transition-all md:duration-200 select-none w-full relative min-h-[64px]"
                    >
                      <div className="h-full flex flex-col justify-center">
                        <div className="flex items-start justify-between">
                          <span className="text-[#4B4B4B] text-[10px] font-semibold leading-[13px] pr-1 uppercase">{card.title}</span>
                          <div className="w-[16px] h-[16px] rounded-[3px] flex items-center justify-center flex-shrink-0">
                            <img 
                              src={getCardIcon(card.title)} 
                              alt={card.title}
                              style={{ width: '16px', height: '16px' }}
                              onError={(e) => {
                                e.target.style.display = 'none'
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-[4px] mt-2">
                        {card.numericValue > 0 && (
                          <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                            <polygon points="4,0 8,8 0,8" fill="#16A34A"/>
                          </svg>
                        )}
                        {card.numericValue < 0 && (
                          <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                            <polygon points="4,8 0,0 8,0" fill="#DC2626"/>
                          </svg>
                        )}
                        {card.numericValue === 0 && (
                          <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                            <polygon points="4,0 8,8 0,8" fill="#000000"/>
                          </svg>
                        )}
                        <span className={`text-[14px] font-bold leading-[13px] tracking-[-0.01em] ${valueColor}`}>
                          {card.formattedValue != null ? card.formattedValue : (card.value === '' || card.value === undefined ? '0.00' : card.value)}
                        </span>
                        {card.unit && <span className="text-[#4B4B4B] text-[7px] font-normal leading-[9px] uppercase">{card.unit}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
            {displayMode === 'percentage' && (
              <>
                {faceCardOrder.map((cardId) => {
                  // If the current card is a percentage variant and its normal counterpart
                  // also exists in the order, skip this entry to avoid duplicate rendering
                  const percentToNormalMapForSkip = {
                    56: 2, 57: 3, 58: 4, 59: 5, 60: 6, 64: 13, 65: 53,
                    17: 15, 18: 16, 54: 8, 55: 9
                  }
                  if (percentToNormalMapForSkip[cardId] && faceCardOrder.includes(percentToNormalMapForSkip[cardId])) {
                    return null
                  }
                  // Map normal card IDs to their percentage equivalents when in percentage mode
                  let effectiveCardId = cardId
                  const normalToPercentMap = {
                    2: 56, // Total Balance -> Total Balance %
                    3: 57, // Total Credit -> Total Credit %
                    4: 58, // Total Equity -> Total Equity %
                    5: 59, // PNL -> PNL %
                    6: 60, // Floating Profit -> Floating Profit %
                    53: 65, // Book PnL -> Book PnL %
                    15: 17, // Total Rebate -> Total Rebate %
                    16: 18, // Available Rebate -> Available Rebate %
                    8: 54, // Daily Deposit -> Daily Deposit %
                    9: 55  // Daily Withdrawal -> Daily Withdrawal %
                  }
                  
                  // List of percentage card IDs that exist
                  const percentageCardIds = [56, 57, 58, 59, 60, 65, 17, 18, 54, 55]
                  
                  // In percentage mode, only show cards that have percentage equivalents or are already percentage cards
                  if (normalToPercentMap[cardId]) {
                    effectiveCardId = normalToPercentMap[cardId]
                  } else if (!percentageCardIds.includes(cardId)) {
                    // Skip cards that don't have percentage equivalents
                    return null
                  }
                  
                  const card = getFaceCardConfig(effectiveCardId, faceCardTotals)
                  
                  if (!card || cardVisibility[cardId] === false) return null
                  
                  // Determine color based on value: green (>0), red (<0), black (=0)
                  const numericValue = Number(card.numericValue) || 0
                  const valueColor = numericValue > 0 ? 'text-[#16A34A]' : numericValue < 0 ? 'text-[#DC2626]' : 'text-[#000000]'
                  
                  return (
                    <div
                      key={`${card.id}-${card.value}`}
                      draggable
                      onDragStart={(e) => handleFaceCardDragStart(e, card.id)}
                      onDragEnd={handleFaceCardDragEnd}
                      onDragOver={handleFaceCardDragOver}
                      onDrop={(e) => handleFaceCardDrop(e, card.id)}
                      className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-3 md:p-3 md:hover:shadow-md md:transition-all md:duration-200 select-none w-full relative min-h-[64px]"
                    >
                      <div className="h-full flex flex-col justify-center">
                        <div className="flex items-start justify-between">
                          <span className="text-[#4B4B4B] text-[10px] font-semibold leading-[13px] pr-1 uppercase">{card.title}</span>
                          <div className="w-[16px] h-[16px] rounded-[3px] flex items-center justify-center flex-shrink-0">
                            <img 
                              src={getCardIcon(card.title)} 
                              alt={card.title}
                              style={{ width: '16px', height: '16px' }}
                              onError={(e) => {
                                e.target.style.display = 'none'
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-[4px] mt-2">
                        {card.numericValue > 0 && (
                          <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                            <polygon points="4,0 8,8 0,8" fill="#16A34A"/>
                          </svg>
                        )}
                        {card.numericValue < 0 && (
                          <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                            <polygon points="4,8 0,0 8,0" fill="#DC2626"/>
                          </svg>
                        )}
                        {card.numericValue === 0 && (
                          <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                            <polygon points="4,0 8,8 0,8" fill="#000000"/>
                          </svg>
                        )}
                        <span className={`text-[14px] font-bold leading-[13px] tracking-[-0.01em] ${valueColor}`}>
                          {card.formattedValue != null ? card.formattedValue : (card.value === '' || card.value === undefined ? '0.00' : card.value)}
                        </span>
                        {card.unit && <span className="text-[#4B4B4B] text-[7px] font-normal leading-[9px] uppercase">{card.unit}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
            {displayMode === 'both' && (
              <>
                {faceCardOrder.map((cardId) => {
                  // Skip percentage variant cards - they'll be shown with their normal counterparts
                  const percentCardIds = [56, 57, 58, 59, 60, 61, 62, 63, 65, 17, 18, 54, 55]
                  if (percentCardIds.includes(cardId)) {
                    return null
                  }
                  
                  // In both mode, show both normal and percentage cards side by side
                  const cards = []
                  
                  // Add the normal card
                  const normalCard = getFaceCardConfig(cardId, faceCardTotals)
                  if (normalCard && cardVisibility[cardId] !== false) {
                    cards.push({ ...normalCard, renderKey: `${cardId}-normal` })
                  }
                  
                  // Check if this card has a percentage variant
                  const normalToPercentMap = {
                    2: 56, 3: 57, 4: 58, 5: 59, 6: 60, 10: 61, 11: 62, 12: 63, 53: 65,
                    66: 67, 15: 17, 16: 18, 8: 54, 9: 55
                  }
                  const percentCardId = normalToPercentMap[cardId]
                  if (percentCardId) {
                    const percentCard = getFaceCardConfig(percentCardId, faceCardTotals)
                    if (percentCard && cardVisibility[cardId] !== false) {
                      cards.push({ ...percentCard, renderKey: `${cardId}-percent` })
                    }
                  }
                  
                  return cards.map(card => {
                    // Render compact Client2-style card with trend-based value color
                    const prev = lastValuesRef.current[card.id]
                    let trend = lastTrendRef.current[card.id] || 'flat'
                    let lastChange = lastChangeRef.current[card.id] || Date.now()
                    if (prev === undefined || card.numericValue !== prev) {
                      if (prev !== undefined) {
                        trend = card.numericValue > prev ? 'inc' : card.numericValue < prev ? 'dec' : trend
                      }
                      lastValuesRef.current[card.id] = card.numericValue
                      lastTrendRef.current[card.id] = trend
                      lastChangeRef.current[card.id] = Date.now()
                      lastChange = lastChangeRef.current[card.id]
                    }
                    const age = Date.now() - lastChange
                    const isStable = prev !== undefined && card.numericValue === prev && age >= STABLE_THRESHOLD_MS
                    const isPositive = card.numericValue > 0
                    const isNegative = card.numericValue < 0
                    const arrowColor = isPositive ? '#16A34A' : isNegative ? '#DC2626' : '#000000'
                    const valueColor = isStable ? 'text-[#000000]' : (trend === 'inc' ? 'text-[#16A34A]' : trend === 'dec' ? 'text-[#DC2626]' : 'text-[#000000]')
                    
                    return (
                      <div
                        key={card.renderKey}
                        draggable
                        onDragStart={(e) => handleFaceCardDragStart(e, cardId)}
                        onDragEnd={handleFaceCardDragEnd}
                        onDragOver={handleFaceCardDragOver}
                        onDrop={(e) => handleFaceCardDrop(e, cardId)}
                        className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-3 md:p-3 md:hover:shadow-md md:transition-all md:duration-200 select-none w-full relative min-h-[64px]"
                      >
                        <div className="h-full flex flex-col justify-center">
                          <div className="flex items-start justify-between">
                            <span className="text-[#4B4B4B] text-[10px] font-semibold leading-[13px] pr-1 uppercase">{card.title}</span>
                            <div className="w-[16px] h-[16px] rounded-[3px] flex items-center justify-center flex-shrink-0">
                              <img 
                                src={getCardIcon(card.title)} 
                                alt={card.title}
                                style={{ width: '16px', height: '16px' }}
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                }}
                              />
                            </div>
                          </div>
                          <div className="flex items-baseline gap-[4px] mt-2">
                          {card.numericValue > 0 && (
                            <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                              <polygon points="4,0 8,8 0,8" fill="#16A34A"/>
                            </svg>
                          )}
                          {card.numericValue < 0 && (
                            <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                              <polygon points="4,8 0,0 8,0" fill="#DC2626"/>
                            </svg>
                          )}
                          {card.numericValue === 0 && (
                            <svg width="8" height="8" viewBox="0 0 8 8" className="flex-shrink-0 mt-[2px]">
                              <polygon points="4,0 8,8 0,8" fill="#000000"/>
                            </svg>
                          )}
                          <span className={`text-[14px] font-bold leading-[13px] tracking-[-0.01em] ${valueColor}`}>
                            {card.formattedValue != null ? card.formattedValue : (card.value === '' || card.value === undefined ? '0.00' : card.value)}
                          </span>
                          {card.unit && <span className="text-[#4B4B4B] text-[7px] font-normal leading-[9px] uppercase">{card.unit}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })
                })}
              </>
            )}
          </div>
          </>
          )}

          {(
          <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white rounded-lg shadow-md border border-gray-200 p-3">
            {/* Left Side: Search Bar + Columns Button */}
            <div className="flex items-center gap-2">
              {/* Search Bar */}
              <div className="relative" ref={searchRef}>
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => {
                      const value = e.target.value
                      setSearchInput(value)
                      setSearchQuery(value)
                      setShowSuggestions(true)
                      setCurrentPage(1)
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setShowSuggestions(false) }}
                    placeholder="Search login, name, email..."
                    className="pl-10 pr-9 py-2 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-700 placeholder:text-slate-400 hover:border-slate-400 hover:shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 w-64 transition-all"
                  />
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {searchInput && (
                    <button
                      onClick={() => { setSearchInput(''); setSearchQuery(''); setShowSuggestions(false) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors p-0.5 rounded hover:bg-slate-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {showSuggestions && getSuggestions(filteredClients).length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50 max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Search Results</p>
                    </div>
                    <div className="py-1">
                      {getSuggestions(filteredClients).map((client, idx) => (
                        <button 
                          key={idx}
                          onClick={() => handleSuggestionClick(client)} 
                          className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors border-l-2 border-transparent hover:border-slate-400"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">{client.login}</span>
                            <span className="text-slate-500">•</span>
                            <span className="flex-1 ml-2 truncate">{client.name || 'N/A'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-white border border-[#E5E7EB] rounded-lg px-2 shadow-sm h-9">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 50}
                  className={`p-1 rounded hover:bg-gray-100 transition-colors ${zoomLevel <= 50 ? 'opacity-40 cursor-not-allowed' : 'text-gray-700'}`}
                  title="Zoom Out (Min 50%)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <button
                  onClick={handleResetZoom}
                  className="p-1 rounded hover:bg-gray-100 transition-colors"
                  title={`Zoom: ${zoomLevel}% (Click to reset to 100%)`}
                >
                  <svg className="w-3.5 h-3.5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 200}
                  className={`p-1 rounded hover:bg-gray-100 transition-colors ${zoomLevel >= 200 ? 'opacity-40 cursor-not-allowed' : 'text-gray-700'}`}
                  title="Zoom In (Max 200%)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Columns Selector Button */}
              <div className="relative" ref={columnSelectorRef}>
                <button
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className="p-2 rounded-lg border border-[#E5E7EB] bg-white hover:bg-gray-50 transition-all shadow-sm h-9 w-9"
                  title="Show/Hide Columns"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-700">
                    <line x1="2" y1="4" x2="14" y2="4" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="6" cy="4" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                    <line x1="2" y1="8" x2="14" y2="8" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="11" cy="8" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                    <line x1="2" y1="12" x2="14" y2="12" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                    <circle cx="7" cy="12" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                  </svg>
                </button>
                {showColumnSelector && (
                  <div className="absolute top-full left-0 mt-2 bg-amber-50 rounded-lg shadow-xl border-2 border-amber-200 py-0 flex flex-col" style={{ 
                    width: '320px',
                    maxHeight: '60vh',
                    zIndex: 20000000
                  }}>
                    <div className="px-3 py-2 border-b border-amber-200 flex items-center justify-between bg-amber-50">
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Show/Hide & Reorder Columns</p>
                      <div className="flex items-center gap-1">
                        <div className="relative group">
                          <button
                            onClick={resetColumnOrder}
                            className="p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            aria-label="Reset column order to default"
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
                        <button
                          onClick={() => setShowColumnSelector(false)}
                          className="text-amber-500 hover:text-amber-700 p-1 rounded hover:bg-amber-100"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col" style={{ maxHeight: 'calc(60vh - 40px)' }}>
                      <ColumnChooserList
                        columns={dynamicColumns}
                        visibleColumns={visibleColumns}
                        onToggle={toggleColumn}
                        columnOrder={columnOrder}
                        onReorder={(newOrder) => setColumnOrder(newOrder)}
                        accent="amber"
                        title={null}
                        pinnedColumns={pinnedColumns}
                        onPinToggle={togglePinColumn}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Right Side: Page Navigation + Zoom Controls */}
            <div className="flex items-center gap-3">
              <PageSizeSelect value={itemsPerPage} onChange={handleItemsPerPageChange} menuZIndex={9999} />
              {/* Previous button */}
              <button 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 ${
                  currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M12 14L8 10L12 6" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Page indicator */}
              <span className="text-sm font-medium text-gray-700 px-2">
                {currentPage} / {totalPages}
              </span>

              {/* Next button */}
              <button 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 ${
                  currentPage === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M8 6L12 10L8 14" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          )}

          {/* Data Table */}
          {(
          <div className="bg-white rounded-lg shadow-sm border-2 border-gray-300 flex flex-col" style={{ 
            overflow: 'hidden',
            minHeight: '250px',
            height: showFaceCards ? '310px' : '510px'
          }}>
            
            <div ref={scrollContainerRef} onScroll={handleScroll} className="overflow-auto flex-1" style={{ 
              scrollbarWidth: 'thin',
              scrollbarColor: '#3b82f6 #e5e7eb',
              zoom: `${zoomLevel}%`,
              position: 'relative',
              willChange: 'scroll-position'
            }}>
              <style>{`
                .flex-1::-webkit-scrollbar {
                  width: 6px;
                  height: 10px;
                }
                .flex-1::-webkit-scrollbar-track {
                  background: #f3f4f6;
                }
                .flex-1::-webkit-scrollbar-thumb {
                  background: #2563eb;
                  border-radius: 4px;
                }
                .flex-1::-webkit-scrollbar-thumb:hover {
                  background: #1d4ed8;
                }
              `}</style>
              <table ref={tableRef} className="divide-y divide-gray-200 mb-4" style={{ tableLayout: 'fixed', width: `${totalTableWidth}px`, minWidth: '100%' }}>
                <colgroup>
                  {(() => {
                    const cols = []
                    visibleColumnsList.forEach(col => {
                      const baseW = columnWidths[col.key]
                      cols.push(<col key={col.key} style={{ width: (typeof baseW === 'number' && baseW > 0 ? baseW : 150) + 'px' }} />)
                      if (displayMode === 'both' && isMetricColumn(col.key)) {
                        const virtW = columnWidths[col.key + '_percentage_display']
                        cols.push(<col key={col.key + '_percentage_display'} style={{ width: (typeof virtW === 'number' && virtW > 0 ? virtW : 120) + 'px' }} />)
                      }
                    })
                    return cols
                  })()}
                </colgroup>
                <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10, overflow: 'visible', willChange: 'auto' }}>
                  <tr>
                    {(() => {
                      // Build the list of columns to render in header based on display mode
                      const baseVisible = visibleColumnsList
                      const renderCols = []
                      baseVisible.forEach(col => {
                        const widthBaseTotal = baseVisible.length + (displayMode === 'both' ? baseVisible.filter(c => isMetricColumn(c.key) && !metricsWithoutVirtualPercentage.has(c.key)).length : 0)
                        const defaultWidth = 100 / widthBaseTotal

                        // For base column header, adjust label if percentage mode and metric
                        const isMetric = isMetricColumn(col.key)
                        const headerLabel = (displayMode === 'percentage' && isMetric) ? `${col.label} %` : col.label

                        renderCols.push({ key: col.key, label: headerLabel, width: defaultWidth, baseKey: col.key })

                        // Add virtual percentage column in 'both' mode, but skip metrics with raw % columns
                        if (displayMode === 'both' && isMetric && !metricsWithoutVirtualPercentage.has(col.key)) {
                          // Add a virtual percentage column next to it
                          const virtKey = `${col.key}_percentage_display`
                          renderCols.push({ key: virtKey, label: `${col.label} %`, width: defaultWidth, baseKey: col.key })
                        }
                      })

                      return renderCols.map((col, colIndex) => {
                        const filterCount = getActiveFilterCount(col.baseKey)
                        const isFilterable = !col.key.endsWith('_percentage_display') // Only filter base columns
                        const isLastColumn = colIndex >= renderCols.length - 3 // Last 3 columns
                        const defaultPixelWidth = 150 // Default width in pixels for each column
                        const isPinned = pinnedColumns.includes(col.baseKey)
                        const pinnedLeft = isPinned ? pinnedOffsets[col.baseKey] : undefined

                        return (
                        <th
                          key={col.key}
                          className={`px-2 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider relative group hover:bg-blue-700 transition-colors bg-blue-600`}
                          ref={el => { if (el) { if (!headerRefs.current) headerRefs.current = {}; headerRefs.current[col.key] = el } }}
                          style={{
                            width: columnWidths[col.key] ? `${columnWidths[col.key]}px` : `${defaultPixelWidth}px`,
                            minWidth: '80px',
                            overflow: 'visible',
                            position: isPinned ? 'sticky' : 'relative',
                            left: isPinned ? `${pinnedLeft}px` : undefined,
                            zIndex: isPinned ? 12 : undefined,
                            boxShadow: isPinned ? '2px 0 4px -2px rgba(0,0,0,0.15)' : undefined
                          }}
                          title={col.label}
                        >
                          {/* Column Resize Handle */}
                          <div 
                            className="absolute right-0 top-0 w-1.5 h-full cursor-col-resize hover:bg-yellow-400 active:bg-yellow-500 z-20 group/resize"
                            onMouseDown={(e) => handleResizeStart(e, col.key)}
                            onDoubleClick={() => handleAutoFit(col.key, col.baseKey)}
                            title="Drag to resize column"
                            draggable={false}
                          >
                            <div className="absolute right-0 top-0 w-px h-full bg-white/30 group-hover/resize:bg-yellow-400 active:bg-yellow-500 transition-colors"></div>
                          </div>
                          
                          <div className="flex items-center gap-1 justify-between">
                            <div 
                              className="flex items-center gap-1 truncate cursor-pointer flex-1"
                              title={col.label}
                              onClick={() => handleSort(col.key)}
                            >
                              <span>{col.label}</span>
                              {sortColumn === col.key && (
                                <svg
                                  className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              )}
                              {sortColumn !== col.key && (
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
                            
                            {isFilterable && (
                              <div className="relative" ref={el => {
                                if (!filterRefs.current) filterRefs.current = {}
                                filterRefs.current[col.baseKey] = el
                              }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (showFilterDropdown === col.baseKey) {
                                      setShowFilterDropdown(null)
                                      setFilterPosition(null)
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect()
                                      setFilterPosition({
                                        top: rect.top,
                                        left: rect.left,
                                        right: rect.right,
                                        isLastColumn
                                      })
                                      setShowFilterDropdown(col.baseKey)
                                    }
                                  }}
                                  className={`p-1 rounded-md transition-all ${filterCount > 0 ? 'bg-green-400 text-blue-900 hover:bg-green-300 shadow-md' : 'bg-white/20 text-white hover:bg-white/30'}`}
                                  title="Filter column"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                  </svg>
                                  {filterCount > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow-lg border-2 border-white">
                                      1
                                    </span>
                                  )}
                                </button>

                                {showFilterDropdown === col.baseKey && filterPosition && createPortal(
                                  <div 
                                    ref={filterPanelRef}
                                    className="fixed bg-white border-2 border-slate-300 rounded-lg shadow-2xl flex flex-col text-[11px]"
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onWheel={(e) => e.stopPropagation()}
                                    onScroll={(e) => e.stopPropagation()}
                                    style={{
                                      top: '50%',
                                      transform: 'translateY(-50%)',
                                      left: filterPosition.isLastColumn 
                                        ? `${filterPosition.left - 290}px` 
                                        : `${filterPosition.right + 10}px`,
                                      width: '280px',
                                      maxHeight: '80vh',
                                      zIndex: 20000000
                                    }}>
                                    {/* Header */}
                                    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Filter Menu</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setShowFilterDropdown(null)
                                          }}
                                          className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1 rounded transition-colors"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>

                                    {/* Quick Clear Filter (top like Syncfusion) */}
                                    <div className="border-b border-slate-200 py-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          clearColumnFilter(col.baseKey)
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
                                          handleSort(col.key)
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
                                          handleSort(col.key)
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
                                    {!isStringColumn(col.baseKey) && (
                                      <div className="border-b border-slate-200 py-1" style={{ overflow: 'visible' }}>
                                        <div className="px-2 py-1 relative group text-[11px]" style={{ overflow: 'visible' }}>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setShowNumberFilterDropdown(showNumberFilterDropdown === col.baseKey ? null : col.baseKey)
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 transition-all"
                                          >
                                            <span>Number Filters</span>
                                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                          
                                          {/* Number Filter Dropdown - Opens to the left to avoid overlap */}
                                          {showNumberFilterDropdown === col.baseKey && (
                                            <div 
                                              className="absolute top-0 w-48 bg-white border-2 border-slate-300 rounded-lg shadow-xl"
                                              style={{
                                                left: 'calc(100% + 8px)',
                                                zIndex: 10000000
                                              }}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                            <div className="text-[11px] text-slate-700 py-1">
                                              <div 
                                                className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('equal')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Equal...
                                              </div>
                                              <div 
                                                className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('notEqual')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Not Equal...
                                              </div>
                                              <div 
                                                className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('lessThan')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Less Than...
                                              </div>
                                              <div 
                                                className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('lessThanOrEqual')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Less Than Or Equal...
                                              </div>
                                              <div 
                                                className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('greaterThan')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Greater Than...
                                              </div>
                                              <div 
                                                className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('greaterThanOrEqual')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Greater Than Or Equal...
                                              </div>
                                              <div 
                                                className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('between')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Between...
                                              </div>
                                              <div 
                                                className="hover:bg-gray-50 px-2 py-1 cursor-pointer"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setCustomFilterColumn(col.baseKey)
                                                  setCustomFilterType('equal')
                                                  setShowCustomFilterModal(true)
                                                }}
                                              >
                                                Custom Filter...
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    )}

                                    {/* Text Filters (only for string columns) */}
                                    {isStringColumn(col.baseKey) && (
                                      <div className="border-b border-slate-200 py-1" style={{ overflow: 'visible' }}>
                                        <div className="px-2 py-1 relative group text-[11px]" style={{ overflow: 'visible' }}>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setShowTextFilterDropdown(showTextFilterDropdown === col.baseKey ? null : col.baseKey)
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 transition-all"
                                          >
                                            <span>Text Filters</span>
                                            <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                          </button>
                                          {showTextFilterDropdown === col.baseKey && (
                                            <div 
                                              className="absolute top-0 w-56 bg-white border-2 border-slate-300 rounded-lg shadow-xl"
                                              style={{ left: 'calc(100% + 8px)', zIndex: 10000000 }}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <div className="text-[11px] text-slate-700 py-1">
                                                <div className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTextFilterColumn(col.baseKey); setCustomTextFilterType('equal'); setShowCustomTextFilterModal(true) }}>Equal...</div>
                                                <div className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTextFilterColumn(col.baseKey); setCustomTextFilterType('notEqual'); setShowCustomTextFilterModal(true) }}>Not Equal...</div>
                                                <div className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTextFilterColumn(col.baseKey); setCustomTextFilterType('startsWith'); setShowCustomTextFilterModal(true) }}>Starts With...</div>
                                                <div className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTextFilterColumn(col.baseKey); setCustomTextFilterType('endsWith'); setShowCustomTextFilterModal(true) }}>Ends With...</div>
                                                <div className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTextFilterColumn(col.baseKey); setCustomTextFilterType('contains'); setShowCustomTextFilterModal(true) }}>Contains...</div>
                                                <div className="hover:bg-slate-50 px-3 py-2 cursor-pointer font-medium transition-colors" onClick={(e) => { e.stopPropagation(); setCustomTextFilterColumn(col.baseKey); setCustomTextFilterType('doesNotContain'); setShowCustomTextFilterModal(true) }}>Does Not Contain...</div>
                                                <div className="hover:bg-gray-50 px-2 py-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); setCustomTextFilterColumn(col.baseKey); setCustomTextFilterType('contains'); setShowCustomTextFilterModal(true) }}>Custom Filter...</div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Search Box */}
                                    <div className="p-2 border-b border-slate-200">
                                      <div className="relative">
                                        <input
                                          type="text"
                                          placeholder="Search values..."
                                          value={filterSearchQuery[col.baseKey] || ''}
                                          onChange={(e) => {
                                            e.stopPropagation()
                                            setFilterSearchQuery(prev => ({
                                              ...prev,
                                              [col.baseKey]: e.target.value
                                            }))
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-full pl-8 pr-3 py-1 text-[11px] font-medium border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-400 focus:border-slate-400 bg-white text-slate-700 placeholder:text-slate-400"
                                        />
                                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                      </div>
                                    </div>

                                    {/* Select All / Deselect All */}
                                    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
                                      <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={isAllSelected(col.baseKey)}
                                          onChange={(e) => {
                                            e.stopPropagation()
                                            if (e.target.checked) {
                                              selectAllFilters(col.baseKey)
                                            } else {
                                              deselectAllFilters(col.baseKey)
                                            }
                                          }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-3.5 h-3.5 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                                        />
                                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Select All</span>
                                      </label>
                                    </div>

                                    {/* Filter List */}
                                    <div 
                                      className="overflow-y-scroll overflow-x-hidden" 
                                      style={{ 
                                        height: '380px',
                                        scrollbarWidth: 'thin',
                                        scrollbarColor: '#94a3b8 #e2e8f0'
                                      }}
                                      onWheel={(e) => e.stopPropagation()}
                                    >
                                      <style>{`
                                        div.overflow-y-scroll::-webkit-scrollbar {
                                          width: 8px;
                                        }
                                        div.overflow-y-scroll::-webkit-scrollbar-track {
                                          background: #e2e8f0;
                                          border-radius: 4px;
                                        }
                                        div.overflow-y-scroll::-webkit-scrollbar-thumb {
                                          background: #94a3b8;
                                          border-radius: 4px;
                                        }
                                        div.overflow-y-scroll::-webkit-scrollbar-thumb:hover {
                                          background: #64748b;
                                        }
                                      `}</style>
                                      <div className="p-2 space-y-1">
                                        {getUniqueColumnValues(col.baseKey).length === 0 ? (
                                          <div className="px-3 py-3 text-center text-xs text-slate-500 font-medium">
                                            No items found
                                          </div>
                                        ) : (
                                          getUniqueColumnValues(col.baseKey).map(value => (
                                            <label 
                                              key={value} 
                                              className="flex items-center gap-2 hover:bg-slate-50 px-2 py-1 rounded-md cursor-pointer transition-colors text-[11px]"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={(columnFilters[col.baseKey] || []).includes(value)}
                                                onChange={(e) => {
                                                  e.stopPropagation()
                                                  toggleColumnFilter(col.baseKey, value)
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-3.5 h-3.5 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                                              />
                                              <span className="text-[11px] text-slate-700 font-medium truncate flex-1">
                                                {formatValue(col.baseKey, value)}
                                              </span>
                                            </label>
                                          ))
                                        )}
                                      </div>
                                    </div>

                                    {/* Footer with Action Buttons */}
                                    <div className="px-2 py-1 border-t border-gray-200 bg-gray-50 rounded-b flex items-center justify-between text-[11px]">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          clearColumnFilter(col.baseKey)
                                        }}
                                        className="px-2 py-1 text-[10px] font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
                                      >
                                        Clear
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setShowFilterDropdown(null)
                                        }}
                                        className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                      >
                                        OK
                                      </button>
                                    </div>
                                  </div>,
                                  document.body
                                )}
                              </div>
                            )}
                          </div>
                          {/* Column totals in header removed */}
                        </th>
                      )})
                    })()}
                  </tr>
                </thead>
                
                <tbody className="bg-white divide-y divide-gray-100">
                  {/* Virtualization padding (top) */}
                  {topPadding > 0 && (
                    <tr style={{ height: topPadding }}>
                      <td colSpan={visibleColumnsList.length * (displayMode === 'both' ? 2 : 1)} style={{ padding: 0, border: 'none' }} />
                    </tr>
                  )}
                  {/* SAFETY: Filter null clients before rendering */}
                  {virtualizedClients.filter(client => client != null && client.login != null).map((client, index) => {
                    const globalIndex = virtualizationMetrics.startIndex + index
                    const isLastRow = index === displayedClients.length - 1
                    
                    // Build render columns for each row consistent with header
                    const baseVisible = visibleColumnsList
                    const renderCols = []
                    const widthBaseTotal = baseVisible.length + (displayMode === 'both' ? baseVisible.filter(c => isMetricColumn(c.key)).length : 0)
                    const defaultWidth = 100 / widthBaseTotal

                    baseVisible.forEach(col => {
                      const isMetric = isMetricColumn(col.key)

                      // Compute displayed value for base column
                      let titleVal
                      let displayVal
                      if (displayMode === 'percentage' && isMetric) {
                        const percKey = percentageFieldMap[col.key]
                        // SAFETY: Use optional chaining
                        const val = percKey ? client?.[percKey] : undefined
                        titleVal = formatPercent(val, client)
                        displayVal = formatPercent(val, client)
                      } else {
                        // SAFETY: Use optional chaining for property access
                        titleVal = formatValue(col.key, client?.[col.key], client)
                        displayVal = formatValue(col.key, client?.[col.key], client)
                        
                        // Debug: Log percentage column values
                        if (col.key.includes('percentage') || col.key.includes('PnL')) {
                          if (globalIndex === 0) { // Only log first row to avoid spam
                            console.log(`[Table Cell] ${col.key} for login ${client?.login}:`, {
                              rawValue: client?.[col.key],
                              formatted: displayVal
                            })
                          }
                        }
                      }

                      renderCols.push({ key: col.key, width: defaultWidth, value: displayVal, title: titleVal })

                      // Add virtual percentage column in 'both' mode, but skip metrics with raw % columns
                      if (displayMode === 'both' && isMetric && !metricsWithoutVirtualPercentage.has(col.key)) {
                        const virtKey = `${col.key}_percentage_display`
                        const percKey = percentageFieldMap[col.key]
                        // SAFETY: Use optional chaining
                        const val = percKey ? client?.[percKey] : undefined
                        renderCols.push({ key: virtKey, width: defaultWidth, value: formatPercent(val, client), title: formatPercent(val, client) })
                      }
                    })

                    return (
                      <tr
                        key={client.login ?? client.clientID ?? client.mqid ?? `${client.name || 'unknown'}-${client.email || 'noemail'}-${globalIndex}`}
                        style={{ height: effectiveRowHeight }}
                        className={`hover:bg-blue-50 transition-all duration-200 ${globalIndex === displayedClients.length - 1 ? 'border-b-2 border-gray-300' : 'border-b border-gray-100 hover:border-blue-200'}`}
                      >
                        {renderCols.map(col => {
                          const baseColKey = col.key.replace(/_percentage_display$/, '')
                          const isPinned = pinnedColumns.includes(baseColKey)
                          const pinnedLeft = isPinned ? pinnedOffsets[baseColKey] : undefined
                          const stickyStyle = isPinned ? {
                            position: 'sticky',
                            left: `${pinnedLeft}px`,
                            zIndex: 1,
                            background: 'inherit',
                            backgroundColor: '#fff',
                            boxShadow: '2px 0 4px -2px rgba(0,0,0,0.15)'
                          } : null
                          // Special handling for login column - make it clickable
                          if (col.key === 'login') {
                            const defaultPixelWidth = 150
                            return (
                              <td 
                                key={col.key} 
                                className="px-3 py-2 text-sm text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-all" 
                                style={{ width: columnWidths[col.key] ? `${columnWidths[col.key]}px` : `${defaultPixelWidth}px`, minWidth: '80px', ...(stickyStyle || {}) }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedClient(client)
                                }}
                                title="Click to view client details"
                              >
                                <div className="truncate flex items-center gap-1">
                                  <svg className="w-3 h-3 inline opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                  {col.value}
                                </div>
                              </td>
                            )
                          }
                          
                          // Regular columns
                          const defaultPixelWidth = 150
                          return (
                            <td key={col.key} className="px-2 py-1.5 text-[13px] text-gray-800" style={{ width: columnWidths[col.key] ? `${columnWidths[col.key]}px` : `${defaultPixelWidth}px`, minWidth: '80px', ...(stickyStyle || {}) }}>
                              <div className="truncate" title={col.title}>
                                {col.value}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                  {/* Virtualization padding (bottom) */}
                  {bottomPadding > 0 && (
                    <tr style={{ height: bottomPadding }}>
                      <td colSpan={visibleColumnsList.length * (displayMode === 'both' ? 2 : 1)} style={{ padding: 0, border: 'none' }} />
                    </tr>
                  )}
                </tbody>
                {/* Totals footer removed (was for debugging). */}
              </table>
            </div>
          </div>
          )}

        </div>
      </main>

      {/* Client Positions Modal */}
      {selectedClient && (
        <ClientPositionsModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onClientUpdate={fetchClients}
          allPositionsCache={cachedPositions}
          allOrdersCache={cachedOrders}
          onCacheUpdate={(newAllPositions) => {
            // Positions are managed by DataContext, no need to update local state
          }}
        />
      )}
      
      {/* Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false)
          setEditingGroup(null)
        }}
        availableItems={clients}
        loginField="login"
        displayField="name"
        secondaryField="group"
        editGroup={editingGroup}
      />

      {/* Custom Filter Modal */}
      {showCustomFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[30000000]">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw]" style={{ marginLeft: '12vw' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Custom Filter</h3>
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
            <div className="p-3 space-y-3 text-[12px]">
              <div>
                <p className="text-[12px] font-medium text-gray-700 mb-2">Show rows where:</p>
                <p className="text-[12px] text-gray-600 mb-3">{customFilterColumn}</p>
              </div>

              {/* Filter Type Dropdown */}
              <div>
                <select
                  value={customFilterType}
                  onChange={(e) => setCustomFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 text-[12px]"
                >
                  <option value="equal">Equal</option>
                  <option value="notEqual">Not Equal</option>
                  <option value="lessThan">Less Than</option>
                  <option value="lessThanOrEqual">Less Than Or Equal</option>
                  <option value="greaterThan">Greater Than</option>
                  <option value="greaterThanOrEqual">Greater Than Or Equal</option>
                  <option value="between">Between</option>
                </select>
              </div>

              {/* Value Input */}
              <div>
                <input
                  type="number"
                  value={customFilterValue1}
                  onChange={(e) => setCustomFilterValue1(e.target.value)}
                  placeholder="Enter the value"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 text-[12px]"
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
                      <span className="text-[12px] text-gray-700">AND</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={customFilterOperator === 'OR'}
                        onChange={() => setCustomFilterOperator('OR')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-[12px] text-gray-700">OR</span>
                    </label>
                  </div>

                  <div>
                    <input
                      type="number"
                      value={customFilterValue2}
                      onChange={(e) => setCustomFilterValue2(e.target.value)}
                      placeholder="Enter the value"
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 text-[12px]"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowCustomFilterModal(false)
                  setCustomFilterValue1('')
                  setCustomFilterValue2('')
                }}
                className="px-3 py-1.5 text-[12px] text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyCustomNumberFilter}
                disabled={!customFilterValue1}
                className="px-3 py-1.5 text-[12px] text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Text Filter Modal */}
      {showCustomTextFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[30000000]">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw]" style={{ marginLeft: '12vw' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Text Filter</h3>
              <button
                onClick={() => {
                  setShowCustomTextFilterModal(false)
                  setCustomTextFilterValue('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-3 space-y-3 text-[12px]">
              <div>
                <p className="text-[12px] font-medium text-gray-700 mb-2">Show rows where:</p>
                <p className="text-[12px] text-gray-600 mb-3">{customTextFilterColumn}</p>
              </div>

              {/* Filter Type Dropdown */}
              <div>
                <select
                  value={customTextFilterType}
                  onChange={(e) => setCustomTextFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 text-[12px]"
                >
                  <option value="equal">Equal</option>
                  <option value="notEqual">Not Equal</option>
                  <option value="startsWith">Starts With</option>
                  <option value="endsWith">Ends With</option>
                  <option value="contains">Contains</option>
                  <option value="doesNotContain">Does Not Contain</option>
                </select>
              </div>

              {/* Value Input */}
              <div>
                <input
                  type="text"
                  value={customTextFilterValue}
                  onChange={(e) => setCustomTextFilterValue(e.target.value)}
                  placeholder="Enter text"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 text-[12px]"
                />
              </div>

              {/* Case Sensitive */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={customTextFilterCaseSensitive}
                  onChange={(e) => setCustomTextFilterCaseSensitive(e.target.checked)}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[12px] text-gray-700">Case sensitive</span>
              </label>
            </div>

            {/* Footer */}
            <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowCustomTextFilterModal(false)
                  setCustomTextFilterValue('')
                }}
                className="px-3 py-1.5 text-[12px] text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyCustomTextFilter}
                disabled={!customTextFilterColumn}
                className="px-3 py-1.5 text-[12px] text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
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

export default ClientsPage








