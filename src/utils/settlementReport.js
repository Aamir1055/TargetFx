// Pure helpers for the Settlement Report page: building the request, reading the response, and
// keeping a group's scope enforced. No React / network here so it can be unit-tested.

const ROW_KEYS = ['rows', 'settlements', 'logins', 'clients', 'accounts', 'report', 'records', 'items', 'results', 'data']
const LOGIN_KEYS = ['login', 'Login', 'mt5_login', 'mt5Login', 'account', 'account_login', 'client_login']

const isObjectRow = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const toLogin = value => {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

// `logins` is null when no group is active. An active group that resolves to NO accounts must never
// fall back to "all accounts", so it is rejected here (same rule as applyReportGroupFilter).
function groupAccounts(logins) {
  if (logins === null || logins === undefined) return null
  const accounts = [...new Set(logins.map(toLogin).filter(value => value !== null))]
  if (!accounts.length) throw new Error('The selected group has no accounts.')
  return accounts
}

export function buildSettlementRequest({ weekId, search = '', page = 1, limit = 100, logins = null }) {
  if (weekId === null || weekId === undefined || weekId === '') throw new Error('Choose a settlement week.')
  const body = { week_id: weekId, search: String(search).trim(), page, limit, format: 'json' }
  const accounts = groupAccounts(logins)
  if (accounts) body.mt5Accounts = accounts
  return body
}

function assertOk(response) {
  if (response?.success === false || response?.status === 'error') {
    throw new Error(response.message || 'Unable to load the settlement report.')
  }
}

// The rows may sit under any of several keys, nested one or two levels down. Prefer the known keys,
// then fall back to the first array of objects found.
export function extractRows(response) {
  assertOk(response)
  const seen = new Set()
  const find = (node, depth) => {
    if (Array.isArray(node)) return node.length === 0 || isObjectRow(node[0]) ? node : null
    if (!isObjectRow(node) || depth > 3 || seen.has(node)) return null
    seen.add(node)
    for (const key of ROW_KEYS) {
      if (key in node) {
        const rows = find(node[key], depth + 1)
        if (rows) return rows
      }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value) && value.length && value.every(isObjectRow)) return value
    }
    return null
  }
  const rows = find(response, 0)
  if (!rows) throw new Error('Unexpected settlement report response. Please check the API response format.')
  return rows
}

export function extractPagination(response) {
  const sources = [response?.pagination, response?.data?.pagination, response?.data, response]
  const pick = (...keys) => {
    for (const source of sources) {
      if (!isObjectRow(source)) continue
      for (const key of keys) {
        const value = Number(source[key])
        if (source[key] != null && Number.isFinite(value)) return value
      }
    }
    return null
  }
  return {
    total: pick('total', 'total_records', 'total_count', 'totalItems'),
    pages: pick('pages', 'totalPages', 'total_pages'),
  }
}

export function loginOf(row) {
  if (!isObjectRow(row)) return null
  for (const key of LOGIN_KEYS) {
    const login = toLogin(row[key])
    if (login !== null) return login
  }
  return null
}

const MONEY_KEY = /(amount|balance|pnl|profit|loss|commission|brokerage|rebate|charge|credit|deposit|withdraw|equity|net|total|fee|settle|payable|receivable|due|bonus|swap|value|rent|payout)/i
const LOGIN_COLUMN = /^(login|mt5_?login|account|account_?login|client_?login)$/i
const NAME_COLUMN = /^(name|full_?name|client_?name|account_?name)$/i
const isNested = value => value !== null && typeof value === 'object'
const isNumeric = value => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))

// Fields whose API name reads wrongly as a label. Keyed by the name with case and separators removed,
// so max_credit, maxCredit and "Max Credit" all match.
const LABEL_OVERRIDES = { maxcredit: 'Credit Limit' }

export function humanize(key) {
  const override = LABEL_OVERRIDES[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')]
  if (override) return override
  return String(key)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\binr\b/gi, 'INR').replace(/\busd\b/gi, 'USD').replace(/\bpnl\b/gi, 'P&L').replace(/\bld\b/gi, 'LD').replace(/\bmt5\b/gi, 'MT5')
    .replace(/\b([a-z])/g, c => c.toUpperCase())
    .trim()
}

