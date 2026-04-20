// Web Worker for heavy stats calculations
// This runs in a separate thread to avoid blocking the UI

/**
 * Calculate full statistics from client array
 * @param {Array} clients - Array of client objects
 * @returns {Object} Aggregated statistics
 */
function calculateFullStats(clients) {
  const stats = {
    totalClients: clients.length,
    totalBalance: 0,
    totalCredit: 0,
    totalEquity: 0,
    totalPnl: 0,
    totalProfit: 0,
    dailyDeposit: 0,
    dailyWithdrawal: 0,
    dailyPnL: 0,
    thisWeekPnL: 0,
    thisMonthPnL: 0,
    lifetimePnL: 0,
    totalDeposit: 0,
    netDW: 0
  }
  
  // Use simple for loop for best performance in worker
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i]
    if (!c) continue
    
    stats.totalBalance += (c.balance || 0)
    stats.totalCredit += (c.credit || 0)
    stats.totalEquity += (c.equity || 0)
    stats.totalPnl += (c.pnl || 0)
    stats.totalProfit += (c.profit || 0)
  stats.dailyDeposit += (c.dailyDeposit || 0)
  stats.dailyWithdrawal += (c.dailyWithdrawal || 0)
  // Use backend-provided PnL bucket values directly (no sign inversion)
  stats.dailyPnL += (c.dailyPnL || 0)
  stats.thisWeekPnL += (c.thisWeekPnL || 0)
  stats.thisMonthPnL += (c.thisMonthPnL || 0)
  stats.lifetimePnL += (c.lifetimePnL || 0)
    stats.totalDeposit += (c.dailyDeposit || 0)
  }
  
  // Calculate net DW
  stats.netDW = stats.dailyDeposit - stats.dailyWithdrawal
  
  return stats
}

/**
 * Filter clients based on criteria
 * @param {Array} clients - Array of client objects
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered clients
 */
function filterClients(clients, filters) {
  const {
    filterByPositions,
    filterByCredit,
    columnFilters,
    searchQuery
  } = filters
  
  let filtered = clients.slice() // Fast shallow copy
  
  // Filter by positions (has floating value)
  if (filterByPositions) {
    filtered = filtered.filter(c => c && c.floating && Math.abs(c.floating) > 0)
  }
  
  // Filter by credit (has non-zero credit)
  if (filterByCredit) {
    filtered = filtered.filter(c => c && c.credit && c.credit !== 0)
  }
  
  // Apply column filters
  if (columnFilters && Object.keys(columnFilters).length > 0) {
    Object.entries(columnFilters).forEach(([columnKey, values]) => {
      if (!values || values.length === 0) return
      
      if (columnKey.endsWith('_number')) {
        // Number filter
        const actualKey = columnKey.replace('_number', '')
        filtered = filtered.filter(client => {
          if (!client) return false
          const val = client[actualKey]
          return matchesNumberFilter(val, values)
        })
      } else if (columnKey.endsWith('_text')) {
        // Text filter
        const actualKey = columnKey.replace('_text', '')
        filtered = filtered.filter(client => {
          if (!client) return false
          const val = client[actualKey]
          return matchesTextFilter(val, values)
        })
      } else {
        // Regular checkbox filter
        filtered = filtered.filter(client => {
          if (!client) return false
          return values.includes(client[columnKey])
        })
      }
    })
  }
  
  // Apply search query
  if (searchQuery && searchQuery.trim() !== '') {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(client => {
      if (!client) return false
      
      // Search in key fields
      const searchableFields = [
        client.login?.toString(),
        client.name?.toLowerCase(),
        client.email?.toLowerCase(),
        client.group?.toLowerCase(),
        client.country?.toLowerCase()
      ]
      
      return searchableFields.some(field => 
        field && field.includes(query)
      )
    })
  }
  
  return filtered
}

/**
 * Number filter matching logic
 */
function matchesNumberFilter(value, filterValues) {
  if (!filterValues || typeof filterValues !== 'object') return true
  
  const val = parseFloat(value)
  if (isNaN(val)) return false
  
  const { min, max, equal, notEqual } = filterValues
  
  if (equal !== undefined && equal !== null && equal !== '') {
    return val === parseFloat(equal)
  }
  
  if (notEqual !== undefined && notEqual !== null && notEqual !== '') {
    return val !== parseFloat(notEqual)
  }
  
  if (min !== undefined && min !== null && min !== '') {
    if (val < parseFloat(min)) return false
  }
  
  if (max !== undefined && max !== null && max !== '') {
    if (val > parseFloat(max)) return false
  }
  
  return true
}

