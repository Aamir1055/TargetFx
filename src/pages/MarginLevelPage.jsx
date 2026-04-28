import { useEffect, useRef, useState, useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useGroups } from '../contexts/GroupContext'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import WebSocketIndicator from '../components/WebSocketIndicator'
import LoadingSpinner from '../components/LoadingSpinner'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import MarginLevelModule from '../components/MarginLevelModule'

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

  // Use cached data from DataContext - MUST be called before conditional return
  const { accounts: cachedAccounts, positions: cachedPositions, orders: cachedOrders, fetchAccounts, loading, connectionState } = useData()
  const { filterByActiveGroup, activeGroupFilters } = useGroups()
  
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
    group: true,
    balance: true,
    equity: true,
    margin: true,
    marginFree: true,
    marginLevel: true,
    profit: false,
    credit: false,
    leverage: false,
    currency: false
  })

  const allColumns = [
    { key: 'login', label: 'Login', sticky: true },
    { key: 'name', label: 'Name' },
    { key: 'group', label: 'Group' },
    { key: 'balance', label: 'Balance' },
    { key: 'equity', label: 'Equity' },
    { key: 'margin', label: 'Margin' },
    { key: 'marginFree', label: 'Free Margin' },
    { key: 'marginLevel', label: 'Margin Level' },
    { key: 'profit', label: 'Floating Profit' },
    { key: 'credit', label: 'Credit' },
    { key: 'leverage', label: 'Leverage' },
    { key: 'currency', label: 'Currency' }
  ]

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
    return cachedAccounts.filter((a) => {
      const ml = getMarginLevelPercent(a)
      // Filter out zero margin levels and only show margin level < 50
      return ml !== undefined && ml !== 0 && ml < 50
    })
  }, [cachedAccounts])

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

  // Show loading only on first load (no data yet) — prevent flickering on re-fetches
  const isDataLoading = loading.accounts && cachedAccounts.length === 0

  // Helper function to render table header with filter
  const renderHeaderCell = (columnKey, label, sortKey = null) => {
    const filterCount = getActiveFilterCount(columnKey)
    const actualSortKey = sortKey || columnKey
    
    return (
      <th className="px-3 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider select-none group">
        <div className="flex items-center gap-1 justify-between">
          <div 
            className="flex items-center gap-1 cursor-pointer flex-1"
            onClick={() => handleSort(actualSortKey)}
          >
            <span>{label}</span>
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
                setShowFilterDropdown(showFilterDropdown === columnKey ? null : columnKey)
              }}
              className={`p-1 rounded ${filterCount > 0 ? 'text-blue-200' : 'text-white/70'}`}
              title="Filter column"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {filterCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {filterCount}
                </span>
              )}
            </button>

            {showFilterDropdown === columnKey && (
              <div className="fixed bg-white border border-gray-300 rounded shadow-2xl z-[9999] w-48" 
                style={{
                  top: `${filterRefs.current[columnKey]?.getBoundingClientRect().bottom + 5}px`,
                  left: `${filterRefs.current[columnKey]?.getBoundingClientRect().left}px`
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
                      handleSort(actualSortKey)
                      setSortDirection('asc')
                      setShowFilterDropdown(null)
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
                      handleSort(actualSortKey)
                      setSortDirection('desc')
                      setShowFilterDropdown(null)
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

                {/* Number Filters */}
                <div className="border-b border-slate-200 py-1" style={{ overflow: 'visible' }}>
                  <div className="px-2 py-1 relative group text-[11px]" style={{ overflow: 'visible' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (showNumberFilterDropdown === columnKey) {
                          setShowNumberFilterDropdown(null)
                          setCustomFilterValue1('')
                          setCustomFilterValue2('')
                        } else {
                          setShowNumberFilterDropdown(columnKey)
                          setCustomFilterColumn(columnKey)
                          setCustomFilterValue1('')
                          setCustomFilterValue2('')
                        }
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 hover:border-slate-400 transition-all"
                    >
                      <span>Number Filters</span>
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    
                    {/* Number Filter Dropdown - Opens to the right */}
                    {showNumberFilterDropdown === columnKey && (
                      <div
                        data-number-filter
                        className="absolute top-0 w-64 bg-white border-2 border-gray-300 rounded-lg shadow-xl"
                        style={{
                          left: 'calc(100% + 8px)',
                          zIndex: 10000001
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-3 space-y-3">
                          <div>
                            <label className="block text-xs font-normal text-gray-700 mb-1">CONDITION</label>
                            <select
                              value={customFilterType}
                              onChange={(e) => setCustomFilterType(e.target.value)}
                              className="w-full px-2 py-1.5 text-xs font-normal border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
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
                            <label className="block text-xs font-normal text-gray-700 mb-1">VALUE</label>
                            <input
                              type="number"
                              step="any"
                              placeholder="Enter value"
                              value={customFilterValue1}
                              onChange={(e) => setCustomFilterValue1(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  if (customFilterType === 'between' && !customFilterValue2) return
                                  applyCustomNumberFilter()
                                  setShowNumberFilterDropdown(null)
                                }
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                            />
                          </div>

                          {customFilterType === 'between' && (
                            <div>
                              <label className="block text-xs font-normal text-gray-700 mb-1">AND</label>
                              <input
                                type="number"
                                step="any"
                                placeholder="Enter value"
                                value={customFilterValue2}
                                onChange={(e) => setCustomFilterValue2(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    if (!customFilterValue1 || !customFilterValue2) return
                                    applyCustomNumberFilter()
                                    setShowNumberFilterDropdown(null)
                                  }
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                              />
                            </div>
                          )}

                          <div className="flex gap-2 pt-2 border-t border-gray-200">
                            <button
                              onClick={() => {
                                applyCustomNumberFilter()
                                setShowNumberFilterDropdown(null)
                              }}
                              disabled={!customFilterValue1 || (customFilterType === 'between' && !customFilterValue2)}
                              className="w-full px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              OK
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Search Box */}
                <div className="p-2 border-b border-slate-200">
                  <div className="relative">
                    <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={filterSearchQuery[columnKey] || ''}
                      onChange={(e) => {
                        e.stopPropagation()
                        setFilterSearchQuery(prev => ({
                          ...prev,
                          [columnKey]: e.target.value
                        }))
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full pl-8 pr-3 py-1.5 text-[11px] border border-slate-300 rounded-md focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* Select All / Deselect All */}
                <div className="px-2 py-1.5 border-b border-slate-200 bg-slate-50">
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
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-[11px] font-semibold text-slate-700">SELECT ALL</span>
                  </label>
                </div>

                {/* Filter List */}
                <div className="max-h-64 overflow-y-auto">
                  <div className="p-1.5 space-y-0.5">
                    {getUniqueColumnValues(columnKey).length === 0 ? (
                      <div className="px-2 py-2 text-center text-[11px] text-slate-500">
                        No items found
                      </div>
                    ) : (
                      getUniqueColumnValues(columnKey).map(value => (
                        <label 
                          key={value} 
                          className="flex items-center gap-2 hover:bg-blue-50 px-2 py-1.5 rounded cursor-pointer transition-colors bg-white"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={(columnFilters[columnKey] || []).includes(value)}
                            onChange={(e) => {
                              e.stopPropagation()
                              toggleColumnFilter(columnKey, value)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-[11px] text-slate-700 font-medium truncate">
                            {value}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-2 py-1.5 border-t border-slate-200 bg-slate-50 rounded-b flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearColumnFilter(columnKey)
                    }}
                    className="px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowFilterDropdown(null)
                    }}
                    className="px-3 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
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
              <p className="text-xs text-[#6B7280] mt-0.5">Shows accounts with margin level &lt; 50% (excludes zero margin levels)</p>
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
                </div>
              </div>
            </div>

          {/* Summary Cards - Client2 Face Card Design */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Below 50%</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Below 50%')} 
                    alt="Below 50%"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              {isDataLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : (
                <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                  <span title={numericMode === 'compact' ? String(filtered.length) : undefined}>{numericMode === 'compact' ? fmtMoney(filtered.length, 0).replace(/\.00$/, '') : filtered.length}</span>
                  <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">ACCT</span>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-1.5 min-h-[20px]">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight flex-1 break-words">Avg Margin Level</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Avg Margin Level')} 
                    alt="Avg Margin Level"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              {isDataLoading ? (
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
              ) : (
                <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                  <span>{filtered.length ? formatNumber(filtered.reduce((s,o)=>s+(getMarginLevelPercent(o)||0),0)/filtered.length, 2) : '-'}</span>
                  {filtered.length > 0 && <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">%</span>}
                </div>
              )}
            </div>
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
              {isDataLoading ? (
                <div className="h-6 w-12 bg-gray-200 rounded animate-pulse" />
              ) : (
                <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                  <span title={numericMode === 'compact' ? String(new Set(filtered.map(o=>o.login)).size) : undefined}>{numericMode === 'compact' ? fmtMoney(new Set(filtered.map(o=>o.login)).size, 0).replace(/\.00$/, '') : new Set(filtered.map(o=>o.login)).size}</span>
                  <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">ACCT</span>
                </div>
              )}
            </div>
            {/* Removed "Logins Under 50%" card as requested */}
          </div>

          {/* Table - Show skeleton while loading */}
          <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden flex flex-col flex-1">
            {/* Search and Controls Bar - Inside table container */}
            {sortedAccounts && sortedAccounts.length > 0 && (
              <div className="border-b border-[#E5E7EB] p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Left: Search and Columns */}
                  <div className="flex items-center gap-2 flex-1">
                    {/* Search Bar */}
                    <div className="relative flex-1 max-w-md" ref={searchRef}>
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 18 18">
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
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
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
                    
                    {/* Refresh Button */}
                    <button
                      onClick={() => {
                        if (isRefreshing) return
                        setIsRefreshing(true)
                        console.log('[MarginLevel] Refreshing data...')
                        fetchAccounts()
                        setTimeout(() => setIsRefreshing(false), 2000)
                      }}
                      disabled={isRefreshing}
                      className={`h-8 w-8 rounded-md border shadow-sm flex items-center justify-center transition-all ${
                        isRefreshing
                          ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-50'
                          : 'bg-white border-[#E5E7EB] hover:bg-gray-50 cursor-pointer'
                      }`}
                      title={isRefreshing ? 'Refreshing...' : 'Refresh margin levels'}
                    >
                      <svg
                        className={`w-4 h-4 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>

                    {/* Columns Button (icon only) */}
                    <div className="relative">
                      <button
                        onClick={() => setShowColumnSelector(!showColumnSelector)}
                        className="h-10 w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                        title="Show/Hide Columns"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                          <rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                        </svg>
                      </button>
                      {showColumnSelector && (
                        <div
                          ref={columnSelectorRef}
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
                  <p className="text-gray-500 text-sm">No accounts with margin level below 50%.</p>
                  <p className="text-gray-400 text-xs mt-1">Live updates will appear here</p>
                </div>
              ) : (
                <table className="w-full divide-y divide-gray-200">
                  <thead className="bg-blue-600 sticky top-0 shadow-md" style={{ zIndex: 10 }}>
                    <tr>
                      {renderHeaderCell('login', 'Login')}
                      {renderHeaderCell('name', 'Name')}
                      <th 
                        className="px-3 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                        onClick={() => handleSort('equity')}
                      >
                        <div className="flex items-center gap-1">
                          Equity
                          {sortColumn === 'equity' ? (
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
                      </th>
                      <th 
                        className="px-3 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                        onClick={() => handleSort('margin')}
                      >
                        <div className="flex items-center gap-1">
                          Margin
                          {sortColumn === 'margin' ? (
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
                      </th>
                      <th 
                        className="px-3 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                        onClick={() => handleSort('marginFree')}
                      >
                        <div className="flex items-center gap-1">
                          Margin Free
                          {sortColumn === 'marginFree' ? (
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
                      </th>
                      <th 
                        className="px-3 py-2 text-left text-[11px] font-bold text-white uppercase tracking-wider cursor-pointer hover:bg-blue-700/70 transition-all select-none group"
                        onClick={() => handleSort('marginLevel')}
                      >
                        <div className="flex items-center gap-1">
                          Margin Level
                          {sortColumn === 'marginLevel' ? (
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
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {displayedAccounts.map((a, idx) => {
                      const ml = getMarginLevelPercent(a)
                      return (
                        <tr key={a.login ?? idx} className={`hover:bg-blue-50 transition-colors border-l-2 border-l-[#E1E1E1]`}>
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
                          <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">{a.name || '-'}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap" title={numericMode === 'compact' ? fmtMoneyFull(a.equity, 2) : undefined}>{fmtMoney(a.equity, 2)}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap" title={numericMode === 'compact' ? fmtMoneyFull(a.margin, 2) : undefined}>{fmtMoney(a.margin, 2)}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap" title={numericMode === 'compact' ? fmtMoneyFull(a.marginFree ?? a.margin_free, 2) : undefined}>{fmtMoney(a.marginFree ?? a.margin_free, 2)}</td>
                          <td className="px-3 py-2 text-sm text-gray-900 whitespace-nowrap">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800`}>
                              {formatNumber(ml, 2)}%
                            </span>
                          </td>
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
          allPositionsCache={cachedPositions}
          allOrdersCache={cachedOrders}
          onCacheUpdate={() => {}}
        />
      )}
    </div>
  )
}

export default MarginLevelPage
