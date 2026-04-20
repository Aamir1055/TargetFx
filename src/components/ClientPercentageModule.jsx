import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import IBFilterModal from './IBFilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import SetCustomPercentageModal from './SetCustomPercentageModal'
import ClientDetailsMobileModal from './ClientDetailsMobileModal'
import { useIB } from '../contexts/IBContext'
import { useGroups } from '../contexts/GroupContext'
import { applyCumulativeFilters } from '../utils/mobileFilters'

const formatNum = (n, decimals = 2) => {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0.00'
  return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function ClientPercentageModule() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { positions: cachedPositions, clients: allClients, orders } = useData()
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
  const [hasPendingFilterChanges, setHasPendingFilterChanges] = useState(false)
  const [pendingFilterDraft, setPendingFilterDraft] = useState(null)
  const [hasPendingIBChanges, setHasPendingIBChanges] = useState(false)
  const [pendingIBDraft, setPendingIBDraft] = useState(null)
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
    clearIBSelection()
    setActiveGroupFilter('clientpercentage', null)
    setSearchInput('')
  }, [])

  // Listen for global request to open Customize View from child modals
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
      filterByActiveIB,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'clientpercentage'
    })
  }, [percentageData, filters, filterByActiveIB, filterByActiveGroup, activeGroupFilters])

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
      'CUSTOM %': `${baseUrl}Desktop cards icons/AVAILABLE Commision%25.svg`,
      'DEFAULT': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'AVG %': `${baseUrl}Desktop cards icons/AVAILABLE Commision%25.svg`
    }
    return iconMap[label] || `${baseUrl}Desktop cards icons/Total Clients.svg`
  }
  
  useEffect(() => {
    const newCards = [
      { label: 'TOTAL CLIENTS', value: String(stats.total), numericValue: stats.total },
      { label: 'CUSTOM %', value: String(stats.total_custom), numericValue: stats.total_custom },
      { label: 'DEFAULT', value: String(stats.total_default), numericValue: stats.total_default }
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
  }, [stats])

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
  const gridTemplateColumns = activeColumns.map(col => col.width).join(' ')

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
    } else if (type === 'ibfilter') {
      if (value) {
        selectIB(value)
      } else {
        clearIBSelection()
      }
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
                    (filters.hasFloating || filters.hasCredit || filters.noDeposit || selectedIB || getActiveGroupFilter('clientpercentage'))
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
                      selectedIB,
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
                        {activeColumns.map(col => (
                          <div 
                            key={col.key}
                            className={`h-[38px] flex items-center px-2 ${col.sticky ? 'sticky left-0 bg-white z-10' : ''}`}
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
                    {paginatedData.map((item, idx) => (
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
                            {renderCellValue(item, col.key, col.sticky)}
                          </React.Fragment>
                        ))}
                      </div>
                    ))}

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

      {/* CustomizeView Modal */}
      <CustomizeViewModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        onFilterClick={() => {
          setIsCustomizeOpen(false)
          setIsFilterOpen(true)
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
          clearIBSelection()
          setActiveGroupFilter('clientpercentage', null)
          setHasPendingFilterChanges(false)
          setHasPendingIBChanges(false)
          setHasPendingGroupChanges(false)
          setPendingFilterDraft(null)
          setPendingIBDraft(null)
          setPendingGroupDraft(null)
        }}
        onApply={() => {
          if (hasPendingFilterChanges) {
            setFilters(pendingFilterDraft || { hasFloating: false, hasCredit: false, noDeposit: false })
          }
          if (hasPendingIBChanges) {
            if (pendingIBDraft) { selectIB(pendingIBDraft) } else { clearIBSelection() }
          }
          if (hasPendingGroupChanges) {
            setActiveGroupFilter('clientpercentage', pendingGroupDraft ? pendingGroupDraft.name : null)
          }
          setIsCustomizeOpen(false)
          setHasPendingFilterChanges(false)
          setHasPendingIBChanges(false)
          setHasPendingGroupChanges(false)
          setPendingFilterDraft(null)
          setPendingIBDraft(null)
          setPendingGroupDraft(null)
        }}
        hasPendingChanges={hasPendingFilterChanges || hasPendingIBChanges || hasPendingGroupChanges}
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

      {/* IB Filter Modal */}
      <IBFilterModal
        isOpen={isIBFilterOpen}
        onClose={() => setIsIBFilterOpen(false)}
        onSelectIB={(ib) => {
          selectIB(ib)
          setIsIBFilterOpen(false)
        }}
        onClearSelection={() => {
          clearIBSelection()
          setIsIBFilterOpen(false)
        }}
        currentSelectedIB={selectedIB}
        onPendingChange={(hasPending, draft) => {
          setHasPendingIBChanges(hasPending)
          setPendingIBDraft(draft || null)
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
              <nav className="flex flex-col">
                {[
                  {label:'Dashboard', path:'/dashboard', icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#404040"/></svg>
                  )},
                  {label:'Clients', path:'/client2', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="#404040"/><circle cx="16" cy="8" r="3" stroke="#404040"/><path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="#404040"/></svg>
                  )},
                  {label:'Positions', path:'/positions', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1" stroke="#404040"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="#404040"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="#404040"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="#404040"/></svg>
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

