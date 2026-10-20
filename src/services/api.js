import { normalizeAccountTypes, accountTypeApiValue, accountTypeSearchPayload } from '../utils/accountType'
import axios from 'axios'
const DEBUG_LOGS = import.meta?.env?.VITE_DEBUG_LOGS === 'true'

// Base URL: force empty in dev (use Vite proxy), allow override or default in prod
const BASE_URL = import.meta?.env?.DEV
  ? ''
  : (import.meta?.env?.VITE_API_BASE_URL || 'https://api.brokereye.app')
if (DEBUG_LOGS) console.log('[API] Base URL:', BASE_URL || '(empty - using Vite proxy)')

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // Increased to 30 seconds for slow endpoints
})

// A raw axios instance without interceptors, used for token refresh to avoid loops
const rawApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// IB endpoints use different domain (https://brokereye.app without api. subdomain)
const ibApi = axios.create({
  baseURL: 'https://brokereye.app',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})
if (DEBUG_LOGS) console.log('[API] IB Base URL (hardcoded):', 'https://brokereye.app')

// Refresh handling state
let isRefreshing = false
let refreshPromise = null
let refreshTimer = null

// Decode JWT expiry without a library
const getTokenExp = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp // seconds since epoch
  } catch {
    return null
  }
}

// Schedule a proactive refresh ~60s before the access token expires.
// Called after login and after each successful refresh.
export const scheduleTokenRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer)

  const token = localStorage.getItem('access_token')
  if (!token) return

  const exp = getTokenExp(token)
  if (!exp) return

  const now = Math.floor(Date.now() / 1000)
  const secsLeft = exp - now
  const refreshIn = Math.max(0, (secsLeft - 60) * 1000) // 60s safety margin

  console.log(`[API] ⏰ Proactive refresh in ${Math.round(refreshIn / 1000)}s (token expires in ${secsLeft}s)`)

  refreshTimer = setTimeout(() => {
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = doRefresh()
    }
    refreshPromise.catch(() => {}) // errors handled inside doRefresh
  }, refreshIn)
}

export const cancelTokenRefresh = () => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

const broadcastTokenRefreshed = (accessToken) => {
  try {
    window.dispatchEvent(new CustomEvent('auth:token_refreshed', { detail: { accessToken } }))
  } catch { /* Retain the fallback when this operation is unavailable. */ }
}

const doLogout = () => {
  cancelTokenRefresh()
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_data')
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('auth:logout')) } catch { /* Retain the fallback when this operation is unavailable. */ }
    window.location.replace('/login')
  }
}

const doRefresh = () => {
  const refresh_token = localStorage.getItem('refresh_token')
  if (!refresh_token) return Promise.reject(new Error('No refresh token'))

  console.log('[API] 🔄 Initiating token refresh...')
  return rawApi
    .post('/api/auth/broker/refresh', { refresh_token })
    .then((res) => {
      const data = res.data
      const newAccess = data?.data?.access_token || data?.access_token
      if (!newAccess) throw new Error('No access_token in refresh response')
      const newRefresh = data?.data?.refresh_token || data?.refresh_token
      localStorage.setItem('access_token', newAccess)
      if (newRefresh) localStorage.setItem('refresh_token', newRefresh) // handle rotating tokens
      broadcastTokenRefreshed(newAccess)
      console.log('[API] ✅ Token refreshed successfully')
      scheduleTokenRefresh() // schedule next refresh
      return newAccess
    })
    .catch((err) => {
      console.error('[API] ❌ Token refresh failed:', err?.message)
      doLogout()
      throw err
    })
    .finally(() => {
      isRefreshing = false
      // Don't null refreshPromise here — let concurrent waiters consume the resolved/rejected value
    })
}

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Mirror auth header for IB API
ibApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    if (response.config?.url?.includes('/clients') || response.config?.url?.includes('/accounts')) {
      response.data = normalizeAccountTypes(response.data)

    }
    return response
  },
  async (error) => {
    // Suppress noise from cancelled requests (component unmount, dep change, etc.)
    if (axios.isCancel?.(error) || error?.code === 'ERR_CANCELED' || error?.message === 'canceled') {
      return Promise.reject(error)
    }
    if (DEBUG_LOGS) {
      const errInfo = {
        message: error.message,
        code: error.code,
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        status: error.response?.status,
        responseDataSnippet: typeof error.response?.data === 'string' ? error.response.data.slice(0,200) : error.response?.data
      }
      console.warn('[API] Axios error captured:', errInfo)
    }
    const originalRequest = error.config
    const status = error?.response?.status

    if (!error.response) {
      console.warn('[API] Error without response object:', error.message)
    }

    // Only attempt refresh on 401 (not 403, not network errors without response)
    const hasRefresh = !!localStorage.getItem('refresh_token')
    const alreadyRetried = originalRequest?._retry

    if (status === 401 && hasRefresh && !alreadyRetried) {
      originalRequest._retry = true

      try {
        if (!isRefreshing) {
          isRefreshing = true
          refreshPromise = doRefresh()
        }

        const token = await refreshPromise

        // Retry original request with new token
        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers['Authorization'] = `Bearer ${token}`
        console.log('[API] 🔁 Retrying original request after refresh:', originalRequest?.url)
        return api(originalRequest)
      } catch (refreshErr) {
        return Promise.reject(refreshErr)
      }
    }

    return Promise.reject(error)
  }
)

