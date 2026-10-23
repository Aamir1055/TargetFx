import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, extname, sep } from 'node:path'

// Run after npm run build. All API traffic is intercepted; no real client data is read or written.
const root = resolve('dist')
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
  try {
    const body = await readFile(extname(path) ? path : join(root, 'index.html'))
    const type = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(path)] || 'text/html'
    res.writeHead(200, { 'Content-Type': type }).end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = await mkdtemp(join(tmpdir(), 'brokereye-calculator-'))
const browser = spawn(process.env.TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: 'ignore' })
const delay = ms => new Promise(done => setTimeout(done, ms))
const calls = []
const exceptions = []
let ws
let send
let exchangeRates = [
  { exchange: 'NSE', method: 'crore', rate: 500, currency: 'INR', configured: true },
  { exchange: 'COMEX', method: 'lot', rate: 5, currency: 'USD', configured: true },
  { exchange: 'MCX', method: null, rate: null, currency: 'INR', configured: false },
]
let clientRates = [{ login: 543602, name: 'Sample ready', exchange: 'NSE', method: null, rate: 300 }]
let usd = { rate: 83.5, source: 'previous_week', source_week_id: 41, source_week_name: 'Week 41' }
let reportFailure = false
const report = request => ({
  week: { id: request.week_id, name: `Week ${request.week_id}` },
  usd_inr: usd,
  summary: { charged_inr: 17600, our_brokerage_inr: 5340, balance_inr: 12260, rebate_inr: 9195, average_login_percent: 75, logins: 201, ready_logins: 200, pending_logins: 1, pending_issues: 2 },
  exchanges: ['NSE', 'COMEX', 'MCX'],
  logins: [
    { login: 543602, name: 'Sample ready', ld_percent: 75, ld_is_custom: true, charged_inr: 10000, our_brokerage_inr: 2000, balance_inr: 8000, rebate_inr: 6000, status: 'ready', flags: [],
      exchanges: [{ exchange: 'NSE', lots: 12, turnover: 40000000, charged: 10000, charged_currency: 'INR', method: 'crore', rate: 500, rate_currency: 'INR', rate_source: 'broker', charged_inr: 10000, our_brokerage_inr: 2000, balance_inr: 8000, rebate_inr: 6000, status: 'ready', issues: [], flags: [] }] },
    { login: 543610, name: 'Sample pending', ld_percent: 50, charged_inr: null, our_brokerage_inr: null, balance_inr: null, rebate_inr: null, status: 'pending', flags: [], exchanges: [] },
    { login: 543611, name: 'Sample negative', ld_percent: 75, charged_inr: 100, our_brokerage_inr: 300, balance_inr: -200, rebate_inr: -150, status: 'ready', flags: ['our_brokerage_exceeds_charged', 'commission_refund'], exchanges: [] },
  ],
  pending: [
    { login: 543610, name: 'Sample pending', exchange: 'MCX', issue: 'rate_missing', detail: 'Enter MCX rate' },
    { login: 543610, name: 'Sample pending', exchange: 'COMEX', issue: 'usd_inr_missing', detail: 'Set USD-INR' },
    { login: 543612, name: 'Support sample', exchange: 'UNKNOWN', issue: 'account_currency_unsupported', detail: 'Account currency EUR is unsupported' },
  ],
  pending_truncated: true,
  pagination: { total: 201, page: request.page, limit: request.limit, total_pages: Math.ceil(201 / request.limit) },
})

