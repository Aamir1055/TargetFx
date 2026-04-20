/**
 * Worker Pool Manager
 * Manages multiple Web Workers for parallel processing
 */

class WorkerManager {
  constructor(options = {}) {
    const { statsPoolSize = 2, filterPoolSize = 1 } = options
    this.statsPoolSize = statsPoolSize
    this.filterPoolSize = filterPoolSize
    this.statsWorkers = []
    this.filterWorkers = []
    this.availableStats = []
    this.availableFilters = []
    this.taskQueue = []
    this.requestId = 0
    this.pendingRequests = new Map()
    this.isInitialized = false
    
    this.init()
  }
  
  /**
   * Initialize worker pool
   */
  init() {
    try {
      // Stats workers
      for (let i = 0; i < this.statsPoolSize; i++) {
        const w = new Worker(new URL('../workers/statsWorker.js', import.meta.url), { type: 'module' })
        w.onmessage = (e) => this.handleWorkerMessage(w, e, 'stats')
        w.onerror = (err) => this.handleWorkerError(w, err, 'stats')
        this.statsWorkers.push(w)
        this.availableStats.push(w)
      }
      // Filter/sort workers
      for (let i = 0; i < this.filterPoolSize; i++) {
        const w = new Worker(new URL('../workers/filterWorker.js', import.meta.url), { type: 'module' })
        w.onmessage = (e) => this.handleWorkerMessage(w, e, 'filter')
        w.onerror = (err) => this.handleWorkerError(w, err, 'filter')
        this.filterWorkers.push(w)
        this.availableFilters.push(w)
      }
      this.isInitialized = true
      console.log(`[WorkerManager] Initialized ${this.statsPoolSize} stats workers and ${this.filterPoolSize} filter workers`)
    } catch (error) {
      console.error('[WorkerManager] Failed to initialize workers:', error)
      this.isInitialized = false
    }
  }
  
  /**
   * Handle messages from workers
   */
  handleWorkerMessage(worker, event, pool) {
    const { type, requestId, result, error, taskType } = event.data
    
    if (type === 'READY') {
      console.log('[WorkerManager] Worker ready')
      return
    }
    
    if (type === 'SUCCESS') {
      const request = this.pendingRequests.get(requestId)
      if (request) {
        request.resolve(result)
        this.pendingRequests.delete(requestId)
      }
    } else if (type === 'ERROR') {
      const request = this.pendingRequests.get(requestId)
      if (request) {
        request.reject(new Error(error.message))
        this.pendingRequests.delete(requestId)
      }
    }
    
    // Mark worker as available and process next task
    if (pool === 'stats') {
      if (!this.availableStats.includes(worker)) this.availableStats.push(worker)
    } else {
      if (!this.availableFilters.includes(worker)) this.availableFilters.push(worker)
    }
    this.processNextTask()
  }
  
  /**
   * Handle worker errors
   */
  handleWorkerError(worker, error, pool) {
    console.error('[WorkerManager] Worker error:', error)
    if (pool === 'stats') {
      if (!this.availableStats.includes(worker)) this.availableStats.push(worker)
    } else {
      if (!this.availableFilters.includes(worker)) this.availableFilters.push(worker)
    }
  }
  
