import test from 'node:test'
import assert from 'node:assert/strict'
import { creditOperations, formatCredit, showCreditSummary, temporaryCreditBody } from './brokerCredit.js'

test('zero and null limits are hidden while positive limits remain visible', () => {
  assert.equal(showCreditSummary(null), false)
  assert.equal(showCreditSummary({}), false)
  assert.equal(showCreditSummary({ credit_limit: 0, available_credit: 0 }), false)
  assert.equal(showCreditSummary({ credit_limit: null, available_credit: null }), false)
  assert.equal(showCreditSummary({ credit_limit: 100000, available_credit: 0 }), true)
  assert.equal(formatCredit(null), 'Unlimited')
  assert.equal(formatCredit(0), '0.00')
  assert.equal(formatCredit(undefined), 'Unavailable')
})

test('temporary credit uses existing directional permissions, with no removed balance operations', () => {
  assert.deepEqual(creditOperations.filter(op => op.right === 'credit_in').map(op => op.value), ['credit_in', 'temp_credit_in'])
  assert.deepEqual(creditOperations.filter(op => op.right === 'credit_out').map(op => op.value), ['credit_out', 'temp_credit_out'])
  assert.equal(creditOperations.some(op => ['deposit', 'withdrawal'].includes(op.value)), false)
})

test('temporary credit sends only amount and comment; the backend schedules the reversal', () => {
  assert.deepEqual(temporaryCreditBody(5000, 'Weekend credit'), { amount: 5000, comment: 'Weekend credit' })
})

test('temporary credit rejects invalid amounts before posting', () => {
  for (const amount of [0, -1, NaN, Infinity]) assert.throws(() => temporaryCreditBody(amount, ''), /amount/)
})
