import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCreditRequest, parseCreditReport } from './creditReport.js'

test('unfiltered request matches the collection without optional filters', () => {
  assert.deepEqual(buildCreditRequest({ from: 100, to: 200 }), { from: 100, to: 200, page: 1, limit: 100, sortBy: 'time', sortOrder: 'desc' })
})
test('filtered request preserves zero amount and numeric login list', () => {
  assert.deepEqual(buildCreditRequest({ from: 100, to: 200, search: ' bonus ', amount: '0', logins: '750001, 750002,750001' }, 2, 25), {
    from: 100, to: 200, page: 2, limit: 25, sortBy: 'time', sortOrder: 'desc', search: 'bonus', filters: [
      { field: 'amount', operator: 'greater_than', value: 0 },
      { field: 'login', operator: 'in', value: [750001, 750002] }
    ]
  })
})
test('rejects invalid ranges and login filters instead of broadening the query', () => {
  assert.throws(() => buildCreditRequest({ from: 200, to: 100 }), /date range/)
  assert.throws(() => buildCreditRequest({ from: 100, to: 200, logins: '750001,abc' }), /login numbers/)
})
test('reads nested rows and retains pagination outside the data array', () => {
  const rows = [{ login: 750001, amount: 50 }]
  assert.deepEqual(parseCreditReport({ data: { credits: rows, pagination: { total: 150, total_pages: 2 } } }), { rows, total: 150, pages: 2 })
  assert.deepEqual(parseCreditReport({ data: rows, pagination: { total: 1 } }), { rows, total: 1, pages: null })
})
test('distinguishes an empty report from an unknown response or API failure', () => {
  assert.deepEqual(parseCreditReport({ data: { credits: [] } }).rows, [])
  assert.throws(() => parseCreditReport({ unexpected: [] }), /Unexpected/)
  assert.throws(() => parseCreditReport({ success: false, message: 'Not available' }), /Not available/)
})
