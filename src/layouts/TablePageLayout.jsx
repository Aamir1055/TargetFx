import { useState, useRef, useEffect } from 'react'
import { useGroups } from '../contexts/GroupContext'
import Sidebar from '../components/Sidebar'
import WebSocketIndicator from '../components/WebSocketIndicator'
import LoadingSpinner from '../components/LoadingSpinner'
import GroupSelector from '../components/GroupSelector'
import IBSelector from '../components/IBSelector'
import GroupModal from '../components/GroupModal'

/**
 * Reusable layout component for table-based pages
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {Array} props.data - Raw data array
 * @param {Array} props.allColumns - All available columns [{key, label}]
 * @param {Object} props.defaultVisibleColumns - Default visible columns {columnKey: true/false}
 * @param {Function} props.renderRow - Function to render table row (item, index, options) => JSX
 * @param {string} props.loginField - Field name for login (default: 'login')
 * @param {string} props.displayField - Field for display in group modal
 * @param {string} props.secondaryField - Secondary field for group modal (optional)
 * @param {boolean} props.loading - Loading state
 * @param {string} props.connectionState - WebSocket connection state
 * @param {Function} props.onRefresh - Refresh data callback (optional)
 * @param {Object} props.filterOptions - Additional filter options (optional)
 * @param {Function} props.renderFilterMenu - Custom filter menu renderer (optional)
 * @param {Function} props.renderDisplayMenu - Custom display menu renderer (optional)
 * @param {Function} props.customFilterFn - Custom filter function (item, searchQuery) => boolean (optional)
 * @param {Object} props.extraActions - Extra action buttons to render (optional)
 */
const TablePageLayout = ({
  title,
  data = [],
  allColumns = [],
  defaultVisibleColumns = {},
  renderRow,
  loginField = 'login',
  displayField,
  secondaryField,
  loading = false,
  connectionState,
  onRefresh,
  filterOptions,
  renderFilterMenu,
  renderDisplayMenu,
  customFilterFn,
  extraActions,
  children
}) => {
  const { filterByActiveGroup } = useGroups()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showDisplayMenu, setShowDisplayMenu] = useState(false)
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  
  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns)
  
  // Refs
  const columnSelectorRef = useRef(null)
  const filterMenuRef = useRef(null)
  const displayMenuRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target)) {
        setShowColumnSelector(false)
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setShowFilterMenu(false)
      }
      if (displayMenuRef.current && !displayMenuRef.current.contains(event.target)) {
        setShowDisplayMenu(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Toggle column visibility
  const toggleColumn = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  // Search filtering
  const defaultFilterFn = (item, query) => {
    const lowerQuery = query.toLowerCase()
    return Object.values(item).some(val => 
      String(val).toLowerCase().includes(lowerQuery)
    )
  }

  const filterFn = customFilterFn || defaultFilterFn
  const searchedData = searchQuery 
    ? data.filter(item => filterFn(item, searchQuery))
    : data

  // Group filtering
  const filteredData = filterByActiveGroup(searchedData, loginField)

  // Sorting
  const sortedData = [...filteredData]
  if (sortColumn) {
    sortedData.sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      if (sortDirection === 'asc') {
        return aStr < bStr ? -1 : aStr > bStr ? 1 : 0
      } else {
        return aStr > bStr ? -1 : aStr < bStr ? 1 : 0
      }
    })
  }

  // Pagination
  const totalPages = Math.ceil(sortedData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = sortedData.slice(startIndex, endIndex)

  // Reset to page 1 when data changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filteredData.length])

  // Handle sort
  const handleSort = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-gray-600 hover:text-gray-900 lg:hidden"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <WebSocketIndicator state={connectionState} />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden p-4">
          <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
            {/* Controls Bar */}
            <div className="px-4 py-2.5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between bg-gray-50">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative" ref={searchRef}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setShowSuggestions(true)
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Search..."
                    className="w-48 px-2.5 py-1.5 pr-8 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-xs"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('')
                        setShowSuggestions(false)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Items per page */}
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
              {/* Groups Dropdown */}
              <GroupSelector onCreateClick={() => setShowGroupModal(true)} />
              
              {/* IB Filter Dropdown */}
              <IBSelector />
              
              {/* Filter Button */}
              {renderFilterMenu && (
                <div className="relative" ref={filterMenuRef}>
                  <button
                    onClick={() => setShowFilterMenu(!showFilterMenu)}
                    className="text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-white border border-gray-300 transition-colors inline-flex items-center gap-1.5 text-xs"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filter
                  </button>
                  {showFilterMenu && renderFilterMenu()}
                </div>
              )}

              {/* Display Menu */}
              {renderDisplayMenu && (
                <div className="relative" ref={displayMenuRef}>
                  <button
                    onClick={() => setShowDisplayMenu(!showDisplayMenu)}
                    className="text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-white border border-gray-300 transition-colors inline-flex items-center gap-1.5 text-xs"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Display
                  </button>
                  {showDisplayMenu && renderDisplayMenu()}
                </div>
              )}

              {/* Column Selector */}
              <div className="relative" ref={columnSelectorRef}>
                <button
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className="text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-white border border-gray-300 transition-colors inline-flex items-center gap-1.5 text-xs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                  Columns
                </button>
                {showColumnSelector && (
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 w-48">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-700 uppercase">Toggle Columns</p>
                    </div>
                    <div className="py-1 max-h-80 overflow-y-auto">
                      {allColumns.map((col) => (
                        <label
                          key={col.key}
                          className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key]}
                            onChange={() => toggleColumn(col.key)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="ml-2 text-xs text-gray-700">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Refresh Button */}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={loading}
                  className="text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg hover:bg-white border border-gray-300 transition-colors inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              )}

              {/* Extra Actions */}
              {extraActions}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              {loading ? (
                <LoadingSpinner />
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr className="border-b border-gray-200">
                      {allColumns
                        .filter(col => visibleColumns[col.key])
                        .map((col) => (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            className="px-4 py-2.5 text-left font-semibold text-gray-700 cursor-pointer hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-1">
                              {col.label}
                              {sortColumn === col.key && (
                                <svg
                                  className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              )}
                            </div>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {paginatedData.length === 0 ? (
                      <tr>
                        <td colSpan={allColumns.filter(col => visibleColumns[col.key]).length} className="px-4 py-8 text-center text-gray-500">
                          No data available
                        </td>
                      </tr>
                    ) : (
                      paginatedData.map((item, index) => 
                        renderRow(item, index, { visibleColumns, handleSort, sortColumn, sortDirection })
                      )
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
              <div className="text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, sortedData.length)} of {sortedData.length} results
                {data.length !== sortedData.length && ` (filtered from ${data.length})`}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-2.5 py-1.5 text-gray-700">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="px-2.5 py-1.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        availableItems={data}
        loginField={loginField}
        displayField={displayField}
        secondaryField={secondaryField}
      />

      {/* Custom children (e.g., modals) */}
      {children}
    </div>
  )
}

export default TablePageLayout