  /**
   * Execute task in worker pool
   */
  async execute(type, payload, priority = 0) {
    if (!this.isInitialized) {
      console.warn('[WorkerManager] Workers not initialized, falling back to main thread')
      return this.fallbackExecution(type, payload)
    }
    
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId
      
      const task = {
        requestId,
        type,
        payload,
        priority,
        resolve,
        reject
      }
      
      this.pendingRequests.set(requestId, { resolve, reject })
      this.taskQueue.push(task)
      
      // Sort by priority (higher priority first)
      this.taskQueue.sort((a, b) => b.priority - a.priority)
      
      this.processNextTask()
    })
  }
  
  /**
   * Process next task in queue
   */
  processNextTask() {
    if (this.taskQueue.length === 0) return
    // Check head of queue and dispatch to appropriate pool
    const idx = 0
    const task = this.taskQueue.splice(idx, 1)[0]
    const isStatsTask = task.type === 'CALCULATE_STATS'
    const pool = isStatsTask ? this.availableStats : this.availableFilters
    if (!pool || pool.length === 0) {
      // No worker available for this type; requeue at end and try later
      this.taskQueue.push(task)
      return
    }
    const worker = pool.shift()
    worker.postMessage({ type: task.type, payload: task.payload, requestId: task.requestId })
  }
  
  /**
   * Fallback execution on main thread if workers fail
   */
  fallbackExecution(type, payload) {
    console.warn('[WorkerManager] Executing on main thread:', type)
    
    // Simple fallback - won't be as performant but prevents errors
    switch (type) {
      case 'CALCULATE_STATS':
        return this.calculateStatsSync(payload.clients)
      case 'FILTER_SORT_DEDUP': {
        // Minimal main-thread fallback using simple JS
        let processed = (payload.clients || []).slice()
        // No-op filter here to keep it light; UI already has a JS path
        if (payload.sortConfig && payload.sortConfig.column) {
          const { column, direction } = payload.sortConfig
          processed.sort((a, b) => {
            const av = a[column]; const bv = b[column]
            if (av == null && bv == null) return 0
            if (av == null) return direction === 'asc' ? 1 : -1
            if (bv == null) return direction === 'asc' ? -1 : 1
            const an = Number(av); const bn = Number(bv)
            if (!isNaN(an) && !isNaN(bn) && typeof av !== 'string') return direction === 'asc' ? an - bn : bn - an
            const as = String(av).toLowerCase(); const bs = String(bv).toLowerCase()
            if (as < bs) return direction === 'asc' ? -1 : 1
            if (as > bs) return direction === 'asc' ? 1 : -1
            return 0
          })
        }
        // Dedup
        const seen = new Set(); const out = []
        for (let i = 0; i < processed.length; i++) {
          const c = processed[i]; if (!c) continue
          const k = c.login ?? c.clientID ?? c.mqid
          if (k == null || k === '' || !seen.has(k)) { if (k) seen.add(k); out.push(c) }
        }
        return { clients: out, count: out.length }
      }
      case 'FILTER_CLIENTS':
        return payload.clients // Return as-is for now
      default:
        return null
    }
  }
  
  /**
   * Synchronous stats calculation (fallback)
   */
  calculateStatsSync(clients) {
    const stats = {
      totalClients: clients.length,
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
      totalDeposit: 0,
      netDW: 0
    }
    
    clients.forEach(c => {
      if (!c) return
      stats.totalBalance += (c.balance || 0)
      stats.totalCredit += (c.credit || 0)
      stats.totalEquity += (c.equity || 0)
      stats.totalPnl += (c.pnl || 0)
      stats.totalProfit += (c.profit || 0)
      stats.dailyDeposit += (c.dailyDeposit || 0)
      stats.dailyWithdrawal += (c.dailyWithdrawal || 0)
  // Use backend-provided PnL buckets directly (no sign inversion)
  stats.dailyPnL += (c.dailyPnL || 0)
  stats.thisWeekPnL += (c.thisWeekPnL || 0)
  stats.thisMonthPnL += (c.thisMonthPnL || 0)
  stats.lifetimePnL += (c.lifetimePnL || 0)
      stats.totalDeposit += (c.dailyDeposit || 0)
    })
    
    stats.netDW = stats.dailyDeposit - stats.dailyWithdrawal
    
    return stats
  }
  
  /**
   * Get worker pool status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      totalWorkers: this.statsWorkers.length + this.filterWorkers.length,
      availableStats: this.availableStats.length,
      availableFilters: this.availableFilters.length,
      queuedTasks: this.taskQueue.length,
      pendingRequests: this.pendingRequests.size
    }
  }
  
  /**
   * Terminate all workers
   */
  terminate() {
    this.statsWorkers.forEach(w => w.terminate())
    this.filterWorkers.forEach(w => w.terminate())
    this.statsWorkers = []
    this.filterWorkers = []
    this.availableStats = []
    this.availableFilters = []
    this.taskQueue = []
    this.pendingRequests.clear()
    this.isInitialized = false
    console.log('[WorkerManager] All workers terminated')
  }
}

// Create singleton instance with separate pools
const workerManager = new WorkerManager({ statsPoolSize: 2, filterPoolSize: 1 })

export default workerManager
