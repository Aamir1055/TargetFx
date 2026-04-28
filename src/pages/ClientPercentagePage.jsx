import { useState, useEffect, useRef } from 'react'
import { brokerAPI } from '../services/api'
import { useGroups } from '../contexts/GroupContext'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import WebSocketIndicator from '../components/WebSocketIndicator'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import ClientPercentageModule from '../components/ClientPercentageModule'

const ClientPercentagePage = () => {
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
  // Indian compact formatter: 2.57Cr, 12.50L, 25.50K
  const formatCompactIndian = (n) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return '0'
    const abs = Math.abs(num)
    const sign = num < 0 ? '-' : ''
    if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`
    if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L`
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K`
    return `${sign}${Math.round(abs)}`
  }
  const fmtCount = (n) => {
    const num = Number(n) || 0
    if (numericMode === 'compact' && Math.abs(num) >= 1000) return formatCompactIndian(num)
    return String(num)
  }
  
  const { filterByActiveGroup, activeGroupFilters, getActiveGroupFilter } = useGroups()
  const { positions: cachedPositions, orders: cachedOrders } = useData()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v !== null ? JSON.parse(v) : true
    } catch {
      return true
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
    clientName: true,
    percentage: true,
    type: true,
    comment: true,
    updatedAt: true,
    actions: true,
  })

  const allColumns = [
    { key: 'login', label: 'Client Login', sticky: true },
    { key: 'clientName', label: 'Client Name' },
    { key: 'percentage', label: 'Percentage' },
    { key: 'type', label: 'Type' },
    { key: 'comment', label: 'Comment' },
    { key: 'updatedAt', label: 'Last Updated' },
    { key: 'actions', label: 'Actions' },
  ]

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Column filter states removed

  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true)

  // Edit modal states
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [editPercentage, setEditPercentage] = useState('')
  const [editComment, setEditComment] = useState('')
  const [saving, setSaving] = useState(false)

  // Bulk update states
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkPercentage, setBulkPercentage] = useState('')
  const [bulkComment, setBulkComment] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // CSV import states
  const [showImportModal, setShowImportModal] = useState(false)
  const [csvData, setCsvData] = useState([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvError, setCsvError] = useState('')
  const csvFileRef = useRef(null)
  
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
    fetchAllClientPercentages(currentPage)
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
        sort_by: sortColumn === 'client_login' ? 'login' : sortColumn === 'client_name' ? 'name' : sortColumn,
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

  // Row selection helpers
  const toggleRowSelection = (login) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(login) ? next.delete(login) : next.add(login)
      return next
    })
  }

  const toggleAllRows = (clients) => {
    if (selectedRows.size > 0 && selectedRows.size === clients.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(clients.map(c => c.client_login)))
    }
  }

  // Bulk update handler
  const handleBulkUpdate = async () => {
    const percentage = parseFloat(bulkPercentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      alert('Please enter a valid percentage between 0 and 100')
      return
    }
    try {
      setBulkSaving(true)
      const clients = Array.from(selectedRows).map(login => ({
        login,
        percentage,
        comment: bulkComment || `Bulk update: ${percentage}%`
      }))
      await brokerAPI.bulkUpdateClientPercentages(clients)
      await fetchAllClientPercentages()
      setShowBulkModal(false)
      setSelectedRows(new Set())
      setBulkPercentage('')
      setBulkComment('')
    } catch (err) {
      console.error('Error bulk updating percentages:', err)
      alert('Failed to bulk update. Please try again.')
    } finally {
      setBulkSaving(false)
    }
  }

  // CSV import handlers
  const handleCSVFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCsvError('')
    setCsvData([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target.result
        const lines = text.trim().split(/\r?\n/)
        if (lines.length < 2) { setCsvError('CSV must have a header row and at least one data row'); return }
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))
        const loginIdx = headers.findIndex(h => h === 'login')
        const pctIdx = headers.findIndex(h => h === 'percentage')
        const cmtIdx = headers.findIndex(h => h === 'comment')
        if (loginIdx === -1 || pctIdx === -1) { setCsvError('CSV must have "login" and "percentage" columns'); return }
        const rows = []
        const errors = []
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
          const login = parseInt(cols[loginIdx])
          const pct = parseFloat(cols[pctIdx])
          const comment = cmtIdx !== -1 && cols[cmtIdx] ? cols[cmtIdx] : ''
          if (isNaN(login)) { errors.push(`Row ${i + 1}: invalid login "${cols[loginIdx]}"`); continue }
          if (isNaN(pct) || pct < 0 || pct > 100) { errors.push(`Row ${i + 1}: invalid percentage "${cols[pctIdx]}"`); continue }
          rows.push({ login, percentage: pct, comment })
        }
        if (errors.length > 0) setCsvError(errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''))
        if (rows.length === 0) { if (!errors.length) setCsvError('No valid data rows found'); return }
        setCsvData(rows)
      } catch { setCsvError('Failed to parse CSV file') }
    }
    reader.readAsText(file)
  }

  const handleCSVImport = async () => {
    if (csvData.length === 0) return
    try {
      setCsvImporting(true)
      await brokerAPI.bulkUpdateClientPercentages(csvData)
      await fetchAllClientPercentages()
      setShowImportModal(false)
      setCsvData([])
      setCsvError('')
      if (csvFileRef.current) csvFileRef.current.value = ''
    } catch (err) {
      console.error('Error importing CSV:', err)
      setCsvError('Failed to import. Please try again.')
    } finally {
      setCsvImporting(false)
    }
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
    // API handles search and sort — preserve server order, just apply group filter
    return filterByActiveGroup(clients, 'client_login', 'clientpercentage')
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

  // Helper function to render sortable table header (no column filter)
  const renderHeaderCell = (columnKey, label, sortKey = null) => {
    if (!sortKey) {
      return (
        <th
          className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider select-none border-b border-blue-500"
          style={{ backgroundColor: '#2563eb' }}
        >
          <span>{label}</span>
        </th>
      )
    }
    return (
      <th
        className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider hover:bg-blue-700 transition-colors select-none group border-b border-blue-500 cursor-pointer"
        style={{ backgroundColor: '#2563eb' }}
        onClick={() => {
          setSortColumn(sortKey)
          setSortDirection(prev => sortColumn === sortKey && prev === 'asc' ? 'desc' : 'asc')
        }}
      >
        <div className="flex items-center gap-1 text-white">
          <span>{label}</span>
          {getSortIcon(sortKey)}
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
                <span title={numericMode === 'compact' ? String(stats.total_custom) : undefined}>{fmtCount(stats.total_custom)}</span>
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
                <span title={numericMode === 'compact' ? String(stats.total_default) : undefined}>{fmtCount(stats.total_default)}</span>
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
                        placeholder="Search by Login and Type"
                        className="w-full h-10 pl-10 pr-20 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                      
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        {searchInput && (
                          <button
                            onClick={() => {
                              setSearchInput('')
                              setSearchQuery('')
                              setCurrentPage(1)
                            }}
                            className="w-7 h-7 flex items-center justify-center text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                            title="Clear search"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={handleSearch}
                          className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                          title="Search"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    
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
                          className="absolute left-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-2 z-50 w-56"
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

                    {/* Import CSV Button */}
                    <button
                      onClick={() => { setCsvData([]); setCsvError(''); if (csvFileRef.current) csvFileRef.current.value = ''; setShowImportModal(true) }}
                      className="h-10 px-3 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center gap-1.5 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                      title="Import CSV"
                    >
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Import CSV
                    </button>

                    {/* Bulk Update Button */}
                    {selectedRows.size > 0 && (
                      <button
                        onClick={() => { setBulkPercentage(''); setBulkComment(''); setShowBulkModal(true) }}
                        className="h-10 px-3 rounded-md bg-blue-600 text-white border border-blue-600 shadow-sm flex items-center gap-1.5 hover:bg-blue-700 transition-colors text-sm font-medium"
                        title="Bulk Update Selected"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Bulk Update ({selectedRows.size})
                      </button>
                    )}
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

              <div className="overflow-y-auto flex-1">
                <table className="min-w-full divide-y text-xs border-separate border-spacing-0" style={{ borderCollapse: 'separate', borderColor: '#e5e7eb' }}>
                <thead className="bg-blue-600 sticky top-0 z-10" style={{ backgroundColor: '#2563eb' }}>
                  <tr className="divide-x divide-blue-400">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-white" style={{ backgroundColor: '#2563eb', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={displayedClients.length > 0 && selectedRows.size === displayedClients.length}
                        onChange={() => toggleAllRows(displayedClients)}
                        className="w-3.5 h-3.5 rounded border-white/50 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    {visibleColumns.login && renderHeaderCell('client_login', 'Client Login', 'client_login')}
                    {visibleColumns.clientName && renderHeaderCell('client_name', 'Client Name', 'client_name')}
                    {visibleColumns.percentage && renderHeaderCell('percentage', 'Percentage', 'percentage')}
                    {visibleColumns.type && renderHeaderCell('is_custom', 'Type')}
                    {visibleColumns.comment && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider" style={{ backgroundColor: '#2563eb' }}>
                        Comment
                      </th>
                    )}
                    {visibleColumns.updatedAt && renderHeaderCell('updated_at', 'Last Updated')}
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
                      <th colSpan={Object.values(visibleColumns).filter(v => v).length + 1} className="p-0" style={{ height: '3px' }}>
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
                      <td colSpan={Object.values(visibleColumns).filter(v => v).length + 1} className="px-6 py-8 text-center text-sm text-gray-400">
                        Loading client percentages...
                      </td>
                    </tr>
                  ) : displayedClients.length === 0 ? (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(v => v).length + 1} className="px-6 py-8 text-center">
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
                              setSearchInput('')
                              setSearchQuery('')
                              setCurrentPage(1)
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md text-sm font-semibold"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Clear Search
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                  displayedClients.map((client, index) => (
                    <tr key={client.client_login} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-3 whitespace-nowrap" style={{ borderRight: '1px solid #e5e7eb', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedRows.has(client.client_login)}
                          onChange={() => toggleRowSelection(client.client_login)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      {visibleColumns.login && (
                        <td 
                          className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                          style={{ borderRight: '1px solid #e5e7eb' }}
                          onClick={() => setSelectedLogin(client.client_login)}
                          title="Click to view login details"
                        >
                          {client.client_login}
                        </td>
                      )}
                      {visibleColumns.clientName && (
                        <td className="px-4 py-3 text-sm text-gray-700 break-words" style={{ borderRight: '1px solid #e5e7eb', minWidth: '120px', maxWidth: '180px', width: '150px', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                          {client.client_name || '-'}
                        </td>
                      )}
                      {visibleColumns.percentage && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ borderRight: '1px solid #e5e7eb' }}>
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
                        <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ borderRight: '1px solid #e5e7eb' }}>
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
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" style={{ borderRight: '1px solid #e5e7eb' }}>
                          {client.comment || '-'}
                        </td>
                      )}
                      {visibleColumns.updatedAt && (
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500" style={{ borderRight: '1px solid #e5e7eb' }}>
                          {client.updated_at ? new Date(client.updated_at).toLocaleDateString('en-GB') : '-'}
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

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-blue-600 border-b border-blue-700">
              <h2 className="text-lg font-semibold text-white">Bulk Update Percentages</h2>
              <button onClick={() => setShowBulkModal(false)} disabled={bulkSaving} className="text-white/80 hover:text-white transition-colors disabled:opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">Update percentage for <span className="font-semibold text-blue-600">{selectedRows.size}</span> selected client{selectedRows.size !== 1 ? 's' : ''}.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Percentage (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={bulkPercentage}
                    onChange={(e) => setBulkPercentage(e.target.value)}
                    placeholder="0.00"
                    disabled={bulkSaving}
                    className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Value must be between 0 and 100</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                <textarea
                  value={bulkComment}
                  onChange={(e) => setBulkComment(e.target.value)}
                  rows={2}
                  disabled={bulkSaving}
                  placeholder="Optional comment"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                <button onClick={() => setShowBulkModal(false)} disabled={bulkSaving} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleBulkUpdate} disabled={bulkSaving || !bulkPercentage} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {bulkSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      Saving...
                    </span>
                  ) : `Update ${selectedRows.size} Client${selectedRows.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-blue-600 border-b border-blue-700">
              <h2 className="text-lg font-semibold text-white">Import CSV</h2>
              <button onClick={() => { setShowImportModal(false); setCsvData([]); setCsvError('') }} disabled={csvImporting} className="text-white/80 hover:text-white transition-colors disabled:opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">CSV Format:</p>
                <p>Required columns: <code className="bg-blue-100 px-1 rounded">login</code>, <code className="bg-blue-100 px-1 rounded">percentage</code></p>
                <p>Optional column: <code className="bg-blue-100 px-1 rounded">comment</code></p>
                <p className="mt-1">Example: <code className="bg-blue-100 px-1 rounded">login,percentage,comment</code></p>
                <p><code className="bg-blue-100 px-1 rounded">12345,15.5,Bulk import</code></p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select CSV File</label>
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCSVFile}
                  disabled={csvImporting}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                />
              </div>

              {csvError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 whitespace-pre-line">{csvError}</div>
              )}

              {csvData.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{csvData.length} row{csvData.length !== 1 ? 's' : ''} ready to import:</p>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Login</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Percentage</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Comment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvData.map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-1.5 text-blue-600 font-medium">{row.login}</td>
                            <td className="px-3 py-1.5 text-green-700 font-semibold">{row.percentage}%</td>
                            <td className="px-3 py-1.5 text-gray-600 truncate max-w-xs">{row.comment || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                <button onClick={() => { setShowImportModal(false); setCsvData([]); setCsvError('') }} disabled={csvImporting} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleCSVImport} disabled={csvImporting || csvData.length === 0} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {csvImporting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      Importing...
                    </span>
                  ) : csvData.length > 0 ? `Import ${csvData.length} Row${csvData.length !== 1 ? 's' : ''}` : 'Import'}
                </button>
              </div>
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
