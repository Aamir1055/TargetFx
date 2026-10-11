import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDepositWithdrawalRequest, parseDepositWithdrawalReport } from './depositWithdrawalReport.js'

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
test('withdrawal search uses the documented comment filter and clears cleanly', () => {
  const options = { from: 100, to: 200, type: 'withdrawal', search: ' bank ' }
  assert.deepEqual(buildDepositWithdrawalRequest(options).filters, [{ field: 'comment', operator: 'contains', value: 'bank' }])
  assert.equal(buildDepositWithdrawalRequest({ ...options, search: '' }).filters, undefined)
  assert.equal(buildDepositWithdrawalRequest(options).search, undefined)
})
test('login filters coexist with comment filters', () => {
  const body = buildDepositWithdrawalRequest({ from: 100, to: 200, search: 'bank', logins: '90001,90002' })
  assert.deepEqual(body.filters[0], { field: 'login', operator: 'in', value: [90001, 90002] })
  assert.equal(body.filters[1].field, 'comment')
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
