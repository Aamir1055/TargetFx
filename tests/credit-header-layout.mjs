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
  let authenticated = true
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
      if (new URL(request.url).pathname === '/api/broker/credit') response = { status: 'success', data: { credit_limit: 100000, available_credit: 57000, live_data: true } };
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
  for (const width of [375, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 })
    for (const route of ['/positions', '/reports/deposit-withdrawal', '/bills', '/settings', '/client-dashboard-c']) {
      await send('Page.navigate', { url: origin + route })
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`Array.from(document.querySelectorAll('[aria-label="Broker credit"]')).some(el => el.getBoundingClientRect().height > 0)`)) break
        await delay(100)
      }
      const boxes = await evaluate(`Array.from(document.querySelectorAll('[aria-label="Broker credit"]')).filter(el => el.getBoundingClientRect().height > 0).map(el => {const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,text:el.textContent,inSidebar:!!el.closest('aside')};})`)
      assert.equal(boxes.length, 1, `${route} ${width}: exactly one visible credit header`)
      assert.ok(boxes[0].top >= 0 && boxes[0].bottom < 350, `${route} ${width}: credit is at top`)
      assert.ok(boxes[0].left >= 0 && boxes[0].right <= width + 1, `${route} ${width}: fits viewport`)
      assert.equal(boxes[0].inSidebar, false)
      assert.ok(boxes[0].text.includes('57,000.00'))
      console.log(`PASS ${route} at ${width}px`)
    }
  }
  await send('Browser.close')
} finally {
  ws?.close()
  browser.kill()
  server.close()
}
