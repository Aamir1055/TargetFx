import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, extname } from 'node:path'

// Real Chromium layout checks with synthetic Telegram identity and API responses.
const root = resolve('dist')
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
  if (!path.startsWith(root)) { res.writeHead(403).end(); return }
  try {
    const file = extname(path) ? path : join(root, 'index.html')
    const body = await readFile(file)
    const type = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[extname(file)] || 'text/html'
    res.writeHead(200, { 'Content-Type': type }).end(body)
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = await mkdtemp(join(tmpdir(), 'brokereye-layout-'))
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
const delay = ms => new Promise(r => setTimeout(r, ms))
let ws
try {
  let port
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break } catch { await delay(100) }
  }
  assert.ok(port, 'Chrome debugging endpoint started')
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let id = 0
  const pending = new Map()
  let authenticated = false
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id
    pending.set(next, { resolve, reject })
    ws.send(JSON.stringify({ id: next, method, params }))
  })
  ws.addEventListener('message', async ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.id) {
      const call = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) call?.reject(new Error(msg.error.message)); else call?.resolve(msg.result)
    } else if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params
      if (request.url.startsWith(origin)) return void send('Fetch.continueRequest', { requestId })
      const broker = { id: 14, username: 'layout-test', rights: ['set_percentage', 'manage_rules'] }
      let response = authenticated
        ? { status: 'success', data: request.url.includes('/auth/')
          ? { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', broker }
          : { clients: [], groups: [], total: 0, pagination: { total: 0, total_pages: 1 } } }
        : { status: 'error', message: 'Link your Telegram account to continue.' }
      const rows = Array.from({ length: 30 }, (_, i) => ({ Login: 9000 + i, Name: 'Layout test', TotalBrokerage: 100, TotalGrossAmount: 200, TotalNetAmount: 100,
        AgentCommission: 20, Exchanges: [{ Exchange: 'Test exchange', Commission: 100, Lots: 10, Volume: 1000 }] }))
      if (authenticated && request.url.includes('settlement-weeks')) response = { status: 'success', data: { weeks: [{ id: 1, name: 'WEEK 20 Sep 2026', start_date: '2026-09-13', end_date: '2026-09-20' }] } }
      if (authenticated && request.url.includes('bills/summary')) response = { status: 'success', data: { bills: rows, pagination: { total: 30, total_pages: 1 }, totals: { TotalBrokerage: 3000, TotalGrossAmount: 6000, TotalNetAmount: 3000 } } }
      if (authenticated && request.url.includes('exchange-data')) response = { status: 'success', data: { Clients: rows, pagination: { total: 30, total_pages: 1 } } }
      const body = request.url.includes('/api/') ? JSON.stringify(response) : ''
      await send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Content-Type', value: request.url.includes('/api/') ? 'application/json' : 'application/javascript' }],
        body: Buffer.from(body).toString('base64') })
    }
  })
  await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const events = {};
    window.Telegram = { WebApp: { initData: 'synthetic-test-data', viewportStableHeight: innerHeight,
      ready() {}, expand() {}, onEvent(name, fn) { events[name] = fn }, offEvent(name) { delete events[name] } } };
    window.resizeTelegram = height => { window.Telegram.WebApp.viewportStableHeight = height; events.viewportChanged?.({ isStateStable: true }) };
  ` })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  for (const [width, height] of [[320, 568], [375, 480], [390, 844], [667, 375]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await send('Page.navigate', { url: origin + '/m/login' })
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#mobile-password')`)) break
      await delay(100)
    }
    assert.ok(await evaluate(`!!document.querySelector('#mobile-password')`), 'Login rendered')
    assert.ok(await evaluate(`document.querySelector('.mobile-login').scrollWidth <= innerWidth`), `${width}: no horizontal overflow`)
    assert.ok(await evaluate(`getComputedStyle(document.querySelector('#mobile-password')).fontSize === '16px'`), 'iPhone input avoids focus zoom')
    await evaluate(`document.querySelector('.mobile-login').scrollTop = 9999`)
    assert.ok(await evaluate(`document.querySelector('button[type=submit]').getBoundingClientRect().bottom <= ${height}`), `${width}: submit reachable`)
    await evaluate(`resizeTelegram(300); document.querySelector('#mobile-password').focus(); document.querySelector('.mobile-login').scrollTop = 9999`)
    assert.ok(await evaluate(`document.querySelector('.mobile-login').clientHeight === 300`), 'Collapsed Telegram height applied')
    assert.ok(await evaluate(`document.querySelector('button[type=submit]').getBoundingClientRect().bottom <= 300`), 'Submit reachable in keyboard-sized viewport')
    console.log(`PASS login ${width}x${height}, plus 300px Telegram viewport`)
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 600, deviceScaleFactor: 1, mobile: true })
  await evaluate(`resizeTelegram(600); document.querySelector('.mobile-login').scrollTop = 0`)
  const screenshot = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(profile, 'login.png'), Buffer.from(screenshot.data, 'base64'))
  console.log(`Screenshot: ${join(profile, 'login.png')}`)
  authenticated = true
  await send('Page.navigate', { url: origin + '/client-percentage' })
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`!!document.querySelector('[title="Show/Hide Columns"]')`)) break
    await delay(100)
  }
  assert.ok(await evaluate(`!!document.querySelector('[title="Show/Hide Columns"]')`), 'Percentage module rendered')
  await evaluate(`document.querySelector('[title="Show/Hide Columns"]').click()`)
  await delay(100)
  for (const height of [480, 300]) {
    await evaluate(`resizeTelegram(${height})`)
    const bounds = await evaluate(`(() => {
      const sheet = document.querySelector('.app-sheet');
      const list = sheet.querySelector('.overflow-y-auto');
      list.scrollTop = list.scrollHeight;
      const box = sheet.getBoundingClientRect();
      return {top: box.top, bottom: box.bottom, listHeight: list.clientHeight, lastBottom: list.querySelector('label:last-child').getBoundingClientRect().bottom};
    })()`)
    assert.ok(bounds.top >= 0 && bounds.bottom <= height, `Sheet stays inside ${height}px viewport`)
    assert.ok(bounds.listHeight > 0 && bounds.lastBottom <= height, 'Last column toggle remains reachable')
    console.log(`PASS column selector in ${height}px Telegram viewport`)
  }
  for (const route of ['/bills', '/reports/exchange']) {
    for (const width of [320, 390]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 600, deviceScaleFactor: 1, mobile: true })
      await send('Page.navigate', { url: origin + route })
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.querySelector('.report-table-scroll')?.textContent.includes('Layout test')`)) break
        await delay(100)
      }
      assert.ok(await evaluate(`document.querySelector('.report-table-scroll')?.textContent.includes('Layout test')`), 'Report rows rendered')
      await evaluate(`resizeTelegram(480)`)
      const before = await evaluate(`(() => {
        const table = document.querySelector('.report-table-scroll');
        const box = table.getBoundingClientRect();
        return { x: box.x, y: box.y, bottom: box.bottom, width: box.width, height: box.height, pageWidth: document.documentElement.scrollWidth, rootHeight: document.querySelector('#root').scrollHeight };
      })()`)
      assert.ok(before.width <= width && before.pageWidth <= width, `${route}: page does not overflow horizontally`)
      assert.ok(before.bottom <= 480 && before.height > 40, `${route}: bounded usable table height`)
      await evaluate(`const table = document.querySelector('.report-table-scroll'); table.scrollTop = 150; table.scrollLeft = 100;`)
      const after = await evaluate(`(() => {
        const table = document.querySelector('.report-table-scroll'); const box = table.getBoundingClientRect();
        return { x: box.x, y: box.y, top: table.scrollTop, left: table.scrollLeft, bodyTop: document.scrollingElement.scrollTop, rootTop: document.querySelector('#root').scrollTop, overscroll: getComputedStyle(table).overscrollBehavior };
      })()`)
      assert.equal(after.x, before.x, 'Table frame stays fixed horizontally')
      assert.equal(after.y, before.y, 'Table frame stays fixed vertically')
      assert.ok(after.top > 0 && after.left > 0, 'Table content scrolls in both directions')
      assert.equal(after.bodyTop, 0)
      assert.equal(after.rootTop, 0)
      assert.equal(after.overscroll, 'none')
      console.log(`PASS ${route} at ${width}px: stationary frame, contained two-axis scrolling`)
    }
  }
  for (const width of [390, 820]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await evaluate(`localStorage.setItem('sidebarOpen', 'true')`)
    await send('Page.navigate', { url: origin + '/settings' })
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('[aria-label="Open navigation"]')`)) break
      await delay(100)
    }
    assert.ok(await evaluate(`!!document.querySelector('[aria-label="Open navigation"]')`), 'Settings rendered')
    assert.ok(await evaluate(`!document.querySelector('.fixed.inset-0')`), 'Settings drawer starts closed despite saved desktop preference')
    await evaluate(`document.querySelector('[aria-label="Open navigation"]').click()`)
    await delay(100)
    assert.ok(await evaluate(`!!document.querySelector('.fixed.inset-0')`), 'Drawer opens on request')
    await evaluate(`Array.from(document.querySelectorAll('.fixed.inset-0 button')).find(b => b.textContent.trim() === 'Settings').click()`)
    await delay(100)
    assert.ok(await evaluate(`!document.querySelector('.fixed.inset-0')`), 'Selecting Settings closes its drawer')
    console.log(`PASS Settings sidebar at ${width}px: starts closed and closes on navigation`)
  }
  await send('Browser.close')
} finally {
  ws?.close()
  browser.kill()
  server.close()
}
