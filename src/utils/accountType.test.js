import test from 'node:test'
import assert from 'node:assert/strict'
import { accountTypeLabel, accountTypeApiValue, normalizeAccountTypes, accountTypeSearchPayload, parseAccountTypePreferences } from './accountType.js'

test('backend account type takes priority over legacy country', () => {
  assert.equal(accountTypeLabel('Non-Liquidate', 'India'), 'DNL')
  assert.equal(accountTypeLabel('Liquidate', 'U.A.E.'), 'Liquidate')
  assert.equal(accountTypeLabel(null, 'India'), 'Liquidate')
  for (const country of ['UAE', 'U.A.E.', 'United Arab Emirates']) assert.equal(accountTypeLabel(null, country), 'DNL')
  assert.equal(accountTypeLabel(null, 'Unknown'), '-')
})
test('normalizes client envelopes without changing geographic data', () => {
  const source = { data: { clients: [{ login: 1, country: 'India' }, { login: 2, liquidateType: 'Non-Liquidate' }] } }
  const result = normalizeAccountTypes(source)
  assert.equal(result.data.clients[0].liquidateType, 'Liquidate')
  assert.equal(result.data.clients[0].country, 'India')
  assert.equal(result.data.clients[1].liquidateType, 'DNL')
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
test('preserves saved column selection and order after rename', () => {
  assert.deepEqual(parseAccountTypePreferences('{"country":true,"name":false}'), { liquidateType: true, name: false })
  assert.deepEqual(parseAccountTypePreferences('["login","country","name"]'), ['login', 'liquidateType', 'name'])
})
