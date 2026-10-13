import { buildCreditRequest } from './creditReport.js'

export function buildDepositWithdrawalRequest(options, page = 1, limit = 100) {
  const { type = 'all', sortBy = 'time' } = options
  if (!['all', 'deposit', 'withdrawal'].includes(type)) throw new Error('Choose a valid transaction type.')
  const body = buildCreditRequest({ ...options, search: '' }, page, limit)
  body.type = type
  body.sortBy = sortBy
  return body
}

export function parseDepositWithdrawalReport(response) {
  if (response?.success === false) throw new Error(response.message || 'Unable to load deposit and withdrawal report.')
  const payload = response?.data?.data ?? response?.data ?? response
  // No response example is included; support the existing report envelopes.
  const rows = Array.isArray(payload) ? payload : payload?.transactions ?? payload?.report ?? payload?.Report ?? payload?.records ?? payload?.items ?? payload?.rows ?? payload?.deals
  if (!Array.isArray(rows)) throw new Error('Unexpected deposit and withdrawal report response. Please check the API response format.')
  const pagination = payload?.pagination ?? response?.data?.pagination ?? response?.pagination ?? payload ?? {}
  const total = pagination.total ?? pagination.total_records ?? pagination.totalItems ?? pagination.total_items
  const pages = pagination.totalPages ?? pagination.total_pages ?? pagination.pages
  return { rows, total: total != null && Number.isFinite(Number(total)) ? Number(total) : null, pages: pages != null && Number.isFinite(Number(pages)) ? Number(pages) : null }
}

// The API has no global search, only per-column filters that are ANDed. A search
// is therefore one API request per column (OR), and the results are merged.
export function buildSearchFilters(search) {
  const query = search.trim()
  if (!query) return []
  const filters = [
    { field: 'Name', operator: 'contains', value: query },
    { field: 'Comment', operator: 'contains', value: query }
  ]
  if (/^\d+$/.test(query) && Number.isSafeInteger(Number(query))) filters.push({ field: 'Login', operator: 'equal', value: Number(query) })
  return filters
}

export async function loadDepositWithdrawalReport(fetchReport, body, search = '', signal) {
  // A dropped connection (axios "Network Error", no response) is retried.
  const isTransient = error => !error?.response && !signal?.aborted && (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error')
  const request = async requestBody => {
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted()
      try {
        const result = parseDepositWithdrawalReport(await fetchReport(requestBody, { signal }))
        signal?.throwIfAborted()
        return result
      } catch (error) {
        if (attempt >= 2 || !isTransient(error)) throw error
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  }
  const searchFilters = buildSearchFilters(search)
  if (!searchFilters.length) return request(body)

  const results = await Promise.all(searchFilters.map(filter => request({ ...body, filters: [...(body.filters ?? []), filter] })))
  const seen = new Set()
  const rows = []
  for (const row of results.flatMap(result => result.rows)) {
    const key = row.deal ?? row.Deal ?? JSON.stringify(row)
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  const sortBy = body.sortBy ?? 'time'
  const direction = body.sortOrder === 'asc' ? 1 : -1
  const value = row => row[sortBy] ?? row[sortBy[0].toUpperCase() + sortBy.slice(1)]
  rows.sort((a, b) => (value(a) > value(b) ? 1 : value(a) < value(b) ? -1 : 0) * direction)
  const pages = Math.max(1, ...results.map(result => result.pages ?? 1))
  const totals = results.map(result => result.total)
  return { rows: rows.slice(0, body.limit), total: totals.every(total => total != null) ? totals.reduce((sum, total) => sum + total, 0) : null, pages }
}
