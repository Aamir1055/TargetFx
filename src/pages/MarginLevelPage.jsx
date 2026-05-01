import { useEffect, useRef, useState, useMemo, Fragment, cloneElement } from 'react'
import { useGroups } from '../contexts/GroupContext'
import { useAuth } from '../contexts/AuthContext'
import { brokerAPI } from '../services/api'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import WebSocketIndicator from '../components/WebSocketIndicator'
import LoadingSpinner from '../components/LoadingSpinner'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import MarginLevelModule from '../components/MarginLevelModule'
import ColumnChooserList from '../components/ColumnChooserList'
import useColumnResize, { ColumnResizeHandle } from '../hooks/useColumnResize.jsx'

// Helpers
const getMarginLevelPercent = (obj) => {
  // Common keys from accounts: margin_level, marginLevel, margin_percent, marginPercent, margin
  let val = obj?.margin_level ?? obj?.marginLevel ?? obj?.margin_percent ?? obj?.marginPercent ?? obj?.margin
  if (val === undefined || val === null) return undefined
  const n = Number(val)
  if (Number.isNaN(n)) return undefined
  // If looks like ratio (0..1), convert to percent
  if (n > 0 && n <= 1) return n * 100
  return n
}

const MarginLevelPage = () => {
  // Detect mobile device
  const [isMobile, setIsMobile] = useState(false)
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

  // Local state populated by polling /api/broker/clients/margin-call (replaces WebSocket-fed data)
  const { isAuthenticated } = useAuth()
  const [marginCallClients, setMarginCallClients] = useState([])
  const [marginCallLoaded, setMarginCallLoaded] = useState(false)
  const [marginCallLoading, setMarginCallLoading] = useState(false)
  const { filterByActiveGroup, activeGroupFilters } = useGroups()
  // WS connection state is no longer used here â€” keep a static placeholder so the indicator stays visible
  const connectionState = 'connected'

  // Fetch margin-call clients from REST API. Used both for initial load and 2s polling.
  const fetchMarginCallClients = async () => {
    try {
      setMarginCallLoading(true)
      const res = await brokerAPI.getMarginCallClients()
      const data = res?.data ?? res
      const list = Array.isArray(data)
        ? data
        : (data?.clients ?? data?.accounts ?? data?.results ?? [])
      if (Array.isArray(list)) setMarginCallClients(list)
      setMarginCallLoaded(true)
    } catch (err) {
      console.error('[MarginLevel] Failed to fetch margin-call clients:', err)
      setMarginCallLoaded(true)
    } finally {
      setMarginCallLoading(false)
    }
  }

  
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
  const hasInitialLoad = useRef(false)

  // Mirror selectedLogin into a ref so the polling closure always reads the latest value
  const selectedLoginRef = useRef(null)
  useEffect(() => { selectedLoginRef.current = selectedLogin }, [selectedLogin])

  // Initial fetch + 2s polling. Skip while modal is open or tab is hidden.
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    let timer = null

    const loop = async () => {
      if (cancelled) return
      const tabHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (!selectedLoginRef.current && !tabHidden) {
        await fetchMarginCallClients()
      }
      if (!cancelled) timer = setTimeout(loop, 2000)
    }

    // Kick off immediately (also bypasses the modal/hidden guards on first call)
    fetchMarginCallClients()
    timer = setTimeout(loop, 2000)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [isAuthenticated])
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(100)
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Column visibility states
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const columnSelectorRef = useRef(null)
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    name: true,
    equity: true,
    margin: true,
    marginFree: true,
    marginLevel: true,
    profit: true
  })

  const allColumns = [
    { key: 'login', label: 'Login', sticky: true },
    { key: 'name', label: 'Name' },
    { key: 'equity', label: 'Equity' },
    { key: 'margin', label: 'Margin' },
    { key: 'marginFree', label: 'Margin Free' },
    { key: 'marginLevel', label: 'Margin Level' },
    { key: 'profit', label: 'Profit' }
  ]

  // Column order (persisted) for reorder via Column Chooser
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('marginLevelPageColumnOrder')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return null
  })
  useEffect(() => {
    try {
      if (columnOrder) localStorage.setItem('marginLevelPageColumnOrder', JSON.stringify(columnOrder))
    } catch {}
  }, [columnOrder])
  const resetColumnOrder = () => {
    setColumnOrder(null)
    try { localStorage.removeItem('marginLevelPageColumnOrder') } catch {}
  }

  // Pinned (frozen) columns - persisted to localStorage
  const [pinnedColumns, setPinnedColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('marginLevelPagePinnedColumns'))
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('marginLevelPagePinnedColumns', JSON.stringify(pinnedColumns)) } catch {}
  }, [pinnedColumns])
  const togglePinColumn = (key) =>
    setPinnedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  // Column resize (per-column widths persisted to localStorage)
  const { setHeaderRef, getHeaderStyle, handleResizeStart } = useColumnResize('marginLevelPageColumnWidths')

  // Build ordered list based on saved columnOrder
  const orderedColumns = useMemo(() => {
    if (!Array.isArray(columnOrder) || columnOrder.length === 0) return allColumns
    const map = new Map(allColumns.map(c => [c.key, c]))
    const out = []
    columnOrder.forEach(k => { if (map.has(k)) { out.push(map.get(k)); map.delete(k) } })
    map.forEach(c => out.push(c))
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder])

  const PINNED_DEFAULT_WIDTH = 140
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
  }, [orderedColumns, visibleColumns, pinnedColumns])

  const applyPin = (cell, colKey, isHeader) => {
    if (!cell || !pinnedColumns.includes(colKey)) return cell
    if (cell.type === Fragment) return cell
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
  
  // Custom number filter states
  const [customFilterColumn, setCustomFilterColumn] = useState(null)
  const [customFilterType, setCustomFilterType] = useState('equal')
  const [customFilterValue1, setCustomFilterValue1] = useState('')
  const [customFilterValue2, setCustomFilterValue2] = useState('')
  const [customFilterOperator, setCustomFilterOperator] = useState('AND')

  // Column filter helper functions
  const getUniqueColumnValues = (columnKey) => {
    const values = new Set()
    filtered.forEach(account => {
      const value = account[columnKey]
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
    const checkboxCount = columnFilters[columnKey]?.length || 0
    
    // Check for number filter
    const numberFilterKey = `${columnKey}_number`
    const hasNumberFilter = columnFilters[numberFilterKey] ? 1 : 0
    
    return checkboxCount + hasNumberFilter
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

    // Close dropdown
    setShowFilterDropdown(null)
    setShowNumberFilterDropdown(null)
    
    // Reset form
    setCustomFilterValue1('')
    setCustomFilterValue2('')
    setCustomFilterType('equal')
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
  
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target)) {
        setShowColumnSelector(false)
      }
    }
    
    if (showSuggestions || showColumnSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSuggestions, showColumnSelector])

  const filtered = useMemo(() => {
    return marginCallClients.filter((a) => {
      const ml = getMarginLevelPercent(a)
      // Filter out zero margin levels and only show margin level < 50
      return ml !== undefined && ml !== 0 && ml < 50
    })
  }, [marginCallClients])

  // Update localStorage and dispatch event when filtered count changes
  useEffect(() => {
    localStorage.setItem('marginLevelCount', filtered.length)
    window.dispatchEvent(new Event('marginLevelCountChanged'))
  }, [filtered.length])

  // Generate dynamic pagination options based on data count (no 'All' option)
  const generatePageSizeOptions = () => {
    const baseSizes = [25, 50, 100, 200]
    const totalCount = filtered.length
    return baseSizes.filter(size => size <= totalCount)
  }
  
  const pageSizeOptions = generatePageSizeOptions()
  
  // Search function
  const searchAccounts = (accountsToSearch) => {
    if (!searchQuery.trim()) {
      return accountsToSearch
    }
    
    const query = searchQuery.toLowerCase().trim()
    return accountsToSearch.filter(account => {
      const login = String(account.login || '').toLowerCase()
      const name = String(account.name || '').toLowerCase()
      const group = String(account.group || '').toLowerCase()
      
      return login.includes(query) || name.includes(query) || group.includes(query)
    })
  }
  
  const handleSuggestionClick = (suggestion) => {
    const value = suggestion.split(': ')[1]
    setSearchQuery(value)
    setShowSuggestions(false)
  }
  
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false)
    }
  }
  
  // Sorting function with type detection
  const sortAccounts = (accountsToSort) => {
    if (!sortColumn) return accountsToSort
    
    const sorted = [...accountsToSort].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      
      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      
      // Detect data type and sort accordingly
      // Check if it's a number
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }
      
      // Default to string comparison
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr)
      } else {
        return bStr.localeCompare(aStr)
      }
    })
    
    return sorted
  }
  
  const searchedAccounts = searchAccounts(filtered)
  
  // Apply group filter
  let ibFilteredAccounts = filterByActiveGroup(searchedAccounts, 'login', 'marginlevel')
  
  // Apply column filters
  Object.entries(columnFilters).forEach(([columnKey, values]) => {
    if (columnKey.endsWith('_number')) {
      // Number filter
      const actualColumnKey = columnKey.replace('_number', '')
      ibFilteredAccounts = ibFilteredAccounts.filter(account => {
        const accountValue = account[actualColumnKey]
        return matchesNumberFilter(accountValue, values)
      })
    } else if (values && values.length > 0) {
      // Regular checkbox filter
      ibFilteredAccounts = ibFilteredAccounts.filter(account => {
        const accountValue = account[columnKey]
        return values.includes(accountValue)
      })
    }
  })
  
  const sortedAccounts = sortAccounts(ibFilteredAccounts)
  
  // Get search suggestions
  const getSuggestions = () => {
    if (!searchQuery.trim() || searchQuery.length < 1) {
      return []
    }
    
    const query = searchQuery.toLowerCase().trim()
    const suggestions = new Set()
    
    sortedAccounts.forEach(account => {
      const login = String(account.login || '')
      const name = String(account.name || '')
      const group = String(account.group || '')
      
      if (login.toLowerCase().includes(query)) {
        suggestions.add(`Login: ${login}`)
      }
      if (name.toLowerCase().includes(query) && name) {
        suggestions.add(`Name: ${name}`)
      }
      if (group.toLowerCase().includes(query) && group) {
        suggestions.add(`Group: ${group}`)
      }
    })
    
    return Array.from(suggestions).slice(0, 10)
  }
  
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
  
  // Pagination logic
  const totalPages = Math.ceil(sortedAccounts.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const displayedAccounts = sortedAccounts.slice(startIndex, endIndex)
  
  // Reset to page 1 when items per page changes
  useEffect(() => {
    setCurrentPage(1)
  }, [itemsPerPage])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterDropdown && filterRefs.current[showFilterDropdown]) {
        if (!filterRefs.current[showFilterDropdown].contains(event.target)) {
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
    setItemsPerPage(value)
    setCurrentPage(1)
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

  // Get card icon path based on card title
  const getCardIcon = (cardTitle) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'Below 50%': `${baseUrl}Desktop cards icons/Total Equity.svg`,
      'Avg Margin Level': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'Unique Logins': `${baseUrl}Desktop cards icons/Total Clients.svg`,
    }
    return iconMap[cardTitle] || `${baseUrl}Desktop cards icons/Total Clients.svg`
  }

  // Show loading only on first load (no data yet) â€” prevent flickering on re-fetches
  const isDataLoading = !marginCallLoaded && marginCallClients.length === 0

  // Helper function to render table header (sort & filter removed)
  const renderHeaderCell = (columnKey, label) => {
    return (
      <th
        ref={(el) => setHeaderRef(columnKey, el)}
        style={getHeaderStyle(columnKey)}
        className="relative px-3 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider select-none"
      >
        <ColumnResizeHandle onMouseDown={(e) => handleResizeStart(e, columnKey)} />
        <span>{label}</span>
      </th>
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
    return <MarginLevelModule />
  }

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
              <h1 className="text-xl font-bold text-[#1A1A1A]">Margin Level</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">show accounts in margin level </p>
            </div>

            {/* Action Buttons - All on right side */}
            <div className="flex items-center gap-2">
                  <GroupSelector 
                    moduleName="marginlevel" 
                    onCreateClick={() => {
                      setEditingGroup(null)
                      setShowGroupModal(true)
                    }}
                    onEditClick={(group) => {
                      setEditingGroup(group)
                      setShowGroupModal(true)
                    }}
                  />
                  {/* Refresh Button */}
                  <button
                    onClick={() => {
                      if (isRefreshing) return
                      setIsRefreshing(true)
                      console.log('[MarginLevel] Refreshing data...')
                      fetchMarginCallClients()
                      setTimeout(() => setIsRefreshing(false), 2000)
                    }}
                    disabled={isRefreshing}
                    className={`h-9 w-9 rounded-md border shadow-sm flex items-center justify-center transition-all ${
                      isRefreshing
                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-50'
                        : 'bg-white border-[#E5E7EB] hover:bg-gray-50 cursor-pointer'
                    }`}
                    title={isRefreshing ? 'Refreshing...' : 'Refresh margin levels'}
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

          {/* Table - Show skeleton while loading */}
          <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden flex flex-col flex-1">
            {/* Search and Controls Bar - Inside table container */}
            {sortedAccounts && sortedAccounts.length > 0 && (
              <div className="border-b border-[#E5E7EB] p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Left: Columns */}
                  <div className="flex items-center gap-2 flex-1">
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
            )}

            <div className="overflow-y-auto flex-1">
              {isDataLoading ? (
                <div className="p-8">
                  <div className="animate-pulse space-y-4">
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-100 rounded"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-100 rounded"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                    <div className="h-10 bg-gray-100 rounded"></div>
                    <div className="h-10 bg-gray-200 rounded"></div>
                  </div>
                </div>
              ) : displayedAccounts.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
                  </svg>
                  <p className="text-gray-500 text-sm">No accounts in margin level</p>
                  <p className="text-gray-400 text-xs mt-1"></p>
                </div>
              ) : (
                <table className="w-full divide-y divide-gray-200 [&_th]:border-r [&_th:last-child]:border-r-0 [&_th]:border-white/30 [&_td]:border-r [&_td:last-child]:border-r-0 [&_td]:border-gray-200" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                    <tr>
                      {orderedColumns.map(col => {
                        if (!visibleColumns[col.key]) return null
                        let cell = null
                        switch (col.key) {
                          case 'login': cell = renderHeaderCell('login', 'Login'); break
                          case 'name': cell = renderHeaderCell('name', 'Name'); break
                          case 'equity': cell = renderHeaderCell('equity', 'Equity'); break
                          case 'margin': cell = renderHeaderCell('margin', 'Margin'); break
                          case 'marginFree': cell = renderHeaderCell('marginFree', 'Margin Free'); break
                          case 'marginLevel': cell = renderHeaderCell('marginLevel', 'Margin Level'); break
                          case 'profit': cell = renderHeaderCell('profit', 'Profit'); break
                          default: cell = null
                        }
                        cell = applyPin(cell, col.key, true)
                        return <Fragment key={col.key}>{cell}</Fragment>
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {displayedAccounts.map((a, idx) => {
                      const ml = getMarginLevelPercent(a)
                      return (
                        <tr key={a.login ?? idx} className={`hover:bg-blue-50 transition-colors border-l-2 border-l-[#E1E1E1]`}>
                          {orderedColumns.map(col => {
                            if (!visibleColumns[col.key]) return null
                            let cell = null
                            switch (col.key) {
                              case 'login': cell = (
                                <td
                                  className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap cursor-pointer hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedLogin(a.login)
                                  }}
                                  title="Click to view login details"
                                >
                                  {a.login}
                                </td>
                              ); break
                              case 'name': cell = (
                                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{a.name || '-'}</td>
                              ); break
                              case 'equity': cell = (
                                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap" title={numericMode === 'compact' ? fmtMoneyFull(a.equity, 2) : undefined}>{fmtMoney(a.equity, 2)}</td>
                              ); break
                              case 'margin': cell = (
                                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap" title={numericMode === 'compact' ? fmtMoneyFull(a.margin, 2) : undefined}>{fmtMoney(a.margin, 2)}</td>
                              ); break
                              case 'marginFree': cell = (
                                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap" title={numericMode === 'compact' ? fmtMoneyFull(a.marginFree ?? a.margin_free, 2) : undefined}>{fmtMoney(a.marginFree ?? a.margin_free, 2)}</td>
                              ); break
                              case 'marginLevel': cell = (
                                <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800`}>
                                    {formatNumber(ml, 2)}%
                                  </span>
                                </td>
                              ); break
                              case 'profit': cell = (
                                <td className={`px-3 py-2 text-sm whitespace-nowrap font-medium ${Number(a.profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} title={numericMode === 'compact' ? fmtMoneyFull(a.profit, 2) : undefined}>{fmtMoney(a.profit, 2)}</td>
                              ); break
                              default: cell = null
                            }
                            cell = applyPin(cell, col.key, false)
                            return <Fragment key={col.key}>{cell}</Fragment>
                          })}
                        </tr>
                      )
                    })}
                    {/* Removed Total row as requested */}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {/* Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false)
          setEditingGroup(null)
        }}
        availableItems={filtered}
        loginField="login"
        displayField="name"
        secondaryField="group"
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
    </div>
  )
}

export default MarginLevelPage
