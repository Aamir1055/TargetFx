import test from 'node:test'
import assert from 'node:assert/strict'
import { createLatestRequest } from './latestRequest.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const createTable = () => {
  const requests = createLatestRequest()
  const state = { data: null, error: null, loading: false }
  const fetch = async response => {
    const isCurrent = requests.start()
    state.loading = true
    state.error = null
    try {
      const data = await response
      if (isCurrent()) state.data = data
    } catch (error) {
      if (isCurrent()) state.error = error.message
    } finally {
      if (isCurrent()) state.loading = false
    }
  }
  return { requests, state, fetch }
}

test('a slow earlier search cannot replace the latest API rows or totals', async () => {
  const table = createTable()
  const older = deferred()
  const newer = deferred()
  const oldFetch = table.fetch(older.promise)
  const newFetch = table.fetch(newer.promise)
  const latest = { clients: [{ client_login: 90005, percentage: 43 }], total: 1, total_custom: 1, total_default: 0, default_percentage: 20 }
  newer.resolve(latest)
  await newFetch
  older.resolve({ clients: [{ client_login: 90005 }, { client_login: 90007 }, { client_login: 90009 }], total: 3 })
  await oldFetch
  assert.equal(table.state.data, latest)
  assert.equal(table.state.loading, false)
})

test('an obsolete error cannot stop loading or show an error for the next query', async () => {
  const table = createTable()
  const older = deferred(), newer = deferred()
  const oldFetch = table.fetch(older.promise), newFetch = table.fetch(newer.promise)
  older.reject(new Error('Old request failed'))
  await oldFetch
  assert.equal(table.state.loading, true)
  assert.equal(table.state.error, null)
  newer.resolve({ clients: [], total: 0, total_custom: 0 })
  await newFetch
  assert.deepEqual(table.state.data, { clients: [], total: 0, total_custom: 0 })
})

test('clearing a query wins over an in-flight filtered request', async () => {
  const table = createTable()
  const filtered = deferred()
  const oldFetch = table.fetch(filtered.promise)
  const all = { clients: [{ client_login: 90005 }, { client_login: 90007 }], total: 2 }
  await table.fetch(Promise.resolve(all))
  filtered.resolve({ clients: [{ client_login: 90005 }], total: 1 })
  await oldFetch
  assert.equal(table.state.data, all)
})

test('leaving a query or unmounting invalidates its pending result', async () => {
  const table = createTable()
  const pending = deferred()
  const fetch = table.fetch(pending.promise)
  table.requests.invalidate()
  pending.resolve({ clients: [{ client_login: 90005 }], total: 1 })
  await fetch
  assert.equal(table.state.data, null)
  assert.equal(table.state.loading, true)
})
