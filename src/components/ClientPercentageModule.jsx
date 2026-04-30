import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import SetCustomPercentageModal from './SetCustomPercentageModal'
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

export default function ClientPercentageModule() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { positions: cachedPositions, clients: allClients, orders } = useData()
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
  const [hasPendingFilterChanges, setHasPendingFilterChanges] = useState(false)
  const [pendingFilterDraft, setPendingFilterDraft] = useState(null)
  const [hasPendingGroupChanges, setHasPendingGroupChanges] = useState(false)
  const [pendingGroupDraft, setPendingGroupDraft] = useState(null)
  const [selectedClientForDetails, setSelectedClientForDetails] = useState(null)
  const carouselRef = useRef(null)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768)
  const itemsPerPage = isMobileView ? 15 : 100
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    percentage: true,
    type: true,
    comment: false,
    updatedAt: false,
    actions: true
  })

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)

  // Bulk Update State
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkPercentage, setBulkPercentage] = useState('')
  const [bulkComment, setBulkComment] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // CSV Import State
  const [showImportModal, setShowImportModal] = useState(false)
  const [csvData, setCsvData] = useState([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvError, setCsvError] = useState('')
  const csvFileRef = useRef(null)

  // Export State
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)

  // API State
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({
    total: 0,
    total_custom: 0,
    total_default: 0,
    default_percentage: 0
  })

  // Clear all filters on component mount (when navigating to this module)
  useEffect(() => {
    setActiveGroupFilter('clientpercentage', null)
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

  // Detect mobile view
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Fetch data on mount
  useEffect(() => {
    fetchAllClientPercentages(1)
  }, [])

  const fetchAllClientPercentages = async (page = 1) => {
    try {
      setLoading(true)
      setError('')
      
      // Server-side pagination for both views
      // Some backends use `limit` instead of `page_size` for this endpoint
      const params = isMobileView ? { page, limit: 15 } : { page, limit: 100 }
      const response = await brokerAPI.getAllClientPercentages(params)

      // Normalize nested API shape: response.data?.data
      const payload = response?.data?.data || response?.data || {}
      try {
        console.log('[ClientPercentage] fetch', { page, params, parsedTotal: payload?.total, count: Array.isArray(payload?.clients) ? payload.clients.length : 0 })
      } catch {}
      const clientsData = payload?.clients || []
      setClients(clientsData)
      setStats({
        total: Number(payload?.total) || clientsData.length,
        total_custom: Number(payload?.total_custom) || 0,
        total_default: Number(payload?.total_default) || 0,
        default_percentage: Number(payload?.default_percentage) || 0
      })
      
      setLoading(false)
    } catch (err) {
      console.error('Error fetching client percentages:', err)
      setError('Failed to load client percentages')
      setLoading(false)
    }
  }

  // Handle edit click
  const handleEditClick = (client) => {
    setSelectedClient(client)
    setShowEditModal(true)
  }

  // Handle edit success
  const handleEditSuccess = async () => {
    await fetchAllClientPercentages()
    setShowEditModal(false)
    setSelectedClient(null)
  }

  // Use clients data instead of placeholder
  const percentageData = clients

  // Apply cumulative filters: Customize View -> IB -> Group
  const ibFilteredData = useMemo(() => {
    return applyCumulativeFilters(percentageData, {
      customizeFilters: filters,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'clientpercentage'
    })
  }, [percentageData, filters, filterByActiveGroup, activeGroupFilters])

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalClients = ibFilteredData.length
    const customClients = ibFilteredData.filter(c => c.is_custom).length
    const defaultClients = totalClients - customClients
    const avgPercentage = totalClients > 0 
      ? ibFilteredData.reduce((sum, c) => sum + (Number(c.percentage) || 0), 0) / totalClients 
      : 0
    
    return {
      totalClients,
      customClients,
      defaultClients,
      avgPercentage
    }
  }, [ibFilteredData])

  // Filter data based on search
  const filteredData = useMemo(() => {
    let filtered = ibFilteredData.filter(item => {
      if (!searchInput.trim()) return true
      const query = searchInput.toLowerCase()
      
      // Special handling for Type column search
      if (query === 'default') {
        return item.is_custom === false
      }
      if (query === 'custom') {
        return item.is_custom === true
      }
      
      // Search across all primitive fields
      return (
        String(item.client_login || item.login || '').toLowerCase().includes(query) ||
        String(item.percentage || '').toLowerCase().includes(query) ||
        String(item.comment || '').toLowerCase().includes(query) ||
        (item.is_custom ? 'custom' : 'default').includes(query) ||
        String(item.updated_at || '').toLowerCase().includes(query)
      )
    })

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        // Map column keys to actual data fields for sorting
        let aVal, bVal
        
        if (sortColumn === 'login') {
          aVal = a.client_login || a.login
          bVal = b.client_login || b.login
        } else if (sortColumn === 'updatedAt') {
          aVal = a.updated_at
          bVal = b.updated_at
        } else if (sortColumn === 'type') {
          aVal = a.is_custom ? 'Custom' : 'Default'
          bVal = b.is_custom ? 'Custom' : 'Default'
        } else {
          aVal = a[sortColumn]
          bVal = b[sortColumn]
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
  }, [ibFilteredData, searchInput, sortColumn, sortDirection])

  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  // Face cards data
  const [cards, setCards] = useState([])

  // Map card labels to icon file paths
  const getCardIcon = (label) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'TOTAL CLIENTS': `${baseUrl}Desktop cards icons/Total Clients.svg`,
      'CUSTOM PERCENTAGES': `${baseUrl}Desktop cards icons/TOTAL COMMISION.svg`,
      'USING DEFAULT': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'DEFAULT PERCENTAGE': `${baseUrl}Desktop cards icons/TOTAL COMMISION%25.svg`
    }
    return iconMap[label] || `${baseUrl}Desktop cards icons/Total Clients.svg`
  }
  
  useEffect(() => {
    const fmtCount = (v) => {
      const n = Number(v) || 0
      if (numericMode === 'compact') return formatCompactIndian(n)
      return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
    }
    const newCards = [
      { label: 'TOTAL CLIENTS', value: Number(stats.total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), numericValue: stats.total },
      { label: 'CUSTOM PERCENTAGES', value: fmtCount(stats.total_custom), numericValue: stats.total_custom },
      { label: 'USING DEFAULT', value: fmtCount(stats.total_default), numericValue: stats.total_default },
      { label: 'DEFAULT PERCENTAGE', value: `${stats.default_percentage || 0}%`, numericValue: stats.default_percentage }
    ]
    
    if (cards.length === 0) {
      setCards(newCards)
    } else {
      setCards(prevCards => {
        return prevCards.map(prevCard => {
          const updated = newCards.find(c => c.label === prevCard.label)
          return updated || prevCard
        })
      })
    }
  }, [stats, numericMode])

  // Fetch data when page changes
  useEffect(() => {
    fetchAllClientPercentages(currentPage)
  }, [currentPage])

  // Pagination
  const paginatedData = useMemo(() => {
    // Use server-side pagination data directly from API for both views
    return filteredData.length > 0 ? filteredData : clients
  }, [clients, filteredData])

  // Get visible columns
  const allColumns = [
    { key: 'login', label: 'Login', width: '100px', sticky: true },
    { key: 'updatedAt', label: 'Last Updated', width: '150px' },
    { key: 'percentage', label: 'Percentage', width: '120px' },
    { key: 'type', label: 'Type', width: '100px' },
    { key: 'comment', label: 'Comment', width: '200px' },
    { key: 'actions', label: 'Actions', width: '80px' }
  ]

  const activeColumns = allColumns.filter(col => visibleColumns[col.key])
  const gridTemplateColumns = '32px ' + activeColumns.map(col => col.width).join(' ')

  const renderCellValue = (item, key, isSticky = false) => {
    let value = '-'
    
    switch (key) {
      case 'login':
        value = item.client_login || item.login || '-'
        return (
          <div 
            className={`h-[28px] flex items-center justify-start px-2 cursor-pointer hover:underline text-blue-600 font-semibold ${isSticky ? 'sticky left-0 bg-white z-10' : ''}`}
            style={{
              border: 'none', 
              outline: 'none', 
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
            onClick={() => {
              const fullClient = allClients.find(c => String(c.login) === String(value))
              setSelectedClientForDetails(fullClient || { login: value, email: '', name: '' })
            }}
          >
            <span className="truncate">{value}</span>
          </div>
        )
      case 'percentage':
        value = item.percentage ? `${item.percentage}%` : '-'
        break
      case 'type':
        value = item.is_custom ? 'Custom' : 'Default'
        break
      case 'comment':
        value = item.comment || '-'
        break
      case 'updatedAt':
        value = item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-'
        break
      case 'actions':
        return (
          <div className="h-[28px] flex items-center justify-start px-2">
            <button 
              onClick={() => handleEditClick(item)}
              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
            >
              Edit
            </button>
          </div>
        )
      default:
        value = item[key] || '-'
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

  // Export to CSV
  // Row selection helpers
  const toggleRowSelection = (login) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(login) ? next.delete(login) : next.add(login)
      return next
    })
  }

  const toggleAllRows = (data) => {
    const logins = data.map(c => c.client_login || c.login).filter(Boolean)
    if (selectedRows.size > 0 && selectedRows.size === logins.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(logins))
    }
  }

  // Bulk Update handler
  const handleBulkUpdate = async () => {
    const percentage = parseFloat(bulkPercentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      alert('Please enter a valid percentage between 0 and 100')
      return
    }
    try {
      setBulkSaving(true)
      const clientsToUpdate = Array.from(selectedRows).map(login => ({
        login,
        percentage,
        comment: bulkComment || `Bulk update: ${percentage}%`
      }))
      await brokerAPI.bulkUpdateClientPercentages(clientsToUpdate)
      await fetchAllClientPercentages(currentPage)
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

  // CSV File Parser
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

  // CSV Import handler
  const handleCSVImport = async () => {
    if (csvData.length === 0) return
    try {
      setCsvImporting(true)
      await brokerAPI.bulkUpdateClientPercentages(csvData)
      await fetchAllClientPercentages(currentPage)
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

  // CSV Export helpers
  const buildCSV = (rows) => {
    const exportColumns = activeColumns.filter(c => c.key !== 'actions')
    const headers = exportColumns.map(col => col.label).join(',')
    const escape = (v) => {
      let s = v == null ? '' : String(v)
      s = s.replace(/"/g, '""')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) s = `"${s}"`
      return s
    }
    const body = rows.map(item => exportColumns.map(col => {
      switch (col.key) {
        case 'login': return escape(item.client_login || item.login || '')
        case 'percentage': return escape(item.percentage ?? 0)
        case 'type': return escape(item.is_custom ? 'Custom' : 'Default')
        case 'comment': return escape(item.comment || '')
        case 'updatedAt': return escape(item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '')
        default: return escape(item[col.key] ?? '')
      }
    }).join(',')).join('\n')
    return headers + '\n' + body
  }

  const downloadCSV = (csv, filename) => {
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Full Export handler (mirrors desktop — fetches all pages from API)
  const handleExport = async (mode = 'all') => {
    if (exporting) return
    if (mode === 'selected' && selectedRows.size === 0) { alert('No rows selected'); return }
    try {
      setExporting(true)
      setExportProgress(0)
      const PARALLEL = 8
      const PAGE_SIZE = 1000
      const probe = await brokerAPI.getAllClientPercentages({ page: 1, page_size: PAGE_SIZE, sort_by: sortColumn || 'login', sort_order: sortDirection })
      const probeClients = Array.isArray(probe.data?.clients) ? probe.data.clients : []
      const total = Number(probe.data?.total || 0)
      if (!total) { alert('No data to export'); return }
      if (!probeClients.length) { alert('No data returned from server'); return }
      const byLogin = new Map()
      const addRows = (list) => { for (const c of (list || [])) { const k = c?.client_login ?? c?.login; if (k != null && !byLogin.has(k)) byLogin.set(k, c) } }
      addRows(probeClients)
      const totalPages = Math.max(1, Math.ceil(total / probeClients.length))
      let done = 1
      for (let page = 2; page <= totalPages; page += PARALLEL) {
        const batch = []
        for (let i = 0; i < PARALLEL && (page + i) <= totalPages; i++) batch.push(page + i)
        const results = await Promise.all(batch.map(p => brokerAPI.getAllClientPercentages({ page: p, page_size: PAGE_SIZE, sort_by: sortColumn || 'login', sort_order: sortDirection }).then(r => Array.isArray(r.data?.clients) ? r.data.clients : []).catch(() => [])))
        results.forEach(list => addRows(list))
        done += batch.length
        setExportProgress(Math.min(done / totalPages, 1))
      }
      const allRows = Array.from(byLogin.values())
      const finalRows = mode === 'selected' ? allRows.filter(c => selectedRows.has(c.client_login) || selectedRows.has(c.login)) : allRows
      if (!finalRows.length) { alert('No data to export'); return }
      const csv = buildCSV(finalRows)
      downloadCSV(csv, `client_percentage_${mode}_${new Date().toISOString().split('T')[0]}.csv`)
    } catch (err) {
      console.error('[ClientPercentageModule] Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
      setExportProgress(0)
      setShowExportMenu(false)
    }
  }

  const handleExportToCSV = () => {
    try {
      const dataToExport = filteredData
      if (!dataToExport || dataToExport.length === 0) {
        alert('No data to export')
        return
      }

      const exportColumns = activeColumns
      const headers = exportColumns.map(col => col.label).join(',')
      
      const rows = dataToExport.map(item => {
        return exportColumns.map(col => {
          let value = ''
          
          switch(col.key) {
            case 'login':
              value = item.client_login || item.login || '-'
              break
            case 'percentage':
              value = item.percentage || 0
              break
            case 'type':
              value = item.is_custom ? 'Custom' : 'Default'
              break
            case 'comment':
              value = item.comment || '-'
              break
            case 'updatedAt':
              value = item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '-'
              break
            case 'actions':
              value = 'N/A'
              break
            default:
              value = item[col.key] || '-'
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
      link.download = `client_percentage_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[ClientPercentageModule] Export failed:', error)
      alert('Export failed. Please try again.')
    }
  }

  const toggleColumn = (key) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleModalApply = (type, value) => {
    if (type === 'filter') {
      setFilters(value)
    }
  }

  const handleOpenGroup = () => {
    setActiveGroupFilter('clientpercentage', getActiveGroupFilter('clientpercentage'))
    setIsGroupOpen(true)
  }

  const handleGroupApply = (groupId) => {
    setActiveGroupFilter('clientpercentage', groupId)
    setIsGroupOpen(false)
  }

  // Close export menu when clicking outside
  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

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
    <div className="h-screen flex flex-col bg-[#F5F7FA] overflow-hidden" style={{ height: 'calc(var(--vh, 1vh) * 100)' }}>
      {/* Error Message */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-50 border-l-4 border-red-500 rounded-r p-4 shadow-lg z-50 max-w-md">
          <p className="text-red-700">{error}</p>
          <button 
            onClick={() => setError('')}
            className="mt-2 text-red-600 hover:text-red-800 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Sticky Header */}
      <div className="flex-shrink-0 bg-white border-b border-[#E5E7EB] px-5 py-3">
        <div className="flex items-center relative">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="#1F2937" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <h1 className="text-xl font-bold text-[#1F2937] absolute left-1/2 transform -translate-x-1/2">Client Percentage</h1>
          {!isMobileView && (
            <button 
              onClick={() => navigate('/dashboard')}
              className="w-10 h-10 rounded-full bg-[#2563EB] flex items-center justify-center text-white font-semibold hover:bg-[#1D4ED8] transition-colors ml-auto"
            >
              U
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Action Buttons + View All */}
        <div className="px-5 pt-3 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-[8px]">
              {!isMobileView && (
                <button 
                  onClick={() => {
                    setIsCustomizeOpen(true)
                  }} 
                  className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative ${
                    (filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('clientpercentage'))
                      ? 'bg-blue-50 border-blue-200' 
                      : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M4.5 6.5H9.5M2.5 3.5H11.5M5.5 9.5H8.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span className="text-[#4B4B4B] text-[10px] font-medium font-outfit">Filters</span>
                  {(() => {
                    const filterCount = [
                      filters.hasFloating,
                      filters.hasCredit,
                      filters.noDeposit,
                      getActiveGroupFilter('clientpercentage')
                    ].filter(Boolean).length;
                    return filterCount > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {filterCount}
                      </span>
                    ) : null;
                  })()}
                </button>
              )}
              {!isMobileView && (
                <button 
                  onClick={handleExportToCSV}
                  className="h-8 w-8 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                  title="Export to CSV"
                >
                  <svg className="w-4 h-4 text-[#374151]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16"/>
                  </svg>
                </button>
              )}
              {/* Import CSV Button */}
              <button
                onClick={() => { setCsvData([]); setCsvError(''); if (csvFileRef.current) csvFileRef.current.value = ''; setShowImportModal(true) }}
                className="h-8 px-2 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center gap-1 hover:bg-gray-50 transition-colors text-[10px] font-medium text-[#374151]"
                title="Import CSV"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import
              </button>
              {/* Export Button with dropdown */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setShowExportMenu(v => !v)}
                  disabled={exporting}
                  className="h-8 px-2 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center gap-1 hover:bg-gray-50 transition-colors text-[10px] font-medium text-[#374151] disabled:opacity-60"
                  title="Export"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16" />
                  </svg>
                  {exporting ? `${Math.round((exportProgress || 0) * 100)}%` : 'Export'}
                  {!exporting && <svg className="w-2.5 h-2.5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>}
                </button>
                {showExportMenu && !exporting && (
                  <div className="absolute left-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
                    <button
                      onClick={() => { setShowExportMenu(false); handleExport('all') }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>Download All</span>
                      <span className="text-[10px] text-gray-400">{stats.total || ''}</span>
                    </button>
                    <button
                      onClick={() => { setShowExportMenu(false); handleExport('selected') }}
                      disabled={selectedRows.size === 0}
                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                    >
                      <span>Download Selected</span>
                      <span className="text-[10px] text-gray-400">{selectedRows.size}</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => window.location.reload()}
                disabled={loading}
                className="w-8 h-8 rounded-lg border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="#1A63BC"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            {/* Bulk Update button — visible when rows are selected */}
            {selectedRows.size > 0 && (
              <button
                onClick={() => { setBulkPercentage(''); setBulkComment(''); setShowBulkModal(true) }}
                className="h-8 px-3 rounded-lg bg-blue-600 text-white border border-blue-600 shadow-sm flex items-center gap-1 hover:bg-blue-700 transition-colors text-[10px] font-semibold flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Bulk Update ({selectedRows.size})
              </button>
            )}
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
                    color: card.numericValue > 0 ? '#16A34A' : card.numericValue < 0 ? '#DC2626' : '#000000'
                  }}>
                    {card.value === '' || card.value === undefined ? '0.00' : card.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search and Pagination Controls */}
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center px-2 gap-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <circle cx="6" cy="6" r="4" stroke="#9CA3AF" strokeWidth="1.5"/>
                <path d="M9 9L12 12" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input 
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search"
                className="flex-1 min-w-0 text-[11px] text-[#000000] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit"
                style={{ color: '#000000' }}
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

            {/* Page indicator */}
            <div className="px-2 text-[10px] font-medium text-[#4B4B4B] flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={Math.max(1, Math.ceil(Number(stats.total || 0) / Number(itemsPerPage || 1)))}
                value={currentPage}
                onChange={(e) => {
                  const total = Math.max(1, Math.ceil(Number(stats.total || 0) / Number(itemsPerPage || 1)))
                  const n = Number(e.target.value)
                  if (!isNaN(n)) setCurrentPage(Math.min(Math.max(1, n), total))
                }}
                className="w-10 h-6 border border-[#ECECEC] rounded-[8px] text-center text-[10px]"
                aria-label="Current page"
              />
              <span className="text-[#9CA3AF]">/</span>
              <span>{Math.max(1, Math.ceil(Number(stats.total || 0) / Number(itemsPerPage || 1)))}</span>
            </div>

            <button 
              onClick={() => setCurrentPage(prev => {
                const total = Math.max(1, Math.ceil(Number(stats.total || 0) / Number(itemsPerPage || 1)))
                return Math.min(total, prev + 1)
              })}
              disabled={currentPage >= Math.max(1, Math.ceil(Number(stats.total || 0) / Number(itemsPerPage || 1)))}
              className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <path d="M8 6L12 10L8 14" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="pb-4" style={{ maxWidth: '100vw', overflow: 'hidden' }}>
          <div className="bg-white shadow-[0_0_12px_rgba(75,75,75,0.05)] overflow-hidden">
            <div className="w-full overflow-x-auto overflow-y-visible" style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
              scrollbarColor: '#CBD5E0 #F7FAFC',
              touchAction: 'pan-x pan-y'
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
                  {/* Checkbox header */}
                  <div className="h-[32px] flex items-center justify-center sticky left-0 z-30" style={{ backgroundColor: '#3B82F6' }}>
                    <input
                      type="checkbox"
                      checked={paginatedData.length > 0 && selectedRows.size === paginatedData.length}
                      onChange={() => toggleAllRows(paginatedData)}
                      className="w-3 h-3 rounded cursor-pointer"
                    />
                  </div>
                  {activeColumns.map(col => (
                    <div 
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`h-[32px] flex items-center justify-start px-1 cursor-pointer select-none ${
                        col.sticky ? 'sticky left-8 z-30 bg-blue-500' : ''
                      }`}
                      style={{
                        border: 'none',
                        outline: 'none',
                        boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.1)' : 'none',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        touchAction: 'manipulation',
                        backgroundColor: '#3B82F6'
                      }}
                    >
                      <span className="truncate">{col.label}</span>
                      {sortColumn === col.key && (
                        <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Table Body */}
                {loading ? (
                  /* Loading skeleton */
                  <div className="space-y-0">
                    {[...Array(8)].map((_, idx) => (
                      <div 
                        key={idx}
                        className="grid text-[10px] bg-white border-b border-[#E1E1E1]"
                        style={{
                          gap: '0px', 
                          gridGap: '0px', 
                          columnGap: '0px',
                          gridTemplateColumns
                        }}
                      >
                        <div className="h-[38px] flex items-center justify-center sticky left-0 bg-white z-10" />
                        {activeColumns.map(col => (
                          <div 
                            key={col.key}
                            className={`h-[38px] flex items-center px-2 ${col.sticky ? 'sticky left-8 bg-white z-10' : ''}`}
                            style={{boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'}}
                          >
                            <div 
                              className="h-3 rounded"
                              style={{ 
                                width: col.key === 'login' ? '60%' : '80%',
                                background: 'linear-gradient(90deg, #E5E7EB 25%, #F3F4F6 50%, #E5E7EB 75%)',
                                backgroundSize: '200% 100%',
                                animation: 'shimmer 1.5s infinite'
                              }} 
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {paginatedData.map((item, idx) => {
                      const rowLogin = item.client_login || item.login
                      const isSelected = selectedRows.has(rowLogin)
                      return (
                      <div 
                        key={idx} 
                        className={`grid text-[10px] text-[#4B4B4B] font-outfit border-b border-[#E1E1E1] transition-colors ${isSelected ? 'bg-blue-50' : 'bg-white hover:bg-[#F8FAFC]'}`}
                        style={{
                          gap: '0px', 
                          gridGap: '0px', 
                          columnGap: '0px',
                          gridTemplateColumns
                        }}
                      >
                        {/* Row checkbox */}
                        <div className="h-[38px] flex items-center justify-center sticky left-0 z-10" style={{ background: isSelected ? '#EFF6FF' : 'white' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(rowLogin)}
                            className="w-3 h-3 rounded cursor-pointer"
                          />
                        </div>
                        {activeColumns.map(col => (
                          <React.Fragment key={col.key}>
                            {renderCellValue(item, col.key, col.sticky)}
                          </React.Fragment>
                        ))}
                      </div>
                      )
                    })}

                    {/* Total Row */}
                    {paginatedData.length > 0 && (
                      <div 
                        className="grid text-[10px] text-[#1A63BC] font-outfit bg-[#EFF4FB] border-t-2 border-[#1A63BC]"
                        style={{
                          gap: '0px', 
                          gridGap: '0px', 
                          columnGap: '0px',
                          gridTemplateColumns
                        }}
                      >
                        <div className="h-[28px]" />
                        {activeColumns.map(col => (
                          <div 
                            key={col.key}
                            className={`h-[28px] flex items-center justify-start px-2 font-semibold ${col.sticky ? 'sticky left-8 bg-[#EFF4FB] z-10' : ''}`}
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
                    {!loading && paginatedData.length === 0 && (
                      <div className="text-center py-8 text-[#9CA3AF] text-sm">
                        No data available
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-blue-600">
              <h2 className="text-base font-semibold text-white">Bulk Update Percentages</h2>
              <button onClick={() => setShowBulkModal(false)} disabled={bulkSaving} className="text-white/80 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-gray-600">Update percentage for <span className="font-semibold text-blue-600">{selectedRows.size}</span> selected client{selectedRows.size !== 1 ? 's' : ''}.</p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Percentage (%)</label>
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
                    className="w-full px-3 py-2.5 pr-8 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                </div>
                <p className="mt-1 text-[10px] text-gray-400">Value must be between 0 and 100</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Comment</label>
                <textarea
                  value={bulkComment}
                  onChange={(e) => setBulkComment(e.target.value)}
                  rows={2}
                  disabled={bulkSaving}
                  placeholder="Optional comment"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowBulkModal(false)} disabled={bulkSaving} className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleBulkUpdate} disabled={bulkSaving || !bulkPercentage} className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {bulkSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      Saving...
                    </span>
                  ) : `Update ${selectedRows.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-blue-600">
              <h2 className="text-base font-semibold text-white">Import CSV</h2>
              <button onClick={() => { setShowImportModal(false); setCsvData([]); setCsvError('') }} disabled={csvImporting} className="text-white/80 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">CSV Format:</p>
                <p>Required: <code className="bg-blue-100 px-1 rounded">login</code>, <code className="bg-blue-100 px-1 rounded">percentage</code></p>
                <p>Optional: <code className="bg-blue-100 px-1 rounded">comment</code></p>
                <p className="mt-1">Example: <code className="bg-blue-100 px-1 rounded">login,percentage,comment</code></p>
                <p><code className="bg-blue-100 px-1 rounded">12345,15.5,Bulk import</code></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Select CSV File</label>
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCSVFile}
                  disabled={csvImporting}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                />
              </div>
              {csvError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 whitespace-pre-line">{csvError}</div>
              )}
              {csvData.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">{csvData.length} row{csvData.length !== 1 ? 's' : ''} ready to import:</p>
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
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
                            <td className="px-3 py-1.5 text-gray-600 truncate max-w-[100px]">{row.comment || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setShowImportModal(false); setCsvData([]); setCsvError('') }} disabled={csvImporting} className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleCSVImport} disabled={csvImporting || csvData.length === 0} className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
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
          setActiveGroupFilter('clientpercentage', null)
          setHasPendingFilterChanges(false)
          setHasPendingGroupChanges(false)
          setPendingFilterDraft(null)
          setPendingGroupDraft(null)
        }}
        onApply={() => {
          if (hasPendingFilterChanges) {
            setFilters(pendingFilterDraft || { hasFloating: false, hasCredit: false, noDeposit: false })
          }
          if (hasPendingGroupChanges) {
            setActiveGroupFilter('clientpercentage', pendingGroupDraft ? pendingGroupDraft.name : null)
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
        }}
        filters={filters}
        onPendingChange={(hasPending, draft) => {
          setHasPendingFilterChanges(hasPending)
          setPendingFilterDraft(draft || null)
        }}
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
        activeGroupName={getActiveGroupFilter('clientpercentage')}
        onSelectGroup={(group) => {
          if (group === null) {
            setActiveGroupFilter('clientpercentage', null)
          } else {
            setActiveGroupFilter('clientpercentage', group.name)
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
                {allColumns.filter(col => col.label.toLowerCase().includes(columnSearch.toLowerCase())).length > 0 ? (
                  allColumns
                    .filter(col => col.label.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(col => (
                    <label 
                      key={col.key} 
                      className="flex items-center justify-between py-3 border-b border-[#F2F2F7] last:border-0"
                    >
                      <span className="text-sm text-[#000000] font-outfit">{col.label}</span>
                      <div className="relative inline-block w-12 h-6">
                        <input
                          type="checkbox"
                          checked={visibleColumns[col.key]}
                          onChange={() => toggleColumn(col.key)}
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

      {/* Sidebar */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-30">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 h-full w-[300px] bg-white shadow-xl rounded-r-2xl flex flex-col">
            <div className="p-4 flex items-center gap-3 border-b border-[#ECECEC]">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#1A63BC"/></svg>
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-[#1A63BC]">Broker Eyes</div>
                <div className="text-[11px] text-[#7A7A7A]">Trading Platform</div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#404040" strokeWidth="2" strokeLinecap="round"/></svg>
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
                  {label:'Live Dealing', path:'/live-dealing', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 18 0" stroke="#404040"/><path d="M7 12a5 5 0 0 1 10 0" stroke="#404040"/></svg>
                  )},
                  {label:'Client Percentage', path:'/client-percentage', active:true, icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6" stroke="#1A63BC"/><circle cx="8" cy="8" r="2" stroke="#1A63BC"/><circle cx="16" cy="16" r="2" stroke="#1A63BC"/></svg>
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
                    className={`flex items-center gap-3 px-4 h-11 text-[13px] ${item.active ? 'text-[#1A63BC] bg-[#EFF4FB] rounded-lg font-semibold' : 'text-[#404040]'}`}
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

      {/* Set Custom Percentage Modal */}
      {showEditModal && selectedClient && (
        <SetCustomPercentageModal
          client={selectedClient}
          onClose={() => {
            setShowEditModal(false)
            setSelectedClient(null)
          }}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Client Details Modal */}
      {selectedClientForDetails && (
        <ClientDetailsMobileModal
          client={selectedClientForDetails}
          onClose={() => setSelectedClientForDetails(null)}
          allPositionsCache={cachedPositions}
          allOrdersCache={orders}
        />
      )}
    </div>
  )
}