// Reuse the same refresh logic for IB API
ibApi.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isCancel?.(error) || error?.code === 'ERR_CANCELED' || error?.message === 'canceled') {
      return Promise.reject(error)
    }
    if (DEBUG_LOGS) {
      const errInfo = {
        message: error.message,
        code: error.code,
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        status: error.response?.status,
        responseDataSnippet: typeof error.response?.data === 'string' ? error.response.data.slice(0,200) : error.response?.data
      }
      console.warn('[IB API] Axios error captured:', errInfo)
    }
    const originalRequest = error.config
    const status = error?.response?.status
    const hasRefresh = !!localStorage.getItem('refresh_token')
    const alreadyRetried = originalRequest?._retry

    if (status === 401 && hasRefresh && !alreadyRetried) {
      originalRequest._retry = true
      try {
        if (!isRefreshing) {
          isRefreshing = true
          refreshPromise = doRefresh()
        }

        const token = await refreshPromise

        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers['Authorization'] = `Bearer ${token}`
        return ibApi(originalRequest)
      } catch (refreshErr) {
        return Promise.reject(refreshErr)
      }
    }
    return Promise.reject(error)
  }
)

// Auth API endpoints
export const authAPI = {
  // Get current broker profile (rights/permissions)
  getMe: async () => {
    const response = await api.get('/api/auth/broker/me')
    return response.data
  },

  // Login
  login: async (username, password) => {
    const response = await rawApi.post('/api/auth/broker/login', {
      username,
      password
    })
    return response.data
  },

  // Verify 2FA code
  verify2FA: async (tempToken, code) => {
    const response = await rawApi.post('/api/auth/broker/verify-2fa', {
      temp_token: tempToken,
      code
    })
    return response.data
  },

  // Setup 2FA
  setup2FA: async () => {
    const response = await api.post('/api/auth/broker/2fa/setup')
    return response.data
  },

  // Enable 2FA
  enable2FA: async (code, backupCodes) => {
    const response = await api.post('/api/auth/broker/2fa/enable', {
      code,
      backup_codes: backupCodes
    })
    return response.data
  },

  // Get 2FA status
  get2FAStatus: async () => {
    const response = await api.get('/api/auth/broker/2fa/status')
    return response
  },

  // Disable 2FA
  disable2FA: async (password) => {
    const response = await api.post('/api/auth/broker/2fa/disable', {
      password
    })
    return response.data
  },

  // Regenerate backup codes
  regenerateBackupCodes: async (password) => {
    const response = await api.post('/api/auth/broker/2fa/backup-codes', {
      password
    })
    return response.data
  },

  // Refresh token (use rawApi to avoid interceptor recursion)
  refreshToken: async (refreshToken) => {
    const response = await rawApi.post('/api/auth/broker/refresh', {
      refresh_token: refreshToken
    })
    return response.data
  },

  // Logout
  logout: async () => {
    const token = localStorage.getItem('access_token')
    const response = await rawApi.post('/api/auth/logout', undefined, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    return response.data
  },

  // Telegram login
  telegramLogin: async (initData) => {
    const response = await rawApi.post('/api/auth/broker/telegram/login', {
      init_data: initData
    })
    return response.data
  },

  // Telegram link (self-register)
  telegramLink: async (initData, username, password) => {
    const response = await rawApi.post('/api/auth/broker/telegram/link', {
      init_data: initData,
      username,
      password
    })
    return response.data
  }
}

// Broker API endpoints
export const brokerAPI = {
  getAgentDetailsReport: async (body, options = {}) => {
    const response = await api.post('/api/broker/reports/agent-details', body, options)
    return response.data
  },
  getDepositWithdrawalReport: async (body, options = {}) => {
    const response = await api.post('/api/broker/reports/deposit-withdrawal', body, options)
    return response.data
  },
  getCreditReport: async (body, options = {}) => {
    const response = await api.post('/api/broker/reports/credit', body, options)
    return response.data
  },

  // Get all clients
  getClients: async () => {
    const response = await api.get('/api/broker/clients')
    return response.data
  },

  // Get aggregated deal stats for a client (POST as provided by backend)
  getClientDealStats: async (login, from = 0, to = null) => {
    try {
      const payload = {}
      if (from != null) payload.from = from
      if (to != null) payload.to = to
      const response = await api.post(`/api/broker/clients/${login}/deals/stats`, payload)
      return response.data
    } catch (err) {
      // Fallback to GET if some installations expose it as GET
      try {
        const qs = []
        if (from != null) qs.push(`from=${from}`)
        if (to != null) qs.push(`to=${to}`)
        const q = qs.length ? `?${qs.join('&')}` : ''
        const response = await api.get(`/api/broker/clients/${login}/deals/stats${q}`)
        return response.data
      } catch {
        throw err
      }
    }
  },

  // Get aggregated deal stats for a client via GET (explicit endpoint as requested)
  getClientDealStatsGET: async (login, from = null, to = null) => {
    const qs = []
    if (from != null) qs.push(`from=${from}`)
    if (to != null) qs.push(`to=${to}`)
    const q = qs.length ? `?${qs.join('&')}` : ''
    const response = await api.get(`/api/broker/clients/${login}/deals/stats${q}`)
    return response.data
  },

  // Get all positions
  getPositions: async () => {
    const response = await api.get('/api/broker/positions')
    return response.data
  },

  // Search positions with server-side filtering, sorting, pagination, and grouping
  // Supports: page, limit, sortBy, sortOrder, search, filters[], dateFrom, dateTo,
  //           mt5Accounts[], clientNet, netPosition, groupBaseSymbol
  searchPositions: async (params = {}, options = {}) => {
    const response = await api.post('/api/broker/positions/search', params, options)
    return response.data
  },

  // Net positions per symbol, segregated by exchange (ordered by 'exchange_sort_order').
  // Body accepts the same fields as /positions/search plus optional `exchange: ['MCX', ...]`.
  // Response: data.exchanges[] { exchange, sortRank, positions[], totals }, data.totals, data.count
  getNetPositionsByExchange: async (body = {}, options = {}) => {
    const response = await api.post('/api/broker/positions/net/by-exchange', body, options)
    return response.data
  },

  // Distinct exchanges present on open positions (for the exchange filter)
  getPositionExchanges: async () => {
    const response = await api.get('/api/broker/positions/exchanges')
    return response.data
  },

  // Get all position symbols
  getPositionSymbols: async () => {
    const response = await api.get('/api/broker/positions/symbols')
    return response.data
  },

  // Get all position logins
  getPositionLogins: async () => {
    const response = await api.get('/api/broker/positions/logins')
    return response.data
  },

  // Get all position actions (for column-level filter)
  getPositionActions: async () => {
    const response = await api.get('/api/broker/positions/actions')
    return response.data
  },

  // Get all pending orders
  getOrders: async () => {
    const response = await api.get('/api/broker/orders')
    return response.data
  },

  // Search pending orders with server-side filtering, sorting, pagination
  searchOrders: async (params, options = {}) => {
    const response = await api.post('/api/broker/orders/search', params, options)
    return response.data
  },

  // Get all order symbols
  getOrderSymbols: async () => {
    const response = await api.get('/api/broker/orders/symbols')
    return response.data
  },

  // Get all order logins
  getOrderLogins: async () => {
    const response = await api.get('/api/broker/orders/logins')
    return response.data
  },

  // Get all order types (for column-level filter)
  getOrderTypes: async () => {
    const response = await api.get('/api/broker/orders/types')
    return response.data
  },

  // Get client deals with pagination support
  getClientDeals: async (login, from, to, limit = 1000, offset = 0) => {
    const endpoints = [
      `/api/broker/clients/${login}/deals?from=${from}&to=${to}&limit=${limit}&offset=${offset}`,
      `/api/broker/clients/${login}/deals?from=${from}&to=${to}&limit=${limit}`,
      `/api/broker/clients/${login}/deals?from=${from}&to=${to}`
    ]
    for (let i = 0; i < endpoints.length; i++) {
      try {
        const endpoint = endpoints[i]
        if (DEBUG_LOGS) console.log(`[API] ClientDeals attempt ${i + 1}: ${endpoint}`)
        const response = await api.get(endpoint)
        if (DEBUG_LOGS) console.log('[API] ClientDeals response length:', response.data?.data?.deals?.length || response.data?.deals?.length)
        return response.data
      } catch (err) {
        if (DEBUG_LOGS) console.warn(`[API] ClientDeals endpoint failed (${endpoints[i]}):`, err.response?.status || err.code || err.message)
      }
    }
    throw new Error('All client deals endpoint attempts failed')
  },

  // Get client deals — server-side pagination via GET
  // Returns: { data: { deals, total, page, limit, from, to, login }, message, status }
  getClientDealsPaged: async (login, from, to, page = 1, limit = 50) => {
    const response = await api.get(`/api/broker/clients/${login}/deals`, {
      params: { from, to, page, limit }
    })
    return response.data
  },

  // Search client deals via POST — /api/broker/clients/{login}/deals/search
  // Body: { search, page, limit, from, to }
  searchClientDeals: async (login, body = {}) => {
    const response = await api.post(`/api/broker/clients/${login}/deals/search`, body)
    return response.data
  },

  // Get all recent deals (for live dealing page)
  getAllDeals: async (from, to, limit = 100, page = 1, extraBody = {}, requestConfig = {}) => {
    const body = {
      from,
      to,
      page,
      limit,
      sortBy: 'time',
      sortOrder: 'desc',
      ...extraBody,
    }
    if (DEBUG_LOGS) console.log('[API] POST /api/broker/deals/search', body)
    const response = await api.post('/api/broker/deals/search', body, requestConfig)
    if (DEBUG_LOGS) console.log('[API] Response data:', response.data)
    return response.data
  },

  // Get positions by login
  getPositionsByLogin: async (login) => {
    const response = await api.get(`/api/broker/clients/${login}/positions`)
    return response.data
  },

  // Get full client overview (account info + positions + orders)
  getClientOverview: async (login) => {
    const response = await api.get(`/api/broker/clients/${login}/overview`)
    return response.data
  },

  // Get client PnL overview (profit trend)
  getClientPnlOverview: async (login, from, to) => {
    const response = await api.get(`/api/broker/clients/${login}/pnl-overview`, { params: { from, to } })
    return response.data
  },

  // Get clients in margin call (margin level page data)
  getMarginCallClients: async (params = {}, options = {}) => {
    const query = { ...params }
    if (query.liquidateType) query.liquidateType = String(query.liquidateType).split(',').map(accountTypeApiValue).join(',')
    const response = await api.get('/api/broker/clients/margin-call', { ...options, params: query })
    return response.data
  },

  // Change trading (master) password


  // Change investor password


  // Check password (type: 'trading' | 'investor')
  checkPassword: async (login, password, type = 'trading') => {
    const response = await api.post(`/api/broker/clients/${login}/check-password`, { password, type })
    return response.data
  },

  // Account & Trading access toggles





  // Saved filters (groups) - GET
  getSavedFilters: async () => {
    const response = await api.get('/api/broker/saved-filters')
    return response.data
  },

  // Saved filters (groups) - PUT (replaces entire list)
  putSavedFilters: async (filters) => {
    const response = await api.put('/api/broker/saved-filters', { filters })
    return response.data
  },

  // Get deals by login
  getDealsByLogin: async (login, limit = 1000) => {
    const response = await api.get(`/api/broker/clients/${login}/deals?limit=${limit}`)
    return response.data
  },

  // Deposit funds
  depositFunds: async (login, amount, comment) => {
    const response = await api.post(`/api/broker/clients/${login}/deposit`, {
      amount,
      comment
    })
    return response.data
  },

  // Withdraw funds
  withdrawFunds: async (login, amount, comment) => {
    const response = await api.post(`/api/broker/clients/${login}/withdrawal`, {
      amount,
      comment
    })
    return response.data
  },

  getCreditSummary: async (options = {}) => {
    const response = await api.get('/api/broker/credit', options)
    return response.data
  },
  tempCreditIn: async (login, body) => {
    const response = await api.post(`/api/broker/clients/${login}/temp-credit-in`, body)
    return response.data
  },
  tempCreditOut: async (login, body) => {
    const response = await api.post(`/api/broker/clients/${login}/temp-credit-out`, body)
    return response.data
  },

  // Credit in
  creditIn: async (login, amount, comment) => {
    const response = await api.post(`/api/broker/clients/${login}/credit-in`, {
      amount,
      comment
    })
    return response.data
  },

  // Credit out
  creditOut: async (login, amount, comment) => {
    const response = await api.post(`/api/broker/clients/${login}/credit-out`, {
      amount,
      comment
    })
    return response.data
  },

  // Get all client percentages
  getAllClientPercentages: async (params = {}) => {
    // Backend expects `limit`; translate `page_size` if callers pass it.
    const { page_size, ...rest } = params
    const finalParams = page_size != null && rest.limit == null
      ? { ...rest, limit: page_size }
      : rest
    const response = await api.get('/api/broker/clients/percentages', { params: finalParams })
    return response.data
  },

  // Get specific client percentage
  getClientPercentage: async (login) => {
    const response = await api.get(`/api/broker/clients/${login}/percentage`)
    return response.data
  },

  // Set client percentage
  setClientPercentage: async (login, percentage, comment) => {
    const response = await api.post(`/api/broker/clients/${login}/percentage`, {
      percentage,
      comment
    })
    return response.data
  },

  // Bulk update client percentages
  bulkUpdateClientPercentages: async (clients) => {
    const response = await api.put('/api/broker/clients/percentages/bulk', { clients })
    return response.data
  },

  // Auto-fill percentage ranges (CRUD)
  getAutoFillPercentages: async () => {
    const response = await api.get('/api/broker/clients/autofill-percentages')
    return response.data
  },
  createAutoFillPercentage: async ({ login_start, login_end, percentage, comment }) => {
    const response = await api.post('/api/broker/clients/autofill-percentages', {
      login_start, login_end, percentage, comment
    })
    return response.data
  },
  updateAutoFillPercentage: async (rangeId, { login_start, login_end, percentage, comment }) => {
    const response = await api.put(`/api/broker/clients/autofill-percentages/${rangeId}`, {
      login_start, login_end, percentage, comment
    })
    return response.data
  },
  deleteAutoFillPercentage: async (rangeId) => {
    const response = await api.delete(`/api/broker/clients/autofill-percentages/${rangeId}`)
    return response.data
  },

  // Get available rules
  getAvailableRules: async () => {
    const response = await api.get('/api/broker/rules')
    return response.data
  },

  // Get client rules
  getClientRules: async (login) => {
    const response = await api.get(`/api/broker/clients/${login}/rules`)
    return response.data
  },

  // Apply rule to client
  applyClientRule: async (login, ruleCode, timeParameter = null) => {
    const payload = { rule_code: ruleCode }
    if (timeParameter) {
      payload.time_parameter = timeParameter
    }
    const response = await api.post(`/api/broker/clients/${login}/rules`, payload)
    return response.data
  },

  // Remove rule from client
  removeClientRule: async (login, ruleCode) => {
    const response = await api.delete(`/api/broker/clients/${login}/rules/${ruleCode}`)
    return response.data
  },

  // Get IB commissions with pagination and search
  getIBCommissions: async (page = 1, pageSize = 50, search = '', sortBy = 'created_at', sortOrder = 'desc') => {
    let url = `/api/amari/ib/commissions?page=${page}&page_size=${pageSize}`
    if (search && search.trim()) {
      url += `&search=${encodeURIComponent(search.trim())}`
    }
    if (sortBy) {
      url += `&sort_by=${encodeURIComponent(sortBy)}`
    }
    if (sortOrder) {
      url += `&sort_order=${encodeURIComponent(sortOrder)}`
    }
    const response = await api.get(url)
    return response.data
  },

  // Get IB percentage by ID
  getIBPercentage: async (id) => {
    const response = await api.get(`/api/amari/ib/commissions/${id}/percentage`)
    return response.data
  },

  // Update IB percentage
  updateIBPercentage: async (id, percentage) => {
    const response = await api.put(`/api/amari/ib/commissions/${id}/percentage`, {
      percentage
    })
    return response.data
  },

  // Bulk update IB percentages
  bulkUpdateIBPercentages: async (updates) => {
    const response = await api.post('/api/amari/ib/commissions/percentage/bulk', {
      updates
    })
    return response.data
  },

  // Get IB commission totals
  getIBCommissionTotals: async () => {
    if (DEBUG_LOGS) console.log('[API] Fetching IB commission totals from:', api.defaults.baseURL + '/api/amari/ib/commissions/total')
    const response = await api.get('/api/amari/ib/commissions/total')
    if (DEBUG_LOGS) console.log('[API] IB commission totals response:', response.data)
    return response
  },

  // Get all IB emails
  getIBEmails: async () => {
    if (DEBUG_LOGS) console.log('[API] Fetching IB emails from:', api.defaults.baseURL + '/api/amari/ib/emails')
    const response = await api.get('/api/amari/ib/emails')
    if (DEBUG_LOGS) console.log('[API] IB emails response:', response.data)
    return response
  },

  // Get MT5 accounts for a specific IB
  getIBMT5Accounts: async (email) => {
    if (DEBUG_LOGS) console.log('[API] Fetching MT5 accounts for:', email)
    const response = await api.get(`/api/amari/ib/mt5-accounts?ib_email=${encodeURIComponent(email)}`)
    if (DEBUG_LOGS) console.log('[API] MT5 accounts response:', response.data)
    return response
  },

  // Search clients with advanced filtering, pagination, and sorting
  // Accept optional axios config (e.g., { signal, timeout }) for per-request control
  searchClients: async (payload, options = {}) => {
    const response = await api.post('/api/broker/clients/search', accountTypeSearchPayload(payload), options)
    return response
  },

  // Get unique field values for column filters with search
  getClientFields: async (params, options = {}) => {
    const response = await api.get('/api/broker/clients/fields', { params: accountTypeSearchPayload(params), ...options })
    return response
  },

  // Change broker auth password
  changeAuthPassword: async (payload) => {
    const response = await api.post('/api/auth/broker/change-password', payload)
    return response.data
  },

  // Change client trading password
  changeTradingPassword: async (login, password) => {
    const response = await api.post(`/api/broker/clients/${login}/change-trading-password`, { password })
    return response.data
  },

  // Change client investor password
  changeInvestorPassword: async (login, password) => {
    const response = await api.post(`/api/broker/clients/${login}/change-investor-password`, { password })
    return response.data
  },

  // Check client password (type: 'trading' | 'investor')
  checkClientPassword: async (login, type, password) => {
    const response = await api.post(`/api/broker/clients/${login}/check-password`, { type, password })
    return response.data
  },

  // Enable / Disable account (Account & Trading access toggles)
  enableAccount: async (login) => {
    const response = await api.post(`/api/broker/clients/${login}/enable-account`)
    return response.data
  },
  disableAccount: async (login) => {
    const response = await api.post(`/api/broker/clients/${login}/disable-account`)
    return response.data
  },

  // Enable / Disable trading
  enableTrading: async (login) => {
    const response = await api.post(`/api/broker/clients/${login}/enable-trading`)
    return response.data
  },
  disableTrading: async (login) => {
    const response = await api.post(`/api/broker/clients/${login}/disable-trading`)
    return response.data
  },

  // Bills - Get list of settlement weeks
  getSettlementWeeks: async (params = {}) => {
    const response = await api.get('/api/broker/settlement-weeks', { params })
    return response.data
  },

  // Bills - Summary for a settlement week
  getBillsSummary: async (payload = {}, options = {}) => {
    const body = {
      week_id: payload.week_id,
      page: payload.page ?? 1,
      limit: payload.limit ?? 100,
      search: payload.search ?? '',
      mt5Accounts: payload.mt5Accounts ?? [],
      sortBy: payload.sortBy ?? 'login',
      sortOrder: payload.sortOrder ?? 'asc',
      hideZeroNet: payload.hideZeroNet ?? true,
    }
    const response = await api.post('/api/broker/bills/summary', body, options)
    return response.data
  },

  // Bills - Detailed bill data for one or more logins in a settlement week
  getBillsDetails: async (week_id, logins = [], options = {}) => {
    const response = await api.post('/api/broker/bills', { week_id, logins }, options)
    return response.data
  },

  // Reports - Exchange data for a settlement week and optional group filters
  getExchangeData: async (week_id, filters = {}, options = {}) => {
    const { from, to, page, limit, search, ...groupFilters } = filters || {}
    const body = {
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      week_id,
      ...(page ? { page } : {}),
      ...(limit ? { limit } : {}),
      ...(search ? { search } : {}),
      ...groupFilters
    }
    const response = await api.post('/api/broker/exchange-data', body, options)
    return response.data
  },

  // Reports - Historical positions for a date range
  getHistoricalPositions: async (payload = {}, options = {}) => {
    const body = {
      from: payload.from,
      to: payload.to,
      up_down_percentage: payload.up_down_percentage ?? 5,
      ...(payload.percentage === undefined ? {} : { percentage: payload.percentage }),
      page: payload.page ?? 1,
      limit: payload.limit ?? 100
    }
    const response = await api.post('/api/broker/historical-position', body, options)
    return response.data
  },

  // Reports - Client summary (balances, volume, P&L) for a date range.
  // Supports four query shapes, all against the same endpoint:
  //   - all clients:            { from, to, page, limit, sortBy, sortOrder }
  //   - active only + filtered: { ...above, hideInactive, search, filters: [{ field, operator, value }] }
  //   - specific accounts:      { from, to, page, limit, mt5Accounts: [login, ...] }
  //   - login range:            { from, to, page, limit, accountRangeMin, accountRangeMax }
  getSummaryReport: async (payload = {}, options = {}) => {
    const body = {
      from: payload.from,
      to: payload.to,
      page: payload.page ?? 1,
      limit: payload.limit ?? 100,
      sortBy: payload.sortBy ?? 'login',
      sortOrder: payload.sortOrder ?? 'asc',
    }
    if (payload.hideInactive !== undefined) body.hideInactive = payload.hideInactive
    if (payload.search) body.search = payload.search
    if (Array.isArray(payload.filters) && payload.filters.length) body.filters = payload.filters
    // Note: an explicit empty array is passed through (not dropped) — e.g. a selected login group
    // narrowed by search to zero matching logins should correctly ask the server for zero results,
    // not silently fall back to "no account filter at all".
    if (Array.isArray(payload.mt5Accounts)) body.mt5Accounts = payload.mt5Accounts
    if (payload.accountRangeMin !== undefined && payload.accountRangeMin !== null && payload.accountRangeMin !== '') body.accountRangeMin = payload.accountRangeMin
    if (payload.accountRangeMax !== undefined && payload.accountRangeMax !== null && payload.accountRangeMax !== '') body.accountRangeMax = payload.accountRangeMax
    if (DEBUG_LOGS) console.log('[API] POST /api/broker/reports/summary', body)
    const response = await api.post('/api/broker/reports/summary', body, options)
    return response.data
  },
}

// Keep browser requests same-origin by default so HTTPS deployments do not trigger mixed-content
// blocking. Set VITE_AI_API_BASE_URL only when the AI service has its own HTTPS origin.
export const AI_BASE_URL = (import.meta?.env?.VITE_AI_API_BASE_URL || '').replace(/\/+$/, '')

// "Use a token instead" (the AI page's own Broker token dialog) stores its pasted JWT under a
// dedicated key — never the main app's own `access_token` — so pasting a token here only
// affects AI requests and can't desync or log the rest of Broker Eye out of its own session.
const AI_TOKEN_OVERRIDE_KEY = 'ai_broker_token_override'
export const getAiTokenOverride = () => localStorage.getItem(AI_TOKEN_OVERRIDE_KEY) || ''
export const setAiTokenOverride = (token) => {
  const trimmed = (token || '').trim()
  if (trimmed) localStorage.setItem(AI_TOKEN_OVERRIDE_KEY, trimmed)
  else localStorage.removeItem(AI_TOKEN_OVERRIDE_KEY)
}

const aiHeaders = () => {
  const token = getAiTokenOverride() || localStorage.getItem('access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const aiRequest = async (path, options = {}) => {
  const response = await fetch(`${AI_BASE_URL}${path}`, {
    ...options,
    headers: { ...aiHeaders(), ...(options.headers || {}) }
  })
  if (!response.ok) {
    let detail = `AI service request failed (${response.status})`
    try {
      const body = await response.json()
      detail = body.detail || detail
    } catch { /* Keep the useful status fallback for non-JSON errors. */ }
    throw new Error(detail)
  }
  return response
}

// GET with query params, or POST/PUT/DELETE with a JSON body — the shared shape behind
// every simple (non-streaming, non-file) /ai/* call added below.
const aiJson = async (path, { method = 'GET', body, params } = {}) => {
  let url = path
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString()
    if (qs) url += `?${qs}`
  }
  const response = await aiRequest(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  return response.json()
}

export const aiAPI = {
  getConversations: async () => (await aiRequest('/ai/conversations')).json(),
  getMessages: async (conversationId) => (await aiRequest(`/ai/conversations/${encodeURIComponent(conversationId)}/messages`)).json(),
  getStatus: async () => (await aiRequest('/ai/status')).json(),
  // Unauthenticated: the header's "Connected · <model>" pill, same as the reference app's.
  getHealth: async () => (await aiRequest('/health')).json(),
  getMe: async () => (await aiRequest('/ai/me')).json(),
  archiveConversation: async (conversationId) => aiRequest(`/ai/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }),
  sendFeedback: async (payload) => (await aiRequest('/ai/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json(),
  confirmAction: async (actionId, body = {}) => (await aiRequest(`/ai/actions/${encodeURIComponent(actionId)}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(),
  cancelAction: async (actionId) => (await aiRequest(`/ai/actions/${encodeURIComponent(actionId)}/cancel`, { method: 'POST' })).json(),

  // Uploads (CSV/Excel/text attachments for the next message)
  uploadFile: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return (await aiRequest('/ai/uploads', { method: 'POST', body: form })).json()
  },

  // Voice input: raw audio bytes as the body, Content-Type set to the recording's actual mime type.
  // /ai/transcribe/status says whether this server can transcribe at all (the mic is hidden otherwise).
  getTranscribeStatus: async () => (await aiRequest('/ai/transcribe/status')).json(),
  transcribeAudio: async (blob) => (await aiRequest('/ai/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob })).json(),

  // Rendered chart images and other generated files — served unauthenticated via an unguessable,
  // short-lived token, so a plain <img>/<a href> works with no Authorization header.
  fileUrl: (id, filename) => `${AI_BASE_URL}/ai/files/${encodeURIComponent(id)}${filename ? `?filename=${encodeURIComponent(filename)}` : ''}`,

  // Settlement bill statement: unlike chart files this route IS authenticated, so it can't be a
  // plain <a href> — fetch it as a blob with the Bearer token and trigger the save ourselves.
  downloadBill: async (weekId, login, fmt, filename) => {
    const response = await aiRequest(`/ai/bills/${encodeURIComponent(weekId)}/${encodeURIComponent(login)}.${encodeURIComponent(fmt)}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || `bill_${weekId}_${login}.${fmt}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  },

  // Client quick-look panel (opened from a login mentioned in the chat)
  getClientPanel: async (login) => (await aiRequest(`/ai/clients/${encodeURIComponent(login)}/panel`)).json(),

  // Alerts: rules (the dialog) + events (the bell)
  getAlerts: async () => aiJson('/ai/alerts'),
  createAlert: async (payload) => aiJson('/ai/alerts', { method: 'POST', body: payload }),
  updateAlert: async (alertId, payload) => aiJson(`/ai/alerts/${encodeURIComponent(alertId)}`, { method: 'PUT', body: payload }),
  deleteAlert: async (alertId) => aiJson(`/ai/alerts/${encodeURIComponent(alertId)}`, { method: 'DELETE' }),
  getAlertEvents: async (params) => aiJson('/ai/alerts/events', { params }),
  markAlertEventsSeen: async (upToId) => aiJson('/ai/alerts/events/seen', { method: 'POST', body: { up_to_id: upToId ?? null } }),

  // Preferences ("what the assistant remembers" / Memory dialog)
  getPreferences: async () => aiJson('/ai/preferences'),
  addPreference: async (note) => aiJson('/ai/preferences', { method: 'POST', body: { note } }),
  deletePreference: async (prefId) => aiJson(`/ai/preferences/${encodeURIComponent(prefId)}`, { method: 'DELETE' }),

  // Scheduled digests (recurring automated summaries)
  getDigests: async () => aiJson('/ai/digests'),
  createDigest: async (payload) => aiJson('/ai/digests', { method: 'POST', body: payload }),
  updateDigest: async (digestId, payload) => aiJson(`/ai/digests/${encodeURIComponent(digestId)}`, { method: 'PUT', body: payload }),
  deleteDigest: async (digestId) => aiJson(`/ai/digests/${encodeURIComponent(digestId)}`, { method: 'DELETE' }),
  runDigest: async (digestId) => aiJson(`/ai/digests/${encodeURIComponent(digestId)}/run`, { method: 'POST' }),

  // Saved questions (reusable prompts) and pinned answers (a live tile on Home)
  getSaved: async () => aiJson('/ai/saved'),
  addSaved: async (title, question) => aiJson('/ai/saved', { method: 'POST', body: { title, question } }),
  deleteSaved: async (savedId) => aiJson(`/ai/saved/${encodeURIComponent(savedId)}`, { method: 'DELETE' }),
  getPins: async () => aiJson('/ai/pins'),
  addPin: async (title, question, text) => aiJson('/ai/pins', { method: 'POST', body: { title, question, text } }),
  deletePin: async (pinId) => aiJson(`/ai/pins/${encodeURIComponent(pinId)}`, { method: 'DELETE' }),
  refreshPin: async (pinId) => aiJson(`/ai/pins/${encodeURIComponent(pinId)}/refresh`, { method: 'POST' }),

  streamChat: async (payload, onEvent, signal) => {
    const response = await aiRequest('/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal
    })
    if (!response.body) throw new Error('AI service returned an empty stream')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      for (const raw of events) {
        const data = raw.split('\n').find(line => line.startsWith('data:'))?.slice(5).trim()
        if (data) onEvent(JSON.parse(data))
      }
      if (done) break
    }
  }
}

// Also export these methods on default api for backwards compatibility
api.getIBEmails = brokerAPI.getIBEmails
api.getIBMT5Accounts = brokerAPI.getIBMT5Accounts

export default api
