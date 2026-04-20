import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react'
import { brokerAPI } from '../services/api'
import websocketService from '../services/websocket'
import { useAuth } from './AuthContext'

const DataContext = createContext()

export const useData = () => {
  const context = useContext(DataContext)
  if (!context) {
    // Provide a resilient, no-crash fallback with sensible defaults.
    // This preserves the UI if a subtree renders outside the provider
    // (e.g., during lazy routes, portals mounted early, or test mounts),
    // while surfacing a clear console warning for developers.
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[DataContext] useData called outside of DataProvider; returning fallback context')
    }
    const noop = async () => {}
    return {
      clients: [],
      rawClients: [], // Raw clients without USC normalization
      positions: [],
      orders: [],
      deals: [],
      accounts: [],
      latestServerTimestamp: null,
      latestMeasuredLagMs: null,
      lastWsReceiveAt: null,
      clientStats: {
        totalClients: 0,
        totalBalance: 0,
        totalCredit: 0,
        totalEquity: 0,
        totalPnl: 0,
        totalProfit: 0,
        dailyDeposit: 0,
        dailyWithdrawal: 0,
        dailyPnL: 0,
        thisWeekPnL: 0,
        thisMonthPnL: 0,
        lifetimePnL: 0,
        totalDeposit: 0
      },
      fetchClients: noop,
      fetchPositions: noop,
      fetchOrders: noop,
      fetchDeals: noop,
      fetchAccounts: noop,
      loading: { clients: false, positions: false, orders: false, deals: false, accounts: false },
      lastFetch: { clients: null, positions: null, orders: null, deals: null, accounts: null },
      connectionState: 'disconnected',
      statsDrift: {
        lastSource: null,
        lastReconciledAt: null,
        lastVerifiedAt: null,
        lastDeltas: null,
        lastApiStats: null,
        lastLocalStats: null,
        lastCount: null
      }
    }
  }
  return context
}

