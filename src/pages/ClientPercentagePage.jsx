import { useState, useEffect, useRef } from 'react'
import { brokerAPI } from '../services/api'
import { useGroups } from '../contexts/GroupContext'
import { useIB } from '../contexts/IBContext'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import LoadingSpinner from '../components/LoadingSpinner'
import WebSocketIndicator from '../components/WebSocketIndicator'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import ClientPercentageModule from '../components/ClientPercentageModule'

const ClientPercentagePage = () => {
  // Detect mobile device
  const [isMobile, setIsMobile] = useState(false)
  
  const { filterByActiveGroup, activeGroupFilters, getActiveGroupFilter } = useGroups()
  const { filterByActiveIB, selectedIB, ibMT5Accounts } = useIB()
  const { positions: cachedPositions, orders: cachedOrders } = useData()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v ? JSON.parse(v) : false
    } catch {
      return false
    }
  })
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { isAuthenticated } = useAuth()
  const [unauthorized, setUnauthorized] = useState(false)
  const [selectedLogin, setSelectedLogin] = useState(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [stats, setStats] = useState({
    total: 0,
    total_custom: 0,
    total_default: 0,
    default_percentage: 0
  })
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(100)
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchRef = useRef(null)

  // Column visibility states
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const columnSelectorRef = useRef(null)
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    percentage: true,
    type: true,
    comment: true,
    updatedAt: true,
    actions: true,
  })

  const allColumns = [
    { key: 'login', label: 'Client Login', sticky: true },
    { key: 'updatedAt', label: 'Last Updated' },
    { key: 'percentage', label: 'Percentage' },
    { key: 'type', label: 'Type' },
    { key: 'comment', label: 'Comment' },
    { key: 'actions', label: 'Actions' },
  ]

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Column filter states
  const [columnFilters, setColumnFilters] = useState({})
  const [showFilterDropdown, setShowFilterDropdown] = useState(null)
  const filterRefs = useRef({})
  const [filterSearchQuery, setFilterSearchQuery] = useState({})
  const [showNumberFilterDropdown, setShowNumberFilterDropdown] = useState(null)
  const [showTextFilterDropdown, setShowTextFilterDropdown] = useState(null)
  
  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true)
  
  // Define string columns that should show text filters instead of number filters
  const stringColumns = ['login', 'type', 'comment']
  const isStringColumn = (key) => stringColumns.includes(key)
  
  // Custom filter modal states
  const [showCustomFilterModal, setShowCustomFilterModal] = useState(false)
  const [customFilterColumn, setCustomFilterColumn] = useState(null)
  const [customFilterType, setCustomFilterType] = useState('equal')
  const [customFilterValue1, setCustomFilterValue1] = useState('')
  const [customFilterValue2, setCustomFilterValue2] = useState('')
  const [customFilterOperator, setCustomFilterOperator] = useState('AND')

  // State for login column values fetched from API
  const [loginColumnValues, setLoginColumnValues] = useState([])
  const [loadingLoginValues, setLoadingLoginValues] = useState(false)

  // Fetch login values from API
  const fetchLoginValues = async (searchQuery = '') => {
    setLoadingLoginValues(true)
    try {
      const params = {
        page: 1,
        page_size: 1000, // Get more values for the dropdown
        sort_by: 'login',
        sort_order: 'asc'
      }
      
      // Add search query if provided
      if (searchQuery.trim()) {
        params.login = searchQuery.trim()
      }

      const response = await brokerAPI.get('/broker/clients/percentages', { params })
      
      if (response.data?.status === 'success' && response.data?.data?.clients) {
        const logins = response.data.data.clients.map(client => client.client_login)
        // Remove duplicates and sort
        const uniqueLogins = [...new Set(logins)].sort((a, b) => a - b)
        setLoginColumnValues(uniqueLogins)
      }
    } catch (err) {
      console.error('Error fetching login values:', err)
      // Fallback to client-side values on error
      const values = new Set()
      clients.forEach(client => {
        if (client.client_login !== null && client.client_login !== undefined && client.client_login !== '') {
          values.add(client.client_login)
        }
      })
      setLoginColumnValues(Array.from(values).sort((a, b) => a - b))
    } finally {
      setLoadingLoginValues(false)
    }
  }

  // Column filter helper functions
  const getUniqueColumnValues = (columnKey) => {
    // For login column, use API-fetched values
    if (columnKey === 'login' || columnKey === 'client_login') {
      const searchQuery = filterSearchQuery[columnKey]?.toLowerCase() || ''
      if (searchQuery) {
        return loginColumnValues.filter(value => 
          String(value).toLowerCase().includes(searchQuery)
        )
      }
      return loginColumnValues
    }

    // For other columns, use client-side filtering
    const values = new Set()
    clients.forEach(client => {
      let value = client[columnKey]
      if (value !== null && value !== undefined && value !== '') {
        // Format date for updated_at column
        if (columnKey === 'updated_at' && value) {
          const date = new Date(value)
          value = date.toLocaleDateString('en-GB')
        }
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
    const selectedValues = columnFilters[columnKey] || []
    return allValues.length > 0 && selectedValues.length === allValues.length
  }

  // Apply custom number filter
  const applyCustomNumberFilter = () => {
    if (!customFilterColumn || !customFilterValue1) return

    const isTextColumn = customFilterColumn === 'is_custom'
    const filterConfig = {
      type: customFilterType,
      value1: isTextColumn ? customFilterValue1 : parseFloat(customFilterValue1),
      value2: customFilterValue2 ? (isTextColumn ? customFilterValue2 : parseFloat(customFilterValue2)) : null,
      operator: customFilterOperator
    }

    const filterKey = isTextColumn ? `${customFilterColumn}_text` : `${customFilterColumn}_number`
    setColumnFilters(prev => ({
      ...prev,
      [filterKey]: filterConfig
    }))

    // Close modal and dropdown
    setShowCustomFilterModal(false)
    setShowFilterDropdown(null)
    setShowNumberFilterDropdown(null)
    setShowTextFilterDropdown(null)
    
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

  // Check if value matches text filter
  const matchesTextFilter = (value, filterConfig) => {
    if (!filterConfig) return true
    
    const strValue = String(value || '').toLowerCase()
    const { type, value1 } = filterConfig
    const searchValue = String(value1 || '').toLowerCase()

    switch (type) {
      case 'equal':
        return strValue === searchValue
      case 'notEqual':
        return strValue !== searchValue
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
  
  // Edit modal states
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [editPercentage, setEditPercentage] = useState('')
  const [editComment, setEditComment] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState('client_login')
  const [sortDirection, setSortDirection] = useState('asc')

  // Module filter removed (belongs to Live Dealing)

  // Critical: Set unmounted flag ASAP to unblock route transitions
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Fetch login values when login filter dropdown opens or search query changes
  useEffect(() => {
    if (showFilterDropdown === 'login' || showFilterDropdown === 'client_login') {
      const searchQuery = filterSearchQuery['login'] || filterSearchQuery['client_login'] || ''
      fetchLoginValues(searchQuery)
    }
  }, [showFilterDropdown, filterSearchQuery['login'], filterSearchQuery['client_login']])

  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!isAuthenticated || unauthorized || hidden) return
    fetchAllClientPercentages(1)
  }, [isAuthenticated, unauthorized])

  // Fetch data when search query or sort changes (reset to page 1)
  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!isAuthenticated || unauthorized || hidden) return
    
    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(() => {
      setCurrentPage(1)
      fetchAllClientPercentages(1)
    }, 300)
    
    return () => clearTimeout(timeoutId)
  }, [searchQuery, sortColumn, sortDirection, isAuthenticated, unauthorized])

  // Fetch data when page changes
  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!isAuthenticated || unauthorized || hidden) return
    if (currentPage > 1) {
      fetchAllClientPercentages(currentPage)
    }
  }, [currentPage, isAuthenticated, unauthorized])

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

  // No longer need click outside handler for suggestions

  const fetchAllClientPercentages = async (page = 1) => {
    try {
      setLoading(true)
      setError('')
      
      const params = { 
        page, 
        page_size: itemsPerPage,
        sort_by: sortColumn === 'client_login' ? 'login' : sortColumn,
        sort_order: sortDirection
      }
      
      // Add search parameter if search query exists
      const trimmedQuery = searchQuery.trim().toLowerCase()
      
      // Check if searching for type (custom/default)
      if (trimmedQuery === 'custom') {
        params.has_custom = true
      } else if (trimmedQuery === 'default') {
        params.has_custom = false
      } else if (trimmedQuery) {
        // Otherwise search by login
        params.login = searchQuery.trim()
      }
      
      const response = await brokerAPI.getAllClientPercentages(params)
      
      const clientsData = response.data?.clients || []
      setClients(clientsData)
      setStats({
        total: response.data?.total || clientsData.length,
        total_custom: response.data?.total_custom || 0,
        total_default: response.data?.total_default || 0,
        default_percentage: response.data?.default_percentage || 0
      })
      
      setLoading(false)
    } catch (err) {
      console.error('Error fetching client percentages:', err)
      setError('Failed to load client percentages')
      if (err?.response?.status === 401) setUnauthorized(true)
      setLoading(false)
    }
  }

  const handleEditClick = (client) => {
    setSelectedClient(client)
    setEditPercentage(client.percentage || '')
    setEditComment(client.comment || '')
    setShowEditModal(true)
  }

  const handleSavePercentage = async () => {
    if (!selectedClient) return
    
    const percentage = parseFloat(editPercentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      alert('Please enter a valid percentage between 0 and 100')
      return
    }
    
    try {
      setSaving(true)
      await brokerAPI.setClientPercentage(
        selectedClient.client_login,
        percentage,
        editComment || `Custom percentage: ${percentage}%`
      )
      
      // Refresh the list
      await fetchAllClientPercentages()
      
      setShowEditModal(false)
      setSelectedClient(null)
      setEditPercentage('')
      setEditComment('')
      setSaving(false)
    } catch (err) {
      console.error('Error setting client percentage:', err)
      alert('Failed to save percentage. Please try again.')
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setShowEditModal(false)
    setSelectedClient(null)
    setEditPercentage('')
    setEditComment('')
  }

  // Note: Search is now handled by API, not client-side
  // The API endpoint accepts 'login' parameter for searching

  // Handle search - triggered by search icon click or Enter key
  const handleSearch = () => {
    setSearchQuery(searchInput)
    setCurrentPage(1)
  }

  // Get card icon path based on card title
  const getCardIcon = (cardTitle) => {
    const iconMap = {
      'Total Clients': '/Desktop cards icons/Total Clients.svg',
      'Custom Percentages': '/Desktop cards icons/TOTAL COMMISION.svg',
      'Using Default': '/Desktop cards icons/AVAILABLE Commision.svg',
      'Default Percentage': '/Desktop cards icons/TOTAL COMMISION%25.svg',
    }
    return iconMap[cardTitle] || '/Desktop cards icons/Total Clients.svg'
  }

  // Sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const sortedClients = () => {
    // API handles search and sort, just apply filters here
    let filtered = clients
    
    // Apply IB filter first (cumulative order: IB -> Group)
    let ibFiltered = filterByActiveIB(filtered, 'client_login')
    
    // Apply group filter on top of IB filter
    let groupFiltered = filterByActiveGroup(ibFiltered, 'client_login', 'clientpercentage')
    
    // Continue with groupFiltered as ibFiltered for consistency
    ibFiltered = groupFiltered
    
    // Apply column filters
    Object.entries(columnFilters).forEach(([columnKey, values]) => {
      if (columnKey.endsWith('_number')) {
        // Apply number filter
        const actualColumn = columnKey.replace('_number', '')
        ibFiltered = ibFiltered.filter(client => matchesNumberFilter(client[actualColumn], values))
      } else if (columnKey.endsWith('_text')) {
        // Apply text filter
        const actualColumn = columnKey.replace('_text', '')
        ibFiltered = ibFiltered.filter(client => matchesTextFilter(client[actualColumn], values))
      } else if (values && values.length > 0) {
        // Apply checkbox filter
        ibFiltered = ibFiltered.filter(client => {
          let clientValue = client[columnKey]
          
          // Special handling for updated_at field - format date to match filter values
          if (columnKey === 'updated_at' && clientValue) {
            clientValue = new Date(clientValue).toLocaleDateString('en-GB')
          }
          
          // Special handling for is_custom field - compare boolean/number values
          if (columnKey === 'is_custom') {
            // Convert clientValue to comparable format
            const normalizedClientValue = clientValue === true || clientValue === 1 || clientValue === '1'
            return values.some(filterValue => {
              const normalizedFilterValue = filterValue === true || filterValue === 1 || filterValue === '1'
              return normalizedClientValue === normalizedFilterValue
            })
          }
          return values.includes(clientValue)
        })
      }
    })
    
    return [...ibFiltered].sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]
      
      // Handle nulls
      if (aVal === null || aVal === undefined) aVal = ''
      if (bVal === null || bVal === undefined) bVal = ''
      
      // Convert to string for comparison
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }

  // Pagination
  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value)
    setCurrentPage(1)
  }

  const getAvailableOptions = () => {
    const totalItems = stats.total
    const options = []
    
    // Start from 100 and increment by 100, dynamically based on total data
    for (let i = 100; i <= totalItems; i += 100) {
      options.push(i)
      if (options.length >= 10) break // Limit to 10 options
    }
    
    // If no options generated or total is less than 100, add at least one option
    if (options.length === 0) {
      options.push(Math.max(100, totalItems))
    }
    
    return options
  }

  const paginatedClients = () => {
    // Server-side pagination: just return sorted clients as-is
    return sortedClients()
  }

  const totalPages = Math.ceil(stats.total / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const displayedClients = paginatedClients()

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!isMountedRef.current) return
      
      // Check if click is inside any filter-related element
      const isInsideMainFilter = showFilterDropdown && filterRefs.current[showFilterDropdown] && 
                                  filterRefs.current[showFilterDropdown].contains(event.target)
      
      const numberFilterElements = document.querySelectorAll('[data-number-filter]')
      let isInsideNumberFilter = false
      numberFilterElements.forEach(el => {
        if (el.contains(event.target)) {
          isInsideNumberFilter = true
        }
      })
      
      // If click is outside both main filter and number filter dropdowns, close them
      if (!isInsideMainFilter && !isInsideNumberFilter) {
        if (showFilterDropdown) {
          setShowFilterDropdown(null)
        }
        if (showNumberFilterDropdown) {
          setShowNumberFilterDropdown(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showFilterDropdown, showNumberFilterDropdown])

  // Close column selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showColumnSelector && columnSelectorRef.current) {
        if (!columnSelectorRef.current.contains(event.target)) {
          setShowColumnSelector(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showColumnSelector])

  // Helper function to render table header with filter
  // Helper function to render table header without filters (only sorting)
  const renderHeaderCell = (columnKey, label, sortKey = null) => {
    const actualSortKey = sortKey || columnKey
    const filterCount = getActiveFilterCount(columnKey)
    
    return (
      <th 
        className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider hover:bg-blue-700 transition-colors select-none group border-b border-blue-500 cursor-pointer"
        style={{ backgroundColor: '#2563eb' }}
        onClick={() => {
          setSortColumn(actualSortKey)
          setSortDirection(prev => sortColumn === actualSortKey && prev === 'asc' ? 'desc' : 'asc')
        }}
      >
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-1 text-white">
            <span>{label}</span>
            {getSortIcon(actualSortKey)}
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
              className={`p-1 rounded hover:bg-blue-700 transition-colors ${filterCount > 0 ? 'text-yellow-300' : 'text-white/80'}`}
              title="Filter column"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {filterCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-300 text-blue-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {filterCount}
                </span>
              )}
            </button>

            {showFilterDropdown === columnKey && (
              <div className="fixed bg-white border-2 border-slate-300 rounded-lg shadow-2xl z-[9999] w-64" 
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
                      handleSort(columnKey)
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
                      handleSort(columnKey)
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

                {/* Number Filters (only for numeric columns) */}
                {!isStringColumn(columnKey) && (
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
                                  setShowCustomFilterModal(false)
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
                                    setShowCustomFilterModal(false)
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
                                setShowCustomFilterModal(false)
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
                )}

                {/* Text Filters (only for string columns) */}
                {isStringColumn(columnKey) && (
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
                        <span>Text Filters</span>
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

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
                                <option value="startsWith">Starts With...</option>
                                <option value="endsWith">Ends With...</option>
                                <option value="contains">Contains...</option>
                                <option value="doesNotContain">Does Not Contain...</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-normal text-gray-700 mb-1">VALUE</label>
                              <input
                                type="text"
                                placeholder="Enter value"
                                value={customFilterValue1}
                                onChange={(e) => setCustomFilterValue1(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    applyCustomNumberFilter()
                                    setShowNumberFilterDropdown(null)
                                    setShowCustomFilterModal(false)
                                  }
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 text-gray-900 bg-white"
                              />
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-gray-200">
                              <button
                                onClick={() => {
                                  applyCustomNumberFilter()
                                  setShowNumberFilterDropdown(null)
                                  setShowCustomFilterModal(false)
                                }}
                                disabled={!customFilterValue1}
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
                )}

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
                    {(columnKey === 'login' || columnKey === 'client_login') && loadingLoginValues ? (
                      <div className="px-2 py-8 text-center">
                        <svg className="animate-spin h-5 w-5 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="text-[11px] text-slate-500 mt-2">Loading...</p>
                      </div>
                    ) : getUniqueColumnValues(columnKey).length === 0 ? (
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
                            {value === true || value === 1 ? 'Custom' : value === false || value === 0 ? 'Default' : value}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-2 py-1.5 border-t border-slate-200 bg-slate-50 rounded-b flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowFilterDropdown(null)
                    }}
                    className="flex-1 px-3 py-1.5 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowFilterDropdown(null)
                    }}
                    className="flex-1 px-3 py-1.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
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

  const getSortIcon = (column) => {
    if (sortColumn !== column) {
      return (
        <svg className="w-4 h-4 opacity-0 group-hover:opacity-40 text-white transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
      return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-white transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-white rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    )
  }

  // Detect mobile and update state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // If mobile, use mobile module (after all hooks are called)
  if (isMobile) {
    return <ClientPercentageModule />
  }

  return (
    <div className="flex h-screen bg-gray-50">
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
              <h1 className="text-xl font-bold text-[#1A1A1A]">Client Percentage</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">Manage custom profit-sharing percentages</p>
            </div>

            {/* Action Buttons - All on right side */}
            <div className="flex items-center gap-2">
                  <GroupSelector 
                    moduleName="clientpercentage" 
                    onCreateClick={() => {
                      console.log('[ClientPercentagePage] onCreateClick called')
                      console.log('[ClientPercentagePage] Current showGroupModal:', showGroupModal)
                      setEditingGroup(null)
                      setShowGroupModal(true)
                      console.log('[ClientPercentagePage] Set showGroupModal to true')
                    }}
                    onEditClick={(group) => {
                      console.log('[ClientPercentagePage] onEditClick called for group:', group)
                      setEditingGroup(group)
                      setShowGroupModal(true)
                    }}
                  />
                </div>
              </div>
            </div>
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-r p-4 shadow-sm">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Summary Cards - Client2 Face Card Design */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Total Clients</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0">
                  <img 
                    src={getCardIcon('Total Clients')} 
                    alt="Total Clients"
                    style={{ width: '100%', height: '100%' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span>{stats.total}</span>
                <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">CLI</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Custom Percentages</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0">
                  <img 
                    src={getCardIcon('Custom Percentages')} 
                    alt="Custom Percentages"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span>{stats.total_custom}</span>
                <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">CUST</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Using Default</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0">
                  <img 
                    src={getCardIcon('Using Default')} 
                    alt="Using Default"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span>{stats.total_default}</span>
                <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">DEF</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Default Percentage</span>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0">
                  <img 
                    src={getCardIcon('Default Percentage')} 
                    alt="Default Percentage"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span>{stats.default_percentage}</span>
                <span className="text-[10px] md:text-xs font-normal text-[#6B7280]">%</span>
              </div>
            </div>
          </div>

          {/* Table */}
          {clients.length === 0 && !loading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No client data found</h3>
              <p className="text-sm text-gray-500">Client percentage data will appear here</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-[#E5E7EB] overflow-hidden flex flex-col flex-1">
              {/* Search and Controls Bar - Inside table container */}
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
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search"
                        className="w-full h-10 pl-10 pr-10 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                      
                      {searchInput && (
                        <button
                          onClick={() => {
                            setSearchInput('')
                            setSearchQuery('')
                            setCurrentPage(1)
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                          title="Clear search"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
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

              <div className="overflow-y-auto flex-1">
                <table className="min-w-full divide-y divide-[#E5E7EB]">
                <thead className="bg-blue-600 sticky top-0 z-10" style={{ backgroundColor: '#2563eb' }}>
                  <tr>
                    {visibleColumns.login && renderHeaderCell('client_login', 'Client Login', 'client_login')}
                    {visibleColumns.updatedAt && renderHeaderCell('updated_at', 'Last Updated', 'updated_at')}
                    {visibleColumns.percentage && renderHeaderCell('percentage', 'Percentage')}
                    {visibleColumns.type && renderHeaderCell('is_custom', 'Type', 'is_custom')}
                    {visibleColumns.comment && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider" style={{ backgroundColor: '#2563eb' }}>
                        Comment
                      </th>
                    )}
                    {visibleColumns.actions && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider" style={{ backgroundColor: '#2563eb' }}>
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>

                {/* YouTube-style Loading Progress Bar */}
                {loading && (
                  <thead>
                    <tr>
                      <th colSpan={Object.values(visibleColumns).filter(v => v).length} className="p-0" style={{ height: '3px' }}>
                        <div className="relative w-full h-full bg-gray-200 overflow-hidden">
                          <style>{`
                            @keyframes shimmerSlidePercentage {
                              0% { transform: translateX(-100%); }
                              100% { transform: translateX(400%); }
                            }
                            .shimmer-loading-bar-percentage {
                              width: 30%;
                              height: 100%;
                              background: #2563eb;
                              animation: shimmerSlidePercentage 0.9s linear infinite;
                            }
                          `}</style>
                          <div className="shimmer-loading-bar-percentage absolute top-0 left-0 h-full" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                )}

                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(v => v).length} className="px-6 py-8 text-center text-sm text-gray-400">
                        Loading client percentages...
                      </td>
                    </tr>
                  ) : displayedClients.length === 0 ? (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(v => v).length} className="px-6 py-8 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <svg className="w-16 h-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-gray-600 text-lg font-semibold mb-2">No clients found</p>
                            <p className="text-gray-500 text-sm mb-4">Try adjusting your filters</p>
                          </div>
                          <button
                            onClick={() => {
                              setColumnFilters({})
                              setFilterSearchQuery({})
                              setSearchQuery('')
                              setShowSuggestions(false)
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md text-sm font-semibold"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Clear All Filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                  displayedClients.map((client, index) => (
                    <tr key={client.client_login} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      {visibleColumns.login && (
                        <td 
                          className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                          onClick={() => setSelectedLogin(client.client_login)}
                          title="Click to view login details"
                        >
                          {client.client_login}
                        </td>
                      )}
                      {visibleColumns.updatedAt && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {client.updated_at ? new Date(client.updated_at).toLocaleDateString('en-GB') : '-'}
                        </td>
                      )}
                      {visibleColumns.percentage && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-sm font-semibold ${
                            client.is_custom 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {client.percentage}%
                          </span>
                        </td>
                      )}
                      {visibleColumns.type && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            client.is_custom 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {client.is_custom ? 'Custom' : 'Default'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.comment && (
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">
                          {client.comment || '-'}
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleEditClick(client)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Edit Modal */}
      {showEditModal && selectedClient && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-xl w-full overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-8 py-5 bg-blue-600 border-b border-blue-700">
              <h2 className="text-xl font-semibold text-white">
                Set Custom Percentage
              </h2>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-8 py-6">
              <div className="space-y-6">
                {/* Client Information */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Client Login
                  </label>
                  <input
                    type="text"
                    value={selectedClient.client_login}
                    readOnly
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                {/* Percentage Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Percentage (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editPercentage}
                      onChange={(e) => setEditPercentage(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 pr-10 bg-white border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                      required
                      disabled={saving}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">Value must be between 0 and 100</p>
                </div>

                {/* Comment Textarea */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comment
                  </label>
                  <textarea
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 resize-none"
                    placeholder="Optional comment about this percentage"
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center gap-3 pt-6 mt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="flex-1 px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePercentage}
                  disabled={saving}
                  className="flex-1 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    'Save Percentage'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Create Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false)
          setEditingGroup(null)
        }}
        availableItems={clients}
        loginField="client_login"
        displayField="percentage"
        secondaryField="type"
        editGroup={editingGroup}
      />

      {/* Custom Filter Modal */}
      {showCustomFilterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Custom Filter</h3>
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
            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Show rows where:</p>
                <p className="text-sm text-gray-600 mb-3">{customFilterColumn}</p>
              </div>

              {/* Filter Type Dropdown */}
              <div>
                <select
                  value={customFilterType}
                  onChange={(e) => setCustomFilterType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 bg-white"
                >
                  {customFilterColumn === 'is_custom' ? (
                    // Text filter options
                    <>
                      <option value="equal">Equal</option>
                      <option value="notEqual">Not Equal</option>
                      <option value="startsWith">Starts With</option>
                      <option value="endsWith">Ends With</option>
                      <option value="contains">Contains</option>
                      <option value="doesNotContain">Does Not Contain</option>
                    </>
                  ) : (
                    // Number filter options
                    <>
                      <option value="equal">Equal</option>
                      <option value="notEqual">Not Equal</option>
                      <option value="lessThan">Less Than</option>
                      <option value="lessThanOrEqual">Less Than Or Equal</option>
                      <option value="greaterThan">Greater Than</option>
                      <option value="greaterThanOrEqual">Greater Than Or Equal</option>
                      <option value="between">Between</option>
                    </>
                  )}
                </select>
              </div>

              {/* Value Input */}
              <div>
                <input
                  type={customFilterColumn === 'is_custom' ? 'text' : 'number'}
                  value={customFilterValue1}
                  onChange={(e) => setCustomFilterValue1(e.target.value)}
                  placeholder="Enter the value"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 bg-white"
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
                      <span className="text-sm text-gray-700">AND</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={customFilterOperator === 'OR'}
                        onChange={() => setCustomFilterOperator('OR')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">OR</span>
                    </label>
                  </div>

                  <div>
                    <input
                      type="number"
                      value={customFilterValue2}
                      onChange={(e) => setCustomFilterValue2(e.target.value)}
                      placeholder="Enter the value"
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowCustomFilterModal(false)
                  setCustomFilterValue1('')
                  setCustomFilterValue2('')
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyCustomNumberFilter}
                disabled={!customFilterValue1}
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

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

export default ClientPercentagePage
