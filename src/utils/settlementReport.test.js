import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSettlementRequest, extractRows, extractPagination, loginOf, scopeRowsToLogins,
  deriveColumns, humanize, buildRowDetail, isSummable, fmtMoney, fmtNumber,
  applyColumnPrefs, collectAllRows, buildSettlementExcelSpec, statusColor,
} from './settlementReport.js'

test('column labels read naturally', () => {
  assert.equal(humanize('our_brokerage_inr'), 'Our Brokerage INR')
  assert.equal(humanize('ldPercent'), 'LD Percent')
  assert.equal(humanize('mt5_login'), 'MT5 Login')
})
test('Max Credit is labelled Credit Limit, whatever the field is spelled like', () => {
  for (const key of ['max_credit', 'maxCredit', 'Max Credit', 'MAX_CREDIT']) assert.equal(humanize(key), 'Credit Limit')
  assert.equal(humanize('max_credit_per_account'), 'Max Credit Per Account')
  assert.deepEqual(deriveColumns([{ login: 1, max_credit: 5000 }]).map(c => c.label), ['Login', 'Credit Limit'])
})
test('columns are derived from rows: login first, name second, nested breakdowns dropped', () => {
  const rows = [
    { total_amount: 1500.5, name: 'DEMO', login: 90002, status: 'pending', lots: 3, exchanges: [{ exchange: 'MCX' }], settled_at: 1792709474, note: null },
    { total_amount: -20, name: 'DEMO 2', login: 90003, status: 'done', lots: 1, exchanges: [], settled_at: 1792709475 },
  ]
  const columns = deriveColumns(rows)
  assert.deepEqual(columns.map(c => c.key), ['login', 'name', 'total_amount', 'status', 'lots', 'settled_at', 'note'])
  const kind = key => columns.find(c => c.key === key).kind
  assert.equal(kind('login'), 'login')
  assert.equal(kind('name'), 'name')
  assert.equal(kind('total_amount'), 'money')
  assert.equal(kind('status'), 'status')
  assert.equal(kind('lots'), 'number')
  assert.equal(kind('settled_at'), 'date')
  assert.equal(kind('note'), 'text')
  assert.deepEqual(deriveColumns([]), [])
})

test('request carries week, search, paging and json format', () => {
  assert.deepEqual(buildSettlementRequest({ weekId: 7, search: '  90077 ', page: 2, limit: 50 }), {
    week_id: 7, search: '90077', page: 2, limit: 50, format: 'json',
  })
})
test('a week is required', () => {
  assert.throws(() => buildSettlementRequest({ weekId: null }), /settlement week/)
})
test('an active group is sent as de-duplicated mt5Accounts', () => {
  const body = buildSettlementRequest({ weekId: 7, logins: [90001, '90002', 90001, 'x', -5] })
  assert.deepEqual(body.mt5Accounts, [90001, 90002])
})
test('no group means no mt5Accounts, and an empty group never widens to all accounts', () => {
  assert.equal('mt5Accounts' in buildSettlementRequest({ weekId: 7 }), false)
  assert.throws(() => buildSettlementRequest({ weekId: 7, logins: [] }), /no accounts/)
})

test('rows are found under the known keys and when nested', () => {
  const rows = [{ login: 1 }]
  assert.deepEqual(extractRows([{ login: 1 }]), rows)
  assert.deepEqual(extractRows({ data: { rows } }), rows)
  assert.deepEqual(extractRows({ status: 'success', data: { settlements: rows, total: 1 } }), rows)
  assert.deepEqual(extractRows({ data: { weird_name: rows } }), rows)
  assert.deepEqual(extractRows({ data: { rows: [] } }), [])
})
test('error envelopes and unknown shapes are visible errors', () => {
  assert.throws(() => extractRows({ status: 'error', message: 'Week not found' }), /Week not found/)
  assert.throws(() => extractRows({ success: false }), /Unable to load/)
  assert.throws(() => extractRows({ data: { note: 'hello' } }), /Unexpected/)
})

test('pagination is read from the usual places', () => {
  assert.deepEqual(extractPagination({ data: { rows: [], total: 250, pages: 3 } }), { total: 250, pages: 3 })
  assert.deepEqual(extractPagination({ pagination: { total_records: 9, totalPages: 1 } }), { total: 9, pages: 1 })
  assert.deepEqual(extractPagination({ data: { rows: [] } }), { total: null, pages: null })
})

test('login is read from the usual column names', () => {
  assert.equal(loginOf({ login: '90077' }), 90077)
  assert.equal(loginOf({ mt5_login: 90078 }), 90078)
  assert.equal(loginOf({ name: 'x' }), null)
})
test('group scope removes rows outside the group and reports it', () => {
  const rows = [{ login: 90001 }, { login: 90002 }, { login: 90003 }]
  assert.deepEqual(scopeRowsToLogins(rows, [90001, 90003]), { rows: [rows[0], rows[2]], removed: 1, checked: true })
  assert.deepEqual(scopeRowsToLogins(rows, [90001, 90002, 90003]), { rows, removed: 0, checked: true })
})
test('group scope is skipped with no group or with no recognisable login column', () => {
  const rows = [{ login: 90001 }]
  assert.deepEqual(scopeRowsToLogins(rows, null), { rows, removed: 0, checked: false })
  const noLogin = [{ name: 'a' }]
  assert.deepEqual(scopeRowsToLogins(noLogin, [90001]), { rows: noLogin, removed: 0, checked: false })
})

