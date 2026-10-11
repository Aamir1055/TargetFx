export function buildCreditRequest({ from, to, search = '', logins = '', amount = '', amountOperator = 'greater_than', sortOrder = 'desc', sortBy = 'time' }, page = 1, limit = 100) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error('Choose a valid date range.')
  const body = { from, to, page, limit, sortBy, sortOrder }
  if (search.trim()) body.search = search.trim()
  const filters = []
  if (amount !== '') {
    if (!Number.isFinite(Number(amount))) throw new Error('Enter a valid amount.')
    filters.push({ field: 'amount', operator: amountOperator, value: Number(amount) })
  }
  if (logins.trim()) {
    const values = logins.trim().split(/[\s,]+/)
    if (values.some(value => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0)) throw new Error('Enter valid login numbers separated by commas.')
    filters.push({ field: 'login', operator: 'in', value: [...new Set(values.map(Number))] })
  }
  if (filters.length) body.filters = filters
  return body
}

// The collection supplies requests only; accept the envelopes used by existing reports.
export function parseCreditReport(response) {
  if (response?.success === false) throw new Error(response.message || 'Unable to load credit report.')
  const payload = response?.data?.data ?? response?.data ?? response
  const rows = Array.isArray(payload) ? payload : payload?.credits ?? payload?.report ?? payload?.Report ?? payload?.records ?? payload?.items ?? payload?.rows ?? payload?.deals
  if (!Array.isArray(rows)) throw new Error('Unexpected credit report response. Please check the API response format.')
  const pagination = payload?.pagination ?? response?.data?.pagination ?? response?.pagination ?? payload ?? {}
  const total = pagination.total ?? pagination.total_records ?? pagination.totalItems ?? pagination.total_items
  const pages = pagination.totalPages ?? pagination.total_pages
  return { rows, total: total != null && Number.isFinite(Number(total)) ? Number(total) : null, pages: pages != null && Number.isFinite(Number(pages)) ? Number(pages) : null }
}
