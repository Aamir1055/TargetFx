export function accountTypeLabel(value, country) {
  const raw = String(value || '').trim()
  if (!raw) return String(country || '').trim() ? 'Non-Liquidate' : '-'
  const key = raw.toLowerCase().replace(/[.\s_-]/g, '')
  if (key === 'liquidate' || key === 'india') return 'Liquidate'
  if (['nonliquidate', 'dnl', 'uae', 'unitedarabemirates'].includes(key)) return 'Non-Liquidate'
  return value ? String(value) : '-'
}

export function accountTypeApiValue(value) {
  if (Array.isArray(value)) return value.map(accountTypeApiValue)
  return String(value).trim().toLowerCase() === 'dnl' ? 'Non-Liquidate' : value
}

// Normalize account records within API envelopes without changing country data.
export function normalizeAccountTypes(value) {
  if (Array.isArray(value)) return value.map(normalizeAccountTypes)
  if (!value || typeof value !== 'object') return value
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeAccountTypes(item)]))
  if ('liquidateType' in result || 'country' in result) result.liquidateType = accountTypeLabel(result.liquidateType, result.country)
  return result
}

export function accountTypeSearchPayload(payload) {
  return {
    ...payload,
    ...(payload.search && /^dnl$/i.test(payload.search.trim()) ? { search: 'Non-Liquidate' } : {}),
    ...(payload.filters ? { filters: payload.filters.map(filter => filter.field === 'liquidateType' ? { ...filter, value: accountTypeApiValue(filter.value) } : filter) } : {})
  }
}

// Country and liquidation category now have independent saved preferences.
export function parseAccountTypePreferences(json) {
  return JSON.parse(json)
}