// Columns come from the rows themselves: keys in first-seen order, login first and name second.
// A key whose values are all objects/arrays (a nested breakdown) is not a table column.
// kind: login | name | status | date | money | number | text — drives how a cell is rendered.
export function deriveColumns(rows, sampleSize = 50) {
  const seen = new Map()
  for (const row of rows.slice(0, sampleSize)) {
    if (!isObjectRow(row)) continue
    for (const [key, value] of Object.entries(row)) {
      const info = seen.get(key) ?? { values: [], nested: 0 }
      if (value !== null && value !== undefined && value !== '') {
        info.values.push(value)
        if (isNested(value)) info.nested += 1
      }
      seen.set(key, info)
    }
  }
  const columns = []
  for (const [key, { values, nested }] of seen) {
    if (values.length && nested === values.length) continue
    let kind = 'text'
    if (LOGIN_COLUMN.test(key)) kind = 'login'
    else if (NAME_COLUMN.test(key)) kind = 'name'
    else if (/status/i.test(key)) kind = 'status'
    else if (values.length && values.every(isNumeric)) {
      const epoch = values.every(value => Number(value) >= 1e9 && Number(value) < 1e11)
      kind = /(time|date|_at)$/i.test(key) && epoch ? 'date' : MONEY_KEY.test(key) ? 'money' : 'number'
    }
    columns.push({ key, label: humanize(key), kind })
  }
  const rank = column => (column.kind === 'login' ? 0 : column.kind === 'name' ? 1 : 2)
  return columns.map((column, index) => ({ column, index })).sort((a, b) => rank(a.column) - rank(b.column) || a.index - b.index).map(item => item.column)
}

// Safety net for a group: if the server ignored the account list, drop rows outside the group so
// the table can never show accounts the group excludes. `removed` > 0 means the server did not
// filter (so the page's totals/pages describe the unfiltered set). Rows without a recognisable
// login column cannot be checked, so they are left alone and `checked` is false.
export function scopeRowsToLogins(rows, logins) {
  if (logins === null || logins === undefined) return { rows, removed: 0, checked: false }
  const allowed = new Set(logins.map(toLogin).filter(value => value !== null))
  if (!rows.some(row => loginOf(row) !== null)) return { rows, removed: 0, checked: false }
  const scoped = rows.filter(row => allowed.has(loginOf(row)))
  return { rows: scoped, removed: rows.length - scoped.length, checked: true }
}