/**
 * Text filter matching logic
 */
function matchesTextFilter(value, filterValues) {
  if (!filterValues || typeof filterValues !== 'object') return true
  
  const { type, value: needle, caseSensitive } = filterValues
  
  if (!needle || needle === '') return true
  
  const hayRaw = value == null ? '' : String(value)
  const needleRaw = String(needle)
  const hay = caseSensitive ? hayRaw : hayRaw.toLowerCase()
  const n = caseSensitive ? needleRaw : needleRaw.toLowerCase()
  
  switch (type) {
    case 'equal':
      return hay === n
    case 'notEqual':
      return hay !== n
    case 'startsWith':
      return hay.startsWith(n)
    case 'endsWith':
      return hay.endsWith(n)
    case 'contains':
      return hay.includes(n)
    case 'doesNotContain':
      return !hay.includes(n)
    default:
      return true
  }
}

/**
 * Sort clients array
 * @param {Array} clients - Array of client objects
 * @param {Object} sortConfig - Sort configuration
 * @returns {Array} Sorted clients
 */
function sortClients(clients, sortConfig) {
  if (!sortConfig || !sortConfig.column) return clients
  
  const { column, direction } = sortConfig
  const sorted = clients.slice()
  
  sorted.sort((a, b) => {
    let aVal = a[column]
    let bVal = b[column]
    
    // Handle null/undefined
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return direction === 'asc' ? 1 : -1
    if (bVal == null) return direction === 'asc' ? -1 : 1
    
    // Numeric comparison
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return direction === 'asc' ? aVal - bVal : bVal - aVal
    }
    
    // String comparison
    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()
    
    if (aStr < bStr) return direction === 'asc' ? -1 : 1
    if (aStr > bStr) return direction === 'asc' ? 1 : -1
    return 0
  })
  
  return sorted
}

/**
 * Deduplicate clients by login
 * @param {Array} clients - Array of client objects
 * @returns {Array} Deduplicated clients
 */
function deduplicateClients(clients) {
  const seen = new Set()
  const deduped = []
  
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i]
    if (!client) continue
    
    const key = client.login ?? client.clientID ?? client.mqid
    if (key == null || key === '') {
      deduped.push(client) // Keep entries without stable key
      continue
    }
    
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(client)
    }
  }
  
  return deduped
}

// Main message handler
self.onmessage = function(e) {
  const { type, payload, requestId } = e.data
  
  try {
    let result
    
    switch (type) {
      case 'CALCULATE_STATS':
        result = calculateFullStats(payload.clients)
        break
        
      case 'FILTER_CLIENTS':
        result = filterClients(payload.clients, payload.filters)
        break
        
      case 'SORT_CLIENTS':
        result = sortClients(payload.clients, payload.sortConfig)
        break
        
      case 'DEDUPLICATE_CLIENTS':
        result = deduplicateClients(payload.clients)
        break
        
      case 'FULL_PIPELINE':
        // Complete processing pipeline
        let processed = payload.clients
        
        // 1. Filter
        if (payload.filters) {
          processed = filterClients(processed, payload.filters)
        }
        
        // 2. Sort
        if (payload.sortConfig) {
          processed = sortClients(processed, payload.sortConfig)
        }
        
        // 3. Deduplicate
        processed = deduplicateClients(processed)
        
        // 4. Calculate stats
        const stats = calculateFullStats(processed)
        
        result = {
          filteredClients: processed,
          stats: stats,
          count: processed.length
        }
        break
        
      default:
        throw new Error(`Unknown worker task type: ${type}`)
    }
    
    // Send success response
    self.postMessage({
      type: 'SUCCESS',
      requestId,
      taskType: type,
      result,
      timestamp: Date.now()
    })
    
  } catch (error) {
    // Send error response
    self.postMessage({
      type: 'ERROR',
      requestId,
      taskType: type,
      error: {
        message: error.message,
        stack: error.stack
      },
      timestamp: Date.now()
    })
  }
}

// Signal that worker is ready
self.postMessage({
  type: 'READY',
  timestamp: Date.now()
})
