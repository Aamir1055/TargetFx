import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { brokerAPI } from '../services/api'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import ClientDetailsMobileModal from './ClientDetailsMobileModal'
import { useGroups } from '../contexts/GroupContext'
import { applyCumulativeFilters, applySearchFilter, applySorting } from '../utils/mobileFilters'

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

const getMarginLevelPercent = (obj) => {
  let val = obj?.margin_level ?? obj?.marginLevel ?? obj?.margin_percent ?? obj?.marginPercent ?? obj?.margin
  if (val === undefined || val === null) return undefined
  const n = Number(val)
  if (Number.isNaN(n)) return undefined
  if (n > 0 && n <= 1) return n * 100
  return n
}

export default function MarginLevelModule() {
  const navigate = useNavigate()
  const { logout, isAuthenticated } = useAuth()
  // Local state populated by polling /api/broker/clients/margin-call (replaces WebSocket-fed data)
  const [accounts, setAccounts] = useState([])
  const [marginCallLoaded, setMarginCallLoaded] = useState(false)
  const clients = accounts // alias for downstream code that referenced full client list
  const positions = []
  const orders = []
  const loading = { accounts: !marginCallLoaded, clients: !marginCallLoaded }
  const { groups, deleteGroup, getActiveGroupFilter, setActiveGroupFilter, filterByActiveGroup, activeGroupFilters } = useGroups()
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
    const [hasPendingFilterChanges, setHasPendingFilterChanges] = useState(false)
    const [pendingFilterDraft, setPendingFilterDraft] = useState(null)
    const [hasPendingGroupChanges, setHasPendingGroupChanges] = useState(false)
    const [pendingGroupDraft, setPendingGroupDraft] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const carouselRef = useRef(null)

  // Mirror selectedClient into a ref so the polling closure always reads the latest value
  const selectedClientRef = useRef(null)
  useEffect(() => { selectedClientRef.current = selectedClient }, [selectedClient])

  // Fetch margin-call clients from REST API
  const fetchMarginCallClients = async () => {
    try {
      const res = await brokerAPI.getMarginCallClients()
      const data = res?.data ?? res
      const list = Array.isArray(data)
        ? data
        : (data?.clients ?? data?.accounts ?? data?.results ?? [])
      if (Array.isArray(list)) setAccounts(list)
      setMarginCallLoaded(true)
    } catch (err) {
      console.error('[MarginLevelModule] Failed to fetch margin-call clients:', err)
      setMarginCallLoaded(true)
    }
  }

  // Initial fetch + 2s polling. Stops completely while client modal is open.
  useEffect(() => {
    if (!isAuthenticated) return
    if (selectedClient) return  // Modal is open — don't poll margin-call at all

    let cancelled = false
    let timer = null

    const loop = async () => {
      if (cancelled) return
      const tabHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (!tabHidden) {
        await fetchMarginCallClients()
      }
      if (!cancelled) timer = setTimeout(loop, 2000)
    }

    loop()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [isAuthenticated, selectedClient])
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isPageChanging, setIsPageChanging] = useState(false)
  const pageChangeTimeoutRef = useRef(null)
  const itemsPerPage = 15
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    name: true,
    equity: true,
    margin: true,
    marginFree: false,
    marginLevel: true,
    profit: true
  })

  // Clear all filters on component mount (when navigating to this module)
  useEffect(() => {
    setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
    setActiveGroupFilter('marginlevel', null)
    setSearchInput('')
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

  // First filter: margin level < 50% and exclude zero margin levels (same as desktop)
  const filteredByMarginLevel = useMemo(() => {
    return accounts.filter((a) => {
      const ml = getMarginLevelPercent(a)
      // Filter out zero margin levels and only show margin level < 50
      return ml !== undefined && ml !== 0 && ml < 50
    })
  }, [accounts])

  // Apply cumulative filters: Customize View -> IB -> Group
  const cumulativeFilteredAccounts = useMemo(() => {
    return applyCumulativeFilters(filteredByMarginLevel, {
      customizeFilters: filters,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'marginlevel'
    })
  }, [filteredByMarginLevel, filters, filterByActiveGroup, activeGroupFilters])

  // Apply search
  const searchedAccounts = useMemo(() => {
    return applySearchFilter(cumulativeFilteredAccounts, searchInput, ['login', 'name', 'group'])
  }, [cumulativeFilteredAccounts, searchInput])

  // Use searched accounts as ibFilteredAccounts for compatibility
  const ibFilteredAccounts = searchedAccounts

  // Calculate summary statistics from the fully filtered data
  const summaryStats = useMemo(() => {
    const totalUnder50 = ibFilteredAccounts.length
    const avgMarginLevel = ibFilteredAccounts.length > 0
      ? ibFilteredAccounts.reduce((sum, acc) => sum + (getMarginLevelPercent(acc) || 0), 0) / ibFilteredAccounts.length
      : 0
    const uniqueLogins = new Set(ibFilteredAccounts.map(a => a.login)).size
    const loginsUnder50 = uniqueLogins
    
    return {
      totalUnder50,
      avgMarginLevel,
      uniqueLogins,
      loginsUnder50
    }
  }, [ibFilteredAccounts])

  // Sort the filtered accounts
  const sortedAccounts = useMemo(() => {
    if (!sortColumn) return ibFilteredAccounts
    
    // Special handling for marginLevel column
    if (sortColumn === 'marginLevel') {
      return [...ibFilteredAccounts].sort((a, b) => {
        const aVal = getMarginLevelPercent(a) || 0
        const bVal = getMarginLevelPercent(b) || 0
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      })
    }
    
    // Map column keys to actual data fields for sorting
    const columnKeyMapping = {
      'marginFree': 'margin_free'
    }
    const sortKey = columnKeyMapping[sortColumn] || sortColumn
    
    return applySorting(ibFilteredAccounts, sortKey, sortDirection)
  }, [ibFilteredAccounts, sortColumn, sortDirection])

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  // Face cards data - matching desktop layout
  const [cards, setCards] = useState([])

  // Map card labels to icon file paths
  const getCardIcon = (label) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'BELOW 50%': `${baseUrl}mobile-icons/Below 50%.svg`,
      'AVG MARGIN LEVEL': `${baseUrl}mobile-icons/Avg Margin Level.svg`
    }
    return iconMap[label] || `${baseUrl}mobile-icons/Clients.svg`
  }
  
  useEffect(() => {
    const newCards = [
      { label: 'BELOW 50%', value: String(summaryStats.totalUnder50) },
      { label: 'AVG MARGIN LEVEL', value: formatNum(summaryStats.avgMarginLevel, 2) + '%' }
    ]
    
    setCards(prevCards => {
      if (prevCards.length === 0) return newCards
      // Only update if values actually changed
      let changed = false
      const updated = prevCards.map(prevCard => {
        const match = newCards.find(c => c.label === prevCard.label)
        if (match && match.value !== prevCard.value) {
          changed = true
          return match
        }
        return prevCard
      })
      return changed ? updated : prevCards
    })
  }, [summaryStats])

  // Get visible columns
  const allColumns = [
    { key: 'login', label: 'Login', width: '80px', sticky: true },
    { key: 'name', label: 'Name', width: '120px' },
    { key: 'equity', label: 'Equity', width: '100px' },
    { key: 'margin', label: 'Margin', width: '100px' },
    { key: 'marginFree', label: 'Margin Free', width: '100px' },
    { key: 'marginLevel', label: 'Margin Level', width: '110px' },
    { key: 'profit', label: 'Profit', width: '100px' }
  ]

  const activeColumns = allColumns.filter(col => visibleColumns[col.key])
  const gridTemplateColumns = activeColumns.map(col => col.width).join(' ')

  const renderCellValue = (account, key, isSticky = false) => {
    let value = '-'
    
    switch (key) {
      case 'login':
        value = account.login || '-'
        return (
          <div 
            className={`h-[28px] flex items-center justify-start px-2 cursor-pointer hover:underline text-blue-600 font-semibold ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
            style={{
              border: 'none', 
              outline: 'none', 
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
            onClick={() => {
              const fullClient = clients.find(c => String(c.login) === String(account.login))
              setSelectedClient(fullClient || { login: account.login, email: account.email || '', name: account.name || '' })
            }}
          >
            <span className="truncate">{value}</span>
          </div>
        )
      case 'name':
        value = account.name || '-'
        break
      case 'group':
        value = account.group || '-'
        break
      case 'balance':
        value = fmtMoney(account.balance || 0)
        break
      case 'equity':
        value = fmtMoney(account.equity || 0)
        break
      case 'margin':
        value = fmtMoney(account.margin || 0)
        break
      case 'marginFree':
        value = fmtMoney(account.margin_free || account.marginFree || 0)
        break
      case 'marginLevel':
        const ml = getMarginLevelPercent(account)
        value = ml !== undefined ? formatNum(ml, 2) + '%' : '-'
        break
      case 'profit':
        value = fmtMoney(account.profit || 0)
        break
      case 'credit':
        value = fmtMoney(account.credit || 0)
        break
      case 'leverage':
        value = account.leverage || '-'
        break
      case 'currency':
        value = account.currency || '-'
        break
      default:
        value = account[key] || '-'
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
        
        <h1 className="text-xl font-semibold text-black absolute left-1/2 transform -translate-x-1/2">Margin Level</h1>
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
                  {label:'Pending Orders', path:'/pending-orders', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#404040"/><circle cx="12" cy="12" r="2" fill="#404040"/></svg>
                  )},
                  {label:'Margin Level', path:'/margin-level', active:true, icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 18L10 12L14 16L20 8" stroke="#1A63BC" strokeWidth="2"/></svg>
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M10 17l5-5-5-5" stroke="#404040" strokeWidth="2"/><path d="M4 12h11" stroke="#404040" strokeWidth="2"/></svg>
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
                (filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('marginlevel'))
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
                  getActiveGroupFilter('marginlevel')
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
              disabled={loading.accounts}
              className="w-8 h-8 rounded-lg border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="#4B4B4B" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>


        {/* Navigation */}
        <div className="pb-3 px-4">
          <div className="flex items-center gap-1">
            <button 
              onClick={() => handlePageChange(currentPage - 1, Math.ceil(sortedAccounts.length / itemsPerPage))}
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
                max={Math.ceil(sortedAccounts.length / itemsPerPage)}
                value={currentPage}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  const maxPage = Math.ceil(sortedAccounts.length / itemsPerPage)
                  if (!isNaN(n) && n >= 1 && n <= maxPage) {
                    handlePageChange(n, maxPage)
                  }
                }}
                className="w-10 h-6 border border-[#ECECEC] rounded-[8px] text-center text-[10px]"
                aria-label="Current page"
              />
              <span className="text-[#9CA3AF]">/</span>
              <span>{Math.ceil(sortedAccounts.length / itemsPerPage)}</span>
            </div>
            <button 
              onClick={() => handlePageChange(currentPage + 1, Math.ceil(sortedAccounts.length / itemsPerPage))}
              disabled={currentPage >= Math.ceil(sortedAccounts.length / itemsPerPage)}
              className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M8 6L12 10L8 14" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>


        {/* Table */}
        <div>
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
                      className={`h-[28px] flex items-center justify-center px-1 cursor-pointer ${col.sticky ? 'sticky left-0 bg-blue-500 z-30' : ''}`}
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
                {(loading && loading.clients && accounts.length === 0) || isPageChanging ? (
                  // YouTube-style skeleton loading (only on first load)
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
                  sortedAccounts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((account, idx) => (
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
                        {renderCellValue(account, col.key, col.sticky)}
                      </React.Fragment>
                    ))}
                  </div>
                  ))
                )}

                {/* Total Row removed for mobile view */}

                {/* Empty state */}
                {sortedAccounts.length === 0 && !loading?.clients && (
                  <div className="text-center py-8 text-[#9CA3AF] text-sm">
                    No accounts under 50% margin level
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
        onFilterClick={() => {
          setIsCustomizeOpen(false)
          setIsFilterOpen(true)
        }}
        onGroupsClick={() => {
          setIsCustomizeOpen(false)
          setIsLoginGroupsOpen(true)
        }}
        onReset={() => {
          setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
          setActiveGroupFilter('marginlevel', null)
          setHasPendingFilterChanges(false)
          setHasPendingGroupChanges(false)
          setPendingFilterDraft(null)
          setPendingGroupDraft(null)
        }}
        onApply={() => {
          if (hasPendingFilterChanges && pendingFilterDraft) {
            setFilters(pendingFilterDraft)
          }
          if (hasPendingGroupChanges) {
            setActiveGroupFilter('marginlevel', pendingGroupDraft ? pendingGroupDraft.name : null)
          }
          setIsCustomizeOpen(false)
          setHasPendingFilterChanges(false)
          setHasPendingGroupChanges(false)
          setPendingFilterDraft(null)
          setPendingGroupDraft(null)
        }}
        hasPendingChanges={hasPendingFilterChanges || hasPendingGroupChanges}
      />

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={(newFilters) => {
          setFilters(newFilters)
          setIsFilterOpen(false)
          setHasPendingFilterChanges(false)
          setPendingFilterDraft(null)
        }}
        filters={filters}
        onPendingChange={(hasPending, draft) => {
          setHasPendingFilterChanges(hasPending)
          setPendingFilterDraft(draft || null)
        }}
      />

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupOpen}
        onClose={() => setIsGroupOpen(false)}
        availableItems={ibFilteredAccounts}
        loginField="login"
        displayField="name"
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
        activeGroupName={getActiveGroupFilter('marginlevel')}
        onSelectGroup={(group) => {
          if (group === null) {
            setActiveGroupFilter('marginlevel', null)
          } else {
            setActiveGroupFilter('marginlevel', group.name)
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

