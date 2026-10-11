import test from 'node:test'
import assert from 'node:assert/strict'
import { filterPercentageTypes, getPercentageType, loadPercentageClients, percentageSearchType } from './percentageType.js'

const rows = [
  { client_login: 1 },
  { client_login: 2, is_custom: true },
  { client_login: 3, is_autofill: true },
  { client_login: 4, is_custom: true, is_autofill: true }
]

test('type checkboxes match badges and combine selections with OR', () => {
  assert.equal(getPercentageType(rows[3]), 'Auto')
  assert.deepEqual(filterPercentageTypes(rows, []), rows)
  assert.deepEqual(filterPercentageTypes(rows, ['Default']), [rows[0]])
  assert.deepEqual(filterPercentageTypes(rows, ['Custom']), [rows[1]])
  assert.deepEqual(filterPercentageTypes(rows, ['Auto']), rows.slice(2))
  assert.deepEqual(filterPercentageTypes(rows, ['Default', 'Auto']), [rows[0], rows[2], rows[3]])
  assert.deepEqual(filterPercentageTypes(rows, ['Default', 'Custom', 'Auto']), rows)
  assert.deepEqual(filterPercentageTypes([rows[0]], ['Auto']), [])
})

test('type search intersects checkbox selections', () => {
  assert.equal(percentageSearchType(' AUTOFILL '), 'Auto')
  assert.equal(percentageSearchType('custom'), 'Custom')
  assert.equal(percentageSearchType('default'), 'Default')
  assert.equal(percentageSearchType('90005'), null)
  assert.deepEqual(filterPercentageTypes(filterPercentageTypes(rows, ['Custom']), ['Auto']), [])
})

test('loads server-capped pages before filtering and preserves sorting/login parameters', async () => {
  const requests = []
  const payload = await loadPercentageClients(async params => {
    requests.push(params)
    return { data: { data: { clients: rows.slice((params.page - 1) * 2, params.page * 2), total: 4, default_percentage: 20 } } }
  }, { page: 9, page_size: 15, login: '90', sort_by: 'login', sort_order: 'desc' }, () => true)
  assert.equal(requests.length, 2)
  assert.deepEqual(requests.map(request => request.page), [1, 2])
  assert.ok(requests.every(request => request.limit === 100 && request.page_size === undefined && request.login === '90' && request.sort_order === 'desc'))
  assert.equal(payload.default_percentage, 20)
  assert.deepEqual(filterPercentageTypes(payload.clients, ['Auto']), rows.slice(2))
})

test('empty results are valid and incomplete, duplicate, failed or obsolete requests reject', async () => {
  const empty = await loadPercentageClients(async () => ({ clients: [], total: 0 }), {}, () => true)
  assert.deepEqual(empty.clients, [])
  await assert.rejects(loadPercentageClients(async () => ({ clients: [], total: 2 }), {}, () => true), /Incomplete/)
  await assert.rejects(loadPercentageClients(async () => ({ clients: [rows[0], rows[0]], total: 2 }), {}, () => true), /Incomplete/)
  await assert.rejects(loadPercentageClients(async () => { throw new Error('API unavailable') }, {}, () => true), /API unavailable/)
  await assert.rejects(loadPercentageClients(async () => ({ clients: rows }), {}, () => false), /superseded/)
})
