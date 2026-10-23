import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import {
  calculatorNumber, calculatorData, calculatorReport, calculatorRateRows,
  changedCalculatorRates, calculatorUsdRate, calculatorExportView,
} from '../src/utils/brokerageCalculator.js'

test('missing financial values stay missing, while zero and negative amounts remain numeric', () => {
  for (const value of [null, undefined, '', ' ', 'invalid', Infinity]) assert.equal(calculatorNumber(value), null)
  assert.equal(calculatorNumber('0'), 0)
  assert.equal(calculatorNumber('-125.50'), -125.5)
})

test('report reads the documented envelope and preserves full-scope summary, nulls and currency provenance', () => {
  const data = {
    logins: [{ login: 543610, status: 'pending', rebate_inr: null }],
    exchanges: ['NSE', 'COMEX'], pending: [], pending_truncated: true,
    summary: { charged_inr: 17600, our_brokerage_inr: 5340, balance_inr: 12260, rebate_inr: 9195, average_login_percent: 75 },
    pagination: { total: 201, total_pages: 3, page: 1, limit: 100 },
    usd_inr: { rate: 83.5, source: 'previous_week', source_week_id: 41 },
  }
  assert.equal(calculatorReport({ status: 'success', data }), data)
  assert.equal(data.logins[0].rebate_inr, null)
  assert.equal(data.summary.rebate_inr, 9195)
  assert.equal(data.pagination.total, 201)
  assert.equal(data.usd_inr.source_week_id, 41)
})

test('failed or incomplete API responses are explicit errors rather than empty successful reports', () => {
  assert.throws(() => calculatorData({ status: 'error', message: 'MT5 data not ready' }), /MT5 data not ready/)
  assert.throws(() => calculatorData({ status: false, message: 'Denied' }), /Denied/)
  assert.throws(() => calculatorData({}), /invalid response/)
  assert.throws(() => calculatorReport({ data: { logins: [] } }), /incomplete/)
})

test('blank exchange rates and methods remain null and zero is a valid rate', () => {
  assert.deepEqual(calculatorRateRows([
    { exchange: 'MCX', method: '', rate: '', currency: 'INR' },
    { exchange: 'NSE OPTIONS', method: 'lot', rate: '0', currency: 'INR' },
  ]), [
    { exchange: 'MCX', method: null, rate: null, currency: 'INR' },
    { exchange: 'NSE OPTIONS', method: 'lot', rate: 0, currency: 'INR' },
  ])
})

test('client overrides inherit with null and cannot specify their own currency', () => {
  assert.deepEqual(calculatorRateRows([{ login: '543602', exchange: 'COMEX', method: '', rate: '', currency: 'USD' }], true),
    [{ login: 543602, exchange: 'COMEX', method: null, rate: null }])
})

test('rate writes include only changed rows, including explicit clearing of persisted values', () => {
  const original = [
    { exchange: 'NSE', method: 'crore', rate: 500, currency: 'INR', configured: true },
    { exchange: 'COMEX', method: 'lot', rate: 5, currency: 'USD', configured: true },
  ]
  assert.deepEqual(changedCalculatorRates([
    { ...original[0], rate: '500' },
    { ...original[1], method: '', rate: '', currency: 'INR' },
  ], original), [{ exchange: 'COMEX', method: null, rate: null, currency: 'INR' }])
  assert.deepEqual(changedCalculatorRates(original, original), [])
})

test('clearing a client override sends a tombstone rather than silently omitting the row', () => {
  const row = { login: 543602, exchange: 'NSE', method: 'crore', rate: 300 }
  assert.deepEqual(changedCalculatorRates([{ ...row, method: '', rate: '' }], [row], true),
    [{ login: 543602, exchange: 'NSE', method: null, rate: null }])
})

