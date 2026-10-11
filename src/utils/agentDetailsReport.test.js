import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentDetailsRequest, parseAgentDetailsReport } from './agentDetailsReport.js'

test('all agents matches the unfiltered collection request', () => {
  assert.deepEqual(buildAgentDetailsRequest({ from: 100, to: 200 }), { from: 100, to: 200, page: 1, limit: 100 })
})
test('agent and symbol produce the documented equality filters', () => {
  assert.deepEqual(buildAgentDetailsRequest({ from: 100, to: 200, agent: '800001', search: ' XAUUSD ' }).filters, [
    { field: 'agent_login', operator: 'equal', value: 800001 },
    { field: 'symbol', operator: 'equal', value: 'XAUUSD' }
  ])
})
test('combined types and commission sorting match the collection', () => {
  const body = buildAgentDetailsRequest({ from: 100, to: 200, type: 'both', sortBy: 'commission', sortOrder: 'desc' }, 2, 25)
  assert.deepEqual(body.filters, [{ field: 'type', operator: 'in', value: ['AGENT', 'AGENT_DAILY'] }])
  assert.equal(body.sortBy, 'commission')
  assert.equal(body.page, 2)
  assert.equal(body.limit, 25)
})
test('invalid agent and range are rejected', () => {
  assert.throws(() => buildAgentDetailsRequest({ from: 100, to: 200, agent: 'abc' }), /agent login/)
  assert.throws(() => buildAgentDetailsRequest({ from: 200, to: 100 }), /date range/)
})
test('rows and pages are parsed and unexpected responses are visible errors', () => {
  assert.deepEqual(parseAgentDetailsReport({ data: { rows: [], total: 0, pages: 0 } }), { rows: [], total: 0, pages: 0 })
  assert.throws(() => parseAgentDetailsReport({ data: {} }), /Unexpected/)
})
