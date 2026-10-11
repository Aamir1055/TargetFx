import test from 'node:test'
import assert from 'node:assert/strict'
import { applyReportGroupFilter } from './reportGroupFilter.js'

test('range groups send numeric bounds without an expanded login list', () => {
  for (const type of [undefined, 'withdrawal']) {
    const body = { from: 100, to: 200, page: 1, limit: 100, ...(type ? { type } : {}) }
    assert.equal(applyReportGroupFilter(body, { range: { from: '90005', to: '90050' }, loginIds: [] }), true)
    assert.equal(body.accountRangeMin, 90005)
    assert.equal(body.accountRangeMax, 90050)
    assert.equal(body.filters, undefined)
    assert.equal(body.type, type)
  }
})
test('manual groups retain login filters and existing comment search', () => {
  const comment = { field: 'comment', operator: 'contains', value: 'bank' }
  const body = { filters: [comment] }
  assert.equal(applyReportGroupFilter(body, { loginIds: ['90005', 90050] }), true)
  assert.deepEqual(body.filters, [comment, { field: 'login', operator: 'in', value: [90005, 90050] }])
  assert.equal(body.accountRangeMin, undefined)
})
test('all logins leaves a fresh request unfiltered and invalid groups fail closed', () => {
  const body = { page: 1 }
  assert.equal(applyReportGroupFilter(body, null), true)
  assert.deepEqual(body, { page: 1 })
  assert.equal(applyReportGroupFilter({}, { loginIds: [] }), false)
  assert.equal(applyReportGroupFilter({}, { range: { from: 90050, to: 90005 } }), false)
})
