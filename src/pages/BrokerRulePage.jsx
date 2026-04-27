import { useState, useEffect } from 'react'
import { brokerAPI } from '../services/api'
import Sidebar from '../components/Sidebar'
import LoadingSpinner from '../components/LoadingSpinner'
import ApplyRuleModal from '../components/ApplyRuleModal'

const BrokerRulePage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v !== null ? JSON.parse(v) : true
    } catch {
      return true
    }
  })
  const [availableRules, setAvailableRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState(null)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)

  useEffect(() => {
    fetchAvailableRules()
  }, [])

  const fetchAvailableRules = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await brokerAPI.getAvailableRules()
      if (response.status === 'success') {
        setAvailableRules(response.data.rules || [])
      }
    } catch (err) {
      console.error('Error fetching rules:', err)
      setError('Failed to load available rules')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyRule = (rule) => {
    setSelectedRule(rule)
    setIsApplyModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsApplyModalOpen(false)
    setSelectedRule(null)
  }

  // Filter rules based on search
  const filteredRules = availableRules.filter(rule => {
    const searchLower = searchTerm.toLowerCase()
    return (
      rule.rule_name?.toLowerCase().includes(searchLower) ||
      rule.rule_code?.toLowerCase().includes(searchLower) ||
      rule.description?.toLowerCase().includes(searchLower)
    )
  })

  // Pagination calculations
  const totalPages = itemsPerPage === 'All' ? 1 : Math.ceil(filteredRules.length / itemsPerPage)
  const startIndex = itemsPerPage === 'All' ? 0 : (currentPage - 1) * itemsPerPage
  const endIndex = itemsPerPage === 'All' ? filteredRules.length : startIndex + itemsPerPage
  const displayedRules = filteredRules.slice(startIndex, endIndex)

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value)
    setCurrentPage(1)
  }

  const getAvailableOptions = () => {
    const options = [10, 25, 50, 100]
    const total = filteredRules.length
    const validOptions = options.filter(opt => opt < total)
    return [...validOptions, 'All']
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
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-white shadow-sm"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Broker Rule Management</h1>
                <p className="text-xs text-gray-500 mt-0.5">Manage and apply trading rules to client accounts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchAvailableRules}
                className="text-blue-600 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 transition-colors"
                title="Refresh rules"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 mb-4">
            <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-3">
              <p className="text-xs text-gray-500 mb-1">Total Rules</p>
              <p className="text-lg font-semibold text-gray-900">{availableRules.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-green-100 p-3">
              <p className="text-xs text-gray-500 mb-1">Active Rules</p>
              <p className="text-lg font-semibold text-gray-900">
                {availableRules.filter(r => r.is_active).length}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-purple-100 p-3">
              <p className="text-xs text-gray-500 mb-1">With Time Parameters</p>
              <p className="text-lg font-semibold text-gray-900">
                {availableRules.filter(r => r.requires_time_parameter).length}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {/* Pagination and Search - Top */}
          <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white rounded-lg shadow-sm border border-blue-100 p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {getAvailableOptions().map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="text-sm text-gray-600">entries</span>
            </div>

              <div className="flex items-center gap-3">
              {/* Page Navigation */}
              {itemsPerPage !== 'All' && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`p-1.5 rounded-md transition-colors ${
                      currentPage === 1
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <span className="text-sm text-gray-700 font-medium px-2">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`p-1.5 rounded-md transition-colors ${
                      currentPage === totalPages
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-600 hover:bg-gray-100 cursor-pointer'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  placeholder="Search login, code, name..."
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                />
                <svg 
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('')
                      setCurrentPage(1)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="text-sm text-gray-600">
                Showing {startIndex + 1} - {Math.min(endIndex, filteredRules.length)} of {filteredRules.length}
              </div>
            </div>
          </div>

          {/* Rules Table */}
          {loading ? (
            <LoadingSpinner />
          ) : displayedRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-gray-500 bg-white rounded-lg shadow-sm border border-gray-200 p-12">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg font-medium">No rules found</p>
              <p className="text-sm">Try adjusting your search criteria</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                        Rule Code
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                        MT5 Field
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                        Value Template
                      </th>
                      <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                        Time Parameters
                      </th>
                      <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-700 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedRules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            rule.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="inline-block px-2 py-1 text-[10px] font-mono bg-gray-100 text-gray-700 rounded">
                            {rule.rule_code}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-xs text-gray-600 max-w-md">{rule.description}</div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="text-xs font-medium text-gray-800">{rule.mt5_field}</div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="font-mono text-[10px] bg-blue-50 px-2 py-1 rounded border border-blue-200 text-blue-800">
                            {rule.mt5_value_template}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          {rule.requires_time_parameter ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {rule.available_time_parameters?.map((time, idx) => (
                                <span
                                  key={idx}
                                  className="px-1.5 py-0.5 text-[10px] bg-purple-50 border border-purple-200 text-purple-700 rounded"
                                >
                                  {time}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-center">
                          <button
                            onClick={() => handleApplyRule(rule)}
                            disabled={!rule.is_active}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              rule.is_active
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Apply Rule
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Apply Rule Modal */}
          {isApplyModalOpen && selectedRule && (
            <ApplyRuleModal
              rule={selectedRule}
              onClose={handleCloseModal}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default BrokerRulePage
