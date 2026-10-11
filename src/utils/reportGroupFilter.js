// Returns false for an empty/invalid selection so it cannot request all accounts.
export function applyReportGroupFilter(body, group) {
  if (group === null) return true
  if (group.range) {
    const from = Number(group.range.from)
    const to = Number(group.range.to)
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from <= 0 || to < from) return false
    body.accountRangeMin = from
    body.accountRangeMax = to
    return true
  }
  const groupLogins = [...new Set((group.loginIds || []).map(Number).filter(value => Number.isSafeInteger(value) && value > 0))]
  const loginFilter = body.filters?.find(filter => filter.field === 'login')
  const logins = loginFilter ? groupLogins.filter(login => loginFilter.value.includes(login)) : groupLogins
  if (!logins.length) return false
  body.filters = [...(body.filters || []).filter(filter => filter.field !== 'login'), { field: 'login', operator: 'in', value: logins }]
  return true
}
