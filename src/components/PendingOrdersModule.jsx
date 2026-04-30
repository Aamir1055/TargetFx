import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { brokerAPI } from '../services/api'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import ClientDetailsMobileModal from './ClientDetailsMobileModal'
import { useGroups } from '../contexts/GroupContext'
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

const formatTime = (ts) => {
  if (!ts) return '-'
  try {
    const d = new Date(ts * 1000)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${day}/${month}/${year} ${hours}:${minutes}`
  } catch {
    return '-'
  }
}

export default function PendingOrdersModule() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { orders, clients, loading, positions } = useData()
  const { groups, deleteGroup, getActiveGroupFilter, setActiveGroupFilter, filterByActiveGroup, getGroupLogins, activeGroupFilters } = useGroups()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [numericMode, setNumericMode] = useState(() => { try { const s = localStorage.getItem('globalDisplayMode'); return s === 'full' ? 'full' : 'compact' } catch { return 'compact' } })
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isGroupOpen, setIsGroupOpen] = useState(false)
  const [isLoginGroupsOpen, setIsLoginGroupsOpen] = useState(false)
  const [isLoginGroupModalOpen, setIsLoginGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [filters, setFilters] = useState({ hasFloating: false, hasCredit: false, noDeposit: false })
    // Pending apply tracking
    const [hasPendingGroupChanges, setHasPendingGroupChanges] = useState(false)
    const [pendingGroupDraft, setPendingGroupDraft] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const carouselRef = useRef(null)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isPageChanging, setIsPageChanging] = useState(false)
  const pageChangeTimeoutRef = useRef(null)
  const itemsPerPage = 15
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')

  // Server totals from API (for face cards — same approach as desktop)
  const [serverTotals, setServerTotals] = useState({ totalOrders: 0, uniqueLogins: 0, volumeCurrent: 0, volumeInitial: 0 })
  const hasFetchedServerTotalsRef = useRef(false)
  const [serverOrders, setServerOrders] = useState([])
  const [serverTotalOrders, setServerTotalOrders] = useState(0)
  const [hasFetchedOrders, setHasFetchedOrders] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    timeSetup: true,
    order: true,
    symbol: true,
    type: true,
    volume: true,
    priceOrder: true,
    priceTrigger: false,
    priceSL: false,
    priceTP: false,
    state: false
  })

  // Clear all filters on component mount (when navigating to this module)
  useEffect(() => {
    setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
    setActiveGroupFilter('pendingorders', null)
    setSearchInput('')
  }, [])

  // Reset pagination when active group changes
  useEffect(() => {
    setCurrentPage(1)
  }, [getActiveGroupFilter('pendingorders')])

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

  const fmtCount = (v) => {
    const n = Number(v)
    if (!isFinite(n)) return '0'
    if (numericMode === 'compact') return formatCompactIndian(n)
    return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
  }

  const fmtPrice = (v, decimals = 5) => {
    const n = Number(v)
    if (!isFinite(n)) return '0.00'
    if (numericMode === 'compact') return formatCompactIndian(n)
    return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  // Listen for global request to open Customize View from child modals
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
    }
  }, [])

  // Poll server every 2s — mirrors PendingOrdersPage.jsx desktop behaviour exactly
  useEffect(() => {
    let isCancelled = false
    let timer = null
    let controller = new AbortController()

    const poll = async () => {
      if (isCancelled) return
      try {
        const params = {
          page: currentPage,
          limit: itemsPerPage,
          sortBy: sortColumn || 'timeSetup',
          sortOrder: sortDirection || 'desc'
        }
        if (searchInput && searchInput.trim()) params.search = searchInput.trim()

        // Apply active group filter as a server-side login filter (works across pages)
        const activeGroupName = getActiveGroupFilter('pendingorders')
        if (activeGroupName) {
          const groupLogins = getGroupLogins(activeGroupName).map(l => Number(l)).filter(n => !Number.isNaN(n))
          params.filters = [
            { field: 'login', operator: 'in', value: groupLogins.length > 0 ? groupLogins : [-1] }
          ]
        }

        const response = await brokerAPI.searchOrders(params, { signal: controller.signal })
        if (isCancelled) return
        const data = response?.data?.orders || response?.data?.positions || response?.orders || []
        const total = response?.data?.total || response?.total || 0
        const totals = response?.data?.totals || response?.totals || null
        if (Array.isArray(data)) {
          setServerOrders(data)
          setServerTotalOrders(total)
          if (totals) {
            setServerTotals({
              totalOrders: total,
              uniqueLogins: totals.uniqueLogins ?? 0,
              volumeCurrent: totals.volumeCurrent ?? 0,
              volumeInitial: totals.volumeInitial ?? 0
            })
            hasFetchedServerTotalsRef.current = true
          }
          setHasFetchedOrders(true)
        }
      } catch (err) {
        if (!isCancelled && err?.code !== 'ERR_CANCELED' && err?.message !== 'canceled') {
          console.warn('[PendingOrdersModule] Polling error:', err?.message)
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
  }, [currentPage, itemsPerPage, sortColumn, sortDirection, searchInput, activeGroupFilters, getActiveGroupFilter, getGroupLogins])

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

  // Apply cumulative filters: Customize View -> IB -> Group
  const ibFilteredOrders = useMemo(() => {
    return applyCumulativeFilters(orders, {
      customizeFilters: filters,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'pendingorders'
    })
  }, [orders, filters, filterByActiveGroup, activeGroupFilters])

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalOrders = ibFilteredOrders.length
    const uniqueLogins = new Set(ibFilteredOrders.map(o => o.login)).size
    const uniqueSymbols = new Set(ibFilteredOrders.map(o => o.symbol)).size
    const totalVolume = ibFilteredOrders.reduce((sum, o) => sum + (o.volumeCurrent || o.volume || 0), 0)
    const volumeCurrent = ibFilteredOrders.reduce((sum, o) => sum + (o.volumeCurrent || o.volume || 0), 0)
    const volumeInitial = ibFilteredOrders.reduce((sum, o) => sum + (o.volumeInitial || o.volumeCurrent || o.volume || 0), 0)
    
    return {
      totalOrders,
      uniqueLogins,
      uniqueSymbols,
      totalVolume,
      volumeCurrent,
      volumeInitial
    }
  }, [ibFilteredOrders])

  // Filter orders based on search
  const filteredOrders = useMemo(() => {
    let filtered = ibFilteredOrders.filter(order => {
      if (!searchInput.trim()) return true
      const query = searchInput.toLowerCase()
      return (
        String(order.login || '').toLowerCase().includes(query) ||
        String(order.symbol || '').toLowerCase().includes(query) ||
        String(order.order || order.ticket || '').toLowerCase().includes(query)
      )
    })

    // Apply sorting
    if (sortColumn) {
      // Map column keys to actual data fields for sorting
      const columnKeyMapping = {
        'volume': 'volumeCurrent',
        'priceOrder': 'priceOrder',
        'priceTrigger': 'priceTrigger',
        'priceSL': 'priceSL',
        'priceTP': 'priceTP',
        'timeSetup': 'timeSetup'
      }
      
      const sortKey = columnKeyMapping[sortColumn] || sortColumn
      
      filtered.sort((a, b) => {
        // Get values with fallbacks for certain fields
        let aVal, bVal
        
        if (sortColumn === 'volume') {
          aVal = a.volumeCurrent || a.volume
          bVal = b.volumeCurrent || b.volume
        } else if (sortColumn === 'priceOrder') {
          aVal = a.priceOrder || a.price
          bVal = b.priceOrder || b.price
        } else if (sortColumn === 'priceTrigger') {
          aVal = a.priceTrigger || a.trigger
          bVal = b.priceTrigger || b.trigger
        } else if (sortColumn === 'priceSL') {
          aVal = a.priceSL || a.sl
          bVal = b.priceSL || b.sl
        } else if (sortColumn === 'priceTP') {
          aVal = a.priceTP || a.tp
          bVal = b.priceTP || b.tp
        } else if (sortColumn === 'timeSetup') {
          aVal = a.timeSetup || a.timeUpdate || a.timeCreate
          bVal = b.timeSetup || b.timeUpdate || b.timeCreate
        } else {
          aVal = a[sortKey]
          bVal = b[sortKey]
        }
        
        if (aVal == null && bVal == null) return 0
        if (aVal == null) return 1
        if (bVal == null) return -1
        
        const aNum = Number(aVal)
        const bNum = Number(bVal)
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
        }
        
        const aStr = String(aVal).toLowerCase()
        const bStr = String(bVal).toLowerCase()
        if (sortDirection === 'asc') {
          return aStr.localeCompare(bStr)
        } else {
          return bStr.localeCompare(aStr)
        }
      })
    }

    return filtered
  }, [ibFilteredOrders, searchInput, sortColumn, sortDirection])

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [ibFilteredOrders.length, searchInput])

  // Use server-polled orders for table when available (same as desktop), fallback to WS cache
  const displayOrders = hasFetchedOrders ? serverOrders : filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
  const totalPages = hasFetchedOrders
    ? Math.max(1, Math.ceil(serverTotalOrders / itemsPerPage))
    : Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage))

  // Face cards data - matching desktop layout with persistent state
  const [cards, setCards] = useState([])

  // Map card labels to icon file paths
  const getCardIcon = (label) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'TOTAL ORDERS': `${baseUrl}Mobile cards icons/Brokers Eye Platform/Group.svg`,
      'UNIQUE LOGINS': `${baseUrl}Mobile cards icons/Total Clients.svg`,
      'VOLUME CURRENT': `${baseUrl}Mobile cards icons/Total Equity.svg`,
      'VOLUME INITIAL': `${baseUrl}Mobile cards icons/Total Balance.svg`
    }
    return iconMap[label] || `${baseUrl}Mobile cards icons/Total Clients.svg`
  }
  
  // Update cards when summary stats change
  useEffect(() => {
    // Prefer server totals (API) when available, fall back to client-side sums
    const totalOrders = hasFetchedServerTotalsRef.current ? serverTotals.totalOrders : summaryStats.totalOrders
    const uniqueLogins = hasFetchedServerTotalsRef.current ? serverTotals.uniqueLogins : summaryStats.uniqueLogins
    const volumeCurrent = hasFetchedServerTotalsRef.current ? serverTotals.volumeCurrent : summaryStats.volumeCurrent
    const volumeInitial = hasFetchedServerTotalsRef.current ? serverTotals.volumeInitial : summaryStats.volumeInitial

    const newCards = [
      { label: 'TOTAL ORDERS', value: fmtCount(totalOrders) },
      { label: 'UNIQUE LOGINS', value: fmtCount(uniqueLogins) },
      { label: 'VOLUME CURRENT', value: fmtMoney(volumeCurrent) },
      { label: 'VOLUME INITIAL', value: fmtMoney(volumeInitial) }
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
  }, [summaryStats, serverTotals, numericMode])

  // Get visible columns
  const allColumns = [
    { key: 'login', label: 'Login', width: '80px', sticky: true },
    { key: 'timeSetup', label: 'Time', width: '140px' },
    { key: 'order', label: 'Order', width: '80px' },
    { key: 'symbol', label: 'Symbol', width: '100px' },
    { key: 'type', label: 'Type', width: '80px' },
    { key: 'volume', label: 'Volume', width: '80px' },
    { key: 'priceOrder', label: 'Price', width: '100px' },
    { key: 'priceTrigger', label: 'Trigger', width: '100px' },
    { key: 'priceSL', label: 'S/L', width: '100px' },
    { key: 'priceTP', label: 'T/P', width: '100px' },
    { key: 'state', label: 'State', width: '80px' }
  ]

  const activeColumns = allColumns.filter(col => visibleColumns[col.key])
  const gridTemplateColumns = activeColumns.map(col => col.width).join(' ')

  const renderCellValue = (order, key, isSticky = false) => {
    let value = '-'
    
    switch (key) {
      case 'login':
        value = order.login || '-'
        return (
          <div 
            className={`h-[28px] flex items-center justify-start px-2 cursor-pointer hover:underline text-blue-600 font-semibold ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
            style={{
              border: 'none', 
              outline: 'none', 
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
            onClick={() => {
              const fullClient = clients.find(c => String(c.login) === String(order.login))
              setSelectedClient(fullClient || { login: order.login, email: order.email || '', name: '' })
            }}
          >
            <span className="truncate">{value}</span>
          </div>
        )
      case 'order':
        value = order.order || order.ticket || '-'
        break
      case 'symbol':
        value = order.symbol || '-'
        break
      case 'type':
        value = order.type || '-'
        const isBuy = value.toUpperCase().includes('BUY')
        const isSell = value.toUpperCase().includes('SELL')
        return (
          <div 
            className={`h-[28px] flex items-center justify-start px-2 ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
            style={{
              border: 'none', 
              outline: 'none', 
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            <span className={`px-2 py-0.5 text-[9px] font-semibold ${
              isBuy ? 'bg-green-100 text-green-700' : 
              isSell ? 'bg-red-100 text-red-700' : 
              'bg-gray-100 text-gray-700'
            }`}>
              {value}
            </span>
          </div>
        )
      case 'volume':
        value = fmtMoney(order.volumeCurrent || order.volume || 0)
        break
      case 'priceOrder':
        value = formatNum(order.priceOrder || order.price || 0, 5)
        break
      case 'priceTrigger':
        value = formatNum(order.priceTrigger || order.trigger || 0, 5)
        break
      case 'priceSL':
        value = formatNum(order.priceSL || order.sl || 0, 5)
        break
      case 'priceTP':
        value = formatNum(order.priceTP || order.tp || 0, 5)
        break
      case 'timeSetup':
        value = formatTime(order.timeSetup || order.timeUpdate || order.timeCreate)
        break
      case 'state':
        value = order.state || '-'
        break
      default:
        value = order[key] || '-'
    }

    return (
      <div 
        className={`h-[28px] flex items-center justify-start px-2 ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
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
    <div className="h-screen flex flex-col bg-[#F8F8F8] overflow-hidden" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center px-4 py-4 bg-white border-b border-[#ECECEC] relative">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        
        <h1 className="text-xl font-semibold text-black absolute left-1/2 transform -translate-x-1/2">Pending Orders</h1>
        {/* Hide profile avatar on mobile widths */}
        <div className="hidden md:flex w-12 h-12 rounded-full bg-blue-600 items-center justify-center ml-auto">
          <span className="text-white text-sm font-semibold">U</span>
        </div>
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
                  {label:'Pending Orders', path:'/pending-orders', active:true, icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#1A63BC"/><circle cx="12" cy="12" r="2" fill="#1A63BC"/></svg>
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Action buttons row */}
        <div className="pt-5 pb-4 px-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsCustomizeOpen(true)} 
              className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative ${
                (filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('pendingorders'))
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
                  getActiveGroupFilter('pendingorders')
                ].filter(Boolean).length;
                return filterCount > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {filterCount}
                  </span>
                ) : null;
              })()}
            </button>
            <button 
              onClick={() => window.location.reload()}
              disabled={loading.orders}
              className="w-8 h-8 rounded-lg border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="#1A63BC" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Face Cards Carousel */}
        <div className="pb-2 pl-5">
          <div 
            ref={carouselRef}
            className="flex gap-[8px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pr-4"
          >
            {cards.map((card, i) => (
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
            ))}
          </div>
        </div>

        {/* Search and navigation */}
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
              onClick={() => handlePageChange(currentPage - 1, totalPages)}
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
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!isNaN(n) && n >= 1 && n <= totalPages) {
                    handlePageChange(n, totalPages)
                  }
                }}
                className="w-10 h-6 border border-[#ECECEC] rounded-[8px] text-center text-[10px]"
                aria-label="Current page"
              />
              <span className="text-[#9CA3AF]">/</span>
              <span>{totalPages}</span>
            </div>
            <button 
              onClick={() => handlePageChange(currentPage + 1, totalPages)}
              disabled={currentPage >= totalPages}
              className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M8 6L12 10L8 14" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="">
          <div className="bg-white shadow-[0_0_12px_rgba(75,75,75,0.05)] border border-[#F2F2F7] overflow-hidden">
            <div className="w-full overflow-x-auto overflow-y-visible" style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
              scrollbarColor: '#CBD5E0 #F7FAFC'
            }}>
              <div className="relative" style={{ minWidth: 'max-content' }}>
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
                      className={`h-[28px] flex items-center justify-start px-1 cursor-pointer ${col.sticky ? 'sticky left-0 bg-blue-500 z-30' : ''}`}
                      style={{
                        border: 'none', 
                        outline: 'none', 
                        boxShadow: 'none',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        touchAction: 'manipulation'
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
                {(loading && loading.orders) || isPageChanging ? (
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
                ) : (
                  displayOrders.map((order, idx) => (
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
                        {renderCellValue(order, col.key, col.sticky)}
                      </React.Fragment>
                    ))}
                  </div>
                  ))
                )}

                {/* Total Row */}
                {displayOrders.length > 0 && !loading?.orders && (
                  <div 
                    className="grid text-[10px] text-[#1A63BC] font-outfit bg-[#EFF4FB] border-t-2 border-[#1A63BC]"
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
                        className={`h-[28px] flex items-center justify-start px-2 font-semibold ${col.sticky ? 'sticky left-0 bg-[#EFF4FB] z-10' : ''}`}
                        style={{
                          border: 'none', 
                          outline: 'none', 
                          boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
                        }}
                      >
                        {col.key === 'login' ? 'Total' : ''}
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {displayOrders.length === 0 && !loading?.orders && (
                  <div className="text-center py-8 text-[#9CA3AF] text-sm">
                    No pending orders found
                  </div>
                )}
              </div>
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

      {/* CustomizeView Modal */}
      <CustomizeViewModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        onGroupsClick={() => {
          setIsCustomizeOpen(false)
          setIsLoginGroupsOpen(true)
        }}
        onReset={() => {
          setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
          setActiveGroupFilter('pendingorders', null)
          setHasPendingGroupChanges(false)
          setPendingGroupDraft(null)
        }}
        onApply={() => {
          if (hasPendingGroupChanges) {
            setActiveGroupFilter('pendingorders', pendingGroupDraft ? pendingGroupDraft.name : null)
          }
          setIsCustomizeOpen(false)
          setHasPendingGroupChanges(false)
          setPendingGroupDraft(null)
        }}
        hasPendingChanges={hasPendingGroupChanges}
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

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupOpen}
        onClose={() => setIsGroupOpen(false)}
        availableItems={ibFilteredOrders}
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
        activeGroupName={getActiveGroupFilter('pendingorders')}
        onSelectGroup={(group) => {
          if (group === null) {
            setActiveGroupFilter('pendingorders', null)
          } else {
            setActiveGroupFilter('pendingorders', group.name)
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

