import { loadClientRows, reportPayload } from './reportPagination.js'

export const PERCENTAGE_TYPES = ['Default', 'Custom', 'Auto']

export const percentageSearchType = query => {
  const normalized = query.trim().toLowerCase()
  if (normalized === 'autofill') return 'Auto'
  return PERCENTAGE_TYPES.find(type => type.toLowerCase() === normalized) || null
}

export const filterPercentageTypes = (rows, selectedTypes) =>
  selectedTypes.length ? rows.filter(row => selectedTypes.includes(getPercentageType(row))) : rows

// The percentage endpoint has no documented Auto/multi-type filter.
// Load every page before applying the same classification used by the badges.
export async function loadPercentageClients(fetchPage, params, isCurrent) {
  let firstPayload
  const clients = await loadClientRows(async (page, limit) => {
    if (!isCurrent()) throw new Error('Percentage request superseded')
    const response = await fetchPage({ ...params, page, limit, page_size: undefined })
    if (page === 1) firstPayload = reportPayload(response)
    return response
  }, 'clients')
  const total = Number(firstPayload.total ?? clients.length)
  const uniqueLogins = new Set(clients.map(row => String(row.client_login ?? row.login)))
  if (!Number.isFinite(total) || clients.length < total || uniqueLogins.size !== clients.length) {
    throw new Error('Incomplete client percentage results. Please refresh and try again.')
  }
  return { ...firstPayload, clients }
}

// Shared helper for deriving the "Type" of a client percentage row.
// Priority: Auto (is_autofill) -> Custom (is_custom) -> Default
export const getPercentageType = (item) => {
  if (!item) return 'Default'
  if (item.is_autofill) return 'Auto'
  if (item.is_custom) return 'Custom'
  return 'Default'
}

// Tailwind badge classes per type.
export const getPercentageTypeBadgeClass = (item) => {
  const type = getPercentageType(item)
  if (type === 'Auto') return 'bg-amber-100 text-amber-800'
  if (type === 'Custom') return 'bg-blue-100 text-blue-800'
  return 'bg-gray-100 text-gray-600'
}
