import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../src/contexts/AuthContext.jsx', import.meta.url), 'utf8')
const { code } = transformSync(source, { loader: 'jsx', format: 'cjs' })
const success = {
  status: 'success',
  data: { access_token: 'test-access', refresh_token: 'test-refresh', broker: { id: 14 } }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

// Exercise provider state and effects with deterministic hook scheduling and mocked APIs.
function mount({ initData = 'signed-launch-data', stored = {}, login = async () => success } = {}) {
  const slots = []
  const effects = []
  let cursor = 0
  const calls = []
  const storage = new Map(Object.entries(stored))
  const window = {
    Telegram: { WebApp: { initData, close: () => calls.push(['close']) } },
    location: { origin: 'https://example.test', href: '' },
    dispatchEvent() {}
  }
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (_type, props) => props.value,
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      return slots[index] ??= { current: initial }
    },
    useEffect(fn) { effects.push(fn) }
  }
  const authAPI = {
    telegramLogin: async (...args) => { calls.push(['login', ...args]); return login() },
    telegramLink: async (...args) => { calls.push(['link', ...args]); return success },
    logout: async () => { calls.push(['logout']) },
    login: async () => ({ status: 'error', message: 'Invalid credentials' })
  }
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => name === 'react' ? react : { authAPI, scheduleTokenRefresh() {}, cancelTokenRefresh() {} },
    window, console: { log() {}, error() {}, warn() {} },
    CustomEvent: class {},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    }
  })
  function render() {
    cursor = 0
    effects.length = 0
    return module.exports.AuthProvider({ children: null })
  }
  render()
  const startup = effects[0]
  startup()
  startup() // React StrictMode replays mount effects.
  return { render, calls, storage, window }
}

test('Telegram startup runs once despite effect replay and subsequent renders', async () => {
  const app = mount()
  await settle()
  assert.equal(app.render().isAuthenticated, true)
  assert.equal(app.render().initializing, false)
  assert.equal(app.calls.length, 1)
  assert.deepEqual(app.calls[0], ['login', 'signed-launch-data'])
  assert.equal(app.storage.get('refresh_token'), 'test-refresh')
})

test('unlinked Telegram user settles on login and can link with credentials', async () => {
  const app = mount({ login: async () => { throw { response: { status: 404, data: { message: 'Not linked' } } } } })
  await settle()
  const auth = app.render()
  assert.equal(auth.isAuthenticated, false)
  assert.equal(auth.initializing, false)
  assert.equal(auth.loading, false)
  assert.equal(auth.authError, 'Not linked')
  await auth.telegramLink('signed-launch-data', 'test-broker', 'test-password')
  assert.equal(app.render().isAuthenticated, true)
  assert.deepEqual(app.calls.map(call => call[0]), ['login', 'link'])
  assert.deepEqual(app.calls[1], ['link', 'signed-launch-data', 'test-broker', 'test-password'])
})

test('logout closes Telegram without signing back in, and reopening auto-authenticates', async () => {
  const app = mount()
  await settle()
  const auth = app.render()
  await Promise.all([auth.logout(), auth.logout()])
  assert.equal(app.render().isAuthenticated, false)
  assert.equal(app.render().initializing, false)
  assert.equal(app.window.location.href, '')
  assert.deepEqual(app.calls.map(call => call[0]), ['login', 'logout', 'close'])
  assert.equal(app.storage.has('access_token'), false)
  assert.equal(app.storage.has('refresh_token'), false)
  assert.equal(app.storage.has('user_data'), false)

  const reopened = mount({ stored: Object.fromEntries(app.storage) })
  await settle()
  assert.equal(reopened.render().isAuthenticated, true)
  assert.deepEqual(reopened.calls.map(call => call[0]), ['login'])
})

test('failed Telegram login clears cached identity and does not retry on renders', async () => {
  const app = mount({
    stored: { access_token: 'old', refresh_token: 'old-refresh', user_data: '{"id":99}' },
    login: async () => { throw new Error('Network unavailable') }
  })
  await settle()
  for (let i = 0; i < 5; i++) {
    assert.equal(app.render().isAuthenticated, false)
    assert.equal(app.render().initializing, false)
  }
  assert.equal(app.calls.length, 1)
  assert.equal(app.storage.has('access_token'), false)
})

test('browser session restores even when Telegram SDK is loaded without initData', async () => {
  const app = mount({ initData: '', stored: { access_token: 'saved', user_data: '{"id":14}' } })
  await settle()
  assert.equal(app.render().isAuthenticated, true)
  assert.equal(app.calls.length, 0)
  await app.render().logout()
  assert.equal(app.render().isAuthenticated, false)
  assert.equal(app.window.location.href, 'https://example.test/login')
})

test('invalid browser credentials do not return app to its startup loading screen', async () => {
  const app = mount({ initData: '' })
  await settle()
  await app.render().login('test', 'wrong')
  assert.equal(app.render().initializing, false)
  assert.equal(app.render().isAuthenticated, false)
  assert.equal(app.render().authError, 'Invalid credentials')
})
