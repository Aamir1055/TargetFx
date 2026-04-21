import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import DateFilterModal from './DateFilterModal'
import IBFilterModal from './IBFilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import ClientDetailsMobileModal from './ClientDetailsMobileModal'
import { useIB } from '../contexts/IBContext'
import { useGroups } from '../contexts/GroupContext'
import { applyCumulativeFilters, applySearchFilter, applySorting } from '../utils/mobileFilters'
import { normalizePositions } from '../utils/currencyNormalization'

const formatNum = (n) => {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0.00'
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PositionModule() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { positions, clients, loading, orders, rawClients } = useData()
  const { selectedIB, selectIB, clearIBSelection, filterByActiveIB, ibMT5Accounts } = useIB()
  const { groups, deleteGroup, getActiveGroupFilter, setActiveGroupFilter, filterByActiveGroup, activeGroupFilters } = useGroups()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isIBFilterOpen, setIsIBFilterOpen] = useState(false)
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
    const [hasPendingIBChanges, setHasPendingIBChanges] = useState(false)
    const [pendingIBDraft, setPendingIBDraft] = useState(null)
    const [hasPendingGroupChanges, setHasPendingGroupChanges] = useState(false)
    const [pendingGroupDraft, setPendingGroupDraft] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  
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
  const itemsPerPage = 12
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [showNetPositions, setShowNetPositions] = useState(false)
  const [showClientNet, setShowClientNet] = useState(false)
  
  // NET Position states
  const [netCurrentPage, setNetCurrentPage] = useState(1)
  const netItemsPerPage = 12
  const [netSortColumn, setNetSortColumn] = useState(null)
  const [netSortDirection, setNetSortDirection] = useState('asc')
  const [netCardsVisible, setNetCardsVisible] = useState({
    netSymbols: true,
    totalNetVolume: true,
    totalNetPL: true,
    totalLogins: true
  })
  const [netCardFilterOpen, setNetCardFilterOpen] = useState(false)
  const netCardFilterRef = useRef(null)
  const [netVisibleColumns, setNetVisibleColumns] = useState({
    login: false,
    symbol: true,
    netType: true,
    netVolume: true,
    avgPrice: true,
    totalProfit: true,
    totalStorage: false,
    totalCommission: false,
    loginCount: true,
    totalPositions: true,
    variantCount: false
  })
  const [netShowColumnSelector, setNetShowColumnSelector] = useState(false)
  const [groupByBaseSymbol, setGroupByBaseSymbol] = useState(false)
  const [expandedNetSymbols, setExpandedNetSymbols] = useState(new Set())
  const [netSearchInput, setNetSearchInput] = useState('')
  
  // Client NET states
  const [clientNetCurrentPage, setClientNetCurrentPage] = useState(1)
  const clientNetItemsPerPage = 12
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
    login: true,
    symbol: true,
    netType: true,
    netVolume: true,
    avgPrice: true,
    totalProfit: true,
    totalStorage: false,
    totalCommission: false,
    totalPositions: true
  })
  const [clientNetShowColumnSelector, setClientNetShowColumnSelector] = useState(false)
  const [clientNetSearchInput, setClientNetSearchInput] = useState('')
  
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
    clearIBSelection()
    setActiveGroupFilter('positions', null)
    setSearchInput('')
  }, [])

  useEffect(() => {
    const handler = () => {
      setIsFilterOpen(false)
      setIsIBFilterOpen(false)
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

  // Detect mobile view
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Apply all filters in cumulative order: Customize View -> IB -> Group
  const ibFilteredPositions = useMemo(() => {
    return applyCumulativeFilters(displayPositions, {
      customizeFilters: filters,
      filterByActiveIB,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'positions'
    })
  }, [displayPositions, filters, filterByActiveIB, filterByActiveGroup, activeGroupFilters])

  // Defer heavy calculations to allow navigation to be responsive
  const deferredIbFilteredPositions = useDeferredValue(ibFilteredPositions)

  // Apply date filter to positions before calculating summary stats
  const dateFilteredPositions = useMemo(() => {
    if (!dateFilter) return deferredIbFilteredPositions
    
    const now = Date.now() / 1000 // Current time in seconds
    const daysInSeconds = dateFilter * 24 * 60 * 60
    const cutoffTime = now - daysInSeconds
    
    return deferredIbFilteredPositions.filter(pos => {
      const timeValue = pos.timeUpdate || pos.timeCreate
      return timeValue && timeValue >= cutoffTime
    })
  }, [deferredIbFilteredPositions, dateFilter])

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

  // Calculate NET positions
  const calculateGlobalNetPositions = (positions) => {
    if (!positions || positions.length === 0) return []

    const symbolMap = new Map()
    const getBaseSymbol = (s) => {
      if (!s || typeof s !== 'string') return s
      const parts = s.split(/[\.\-]/)
      return parts[0] || s
    }

    positions.forEach(pos => {
      const symbol = pos.symbol
      if (!symbol) return
      const key = groupByBaseSymbol ? getBaseSymbol(symbol) : symbol

      if (!symbolMap.has(key)) {
        symbolMap.set(key, {
          key,
          buyPositions: [],
          sellPositions: [],
          logins: new Set(),
          variantMap: new Map()
        })
      }

      const group = symbolMap.get(key)
      group.logins.add(pos.login)

      const rawAction = pos.action
      let actionNorm = null
      if (rawAction === 0 || rawAction === '0') actionNorm = 'buy'
      else if (rawAction === 1 || rawAction === '1') actionNorm = 'sell'
      else if (typeof rawAction === 'string') actionNorm = rawAction.toLowerCase()

      if (actionNorm === 'buy') {
        group.buyPositions.push(pos)
      } else if (actionNorm === 'sell') {
        group.sellPositions.push(pos)
      }

      // Track exact symbol variants when grouping by base
      if (groupByBaseSymbol) {
        const exact = symbol
        if (!group.variantMap.has(exact)) {
          group.variantMap.set(exact, { buyPositions: [], sellPositions: [] })
        }
        const v = group.variantMap.get(exact)
        if (actionNorm === 'buy') v.buyPositions.push(pos)
        else if (actionNorm === 'sell') v.sellPositions.push(pos)
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

  const netPositions = useMemo(() => calculateGlobalNetPositions(dateFilteredPositions), [dateFilteredPositions, groupByBaseSymbol])

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

  // Filter NET positions based on search
  const filteredNetPositions = useMemo(() => {
    let filtered = netPositions
    if (netSearchInput.trim()) {
      const query = netSearchInput.toLowerCase()
      filtered = filtered.filter(pos => 
        String(pos.symbol || '').toLowerCase().includes(query) ||
        String(pos.netType || '').toLowerCase().includes(query)
      )
    }
    // Apply sorting
    filtered = applySorting(filtered, netSortColumn, netSortDirection)
    return filtered
  }, [netPositions, netSearchInput, netSortColumn, netSortDirection])

  // Filter Client NET positions based on search
  const filteredClientNetPositions = useMemo(() => {
    let filtered = clientNetPositions
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
  }, [clientNetPositions, clientNetSearchInput, clientNetSortColumn, clientNetSortDirection])

  // Apply search and sorting (use deferred value to prevent blocking navigation)
  const filteredPositions = useMemo(() => {
    // Apply search filter (date filter already applied in dateFilteredPositions)
    let filtered = applySearchFilter(dateFilteredPositions, searchInput, ['symbol', 'login'])
    
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
  }, [dateFilteredPositions, searchInput, sortColumn, sortDirection])

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

  // Handle NET position column sorting
  const handleNetSort = (columnKey) => {
    if (netSortColumn === columnKey) {
      setNetSortDirection(netSortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setNetSortColumn(columnKey)
      setNetSortDirection('asc')
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

  // Pagination calculations for NET and Client NET (memoized)
  const netTotalPages = useMemo(() => 
    Math.ceil(filteredNetPositions.length / netItemsPerPage),
    [filteredNetPositions.length, netItemsPerPage]
  )
  const netPaginatedPositions = useMemo(() =>
    filteredNetPositions.slice(
      (netCurrentPage - 1) * netItemsPerPage,
      netCurrentPage * netItemsPerPage
    ),
    [filteredNetPositions, netCurrentPage, netItemsPerPage]
  )
  
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
      if (netCardFilterRef.current && !netCardFilterRef.current.contains(e.target)) {
        setNetCardFilterOpen(false)
      }
      if (clientNetCardFilterRef.current && !clientNetCardFilterRef.current.contains(e.target)) {
        setClientNetCardFilterOpen(false)
      }
    }
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
          <div className={`h-[38px] flex items-center justify-start px-2 font-medium ${
            displayProfit >= 0 ? 'text-green-600' : 'text-red-600'
          } ${stickyClass}`} style={stickyStyle}>
            {formatNum(displayProfit)}
          </div>
        )
      }
      case 'priceOpen':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.priceOpen || 0)}</div>
      case 'priceCurrent':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.priceCurrent || 0)}</div>
      case 'volume':
      case 'netVolume':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.volume || 0)}</div>
      case 'volumePercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.volumePercentage || 0)}%</div>
      case 'profitPercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.profitPercentage || 0)}%</div>
      case 'storage': {
        const isCentSym = /[cC]$/.test(String(pos.symbol || ''))
        const displayStorage = isCentSym ? (pos.storage || 0) / 100 : (pos.storage || 0)
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(displayStorage)}</div>
      }
      case 'storagePercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.storagePercentage || 0)}%</div>
      case 'appliedPercentage':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.appliedPercentage || 0)}%</div>
      case 'sl':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.sl || 0)}</div>
      case 'tp':
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(pos.tp || 0)}</div>
      case 'commission': {
        const isCentSym = /[cC]$/.test(String(pos.symbol || ''))
        const displayCommission = isCentSym ? (pos.commission || 0) / 100 : (pos.commission || 0)
        return <div className={`h-[38px] flex items-center justify-start px-2 ${stickyClass}`} style={stickyStyle}>{formatNum(displayCommission)}</div>
      }
      case 'login':
        const handleLoginClick = () => {
          const fullClient = clients.find(c => String(c.login) === String(pos.login))
          setSelectedClient(fullClient || { login: pos.login, email: pos.email || '', name: '' })
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

  // Face cards data - matching desktop layout with persistent state
  const [cards, setCards] = useState([])

  // Map card labels to icon file paths
  const getCardIcon = (label) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'POSITIONS': `${baseUrl}Mobile cards icons/Total Balance.svg`,
      'FLOATING': `${baseUrl}Mobile cards icons/Floating Profit.svg`,
      'UNIQUE LOGINS': `${baseUrl}Mobile cards icons/Total Clients.svg`,
      'SYMBOLS': `${baseUrl}Mobile cards icons/Total Equity.svg`
    }
    return iconMap[label] || `${baseUrl}Mobile cards icons/Total Clients.svg`
  }
  
  // Update cards when filtered positions change (includes date filter)
  useEffect(() => {
    const totalPositions = filteredPositions.length
    const totalFloatingProfit = filteredPositions.reduce((sum, p) => {
      const val = p.profit || 0
      return sum + (/[cC]$/.test(String(p.symbol || '')) ? val / 100 : val)
    }, 0)
    const uniqueLogins = new Set(filteredPositions.map(p => p.login)).size
    const uniqueSymbols = new Set(filteredPositions.map(p => p.symbol)).size
    
    const newCards = [
      { label: 'POSITIONS', value: String(totalPositions) },
      { 
        label: 'FLOATING', 
        value: formatNum(Math.abs(totalFloatingProfit)),
        isProfit: true,
        profitValue: totalFloatingProfit
      },
      { label: 'UNIQUE LOGINS', value: String(uniqueLogins) },
      { label: 'SYMBOLS', value: String(uniqueSymbols) }
    ]
    
    // Only update if cards length is different (initial load) or keep existing order
    if (cards.length === 0) {
      setCards(newCards)
    } else {
      // Update values while preserving order
      setCards(prevCards => {
        return prevCards.map(prevCard => {
          const updated = newCards.find(c => c.label === prevCard.label)
          return updated || prevCard
        })
      })
    }
  }, [filteredPositions])

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
                  {label:'IB Commissions', path:'/ib-commissions', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#404040" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 17l10 5 10-5" stroke="#404040" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12l10 5 10-5" stroke="#404040" strokeLinecap="round" strokeLinejoin="round"/></svg>
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
                    <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
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
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsCustomizeOpen(true)}
              className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative ${
                (filters.hasFloating || filters.hasCredit || filters.noDeposit || selectedIB || getActiveGroupFilter('positions'))
                  ? 'bg-blue-50 border-blue-200' 
                  : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4.5 6.5H9.5M2.5 3.5H11.5M5.5 9.5H8.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[#4B4B4B] text-[10px] font-medium font-outfit">Filter</span>
              {(() => {
                const filterCount = [
                  filters.hasFloating,
                  filters.hasCredit,
                  filters.noDeposit,
                  selectedIB,
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
                setShowClientNet((v) => !v)
              }}
              className={`flex-1 h-8 rounded-[12px] ${showClientNet ? 'bg-blue-600 border-blue-600' : 'bg-white border-[#E5E7EB]'} border shadow-sm flex items-center justify-center gap-1.5 hover:opacity-90 transition-all`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={showClientNet ? "#ffffff" : "#666666"} strokeWidth="2" strokeLinecap="round"/>
                <circle cx="9" cy="7" r="4" stroke={showClientNet ? "#ffffff" : "#666666"} strokeWidth="2"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke={showClientNet ? "#ffffff" : "#666666"} strokeLinecap="round"/>
              </svg>
              <span className={`${showClientNet ? 'text-white' : 'text-[#666666]'} text-[10px] font-medium font-outfit`}>Client Net</span>
            </button>
            <button 
              onClick={() => window.location.reload()}
              disabled={loading.positions}
              className="w-8 h-8 rounded-lg border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="#1A63BC" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Face Cards Carousel - Hidden in NET views */}
        {!showNetPositions && !showClientNet && (
        <div className="pb-2 pl-5">
          <div 
            ref={carouselRef}
            className="flex gap-[8px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pr-4"
          >
            {loading && loading.positions ? (
              // Skeleton loading for face cards
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div 
                    key={`skeleton-card-${i}`}
                    style={{
                      boxSizing: 'border-box',
                      minWidth: '125px',
                      width: '125px',
                      height: '60px',
                      background: '#FFFFFF',
                      border: '1px solid #F2F2F7',
                      boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                      borderRadius: '12px',
                      padding: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      scrollSnapAlign: 'start',
                      flexShrink: 0,
                      flex: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
                      <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                ))}
              </>
            ) : (
              cards.map((card, i) => (
              <div 
                key={i}
                draggable="true"
                onDragStart={(e) => {
                  e.dataTransfer.setData('cardIndex', i)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const fromIndex = parseInt(e.dataTransfer.getData('cardIndex'))
                  if (fromIndex !== i && !isNaN(fromIndex)) {
                    const newCards = [...cards]
                    const [movedCard] = newCards.splice(fromIndex, 1)
                    newCards.splice(i, 0, movedCard)
                    setCards(newCards)
                  }
                }}
                style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                  <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>{card.label}</span>
                  <img src={getCardIcon(card.label)} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    lineHeight: '14px',
                    letterSpacing: '-0.01em',
                    color: card.isProfit ? (card.profitValue >= 0 ? '#16A34A' : '#DC2626') : '#000000'
                  }}>
                    {card.value === '' || card.value === undefined ? '0.00' : card.value}
                  </span>
                </div>
              </div>
              ))
            )}
          </div>
        </div>
        )}

        {/* Search and navigation */}
        {!showNetPositions && !showClientNet && (
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
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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
                max={Math.ceil(filteredPositions.length / itemsPerPage)}
                value={currentPage}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  const maxPage = Math.ceil(filteredPositions.length / itemsPerPage)
                  if (!isNaN(n) && n >= 1 && n <= maxPage) {
                    setCurrentPage(n)
                  }
                }}
                className="w-10 h-6 border border-[#ECECEC] rounded-[8px] text-center text-[10px]"
                aria-label="Current page"
              />
              <span className="text-[#9CA3AF]">/</span>
              <span>{Math.ceil(filteredPositions.length / itemsPerPage)}</span>
            </div>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredPositions.length / itemsPerPage), prev + 1))}
              disabled={currentPage >= Math.ceil(filteredPositions.length / itemsPerPage)}
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
        {!showNetPositions && !showClientNet && (
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
                  {loading && loading.positions ? (
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
                    {(filters.hasFloating || filters.hasCredit || filters.noDeposit || selectedIB || getActiveGroupFilter('positions')) 
                      ? 'No positions match the applied filters' 
                      : 'No positions found'}
                  </div>
                ) : (
                  filteredPositions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((pos, idx) => (
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

                {/* Table Footer */}
                <div 
                  className="grid bg-[#EFF4FB] text-[#1A63BC] text-[10px] font-semibold border-t-2 border-[#1A63BC]"
                  style={{
                    gap: '0px', 
                    gridGap: '0px', 
                    columnGap: '0px',
                    gridTemplateColumns
                  }}
                >
                  {activeColumns.map((col, idx) => (
                    <div 
                      key={col.key} 
                      className={`h-[38px] flex items-center justify-start px-1 ${col.sticky ? 'sticky left-0 bg-[#EFF4FB] z-10' : ''}`}
                      style={{border: 'none', outline: 'none', boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'}}
                    >
                      {idx === 0 ? 'Total' : (col.key === 'totalProfit' || col.key === 'profit') ? formatNum(totalProfit) : '-'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* NET Position View */}
        {showNetPositions && (
          <div className="bg-[#F5F7FA] flex flex-col h-full">
            {/* Face Cards Carousel */}
            <div className="pb-2 pl-5">
              <div className="flex gap-[8px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pr-4">
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>NET Symbols</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/Total Equity.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: '#000000' }}>{netPositions.length}</span>
                  </div>
                </div>
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>NET Volume</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/Total Balance.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: '#000000' }}>{formatNum(netPositions.reduce((s,p)=>s+p.netVolume,0))}</span>
                  </div>
                </div>
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>NET P/L</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/PNL.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: netPositions.reduce((s,p)=>s+p.totalProfit,0) >= 0 ? '#16A34A' : '#DC2626' }}>
                      {formatNum(netPositions.reduce((s,p)=>s+p.totalProfit,0))}
                    </span>
                  </div>
                </div>
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>Total Logins</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/Total Clients.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: '#000000' }}>{netPositions.reduce((s,p)=>s+p.loginCount,0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls with Search */}
            <div className="flex items-center gap-2 pb-3 px-4">
                {/* Search Bar */}
                <div className="h-[36px] w-[155px] bg-white border border-gray-300 rounded-lg px-2 flex items-center gap-1 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search"
                    value={netSearchInput}
                    onChange={(e) => setNetSearchInput(e.target.value)}
                    className="flex-1 text-[11px] text-gray-700 placeholder-gray-400 outline-none bg-transparent"
                  />
                </div>

                {/* Group Base Symbols */}
                <button
                  onClick={() => setGroupByBaseSymbol(v => !v)}
                  className={`h-[36px] px-3 rounded-lg border text-[10px] font-medium flex items-center gap-1 min-w-[60px] ${groupByBaseSymbol ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-indigo-200'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 10h10M10 14h7M13 18h4"/></svg>
                  Base
                </button>

                {/* Columns */}
                <div>
                  <button onClick={() => setNetShowColumnSelector(true)} className="h-[36px] w-[36px] rounded-lg border border-purple-200 bg-white flex items-center justify-center text-gray-700">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                  </button>
                </div>

                {/* Pagination */}
                <button
                  onClick={() => setNetCurrentPage(p => Math.max(1, p - 1))}
                  disabled={netCurrentPage === 1}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${netCurrentPage === 1 ? 'text-gray-300 bg-gray-100' : 'text-gray-700 bg-white border border-gray-300'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="text-[10px] font-medium text-gray-700 flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={netTotalPages}
                    value={netCurrentPage}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (!isNaN(n) && n >= 1 && n <= netTotalPages) {
                        setNetCurrentPage(n)
                      }
                    }}
                    className="w-10 h-6 border border-gray-300 rounded-lg text-center text-[10px]"
                    aria-label="Current page"
                  />
                  <span className="text-gray-400">/</span>
                  <span>{netTotalPages}</span>
                </div>
                <button
                  onClick={() => setNetCurrentPage(p => Math.min(netTotalPages, p + 1))}
                  disabled={netCurrentPage === netTotalPages}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${netCurrentPage === netTotalPages ? 'text-gray-300 bg-gray-100' : 'text-gray-700 bg-white border border-gray-300'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
            </div>

            {/* NET Positions Table */}
            <div className="pt-3">
              <div className="bg-white shadow-[0_0_12px_rgba(75,75,75,0.05)] border border-[#F2F2F7] overflow-hidden">
                {/* Body - Scrollable with sticky header */}
                <div className="overflow-x-auto overflow-y-auto scrollbar-hide" style={{
                  paddingRight: '8px',
                  paddingBottom: '8px',
                  maxHeight: 'calc(100vh - 350px)'
                }}>
                    {/* Header - Sticky inside scroll */}
                    <div className="flex bg-blue-500 text-white text-[10px] font-semibold h-[28px] sticky top-0 z-20">
                      {netVisibleColumns.login && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[70px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('loginCount'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('loginCount'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Login
                          {netSortColumn === 'loginCount' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.symbol && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 sticky left-0 z-30 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('symbol'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('symbol'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Symbol
                          {netSortColumn === 'symbol' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.netType && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[60px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('netType'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('netType'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Type
                          {netSortColumn === 'netType' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.netVolume && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('netVolume'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('netVolume'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          NET Vol
                          {netSortColumn === 'netVolume' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.avgPrice && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('avgPrice'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('avgPrice'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Avg Price
                          {netSortColumn === 'avgPrice' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.totalProfit && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('totalProfit'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('totalProfit'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          P/L
                          {netSortColumn === 'totalProfit' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.totalStorage && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('totalStorage'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('totalStorage'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Storage
                          {netSortColumn === 'totalStorage' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.totalCommission && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('totalCommission'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('totalCommission'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Comm
                          {netSortColumn === 'totalCommission' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.loginCount && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[70px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('loginCount'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('loginCount'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Logins
                          {netSortColumn === 'loginCount' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.totalPositions && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('totalPositions'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('totalPositions'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Positions
                          {netSortColumn === 'totalPositions' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                      {netVisibleColumns.variantCount && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
                          onClick={(e) => { e.stopPropagation(); handleNetSort('variantCount'); }}
                          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleNetSort('variantCount'); }}
                          style={{ userSelect: 'none', touchAction: 'manipulation', pointerEvents: 'auto' }}
                        >
                          Variants
                          {netSortColumn === 'variantCount' && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="ml-1">
                              <path d={netSortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                  {netPaginatedPositions.length === 0 ? (
                    <div className="text-center py-8 text-[#6B7280] text-sm">No NET positions found</div>
                  ) : (
                    netPaginatedPositions.map((pos, idx) => (
                      <React.Fragment key={idx}>
                        <div className="flex text-[10px] text-[#4B4B4B] hover:bg-[#F8FAFC]">
                          {netVisibleColumns.login && (
                            <div className="flex items-center justify-start px-1 h-[40px] min-w-[70px] flex-shrink-0 font-semibold bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">
                              {pos.loginCount > 0 ? `${pos.loginCount} logins` : '-'}
                            </div>
                          )}
                          {netVisibleColumns.symbol && (
                            <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 font-semibold bg-white text-black sticky left-0 z-10 border-b border-[#E1E1E1]" style={{boxShadow: '2px 0 4px rgba(0,0,0,0.05)'}}>
                              <div className="flex flex-col items-center gap-0.5">
                                <span>{pos.symbol}</span>
                                {groupByBaseSymbol && pos.variantCount > 1 && (
                                  <button
                                    onClick={() => {
                                      const newExpanded = new Set(expandedNetSymbols)
                                      if (newExpanded.has(pos.symbol)) {
                                        newExpanded.delete(pos.symbol)
                                      } else {
                                        newExpanded.add(pos.symbol)
                                      }
                                      setExpandedNetSymbols(newExpanded)
                                    }}
                                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                                  >
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d={expandedNetSymbols.has(pos.symbol) ? 'M19 9l-7 7-7-7' : 'M9 5l7 7-7 7'}/></svg>
                                    {pos.variantCount} variant{pos.variantCount > 1 ? 's' : ''}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {netVisibleColumns.netType && <div className={`flex items-center justify-start px-1 h-[40px] min-w-[60px] flex-shrink-0 font-semibold bg-white border-b border-[#E1E1E1] ${pos.netType === 'Buy' ? 'text-red-600' : 'text-green-600'}`}>{pos.netType}</div>}
                          {netVisibleColumns.netVolume && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.netVolume)}</div>}
                          {netVisibleColumns.avgPrice && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.avgPrice)}</div>}
                          {netVisibleColumns.totalProfit && <div className={`flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 font-semibold bg-white border-b border-[#E1E1E1] ${pos.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNum(pos.totalProfit)}</div>}
                          {netVisibleColumns.totalStorage && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.totalStorage || 0)}</div>}
                          {netVisibleColumns.totalCommission && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.totalCommission || 0)}</div>}
                          {netVisibleColumns.loginCount && <div className="flex items-center justify-start px-1 h-[40px] min-w-[70px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{pos.loginCount}</div>}
                          {netVisibleColumns.totalPositions && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{pos.totalPositions}</div>}
                          {netVisibleColumns.variantCount && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{pos.variantCount}</div>}
                        </div>

                        {/* Variant Rows */}
                        {groupByBaseSymbol && expandedNetSymbols.has(pos.symbol) && pos.variants && pos.variants.length > 0 && (
                          pos.variants.map((variant, vIdx) => (
                            <div key={`${idx}-v-${vIdx}`} className="flex text-[10px] text-[#6B7280] bg-[#EEF2FF] border-b border-[#C7D2FE] border-l-4 border-l-indigo-400">
                              {netVisibleColumns.login && <div className="flex items-center justify-start px-1 h-[40px] min-w-[70px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">-</div>}
                              {netVisibleColumns.symbol && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 pl-3 font-medium bg-[#EEF2FF] text-indigo-900 sticky left-0 z-10" style={{boxShadow: '2px 0 4px rgba(0,0,0,0.05)'}}>{variant.exactSymbol}</div>}
                              {netVisibleColumns.netType && <div className={`flex items-center justify-start px-1 h-[40px] min-w-[60px] flex-shrink-0 bg-[#EEF2FF] ${variant.netType === 'Buy' ? 'text-red-600' : 'text-green-600'}`}>{variant.netType}</div>}
                              {netVisibleColumns.netVolume && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">{formatNum(variant.netVolume)}</div>}
                              {netVisibleColumns.avgPrice && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">{formatNum(variant.avgPrice)}</div>}
                              {netVisibleColumns.totalProfit && <div className={`flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-[#EEF2FF] ${variant.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatNum(variant.totalProfit)}</div>}
                              {netVisibleColumns.totalStorage && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">{formatNum(variant.totalStorage || 0)}</div>}
                              {netVisibleColumns.totalCommission && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">{formatNum(variant.totalCommission || 0)}</div>}
                              {netVisibleColumns.loginCount && <div className="flex items-center justify-start px-1 h-[40px] min-w-[70px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">-</div>}
                              {netVisibleColumns.totalPositions && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">-</div>}
                              {netVisibleColumns.variantCount && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-[#EEF2FF] text-[#6B7280]">-</div>}
                            </div>
                          ))
                        )}
                      </React.Fragment>
                    ))
                  )}

                  {/* Footer */}
                  {netPaginatedPositions.length > 0 && (
                    <div className="flex bg-[#EFF4FB] text-[#1A63BC] text-[10px] font-semibold h-[38px]">
                      {netVisibleColumns.symbol && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">Total</div>}
                      {netVisibleColumns.netType && <div className="flex items-center justify-start px-1 min-w-[60px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">-</div>}
                      {netVisibleColumns.netVolume && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(netPositions.reduce((s,p)=>s+p.netVolume,0))}</div>}
                      {netVisibleColumns.avgPrice && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">-</div>}
                      {netVisibleColumns.totalProfit && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(netPositions.reduce((s,p)=>s+p.totalProfit,0))}</div>}
                      {netVisibleColumns.totalStorage && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(netPositions.reduce((s,p)=>s+(p.totalStorage||0),0))}</div>}
                      {netVisibleColumns.totalCommission && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(netPositions.reduce((s,p)=>s+(p.totalCommission||0),0))}</div>}
                      {netVisibleColumns.loginCount && <div className="flex items-center justify-start px-1 min-w-[70px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{netPositions.reduce((s,p)=>s+p.loginCount,0)}</div>}
                      {netVisibleColumns.totalPositions && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{netPositions.reduce((s,p)=>s+p.totalPositions,0)}</div>}
                      {netVisibleColumns.variantCount && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">-</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Client NET View */}
        {showClientNet && (
          <div className="bg-[#F5F7FA] flex flex-col h-full">
            {/* Face Cards Carousel */}
            <div className="pb-2 pl-5">
              <div className="flex gap-[8px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pr-4">
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>NET Rows</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/Total Equity.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: '#000000' }}>{clientNetPositions.length}</span>
                  </div>
                </div>
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>NET Volume</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/Total Balance.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: '#000000' }}>{formatNum(clientNetPositions.reduce((s,p)=>s+p.netVolume,0))}</span>
                  </div>
                </div>
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>NET P/L</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/PNL.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: clientNetPositions.reduce((s,p)=>s+p.totalProfit,0) >= 0 ? '#16A34A' : '#DC2626' }}>
                      {formatNum(clientNetPositions.reduce((s,p)=>s+p.totalProfit,0))}
                    </span>
                  </div>
                </div>
                <div style={{
                  boxSizing: 'border-box',
                  minWidth: '125px',
                  width: '125px',
                  height: '60px',
                  background: '#FFFFFF',
                  border: '1px solid #F2F2F7',
                  boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                  borderRadius: '12px',
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  scrollSnapAlign: 'start',
                  flexShrink: 0,
                  flex: 'none',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'pan-x'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>Logins</span>
                    <div style={{ width: '16px', height: '16px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <img src={`${import.meta.env.BASE_URL || '/'}Mobile cards icons/Total Clients.svg`} alt="" style={{ width: '16px', height: '16px' }} onError={(e) => { e.target.style.display = 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, lineHeight: '14px', letterSpacing: '-0.01em', color: '#000000' }}>{new Set(clientNetPositions.map(r=>r.login)).size}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls with Search */}
            <div className="flex items-center gap-2 pb-3 px-4 pr-8">
                {/* Search Bar */}
                <div className="h-[36px] w-[155px] bg-white border border-gray-300 rounded-lg px-2 flex items-center gap-1 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search"
                    value={clientNetSearchInput}
                    onChange={(e) => setClientNetSearchInput(e.target.value)}
                    className="flex-1 text-[11px] text-gray-700 placeholder-gray-400 outline-none bg-transparent w-full"
                  />
                </div>

                {/* Group Base Symbols */}
                <button
                  onClick={() => setGroupByBaseSymbol(v => !v)}
                  className={`h-[36px] px-2 rounded-lg border text-[10px] font-medium flex items-center gap-1 flex-shrink-0 ${groupByBaseSymbol ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-blue-200'}`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 10h10M10 14h7M13 18h4"/></svg>
                  Base
                </button>

                {/* Columns */}
                <div className="flex-shrink-0">
                  <button onClick={() => setClientNetShowColumnSelector(true)} className="h-[36px] w-[36px] rounded-lg border border-purple-200 bg-white flex items-center justify-center text-gray-700">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>
                  </button>
                </div>

                {/* Pagination */}
                <button
                  onClick={() => setClientNetCurrentPage(p => Math.max(1, p - 1))}
                  disabled={clientNetCurrentPage === 1}
                  className={`w-5 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${clientNetCurrentPage === 1 ? 'text-gray-300 bg-gray-100' : 'text-gray-700 bg-white border border-gray-300'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="text-[10px] font-medium text-gray-700 flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={clientNetTotalPages}
                    value={clientNetCurrentPage}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (!isNaN(n) && n >= 1 && n <= clientNetTotalPages) {
                        setClientNetCurrentPage(n)
                      }
                    }}
                    className="w-10 h-6 border border-gray-300 rounded-lg text-center text-[10px]"
                    aria-label="Current page"
                  />
                  <span className="text-gray-400">/</span>
                  <span>{clientNetTotalPages}</span>
                </div>
                <button
                  onClick={() => setClientNetCurrentPage(p => Math.min(clientNetTotalPages, p + 1))}
                  disabled={clientNetCurrentPage === clientNetTotalPages}
                  className={`w-5 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${clientNetCurrentPage === clientNetTotalPages ? 'text-gray-300 bg-gray-100' : 'text-gray-700 bg-white border border-gray-300'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
            </div>

            {/* Client NET Table */}
            <div className="pt-3">
              <div className="bg-white shadow-[0_0_12px_rgba(75,75,75,0.05)] border border-[#F2F2F7] overflow-hidden">
                {/* Table - single scroll container */}
                <div className="overflow-x-auto overflow-y-auto scrollbar-hide" style={{
                  paddingRight: '8px',
                  paddingBottom: '8px',
                  maxHeight: 'calc(100vh - 350px)'
                }}>
                    {/* Header - Sticky */}
                    <div className="flex bg-blue-500 text-white text-[10px] font-semibold h-[28px] sticky top-0 z-20">
                      {clientNetVisibleColumns.login && (
                        <div 
                          className="flex items-center justify-start px-1 min-w-[70px] flex-shrink-0 bg-blue-500 sticky left-0 z-30 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[60px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                          className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-blue-500 cursor-pointer"
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
                  {clientNetPaginatedPositions.length === 0 ? (
                    <div className="text-center py-8 text-[#6B7280] text-sm">No Client NET positions found</div>
                  ) : (
                    clientNetPaginatedPositions.map((pos, idx) => (
                      <div key={idx} className="flex text-[10px] text-[#4B4B4B] hover:bg-[#F8FAFC]">
                        {clientNetVisibleColumns.login && (
                          <div 
                            className="flex items-center justify-start px-1 h-[40px] min-w-[70px] flex-shrink-0 font-semibold bg-white text-[#1A63BC] cursor-pointer hover:underline sticky left-0 z-10 border-b border-[#E1E1E1]"
                            style={{boxShadow: '2px 0 4px rgba(0,0,0,0.05)'}}
                            onClick={() => {
                              const fullClient = clients.find(c => String(c.login) === String(pos.login))
                              setSelectedClient(fullClient || { login: pos.login, email: pos.email || '', name: '' })
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault()
                              const fullClient = clients.find(c => String(c.login) === String(pos.login))
                              setSelectedClient(fullClient || { login: pos.login, email: pos.email || '', name: '' })
                            }}
                          >
                            {pos.login}
                          </div>
                        )}
                        {clientNetVisibleColumns.symbol && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 font-semibold bg-white text-black border-b border-[#E1E1E1]">{pos.symbol}</div>}
                        {clientNetVisibleColumns.netType && <div className={`flex items-center justify-start px-1 h-[40px] min-w-[60px] flex-shrink-0 font-semibold bg-white border-b border-[#E1E1E1] ${
                          pos.netType === 'Buy' ? 'text-green-600' : 'text-red-600'
                        }`}>{pos.netType}</div>}
                        {clientNetVisibleColumns.netVolume && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.netVolume)}</div>}
                        {clientNetVisibleColumns.avgPrice && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.avgPrice)}</div>}
                        {clientNetVisibleColumns.totalProfit && <div className={`flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 font-semibold bg-white border-b border-[#E1E1E1] ${
                          pos.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>{formatNum(pos.totalProfit)}</div>}
                        {clientNetVisibleColumns.totalStorage && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.totalStorage || 0)}</div>}
                        {clientNetVisibleColumns.totalCommission && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{formatNum(pos.totalCommission || 0)}</div>}
                        {clientNetVisibleColumns.totalPositions && <div className="flex items-center justify-start px-1 h-[40px] min-w-[80px] flex-shrink-0 bg-white text-[#4B4B4B] border-b border-[#E1E1E1]">{pos.totalPositions}</div>}
                      </div>
                    ))
                  )}

                  {/* Footer */}
                  {clientNetPaginatedPositions.length > 0 && (
                    <div className="flex bg-[#EFF4FB] text-[#1A63BC] text-[10px] font-semibold h-[38px]">
                      {clientNetVisibleColumns.login && <div className="flex items-center justify-start px-1 min-w-[70px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">Total</div>}
                      {clientNetVisibleColumns.symbol && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">-</div>}
                      {clientNetVisibleColumns.netType && <div className="flex items-center justify-start px-1 min-w-[60px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">-</div>}
                      {clientNetVisibleColumns.netVolume && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(clientNetPositions.reduce((s,p)=>s+p.netVolume,0))}</div>}
                      {clientNetVisibleColumns.avgPrice && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">-</div>}
                      {clientNetVisibleColumns.totalProfit && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(clientNetPositions.reduce((s,p)=>s+p.totalProfit,0))}</div>}
                      {clientNetVisibleColumns.totalStorage && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(clientNetPositions.reduce((s,p)=>s+(p.totalStorage||0),0))}</div>}
                      {clientNetVisibleColumns.totalCommission && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{formatNum(clientNetPositions.reduce((s,p)=>s+(p.totalCommission||0),0))}</div>}
                      {clientNetVisibleColumns.totalPositions && <div className="flex items-center justify-start px-1 min-w-[80px] flex-shrink-0 bg-[#EFF4FB] border-t-2 border-[#1A63BC]">{clientNetPositions.reduce((s,p)=>s+p.totalPositions,0)}</div>}
                    </div>
                  )}
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
        onIBFilterClick={() => {
          setIsCustomizeOpen(false)
          setIsIBFilterOpen(true)
        }}
        onGroupsClick={() => {
          setIsCustomizeOpen(false)
          setIsLoginGroupsOpen(true)
        }}
        onReset={() => {
          setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
          setDateFilter(null)
          clearIBSelection()
          setActiveGroupFilter('positions', null)
          setHasPendingIBChanges(false)
          setHasPendingGroupChanges(false)
          setHasPendingDateChanges(false)
          setPendingIBDraft(null)
          setPendingGroupDraft(null)
          setPendingDateDraft(null)
        }}
        onApply={() => {
          if (hasPendingIBChanges) {
            if (pendingIBDraft) { selectIB(pendingIBDraft) } else { clearIBSelection() }
          }
          if (hasPendingGroupChanges) {
            setActiveGroupFilter('positions', pendingGroupDraft ? pendingGroupDraft.name : null)
          }
          if (hasPendingDateChanges) {
            setDateFilter(pendingDateDraft)
          }
          setIsCustomizeOpen(false)
          setHasPendingIBChanges(false)
          setHasPendingGroupChanges(false)
          setHasPendingDateChanges(false)
          setPendingIBDraft(null)
          setPendingGroupDraft(null)
          setPendingDateDraft(null)
        }}
        hasPendingChanges={hasPendingIBChanges || hasPendingGroupChanges || hasPendingDateChanges}
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

      {/* IB Filter Modal */}
      <IBFilterModal
        isOpen={isIBFilterOpen}
        onClose={() => setIsIBFilterOpen(false)}
        onSelectIB={(ib) => {
          if (ib) {
            selectIB(ib)
          } else {
            clearIBSelection()
          }
          setIsIBFilterOpen(false)
        }}
        currentSelectedIB={selectedIB}
        onPendingChange={(hasPending, draft) => {
          setHasPendingIBChanges(hasPending)
          setPendingIBDraft(draft || null)
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

      {/* NET Position Column Selector Modal */}
      {netShowColumnSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setNetShowColumnSelector(false)}>
          <div 
            className="bg-white w-full rounded-t-[24px] max-h-[75vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-[#000000]">Show/Hide Columns</h3>
              <button onClick={() => setNetShowColumnSelector(false)}>
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
                  { key: 'loginCount', label: 'Login Count' },
                  { key: 'totalPositions', label: 'Total Positions' },
                  { key: 'variantCount', label: 'Variant Count' }
                ].map(({ key, label }) => (
                  <label 
                    key={key} 
                    className="flex items-center justify-between py-3 border-b border-[#F2F2F7] last:border-0"
                  >
                    <span className="text-sm text-[#000000] font-outfit">{label}</span>
                    <div className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        checked={netVisibleColumns[key]}
                        onChange={() => setNetVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))}
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
  )
}

