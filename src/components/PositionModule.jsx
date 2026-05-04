import React, { useState, useRef, useEffect, useMemo, useDeferredValue, startTransition } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import DateFilterModal from './DateFilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import ClientDetailsMobileModal from './ClientDetailsMobileModal'
import { useGroups } from '../contexts/GroupContext'
import { applyCumulativeFilters, applySearchFilter, applySorting } from '../utils/mobileFilters'
import { normalizePositions } from '../utils/currencyNormalization'
import { brokerAPI } from '../services/api'

const formatNum = (n) => {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0.00'
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PositionModule() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { positions, clients, loading, orders, rawClients } = useData()
  const { groups, deleteGroup, getActiveGroupFilter, setActiveGroupFilter, filterByActiveGroup, getGroupLogins, activeGroupFilters } = useGroups()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 400)
    return () => clearTimeout(t)
  }, [searchInput])
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isGroupOpen, setIsGroupOpen] = useState(false)
  const [isLoginGroupsOpen, setIsLoginGroupsOpen] = useState(false)
  const [isLoginGroupModalOpen, setIsLoginGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [filters, setFilters] = useState({ hasFloating: false, hasCredit: false, noDeposit: false })
  const [dateFilter, setDateFilter] = useState(null) // null, 3, 5, or 7 for days
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false)
  const [hasPendingDateChanges, setHasPendingDateChanges] = useState(false)
  const [pendingDateDraft, setPendingDateDraft] = useState(null)
  const [isMobileView, setIsMobileView] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
    // Pending apply tracking for Customize View
    const [hasPendingGroupChanges, setHasPendingGroupChanges] = useState(false)
    const [pendingGroupDraft, setPendingGroupDraft] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  // Ref so polling closures can skip while the client detail modal is open
  const selectedClientRef = useRef(null)
  useEffect(() => { selectedClientRef.current = selectedClient }, [selectedClient])

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
    if (!positions || positions.length === 0) return positions
    return normalizePositions(positions, clientCurrencyMap)
  }, [positions, clientCurrencyMap])
  
  const [selectedClientDefaultTab, setSelectedClientDefaultTab] = useState('positions')
  const carouselRef = useRef(null)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isPageChanging, setIsPageChanging] = useState(false)
  const pageChangeTimeoutRef = useRef(null)
  const itemsPerPage = 15
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [showClientNet, setShowClientNet] = useState(false)
  const [groupByBaseSymbol, setGroupByBaseSymbol] = useState(false)
  const [displayMode, setDisplayMode] = useState('value') // 'value' or 'percentage'
  const [isExporting, setIsExporting] = useState(false)
  const [numericMode, setNumericMode] = useState(() => { try { const saved = localStorage.getItem('globalDisplayMode'); return saved === 'full' ? 'full' : 'compact' } catch { return 'compact' } })
  
  // Client NET states
  const [clientNetCurrentPage, setClientNetCurrentPage] = useState(1)
  const [isClientNetPageChanging, setIsClientNetPageChanging] = useState(false)
  const clientNetPageChangeTimeoutRef = useRef(null)
  const clientNetItemsPerPage = 15
  const [clientNetSortColumn, setClientNetSortColumn] = useState(null)
  const [clientNetSortDirection, setClientNetSortDirection] = useState('asc')
  const [clientNetCardsVisible, setClientNetCardsVisible] = useState({
    clientNetRows: true,
    totalNetVolume: true,
    totalNetPL: true,
    totalLogins: true
  })
  const [clientNetCardFilterOpen, setClientNetCardFilterOpen] = useState(false)
  const clientNetCardFilterRef = useRef(null)
  const [clientNetVisibleColumns, setClientNetVisibleColumns] = useState({
    login: false,
    symbol: true,
    netType: true,
    netVolume: true,
    avgPrice: true,
    totalProfit: false,
    totalStorage: false,
    totalCommission: false,
    totalPositions: true
  })
  const [clientNetShowColumnSelector, setClientNetShowColumnSelector] = useState(false)
  const [clientNetSearchInput, setClientNetSearchInput] = useState('')

  // Server-side NET positions (fetched when NET Position tab is active)
  const [serverNetPositions, setServerNetPositions] = useState([])
  const [serverNetTotal, setServerNetTotal] = useState(0)
  const [hasFetchedServerNet, setHasFetchedServerNet] = useState(false)
  const hasFetchedServerNetRef = useRef(false)
  const [isServerNetLoading, setIsServerNetLoading] = useState(false)

  // Server-side positions (fetched when regular Positions tab is active on mobile)
  const [serverPositions, setServerPositions] = useState([])
  const [serverPositionsTotal, setServerPositionsTotal] = useState(0)
  const [serverPositionsTotals, setServerPositionsTotals] = useState({ profit: 0, volume: 0, uniqueLogins: 0, floatingCombined: 0, floatingINR: 0, floatingUSD: 0 })
  const [hasFetchedServerPositions, setHasFetchedServerPositions] = useState(false)
  const hasFetchedServerPositionsRef = useRef(false)
  const [isServerPositionsLoading, setIsServerPositionsLoading] = useState(false)
  
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    firstName: false,
    middleName: false,
    lastName: false,
    email: false,
    phone: false,
    position: false,
    symbol: true,
    action: false,
    netType: true,
    volume: false,
    volumePercentage: false,
    priceOpen: true,
    priceCurrent: false,
    netVolume: true,
    sl: false,
    tp: false,
    profit: false,
    totalProfit: true,
    profitPercentage: false,
    storage: false,
    storagePercentage: false,
    appliedPercentage: false,
    reason: false,
    comment: false,
    commission: false,
    updated: true
  })

  // Listen for global request to open Customize View from child modals
  // Clear all filters on component mount (when navigating to this module)
  useEffect(() => {
    setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
    setActiveGroupFilter('positions', null)
    setSearchInput('')
  }, [])

  // Reset pagination when active group changes
  useEffect(() => {
    setCurrentPage(1)
    setClientNetCurrentPage(1)
  }, [getActiveGroupFilter('positions')])

  useEffect(() => {
    const handler = () => {
      setIsFilterOpen(false)
      setIsLoginGroupsOpen(false)
      setIsLoginGroupModalOpen(false)
      setIsCustomizeOpen(true)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('openCustomizeView', handler)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('openCustomizeView', handler)
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pageChangeTimeoutRef.current) {
        clearTimeout(pageChangeTimeoutRef.current)
      }
      if (clientNetPageChangeTimeoutRef.current) {
        clearTimeout(clientNetPageChangeTimeoutRef.current)
      }
    }
  }, [])

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

  const handlePageChange = (nextPage, maxPage) => {
    const safeMaxPage = Math.max(1, maxPage)
    const clampedPage = Math.min(safeMaxPage, Math.max(1, nextPage))
    if (clampedPage === currentPage) return

    setIsPageChanging(true)
    setCurrentPage(clampedPage)

    if (pageChangeTimeoutRef.current) {
      clearTimeout(pageChangeTimeoutRef.current)
    }
    pageChangeTimeoutRef.current = setTimeout(() => {
      setIsPageChanging(false)
    }, 180)
  }

  const handleClientNetPageChange = (nextPage, maxPage) => {
    const safeMaxPage = Math.max(1, maxPage)
    const clampedPage = Math.min(safeMaxPage, Math.max(1, nextPage))
    if (clampedPage === clientNetCurrentPage) return

    setIsClientNetPageChanging(true)
    setClientNetCurrentPage(clampedPage)

    if (clientNetPageChangeTimeoutRef.current) {
      clearTimeout(clientNetPageChangeTimeoutRef.current)
    }
    clientNetPageChangeTimeoutRef.current = setTimeout(() => {
      setIsClientNetPageChanging(false)
    }, 180)
  }

  // Detect mobile view
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const mobileRegularSourcePositions = displayPositions

  // Apply filters in cumulative order: Customize View -> Group
  const ibFilteredPositions = useMemo(() => {
    return applyCumulativeFilters(mobileRegularSourcePositions, {
      customizeFilters: filters,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'positions'
    })
  }, [mobileRegularSourcePositions, filters, filterByActiveGroup, activeGroupFilters])

  // Defer heavy calculations to allow navigation to be responsive
  const deferredIbFilteredPositions = useDeferredValue(ibFilteredPositions)

  // Apply date filter to positions before calculating summary stats
  // Note: date filter is applied server-side via dateFrom/dateTo params in the polling effect
  const dateFilteredPositions = deferredIbFilteredPositions

  // Calculate summary statistics (use deferred value to prevent blocking navigation)
  const summaryStats = useMemo(() => {
    const totalPositions = dateFilteredPositions.length
    const totalFloatingProfit = dateFilteredPositions.reduce((sum, p) => sum + (p.profit || 0), 0)
    const totalFloatingProfitPercentage = dateFilteredPositions.reduce((sum, p) => sum + (p.profit_percentage || 0), 0)
    const uniqueLogins = new Set(dateFilteredPositions.map(p => p.login)).size
    const uniqueSymbols = new Set(dateFilteredPositions.map(p => p.symbol)).size
    
    return {
      totalPositions,
      totalFloatingProfit,
      totalFloatingProfitPercentage,
      uniqueLogins,
      uniqueSymbols
    }
  }, [dateFilteredPositions])

  // Calculate Client NET positions (group by login then symbol)
  const calculateClientNetPositions = (positions) => {
    if (!positions || positions.length === 0) return []

    const getBaseSymbol = (s) => {
      if (!s || typeof s !== 'string') return s
      const parts = s.split(/[\.\-]/)
      return parts[0] || s
    }

    const loginMap = new Map()

    positions.forEach(pos => {
      const login = pos.login
      const symbol = pos.symbol
      if (login == null || !symbol) return
      
      if (!loginMap.has(login)) loginMap.set(login, new Map())
      const symMap = loginMap.get(login)
      const symbolKey = groupByBaseSymbol ? getBaseSymbol(symbol) : symbol
      
      if (!symMap.has(symbolKey)) {
        symMap.set(symbolKey, {
          buyPositions: [],
          sellPositions: []
        })
      }
      const bucket = symMap.get(symbolKey)

      const rawAction = pos.action
      let actionNorm = null
      if (rawAction === 0 || rawAction === '0') actionNorm = 'buy'
      else if (rawAction === 1 || rawAction === '1') actionNorm = 'sell'
      else if (typeof rawAction === 'string') actionNorm = rawAction.toLowerCase()

      if (actionNorm === 'buy') bucket.buyPositions.push(pos)
      else if (actionNorm === 'sell') bucket.sellPositions.push(pos)
    })

    const rows = []
    loginMap.forEach((symMap, login) => {
      symMap.forEach((bucket, symbol) => {
        const buyVol = bucket.buyPositions.reduce((s, p) => s + (p.volume || 0), 0)
        const sellVol = bucket.sellPositions.reduce((s, p) => s + (p.volume || 0), 0)
        const netVol = buyVol - sellVol
        if (netVol === 0) return

        let tw = 0, tv = 0, tp = 0, ts = 0, tc = 0
        const use = netVol > 0 ? bucket.buyPositions : bucket.sellPositions
        use.forEach(p => {
          const v = p.volume || 0
          const pr = p.priceOpen || 0
          tw += pr * v
          tv += v
          tp += p.profit || 0
          ts += p.storage || 0
          tc += p.commission || 0
        })
        const avg = tv > 0 ? tw / tv : 0
        const netType = netVol > 0 ? 'Sell' : 'Buy'
        const totalPositions = bucket.buyPositions.length + bucket.sellPositions.length

        rows.push({
          login,
          symbol,
          netType,
          netVolume: Math.abs(netVol),
          avgPrice: avg,
          totalProfit: /[cC]$/.test(symbol) ? tp / 100 : tp,
          totalStorage: /[cC]$/.test(symbol) ? ts / 100 : ts,
          totalCommission: /[cC]$/.test(symbol) ? tc / 100 : tc,
          totalPositions
        })
      })
    })

    return rows.sort((a, b) => a.login === b.login ? b.netVolume - a.netVolume : String(a.login).localeCompare(String(b.login)))
  }

  const clientNetPositions = useMemo(() => calculateClientNetPositions(dateFilteredPositions), [dateFilteredPositions, groupByBaseSymbol])

  // Poll server every 2s for regular positions (mirrors PositionsPage.jsx desktop behaviour)
  useEffect(() => {
    if (showClientNet) return

    let timer = null
    let isCancelled = false
    let controller = new AbortController()

    const poll = async () => {
      if (isCancelled) return
      // Pause polling while client detail modal is open
      if (selectedClientRef.current) { if (!isCancelled) timer = setTimeout(poll, 2000); return }
      try {
        if (!hasFetchedServerPositionsRef.current) setIsServerPositionsLoading(true)
        const params = {
          page: currentPage,
          limit: itemsPerPage,
          sortBy: sortColumn || 'timeCreate',
          sortOrder: sortDirection || 'desc'
        }
        if (debouncedSearch && debouncedSearch.trim()) params.search = debouncedSearch.trim()
        if (displayMode === 'percentage') params.percentage = true
        if (dateFilter) {
          const now = Math.floor(Date.now() / 1000)
          params.dateFrom = now - dateFilter * 24 * 60 * 60
          params.dateTo = now
        }

        // Apply active group filter as a server-side login filter (works across pages)
        const activeGroupName = getActiveGroupFilter('positions')
        if (activeGroupName) {
          const groupLogins = getGroupLogins(activeGroupName).map(l => Number(l)).filter(n => !Number.isNaN(n))
          params.filters = [
            { field: 'login', operator: 'in', value: groupLogins.length > 0 ? groupLogins : [-1] }
          ]
        }

        const response = await brokerAPI.searchPositions(params, { signal: controller.signal })
        if (isCancelled) return
        const data = response?.data?.positions || response?.positions || []
        const total = response?.data?.total || response?.total || 0
        const totals = response?.data?.totals || response?.totals || null
        if (Array.isArray(data)) {
          setServerPositions(data)
          setServerPositionsTotal(total)
          if (totals) setServerPositionsTotals({
            profit: totals.profit ?? totals.totalProfit ?? 0,
            volume: totals.volume ?? totals.netVolume ?? 0,
            uniqueLogins: totals.uniqueLogins ?? 0,
            floatingCombined: totals.floatingCombined ?? 0,
            floatingINR: totals.floatingINR ?? 0,
            floatingUSD: totals.floatingUSD ?? 0
          })
          setHasFetchedServerPositions(true)
          hasFetchedServerPositionsRef.current = true
          setIsServerPositionsLoading(false)
        }
      } catch (err) {
        if (!isCancelled && err?.code !== 'ERR_CANCELED' && err?.message !== 'canceled') {
          console.warn('[PositionModule] Regular poll error:', err?.message)
        }
      }
      if (!isCancelled) timer = setTimeout(poll, 2000)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') { if (!timer && !isCancelled) poll() }
      else if (timer) { clearTimeout(timer); timer = null }
    }

    if (document.visibilityState === 'visible') poll()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      isCancelled = true
      controller.abort()
      if (timer) { clearTimeout(timer); timer = null }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [showClientNet, currentPage, itemsPerPage, sortColumn, sortDirection, debouncedSearch, displayMode, dateFilter, activeGroupFilters, getActiveGroupFilter, getGroupLogins])

  // Poll server every 2s for NET positions (mirrors PositionsPage.jsx desktop NET behaviour)
  useEffect(() => {
    if (!showClientNet) return

    let timer = null
    let isCancelled = false
    let controller = new AbortController()

    const poll = async () => {
      if (isCancelled) return
      // Pause polling while client detail modal is open
      if (selectedClientRef.current) { if (!isCancelled) timer = setTimeout(poll, 2000); return }
      try {
        if (!hasFetchedServerNetRef.current) setIsServerNetLoading(true)
        const params = {
          page: 1,
          limit: 15,
          netPosition: true,
          sortBy: 'netVolume',
          sortOrder: 'desc'
        }
        if (groupByBaseSymbol) params.groupBaseSymbol = true
        if (displayMode === 'percentage') params.percentage = true
        if (clientNetSearchInput.trim()) params.search = clientNetSearchInput.trim()

        // Apply active group filter as a server-side login filter (works across pages)
        const activeGroupName = getActiveGroupFilter('positions')
        if (activeGroupName) {
          const groupLogins = getGroupLogins(activeGroupName).map(l => Number(l)).filter(n => !Number.isNaN(n))
          params.filters = [
            { field: 'login', operator: 'in', value: groupLogins.length > 0 ? groupLogins : [-1] }
          ]
        }

        const response = await brokerAPI.searchPositions(params, { signal: controller.signal })
        if (isCancelled) return
        const data = response?.data?.positions || response?.positions || []
        const total = response?.data?.total || response?.total || 0
        const totals = response?.data?.totals || response?.totals || null
        if (Array.isArray(data)) {
          const mapped = data.map(item => ({
            login: item.login,
            symbol: item.symbol || item.baseSymbol || '-',
            netType: item.action === 'BUY' ? 'Buy' : item.action === 'SELL' ? 'Sell' : (item.action === 'FLAT' ? 'Flat' : (item.action || 'Flat')),
            netVolume: item.netVolume || 0,
            avgPrice: item.avgPrice || 0,
            totalProfit: item.totalProfit || 0,
            totalStorage: item.totalStorage || 0,
            totalCommission: item.totalCommission || 0,
            totalPositions: item.positionCount || item.totalPositions || 0
          }))
          setServerNetPositions(mapped)
          setServerNetTotal(total)
          if (totals) setServerPositionsTotals({
            profit: totals.totalProfit ?? totals.profit ?? 0,
            volume: totals.netVolume ?? totals.volume ?? 0,
            uniqueLogins: totals.uniqueLogins ?? 0
          })
          setHasFetchedServerNet(true)
          hasFetchedServerNetRef.current = true
          setIsServerNetLoading(false)
        }
      } catch (err) {
        if (!isCancelled && err?.code !== 'ERR_CANCELED' && err?.message !== 'canceled') {
          console.warn('[PositionModule] NET poll error:', err?.message)
        }
      }
      if (!isCancelled) timer = setTimeout(poll, 2000)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') { if (!timer && !isCancelled) poll() }
      else if (timer) { clearTimeout(timer); timer = null }
    }

    if (document.visibilityState === 'visible') poll()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      isCancelled = true
      controller.abort()
      if (timer) { clearTimeout(timer); timer = null }
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [showClientNet, groupByBaseSymbol, displayMode, clientNetSearchInput, activeGroupFilters, getActiveGroupFilter, getGroupLogins])

  // Use server-polled NET positions once available, else fall back to client-side calc
  const mobileNetSourcePositions = hasFetchedServerNet ? serverNetPositions : clientNetPositions

  // Filter Client NET positions based on search
  const filteredClientNetPositions = useMemo(() => {
    let filtered = mobileNetSourcePositions
    if (clientNetSearchInput.trim()) {
      const query = clientNetSearchInput.toLowerCase()
      filtered = filtered.filter(pos =>
        String(pos.login || '').toLowerCase().includes(query) ||
        String(pos.symbol || '').toLowerCase().includes(query) ||
        String(pos.netType || '').toLowerCase().includes(query)
      )
    }
    // Apply sorting
    filtered = applySorting(filtered, clientNetSortColumn, clientNetSortDirection)
    return filtered
  }, [mobileNetSourcePositions, clientNetSearchInput, clientNetSortColumn, clientNetSortDirection])

  // Apply search and sorting (use deferred value to prevent blocking navigation)
  const filteredPositions = useMemo(() => {
    // Apply search filter (date filter already applied in dateFilteredPositions)
    let filtered = applySearchFilter(dateFilteredPositions, debouncedSearch, ['symbol', 'login'])
    
    // Map column keys to actual data fields for sorting
    const columnKeyMapping = {
      'updated': 'timeUpdate',
      'netType': 'type',
      'action': 'type',
      'netVolume': 'volume',
      'totalProfit': 'profit'
    }
    const sortKey = columnKeyMapping[sortColumn] || sortColumn
    
    // Apply sorting
    filtered = applySorting(filtered, sortKey, sortDirection)
    
    return filtered
  }, [dateFilteredPositions, debouncedSearch, sortColumn, sortDirection])

  // Handle column sorting
  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  // Handle Client NET column sorting
  const handleClientNetSort = (columnKey) => {
    if (clientNetSortColumn === columnKey) {
      setClientNetSortDirection(clientNetSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setClientNetSortColumn(columnKey)
      setClientNetSortDirection('asc')
    }
  }

  // Calculate totals (memoized to prevent recalculation)
  const totalProfit = useMemo(() => 
    filteredPositions.reduce((sum, pos) => sum + (Number(pos.profit) || 0), 0),
    [filteredPositions]
  )

  // Mobile now uses server-polled data (same as desktop). isMobileRegularServerMode = true once first poll done.
  const isMobileRegularServerMode = hasFetchedServerPositions
  const mobileRegularTotalPages = isMobileRegularServerMode
    ? Math.max(1, Math.ceil(serverPositionsTotal / itemsPerPage))
    : Math.max(1, Math.ceil(filteredPositions.length / itemsPerPage))
  // When server mode active, serverPositions are already paged — display directly
  const mobileRegularDisplayedPositions = isMobileRegularServerMode
    ? serverPositions
    : filteredPositions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // Pagination calculations for Client NET (memoized)
  const clientNetTotalPages = useMemo(() =>
    Math.ceil(filteredClientNetPositions.length / clientNetItemsPerPage),
    [filteredClientNetPositions.length, clientNetItemsPerPage]
  )
  const clientNetPaginatedPositions = useMemo(() =>
    filteredClientNetPositions.slice(
      (clientNetCurrentPage - 1) * clientNetItemsPerPage,
      clientNetCurrentPage * clientNetItemsPerPage
    ),
    [filteredClientNetPositions, clientNetCurrentPage, clientNetItemsPerPage]
  )

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (clientNetCardFilterRef.current && !clientNetCardFilterRef.current.contains(e.target)) {
        setClientNetCardFilterOpen(false)
      }    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Get active columns for dynamic table rendering
  const activeColumns = useMemo(() => {
    const columnDefs = [
      { key: 'login', label: 'Login', width: '70px', sticky: true },
      { key: 'updated', label: 'Time', width: '130px' },
      { key: 'firstName', label: 'First Name', width: '85px' },
      { key: 'middleName', label: 'Middle Name', width: '85px' },
      { key: 'lastName', label: 'Last Name', width: '85px' },
      { key: 'email', label: 'Email', width: '120px' },
      { key: 'phone', label: 'Phone', width: '85px' },
      { key: 'position', label: 'Position', width: '70px' },
      { key: 'symbol', label: 'Symbol', width: '70px' },
      { key: 'action', label: 'Action', width: '60px' },
      { key: 'netType', label: 'Net Type', width: '60px' },
      { key: 'volume', label: 'Volume', width: '70px' },
      { key: 'volumePercentage', label: 'Volume %', width: '75px' },
      { key: 'priceOpen', label: 'Avg Price', width: '80px' },
      { key: 'priceCurrent', label: 'Price Current', width: '90px' },
      { key: 'netVolume', label: 'Net Volume', width: '80px' },
      { key: 'sl', label: 'S/L', width: '70px' },
      { key: 'tp', label: 'T/P', width: '70px' },
      { key: 'profit', label: 'Profit', width: '70px' },
      { key: 'totalProfit', label: 'Total Profit', width: '80px' },
      { key: 'profitPercentage', label: 'Profit %', width: '75px' },
      { key: 'storage', label: 'Storage', width: '70px' },
      { key: 'storagePercentage', label: 'Storage %', width: '80px' },
      { key: 'appliedPercentage', label: 'Applied %', width: '80px' },
      { key: 'reason', label: 'Reason', width: '85px' },
      { key: 'comment', label: 'Comment', width: '90px' },
      { key: 'commission', label: 'Commission', width: '80px' },
    ]
    const filtered = columnDefs.filter(col => visibleColumns[col.key])
    // Make first column sticky if it's not already login
    if (filtered.length > 0 && filtered[0].key !== 'login') {
      filtered[0].sticky = true
    }
    return filtered
  }, [visibleColumns])

  // Generate grid template columns for the table
  const gridTemplateColumns = useMemo(() => {
    return activeColumns.map(col => col.width || '1fr').join(' ')
  }, [activeColumns])

  // Compact/full numeric format helpers
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
  const fmtMoney = (n) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    if (numericMode === 'compact') return formatCompactIndian(num)
    return formatNum(num)
  }
  const fmtMoneyFull = (n) => {
    const num = Number(n)
    if (Number.isNaN(num)) return '-'
    return formatNum(num)
  }

  // Render cell value based on column key
  const renderCellValue = (pos, columnKey, isSticky = false) => {
    const stickyClass = isSticky ? 'sticky left-0 bg-white z-10' : ''
    const stickyStyle = isSticky ? { boxShadow: '2px 0 4px rgba(0,0,0,0.05)' } : {}
    
    switch(columnKey) {
      case 'symbol':
        return <div className={`h-[38px] flex items-center justify-start px-2 overflow-hidden text-ellipsis whitespace-nowrap text-black font-semibold ${stickyClass}`} style={stickyStyle}>{pos.symbol || '-'}</div>
      case 'netType':
      case 'action':
        return (
          <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
              pos.type === 0 || pos.type === 'Buy' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {pos.type === 0 || pos.type === 'Buy' ? 'Buy' : 'Sell'}
            </span>
          </div>
        )
      case 'totalProfit':
      case 'profit': {
        const rawProfit = pos.profit || 0
        const isCentSym = /[cC]$/.test(String(pos.symbol || ''))
        const displayProfit = isCentSym ? rawProfit / 100 : rawProfit
        return (
          <div title={numericMode === 'compact' ? fmtMoneyFull(displayProfit) : undefined} className={`h-[38px] flex items-center justify-start px-2 font-medium ${
            displayProfit >= 0 ? 'text-green-600' : 'text-red-600'
          } ${stickyClass}`} style={stickyStyle}>
            {fmtMoney(displayProfit)}
          </div>
        )
      }
      case 'priceOpen':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.priceOpen || 0, 5)}</div>
      case 'priceCurrent':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.priceCurrent || 0, 5)}</div>
      case 'volume':
      case 'netVolume':
        return <div title={numericMode === 'compact' ? fmtMoneyFull(pos.volume || 0) : undefined} className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{fmtMoney(pos.volume || 0)}</div>
      case 'volumePercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.volumePercentage || 0)}%</div>
      case 'profitPercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.profitPercentage || 0)}%</div>
      case 'storage': {
        const isCentSym = /[cC]$/.test(String(pos.symbol || ''))
        const displayStorage = isCentSym ? (pos.storage || 0) / 100 : (pos.storage || 0)
        return <div title={numericMode === 'compact' ? fmtMoneyFull(displayStorage) : undefined} className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{fmtMoney(displayStorage)}</div>
      }
      case 'storagePercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.storagePercentage || 0)}%</div>
      case 'appliedPercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.appliedPercentage || 0)}%</div>
      case 'sl':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.sl || 0, 5)}</div>
      case 'tp':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.tp || 0, 5)}</div>
      case 'commission': {
        const isCentSym = /[cC]$/.test(String(pos.symbol || ''))
        const displayCommission = isCentSym ? (pos.commission || 0) / 100 : (pos.commission || 0)
        return <div title={numericMode === 'compact' ? fmtMoneyFull(displayCommission) : undefined} className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{fmtMoney(displayCommission)}</div>
      }
      case 'login':
        const handleLoginClick = () => {
          const fullClient = clients.find(c => String(c.login) === String(pos.login))
            || rawClients.find(c => String(c.login) === String(pos.login))
          const derivedName = [pos.firstName, pos.lastName].filter(Boolean).join(' ') || pos.name || ''
          setSelectedClient(fullClient || { login: pos.login, email: pos.email || '', name: derivedName })
        }
        return (
          <div 
            className={`h-[38px] flex items-center justify-start px-2 text-[#1A63BC] font-semibold ${stickyClass} cursor-pointer hover:underline`} 
            style={stickyStyle}
            onClick={handleLoginClick}
            onTouchEnd={(e) => {
              e.preventDefault()
              handleLoginClick()
            }}
          >
            {pos.login || '-'}
          </div>
        )
      case 'updated':
        const timeValue = pos.timeUpdate || pos.timeCreate
        const formattedTime = timeValue ? new Date(timeValue * 1000).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '') : '-'
        return <div className={`h-[38px] flex items-center justify-start px-2 text-[10px] ${stickyClass}`} style={stickyStyle}>{formattedTime}</div>
      case 'firstName':
      case 'middleName':
      case 'lastName':
      case 'email':
      case 'phone':
      case 'position':
      case 'reason':
      case 'comment':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{pos[columnKey] || '-'}</div>
      default:
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>-</div>
    }
  }


  // Map card labels to icon file paths (updated for NET view)
  const getCardIcon = (label) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'TOTAL': `${baseUrl}mobile-icons/Total Positions.svg`,
      'NET VOLUME': `${baseUrl}mobile-icons/Volume Current.svg`,
      'TOTAL PROFIT': `${baseUrl}mobile-icons/Floating PNL.svg`,
      'UNIQUE LOGINS': `${baseUrl}mobile-icons/Unique Logins.svg`,
      'Floating Combined': `${baseUrl}mobile-icons/Floating Combined.svg`,
      'Floating INR': `${baseUrl}mobile-icons/Floating INR.svg`,
      'Floating USD': `${baseUrl}mobile-icons/Floating USD.svg`,
    }
    return iconMap[label] || `${baseUrl}mobile-icons/Clients.svg`
  }

  // Face cards for NET view: use server totals once available (same as desktop)
  const [cards, setCards] = useState([])
  const netTotals = useMemo(() => {
    if (showClientNet && hasFetchedServerNet) {
      const loginSet = new Set(serverNetPositions.map(p => p.login).filter(Boolean))
      return {
        total: serverNetTotal,
        netVolume: serverPositionsTotals.volume,
        totalProfit: serverPositionsTotals.profit,
        uniqueLogins: serverPositionsTotals.uniqueLogins || loginSet.size
      }
    }
    if (!showClientNet && hasFetchedServerPositions) {
      return {
        total: serverPositionsTotal,
        netVolume: serverPositionsTotals.volume,
        totalProfit: serverPositionsTotals.profit,
        uniqueLogins: serverPositionsTotals.uniqueLogins
      }
    }
    // Fallback to client-side WS cache totals
    return {
      total: filteredPositions.length,
      netVolume: filteredPositions.reduce((sum, p) => sum + (Number(p.volume) || 0), 0),
      totalProfit: filteredPositions.reduce((sum, p) => sum + (Number(p.profit) || 0), 0),
      uniqueLogins: new Set(filteredPositions.map(p => p.login)).size
    }
  }, [showClientNet, hasFetchedServerNet, serverNetPositions, serverNetTotal, serverPositionsTotals, hasFetchedServerPositions, serverPositionsTotal, filteredPositions])

  // Face cards array for rendering
  const netFaceCards = [
    { label: 'TOTAL', value: String(netTotals.total) },
    { label: 'NET VOLUME', value: fmtMoney(netTotals.netVolume) },
    { label: 'TOTAL PROFIT', value: fmtMoney(netTotals.totalProfit), isProfit: true, profitValue: netTotals.totalProfit },
    { label: 'UNIQUE LOGINS', value: String(netTotals.uniqueLogins) }
  ]

  // Card carousel scroll tracking
  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const handleScroll = () => {
      const cardWidth = 125 + 8
      const scrollLeft = carousel.scrollLeft
      const index = Math.round(scrollLeft / cardWidth)
      setActiveCardIndex(index)
    }

    carousel.addEventListener('scroll', handleScroll)
    return () => carousel.removeEventListener('scroll', handleScroll)
  }, [])

  // CSV export helpers
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

  const downloadFile = (filename, content) => {
    try {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
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

  const handleMobileExport = async () => {
    if (isExporting) return
    setIsExporting(true)
    const EXPORT_LIMIT = 1000
    const CONCURRENCY = 5

    const formatTime = (ts) => {
      if (!ts) return '-'
      try {
        const d = new Date(ts * 1000)
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
      } catch { return '-' }
    }

    try {
      if (showClientNet) {
        // ── NET positions export (mirrors desktop handleExportNetPositions) ──
        const baseParams = {
          netPosition: true,
          sortBy: 'netVolume',
          sortOrder: 'desc',
        }
        if (groupByBaseSymbol) baseParams.groupBaseSymbol = true
        if (displayMode === 'percentage') baseParams.percentage = true
        if (debouncedSearch.trim()) baseParams.search = debouncedSearch.trim()
        if (dateFilter) {
          const now = Math.floor(Date.now() / 1000)
          baseParams.dateFrom = now - dateFilter * 24 * 60 * 60
          baseParams.dateTo = now
        }

        const ACTION_LABEL = { BUY: 'Buy', SELL: 'Sell', FLAT: 'Flat' }
        const mapItems = (data) => data.map(item => ({
          symbol: item.symbol || item.baseSymbol || '-',
          netType: ACTION_LABEL[item.action] ?? item.action ?? 'Flat',
          netVolume: item.netVolume ?? 0,
          avgPrice: item.avgPrice ?? 0,
          totalProfit: item.totalProfit ?? 0,
          totalStorage: item.totalStorage ?? 0,
          totalCommission: item.totalCommission ?? 0,
          totalPositions: item.positionCount ?? item.totalPositions ?? 0,
        }))

        // Page 1 to get total/pages
        const first = await brokerAPI.searchPositions({ ...baseParams, page: 1, limit: EXPORT_LIMIT })
        const firstData = first?.data?.positions ?? first?.positions ?? []
        const total = first?.data?.total ?? first?.total ?? 0
        const apiPages = first?.data?.pages ?? first?.pages ?? 0
        const totalPages = apiPages || Math.ceil(total / EXPORT_LIMIT)

        let allRows = mapItems(firstData)

        for (let start = 2; start <= totalPages; start += CONCURRENCY) {
          const chunk = []
          for (let p = start; p < start + CONCURRENCY && p <= totalPages; p++) {
            chunk.push(brokerAPI.searchPositions({ ...baseParams, page: p, limit: EXPORT_LIMIT }))
          }
          const results = await Promise.all(chunk)
          results.forEach(res => {
            allRows = allRows.concat(mapItems(res?.data?.positions ?? res?.positions ?? []))
          })
        }

        const pct = displayMode === 'percentage'
        const headers = [
          { key: 'symbol',         label: 'Symbol',                                     accessor: r => r.symbol },
          { key: 'netType',        label: 'NET Type',                                   accessor: r => r.netType },
          { key: 'netVolume',      label: pct ? 'NET Volume %'    : 'NET Volume',       accessor: r => r.netVolume },
          { key: 'avgPrice',       label: 'Avg Price',                                  accessor: r => r.avgPrice },
          { key: 'totalProfit',    label: pct ? 'Total Profit %'  : 'Total Profit',     accessor: r => r.totalProfit },
          { key: 'totalStorage',   label: pct ? 'Total Storage %' : 'Total Storage',    accessor: r => r.totalStorage },
          { key: 'totalCommission',label: 'Commission',                                 accessor: r => r.totalCommission },
          { key: 'totalPositions', label: 'Positions',                                  accessor: r => r.totalPositions },
        ]
        downloadFile(`net_positions_${Date.now()}.csv`, toCSV(allRows, headers))

      } else {
        // ── Regular positions export (mirrors desktop handleExportPositions) ──
        const baseParams = {
          sortBy: sortColumn || 'timeCreate',
          sortOrder: sortDirection || 'desc',
        }
        if (debouncedSearch.trim()) baseParams.search = debouncedSearch.trim()
        if (displayMode === 'percentage') baseParams.percentage = true
        if (dateFilter) {
          const now = Math.floor(Date.now() / 1000)
          baseParams.dateFrom = now - dateFilter * 24 * 60 * 60
          baseParams.dateTo = now
        }

        // Page 1 to get total/pages
        const first = await brokerAPI.searchPositions({ ...baseParams, page: 1, limit: EXPORT_LIMIT })
        const firstData = first?.data?.positions ?? first?.positions ?? []
        const total = first?.data?.total ?? first?.total ?? 0
        const apiPages = first?.data?.pages ?? first?.pages ?? 0
        const totalPages = apiPages || Math.ceil(total / EXPORT_LIMIT)

        let allPositions = [...firstData]

        for (let start = 2; start <= totalPages; start += CONCURRENCY) {
          const chunk = []
          for (let p = start; p < start + CONCURRENCY && p <= totalPages; p++) {
            chunk.push(brokerAPI.searchPositions({ ...baseParams, page: p, limit: EXPORT_LIMIT }))
          }
          const results = await Promise.all(chunk)
          results.forEach(res => {
            allPositions = allPositions.concat(res?.data?.positions ?? res?.positions ?? [])
          })
        }

        const pct = displayMode === 'percentage'
        const headers = [
          { key: 'login',        label: 'Login',                                    accessor: r => r.login },
          { key: 'name',         label: 'Name',                                     accessor: r => r.name },
          { key: 'position',     label: 'Position',                                 accessor: r => r.position },
          { key: 'symbol',       label: 'Symbol',                                   accessor: r => r.symbol },
          { key: 'action',       label: 'Action',                                   accessor: r => r.action },
          { key: 'volume',       label: pct ? 'Volume %' : 'Volume',               accessor: r => r.volume },
          { key: 'priceOpen',    label: 'Open Price',                               accessor: r => r.priceOpen },
          { key: 'priceCurrent', label: 'Current Price',                            accessor: r => r.priceCurrent },
          { key: 'sl',           label: 'S/L',                                      accessor: r => r.priceSL },
          { key: 'tp',           label: 'T/P',                                      accessor: r => r.priceTP },
          { key: 'profit',       label: pct ? 'Profit %' : 'Profit',               accessor: r => r.profit },
          { key: 'storage',      label: pct ? 'Storage %' : 'Storage',             accessor: r => r.storage },
          { key: 'commission',   label: 'Commission',                               accessor: r => r.commission },
          { key: 'reason',       label: 'Reason',                                   accessor: r => r.reason },
          { key: 'comment',      label: 'Comment',                                  accessor: r => r.comment },
          { key: 'updated',      label: 'Updated',                                  accessor: r => formatTime(r.timeUpdate || r.timeCreate) },
        ]
        downloadFile(`positions_${Date.now()}.csv`, toCSV(allPositions, headers))
      }
    } catch (e) {
      console.error('Mobile export failed:', e)
      alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  // Reset to page 1 when date filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [dateFilter])

  // Fix mobile viewport height on actual devices
  useEffect(() => {
    const setVH = () => {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }
    
    setVH()
    window.addEventListener('resize', setVH)
    window.addEventListener('orientationchange', setVH)
    
    return () => {
      window.removeEventListener('resize', setVH)
      window.removeEventListener('orientationchange', setVH)
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-[#F8F8F8] overflow-hidden" style={{ height: 'calc(var(--vh, 1vh) * 100)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-[#ECECEC]">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        
        <h1 className="text-xl font-semibold text-black">Positions</h1>
        
        <div className="w-12 h-12"></div>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setIsSidebarOpen(false)}>
          <div 
            className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-[#ECECEC]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">BE</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#000000]">Broker Eyes</div>
                  <div className="text-xs text-[#404040]">Trading Platform</div>
                </div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#404040" strokeWidth="2"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto py-2">
              {/* Compact / Full numeric display mode toggle — same as desktop sidebar */}
              <div className="px-3 pb-3 pt-1">
                <p className="text-[9px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5 px-1">Display Mode</p>
                <div className="flex items-center bg-[#F3F4F6] p-0.5 w-full rounded">
                  <button
                    type="button"
                    onClick={() => {
                      setNumericMode('compact')
                      try { localStorage.setItem('globalDisplayMode', 'compact') } catch {}
                      try { window.dispatchEvent(new CustomEvent('globalDisplayModeChanged', { detail: 'compact' })) } catch {}
                    }}
                    className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${numericMode === 'compact' ? 'bg-[#3B5BDB] text-white shadow-sm' : 'text-[#374151] hover:bg-white/70'}`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNumericMode('full')
                      try { localStorage.setItem('globalDisplayMode', 'full') } catch {}
                      try { window.dispatchEvent(new CustomEvent('globalDisplayModeChanged', { detail: 'full' })) } catch {}
                    }}
                    className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${numericMode === 'full' ? 'bg-[#3B5BDB] text-white shadow-sm' : 'text-[#374151] hover:bg-white/70'}`}
                  >
                    Full
                  </button>
                </div>
              </div>
              <div className="border-t border-[#ECECEC] mb-2" />
              <nav className="flex flex-col">
                {[
                  {label:'Dashboard', path:'/dashboard', icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#404040"/></svg>
                  )},
                  {label:'Clients', path:'/client2', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="#404040"/><circle cx="16" cy="8" r="3" stroke="#404040"/><path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="#404040"/></svg>
                  )},
                  {label:'Positions', path:'/positions', active:true, icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="3" rx="1" stroke="#1A63BC"/><rect x="3" y="11" width="18" height="3" rx="1" stroke="#1A63BC"/><rect x="3" y="16" width="18" height="3" rx="1" stroke="#1A63BC"/></svg>
                  )},
                  {label:'Pending Orders', path:'/pending-orders', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#404040"/><circle cx="12" cy="12" r="2" fill="#404040"/></svg>
                  )},
                  {label:'Margin Level', path:'/margin-level', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 18L10 12L14 16L20 8" stroke="#404040" strokeWidth="2"/></svg>
                  )},
                  {label:'Live Dealing', path:'/live-dealing', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 18 0" stroke="#404040"/><path d="M7 12a5 5 0 0 1 10 0" stroke="#404040"/></svg>
                  )},
                  {label:'Client Percentage', path:'/client-percentage', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6" stroke="#404040"/><circle cx="8" cy="8" r="2" stroke="#404040"/><circle cx="16" cy="16" r="2" stroke="#404040"/></svg>
                  )},
                  {label:'Settings', path:'/settings', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" stroke="#404040"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2" stroke="#404040"/></svg>
                  )},
                ].map((item, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => {
                      navigate(item.path)
                      setIsSidebarOpen(false)
                    }}
                    className={`flex items-center gap-3 px-4 h-[37px] text-[10px] ${item.active ? 'text-[#1A63BC] bg-[#EFF4FB] rounded-lg font-semibold' : 'text-[#404040]'}`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center"><img src={`${import.meta.env.BASE_URL||'/'}sidebar-icons/${{'/dashboard':'Dashboard','/client2':'Clients','/positions':'Positions','/pending-orders':'Pending-Orders','/margin-level':'Margin-Level','/live-dealing':'Live-Dealing','/client-percentage':'Client-Percentage','/settings':'Settings'}[item.path]}.svg`} alt={item.label} style={{filter:'brightness(0)'}} className="w-5 h-5"/></span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-4 mt-auto border-t border-[#ECECEC]">
              <button onClick={logout} className="flex items-center gap-3 px-2 h-[37px] text-[10px] text-[#404040]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 18.25C11.8011 18.25 11.6103 18.329 11.4697 18.4697C11.329 18.6103 11.25 18.8011 11.25 19C11.25 19.1989 11.329 19.3897 11.4697 19.5303C11.6103 19.671 11.8011 19.75 12 19.75H18C18.4641 19.75 18.9092 19.5656 19.2374 19.2374C19.5656 18.9092 19.75 18.4641 19.75 18V6C19.75 5.53587 19.5656 5.09075 19.2374 4.76256C18.9092 4.43437 18.4641 4.25 18 4.25H12C11.8011 4.25 11.6103 4.32902 11.4697 4.46967C11.329 4.61032 11.25 4.80109 11.25 5C11.25 5.19891 11.329 5.38968 11.4697 5.53033C11.6103 5.67098 11.8011 5.75 12 5.75H18C18.0663 5.75 18.1299 5.77634 18.1768 5.82322C18.2237 5.87011 18.25 5.9337 18.25 6V18C18.25 18.0663 18.2237 18.1299 18.1768 18.1768C18.1299 18.2237 18.0663 18.25 18 18.25H12Z" fill="#FF5F57"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M14.5029 14.365C15.1929 14.365 15.7529 13.805 15.7529 13.115V10.875C15.7529 10.185 15.1929 9.62498 14.5029 9.62498H9.8899L9.8699 9.40498L9.8159 8.84898C9.79681 8.65261 9.73064 8.46373 9.62301 8.29838C9.51538 8.13302 9.36946 7.99606 9.19763 7.8991C9.0258 7.80214 8.83312 7.74805 8.63593 7.74142C8.43874 7.73478 8.24286 7.77579 8.0649 7.86098C6.42969 8.64307 4.94977 9.71506 3.6969 11.025L3.5979 11.128C3.37433 11.3612 3.24951 11.6719 3.24951 11.995C3.24951 12.3181 3.37433 12.6287 3.5979 12.862L3.6979 12.965C4.95047 14.2748 6.43005 15.3468 8.0649 16.129C8.24286 16.2142 8.43874 16.2552 8.63593 16.2485C8.83312 16.2419 9.0258 16.1878 9.19763 16.0909C9.36946 15.9939 9.51538 15.8569 9.62301 15.6916C9.73064 15.5262 9.79681 15.3374 9.8159 15.141L9.8699 14.585L9.8899 14.365H14.5029ZM9.1949 12.865C9.00405 12.8651 8.82044 12.938 8.68147 13.0688C8.54249 13.1996 8.45861 13.3785 8.4469 13.569C8.42823 13.859 8.4049 14.1493 8.3769 14.44L8.3609 14.602C7.05583 13.9285 5.86846 13.0481 4.8449 11.995C5.86846 10.9418 7.05583 10.0614 8.3609 9.38798L8.3769 9.54998C8.4049 9.83998 8.42823 10.1303 8.4469 10.421C8.45861 10.6115 8.54249 10.7903 8.68147 10.9211C8.82044 11.0519 9.00405 11.1248 9.1949 11.125H14.2529V12.865H9.1949Z" fill="#FF5F57"/>
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Action buttons row */}
        <div className="pt-5 pb-4 px-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
            <button 
              onClick={() => setIsCustomizeOpen(true)}
              className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative flex-shrink-0 ${
                (filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('positions'))
                  ? 'bg-blue-50 border-blue-200' 
                  : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4.5 6H9.5M2.5 3.5H11.5M5.5 9.5H8.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[#4B4B4B] text-[10px] font-medium font-outfit">Filter</span>
              {(() => {
                const filterCount = [
                  filters.hasFloating,
                  filters.hasCredit,
                  filters.noDeposit,
                  getActiveGroupFilter('positions')
                ].filter(Boolean).length;
                return filterCount > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {filterCount}
                  </span>
                ) : null;
              })()}
            </button>
            <button 
              onClick={() => {
                startTransition(() => {
                  setShowClientNet((v) => {
                    const next = !v
                    if (next) {
                      setClientNetCurrentPage(1)
                    }
                    return next
                  })
                })
              }}
              style={{ minWidth: '110px', width: '110px', flexShrink: 0 }}
              className={`h-8 rounded-[12px] ${showClientNet ? 'bg-blue-600 border-blue-600' : 'bg-white border-[#E5E7EB]'} border shadow-sm flex items-center justify-center gap-1.5 hover:opacity-90 transition-all`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 10h10M10 14h7M13 18h4" stroke={showClientNet ? "#ffffff" : "#666666"} />
              </svg>
              <span className={`${showClientNet ? 'text-white' : 'text-[#666666]'} text-[10px] font-medium font-outfit`}>NET Position</span>
            </button>
            {/* Percentage toggle icon button */}
            <button
              onClick={() => startTransition(() => setDisplayMode(m => m === 'percentage' ? 'value' : 'percentage'))}
              title={displayMode === 'percentage' ? 'Switch to value view' : 'Switch to percentage view'}
              className={`w-8 h-8 rounded-[12px] border shadow-sm flex items-center justify-center flex-shrink-0 transition-all ${
                displayMode === 'percentage'
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
              }`}
            >
              <span className={`text-[13px] font-bold leading-none ${displayMode === 'percentage' ? 'text-white' : 'text-[#4B4B4B]'}`}>%</span>
            </button>

            {/* Download button */}
            <button
              onClick={handleMobileExport}
              disabled={isExporting}
              title={isExporting ? 'Exporting...' : showClientNet ? 'Export NET positions to CSV' : 'Export positions to CSV'}
              className="w-8 h-8 rounded-[12px] border border-[#E5E7EB] shadow-sm bg-white flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting
                ? <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                : <svg className="w-4 h-4" fill="none" stroke="#4B4B4B" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16"/></svg>
              }
            </button>

            <button 
              onClick={() => window.location.reload()}
              disabled={loading.positions}
              className="w-8 h-8 rounded-lg border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="#4B4B4B" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>


        {/* Face Cards Carousel - matching desktop: Total Positions, Floating Combined, Floating INR, Floating USD */}
        {isMobileView && !showClientNet && (() => {
          const cardStyle = {
            boxSizing: 'border-box', minWidth: '125px', width: '125px', height: '60px',
            background: '#FFFFFF', border: '1px solid #F2F2F7',
            boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)', borderRadius: '12px',
            padding: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            scrollSnapAlign: 'start', flexShrink: 0, flex: 'none',
            userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-x'
          }
          const icon = (name) => `${import.meta.env.BASE_URL || '/'}mobile-icons/${name}.svg`
          const fc = serverPositionsTotals
          const mobileCards = [
            {
              label: 'Total Positions',
              icon: icon('Total Positions'),
              value: fmtMoney(netTotals?.total || 0),
              fullValue: netTotals?.total || 0,
              color: '#000000',
              arrow: null
            },
            {
              label: 'Floating Combined',
              icon: icon('Floating Combined'),
              value: fmtMoney(fc.floatingCombined),
              fullValue: fc.floatingCombined,
              color: fc.floatingCombined >= 0 ? '#16A34A' : '#DC2626',
              arrow: fc.floatingCombined >= 0 ? '▲' : '▼'
            },
            {
              label: 'Floating INR',
              icon: icon('Floating INR'),
              value: fmtMoney(fc.floatingINR),
              fullValue: fc.floatingINR,
              color: fc.floatingINR >= 0 ? '#16A34A' : '#DC2626',
              arrow: fc.floatingINR >= 0 ? '▲' : '▼'
            },
            {
              label: 'Floating USD',
              icon: icon('Floating USD'),
              value: fmtMoney(fc.floatingUSD),
              fullValue: fc.floatingUSD,
              color: fc.floatingUSD >= 0 ? '#16A34A' : '#DC2626',
              arrow: fc.floatingUSD >= 0 ? '▲' : '▼'
            },
          ]
          return (
            <div className="pb-2 pl-5">
              <div className="flex gap-[8px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pr-4">
                {mobileCards.map((card) => (
                  <div key={card.label} style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                      <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>{card.label}</span>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '4px' }}>
                        <img src={card.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) saturate(100%) invert(27%) sepia(97%) saturate(1500%) hue-rotate(213deg) brightness(100%)' }} onError={(e) => { e.target.style.display = 'none' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                      {card.arrow && <span style={{ fontSize: '10px', color: card.color, lineHeight: 1, flexShrink: 0 }}>{card.arrow}</span>}
                      <span title={numericMode === 'compact' ? fmtMoneyFull(card.fullValue) : undefined} style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: card.color }}>{card.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Search and navigation */}
        {!showClientNet && (
        <div className="pb-3 px-4">
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0 h-[32px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] px-2 flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
                <circle cx="8" cy="8" r="6.5" stroke="#4B4B4B" strokeWidth="1.5"/>
                <path d="M13 13L16 16" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input 
                placeholder="Search" 
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 min-w-0 text-[11px] text-[#000000] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit"
              />
            </div>
            <button 
              onClick={() => setIsColumnSelectorOpen(true)}
              className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="5" width="4" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
                <rect x="8.5" y="5" width="4" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
                <rect x="14" y="5" width="3" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
              </svg>
            </button>
            <button 
              onClick={() => handlePageChange(currentPage - 1, mobileRegularTotalPages)}
              disabled={currentPage === 1}
              className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M12 14L8 10L12 6" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="px-2 text-[10px] font-medium text-[#4B4B4B] flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={mobileRegularTotalPages}
                value={currentPage}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  const maxPage = mobileRegularTotalPages
                  if (!isNaN(n) && n >= 1 && n <= maxPage) {
                    handlePageChange(n, maxPage)
                  }
                }}
                className="w-10 h-6 border border-[#ECECEC] rounded-[8px] text-center text-[10px]"
                aria-label="Current page"
              />
              <span className="text-[#9CA3AF]">/</span>
              <span>{mobileRegularTotalPages}</span>
            </div>
            <button 
              onClick={() => handlePageChange(currentPage + 1, mobileRegularTotalPages)}
              disabled={currentPage >= mobileRegularTotalPages}
              className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M8 6L12 10L8 14" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        )}

        {/* Table - full width, remove outer padding */}
        {!showClientNet && (
        <div>
          <div className="bg-white shadow-[0_0_12px_rgba(75,75,75,0.05)] border border-[#F2F2F7] overflow-hidden">
            {/* Single scroll container with sticky header */}
            <div className="w-full overflow-x-auto overflow-y-auto scrollbar-hide" style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              paddingRight: '8px',
              paddingBottom: '8px',
              maxHeight: 'calc(100vh - 280px)'
            }}>
                <div className="relative" style={{ minWidth: 'max-content' }}>
                  {/* Table Header - Sticky */}
                  <div 
                    className="grid bg-blue-500 text-white text-[10px] font-semibold font-outfit shadow-[0_2px_4px_rgba(0,0,0,0.1)] sticky top-0 z-20"
                    style={{
                      gap: '0px', 
                      gridGap: '0px', 
                      columnGap: '0px',
                      gridTemplateColumns
                    }}
                  >
                    {activeColumns.map(col => (
                      <div 
                        key={col.key} 
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSort(col.key)
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleSort(col.key)
                        }}
                        className={`h-[28px] flex items-center justify-start px-1 cursor-pointer ${col.sticky ? 'sticky left-0 bg-blue-500 z-30' : ''}`}
                        style={{
                          border: 'none', 
                          outline: 'none', 
                          boxShadow: 'none',
                          WebkitTapHighlightColor: 'transparent',
                          userSelect: 'none',
                          touchAction: 'manipulation',
                          pointerEvents: 'auto'
                        }}
                      >
                        <span>{col.label}</span>
                        {sortColumn === col.key && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path 
                              d={sortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} 
                              stroke="white" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Table Rows */}
                  {(loading && loading.positions) || isPageChanging ? (
                    // YouTube-style skeleton loading
                  <>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div 
                        key={`skeleton-row-${i}`}
                        className="grid text-[10px] text-[#4B4B4B] font-outfit bg-white border-b border-[#E1E1E1]"
                        style={{
                          gap: '0px', 
                          gridGap: '0px', 
                          columnGap: '0px',
                          gridTemplateColumns
                        }}
                      >
                        {activeColumns.map((col, colIdx) => (
                          <div 
                            key={col.key}
                            className={`h-[38px] flex items-center justify-center px-1 ${col.sticky ? 'sticky left-0 bg-white z-10' : ''}`}
                            style={{border: 'none', outline: 'none', boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'}}
                          >
                            <div 
                              className="h-3 w-full max-w-[80%] bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded"
                              style={{
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 1.5s infinite'
                              }}
                            ></div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </>
                ) : filteredPositions.length === 0 ? (
                  <div className="text-center py-8 text-[#6B7280] text-sm">
                    {(filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('positions')) 
                      ? 'No positions match the applied filters' 
                      : 'No positions found'}
                  </div>
                ) : (
                  mobileRegularDisplayedPositions.map((pos, idx) => (
                    <div 
                      key={idx} 
                      className="grid text-[10px] text-[#4B4B4B] font-outfit bg-white border-b border-[#E1E1E1] hover:bg-[#F8FAFC] transition-colors"
                      style={{
                        gap: '0px', 
                        gridGap: '0px', 
                        columnGap: '0px',
                        gridTemplateColumns
                      }}
                    >
                      {activeColumns.map(col => (
                        <React.Fragment key={col.key}>
                          {renderCellValue(pos, col.key, col.sticky)}
                        </React.Fragment>
                      ))}
                    </div>
                  ))
                )}

                {/* Table Footer removed for mobile view */}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Client NET View */}

        {showClientNet && isMobileView && (
          <div className="bg-[#F5F7FA] flex flex-col h-full">
            {/* Face Cards Carousel removed from NET Position mobile view per request */}

            {/* Controls with Search - SYMMETRICAL with regular Positions tab */}
            <div className="pb-3 px-4">
              <div className="flex items-center gap-1">
                <div className="flex-1 min-w-0 h-[32px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] px-2 flex items-center gap-1.5">
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="flex-shrink-0">
                    <circle cx="8" cy="8" r="6.5" stroke="#4B4B4B" strokeWidth="1.5"/>
                    <path d="M13 13L16 16" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input 
                    placeholder="Search" 
                    value={clientNetSearchInput}
                    onChange={(e) => setClientNetSearchInput(e.target.value)}
                    className="flex-1 min-w-0 text-[11px] text-[#000000] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit"
                  />
                </div>
                <button 
                  onClick={() => setClientNetShowColumnSelector(true)}
                  className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <rect x="3" y="5" width="4" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
                    <rect x="8.5" y="5" width="4" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
                    <rect x="14" y="5" width="3" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
                  </svg>
                </button>
                <button 
                  onClick={() => handleClientNetPageChange(clientNetCurrentPage - 1, clientNetTotalPages)}
                  disabled={clientNetCurrentPage === 1}
                  className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M12 14L8 10L12 6" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="px-2 text-[10px] font-medium text-[#4B4B4B] flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={clientNetTotalPages}
                    value={clientNetCurrentPage}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (!isNaN(n) && n >= 1 && n <= clientNetTotalPages) {
                        handleClientNetPageChange(n, clientNetTotalPages)
                      }
                    }}
                    className="w-10 h-6 border border-[#ECECEC] rounded-[8px] text-center text-[10px]"
                    aria-label="Current page"
                  />
                  <span className="text-[#9CA3AF]">/</span>
                  <span>{clientNetTotalPages}</span>
                </div>
                <button 
                  onClick={() => handleClientNetPageChange(clientNetCurrentPage + 1, clientNetTotalPages)}
                  disabled={clientNetCurrentPage === clientNetTotalPages}
                  className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M8 6L12 10L8 14" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Client NET Table - FIXED GRID ALIGNMENT */}
            <div className="pt-0">
              <div className="bg-white shadow-[0_0_12px_rgba(75,75,75,0.05)] border border-[#F2F2F7] overflow-hidden">
                {/* Table - single scroll container */}
                <div className="overflow-x-auto overflow-y-auto scrollbar-hide" style={{
                  paddingRight: '8px',
                  paddingBottom: '0px',
                  maxHeight: 'calc(100vh - 350px)',
                  minHeight: 0,
                  overflowY: 'auto'
                }}>
                  {/* Header - Sticky */}
                  <div
                    className="grid bg-blue-500 text-white text-[10px] font-semibold h-[28px] sticky top-0 z-20"
                    style={{
                      gridTemplateColumns: [
                        clientNetVisibleColumns.login ? 'minmax(70px, 1fr)' : '',
                        clientNetVisibleColumns.symbol ? 'minmax(140px, 2fr)' : '',
                        clientNetVisibleColumns.netType ? 'minmax(60px, 1fr)' : '',
                        clientNetVisibleColumns.netVolume ? 'minmax(80px, 1fr)' : '',
                        clientNetVisibleColumns.avgPrice ? 'minmax(80px, 1fr)' : '',
                        clientNetVisibleColumns.totalProfit ? 'minmax(80px, 1fr)' : '',
                        clientNetVisibleColumns.totalStorage ? 'minmax(80px, 1fr)' : '',
                        clientNetVisibleColumns.totalCommission ? 'minmax(80px, 1fr)' : '',
                        clientNetVisibleColumns.totalPositions ? 'minmax(80px, 1fr)' : ''
                      ].filter(Boolean).join(' '),
                      gap: '0px',
                      columnGap: '0px'
                    }}
                  >
                    {clientNetVisibleColumns.login && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer sticky left-0 z-30 bg-blue-500"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('login'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('login'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        Login
                        {clientNetSortColumn === 'login' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.symbol && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('symbol'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('symbol'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        Symbol
                        {clientNetSortColumn === 'symbol' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.netType && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('netType'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('netType'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        Type
                        {clientNetSortColumn === 'netType' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.netVolume && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('netVolume'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('netVolume'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        NET Vol
                        {clientNetSortColumn === 'netVolume' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.avgPrice && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('avgPrice'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('avgPrice'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        Avg Price
                        {clientNetSortColumn === 'avgPrice' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.totalProfit && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('totalProfit'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('totalProfit'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        P/L
                        {clientNetSortColumn === 'totalProfit' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.totalStorage && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('totalStorage'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('totalStorage'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        Storage
                        {clientNetSortColumn === 'totalStorage' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.totalCommission && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('totalCommission'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('totalCommission'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        Comm
                        {clientNetSortColumn === 'totalCommission' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    {clientNetVisibleColumns.totalPositions && (
                      <div
                        className="flex items-center justify-start px-1 cursor-pointer bg-blue-500 text-white"
                        onClick={(e) => { e.stopPropagation(); handleClientNetSort('totalPositions'); }}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleClientNetSort('totalPositions'); }}
                        style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                      >
                        Positions
                        {clientNetSortColumn === 'totalPositions' && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                            <path d={clientNetSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Table Rows */}
                  {(isServerNetLoading || isClientNetPageChanging) && filteredClientNetPositions.length === 0 ? (
                    <>
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={`client-net-skeleton-${i}`} className="grid text-[10px] text-[#4B4B4B] bg-white border-b border-[#E1E1E1]" style={{
                          gridTemplateColumns: [
                            clientNetVisibleColumns.login ? 'minmax(70px, 1fr)' : '',
                            clientNetVisibleColumns.symbol ? 'minmax(140px, 2fr)' : '',
                            clientNetVisibleColumns.netType ? 'minmax(60px, 1fr)' : '',
                            clientNetVisibleColumns.netVolume ? 'minmax(80px, 1fr)' : '',
                            clientNetVisibleColumns.avgPrice ? 'minmax(80px, 1fr)' : '',
                            clientNetVisibleColumns.totalProfit ? 'minmax(80px, 1fr)' : '',
                            clientNetVisibleColumns.totalStorage ? 'minmax(80px, 1fr)' : '',
                            clientNetVisibleColumns.totalCommission ? 'minmax(80px, 1fr)' : '',
                            clientNetVisibleColumns.totalPositions ? 'minmax(80px, 1fr)' : ''
                          ].filter(Boolean).join(' ')
                        }}>
                          {clientNetVisibleColumns.login && <div className="h-[40px] flex items-center px-1 bg-white sticky left-0 z-10 border-b border-[#E1E1E1]"><div className="h-3 w-[60%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.symbol && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.netType && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.netVolume && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.avgPrice && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.totalProfit && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.totalStorage && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.totalCommission && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                          {clientNetVisibleColumns.totalPositions && <div className="h-[40px] flex items-center px-1 bg-white border-b border-[#E1E1E1]"><div className="h-3 w-[70%] bg-gray-200 rounded animate-pulse" /></div>}
                        </div>
                      ))}
                    </>
                  ) : clientNetPaginatedPositions.length === 0 ? (
                    <div className="text-center py-8 text-[#6B7280] text-sm">No NET positions found</div>
                  ) : (
                    clientNetPaginatedPositions.map((pos, idx) => (
                      <div key={idx} className="grid text-[10px] text-[#4B4B4B] hover:bg-[#F8FAFC]" style={{
                        gridTemplateColumns: [
                          clientNetVisibleColumns.login ? 'minmax(70px, 1fr)' : '',
                          clientNetVisibleColumns.symbol ? 'minmax(140px, 2fr)' : '',
                          clientNetVisibleColumns.netType ? 'minmax(60px, 1fr)' : '',
                          clientNetVisibleColumns.netVolume ? 'minmax(80px, 1fr)' : '',
                          clientNetVisibleColumns.avgPrice ? 'minmax(80px, 1fr)' : '',
                          clientNetVisibleColumns.totalProfit ? 'minmax(80px, 1fr)' : '',
                          clientNetVisibleColumns.totalStorage ? 'minmax(80px, 1fr)' : '',
                          clientNetVisibleColumns.totalCommission ? 'minmax(80px, 1fr)' : '',
                          clientNetVisibleColumns.totalPositions ? 'minmax(80px, 1fr)' : ''
                        ].filter(Boolean).join(' ')
                      }}>
                        {clientNetVisibleColumns.login && (
                          <div
                            className="flex items-center justify-start px-1 h-[40px] font-semibold bg-white text-[#1A63BC] cursor-pointer hover:underline sticky left-0 z-10 border-b border-[#E1E1E1]"
                            style={{boxShadow: '2px 0 4px rgba(0,0,0,0.05)'}}
                            onClick={() => {
                              const fullClient = clients.find(c => String(c.login) === String(pos.login))
                                || rawClients.find(c => String(c.login) === String(pos.login))
                              const derivedName = [pos.firstName, pos.lastName].filter(Boolean).join(' ') || pos.name || ''
                              setSelectedClient(fullClient || { login: pos.login, email: pos.email || '', name: derivedName })
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault()
                              const fullClient = clients.find(c => String(c.login) === String(pos.login))
                                || rawClients.find(c => String(c.login) === String(pos.login))
                              const derivedName = [pos.firstName, pos.lastName].filter(Boolean).join(' ') || pos.name || ''
                              setSelectedClient(fullClient || { login: pos.login, email: pos.email || '', name: derivedName })
                            }}
                          >
                            {pos.login}
                          </div>
                        )}
                        {clientNetVisibleColumns.symbol && <div className="flex items-center justify-start px-1 h-[40px] font-semibold bg-white text-black border-b border-[#E1E1E1]">{pos.symbol}</div>}
                        {clientNetVisibleColumns.netType && <div className={`flex items-center justify-start px-1 h-[40px] font-semibold bg-white border-b border-[#E1E1E1] ${
                          pos.netType === 'Buy' ? 'text-green-600' : 'text-red-600'
                        }`}>{pos.netType}</div>}
                        {clientNetVisibleColumns.netVolume && <div title={numericMode === 'compact' ? fmtMoneyFull(pos.netVolume) : undefined} className="flex items-center justify-start px-1 h-[40px] bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{fmtMoney(pos.netVolume)}</div>}
                        {clientNetVisibleColumns.avgPrice && <div title={numericMode === 'compact' ? fmtMoneyFull(pos.avgPrice) : undefined} className="flex items-center justify-start px-1 h-[40px] bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{fmtMoney(pos.avgPrice)}</div>}
                        {clientNetVisibleColumns.totalProfit && <div title={numericMode === 'compact' ? fmtMoneyFull(pos.totalProfit) : undefined} className={`flex items-center justify-start px-1 h-[40px] font-semibold bg-white border-b border-[#E1E1E1] ${
                          pos.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>{fmtMoney(pos.totalProfit)}</div>}
                        {clientNetVisibleColumns.totalStorage && <div title={numericMode === 'compact' ? fmtMoneyFull(pos.totalStorage || 0) : undefined} className="flex items-center justify-start px-1 h-[40px] bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{fmtMoney(pos.totalStorage || 0)}</div>}
                        {clientNetVisibleColumns.totalCommission && <div title={numericMode === 'compact' ? fmtMoneyFull(pos.totalCommission || 0) : undefined} className="flex items-center justify-start px-1 h-[40px] bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{fmtMoney(pos.totalCommission || 0)}</div>}
                        {clientNetVisibleColumns.totalPositions && <div className="flex items-center justify-start px-1 h-[40px] bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{pos.totalPositions}</div>}
                      </div>
                    ))
                  )}

                  {/* Footer removed for mobile view */}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CustomizeView Modal */}
      <CustomizeViewModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        onDateFilterClick={() => {
          setIsCustomizeOpen(false)
          setIsDateFilterOpen(true)
        }}
        onGroupsClick={() => {
          setIsCustomizeOpen(false)
          setIsLoginGroupsOpen(true)
        }}
        onReset={() => {
          setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
          setDateFilter(null)
          setActiveGroupFilter('positions', null)
          setHasPendingGroupChanges(false)
          setHasPendingDateChanges(false)
          setPendingGroupDraft(null)
          setPendingDateDraft(null)
        }}
        onApply={() => {
          if (hasPendingGroupChanges) {
            setActiveGroupFilter('positions', pendingGroupDraft ? pendingGroupDraft.name : null)
          }
          if (hasPendingDateChanges) {
            setDateFilter(pendingDateDraft)
          }
          setIsCustomizeOpen(false)
          setHasPendingGroupChanges(false)
          setHasPendingDateChanges(false)
          setPendingGroupDraft(null)
          setPendingDateDraft(null)
        }}
        hasPendingChanges={hasPendingGroupChanges || hasPendingDateChanges}
      />

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={(newFilters) => {
          setFilters(newFilters)
          setIsFilterOpen(false)
        }}
        filters={filters}
      />

      {/* Date Filter Modal */}
      <DateFilterModal
        isOpen={isDateFilterOpen}
        onClose={() => setIsDateFilterOpen(false)}
        onApply={(days) => {
          setDateFilter(days)
          setIsDateFilterOpen(false)
        }}
        currentFilter={dateFilter}
        onPendingChange={(hasPending, draft) => {
          setHasPendingDateChanges(hasPending)
          setPendingDateDraft(draft)
        }}
      />

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupOpen}
        onClose={() => setIsGroupOpen(false)}
        availableItems={ibFilteredPositions}
        loginField="login"
        displayField="symbol"
      />

      {/* Login Groups Modal */}
      <LoginGroupsModal
        isOpen={isLoginGroupsOpen}
        onClose={() => setIsLoginGroupsOpen(false)}
        groups={groups.map(g => ({
          ...g,
          loginCount: g.range 
            ? (g.range.to - g.range.from + 1) 
            : g.loginIds.length
        }))}
        activeGroupName={getActiveGroupFilter('positions')}
        onSelectGroup={(group) => {
          if (group === null) {
            setActiveGroupFilter('positions', null)
          } else {
            setActiveGroupFilter('positions', group.name)
          }
          setIsLoginGroupsOpen(false)
          setHasPendingGroupChanges(false)
          setPendingGroupDraft(null)
        }}
        onCreateGroup={() => {
          setIsLoginGroupsOpen(false)
          setEditingGroup(null)
          setIsLoginGroupModalOpen(true)
        }}
        onEditGroup={(group) => {
          setIsLoginGroupsOpen(false)
          setEditingGroup(group)
          setIsLoginGroupModalOpen(true)
        }}
        onDeleteGroup={(group) => {
          if (window.confirm(`Delete group "${group.name}"?`)) {
            deleteGroup(group.name)
          }
        }}
        onPendingChange={(hasPending, draftName) => {
          setHasPendingGroupChanges(hasPending)
          setPendingGroupDraft(draftName ? { name: draftName } : null)
        }}
      />

      {/* Login Group Modal (Create/Edit) */}
      <LoginGroupModal
        isOpen={isLoginGroupModalOpen}
        onClose={() => {
          setIsLoginGroupModalOpen(false)
          setEditingGroup(null)
        }}
        onSave={() => {
          setIsLoginGroupModalOpen(false)
          setEditingGroup(null)
          setIsLoginGroupsOpen(true)
        }}
        onBack={() => {
          setIsLoginGroupsOpen(true)
        }}
        editGroup={editingGroup}
      />

      {/* Column Selector Modal */}
      {isColumnSelectorOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setIsColumnSelectorOpen(false)}>
          <div 
            className="bg-white w-full rounded-t-[24px] max-h-[100vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-[#000000]">Show/Hide Columns</h3>
              <button onClick={() => setIsColumnSelectorOpen(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#404040" strokeWidth="2"/>
                </svg>
              </button>
            </div>

            <div className="px-5 py-3 border-b border-[#E5E7EB] flex-shrink-0">
              <div className="relative h-12">
                <input
                  type="text"
                  placeholder="Search Columns"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 bg-gray-100 border-0 rounded-xl text-[10px] text-black font-semibold font-outfit placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 20 20" 
                  fill="none" 
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[450px] max-h-[55vh]">
              <div className="px-5 py-3">
                {(() => {
                  const allColumns = [
                    { label: 'Login', key: 'login' },
                    { label: 'Time', key: 'updated' },
                    { label: 'First Name', key: 'firstName' },
                    { label: 'Middle Name', key: 'middleName' },
                    { label: 'Last Name', key: 'lastName' },
                    { label: 'Email', key: 'email' },
                    { label: 'Phone', key: 'phone' },
                    { label: 'Position', key: 'position' },
                    { label: 'Symbol', key: 'symbol' },
                    { label: 'Action', key: 'action' },
                    { label: 'Net Type', key: 'netType' },
                    { label: 'Volume', key: 'volume' },
                    { label: 'Volume %', key: 'volumePercentage' },
                    { label: 'Price Open', key: 'priceOpen' },
                    { label: 'Price Current', key: 'priceCurrent' },
                    { label: 'Net Volume', key: 'netVolume' },
                    { label: 'S/L', key: 'sl' },
                    { label: 'T/P', key: 'tp' },
                    { label: 'Profit', key: 'profit' },
                    { label: 'Total Profit', key: 'totalProfit' },
                    { label: 'Profit %', key: 'profitPercentage' },
                    { label: 'Storage', key: 'storage' },
                    { label: 'Storage %', key: 'storagePercentage' },
                    { label: 'Applied %', key: 'appliedPercentage' },
                    { label: 'Reason', key: 'reason' },
                    { label: 'Comment', key: 'comment' },
                    { label: 'Commission', key: 'commission' }
                  ]
                  const excludedOnMobile = new Set(['firstName','middleName','lastName','email','phone'])
                  const filtered = allColumns
                    .filter(col => col.label.toLowerCase().includes(columnSearch.toLowerCase()))
                    .filter(col => !isMobileView || !excludedOnMobile.has(col.key))
                  return filtered.length > 0 ? (
                    filtered.map(col => (
                      <label 
                        key={col.key} 
                        className="flex items-center justify-between py-3 border-b border-[#F2F2F7] last:border-0"
                      >
                        <span className="text-sm text-[#000000] font-outfit">{col.label}</span>
                        <div className="relative inline-block w-12 h-6">
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key]}
                            onChange={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                            className="sr-only peer"
                          />
                          <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                        </div>
                      </label>
                    ))
                  ) : (
                    <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                      No columns match your search
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Net Column Selector Modal */}
      {clientNetShowColumnSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setClientNetShowColumnSelector(false)}>
          <div 
            className="bg-white w-full rounded-t-[24px] max-h-[75vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-[#000000]">Show/Hide Columns</h3>
              <button onClick={() => setClientNetShowColumnSelector(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#404040" strokeWidth="2"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-5 py-3">
                {[
                  { key: 'login', label: 'Login' },
                  { key: 'symbol', label: 'Symbol' },
                  { key: 'netType', label: 'NET Type' },
                  { key: 'netVolume', label: 'NET Volume' },
                  { key: 'avgPrice', label: 'Avg Price' },
                  { key: 'totalProfit', label: 'Total Profit' },
                  { key: 'totalStorage', label: 'Total Storage' },
                  { key: 'totalCommission', label: 'Total Commission' },
                  { key: 'totalPositions', label: 'Positions' }
                ].map(({ key, label }) => (
                  <label 
                    key={key} 
                    className="flex items-center justify-between py-3 border-b border-[#F2F2F7] last:border-0"
                  >
                    <span className="text-sm text-[#000000] font-outfit">{label}</span>
                    <div className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        checked={clientNetVisibleColumns[key]}
                        onChange={() => setClientNetVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))}
                        className="sr-only peer"
                      />
                      <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Details Modal */}
      {selectedClient && (
        <ClientDetailsMobileModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          allPositionsCache={positions}
          allOrdersCache={orders}
        />
      )}
    </div>
  );
}

