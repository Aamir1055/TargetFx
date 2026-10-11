import { createContext, useContext } from 'react'

const DataContext = createContext()

export const useData = () => {
  const context = useContext(DataContext)
  if (!context) {
    // Provide a resilient, no-crash fallback with sensible defaults.
    // This preserves the UI if a subtree renders outside the provider
    // (e.g., during lazy routes, portals mounted early, or test mounts),
    // while surfacing a clear console warning for developers.
    if (typeof window !== 'undefined') {
       
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

export default DataContext