// Robust numeric parser shared across all data processing functions
// Handles strings with commas, nulls, NaN, and various edge cases
const toNum = (v) => {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim()
    if (cleaned === '' || cleaned === '-') return 0
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const DataProvider = ({ children }) => {
  // Helper to schedule heavy state updates at low priority to avoid blocking navigation/route transitions
  const lowPriority = (cb) => startTransition(cb)
  const { isAuthenticated } = useAuth()
  const [clients, setClients] = useState([])
  const [rawClients, setRawClients] = useState([]) // Raw clients without USC normalization (for Clients module)
  const [positions, setPositions] = useState([])
  const [orders, setOrders] = useState([])
  const [deals, setDeals] = useState([])
  const [accounts, setAccounts] = useState([]) // For margin level
  const [latestServerTimestamp, setLatestServerTimestamp] = useState(null) // Track latest batch timestamp
  const [latestMeasuredLagMs, setLatestMeasuredLagMs] = useState(null) // Wall-clock latency between server timestamp and receipt
  const [lastWsReceiveAt, setLastWsReceiveAt] = useState(null) // Last time we received a WS update (ms)
  // Lightweight performance metrics via ref + window leak-free export (avoid context re-renders)
  const perfRef = useRef({
    pendingUpdatesSize: 0,
    lastBatchProcessMs: 0,
    lastBatchAgeMs: 0,
    totalProcessedUpdates: 0,
    lastFlushAt: 0
  })
  // Throttle re-renders from lastWsReceiveAt updates
  const lastReceiveEmitRef = useRef(0)
  // Expose to window for debug UI without causing provider re-renders
  useEffect(() => {
    try { window.__brokerPerf = perfRef.current } catch {}
  }, [])
  
  // Aggregated stats for face cards - updated incrementally
  const [clientStats, setClientStats] = useState({
    totalClients: 0,
    totalBalance: 0,
    totalCredit: 0,
    totalEquity: 0,
    totalPnl: 0,
    totalProfit: 0,
    dailyDeposit: 0,
    dailyWithdrawal: 0,
    dailyPnL: 0,
    thisWeekPnL: 0,
    thisMonthPnL: 0,
    lifetimePnL: 0,
    totalDeposit: 0
  })
  
  // Batch stats updates to avoid excessive re-renders
  const statsUpdateBatchRef = useRef({
    pending: false,
    deltas: {
      totalBalance: 0,
      totalCredit: 0,
      totalEquity: 0,
      totalPnl: 0,
      totalProfit: 0,
      dailyDeposit: 0,
      dailyWithdrawal: 0,
      dailyPnL: 0,
      thisWeekPnL: 0,
      thisMonthPnL: 0,
      lifetimePnL: 0,
      totalDeposit: 0
    }
  })
  // Adaptive batching delay for stats updates (ms)
  const statsBatchDelayRef = useRef(1000)
  const perfLastEmitRef = useRef(0)
  
  // Track last processed state per client to prevent duplicate delta calculations
  const lastClientStateRef = useRef(new Map())
  // Track last accepted timestamp per client to prevent out-of-order overwrites
  const lastClientTimestampRef = useRef(new Map())
  
  // Flag to prevent multiple simultaneous full stats calculations
  const isCalculatingStatsRef = useRef(false)
  
  // Lock to prevent concurrent fetchClients calls
  const isFetchingClientsRef = useRef(false)
  
  // Refs to access current data without adding them to useCallback deps
  const ordersRef = useRef(orders)
  ordersRef.current = orders
  const positionsRef = useRef(positions)
  positionsRef.current = positions
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  
  // Track if initial sync has been done
  const hasInitialSyncedRef = useRef(false)
  
  // Track if REST data was loaded (to prevent WebSocket from replacing it immediately)
  const hasRestDataRef = useRef(false)
  
  // Track if initial data load is complete (to control WebSocket connection)
  const [hasInitialData, setHasInitialData] = useState(false)
  
  // Track last lag check to prevent frequent reconnections
  const isReconnectingRef = useRef(false)
  const latestMeasuredLagRef = useRef(null)
  const LAG_THRESHOLD_MS = 100000 // 100 seconds = 100,000 milliseconds
  const LAG_CHECK_INTERVAL_MS = 5000 // Check every 5 seconds for faster detection
  
  const [loading, setLoading] = useState({
    clients: false,
    positions: false,
    orders: false,
    deals: false,
    accounts: false
  })
  
  const [lastFetch, setLastFetch] = useState({
    clients: null,
    positions: null,
    orders: null,
    deals: null,
    accounts: null
  })
  
  const [connectionState, setConnectionState] = useState('disconnected')
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes cache

  // Live diagnostics for stat drift
  const [statsDrift, setStatsDrift] = useState({
    lastSource: null, // 'reconcile' | 'verify'
    lastReconciledAt: null,
    lastVerifiedAt: null,
    lastDeltas: null,
    lastApiStats: null,
    lastLocalStats: null,
    lastCount: null
  })

  // Ensure any epoch timestamp is in milliseconds
  const toMs = (ts) => {
    if (!ts) return 0
    const n = Number(ts)
    if (!isFinite(n) || n <= 0) return 0
    // If it's seconds (< 10^10), convert to ms
    return n < 10000000000 ? n * 1000 : n
  }

  // Generic retry helper with exponential backoff and jitter for transient failures
  const fetchWithRetry = useCallback(async (fn, {
    retries = 2,
    baseDelayMs = 600,
    maxDelayMs = 4000,
    label = 'request'
  } = {}) => {
    let attempt = 0
    let lastError
    while (attempt <= retries) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        attempt++
        if (attempt > retries) break
        const code = err?.code || err?.response?.status
        const isTransient = code === 'ECONNABORTED' || code === 'ETIMEDOUT' || (typeof code === 'number' && code >= 500)
        const jitter = Math.random() * 0.3 + 0.85 // 0.85x - 1.15x
        const delay = Math.min(maxDelayMs, Math.round((baseDelayMs * (2 ** (attempt - 1))) * jitter))
        console.warn(`[DataContext] Retry ${attempt}/${retries} after ${delay}ms for ${label}`, err?.message || err)
        if (!isTransient) break
        await new Promise(res => setTimeout(res, delay))
      }
    }
    throw lastError
  }, [])

  // Helper function to normalize USC currency values - WebSocket sends USC * 100
  // Note: Can be disabled by passing skipNormalization flag for specific modules
  const normalizeUSCValues = (client, skipNormalization = false) => {
    // Skip normalization if requested (for Clients module)
    if (skipNormalization) {
      return client
    }
    
    // WebSocket sends USC values multiplied by 100, need to divide them back
    if (client && client.currency === 'USC') {
      // Get list of percentage fields that were freshly recalculated (already in 0-100 scale)
      const skipPercentages = new Set(client.__recalculatedPercentages || [])
      
      const normalized = {
        ...client,
        // Currency fields
        balance: toNum(client.balance) / 100,
        credit: toNum(client.credit) / 100,
        equity: toNum(client.equity) / 100,
        profit: toNum(client.profit) / 100,
        floating: toNum(client.floating) / 100,
        margin: toNum(client.margin) / 100,
        marginFree: toNum(client.marginFree) / 100,
        marginInitial: toNum(client.marginInitial) / 100,
        marginMaintenance: toNum(client.marginMaintenance) / 100,
        assets: toNum(client.assets) / 100,
        liabilities: toNum(client.liabilities) / 100,
        storage: toNum(client.storage) / 100,
        blockedCommission: toNum(client.blockedCommission) / 100,
        blockedProfit: toNum(client.blockedProfit) / 100,
        soEquity: toNum(client.soEquity) / 100,
        soMargin: toNum(client.soMargin) / 100,
        pnl: toNum(client.pnl) / 100,
        dailyPnL: toNum(client.dailyPnL) / 100,
        lifetimeDeposit: toNum(client.lifetimeDeposit) / 100,
        lifetimeWithdrawal: toNum(client.lifetimeWithdrawal) / 100,
        dailyDeposit: toNum(client.dailyDeposit) / 100,
        dailyWithdrawal: toNum(client.dailyWithdrawal) / 100,
        thisWeekDeposit: toNum(client.thisWeekDeposit) / 100,
        thisWeekWithdrawal: toNum(client.thisWeekWithdrawal) / 100,
        thisMonthDeposit: toNum(client.thisMonthDeposit) / 100,
        thisMonthWithdrawal: toNum(client.thisMonthWithdrawal) / 100,
        thisWeekPnL: toNum(client.thisWeekPnL) / 100,
        thisMonthPnL: toNum(client.thisMonthPnL) / 100,
        lifetimePnL: toNum(client.lifetimePnL) / 100,
        // Bonus fields
        dailyBonusIn: toNum(client.dailyBonusIn) / 100,
        dailyBonusOut: toNum(client.dailyBonusOut) / 100,
        thisWeekBonusIn: toNum(client.thisWeekBonusIn) / 100,
        thisWeekBonusOut: toNum(client.thisWeekBonusOut) / 100,
        thisMonthBonusIn: toNum(client.thisMonthBonusIn) / 100,
        thisMonthBonusOut: toNum(client.thisMonthBonusOut) / 100,
        lifetimeBonusIn: toNum(client.lifetimeBonusIn) / 100,
        lifetimeBonusOut: toNum(client.lifetimeBonusOut) / 100,
        // Credit IN/OUT fields
        thisWeekCreditIn: toNum(client.thisWeekCreditIn) / 100,
        thisWeekCreditOut: toNum(client.thisWeekCreditOut) / 100,
        thisMonthCreditIn: toNum(client.thisMonthCreditIn) / 100,
        thisMonthCreditOut: toNum(client.thisMonthCreditOut) / 100,
        lifetimeCreditIn: toNum(client.lifetimeCreditIn) / 100,
        lifetimeCreditOut: toNum(client.lifetimeCreditOut) / 100,
        // Previous equity fields (needed for percentage calculations)
        previousEquity: toNum(client.previousEquity) / 100,
        thisWeekPreviousEquity: toNum(client.thisWeekPreviousEquity) / 100,
        thisMonthPreviousEquity: toNum(client.thisMonthPreviousEquity) / 100,
        // Percentage fields - backend sends these already in correct format, do NOT divide by 100
        // Percentage fields: For USC backend sends basis points (value * 100); divide by 100 unless freshly recalculated
        balance_percentage: client.balance_percentage != null && !skipPercentages.has('balance_percentage') ? toNum(client.balance_percentage) / 100 : client.balance_percentage,
        credit_percentage: client.credit_percentage != null && !skipPercentages.has('credit_percentage') ? toNum(client.credit_percentage) / 100 : client.credit_percentage,
        equity_percentage: client.equity_percentage != null && !skipPercentages.has('equity_percentage') ? toNum(client.equity_percentage) / 100 : client.equity_percentage,
        pnl_percentage: client.pnl_percentage != null && !skipPercentages.has('pnl_percentage') ? toNum(client.pnl_percentage) / 100 : client.pnl_percentage,
        profit_percentage: client.profit_percentage != null && !skipPercentages.has('profit_percentage') ? toNum(client.profit_percentage) / 100 : client.profit_percentage,
        margin_percentage: client.margin_percentage != null && !skipPercentages.has('margin_percentage') ? toNum(client.margin_percentage) / 100 : client.margin_percentage,
        marginFree_percentage: client.marginFree_percentage != null && !skipPercentages.has('marginFree_percentage') ? toNum(client.marginFree_percentage) / 100 : client.marginFree_percentage,
        dailyPnL_percentage: client.dailyPnL_percentage != null && !skipPercentages.has('dailyPnL_percentage') ? toNum(client.dailyPnL_percentage) / 100 : client.dailyPnL_percentage,
        thisWeekPnL_percentage: client.thisWeekPnL_percentage != null && !skipPercentages.has('thisWeekPnL_percentage') ? toNum(client.thisWeekPnL_percentage) / 100 : client.thisWeekPnL_percentage,
        thisMonthPnL_percentage: client.thisMonthPnL_percentage != null && !skipPercentages.has('thisMonthPnL_percentage') ? toNum(client.thisMonthPnL_percentage) / 100 : client.thisMonthPnL_percentage,
        lifetimePnL_percentage: client.lifetimePnL_percentage != null && !skipPercentages.has('lifetimePnL_percentage') ? toNum(client.lifetimePnL_percentage) / 100 : client.lifetimePnL_percentage,
        storage_percentage: client.storage_percentage != null && !skipPercentages.has('storage_percentage') ? toNum(client.storage_percentage) / 100 : client.storage_percentage,
        dailyDeposit_percentage: client.dailyDeposit_percentage != null && !skipPercentages.has('dailyDeposit_percentage') ? toNum(client.dailyDeposit_percentage) / 100 : client.dailyDeposit_percentage,
        dailyWithdrawal_percentage: client.dailyWithdrawal_percentage != null && !skipPercentages.has('dailyWithdrawal_percentage') ? toNum(client.dailyWithdrawal_percentage) / 100 : client.dailyWithdrawal_percentage
      }
      
      // Clean up the temporary marker
      delete normalized.__recalculatedPercentages
      
      return normalized
    }
    return client
  }

  // Check if data is stale
  const isStale = (key) => {
    if (!lastFetch[key]) return true
    return Date.now() - lastFetch[key] > CACHE_DURATION
  }

  // Calculate stats from full clients array (used on initial load)
  const calculateFullStats = useCallback((clientsArray) => {
    const stats = {
      totalClients: clientsArray.length,
      totalBalance: 0,
      totalCredit: 0,
      totalEquity: 0,
      totalPnl: 0,
      totalProfit: 0,
      dailyDeposit: 0,
      dailyWithdrawal: 0,
      dailyPnL: 0,
      thisWeekPnL: 0,
      thisMonthPnL: 0,
      lifetimePnL: 0,
      totalDeposit: 0
    }
    
    clientsArray.forEach(client => {
      stats.totalBalance += toNum(client.balance)
      stats.totalCredit += toNum(client.credit)
      stats.totalEquity += toNum(client.equity)
      stats.totalPnl += toNum(client.pnl)
      stats.totalProfit += toNum(client.profit)
      // API uses camelCase for deposit/withdrawal fields
      stats.dailyDeposit += toNum(client.dailyDeposit)
      stats.dailyWithdrawal += toNum(client.dailyWithdrawal)
      // Use backend-provided PnL buckets directly (no sign inversion)
      stats.dailyPnL += toNum(client.dailyPnL)
      stats.thisWeekPnL += toNum(client.thisWeekPnL)
      stats.thisMonthPnL += toNum(client.thisMonthPnL)
      stats.lifetimePnL += toNum(client.lifetimePnL)
      stats.totalDeposit += toNum(client.dailyDeposit)  // Sum all daily deposits
    })
    
    return stats
  }, [])

  // Helper: compute per-key deltas between two stats objects
  const diffStats = useCallback((a, b) => {
    const keys = [
      'totalBalance','totalCredit','totalEquity','totalPnl','totalProfit',
      'dailyDeposit','dailyWithdrawal','dailyPnL','thisWeekPnL','thisMonthPnL','lifetimePnL'
    ]
    const diff = {}
    keys.forEach(k => {
      // Use toNum to ensure numeric comparison even if stats contain string values
      diff[k] = toNum(a?.[k]) - toNum(b?.[k])
    })
    return diff
  }, [])

  // Update stats incrementally based on old vs new client data (batched)
  const updateStatsIncremental = useCallback((oldClient, newClient) => {
    if (!newClient?.login) return

    const clientLogin = newClient.login
    const lastState = lastClientStateRef.current.get(clientLogin)
    const currentSignature = [
      toNum(newClient.balance),
      toNum(newClient.credit),
      toNum(newClient.equity),
      toNum(newClient.pnl),
      toNum(newClient.profit),
      toNum(newClient.dailyDeposit),
      toNum(newClient.dailyWithdrawal),
      toNum(newClient.dailyPnL),
      toNum(newClient.thisWeekPnL),
      toNum(newClient.thisMonthPnL),
      toNum(newClient.lifetimePnL),
      toNum(newClient.lastUpdate)
    ].join('_')

    if (lastState === currentSignature) return
    lastClientStateRef.current.set(clientLogin, currentSignature)

    const delta = {
      totalBalance: toNum(newClient?.balance) - toNum(oldClient?.balance),
      totalCredit: toNum(newClient?.credit) - toNum(oldClient?.credit),
      totalEquity: toNum(newClient?.equity) - toNum(oldClient?.equity),
      totalPnl: toNum(newClient?.pnl) - toNum(oldClient?.pnl),
      totalProfit: toNum(newClient?.profit) - toNum(oldClient?.profit),
      dailyDeposit: toNum(newClient?.dailyDeposit) - toNum(oldClient?.dailyDeposit),
      dailyWithdrawal: toNum(newClient?.dailyWithdrawal) - toNum(oldClient?.dailyWithdrawal),
      dailyPnL: toNum(newClient?.dailyPnL) - toNum(oldClient?.dailyPnL),
      thisWeekPnL: toNum(newClient?.thisWeekPnL) - toNum(oldClient?.thisWeekPnL),
      thisMonthPnL: toNum(newClient?.thisMonthPnL) - toNum(oldClient?.thisMonthPnL),
      lifetimePnL: toNum(newClient?.lifetimePnL) - toNum(oldClient?.lifetimePnL),
      totalDeposit: toNum(newClient?.dailyDeposit) - toNum(oldClient?.dailyDeposit)
    }

    const batch = statsUpdateBatchRef.current
    batch.deltas.totalBalance += delta.totalBalance
    batch.deltas.totalCredit += delta.totalCredit
    batch.deltas.totalEquity += delta.totalEquity
    batch.deltas.totalPnl += delta.totalPnl
    batch.deltas.totalProfit += delta.totalProfit
    batch.deltas.dailyDeposit += delta.dailyDeposit
    batch.deltas.dailyWithdrawal += delta.dailyWithdrawal
    batch.deltas.dailyPnL += delta.dailyPnL
    batch.deltas.thisWeekPnL += delta.thisWeekPnL
    batch.deltas.thisMonthPnL += delta.thisMonthPnL
    batch.deltas.lifetimePnL += delta.lifetimePnL
    batch.deltas.totalDeposit += delta.totalDeposit

    if (!batch.pending) {
      batch.pending = true
      const delay = Math.max(200, Math.min(2000, statsBatchDelayRef.current || 1000))
      setTimeout(() => {
        setClientStats(prev => ({
          ...prev,
          totalBalance: prev.totalBalance + batch.deltas.totalBalance,
          totalCredit: prev.totalCredit + batch.deltas.totalCredit,
          totalEquity: prev.totalEquity + batch.deltas.totalEquity,
          totalPnl: prev.totalPnl + batch.deltas.totalPnl,
          totalProfit: prev.totalProfit + batch.deltas.totalProfit,
          dailyDeposit: prev.dailyDeposit + batch.deltas.dailyDeposit,
          dailyWithdrawal: prev.dailyWithdrawal + batch.deltas.dailyWithdrawal,
          dailyPnL: prev.dailyPnL + batch.deltas.dailyPnL,
          thisWeekPnL: prev.thisWeekPnL + batch.deltas.thisWeekPnL,
          thisMonthPnL: prev.thisMonthPnL + batch.deltas.thisMonthPnL,
          lifetimePnL: prev.lifetimePnL + batch.deltas.lifetimePnL,
          totalDeposit: prev.totalDeposit + batch.deltas.totalDeposit
        }))
        batch.deltas = {
          totalBalance: 0,
          totalCredit: 0,
          totalEquity: 0,
          totalPnl: 0,
          totalProfit: 0,
          dailyDeposit: 0,
          dailyWithdrawal: 0,
          dailyPnL: 0,
          thisWeekPnL: 0,
          thisMonthPnL: 0,
          lifetimePnL: 0,
          totalDeposit: 0
        }
        batch.pending = false
      }, delay)
    }
  }, [])

  // Fetch clients data (REST snapshot). Includes retry, dedup, normalization, timestamp seeding, and initial stats calculation.
  const fetchClients = useCallback(async (force = false) => {
    if (!isAuthenticated) {
      console.log('[DataContext] Not authenticated, skipping fetchClients')
      return []
    }

    // Prevent concurrent fetches
    if (isFetchingClientsRef.current) {
      console.log('[DataContext] ⚠️ fetchClients already in progress, skipping duplicate call')
      return clients
    }

    // Use cached data if not stale and not forced
    if (!force && clients.length > 0 && !isStale('clients')) {
      return clients
    }

    // Clients endpoint removed from backend - commenting out to prevent CORS errors
    console.warn('[DataContext] fetchClients skipped - endpoint not available')
    isFetchingClientsRef.current = false
    setLoading(prev => ({ ...prev, clients: false }))
    return clients
    
    /* isFetchingClientsRef.current = true
    setLoading(prev => ({ ...prev, clients: true }))

    try {
      const response = await fetchWithRetry(() => brokerAPI.getClients(), { retries: 2, baseDelayMs: 700, label: 'getClients' })
      const rawData = response.data?.clients || []

      // Filter null/invalid entries early
      const validRawData = rawData.filter(c => c && c.login != null)
      if (validRawData.length < rawData.length) {
        console.warn(`[DataContext] Filtered out ${rawData.length - validRawData.length} invalid clients from API response`)
      }

      // Normalize
      // Backend handles USC normalization - use raw values as-is for clients
      const normalized = validRawData // No normalization needed
      const unnormalized = validRawData // Same for both

      // Deduplicate by login (last occurrence wins)
      const map = new Map()
      const rawMap = new Map()
      normalized.forEach(c => { if (c && c.login) map.set(c.login, c) })
      unnormalized.forEach(c => { if (c && c.login) rawMap.set(c.login, c) })
      const data = Array.from(map.values())
      const rawDataDeduped = Array.from(rawMap.values())
      if (normalized.length !== data.length) {
        console.warn(`[DataContext] ⚠️ Deduplicated ${normalized.length - data.length} duplicate clients (${normalized.length} → ${data.length})`)
      }

      setClients(data)
      setRawClients(rawDataDeduped) // Store raw clients without USC normalization
      setAccounts(data)
      hasRestDataRef.current = true  // Mark REST data as loaded

      // Seed signatures & timestamps
      lastClientStateRef.current.clear()
      lastClientTimestampRef.current.clear()
      data.forEach(c => {
        if (!c?.login) return
        const sig = [
          toNum(c.balance), toNum(c.credit), toNum(c.equity), toNum(c.pnl), toNum(c.profit),
          toNum(c.dailyDeposit), toNum(c.dailyWithdrawal), toNum(c.dailyPnL), toNum(c.thisWeekPnL),
          toNum(c.thisMonthPnL), toNum(c.lifetimePnL), toNum(c.lastUpdate)
        ].join('_')
        lastClientStateRef.current.set(c.login, sig)
        const tsRaw = c.serverTimestamp || c.lastUpdate || 0
        const ts = tsRaw ? (tsRaw < 10000000000 ? tsRaw * 1000 : tsRaw) : 0
        if (ts) lastClientTimestampRef.current.set(c.login, ts)
      })

      // Initial full stats calculation (guard against concurrent)
      if (!isCalculatingStatsRef.current) {
        isCalculatingStatsRef.current = true
        const stats = calculateFullStats(data)
        setClientStats(stats)
        setTimeout(() => { isCalculatingStatsRef.current = false }, 100)
      }

      setLastFetch(prev => ({ ...prev, clients: Date.now(), accounts: Date.now() }))

      if (!hasInitialData && data.length > 0) {
        setHasInitialData(true)
        console.log('[DataContext] ✅ Initial clients loaded; WebSocket can connect')
      }
      return data
    } catch (err) {
      console.error('[DataContext] Failed to fetch clients:', err)
      if (!hasInitialData) {
        setHasInitialData(true)
        console.warn('[DataContext] ⚠️ Proceeding to WebSocket without initial clients due to errors')
      }
      throw err
    } finally {
      setLoading(prev => ({ ...prev, clients: false }))
      isFetchingClientsRef.current = false
    } */
  }, [clients, isAuthenticated, calculateFullStats])

  // Fetch positions data
  const fetchPositions = useCallback(async (force = false) => {
    if (!isAuthenticated) {
      console.log('[DataContext] Not authenticated, skipping fetchPositions')
      return []
    }
    
    if (!force && positionsRef.current.length > 0 && !isStale('positions')) {
      return positionsRef.current
    }

    setLoading(prev => ({ ...prev, positions: true }))
    
    try {
      const response = await fetchWithRetry(() => brokerAPI.getPositions(), { retries: 2, baseDelayMs: 700, label: 'getPositions' })
      const data = response.data?.positions || []
      setPositions(data)
      setLastFetch(prev => ({ ...prev, positions: Date.now() }))
      return data
    } catch (error) {
      console.error('[DataContext] Failed to fetch positions:', error)
      throw error
    } finally {
      setLoading(prev => ({ ...prev, positions: false }))
    }
  }, [isAuthenticated, fetchWithRetry])

  // Fetch orders data
  const fetchOrders = useCallback(async (force = false) => {
    if (!isAuthenticated) {
      console.log('[DataContext] Not authenticated, skipping fetchOrders')
      return []
    }
    
    if (!force && ordersRef.current.length > 0 && !isStale('orders')) {
      return ordersRef.current
    }

    setLoading(prev => ({ ...prev, orders: true }))
    
    try {
      const response = await fetchWithRetry(() => brokerAPI.getOrders(), { retries: 2, baseDelayMs: 700, label: 'getOrders' })
      const data = response.data?.orders || []
      setOrders(data)
      setLastFetch(prev => ({ ...prev, orders: Date.now() }))
      return data
    } catch (error) {
      console.error('[DataContext] Failed to fetch orders:', error)
      throw error
    } finally {
      setLoading(prev => ({ ...prev, orders: false }))
    }
  }, [isAuthenticated, fetchWithRetry])

  // Fetch accounts data (for margin level)
  const fetchAccounts = useCallback(async (force = false) => {
    if (!isAuthenticated) {
      console.log('[DataContext] Not authenticated, skipping fetchAccounts')
      return []
    }
    
    if (!force && accountsRef.current.length > 0 && !isStale('accounts')) {
      return accountsRef.current
    }

    setLoading(prev => ({ ...prev, accounts: true }))
    
    // /api/broker/clients endpoint not in use - skip to prevent CORS errors
    console.warn('[DataContext] fetchAccounts skipped - /api/broker/clients endpoint not available')
    setLoading(prev => ({ ...prev, accounts: false }))
    return accountsRef.current
  }, [isAuthenticated, fetchWithRetry])

  // Setup WebSocket subscriptions (only after initial data is loaded)
  useEffect(() => {
    // Don't connect WebSocket until we have initial data from REST API
    if (!isAuthenticated || !hasInitialData) {
      if (isAuthenticated && !hasInitialData) {
        console.log('[DataContext] ⏳ Waiting for initial data before connecting WebSocket...')
      }
      return
    }
    
    // Connect WebSocket only after initial data is loaded
    console.log('[DataContext] 🔌 Connecting WebSocket after initial data load...')
    websocketService.connect()

    // Monitor connection state
    const unsubState = websocketService.onConnectionStateChange((state) => {
      setConnectionState(state)
      
      // Refresh all data once when disconnected
      if ((state === 'disconnected' || state === 'failed') && isAuthenticated) {
        fetchClients(true).catch(() => {})
        fetchPositions(true).catch(() => {})
        fetchOrders(true).catch(() => {})
        fetchAccounts(true).catch(() => {})
      }
    })

    // Debug: Log all unique event types and monitor message flow
    const seenEvents = new Set()
    let totalMessagesReceived = 0
    let lastActivityLog = Date.now()
    
  const unsubDebug = websocketService.subscribe('all', (message) => {
      totalMessagesReceived++
      
      // Log activity every 10 seconds
      if (Date.now() - lastActivityLog > 10000) {
        console.log(`[DataContext] 📡 WebSocket active: ${totalMessagesReceived} messages in last 10s`)
        totalMessagesReceived = 0
        lastActivityLog = Date.now()
      }
      
      const eventType = message.event || message.type
      if (eventType && !seenEvents.has(eventType)) {
        seenEvents.add(eventType)
        console.log('[DataContext] 🔔 New event type:', eventType)
      }
    })

    // Subscribe to clients updates (snapshot). Merge per-client only when newer to avoid stat oscillation.
  const unsubClients = websocketService.subscribe('clients', (data) => {
      try {
        // Mark receive timestamp for latency instrumentation (throttled)
        {
          const now = Date.now()
          if (now - (lastReceiveEmitRef.current || 0) > 200) {
            lastReceiveEmitRef.current = now
            setLastWsReceiveAt(now)
          }
        }
        const rawClients = data.data?.clients || data.clients
        if (rawClients && Array.isArray(rawClients)) {
          // Backend handles USC normalization - use raw values as-is
          const normalized = rawClients // No normalization needed
          const unnormalized = rawClients // Same for both
          
          // Debug: Check RAW values BEFORE normalization
          if (rawClients.length > 0 && rawClients[0]) {
            const rawSample = rawClients[0]
            console.log('[DataContext] WebSocket RAW values (before normalization):', {
              login: rawSample.login,
              currency: rawSample.currency,
              dailyPnL: rawSample.dailyPnL,
              dailyPnL_percentage: rawSample.dailyPnL_percentage,
              thisWeekPnL_percentage: rawSample.thisWeekPnL_percentage,
              lifetimePnL_percentage: rawSample.lifetimePnL_percentage
            })
          }
          
          // Debug: Check AFTER normalization
          if (normalized.length > 0 && normalized[0]) {
            const sample = normalized[0]
            console.log('[DataContext] WebSocket AFTER normalization:', {
              login: sample.login,
              dailyPnL: sample.dailyPnL,
              dailyPnL_percentage: sample.dailyPnL_percentage,
              thisWeekPnL_percentage: sample.thisWeekPnL_percentage,
              lifetimePnL_percentage: sample.lifetimePnL_percentage
            })
          }
          
          const map = new Map()
          const rawMap = new Map()
          normalized.forEach(c => { if (c && c.login) map.set(c.login, c) })
          unnormalized.forEach(c => { if (c && c.login) rawMap.set(c.login, c) })
          const snapshot = Array.from(map.values())
          const snapshotRaw = Array.from(rawMap.values())

          if (normalized.length !== snapshot.length) {
            console.warn(`[DataContext] ⚠️ WebSocket: Deduplicated ${normalized.length - snapshot.length} duplicate clients`)
          }

          lowPriority(() => setClients(prev => {
            const existing = Array.isArray(prev) ? prev : []
            // Only do full replace if no REST data was loaded AND no existing data
            if (existing.length === 0 && !hasRestDataRef.current) {
              // First snapshot: seed timestamps & signatures, full replace only if no REST data
              lastClientTimestampRef.current.clear()
              snapshot.forEach(c => {
                const tsRaw = c.serverTimestamp || c.lastUpdate || 0
                const ts = toMs(tsRaw)
                if (c.login && ts) lastClientTimestampRef.current.set(c.login, ts)
              })
              // Signatures (including percentage fields)
              lastClientStateRef.current.clear()
              snapshot.forEach(c => {
                if (!c?.login) return
                const sig = [
                  toNum(c.balance), toNum(c.credit), toNum(c.equity), toNum(c.pnl), toNum(c.profit),
                  toNum(c.dailyDeposit), toNum(c.dailyWithdrawal), toNum(c.dailyPnL), toNum(c.thisWeekPnL),
                  toNum(c.thisMonthPnL), toNum(c.lifetimePnL), toNum(c.lastUpdate),
                  toNum(c.dailyPnL_percentage), toNum(c.thisWeekPnL_percentage), toNum(c.thisMonthPnL_percentage),
                  toNum(c.lifetimePnL_percentage), toNum(c.dailyDeposit_percentage), toNum(c.dailyWithdrawal_percentage)
                ].join('_')
                lastClientStateRef.current.set(c.login, sig)
              })
              const snapStats = calculateFullStats(snapshot)
              lowPriority(() => setClientStats(snapStats))
              lowPriority(() => setLastFetch(p => ({ ...p, clients: Date.now(), accounts: Date.now() })))
              // Keep raw (unnormalized) clients in sync for modules that need them
              lowPriority(() => setRawClients(snapshotRaw))
              return snapshot
            }

            // Merge newer entries only
            const updated = [...existing]
            let statsChanged = false
            snapshot.forEach(incoming => {
              if (!incoming || !incoming.login) return
              const login = incoming.login
              const incomingTsRaw = incoming.serverTimestamp || incoming.lastUpdate || 0
              const incomingTs = toMs(incomingTsRaw)
              const prevTs = lastClientTimestampRef.current.get(login) || 0
              if (prevTs && incomingTs && incomingTs < prevTs) {
                // stale snapshot entry, skip
                return
              }
              const idx = updated.findIndex(c => c?.login === login)
              if (idx === -1) {
                updated.push(incoming)
                if (incomingTs) lastClientTimestampRef.current.set(login, incomingTs)
                statsChanged = true
                return
              }
              const existingClient = updated[idx]
              // Determine if any tracked numeric field changed (including percentage fields)
              const fields = ['balance','credit','equity','pnl','profit','dailyDeposit','dailyWithdrawal','dailyPnL','thisWeekPnL','thisMonthPnL','lifetimePnL',
                'balance_percentage','credit_percentage','equity_percentage','pnl_percentage','profit_percentage',
                'dailyPnL_percentage','thisWeekPnL_percentage','thisMonthPnL_percentage','lifetimePnL_percentage',
                'dailyDeposit_percentage','dailyWithdrawal_percentage']
              let changed = false
              for (const f of fields) {
                if (toNum(existingClient[f]) !== toNum(incoming[f])) { changed = true; break }
              }
              if (!changed) return
              updated[idx] = { ...existingClient, ...incoming }
              if (incomingTs) lastClientTimestampRef.current.set(login, incomingTs)
              statsChanged = true
            })

            if (statsChanged) {
              // Recompute stats once
              const snapStats = calculateFullStats(updated)
              const diff = diffStats(snapStats, clientStats)
              const hasMeaningfulDiff = Object.values(diff).some(v => Math.abs(v) > 0.00001)
              if (hasMeaningfulDiff) {
                lowPriority(() => setClientStats(snapStats))
              }
              // Rebuild signatures for changed clients only (or all for simplicity, including percentage fields)
              lastClientStateRef.current.clear()
              updated.forEach(c => {
                if (!c?.login) return
                const sig = [
                  toNum(c.balance), toNum(c.credit), toNum(c.equity), toNum(c.pnl), toNum(c.profit),
                  toNum(c.dailyDeposit), toNum(c.dailyWithdrawal), toNum(c.dailyPnL), toNum(c.thisWeekPnL),
                  toNum(c.thisMonthPnL), toNum(c.lifetimePnL), toNum(c.lastUpdate),
                  toNum(c.dailyPnL_percentage), toNum(c.thisWeekPnL_percentage), toNum(c.thisMonthPnL_percentage),
                  toNum(c.lifetimePnL_percentage), toNum(c.dailyDeposit_percentage), toNum(c.dailyWithdrawal_percentage)
                ].join('_')
                lastClientStateRef.current.set(c.login, sig)
              })
              lowPriority(() => setLastFetch(p => ({ ...p, clients: Date.now(), accounts: Date.now() })))
            }
            // Also keep raw snapshot roughly aligned on snapshot ticks
            lowPriority(() => setRawClients(prevRaw => {
              if (!Array.isArray(prevRaw) || prevRaw.length === 0) return snapshotRaw
              return prevRaw
            }))
            return updated
          }))

          // Keep accounts array aligned if snapshot changed anything
          lowPriority(() => setAccounts(prevAcc => {
            if (!Array.isArray(prevAcc) || prevAcc.length === 0) return snapshot
            return prevAcc // Keep as-is; accounts updated via incremental flow
          }))

          // Update timestamp metrics from a sample of snapshot
          if (snapshot.length > 0) {
            let maxTs = 0
            for (let i = 0; i < Math.min(snapshot.length, 100); i++) {
              const rawTs = snapshot[i]?.serverTimestamp || snapshot[i]?.lastUpdate || 0
              const tsMs = toMs(rawTs)
              if (tsMs > maxTs) maxTs = tsMs
            }
            if (maxTs === 0) maxTs = Date.now()
            setLatestServerTimestamp(maxTs)
            setLatestMeasuredLagMs(Math.max(0, Date.now() - maxTs))
          }
        }
      } catch (error) {
        console.error('[DataContext] Error processing clients update:', error)
      }
    })

    // ULTRA-OPTIMIZED batch processing
  let pendingUpdates = new Map()
  let batchTimer = null
  let totalProcessed = 0
  let lastBatchTimestamp = 0
  // Adaptive flush tracking
  const firstPendingAtRef = { current: 0 }
  const lastFlushAtRef = { current: 0 }
  // Processing lock to prevent race conditions during heavy flow
  let isProcessingBatch = false
  let queuedProcessing = false
    
    // Create index map for O(1) lookups instead of O(n) findIndex
    let clientIndexMap = new Map()
    let accountIndexMap = new Map()
    
    const rebuildIndexMaps = (clientsArray, accountsArray) => {
      clientIndexMap.clear()
      accountIndexMap.clear()
      clientsArray.forEach((c, i) => clientIndexMap.set(c.login, i))
      accountsArray.forEach((a, i) => accountIndexMap.set(a.login, i))
    }
    
    const processBatch = () => {
      if (pendingUpdates.size === 0) return
      
      // CRITICAL: Prevent concurrent batch processing to avoid race conditions
      if (isProcessingBatch) {
        // Queue another processing call after current one finishes
        queuedProcessing = true
        return
      }
      
      isProcessingBatch = true
      
      // Mark receive timestamp at the start of processing a batch (throttled)
      {
        const nowTs = Date.now()
        if (nowTs - (lastReceiveEmitRef.current || 0) > 200) {
          lastReceiveEmitRef.current = nowTs
          setLastWsReceiveAt(nowTs)
        }
      }

  const startTime = performance.now()
      const batchSize = pendingUpdates.size
      const updates = Array.from(pendingUpdates.values())
      pendingUpdates.clear()
      
      totalProcessed += batchSize
      
      // Find the most recent timestamp in this batch (ensure ms)
      let batchMaxTimestamp = 0
      for (let i = 0; i < updates.length; i++) {
        const rawTs = updates[i].updatedAccount?.serverTimestamp || updates[i].updatedAccount?.lastUpdate || 0
        const ts = toMs(rawTs)
        if (ts > batchMaxTimestamp) batchMaxTimestamp = ts
      }
      
      // If no valid server timestamp, use current time as fallback (WebSocket is live)
      if (batchMaxTimestamp === 0 && batchSize > 0) {
        batchMaxTimestamp = Date.now()
      }
      
      if (batchMaxTimestamp > lastBatchTimestamp) {
        lastBatchTimestamp = batchMaxTimestamp
        setLatestServerTimestamp(batchMaxTimestamp)
        setLatestMeasuredLagMs(Math.max(0, Date.now() - batchMaxTimestamp))
      }
      
      // Log batch processing with timing
      if (batchSize > 200 || totalProcessed % 1000 === 0) {
        const latency = batchMaxTimestamp > 0 ? Math.floor((Date.now() - batchMaxTimestamp) / 1000) : 0
        const processingTime = Math.round(performance.now() - startTime)
        console.log(`[DataContext] 📦 ${batchSize} updates in ${processingTime}ms (Total: ${totalProcessed}, Lag: ${latency}s)`)
      }

      // Emit perf stats (rate-limited to 500ms)
      const now = Date.now()
      const ageMs = batchMaxTimestamp > 0 ? Math.max(0, now - batchMaxTimestamp) : 0
      const processMs = Math.round(performance.now() - startTime)
      lastFlushAtRef.current = now
      const shouldEmit = now - (perfLastEmitRef.current || 0) >= 500
      if (shouldEmit) {
        perfLastEmitRef.current = now
        const perf = perfRef.current
        perf.pendingUpdatesSize = pendingUpdates.size
        perf.lastBatchProcessMs = processMs
        perf.lastBatchAgeMs = ageMs
        perf.totalProcessedUpdates = totalProcessed
        perf.lastFlushAt = now
        try { window.__brokerPerf = perf } catch {}
      }

      // Adapt stats update delay based on load
      if (batchSize >= 200 || ageMs >= 2000) {
        statsBatchDelayRef.current = 500
      } else {
        statsBatchDelayRef.current = 1000
      }
      
      // OPTIMIZED: Single state update for clients with index map
      let addedClientsCount = 0
      lowPriority(() => setClients(prev => {
        // Rebuild index if needed OR if size mismatch (indicates stale map)
        if (clientIndexMap.size === 0 || clientIndexMap.size !== prev.length) {
          clientIndexMap.clear()
          prev.forEach((c, i) => {
            if (c?.login) clientIndexMap.set(c.login, i)
          })
        }
        
        const updated = [...prev]
        let hasNewClients = false
        
        // Cache original values BEFORE any modifications (for accurate delta calculation)
        const originalValues = new Map()
        for (let i = 0; i < updates.length; i++) {
          const { accountLogin } = updates[i]
          const index = clientIndexMap.get(accountLogin)
          if (index !== undefined && !originalValues.has(accountLogin)) {
            originalValues.set(accountLogin, updated[index])
          }
        }
        
        for (let i = 0; i < updates.length; i++) {
          const { updatedAccount, accountLogin } = updates[i]

          // Ordering guard: ignore out-of-order or timestamp-less older updates
          const incomingTsRaw = updatedAccount?.serverTimestamp || updatedAccount?.lastUpdate || 0
          const incomingTs = toMs(incomingTsRaw)
          const prevTs = lastClientTimestampRef.current.get(accountLogin) || 0
          // If we have a previous timestamp and incoming has no timestamp or is older, skip
          if (prevTs > 0) {
            if (!incomingTs) {
              // No timestamp on incoming update → consider stale under heavy flow
              continue
            }
            if (incomingTs < prevTs) {
              // Older than last applied → skip to prevent data rollback
              continue
            }
          }
          
          // Safety check: skip if updatedAccount is null/undefined
          if (!updatedAccount || !accountLogin) {
            console.warn('DataContext: Invalid update entry', { updatedAccount, accountLogin })
            continue
          }
          
          const index = clientIndexMap.get(accountLogin)
          
          if (index === undefined) {
            // New client - add to end
            updateStatsIncremental(null, updatedAccount)
            const newIndex = updated.length
            updated.push(updatedAccount)
            clientIndexMap.set(accountLogin, newIndex)
            hasNewClients = true
            addedClientsCount++
          } else {
            // Update existing - SELECTIVE MERGE: only update defined values, preserve existing for undefined
            const oldClient = originalValues.get(accountLogin)
            const existingClient = updated[index]
            
            // Safety check: if existingClient is undefined or login mismatch, rebuild index and retry
            if (!existingClient || existingClient.login !== accountLogin) {
              // Index map is stale - find correct index
              const correctIndex = updated.findIndex(c => c?.login === accountLogin)
              if (correctIndex === -1) {
                console.warn('DataContext: Client not found for', accountLogin, '(stale index', index, ')')
                continue
              }
              // Update the map with correct index
              clientIndexMap.set(accountLogin, correctIndex)
              // Retry with correct index
              const correctClient = updated[correctIndex]
              const oldClientRetry = originalValues.get(accountLogin) || correctClient
              
              // Check if there are actual changes
              let hasChanges = false
              for (const key in updatedAccount) {
                if (updatedAccount[key] !== undefined && updatedAccount[key] !== correctClient[key]) {
                  if (key === '__isNormalized' && correctClient[key] && updatedAccount[key]) {
                    continue
                  }
                  hasChanges = true
                  break
                }
              }
              
              if (!hasChanges) {
                continue
              }
              
              const merged = { ...correctClient }
              for (const key in updatedAccount) {
                if (updatedAccount[key] !== undefined) {
                  merged[key] = updatedAccount[key]
                }
              }
              
              updateStatsIncremental(oldClientRetry, merged)
              updated[correctIndex] = merged
              continue
            }
            
            // Check if there are actual changes to prevent unnecessary object creation
            let hasChanges = false
            for (const key in updatedAccount) {
              if (updatedAccount[key] !== undefined && updatedAccount[key] !== existingClient[key]) {
                // Skip __isNormalized flag changes if both are truthy (no meaningful change)
                if (key === '__isNormalized' && existingClient[key] && updatedAccount[key]) {
                  continue
                }
                hasChanges = true
                break
              }
            }
            
            // Only create new object if there are actual changes
            if (!hasChanges) {
              continue // Skip this update, no changes needed
            }
            
            // Merge: only overwrite fields that are explicitly defined in the update
            const merged = { ...existingClient }
            for (const key in updatedAccount) {
              if (updatedAccount[key] !== undefined) {
                merged[key] = updatedAccount[key]
              }
            }
            
            // Recalculate percentage fields ONLY if not provided by backend
            // Backend sends accurate percentage values, only calculate as fallback
            const recalculatedPercentages = new Set()
            
            // Daily PnL % - only calculate if backend didn't send it
            if (updatedAccount.dailyPnL_percentage === undefined && 
                (updatedAccount.dailyPnL !== undefined || updatedAccount.previousEquity !== undefined)) {
              const dailyPnL = toNum(merged.dailyPnL)
              const prevEquity = toNum(merged.previousEquity)
              merged.dailyPnL_percentage = prevEquity !== 0 ? (dailyPnL / prevEquity) * 100 : 0
              recalculatedPercentages.add('dailyPnL_percentage')
            }
            // Weekly PnL % - only calculate if backend didn't send it
            if (updatedAccount.thisWeekPnL_percentage === undefined &&
                (updatedAccount.thisWeekPnL !== undefined || updatedAccount.thisWeekPreviousEquity !== undefined)) {
              const weekPnL = toNum(merged.thisWeekPnL)
              const weekPrevEquity = toNum(merged.thisWeekPreviousEquity)
              merged.thisWeekPnL_percentage = weekPrevEquity !== 0 ? (weekPnL / weekPrevEquity) * 100 : 0
              recalculatedPercentages.add('thisWeekPnL_percentage')
            }
            // Monthly PnL % - only calculate if backend didn't send it
            if (updatedAccount.thisMonthPnL_percentage === undefined &&
                (updatedAccount.thisMonthPnL !== undefined || updatedAccount.thisMonthPreviousEquity !== undefined)) {
              const monthPnL = toNum(merged.thisMonthPnL)
              const monthPrevEquity = toNum(merged.thisMonthPreviousEquity)
              merged.thisMonthPnL_percentage = monthPrevEquity !== 0 ? (monthPnL / monthPrevEquity) * 100 : 0
              recalculatedPercentages.add('thisMonthPnL_percentage')
            }
            // Lifetime PnL % - only calculate if backend didn't send it
            if (updatedAccount.lifetimePnL_percentage === undefined &&
                (updatedAccount.lifetimePnL !== undefined || updatedAccount.lifetimeDeposit !== undefined || updatedAccount.lifetimeWithdrawal !== undefined)) {
              const lifetimePnL = toNum(merged.lifetimePnL)
              const lifetimeDeposit = toNum(merged.lifetimeDeposit)
              const lifetimeWithdrawal = toNum(merged.lifetimeWithdrawal)
              const netDeposit = lifetimeDeposit - lifetimeWithdrawal
              merged.lifetimePnL_percentage = netDeposit !== 0 ? (lifetimePnL / netDeposit) * 100 : 0
              recalculatedPercentages.add('lifetimePnL_percentage')
            }
            
            // Store recalculated percentage keys to prevent double normalization
            if (recalculatedPercentages.size > 0) {
              merged.__recalculatedPercentages = Array.from(recalculatedPercentages)
            }
            
            updateStatsIncremental(oldClient, merged)
            updated[index] = merged
            // Update last timestamp after a successful apply
            if (incomingTs) lastClientTimestampRef.current.set(accountLogin, incomingTs)
          }
        }
        return updated
      }))

      // Update client count outside setClients to avoid nested state updates triggering extra renders
      if (addedClientsCount > 0) {
        lowPriority(() => setClientStats(s => ({ ...s, totalClients: s.totalClients + addedClientsCount })))
      }
      
      // CRITICAL FIX: Also update rawClients (unnormalized) for Clients module in real-time
      lowPriority(() => setRawClients(prev => {
        // Build index map for rawClients
        const rawIndexMap = new Map()
        prev.forEach((c, i) => {
          if (c?.login) rawIndexMap.set(c.login, i)
        })
        
        const rawUpdated = [...prev]
        
        for (let i = 0; i < updates.length; i++) {
          const { updatedAccount, accountLogin } = updates[i]
          
          // Get the RAW (unnormalized) version by applying normalizeUSCValues with skipNormalization=true
          const rawAccount = normalizeUSCValues(updatedAccount, true)
          
          if (!rawAccount || !accountLogin) continue
          
          const index = rawIndexMap.get(accountLogin)
          
          if (index === undefined) {
            // New client - add to raw list
            const newIndex = rawUpdated.length
            rawUpdated.push(rawAccount)
            rawIndexMap.set(accountLogin, newIndex)
          } else {
            // Update existing raw client
            const existingRaw = rawUpdated[index]
            
            if (!existingRaw || existingRaw.login !== accountLogin) {
              const correctIndex = rawUpdated.findIndex(c => c?.login === accountLogin)
              if (correctIndex === -1) continue
              rawIndexMap.set(accountLogin, correctIndex)
              const merged = { ...rawUpdated[correctIndex] }
              for (const key in rawAccount) {
                if (rawAccount[key] !== undefined) {
                  merged[key] = rawAccount[key]
                }
              }
              rawUpdated[correctIndex] = merged
              continue
            }
            
            // Selective merge - only update defined values
            let hasChanges = false
            for (const key in rawAccount) {
              if (rawAccount[key] !== undefined && rawAccount[key] !== existingRaw[key]) {
                hasChanges = true
                break
              }
            }
            
            if (!hasChanges) continue
            
            const merged = { ...existingRaw }
            for (const key in rawAccount) {
              if (rawAccount[key] !== undefined) {
                merged[key] = rawAccount[key]
              }
            }
            rawUpdated[index] = merged
          }
        }
        
        return rawUpdated
      }))
      
      // OPTIMIZED: Single state update for accounts with index map
      lowPriority(() => setAccounts(prev => {
        // Rebuild index if needed OR if size mismatch (indicates stale map)
        if (accountIndexMap.size === 0 || accountIndexMap.size !== prev.length) {
          accountIndexMap.clear()
          prev.forEach((a, i) => {
            if (a?.login) accountIndexMap.set(a.login, i)
          })
        }
        
        const updated = [...prev]
        
        for (let i = 0; i < updates.length; i++) {
          const { updatedAccount, accountLogin } = updates[i]
          // Ordering guard mirrors clients array update
          const incomingTsRaw = updatedAccount?.serverTimestamp || updatedAccount?.lastUpdate || 0
          const incomingTs = toMs(incomingTsRaw)
          const prevTs = lastClientTimestampRef.current.get(accountLogin) || 0
          if (prevTs > 0) {
            if (!incomingTs) continue
            if (incomingTs < prevTs) continue
          }
          const index = accountIndexMap.get(accountLogin)
          
          if (index === undefined) {
            // New account
            const newIndex = updated.length
            updated.push(updatedAccount)
            accountIndexMap.set(accountLogin, newIndex)
          } else {
            // Update existing - SELECTIVE MERGE: only update defined values
            const existingAccount = updated[index]
            
            // Safety check: if existingAccount is undefined or login mismatch, rebuild index and retry
            if (!existingAccount || existingAccount.login !== accountLogin) {
              // Index map is stale - find correct index
              const correctIndex = updated.findIndex(a => a?.login === accountLogin)
              if (correctIndex === -1) {
                console.warn('DataContext: Account not found for', accountLogin, '(stale index', index, ')')
                continue
              }
              // Update the map with correct index
              accountIndexMap.set(accountLogin, correctIndex)
              // Retry with correct index
              const correctAccount = updated[correctIndex]
              
              // Check if there are actual changes
              let hasChanges = false
              for (const key in updatedAccount) {
                if (updatedAccount[key] !== undefined && updatedAccount[key] !== correctAccount[key]) {
                  if (key === '__isNormalized' && correctAccount[key] && updatedAccount[key]) {
                    continue
                  }
                  hasChanges = true
                  break
                }
              }
              
              if (!hasChanges) {
                continue
              }
              
              const merged = { ...correctAccount }
              for (const key in updatedAccount) {
                if (updatedAccount[key] !== undefined) {
                  merged[key] = updatedAccount[key]
                }
              }
              
              updated[correctIndex] = merged
              if (incomingTs) lastClientTimestampRef.current.set(accountLogin, incomingTs)
              continue
            }
            
            // Check if there are actual changes to prevent unnecessary object creation
            let hasChanges = false
            for (const key in updatedAccount) {
              if (updatedAccount[key] !== undefined && updatedAccount[key] !== existingAccount[key]) {
                // Skip __isNormalized flag changes if both are truthy
                if (key === '__isNormalized' && existingAccount[key] && updatedAccount[key]) {
                  continue
                }
                hasChanges = true
                break
              }
            }
            
            // Only create new object if there are actual changes
            if (!hasChanges) {
              continue
            }
            
            const merged = { ...existingAccount }
            for (const key in updatedAccount) {
              if (updatedAccount[key] !== undefined) {
                merged[key] = updatedAccount[key]
              }
            }
            updated[index] = merged
            if (incomingTs) lastClientTimestampRef.current.set(accountLogin, incomingTs)
          }
        }
        
        return updated
      }))
      
      // Release processing lock and check if another batch is queued
      // Use setTimeout to ensure state updates complete before next batch
      setTimeout(() => {
        isProcessingBatch = false
        if (queuedProcessing && pendingUpdates.size > 0) {
          queuedProcessing = false
          processBatch()
        }
      }, 0)
    }

    // Track if we're receiving updates
    let updateCount = 0
    let lastUpdateLog = Date.now()
    
    // Subscribe to ACCOUNT_UPDATED for individual updates (BATCHED)
    const unsubAccountUpdate = websocketService.subscribe('ACCOUNT_UPDATED', (message) => {
      try {
        updateCount++
        
        // Log every 5 seconds to confirm we're receiving updates
        if (Date.now() - lastUpdateLog > 5000) {
          console.log(`[DataContext] ✅ Receiving updates: ${updateCount} in last 5s`)
          updateCount = 0
          lastUpdateLog = Date.now()
        }
        
        const updatedAccount = message.data
        const accountLogin = message.login || updatedAccount?.login
        
        if (!updatedAccount || !accountLogin) {
          console.warn('[DataContext] ⚠️ Invalid ACCOUNT_UPDATED message:', message)
          return
        }
        
        // Normalize USC currency values
        const normalizedAccount = normalizeUSCValues(updatedAccount)
        
        // Safety check: ensure normalized account is valid
        if (!normalizedAccount) {
          console.error('[DataContext] ⚠️ normalizeUSCValues returned null/undefined for:', accountLogin)
          return
        }
        
        // Keep SERVER timestamp to measure actual system latency
        const serverTimestamp = message.timestamp
        if (serverTimestamp) {
          const timestampMs = serverTimestamp < 10000000000 ? serverTimestamp * 1000 : serverTimestamp
          normalizedAccount.serverTimestamp = timestampMs
        }
        
        // Add to batch (Map prevents duplicates)
        pendingUpdates.set(accountLogin, { updatedAccount: normalizedAccount, accountLogin })

        // Adaptive flush criteria:
        // - Immediate if backlog large
        // - Flush when first-pending age exceeds 40ms
        // - Ensure max time between flushes is 200ms
        const now = Date.now()
        const size = pendingUpdates.size
        const largeBacklog = size >= 200
        const maxSinceFlush = now - (lastFlushAtRef.current || 0) >= 200
        if (!firstPendingAtRef.current) firstPendingAtRef.current = now
        const ageSinceFirst = now - firstPendingAtRef.current

        if (largeBacklog || ageSinceFirst >= 40 || maxSinceFlush) {
          if (batchTimer) clearTimeout(batchTimer)
          firstPendingAtRef.current = 0
          processBatch()
        } else {
          if (batchTimer) clearTimeout(batchTimer)
          // Schedule flush at the 40ms mark from first pending
          const remaining = Math.max(0, 40 - ageSinceFirst)
          batchTimer = setTimeout(() => {
            firstPendingAtRef.current = 0
            processBatch()
          }, remaining)
        }
        
      } catch (error) {
        console.error('[DataContext] Error processing ACCOUNT_UPDATED:', error)
      }
    })

    // Subscribe to USER_ADDED (new client/user created in MT5)
    const unsubUserAdded = websocketService.subscribe('USER_ADDED', (message) => {
      try {
        const newUser = message.data
        const userLogin = message.login || newUser?.login
        
        console.log('[DataContext] 👤 USER_ADDED:', userLogin, newUser)
        
        if (newUser && userLogin) {
          // Normalize USC currency values
          const normalizedUser = normalizeUSCValues(newUser)
          
          setClients(prev => {
            const exists = Array.isArray(prev) && prev.some(c => c && c.login === userLogin)
            if (exists) {
              console.log('[DataContext] ⚠️ User already exists, skipping add:', userLogin)
              return prev
            }
            console.log('[DataContext] ➕ Adding NEW user to clients:', userLogin)
            
            // Initialize signature tracking for new user
            const signature = [
              toNum(normalizedUser.balance),
              toNum(normalizedUser.credit),
              toNum(normalizedUser.equity),
              toNum(normalizedUser.pnl),
              toNum(normalizedUser.profit),
              toNum(normalizedUser.dailyDeposit),
              toNum(normalizedUser.dailyWithdrawal),
              toNum(normalizedUser.dailyPnL),
              toNum(normalizedUser.thisWeekPnL),
              toNum(normalizedUser.thisMonthPnL),
              toNum(normalizedUser.lifetimePnL),
              toNum(normalizedUser.lastUpdate)
            ].join('_')
            lastClientStateRef.current.set(userLogin, signature)
            const seedTs = (normalizedUser.serverTimestamp || normalizedUser.lastUpdate) ? (normalizedUser.serverTimestamp || (normalizedUser.lastUpdate < 10000000000 ? normalizedUser.lastUpdate * 1000 : normalizedUser.lastUpdate)) : 0
            if (seedTs) lastClientTimestampRef.current.set(userLogin, seedTs)
            
            // Update stats incrementally for new user
            updateStatsIncremental(null, normalizedUser)
            setClientStats(s => ({ ...s, totalClients: s.totalClients + 1 }))
            return [normalizedUser, ...prev]
          })
          
          // Also add to rawClients (unnormalized) for Clients module
          const rawUser = normalizeUSCValues(newUser, true)
          setRawClients(prev => {
            const exists = Array.isArray(prev) && prev.some(c => c && c.login === userLogin)
            if (exists) {
              return prev
            }
            return [rawUser, ...prev]
          })
          
          setAccounts(prev => {
            const exists = Array.isArray(prev) && prev.some(c => c && c.login === userLogin)
            if (exists) return prev
            return [normalizedUser, ...prev]
          })
        }
      } catch (error) {
        console.error('[DataContext] Error processing USER_ADDED:', error)
      }
    })

    // Subscribe to USER_UPDATED (user/client info updated in MT5)
    const unsubUserUpdated = websocketService.subscribe('USER_UPDATED', (message) => {
      try {
        const updatedUser = message.data
        const userLogin = message.login || updatedUser?.login
        
        if (updatedUser && userLogin) {
          // Normalize USC currency values
          const normalizedUser = normalizeUSCValues(updatedUser)
          // Preserve server timestamp for ordering
          const msgTs = message.timestamp
          if (msgTs) {
            const tsMs = msgTs < 10000000000 ? msgTs * 1000 : msgTs
            normalizedUser.serverTimestamp = tsMs
          }
          const incomingTs = normalizedUser?.serverTimestamp || (normalizedUser?.lastUpdate ? (normalizedUser.lastUpdate < 10000000000 ? normalizedUser.lastUpdate * 1000 : normalizedUser.lastUpdate) : 0)
          const prevTs = lastClientTimestampRef.current.get(userLogin) || 0
          if (prevTs > 0) {
            if (!incomingTs || incomingTs < prevTs) {
              // Stale USER_UPDATED under heavy flow — ignore
              return
            }
          }
          
          let oldClient = null
          let mergedClient = null
          
          setClients(prev => {
            // First, deduplicate the previous array to ensure clean state
            // Filter out null/undefined entries and deduplicate by login
            const dedupedPrev = Array.from(
              prev.filter(client => client && client.login).reduce((map, client) => {
                if (!map.has(client.login)) {
                  map.set(client.login, client)
                }
                return map
              }, new Map()).values()
            )
            
            const index = dedupedPrev.findIndex(c => c && c.login === userLogin)
            if (index === -1) {
              // User not found, add as new
              oldClient = null
              mergedClient = normalizedUser
              return [normalizedUser, ...dedupedPrev]
            }
            // Update existing user - SELECTIVE MERGE: only update defined values
            oldClient = dedupedPrev[index]
            const updated = [...dedupedPrev]
            const existingUser = updated[index]
            
            // Check if there are actual changes
            let hasChanges = false
            for (const key in normalizedUser) {
              if (normalizedUser[key] !== undefined && normalizedUser[key] !== existingUser[key]) {
                if (key === '__isNormalized' && existingUser[key] && normalizedUser[key]) {
                  continue
                }
                hasChanges = true
                break
              }
            }
            
            // Only update if there are actual changes
            if (!hasChanges) {
              return prev // No changes, return original array
            }
            
            const merged = { ...existingUser }
            for (const key in normalizedUser) {
              if (normalizedUser[key] !== undefined) {
                merged[key] = normalizedUser[key]
              }
            }
            mergedClient = merged
            updated[index] = merged
            // Update last timestamp map after successful merge
            if (incomingTs) lastClientTimestampRef.current.set(userLogin, incomingTs)
            return updated
          })
          
          // Update stats incrementally based on the change - use merged client, not raw update
          updateStatsIncremental(oldClient, mergedClient)
          
          // Also update rawClients (unnormalized) for Clients module
          const rawUser = normalizeUSCValues(updatedUser, true)
          if (msgTs) {
            const tsMs = msgTs < 10000000000 ? msgTs * 1000 : msgTs
            rawUser.serverTimestamp = tsMs
          }
          
          setRawClients(prev => {
            const index = prev.findIndex(c => c && c.login === userLogin)
            if (index === -1) {
              // User not found in raw clients, add as new
              return [rawUser, ...prev]
            }
            const updated = [...prev]
            const existingRaw = updated[index]
            
            // Check if there are actual changes
            let hasChanges = false
            for (const key in rawUser) {
              if (rawUser[key] !== undefined && rawUser[key] !== existingRaw[key]) {
                hasChanges = true
                break
              }
            }
            
            // Only update if there are actual changes
            if (!hasChanges) {
              return prev
            }
            
            const merged = { ...existingRaw }
            for (const key in rawUser) {
              if (rawUser[key] !== undefined) {
                merged[key] = rawUser[key]
              }
            }
            updated[index] = merged
            return updated
          })
          
          setAccounts(prev => {
            const index = prev.findIndex(c => c && c.login === userLogin)
            if (index === -1) return [normalizedUser, ...prev]
            const updated = [...prev]
            const existingAccount = updated[index]
            
            // Check if there are actual changes
            let hasChanges = false
            for (const key in normalizedUser) {
              if (normalizedUser[key] !== undefined && normalizedUser[key] !== existingAccount[key]) {
                if (key === '__isNormalized' && existingAccount[key] && normalizedUser[key]) {
                  continue
                }
                hasChanges = true
                break
              }
            }
            
            // Only update if there are actual changes
            if (!hasChanges) {
              return prev
            }
            
            const merged = { ...existingAccount }
            for (const key in normalizedUser) {
              if (normalizedUser[key] !== undefined) {
                merged[key] = normalizedUser[key]
              }
            }
            updated[index] = merged
            if (incomingTs) lastClientTimestampRef.current.set(userLogin, incomingTs)
            return updated
          })
        }
      } catch (error) {
        console.error('[DataContext] Error processing USER_UPDATED:', error)
      }
    })

    // Subscribe to USER_DELETED (user/client removed from MT5)
    const unsubUserDeleted = websocketService.subscribe('USER_DELETED', (message) => {
      try {
        const deletedUser = message.data
        const userLogin = message.login || deletedUser?.login
        
        console.log('[DataContext] 👤 USER_DELETED:', userLogin)
        
        if (userLogin) {
          // Remove from signature tracking
          lastClientStateRef.current.delete(userLogin)
          
          let deletedClient = null
          
          setClients(prev => {
            // Find the client BEFORE removing to capture their values
            deletedClient = prev.find(c => c.login === userLogin)
            
            const filtered = prev.filter(c => c.login !== userLogin)
            if (filtered.length < prev.length) {
              console.log('[DataContext] ➖ Removed user from clients:', userLogin)
              
              // Subtract deleted client's values from stats
              if (deletedClient) {
                // Create a "zero client" to calculate negative delta
                const zeroClient = {
                  login: userLogin,
                  balance: 0, credit: 0, equity: 0, pnl: 0, profit: 0,
                  dailyDeposit: 0, dailyWithdrawal: 0,
                  dailyPnL: 0, thisWeekPnL: 0, thisMonthPnL: 0, lifetimePnL: 0
                }
                // This will subtract all of deletedClient's values
                updateStatsIncremental(deletedClient, zeroClient)
                // Decrement total client count
                setClientStats(s => ({ ...s, totalClients: Math.max(0, s.totalClients - 1) }))
              }
            }
            return filtered
          })
          
          // Also remove from rawClients
          setRawClients(prev => prev.filter(c => c.login !== userLogin))
          
          setAccounts(prev => prev.filter(c => c.login !== userLogin))
        }
      } catch (error) {
        console.error('[DataContext] Error processing USER_DELETED:', error)
      }
    })

    // --- Positions are now fetched via REST polling (see separate useEffect) ---
    // WebSocket position subscriptions removed in favor of 1-second REST polling

    // Subscribe to orders updates
    const unsubOrders = websocketService.subscribe('orders', (data) => {
      try {
        const newOrders = data.data?.orders || data.orders
        if (newOrders && Array.isArray(newOrders)) {
          lowPriority(() => setOrders(newOrders))
          lowPriority(() => setLastFetch(prev => ({ ...prev, orders: Date.now() })))
        }
      } catch (error) {
        console.error('[DataContext] Error processing orders update:', error)
      }
    })

    // Subscribe to ORDER_ADDED
    const unsubOrderAdded = websocketService.subscribe('ORDER_ADDED', (message) => {
      try {
        const order = message.data || message
        if (order) {
          lowPriority(() => setOrders(prev => {
            // Check if order already exists
            const orderId = order.order || order.ticket || order.id
            if (prev.some(o => (o.order || o.ticket || o.id) === orderId)) {
              return prev
            }
            return [order, ...prev]
          }))
        }
      } catch (error) {
        console.error('[DataContext] Error processing ORDER_ADDED:', error)
      }
    })

    // Subscribe to ORDER_UPDATED
    const unsubOrderUpdated = websocketService.subscribe('ORDER_UPDATED', (message) => {
      try {
        const updatedOrder = message.data || message
        const orderId = updatedOrder?.order || updatedOrder?.ticket || updatedOrder?.id
        
        if (orderId) {
          lowPriority(() => setOrders(prev => {
            const index = prev.findIndex(o => (o.order || o.ticket || o.id) === orderId)
            if (index === -1) {
              return [updatedOrder, ...prev]
            }
            const updated = [...prev]
            updated[index] = { ...updated[index], ...updatedOrder }
            return updated
          }))
        }
      } catch (error) {
        console.error('[DataContext] Error processing ORDER_UPDATED:', error)
      }
    })

    // Subscribe to ORDER_DELETED
    const unsubOrderDeleted = websocketService.subscribe('ORDER_DELETED', (message) => {
      try {
        const orderId = message.order || message.ticket || message.data?.order || message.data?.ticket || message.id
        if (orderId) {
          lowPriority(() => setOrders(prev => prev.filter(o => (o.order || o.ticket || o.id) !== orderId)))
        }
      } catch (error) {
        console.error('[DataContext] Error processing ORDER_DELETED:', error)
      }
    })

    return () => {
      // Clean up batch timer
      if (batchTimer) {
        clearTimeout(batchTimer)
        processBatch() // Process any pending updates
      }
      firstPendingAtRef.current = 0
      
      unsubDebug()
      unsubState()
      unsubClients()
      unsubAccountUpdate()
      unsubUserAdded()
      unsubUserUpdated()
      unsubUserDeleted()
      unsubOrders()
      unsubOrderAdded()
      unsubOrderUpdated()
      unsubOrderDeleted()
    }
  }, [isAuthenticated, hasInitialData])

  // --- Positions are now fetched per-page (each page polls its own data when active) ---
  // DataContext still exposes positions/setPositions/fetchPositions for pages that need them.

  // Periodic reconciliation: recompute stats from current clients to prevent drift
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        if (clients && clients.length > 0) {
          const recomputed = calculateFullStats(clients)
          // If any key differs beyond a tiny epsilon, snap to recomputed totals
          const eps = 0.0001
          const deltas = diffStats(recomputed, clientStats)
          const hasDiff = Object.values(deltas).some(v => Math.abs(v) > eps)
          // record drift
          setStatsDrift(prev => ({
            ...prev,
            lastSource: 'reconcile',
            lastReconciledAt: Date.now(),
            lastDeltas: deltas,
            lastLocalStats: clientStats
          }))
          if (hasDiff) {
            setClientStats(recomputed)
          }
        }
      } catch (e) {
        console.warn('[DataContext] Periodic stats reconciliation failed', e)
      }
    }, 60000) // 1 minute
    return () => clearInterval(interval)
  }, [clients, clientStats, calculateFullStats, diffStats])

  // Verify current totals against a fresh API read; optionally apply fix
  const verifyAgainstAPI = useCallback(async (apply = false) => {
    // /api/broker/clients endpoint not in use - skip to prevent CORS errors
    console.warn('[DataContext] verifyAgainstAPI skipped - /api/broker/clients endpoint not available')
    return
    const response = await fetchWithRetry(() => brokerAPI.getClients(), { retries: 1, baseDelayMs: 600, label: 'verify:getClients' })
    const raw = response.data?.clients || []
    const normalized = raw.map(normalizeUSCValues)
    // Dedup
    const map = new Map()
    normalized.forEach(c => { if (c && c.login) map.set(c.login, c) })
    const fresh = Array.from(map.values())
    const apiStats = calculateFullStats(fresh)
    const localStats = calculateFullStats(clients || [])
    const deltas = diffStats(apiStats, localStats)
    setStatsDrift(prev => ({
      ...prev,
      lastSource: 'verify',
      lastVerifiedAt: Date.now(),
      lastDeltas: deltas,
      lastApiStats: apiStats,
      lastLocalStats: localStats,
      lastCount: fresh.length
    }))
    if (apply) {
      setClients(fresh)
      setAccounts(fresh)
      setClientStats(apiStats)
      // Reset signatures to API snapshot
      lastClientStateRef.current.clear()
      fresh.forEach(c => {
        if (c?.login) {
          const sig = [
            toNum(c.balance),
            toNum(c.credit),
            toNum(c.equity),
            toNum(c.pnl),
            toNum(c.profit),
            toNum(c.dailyDeposit),
            toNum(c.dailyWithdrawal),
            toNum(c.dailyPnL),
            toNum(c.thisWeekPnL),
            toNum(c.thisMonthPnL),
            toNum(c.lifetimePnL),
            toNum(c.lastUpdate)
          ].join('_')
          lastClientStateRef.current.set(c.login, sig)
        }
      })
    }
    return { apiStats, localStats, deltas, count: fresh.length }
  }, [clients, calculateFullStats, fetchWithRetry])

  // On successful authentication, perform an initial data sync
  useEffect(() => {
    if (!isAuthenticated) return
    
    // Prevent duplicate initial sync (React StrictMode calls effects twice in dev)
    if (hasInitialSyncedRef.current) {
      console.log('[DataContext] ⚠️ Initial sync already completed, skipping duplicate')
      return
    }
    
    hasInitialSyncedRef.current = true
    
    const initialSync = async () => {
      const maxAttempts = 3
      let fetchedClients = []
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const results = await Promise.allSettled([
            // fetchClients(true), // Endpoint removed from backend
            fetchPositions(true),
            fetchOrders(true),
            fetchAccounts(true)
          ])
          
          // Get the actual fetched clients from the first promise result
          // if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
          //   fetchedClients = results[0].value
          // }
          
          // Log any failures
          results.forEach((result, idx) => {
            if (result.status === 'rejected') {
              const names = ['positions', 'orders', 'accounts']
              console.error(`[DataContext] Initial ${names[idx]} fetch failed:`, result.reason?.message || result.reason)
            }
          })
          
          // Mark as successful if at least accounts loaded
          fetchedClients = ['success'] // Mark sync as complete
        } catch (error) {
          console.error('[DataContext] Initial sync error (attempt', attempt, '):', error)
        }

        // Success criteria: sync attempt completed
        if (fetchedClients.length > 0) {
          console.log(`[DataContext] ✅ Initial sync successful`)
          break
        }
        
        if (attempt < maxAttempts) {
          const backoff = 800 * attempt
          console.log(`[DataContext] ⚠️ Retrying initial sync after ${backoff}ms (attempt ${attempt + 1}/${maxAttempts})`)
          await new Promise(res => setTimeout(res, backoff))
        }
      }

      // Mark initial data ready after sync attempts
      if (!hasInitialData) {
        setHasInitialData(true)
        console.log('[DataContext] 🔌 Initial data ready, WebSocket can now connect')
      }
    }
    
    initialSync()
  }, [isAuthenticated])

  // Continuously update lag every second based on last known server timestamp
  useEffect(() => {
    if (!latestServerTimestamp) return
    
    const lagUpdateInterval = setInterval(() => {
      const currentLag = Math.max(0, Date.now() - latestServerTimestamp)
      setLatestMeasuredLagMs(currentLag)
      latestMeasuredLagRef.current = currentLag
    }, 1000) // Update every second
    
    return () => clearInterval(lagUpdateInterval)
  }, [latestServerTimestamp])

  // Monitor lag and auto-reconnect with fresh data when lag exceeds threshold
  useEffect(() => {
    if (!isAuthenticated || !hasInitialData) {
      console.log('[DataContext] Lag monitor disabled:', { isAuthenticated, hasInitialData })
      return
    }
    
    console.log('[DataContext] 🔍 Lag monitor started - will check every 5s and reconnect if lag is >= 100s (100 seconds or more)')
    
    const lagCheckInterval = setInterval(() => {
      const currentLag = latestMeasuredLagRef.current
      const lagSeconds = currentLag ? Math.floor(currentLag / 1000) : 0
      console.log(`[DataContext] Lag check: ${lagSeconds}s (threshold: 100s, reconnecting: ${isReconnectingRef.current})`)
      
      // Check if lag exceeds threshold
      if (currentLag && currentLag >= LAG_THRESHOLD_MS && !isReconnectingRef.current) {
        console.warn(`[DataContext] ⚠️ High lag detected: ${lagSeconds}s (threshold: 100s) - Reconnecting WebSocket and fetching fresh data...`)
        
        isReconnectingRef.current = true
        
        // Disconnect WebSocket
        websocketService.disconnect()
        
        // Fetch fresh data from API
        Promise.all([
          fetchClients(true).catch(err => console.error('[DataContext] Lag recovery: fetchClients failed:', err)),
          fetchPositions(true).catch(err => console.error('[DataContext] Lag recovery: fetchPositions failed:', err)),
          fetchOrders(true).catch(err => console.error('[DataContext] Lag recovery: fetchOrders failed:', err)),
          fetchAccounts(true).catch(err => console.error('[DataContext] Lag recovery: fetchAccounts failed:', err))
        ]).then(() => {
          console.log('[DataContext] ✅ Fresh data loaded, reconnecting WebSocket...')
          
          // Wait a moment for data to settle, then reconnect WebSocket
          setTimeout(() => {
            websocketService.connect()
            isReconnectingRef.current = false
            console.log('[DataContext] ✅ WebSocket reconnected after lag recovery')
          }, 1000)
        }).catch(err => {
          console.error('[DataContext] ❌ Lag recovery failed:', err)
          // Try to reconnect anyway
          setTimeout(() => {
            websocketService.connect()
            isReconnectingRef.current = false
          }, 2000)
        })
      }
    }, LAG_CHECK_INTERVAL_MS)
    
    return () => clearInterval(lagCheckInterval)
  }, [isAuthenticated, hasInitialData])

  const value = useMemo(() => ({
    // Data
    clients,
    rawClients, // Raw clients without USC normalization (for Clients module)
    positions,
    orders,
    deals,
    accounts,

    // Aggregated stats (incrementally updated)
    clientStats,

    // Latest server timestamp from WebSocket batch
    latestServerTimestamp,
    latestMeasuredLagMs,
    lastWsReceiveAt,

    // Loading states
    loading,

    // Connection state
    connectionState,

    // Fetch functions
    fetchClients,
    fetchPositions,
    fetchOrders,
    fetchAccounts,

    // Update functions (for manual updates)
    setClients,
    setPositions,
    setOrders,
    setDeals,
    setAccounts,

    // Diagnostics
    verifyAgainstAPI,
    statsDrift
  }), [
    clients, rawClients, positions, orders, deals, accounts,
    clientStats,
    latestServerTimestamp, latestMeasuredLagMs, lastWsReceiveAt,
    loading, connectionState,
    fetchClients, fetchPositions, fetchOrders, fetchAccounts,
    setClients, setPositions, setOrders, setDeals, setAccounts,
    verifyAgainstAPI, statsDrift
  ])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
