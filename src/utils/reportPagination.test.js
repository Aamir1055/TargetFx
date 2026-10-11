import test from 'node:test'
import assert from 'node:assert/strict'
import { loadClientRows, loadHistoricalRows, pageCount, paginateClientRows, searchHistoricalRows } from './reportPagination.js'

test('historical search finds a symbol on a later server page', async () => {
  const calls = []
  const rows = await loadHistoricalRows(async (page, limit) => {
    calls.push({ page, limit })
    return { data: { Report: [{ Symbol: page === 1 ? 'GOLDDEC' : 'SILVERDEC' }], pagination: { total_pages: 2 } } }
  })
  const result = searchHistoricalRows(rows, 'silver', 8, 100)
  assert.deepEqual(result, { rows: [{ Symbol: 'SILVERDEC' }], total: 1, totalPages: 1, page: 1 })
  assert.deepEqual(calls.map(call => call.page), [1, 2])
})

test('historical search paginates matches and keeps an empty result on page 1', () => {
  const rows = Array.from({ length: 102 }, (_, i) => ({ Symbol: `SILVER${i}` }))
  assert.equal(searchHistoricalRows(rows, 'silver', 2, 100).rows.length, 2)
  assert.deepEqual(searchHistoricalRows(rows, 'missing', 2, 100), { rows: [], total: 0, totalPages: 1, page: 1 })
  assert.equal(pageCount(0, 100), 1)
})

test('client search consumes all server pages even when the server limits each page', async () => {
  const calls = []
  const rows = await loadClientRows(async page => {
    calls.push(page)
    const positions = Array.from({ length: page === 1 ? 15 : 2 }, (_, i) => ({ position: (page - 1) * 15 + i + 1, action: 0 }))
    return { data: { data: { positions, total: 17 } } }
  }, 'positions')
  assert.equal(rows.length, 17)
  assert.deepEqual(calls, [1, 2])
  assert.equal(rows.at(-1).position, 17)
})

test('combined pagination preserves numeric actions and reaches the orders after positions', () => {
  const positions = Array.from({ length: 101 }, (_, i) => ({ position: i + 1, action: 0 }))
  const orders = [{ order: 1001, type: 2 }]
  assert.equal(paginateClientRows(positions, orders, 1, 100).regularPositions.length, 100)
  assert.deepEqual(paginateClientRows(positions, orders, 2, 100), { regularPositions: [positions[100]], pendingOrders: orders })
})

test('a failed later page rejects the search instead of presenting incomplete results', async () => {
  await assert.rejects(loadClientRows(async page => {
    if (page === 2) throw new Error('Server unavailable')
    return { data: { positions: [{ position: 1 }], total: 2 } }
  }, 'positions'), /Server unavailable/)
})

test('cancelled historical search stops before requesting the next page', async () => {
  const controller = new AbortController()
  let calls = 0
  await assert.rejects(loadHistoricalRows(async () => {
    calls += 1
    controller.abort()
    return { data: { Report: [{ Symbol: 'GOLD' }], pagination: { total_pages: 10 } } }
  }, controller.signal), { name: 'AbortError' })
  assert.equal(calls, 1)
})

test('cancelled client search cannot return an obsolete response', async () => {
  const controller = new AbortController()
  await assert.rejects(loadClientRows(async () => {
    controller.abort()
    return { data: { orders: [{ order: 1 }], total: 1 } }
  }, 'orders', controller.signal), { name: 'AbortError' })
})

test('unpaginated empty responses finish without extra requests', async () => {
  let calls = 0
  assert.deepEqual(await loadClientRows(async () => { calls += 1; return { data: { orders: [] } } }, 'orders'), [])
  assert.equal(calls, 1)
})
