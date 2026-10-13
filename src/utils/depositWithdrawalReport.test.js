import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDepositWithdrawalRequest, parseDepositWithdrawalReport, buildSearchFilters, loadDepositWithdrawalReport } from './depositWithdrawalReport.js'

test('all transactions use the requested range and pagination', () => {
  assert.deepEqual(buildDepositWithdrawalRequest({ from: 100, to: 200 }, 2, 25), {
    from: 100, to: 200, page: 2, limit: 25, type: 'all', sortBy: 'time', sortOrder: 'desc'
  })
})
test('deposits support amount sorting', () => {
  const body = buildDepositWithdrawalRequest({ from: 100, to: 200, type: 'deposit', sortBy: 'amount', sortOrder: 'desc' })
  assert.equal(body.type, 'deposit')
  assert.equal(body.sortBy, 'amount')
  assert.equal(body.sortOrder, 'desc')
})
test('global search does not restrict results to comment or discard explicit filters', () => {
  const body = buildDepositWithdrawalRequest({ from: 100, to: 200, search: '530', logins: '90001,90002' })
  assert.deepEqual(body.filters, [{ field: 'login', operator: 'in', value: [90001, 90002] }])
  assert.equal(body.search, undefined)
})

test('invalid types and ranges are rejected', () => {
  assert.throws(() => buildDepositWithdrawalRequest({ from: 100, to: 200, type: 'other' }), /transaction type/)
  assert.throws(() => buildDepositWithdrawalRequest({ from: 200, to: 100 }), /date range/)
})

test('parses transaction rows and pagination without hiding invalid responses', () => {
  const rows = [{ login: 90001, amount: -10 }]
  assert.deepEqual(parseDepositWithdrawalReport({ data: { transactions: rows, pagination: { total: 101, total_pages: 2 } } }), { rows, total: 101, pages: 2 })
  assert.deepEqual(parseDepositWithdrawalReport({ data: { transactions: [] } }).rows, [])
  assert.throws(() => parseDepositWithdrawalReport({ unexpected: [] }), /Unexpected/)
})

test('search builds one API column filter per request and merges the results', async () => {
  assert.deepEqual(buildSearchFilters('90026').map(f => f.field), ['Name', 'Comment', 'Login'])
  assert.deepEqual(buildSearchFilters('DEMO 26'), [{ field: 'Name', operator: 'contains', value: 'DEMO 26' }, { field: 'Comment', operator: 'contains', value: 'DEMO 26' }])
  const calls = []
  const fetchReport = async body => {
    calls.push(body)
    const field = body.filters.at(-1).field
    return { data: { rows: field === 'Name' ? [{ deal: 1, time: 5 }, { deal: 2, time: 9 }] : [{ deal: 2, time: 9 }], total: 2, pages: 1 } }
  }
  const body = { from: 1, to: 2, page: 1, limit: 100, sortBy: 'time', sortOrder: 'desc', filters: [{ field: 'login', operator: 'in', value: [1] }] }
  const result = await loadDepositWithdrawalReport(fetchReport, body, 'abc')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.filters[0].field === 'login' && call.filters.length === 2))
  assert.deepEqual(result.rows, [{ deal: 2, time: 9 }, { deal: 1, time: 5 }])
  calls.length = 0
  await loadDepositWithdrawalReport(fetchReport, body, '')
  assert.equal(calls.length, 1)
})

test('search cancellation and failures do not return incomplete matches', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(loadDepositWithdrawalReport(async () => ({ data: { rows: [] } }), { page: 1, limit: 1 }, 'x', controller.signal), { name: 'AbortError' })
  await assert.rejects(loadDepositWithdrawalReport(async body => {
    if (body.filters[0].field === 'Comment') throw new Error('Server failure')
    return { data: { rows: [{ deal: 1 }] } }
  }, { page: 1, limit: 1 }, 'x'), /Server failure/)
})