test('amounts format with two decimals and counts without', () => {
  assert.equal(fmtMoney(4380), '4,380.00')
  assert.equal(fmtMoney('x'), '—')
  assert.equal(fmtNumber(1234.5), '1,234.5')
})
test('row detail sorts a row into headline cards, fields, and nested tables', () => {
  const rows = [{ login: 90074, name: ' DEMO ', amount: 730, amount_inr: 730, net_amount: 146, deals: 1, rate: 20, comment: 'Deposit', currency: 'INR', status: 'ready',
    exchanges: [{ exchange: 'MCX', lots: 2, commission: -5.5 }, { exchange: 'NSE', lots: 3, commission: 1 }], meta: { source: 'api' }, extra_note: 'x' }]
  const detail = buildRowDetail(rows[0], deriveColumns(rows))
  assert.equal(detail.login, 90074)
  assert.equal(detail.name, 'DEMO')
  assert.equal(detail.status, 'ready')
  assert.deepEqual(detail.cards.map(c => c.key), ['amount', 'amount_inr', 'net_amount', 'deals'])
  assert.deepEqual(detail.fields.map(f => f.key), ['rate', 'comment', 'currency', 'extra_note'])
  assert.equal(detail.tables.length, 1)
  assert.equal(detail.tables[0].title, 'Exchanges')
  assert.deepEqual(detail.tables[0].columns.map(c => c.key), ['exchange', 'lots', 'commission'])
  assert.deepEqual(detail.groups, [{ key: 'meta', title: 'Meta', entries: [['source', 'api']] }])
})
test('row detail copes with an empty or odd row, and only counts/amounts are totalled', () => {
  assert.deepEqual(buildRowDetail(null, []).cards, [])
  assert.equal(buildRowDetail({ login: 1 }, deriveColumns([{ login: 1 }])).fields.length, 0)
  assert.equal(isSummable({ key: 'lots', kind: 'number' }), true)
  assert.equal(isSummable({ key: 'rate', kind: 'number' }), false)
  assert.equal(isSummable({ key: 'commission', kind: 'money' }), true)
  assert.equal(isSummable({ key: 'symbol', kind: 'text' }), false)
})

test('column prefs hide, reorder and keep unnamed columns in their own order', () => {
  const cols = ['a', 'b', 'c', 'd'].map(key => ({ key, label: key.toUpperCase(), kind: 'text' }))
  assert.deepEqual(applyColumnPrefs(cols).shown.map(c => c.key), ['a', 'b', 'c', 'd'])
  const result = applyColumnPrefs(cols, { hidden: ['b'], order: ['c', 'a'] })
  assert.deepEqual(result.ordered.map(c => c.key), ['c', 'a', 'b', 'd'])
  assert.deepEqual(result.shown.map(c => c.key), ['c', 'a', 'd'])
})

test('collectAllRows follows the pages and stops at the end', async () => {
  const data = Array.from({ length: 250 }, (_, i) => ({ login: 90000 + i }))
  const calls = []
  const fetchPage = async (page, limit) => { calls.push(page); return { data: { rows: data.slice((page - 1) * limit, page * limit), total: 250 } } }
  const rows = await collectAllRows(fetchPage, { limit: 100 })
  assert.equal(rows.length, 250)
  assert.deepEqual(calls, [1, 2, 3])
})
test('collectAllRows stops on a short page with no total, and never loops on a server that ignores page', async () => {
  const short = async page => ({ data: { rows: page === 1 ? [{ login: 1 }, { login: 2 }] : [] } })
  assert.equal((await collectAllRows(short, { limit: 100 })).length, 2)
  let calls = 0
  const stuck = async () => { calls += 1; return { data: { rows: [{ login: 1 }, { login: 2 }] } } }
  assert.equal((await collectAllRows(stuck, { limit: 2 })).length, 2)
  assert.equal(calls, 2)
})

test('excel spec: one band with a TOTAL of amounts and counts, typed columns', () => {
  const rows = [
    { login: 90074, name: 'A', amount: 730, net_amount: 146, deals: 1, rate: 1, comment: 'Deposit', currency: 'INR', status: 'ready' },
    { login: 90090, name: 'B', amount: -6000, net_amount: -1200, deals: 2, rate: 1, comment: 'Withdrawal', currency: 'INR', status: 'pending' },
  ]
  const spec = buildSettlementExcelSpec(rows, deriveColumns(rows), 'Week 17 October')
  assert.equal(spec.sections.length, 1)
  assert.equal(spec.sections[0].title, 'WEEK 17 OCTOBER')
  assert.deepEqual(spec.sections[0].totals, { label: 'TOTAL', values: { amount: -5270, net_amount: -1054, deals: 3 } })
  const col = key => spec.columns.find(c => c.key === key)
  assert.equal(col('amount').type, 'number')
  assert.equal(col('amount').signed, true)
  assert.equal(col('deals').type, 'integer')
  assert.equal(col('login').type, undefined)
  assert.equal(col('status').colorFor('pending'), 'B45309')
})
test('excel spec: mixed currencies get a band each so they are never added together', () => {
  const rows = [
    { login: 1, amount: 100, currency: 'inr' }, { login: 2, amount: 50, currency: 'USD' }, { login: 3, amount: 25, currency: 'INR' },
  ]
  const spec = buildSettlementExcelSpec(rows, deriveColumns(rows), 'Week 1')
  assert.deepEqual(spec.sections.map(s => s.title), ['WEEK 1 · INR', 'WEEK 1 · USD'])
  assert.deepEqual(spec.sections.map(s => s.rows.length), [2, 1])
  assert.deepEqual(spec.sections.map(s => s.totals.values.amount), [125, 50])
})
test('status colours', () => {
  assert.equal(statusColor('Done'), '15803D')
  assert.equal(statusColor('failed'), 'C62828')
  assert.equal(statusColor('whatever'), undefined)
})
