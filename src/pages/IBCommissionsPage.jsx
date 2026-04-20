import { useState, useEffect, useRef, useMemo } from 'react'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import EditPercentageModal from '../components/EditPercentageModal'
import BulkSyncModal from '../components/BulkSyncModal'
import BulkUpdatePercentageModal from '../components/BulkUpdatePercentageModal'
import LoadingSpinner from '../components/LoadingSpinner'
import Sidebar from '../components/Sidebar'
import IBCommissionsModule from '../components/IBCommissionsModule'

const IBCommissionsPage = () => {
  // Detect mobile device
  const [isMobile, setIsMobile] = useState(false)
  
  const getInitialSidebarOpen = () => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      if (v === null) return false
      return JSON.parse(v)
    } catch { return false }
  }
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRecords, setTotalRecords] = useState(0)
  const [editingIB, setEditingIB] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showBulkSyncModal, setShowBulkSyncModal] = useState(false)
  
  // Face card states
  const [totalCommission, setTotalCommission] = useState(0)
  const [totalAvailableCommission, setTotalAvailableCommission] = useState(0)
  const [totalCommissionPercentage, setTotalCommissionPercentage] = useState(0)
  const [totalAvailableCommissionPercentage, setTotalAvailableCommissionPercentage] = useState(0)
  const [totalsLoading, setTotalsLoading] = useState(true)
  
  // Bulk update states
  const [selectedIBs, setSelectedIBs] = useState([])
  const [bulkPercentage, setBulkPercentage] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false)
  const { isAuthenticated } = useAuth()
  const [unauthorized, setUnauthorized] = useState(false)
  
  // Column filter states
  const [columnFilters, setColumnFilters] = useState({})
  const [showFilterDropdown, setShowFilterDropdown] = useState(null)
  const filterRefs = useRef({})
  const [filterSearchQuery, setFilterSearchQuery] = useState({})
  const [showNumberFilterDropdown, setShowNumberFilterDropdown] = useState(null)
  
  // Define string columns that should show text filters instead of number filters
  const stringColumns = ['ib_login', 'ib_name']
  const isStringColumn = (key) => stringColumns.includes(key)
  
  // Custom filter modal states
  const [customFilterColumn, setCustomFilterColumn] = useState(null)
  const [customFilterType, setCustomFilterType] = useState('equal')
  const [customFilterValue1, setCustomFilterValue1] = useState('')
  const [customFilterValue2, setCustomFilterValue2] = useState('')
  
  // Sorting states - default to created_at desc as per API
  const [sortColumn, setSortColumn] = useState('created_at')
  const [sortDirection, setSortDirection] = useState('desc')
  
  // Column resizing states
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem('ibColumnWidths')
      return saved ? JSON.parse(saved) : {}
    } catch (e) {
      return {}
    }
  })
  const [resizingColumn, setResizingColumn] = useState(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const headerRefs = useRef({})
  const resizeRAF = useRef(null)
  
  // Search debounce
  const searchTimeoutRef = useRef(null)

  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!isAuthenticated || unauthorized || hidden) return
    fetchCommissions()
    fetchCommissionTotals()
    
    const intervalId = setInterval(() => {
      const hiddenNow = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (!hiddenNow) fetchCommissionTotals()
    }, 60 * 60 * 1000)
    return () => clearInterval(intervalId)
  }, [currentPage, itemsPerPage, sortColumn, sortDirection, isAuthenticated, unauthorized])

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

  // Fetch commission totals for face cards
  const fetchCommissionTotals = async () => {
    try {
      setTotalsLoading(true)
      const response = await brokerAPI.getIBCommissionTotals()
      if (response?.data?.data) {
        const data = response.data.data
        // Backend handles USC normalization; use values as-is
        setTotalCommission(data.total_commission || 0)
        setTotalAvailableCommission(data.total_available_commission || 0)
        setTotalCommissionPercentage(data.total_commission_percentage || 0)
        setTotalAvailableCommissionPercentage(data.total_available_commission_percentage || 0)
      }
    } catch (error) {
      console.error('Error fetching commission totals:', error)
      if (error?.response?.status === 401) setUnauthorized(true)
    } finally {
      setTotalsLoading(false)
    }
  }

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      if (currentPage === 1) {
        fetchCommissions()
      } else {
        setCurrentPage(1) // Reset to page 1, which will trigger fetchCommissions via the first useEffect
      }
    }, 500)
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  const fetchCommissions = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await brokerAPI.getIBCommissions(currentPage, itemsPerPage, searchQuery, sortColumn, sortDirection)
      
      if (response?.data) {
        setCommissions(response.data.records || [])
        const pagination = response.data.pagination || {}
        setTotalPages(pagination.total_pages || 1)
        setTotalRecords(pagination.total_records || 0)
      } else {
        setError('Failed to load IB commissions')
      }
    } catch (error) {
      console.error('Error fetching IB commissions:', error)
      setError(error.response?.data?.message || 'Failed to load IB commissions')
      if (error?.response?.status === 401) setUnauthorized(true)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (ib) => {
    setEditingIB(ib)
    setShowEditModal(true)
  }

  const handleUpdateSuccess = () => {
    setShowEditModal(false)
    setEditingIB(null)
    fetchCommissions() // Refresh the list
    fetchCommissionTotals() // Refresh face card totals
  }

  const handleBulkSyncSuccess = () => {
    setShowBulkSyncModal(false)
    fetchCommissions() // Refresh the list
    fetchCommissionTotals() // Refresh face card totals
  }

  // Handle select all checkbox
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIBs(sortedCommissions.map(ib => ib.id))
    } else {
      setSelectedIBs([])
    }
  }

  // Handle individual checkbox
  const handleSelectIB = (ibId) => {
    setSelectedIBs(prev => {
      if (prev.includes(ibId)) {
        return prev.filter(id => id !== ibId)
      } else {
        return [...prev, ibId]
      }
    })
  }

  // Handle opening bulk update modal
  const handleOpenBulkModal = () => {
    if (selectedIBs.length === 0) {
      setError('Please select at least one IB by checking the checkboxes')
      setTimeout(() => setError(''), 3000)
      return
    }
    setShowBulkUpdateModal(true)
  }

  // Handle bulk update
  const handleBulkUpdate = async () => {
    const percentage = parseFloat(bulkPercentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      setError('Please enter a valid percentage between 0 and 100')
      setTimeout(() => setError(''), 3000)
      return
    }

    try {
      setBulkUpdating(true)
      
      // Format updates array as expected by API
      const updates = selectedIBs.map(id => ({
        id,
        percentage
      }))
      
      const response = await brokerAPI.bulkUpdateIBPercentages(updates)
      
      if (response.status === 'success') {
        setSelectedIBs([])
        setBulkPercentage('')
        setShowBulkUpdateModal(false)
        fetchCommissions()
        fetchCommissionTotals() // Refresh face card totals
      } else {
        setError('Bulk update failed: ' + (response.message || 'Unknown error'))
        setTimeout(() => setError(''), 3000)
      }
    } catch (error) {
      console.error('Error during bulk update:', error)
      setError('Bulk update failed: ' + (error.response?.data?.message || error.message))
      setTimeout(() => setError(''), 3000)
    } finally {
      setBulkUpdating(false)
    }
  }

  const formatCurrency = (value) => {
    return `$${parseFloat(value || 0).toFixed(2)}`
  }

  // Format number in Indian currency format (no $ symbol, with commas)
  const formatIndianNumber = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '0.00'
    const num = parseFloat(value).toFixed(2)
    const [intPart, decPart] = num.split('.')
    const lastThree = intPart.slice(-3)
    const otherDigits = intPart.slice(0, -3)
    const formatted = otherDigits.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + (otherDigits ? ',' : '') + lastThree
    return `${formatted}.${decPart}`
  }

  // Get card icon path based on card title
  const getCardIcon = (cardTitle) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'Total Rebate': `${baseUrl}Desktop cards icons/TOTAL COMMISION.svg`,
      'Available Rebate': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'Disbursed Rebate': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'Total Rebate %': `${baseUrl}Desktop cards icons/TOTAL COMMISION%25.svg`,
      'Available Rebate %': `${baseUrl}Desktop cards icons/AVAILABLE Commision%25.svg`,
    }
    return iconMap[cardTitle] || '/Desktop cards icons/TOTAL COMMISION.svg'
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  // Column filter helper functions
  const getUniqueColumnValues = (columnKey) => {
    const values = new Set()
    commissions.forEach(commission => {
      let value = commission[columnKey]
      if (value !== null && value !== undefined && value !== '') {
        // Format date for created_at/updated_at columns
        if ((columnKey === 'created_at' || columnKey === 'updated_at') && value) {
          value = formatDate(value)
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

    const isTextColumn = isStringColumn(customFilterColumn)
    const filterConfig = {
      type: customFilterType,
      value1: isTextColumn ? customFilterValue1 : parseFloat(customFilterValue1),
      value2: customFilterValue2 ? (isTextColumn ? customFilterValue2 : parseFloat(customFilterValue2)) : null
    }

    const filterKey = isTextColumn ? `${customFilterColumn}_text` : `${customFilterColumn}_number`
    setColumnFilters(prev => ({
      ...prev,
      [filterKey]: filterConfig
    }))

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

  // Handle column sorting - triggers API call via useEffect
  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      // Toggle direction if clicking same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      // New column - default to desc for most cases, asc for name
      setSortColumn(columnKey)
      setSortDirection(columnKey === 'name' ? 'asc' : 'desc')
    }
  }

  // Since sorting is now done by API, just use commissions as-is
  const sortedCommissions = commissions

  // Column resize handlers
  const handleResizeStart = (e, columnKey) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    resizeStartX.current = e.clientX
    const measured = headerRefs.current?.[columnKey]?.getBoundingClientRect()?.width
    resizeStartWidth.current = measured || columnWidths[columnKey] || 150
  }

  const handleResizeMove = (e) => {
    if (!resizingColumn) return
    const diff = e.clientX - resizeStartX.current
    const nextWidth = Math.max(100, resizeStartWidth.current + diff)
    if (resizeRAF.current) cancelAnimationFrame(resizeRAF.current)
    resizeRAF.current = requestAnimationFrame(() => {
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: nextWidth }))
    })
  }

  const handleResizeEnd = () => {
    setResizingColumn(null)
  }

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
  }, [resizingColumn])

  // Persist column widths
  useEffect(() => {
    try {
      localStorage.setItem('ibColumnWidths', JSON.stringify(columnWidths))
    } catch (e) {}
  }, [columnWidths])

  // Detect mobile and update state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Handle clicks outside filter dropdown to close it
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Don't close if clicking inside the dropdown or number filter
      if (e.target.closest('[data-filter-dropdown]') || 
          e.target.closest('[data-number-filter]') ||
          e.target.closest('[data-filter-button]')) {
        return
      }
      setShowFilterDropdown(null)
      setShowNumberFilterDropdown(null)
    }

    if (showFilterDropdown || showNumberFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilterDropdown, showNumberFilterDropdown])

  // If mobile, use mobile module (after all hooks are called)
  if (isMobile) {
    return <IBCommissionsModule />
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
              <h1 className="text-xl font-bold text-[#1A1A1A]">IB Commissions</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">Manage introducing broker commission percentages</p>
            </div>
            
            {/* Action Buttons - All on right side */}
            <div className="flex items-center gap-2">
              {/* Note: Bulk Update button is in the search controls section below */}
            </div>
          </div>
        </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start gap-1.5 mb-1.5 min-h-[20px]">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight mb-1.5">Total Rebate</p>
                  <p className="text-sm md:text-base font-bold text-[#000000] leading-none">
                    {totalsLoading ? (
                      <span className="text-[#9CA3AF]">...</span>
                    ) : (
                      formatIndianNumber(totalCommission)
                    )}
                  </p>
                </div>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Total Rebate')} 
                    alt="Total Rebate"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start gap-1.5 mb-1.5 min-h-[20px]">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight mb-1.5">Available Rebate</p>
                  <p className="text-sm md:text-base font-bold text-[#000000] leading-none">
                    {totalsLoading ? (
                      <span className="text-[#9CA3AF]">...</span>
                    ) : (
                      formatIndianNumber(totalAvailableCommission)
                    )}
                  </p>
                </div>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Available Rebate')} 
                    alt="Available Rebate"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start gap-1.5 mb-1.5 min-h-[20px]">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight mb-1.5">Disbursed Rebate</p>
                  <p className="text-sm md:text-base font-bold text-[#000000] leading-none">
                    {totalsLoading ? (
                      <span className="text-[#9CA3AF]">...</span>
                    ) : (
                      formatIndianNumber(totalCommission - totalAvailableCommission)
                    )}
                  </p>
                </div>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Disbursed Rebate')} 
                    alt="Disbursed Rebate"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start gap-1.5 mb-1.5 min-h-[20px]">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight mb-1.5">Total Rebate %</p>
                  <p className="text-sm md:text-base font-bold text-[#000000] leading-none">
                    {totalsLoading ? (
                      <span className="text-[#9CA3AF]">...</span>
                    ) : (
                      parseFloat(totalCommissionPercentage || 0).toFixed(2)
                    )}
                  </p>
                </div>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Total Rebate %')} 
                    alt="Total Rebate %"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start gap-1.5 mb-1.5 min-h-[20px]">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-tight mb-1.5">Available Rebate %</p>
                  <p className="text-sm md:text-base font-bold text-[#000000] leading-none">
                    {totalsLoading ? (
                      <span className="text-[#9CA3AF]">...</span>
                    ) : (
                      parseFloat(totalAvailableCommissionPercentage || 0).toFixed(2)
                    )}
                  </p>
                </div>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-md flex items-center justify-center flex-shrink-0 ml-1">
                  <img 
                    src={getCardIcon('Available Rebate %')} 
                    alt="Available Rebate %"
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden">
            <div className="h-full bg-white rounded-lg shadow-sm border border-[#E5E7EB] flex flex-col">
            
            {/* Search and Controls Bar - Inside table container */}
            <div className="border-b border-[#E5E7EB] p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                {/* Left: Search and Bulk Update */}
                <div className="flex items-center gap-3 flex-1">
                  <div className="relative flex-1 max-w-md">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 18 18">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search"
                      className="w-full h-10 pl-10 pr-10 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                        title="Clear search"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={handleOpenBulkModal}
                    className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Bulk Update
                  </button>
                </div>

                {/* Right: Pagination */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
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

                  <div className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-[#374151]">
                    <input
                      type="number"
                      min="1"
                      max={totalPages}
                      value={currentPage}
                      onChange={(e) => {
                        const page = Number(e.target.value);
                        if (!isNaN(page) && page >= 1 && page <= totalPages) {
                          setCurrentPage(page);
                        }
                      }}
                      className="w-12 h-7 border border-[#E5E7EB] rounded-lg text-center text-sm font-semibold text-[#1F2937]"
                    />
                    <span className="text-[#9CA3AF]">/</span>
                    <span className="text-[#6B7280]">{totalPages}</span>
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
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
            
            {/* Error Message */}
            {error && (
              <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Table Container */}
            <div className="flex-1 overflow-auto">
              <div className="border border-[#E5E7EB] rounded-lg overflow-hidden shadow-sm">
                  <table className="w-full border-collapse">
                    <thead className="bg-blue-600 sticky top-0 z-10">
                      <tr>
                        {/* Checkbox Column */}
                        <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider border-b-2 border-blue-700 w-12 hover:bg-blue-700/80 transition-colors">
                          <input
                            type="checkbox"
                            checked={sortedCommissions.length > 0 && selectedIBs.length === sortedCommissions.length}
                            onChange={handleSelectAll}
                            className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                          />
                        </th>
                        {[ 
                          { key: 'name', label: 'Name', align: 'left', width: columnWidths.name || 200 },
                          { key: 'email', label: 'Email', align: 'left', width: columnWidths.email || 250 },
                          { key: 'percentage', label: 'Percentage', align: 'left', width: columnWidths.percentage || 120 },
                          { key: 'total_commission', label: 'Total Rebate', align: 'right', width: columnWidths.total_commission || 150 },
                          { key: 'available_commission', label: 'Available Rebate', align: 'right', width: columnWidths.available_commission || 180 },
                          { key: 'last_synced_at', label: 'Last Synced', align: 'left', width: columnWidths.last_synced_at || 160 },
                          { key: 'action', label: 'Action', align: 'center', width: columnWidths.action || 180 }
                        ].map((col) => (
                          <th 
                            key={col.key}
                            ref={el => { if (el) headerRefs.current[col.key] = el }}
                            className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider border-b-2 border-blue-700 border-r border-blue-500/50 relative group hover:bg-blue-700/80 transition-colors"
                            style={{ width: col.width, textAlign: col.align }}
                          >
                            <div className="flex items-center gap-1 cursor-pointer" onClick={() => col.key !== 'action' && handleSort(col.key)} style={{ justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                              <span>{col.label}</span>
                              {sortColumn === col.key && col.key !== 'action' && (
                                <svg
                                  className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              )}
                            </div>
                            {/* Resize Handle */}
                            {col.key !== 'action' && (
                              <div 
                                className="absolute right-0 top-0 w-2 h-full cursor-col-resize z-20 hover:bg-blue-700/80" 
                                onMouseDown={(e) => handleResizeStart(e, col.key)}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="absolute right-0 top-0 w-1.5 h-full"></div>
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                      {/* Filter Panel removed */}
                    </thead>

                    {/* YouTube-style Loading Progress Bar */}
                    {loading && (
                      <thead className="sticky z-40" style={{ top: '48px' }}>
                        <tr>
                          <th colSpan="8" className="p-0" style={{ height: '3px' }}>
                            <div className="relative w-full h-full bg-gray-200 overflow-hidden">
                              <style>{`
                                @keyframes shimmerSlideIB {
                                  0% { transform: translateX(-100%); }
                                  100% { transform: translateX(400%); }
                                }
                                .shimmer-loading-bar-ib {
                                  width: 30%;
                                  height: 100%;
                                  background: #2563eb;
                                  animation: shimmerSlideIB 0.9s linear infinite;
                                }
                              `}</style>
                              <div className="shimmer-loading-bar-ib absolute top-0 left-0 h-full" />
                            </div>
                          </th>
                        </tr>
                      </thead>
                    )}

                    <tbody className="bg-white divide-y divide-gray-100 text-sm">
                      {loading ? (
                        <tr>
                          <td colSpan="8" className="px-6 py-8 text-center text-sm text-gray-400">
                            Loading IB commissions...
                          </td>
                        </tr>
                      ) : sortedCommissions.length === 0 ? (
                        <tr>
                          <td colSpan="8" className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-4">
                              <svg className="w-16 h-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <div>
                                <p className="text-gray-600 text-lg font-semibold mb-2">No IB commissions found</p>
                                <p className="text-gray-500 text-sm mb-4">
                                  {searchQuery ? 'Try adjusting or clearing your search' : 'Data will appear when commissions are available'}
                                </p>
                              </div>
                              {searchQuery && (
                                <button
                                  onClick={() => setSearchQuery('')}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md text-sm font-semibold"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Clear Search
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                      sortedCommissions.map((ib) => (
                        <tr key={ib.id} className={`hover:bg-blue-50 transition-colors ${selectedIBs.includes(ib.id) ? 'bg-blue-100' : ''}`}>
                          {/* Checkbox Cell */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedIBs.includes(ib.id)}
                              onChange={() => handleSelectIB(ib.id)}
                              className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {ib.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {ib.email}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-blue-600">
                            {parseFloat(ib.percentage).toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right tabular-nums">
                            {formatCurrency(ib.total_commission)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-green-600 text-right tabular-nums">
                            {formatCurrency(ib.available_commission)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(ib.last_synced_at)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <button
                              onClick={() => handleEdit(ib)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 shadow-sm transition-colors"
                              title="Edit Percentage"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit
                            </button>
                          </td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
            </div>
          </div>

        {/* Bulk Sync Modal */}
        {showBulkSyncModal && (
          <BulkSyncModal
            isOpen={showBulkSyncModal}
            onClose={() => setShowBulkSyncModal(false)}
            onSuccess={handleBulkSyncSuccess}
          />
        )}

        {/* Edit Modal */}
        {showEditModal && editingIB && (
          <EditPercentageModal
            ib={editingIB}
            onClose={() => {
              setShowEditModal(false)
              setEditingIB(null)
            }}
            onSuccess={handleUpdateSuccess}
          />
        )}

        {/* Bulk Update Modal */}
        {showBulkUpdateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Bulk Update Percentage
                  </h3>
                  <button
                    onClick={() => {
                      setShowBulkUpdateModal(false)
                      setBulkPercentage('')
                    }}
                    className="text-white hover:text-gray-200 transition-colors"
                    disabled={bulkUpdating}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {/* Info Message */}
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Please check the IBs you want to update using the checkboxes in the table, then enter the percentage value to apply.
                  </p>
                </div>

                {/* Selected IB Emails Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Selected IB Emails ({selectedIBs.length})
                  </label>
                  <div className="p-3 bg-gray-50 border-2 border-gray-300 rounded-lg min-h-[60px] max-h-[120px] overflow-y-auto">
                    {selectedIBs.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {commissions.filter(ib => selectedIBs.includes(ib.id)).map(ib => (
                          <span
                            key={ib.id}
                            className="inline-flex items-center px-2.5 py-1 bg-indigo-100 text-indigo-800 text-sm font-medium rounded-md"
                          >
                            {ib.email}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm italic">No IBs selected</p>
                    )}
                  </div>
                </div>

                {/* Percentage Input Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Percentage Value (%)
                  </label>
                  <input
                    type="number"
                    value={bulkPercentage}
                    onChange={(e) => setBulkPercentage(e.target.value)}
                    placeholder="Enter percentage (0-100)"
                    min="0"
                    max="100"
                    step="0.01"
                    className="w-full px-4 py-3 text-base border-2 border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    disabled={bulkUpdating}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This percentage will be applied to all {selectedIBs.length} selected IB(s)
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowBulkUpdateModal(false)
                    setBulkPercentage('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
                  disabled={bulkUpdating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdate}
                  disabled={bulkUpdating || !bulkPercentage || selectedIBs.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
                >
                  {bulkUpdating ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Updating...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Update All
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Column Filter Dropdowns */}
        {showFilterDropdown && (
          <div 
            data-filter-dropdown
            className="fixed bg-white border-2 border-slate-300 rounded-lg shadow-2xl z-[9999] w-64" 
            style={{
              top: '50%',
              transform: 'translateY(-50%)',
              left: (() => {
                const rect = filterRefs.current[showFilterDropdown]?.getBoundingClientRect()
                if (!rect) return '0px'
                const dropdownWidth = 256
                const offset = 30
                const wouldOverflow = rect.left + offset + dropdownWidth > window.innerWidth
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
                  setSortColumn(showFilterDropdown)
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
                  setSortColumn(showFilterDropdown)
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
                  clearColumnFilter(showFilterDropdown)
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
            {!isStringColumn(showFilterDropdown) && (
            <div className="border-b border-slate-200 py-1">
              <div className="px-2 py-1 relative group text-[11px]">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (showNumberFilterDropdown === showFilterDropdown) {
                      setShowNumberFilterDropdown(null)
                      setCustomFilterValue1('')
                      setCustomFilterValue2('')
                    } else {
                      setShowNumberFilterDropdown(showFilterDropdown)
                      setCustomFilterColumn(showFilterDropdown)
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

                {showNumberFilterDropdown === showFilterDropdown && (
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
                              setShowFilterDropdown(null)
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
                                setShowFilterDropdown(null)
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
                            setShowFilterDropdown(null)
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
            {isStringColumn(showFilterDropdown) && (
              <div className="border-b border-slate-200 py-1">
                <div className="px-2 py-1 relative group text-[11px]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (showNumberFilterDropdown === showFilterDropdown) {
                        setShowNumberFilterDropdown(null)
                        setCustomFilterValue1('')
                        setCustomFilterValue2('')
                      } else {
                        setShowNumberFilterDropdown(showFilterDropdown)
                        setCustomFilterColumn(showFilterDropdown)
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

                  {showNumberFilterDropdown === showFilterDropdown && (
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
                                setShowFilterDropdown(null)
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
                              setShowFilterDropdown(null)
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
                  value={filterSearchQuery[showFilterDropdown] || ''}
                  onChange={(e) => {
                    e.stopPropagation()
                    setFilterSearchQuery(prev => ({
                      ...prev,
                      [showFilterDropdown]: e.target.value
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
                  checked={isAllSelected(showFilterDropdown)}
                  onChange={(e) => {
                    e.stopPropagation()
                    if (e.target.checked) {
                      selectAllFilters(showFilterDropdown)
                    } else {
                      deselectAllFilters(showFilterDropdown)
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
                {getUniqueColumnValues(showFilterDropdown).length === 0 ? (
                  <div className="px-2 py-2 text-center text-[11px] text-slate-500">
                    No items found
                  </div>
                ) : (
                  getUniqueColumnValues(showFilterDropdown).map(value => (
                    <label 
                      key={value} 
                      className="flex items-center gap-2 hover:bg-blue-50 px-2 py-1.5 rounded cursor-pointer transition-colors bg-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={(columnFilters[showFilterDropdown] || []).includes(value)}
                        onChange={(e) => {
                          e.stopPropagation()
                          toggleColumnFilter(showFilterDropdown, value)
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
      </main>
    </div>
  )
}

export default IBCommissionsPage
