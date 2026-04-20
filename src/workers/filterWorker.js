// Dedicated worker for filtering / sorting / deduplication to reduce contention with stats aggregation

function matchesNumberFilter(value, config) {
  if (!config) return true
  const num = parseFloat(value)
  if (isNaN(num)) return false
  const { type, value1, value2 } = config
  switch (type) {
    case 'equal': return num === value1
    case 'notEqual': return num !== value1
    case 'lessThan': return num < value1
    case 'lessThanOrEqual': return num <= value1
    case 'greaterThan': return num > value1
    case 'greaterThanOrEqual': return num >= value1
    case 'between': return value2 != null && num >= value1 && num <= value2
    default: return true
  }
}

function matchesTextFilter(value, config) {
  if (!config) return true
  const { type, value: needle, caseSensitive } = config
  if (needle == null || needle === '') return true
  const hayRaw = value == null ? '' : String(value)
  const needleRaw = String(needle)
  const hay = caseSensitive ? hayRaw : hayRaw.toLowerCase()
  const n = caseSensitive ? needleRaw : needleRaw.toLowerCase()
  switch (type) {
    case 'equal': return hay === n
    case 'notEqual': return hay !== n
    case 'startsWith': return hay.startsWith(n)
    case 'endsWith': return hay.endsWith(n)
    case 'contains': return hay.includes(n)
    case 'doesNotContain': return !hay.includes(n)
    default: return true
  }
}

function filterClients(clients, filters) {
  if (!clients || clients.length === 0) return []
  const {
    filterByPositions,
    filterByCredit,
    filterNoDeposit,
    columnFilters,
    searchQuery
  } = filters || {}

  let out = []
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i]
    if (!c) continue
    // Positions
    if (filterByPositions) {
      if (!(c.floating && Math.abs(c.floating) > 0)) continue
    }
    // Credit
    if (filterByCredit) {
      if (!(c.credit && c.credit !== 0)) continue
    }
    // No Deposit
    if (filterNoDeposit) {
      if (c.lifetimeDeposit && c.lifetimeDeposit !== 0) continue
    }
    // Column filters
    let columnReject = false
    if (columnFilters && Object.keys(columnFilters).length > 0) {
      for (const [key, cfg] of Object.entries(columnFilters)) {
        if (key.endsWith('_number')) {
          const actual = key.replace('_number', '')
          if (!matchesNumberFilter(c[actual], cfg)) { columnReject = true; break }
        } else if (key.endsWith('_text')) {
          const actual = key.replace('_text', '')
          if (!matchesTextFilter(c[actual], cfg)) { columnReject = true; break }
        } else if (Array.isArray(cfg) && cfg.length > 0) {
          // Checkbox filter - use string comparison for consistent matching
          const clientValue = c[key]
          const strValue = String(clientValue)
          const found = cfg.some(filterVal => String(filterVal) === strValue)
          if (!found) { columnReject = true; break }
        }
      }
    }
    if (columnReject) continue
    // Search
    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase()
      const login = String(c.login || '').toLowerCase()
      const name = String(c.name || '').toLowerCase()
      const email = String(c.email || '').toLowerCase()
      const phone = String(c.phone || '').toLowerCase()
      const group = String(c.group || '').toLowerCase()
      if (!(login.includes(q) || name.includes(q) || email.includes(q) || phone.includes(q) || group.includes(q))) continue
    }
    out.push(c)
  }
  return out
}

function sortClients(clients, sortConfig) {
  if (!sortConfig || !sortConfig.column) return clients
  const { column, direction } = sortConfig
  const arr = clients.slice()
  arr.sort((a, b) => {
    let aVal = a[column]
    let bVal = b[column]
    if (aVal == null && bVal == null) return 0
    if (aVal == null) return direction === 'asc' ? 1 : -1
    if (bVal == null) return direction === 'asc' ? -1 : 1
    const aNum = Number(aVal)
    const bNum = Number(bVal)
    if (!isNaN(aNum) && !isNaN(bNum) && typeof aVal !== 'string') {
      return direction === 'asc' ? aNum - bNum : bNum - aNum
    }
    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()
    if (aStr < bStr) return direction === 'asc' ? -1 : 1
    if (aStr > bStr) return direction === 'asc' ? 1 : -1
    return 0
  })
  return arr
}

function deduplicateClients(clients) {
  const seen = new Set()
  const out = []
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i]
    if (!c) continue
    const key = c.login ?? c.clientID ?? c.mqid
    if (key == null || key === '') {
      out.push(c)
      continue
    }
    if (!seen.has(key)) {
      seen.add(key)
      out.push(c)
    }
  }
  return out
}

self.onmessage = function(e) {
  const { type, payload, requestId } = e.data
  try {
    let result
    switch (type) {
      case 'FILTER_SORT_DEDUP': {
        const { clients, filters, sortConfig } = payload
        let processed = filterClients(clients, filters)
        processed = sortClients(processed, sortConfig)
        processed = deduplicateClients(processed)
        result = { clients: processed, count: processed.length }
        break
      }
      case 'FILTER_ONLY': {
        result = filterClients(payload.clients, payload.filters)
        break
      }
      case 'SORT_ONLY': {
        result = sortClients(payload.clients, payload.sortConfig)
        break
      }
      case 'DEDUP_ONLY': {
        result = deduplicateClients(payload.clients)
        break
      }
      default:
        throw new Error('Unknown filterWorker task type: ' + type)
    }
    self.postMessage({ type: 'SUCCESS', requestId, result, taskType: type, timestamp: Date.now() })
  } catch (err) {
    self.postMessage({ type: 'ERROR', requestId, error: { message: err.message, stack: err.stack }, taskType: type, timestamp: Date.now() })
  }
}

self.postMessage({ type: 'READY', timestamp: Date.now() })
