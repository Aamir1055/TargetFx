import test from 'node:test'
import assert from 'node:assert/strict'
import { accountTypeLabel, accountTypeApiValue, normalizeAccountTypes, accountTypeSearchPayload, parseAccountTypePreferences } from './accountType.js'

test('backend account type takes priority over legacy country', () => {
  for (const value of ['Non-Liquidate', 'DNL', 'dnl', 'Non Liquidate']) {
    assert.equal(accountTypeLabel(value, 'India'), 'Non-Liquidate')
  }
  assert.equal(accountTypeLabel('Liquidate', 'U.A.E.'), 'Liquidate')
  assert.equal(accountTypeLabel('Liquidate', 'India'), 'Liquidate')
  assert.equal(accountTypeLabel('Custom', 'India'), 'Custom')
})
test('missing backend type falls back to Non-Liquidate for UAE and other countries', () => {
  for (const country of ['UAE', 'U.A.E.', 'United Arab Emirates', 'India', 'United Kingdom', 'Unknown']) {
    for (const value of [undefined, null, '', '   ']) {
      assert.equal(accountTypeLabel(value, country), 'Non-Liquidate')
    }
  }
  for (const country of [undefined, null, '', '   ']) assert.equal(accountTypeLabel(null, country), '-')
})
test('normalizes client envelopes without changing geographic data', () => {
  const source = { data: { clients: [{ login: 1, country: 'India' }, { login: 2, liquidateType: 'Non-Liquidate' }, { login: 3, liquidateType: 'DNL' }] } }
  const result = normalizeAccountTypes(source)
  assert.equal(result.data.clients[0].liquidateType, 'Non-Liquidate')
  assert.equal(result.data.clients[0].country, 'India')
  assert.equal(result.data.clients[1].liquidateType, 'Non-Liquidate')
  assert.equal(result.data.clients[2].liquidateType, 'Non-Liquidate')
  assert.deepEqual(normalizeAccountTypes(result), result)
  assert.equal(source.data.clients[2].liquidateType, 'DNL')
  assert.equal(source.data.clients[0].liquidateType, undefined)
})
test('search and filters translate DNL to the backend enum', () => {
  const result = accountTypeSearchPayload({ search: 'DNL', sortBy: 'liquidateType', filters: [{ field: 'liquidateType', operator: 'in', value: ['Liquidate', 'DNL'] }, { field: 'name', operator: 'equal', value: 'DNL' }] })
  assert.equal(result.search, 'Non-Liquidate')
  assert.equal(result.sortBy, 'liquidateType')
  assert.deepEqual(result.filters[0].value, ['Liquidate', 'Non-Liquidate'])
  assert.equal(result.filters[1].value, 'DNL')
  assert.equal(accountTypeApiValue('DNL'), 'Non-Liquidate')
})
test('preserves Non-Liquidate search and filter values', () => {
  const payload = { search: 'Non-Liquidate', filters: [{ field: 'liquidateType', operator: 'in', value: ['Liquidate', 'Non-Liquidate'] }] }
  assert.deepEqual(accountTypeSearchPayload(payload), payload)
  assert.equal(accountTypeApiValue('Non-Liquidate'), 'Non-Liquidate')
})
test('preserves client liquidation sorting and usual filter operators', () => {
  for (const sortOrder of ['asc', 'desc']) {
    for (const operator of ['equal', 'not_equal', 'contains', 'in']) {
      const value = operator === 'in' ? ['Liquidate', 'Non-Liquidate'] : 'Liquidate'
      const payload = { search: 'Liquidate', sortBy: 'liquidateType', sortOrder, filters: [{ field: 'liquidateType', operator, value }] }
      assert.deepEqual(accountTypeSearchPayload(payload), payload)
    }
  }
})
test('preserves saved column selection and order after rename', () => {
  assert.deepEqual(parseAccountTypePreferences('{"country":true,"name":false}'), { liquidateType: true, name: false })
  assert.deepEqual(parseAccountTypePreferences('["login","country","name"]'), ['login', 'liquidateType', 'name'])
})
