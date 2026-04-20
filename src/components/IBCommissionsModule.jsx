import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import CustomizeViewModal from './CustomizeViewModal'
import FilterModal from './FilterModal'
import IBFilterModal from './IBFilterModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import EditPercentageModal from './EditPercentageModal'
import { useIB } from '../contexts/IBContext'
import { useGroups } from '../contexts/GroupContext'
import { applyCumulativeFilters } from '../utils/mobileFilters'

const formatNum = (n, decimals = 2) => {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0.00'
  return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function IBCommissionsModule() {
  const navigate = useNavigate()
  const { logout } = useAuth()
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
  const [filters, setFilters] = useState({})
  const carouselRef = useRef(null)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15
  const [isMobileView, setIsMobileView] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [visibleColumns, setVisibleColumns] = useState({
    checkbox: true,
    name: true,
    email: true,
    percentage: true,
    total_commission: false,
    available_commission: false,
    last_synced_at: false,
    actions: true
  })

  // Edit modal states
  const [editingIB, setEditingIB] = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)

  // Bulk update states
  const [selectedIBs, setSelectedIBs] = useState([])
  const [bulkPercentage, setBulkPercentage] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false)

  // API State
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [totals, setTotals] = useState({
    total_commission: 0,
    total_available_commission: 0,
    disbursed_commission: 0,
    available_rebate: 0
  })

  // Clear all filters on component mount (when navigating to this module)
  useEffect(() => {
    clearIBSelection()
    setActiveGroupFilter('ibcommissions', null)
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
    const handleResize = () => setIsMobileView(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Fetch data on mount
  useEffect(() => {
    fetchAllIBCommissions()
    fetchCommissionTotals()
  }, [])

  const fetchAllIBCommissions = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await brokerAPI.getIBCommissions(1, 1000, '', 'id', 'asc')
      
      const commissionsData = response.data?.records || []
      setCommissions(commissionsData)
      
      setLoading(false)
    } catch (err) {
      console.error('Error fetching IB commissions:', err)
      setError('Failed to load IB commissions')
      setLoading(false)
    }
  }

  const fetchCommissionTotals = async () => {
    try {
      const response = await brokerAPI.getIBCommissionTotals()
      if (response?.data?.data) {
        const data = response.data.data
        setTotals({
          total_commission: data.total_commission || 0,
          total_available_commission: data.total_available_commission || 0,
          disbursed_commission: (data.total_commission || 0) - (data.total_available_commission || 0),
          available_rebate: data.total_available_commission || 0,
          total_commission_percentage: data.total_commission_percentage || 0,
          total_available_commission_percentage: data.total_available_commission_percentage || 0
        })
      }
    } catch (err) {
      console.error('Error fetching commission totals:', err)
    }
  }

  // Use commissions data
  const commissionsData = commissions

  // Apply cumulative filters: Customize View -> IB -> Group
  const ibFilteredData = useMemo(() => {
    return applyCumulativeFilters(commissionsData, {
      customizeFilters: filters,
      filterByActiveIB,
      filterByActiveGroup,
      loginField: 'login',
      moduleName: 'ibcommissions'
    })
  }, [commissionsData, filters, filterByActiveIB, filterByActiveGroup, activeGroupFilters])

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalRebate = totals.total_commission
    const disbursedRebate = totals.disbursed_commission
    const availableRebate = totals.total_available_commission
    const totalRebatePercentage = totals.total_commission_percentage
    const availableRebatePercentage = totals.total_available_commission_percentage
    
    return {
      totalRebate,
      disbursedRebate,
      availableRebate,
      totalRebatePercentage,
      availableRebatePercentage
    }
  }, [totals])

  // Filter data based on search
  const filteredData = useMemo(() => {
    let filtered = ibFilteredData.filter(item => {
      if (!searchInput.trim()) return true
      const query = searchInput.toLowerCase()
      return (
        String(item.id || '').toLowerCase().includes(query) ||
        String(item.name || '').toLowerCase().includes(query) ||
        String(item.email || '').toLowerCase().includes(query) ||
        String(item.percentage || '').toLowerCase().includes(query)
      )
    })

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        let aVal = a[sortColumn]
        let bVal = b[sortColumn]

        if (sortColumn === 'percentage' || sortColumn === 'total_commission' || sortColumn === 'available_commission') {
          aVal = parseFloat(aVal) || 0
          bVal = parseFloat(bVal) || 0
          if (sortDirection === 'asc') {
            return aVal - bVal
          } else {
            return bVal - aVal
          }
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
    const iconMap = {
      'TOTAL REBATE': '/Mobile cards icons/Brokers Eye Platform/TOTAL COMMISION.svg',
      'AVAILABLE REBATE': '/Mobile cards icons/Brokers Eye Platform/AVAILABLE Commision.svg',
      'DISBURSED REBATE': '/Mobile cards icons/Brokers Eye Platform/Blocked commision.svg',
      'TOTAL REBATE %': '/Mobile cards icons/Brokers Eye Platform/TOTAL COMMISION%25.svg',
      'AVAILABLE REBATE %': '/Mobile cards icons/Brokers Eye Platform/AVAILABLE Commision%25.svg'
    }
    return iconMap[label] || '/Mobile cards icons/Total Clients.svg'
  }
  
  useEffect(() => {
    const newCards = [
      { label: 'TOTAL REBATE', value: formatNum(summaryStats.totalRebate, 2) },
      { label: 'AVAILABLE REBATE', value: formatNum(summaryStats.availableRebate, 2) },
      { label: 'DISBURSED REBATE', value: formatNum(summaryStats.disbursedRebate, 2) },
      { label: 'TOTAL REBATE %', value: parseFloat(summaryStats.totalRebatePercentage || 0).toFixed(2) },
      { label: 'AVAILABLE REBATE %', value: parseFloat(summaryStats.availableRebatePercentage || 0).toFixed(2) }
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
  }, [summaryStats])

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredData.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredData, currentPage, itemsPerPage])

  // Get visible columns
  const allColumns = [
    { key: 'checkbox', label: '', width: '50px', sticky: true, stickyLeft: '0px', zIndex: 20 },
    { key: 'name', label: 'Name', width: '150px', sticky: !isMobileView, stickyLeft: '50px', zIndex: 10 },
    { key: 'email', label: 'Email', width: '200px' },
    { key: 'percentage', label: 'Percentage', width: '120px' },
    { key: 'total_commission', label: 'Total Rebate', width: '150px' },
    { key: 'available_commission', label: 'Available Rebate', width: '150px' },
    { key: 'last_synced_at', label: 'Last Synced', width: '150px' },
    { key: 'actions', label: 'Actions', width: '80px' }
  ]

  const activeColumns = allColumns.filter(col => visibleColumns[col.key])
  const gridTemplateColumns = activeColumns.map(col => col.width).join(' ')

  const renderCellValue = (item, key, isSticky = false, stickyLeft = '0px', zIndex = 10) => {
    let value = '-'
    
    switch (key) {
      case 'checkbox':
        return (
          <div 
            className={`h-[28px] flex items-center justify-center px-2 ${isSticky ? 'sticky z-20' : ''}`}
            style={{
              left: isSticky ? stickyLeft : 'auto',
              backgroundColor: isSticky ? 'white' : 'transparent',
              boxShadow: isSticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
            }}
          >
            <input
              type="checkbox"
              checked={selectedIBs.includes(item.id)}
              onChange={() => handleSelectIB(item.id)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
            />
          </div>
        )
      case 'name':
        value = item.name || '-'
        break
      case 'email':
        value = item.email || '-'
        break
      case 'percentage':
        value = item.percentage ? `${item.percentage}%` : '-'
        break
      case 'total_commission':
        value = formatNum(item.total_commission || 0, 2)
        break
      case 'available_commission':
        value = formatNum(item.available_commission || 0, 2)
        break
      case 'last_synced_at':
        value = item.last_synced_at ? new Date(item.last_synced_at).toLocaleDateString('en-GB') : '-'
        break
      case 'actions':
        return (
          <div className="h-[28px] flex items-center justify-start px-2">
            <button 
              onClick={() => {
                setEditingIB(item)
                setShowEditModal(true)
              }}
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
        className={`h-[28px] flex items-center justify-start px-2 ${isSticky ? 'sticky' : ''}`}
        style={{
          border: 'none', 
          outline: 'none', 
          left: isSticky ? stickyLeft : 'auto',
          zIndex: isSticky ? zIndex : 'auto',
          backgroundColor: isSticky ? 'white' : 'transparent',
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

      const exportColumns = activeColumns.filter(col => col.key !== 'actions' && col.key !== 'checkbox')
      const headers = exportColumns.map(col => col.label).join(',')
      
      const rows = dataToExport.map(item => {
        return exportColumns.map(col => {
          let value = ''
          
          switch(col.key) {
            case 'name':
              value = item.name || '-'
              break
            case 'email':
              value = item.email || '-'
              break
            case 'percentage':
              value = item.percentage || 0
              break
            case 'total_commission':
              value = formatNum(item.total_commission || 0, 2)
              break
            case 'available_commission':
              value = formatNum(item.available_commission || 0, 2)
              break
            case 'last_synced_at':
              value = item.last_synced_at ? new Date(item.last_synced_at).toLocaleDateString('en-GB') : '-'
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
      link.download = `ib_commissions_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[IBCommissionsModule] Export failed:', error)
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
    setActiveGroupFilter('ibcommissions', getActiveGroupFilter('ibcommissions'))
    setIsGroupOpen(true)
  }

  const handleGroupApply = (groupId) => {
    setActiveGroupFilter('ibcommissions', groupId)
    setIsGroupOpen(false)
  }

  const handleEditSuccess = () => {
    setShowEditModal(false)
    setEditingIB(null)
    fetchAllIBCommissions()
    fetchCommissionTotals()
  }

  // Handle select all checkbox
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIBs(paginatedData.map(ib => ib.id))
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
      
      const updates = selectedIBs.map(id => ({
        id,
        percentage
      }))
      
      const response = await brokerAPI.bulkUpdateIBPercentages(updates)
      
      if (response.status === 'success') {
        setSelectedIBs([])
        setBulkPercentage('')
        setShowBulkUpdateModal(false)
        fetchAllIBCommissions()
        fetchCommissionTotals()
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

  return (
    <div className="h-screen flex flex-col bg-[#F5F7FA] overflow-hidden">


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
          <h1 className="text-xl font-bold text-[#1F2937] absolute left-1/2 transform -translate-x-1/2">IB Commissions</h1>
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
        <div className="pt-3 pb-2 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-[8px]">
              {!isMobileView && (
                <button 
                  onClick={() => setIsCustomizeOpen(true)} 
                  className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative ${
                    (selectedIB || getActiveGroupFilter('ibcommissions'))
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
                      selectedIB,
                      getActiveGroupFilter('ibcommissions')
                    ].filter(Boolean).length;
                    return filterCount > 0 ? (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {filterCount}
                      </span>
                    ) : null;
                  })()}
                </button>
              )}
              <button 
                onClick={handleOpenBulkModal}
                className="h-8 px-3 rounded-[12px] bg-blue-600 border border-blue-600 shadow-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
                title="Bulk Update Selected IBs"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3.5V10.5M3.5 7H10.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="text-white text-[10px] font-medium font-outfit">Bulk Update</span>
              </button>
              <button 
                onClick={handleExportToCSV}
                className="h-8 w-8 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                title="Export to CSV"
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
        <div className="pb-2 px-4">
          <div 
            ref={carouselRef}
            className="flex gap-[8px] overflow-x-auto scrollbar-hide snap-x snap-mandatory"
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
                    color: '#000000'
                  }}>
                    {card.value === '' || card.value === undefined ? '0.00' : card.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search and Pagination Controls */}
        <div className="pb-2 px-4">
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
            <div className="flex items-center gap-[4px] px-2 text-[10px] font-medium text-[#4B4B4B]">
              <input
                type="number"
                min="1"
                max={Math.ceil(filteredData.length / itemsPerPage)}
                value={currentPage}
                onChange={(e) => {
                  const page = Number(e.target.value);
                  if (!isNaN(page) && page >= 1 && page <= Math.ceil(filteredData.length / itemsPerPage)) {
                    setCurrentPage(page);
                  }
                }}
                className="w-10 h-6 border border-[#ECECEC] rounded-[8px] text-center text-[10px] font-semibold"
              />
              <span className="text-[#9CA3AF]">/</span>
              <span>{Math.ceil(filteredData.length / itemsPerPage)}</span>
            </div>

            <button 
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredData.length / itemsPerPage), prev + 1))}
              disabled={currentPage >= Math.ceil(filteredData.length / itemsPerPage)}
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
          <div className="bg-white shadow-[0_0_20px_rgba(75,75,75,0.08)] overflow-hidden">
            <div className="w-full overflow-x-auto overflow-y-visible" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin', scrollbarColor: '#CBD5E0 #F7FAFC' }}>
              <div className="relative" style={{ minWidth: 'max-content' }}>
                {/* Table Header */}
                <div 
                  className="grid bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wide sticky top-0 z-20 shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
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
                      onClick={() => col.key !== 'actions' && col.key !== 'checkbox' && handleSort(col.key)}
                      className={`h-[36px] flex items-center ${col.key === 'checkbox' ? 'justify-center' : 'justify-start'} px-1 ${
                        col.key !== 'checkbox' ? 'cursor-pointer' : ''
                      } ${
                        col.sticky ? 'sticky left-0 bg-blue-500 z-30' : ''
                      }`}
                      style={{
                        border: 'none',
                        outline: 'none',
                        boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.1)' : 'none',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        touchAction: 'manipulation',
                        left: col.sticky ? col.stickyLeft : 'auto',
                        zIndex: col.sticky ? (col.zIndex || 10) : 'auto',
                        backgroundColor: '#3B82F6'
                      }}
                    >
                      {col.key === 'checkbox' ? (
                        <input
                          type="checkbox"
                          checked={paginatedData.length > 0 && selectedIBs.length === paginatedData.length}
                          onChange={handleSelectAll}
                          className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                        />
                      ) : (
                        <>
                          <span className="truncate">{col.label}</span>
                          {sortColumn === col.key && (
                            <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Table Body */}
                {loading ? (
                  // YouTube-style skeleton loading
                  Array.from({ length: 8 }).map((_, idx) => (
                    <div 
                      key={`skeleton-${idx}`} 
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
                          className={`h-[28px] flex items-center ${col.key === 'checkbox' ? 'justify-center' : 'justify-start'} px-2 ${
                            col.sticky ? 'sticky left-0' : ''
                          }`}
                          style={{
                            border: 'none',
                            outline: 'none',
                            boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none',
                            left: col.sticky ? col.stickyLeft : 'auto',
                            zIndex: col.sticky ? (col.zIndex || 10) : 'auto',
                            backgroundColor: col.sticky ? 'white' : 'transparent'
                          }}
                        >
                          <div 
                            className={`bg-gray-200 rounded animate-pulse ${
                              col.key === 'checkbox' ? 'h-4 w-4' :
                              col.key === 'id' ? 'h-3 w-8' :
                              col.key === 'name' ? 'h-3 w-24' :
                              col.key === 'email' ? 'h-3 w-32' :
                              col.key === 'percentage' || col.key === 'total_commission' || col.key === 'available_rebate' || col.key === 'disbursed_rebate' ? 'h-3 w-16' :
                              col.key === 'actions' ? 'h-6 w-12' :
                              'h-3 w-20'
                            }`}
                          ></div>
                        </div>
                      ))}
                    </div>
                  ))
                ) : paginatedData.map((item, idx) => (
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
                        {renderCellValue(item, col.key, col.sticky, col.stickyLeft, col.zIndex)}
                      </React.Fragment>
                    ))}
                  </div>
                ))}

                {/* Total Row */}
                {paginatedData.length > 0 && (
                  <div 
                    className="grid text-[10px] text-[#1A63BC] font-outfit border-t border-[#1A63BC]"
                    style={{
                      gap: '0px', 
                      gridGap: '0px', 
                      columnGap: '0px',
                      gridTemplateColumns,
                      backgroundColor: '#EFF4FB'
                    }}
                  >
                    {activeColumns.map(col => (
                      <div 
                        key={col.key}
                        className={`h-[28px] flex items-center justify-start px-2 font-semibold ${col.sticky ? 'sticky left-0' : ''}`}
                        style={{
                          border: 'none', 
                          outline: 'none', 
                          backgroundColor: '#EFF4FB',
                          boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none',
                          left: col.sticky ? col.stickyLeft : 'auto',
                          zIndex: col.sticky ? (col.zIndex || 10) : 'auto'
                        }}
                      >
                        {col.key === 'checkbox' ? '' : col.key === 'name' ? 'Total' : ''}
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customize View Modal */}
      <CustomizeViewModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        onIBFilterClick={() => {
          setIsCustomizeOpen(false)
          setIsIBFilterOpen(true)
        }}
      />

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={(newFilters) => handleModalApply('filter', newFilters)}
        currentFilters={filters}
      />

      {/* IB Filter Modal */}
      <IBFilterModal
        isOpen={isIBFilterOpen}
        onClose={() => setIsIBFilterOpen(false)}
        onApply={(ibId) => handleModalApply('ibfilter', ibId)}
        selectedIB={selectedIB}
      />

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupOpen}
        onClose={() => setIsGroupOpen(false)}
        onApply={handleGroupApply}
        groups={groups}
        activeGroupId={getActiveGroupFilter('ibcommissions')}
        onCreateNew={() => {
          setIsGroupOpen(false)
          setEditingGroup(null)
          setIsLoginGroupModalOpen(true)
        }}
        onEdit={(group) => {
          setIsGroupOpen(false)
          setEditingGroup(group)
          setIsLoginGroupModalOpen(true)
        }}
        onDelete={(groupId) => {
          if (window.confirm('Are you sure you want to delete this group?')) {
            deleteGroup(groupId)
          }
        }}
      />

      {/* Login Groups Modal */}
      <LoginGroupsModal
        isOpen={isLoginGroupsOpen}
        onClose={() => setIsLoginGroupsOpen(false)}
        onCreateNew={() => {
          setIsLoginGroupsOpen(false)
          setEditingGroup(null)
          setIsLoginGroupModalOpen(true)
        }}
        onEdit={(group) => {
          setIsLoginGroupsOpen(false)
          setEditingGroup(group)
          setIsLoginGroupModalOpen(true)
        }}
        onDeleteGroup={(group) => {
          deleteGroup(group.name)
          setIsLoginGroupsOpen(false)
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

      {/* Edit Percentage Modal */}
      {showEditModal && editingIB && (
        <EditPercentageModal
          ib={editingIB}
          onClose={() => {
            setShowEditModal(false)
            setEditingIB(null)
          }}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Edit Percentage Modal */}
      {showEditModal && editingIB && (
        <EditPercentageModal
          ib={editingIB}
          onClose={() => {
            setShowEditModal(false)
            setEditingIB(null)
          }}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Bulk Update Modal */}
      {showBulkUpdateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl">
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
                  <strong>Note:</strong> Please check the IDs you want to update using the checkboxes in the table, then enter the percentage value to apply.
                </p>
              </div>

              {/* Selected IDs Field */}
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
                    <p className="text-gray-400 text-sm italic">No emails selected</p>
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
            <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex gap-3">
              <button
                onClick={() => {
                  setShowBulkUpdateModal(false)
                  setBulkPercentage('')
                }}
                disabled={bulkUpdating}
                className="flex-1 px-4 py-3 text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUpdate}
                disabled={bulkUpdating || selectedIBs.length === 0}
                className="flex-1 px-4 py-3 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {bulkUpdating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Update All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div className="relative">
                <input 
                  type="text"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  placeholder="Search columns..."
                  className="w-full h-10 px-4 pr-10 bg-[#F8F8F8] border border-[#ECECEC] rounded-lg text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#1A63BC] transition-colors"
                />
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF] pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                  <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-5 py-2 min-h-[450px] max-h-[55vh]">
              {allColumns
                .filter(col => col.label.toLowerCase().includes(columnSearch.toLowerCase()))
                .map(col => (
                <label 
                  key={col.key}
                  className="flex items-center gap-3 py-3 border-b border-[#F2F2F7] last:border-0 cursor-pointer hover:bg-[#F8F8F8] px-2 rounded transition-colors"
                >
                  <input 
                    type="checkbox"
                    checked={visibleColumns[col.key]}
                    onChange={() => toggleColumn(col.key)}
                    className="w-5 h-5 rounded border-2 border-[#CCCCCC] text-[#1A63BC] focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-sm text-[#000000]">{col.label}</span>
                </label>
              ))}
            </div>
            
            <div className="px-5 py-4 border-t border-[#E5E7EB] flex gap-3 flex-shrink-0">
              <button 
                onClick={() => setIsColumnSelectorOpen(false)}
                className="flex-1 h-12 rounded-xl bg-[#F8F8F8] text-[#000000] text-sm hover:bg-[#ECECEC] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => setIsColumnSelectorOpen(false)}
                className="flex-1 h-12 rounded-xl bg-[#1A63BC] text-white text-sm hover:bg-[#1557A8] transition-colors"
              >
                Apply
              </button>
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
                  {label:'Client Percentage', path:'/client-percentage', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6" stroke="#404040"/><circle cx="8" cy="8" r="2" stroke="#404040"/><circle cx="16" cy="16" r="2" stroke="#404040"/></svg>
                  )},
                  {label:'IB Commissions', path:'/ib-commissions', active:true, icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#1A63BC"/><path d="M12 7v10M8 10h8" stroke="#1A63BC"/></svg>
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
              <button onClick={logout} className="flex items-center gap-3 px-2 h-10 text-[13px] text-[#404040]">
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
    </div>
  )
}

