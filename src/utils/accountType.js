export function accountTypeLabel(value, country) {
  const raw = String(value || country || '').trim()
  const key = raw.toLowerCase().replace(/[.\s_-]/g, '')
  if (key === 'liquidate' || key === 'india') return 'Liquidate'
  if (['nonliquidate', 'dnl', 'uae', 'unitedarabemirates'].includes(key)) return 'DNL'
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

// Keep existing visibility, order, widths and filter preferences after the rename.
export function parseAccountTypePreferences(json) {
  const migrate = value => {
    if (Array.isArray(value)) return value.map(migrate)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/^country(?=_|$)/, 'liquidateType'), migrate(item)]))
    return value === 'country' ? 'liquidateType' : value
  }
  return migrate(JSON.parse(json))
}
