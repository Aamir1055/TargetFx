export const pageCount = (total, limit) => Math.max(1, Math.ceil((Number(total) || 0) / Math.max(1, Number(limit) || 1)))

export const reportPayload = response => response?.data?.data ?? response?.data ?? response ?? {}

export function paginateClientRows(positions, orders, page, limit) {
  const positionSet = new Set(positions)
  const orderSet = new Set(orders)
  const rows = [...positions, ...orders].slice((page - 1) * limit, page * limit)
  return { regularPositions: rows.filter(row => positionSet.has(row)), pendingOrders: rows.filter(row => orderSet.has(row)) }
}

// Client details combines positions and orders into one locally paginated table.
// Consume both endpoints' pages before combining, rather than truncating either list.
export async function loadClientRows(fetchPage, key, signal) {
  const rows = []
  const limit = 100
  for (let page = 1; ; page += 1) {
    signal?.throwIfAborted()
    const payload = reportPayload(await fetchPage(page, limit))
    signal?.throwIfAborted()
    const batch = Array.isArray(payload) ? payload : payload[key]
    if (!Array.isArray(batch)) throw new Error(`Invalid ${key} response`)
    rows.push(...batch)
    const pagination = payload.pagination ?? payload
    const total = pagination.total ?? pagination.totalItems ?? pagination.total_items
    const pages = pagination.totalPages ?? pagination.total_pages
    if (!batch.length || (pages != null && page >= Number(pages)) ||
        (total != null && rows.length >= Number(total)) ||
        (pages == null && total == null && batch.length < limit)) break
  }
  return rows
}

// Historical-position search is not part of the documented local API wrapper.
// Read every server page before filtering so a match on a later page is visible.
export async function loadHistoricalRows(fetchPage, signal) {
  const rows = []
  const limit = 100
  for (let page = 1; ; page += 1) {
    signal?.throwIfAborted()
    const payload = reportPayload(await fetchPage(page, limit))
    signal?.throwIfAborted()
    const batch = payload.Report ?? payload.report ?? []
    if (!Array.isArray(batch)) throw new Error('Invalid historical positions response')
    rows.push(...batch)
    const pagination = payload.pagination ?? payload.Pagination ?? {}
    const total = pagination.total ?? pagination.total_items ?? pagination.totalItems
    const pages = pagination.total_pages ?? pagination.totalPages ?? pagination.pages
    if (!batch.length || (pages != null && page >= Number(pages)) ||
        (total != null && rows.length >= Number(total)) ||
        (pages == null && total == null && batch.length < limit)) break
  }
  return rows
}

export function searchHistoricalRows(rows, query, page, limit) {
  const normalized = query.trim().toLowerCase()
  const matches = rows.filter(row => String(row.Symbol ?? row.symbol ?? '').toLowerCase().includes(normalized))
  const totalPages = pageCount(matches.length, limit)
  const currentPage = Math.min(Math.max(1, page), totalPages)
  return { rows: matches.slice((currentPage - 1) * limit, currentPage * limit), total: matches.length, totalPages, page: currentPage }
}