try {
  let port
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) }
  }
  assert.ok(port, 'Browser debugging endpoint started')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise(done => ws.addEventListener('open', done, { once: true }))
  let id = 0
  const pending = new Map()
  send = (method, params = {}) => new Promise((resolveCall, reject) => {
    const next = ++id
    pending.set(next, { resolve: resolveCall, reject })
    ws.send(JSON.stringify({ id: next, method, params }))
  })
  ws.addEventListener('message', async ({ data }) => {
    const message = JSON.parse(data)
    if (message.id) {
      const call = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) call?.reject(new Error(message.error.message)); else call?.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails)
    else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params
      if (request.url.startsWith(origin) && !new URL(request.url).pathname.startsWith('/api/')) return void send('Fetch.continueRequest', { requestId })
      const url = new URL(request.url)
      if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/ai/')) {
        return void send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }], body: '' })
      }
      const body = request.postData ? JSON.parse(request.postData) : {}
      calls.push({ path: url.pathname, method: request.method, body, params: Object.fromEntries(url.searchParams) })
      let result = { clients: [], groups: [], total: 0 }
      let status = 200
      if (url.pathname.endsWith('/settlement-weeks')) result = { weeks: [{ id: 42, name: 'Week 42' }, { id: 43, name: 'Week 43' }] }
      if (url.pathname.endsWith('/credit')) result = { credit_limit: 100000, available_credit: 57000 }
      if (url.pathname.endsWith('/brokerage-calculator')) {
        result = report(body)
        if (reportFailure && request.method === 'POST') status = 503
      }
      if (url.pathname.endsWith('/exchanges')) {
        if (request.method === 'PUT') exchangeRates = exchangeRates.map(row => ({ ...row, ...body.exchanges.find(item => item.exchange === row.exchange) }))
        result = { exchanges: exchangeRates }
      }
      if (url.pathname.endsWith('/client-rates')) {
        if (request.method === 'PUT') {
          for (const row of body.rates) {
            clientRates = clientRates.filter(item => item.login !== row.login || item.exchange !== row.exchange)
            if (row.rate != null || row.method != null) clientRates.push(row)
          }
        }
        result = { client_rates: clientRates.filter(row => (!url.searchParams.get('login') || String(row.login) === url.searchParams.get('login')) && (!url.searchParams.get('exchange') || row.exchange === url.searchParams.get('exchange'))) }
      }
      if (url.pathname.endsWith('/usd-inr')) {
        if (request.method === 'PUT') usd = { ...usd, rate: body.rate, source: body.rate == null ? 'none' : 'week' }
        result = usd
      }
      const content = body.format ? 'synthetic export' : JSON.stringify({ status: status === 200 ? 'success' : 'error', message: status === 200 ? '' : 'MT5 data not ready', data: result })
      await send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [
        { name: 'Content-Type', value: body.format ? 'text/csv' : 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
        { name: 'Access-Control-Allow-Headers', value: '*' },
        { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, OPTIONS' },
      ], body: Buffer.from(content).toString('base64') })
    }
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Browser.setDownloadBehavior', { behavior: 'deny' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('access_token', 'synthetic-test-token');
    localStorage.setItem('user_data', JSON.stringify({id:14, username:'calculator-test', rights:['set_percentage','manage_rules']}));
  ` })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await delay(50) }
    throw new Error(`Timed out: ${expression}\n${await evaluate("document.body.innerText.slice(-2500)")}\nRecent calls: ${JSON.stringify(calls.slice(-3))}`)
  }
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)} && !button.disabled).click()`)
  const setInput = (label, value) => evaluate(`(() => { const element = document.querySelector('[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', {bubbles:true})); })()`)
  const select = (label, value) => evaluate(`(() => { const element = document.querySelector('select[aria-label="${label}"]'); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('change', {bubbles:true})); })()`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: origin + '/brokerage-calculator' })
  await waitFor(`document.querySelector('table[aria-label="Final Report"] tbody tr')`)
  assert.equal(await evaluate(`document.querySelectorAll('[role="tab"]').length`), 4)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).filter(button => /^Export/.test(button.textContent.trim())).length`), 1)
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('header button')).some(button => button.textContent.trim() === 'Export')`))
  assert.ok(await evaluate(`document.querySelector('[aria-label="Table controls"] input[aria-label="Search login or name"]') !== null`))
  assert.equal(await evaluate(`document.querySelector('header input[aria-label="Search login or name"]')`), null)
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('[aria-label="Calculator controls"]')).display`), 'grid')
  assert.ok(await evaluate(`Array.from(document.querySelector('[aria-label="Calculator controls"]').children).every(control => control.getBoundingClientRect().height === 40 && getComputedStyle(control).fontSize === '12px' && getComputedStyle(control).fontWeight === '500')`), 'Header controls share height and typography')
  assert.ok(await evaluate(`(() => { const controls = document.querySelector('[aria-label="Calculator controls"]'); return controls.scrollWidth <= controls.clientWidth + 1 })()`), 'Header controls fit without horizontal scrolling')
  assert.equal(await evaluate(`document.body.textContent.includes('Weekly live MT5 brokerage and LD rebate. All report totals are in INR.')`), false)
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('9,195.00')`), 'Uses server summary, not the visible page sum')
  assert.ok(await evaluate(`document.querySelector('main').textContent.includes('75.00%')`))
  assert.ok(await evaluate(`document.body.textContent.includes('From Week 41: confirm or change.')`))
  assert.ok(await evaluate(`document.querySelector('table[aria-label="Final Report"] tbody').textContent.includes('-150.00')`))
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('table[aria-label="Final Report"] tbody tr')).find(row => row.textContent.includes('543610')).querySelectorAll('td')[4].textContent`), '—')
  assert.equal(await evaluate(`document.querySelectorAll('td.bg-red-50').length`), 2)
  await evaluate(`document.querySelector('[aria-label="Exchange details for 543602"]').click()`)
  await waitFor(`document.querySelector('table[aria-label="Exchange Detail"]')`)
  assert.ok(await evaluate(`document.querySelector('table[aria-label="Exchange Detail"]').textContent.includes('broker')`))
  console.log('PASS final report, global totals, nulls, negative amounts, warnings and expansion')

  await click('Exchange Detail')
  await waitFor(`document.querySelector('table[aria-label="Exchange Detail"]')`)
  await click('Exchange View')
  await waitFor(`document.querySelector('table[aria-label="Exchange View"]')`)
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('table[aria-label="Exchange View"] th')).map(cell => cell.textContent)`), ['Login', 'Client', 'NSE', 'COMEX', 'MCX', 'Total rebate INR', 'Status'])
  await click('Pending')
  await waitFor(`document.querySelector('table[aria-label="Pending issues"]')`)
  assert.ok(await evaluate(`document.body.textContent.includes('first 1,000 issues')`))
  assert.ok(await evaluate(`document.body.textContent.includes('Contact support')`))
  await evaluate(`Array.from(document.querySelectorAll('table[aria-label="Pending issues"] tbody tr')).find(row => row.textContent.includes('MCX')).querySelector('button').click()`)
  await waitFor(`document.querySelector('[aria-label="Login 1"]')`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="Login 1"]').value`), '543610')
  assert.equal(await evaluate(`document.querySelector('[aria-label="Exchange 1"]').value`), 'MCX')
  await setInput('Rate 1', '0')
  await select('Method 1', 'lot')
  await click('Save rates')
  await waitFor(`!document.querySelector('[role="dialog"]') && document.querySelector('table[aria-label="Pending issues"]')`)
  assert.deepEqual(calls.filter(call => call.path.endsWith('/client-rates') && call.method === 'PUT').at(-1).body, { rates: [{ login: 543610, exchange: 'MCX', method: 'lot', rate: 0 }] })
  console.log('PASS four tabs, pending truncation/support and preselected zero-rate fix')

  const headerBeforeUsd = await evaluate(`Array.from(document.querySelectorAll('[aria-label="Calculator controls"] > *, header button[title="Export matching records as CSV"]')).map(element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })`)
  await evaluate(`Array.from(document.querySelectorAll('table[aria-label="Pending issues"] tbody tr')).find(row => row.textContent.includes('COMEX')).querySelector('button').click()`)
  await waitFor(`document.activeElement?.getAttribute('aria-label') === 'USD-INR rate'`)
  assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Calculator controls"] > *, header button[title="Export matching records as CSV"]')).map(element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })`), headerBeforeUsd, 'Editing USD-INR does not move header controls')
  assert.equal(await evaluate(`document.querySelector('[role="dialog"]').getAttribute('aria-labelledby')`), 'usd-rate-title')
  await setInput('USD-INR rate', '0')
  await click('Save USD-INR')
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('greater than zero')`)
  assert.ok(await evaluate(`document.querySelector('[role="dialog"] [role="alert"]') !== null`), 'USD validation is visible inside the dialog')
  assert.equal(calls.filter(call => call.path.endsWith('/usd-inr') && call.method === 'PUT').length, 0)
  await setInput('USD-INR rate', '84')
  await click('Save USD-INR')
  await waitFor(`document.querySelector('[aria-label="Edit USD-INR rate"]')?.textContent.includes('84.00')`)
  assert.equal(calls.filter(call => call.path.endsWith('/usd-inr') && call.method === 'PUT').at(-1).body.rate, 84)
  console.log('PASS USD fix focus, positive validation and save/recalculate')

  await click('Exchange Rates')
  await waitFor(`document.querySelector('[aria-label="Rate 3"]')`)
  assert.equal(await evaluate(`document.querySelector('[aria-label="Method 3"]').value`), '')
  assert.equal(await evaluate(`document.querySelector('[aria-label="Rate 3"]').value`), '')
  await setInput('Rate 2', '6')
  await click('Save rates')
  await waitFor(`!document.querySelector('[role="dialog"]')`)
  assert.deepEqual(calls.filter(call => call.path.endsWith('/exchanges') && call.method === 'PUT').at(-1).body,
    { exchanges: [{ exchange: 'COMEX', method: 'lot', rate: 6, currency: 'USD' }] })
  await click('Client Rates')
  await waitFor(`document.querySelector('[aria-label="Client rate settings"] tbody tr')`)
  await click('Use broker defaults')
  await click('Save rates')
  await waitFor(`!document.querySelector('[role="dialog"]')`)
  assert.deepEqual(calls.filter(call => call.path.endsWith('/client-rates') && call.method === 'PUT').at(-1).body,
    { rates: [{ login: 543602, exchange: 'NSE', method: null, rate: null }] })
  console.log('PASS changed-only exchange writes and client override removal')

  await click('Final Report')
  await waitFor(`document.querySelector('table[aria-label="Final Report"]')`)
  await evaluate(`document.querySelector('button[aria-label="Next page"]').click()`)
  await waitFor(`document.querySelector('[aria-label="Table controls"]').textContent.includes('2/ 3') && document.querySelector('table[aria-label="Final Report"]')`)
  await setInput('Search login or name', 'Sample')
  await waitFor(`document.querySelector('[aria-label="Table controls"]').textContent.includes('1/ 3') && document.querySelector('table[aria-label="Final Report"]')`)
  await select('Status', 'ready')
  await waitFor(`document.querySelector('table[aria-label="Final Report"]')`)
  await click('Export')
  await delay(100)
  assert.deepEqual(calls.filter(call => call.body.format).at(-1).body, { week_id: 42, search: 'Sample', status: 'ready', format: 'csv', view: 'logins' })
  await click('Exchange View')
  await click('Export')
  await delay(100)
  assert.equal(calls.filter(call => call.body.format).at(-1).body.view, 'exchanges')
  assert.equal(calls.filter(call => call.body.format).at(-1).body.format, 'csv')
  assert.ok(calls.filter(call => call.path.includes('brokerage-calculator')).every(call => call.path.startsWith('/api/broker/')))
  console.log('PASS pagination reset and full matching-scope exports using broker routes only')

  reportFailure = true
  await click('Recalculate')
  await waitFor(`document.querySelector('[role="alert"]')?.textContent.includes('MT5 data not ready')`)
  assert.equal(await evaluate(`document.querySelector('table[aria-label="Exchange View"]')`), null)
  reportFailure = false
  await click('Retry report')
  await waitFor(`document.querySelector('table[aria-label="Exchange View"]')`)
  console.log('PASS API error display, stale report removal and retry')

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true })
  await delay(150)
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), 'Mobile page fits viewport')
  await click('Exchange Rates')
  await waitFor(`document.querySelector('[role="dialog"]')`)
  assert.ok(await evaluate(`document.querySelector('[role="dialog"]').getBoundingClientRect().right <= innerWidth`), 'Mobile modal fits viewport')
  await evaluate(`document.querySelector('button[aria-label="Close rate settings"]').click()`)
  await click('Menu')
  await waitFor(`document.querySelector('button[aria-label="Close menu"]')`)
  assert.ok(await evaluate(`Array.from(document.querySelectorAll('aside')).every(el => !el.textContent.includes('Brokerage Calculator'))`), 'Calculator is hidden from desktop and mobile navigation')
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions))
  console.log('PASS mobile report, rate modal and navigation; no uncaught browser exceptions')
} finally {
  if (send && ws?.readyState === WebSocket.OPEN) await send('Browser.close').catch(() => {})
  ws?.close()
  browser.kill()
  await new Promise(done => server.close(done))
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
