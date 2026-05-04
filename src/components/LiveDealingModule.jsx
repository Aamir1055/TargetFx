import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import TimeFilterModal from './TimeFilterModal'
import DealsFilterModal from './DealsFilterModal'
import ClientDetailsMobileModal from './ClientDetailsMobileModal'
import { useGroups } from '../contexts/GroupContext'
import websocketService from '../services/websocket'
import { brokerAPI } from '../services/api'
import { applyCumulativeFilters } from '../utils/mobileFilters'

const formatNum = (n, decimals = 2) => {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0.00'
  return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const formatCompactIndian = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return '0.00'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return sign + (abs / 1e7).toFixed(2) + 'Cr'
  if (abs >= 1e5) return sign + (abs / 1e5).toFixed(2) + 'L'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(2) + 'K'
  return sign + abs.toFixed(2)
}

const formatTime = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

export default function LiveDealingModule() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { positions: cachedPositions, clients, orders } = useData()
  const { groups, deleteGroup, getActiveGroupFilter, setActiveGroupFilter, filterByActiveGroup, activeGroupFilters } = useGroups()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [numericMode, setNumericMode] = useState(() => { try { const s = localStorage.getItem('globalDisplayMode'); return s === 'full' ? 'full' : 'compact' } catch { return 'compact' } })
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false)
  const [isDealsFilterOpen, setIsDealsFilterOpen] = useState(false)
  const [isGroupOpen, setIsGroupOpen] = useState(false)
  const [isLoginGroupsOpen, setIsLoginGroupsOpen] = useState(false)
  const [isLoginGroupModalOpen, setIsLoginGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [filters, setFilters] = useState({ hasFloating: false, hasCredit: false, noDeposit: false })
  const carouselRef = useRef(null)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [isMobileView, setIsMobileView] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  
  // Deals state
  const [deals, setDeals] = useState([])
  const [newDealIds, setNewDealIds] = useState(new Set()) // Track new deals for blinking
  const [connectionState, setConnectionState] = useState('disconnected')
  const [timeFilter, setTimeFilter] = useState('24h') // '24h', '7d', 'custom'
  const [moduleFilter, setModuleFilter] = useState('both') // 'deal', 'money', 'both'
  const [customFromDate, setCustomFromDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [customToDate, setCustomToDate] = useState('')
  const [appliedFromDate, setAppliedFromDate] = useState('')
  const [appliedToDate, setAppliedToDate] = useState('')
  const [displayMode, setDisplayMode] = useState('value') // 'value' or 'percentage'

  // Pending change tracking for Customize View Apply
  const [hasPendingGroupChanges, setHasPendingGroupChanges] = useState(false)
  const [pendingGroupDraft, setPendingGroupDraft] = useState(null)
  const [hasPendingTimeChanges, setHasPendingTimeChanges] = useState(false)
  const [pendingTimeDraft, setPendingTimeDraft] = useState(null)
  const [hasPendingDealsChanges, setHasPendingDealsChanges] = useState(false)
  const [pendingDealsDraft, setPendingDealsDraft] = useState(null)
  
  const [visibleColumns, setVisibleColumns] = useState({
    time: true,
    login: true,
    symbol: true,
    netType: true,
    netVolume: true,
    averagePrice: true,
    totalProfit: false,
    commission: false,
    storage: false,
    appliedPercentage: false,
    action: false,
    deal: false,
    entry: false
  })

  // Clear all filters on component mount (when navigating to this module)
  useEffect(() => {
    setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
    setActiveGroupFilter('livedealing', null)
    setSearchInput('')
    setTimeFilter('24h')
    setModuleFilter('both')
    setCustomFromDate('')
    setCustomToDate('')
    setAppliedFromDate('')
    setAppliedToDate('')
  }, [])

  // Sync numericMode with global display mode events
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

  const fmtMoney = (v) => {
    const n = Number(v)
    if (!isFinite(n)) return '0.00'
    if (numericMode === 'compact') return formatCompactIndian(n)
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Listen for global request to open Customize View from child modals
  useEffect(() => {
    const handler = () => {
      setIsFilterOpen(false)
      setIsTimeFilterOpen(false)
      setIsDealsFilterOpen(false)
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

  // Format request text from deal data
  const formatRequestFromDeal = (deal) => {
    const action = deal.action || '-'
    const symbol = deal.symbol || '-'
    const volume = formatNum(deal.volume || 0, 2)
    const price = formatNum(deal.price || 0, 2)
    return `${action} ${volume} ${symbol} at ${price}`
  }

  // Load and save deals cache
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

  // Fetch deals from API (24h by default)
  const fetchDeals = async () => {
    try {
      setLoading(true)
      let from, to
      
      if (timeFilter === '24h') {
        const nowUTC = Math.floor(Date.now() / 1000)
        to = nowUTC + (12 * 60 * 60) // Add 12 hours buffer
        from = nowUTC - (24 * 60 * 60) // 24 hours ago
      } else if (timeFilter === '7d') {
        const nowUTC = Math.floor(Date.now() / 1000)
        to = nowUTC + (12 * 60 * 60)
        from = nowUTC - (7 * 24 * 60 * 60) // 7 days ago
      } else if (timeFilter === 'custom' && appliedFromDate && appliedToDate) {
        // Parse custom dates and convert to UTC epoch seconds
        const fromDate = new Date(appliedFromDate)
        const toDate = new Date(appliedToDate)
        
        from = Math.floor(fromDate.getTime() / 1000)
        // Add 12 hours to custom 'to' date to capture full day
        to = Math.floor(toDate.getTime() / 1000) + (12 * 60 * 60)
      } else {
        // Default to 24h if custom dates not set
        const nowUTC = Math.floor(Date.now() / 1000)
        to = nowUTC + (12 * 60 * 60)
        from = nowUTC - (24 * 60 * 60)
      }
      
      console.log('[LiveDealingModule] 📅 Fetching deals with time range:', {
        filter: timeFilter,
        from,
        to,
        fromDate: new Date(from * 1000).toISOString(),
        toDate: new Date(to * 1000).toISOString()
      })
      
      const response = await brokerAPI.getAllDeals(from, to, 10000)
      const dealsData = response.data?.deals || response.deals || []
      
      // Transform deals
      const transformedDeals = dealsData.map(deal => ({
        id: deal.deal || deal.id,
        timestamp: deal.time || deal.timestamp,
        login: deal.login,
        rawData: deal
      }))
      
      // Sort newest first
      transformedDeals.sort((a, b) => b.timestamp - a.timestamp)
      
      // Merge with WebSocket cache
      const wsCached = loadWsCache()
      const apiDealIds = new Set(transformedDeals.map(d => d.id))
      const relevantCachedDeals = wsCached.filter(d => {
        if (!d || !d.id) return false
        if (apiDealIds.has(d.id)) return false
        const dealTime = d.timestamp || 0
        return dealTime >= from && dealTime <= to
      })
      
      const merged = [...relevantCachedDeals, ...transformedDeals]
      saveWsCache(relevantCachedDeals.slice(0, 200))
      setDeals(merged)
      setLoading(false)
    } catch (error) {
      console.error('[LiveDealingModule] Error fetching deals:', error)
      setLoading(false)
    }
  }

  // Initial fetch and refetch when time filter changes
  useEffect(() => {
    fetchDeals()
  }, [timeFilter, appliedFromDate, appliedToDate])

  // WebSocket subscription
  useEffect(() => {
    // Subscribe to WebSocket updates
    const handleDealAdded = (data) => {
      const dealData = data.data || data
      const dealEntry = {
        id: dealData.deal || dealData.id || Date.now() + Math.random(),
        timestamp: dealData.time || dealData.timestamp || Math.floor(Date.now() / 1000),
        login: dealData.login,
        rawData: dealData // Preserve all fields: symbol, action, volume, price, profit, commission, etc.
      }

      setDeals(prevDeals => {
        if (prevDeals.some(d => d.id === dealEntry.id)) return prevDeals
        
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
        
        const updated = [dealEntry, ...prevDeals].slice(0, 1000)
        saveWsCache(updated.slice(0, 200))
        return updated
      })
    }

    // Handle deal updates
    const handleDealUpdated = (data) => {
      const dealData = data.data || data
      const dealId = dealData.deal || dealData.id
      
      if (!dealId) return

      setDeals(prevDeals => {
        const index = prevDeals.findIndex(d => d.id === dealId)
        if (index === -1) return prevDeals

        const updatedDeals = [...prevDeals]
        updatedDeals[index] = {
          ...updatedDeals[index],
          timestamp: dealData.time || updatedDeals[index].timestamp,
          login: dealData.login || updatedDeals[index].login,
          rawData: { ...updatedDeals[index].rawData, ...dealData }
        }
        return updatedDeals
      })
    }

    // Handle deal deletions
    const handleDealDeleted = (data) => {
      const dealData = data.data || data
      const dealId = dealData.deal || dealData.id
      
      if (!dealId) return

      setDeals(prevDeals => prevDeals.filter(d => d.id !== dealId))
    }

    // Subscribe to all deal event types matching desktop implementation
    const unsubscribeDealAdded = websocketService.subscribe('DEAL_ADDED', handleDealAdded)
    const unsubscribeDealCreated = websocketService.subscribe('DEAL_CREATED', handleDealAdded)
    const unsubscribeNewDeal = websocketService.subscribe('NEW_DEAL', handleDealAdded)
    const unsubscribeDeal = websocketService.subscribe('deal', handleDealAdded)
    const unsubscribeLegacyDealAdded = websocketService.subscribe('deal_added', handleDealAdded)
    
    const unsubscribeDealUpdated = websocketService.subscribe('DEAL_UPDATED', handleDealUpdated)
    const unsubscribeDealUpdate = websocketService.subscribe('DEAL_UPDATE', handleDealUpdated)
    
    const unsubscribeDealDeleted = websocketService.subscribe('DEAL_DELETED', handleDealDeleted)
    const unsubscribeDealDelete = websocketService.subscribe('DEAL_DELETE', handleDealDeleted)

    // Get connection state
    const service = websocketService
    if (service.socket?.readyState === WebSocket.OPEN) {
      setConnectionState('connected')
    }

    const handleConnectionState = (event) => {
      setConnectionState(event.detail)
    }
    const unsubscribeConnectionState = websocketService.subscribe('connectionState', handleConnectionState)

    return () => {
      unsubscribeDealAdded()
      unsubscribeDealCreated()
      unsubscribeNewDeal()
      unsubscribeDeal()
      unsubscribeLegacyDealAdded()
      unsubscribeDealUpdated()
      unsubscribeDealUpdate()
      unsubscribeDealDeleted()
      unsubscribeDealDelete()
      unsubscribeConnectionState()
    }
  }, [])

  // Filter deals by time - API already filters, this is just for any WebSocket additions
  const filteredByTime = useMemo(() => {
    // Since we fetch from API with the correct time range, just return all deals
    // WebSocket additions are already filtered to relevant time in the handler
    return deals
  }, [deals])

  // Apply search filter
  const searchedDeals = useMemo(() => {
    if (!searchInput.trim()) return filteredByTime
    const query = searchInput.toLowerCase().trim()
    return filteredByTime.filter(deal => {
      const login = String(deal.login || '').toLowerCase()
      const symbol = String(deal.rawData?.symbol || '').toLowerCase()
      const dealId = String(deal.id || deal.rawData?.deal || '').toLowerCase()
      const action = String(deal.rawData?.action || '').toLowerCase()
      const entry = String(deal.rawData?.entry || '').toLowerCase()
      const netType = String(deal.rawData?.net_type || '').toLowerCase()
      const volume = String(deal.rawData?.volume || deal.rawData?.net_volume || '').toLowerCase()
      const price = String(deal.rawData?.price || deal.rawData?.average_price || '').toLowerCase()
      const profit = String(deal.rawData?.profit || deal.rawData?.total_profit || '').toLowerCase()
      const commission = String(deal.rawData?.commission || '').toLowerCase()
      const storage = String(deal.rawData?.storage || '').toLowerCase()
      
      return login.includes(query) || symbol.includes(query) || dealId.includes(query) ||
             action.includes(query) || entry.includes(query) || netType.includes(query) ||
             volume.includes(query) || price.includes(query) || profit.includes(query) ||
             commission.includes(query) || storage.includes(query)
    })
  }, [filteredByTime, searchInput])

  // Filter by module type (deals/money/both)
  const isTradeAction = (action) => {
    const label = String(action || '').toLowerCase()
    return (
      label === 'buy' ||
      label === 'sell' ||
      label.includes('cancel') ||
      label.includes('stop out') ||
      label.includes('tp close') ||
      label.includes('sl close')
    )
  }

  const moduleFilteredDeals = useMemo(() => {
    if (moduleFilter === 'both') return searchedDeals
    return searchedDeals.filter(deal => {
      const action = deal.rawData?.action
      if (moduleFilter === 'deal' && isTradeAction(action)) return true
      if (moduleFilter === 'money' && !isTradeAction(action)) return true
      return false
    })
  }, [searchedDeals, moduleFilter])

  // Apply cumulative filters: Customize View -> IB -> Group
  const ibFilteredDeals = useMemo(() => {
    return applyCumulativeFilters(moduleFilteredDeals, {
      customizeFilters: filters,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'livedealing'
    })
  }, [moduleFilteredDeals, filters, filterByActiveGroup, activeGroupFilters])

  // Sort the filtered deals
  const sortedDeals = useMemo(() => {
    if (!sortColumn) return ibFilteredDeals
    
    return [...ibFilteredDeals].sort((a, b) => {
      let aVal, bVal

      switch (sortColumn) {
        case 'time':
          aVal = a.timestamp || 0
          bVal = b.timestamp || 0
          break
        case 'login':
          aVal = a.login || ''
          bVal = b.login || ''
          break
        case 'netType':
          aVal = a.rawData?.action || ''
          bVal = b.rawData?.action || ''
          break
        case 'netVolume':
          aVal = a.rawData?.volume || 0
          bVal = b.rawData?.volume || 0
          break
        case 'averagePrice':
          aVal = a.rawData?.price || 0
          bVal = b.rawData?.price || 0
          break
        case 'totalProfit':
          aVal = a.rawData?.profit || 0
          bVal = b.rawData?.profit || 0
          break
        case 'commission':
          aVal = a.rawData?.commission || 0
          bVal = b.rawData?.commission || 0
          break
        case 'storage':
          aVal = a.rawData?.storage || 0
          bVal = b.rawData?.storage || 0
          break
        case 'symbol':
          aVal = a.rawData?.symbol || ''
          bVal = b.rawData?.symbol || ''
          break
        default:
          aVal = a.rawData?.[sortColumn] || 0
          bVal = b.rawData?.[sortColumn] || 0
      }
      
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }
      
      return sortDirection === 'asc' 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [ibFilteredDeals, sortColumn, sortDirection])

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalDeals = sortedDeals.length
    const uniqueLogins = new Set(sortedDeals.map(d => d.login)).size
    const uniqueSymbols = new Set(sortedDeals.map(d => d.rawData?.symbol)).size
    
    return {
      totalDeals,
      uniqueLogins,
      uniqueSymbols,
    }
  }, [sortedDeals])

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  // Map card labels to icon file paths
  const getCardIcon = (label) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    if (label.includes('DEALS')) return `${baseUrl}mobile-icons/P&L.svg`
    const iconMap = {
      'UNIQUE LOGINS': `${baseUrl}mobile-icons/Unique Logins.svg`,
      'SYMBOLS': `${baseUrl}mobile-icons/Equity.svg`
    }
    return iconMap[label] || `${baseUrl}mobile-icons/Clients.svg`
  }

  // Face cards data - use useMemo to avoid infinite loop
  const cards = useMemo(() => {
    const timeLabel = timeFilter === '24h' ? 'DEALS (24H)' : timeFilter === '7d' ? 'DEALS (7D)' : 'DEALS (CUSTOM)'
    return [
      { label: timeLabel, value: String(summaryStats.totalDeals) },
      { label: 'UNIQUE LOGINS', value: String(summaryStats.uniqueLogins) },
      { label: 'SYMBOLS', value: String(summaryStats.uniqueSymbols) }
    ]
  }, [summaryStats, timeFilter])

  // Get visible columns
  const allColumns = [
    { key: 'login', label: 'Login', width: '80px', sticky: true },
    { key: 'symbol', label: 'Symbol', width: '90px' },
    { key: 'time', label: 'Time', width: '155px' },
    { key: 'netType', label: 'Net Type', width: '80px' },
    { key: 'netVolume', label: displayMode === 'percentage' ? 'Net Volume (%)' : displayMode === 'both' ? 'Net Volume (Both)' : 'Net Volume', width: '100px' },
    { key: 'averagePrice', label: 'Average Price', width: '110px' },
    { key: 'totalProfit', label: displayMode === 'percentage' ? 'Total Profit (%)' : displayMode === 'both' ? 'Total Profit (Both)' : 'Total Profit', width: '100px' },
    { key: 'commission', label: displayMode === 'percentage' ? 'Commission (%)' : displayMode === 'both' ? 'Commission (Both)' : 'Commission', width: '100px' },
    { key: 'storage', label: displayMode === 'percentage' ? 'Storage (%)' : displayMode === 'both' ? 'Storage (Both)' : 'Storage', width: '90px' },
    { key: 'appliedPercentage', label: 'Applied %', width: '90px' },
    { key: 'action', label: 'Action', width: '80px' },
    { key: 'deal', label: 'Deal', width: '80px' },
    { key: 'entry', label: 'Entry', width: '80px' }
  ]

  const activeColumns = allColumns.filter(col => visibleColumns[col.key])
  const gridTemplateColumns = activeColumns.map(col => col.width).join(' ')

  // Export to CSV
  const handleExportToCSV = () => {
    try {
      const dataToExport = sortedDeals
      if (!dataToExport || dataToExport.length === 0) {
        alert('No data to export')
        return
      }

      const exportColumns = activeColumns
      const headers = exportColumns.map(col => col.label).join(',')
      
      const rows = dataToExport.map(deal => {
        return exportColumns.map(col => {
          let value = ''
          
          switch(col.key) {
            case 'time':
              value = deal.rawData?.time ? new Date(deal.rawData.time * 1000).toLocaleString() : '-'
              break
            case 'login':
              value = deal.login || '-'
              break
            case 'netType':
              value = deal.rawData?.action || '-'
              break
            case 'netVolume':
              value = displayMode === 'percentage' 
                ? (deal.rawData?.volume_percentage || 0)
                : (deal.rawData?.volume || 0)
              break
            case 'averagePrice':
              value = deal.rawData?.price || 0
              break
            case 'totalProfit':
              value = displayMode === 'percentage'
                ? (deal.rawData?.profit_percentage || 0)
                : (deal.rawData?.profit || 0)
              break
            case 'commission':
              value = displayMode === 'percentage'
                ? (deal.rawData?.commission_percentage || 0)
                : (deal.rawData?.commission || 0)
              break
            case 'storage':
              value = displayMode === 'percentage'
                ? (deal.rawData?.storage_percentage || 0)
                : (deal.rawData?.storage || 0)
              break
            case 'appliedPercentage':
              value = (deal.rawData?.appliedPercentage || 0) + '%'
              break
            case 'symbol':
              value = deal.rawData?.symbol || '-'
              break
            case 'action':
              value = deal.rawData?.action || '-'
              break
            case 'deal':
              value = deal.rawData?.deal || deal.id || '-'
              break
            case 'entry':
              value = deal.rawData?.entry || '-'
              break
            default:
              value = deal.rawData?.[col.key] || '-'
          }
          
          if (typeof value === 'string') {
            value = value.replace(/"/g, '""')
            if (value.includes(',') || value.includes('"')) {
              value = `"${value}"`
            }
          }
          
          return value
        }).join(',')
      }).join('\n')
      
      const csvContent = headers + '\n' + rows
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `live_dealing_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[LiveDealingModule] Export failed:', error)
      alert('Export failed. Please try again.')
    }
  }

  const renderCellValue = (deal, key, isSticky = false) => {
    let value = '-'
    
    switch (key) {
      case 'time':
        value = formatTime(deal.timestamp)
        break
      case 'login':
        value = deal.login || '-'
        return (
          <div 
            className={`h-[28px] flex items-center justify-start px-2 cursor-pointer hover:underline text-blue-600 font-semibold ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
            style={{
              border: 'none', 
              outline: 'none', 
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
            onClick={() => {
              const fullClient = clients.find(c => String(c.login) === String(deal.login))
              setSelectedClient(fullClient || { login: deal.login, email: deal.email || '', name: '' })
            }}
          >
            <span className="truncate">{value}</span>
          </div>
        )
      case 'netType':
        const action = deal.rawData?.action || '-'
        const actionLower = action.toLowerCase()
        return (
          <div 
            className={`h-[28px] flex items-center justify-start px-1 ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
            style={{
              border: 'none', 
              outline: 'none', 
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
              actionLower === 'buy' ? 'text-green-600' : 
              actionLower === 'sell' ? 'text-red-600' : 
              actionLower === 'balance' ? 'text-blue-600' :
              actionLower === 'commission' ? 'text-yellow-600' :
              'text-gray-700'
            }`}>
              {action.toUpperCase()}
            </span>
          </div>
        )
      case 'netVolume':
        if (displayMode === 'both') {
          const volValue = fmtMoney(deal.rawData?.volume || 0)
          const volPercent = deal.rawData?.volume_percentage != null ? formatNum(deal.rawData.volume_percentage, 2) : '0.00'
          value = `${volValue} (${volPercent}%)`
        } else if (displayMode === 'percentage') {
          value = deal.rawData?.volume_percentage != null ? formatNum(deal.rawData.volume_percentage, 2) : '0.00'
        } else {
          value = fmtMoney(deal.rawData?.volume || 0)
        }
        break
      case 'averagePrice':
        value = formatNum(deal.rawData?.price || 0, 2)
        break
      case 'totalProfit':
        const profit = deal.rawData?.profit || 0
        let profitValue
        if (displayMode === 'both') {
          const profVal = fmtMoney(profit)
          const profPercent = deal.rawData?.profit_percentage != null ? formatNum(deal.rawData.profit_percentage, 2) : '0.00'
          profitValue = `${profVal} (${profPercent}%)`
        } else if (displayMode === 'percentage') {
          profitValue = deal.rawData?.profit_percentage != null ? formatNum(deal.rawData.profit_percentage, 2) : '0.00'
        } else {
          profitValue = fmtMoney(profit)
        }
        return (
          <div 
            className={`h-[28px] flex items-center justify-start px-1 ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
            style={{
              border: 'none', 
              outline: 'none', 
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            <span className={profit >= 0 ? 'text-green-600' : 'text-red-600'}>
              {profitValue}
            </span>
          </div>
        )
      case 'commission':
        if (displayMode === 'both') {
          const commValue = fmtMoney(deal.rawData?.commission || 0)
          const commPercent = deal.rawData?.commission_percentage != null ? formatNum(deal.rawData.commission_percentage, 2) : '0.00'
          value = `${commValue} (${commPercent}%)`
        } else if (displayMode === 'percentage') {
          value = deal.rawData?.commission_percentage != null ? formatNum(deal.rawData.commission_percentage, 2) : '0.00'
        } else {
          value = fmtMoney(deal.rawData?.commission || 0)
        }
        break
      case 'storage':
        if (displayMode === 'both') {
          const storValue = fmtMoney(deal.rawData?.storage || 0)
          const storPercent = deal.rawData?.storage_percentage != null ? formatNum(deal.rawData.storage_percentage, 2) : '0.00'
          value = `${storValue} (${storPercent}%)`
        } else if (displayMode === 'percentage') {
          value = deal.rawData?.storage_percentage != null ? formatNum(deal.rawData.storage_percentage, 2) : '0.00'
        } else {
          value = fmtMoney(deal.rawData?.storage || 0)
        }
        break
      case 'appliedPercentage':
        value = formatNum(deal.rawData?.appliedPercentage || 0, 2) + '%'
        break
      case 'symbol':
        value = deal.rawData?.symbol || '-'
        break
      case 'action':
        value = deal.rawData?.action || '-'
        break
      case 'deal':
        value = deal.rawData?.deal || deal.id || '-'
        break
      case 'entry':
        value = deal.rawData?.entry || '-'
        break
      default:
        value = deal.rawData?.[key] || '-'
    }

    return (
      <div 
        className={`h-[28px] flex items-center justify-start px-1 ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
        style={{
          border: 'none', 
          outline: 'none', 
          boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
        }}
      >
        <span className="truncate">{value}</span>
      </div>
    )
  }

  const filteredColumnOptions = allColumns.filter(col =>
    col.label.toLowerCase().includes(columnSearch.toLowerCase())
  )

  return (
    <div className="h-screen flex flex-col bg-[#F8F8F8] overflow-x-hidden overflow-y-hidden max-w-full" style={{ height: '100dvh', width: '100vw', maxWidth: '100vw', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="flex items-center px-4 py-4 bg-white border-b border-[#ECECEC] relative">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-[#000000] absolute left-1/2 transform -translate-x-1/2">Live Dealing</h1>
        {!isMobileView && (
          <button 
            onClick={() => navigate('/profile')}
            className="w-12 h-12 rounded-full bg-[#1A63BC] flex items-center justify-center text-white font-semibold text-sm ml-auto"
          >
            U
          </button>
        )}
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
              {/* Compact / Full display mode toggle */}
              <div className="px-3 pb-3 pt-1">
                <p className="text-[9px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5 px-1">Display Mode</p>
                <div className="flex items-center bg-[#F3F4F6] p-0.5 w-full rounded">
                  <button type="button" onClick={() => { setNumericMode('compact'); try { localStorage.setItem('globalDisplayMode','compact') } catch {} try { window.dispatchEvent(new CustomEvent('globalDisplayModeChanged',{detail:'compact'})) } catch {} }} className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${numericMode==='compact'?'bg-[#3B5BDB] text-white shadow-sm':'text-[#374151] hover:bg-white/70'}`}>Compact</button>
                  <button type="button" onClick={() => { setNumericMode('full'); try { localStorage.setItem('globalDisplayMode','full') } catch {} try { window.dispatchEvent(new CustomEvent('globalDisplayModeChanged',{detail:'full'})) } catch {} }} className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${numericMode==='full'?'bg-[#3B5BDB] text-white shadow-sm':'text-[#374151] hover:bg-white/70'}`}>Full</button>
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
                  {label:'Positions', path:'/positions', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="3" rx="1" stroke="#404040"/><rect x="3" y="11" width="18" height="3" rx="1" stroke="#404040"/><rect x="3" y="16" width="18" height="3" rx="1" stroke="#404040"/></svg>
                  )},
                  {label:'Pending Orders', path:'/pending-orders', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#404040"/><circle cx="12" cy="12" r="2" fill="#404040"/></svg>
                  )},
                  {label:'Margin Level', path:'/margin-level', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 18L10 12L14 16L20 8" stroke="#404040" strokeWidth="2"/></svg>
                  )},
                  {label:'Live Dealing', path:'/live-dealing', active:true, icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 18 0" stroke="#1A63BC"/><path d="M7 12a5 5 0 0 1 10 0" stroke="#1A63BC"/></svg>
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
                    className={`flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      item.active 
                        ? 'bg-[#EFF6FF] border-l-4 border-[#1A63BC]' 
                        : 'hover:bg-[#F8F8F8]'
                    }`}
                  >
                    <div className="flex-shrink-0"><img src={`${import.meta.env.BASE_URL||'/'}sidebar-icons/${{'/dashboard':'Dashboard','/client2':'Clients','/positions':'Positions','/pending-orders':'Pending-Orders','/margin-level':'Margin-Level','/live-dealing':'Live-Dealing','/client-percentage':'Client-Percentage','/settings':'Settings'}[item.path]}.svg`} alt={item.label} style={{filter:'brightness(0)'}} className="w-5 h-5"/></div>
                    <span className={`text-sm ${
                      item.active ? 'text-[#1A63BC] font-semibold' : 'text-[#404040]'
                    }`}>
                      {item.label}
                    </span>
                  </button>
                ))}              </nav>
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ maxWidth: '100vw' }}>
        {/* Action Buttons + View All */}
        <div className="pt-3 pb-2">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex gap-[8px]">
              <button 
                onClick={() => setIsCustomizeOpen(true)} 
                className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative ${
                  (timeFilter !== '24h' || moduleFilter !== 'both' || getActiveGroupFilter('livedealing'))
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
                    timeFilter !== '24h',
                    moduleFilter !== 'both',
                    getActiveGroupFilter('livedealing')
                  ].filter(Boolean).length;
                  return filterCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {filterCount}
                    </span>
                  ) : null;
                })()}
              </button>
              <button 
                onClick={() => setDisplayMode(prev => prev === 'percentage' ? 'value' : 'percentage')}
                className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all ${
                  displayMode === 'percentage' ? 'bg-blue-50 border-blue-200' : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
                }`}
              >
                <span className="text-[#4B4B4B] text-[12px] font-medium font-outfit">%</span>
              </button>
              <button 
                onClick={handleExportToCSV}
                className="h-8 w-8 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                title="Export deals to CSV"
              >
                <svg className="w-4 h-4 text-[#374151]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16"/>
                </svg>
              </button>
              <button
                onClick={() => window.location.reload()}
                disabled={loading}
                className="w-8 h-8 rounded-lg border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="#4B4B4B"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Face Cards Carousel - removed on mobile per request */}

        {/* Search and Controls Bar - Separate from table */}
        <div className="mx-1 sm:mx-4 mb-1 px-3 py-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Search box */}
              <div className="flex-1 min-w-0 h-7 sm:h-10 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md px-2 sm:px-3 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-[#9CA3AF]">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input 
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search"
                  className="flex-1 min-w-0 text-[11px] sm:text-sm text-[#1F2937] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit focus:ring-0"
                />
              </div>
              
              {/* Column selector button */}
              <button 
                onClick={() => setIsColumnSelectorOpen(true)}
                className="h-7 w-7 sm:h-10 sm:w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                title="Show/Hide Columns">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                  <rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                </svg>
              </button>

              {/* Previous button */}
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`h-7 w-7 sm:h-10 sm:w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center transition-colors flex-shrink-0 ${
                  currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M12 14L8 10L12 6" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Page indicator */}
              <div className="flex items-center gap-0.5 text-[11px] sm:text-sm text-[#4B5563]">
                <input
                  type="number"
                  min="1"
                  max={Math.ceil(sortedDeals.length / itemsPerPage)}
                  value={currentPage}
                  onChange={(e) => {
                    const page = Number(e.target.value);
                    if (!isNaN(page) && page >= 1 && page <= Math.ceil(sortedDeals.length / itemsPerPage)) {
                      setCurrentPage(page);
                    }
                  }}
                  className="w-8 sm:w-12 h-6 sm:h-8 border border-[#E5E7EB] rounded-md text-center text-[11px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Current page"
                />
                <span className="text-[#9CA3AF]">/</span>
                <span>{Math.ceil(sortedDeals.length / itemsPerPage)}</span>
              </div>

              {/* Next button */}
              <button 
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(sortedDeals.length / itemsPerPage), prev + 1))}
                disabled={currentPage >= Math.ceil(sortedDeals.length / itemsPerPage)}
                className={`h-7 w-7 sm:h-10 sm:w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center transition-colors flex-shrink-0 ${
                  currentPage >= Math.ceil(sortedDeals.length / itemsPerPage) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M8 6L12 10L8 14" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
        </div>

        {/* Table Container - Separate from search */}
        <div className="bg-white shadow-sm border border-blue-100 overflow-hidden mx-1 sm:mx-4">

            {/* Table Data */}
            <div className="w-full overflow-x-auto overflow-y-visible" style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#CBD5E0 #F7FAFC',
            paddingRight: '0px',
            paddingLeft: '0px'
          }}>
            <div className="relative" style={{ minWidth: 'max-content' }}>
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
                {/* Table Header */}
                <div 
                  className="grid bg-blue-500 text-white text-[10px] font-semibold font-outfit sticky top-0 z-20 shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
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
                      onClick={() => handleSort(col.key)}
                      className={`h-[32px] flex items-center justify-start px-1 cursor-pointer select-none ${
                        col.sticky ? 'sticky left-0 z-30 bg-blue-500' : ''
                      }`}
                      style={{
                        border: 'none',
                        outline: 'none',
                        boxShadow: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        touchAction: 'manipulation'
                      }}
                    >
                      <span className="truncate">{col.label}</span>
                      {sortColumn === col.key && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Table Rows */}
                {loading ? (
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
                        {activeColumns.map((col) => (
                          <div 
                            key={col.key}
                            className={`h-[38px] flex items-center justify-start px-1 ${col.sticky ? 'sticky left-0 bg-white z-10' : ''}`}
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
                ) : (
                  sortedDeals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((deal) => (
                    <div 
                      key={deal.id} 
                      className={`grid text-[10px] text-[#4B4B4B] font-outfit bg-white border-b border-[#E1E1E1] ${newDealIds.has(deal.id) ? 'new-deal-blink' : 'hover:bg-[#F8FAFC] transition-colors'}`}
                      style={{
                        gap: '0px', 
                        gridGap: '0px', 
                        columnGap: '0px',
                        gridTemplateColumns
                      }}
                    >
                      {activeColumns.map(col => (
                        <React.Fragment key={`${col.key}-${displayMode}`}>
                          {renderCellValue(deal, col.key, col.sticky)}
                        </React.Fragment>
                      ))}
                    </div>
                  ))
                )}

                {/* Total Row removed for mobile view */}

                {/* Empty state */}
                {sortedDeals.length === 0 && !loading && (
                  <div className="text-center py-8 text-[#9CA3AF] text-sm">
                    No deals available
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>
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
                {filteredColumnOptions.length > 0 ? (
                  filteredColumnOptions.map(col => (
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
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      
      {/* CustomizeView Modal */}
      <CustomizeViewModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        onFilterClick={() => {
          setIsCustomizeOpen(false)
          setIsTimeFilterOpen(true)
        }}
        onGroupsClick={() => {
          setIsCustomizeOpen(false)
          setIsLoginGroupsOpen(true)
        }}
        onDealsClick={() => {
          setIsCustomizeOpen(false)
          setIsDealsFilterOpen(true)
        }}
        onReset={() => {
          setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
          setActiveGroupFilter('livedealing', null)
          setTimeFilter('24h')
          setModuleFilter('both')
          setHasPendingGroupChanges(false)
          setHasPendingTimeChanges(false)
          setHasPendingDealsChanges(false)
          setPendingGroupDraft(null)
          setPendingTimeDraft(null)
          setPendingDealsDraft(null)
        }}
        onApply={() => {
          // Apply any pending drafts
          if (hasPendingGroupChanges) {
            setActiveGroupFilter('livedealing', pendingGroupDraft ? pendingGroupDraft.name : null)
          }
          if (hasPendingTimeChanges && pendingTimeDraft) {
            setTimeFilter(pendingTimeDraft.type)
            if (pendingTimeDraft.type === 'custom') {
              setCustomFromDate(pendingTimeDraft.from || '')
              setCustomToDate(pendingTimeDraft.to || '')
              setAppliedFromDate(pendingTimeDraft.from || '')
              setAppliedToDate(pendingTimeDraft.to || '')
            }
          }
          if (hasPendingDealsChanges && pendingDealsDraft) {
            setModuleFilter(pendingDealsDraft)
          }
          setIsCustomizeOpen(false)
          setHasPendingGroupChanges(false)
          setHasPendingTimeChanges(false)
          setHasPendingDealsChanges(false)
          setPendingGroupDraft(null)
          setPendingTimeDraft(null)
          setPendingDealsDraft(null)
        }}
        hasPendingChanges={
          hasPendingGroupChanges || hasPendingTimeChanges || hasPendingDealsChanges
        }
      />

      {/* Time Filter Modal */}
      <TimeFilterModal
        isOpen={isTimeFilterOpen}
        onClose={() => {
          setIsTimeFilterOpen(false)
          setIsCustomizeOpen(true)
        }}
        onBack={() => {
          setIsTimeFilterOpen(false)
          setIsCustomizeOpen(true)
        }}
        onApply={(newFilter) => {
          setTimeFilter(newFilter)
          setIsTimeFilterOpen(false)
        }}
        currentFilter={timeFilter}
        customFromDate={customFromDate}
        customToDate={customToDate}
        onCustomFromDateChange={setCustomFromDate}
        onCustomToDateChange={setCustomToDate}
        onApplyCustomDates={() => {
          setAppliedFromDate(customFromDate)
          setAppliedToDate(customToDate)
        }}
        onPendingChange={(hasPending, draft) => {
          setHasPendingTimeChanges(hasPending)
          setPendingTimeDraft(draft || null)
        }}
      />

      {/* Deals Filter Modal */}
      <DealsFilterModal
        isOpen={isDealsFilterOpen}
        onClose={() => {
          setIsDealsFilterOpen(false)
          setIsCustomizeOpen(true)
        }}
        onBack={() => {
          setIsDealsFilterOpen(false)
          setIsCustomizeOpen(true)
        }}
        onApply={(newFilter) => {
          setModuleFilter(newFilter)
          setIsDealsFilterOpen(false)
        }}
        currentFilter={moduleFilter}
        onPendingChange={(hasPending, draft) => {
          setHasPendingDealsChanges(hasPending)
          setPendingDealsDraft(draft || null)
        }}
      />

      {/* Filter Modal (hasFloating/hasCredit/noDeposit) */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => {
          setIsFilterOpen(false)
          setIsCustomizeOpen(true)
        }}
        onBack={() => {
          setIsFilterOpen(false)
          setIsCustomizeOpen(true)
        }}
        onApply={(newFilters) => {
          setFilters(newFilters)
          setIsFilterOpen(false)
        }}
        filters={filters}
      />

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupOpen}
        onClose={() => setIsGroupOpen(false)}
        availableItems={ibFilteredDeals}
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
        activeGroupName={getActiveGroupFilter('livedealing')}
        onSelectGroup={(group) => {
          if (group === null) {
            setActiveGroupFilter('livedealing', null)
          } else {
            setActiveGroupFilter('livedealing', group.name)
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
          deleteGroup(group.name)
          setIsLoginGroupsOpen(false)
        }}
        onPendingChange={(hasPending, draftName) => {
          setHasPendingGroupChanges(hasPending)
          setPendingGroupDraft(draftName ? { name: draftName } : null)
        }}
      />

      {/* Login Group Modal */}
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

      {/* Percentage toggle uses top bar button; modal removed */}

      {/* Client Details Modal */}
      {selectedClient && (
        <ClientDetailsMobileModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          allPositionsCache={cachedPositions}
          allOrdersCache={orders}
        />
      )}
    </div>
  )
}

