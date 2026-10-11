import { buildCreditRequest } from './creditReport.js'

export function buildDepositWithdrawalRequest(options, page = 1, limit = 100) {
  const { search = '', type = 'all', sortBy = 'time' } = options
  if (!['all', 'deposit', 'withdrawal'].includes(type)) throw new Error('Choose a valid transaction type.')
  const body = buildCreditRequest({ ...options, search: '' }, page, limit)
  body.type = type
  body.sortBy = sortBy
  // The collection documents comment filtering rather than a general search field.
  if (search.trim()) body.filters = [...(body.filters || []), { field: 'comment', operator: 'contains', value: search.trim() }]
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
  const pages = pagination.totalPages ?? pagination.total_pages
  return { rows, total: total != null && Number.isFinite(Number(total)) ? Number(total) : null, pages: pages != null && Number.isFinite(Number(pages)) ? Number(pages) : null }
}
