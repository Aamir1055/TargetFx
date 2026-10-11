export function buildAgentDetailsRequest({ from, to, agent = '', search = '', type = 'all', sortBy = '', sortOrder = 'desc' }, page = 1, limit = 100) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error('Choose a valid date range.')
  const body = { from, to, page, limit }
  const filters = []
  if (agent.trim()) {
    if (!/^\d+$/.test(agent.trim()) || !Number.isSafeInteger(Number(agent)) || Number(agent) <= 0) throw new Error('Enter a valid agent login.')
    filters.push({ field: 'agent_login', operator: 'equal', value: Number(agent) })
  }
  if (search.trim()) filters.push({ field: 'symbol', operator: 'equal', value: search.trim() })
  if (type !== 'all') {
    if (!['AGENT', 'AGENT_DAILY', 'both'].includes(type)) throw new Error('Choose a valid agent type.')
    filters.push({ field: 'type', operator: 'in', value: type === 'both' ? ['AGENT', 'AGENT_DAILY'] : [type] })
  }
  if (filters.length) body.filters = filters
  if (sortBy) Object.assign(body, { sortBy, sortOrder })
  return body
}

export function parseAgentDetailsReport(response) {
  if (response?.success === false || response?.status === 'error') throw new Error(response.message || 'Unable to load agent details.')
  const payload = response?.data?.data ?? response?.data ?? response
  const rows = Array.isArray(payload) ? payload : payload?.rows ?? payload?.agents ?? payload?.report ?? payload?.Report ?? payload?.records ?? payload?.items ?? payload?.deals
  if (!Array.isArray(rows)) throw new Error('Unexpected agent details response. Please check the API response format.')
  const pagination = payload?.pagination ?? response?.pagination ?? payload ?? {}
  const total = pagination.total ?? pagination.total_records ?? pagination.totalItems
  const pages = pagination.pages ?? pagination.totalPages ?? pagination.total_pages
  return { rows, total: total != null && Number.isFinite(Number(total)) ? Number(total) : null, pages: pages != null && Number.isFinite(Number(pages)) ? Number(pages) : null }
}
