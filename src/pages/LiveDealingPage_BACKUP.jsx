import { useState, useEffect, useRef } from 'react'
import websocketService from '../services/websocket'
import Sidebar from '../components/Sidebar'
import WebSocketIndicator from '../components/WebSocketIndicator'
import LoadingSpinner from '../components/LoadingSpinner'

const DEBUG_LOGS = import.meta?.env?.VITE_DEBUG_LOGS === 'true'

const LiveDealingPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v ? JSON.parse(v) : false
    } catch {
      return false
    }
  })
  
  // Load deals from localStorage on mount
  const [deals, setDeals] = useState(() => {
    try {
      const saved = localStorage.getItem('live_deals_cache')
      if (saved) {
        const parsed = JSON.parse(saved)
        console.log('[LiveDealing] 🔄 Restored', parsed.length, 'deals from cache')
        return parsed
      }
    } catch (error) {
      console.error('[LiveDealing] Error loading cache:', error)
    }
    return []
  })
  
  const [connectionState, setConnectionState] = useState('disconnected')
  const [loading, setLoading] = useState(true)
  const hasInitialLoad = useRef(false)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')

  // Save deals to localStorage whenever they change
  useEffect(() => {
    if (deals.length > 0) {
      try {
        localStorage.setItem('live_deals_cache', JSON.stringify(deals))
        if (DEBUG_LOGS) console.log('[LiveDealing] 💾 Saved', deals.length, 'deals to cache')
      } catch (error) {
        console.error('[LiveDealing] Error saving cache:', error)
      }
    }
  }, [deals])

  useEffect(() => {
    if (!hasInitialLoad.current) {
      hasInitialLoad.current = true
      console.log('[LiveDealing] 🚀 Starting WebSocket-only mode...')
      websocketService.connect()
      
      // Show UI after short delay
      setTimeout(() => {
        setLoading(false)
      }, 1500)
    }

    // Subscribe to connection state changes
    const unsubscribeConnectionState = websocketService.onConnectionStateChange((state) => {
      console.log('[LiveDealing] Connection state changed:', state)
      setConnectionState(state)
    })

    // Subscribe to DEAL_ADDED event
    const unsubscribeDealAdded = websocketService.subscribe('DEAL_ADDED', handleDealEvent)
    const unsubscribeDealCreated = websocketService.subscribe('DEAL_CREATED', handleDealEvent)
    const unsubscribeNewDeal = websocketService.subscribe('NEW_DEAL', handleDealEvent)
    const unsubscribeDeal = websocketService.subscribe('deal', handleDealEvent)
    
    // Subscribe to DEAL_DELETED event
    const unsubscribeDealDeleted = websocketService.subscribe('DEAL_DELETED', handleDealDeleteEvent)
    
    // Subscribe to all messages for debugging
    const unsubscribeAll = websocketService.subscribe('all', (data) => {
      if (DEBUG_LOGS) console.log('[LiveDealing] WebSocket message:', data)
    })

    return () => {
      unsubscribeConnectionState()
      unsubscribeDealAdded()
      unsubscribeDealCreated()
      unsubscribeNewDeal()
      unsubscribeDeal()
      unsubscribeDealDeleted()
      unsubscribeAll()
    }
  }, [])

  const handleDealEvent = (data) => {
    console.log('[LiveDealing] 🔥 DEAL event received:', data)
    setLoading(false)
    
    try {
      const dealData = data.data || data
      const login = data.login || dealData.login
      
      // Create deal entry
      const dealEntry = {
        id: dealData.deal || Date.now() + Math.random(),
        time: dealData.time || data.timestamp || Math.floor(Date.now() / 1000),
        dealer: dealData.dealer || '-',
        login: login,
        request: formatRequestFromDeal(dealData, login),
        answer: 'Done',
        rawData: data
      }

      console.log('[LiveDealing] ➕ Adding deal:', dealEntry.id)

      // Add to the beginning (newest first)
      setDeals(prevDeals => {
        // Check if already exists
        if (prevDeals.some(d => d.id === dealEntry.id)) {
          console.log('[LiveDealing] ⚠️ Deal already exists:', dealEntry.id)
          return prevDeals
        }
        
        const newDeals = [dealEntry, ...prevDeals]
        console.log(`[LiveDealing] ✅ Total deals: ${newDeals.length}`)
        
        // Limit to 500 deals max
        return newDeals.slice(0, 500)
      })
    } catch (error) {
      console.error('[LiveDealing] Error processing DEAL event:', error)
    }
  }

  const handleDealDeleteEvent = (data) => {
    console.log('[LiveDealing] 🗑️ DEAL_DELETED event received:', data)
    
    try {
      const dealId = data.data?.deal || data.deal || data.data?.id || data.id
      
      if (!dealId) {
        console.warn('[LiveDealing] No deal ID found in delete event')
        return
      }

      setDeals(prevDeals => {
        const filtered = prevDeals.filter(d => d.id !== dealId)
        if (filtered.length < prevDeals.length) {
          console.log(`[LiveDealing] ✅ Deleted deal ${dealId}. Remaining: ${filtered.length}`)
        }
        return filtered
      })
    } catch (error) {
      console.error('[LiveDealing] Error processing DEAL_DELETED event:', error)
    }
  }

  const formatRequestFromDeal = (dealData, login = null) => {
    const action = getActionLabel(dealData.action)
    const volume = dealData.volume ? (dealData.volume / 10000).toFixed(2) : ''
    const symbol = dealData.symbol || ''
    const price = dealData.price || ''
    const dealLogin = login || dealData.login || ''
    const comment = dealData.comment || ''

    // For BALANCE/CREDIT operations, show comment and profit
    if (action === 'Balance' || action === 'Credit') {
      const profit = dealData.profit || 0
      return `for '${dealLogin}' ${action} ${profit > 0 ? '+' : ''}${profit.toFixed(2)} ${comment ? `(${comment})` : ''}`
    }

    // For trading operations
    if (action && volume && symbol && price) {
      return `for '${dealLogin}' ${action} ${volume} ${symbol} at ${parseFloat(price).toFixed(5)}`
    }
    
    // Fallback
    return `${action || 'Operation'} for '${dealLogin}'${comment ? ` - ${comment}` : ''}`
  }

  const getActionLabel = (action) => {
    const actionMap = {
      'BUY': 'buy',
      'SELL': 'sell',
      'BALANCE': 'Balance',
      'CREDIT': 'Credit',
      'CHARGE': 'Charge',
      'CORRECTION': 'Correction',
      'BONUS': 'Bonus',
      'COMMISSION': 'Commission',
      'DAILY': 'Daily',
      'MONTHLY': 'Monthly',
      'AGENT_DAILY': 'Agent Daily',
      'AGENT_MONTHLY': 'Agent Monthly',
      'INTERESTRATE': 'Interest',
      'CANCEL_BUY': 'Cancel Buy',
      'CANCEL_SELL': 'Cancel Sell',
      'SO_CLOSE': 'Stop Out',
      'TP_CLOSE': 'TP Close',
      'SL_CLOSE': 'SL Close'
    }
    return actionMap[action] || action || 'Unknown'
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  const handleRefresh = () => {
    console.log('[LiveDealing] 🔄 Manual refresh - keeping existing deals')
    // Don't clear deals, just reconnect if needed
    if (connectionState !== 'connected') {
      websocketService.connect()
    }
  }

  const handleClear = () => {
    console.log('[LiveDealing] 🗑️ Clearing all deals')
    setDeals([])
    localStorage.removeItem('live_deals_cache')
  }

  // Sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const sortDeals = (dealsToSort) => {
    if (!sortColumn) return dealsToSort

    return [...dealsToSort].sort((a, b) => {
      let aVal = a[sortColumn]
      let bVal = b[sortColumn]

      // Handle time sorting
      if (sortColumn === 'time') {
        aVal = parseInt(aVal) || 0
        bVal = parseInt(bVal) || 0
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      // Handle numeric values
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      // Handle string values
      const aStr = String(aVal || '').toLowerCase()
      const bStr = String(bVal || '').toLowerCase()
      
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr)
      } else {
        return bStr.localeCompare(aStr)
      }
    })
  }

  // Pagination
  const sortedDeals = sortDeals(deals)
  const totalPages = itemsPerPage === 'All' ? 1 : Math.ceil(sortedDeals.length / itemsPerPage)
  const startIndex = itemsPerPage === 'All' ? 0 : (currentPage - 1) * itemsPerPage
  const endIndex = itemsPerPage === 'All' ? sortedDeals.length : startIndex + itemsPerPage
  const displayedDeals = sortedDeals.slice(startIndex, endIndex)

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value)
    setCurrentPage(1)
  }

  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  const getPageNumbers = () => {
    const pages = []
    const maxVisible = 5
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2))
    let endPage = Math.min(totalPages, startPage + maxVisible - 1)
    
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1)
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i)
    }
    return pages
  }

  const getAvailableOptions = () => {
    const options = ['All']
    const maxOption = Math.ceil(sortedDeals.length / 50) * 50
    for (let i = 50; i <= maxOption; i += 50) {
      options.push(i)
    }
    return options
  }

  const getSortIcon = (column) => {
    if (sortColumn !== column) {
      return <span className="text-gray-400 ml-1">⇅</span>
    }
    return sortDirection === 'asc' 
      ? <span className="text-blue-600 ml-1">↑</span>
      : <span className="text-blue-600 ml-1">↓</span>
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} activePage="live-dealing" />
      
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <div className="p-6">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Live Dealing</h1>
              <p className="text-sm text-gray-600 mt-1">Real-time trading activity monitor</p>
            </div>
            <div className="flex items-center gap-3">
              <WebSocketIndicator />
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <span>🔄</span>
                Refresh
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <span>🗑️</span>
                Clear
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-3">
              <p className="text-xs text-gray-500 mb-1">Total Deals</p>
              <p className="text-lg font-semibold text-gray-900">{deals.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-green-100 p-3">
              <p className="text-xs text-gray-500 mb-1">Connection Status</p>
              <p className={`text-lg font-semibold ${
                connectionState === 'connected' ? 'text-green-600' :
                connectionState === 'connecting' ? 'text-yellow-600' :
                'text-red-600'
              }`}>
                {connectionState === 'connected' ? 'Live' :
                 connectionState === 'connecting' ? 'Connecting...' :
                 'Disconnected'}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-purple-100 p-3">
              <p className="text-xs text-gray-500 mb-1">Unique Logins</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Set(deals.map(d => d.login)).size}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-indigo-100 p-3">
              <p className="text-xs text-gray-500 mb-1">Cache Status</p>
              <p className="text-lg font-semibold text-gray-900">
                {deals.length > 0 ? 'Saved' : 'Empty'}
              </p>
            </div>
          </div>

          {/* Pagination - Top */}
          <div className="mb-3 flex items-center justify-between bg-white rounded-lg shadow-sm border border-blue-100 p-3">
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
            <div className="text-sm text-gray-600">
              Showing {startIndex + 1} - {Math.min(endIndex, sortedDeals.length)} of {sortedDeals.length}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <LoadingSpinner />
          ) : deals.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <div className="text-6xl mb-4">⚡</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No deals found</h3>
              <p className="text-sm text-gray-500 mb-4">Trading activity will appear here</p>
              <div className="text-xs text-gray-400">
                <p className="mb-1">
                  <span className="inline-flex items-center gap-1">
                    <span className={connectionState === 'connected' ? 'text-green-600' : 'text-red-600'}>●</span>
                    Real-time via WebSocket (DEAL_ADDED events)
                  </span>
                </p>
                <p>
                  <span className="inline-flex items-center gap-1">
                    {connectionState === 'connected' ? '✅ Connected & Live' : '❌ Disconnected'}
                  </span>
                </p>
                <p className="mt-2">
                  ✅ Ready! New deals will appear automatically when trades are executed.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-blue-50 to-indigo-50">
                  <tr>
                    <th
                      onClick={() => handleSort('time')}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-blue-100 transition-colors select-none"
                    >
                      Time {getSortIcon('time')}
                    </th>
                    <th
                      onClick={() => handleSort('dealer')}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-blue-100 transition-colors select-none"
                    >
                      Dealer {getSortIcon('dealer')}
                    </th>
                    <th
                      onClick={() => handleSort('login')}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-blue-100 transition-colors select-none"
                    >
                      Login {getSortIcon('login')}
                    </th>
                    <th
                      onClick={() => handleSort('request')}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-blue-100 transition-colors select-none"
                    >
                      Request {getSortIcon('request')}
                    </th>
                    <th
                      onClick={() => handleSort('answer')}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-blue-100 transition-colors select-none"
                    >
                      Answer {getSortIcon('answer')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayedDeals.map((deal, index) => (
                    <tr key={deal.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                        {formatTime(deal.time)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                        {deal.dealer}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                        {deal.login}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {deal.request}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          {deal.answer}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination - Bottom */}
          {deals.length > 0 && itemsPerPage !== 'All' && (
            <div className="mt-3 flex items-center justify-between bg-white rounded-lg shadow-sm border border-blue-100 p-3">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                }`}
              >
                Previous
              </button>
              
              <div className="flex gap-1">
                {getPageNumbers().map(page => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`px-3 py-1.5 text-sm rounded-md ${
                      currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1.5 text-sm rounded-md ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                }`}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default LiveDealingPage
