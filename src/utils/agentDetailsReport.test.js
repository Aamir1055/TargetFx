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
test('a numeric search filters by client login, not symbol', () => {
  assert.deepEqual(buildAgentDetailsRequest({ from: 100, to: 200, search: ' 90077 ' }).filters, [
    { field: 'login', operator: 'in', value: [90077] }
  ])
})
test('a text search still filters by exact symbol', () => {
  assert.deepEqual(buildAgentDetailsRequest({ from: 100, to: 200, search: 'XAUUSD' }).filters, [
    { field: 'symbol', operator: 'equal', value: 'XAUUSD' }
  ])
})
test('a login search combines with the agent filter and an active group', async () => {
  const { applyReportGroupFilter } = await import('./reportGroupFilter.js')
  const body = buildAgentDetailsRequest({ from: 100, to: 200, agent: '800001', search: '90077' })
  assert.deepEqual(body.filters, [
    { field: 'agent_login', operator: 'equal', value: 800001 },
    { field: 'login', operator: 'in', value: [90077] }
  ])
  // searched login is inside the group -> kept; outside the group -> request is refused (no leak to all accounts)
  assert.equal(applyReportGroupFilter(structuredClone(body), { loginIds: [90077, 90078] }), true)
  assert.equal(applyReportGroupFilter(structuredClone(body), { loginIds: [90001] }), false)
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
