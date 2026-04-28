import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import ClientPositionsModal from '../components/ClientPositionsModal'
import Client2Module from '../components/Client2Module'
import { useData } from '../contexts/DataContext'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import api, { brokerAPI } from '../services/api'
import { useGroups } from '../contexts/GroupContext'
import { useIB } from '../contexts/IBContext'
import { useAuth } from '../contexts/AuthContext'

// Gate verbose logs behind env flag to keep console clean in production
const DEBUG_LOGS = import.meta?.env?.VITE_DEBUG_LOGS === 'true'

const Client2Page = () => {
  // Get positions and orders from DataContext for ClientPositionsModal
  const { positions: cachedPositions, orders: cachedOrders } = useData()
  
  // Mobile detection (initialize from window to avoid first-render desktop effects)
  const [isMobile, setIsMobile] = useState(() => {
    try { return typeof window !== 'undefined' ? window.innerWidth <= 768 : false } catch { return false }
  })

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      // Ensure page remains scrollable (fix accidental overflow hidden)
      const body = document.body
      if (body && body.style.overflow === 'hidden') {
        body.style.overflow = ''
      }
      const html = document.documentElement
      if (html && html.style.overflow === 'hidden') {
        html.style.overflow = ''
      }
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const getInitialColumnValuesBatchSize = () => {
    try {
      const saved = localStorage.getItem('client2ColumnValuesBatchSize')
      const n = saved ? parseInt(saved) : 200
      if (!Number.isFinite(n)) return 200
      return Math.min(1000, Math.max(50, n))
    } catch {
      return 200
    }
  }
  const [columnValuesBatchSize, setColumnValuesBatchSize] = useState(getInitialColumnValuesBatchSize)

  useEffect(() => {
    try { localStorage.setItem('client2ColumnValuesBatchSize', String(columnValuesBatchSize)) } catch { }
  }, [columnValuesBatchSize])
  
  // Group context
  const { filterByActiveGroup, activeGroupFilters, getActiveGroupFilter, setActiveGroupFilter, groups } = useGroups()

  // Get active group for this module
  const activeGroupName = getActiveGroupFilter('client2')
  const activeGroup = groups.find(g => g.name === activeGroupName)

  // IB context
  const { filterByActiveIB, selectedIB, ibMT5Accounts, refreshIBList, clearIBSelection } = useIB()
  // Auth context
  const { isAuthenticated } = useAuth()
  // Suspend auto-refresh when unauthorized
  const [unauthorized, setUnauthorized] = useState(false)

  const getInitialSidebarOpen = () => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      if (v === null) return true // open by default
      return JSON.parse(v)
    } catch {
      return true
    }
  }
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Data state
  const [clients, setClients] = useState([])
  const [totalClients, setTotalClients] = useState(0)
  const [totals, setTotals] = useState({})
  const [rebateTotals, setRebateTotals] = useState({})
  const [totalsPercent, setTotalsPercent] = useState({}) // Percent totals (server response when percentage:true)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(100)
  const [totalPages, setTotalPages] = useState(1)
  const [isPageChanging, setIsPageChanging] = useState(false)
  const pageChangeTimeoutRef = useRef(null)

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState([])
  const [mt5Accounts, setMt5Accounts] = useState([])
  const [accountRangeMin, setAccountRangeMin] = useState('')
  const [accountRangeMax, setAccountRangeMax] = useState('')

  // Sorting state
  const [sortBy, setSortBy] = useState('')
  const [sortOrder, setSortOrder] = useState('asc')
  const [animationKey, setAnimationKey] = useState(0)
  const [initialLoad, setInitialLoad] = useState(true)
  const [progressActive, setProgressActive] = useState(false)

  // UI state
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [columnSelectorPos, setColumnSelectorPos] = useState({ top: 0, left: 0 })
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [showAccountFilterModal, setShowAccountFilterModal] = useState(false)
  const [showClientDetailModal, setShowClientDetailModal] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [columnSearchQuery, setColumnSearchQuery] = useState('')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showCardFilterMenu, setShowCardFilterMenu] = useState(false)
  const [cardFilterSearchQuery, setCardFilterSearchQuery] = useState('')
  // Card filter mode: show only percentage cards or only non-percentage cards
  const [cardFilterPercentMode, setCardFilterPercentMode] = useState(false) // Do not persist; always start disabled
  const [showFaceCards, setShowFaceCards] = useState(true)
  // Display mode for monetary fields: 'compact' (e.g. 2.57Cr) or 'full' (e.g. 2,57,14,191.16)
  // Synced globally via the Sidebar (localStorage key: 'globalDisplayMode')
  const [displayMode, setDisplayMode] = useState(() => {
    try {
      const saved = localStorage.getItem('globalDisplayMode') || localStorage.getItem('client2DisplayMode')
      return saved === 'full' ? 'full' : 'compact'
    } catch { return 'compact' }
  })
  useEffect(() => {
    const onChange = (e) => {
      const v = (e && e.detail) || localStorage.getItem('globalDisplayMode')
      if (v === 'full' || v === 'compact') setDisplayMode(v)
    }
    window.addEventListener('globalDisplayModeChanged', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('globalDisplayModeChanged', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSorting, setIsSorting] = useState(false)
  const [columnFilters, setColumnFilters] = useState({})
  const [showFilterDropdown, setShowFilterDropdown] = useState(null)
  const [filterSearchQuery, setFilterSearchQuery] = useState({})
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)
  const [numericFilterTemp, setNumericFilterTemp] = useState({}) // Temporary storage for numeric filters being edited
  const [textFilterTemp, setTextFilterTemp] = useState({}) // Temporary storage for text filters being edited
  const [columnSortOrder, setColumnSortOrder] = useState({}) // Track sort order per column: 'asc', 'desc', or null
  const [filterPosition, setFilterPosition] = useState(null) // Track filter button position for portal
  const [columnValues, setColumnValues] = useState({}) // Store unique values for each column
  const [columnValuesLoading, setColumnValuesLoading] = useState({}) // Track first-load state for column values
  const [columnValuesLoadingMore, setColumnValuesLoadingMore] = useState({}) // Track incremental load state
  const [columnValuesPage, setColumnValuesPage] = useState({}) // Track current page per column
  const [columnValuesHasMore, setColumnValuesHasMore] = useState({}) // Track hasMore per column
  const [columnValuesCurrentPage, setColumnValuesCurrentPage] = useState({}) // Track current page number per column
  const [columnValuesTotalPages, setColumnValuesTotalPages] = useState({}) // Track total pages per column
  const [columnValuesUnsupported, setColumnValuesUnsupported] = useState({}) // Fields not supported by /clients/fields API
  const [selectedColumnValues, setSelectedColumnValues] = useState({}) // Track selected values for checkbox filters
  const [columnValueSearch, setColumnValueSearch] = useState({}) // Search query for column value filters
  const [columnValueSearchDebounce, setColumnValueSearchDebounce] = useState({}) // Debounced search queries
  const [quickFilters, setQuickFilters] = useState({
    hasFloating: false,
    hasCredit: false,
    noDeposit: false
  }) // Do not persist quick filters
  
  // Networking guards for polling
  const fetchAbortRef = useRef(null)
  const isFetchingRef = useRef(false)
  const requestIdRef = useRef(0)
  // Pause polling during active user filter changes to avoid race
  const pausePollingUntilRef = useRef(0)
  // Drag-and-drop for face cards
  const [draggedCardKey, setDraggedCardKey] = useState(null)
  const [dragOverCardKey, setDragOverCardKey] = useState(null)
  // Trend tracking for face card values (desktop)
  const lastValuesRef = useRef({})
  const lastTrendRef = useRef({})
  const lastChangeRef = useRef({})
  const STABLE_THRESHOLD_MS = 5000

  // Define default face card order for Client2 — only 6 allowed cards
  const defaultClient2FaceCardOrder = [
    'totalClients', 'balance', 'credit', 'equity', 'floating', 'pnl'
  ]

  const getInitialClient2FaceCardOrder = () => {
    try {
      const saved = localStorage.getItem('client2FaceCardOrder')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Validate that it's an array and reconcile with current defaults
        if (Array.isArray(parsed)) {
          const defaults = [...defaultClient2FaceCardOrder]
          const defaultSet = new Set(defaults)
          // Keep only known keys and preserve saved order
          const cleaned = parsed.filter(k => defaultSet.has(k))
          // Append any new keys missing from saved order
          defaults.forEach(k => { if (!cleaned.includes(k)) cleaned.push(k) })
          return cleaned
        }
      }
    } catch (e) {
      console.warn('Failed to parse client2FaceCardOrder from localStorage:', e)
    }
    return defaultClient2FaceCardOrder
  }

  const [faceCardOrder, setFaceCardOrder] = useState(getInitialClient2FaceCardOrder)

  // Column ordering state
  const getInitialColumnOrder = () => {
    const saved = localStorage.getItem('client2ColumnOrder')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse saved column order:', e)
      }
    }
    return null // Will use default order from allColumns
  }

  // Keep the Show/Hide Columns panel open and anchored while scrolling
  useEffect(() => {
    if (!showColumnSelector) return
    const handleScroll = () => {
      const host = columnSelectorRef.current
      if (!host) return
      const btn = host.querySelector('button') || host
      const rect = btn.getBoundingClientRect()
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
      const panelWidth = 300
      const gap = 8
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 800
      const lift = Math.min(400, Math.round(viewportH * 0.5))
      let top = rect.top + scrollY - lift + Math.round(rect.height / 2)
      top = Math.max(scrollY + 10, Math.min(top, scrollY + viewportH - 10))
      let left = rect.right + scrollX + gap
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth
      if (left + panelWidth > scrollX + viewportWidth) {
        left = rect.left + scrollX - panelWidth - gap
      }
      setColumnSelectorPos({ top, left })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [showColumnSelector])

  const [columnOrder, setColumnOrder] = useState(getInitialColumnOrder)
  const [draggedColumn, setDraggedColumn] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)

  // Column resizing state
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('client2ColumnWidths')) || {}
    } catch (e) {
      return {}
    }
  })

  // Clear all filters on component mount (when navigating to this page or refreshing)
  useEffect(() => {
    setQuickFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
    clearIBSelection()
    setActiveGroupFilter('client2', null)
    setSearchInput('')
  }, [])

  // useEffect to save columnWidths to localStorage
  useEffect(() => {
    localStorage.setItem('client2ColumnWidths', JSON.stringify(columnWidths))
  }, [columnWidths])

  // Debounce search input for server-side filtering
  useEffect(() => {
    const timers = {}

    Object.keys(columnValueSearch).forEach(columnKey => {
      const searchQuery = columnValueSearch[columnKey] || ''
      const previousQuery = columnValueSearchDebounce[columnKey] || ''

      // Only trigger if search changed
      if (searchQuery !== previousQuery) {
        if (timers[columnKey]) clearTimeout(timers[columnKey])

        timers[columnKey] = setTimeout(() => {
          setColumnValueSearchDebounce(prev => ({ ...prev, [columnKey]: searchQuery }))

          // Reset and fetch with new search query
          setColumnValues(prev => ({ ...prev, [columnKey]: [] }))
          setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: 1 }))
          fetchColumnValuesWithSearch(columnKey, searchQuery, true)
        }, 500) // 500ms debounce
      }
    })

    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer))
    }
  }, [columnValueSearch])

  const columnSelectorRef = useRef(null)
  const filterMenuRef = useRef(null)
  const cardFilterMenuRef = useRef(null)
  const exportMenuRef = useRef(null)
  const filterRefs = useRef({})
  const filterPanelRef = useRef(null)
  const headerRefs = useRef({})
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const resizeRightStartWidth = useRef(0)
  const resizeRAF = useRef(null)
  const resizeRightNeighborKey = useRef(null)
  const measureCanvasRef = useRef(null)
  const tableRef = useRef(null)
  const hScrollRef = useRef(null)
  const stickyScrollRef = useRef(null)
  const faceCardsRef = useRef(null)
  const tableContainerRef = useRef(null)
  const [resizingColumn, setResizingColumn] = useState(null)
  // Scroll gating for column value dropdowns
  const columnScrollUserActionRef = useRef({}) // { [columnKey]: boolean }
  const columnScrollLastTriggerRef = useRef({}) // { [columnKey]: number }
  const columnLastScrollTopRef = useRef({}) // { [columnKey]: number }

  // Removed persistence of cardFilterPercentMode (no localStorage usage)

  // Face card visibility state
  const getInitialCardVisibility = () => {
    const saved = localStorage.getItem('client2CardVisibility')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse saved card visibility:', e)
      }
    }
    // Default: show only the 6 allowed cards
    return {
      totalClients: true,
      balance: true,
      credit: true,
      equity: true,
      floating: true,
      pnl: true,
      // everything else hidden
      assets: false,
      blockedCommission: false,
      blockedProfit: false,
      commission: false,
      dailyBonusIn: false,
      dailyBonusOut: false,
      dailyCreditIn: false,
      dailyCreditOut: false,
      dailyDeposit: false,
      dailyPnL: false,
      dailySOCompensationIn: false,
      dailySOCompensationOut: false,
      dailyWithdrawal: false,
      liabilities: false,
      lifetimeBonusIn: false,
      lifetimeBonusOut: false,
      lifetimeCreditIn: false,
      lifetimeCreditOut: false,
      lifetimeDeposit: false,
      lifetimePnL: false,
      lifetimeSOCompensationIn: false,
      lifetimeSOCompensationOut: false,
      lifetimeWithdrawal: false,
      margin: false,
      marginFree: false,
      marginInitial: false,
      marginLevel: false,
      marginMaintenance: false,
      soEquity: false,
      soLevel: false,
      soMargin: false,
      previousEquity: false,
      profit: false,
      storage: false,
      // Percent versions (default hidden except P&L %)
      assetsPercent: false,
      balancePercent: false,
      blockedCommissionPercent: false,
      blockedProfitPercent: false,
      commissionPercent: false,
      creditPercent: false,
      dailyBonusInPercent: false,
      dailyBonusOutPercent: false,
      dailyCreditInPercent: false,
      dailyCreditOutPercent: false,
      dailyDepositPercent: false,
      dailyPnLPercent: false,
      dailySOCompensationInPercent: false,
      dailySOCompensationOutPercent: false,
      dailyWithdrawalPercent: false,
      // New computed card visibility (off by default)
      dailyNetDW: false,
      equityPercent: false,
      floatingPercent: false,
      liabilitiesPercent: false,
      lifetimeBonusInPercent: false,
      lifetimeBonusOutPercent: false,
      lifetimeCreditInPercent: false,
      lifetimeCreditOutPercent: false,
      lifetimeDepositPercent: false,
      lifetimePnLPercent: false,
      lifetimeSOCompensationInPercent: false,
      lifetimeSOCompensationOutPercent: false,
      lifetimeWithdrawalPercent: false,
      marginPercent: false,
      marginFreePercent: false,
      marginInitialPercent: false,
      marginLevelPercent: false,
      marginMaintenancePercent: false,
      soEquityPercent: false,
      soLevelPercent: false,
      soMarginPercent: false,
      pnlPercent: true,
      previousEquityPercent: false,
      profitPercent: false,
      storagePercent: false,
      thisMonthBonusIn: false,
      thisMonthBonusOut: false,
      thisMonthCreditIn: false,
      thisMonthCreditOut: false,
      thisMonthDeposit: false,
      thisMonthPnL: false,
      thisMonthSOCompensationIn: false,
      thisMonthSOCompensationOut: false,
      thisMonthWithdrawal: false,
      thisWeekBonusIn: false,
      thisWeekBonusOut: false,
      thisWeekCreditIn: false,
      thisWeekCreditOut: false,
      thisWeekDeposit: false,
      thisWeekPnL: false,
      thisWeekSOCompensationIn: false,
      thisWeekSOCompensationOut: false,
      thisWeekWithdrawal: false,
      // Percent versions for week/month
      thisMonthBonusInPercent: false,
      thisMonthBonusOutPercent: false,
      thisMonthCreditInPercent: false,
      thisMonthCreditOutPercent: false,
      thisMonthDepositPercent: false,
      thisMonthPnLPercent: false,
      thisMonthSOCompensationInPercent: false,
      thisMonthSOCompensationOutPercent: false,
      thisMonthWithdrawalPercent: false,
      thisWeekBonusInPercent: false,
      thisWeekBonusOutPercent: false,
      thisWeekCreditInPercent: false,
      thisWeekCreditOutPercent: false,
      thisWeekDepositPercent: false,
      thisWeekPnLPercent: false,
      thisWeekSOCompensationInPercent: false,
      thisWeekSOCompensationOutPercent: false,
      thisWeekWithdrawalPercent: false,
      // New computed cards visibility (off by default)
      netWeekBonus: false,
      netMonthBonus: false,
      // Remaining NET cards visibility (off by default)
      netDailyBonus: false,
      netLifetimeBonus: false,
      netWeekDW: false,
      netMonthDW: false,
      netLifetimeDW: false,
      netCredit: false,
      // Rebate cards (all visible by default)
      availableRebate: true,
      availableRebatePercent: true,
      totalRebate: true,
      totalRebatePercent: true,
      // Calculated PnL cards
      netLifetimePnL: true,
      netLifetimePnLPercent: true,
      bookPnL: true,
      bookPnLPercent: true
    }
  }

  const [cardVisibility, setCardVisibility] = useState(getInitialCardVisibility)
  // Global percentage view disabled; use per-field % cards instead
  const showPercentage = false

  // Percentage mode now ONLY controlled by explicit toggle (cardFilterPercentMode)
  // Face card visibility no longer auto-triggers percentage API calls to avoid unintended requests.
  const percentModeActive = cardFilterPercentMode === true

  // Filter modal state
  const [newFilterField, setNewFilterField] = useState('balance')
  const [newFilterOperator, setNewFilterOperator] = useState('greater_than')
  const [newFilterValue, setNewFilterValue] = useState('')

  // Account filter modal state
  const [accountInputText, setAccountInputText] = useState('')
  const [tempAccountRangeMin, setTempAccountRangeMin] = useState('')
  const [tempAccountRangeMax, setTempAccountRangeMax] = useState('')

  // Column visibility state
  const getInitialVisibleColumns = () => {
    const saved = localStorage.getItem('client2PageVisibleColumns')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        // Check if saved columns have the required new columns (accountType, processorType, lifetimePnL)
        // If they're missing, use new defaults instead
        if (!parsed.hasOwnProperty('accountType') || !parsed.hasOwnProperty('processorType') || !parsed.hasOwnProperty('lifetimePnL')) {
          console.log('[Client2] Saved columns missing new fields, resetting to defaults')
          localStorage.removeItem('client2PageVisibleColumns')
          return getDefaultColumns()
        }
        return parsed
      } catch (e) {
        console.error('Failed to parse saved columns:', e)
        localStorage.removeItem('client2PageVisibleColumns')
      }
    }
    return getDefaultColumns()
  }

  const getDefaultColumns = () => {
    return {
      login: true,
      name: true,
      email: false,
      group: false,
      balance: false,
      equity: true,
      credit: false,
      margin: false,
      marginLevel: false,
      profit: true,
      currency: false,
      leverage: false,
      country: false,
      phone: false,
      city: false,
      state: false,
      address: false,
      zipCode: false,
      company: false,
      comment: false,
      registration: false,
      lastAccess: false,
      marginFree: false,
      floating: false,
      dailyPnL: false,
      thisWeekPnL: false,
      thisMonthPnL: false,
      lifetimePnL: true,
      accountType: true,
      processorType: true
    }
  }

  const [visibleColumns, setVisibleColumns] = useState(getInitialVisibleColumns)

  // Save column order to localStorage
  useEffect(() => {
    if (columnOrder) {
      localStorage.setItem('client2ColumnOrder', JSON.stringify(columnOrder))
    }
  }, [columnOrder])

  // Auto-focus filter dropdown when it opens for keyboard navigation
  useEffect(() => {
    if (showFilterDropdown && filterPanelRef.current) {
      setTimeout(() => {
        filterPanelRef.current?.focus()
      }, 0)
    }
  }, [showFilterDropdown])

  // Calculate dynamic table height based on available space and changing UI above the table
  const visibleCardCount = useMemo(() => {
    try {
      return (faceCardOrder || []).filter(k => (cardVisibility?.[k] !== false)).length
    } catch {
      return 0
    }
  }, [faceCardOrder, cardVisibility])



  // All available columns (restricted to requested list)
  const allColumns = [
    { key: 'login', label: 'Login', type: 'integer', sticky: true },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'equity', label: 'Equity', type: 'float' },
    { key: 'profit', label: 'Floating Profit', type: 'float' },
    { key: 'lastName', label: 'Last Name', type: 'text' },
    { key: 'middleName', label: 'Middle Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'group', label: 'Group', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'address', label: 'Address', type: 'text' },
    { key: 'zipCode', label: 'Zip Code', type: 'text' },
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'leadSource', label: 'Lead Source', type: 'text' },
    { key: 'leadCampaign', label: 'Lead Campaign', type: 'text' },
    { key: 'balance', label: 'Balance', type: 'float' },
    { key: 'credit', label: 'Credit', type: 'float' },
    { key: 'margin', label: 'Margin', type: 'float' },
    { key: 'marginFree', label: 'Margin Free', type: 'float' },
    { key: 'marginLevel', label: 'Margin Level', type: 'float' },
    { key: 'leverage', label: 'Leverage', type: 'integer' },
    { key: 'currency', label: 'Currency', type: 'text' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'comment', label: 'Comment', type: 'text' },
    { key: 'registration', label: 'Registration', type: 'date' },
    { key: 'lastAccess', label: 'Last Access', type: 'date' },
    { key: 'accountLastUpdate', label: 'Account Last Update', type: 'timestamp' },
    { key: 'userLastUpdate', label: 'User Last Update', type: 'timestamp' },
    { key: 'applied_percentage', label: 'Applied Percentage', type: 'float' },
    { key: 'applied_percentage_is_custom', label: 'Is Custom Percentage', type: 'text' },
    { key: 'storage', label: 'Storage', type: 'float' }
  ]

  // Get visible columns list (moved here before being used in useEffect dependencies)
  const visibleColumnsList = useMemo(() => {
    const visible = allColumns.filter(c => visibleColumns[c.key] === true)

    // Apply column ordering if exists
    if (columnOrder && Array.isArray(columnOrder)) {
      const ordered = []
      // First add columns in the specified order
      columnOrder.forEach(key => {
        const col = visible.find(c => c.key === key)
        if (col) ordered.push(col)
      })
      // Then add any remaining visible columns that aren't in the order (new columns)
      visible.forEach(col => {
        if (!ordered.find(c => c.key === col.key)) {
          ordered.push(col)
        }
      })
      return ordered
    }

    return visible
  }, [allColumns, visibleColumns, columnOrder])

  // Keep filter dropdown anchored during scroll (must be after visibleColumnsList)
  useEffect(() => {
    if (!showFilterDropdown || !filterRefs.current || !filterRefs.current[showFilterDropdown]) return
    const handleScroll = () => {
      const btn = filterRefs.current[showFilterDropdown]
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const columnIndex = visibleColumnsList.findIndex(col => col.key === showFilterDropdown)
      const totalColumns = visibleColumnsList.length
      const dropdownWidth = 280
      const spaceOnRight = window.innerWidth - rect.right
      const spaceOnLeft = rect.left
      const isLastThreeColumns = columnIndex >= totalColumns - 3
      const shouldOpenLeft = isLastThreeColumns || (spaceOnRight < dropdownWidth + 20 && spaceOnLeft > dropdownWidth + 20)
      setFilterPosition({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        isLastColumn: columnIndex === totalColumns - 1,
        shouldOpenLeft
      })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [showFilterDropdown, visibleColumnsList])


  // Sync horizontal scrollbars (robust, loop-guarded)
  useEffect(() => {
    const mainScroll = hScrollRef.current
    const stickyScroll = stickyScrollRef.current

    if (!mainScroll || !stickyScroll) return

    let raf = null
    const syncingFromMain = { current: false }
    const syncingFromSticky = { current: false }

    const handleMainScroll = () => {
      if (!stickyScroll) return
      if (syncingFromSticky.current) return
      syncingFromMain.current = true
      const left = mainScroll.scrollLeft
      if (stickyScroll.scrollLeft !== left) {
        stickyScroll.scrollLeft = left
      }
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { syncingFromMain.current = false })
    }

    const handleStickyScroll = () => {
      if (!mainScroll) return
      if (syncingFromMain.current) return
      syncingFromSticky.current = true
      const left = stickyScroll.scrollLeft
      if (mainScroll.scrollLeft !== left) {
        mainScroll.scrollLeft = left
      }
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { syncingFromSticky.current = false })
    }

    // Initialize sticky width and sync on mount
    handleMainScroll()

    mainScroll.addEventListener('scroll', handleMainScroll, { passive: true })
    stickyScroll.addEventListener('scroll', handleStickyScroll, { passive: true })

    return () => {
      mainScroll.removeEventListener('scroll', handleMainScroll)
      stickyScroll.removeEventListener('scroll', handleStickyScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [clients.length, visibleColumnsList.length])

  // Get smart default width for a column based on its type and key
  const getDefaultColumnWidth = useCallback((col) => {
    // Check if we have a saved width
    if (columnWidths[col.key]) {
      return columnWidths[col.key]
    }

    // Smart defaults based on column key and type
    const key = col.key.toLowerCase()

    // Very narrow columns
    if (key === 'login' || key === 'id') return 130
    if (key === 'leverage') return 110

    // Email needs more space
    if (key === 'email') return 240

    // Phone numbers - need more space for international format
    if (key === 'phone') return 170

    // Names
    if (key === 'name' || key === 'lastname' || key === 'middlename') return 160

    // Long text fields
    if (key === 'address' || key === 'comment') return 280

    // Country, city, state, company
    if (key === 'country' || key === 'city' || key === 'state' || key === 'company') return 150

    // Group
    if (key === 'group') return 170

    // Date/datetime columns - need more space for full timestamp
    if (col.type === 'date' || key.includes('registration') || key.includes('access') || key.includes('update') || key.includes('date') || key.includes('time')) return 200

    // Percentage columns
    if (key.includes('percentage') || key.includes('_percentage')) return 140

    // Float/number columns - medium width
    if (col.type === 'float' || col.type === 'integer') return 150

    // Default for text
    return 160
  }, [columnWidths])

  // Calculate total table width based on all visible columns
  const totalTableWidth = useMemo(() => {
    return visibleColumnsList.reduce((sum, col) => sum + getDefaultColumnWidth(col), 0)
  }, [visibleColumnsList, columnWidths, getDefaultColumnWidth])

  // Filter operators by type
  const numberOperators = [
    { value: 'equal', label: 'Equal to (=)' },
    { value: 'not_equal', label: 'Not equal to (≠)' },
    { value: 'greater_than', label: 'Greater than (>)' },
    { value: 'greater_than_equal', label: 'Greater than or equal (≥)' },
    { value: 'less_than', label: 'Less than (<)' },
    { value: 'less_than_equal', label: 'Less than or equal (≤)' },
    { value: 'between', label: 'Between' }
  ]

  const textOperators = [
    { value: 'equal', label: 'Equal to' },
    { value: 'not_equal', label: 'Not equal to' },
    { value: 'contains', label: 'Contains' },
    { value: 'not_contains', label: 'Does not contain' },
    { value: 'starts_with', label: 'Starts with' },
    { value: 'ends_with', label: 'Ends with' }
  ]

  const dateOperators = [
    { value: 'equal', label: 'Equal to' },
    { value: 'greater_than', label: 'After' },
    { value: 'less_than', label: 'Before' }
  ]

  // Get operators for selected field
  const getOperatorsForField = (fieldKey) => {
    const column = allColumns.find(col => col.key === fieldKey)
    if (!column) return numberOperators

    switch (column.type) {
      case 'text':
        return textOperators
      case 'date':
        return dateOperators
      default:
        return numberOperators
    }
  }

  // Save visible columns to localStorage
  useEffect(() => {
    localStorage.setItem('client2PageVisibleColumns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  // Persist column widths
  useEffect(() => {
    try {
      localStorage.setItem('client2ColumnWidths', JSON.stringify(columnWidths))
    } catch (e) {
      // ignore
    }
  }, [columnWidths])

  // Checkbox filters are now handled server-side via API (no client-side filtering needed)

  // AbortController ref; cancel only polling requests, never user-triggered filters/search
  const abortControllerRef = useRef(null)
  const lastRequestWasSilentRef = useRef(false)
  const refetchTimerRef = useRef(null)

  // Fetch clients data
  const fetchClients = useCallback(async (silent = false) => {
    // Generate unique request ID to track this specific request
    const currentRequestId = ++requestIdRef.current
    
    // Only cancel if there's already a request in flight to prevent race conditions
    // Don't cancel user-initiated requests (non-silent) to ensure they always complete
    if (abortControllerRef.current && isFetchingRef.current && silent) {
      try { abortControllerRef.current.abort() } catch {}
    }
    // Create new AbortController for this request
    abortControllerRef.current = new AbortController()
    lastRequestWasSilentRef.current = !!silent
    isFetchingRef.current = true
    if (!silent) setProgressActive(true)
    console.log('[Client2] fetchClients called - requestId:', currentRequestId, 'silent:', silent, 'columnFilters:', columnFilters)
    try {
      // Only show loading spinner on initial page load, not on subsequent fetches
      if (!silent && initialLoad) {
        setLoading(true)
      }
      setError('')
      // Normalize axios response shapes: some backends return data under data.data
      const extractData = (resp) => (resp?.data?.data) || (resp?.data) || resp

      // Build request payload - simple pagination (column filters handled by /fields endpoint)
      const payload = {
        page: Number(currentPage) || 1,
        limit: Number(itemsPerPage) || 100
      }

      // Add search query if present - API will handle searching across all fields
      if (debouncedSearchQuery && debouncedSearchQuery.trim()) {
        payload.search = debouncedSearchQuery.trim()
      }

      // Add filters if present
      const combinedFilters = []
      // Capture login checkbox selections to apply via mt5Accounts (OR semantics)
      let checkboxLoginIds = []

      // Inject server-side quick filters (full dataset filtering)
      if (quickFilters?.hasFloating) {
        // Has Floating: exclude rows where floating == 0 (allow negative or positive)
        combinedFilters.push({ field: 'floating', operator: 'not_equal', value: '0' })
      }
      if (quickFilters?.hasCredit) {
        // Has Credit: credit strictly greater than 0
        combinedFilters.push({ field: 'credit', operator: 'greater_than', value: '0' })
      }
      if (quickFilters?.noDeposit) {
        // No Deposit: lifetimeDeposit == 0
        combinedFilters.push({ field: 'lifetimeDeposit', operator: 'equal', value: '0' })
      }
      // Track fields that already have text/number filters to avoid mixing with checkbox filters for same field
      const textFilteredFields = new Set()
      const numberFilteredFields = new Set()
      if (filters && filters.length > 0) {
        combinedFilters.push(...filters)
      }

      // Map UI column keys to API field names (backend uses different naming for some fields)
      const columnKeyToAPIField = (colKey) => {
        // Map UI keys to backend field names per API spec
        // Text columns should be lowercase per backend requirement (e.g., 'name', not 'Name')
        const fieldMap = {
          name: 'name',
          email: 'email',
          phone: 'phone',
          country: 'country',
          currency: 'currency',
          lifetimePnL: 'lifetimePnL',
          thisMonthPnL: 'thisMonthPnL',
          thisWeekPnL: 'thisWeekPnL',
          dailyPnL: 'dailyPnL',
          marginLevel: 'marginLevel',
          marginFree: 'marginFree',
          lastAccess: 'lastAccess',
          zipCode: 'zipCode',
          middleName: 'middleName',
          lastName: 'lastName',
          processorType: 'processorType',
          accountType: 'accountType'
        }
        return fieldMap[colKey] || colKey
      }

      // Add column header filters: text, number, checkbox
      // Text filters
      Object.entries(columnFilters || {}).forEach(([key, cfg]) => {
        if (key.endsWith('_text') && cfg) {
          const uiKey = key.replace('_text', '')
          const field = columnKeyToAPIField(uiKey)
          textFilteredFields.add(field) // Track that this field has a text filter
          const opMap = { equal: 'equal', notEqual: 'not_equal', contains: 'contains', doesNotContain: 'not_contains', startsWith: 'starts_with', endsWith: 'ends_with' }
          const op = opMap[cfg.operator] || cfg.operator
          const val = cfg.value
          if (val != null && String(val).length > 0) {
            combinedFilters.push({ field, operator: op, value: String(val).trim() })
          }
        }
      })
      // Number filters
      Object.entries(columnFilters || {}).forEach(([key, cfg]) => {
        if (key.endsWith('_number') && cfg) {
          const uiKey = key.replace('_number', '')
          const field = columnKeyToAPIField(uiKey)
          numberFilteredFields.add(field) // Track that this field has a number filter
          const op = cfg.operator
          const v1 = cfg.value1
          const v2 = cfg.value2
          const num1 = v1 !== '' && v1 != null ? Number(v1) : null
          const num2 = v2 !== '' && v2 != null ? Number(v2) : null
          if (op === 'between') {
            if (num1 != null && Number.isFinite(num1)) combinedFilters.push({ field, operator: 'greater_than_equal', value: String(num1) })
            if (num2 != null && Number.isFinite(num2)) combinedFilters.push({ field, operator: 'less_than_equal', value: String(num2) })
          } else if (op && num1 != null && Number.isFinite(num1)) {
            combinedFilters.push({ field, operator: op, value: String(num1) })
          }
        }
      })
      // Add checkbox filters - default server-side IN filtering (works for up to backend limit)
      Object.keys(columnFilters).forEach(filterKey => {
        if (filterKey.endsWith('_checkbox')) {
          const columnKey = filterKey.replace('_checkbox', '')
          const filterValues = columnFilters[filterKey]?.values || []

          if (filterValues.length > 0) {
            const field = columnKeyToAPIField(columnKey)

            // Skip checkbox filter if text or number filter is already active for this field
            if (textFilteredFields.has(field) || numberFilteredFields.has(field)) {
              console.log(`[Client2] 🔍 Checkbox ${columnKey}: skipped (text/number filter active)`)
              return
            }

            // Special-case: login filters should use mt5Accounts param, not filters
            if (columnKey === 'login') {
              const vals = Array.from(new Set(filterValues.map(v => Number(v)).filter(v => Number.isFinite(v))))
              if (vals.length > 0) {
                checkboxLoginIds = vals
                console.log(`[Client2] 🔍 Checkbox login: routing to mt5Accounts with ${vals.length} values`)
              }
            } else {
              const selectedValues = Array.from(new Set(filterValues.map(v => String(v).trim()).filter(Boolean)))

              // When there's a search active, only consider visible (filtered) values
              const allValues = columnValues[columnKey] || []
              const searchQ = (columnValueSearch[columnKey] || '').toLowerCase()
              const visibleValues = searchQ ? allValues.filter(v => String(v).toLowerCase().includes(searchQ)) : allValues

              // Transform processorType friendly labels back to numeric values for API (1 or 0)
              let apiValues = selectedValues
              if (columnKey === 'processorType') {
                apiValues = selectedValues.map(v => {
                  if (v === 'Connected') return 1
                  if (v === 'Not Connected') return 0
                  return v // fallback for any unexpected values
                })
                console.log('[Client2] 🔍 processorType filter transformation:', selectedValues, '→', apiValues)
              }

              combinedFilters.push({ field, operator: 'in', value: apiValues })
              console.log(`[Client2] 🔍 Checkbox ${columnKey}: using in with ${apiValues.length} values`, apiValues)
            }
          }
        }
      })

      if (combinedFilters.length > 0) {
        payload.filters = combinedFilters
        console.log('[Client2] Built filters:', JSON.stringify(combinedFilters, null, 2))
      }

      // Build MT5 accounts filter, merging Account modal, Login checkbox selection, Active Group (manual list), and selected IB accounts
      let mt5AccountsFilter = []
      // From Account Filter modal
      if (Array.isArray(mt5Accounts) && mt5Accounts.length > 0) {
        mt5AccountsFilter = [...new Set(mt5Accounts.map(Number))]
      }

      // From Login checkbox header filter (union with modal accounts)
      if (Array.isArray(checkboxLoginIds) && checkboxLoginIds.length > 0) {
        const union = new Set([...(mt5AccountsFilter || []).map(Number), ...checkboxLoginIds.map(Number)])
        mt5AccountsFilter = Array.from(union)
        console.log('[Client2] 🔗 Merged login checkbox IDs into mt5AccountsFilter:', mt5AccountsFilter.length)
      }

      // Add account range filter if present
      if (accountRangeMin && accountRangeMin.trim()) {
        payload.accountRangeMin = parseInt(accountRangeMin.trim())
      }
      if (accountRangeMax && accountRangeMax.trim()) {
        payload.accountRangeMax = parseInt(accountRangeMax.trim())
      }

      // Check if we have any quick filters active (hasFloating, hasCredit, noDeposit)
      const hasQuickFilters = quickFilters?.hasFloating || quickFilters?.hasCredit || quickFilters?.noDeposit
      
      // Check if IB filter is active
      const hasIBFilter = selectedIB && Array.isArray(ibMT5Accounts) && ibMT5Accounts.length > 0

      // Apply IB-selected MT5 accounts first (cumulative order: IB -> Group)
      if (hasIBFilter) {
        const ibAccounts = ibMT5Accounts.map(Number)
        if (mt5AccountsFilter.length > 0) {
          const set = new Set(ibAccounts)
          mt5AccountsFilter = mt5AccountsFilter.filter(a => set.has(a)) // intersection
        } else {
          mt5AccountsFilter = [...new Set(ibAccounts)]
        }
        if (DEBUG_LOGS) console.log('[Client2] Applying IB filter:', ibAccounts.length, 'accounts')
      }

      // Add active group filter on top of IB filter - use API filtering
      if (activeGroup) {
        if (activeGroup.range) {
          // Range-based group
          payload.accountRangeMin = activeGroup.range.from
          payload.accountRangeMax = activeGroup.range.to
          if (DEBUG_LOGS) console.log('[Client2] Applying range group filter:', activeGroup.range)
        } else if (activeGroup.loginIds && activeGroup.loginIds.length > 0) {
          // Manual selection group: intersect with IB-filtered results
          const groupAccounts = activeGroup.loginIds.map(id => Number(id))
          if (mt5AccountsFilter.length > 0) {
            const set = new Set(groupAccounts)
            mt5AccountsFilter = mt5AccountsFilter.filter(a => set.has(a)) // intersection with IB results
          } else {
            mt5AccountsFilter = [...new Set(groupAccounts)]
          }
          if (DEBUG_LOGS) console.log('[Client2] Applying manual group filter:', groupAccounts.length, 'accounts')
        }
      }

      // Always send mt5Accounts as a dedicated parameter (server-side intersection like mobile)
      if (mt5AccountsFilter.length > 0) {
        payload.mt5Accounts = mt5AccountsFilter.map(a => String(a))
        if (DEBUG_LOGS) console.log('[Client2] Sending mt5Accounts to API:', payload.mt5Accounts.length)
      } else {
        // If IB or manual group was applied but intersection is empty, force empty result
        const manualGroupApplied = !!(activeGroup && activeGroup.loginIds && activeGroup.loginIds.length > 0)
        if (hasIBFilter || manualGroupApplied) {
          payload.mt5Accounts = ['0']
          if (DEBUG_LOGS) console.log('[Client2] Empty intersection; forcing empty result with mt5Accounts=["0"]')
        }
      }

      // Sorting Strategy: Always use server-side sorting to avoid timeouts
      // Send sort params to backend for proper pagination
      if (sortBy && sortBy.trim() !== '') {
        payload.sortBy = sortBy
        payload.sortOrder = sortOrder
      }

      // Detect large IN-filters that exceed backend limit and enable chunked merging
      const inFilters = (payload.filters || []).filter(f => f && f.operator === 'in' && Array.isArray(f.value))
      const LARGE_IN_THRESHOLD = 20 // Lower threshold for better backend compatibility, especially with text fields
      const largeInFilters = inFilters.filter(f => f.value.length > LARGE_IN_THRESHOLD)

      if (largeInFilters.length > 0) {
        const primaryLargeFilter = largeInFilters[0]
        const secondaryLargeFilters = largeInFilters.slice(1)
        const baseFilters = (payload.filters || []).filter(f => f !== primaryLargeFilter)

        const chunk = (arr, size) => {
          const out = []
          for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
          return out
        }

        const CHUNK_SIZE = LARGE_IN_THRESHOLD // stay within server cap
        const chunks = chunk(primaryLargeFilter.value, CHUNK_SIZE)
        const BIG_LIMIT = Math.max(1000, Number(itemsPerPage) || 100)
        const mergedMap = new Map()

        console.log(`[Client2] 🚚 Chunking '${primaryLargeFilter.field}' with ${primaryLargeFilter.value.length} values into ${chunks.length} chunks`)

        // Fetch all chunks and merge
        for (let ci = 0; ci < chunks.length; ci++) {
          const part = chunks[ci]
          const filtersForChunk = [...baseFilters, { field: primaryLargeFilter.field, operator: 'in', value: part }]
          const chunkPayload = { ...payload, page: 1, limit: BIG_LIMIT, filters: filtersForChunk }
          if (percentModeActive) chunkPayload.percentage = true

          console.log(`[Client2] 📡 Chunk ${ci + 1}/${chunks.length} payload:`, JSON.stringify(chunkPayload))

          // Page through this chunk if needed
          let pageNum = 1
          let totalPagesForChunk = 1
          do {
            chunkPayload.page = pageNum
            // Respect aborts and newer requests: pass signal and bail on staleness
            const resp = await brokerAPI.searchClients(chunkPayload, { signal: abortControllerRef.current.signal })
            if (abortControllerRef.current.signal.aborted || currentRequestId !== requestIdRef.current) {
              console.log('[Client2] ⏹️ Abort/replace detected during chunk merge; stopping early')
              return
            }
            const data = extractData(resp)
            const list = (data?.clients || []).filter(c => c != null && c.login != null)
            list.forEach(row => {
              if (!mergedMap.has(row.login)) mergedMap.set(row.login, row)
            })
            totalPagesForChunk = Math.max(1, Number(data?.pages || 1))
            pageNum += 1
          } while (pageNum <= totalPagesForChunk)
        }

        // Convert to array and apply any secondary large IN filters client-side (intersection)
        let mergedRows = Array.from(mergedMap.values())
        if (secondaryLargeFilters.length > 0) {
          console.warn('[Client2] Multiple large IN filters detected; applying secondary filters client-side')
          for (const f of secondaryLargeFilters) {
            const allowed = new Set(f.value.map(v => String(v)))
            mergedRows = mergedRows.filter(row => allowed.has(String(row[f.field])))
          }
        }

        // Compute totals from merged rows so face cards remain populated
        const sumField = (rows, key) => {
          let s = 0
          for (const r of rows) {
            const v = r?.[key]
            const n = typeof v === 'string' ? parseFloat(v) : (Number(v) || 0)
            if (!Number.isNaN(n)) s += n
          }
          return s
        }

        const totalsFromRows = {
          assets: sumField(mergedRows, 'assets'),
          balance: sumField(mergedRows, 'balance'),
          blockedCommission: sumField(mergedRows, 'blockedCommission'),
          blockedProfit: sumField(mergedRows, 'blockedProfit'),
          commission: sumField(mergedRows, 'commission'),
          credit: sumField(mergedRows, 'credit'),
          dailyBonusIn: sumField(mergedRows, 'dailyBonusIn'),
          dailyBonusOut: sumField(mergedRows, 'dailyBonusOut'),
          dailyCreditIn: sumField(mergedRows, 'dailyCreditIn'),
          dailyCreditOut: sumField(mergedRows, 'dailyCreditOut'),
          dailyDeposit: sumField(mergedRows, 'dailyDeposit'),
          dailyPnL: sumField(mergedRows, 'dailyPnL'),
          dailySOCompensationIn: sumField(mergedRows, 'dailySOCompensationIn'),
          dailySOCompensationOut: sumField(mergedRows, 'dailySOCompensationOut'),
          dailyWithdrawal: sumField(mergedRows, 'dailyWithdrawal'),
          equity: sumField(mergedRows, 'equity'),
          floating: sumField(mergedRows, 'floating'),
          liabilities: sumField(mergedRows, 'liabilities'),
          lifetimeBonusIn: sumField(mergedRows, 'lifetimeBonusIn'),
          lifetimeBonusOut: sumField(mergedRows, 'lifetimeBonusOut'),
          lifetimeCreditIn: sumField(mergedRows, 'lifetimeCreditIn'),
          lifetimeCreditOut: sumField(mergedRows, 'lifetimeCreditOut'),
          lifetimeDeposit: sumField(mergedRows, 'lifetimeDeposit'),
          lifetimePnL: sumField(mergedRows, 'lifetimePnL'),
          lifetimeSOCompensationIn: sumField(mergedRows, 'lifetimeSOCompensationIn'),
          lifetimeSOCompensationOut: sumField(mergedRows, 'lifetimeSOCompensationOut'),
          lifetimeWithdrawal: sumField(mergedRows, 'lifetimeWithdrawal'),
          margin: sumField(mergedRows, 'margin'),
          marginFree: sumField(mergedRows, 'marginFree'),
          marginInitial: sumField(mergedRows, 'marginInitial'),
          marginLevel: sumField(mergedRows, 'marginLevel'),
          marginMaintenance: sumField(mergedRows, 'marginMaintenance'),
          pnl: sumField(mergedRows, 'pnl'),
          previousEquity: sumField(mergedRows, 'previousEquity'),
          profit: sumField(mergedRows, 'profit'),
          storage: sumField(mergedRows, 'storage'),
          thisMonthBonusIn: sumField(mergedRows, 'thisMonthBonusIn'),
          thisMonthBonusOut: sumField(mergedRows, 'thisMonthBonusOut'),
          thisMonthCreditIn: sumField(mergedRows, 'thisMonthCreditIn'),
          thisMonthCreditOut: sumField(mergedRows, 'thisMonthCreditOut'),
          thisMonthDeposit: sumField(mergedRows, 'thisMonthDeposit'),
          thisMonthPnL: sumField(mergedRows, 'thisMonthPnL'),
          thisMonthSOCompensationIn: sumField(mergedRows, 'thisMonthSOCompensationIn'),
          thisMonthSOCompensationOut: sumField(mergedRows, 'thisMonthSOCompensationOut'),
          thisMonthWithdrawal: sumField(mergedRows, 'thisMonthWithdrawal'),
          thisWeekBonusIn: sumField(mergedRows, 'thisWeekBonusIn'),
          thisWeekBonusOut: sumField(mergedRows, 'thisWeekBonusOut'),
          thisWeekCreditIn: sumField(mergedRows, 'thisWeekCreditIn'),
          thisWeekCreditOut: sumField(mergedRows, 'thisWeekCreditOut'),
          thisWeekDeposit: sumField(mergedRows, 'thisWeekDeposit'),
          thisWeekPnL: sumField(mergedRows, 'thisWeekPnL'),
          thisWeekSOCompensationIn: sumField(mergedRows, 'thisWeekSOCompensationIn'),
          thisWeekSOCompensationOut: sumField(mergedRows, 'thisWeekSOCompensationOut'),
          thisWeekWithdrawal: sumField(mergedRows, 'thisWeekWithdrawal')
        }

        // Percentage totals (only when percentage mode requested in chunk calls)
        const totalsPercentFromRows = percentModeActive ? {
          lifetimePnL: sumField(mergedRows, 'lifetimePnL_percentage'),
          floating: sumField(mergedRows, 'floating_percentage')
        } : {}

        // Apply sort client-side to preserve UX
        if (sortBy) {
          const dir = (String(sortOrder || 'asc').toLowerCase() === 'desc') ? -1 : 1
          mergedRows.sort((a, b) => {
            const va = a?.[sortBy]
            const vb = b?.[sortBy]
            const na = Number(va), nb = Number(vb)
            if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir
            const sa = String(va ?? '').toLowerCase()
            const sb = String(vb ?? '').toLowerCase()
            if (sa < sb) return -1 * dir
            if (sa > sb) return 1 * dir
            return 0
          })
        }

        // Client-side pagination
        const totalMerged = mergedRows.length
        const limit = Number(itemsPerPage) || 100
        const page = Number(currentPage) || 1
        const start = (page - 1) * limit
        const end = start + limit
        const paged = mergedRows.slice(start, end)
        const pages = Math.max(1, Math.ceil(totalMerged / limit))

        setClients(paged)
        setTotalClients(totalMerged)
        setTotalPages(pages)
        setTotals(totalsFromRows)
        setTotalsPercent(totalsPercentFromRows)
        setError('')

        // Done via chunked mode; skip single-request path
        return
      }

      // ALWAYS fetch normal data for table display
      const shouldFetchPercentage = percentModeActive

      // Checkbox filters are now handled server-side via API filters (single request with comma-separated values)

      // Always log payload when filters are present to debug filtering issues
      if (payload.filters && payload.filters.length > 0) {
        console.log('[Client2] 🔍 API Request Payload:', JSON.stringify(payload, null, 2))
      }

      console.log('[Client2] 📡 Calling brokerAPI.searchClients with payload:', payload)

      // Fetch data - only fetch percentage data when in percentage mode
      if (shouldFetchPercentage) {
        // Fetch only percentage data
        const percentResponse = await brokerAPI.searchClients({ ...payload, percentage: true }, { signal: abortControllerRef.current.signal })
        
        // Ignore response if it's from an outdated request (stale data)
        if (currentRequestId !== requestIdRef.current) {
          console.log('[Client2] Ignoring stale percentage response from request', currentRequestId, '(current:', requestIdRef.current, ')')
          return
        }
        
        const percentData = extractData(percentResponse)
        const percentClients = (percentData?.clients || []).filter(c => c != null && c.login != null)
        const percentTotals = percentData?.totals || {}
        const percentTotal = Number(percentData?.total || percentClients.length || 0)
        const pages = Math.max(1, Number(percentData?.pages || 1))

        setClients(percentClients)
        setTotalClients(percentTotal)
        setTotalPages(pages)
        setTotals({}) // Clear normal totals
        setTotalsPercent(percentTotals)
        setError('')
      } else {
        // Fetch only normal data
        const normalResponse = await brokerAPI.searchClients(payload, { signal: abortControllerRef.current.signal })
        
        // Ignore response if it's from an outdated request (stale data)
        if (currentRequestId !== requestIdRef.current) {
          console.log('[Client2] Ignoring stale normal response from request', currentRequestId, '(current:', requestIdRef.current, ')')
          return
        }
        
        const normalData = extractData(normalResponse)
        const normalClients = (normalData?.clients || []).filter(c => c != null && c.login != null)
        const normalTotals = normalData?.totals || {}
        const normalTotal = Number(normalData?.total || normalClients.length || 0)
        const pages = Math.max(1, Number(normalData?.pages || 1))

        setClients(normalClients)
        setTotalClients(normalTotal)
        setTotalPages(pages)
        setTotals(normalTotals)
        setTotalsPercent({})
        setError('')
      }
    } catch (err) {
      // Ignore request cancellations caused by in-flight aborts
      const isCanceled = err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || /aborted|canceled/i.test(err?.message || '')
      if (isCanceled) {
        try { if (DEBUG_LOGS) console.debug('[Client2] fetchClients canceled (expected on fast refresh)') } catch { }
        return
      }
      console.error('[Client2] Error fetching clients:', err)
      console.error('[Client2] Error details:', {
        message: err.message,
        code: err.code,
        response: err.response?.data,
        status: err.response?.status,
        url: err.config?.url
      })
      // If unauthorized, pause auto-refresh until token is refreshed
      if (err?.response?.status === 401) {
        setUnauthorized(true)
      }
      if (!silent) {
        let errorMessage = 'Failed to fetch clients'
        if (err.code === 'ERR_NETWORK') {
          errorMessage = 'Network error: Unable to connect to server. Please check if the backend is running.'
        } else if (err.response?.status === 401) {
          errorMessage = 'Authentication failed. Please login again.'
        } else if (err.response?.status === 403) {
          errorMessage = 'Access denied. You do not have permission to view this data.'
        } else if (err.response?.status === 500) {
          errorMessage = 'Server error. Please try again later.'
        } else if (err.response?.data?.message) {
          errorMessage = err.response.data.message
        } else if (err.message) {
          errorMessage = err.message
        }
        setError(errorMessage)
      }
    } finally {
      isFetchingRef.current = false
      if (!silent) {
        setLoading(false)
        setProgressActive(false)
      }
      // Mark initial load complete and always reset sorting state
      setInitialLoad(false)
      setIsSorting(false)
    }
  }, [currentPage, itemsPerPage, debouncedSearchQuery, filters, columnFilters, mt5Accounts, accountRangeMin, accountRangeMax, sortBy, sortOrder, percentModeActive, activeGroup, selectedIB, ibMT5Accounts, quickFilters])

  // Resume after successful token refresh
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

  // Clear cached column values when filters change (IB, group, accounts, filters, search)
  // This ensures column value dropdowns always fetch fresh data from API
  useEffect(() => {
    setColumnValues({})
    setSelectedColumnValues({})
  }, [selectedIB, ibMT5Accounts, activeGroup, mt5Accounts, accountRangeMin, accountRangeMax, filters, debouncedSearchQuery, quickFilters])

  // Refetch when any percent face card visibility toggles (desktop only)
  useEffect(() => {
    if (isMobile || !isAuthenticated || unauthorized) return
    fetchClients(false)
  }, [percentModeActive, fetchClients, isMobile, isAuthenticated, unauthorized])

  // Client-side filtering for search across common text fields (including country)
  const sortedClients = useMemo(() => {
    // If loading, return empty array to prevent showing stale data
    if (loading) return []
    
    if (!Array.isArray(clients)) return []
    // Return clients as-is since search is already handled by the API
    // The searchQuery is sent to the API in fetchClients, so no need for client-side filtering
    return clients.filter(c => c != null && c.login != null)
  }, [clients, loading])

  // Compute percentage totals by summing percentage columns from client data
  const computedPercentageTotals = useMemo(() => {
    const dataSource = sortedClients
    
    if (!Array.isArray(dataSource) || dataSource.length === 0) {
      return {
        dailyDeposit: 0,
        dailyWithdrawal: 0,
        lifetimePnL: 0
      }
    }
    
    return {
      dailyDeposit: dataSource.reduce((sum, client) => sum + (parseFloat(client.dailyDeposit_percentage) || 0), 0),
      dailyWithdrawal: dataSource.reduce((sum, client) => sum + (parseFloat(client.dailyWithdrawal_percentage) || 0), 0),
      lifetimePnL: dataSource.reduce((sum, client) => sum + (parseFloat(client.lifetimePnL_percentage) || 0), 0)
    }
  }, [sortedClients])

  // Debounce search query to prevent API collision
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300) // 300ms debounce delay
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch rebate totals from API
  const fetchRebateTotals = useCallback(async () => {
    try {
      const response = await brokerAPI.getIBCommissionTotals()
      // API returns nested structure: response.data.data
      const data = response?.data?.data || response?.data || {}
      console.log('[Client2] Rebate totals received:', data)
      setRebateTotals({
        availableRebate: data.total_available_commission || 0,
        availableRebatePercent: data.total_available_commission_percentage || 0,
        totalRebate: data.total_commission || 0,
        totalRebatePercent: data.total_commission_percentage || 0
      })
    } catch (err) {
      console.error('[Client2] Error fetching rebate totals:', err)
    }
  }, [])

  // Initial fetch and refetch on dependency changes (desktop only)
  useEffect(() => {
    if (isMobile || !isAuthenticated || unauthorized) return
    if (refetchTimerRef.current) {
      clearTimeout(refetchTimerRef.current)
    }
    // Debounce refetch slightly to coalesce rapid filter changes and avoid cancel spam
    refetchTimerRef.current = setTimeout(() => {
      console.log('[Client2] ⚡ Debounced refetch triggered')
      fetchClients(false)
      fetchRebateTotals()
      refetchTimerRef.current = null
    }, 200)
    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current)
        refetchTimerRef.current = null
      }
    }
  }, [fetchClients, fetchRebateTotals, isMobile, isAuthenticated, unauthorized, columnFilters, debouncedSearchQuery, currentPage, itemsPerPage, sortBy, sortOrder, quickFilters])

  // Auto-refresh rebate totals every 1 hour (desktop only)
  useEffect(() => {
    if (isMobile) return
    const intervalId = setInterval(() => {
      fetchRebateTotals()
    }, 3600000) // 3600000ms = 1 hour
    return () => clearInterval(intervalId)
  }, [fetchRebateTotals, isMobile])

  // Removed server-side quick filter refetch; quick filters now apply client-side to current page only

  // Percentage view is now controlled by Card Filter (cardVisibility.percentage) and fetched together with main data

  // Auto-refresh every 2 seconds to keep data updated (including filtered data) - desktop only
  useEffect(() => {
    if (isMobile || !isAuthenticated || unauthorized) return
    // Avoid polling when tab is hidden
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const intervalId = setInterval(() => {
      // Skip polling while recent user filter actions are active
      if (Date.now() < pausePollingUntilRef.current) return
      fetchClients(true) // silent = true, no loading spinner - will refresh with current filters applied
    }, 2000)
    return () => clearInterval(intervalId)
  }, [fetchClients, isMobile, isAuthenticated, unauthorized])

  // Handle search
  const handleSearch = () => {
    setSearchQuery(searchInput)
    setCurrentPage(1)
    setShowSuggestions(false)
  }

  // Get search suggestions based on current input
  const getSuggestions = () => {
    if (!searchInput || searchInput.length < 2) return []
    
    const query = searchInput.toLowerCase()
    const suggestions = new Set()
    
    // Get suggestions from current clients data
    clients.forEach(client => {
      // Check login
      if (client.login && String(client.login).toLowerCase().includes(query)) {
        suggestions.add(String(client.login))
      }
      // Check name
      if (client.name && client.name.toLowerCase().includes(query)) {
        suggestions.add(client.name)
      }
      // Check group
      if (client.group && client.group.toLowerCase().includes(query)) {
        suggestions.add(client.group)
      }
      // Check email
      if (client.email && client.email.toLowerCase().includes(query)) {
        suggestions.add(client.email)
      }
    })
    
    return Array.from(suggestions).slice(0, 5)
  }

  const handleSuggestionClick = (suggestion) => {
    setSearchInput(suggestion)
    setSearchQuery(suggestion)
    setCurrentPage(1)
    setShowSuggestions(false)
  }

  // Handle sort
  const handleSort = (columnKey) => {
    // Prevent multiple sort clicks while sorting is in progress
    if (isSorting) {
      return
    }

    // Set sorting loading state
    setIsSorting(true)

    // Increment animation key to force re-render and re-trigger animations
    setAnimationKey(prev => prev + 1)

    if (sortBy === columnKey) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(columnKey)
      setSortOrder('asc')
    }
    // Don't reset page - keep user on current page
  }

  // Column resize handlers - expands/contracts table width instead of stealing from neighbor
  const handleResizeStart = useCallback((e, columnKey) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    resizeStartX.current = e.clientX
    // Measure the actual current width of the header cell for accurate resizing
    const measured = headerRefs.current?.[columnKey]?.getBoundingClientRect()?.width
    resizeStartWidth.current = (typeof measured === 'number' && measured > 0)
      ? measured
      : (columnWidths[columnKey] || getDefaultColumnWidth({ key: columnKey }))
  }, [columnWidths])

  const handleResizeMove = useCallback((e) => {
    if (!resizingColumn) return

    // Auto-scroll when dragging near edges of scroll container
    const scrollContainer = hScrollRef.current
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect()
      const scrollEdgeThreshold = 50 // pixels from edge to trigger scroll
      const scrollSpeed = 10 // pixels to scroll per frame

      // Check if mouse is near left edge
      if (e.clientX < rect.left + scrollEdgeThreshold && scrollContainer.scrollLeft > 0) {
        scrollContainer.scrollLeft -= scrollSpeed
      }
      // Check if mouse is near right edge
      else if (e.clientX > rect.right - scrollEdgeThreshold) {
        scrollContainer.scrollLeft += scrollSpeed
      }
    }

    // Use requestAnimationFrame for smooth rendering
    if (resizeRAF.current) {
      cancelAnimationFrame(resizeRAF.current)
    }
    resizeRAF.current = requestAnimationFrame(() => {
      const diff = e.clientX - resizeStartX.current
      // Allow both directions with min width 50px
      const newWidth = Math.max(50, resizeStartWidth.current + diff)

      // Simply update the column width - table will expand/contract accordingly
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
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

  const handleAutoFit = (columnKey, baseKey) => {
    try {
      const headerText = visibleColumnsList.find(c => c.key === columnKey)?.label || ''
      const headerWidth = measureText(headerText) + 60 // +60 for padding, icons, etc

      let maxCellWidth = headerWidth
      // Guard: filter out null/undefined clients
      const columnData = (clients || []).filter(row => row != null).map(row => row[baseKey || columnKey])

      columnData.forEach(val => {
        const cellWidth = measureText(val) + 40 // +40 for padding
        if (cellWidth > maxCellWidth) maxCellWidth = cellWidth
      })

      const finalWidth = Math.max(50, Math.min(600, Math.ceil(maxCellWidth)))
      setColumnWidths(prev => ({ ...prev, [columnKey]: finalWidth }))
    } catch (err) {
      console.error('[Client2Page] Auto-fit error:', err)
    }
  }

  // Column drag and drop handlers for reordering
  const handleColumnDragStart = (e, columnKey) => {
    setDraggedColumn(columnKey)
    e.dataTransfer.effectAllowed = 'move'

    // Create custom drag image showing the full column header
    const headerElement = headerRefs.current[columnKey]
    if (headerElement) {
      // Clone the header element for drag preview
      const clone = headerElement.cloneNode(true)
      clone.style.position = 'absolute'
      clone.style.top = '-9999px'
      clone.style.width = `${headerElement.offsetWidth}px`
      clone.style.backgroundColor = '#2563eb'
      clone.style.padding = '12px 16px'
      clone.style.borderRadius = '6px'
      clone.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      document.body.appendChild(clone)
      e.dataTransfer.setDragImage(clone, headerElement.offsetWidth / 2, 20)
      setTimeout(() => document.body.removeChild(clone), 0)
    }
  }

  const handleColumnDragOver = (e, columnKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (columnKey !== draggedColumn) {
      setDragOverColumn(columnKey)
    }
  }

  const handleColumnDragLeave = () => {
    setDragOverColumn(null)
  }

  const handleColumnDrop = (e, targetColumnKey) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggedColumn || draggedColumn === targetColumnKey) {
      setDraggedColumn(null)
      setDragOverColumn(null)
      return
    }

    // Get current order from visibleColumnsList
    const currentOrder = visibleColumnsList.map(col => col.key)
    const draggedIndex = currentOrder.indexOf(draggedColumn)
    const targetIndex = currentOrder.indexOf(targetColumnKey)

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedColumn(null)
      setDragOverColumn(null)
      return
    }

    // Create new order array
    const newOrder = [...currentOrder]
    const [removed] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, removed)

    setColumnOrder(newOrder)
    setDraggedColumn(null)
    setDragOverColumn(null)
  }

  const handleColumnDragEnd = () => {
    setDraggedColumn(null)
    setDragOverColumn(null)
  }

  // Column filter functions
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
        if (!client) return // Guard: skip null/undefined clients
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
    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200
    
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
    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200
    
    const allValues = getUniqueColumnValues(columnKey)
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: allValues
    }))
  }

  const deselectAllFilters = (columnKey) => {
    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200
    
    setColumnFilters(prev => {
      const { [columnKey]: _, ...rest } = prev
      return rest
    })
  }

  const clearColumnFilter = (columnKey) => {
    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200
    
    setColumnFilters(prev => {
      const numberFilterKey = `${columnKey}_number`
      const textFilterKey = `${columnKey}_text`
      const checkboxFilterKey = `${columnKey}_checkbox`
      const { [columnKey]: _, [numberFilterKey]: __, [textFilterKey]: ___, [checkboxFilterKey]: ____, ...rest } = prev
      return rest
    })
    setFilterSearchQuery(prev => {
      const { [columnKey]: _, ...rest } = prev
      return rest
    })
    // Reset selected values to all
    if (columnValues[columnKey]) {
      setSelectedColumnValues(prev => ({
        ...prev,
        [columnKey]: [...columnValues[columnKey]]
      }))
    }
    clearSort(columnKey)
    setShowFilterDropdown(null)
    console.log('[Client2] ✅ Checkbox filter cleared (client-side filtering updated)')
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

    // Check for checkbox value filter
    const checkboxFilterKey = `${columnKey}_checkbox`
    const hasCheckboxFilter = columnFilters[checkboxFilterKey] ? 1 : 0

    return checkboxCount + hasNumberFilter + hasTextFilter + hasCheckboxFilter
  }

  const isAllSelected = (columnKey) => {
    const allValues = getUniqueColumnValues(columnKey)
    const selectedValues = columnFilters[columnKey] || []
    return allValues.length > 0 && selectedValues.length === allValues.length
  }

  const applyNumberFilter = (columnKey) => {
    const temp = numericFilterTemp[columnKey]
    if (!temp || temp.value1 === '' || temp.value1 == null) return

    if (temp.operator === 'between' && (temp.value2 === '' || temp.value2 == null)) return

    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200

    const filterConfig = {
      operator: temp.operator,
      value1: parseFloat(temp.value1),
      value2: temp.value2 ? parseFloat(temp.value2) : null
    }

    console.log('[Client2] applyNumberFilter called for', columnKey, 'with config:', filterConfig)

    // Clear clients and set loading state immediately to prevent showing old data
    setClients([])
    setLoading(true)

    setColumnFilters(prev => {
      const updated = {
        ...prev,
        [`${columnKey}_number`]: filterConfig
      }
      console.log('[Client2] Updated columnFilters:', updated)
      return updated
    })

    setShowFilterDropdown(null)
    setCurrentPage(1)

    // No direct fetch; useEffect on columnFilters will handle refetch
  }

  const initNumericFilterTemp = (columnKey) => {
    if (!numericFilterTemp[columnKey]) {
      setNumericFilterTemp(prev => ({
        ...prev,
        [columnKey]: { operator: 'equal', value1: '', value2: '' }
      }))
    }
  }

  const updateNumericFilterTemp = (columnKey, field, value) => {
    setNumericFilterTemp(prev => ({
      ...prev,
      [columnKey]: {
        ...prev[columnKey],
        [field]: value
      }
    }))
  }

  const initTextFilterTemp = (columnKey) => {
    if (!textFilterTemp[columnKey]) {
      setTextFilterTemp(prev => ({
        ...prev,
        [columnKey]: { operator: 'equal', value: '', caseSensitive: false }
      }))
    }
  }

  const updateTextFilterTemp = (columnKey, field, value) => {
    setTextFilterTemp(prev => ({
      ...prev,
      [columnKey]: {
        ...prev[columnKey],
        [field]: value
      }
    }))
  }

  const applyTextFilter = (columnKey) => {
    const temp = textFilterTemp[columnKey]
    if (!temp || !temp.value) return

    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200

    const filterConfig = {
      operator: temp.operator,
      value: temp.value,
      caseSensitive: temp.caseSensitive
    }

    console.log('[Client2] applyTextFilter called for', columnKey, 'with config:', filterConfig)

    // Clear clients and set loading state immediately to prevent showing old data
    setClients([])
    setLoading(true)

    setColumnFilters(prev => {
      const updated = {
        ...prev,
        [`${columnKey}_text`]: filterConfig
      }
      console.log('[Client2] Updated columnFilters:', updated)
      return updated
    })

    setShowFilterDropdown(null)
    setCurrentPage(1)

    // No direct fetch; useEffect on columnFilters will handle refetch
  }

  // Build payload for fetching column values using current table filters (server-side), excluding the current column's header filter
  const buildColumnValuesPayload = (columnKey, page = 1, limit = columnValuesBatchSize) => {
    const payload = {
      page: Number(page) || 1,
      limit: Number(limit) || columnValuesBatchSize
    }
    if (searchQuery && searchQuery.trim()) payload.search = searchQuery.trim()

    // Collect filters like in fetchClients, but skip filters for the same columnKey to avoid self-filtering
    const combinedFilters = []
    let multiOrField = null
    let multiOrValues = []
    let multiOrConflict = false
    const textFilteredFields = new Set()
    const numberFilteredFields = new Set()

    // Table-level filters
    if (filters && filters.length > 0) combinedFilters.push(...filters)

    const columnKeyToAPIField = (colKey) => {
      const fieldMap = {
        lifetimePnL: 'lifetimePnL',
        thisMonthPnL: 'thisMonthPnL',
        thisWeekPnL: 'thisWeekPnL',
        dailyPnL: 'dailyPnL',
        marginLevel: 'marginLevel',
        marginFree: 'marginFree',
        lastAccess: 'lastAccess',
        zipCode: 'zipCode',
        middleName: 'middleName',
        lastName: 'lastName',
        processorType: 'processorType',
        accountType: 'accountType'
      }
      return fieldMap[colKey] || colKey
    }

    // Header filters except the current column
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      Object.entries(columnFilters).forEach(([key, cfg]) => {
        if (key.startsWith(columnKey + '_')) return // skip same column
        if (key.endsWith('_text') && cfg) {
          const uiKey = key.replace('_text', '')
          const field = columnKeyToAPIField(uiKey)
          const opMap = { equal: 'equal', notEqual: 'not_equal', contains: 'contains', doesNotContain: 'not_contains', startsWith: 'starts_with', endsWith: 'ends_with' }
          const op = opMap[cfg.operator] || cfg.operator
          const val = cfg.value
          if (val != null && String(val).length > 0) {
            combinedFilters.push({ field, operator: op, value: String(val).trim() })
            textFilteredFields.add(uiKey)
          }
          return
        }
        if (key.endsWith('_number') && cfg) {
          const uiKey = key.replace('_number', '')
          if (uiKey === columnKey) return
          const field = columnKeyToAPIField(uiKey)
          const op = cfg.operator
          const v1 = cfg.value1
          const v2 = cfg.value2
          const num1 = v1 !== '' && v1 != null ? Number(v1) : null
          const num2 = v2 !== '' && v2 != null ? Number(v2) : null
          if (op === 'between') {
            if (num1 != null && Number.isFinite(num1)) combinedFilters.push({ field, operator: 'greater_than_equal', value: String(num1) })
            if (num2 != null && Number.isFinite(num2)) combinedFilters.push({ field, operator: 'less_than_equal', value: String(num2) })
          } else if (op && num1 != null && Number.isFinite(num1)) {
            combinedFilters.push({ field, operator: op, value: String(num1) })
          }
          numberFilteredFields.add(uiKey)
          return
        }
      })
      Object.entries(columnFilters).forEach(([key, cfg]) => {
        if (key.endsWith('_checkbox') && cfg && Array.isArray(cfg.values) && cfg.values.length > 0) {
          const uiKey = key.replace('_checkbox', '')
          if (uiKey === columnKey) return
          const field = columnKeyToAPIField(uiKey)
          if (textFilteredFields.has(uiKey) || numberFilteredFields.has(uiKey)) return
          const rawValues = cfg.values.map(v => String(v).trim()).filter(v => v.length > 0)
          if (rawValues.length === 0) return
          if (rawValues.length === 1) {
            combinedFilters.push({ field, operator: 'equal', value: rawValues[0] })
          } else {
            // Provide array for backend; treat multi-value as OR by storing values list
            if (multiOrField && multiOrField !== field) multiOrConflict = true
            else { multiOrField = field; multiOrValues = rawValues }
          }
        }
      })
    }
    if (combinedFilters.length > 0) payload.filters = combinedFilters

    // Merge account filters/group/IB
    let mt5AccountsFilter = []
    if (Array.isArray(mt5Accounts) && mt5Accounts.length > 0) mt5AccountsFilter = [...new Set(mt5Accounts.map(Number))]
    if (accountRangeMin && accountRangeMin.trim()) payload.accountRangeMin = parseInt(accountRangeMin.trim())
    if (accountRangeMax && accountRangeMax.trim()) payload.accountRangeMax = parseInt(accountRangeMax.trim())
    if (activeGroup) {
      if (activeGroup.range) {
        payload.accountRangeMin = activeGroup.range.from
        payload.accountRangeMax = activeGroup.range.to
      } else if (activeGroup.loginIds && activeGroup.loginIds.length > 0) {
        const groupAccounts = activeGroup.loginIds.map(id => Number(id))
        if (mt5AccountsFilter.length > 0) {
          const set = new Set(groupAccounts)
          mt5AccountsFilter = mt5AccountsFilter.filter(a => set.has(a))
        } else {
          mt5AccountsFilter = [...new Set(groupAccounts)]
        }
      }
    }
    if (selectedIB && Array.isArray(ibMT5Accounts) && ibMT5Accounts.length > 0) {
      const ibAccounts = ibMT5Accounts.map(Number)
      if (mt5AccountsFilter.length > 0) {
        const set = new Set(ibAccounts)
        mt5AccountsFilter = mt5AccountsFilter.filter(a => set.has(a))
      } else {
        mt5AccountsFilter = [...new Set(ibAccounts)]
      }
    }
    if (mt5AccountsFilter.length > 0) {
      payload.mt5Accounts = mt5AccountsFilter.map(a => String(a))
    } else {
      const manualGroupApplied = !!(activeGroup && activeGroup.loginIds && activeGroup.loginIds.length > 0)
      const hasIBFilter = selectedIB && Array.isArray(ibMT5Accounts) && ibMT5Accounts.length > 0
      if (hasIBFilter || manualGroupApplied) {
        payload.mt5Accounts = ['0']
      }
    }
    return { payload, multiOrField, multiOrValues, multiOrConflict }
  }

  // Fetch column values with search filter (server-side search using dedicated endpoint)
  const fetchColumnValuesWithSearch = async (columnKey, searchQuery = '', forceRefresh = false) => {
    setProgressActive(true)
    // Allow API calls for a broader set of text columns to ensure filtering works across more fields
    const allowedColumns = [
      // Identifiers
      'login', 'id',
      // Names & contact
      'name', 'lastName', 'middleName', 'email', 'phone',
      // Account metadata
      'group', 'accountType', 'status', 'currency', 'leverage', 'comment',
      // Location
      'country', 'city', 'state', 'address', 'zipCode', 'company',
      // Leads & processing
      'leadSource', 'leadCampaign', 'processorType'
    ]
    if (!allowedColumns.includes(columnKey)) {
      console.log(`[Client2] Skipping API call for non-whitelisted column: ${columnKey}`)
      // Initialize states to prevent undefined values
      setColumnValues(prev => ({ ...prev, [columnKey]: [] }))
      setColumnValuesLoading(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesLoadingMore(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: 0 }))
      setColumnValuesTotalPages(prev => ({ ...prev, [columnKey]: 0 }))
      return
    }

    // Don't fetch if already loading
    if (columnValuesLoading[columnKey]) return
    // Skip for unsupported fields
    if (columnValuesUnsupported[columnKey]) return

    setColumnValuesLoading(prev => ({ ...prev, [columnKey]: true }))
    setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: 1 }))
    // Reset scroll gating for this column
    columnScrollUserActionRef.current[columnKey] = false
    columnScrollLastTriggerRef.current[columnKey] = -Infinity
    columnLastScrollTopRef.current[columnKey] = 0

    try {
      // Use dedicated fields API endpoint that searches across ALL data
      const baseParams = {
        fields: columnKey,
        search: searchQuery.trim() || undefined
      }

      // Add quick filter constraints as query params
      if (quickFilters?.hasFloating) {
        baseParams.hasFloating = true
      }
      if (quickFilters?.hasCredit) {
        baseParams.hasCredit = true
      }
      if (quickFilters?.noDeposit) {
        baseParams.noDeposit = true
      }

      // Add group filter if active
      if (activeGroup?.logins && activeGroup.logins.length > 0) {
        baseParams.logins = activeGroup.logins.join(',')
      }

      // Add IB filter if active
      if (selectedIB && ibMT5Accounts && ibMT5Accounts.length > 0) {
        baseParams.ibAccounts = ibMT5Accounts.join(',')
      }

      const setVals = new Set()

      if (searchQuery && searchQuery.trim()) {
        // When searching, fetch first page only and enable lazy loading for more
        const firstParams = { ...baseParams, page: 1, limit: 500 }
        const firstResponse = await brokerAPI.getClientFields(firstParams)
        const extract = (resp) => (resp?.data?.data) || (resp?.data) || resp
        const firstData = extract(firstResponse)

        // Extract values from first page
        const firstClients = firstData?.clients || []
        firstClients.forEach(client => {
          const v = client?.[columnKey]
          if (v !== null && v !== undefined && v !== '') setVals.add(v)
        })

        // Get total pages to determine if there's more data
        const totalPages = Math.max(1, Number(firstData?.pages || firstData?.totalPages || 1))
        const uniqueValues = Array.from(setVals).sort((a, b) => String(a).localeCompare(String(b)))

        setColumnValues(prev => ({ ...prev, [columnKey]: uniqueValues }))
        setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: 1 }))
        setColumnValuesTotalPages(prev => ({ ...prev, [columnKey]: totalPages }))
        setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: totalPages > 1 }))
      }
    } catch (err) {
      console.error(`[Client2Page] Error fetching column values with search for ${columnKey}:`, err)
      setColumnValues(prev => ({ ...prev, [columnKey]: [] }))
      setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesTotalPages(prev => ({ ...prev, [columnKey]: null }))
    } finally {
      setColumnValuesLoading(prev => ({ ...prev, [columnKey]: false }))
      setProgressActive(false)
    }
  }

  // Fetch column values in batches of 500 (lazy loading) using dedicated fields API
  const fetchColumnValues = async (columnKey, forceRefresh = false) => {
    setProgressActive(true)
    // Allow API calls for a broader set of text columns to ensure filtering works across more fields
    const allowedColumns = [
      // Identifiers
      'login', 'id',
      // Names & contact
      'name', 'lastName', 'middleName', 'email', 'phone',
      // Account metadata
      'group', 'accountType', 'status', 'currency', 'leverage', 'comment',
      // Location
      'country', 'city', 'state', 'address', 'zipCode', 'company',
      // Leads & processing
      'leadSource', 'leadCampaign', 'processorType'
    ]
    if (!allowedColumns.includes(columnKey)) {
      console.log(`[Client2] Skipping API call for non-whitelisted column: ${columnKey}`)
      // Initialize states to prevent undefined values
      setColumnValues(prev => ({ ...prev, [columnKey]: [] }))
      setColumnValuesLoading(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesLoadingMore(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: 0 }))
      setColumnValuesTotalPages(prev => ({ ...prev, [columnKey]: 0 }))
      return
    }

    // Don't fetch if already loading
    if (columnValuesLoading[columnKey]) return
    // Don't fetch if already loaded (unless forcing refresh)
    if (!forceRefresh && columnValues[columnKey]) return

    setColumnValuesLoading(prev => ({ ...prev, [columnKey]: true }))
    setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: 1 }))
    // Reset scroll gating for this column
    columnScrollUserActionRef.current[columnKey] = false
    columnScrollLastTriggerRef.current[columnKey] = -Infinity
    columnLastScrollTopRef.current[columnKey] = 0

    try {
      // Use dedicated fields API endpoint
      const params = {
        fields: columnKey,
        page: 1,
        limit: 500
      }

      // Add quick filter constraints
      if (quickFilters?.hasFloating) {
        params.hasFloating = true
      }
      if (quickFilters?.hasCredit) {
        params.hasCredit = true
      }
      if (quickFilters?.noDeposit) {
        params.noDeposit = true
      }

      // Add group filter if active
      if (activeGroup?.logins && activeGroup.logins.length > 0) {
        params.logins = activeGroup.logins.join(',')
      }

      // Add IB filter if active
      if (selectedIB && ibMT5Accounts && ibMT5Accounts.length > 0) {
        params.ibAccounts = ibMT5Accounts.join(',')
      }

      const response = await brokerAPI.getClientFields(params)
      const extract = (resp) => (resp?.data?.data) || (resp?.data) || resp
      const data = extract(response)

      // Extract unique values from response
      const clients = data?.clients || []
      const setVals = new Set()
      clients.forEach(client => {
        let v = client?.[columnKey]
        
        // Transform processorType values to friendly labels
        if (columnKey === 'processorType' && v !== null && v !== undefined && v !== '') {
          if (typeof v === 'boolean') {
            v = v ? 'Connected' : 'Not Connected'
          } else {
            const normalized = typeof v === 'string' ? v.trim().toLowerCase() : v
            if (normalized === 1 || normalized === '1' || normalized === 'true') {
              v = 'Connected'
            } else if (normalized === 0 || normalized === '0' || normalized === 'false') {
              v = 'Not Connected'
            }
          }
        }
        
        if (v !== null && v !== undefined && v !== '') setVals.add(v)
      })

      const uniqueValues = Array.from(setVals).sort((a, b) => String(a).localeCompare(String(b)))
      const pagesNum = Number(data?.pages)
      const hasPagesInfo = Number.isFinite(pagesNum) && pagesNum > 0
      const inferredHasMore = clients.length >= 500
      const totalPages = hasPagesInfo ? pagesNum : null

      console.log(`[Client2] fetchColumnValues complete for ${columnKey}: ${uniqueValues.length} values, page 1${hasPagesInfo ? ` of ${pagesNum}` : ''}`)

      setColumnValues(prev => ({ ...prev, [columnKey]: uniqueValues }))
      setSelectedColumnValues(prev => ({ ...prev, [columnKey]: [] }))
      setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: 1 }))
      setColumnValuesTotalPages(prev => ({ ...prev, [columnKey]: totalPages }))
      setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: hasPagesInfo ? pagesNum > 1 : inferredHasMore }))
    } catch (err) {
      console.error(`[Client2Page] Error fetching column values for ${columnKey}:`, err)
      setColumnValues(prev => ({ ...prev, [columnKey]: [] }))
      setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: false }))
      setColumnValuesTotalPages(prev => ({ ...prev, [columnKey]: null }))
    } finally {
      setColumnValuesLoading(prev => ({ ...prev, [columnKey]: false }))
      setProgressActive(false)
    }
  }

  // Load more column values when scrolling (fetch next 500)
  const fetchMoreColumnValues = async (columnKey) => {
    setProgressActive(true)
    console.log(`[Client2] fetchMoreColumnValues called for ${columnKey}`)
    console.log(`[Client2] State - loading: ${columnValuesLoadingMore[columnKey]}, hasMore: ${columnValuesHasMore[columnKey]}`)

    // Don't fetch if already loading more
    if (columnValuesLoadingMore[columnKey]) {
      console.log(`[Client2] Already loading more for ${columnKey}, skipping`)
      return
    }
    // Don't fetch if no more values
    if (!columnValuesHasMore[columnKey]) {
      console.log(`[Client2] No more values for ${columnKey}, skipping`)
      return
    }

    const currentPage = columnValuesCurrentPage[columnKey] || 1
    const totalPages = columnValuesTotalPages[columnKey]  // may be null if unknown

    console.log(`[Client2] Page info - current: ${currentPage}, total: ${totalPages ?? 'unknown'}`)

    if (typeof totalPages === 'number' && currentPage >= totalPages) {
      console.log(`[Client2] Current page ${currentPage} >= total pages ${totalPages}, setting hasMore to false`)
      setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: false }))
      return
    }

    console.log(`[Client2] Fetching page ${currentPage + 1} for ${columnKey}`)
    setColumnValuesLoadingMore(prev => ({ ...prev, [columnKey]: true }))

    try {
      const nextPage = currentPage + 1
      const searchQuery = columnValueSearchDebounce[columnKey] || columnValueSearch[columnKey] || ''

      // Use dedicated fields API endpoint
      const params = {
        fields: columnKey,
        search: searchQuery.trim() || undefined,
        page: nextPage,
        limit: 500
      }

      // Add quick filter constraints
      if (quickFilters?.hasFloating) {
        params.hasFloating = true
      }
      if (quickFilters?.hasCredit) {
        params.hasCredit = true
      }
      if (quickFilters?.noDeposit) {
        params.noDeposit = true
      }

      // Add group filter if active
      if (activeGroup?.logins && activeGroup.logins.length > 0) {
        params.logins = activeGroup.logins.join(',')
      }

      // Add IB filter if active
      if (selectedIB && ibMT5Accounts && ibMT5Accounts.length > 0) {
        params.ibAccounts = ibMT5Accounts.join(',')
      }

      const response = await brokerAPI.getClientFields(params)
      const extract = (resp) => (resp?.data?.data) || (resp?.data) || resp
      const data = extract(response)

      // Extract and merge with existing values
      const clients = data?.clients || []
      const setVals = new Set(columnValues[columnKey] || [])
      clients.forEach(client => {
        const v = client?.[columnKey]
        if (v !== null && v !== undefined && v !== '') setVals.add(v)
      })

      const uniqueValues = Array.from(setVals).sort((a, b) => String(a).localeCompare(String(b)))
      setColumnValues(prev => ({ ...prev, [columnKey]: uniqueValues }))
      setColumnValuesCurrentPage(prev => ({ ...prev, [columnKey]: nextPage }))
      const nextHasMore = (typeof totalPages === 'number') ? (nextPage < totalPages) : (clients.length >= 500)
      setColumnValuesHasMore(prev => ({ ...prev, [columnKey]: nextHasMore }))
    } catch (err) {
      console.error(`[Client2Page] Error fetching more column values for ${columnKey}:`, err)
    } finally {
      setColumnValuesLoadingMore(prev => ({ ...prev, [columnKey]: false }))
      setProgressActive(false)
    }
  }

  // Toggle individual value selection
  const toggleColumnValue = (columnKey, value) => {
    setSelectedColumnValues(prev => {
      const currentSelected = prev[columnKey] || []
      const isSelected = currentSelected.includes(value)

      if (isSelected) {
        return { ...prev, [columnKey]: currentSelected.filter(v => v !== value) }
      } else {
        return { ...prev, [columnKey]: [...currentSelected, value] }
      }
    })
  }

  // Toggle select all for column
  const toggleSelectAllColumnValues = (columnKey) => {
    const allValues = columnValues[columnKey] || []
    const currentSelected = selectedColumnValues[columnKey] || []

    if (currentSelected.length === allValues.length) {
      // Deselect all
      setSelectedColumnValues(prev => ({ ...prev, [columnKey]: [] }))
    } else {
      // Select all
      setSelectedColumnValues(prev => ({ ...prev, [columnKey]: [...allValues] }))
    }
  }

  // Toggle select only currently visible (filtered) values for the column
  const toggleSelectVisibleColumnValues = (columnKey) => {
    const allValues = columnValues[columnKey] || []
    const searchQ = (columnValueSearch[columnKey] || '').toLowerCase()
    const visible = searchQ ? allValues.filter(v => String(v).toLowerCase().includes(searchQ)) : allValues
    const currentSelected = selectedColumnValues[columnKey] || []
    const allVisibleSelected = visible.length > 0 && visible.every(v => currentSelected.includes(v))

    let nextSelected
    if (allVisibleSelected) {
      // Deselect only the currently visible values
      const visibleSet = new Set(visible)
      nextSelected = currentSelected.filter(v => !visibleSet.has(v))
    } else {
      // Add visible values to the selection
      const merged = new Set([...currentSelected, ...visible])
      nextSelected = Array.from(merged)
    }
    setSelectedColumnValues(prev => ({ ...prev, [columnKey]: nextSelected }))
  }

  // Apply checkbox filter - builds server-side filters using proper API format
  const applyCheckboxFilter = (columnKey) => {
    const selected = selectedColumnValues[columnKey] || []

    console.log('[Client2] ========================================')
    console.log('[Client2] applyCheckboxFilter called')
    console.log('[Client2] columnKey:', columnKey)
    console.log('[Client2] selected values:', selected)
    console.log('[Client2] selected count:', selected.length)
    console.log('[Client2] ========================================')

    if (selected.length === 0) {
      console.log('[Client2] No values selected, clearing filter')
      clearColumnFilter(columnKey)
      return
    }

    // Clear clients and set loading state immediately to prevent showing old data
    setClients([])
    setLoading(true)

    setShowFilterDropdown(null)
    setCurrentPage(1)

    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200

    // Store filter in state - will be sent to API via fetchClients
    setColumnFilters(prev => {
      const updated = {
        ...prev,
        [`${columnKey}_checkbox`]: { values: selected }
      }
      console.log('[Client2] ✅ Checkbox filter updated:', JSON.stringify(updated, null, 2))
      return updated
    })

    // No need to explicitly call fetchClients - useEffect will handle it when columnFilters changes
  }

  const applySortToColumn = (columnKey, direction) => {
    // Update the columnSortOrder state for UI indication
    setColumnSortOrder({
      [columnKey]: direction // Only one column can be sorted at a time
    })

    // Update sortBy and sortOrder to trigger API call
    setSortBy(columnKey)
    setSortOrder(direction)

    // Reset to first page when sorting changes
    setCurrentPage(1)

    setShowFilterDropdown(null)
  }

  const clearSort = (columnKey) => {
    setColumnSortOrder(prev => {
      const { [columnKey]: _, ...rest } = prev
      return rest
    })

    // Clear the API sort states if this was the active sort column
    if (sortBy === columnKey) {
      setSortBy('')
      setSortOrder('asc')
      setCurrentPage(1)
    }
  }

  const getColumnType = (columnKey) => {
    const column = allColumns.find(col => col.key === columnKey)
    return column?.type || 'text'
  }

  // Handle page change
  const handlePageChange = (newPage) => {
    const nextPage = Math.min(Math.max(1, Number(newPage) || 1), Math.max(1, totalPages))
    if (nextPage === currentPage) return

    setIsPageChanging(true)
    setCurrentPage(nextPage)

    if (pageChangeTimeoutRef.current) {
      clearTimeout(pageChangeTimeoutRef.current)
    }
    pageChangeTimeoutRef.current = setTimeout(() => {
      setIsPageChanging(false)
    }, 180)
  }

  useEffect(() => {
    return () => {
      if (pageChangeTimeoutRef.current) {
        clearTimeout(pageChangeTimeoutRef.current)
      }
    }
  }, [])

  // Handle items per page change
  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(parseInt(value))
    setCurrentPage(1)
  }

  // Toggle column visibility
  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  // Add filter
  const handleAddFilter = () => {
    if (!newFilterValue.trim()) {
      alert('Please enter a filter value')
      return
    }

    const newFilter = {
      field: newFilterField,
      operator: newFilterOperator,
      value: newFilterValue.trim()
    }

    setFilters(prev => [...prev, newFilter])
    setNewFilterValue('')
    setShowFilterModal(false)
    setCurrentPage(1)
  }

  // Remove filter
  const handleRemoveFilter = (index) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
    setCurrentPage(1)
  }

  // Clear all filters
  const handleClearAllFilters = () => {
    // Invalidate any in-flight requests from previous filter state
    requestIdRef.current++
    pausePollingUntilRef.current = Date.now() + 1200
    
    // Basic list filters
    setFilters([])
    setSearchQuery('')
    setSearchInput('')
    setSortBy('')
    setSortOrder('asc')
    setColumnSortOrder({})

    // Quick filters
    setQuickFilters({ hasFloating: false, hasCredit: false, noDeposit: false })

    // Account filters
    setMt5Accounts([])
    setAccountRangeMin('')
    setAccountRangeMax('')
    setAccountInputText('')
    setTempAccountRangeMin('')
    setTempAccountRangeMax('')

    // Column filters and UI state
    setColumnFilters({})
    setSelectedColumnValues({})
    setColumnValueSearch({})
    setColumnValueSearchDebounce({})
    setNumericFilterTemp({})
    setTextFilterTemp({})
    setShowFilterDropdown(null)
    setFilterSearchQuery({})
    setShowFilterMenu(false)
    setShowCardFilterMenu(false)

    // Context filters: IB and Group
    try { clearIBSelection() } catch {}
    try { setActiveGroupFilter('client2', null) } catch {}

    // Reset pagination
    setCurrentPage(1)
  }

  // Apply account filters
  const handleApplyAccountFilters = () => {
    // Parse MT5 accounts from text input
    if (accountInputText.trim()) {
      const accounts = accountInputText
        .split(/[\s,;]+/)
        .map(a => a.trim())
        .filter(a => a && !isNaN(parseInt(a)))
        .map(a => parseInt(a))
      setMt5Accounts(accounts)
    } else {
      setMt5Accounts([])
    }

    // Set account range
    setAccountRangeMin(tempAccountRangeMin)
    setAccountRangeMax(tempAccountRangeMax)

    setShowAccountFilterModal(false)
    setCurrentPage(1)
  }

  // Clear account filters
  const handleClearAccountFilters = () => {
    setMt5Accounts([])
    setAccountRangeMin('')
    setAccountRangeMax('')
    setAccountInputText('')
    setTempAccountRangeMin('')
    setTempAccountRangeMax('')
    setCurrentPage(1)
  }

  // Export to CSV
  const handleExportToCSV = () => {
    if (!clients || clients.length === 0) {
      alert('No data to export')
      return
    }

    // Get headers
    const headers = visibleColumnsList.map(col => col.label).join(',')

    // Get rows - filter out null/undefined clients
    const rows = (clients || []).filter(client => client != null).map(client => {
      return visibleColumnsList.map(col => {
        let value = client[col.key]

        // Format value
        if (value === null || value === undefined || value === '') {
          return ''
        }

        // Escape quotes and commas
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

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `client2_export_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      await fetchClients()
    } finally {
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  // Drag-and-drop handlers for face cards removed per request

  // Ensure faceCardOrder always contains all known keys (in case defaults grow over time)
  useEffect(() => {
    try {
      const defaults = [...defaultClient2FaceCardOrder]
      const orderSet = new Set(faceCardOrder)
      let changed = false
      defaults.forEach(k => { if (!orderSet.has(k)) { orderSet.add(k); changed = true } })
      if (changed) {
        const merged = Array.from(orderSet)
        setFaceCardOrder(merged)
        localStorage.setItem('client2FaceCardOrder', JSON.stringify(merged))
      }
    } catch { }
  }, [faceCardOrder])

  // Drag and drop handlers for face cards
  const handleCardDragStart = (e, cardKey) => {
    setDraggedCardKey(cardKey)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.target)
  }

  const handleCardDragOver = (e, cardKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedCardKey && draggedCardKey !== cardKey) {
      setDragOverCardKey(cardKey)
    }
  }

  const handleCardDrop = (e, targetCardKey) => {
    e.preventDefault()
    if (!draggedCardKey || draggedCardKey === targetCardKey) {
      setDraggedCardKey(null)
      setDragOverCardKey(null)
      return
    }

    const newOrder = [...faceCardOrder]
    const draggedIndex = newOrder.indexOf(draggedCardKey)
    const targetIndex = newOrder.indexOf(targetCardKey)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Remove dragged item
      newOrder.splice(draggedIndex, 1)
      // Insert at new position
      newOrder.splice(targetIndex, 0, draggedCardKey)
      
      setFaceCardOrder(newOrder)
      localStorage.setItem('client2FaceCardOrder', JSON.stringify(newOrder))
    }

    setDraggedCardKey(null)
    setDragOverCardKey(null)
  }

  const handleCardDragEnd = () => {
    setDraggedCardKey(null)
    setDragOverCardKey(null)
  }

  const resetClient2FaceCardOrder = () => {
    setFaceCardOrder(defaultClient2FaceCardOrder)
    localStorage.setItem('client2FaceCardOrder', JSON.stringify(defaultClient2FaceCardOrder))
  }

  // Get comprehensive card configuration for dynamic rendering - matches all 57 cards
  const getClient2CardConfig = useCallback((cardKey, totals) => {
    const configs = {
      // COUNT
      totalClients: { label: 'Total Clients', color: 'blue', format: 'integer', getValue: () => totalClients || 0 },
      // A
      assets: { label: 'Assets', color: 'blue', getValue: () => totals?.assets || 0 },

      // B
      balance: { label: 'Balance', color: 'indigo', getValue: () => totals?.balance || 0 },
      blockedCommission: { label: 'Blocked Commission', color: 'gray', getValue: () => totals?.blockedCommission || 0 },
      blockedProfit: { label: 'Blocked Profit', color: 'orange', getValue: () => totals?.blockedProfit || 0, colorCheck: true },

      // C
      commission: { label: 'Commission', color: 'amber', getValue: () => totals?.commission || 0 },
      credit: { label: 'Credit', color: 'emerald', getValue: () => totals?.credit || 0 },

      // D - Daily
      dailyBonusIn: { label: 'Daily Bonus In', color: 'teal', getValue: () => totals?.dailyBonusIn || 0 },
      dailyBonusOut: { label: 'Daily Bonus Out', color: 'red', getValue: () => totals?.dailyBonusOut || 0 },
      dailyCreditIn: { label: 'Daily Credit In', color: 'emerald', getValue: () => totals?.dailyCreditIn || 0 },
      dailyCreditOut: { label: 'Daily Credit Out', color: 'red', getValue: () => totals?.dailyCreditOut || 0 },
      dailyDeposit: { label: 'Daily Deposit', color: 'green', getValue: () => totals?.dailyDeposit || 0 },
      dailyDepositPercent: { label: 'Daily Deposit %', color: 'emerald', getValue: () => computedPercentageTotals?.dailyDeposit || 0 },
      dailyPnL: { label: 'Daily P&L', color: 'cyan', getValue: () => totals?.dailyPnL || 0, colorCheck: true },
      dailySOCompensationIn: { label: 'Daily SO Compensation In', color: 'purple', getValue: () => totals?.dailySOCompensationIn || 0 },
      dailySOCompensationOut: { label: 'Daily SO Compensation Out', color: 'orange', getValue: () => totals?.dailySOCompensationOut || 0 },
      dailyWithdrawal: { label: 'Daily Withdrawal', color: 'red', getValue: () => totals?.dailyWithdrawal || 0 },
      dailyWithdrawalPercent: { label: 'Daily Withdrawal %', color: 'rose', getValue: () => computedPercentageTotals?.dailyWithdrawal || 0 },
      // Computed: Daily Net D/W = Daily Deposit - Daily Withdrawal
      dailyNetDW: { label: 'Daily Net D/W', color: 'blue', getValue: () => (totals?.dailyDeposit || 0) - (totals?.dailyWithdrawal || 0), colorCheck: true },
      // Computed: NET Daily Bonus = Daily Bonus In - Daily Bonus Out
      netDailyBonus: { label: 'NET Daily Bonus', color: 'blue', getValue: () => (totals?.dailyBonusIn || 0) - (totals?.dailyBonusOut || 0), colorCheck: true },

      // E
      equity: { label: 'Equity', color: 'purple', getValue: () => totals?.equity || 0 },

      // F
      floating: { label: 'Floating P/L', color: 'cyan', getValue: () => totals?.floating || 0, colorCheck: true },

      // L
      liabilities: { label: 'Liabilities', color: 'red', getValue: () => totals?.liabilities || 0 },

      // L - Lifetime
      lifetimeBonusIn: { label: 'Lifetime Bonus In', color: 'teal', getValue: () => totals?.lifetimeBonusIn || 0 },
      lifetimeBonusOut: { label: 'Lifetime Bonus Out', color: 'red', getValue: () => totals?.lifetimeBonusOut || 0 },
      lifetimeCreditIn: { label: 'Lifetime Credit In', color: 'emerald', getValue: () => totals?.lifetimeCreditIn || 0 },
      lifetimeCreditOut: { label: 'Lifetime Credit Out', color: 'red', getValue: () => totals?.lifetimeCreditOut || 0 },
      lifetimeDeposit: { label: 'Lifetime Deposit', color: 'green', getValue: () => totals?.lifetimeDeposit || 0 },
      lifetimePnL: { label: 'Lifetime P&L', color: 'indigo', getValue: () => totals?.lifetimePnL || 0, colorCheck: true },
      lifetimePnLPercent: { label: 'Lifetime PnL %', color: 'violet', getValue: () => computedPercentageTotals?.lifetimePnL || 0, colorCheck: true },
      lifetimeSOCompensationIn: { label: 'Lifetime SO Compensation In', color: 'purple', getValue: () => totals?.lifetimeSOCompensationIn || 0 },
      lifetimeSOCompensationOut: { label: 'Lifetime SO Compensation Out', color: 'orange', getValue: () => totals?.lifetimeSOCompensationOut || 0 },
      lifetimeWithdrawal: { label: 'Lifetime Withdrawal', color: 'red', getValue: () => totals?.lifetimeWithdrawal || 0 },
      // Lifetime Commission/Correction/Swap
      lifetimeCommission: { label: 'Lifetime Commission', color: 'amber', getValue: () => totals?.lifetimeCommission || 0 },
      lifetimeCorrection: { label: 'Lifetime Correction', color: 'rose', getValue: () => totals?.lifetimeCorrection || 0 },
      lifetimeSwap: { label: 'Lifetime Swap', color: 'cyan', getValue: () => totals?.lifetimeSwap || 0 },

      // M
      margin: { label: 'Margin', color: 'yellow', getValue: () => totals?.margin || 0 },
      marginFree: { label: 'Margin Free', color: 'lime', getValue: () => totals?.marginFree || 0 },
      marginInitial: { label: 'Margin Initial', color: 'sky', getValue: () => totals?.marginInitial || 0 },
      marginLevel: { label: 'Margin Level', color: 'pink', getValue: () => totals?.marginLevel || 0 },
      marginMaintenance: { label: 'Margin Maintenance', color: 'violet', getValue: () => totals?.marginMaintenance || 0 },

      // P
      pnl: { label: 'P&L', color: 'cyan', getValue: () => totals?.pnl || 0, colorCheck: true },
      previousEquity: { label: 'Previous Equity', color: 'slate', getValue: () => totals?.previousEquity || 0 },
      profit: { label: 'Profit', color: 'green', getValue: () => totals?.profit || 0, colorCheck: true },

      // S
      soEquity: { label: 'SO Equity', color: 'fuchsia', getValue: () => totals?.soEquity || 0 },
      soLevel: { label: 'SO Level', color: 'rose', getValue: () => totals?.soLevel || 0 },
      soMargin: { label: 'SO Margin', color: 'amber', getValue: () => totals?.soMargin || 0 },
      storage: { label: 'Storage', color: 'gray', getValue: () => totals?.storage || 0 },

      // T - This Month
      thisMonthBonusIn: { label: 'This Month Bonus In', color: 'teal', getValue: () => totals?.thisMonthBonusIn || 0 },
      thisMonthBonusOut: { label: 'This Month Bonus Out', color: 'red', getValue: () => totals?.thisMonthBonusOut || 0 },
      thisMonthCreditIn: { label: 'This Month Credit In', color: 'emerald', getValue: () => totals?.thisMonthCreditIn || 0 },
      thisMonthCreditOut: { label: 'This Month Credit Out', color: 'red', getValue: () => totals?.thisMonthCreditOut || 0 },
      thisMonthDeposit: { label: 'This Month Deposit', color: 'green', getValue: () => totals?.thisMonthDeposit || 0 },
      thisMonthPnL: { label: 'This Month P&L', color: 'blue', getValue: () => totals?.thisMonthPnL || 0, colorCheck: true },
      thisMonthSOCompensationIn: { label: 'This Month SO Compensation In', color: 'purple', getValue: () => totals?.thisMonthSOCompensationIn || 0 },
      thisMonthSOCompensationOut: { label: 'This Month SO Compensation Out', color: 'orange', getValue: () => totals?.thisMonthSOCompensationOut || 0 },
      thisMonthWithdrawal: { label: 'This Month Withdrawal', color: 'red', getValue: () => totals?.thisMonthWithdrawal || 0 },
      // This Month Commission/Correction/Swap
      thisMonthCommission: { label: 'This Month Commission', color: 'amber', getValue: () => totals?.thisMonthCommission || 0 },
      thisMonthCorrection: { label: 'This Month Correction', color: 'rose', getValue: () => totals?.thisMonthCorrection || 0 },
      thisMonthSwap: { label: 'This Month Swap', color: 'cyan', getValue: () => totals?.thisMonthSwap || 0 },

      // T - This Week
      thisWeekBonusIn: { label: 'This Week Bonus In', color: 'teal', getValue: () => totals?.thisWeekBonusIn || 0 },
      thisWeekBonusOut: { label: 'This Week Bonus Out', color: 'red', getValue: () => totals?.thisWeekBonusOut || 0 },
      thisWeekCreditIn: { label: 'This Week Credit In', color: 'emerald', getValue: () => totals?.thisWeekCreditIn || 0 },
      thisWeekCreditOut: { label: 'This Week Credit Out', color: 'red', getValue: () => totals?.thisWeekCreditOut || 0 },
      thisWeekDeposit: { label: 'This Week Deposit', color: 'green', getValue: () => totals?.thisWeekDeposit || 0 },
      thisWeekPnL: { label: 'This Week P&L', color: 'indigo', getValue: () => totals?.thisWeekPnL || 0, colorCheck: true },
      thisWeekSOCompensationIn: { label: 'This Week SO Compensation In', color: 'purple', getValue: () => totals?.thisWeekSOCompensationIn || 0 },
      thisWeekSOCompensationOut: { label: 'This Week SO Compensation Out', color: 'orange', getValue: () => totals?.thisWeekSOCompensationOut || 0 },
      thisWeekWithdrawal: { label: 'This Week Withdrawal', color: 'red', getValue: () => totals?.thisWeekWithdrawal || 0 },
      // This Week Commission/Correction/Swap
      thisWeekCommission: { label: 'This Week Commission', color: 'amber', getValue: () => totals?.thisWeekCommission || 0 },
      thisWeekCorrection: { label: 'This Week Correction', color: 'rose', getValue: () => totals?.thisWeekCorrection || 0 },
      thisWeekSwap: { label: 'This Week Swap', color: 'cyan', getValue: () => totals?.thisWeekSwap || 0 },
      // Computed: NET Week Bonus = This Week Bonus In - This Week Bonus Out
      netWeekBonus: { label: 'NET Week Bonus', color: 'blue', getValue: () => (totals?.thisWeekBonusIn || 0) - (totals?.thisWeekBonusOut || 0), colorCheck: true },
      // Computed: NET Week D/W = This Week Deposit - This Week Withdrawal
      netWeekDW: { label: 'NET Week DW', color: 'blue', getValue: () => (totals?.thisWeekDeposit || 0) - (totals?.thisWeekWithdrawal || 0), colorCheck: true },

      // Rebate cards
      availableRebate: { label: 'Available Rebate', color: 'teal', getValue: () => rebateTotals?.availableRebate || 0 },
      availableRebatePercent: { label: 'Available Rebate %', color: 'cyan', getValue: () => rebateTotals?.availableRebatePercent || 0 },
      totalRebate: { label: 'Total Rebate', color: 'emerald', getValue: () => rebateTotals?.totalRebate || 0 },
      totalRebatePercent: { label: 'Total Rebate %', color: 'blue', getValue: () => rebateTotals?.totalRebatePercent || 0 },
      // Computed: NET Monthly Bonus = This Month Bonus In - This Month Bonus Out
      netMonthBonus: { label: 'NET Monthly Bonus', color: 'blue', getValue: () => (totals?.thisMonthBonusIn || 0) - (totals?.thisMonthBonusOut || 0), colorCheck: true },
      // Computed: NET Monthly D/W = This Month Deposit - This Month Withdrawal
      netMonthDW: { label: 'NET Monthly DW', color: 'blue', getValue: () => (totals?.thisMonthDeposit || 0) - (totals?.thisMonthWithdrawal || 0), colorCheck: true },
      // Computed: NET Lifetime Bonus = Lifetime Bonus In - Lifetime Bonus Out
      netLifetimeBonus: { label: 'NET Lifetime Bonus', color: 'blue', getValue: () => (totals?.lifetimeBonusIn || 0) - (totals?.lifetimeBonusOut || 0), colorCheck: true },
      // Computed: NET Lifetime D/W = Lifetime Deposit - Lifetime Withdrawal
      netLifetimeDW: { label: 'NET Lifetime DW', color: 'blue', getValue: () => (totals?.lifetimeDeposit || 0) - (totals?.lifetimeWithdrawal || 0), colorCheck: true },
      // Computed: NET Credit = Lifetime Credit In - Lifetime Credit Out (align with Clients module)
      netCredit: { label: 'NET Credit', color: 'blue', getValue: () => (totals?.lifetimeCreditIn || 0) - (totals?.lifetimeCreditOut || 0), colorCheck: true },

      // Calculated PnL cards
      netLifetimePnL: { label: 'Net Lifetime PnL', color: 'violet', getValue: () => (totals?.lifetimePnL || 0) - (rebateTotals?.totalRebate || 0), colorCheck: true },
      netLifetimePnLPercent: { label: 'Net Lifetime PnL %', color: 'purple', getValue: () => (totalsPercent?.lifetimePnL || 0) - (rebateTotals?.totalRebatePercent || 0), colorCheck: true },
      bookPnL: { label: 'Book PnL', color: 'sky', getValue: () => -((totals?.lifetimePnL || 0) + (totals?.floating || 0)), colorCheck: false, forceColor: 'red' },
      bookPnLPercent: { label: 'Book PnL %', color: 'indigo', getValue: () => -((totalsPercent?.lifetimePnL || 0) + (totalsPercent?.floating || 0)), colorCheck: false, forceColor: 'red' }
    }

    return configs[cardKey] || null
  }, [totalClients, rebateTotals, totals, totalsPercent, computedPercentageTotals])

  // Build export payload variants (reuses filter logic from fetchClients)
  const buildExportPayloadVariants = useCallback((percentageFlag = false) => {
    // Base payload mirrors current filters/search/sort
    const base = {
      page: 1,
      limit: 10000
    }
    if (searchQuery && searchQuery.trim()) base.search = searchQuery.trim()

    // Collect filters like in fetchClients
    const combinedFilters = []
    let multiOrField = null
    let multiOrValues = []
    let multiOrConflict = false
    const textFilteredFields = new Set()
    const numberFilteredFields = new Set()
    if (filters && filters.length > 0) {
      combinedFilters.push(...filters)
    }

    // Map UI column keys to API field names
    const columnKeyToAPIField = (colKey) => {
      const fieldMap = {
        lifetimePnL: 'lifetimePnL',
        thisMonthPnL: 'thisMonthPnL',
        thisWeekPnL: 'thisWeekPnL',
        dailyPnL: 'dailyPnL',
        marginLevel: 'marginLevel',
        marginFree: 'marginFree',
        lastAccess: 'lastAccess',
        zipCode: 'zipCode',
        middleName: 'middleName',
        lastName: 'lastName',
        processorType: 'processorType',
        accountType: 'accountType'
      }
      return fieldMap[colKey] || colKey
    }

    // Column header filters
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      Object.entries(columnFilters).forEach(([key, cfg]) => {
        if (key.endsWith('_text') && cfg) {
          const uiKey = key.replace('_text', '')
          const field = columnKeyToAPIField(uiKey)
          const opMap = { equal: 'equal', notEqual: 'not_equal', contains: 'contains', doesNotContain: 'not_contains', startsWith: 'starts_with', endsWith: 'ends_with' }
          const op = opMap[cfg.operator] || cfg.operator
          const val = cfg.value
          if (val != null && String(val).length > 0) {
            combinedFilters.push({ field, operator: op, value: String(val).trim() })
            textFilteredFields.add(uiKey)
          }
          return
        }
        if (key.endsWith('_number') && cfg) {
          const uiKey = key.replace('_number', '')
          const field = columnKeyToAPIField(uiKey)
          const op = cfg.operator
          const v1 = cfg.value1
          const v2 = cfg.value2
          const num1 = v1 !== '' && v1 != null ? Number(v1) : null
          const num2 = v2 !== '' && v2 != null ? Number(v2) : null
          if (op === 'between') {
            if (num1 != null && Number.isFinite(num1)) combinedFilters.push({ field, operator: 'greater_than_equal', value: String(num1) })
            if (num2 != null && Number.isFinite(num2)) combinedFilters.push({ field, operator: 'less_than_equal', value: String(num2) })
          } else if (op && num1 != null && Number.isFinite(num1)) {
            combinedFilters.push({ field, operator: op, value: String(num1) })
          }
          numberFilteredFields.add(uiKey)
          return
        }
      })
      Object.entries(columnFilters).forEach(([key, cfg]) => {
        if (key.endsWith('_checkbox') && cfg && Array.isArray(cfg.values) && cfg.values.length > 0) {
          const uiKey = key.replace('_checkbox', '')
          const field = columnKeyToAPIField(uiKey)
          if (textFilteredFields.has(uiKey) || numberFilteredFields.has(uiKey)) return
          const rawValues = cfg.values.map(v => String(v).trim()).filter(v => v.length > 0)
          if (rawValues.length === 0) return
          // Prefer IN operator; if >50 we will chunk later in gatherExportDataset
          if (rawValues.length === 1) {
            combinedFilters.push({ field, operator: 'equal', value: rawValues[0] })
          } else {
            combinedFilters.push({ field, operator: 'in', value: rawValues })
          }
        }
      })
    }
    if (combinedFilters.length > 0) base.filters = combinedFilters
    // Start building the mt5Accounts filter (server-side) for export
    let mt5AccountsFilter = []
    if (Array.isArray(mt5Accounts) && mt5Accounts.length > 0) {
      mt5AccountsFilter = [...new Set(mt5Accounts.map(Number))]
    }
    if (accountRangeMin && accountRangeMin.trim()) base.accountRangeMin = parseInt(accountRangeMin.trim())
    if (accountRangeMax && accountRangeMax.trim()) base.accountRangeMax = parseInt(accountRangeMax.trim())
    if (activeGroup) {
      if (activeGroup.range) {
        base.accountRangeMin = activeGroup.range.from
        base.accountRangeMax = activeGroup.range.to
      } else if (activeGroup.loginIds && activeGroup.loginIds.length > 0) {
        const groupAccounts = activeGroup.loginIds.map(id => Number(id))
        if (mt5AccountsFilter.length > 0) {
          const set = new Set(groupAccounts)
          mt5AccountsFilter = mt5AccountsFilter.filter(a => set.has(a))
        } else {
          mt5AccountsFilter = [...new Set(groupAccounts)]
        }
      }
    }
    if (selectedIB && Array.isArray(ibMT5Accounts) && ibMT5Accounts.length > 0) {
      const ibAccounts = ibMT5Accounts.map(Number)
      if (mt5AccountsFilter.length > 0) {
        const set = new Set(ibAccounts)
        mt5AccountsFilter = mt5AccountsFilter.filter(a => set.has(a))
      } else {
        mt5AccountsFilter = [...new Set(ibAccounts)]
      }
    }
    if (mt5AccountsFilter.length > 0) {
      base.mt5Accounts = mt5AccountsFilter.map(a => String(a))
    } else {
      const manualGroupApplied = !!(activeGroup && activeGroup.loginIds && activeGroup.loginIds.length > 0)
      const hasIBFilter = selectedIB && Array.isArray(ibMT5Accounts) && ibMT5Accounts.length > 0
      if (hasIBFilter || manualGroupApplied) {
        base.mt5Accounts = ['0']
      }
    }
    if (sortBy) { base.sortBy = sortBy; base.sortOrder = sortOrder }

    // Single variant; gatherExportDataset will handle chunking and merging
    const p = { ...base }
    if (percentageFlag && percentModeActive) p.percentage = true
    return [p]
  }, [searchQuery, filters, columnFilters, mt5Accounts, accountRangeMin, accountRangeMax, activeGroup, sortBy, sortOrder])

  // Fetch all pages for a single payload
  const fetchAllPagesForPayload = useCallback(async (payload) => {
    // If payload contains a large IN filter, chunk it and merge all pages
    const inFilters = (payload.filters || []).filter(f => f && f.operator === 'in' && Array.isArray(f.value))
    const LARGE_IN_THRESHOLD = 50
    const largeIn = inFilters.find(f => f.value.length > LARGE_IN_THRESHOLD)
    if (largeIn) {
      const baseFilters = (payload.filters || []).filter(f => f !== largeIn)
      const chunk = (arr, size) => {
        const out = []
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
        return out
      }
      const CHUNK_SIZE = LARGE_IN_THRESHOLD
      const chunks = chunk(largeIn.value, CHUNK_SIZE)
      const merged = []
      for (let ci = 0; ci < chunks.length; ci++) {
        const part = chunks[ci]
        const chunkPayload = { ...payload, page: 1, filters: [...baseFilters, { field: largeIn.field, operator: 'in', value: part }] }
        const first = await brokerAPI.searchClients(chunkPayload)
        const dataFirst = first?.data || first
        const pages = Number(dataFirst?.pages || 1)
        let list = dataFirst?.clients || []
        if (pages > 1) {
          for (let p = 2; p <= pages; p++) {
            const resp = await brokerAPI.searchClients({ ...chunkPayload, page: p })
            const d = resp?.data || resp
            list = list.concat(d?.clients || [])
          }
        }
        merged.push(...list)
      }
      return merged
    }

    // Normal path: fetch all pages for given payload
    const first = await brokerAPI.searchClients({ ...payload, page: 1 })
    const dataFirst = first?.data || first
    const pages = Number(dataFirst?.pages || 1)
    let list = dataFirst?.clients || []
    if (pages > 1) {
      for (let p = 2; p <= pages; p++) {
        const resp = await brokerAPI.searchClients({ ...payload, page: p })
        const d = resp?.data || resp
        list = list.concat(d?.clients || [])
      }
    }
    return list
  }, [])

  // Gather full dataset for export matching current filters
  const gatherExportDataset = useCallback(async () => {
    try {
      console.log('[Client2Page] Building export payload variants...')
      const variants = buildExportPayloadVariants(false)
      console.log('[Client2Page] Payload variants:', variants.length, variants)

      // Fetch and merge unique by login
      const clientMap = new Map()
      for (let i = 0; i < variants.length; i++) {
        const p = variants[i]
        console.log(`[Client2Page] Fetching pages for variant ${i + 1}/${variants.length}...`)
        const rows = await fetchAllPagesForPayload(p)
        console.log(`[Client2Page] Got ${rows?.length || 0} rows for variant ${i + 1}`)
        // Guard: filter out null/undefined rows
        if (Array.isArray(rows)) {
          rows.filter(c => c != null).forEach(c => {
            if (c && c.login) clientMap.set(c.login, c)
          })
        }
      }
      let rows = Array.from(clientMap.values())
      console.log('[Client2Page] Merged unique clients:', rows.length)

      // IB filter is applied server-side via mt5Accounts in payload variants

      // Apply table sort if set
      if (sortBy) {
        const dir = sortOrder === 'asc' ? 1 : -1
        rows.sort((a, b) => {
          if (!a || !b) return 0 // Guard
          const av = a[sortBy], bv = b[sortBy]
          if (av == null && bv == null) return 0
          if (av == null) return 1
          if (bv == null) return -1
          if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
          const as = String(av).toLowerCase(), bs = String(bv).toLowerCase()
          if (as < bs) return -1 * dir
          if (as > bs) return 1 * dir
          return 0
        })
        console.log('[Client2Page] Sorted by', sortBy, sortOrder)
      }

      console.log('[Client2Page] Final export dataset:', rows.length, 'rows')
      return rows
    } catch (err) {
      console.error('[Client2Page] Export dataset error:', err)
      alert('Failed to gather export data: ' + (err.message || 'Unknown error'))
      return []
    }
  }, [buildExportPayloadVariants, fetchAllPagesForPayload, selectedIB, ibMT5Accounts, filterByActiveIB, sortBy, sortOrder])

  // Export to Excel handler (CSV for now)
  const handleExportToExcel = (type) => {
    (async () => {
      try {
        console.log('[Client2Page] Export started, type:', type)
        setShowExportMenu(false)

        // Fetch ALL data for export (not just current page)
        setLoading(true)
        const payload = {
          page: 1,
          limit: totalClients > 0 ? totalClients : 1000000 // Use actual total count, fallback to 1M
        }

        // Add search query if present
        if (searchQuery && searchQuery.trim()) {
          payload.search = searchQuery.trim()
        }

        // Add filters if present
        const combinedFilters = []
        
        // Inject server-side quick filters
        if (quickFilters?.hasFloating) {
          combinedFilters.push({ field: 'floating', operator: 'not_equal', value: '0' })
        }
        if (quickFilters?.hasCredit) {
          combinedFilters.push({ field: 'credit', operator: 'greater_than', value: '0' })
        }
        if (quickFilters?.noDeposit) {
          combinedFilters.push({ field: 'lifetimeDeposit', operator: 'equal', value: '0' })
        }
        if (filters && filters.length > 0) {
          combinedFilters.push(...filters)
        }

        // Add column filters
        Object.entries(columnFilters || {}).forEach(([key, cfg]) => {
          if (cfg.text && cfg.text.trim()) {
            const apiField = key
            combinedFilters.push({ field: apiField, operator: 'contains', value: cfg.text.trim() })
          }
          if (cfg.number && Object.keys(cfg.number).length > 0) {
            const apiField = key
            const { min, max } = cfg.number
            if (min !== undefined && min !== '') {
              combinedFilters.push({ field: apiField, operator: 'greater_than_or_equal', value: String(min) })
            }
            if (max !== undefined && max !== '') {
              combinedFilters.push({ field: apiField, operator: 'less_than_or_equal', value: String(max) })
            }
          }
        })

        if (combinedFilters.length > 0) {
          payload.filters = combinedFilters
        }

        // Add IB filter
        if (selectedIB && ibMT5Accounts && ibMT5Accounts.length > 0) {
          payload.mt5Accounts = ibMT5Accounts
        }

        // Add group filter
        const activeGroupName = getActiveGroupFilter('client2')
        if (activeGroupName && groups && groups.length > 0) {
          const grp = groups.find(g => g.name === activeGroupName)
          if (grp && grp.logins && grp.logins.length > 0) {
            payload.mt5Accounts = grp.logins.map(l => String(l))
          }
        }

        // Tell the API to return percentage values when percentage mode is active
        if (percentModeActive) {
          payload.percentage = true
        }

        const batchSize = 10000
        const CONCURRENCY_LIMIT = 5 // max parallel requests at once

        // Page 1 first — drives all subsequent logic
        const firstResp = await brokerAPI.searchClients({ ...payload, page: 1, limit: batchSize })
        const firstData = firstResp?.data?.data ?? firstResp?.data ?? firstResp
        const firstRows = firstData?.clients ?? []
        const totalPageCount = Number(firstData?.pages ?? 0)

        if (!totalPageCount) {
          console.warn('[Client2Page] API did not return a page count — export may be incomplete')
        }

        const pageCount = totalPageCount || 1
        console.log('[Client2Page] API reports', pageCount, 'page(s) — fetching remaining in parallel')

        let allRows = [...firstRows]

        if (pageCount > 1) {
          const remainingPages = Array.from({ length: pageCount - 1 }, (_, i) => i + 2)

          // Chunked parallel fetch to avoid hammering the server
          for (let i = 0; i < remainingPages.length; i += CONCURRENCY_LIMIT) {
            const chunk = remainingPages.slice(i, i + CONCURRENCY_LIMIT)
            const chunkResults = await Promise.all(
              chunk.map(p =>
                brokerAPI.searchClients({ ...payload, page: p, limit: batchSize }).then(res => {
                  const d = res?.data?.data ?? res?.data ?? res
                  return d?.clients ?? []
                })
              )
            )
            chunkResults.forEach(rows => allRows.push(...rows))
            console.log(`[Client2Page] Fetched pages ${chunk[0]}–${chunk.at(-1)}, total so far: ${allRows.length}`)
          }
        }

        console.log('[Client2Page] Final row count:', allRows.length)

        setLoading(false)

        console.log('[Client2Page] Export dataset fetched:', allRows?.length, 'rows')

        if (!allRows || allRows.length === 0) {
          alert('No data to export. Please check your filters and try again.')
          return
        }

        // For "all" export, use all columns; for "table" export, use only visible columns
        let columns = type === 'all' ? allColumns : visibleColumnsList

        console.log('[Client2Page] Exporting', columns.length, 'columns for', allRows.length, 'rows')

        // Fields that have a _percentage variant returned by the API in percentage mode
        // Using Set for O(1) lookups — called for every cell of every row
        const fieldsWithPercentage = new Set([
          'balance', 'credit', 'equity', 'margin', 'marginFree', 'marginInitial', 'marginMaintenance',
          'profit', 'floating', 'pnl', 'previousEquity', 'assets', 'liabilities', 'storage',
          'blockedCommission', 'blockedProfit', 'dailyDeposit', 'dailyWithdrawal', 'dailyCreditIn',
          'dailyCreditOut', 'dailyBonusIn', 'dailyBonusOut', 'dailySOCompensationIn', 'dailySOCompensationOut',
          'thisWeekPnL', 'thisWeekDeposit', 'thisWeekWithdrawal', 'thisWeekCreditIn', 'thisWeekCreditOut',
          'thisWeekBonusIn', 'thisWeekBonusOut', 'thisWeekSOCompensationIn', 'thisWeekSOCompensationOut',
          'thisWeekCommission', 'thisWeekCorrection', 'thisWeekSwap',
          'thisMonthPnL', 'thisMonthDeposit', 'thisMonthWithdrawal', 'thisMonthCreditIn', 'thisMonthCreditOut',
          'thisMonthBonusIn', 'thisMonthBonusOut', 'thisMonthSOCompensationIn', 'thisMonthSOCompensationOut',
          'thisMonthCommission', 'thisMonthCorrection', 'thisMonthSwap',
          'lifetimePnL', 'lifetimeDeposit', 'lifetimeWithdrawal', 'lifetimeCreditIn', 'lifetimeCreditOut',
          'lifetimeBonusIn', 'lifetimeBonusOut', 'lifetimeSOCompensationIn', 'lifetimeSOCompensationOut',
          'lifetimeCommission', 'lifetimeCorrection', 'lifetimeSwap'
        ])

        // Create worksheet data with headers and rows
        const worksheetData = [
          columns.map(col => {
            // Append % to header label when percentage mode is active for that field
            if (percentModeActive && fieldsWithPercentage.has(col.key)) {
              return `${col.label} %`
            }
            return col.label
          }),
          ...(allRows || []).filter(client => client != null).map(client => {
            return columns.map(col => {
              // In percentage mode, read the _percentage variant for eligible fields
              const isPercentField = percentModeActive && fieldsWithPercentage.has(col.key)
              const fieldKey = isPercentField ? `${col.key}_percentage` : col.key
              let value = client[fieldKey] ?? client[col.key]
              if (value === null || value === undefined || value === '') return ''
              // Format epoch ms timestamps — driven by column type so new date fields work automatically
              if (col.type === 'timestamp') {
                const ts = parseInt(value)
                if (!isNaN(ts) && ts > 0) {
                  const d = new Date(ts)
                  const day = String(d.getDate()).padStart(2, '0')
                  const month = String(d.getMonth() + 1).padStart(2, '0')
                  const year = d.getFullYear()
                  const hours = String(d.getHours()).padStart(2, '0')
                  const mins = String(d.getMinutes()).padStart(2, '0')
                  const secs = String(d.getSeconds()).padStart(2, '0')
                  return `${day}/${month}/${year} ${hours}:${mins}:${secs}`
                }
                return ''
              }
              // Format percentage values — plain number, no % sign in Excel
              if (isPercentField) {
                const num = Number(value)
                return isNaN(num) ? value : parseFloat(num.toFixed(2))
              }
              return value
            })
          })
        ]

        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new()
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
        
        // Auto-size columns
        const maxWidths = columns.map((col, colIndex) => {
          const headerLength = col.label.length
          const maxDataLength = Math.max(
            ...worksheetData.slice(1).map(row => 
              String(row[colIndex] || '').length
            )
          )
          return Math.max(headerLength, maxDataLength, 10)
        })
        
        worksheet['!cols'] = maxWidths.map(w => ({ wch: Math.min(w, 50) }))
        
        // Add worksheet to workbook
        const sheetName = type === 'all' ? 'All Columns' : 'Table Columns'
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        
        // Generate and download Excel file
        const suffix = type === 'all' ? 'all_columns' : 'table_columns'
        const fileName = `clients_${suffix}_${new Date().toISOString().split('T')[0]}.xlsx`
        XLSX.writeFile(workbook, fileName)
        
        console.log('[Client2Page] Export completed successfully')
      } catch (err) {
        setLoading(false)
        console.error('[Client2Page] Export error:', err)
        alert('Export failed: ' + (err.message || 'Please try again.'))
      }
    })()
  }

  // View client details
  const handleViewClientDetails = (client) => {
    setSelectedClient(client)
    setShowClientDetailModal(true)
  }

  // Format value for display
  const formatValue = (key, value, isPercentageField = false) => {
    if (value === null || value === undefined || value === '') {
      return '-'
    }

    // Processor Type: show friendly connection status labels
    if (key === 'processorType' || key === 'processor_type' || key === 'PROCESSOR_TYPE') {
      if (typeof value === 'boolean') {
        return value ? 'Connected' : 'Not Connected'
      }
      // In case backend sends 1/0 or 'true'/'false'
      const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value
      if (normalized === 1 || normalized === '1' || normalized === 'true') return 'Connected'
      if (normalized === 0 || normalized === '0' || normalized === 'false') return 'Not Connected'
      return String(value)
    }

    // Ensure booleans render as text instead of disappearing
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false'
    }

    // Format numbers with Indian style
    if (['balance', 'credit', 'equity', 'margin', 'marginFree', 'profit', 'floating',
      'dailyPnL', 'thisWeekPnL', 'thisMonthPnL', 'lifetimePnL'].includes(key)) {
      const num = parseFloat(value)
      if (isNaN(num)) return '-'
      // Compact display for the toggle-eligible fields
      if (displayMode === 'compact' && compactNumberFields.has(key)) {
        return formatCompactIndian(num)
      }
      // Don't append % to values, it's shown in header
      return formatIndianNumber(num.toFixed(2))
    }

    // Format margin level as plain number
    if (key === 'marginLevel') {
      const num = parseFloat(value)
      if (isNaN(num)) return '-'
      return formatIndianNumber(num.toFixed(2))
    }

    // Format leverage
    if (key === 'leverage') {
      return `1:${value}`
    }

    // Format dates
    if (key === 'registration' || key === 'lastAccess') {
      if (!value) return '-'
      const timestamp = parseInt(value)
      if (isNaN(timestamp)) return value
      const date = new Date(timestamp * 1000)
      return date.toLocaleString()
    }

    // Format epoch timestamps (userLastUpdate, accountLastUpdate)
    if (key === 'userLastUpdate' || key === 'accountLastUpdate') {
      if (!value) return '-'
      const timestamp = parseInt(value)
      if (isNaN(timestamp)) return '-'
      const date = new Date(timestamp)
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const year = date.getFullYear()
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      const seconds = String(date.getSeconds()).padStart(2, '0')
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
    }

    return value
  }

  // Get color class for numeric values
  const getValueColorClass = (key, value) => {
    if (value === null || value === undefined || value === '') {
      return ''
    }

    // Color code profit/loss fields
    if (['profit', 'floating', 'dailyPnL', 'thisWeekPnL', 'thisMonthPnL', 'lifetimePnL'].includes(key)) {
      const num = parseFloat(value)
      if (isNaN(num)) return ''
      if (num > 0) return 'text-green-600 font-semibold'
      if (num < 0) return 'text-red-600 font-semibold'
    }

    // Color code margin level
    if (key === 'marginLevel') {
      const num = parseFloat(value)
      if (isNaN(num)) return ''
      if (num < 100) return 'text-red-600 font-semibold'
      if (num < 200) return 'text-orange-600 font-semibold'
      return 'text-green-600'
    }

    return ''
  }

  // Chip styling for processorType and accountType
  const getProcessorTypeChipClasses = (type) => {
    const t = String(type || '').toLowerCase()
    if (t.includes('connected') && !t.includes('not')) return 'bg-green-100 text-green-800'
    if (t.includes('not connected')) return 'bg-red-100 text-red-800'
    if (t.includes('mt4') || t === 'mt4') return 'bg-blue-100 text-blue-800'
    if (t.includes('mt5') || t === 'mt5') return 'bg-purple-100 text-purple-800'
    if (t.includes('ctrader')) return 'bg-indigo-100 text-indigo-800'
    return 'bg-gray-100 text-gray-700'
  }

  const getAccountTypeChipClasses = (type) => {
    const t = String(type || '').toUpperCase()
    // Account tier types
    if (t === 'PLATINUM') return 'bg-cyan-100 text-cyan-800'
    if (t === 'GOLD') return 'bg-yellow-100 text-yellow-800'
    if (t === 'SILVER') return 'bg-gray-200 text-gray-700'
    if (t === 'STANDARD') return 'bg-blue-100 text-blue-800'
    // Account category types
    if (t.includes('LIVE') || t === 'LIVE' || t === 'REAL') return 'bg-green-100 text-green-800'
    if (t.includes('DEMO')) return 'bg-orange-100 text-orange-800'
    if (t.includes('CONTEST')) return 'bg-purple-100 text-purple-800'
    return 'bg-indigo-100 text-indigo-700'
  }

  // Format numbers in Indian style
  const formatIndianNumber = (num) => {
    const numStr = num.toString()
    const [integerPart, decimalPart] = numStr.split('.')

    const isNegative = integerPart.startsWith('-')
    const absoluteInteger = isNegative ? integerPart.substring(1) : integerPart

    if (absoluteInteger.length <= 3) {
      return decimalPart ? `${integerPart}.${decimalPart}` : integerPart
    }

    const lastThree = absoluteInteger.substring(absoluteInteger.length - 3)
    const otherNumbers = absoluteInteger.substring(0, absoluteInteger.length - 3)
    const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    const formatted = `${formattedOther},${lastThree}`

    const result = (isNegative ? '-' : '') + formatted
    return decimalPart ? `${result}.${decimalPart}` : result
  }

  // Indian compact formatter: 2.57Cr, 12.50L, 25.50K
  const formatCompactIndian = (num) => {
    const n = Number(num)
    if (!isFinite(n)) return '0'
    const abs = Math.abs(n)
    const sign = n < 0 ? '-' : ''
    if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`
    if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L`
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K`
    return `${sign}${abs.toFixed(2)}`
  }

  // Fields that participate in the Compact/Full display toggle
  const compactNumberFields = new Set([
    'balance', 'credit', 'equity', 'margin', 'marginFree', 'profit', 'floating'
  ])

  // Percentage mode: just append a percent sign to the normal formatted number
  const formatPercentageValue = (value) => {
    if (value == null || value === '') return ''
    const num = Number(value) || 0
    return `${formatIndianNumber(num.toFixed(2))} %`
  }

  // Get card icon path based on card title
  const getCardIcon = (cardLabel) => {
    // Normalize to uppercase for consistent matching
    const normalizedLabel = cardLabel.toUpperCase()
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'TOTAL CLIENTS': `${baseUrl}Desktop cards icons/Total Clients.svg`,
      'ASSETS': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'BALANCE': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'BLOCKED COMMISSION': `${baseUrl}Desktop cards icons/Blocked commision.svg`,
      'BLOCKED PROFIT': `${baseUrl}Desktop cards icons/Floating Profit.svg`,
      'COMMISSION': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'THIS WEEK COMMISSION': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'THIS MONTH COMMISSION': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'LIFETIME COMMISSION': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'CREDIT': `${baseUrl}Desktop cards icons/Total Credit.svg`,
      'DAILY BONUS IN': `${baseUrl}Desktop cards icons/Daily BONUS IN.svg`,
      'DAILY BONUS OUT': `${baseUrl}Desktop cards icons/Daily BONUS OUT.svg`,
      'DAILY CREDIT IN': `${baseUrl}Desktop cards icons/LIFETIME CREDIT IN.svg`,
      'DAILY CREDIT OUT': `${baseUrl}Desktop cards icons/LIFETIME CREDIT OUT.svg`,
      'DAILY DEPOSIT': `${baseUrl}Desktop cards icons/Daily Deposite.svg`,
      'DAILY P&L': `${baseUrl}Desktop cards icons/Daily PNL.svg`,
      'DAILY SO COMPENSATION IN': `${baseUrl}Desktop cards icons/Daily BONUS IN.svg`,
      'DAILY SO COMPENSATION OUT': `${baseUrl}Desktop cards icons/Daily BONUS OUT.svg`,
      'DAILY WITHDRAWAL': `${baseUrl}Desktop cards icons/Daily WITHDRAWL.svg`,
      'DAILY NET D/W': `${baseUrl}Desktop cards icons/NET WD.svg`,
      'NET DAILY BONUS': `${baseUrl}Desktop cards icons/Net Daily Bonus.svg`,
      'EQUITY': `${baseUrl}Desktop cards icons/Total Equity.svg`,
      'FLOATING P/L': `${baseUrl}Desktop cards icons/Floating Profit.svg`,
      'FLOATING': `${baseUrl}Desktop cards icons/Floating Profit.svg`,
      'LIABILITIES': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'LIFETIME BONUS IN': `${baseUrl}Desktop cards icons/LIFETIME BONUS IN.svg`,
      'LIFETIME BONUS OUT': `${baseUrl}Desktop cards icons/LIFETIME BONUS OUT.svg`,
      'LIFETIME CREDIT IN': `${baseUrl}Desktop cards icons/LIFETIME CREDIT IN.svg`,
      'LIFETIME CREDIT OUT': `${baseUrl}Desktop cards icons/LIFETIME CREDIT OUT.svg`,
      'LIFETIME DEPOSIT': `${baseUrl}Desktop cards icons/Daily Deposite.svg`,
      'LIFETIME P&L': `${baseUrl}Desktop cards icons/LIFETIME PNL.svg`,
      'LIFETIME PNL': `${baseUrl}Desktop cards icons/LIFETIME PNL.svg`,
      'LIFETIME SO COMPENSATION IN': `${baseUrl}Desktop cards icons/LIFETIME BONUS IN.svg`,
      'LIFETIME SO COMPENSATION OUT': `${baseUrl}Desktop cards icons/LIFETIME BONUS OUT.svg`,
      'LIFETIME WITHDRAWAL': `${baseUrl}Desktop cards icons/Daily WITHDRAWL.svg`,
      'NET LIFETIME DW': `${baseUrl}Desktop cards icons/NET WD.svg`,
      'MARGIN': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'MARGIN FREE': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'THIS MONTH BONUS IN': `${baseUrl}Desktop cards icons/MONTHLY BONUS IN.svg`,
      'THIS MONTH BONUS OUT': `${baseUrl}Desktop cards icons/MONTHLY BONUS OUt.svg`,
      'THIS MONTH CREDIT IN': `${baseUrl}Desktop cards icons/MONTHLY CREDIT IN.svg`,
      'THIS MONTH CREDIT OUT': `${baseUrl}Desktop cards icons/MOnthly CREDIT OUT.svg`,
      'THIS MONTH DEPOSIT': `${baseUrl}Desktop cards icons/MONTLY DEPOSITE.svg`,
      'THIS MONTH P&L': `${baseUrl}Desktop cards icons/THIS MONTH PNL.svg`,
      'THIS MONTH PNL': `${baseUrl}Desktop cards icons/THIS MONTH PNL.svg`,
      'THIS MONTH SO COMPENSATION IN': `${baseUrl}Desktop cards icons/MONTHLY BONUS IN.svg`,
      'THIS MONTH SO COMPENSATION OUT': `${baseUrl}Desktop cards icons/MONTHLY BONUS OUt.svg`,
      'THIS MONTH WITHDRAWAL': `${baseUrl}Desktop cards icons/MONTLY WITHDRAWL.svg`,
      // Correction and Swap (no dedicated icons; using generic ones)
      'THIS WEEK CORRECTION': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'THIS MONTH CORRECTION': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'LIFETIME CORRECTION': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'THIS WEEK SWAP': `${baseUrl}Desktop cards icons/PNL.svg`,
      'THIS MONTH SWAP': `${baseUrl}Desktop cards icons/PNL.svg`,
      'LIFETIME SWAP': `${baseUrl}Desktop cards icons/PNL.svg`,
      'NET MONTHLY BONUS': `${baseUrl}Desktop cards icons/NET MONTHLY BONUS.svg`,
      'NET MONTHLY DW': `${baseUrl}Desktop cards icons/NET MONTHLY DW.svg`,
      'PROFIT': `${baseUrl}Desktop cards icons/Floating Profit.svg`,
      'STORAGE': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'THIS WEEK BONUS IN': `${baseUrl}Desktop cards icons/Weekly bonus in.svg`,
      'THIS WEEK BONUS OUT': `${baseUrl}Desktop cards icons/WEEK BONUS OUT.svg`,
      'THIS WEEK CREDIT IN': `${baseUrl}Desktop cards icons/WEEKLY Credit IN.svg`,
      'THIS WEEK CREDIT OUT': `${baseUrl}Desktop cards icons/WEEKLY CREDIT OUT.svg`,
      'THIS WEEK DEPOSIT': `${baseUrl}Desktop cards icons/WEEK DEPOSITE.svg`,
      'THIS WEEK P&L': `${baseUrl}Desktop cards icons/This week pnl.svg`,
      'THIS WEEK PNL': `${baseUrl}Desktop cards icons/This week pnl.svg`,
      'THIS WEEK SO COMPENSATION IN': `${baseUrl}Desktop cards icons/Weekly bonus in.svg`,
      'THIS WEEK SO COMPENSATION OUT': `${baseUrl}Desktop cards icons/WEEK BONUS OUT.svg`,
      'THIS WEEK WITHDRAWAL': `${baseUrl}Desktop cards icons/WEEK WITHDRAWL.svg`,
      'NET WEEK BONUS': `${baseUrl}Desktop cards icons/NET WEEK BONUS.svg`,
      'NET WEEK DW': `${baseUrl}Desktop cards icons/NET WEEK DAY.svg`,
      'NET LIFETIME BONUS': `${baseUrl}Desktop cards icons/LIFETIME BONUS IN.svg`,
      'NET CREDIT': `${baseUrl}Desktop cards icons/Total Credit.svg`,
      'BOOK PNL': `${baseUrl}Desktop cards icons/PNL.svg`,
      'BOOK P&L': `${baseUrl}Desktop cards icons/PNL.svg`,
      'AVAILABLE REBATE': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'TOTAL REBATE': `${baseUrl}Desktop cards icons/TOTAL COMMISION.svg`,
      'NET LIFETIME PNL': `${baseUrl}Desktop cards icons/LIFETIME PNL.svg`,
      'P&L': `${baseUrl}Desktop cards icons/Daily PNL.svg`,
      'PNL': `${baseUrl}Desktop cards icons/Daily PNL.svg`,
      // Percentage variants
      'AVAILABLE REBATE %': `${baseUrl}Desktop cards icons/AVAILABLE Commision%25.svg`,
      'TOTAL REBATE %': `${baseUrl}Desktop cards icons/TOTAL COMMISION%25.svg`,
      'NET LIFETIME PNL %': `${baseUrl}Desktop cards icons/LIFETIME PNL.svg`,
      'BOOK PNL %': `${baseUrl}Desktop cards icons/PNL.svg`,
      'BOOK P&L %': `${baseUrl}Desktop cards icons/PNL.svg`,
      'DAILY DEPOSIT %': `${baseUrl}Desktop cards icons/Daily Deposite.svg`,
      'DAILY WITHDRAWAL %': `${baseUrl}Desktop cards icons/Daily WITHDRAWL.svg`,
      'LIFETIME PNL %': `${baseUrl}Desktop cards icons/LIFETIME PNL.svg`,
    }
    return iconMap[normalizedLabel] || `${baseUrl}Desktop cards icons/Total Clients.svg`
  }

  // Save card visibility to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('client2CardVisibility', JSON.stringify(cardVisibility))
  }, [cardVisibility])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close column selector for wheel/mouse interactions inside panel
      const isWheel = event.type === 'wheel'
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target) && !isWheel) {
        setShowColumnSelector(false)
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setShowFilterMenu(false)
      }
      if (cardFilterMenuRef.current && !cardFilterMenuRef.current.contains(event.target)) {
        setShowCardFilterMenu(false)
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false)
      }
      // Close filter dropdown if clicking outside
      if (showFilterDropdown) {
        const clickedInsideButton = filterRefs.current[showFilterDropdown]?.contains(event.target)
        const clickedInsideDropdown = document.querySelector('.filter-dropdown-panel')?.contains(event.target)
        if (!clickedInsideButton && !clickedInsideDropdown) {
          setShowFilterDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterDropdown])

  // Early return for mobile - render mobile component
  if (isMobile) {
    return (
      <div className="w-full min-h-screen bg-neutral-900/5">
        <Client2Module />
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
    <div className="h-screen flex overflow-hidden relative bg-[#F8FAFC]">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false)
          try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch { }
        }}
        onToggle={() => {
          setSidebarOpen(v => {
            const next = !v
            try { localStorage.setItem('sidebarOpen', JSON.stringify(next)) } catch { }
            return next
          })
        }}
      />

      <main className={`flex-1 p-2 sm:p-4 lg:p-6 overflow-x-hidden overflow-y-auto no-page-scrollbar relative z-10 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className="max-w-full mx-auto h-full flex flex-col min-h-0">
          {/* Header Section */}
          <div className="bg-white rounded-2xl shadow-sm px-3 sm:px-6 py-3 mb-4 sm:mb-6">
            {/* Title + Actions */}
            <div className="mb-2.5 pb-2.5 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-[#1A1A1A]">Clients</h1>
                <p className="text-xs text-[#6B7280] mt-0.5">Manage and view all client accounts...</p>
              </div>
              {/* Action Buttons Row moved to right of title - keep only Cards toggle */}
              <div className="flex items-center gap-2">
                {/* Filter Button */}
                <div className="relative flex items-center" ref={filterMenuRef}>
                  <button
                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                    className="h-8 px-2.5 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                    title="Filter Options"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M4 6H12M5.5 9H10.5M7 12H9" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <span className="text-xs font-medium text-[#374151]">Filter</span>
                    {((quickFilters?.hasFloating ? 1 : 0) + (quickFilters?.hasCredit ? 1 : 0) + (quickFilters?.noDeposit ? 1 : 0)) > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold h-4 min-w-4 px-1 leading-none">
                        {(quickFilters?.hasFloating ? 1 : 0) + (quickFilters?.hasCredit ? 1 : 0) + (quickFilters?.noDeposit ? 1 : 0)}
                      </span>
                    )}
                  </button>

                  {showFilterMenu && (
                    <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-[#E5E7EB] z-[9999]">
                      <div className="p-4">
                        <div className="text-sm font-semibold text-[#1F2937] mb-3">Quick Filters</div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-md transition-all">
                            <input
                              type="checkbox"
                              checked={quickFilters.hasFloating}
                              onChange={(e) => {
                                // Invalidate any in-flight requests from previous filter state
                                requestIdRef.current++
                                setQuickFilters(prev => ({
                                  ...prev,
                                  hasFloating: e.target.checked
                                }))
                                setCurrentPage(1)
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-[#374151]">Has Floating</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-md transition-all">
                            <input
                              type="checkbox"
                              checked={quickFilters.hasCredit}
                              onChange={(e) => {
                                // Invalidate any in-flight requests from previous filter state
                                requestIdRef.current++
                                setQuickFilters(prev => ({
                                  ...prev,
                                  hasCredit: e.target.checked
                                }))
                                setCurrentPage(1)
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-[#374151]">Has Credit</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-md transition-all">
                            <input
                              type="checkbox"
                              checked={quickFilters.noDeposit}
                              onChange={(e) => {
                                // Invalidate any in-flight requests from previous filter state
                                requestIdRef.current++
                                setQuickFilters(prev => ({
                                  ...prev,
                                  noDeposit: e.target.checked
                                }))
                                setCurrentPage(1)
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-[#374151]">No Deposit</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Groups Button */}
                <GroupSelector
                  onCreateClick={() => {
                    setEditingGroup(null)
                    setShowGroupModal(true)
                  }}
                  onEditClick={(group) => {
                    setEditingGroup(group)
                    setShowGroupModal(true)
                  }}
                  moduleName="client2"
                />

                {/* Percentage Toggle */}
                <button
                  role="switch"
                  aria-checked={cardFilterPercentMode}
                  onClick={() => {
                    setCardFilterPercentMode(v => !v)
                    fetchClients(false)
                  }}
                  title="Toggle percentage mode"
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-300 ease-in-out focus:outline-none ${
                    cardFilterPercentMode ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${
                      cardFilterPercentMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  >
                    <span className={`text-[9px] font-bold ${cardFilterPercentMode ? 'text-blue-600' : 'text-gray-500'}`}>%</span>
                  </span>
                </button>

                {/* Download Button */}
                <div className="relative" ref={exportMenuRef}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="h-8 w-8 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                    title="Download as Excel (CSV)"
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                      <path d="M10 3v10m0 0l-4-4m4 4l4-4" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="4" y="15" width="12" height="2" rx="1" fill="#4B5563"/>
                    </svg>
                  </button>

                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E5E7EB] z-50 overflow-hidden">
                      <div className="py-1">
                        <button
                          onClick={() => handleExportToExcel('table')}
                          className="w-full text-left px-4 py-2 text-sm text-[#374151] hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="3" width="12" height="10" stroke="#4B5563" strokeWidth="1" rx="1" fill="none"/>
                            <line x1="2" y1="6" x2="14" y2="6" stroke="#4B5563" strokeWidth="1"/>
                            <line x1="6" y1="3" x2="6" y2="13" stroke="#4B5563" strokeWidth="1"/>
                          </svg>
                          Download Table Columns
                        </button>
                        <button
                          onClick={() => handleExportToExcel('all')}
                          className="w-full text-left px-4 py-2 text-sm text-[#374151] hover:bg-gray-50 transition-colors flex items-center gap-2"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <rect x="1" y="2" width="14" height="12" stroke="#4B5563" strokeWidth="1" rx="1" fill="none"/>
                            <line x1="1" y1="5" x2="15" y2="5" stroke="#4B5563" strokeWidth="1"/>
                            <line x1="5" y1="2" x2="5" y2="14" stroke="#4B5563" strokeWidth="1"/>
                            <line x1="10" y1="2" x2="10" y2="14" stroke="#4B5563" strokeWidth="1"/>
                          </svg>
                          Download All Columns
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Filter Button */}
                <div className="relative flex items-center" ref={cardFilterMenuRef}>
                  <button
                    onClick={() => setShowCardFilterMenu(!showCardFilterMenu)}
                    className="h-8 px-2.5 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                    title="Toggle Card Visibility"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="2" width="5" height="5" rx="1" stroke="#4B5563" strokeWidth="1.5"/>
                      <rect x="9" y="2" width="5" height="5" rx="1" stroke="#4B5563" strokeWidth="1.5"/>
                      <rect x="2" y="9" width="5" height="5" rx="1" stroke="#4B5563" strokeWidth="1.5"/>
                      <rect x="9" y="9" width="5" height="5" rx="1" stroke="#4B5563" strokeWidth="1.5"/>
                    </svg>
                    <span className="text-xs font-medium text-[#374151]">Card Filter</span>
                  </button>

                {showCardFilterMenu && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-[#E5E7EB] z-[200] max-h-96 overflow-y-auto">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-[#1F2937]">Show/Hide Cards</div>
                        <button
                          onClick={() => {
                            // Determine the keys currently displayed in the menu and toggle only those
                            const baseLabels = {
                              totalClients: 'Total Clients',
                              balance: 'Balance',
                              credit: 'Credit',
                              equity: 'Equity',
                              floating: 'Floating PNL',
                              pnl: 'P&L'
                            }
                            const baseItems = Object.entries(baseLabels).map(([key, label]) => [key, label])
                            // In % Mode we still filter base cards only; percent variants are no longer selectable
                            const items = baseItems
                            const filteredItems = items.filter(([_, label]) =>
                              cardFilterSearchQuery === '' || label.toLowerCase().includes(cardFilterSearchQuery.toLowerCase())
                            )
                            const displayedKeys = filteredItems.map(([key]) => key)
                            const allVisible = displayedKeys.every(k => cardVisibility[k] !== false)
                            const newVisibility = { ...cardVisibility }
                            displayedKeys.forEach(k => { newVisibility[k] = !allVisible })
                            setCardVisibility(newVisibility)
                          }}
                          className="text-xs text-pink-600 hover:text-pink-700 font-medium"
                        >
                          {/* Determine button label based on displayed items only */}
                          {(() => {
                            const baseLabels = {
                              totalClients: 'Total Clients',
                              balance: 'Balance',
                              credit: 'Credit',
                              equity: 'Equity',
                              floating: 'Floating PNL',
                              pnl: 'P&L'
                            }
                            const baseItems = Object.entries(baseLabels).map(([key, label]) => [key, label])
                            const items = baseItems
                            const filteredItems = items.filter(([_, label]) =>
                              cardFilterSearchQuery === '' || label.toLowerCase().includes(cardFilterSearchQuery.toLowerCase())
                            )
                            const displayedKeys = filteredItems.map(([key]) => key)
                            const allVisible = displayedKeys.every(k => cardVisibility[k] !== false)
                            return allVisible ? 'Hide All' : 'Show All'
                          })()}
                        </button>
                      </div>

                      <input
                        type="text"
                        placeholder="Search cards..."
                        value={cardFilterSearchQuery}
                        onChange={(e) => setCardFilterSearchQuery(e.target.value)}
                        className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg mb-3 focus:outline-none focus:border-pink-300 text-gray-900 bg-white"
                      />

                      <div className="space-y-1">
                        {(() => {
                          const baseLabels = {
                            totalClients: 'Total Clients',
                            balance: 'Balance',
                            credit: 'Credit',
                            equity: 'Equity',
                            floating: 'Floating PNL',
                            pnl: 'P&L'
                          }
                          // Use faceCardOrder for ordering
                          const baseItems = (faceCardOrder || Object.keys(baseLabels)).map(key => [key, baseLabels[key]]).filter(([key, label]) => label)
                          // Filter by search
                          const filteredItems = baseItems.filter(([key, label]) =>
                            cardFilterSearchQuery === '' ||
                            label.toLowerCase().includes(cardFilterSearchQuery.toLowerCase())
                          )
                          // Drag-and-drop handlers
                          const handleDragStart = (e, key) => {
                            setDraggedCardKey(key)
                            e.dataTransfer.effectAllowed = 'move'
                          }
                          const handleDragOver = (e, key) => {
                            e.preventDefault()
                            setDragOverCardKey(key)
                          }
                          const handleDrop = (e, key) => {
                            e.preventDefault()
                            if (draggedCardKey && draggedCardKey !== key) {
                              const oldIndex = faceCardOrder.indexOf(draggedCardKey)
                              const newIndex = faceCardOrder.indexOf(key)
                              if (oldIndex !== -1 && newIndex !== -1) {
                                const newOrder = [...faceCardOrder]
                                newOrder.splice(oldIndex, 1)
                                newOrder.splice(newIndex, 0, draggedCardKey)
                                setFaceCardOrder(newOrder)
                                localStorage.setItem('client2FaceCardOrder', JSON.stringify(newOrder))
                              }
                            }
                            setDraggedCardKey(null)
                            setDragOverCardKey(null)
                          }
                          const handleDragEnd = () => {
                            setDraggedCardKey(null)
                            setDragOverCardKey(null)
                          }
                          return filteredItems.map(([key, label]) => (
                            <div
                              key={key}
                              className={`flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded ${dragOverCardKey === key ? 'bg-pink-100' : ''}`}
                              draggable
                              onDragStart={e => handleDragStart(e, key)}
                              onDragOver={e => handleDragOver(e, key)}
                              onDrop={e => handleDrop(e, key)}
                              onDragEnd={handleDragEnd}
                            >
                              {/* Burger menu icon */}
                              <span className="flex items-center mr-2 cursor-grab text-gray-400" title="Drag to reorder">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                  <circle cx="5" cy="6" r="1.5" fill="#9CA3AF" />
                                  <circle cx="5" cy="10" r="1.5" fill="#9CA3AF" />
                                  <circle cx="5" cy="14" r="1.5" fill="#9CA3AF" />
                                  <circle cx="11" cy="6" r="1.5" fill="#9CA3AF" />
                                  <circle cx="11" cy="10" r="1.5" fill="#9CA3AF" />
                                  <circle cx="11" cy="14" r="1.5" fill="#9CA3AF" />
                                </svg>
                              </span>
                              <input
                                type="checkbox"
                                checked={cardVisibility[key] !== false}
                                onChange={e => {
                                  setCardVisibility(prev => ({
                                    ...prev,
                                    [key]: e.target.checked
                                  }))
                                }}
                                className="w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500"
                              />
                              <span className="text-sm text-gray-700">{label}</span>
                            </div>
                          ))
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cards Toggle Button with Switch */}
              <button
                onClick={() => setShowFaceCards(v => !v)}
                className="h-8 px-2.5 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
                title={showFaceCards ? "Hide cards" : "Show cards"}
              >
                <span className="text-xs font-medium text-[#374151]">Cards</span>
                <div className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${showFaceCards ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${showFaceCards ? 'translate-x-4' : 'translate-x-0.5'}`}
                  />
                </div>
              </button>
                {/* Cards toggle removed as requested */}
              </div>
            </div>
          </div>

          {/* 6 Face Cards - matching Positions module style */}
          {showFaceCards && ((totals && Object.keys(totals).length > 0) || (totalsPercent && Object.keys(totalsPercent).length > 0)) && (
            <div className="mb-6">
              {(() => {
                const t = cardFilterPercentMode ? totalsPercent : totals
                const pnlValue = Number(t?.pnl || 0)
                const floatingValue = Number(t?.floating || 0)
                const isLoadingCards = initialLoad || loading
                const isCompact = displayMode === 'compact'
                // Helpers: produce a (display, full) pair for a numeric monetary value
                const buildMoney = (raw) => {
                  const n = Number(raw || 0)
                  const full = formatIndianNumber(n.toFixed(2))
                  const display = isCompact ? formatCompactIndian(n) : full
                  return { display, full }
                }
                const buildSignedMoney = (raw) => {
                  const n = Number(raw || 0)
                  const sign = n < 0 ? '-' : ''
                  const abs = Math.abs(n)
                  const full = sign + formatIndianNumber(abs.toFixed(2))
                  const display = isCompact ? (sign + formatCompactIndian(abs)) : full
                  return { display, full }
                }
                const balanceM = buildMoney(t?.balance)
                const creditM = buildMoney(t?.credit)
                const equityM = buildMoney(t?.equity)
                const floatingM = buildSignedMoney(floatingValue)
                const pnlM = buildSignedMoney(pnlValue)
                // Card definitions by key
                const cardDefs = {
                  totalClients: { title: 'Total Clients', value: formatIndianNumber(totalClients || 0), valueColor: 'text-[#000000]', skeletonW: 'w-14' },
                  balance: { title: 'Balance', value: balanceM.display, fullValue: balanceM.full, valueColor: 'text-[#000000]', skeletonW: 'w-20' },
                  credit: { title: 'Credit', value: creditM.display, fullValue: creditM.full, valueColor: 'text-[#000000]', skeletonW: 'w-20' },
                  equity: { title: 'Equity', value: equityM.display, fullValue: equityM.full, valueColor: 'text-[#000000]', skeletonW: 'w-20' },
                  floating: { title: 'Floating PNL', value: floatingM.display, fullValue: floatingM.full, valueColor: floatingValue >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]', skeletonW: 'w-20' },
                  pnl: { title: 'P&L', value: pnlM.display, fullValue: pnlM.full, valueColor: pnlValue >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]', skeletonW: 'w-20' }
                }
                // Only show cards that are in faceCardOrder and visible
                const visibleOrderedKeys = (faceCardOrder || Object.keys(cardDefs)).filter(key => cardVisibility[key] !== false && cardDefs[key])
                return (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {visibleOrderedKeys.map(key => {
                      const card = cardDefs[key]
                      return (
                        <div
                          key={key}
                          className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                            <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">
                              {card.title}{cardFilterPercentMode && card.title !== 'Total Clients' ? <span style={{marginLeft: 2}}>%</span> : null}
                            </span>
                            <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                              <img
                                src={getCardIcon(card.title)}
                                alt={card.title}
                                style={{ width: '100%', height: '100%' }}
                                onError={(e) => { e.target.style.display = 'none' }}
                              />
                            </div>
                          </div>
                          {isLoadingCards ? (
                            <div className={`h-6 ${card.skeletonW} bg-gray-200 rounded animate-pulse`}></div>
                          ) : (
                            <div className={`text-sm md:text-base font-bold flex items-center gap-1.5 leading-none ${card.valueColor}`}>
                              <span title={isCompact && card.fullValue ? card.fullValue : undefined}>{card.value}</span>
                              {card.unit && (
                                <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">{card.unit}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1">
            {/* Search Bar and Table Container */}
            {!initialLoad && (
              <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden">
                {/* Search and Controls Bar */}
                <div className="border-b border-[#E5E7EB] p-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Left: Search and Columns */}
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4B5563]" fill="none" viewBox="0 0 18 18">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Search"
                      className="w-full h-10 pl-10 pr-20 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                    {/* Search Icon (inside input) */}
                    <button
                      onClick={handleSearch}
                      className="absolute right-1 top-1/2 -translate-y-1/2 bg-blue-600 text-white hover:bg-blue-700 transition-colors z-0 rounded-md p-1.5"
                      title="Search"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                    
                    {searchInput && (
                      <button
                        onClick={() => {
                          setSearchInput('')
                          setSearchQuery('')
                          setCurrentPage(1)
                        }}
                        className="absolute right-10 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563] transition-colors z-10"
                        title="Clear search"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  
                  {/* Columns Button (icon only) */}
                  <div className="relative" ref={columnSelectorRef}>
                    <button
                      onClick={(e) => {
                        const btn = e.currentTarget
                        const rect = btn.getBoundingClientRect()
                        const scrollY = window.scrollY || document.documentElement.scrollTop || 0
                        const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
                        const panelWidth = 300
                        const gap = 8
                        // Aim to open higher so more values are visible without scrolling
                        const viewportH = window.innerHeight || document.documentElement.clientHeight || 800
                        const lift = Math.min(400, Math.round(viewportH * 0.5))
                        let top = rect.top + scrollY - lift + Math.round(rect.height / 2)
                        // Keep within viewport vertically
                        top = Math.max(scrollY + 10, Math.min(top, scrollY + viewportH - 10))
                        let left = rect.right + scrollX + gap
                        const viewportWidth = window.innerWidth || document.documentElement.clientWidth
                        // If overflow on the right, place to the left of the button
                        if (left + panelWidth > scrollX + viewportWidth) {
                          left = rect.left + scrollX - panelWidth - gap
                        }
                        setColumnSelectorPos({ top, left })
                        setShowColumnSelector(v => !v)
                      }}
                      className="h-10 w-10 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                      title="Show/Hide Columns"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                        <rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Right: Pagination and Controls */}
                <div className="flex items-center gap-3">
                  {/* Pagination */}
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
                </div>

                {/* Error Message */}
                {error && error !== 'Success' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                    {error}
                  </div>
                )}

                {/* Column Selector Dropdown */}
                {showColumnSelector && (
                  <div
                    className="fixed bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-3 flex flex-col"
                    style={{
                      top: columnSelectorPos.top,
                      left: columnSelectorPos.left,
                      width: 300,
                      maxHeight: '70vh',
                      zIndex: 20000000
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                  <div className="px-4 py-2 border-b border-[#F3F4F6] flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#1F2937]">Show/Hide Columns</p>
                    <button
                      onClick={() => setShowColumnSelector(false)}
                      className="text-[#9CA3AF] hover:text-[#4B5563] p-1 rounded hover:bg-gray-50"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="px-4 py-2 border-b border-[#F3F4F6]">
                    <input
                      type="text"
                      placeholder="Search columns..."
                      value={columnSearchQuery}
                      onChange={(e) => setColumnSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 text-sm text-[#1F2937] border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-[#9CA3AF]"
                    />
                  </div>

                  <div className="overflow-y-auto flex-1 px-2 py-2" onWheel={(e) => e.stopPropagation()}>
                    {allColumns
                      .filter(col => col.label.toLowerCase().includes((columnSearchQuery || '').toLowerCase()))
                      .map(col => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 text-xs text-gray-700 hover:bg-gray-50 p-2 rounded-md cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key] || false}
                            onChange={() => toggleColumn(col.key)}
                            className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-1"
                          />
                          <span className="font-semibold">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}


                {/* Error Message */}
                {error && error !== 'Success' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                    {error}
                  </div>
                )}

                {/* Table - Show table with progress bar for all loading states */}
                {/* Always show table unless it's the initial load, even when no clients */}
                {(!initialLoad || clients.length > 0) && (
                  <div className="overflow-auto relative table-scroll-container" ref={hScrollRef} style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#9ca3af #e5e7eb',
                  position: 'relative',
                  height: showFaceCards ? 'calc(100vh - 320px)' : 'calc(100vh - 285px)'
                }}>
                  <style>{`
                  /* Table cell boundary enforcement */
                  table {
                    border-collapse: separate;
                    border-spacing: 0;
                  }
                  
                  table th, table td {
                    box-sizing: border-box;
                    position: relative;
                  }
                  
                  /* Ensure text doesn't overflow cell boundaries */
                  table td > *, table th > * {
                    max-width: 100%;
                  }

                  /* Hide main page-level scrollbar */
                  .no-page-scrollbar::-webkit-scrollbar {
                    display: none;
                  }
                  
                  .overflow-y-auto::-webkit-scrollbar {
                    width: 8px;
                  }
                  .overflow-y-auto::-webkit-scrollbar-track {
                    background: #f3f4f6;
                  }
                  .overflow-y-auto::-webkit-scrollbar-thumb {
                    background: #9ca3af;
                    border-radius: 4px;
                  }
                  .overflow-y-auto::-webkit-scrollbar-thumb:hover {
                    background: #6b7280;
                  }
                  
                  /* Horizontal scrollbar styling */
                  .overflow-x-auto::-webkit-scrollbar {
                    height: 12px;
                  }
                  .overflow-x-auto::-webkit-scrollbar-track {
                    background: #f3f4f6;
                    border-radius: 5px;
                  }
                  .overflow-x-auto::-webkit-scrollbar-thumb {
                    background: #9ca3af;
                    border-radius: 5px;
                    border: 2px solid #f3f4f6;
                  }
                  .overflow-x-auto::-webkit-scrollbar-thumb:hover {
                    background: #6b7280;
                  }
                  
                  /* Sticky horizontal scrollbar styling - always visible */
                  .overflow-x-scroll::-webkit-scrollbar {
                    height: 14px;
                  }
                  .overflow-x-scroll::-webkit-scrollbar-track {
                    background: #e5e7eb;
                    border-radius: 0;
                  }
                  .overflow-x-scroll::-webkit-scrollbar-thumb {
                    background: #6b7280;
                    border-radius: 4px;
                    border: 2px solid #e5e7eb;
                  }
                  .overflow-x-scroll::-webkit-scrollbar-thumb:hover {
                    background: #4b5563;
                  }
                  .overflow-x-scroll::-webkit-scrollbar-thumb:active {
                    background: #374151;
                  }
                  
                  /* Hide-scrollbar utility for non-sticky main horizontal scrollbar */
                  .hide-scrollbar {
                    -ms-overflow-style: none; /* IE and Edge */
                    scrollbar-width: none; /* Firefox */
                  }
                  .hide-scrollbar::-webkit-scrollbar {
                    display: none; /* Chrome, Safari, Opera */
                  }
                  
                  /* Shimmer effect for loading skeleton */
                  @keyframes shimmer {
                    0% {
                      background-position: -1000px 0;
                    }
                    100% {
                      background-position: 1000px 0;
                    }
                  }
                  
                  .skeleton-shimmer {
                    background: linear-gradient(90deg, #f0f0f0 0%, #f8f8f8 20%, #f0f0f0 40%, #f0f0f0 100%);
                    background-size: 1000px 100%;
                    animation: shimmer 1.5s ease-in-out infinite;
                    border-radius: 4px;
                  }

                  /* Header sorting loading bar */
                  @keyframes headerSlide {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                  }
                  .header-loading-track {
                    position: absolute;
                    left: 0; right: 0; bottom: 0; height: 2px;
                    overflow: hidden;
                    background: transparent;
                  }
                  .header-loading-bar {
                    width: 30%; height: 100%;
                    background: #2563eb; /* tailwind blue-600 - matches table header */
                    border-radius: 2px;
                    animation: headerSlide 0.9s linear infinite;
                  }
                `}</style>

                  {/* Table */}
                  <table ref={tableRef} className="border-separate" style={{
                    tableLayout: 'fixed',
                    width: `${totalTableWidth}px`,
                    minWidth: '100%',
                    borderSpacing: 0,
                    borderCollapse: 'separate'
                  }}>
                    <colgroup>
                      {visibleColumnsList.map(col => (
                        <col key={`col-${col.key}`} style={{ width: `${getDefaultColumnWidth(col)}px` }} />
                      ))}
                    </colgroup>
                    <thead className="bg-blue-600 sticky top-0 z-50" style={{ position: 'sticky', top: 0, zIndex: 50 }}>
                      <tr>
                        {visibleColumnsList.map(col => {
                          const filterCount = getActiveFilterCount(col.key)
                          const isDragging = draggedColumn === col.key
                          const isDragOver = dragOverColumn === col.key
                          const isResizing = resizingColumn === col.key
                          return (
                            <th
                              key={col.key}
                              ref={(el) => { if (!headerRefs.current) headerRefs.current = {}; headerRefs.current[col.key] = el }}
                              className={`px-2 py-2 text-left text-xs font-bold text-white uppercase tracking-wider bg-blue-600 hover:bg-blue-700 transition-all select-none relative border-r border-slate-200 ${isDragging ? 'opacity-50' : ''
                                } ${isDragOver ? 'border-l-4 border-yellow-400' : ''} ${isResizing ? 'bg-blue-700 ring-2 ring-yellow-400' : ''}`}
                              onDragOver={(e) => handleColumnDragOver(e, col.key)}
                              onDragLeave={handleColumnDragLeave}
                              onDrop={(e) => handleColumnDrop(e, col.key)}
                              style={{
                                minWidth: '80px',
                                overflow: 'hidden',
                                backgroundColor: '#2563eb',
                                position: 'sticky',
                                top: 0,
                                borderRight: '1px solid #e5e7eb',
                                ...(col.key === 'login' && { left: 0, zIndex: 51, paddingLeft: '4px' })
                              }}
                            >
                              <div className="flex items-center gap-2 justify-between min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  {/* Drag Handle Area - larger clickable area on left side */}
                                  <div
                                    className={`${col.key === 'login' ? 'flex items-center gap-2 cursor-move hover:opacity-80 py-1 pl-1 pr-1' : 'flex items-center gap-2 cursor-move hover:opacity-80 py-1 -ml-2 pl-2 pr-1'}`}
                                    draggable={!resizingColumn}
                                    onDragStart={(e) => {
                                      e.stopPropagation()
                                      handleColumnDragStart(e, col.key)
                                    }}
                                    onDragEnd={handleColumnDragEnd}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Drag to reorder column"
                                  >
                                    <svg
                                      className="w-3 h-3 text-white/60 flex-shrink-0"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"></path>
                                    </svg>
                                  </div>
                                  <div
                                    className={`flex items-center gap-1 flex-1 ${isSorting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                    onClick={() => handleSort(col.key)}
                                  >
                                    <span
                                      className="truncate"
                                      title={col.label}
                                    >
                                      {col.label}{percentModeActive && ['balance', 'credit', 'equity', 'margin', 'marginFree', 'marginInitial', 'marginMaintenance', 'profit', 'floating', 'pnl', 'previousEquity', 'assets', 'liabilities', 'storage', 'blockedCommission', 'blockedProfit', 'dailyDeposit', 'dailyWithdrawal', 'dailyCreditIn', 'dailyCreditOut', 'dailyBonusIn', 'dailyBonusOut', 'dailySOCompensationIn', 'dailySOCompensationOut', 'thisWeekPnL', 'thisWeekDeposit', 'thisWeekWithdrawal', 'thisWeekCreditIn', 'thisWeekCreditOut', 'thisWeekBonusIn', 'thisWeekBonusOut', 'thisWeekSOCompensationIn', 'thisWeekSOCompensationOut', 'thisWeekCommission', 'thisWeekCorrection', 'thisWeekSwap', 'thisMonthPnL', 'thisMonthDeposit', 'thisMonthWithdrawal', 'thisMonthCreditIn', 'thisMonthCreditOut', 'thisMonthBonusIn', 'thisMonthBonusOut', 'thisMonthSOCompensationIn', 'thisMonthSOCompensationOut', 'thisMonthCommission', 'thisMonthCorrection', 'thisMonthSwap', 'lifetimePnL', 'lifetimeDeposit', 'lifetimeWithdrawal', 'lifetimeCreditIn', 'lifetimeCreditOut', 'lifetimeBonusIn', 'lifetimeBonusOut', 'lifetimeSOCompensationIn', 'lifetimeSOCompensationOut', 'lifetimeCommission', 'lifetimeCorrection', 'lifetimeSwap'].includes(col.key) ? ' %' : ''}
                                    </span>
                                    {sortBy === col.key && (
                                      <span className="text-white">
                                        {sortOrder === 'asc' ? '↑' : '↓'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {/* Header sorting loader - show only for active sorted column while isSorting */}
                                {isSorting && sortBy === col.key && (
                                  <div className="relative w-8 h-4 flex items-center justify-center" aria-label="Sorting">
                                    <div className="header-loading-track">
                                      <div className="header-loading-bar" />
                                    </div>
                                  </div>
                                )}

                                {/* Filter Icon - Just icon, no box */}
                                <div className="relative" ref={el => {
                                  if (!filterRefs.current) filterRefs.current = {}
                                  filterRefs.current[col.key] = el
                                }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (showFilterDropdown === col.key) {
                                        setShowFilterDropdown(null)
                                        setFilterPosition(null)
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect()
                                        const columnIndex = visibleColumnsList.indexOf(col)
                                        const totalColumns = visibleColumnsList.length
                                        const isLastColumn = columnIndex === totalColumns - 1
                                        const dropdownWidth = 280
                                        const spaceOnRight = window.innerWidth - rect.right
                                        const spaceOnLeft = rect.left

                                        // Open to the left for last 3 columns OR if there's not enough space on the right
                                        const isLastThreeColumns = columnIndex >= totalColumns - 3
                                        const shouldOpenLeft = isLastThreeColumns || (spaceOnRight < dropdownWidth + 20 && spaceOnLeft > dropdownWidth + 20)

                                        setFilterPosition({
                                          top: rect.top,
                                          left: rect.left,
                                          right: rect.right,
                                          isLastColumn,
                                          shouldOpenLeft
                                        })
                                        setShowFilterDropdown(col.key)

                                        // Fetch column values for ALL columns (including login) - always refresh to ensure fresh data
                                        const columnType = getColumnType(col.key)
                                        // Always fetch values for checkbox filtering with forceRefresh=true to avoid "No values available"
                                        fetchColumnValues(col.key, true)
                                        // Don't initialize selectedColumnValues - let it stay undefined so we read from columnFilters
                                        // This ensures checkboxes show the correct state immediately when dropdown opens
                                      }
                                    }}
                                    className={`p-0.5 transition-opacity hover:opacity-70 ${filterCount > 0 ? 'text-green-400' : 'text-white/60'}`}
                                    title="Filter column"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                    </svg>
                                    {filterCount > 0 && (
                                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center">
                                        {filterCount}
                                      </span>
                                    )}
                                  </button>

                                  {/* Filter Dropdown */}
                                  {showFilterDropdown === col.key && filterPosition && (() => {
                                    const columnKey = col.key // Capture the column key
                                    const columnType = getColumnType(columnKey)
                                    const isNumeric = columnType === 'float' || columnType === 'integer'
                                    const isInteger = columnType === 'integer'

                                    // Initialize temp state for numeric filter if needed
                                    if (isNumeric && !numericFilterTemp[columnKey]) {
                                      initNumericFilterTemp(columnKey)
                                    }
                                    const tempFilter = numericFilterTemp[columnKey] || { operator: 'equal', value1: '', value2: '' }

                                    return createPortal(
                                      <div
                                        ref={filterPanelRef}
                                        tabIndex={0}
                                        className="filter-dropdown-panel fixed bg-white border-2 border-slate-300 rounded-lg shadow-2xl flex flex-col text-[11px]"
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onMouseUp={(e) => e.stopPropagation()}
                                        onWheel={(e) => e.stopPropagation()}
                                        onScroll={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault()
                                            if (isNumeric) {
                                              applyNumberFilter(columnKey)
                                            } else {
                                              applyCheckboxFilter(columnKey)
                                            }
                                            setShowFilterDropdown(null)
                                          }
                                        }}
                                        style={{
                                          top: '50%',
                                          transform: 'translateY(-50%)',
                                          left: filterPosition.shouldOpenLeft
                                            ? `${filterPosition.left - 290}px`
                                            : `${filterPosition.right + 10}px`,
                                          width: '280px',
                                          maxHeight: '80vh',
                                          zIndex: 20000000
                                        }}
                                      >
                                        {/* Header */}
                                        <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-700">
                                              {isNumeric ? 'Number Filters' : isInteger ? 'Text Filters' : 'Text Filters'}
                                            </span>
                                            <button
                                              onClick={() => clearColumnFilter(columnKey)}
                                              className="text-xs text-red-600 hover:text-red-700 font-medium"
                                            >
                                              Clear
                                            </button>
                                          </div>
                                        </div>

                                        {/* Numeric Filter (Float) */}
                                        {isNumeric && (() => {
                                          const hasNumberFilter = columnFilters[`${columnKey}_number`]
                                          const currentSort = columnSortOrder[columnKey]

                                          return (
                                            <>
                                              {/* Sort Options */}
                                              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                                                <button
                                                  onClick={() => applySortToColumn(columnKey, 'asc')}
                                                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-200 ${currentSort === 'asc' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'}`}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                                                  </svg>
                                                  Sort Smallest to Largest
                                                </button>
                                                <button
                                                  onClick={() => applySortToColumn(columnKey, 'desc')}
                                                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-200 mt-1 ${currentSort === 'desc' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'}`}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                                                  </svg>
                                                  Sort Largest to Smallest
                                                </button>
                                              </div>

                                              {/* Number Filter Condition/Operator - Stacked Vertically */}
                                              <div className="px-3 py-2 border-b border-gray-200">
                                                <div className="mb-2">
                                                  <label className="block text-xs font-medium text-gray-700 mb-1">CONDITION</label>
                                                  <select
                                                    value={tempFilter.operator}
                                                    onChange={(e) => updateNumericFilterTemp(columnKey, 'operator', e.target.value)}
                                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                                                  >
                                                    <option value="equal">Equal...</option>
                                                    <option value="not_equal">Not Equal...</option>
                                                    <option value="less_than">Less Than...</option>
                                                    <option value="less_than_equal">Less Than Or Equal...</option>
                                                    <option value="greater_than">Greater Than...</option>
                                                    <option value="greater_than_equal">Greater Than Or Equal...</option>
                                                    <option value="between">Between...</option>
                                                  </select>
                                                </div>
                                                <div className="mb-2">
                                                  <label className="block text-xs font-medium text-gray-700 mb-1">VALUE</label>
                                                  <input
                                                    type="number"
                                                    step="any"
                                                    placeholder="Enter value"
                                                    value={tempFilter.value1}
                                                    onChange={(e) => updateNumericFilterTemp(columnKey, 'value1', e.target.value)}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        e.preventDefault()
                                                        applyNumberFilter(columnKey)
                                                        setShowFilterDropdown(null)
                                                      }
                                                    }}
                                                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                                                  />
                                                </div>
                                                {tempFilter.operator === 'between' && (
                                                  <div className="mb-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">AND</label>
                                                    <input
                                                      type="number"
                                                      step="any"
                                                      placeholder="Enter value"
                                                      value={tempFilter.value2}
                                                      onChange={(e) => updateNumericFilterTemp(columnKey, 'value2', e.target.value)}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                          e.preventDefault()
                                                          applyNumberFilter(columnKey)
                                                          setShowFilterDropdown(null)
                                                        }
                                                      }}
                                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                                                    />
                                                  </div>
                                                )}
                                              </div>

                                              {/* Checkbox Value List - Also for numeric columns */}
                                              <div className="flex-1 overflow-hidden flex flex-col">
                                                {/* Initial loading - centered when no values yet */}
                                                {columnValuesLoading[columnKey] && !(columnValues[columnKey] || []).length && (
                                                  <div className="flex-1 flex flex-col items-center justify-center py-12">
                                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                                    <p className="text-sm text-gray-600 mt-3">Loading filter values...</p>
                                                  </div>
                                                )}

                                                {/* Search Bar */}
                                                {(columnValues[columnKey] || []).length > 0 && (
                                                  <div className="px-3 py-2 border-b border-gray-200">
                                                    <input
                                                      type="text"
                                                      placeholder="Search values..."
                                                      value={columnValueSearch[columnKey] || ''}
                                                      onChange={(e) => setColumnValueSearch(prev => ({ ...prev, [columnKey]: e.target.value }))}
                                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                                                    />
                                                  </div>
                                                )}

                                                {/* Select Visible and Values List */}
                                                {(columnValues[columnKey] || []).length > 0 && (
                                                  <>
                                                    {/* Select Visible Checkbox */}
                                                    {columnValuesUnsupported[columnKey] ? null : (
                                                      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                                                        {(() => {
                                                          const allVals = columnValues[columnKey] || []
                                                          const searchQ = (columnValueSearch[columnKey] || '').toLowerCase()
                                                          const visibleVals = searchQ ? allVals.filter(v => String(v).toLowerCase().includes(searchQ)) : allVals
                                                          // Always read from columnFilters to show currently applied filters
                                                          const existingFilter = columnFilters[`${columnKey}_checkbox`]
                                                          const filterValues = existingFilter?.values || []
                                                          // Use selectedColumnValues only if user has interacted (different from applied filter)
                                                          const interactiveSelected = selectedColumnValues[columnKey]
                                                          // Show filterValues by default, or interactiveSelected if it differs from filter
                                                          const selected = interactiveSelected !== undefined ? interactiveSelected : filterValues
                                                          const allVisibleSelected = visibleVals.length > 0 && visibleVals.every(v => selected.includes(v))
                                                          const hasActiveSearch = columnValueSearch[columnKey] && columnValueSearch[columnKey].trim().length > 0
                                                          return (
                                                            <>
                                                              <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                  type="checkbox"
                                                                  checked={allVisibleSelected}
                                                                  onChange={() => toggleSelectVisibleColumnValues(columnKey)}
                                                                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                />
                                                                <span className="text-xs font-bold text-gray-700">Select visible ({visibleVals.length})</span>
                                                              </label>
                                                            </>
                                                          )
                                                        })()}
                                                      </div>
                                                    )}

                                                    {/* Values List - Lazy loading with scroll detection */}
                                                    <div
                                                      className="flex-1 overflow-y-auto px-3 py-2"
                                                  onWheel={() => { columnScrollUserActionRef.current[columnKey] = true }}
                                                  onTouchMove={() => { columnScrollUserActionRef.current[columnKey] = true }}
                                                  onMouseDown={() => { columnScrollUserActionRef.current[columnKey] = true }}
                                                  onScroll={(e) => {
                                                    const target = e.currentTarget
                                                    const scrollTop = target.scrollTop
                                                    const scrollHeight = target.scrollHeight
                                                    const clientHeight = target.clientHeight
                                                    const scrollPercentage = ((scrollTop + clientHeight) / scrollHeight) * 100

                                                    console.log(`[Client2] Scroll event - ${columnKey}: ${scrollPercentage.toFixed(1)}%, hasMore: ${columnValuesHasMore[columnKey]}, loading: ${columnValuesLoadingMore[columnKey]}`)

                                                    // Load more when scrolled to bottom
                                                    if (scrollTop + clientHeight >= scrollHeight - 5) {
                                                      console.log(`[Client2] Reached bottom for ${columnKey}`)
                                                      const userScrolled = !!columnScrollUserActionRef.current[columnKey]
                                                      const lastTop = columnScrollLastTriggerRef.current[columnKey] ?? -Infinity
                                                      if (!userScrolled) {
                                                        console.log(`[Client2] Ignoring: no manual scroll detected`)
                                                        return
                                                      }
                                                      if (scrollTop <= lastTop) {
                                                        console.log(`[Client2] Waiting for scroll beyond last trigger`)
                                                        return
                                                      }
                                                      if (!columnValuesLoadingMore[columnKey] && columnValuesHasMore[columnKey]) {
                                                        console.log(`[Client2] Triggering fetchMore for ${columnKey}`)
                                                        fetchMoreColumnValues(columnKey)
                                                        columnScrollUserActionRef.current[columnKey] = false
                                                        columnScrollLastTriggerRef.current[columnKey] = scrollTop
                                                      } else {
                                                        console.log(`[Client2] NOT triggering - loadingMore: ${columnValuesLoadingMore[columnKey]}, hasMore: ${columnValuesHasMore[columnKey]}`)
                                                      }
                                                    }
                                                  }}
                                                >
                                                  {columnValuesLoading[columnKey] ? (
                                                    <div className="flex flex-col items-center justify-center py-12">
                                                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                                      <p className="text-sm text-gray-600 mt-3">Loading filter values...</p>
                                                    </div>
                                                  ) : (() => {
                                                    const allVals = columnValues[columnKey] || []
                                                    // Always read from columnFilters to show currently applied filters
                                                    const existingFilter = columnFilters[`${columnKey}_checkbox`]
                                                    const filterValues = existingFilter?.values || []
                                                    // Use selectedColumnValues only if user has interacted (different from applied filter)
                                                    const interactiveSelected = selectedColumnValues[columnKey]
                                                    // Show filterValues by default, or interactiveSelected if it differs from filter
                                                    const selected = interactiveSelected !== undefined ? interactiveSelected : filterValues
                                                    const searchQ = (columnValueSearch[columnKey] || '').toLowerCase()
                                                    // Values are already filtered server-side
                                                    const filteredVals = allVals

                                                    return (
                                                      <>
                                                        {filteredVals.length > 0 ? (
                                                          <div className="space-y-1">
                                                            {filteredVals.map((value) => (
                                                              <label key={value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                                                                <input
                                                                  type="checkbox"
                                                                  checked={selected.includes(value)}
                                                                  onChange={() => toggleColumnValue(columnKey, value)}
                                                                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                />
                                                                <span className="text-xs text-gray-900 font-medium">{value}</span>
                                                              </label>
                                                            ))}
                                                            {/* Loading more indicator */}
                                                            {columnValuesLoadingMore[columnKey] && (
                                                              <div className="py-4 text-center">
                                                                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                                                <p className="text-xs text-gray-500 mt-1">Loading more...</p>
                                                              </div>
                                                            )}
                                                            {/* No more values indicator */}
                                                            {!columnValuesHasMore[columnKey] && allVals.length > 0 && (
                                                              <div className="py-2 text-xs text-gray-400 text-center italic">
                                                                All values loaded
                                                              </div>
                                                            )}
                                                          </div>
                                                        ) : (
                                                          <div className="py-8 text-xs text-gray-500 text-center">
                                                            {searchQ ? 'No matching values found' : 'No values available'}
                                                          </div>
                                                        )}
                                                      </>
                                                    )
                                                  })()}
                                                </div>
                                                  </>
                                                )}
                                              </div>

                                              {/* OK/Close Buttons */}
                                              <div className="px-3 py-2 border-t border-gray-200 flex gap-2">
                                                <button
                                                  onClick={() => setShowFilterDropdown(null)}
                                                  className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded hover:bg-gray-300"
                                                >
                                                  Close
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    // Check if there's a number filter to apply
                                                    const temp = numericFilterTemp[columnKey]
                                                    const hasNumberFilter = temp?.operator && (temp?.value1 !== '' && temp?.value1 != null)
                                                    
                                                    if (hasNumberFilter) {
                                                      // Apply number filter and close inline menu
                                                      applyNumberFilter(columnKey)
                                                      const menu = document.getElementById(`number-filter-inline-${columnKey}`)
                                                      if (menu) menu.classList.add('hidden')
                                                    } else {
                                                      // Apply checkbox filter
                                                      applyCheckboxFilter(columnKey)
                                                    }
                                                    setShowFilterDropdown(null)
                                                  }}
                                                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
                                                >
                                                  OK
                                                </button>
                                              </div>
                                            </>
                                          )
                                        })()}

                                        {/* Text/Integer Filter (Checkboxes) */}
                                        {!isNumeric && (() => {
                                          const currentSort = columnSortOrder[columnKey]
                                          const checkboxFilterKey = `${columnKey}_checkbox`
                                          const hasCheckboxFilter = columnFilters[checkboxFilterKey]

                                          const allValues = columnValues[columnKey] || []
                                          const loading = columnValuesLoading[columnKey]
                                          const loadingMore = columnValuesLoadingMore[columnKey]
                                          const hasMore = columnValuesHasMore[columnKey]
                                          const selected = selectedColumnValues[columnKey] || []
                                          const searchQuery = columnValueSearch[columnKey] || ''

                                          // Values are already filtered server-side based on search
                                          const filteredValues = allValues

                                          return (
                                            <>
                                              {/* Sort Options */}
                                              <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                                                <button
                                                  onClick={() => applySortToColumn(columnKey, 'asc')}
                                                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-200 ${currentSort === 'asc' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'}`}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                                                  </svg>
                                                  Sort Smallest to Largest
                                                </button>
                                                <button
                                                  onClick={() => applySortToColumn(columnKey, 'desc')}
                                                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-gray-200 mt-1 ${currentSort === 'desc' ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'}`}
                                                >
                                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                                                  </svg>
                                                  Sort Largest to Smallest
                                                </button>
                                              </div>

                                              {/* Inline Condition + Value for text columns */}
                                              <div className="px-3 py-2 border-b border-gray-200">
                                                {!textFilterTemp[columnKey] && initTextFilterTemp(columnKey)}
                                                {(() => {
                                                  const tempTextFilter = textFilterTemp[columnKey] || { operator: 'equal', value: '', caseSensitive: false }
                                                  return (
                                                    <>
                                                      <div className="mb-2">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">CONDITION</label>
                                                        <select
                                                          value={tempTextFilter.operator}
                                                          onChange={(e) => updateTextFilterTemp(columnKey, 'operator', e.target.value)}
                                                          onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                              e.preventDefault()
                                                              applyTextFilter(columnKey)
                                                              setShowFilterDropdown(null)
                                                            }
                                                          }}
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
                                                      <div className="mb-2">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">VALUE</label>
                                                        <input
                                                          type="text"
                                                          placeholder="Enter value"
                                                          value={tempTextFilter.value}
                                                          onChange={(e) => updateTextFilterTemp(columnKey, 'value', e.target.value)}
                                                          onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                              e.preventDefault()
                                                              applyTextFilter(columnKey)
                                                              setShowFilterDropdown(null)
                                                            }
                                                          }}
                                                          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                                                        />
                                                      </div>
                                                    </>
                                                  )
                                                })()}
                                              </div>

                                              {/* Checkbox Value List */}
                                              <div className="flex-1 overflow-hidden flex flex-col">
                                                {/* Initial loading - centered when no values yet */}
                                                {loading && !allValues.length && (
                                                  <div className="flex-1 flex flex-col items-center justify-center py-12">
                                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                                    <p className="text-sm text-gray-600 mt-3">Loading filter values...</p>
                                                  </div>
                                                )}

                                                {/* Search Bar */}
                                                {allValues.length > 0 && (
                                                  <div className="px-3 py-2 border-b border-gray-200">
                                                    <input
                                                      type="text"
                                                      placeholder="Search values..."
                                                      value={searchQuery}
                                                      onChange={(e) => setColumnValueSearch(prev => ({ ...prev, [columnKey]: e.target.value }))}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                          e.preventDefault()
                                                          applyCheckboxFilter(columnKey)
                                                          setShowFilterDropdown(null)
                                                        }
                                                      }}
                                                      className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900"
                                                    />
                                                  </div>
                                                )}

                                                {/* Select Visible and Values List */}
                                                {allValues.length > 0 && (
                                                  <>
                                                    {/* Select Visible Checkbox */}
                                                    {columnValuesUnsupported[columnKey] ? null : (
                                                      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
                                                        {(() => {
                                                          const searchQ = (columnValueSearch[columnKey] || '').toLowerCase()
                                                          const visibleVals = searchQ ? allValues.filter(v => String(v).toLowerCase().includes(searchQ)) : allValues
                                                          const allVisibleSelected = visibleVals.length > 0 && visibleVals.every(v => selected.includes(v))
                                                          const hasActiveSearch = searchQuery && searchQuery.trim().length > 0
                                                          return (
                                                            <>
                                                              <label className="flex items-center gap-2 cursor-pointer">
                                                                <input
                                                                  type="checkbox"
                                                                  checked={allVisibleSelected}
                                                                  onChange={() => toggleSelectVisibleColumnValues(columnKey)}
                                                                  className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                />
                                                                <span className="text-xs font-bold text-gray-700">Select visible ({visibleVals.length})</span>
                                                              </label>
                                                            </>
                                                          )
                                                        })()}
                                                      </div>
                                                    )}

                                                    {/* Values List - Lazy loading with scroll detection */}
                                                    <div
                                                      className="flex-1 overflow-y-auto px-3 py-2"
                                                  onWheel={() => { columnScrollUserActionRef.current[columnKey] = true }}
                                                  onTouchMove={() => { columnScrollUserActionRef.current[columnKey] = true }}
                                                  onMouseDown={() => { columnScrollUserActionRef.current[columnKey] = true }}
                                                  onScroll={(e) => {
                                                    const target = e.currentTarget
                                                    const scrollTop = target.scrollTop
                                                    const scrollHeight = target.scrollHeight
                                                    const clientHeight = target.clientHeight
                                                    const scrollPercentage = ((scrollTop + clientHeight) / scrollHeight) * 100

                                                    console.log(`[Client2] Scroll event - ${columnKey}: ${scrollPercentage.toFixed(1)}%, hasMore: ${columnValuesHasMore[columnKey]}, loading: ${columnValuesLoadingMore[columnKey]}`)

                                                    // Load more when scrolled to bottom
                                                    if (scrollTop + clientHeight >= scrollHeight - 5) {
                                                      console.log(`[Client2] Reached bottom for ${columnKey}`)
                                                      const userScrolled = !!columnScrollUserActionRef.current[columnKey]
                                                      const lastTop = columnScrollLastTriggerRef.current[columnKey] ?? -Infinity
                                                      if (!userScrolled) {
                                                        console.log(`[Client2] Ignoring: no manual scroll detected`)
                                                        return
                                                      }
                                                      if (scrollTop <= lastTop) {
                                                        console.log(`[Client2] Waiting for scroll beyond last trigger`)
                                                        return
                                                      }
                                                      if (!columnValuesLoadingMore[columnKey] && columnValuesHasMore[columnKey]) {
                                                        console.log(`[Client2] Triggering fetchMore for ${columnKey}`)
                                                        fetchMoreColumnValues(columnKey)
                                                        columnScrollUserActionRef.current[columnKey] = false
                                                        columnScrollLastTriggerRef.current[columnKey] = scrollTop
                                                      } else {
                                                        console.log(`[Client2] NOT triggering - loadingMore: ${columnValuesLoadingMore[columnKey]}, hasMore: ${columnValuesHasMore[columnKey]}`)
                                                      }
                                                    }
                                                  }}
                                                >
                                                  {columnValuesLoading[columnKey] ? (
                                                    <div className="flex flex-col items-center justify-center py-12">
                                                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                                      <p className="text-sm text-gray-600 mt-3">Loading filter values...</p>
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {filteredValues.length > 0 ? (
                                                        <div className="space-y-1">
                                                          {filteredValues.map((value) => (
                                                            <label key={value} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                                                              <input
                                                                type="checkbox"
                                                                checked={selected.includes(value)}
                                                                onChange={() => toggleColumnValue(columnKey, value)}
                                                                className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                              />
                                                              <span className="text-xs text-gray-700">{value}</span>
                                                            </label>
                                                          ))}
                                                          {/* Loading more indicator */}
                                                          {columnValuesLoadingMore[columnKey] && (
                                                            <div className="py-4 text-center">
                                                              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                                              <p className="text-xs text-gray-500 mt-1">Loading more...</p>
                                                            </div>
                                                          )}
                                                          {/* No more values indicator */}
                                                          {!columnValuesHasMore[columnKey] && allValues.length > 0 && (
                                                            <div className="py-2 text-xs text-gray-400 text-center italic">
                                                              All values loaded
                                                            </div>
                                                          )}
                                                        </div>
                                                      ) : (
                                                        <div className="py-8 text-xs text-gray-500 text-center">
                                                          {searchQuery ? 'No matching values found' : 'No values available'}
                                                        </div>
                                                      )}
                                                    </>
                                                  )}
                                                </div>
                                                  </>
                                                )}
                                              </div>

                                              {/* OK/Close Buttons */}
                                              <div className="px-3 py-2 border-t border-gray-200 flex gap-2">
                                                <button
                                                  onClick={() => setShowFilterDropdown(null)}
                                                  className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded hover:bg-gray-300"
                                                >
                                                  Close
                                                </button>
                                                <button
                                                  onClick={() => {
                                                    // Check if there's a text filter to apply
                                                    const tempText = textFilterTemp[columnKey]
                                                    const hasTextFilter = tempText?.value && tempText?.value.trim() !== ''
                                                    
                                                    if (hasTextFilter) {
                                                      // Apply text filter and close inline menu
                                                      applyTextFilter(columnKey)
                                                      const menu = document.getElementById(`text-filter-inline-${columnKey}`)
                                                      if (menu) menu.classList.add('hidden')
                                                    } else {
                                                      // Apply checkbox filter
                                                      applyCheckboxFilter(columnKey)
                                                    }
                                                    setShowFilterDropdown(null)
                                                  }}
                                                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
                                                >
                                                  OK
                                                </button>
                                              </div>
                                            </>
                                          )
                                        })()}
                                      </div>,
                                      document.body
                                    )
                                  })()}
                                </div>
                              </div>
                              {/* Column Resizer Handle - Excel-like */}
                              <div
                                onMouseDown={(e) => handleResizeStart(e, col.key)}
                                onDoubleClick={(e) => { e.stopPropagation(); handleAutoFit(col.key, col.baseKey) }}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-0 right-0 h-full w-4 cursor-col-resize select-none z-30 hover:bg-blue-400/40 active:bg-blue-600/60 transition-colors"
                                style={{
                                  userSelect: 'none',
                                  touchAction: 'none',
                                  pointerEvents: 'auto',
                                  marginRight: '-2px'
                                }}
                                title="Drag to resize • Double-click to auto-fit"
                                draggable={false}
                              >
                                <div className="absolute right-[2px] top-0 w-[3px] h-full bg-white/40 hover:bg-blue-400 active:bg-blue-600 transition-colors shadow-sm"></div>
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>

                    {/* YouTube-style Loading Progress Bar - Below table header */}
                    {(loading || isRefreshing || isPageChanging) && (
                      <thead className="sticky z-40" style={{ top: '48px' }}>
                        <tr>
                          <th colSpan={visibleColumnsList.length} className="p-0" style={{ height: '3px' }}>
                            <div className="relative w-full h-full bg-gray-200 overflow-hidden">
                              <style>{`
                                @keyframes headerSlide {
                                  0% { transform: translateX(-100%); }
                                  100% { transform: translateX(400%); }
                                }
                                .header-loading-bar {
                                  width: 30%;
                                  height: 100%;
                                  background: #2563eb;
                                  animation: headerSlide 0.9s linear infinite;
                                }
                              `}</style>
                              <div className="header-loading-bar absolute top-0 left-0 h-full" />
                            </div>
                          </th>
                        </tr>
                      </thead>
                    )}

                    <tbody className="bg-white text-sm md:text-[15px]" key={`tbody-${animationKey}`}>
                      {(loading || initialLoad || isRefreshing || isPageChanging) ? (
                        Array.from({ length: 8 }, (_, i) => (
                          <tr key={`skeleton-${i}`} className="bg-white border-b border-[#E1E1E1]">
                            {visibleColumnsList.map((col) => (
                              <td
                                key={`${col.key}-${i}`}
                                className={`${col.key === 'login' ? 'sticky left-0 bg-white z-10' : ''}`}
                                style={{ height: '38px' }}
                              >
                                <div className="px-2">
                                  <div className="h-3 w-full max-w-[80%] skeleton-shimmer" />
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (!loading && !initialLoad && sortedClients.length === 0) ? (
                        <tr>
                          <td colSpan={visibleColumnsList.length} className="px-4 py-12 text-center">
                            <div className="text-gray-500">
                              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                              </svg>
                              <p className="text-lg font-medium">No clients found</p>
                              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters or search criteria</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <>
                          {/* Guard: filter out null/undefined clients */}
                          {(sortedClients || []).filter(client => client != null && client.login != null).map((client, idx) => (
                        <tr
                          key={`${client.login}-${animationKey}-${idx}`}
                          className={`hover:bg-blue-50 hover:shadow-sm transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                          style={{ borderBottom: '2px solid #cbd5e1' }}
                        >
                          {visibleColumnsList.map(col => {
                            // In percentage mode, use _percentage fields
                            const fieldsWithPercentage = [
                              'balance', 'credit', 'equity', 'margin', 'marginFree', 'marginInitial', 'marginMaintenance',
                              'profit', 'floating', 'pnl', 'previousEquity', 'assets', 'liabilities', 'storage',
                              'blockedCommission', 'blockedProfit', 'dailyDeposit', 'dailyWithdrawal', 'dailyCreditIn',
                              'dailyCreditOut', 'dailyBonusIn', 'dailyBonusOut', 'dailySOCompensationIn', 'dailySOCompensationOut',
                              'thisWeekPnL', 'thisWeekDeposit', 'thisWeekWithdrawal', 'thisWeekCreditIn', 'thisWeekCreditOut',
                              'thisWeekBonusIn', 'thisWeekBonusOut', 'thisWeekSOCompensationIn', 'thisWeekSOCompensationOut',
                              'thisWeekCommission', 'thisWeekCorrection', 'thisWeekSwap',
                              'thisMonthPnL', 'thisMonthDeposit', 'thisMonthWithdrawal', 'thisMonthCreditIn', 'thisMonthCreditOut',
                              'thisMonthBonusIn', 'thisMonthBonusOut', 'thisMonthSOCompensationIn', 'thisMonthSOCompensationOut',
                              'thisMonthCommission', 'thisMonthCorrection', 'thisMonthSwap',
                              'lifetimePnL', 'lifetimeDeposit', 'lifetimeWithdrawal', 'lifetimeCreditIn', 'lifetimeCreditOut',
                              'lifetimeBonusIn', 'lifetimeBonusOut', 'lifetimeSOCompensationIn', 'lifetimeSOCompensationOut',
                              'lifetimeCommission', 'lifetimeCorrection', 'lifetimeSwap'
                            ]
                            
                            const fieldKey = percentModeActive && fieldsWithPercentage.includes(col.key) 
                              ? `${col.key}_percentage` 
                              : col.key
                            
                            let rawValue = client?.[fieldKey]
                            if ((rawValue === undefined || rawValue === null || rawValue === '') && col.key === 'processorType') {
                              rawValue = client?.processor_type ?? client?.PROCESSOR_TYPE ?? rawValue
                            }
                            const isPercentageField = percentModeActive && fieldsWithPercentage.includes(col.key)
                            const cellValue = formatValue(col.key, rawValue, isPercentageField)
                            // In compact mode, show the full Indian-formatted number as a tooltip
                            const isCompactCell = displayMode === 'compact' && compactNumberFields.has(col.key)
                            const cellTitle = isCompactCell && rawValue !== null && rawValue !== undefined && rawValue !== ''
                              ? formatIndianNumber(Number(rawValue).toFixed(2))
                              : cellValue

                            // Special handling for login column - make it blue and sticky
                            if (col.key === 'login') {
                              return (
                                <td
                                  key={col.key}
                                  className="px-1 py-1.5 text-sm md:text-[15px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer hover:underline transition-all bg-white border-r border-slate-200"
                                  style={{
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 10,
                                    borderRight: '1px solid #e5e7eb'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleViewClientDetails(client)
                                  }}
                                  title={`${cellValue} - Click to view details`}
                                >
                                  {cellValue}
                                </td>
                              )
                            }

                            // Regular columns
                            return (
                              <td
                                key={col.key}
                                className={`px-2 py-1.5 text-sm md:text-[15px] border-r border-slate-200 ${getValueColorClass(col.key, rawValue) || 'text-gray-700'}`}
                                data-col={col.key}
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  borderRight: '1px solid #e5e7eb'
                                }}
                                title={cellTitle}
                              >
                                {/* Chip formatting for processorType and accountType */}
                                {col.key === 'processorType' ? (
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getProcessorTypeChipClasses(cellValue)}`}>
                                    {cellValue}
                                  </span>
                                ) : col.key === 'accountType' ? (
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getAccountTypeChipClasses(cellValue)}`}>
                                    {cellValue}
                                  </span>
                                ) : (
                                  cellValue
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                        </>
                      )}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}

            {/* Active Filters Display */}
            {filters.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Active Filters:</h3>
                  <button
                    onClick={handleClearAllFilters}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {filters.map((filter, idx) => {
                    const column = allColumns.find(col => col.key === filter.field)
                    const operator = getOperatorsForField(filter.field).find(op => op.value === filter.operator)
                    return (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        <span className="font-medium">{column?.label || filter.field}</span>
                        <span className="text-blue-600">{operator?.label || filter.operator}</span>
                        <span className="font-semibold">{filter.value}</span>
                        <button
                          onClick={() => handleRemoveFilter(idx)}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Filter Modal */}
      {showFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add Filter</h2>

            {/* Field Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Field
              </label>
              <select
                value={newFilterField}
                onChange={(e) => setNewFilterField(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              >
                {allColumns.map(col => (
                  <option key={col.key} value={col.key}>{col.label}</option>
                ))}
              </select>
            </div>

            {/* Operator Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Operator
              </label>
              <select
                value={newFilterOperator}
                onChange={(e) => setNewFilterOperator(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              >
                {getOperatorsForField(newFilterField).map(op => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>
            </div>

            {/* Value Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Value
              </label>
              <input
                type="text"
                value={newFilterValue}
                onChange={(e) => setNewFilterValue(e.target.value)}
                placeholder="Enter filter value"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleAddFilter}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Add Filter
              </button>
              <button
                onClick={() => {
                  setShowFilterModal(false)
                  setNewFilterValue('')
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Filter Modal */}
      {showAccountFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Account Filters</h2>

            {/* MT5 Accounts */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Specific MT5 Accounts
              </label>
              <textarea
                value={accountInputText}
                onChange={(e) => setAccountInputText(e.target.value)}
                placeholder="Enter account numbers separated by commas, spaces, or new lines&#10;Example: 555075, 555088, 555175"
                rows="4"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">
                Currently filtered: {mt5Accounts.length > 0 ? mt5Accounts.join(', ') : 'None'}
              </p>
            </div>

            {/* Account Range */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Range
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <input
                    type="number"
                    value={tempAccountRangeMin}
                    onChange={(e) => setTempAccountRangeMin(e.target.value)}
                    placeholder="Min"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    value={tempAccountRangeMax}
                    onChange={(e) => setTempAccountRangeMax(e.target.value)}
                    placeholder="Max"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-900"
                  />
                </div>
              </div>
              {(accountRangeMin || accountRangeMax) && (
                <p className="text-xs text-gray-500 mt-1">
                  Current range: {accountRangeMin || '∞'} - {accountRangeMax || '∞'}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleApplyAccountFilters}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Apply Filters
              </button>
              <button
                onClick={handleClearAccountFilters}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
              >
                Clear
              </button>
              <button
                onClick={() => setShowAccountFilterModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Client Positions Modal */}
      {showClientDetailModal && selectedClient && (
        <ClientPositionsModal
          client={selectedClient}
          onClose={() => {
            setShowClientDetailModal(false)
            setSelectedClient(null)
          }}
          // Use fetchClients for consistency with ClientsPage so modal-triggered updates refresh server-side dataset
          onClientUpdate={fetchClients}
          allPositionsCache={cachedPositions}
          allOrdersCache={cachedOrders}
          onCacheUpdate={() => { /* Positions managed by DataContext; no local update needed */ }}
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
    </div>
  )
}

export default Client2Page