// ---------- formatting shared by the table and the detail dialog ----------
export const toNumber = value => { const n = Number(value); return Number.isFinite(n) ? n : null }
export const fmtMoney = value => { const n = toNumber(value); return n === null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
export const fmtNumber = value => { const n = toNumber(value); return n === null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: 4 }) }
export const fmtDate = value => {
  const n = toNumber(value)
  if (n === null) return '—'
  return new Date(n * 1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

// A nested breakdown column is worth totalling when it is an amount or a count/size, not a rate.
const COUNT_KEY = /(lots|volume|deals|count|qty|quantity|turnover|trades)/i
export const isSummable = column => column.kind === 'money' || (column.kind === 'number' && COUNT_KEY.test(column.key))

// Everything the detail dialog shows for one report row, sorted into sections:
//   cards  - up to four headline numbers (amounts first, then counts)
//   fields - the remaining single values, as label/value pairs
//   tables - nested lists of objects (e.g. a per-exchange breakdown), with their own columns
//   groups - nested single objects, as label/value pairs
// Fields the row has but the table never derived a column for are kept too, as plain text.
export function buildRowDetail(row, columns) {
  if (!isObjectRow(row)) return { login: null, name: '', status: null, cards: [], fields: [], tables: [], groups: [] }
  const known = new Set(columns.map(column => column.key))
  const all = [...columns]
  for (const [key, value] of Object.entries(row)) {
    if (!known.has(key) && (value === null || typeof value !== 'object')) all.push({ key, label: humanize(key), kind: 'text' })
  }
  const pick = kind => all.find(column => column.kind === kind)
  const login = pick('login'), name = pick('name'), status = pick('status')
  const body = all.filter(column => !['login', 'name', 'status'].includes(column.kind))
  const cards = [...body.filter(column => column.kind === 'money'), ...body.filter(column => column.kind === 'number')].slice(0, 4)
  const used = new Set(cards.map(column => column.key))
  const tables = []
  const groups = []
  for (const [key, value] of Object.entries(row)) {
    if (Array.isArray(value) && value.length && value.every(isObjectRow)) {
      tables.push({ key, title: humanize(key), columns: deriveColumns(value), rows: value })
    } else if (isObjectRow(value) && Object.keys(value).length) {
      groups.push({ key, title: humanize(key), entries: Object.entries(value) })
    }
  }
  return {
    login: login ? row[login.key] : null,
    name: name && row[name.key] != null ? String(row[name.key]).trim() : '',
    status: status ? row[status.key] : null,
    cards,
    fields: body.filter(column => !used.has(column.key)),
    tables,
    groups,
  }
}

// ---------- show / hide / reorder columns ----------
// `prefs` = { hidden: [keys], order: [keys] }. Columns not named in `order` keep their own order after
// the ones that are. Returns every column in order (for the chooser) and just the visible ones.
export function applyColumnPrefs(columns, prefs = {}) {
  const hidden = new Set(prefs.hidden || [])
  const order = prefs.order || []
  let ordered = columns
  if (order.length) {
    const rank = new Map(order.map((key, index) => [key, index]))
    ordered = columns
      .map((column, index) => ({ column, at: rank.has(column.key) ? rank.get(column.key) : 1e6 + index }))
      .sort((a, b) => a.at - b.at)
      .map(item => item.column)
  }
  return { ordered, shown: ordered.filter(column => !hidden.has(column.key)) }
}

// ---------- the whole week, page by page (for the Excel export) ----------
// fetchPage(page, limit) -> API response. Stops at the last page (by the reported page count or total,
// else by a short page), on an empty page, or if the server ignores `page` and repeats itself.
export async function collectAllRows(fetchPage, { limit = 100, maxPages = 200 } = {}) {
  const all = []
  let total = null
  let previousFirst = null
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage(page, limit)
    const rows = extractRows(response)
    if (!rows.length) break
    const first = JSON.stringify(rows[0])
    if (page > 1 && first === previousFirst) break
    previousFirst = first
    all.push(...rows)
    const pagination = extractPagination(response)
    if (pagination.total !== null) total = pagination.total
    const done = pagination.pages !== null ? page >= pagination.pages : total !== null ? all.length >= total : rows.length < limit
    if (done) break
  }
  return all
}

// ---------- Excel layout (same navy bands / zebra rows / TOTAL row as the other reports) ----------
const STATUS_COLORS = { good: '15803D', wait: 'B45309', info: '1D4ED8', bad: 'C62828' }
export function statusColor(text) {
  const s = String(text).toLowerCase()
  if (/(pending|open|due|partial)/.test(s)) return STATUS_COLORS.wait
  if (/(done|paid|settled|complete|closed|ok|success)/.test(s)) return STATUS_COLORS.good
  if (/(ready)/.test(s)) return STATUS_COLORS.info
  if (/(fail|error|reject|cancel)/.test(s)) return STATUS_COLORS.bad
  return undefined
}

// Rows are grouped into one band per currency when the report mixes currencies (their amounts must
// not be added together); otherwise there is a single band. Returns the `sections` and `columns`
// that exportStyledExcel takes.
export function buildSettlementExcelSpec(rows, columns, weekLabel = '') {
  const sample = rows.find(isObjectRow) || {}
  const currencyKey = Object.keys(sample).find(key => /^(currency|ccy)$/i.test(key))
  const groups = new Map()
  for (const row of rows) {
    const label = currencyKey && row?.[currencyKey] != null && row[currencyKey] !== '' ? String(row[currencyKey]).toUpperCase() : ''
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(row)
  }
  const split = Boolean(currencyKey) && groups.size > 1
  const base = String(weekLabel || 'Settlement report').toUpperCase()

  const styled = columns.map(column => {
    const values = rows.map(row => row?.[column.key]).filter(value => value !== null && value !== undefined && value !== '')
    switch (column.kind) {
      case 'money': return { key: column.key, label: column.label, value: column.key, type: 'number', digits: 2, signed: true }
      case 'number': return { key: column.key, label: column.label, value: column.key, type: values.every(value => Number.isInteger(Number(value))) ? 'integer' : 'number', digits: 2 }
      case 'status': return { key: column.key, label: column.label, value: column.key, align: 'center', colorFor: statusColor }
      case 'date': return { key: column.key, label: column.label, value: row => (row?.[column.key] == null || row[column.key] === '' ? '' : fmtDate(row[column.key])), align: 'center' }
      default: return { key: column.key, label: column.label, value: column.key }
    }
  })
  const summable = columns.filter(isSummable)
  const sections = [...groups.entries()].map(([label, sectionRows]) => ({
    title: split && label ? `${base} · ${label}` : base,
    rows: sectionRows,
    totals: summable.length
      ? { label: 'TOTAL', values: Object.fromEntries(summable.map(column => [column.key, sectionRows.reduce((sum, row) => sum + (toNumber(row?.[column.key]) || 0), 0)])) }
      : undefined,
  }))
  return { sections, columns: styled }
}
