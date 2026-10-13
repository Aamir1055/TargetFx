import test from 'node:test'
import assert from 'node:assert/strict'
import { getExportLoading, subscribeExportLoading, withExportLoading } from './exportLoading.js'

test('loader starts before work, stays active through concurrent exports, and clears on failure', async () => {
  const states = []
  const unsubscribe = subscribeExportLoading(() => states.push(getExportLoading()))
  let finish
  const hold = new Promise(resolve => { finish = resolve })
  const first = withExportLoading(async () => { await hold; return 'done' })()
  assert.equal(getExportLoading(), true)
  await assert.rejects(withExportLoading(() => { throw new Error('Export failed') })(), /Export failed/)
  assert.equal(getExportLoading(), true)
  finish()
  assert.equal(await first, 'done')
  assert.equal(getExportLoading(), false)
  assert.deepEqual(states, [true, true, true, false])
  unsubscribe()
})
