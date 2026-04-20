/**
 * Centralized mobile filter utility
 * 
 * This utility applies filters in the correct cumulative order:
 * 1. Customize View filters (hasFloating, hasCredit, noDeposit) - applied first to raw data
 * 2. IB filter - applied to Customize-filtered results
 * 3. Group filter - applied to IB-filtered results
 * 
 * Each filter operates on the results of the previous filter, ensuring cumulative filtering.
 */

/**
 * Apply all mobile filters in cumulative order
 * 
 * @param {Array} items - Raw data array to filter
 * @param {Object} options - Filter options
 * @param {Object} options.customizeFilters - Customize View filters {hasFloating, hasCredit, noDeposit}
 * @param {Function} options.filterByActiveIB - IB filter function from IBContext
 * @param {Function} options.filterByActiveGroup - Group filter function from GroupContext
 * @param {string} options.loginField - Field name for login (default: 'login')
 * @param {string} options.moduleName - Module name for group filtering
 * @returns {Array} Filtered array
 */
export function applyCumulativeFilters(items, options = {}) {
  const {
    customizeFilters = {},
    filterByActiveIB,
    filterByActiveGroup,
    loginField = 'login',
    moduleName
  } = options

  let filtered = items

  // Step 1: Apply Customize View filters first (hasFloating, hasCredit, noDeposit)
  if (customizeFilters.hasFloating || customizeFilters.hasCredit || customizeFilters.noDeposit) {
    filtered = filtered.filter(item => {
      // hasFloating: only show items with non-zero profit
      if (customizeFilters.hasFloating && (!item.profit || item.profit === 0)) {
        return false
      }

      // hasCredit: only show items with non-zero credit
      if (customizeFilters.hasCredit && (!item.credit || item.credit === 0)) {
        return false
      }

      // noDeposit: only show items with no deposit or zero deposit
      if (customizeFilters.noDeposit && item.deposit && item.deposit > 0) {
        return false
      }

      return true
    })
  }

  // Step 2: Apply IB filter to Customize-filtered results
  if (filterByActiveIB) {
    filtered = filterByActiveIB(filtered, loginField)
  }

  // Step 3: Apply Group filter to IB-filtered results
  if (filterByActiveGroup && moduleName) {
    filtered = filterByActiveGroup(filtered, loginField, moduleName)
  }

  return filtered
}

/**
 * Apply search filter to items
 * @param {Array} items - Items to search
 * @param {string} searchInput - Search query
 * @param {Array} searchFields - Fields to search in (e.g., ['symbol', 'login'])
 * @returns {Array} Search-filtered items
 */
export function applySearchFilter(items, searchInput, searchFields = ['symbol', 'login']) {
  if (!searchInput || !searchInput.trim()) {
    return items
  }

  const query = searchInput.toLowerCase()
  
  return items.filter(item => {
    return searchFields.some(field => 
      String(item[field] || '').toLowerCase().includes(query)
    )
  })
}

/**
 * Apply sorting to items
 * @param {Array} items - Items to sort
 * @param {string} sortColumn - Column to sort by
 * @param {string} sortDirection - 'asc' or 'desc'
 * @returns {Array} Sorted items (new array)
 */
export function applySorting(items, sortColumn, sortDirection = 'asc') {
  if (!sortColumn) {
    return items
  }

  return [...items].sort((a, b) => {
    let aVal = a[sortColumn]
    let bVal = b[sortColumn]
    
    // Handle null/undefined
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return 1
    if (bVal == null) return -1
    
    // Handle numeric values
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    }
    
    // Handle string values
    aVal = String(aVal).toLowerCase()
    bVal = String(bVal).toLowerCase()
    
    if (sortDirection === 'asc') {
      return aVal.localeCompare(bVal)
    } else {
      return bVal.localeCompare(aVal)
    }
  })
}