test('invalid rates, unsupported methods, currencies and duplicate rows are rejected before writing', () => {
  const row = { exchange: 'NSE', method: 'lot', rate: 0, currency: 'INR' }
  for (const rate of ['-1', '1.2.3', 'NaN', 'Infinity']) assert.throws(() => calculatorRateRows([{ ...row, rate }]), /non-negative/)
  assert.throws(() => calculatorRateRows([{ ...row, method: 'percentage' }]), /Per Lot or Per Crore/)
  assert.throws(() => calculatorRateRows([{ ...row, currency: 'EUR' }]), /INR or USD/)
  assert.throws(() => calculatorRateRows([row, row]), /Duplicate/)
  for (const login of ['', 0, -1, 1.5, 'abc']) assert.throws(() => calculatorRateRows([{ ...row, login }], true), /valid positive client login/)
})

test('the documented maximum of 1000 rate changes is enforced', () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ exchange: `EX${index}`, method: 'lot', rate: 0, currency: 'INR' }))
  assert.throws(() => changedCalculatorRates(rows, []), /1,000/)
})

test('USD-INR requires a positive rate, with null reserved for removal', () => {
  for (const value of ['', ' ', null]) assert.equal(calculatorUsdRate(value), null)
  for (const value of [0, '-1', '1.2.3', 'Infinity']) assert.throws(() => calculatorUsdRate(value), /greater than zero/)
  assert.equal(calculatorUsdRate('83.50'), 83.5)
})

test('exports use only supported API views', () => {
  assert.equal(calculatorExportView('pivot'), 'exchanges')
  for (const view of ['logins', 'exchanges', 'pending']) assert.equal(calculatorExportView(view), view)
})

function mockApi() {
  const calls = []
  const client = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    post: async (...args) => {
      calls.push(['post', ...args])
      return { data: args[2]?.responseType === 'blob' ? new Blob(['test'], { type: 'text/csv' }) : { status: 'success', data: {} } }
    },
    get: async (...args) => { calls.push(['get', ...args]); return { data: {} } },
    put: async (...args) => { calls.push(['put', ...args]); return { data: {} } },
  }
  const source = readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8')
  const { code } = transformSync(source, { format: 'cjs', define: { 'import.meta': '{"env":{"DEV":true}}' } })
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Blob,
    require: name => name === 'axios' ? { create: () => client } : {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } },
    setTimeout: fn => fn(),
  })
  return { api: module.exports.brokerageCalcAPI, calls }
}

test('report requests retain filters, pagination and cancellation using only broker routes', async () => {
  const { api, calls } = mockApi()
  const options = { signal: new AbortController().signal }
  await api.calculate({ week_id: 42, search: 'Mehta', status: 'ready', page: 2, limit: 25 }, options)
  assert.equal(calls[0][1], '/api/broker/brokerage-calculator')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), { week_id: 42, search: 'Mehta', status: 'ready', page: 2, limit: 25 })
  assert.equal(calls[0][3], options)
})

test('export retains search and ready/pending scope but omits page and limit', async () => {
  const { api, calls } = mockApi()
  await api.exportFile({ week_id: 42, search: 'Mehta', status: 'pending', format: 'csv', view: 'pending', page: 2, limit: 25 }, 'test.csv')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), { week_id: 42, search: 'Mehta', status: 'pending', format: 'csv', view: 'pending' })
  assert.equal(calls[0][3].responseType, 'blob')
})

test('client lookup is filtered and rate writes preserve nulls in broker API payloads', async () => {
  const { api, calls } = mockApi()
  await api.getClientRates({ login: 543602, exchange: 'NSE' })
  await api.setClientRates([{ login: 543602, exchange: 'NSE', method: null, rate: null }])
  await api.setUsdInr(42, null)
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), { params: { login: 543602, exchange: 'NSE' } })
  assert.equal(calls[1][2].rates[0].rate, null)
  assert.equal(calls[2][2].rate, null)
  assert.ok(calls.every(call => call[1].startsWith('/api/broker/brokerage-calculator/')))
})
