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
  } catch {}
}

const doLogout = () => {
  cancelTokenRefresh()
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_data')
  if (typeof window !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('auth:logout')) } catch {}
    window.location.href = '/login'
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
      api.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`
      ibApi.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`
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
    const response = await api.post('/api/auth/broker/login', {
      username,
      password
    })
    return response.data
  },

  // Verify 2FA code
  verify2FA: async (tempToken, code) => {
    const response = await api.post('/api/auth/broker/verify-2fa', {
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
    const response = await api.post('/api/auth/logout')
    return response.data
  }
}

// Broker API endpoints
export const brokerAPI = {
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
      } catch (e) {
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

  // Get latest deals (for live dealing page) via POST /api/broker/deals/search
  // Server-side pagination: ONE call per page. Caller passes `page` (1-based).
  getAllDeals: async (from, to, limit = 100, page = 1) => {
    const pageLimit = Math.min(limit || 100, 100)
    const body = {
      from,
      to,
      page,
      limit: pageLimit,
      sortBy: 'deal_time',
      sortOrder: 'desc'
    }
    if (DEBUG_LOGS) console.log(`[API] POST /api/broker/deals/search page=${page} limit=${pageLimit}`)
    const response = await api.post('/api/broker/deals/search', body)
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
  getMarginCallClients: async () => {
    const response = await api.get('/api/broker/clients/margin-call')
    return response.data
  },

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
    const response = await api.post('/api/broker/clients/search', payload, options)
    return response
  },

  // Get unique field values for column filters with search
  getClientFields: async (params, options = {}) => {
    const response = await api.get('/api/broker/clients/fields', { params, ...options })
    return response
  }
}

// Also export these methods on default api for backwards compatibility
api.getIBEmails = brokerAPI.getIBEmails
api.getIBMT5Accounts = brokerAPI.getIBMT5Accounts

export default api
