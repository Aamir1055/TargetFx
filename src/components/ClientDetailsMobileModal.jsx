import { useState, useEffect, useMemo, useRef } from 'react'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const formatDate = (timestamp) => {
  if (!timestamp) return '-'
  const date = new Date(timestamp * 1000)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

const formatDateToDisplay = (dateStr) => {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  const shortYear = year.slice(-2) // Get last 2 digits of year
  return `${day}/${month}/${shortYear}`
}

const formatDateToValue = (displayStr) => {
  if (!displayStr) return ''
  const [day, month, year] = displayStr.split('/')
  // Handle 2-digit year by prepending '20'
  const fullYear = year.length === 2 ? '20' + year : year
  return `${fullYear}-${month}-${day}`
}

const ClientDetailsMobileModal = ({ client, onClose, allPositionsCache, allOrdersCache = [] }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [positions, setPositions] = useState([])
  const [orders, setOrders] = useState([])
  const [netPositions, setNetPositions] = useState([])
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [positionsSearch, setPositionsSearch] = useState('')
  const [netPositionsSearch, setNetPositionsSearch] = useState('')
  const [dealsSearch, setDealsSearch] = useState('')
  // API search results for positions (overrides local filter when search is active)
  const [searchedPositions, setSearchedPositions] = useState(null)
  const [searchedOrders, setSearchedOrders] = useState(null)
  
  // Broker Rules states
  const [availableRules, setAvailableRules] = useState([])
  const [clientRules, setClientRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const { user } = useAuth()
  const [selectedTimeParam, setSelectedTimeParam] = useState({})
  
  // Funds management state
  const [operationType, setOperationType] = useState('deposit')
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const [operationLoading, setOperationLoading] = useState(false)
  const [operationSuccess, setOperationSuccess] = useState('')
  const [operationError, setOperationError] = useState('')
  
  // Date filter states for deals
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [dealsLoading, setDealsLoading] = useState(false)
  const [hasAppliedFilter, setHasAppliedFilter] = useState(false)
  const [quickFilter, setQuickFilter] = useState('Today')
  const [totalDealsCount, setTotalDealsCount] = useState(0)
  const [currentDateFilter, setCurrentDateFilter] = useState({ from: 0, to: 0 })
  
  // Refs for date inputs
  const fromDateInputRef = useRef(null)
  const toDateInputRef = useRef(null)
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(12)

  // Sorting states
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  // Column visibility states
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const [positionColumns, setPositionColumns] = useState({
    position: true,
    symbol: true,
    action: true,
    volume: true,
    priceOpen: true,
    profit: true
  })
  const [netPositionColumns, setNetPositionColumns] = useState({
    symbol: true,
    netType: true,
    volume: true,
    avgPrice: true,
    profit: true,
    positions: true
  })
  const [dealColumns, setDealColumns] = useState({
    deal: true,
    time: true,
    symbol: true,
    action: true,
    volume: true,
    profit: true
  })

  // Live account data from overview API (balance, equity, credit, floating, etc.)
  const [clientData, setClientData] = useState(() => ({ ...client }))

  // Deal stats from API
  const [dealStats, setDealStats] = useState(null)

  // Overview tab: profit trend
  const [trendRange, setTrendRange] = useState('7d')
  const [profitTrend, setProfitTrend] = useState([])
  const [trendLoading, setTrendLoading] = useState(false)
  const [trendHoverIdx, setTrendHoverIdx] = useState(null)

  // Summary stats
  const [stats, setStats] = useState({
    positionsCount: 0,
    totalPnL: 0,
    lifetimePnL: 0,
    bookPnL: 0,
    balance: 0,
    credit: 0,
    equity: 0,
    margin: 0,
    marginFree: 0,
    marginLevel: 0,
    totalVolume: 0,
    totalDeals: 0,
    winRate: 0
  })

  const netStats = useMemo(() => {
    const symbols = netPositions.length
    const totalNetVolume = netPositions.reduce((s, p) => s + (p.volume || 0), 0)
    let buyFloating = 0
    let sellFloating = 0
    
    // Calculate floating from positions only (orders don't have profit yet)
    positions.forEach(p => {
      const action = (p.action || p.type || '').toString().toLowerCase()
      if (action === 'buy' || p.action === 0 || p.type === 0) buyFloating += (p.profit || 0)
      else sellFloating += (p.profit || 0)
    })
    
    return { symbols, totalNetVolume, buyFloating, sellFloating }
  }, [netPositions, positions])

  useEffect(() => {
    fetchPositionsAndInitDeals()
    fetchAvailableRules()
    fetchClientRules()
  }, [client.login])

  // Poll overview API every 2s — only while Overview tab is active
  useEffect(() => {
    if (!client?.login || activeTab !== 'overview') return
    let timer = null
    let cancelled = false
    const refresh = async () => {
      if (cancelled) return
      try {
        const raw = await brokerAPI.getClientOverview(client.login)
        if (cancelled) return
        const data = raw?.data ?? raw
        const account = data?.account ?? data?.client ?? data?.info ?? {}
        if (account && Object.keys(account).length > 0) {
          setClientData(prev => ({ ...prev, ...account }))
          setStats(prev => ({
            ...prev,
            balance: Number(account.balance ?? prev.balance),
            credit: Number(account.credit ?? prev.credit),
            equity: Number(account.equity ?? prev.equity),
            margin: Number(account.margin ?? prev.margin),
            marginFree: Number(account.margin_free ?? account.marginFree ?? prev.marginFree),
            marginLevel: Number(account.margin_level ?? account.marginLevel ?? prev.marginLevel),
          }))
        }
        const updatedPositions = data?.positions ?? data?.open_positions ?? data?.data?.positions ?? null
        if (Array.isArray(updatedPositions)) setPositions(updatedPositions)
        const overviewStats = data?.dealsStats ?? data?.dealStats ?? data?.deal_stats ?? data?.stats ?? data?.analytics ?? null
        if (overviewStats) setDealStats(overviewStats)
      } catch { /* silently ignore */ }
      if (!cancelled) timer = setTimeout(refresh, 2000)
    }
    timer = setTimeout(refresh, 2000)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [client?.login, activeTab])

  // Fetch profit trend using pnl-overview API — only when Overview tab is active
  const fetchProfitTrend = async (range = '7d') => {
    setTrendLoading(true)
    try {
      const now = Math.floor(Date.now() / 1000)
      const days = range === '30d' ? 30 : 7
      const from = now - days * 86400
      const resp = await brokerAPI.getClientPnlOverview(client.login, from, now)
      const daysArr = resp?.data?.days ?? resp?.days ?? []
      const result = daysArr.map(d => ({
        label: (() => {
          const dt = new Date(d.date)
          return `${dt.getDate()}/${dt.getMonth() + 1}`
        })(),
        value: Number(d.pnl ?? 0),
      }))
      setProfitTrend(result)
    } catch {
      setProfitTrend([])
    } finally {
      setTrendLoading(false)
    }
  }

  // Fetch profit trend only when on overview tab or when range changes while on overview
  useEffect(() => {
    if (activeTab === 'overview') fetchProfitTrend(trendRange)
  }, [client.login, trendRange, activeTab])

  // Reset pagination when tab changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab])

  // Fetch deals when page changes in deals tab
  useEffect(() => {
    if (activeTab === 'deals' && hasAppliedFilter && currentDateFilter.from !== 0) {
      fetchDealsWithDateFilter(currentDateFilter.from, currentDateFilter.to, currentPage)
    }
  }, [currentPage, activeTab])

  // Handle column sorting (toggle asc/desc; default desc on first click)
  const handleSort = (key) => {
    if (sortConfig.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })
    } else {
      setSortConfig({ key, direction: 'desc' })
    }
  }

  // Helper: normalize action label for positions/orders (hoisted before usage)
  function getActionText(item) {
    const val = (item.action ?? item.type)
    if (val === 0 || String(val).toLowerCase() === 'buy') return 'Buy'
    if (val === 1 || String(val).toLowerCase() === 'sell') return 'Sell'
    return String(val ?? '').toString()
  }

  // Sort function for flat arrays
  const sortData = (data, key, direction) => {
    if (!key) return data
    
    return [...data].sort((a, b) => {
      let aVal = a[key]
      let bVal = b[key]
      
      // Handle numeric values
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction === 'asc' ? aVal - bVal : bVal - aVal
      }
      
      // Normalize derived keys for mobile schemas
      if (key === 'action') {
        aVal = getActionText(a)
        bVal = getActionText(b)
      }
      if (key === 'priceOpen') {
        aVal = a.priceOpen ?? a.priceOrder ?? a.price
        bVal = b.priceOpen ?? b.priceOrder ?? b.price
      }
      if (key === 'position') {
        aVal = a.position ?? a.order
        bVal = b.position ?? b.order
      }

      // Handle string values uniformly
      aVal = String(aVal ?? '').toLowerCase()
      bVal = String(bVal ?? '').toLowerCase()
      
      if (aVal < bVal) return direction === 'asc' ? -1 : 1
      if (aVal > bVal) return direction === 'asc' ? 1 : -1
      return 0
    })
  }

  const fetchPositionsAndInitDeals = async () => {
    try {
      setLoading(true)
      
      // Use cached positions and orders
      let positionsData = allPositionsCache ? allPositionsCache.filter(pos => pos.login === client.login) : []
      setPositions(positionsData)
      
      const ordersData = allOrdersCache ? allOrdersCache.filter(order => order.login === client.login) : []
      setOrders(ordersData)

      // Calculate net positions per symbol (desktop parity) - combine positions and orders
      const netPosMap = new Map()
      
      // Process regular positions
      positionsData.forEach(pos => {
        const symbol = pos.symbol
        if (!symbol) return
        if (!netPosMap.has(symbol)) {
          netPosMap.set(symbol, {
            symbol,
            buyPositions: [],
            sellPositions: []
          })
        }
        const bucket = netPosMap.get(symbol)
        const action = (pos.action || pos.type || '').toString().toLowerCase()
        if (action === 'buy' || pos.action === 0 || pos.type === 0) bucket.buyPositions.push(pos)
        else bucket.sellPositions.push(pos)
      })
      
      // Process pending orders
      ordersData.forEach(order => {
        const symbol = order.symbol
        if (!symbol) return
        if (!netPosMap.has(symbol)) {
          netPosMap.set(symbol, {
            symbol,
            buyPositions: [],
            sellPositions: []
          })
        }
        const bucket = netPosMap.get(symbol)
        const action = (order.action || order.type || '').toString().toLowerCase()
        // BUY_LIMIT, BUY_STOP are buy types
        if (action.includes('buy')) bucket.buyPositions.push(order)
        // SELL_LIMIT, SELL_STOP are sell types
        else if (action.includes('sell')) bucket.sellPositions.push(order)
      })

      const computedNet = []
      netPosMap.forEach(group => {
        const buyVol = group.buyPositions.reduce((s, p) => s + (p.volume || 0), 0)
        const sellVol = group.sellPositions.reduce((s, p) => s + (p.volume || 0), 0)

        // Calculate net volume (buy - sell) like desktop does
        const netVolume = buyVol - sellVol
        const absNetVolume = Math.abs(netVolume)

        // Determine net type based on net volume
        let netType = 'Flat'
        if (Math.abs(netVolume) >= 0.00001) {
          netType = netVolume > 0 ? 'Buy' : 'Sell'
        }

        // Calculate weighted average price for the net position
        let avgOpenPrice = 0
        if (netVolume > 0 && group.buyPositions.length > 0) {
          // Net long: use buy prices
          let twB = 0
          group.buyPositions.forEach(p => {
            const v = p.volume || 0
            const pr = p.priceOpen || p.price || 0
            twB += pr * v
          })
          avgOpenPrice = buyVol > 0 ? twB / buyVol : 0
        } else if (netVolume < 0 && group.sellPositions.length > 0) {
          // Net short: use sell prices
          let twS = 0
          group.sellPositions.forEach(p => {
            const v = p.volume || 0
            const pr = p.priceOpen || p.price || 0
            twS += pr * v
          })
          avgOpenPrice = sellVol > 0 ? twS / sellVol : 0
        } else {
          // Flat position: use average of both buy and sell prices
          let totalWeightedPrice = 0
          let totalVolume = 0
          group.buyPositions.forEach(p => {
            const v = p.volume || 0
            const pr = p.priceOpen || p.price || 0
            totalWeightedPrice += pr * v
            totalVolume += v
          })
          group.sellPositions.forEach(p => {
            const v = p.volume || 0
            const pr = p.priceOpen || p.price || 0
            totalWeightedPrice += pr * v
            totalVolume += v
          })
          avgOpenPrice = totalVolume > 0 ? totalWeightedPrice / totalVolume : 0
        }

        // Calculate total profit for all positions in this symbol
        let totalProfit = 0
        group.buyPositions.forEach(p => totalProfit += p.profit || 0)
        group.sellPositions.forEach(p => totalProfit += p.profit || 0)

        // Only push if there's a net position (or it's flat but has positions)
        if (absNetVolume > 0 || (buyVol > 0 || sellVol > 0)) {
          computedNet.push({
            symbol: group.symbol,
            netType: netType,
            volume: absNetVolume,
            avgPrice: avgOpenPrice,
            totalProfit: totalProfit,
            positions: group.buyPositions.length + group.sellPositions.length
          })
        }
      })
      setNetPositions(computedNet)

      // Fetch live account data from overview API
      let overviewAccount = {}
      try {
        const raw = await brokerAPI.getClientOverview(client.login)
        const data = raw?.data ?? raw
        overviewAccount = data?.account ?? data?.client ?? data?.info ?? {}
        if (overviewAccount && Object.keys(overviewAccount).length > 0) {
          setClientData(prev => ({ ...prev, ...overviewAccount }))
        }
        // Use overview positions if available (more accurate than cache)
        const overviewPositions = data?.positions ?? data?.open_positions ?? data?.data?.positions ?? null
        if (Array.isArray(overviewPositions) && overviewPositions.length > 0) {
          positionsData = overviewPositions
          setPositions(overviewPositions)
        }
        const overviewStats = data?.dealsStats ?? data?.dealStats ?? data?.deal_stats ?? data?.stats ?? data?.analytics ?? null
        if (overviewStats) setDealStats(overviewStats)
      } catch (e) {
        console.warn('[ClientDetailsMobileModal] overview fetch failed, using cache', e)
      }

      // Calculate and set stats using live account data from overview API
      const merged = { ...client, ...overviewAccount }
      const totalPnL = positionsData.reduce((sum, p) => sum + (p.profit || 0), 0)
      const lifetimePnL = Number(merged.lifetimePnL ?? merged.pnl ?? 0)
      const floating = Number(merged.floatingProfit ?? merged.floating ?? overviewAccount.floatingProfit ?? overviewAccount.floating ?? totalPnL)
      const bookPnL = lifetimePnL + floating
      
      setStats({
        positionsCount: positionsData.length,
        totalPnL,
        lifetimePnL,
        bookPnL,
        balance: Number(merged.balance ?? 0),
        credit: Number(merged.credit ?? 0),
        equity: Number(merged.equity ?? 0),
        margin: Number(merged.margin ?? 0),
        marginFree: Number(merged.margin_free ?? merged.marginFree ?? 0),
        marginLevel: Number(merged.margin_level ?? merged.marginLevel ?? 0),
        totalVolume: 0,
        totalDeals: 0,
        winRate: 0
      })

      // Set default date range to Today
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      setFromDate(formatDateToDisplay(todayStr))
      setToDate(formatDateToDisplay(todayStr))
      
      // Pre-set today's date range so Deals tab loads it on first switch (without fetching now)
      const startOfDay = new Date(today)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(today)
      endOfDay.setHours(23, 59, 59, 999)
      const fromTs = Math.floor(startOfDay.getTime() / 1000)
      const toTs = Math.floor(endOfDay.getTime() / 1000)
      setCurrentDateFilter({ from: fromTs, to: toTs })
      setHasAppliedFilter(true)
      // Deals are fetched lazily when user switches to the Deals tab
      
      setLoading(false)
    } catch (error) {
      console.error('Error fetching client details:', error)
      setLoading(false)
    }
  }

  const fetchDealsWithDateFilter = async (fromTimestamp, toTimestamp, page = 1, positionsArray = null, accountData = null) => {
    try {
      setDealsLoading(true)
      
      // Calculate offset based on page
      const offset = (page - 1) * itemsPerPage
      
      const dealsRes = await brokerAPI.getClientDeals(client.login, fromTimestamp, toTimestamp, itemsPerPage, offset)
      const dealsData = dealsRes.data?.deals || dealsRes.deals || []
      const total = dealsRes.data?.total || dealsRes.total || dealsData.length
      
      setDeals(dealsData)
      setTotalDealsCount(total)
      setCurrentDateFilter({ from: fromTimestamp, to: toTimestamp })
      setHasAppliedFilter(true)

      // Calculate stats using live account data from overview
      const positionsToUse = positionsArray !== null ? positionsArray : positions
      const totalPnL = positionsToUse.reduce((sum, p) => sum + (p.profit || 0), 0)
      // Use passed accountData (fresh from API) merged over stale clientData to avoid stale-closure values
      const effectiveAccount = accountData ? { ...clientData, ...accountData } : clientData
      const lifetimePnL = Number(effectiveAccount.lifetimePnL ?? effectiveAccount.pnl ?? client.lifetimePnL ?? client.pnl ?? 0)
      const floating = Number(effectiveAccount.floatingProfit ?? effectiveAccount.floating ?? client.floating ?? totalPnL)
      const bookPnL = lifetimePnL + floating
      const totalVolume = dealsData.reduce((sum, d) => sum + (d.volume || 0), 0)
      
      const profitableDeals = dealsData.filter(d => (d.profit || 0) > 0).length
      const winRate = dealsData.length > 0 ? (profitableDeals / dealsData.length) * 100 : 0

      setStats({
        positionsCount: positionsToUse.length,
        totalPnL,
        lifetimePnL,
        bookPnL,
        balance: Number(effectiveAccount.balance ?? client.balance ?? 0),
        credit: Number(effectiveAccount.credit ?? client.credit ?? 0),
        equity: Number(effectiveAccount.equity ?? client.equity ?? 0),
        margin: Number(effectiveAccount.margin ?? client.margin ?? 0),
        marginFree: Number(effectiveAccount.margin_free ?? effectiveAccount.marginFree ?? client.margin_free ?? client.marginFree ?? 0),
        marginLevel: Number(effectiveAccount.margin_level ?? effectiveAccount.marginLevel ?? client.margin_level ?? client.marginLevel ?? 0),
        totalVolume,
        totalDeals: dealsData.length,
        winRate
      })

      setDealsLoading(false)
    } catch (error) {
      console.error('Error fetching deals:', error)
      setDeals([])
      setDealsLoading(false)
    }
  }

  const handleQuickFilter = async (filterType) => {
    setQuickFilter(filterType)
    setCurrentPage(1) // Reset to page 1
    const today = new Date()
    let fromDateObj, toDateObj

    switch(filterType) {
      case 'Today':
        fromDateObj = new Date(today)
        toDateObj = new Date(today)
        break
      case 'Last Week':
        fromDateObj = new Date(today)
        fromDateObj.setDate(today.getDate() - 7)
        toDateObj = new Date(today)
        break
      case 'Last Month':
        fromDateObj = new Date(today)
        fromDateObj.setMonth(today.getMonth() - 1)
        toDateObj = new Date(today)
        break
      case 'Last 3 Months':
        fromDateObj = new Date(today)
        fromDateObj.setMonth(today.getMonth() - 3)
        toDateObj = new Date(today)
        break
      case 'Last 6 Months':
        fromDateObj = new Date(today)
        fromDateObj.setMonth(today.getMonth() - 6)
        toDateObj = new Date(today)
        break
      case 'All History':
        fromDateObj = new Date('2020-01-01')
        toDateObj = new Date(today)
        break
      default:
        return
    }

    // Update date inputs (format as dd/mm/yyyy for display)
    const fromDateStr = fromDateObj.toISOString().split('T')[0]
    const toDateStr = toDateObj.toISOString().split('T')[0]
    setFromDate(formatDateToDisplay(fromDateStr))
    setToDate(formatDateToDisplay(toDateStr))

    // Fetch deals
    fromDateObj.setHours(0, 0, 0, 0)
    toDateObj.setHours(23, 59, 59, 999)
    await fetchDealsWithDateFilter(Math.floor(fromDateObj.getTime() / 1000), Math.floor(toDateObj.getTime() / 1000))
  }

  const handleApplyDateFilter = async () => {
    if (!fromDate && !toDate) return

    setCurrentPage(1) // Reset to page 1

    const fromDateObj = fromDate ? new Date(formatDateToValue(fromDate)) : null
    const toDateObj = toDate ? new Date(formatDateToValue(toDate)) : null

    if (fromDateObj) {
      fromDateObj.setHours(0, 0, 0, 0)
    }
    if (toDateObj) {
      toDateObj.setHours(23, 59, 59, 999)
    }

    const fromTimestamp = fromDateObj ? Math.floor(fromDateObj.getTime() / 1000) : 0
    const toTimestamp = toDateObj ? Math.floor(toDateObj.getTime() / 1000) : Math.floor(Date.now() / 1000)

    await fetchDealsWithDateFilter(fromTimestamp, toTimestamp, 1)
  }

  const handleClearDateFilter = () => {
    setFromDate('')
    setToDate('')
    setDeals([])
    setHasAppliedFilter(false)
    setQuickFilter('Today')
    handleQuickFilter('Today')
  }

  const fetchAvailableRules = async () => {
    try {
      setRulesLoading(true)
      const response = await brokerAPI.getAvailableRules()
      if (response.status === 'success') {
        setAvailableRules(response.data.rules || [])
      }
    } catch (error) {
      console.error('Failed to fetch available rules:', error)
    } finally {
      setRulesLoading(false)
    }
  }

  const fetchClientRules = async () => {
    try {
      const response = await brokerAPI.getClientRules(client.login)
      if (response.status === 'success') {
        setClientRules(response.data.rules || [])
      }
    } catch (error) {
      console.error('Failed to fetch client rules:', error)
      setClientRules([])
    }
  }

  const handleApplyRule = async (rule) => {
    try {
      setRulesLoading(true)
      
      const availableRule = availableRules.find(ar => ar.rule_code === rule.rule_code)
      const requiresTimeParam = availableRule?.requires_time_parameter
      
      let timeParameter = selectedTimeParam[rule.rule_code] || rule.time_parameter || null
      
      if (requiresTimeParam && !timeParameter) {
        alert('Please select a time parameter')
        setRulesLoading(false)
        return
      }

      const response = await brokerAPI.applyClientRule(client.login, rule.rule_code, timeParameter)
      
      if (response.status === 'success') {
        setSelectedTimeParam(prev => {
          const updated = { ...prev }
          delete updated[rule.rule_code]
          return updated
        })
        await fetchClientRules()
      } else {
        alert(response.message || 'Failed to apply rule')
      }
    } catch (error) {
      alert('Failed to apply rule: ' + (error.response?.data?.message || error.message))
    } finally {
      setRulesLoading(false)
    }
  }

  const handleRemoveRule = async (ruleCode) => {
    try {
      setRulesLoading(true)
      const response = await brokerAPI.removeClientRule(client.login, ruleCode)
      
      if (response.status === 'success') {
        await fetchClientRules()
      } else {
        alert(response.message || 'Failed to remove rule')
      }
    } catch (error) {
      alert('Failed to remove rule: ' + (error.response?.data?.message || error.message))
    } finally {
      setRulesLoading(false)
    }
  }

  const handleFundsOperation = async (e) => {
    e.preventDefault()
    
    if (!amount || parseFloat(amount) <= 0) {
      setOperationError('Please enter a valid amount')
      return
    }

    try {
      setOperationLoading(true)
      setOperationError('')
      setOperationSuccess('')

      const amountValue = parseFloat(amount)
      const commentValue = comment || `${operationType} operation`

      let response
      switch (operationType) {
        case 'deposit':
          response = await brokerAPI.depositFunds(client.login, amountValue, commentValue)
          break
        case 'withdrawal':
          response = await brokerAPI.withdrawFunds(client.login, amountValue, commentValue)
          break
        case 'credit_in':
          response = await brokerAPI.creditIn(client.login, amountValue, commentValue)
          break
        case 'credit_out':
          response = await brokerAPI.creditOut(client.login, amountValue, commentValue)
          break
        default:
          throw new Error('Invalid operation type')
      }

      setOperationSuccess(response.message || 'Operation completed successfully')
      setAmount('')
      setComment('')
      
      // Refresh deals after transaction
      setTimeout(async () => {
        if (hasAppliedFilter) {
          await handleApplyDateFilter()
        }
      }, 1000)
    } catch (error) {
      setOperationError(error.response?.data?.message || 'Operation failed. Please try again.')
    } finally {
      setOperationLoading(false)
    }
  }

  const formatNum = (num, decimals = 2) => {
    if (num == null || isNaN(num)) return '0.00'
    const value = Number(num).toFixed(decimals)
    const [integerPart, decimalPart] = value.split('.')
    
    // Indian number format: first comma after 3 digits from right, then every 2 digits
    const isNegative = integerPart.startsWith('-')
    const absInteger = isNegative ? integerPart.slice(1) : integerPart
    
    if (absInteger.length <= 3) {
      return value
    }
    
    const lastThree = absInteger.slice(-3)
    const remaining = absInteger.slice(0, -3)
    const formattedRemaining = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    const formattedInteger = formattedRemaining + ',' + lastThree
    
    return (isNegative ? '-' : '') + formattedInteger + '.' + decimalPart
  }

  // Separate positions and orders for grouped display
  const groupedPositionsData = useMemo(() => {
    const regularPositions = positions.filter(p => {
      const type = (p.action || p.type || '').toString().toLowerCase()
      return type === 'buy' || type === 'sell' || type === '0' || type === '1'
    })
    
    const pendingOrders = orders.filter(o => {
      const type = (o.action || o.type || '').toString().toLowerCase()
      return type.includes('limit') || type.includes('stop')
    })
    
    return { regularPositions, pendingOrders }
  }, [positions, orders])
  
  // Combine positions and orders for display
  const combinedPositions = useMemo(() => {
    return [...positions, ...orders]
  }, [positions, orders])

  // Debounced API search — fires when positionsSearch changes
  useEffect(() => {
    const trimmed = positionsSearch.trim()
    if (!trimmed) {
      setSearchedPositions(null)
      setSearchedOrders(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const params = {
          mt5Accounts: [String(client.login)],
          page: 1,
          limit: 15,
          search: trimmed
        }
        const [posRes, ordRes] = await Promise.all([
          brokerAPI.searchPositions(params).catch(() => null),
          brokerAPI.searchOrders(params).catch(() => null)
        ])
        if (cancelled) return
        const posList =
          posRes?.data?.positions ||
          posRes?.positions ||
          (Array.isArray(posRes?.data) ? posRes.data : null) ||
          []
        const ordList =
          ordRes?.data?.orders ||
          ordRes?.orders ||
          (Array.isArray(ordRes?.data) ? ordRes.data : null) ||
          []
        setSearchedPositions(Array.isArray(posList) ? posList : [])
        setSearchedOrders(Array.isArray(ordList) ? ordList : [])
      } catch {
        // ignore
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [positionsSearch, client.login])

  // Filter data based on search
  const filteredPositions = useMemo(() => {
    // When API search is active, use API results instead of local filter
    const base = positionsSearch.trim() && searchedPositions !== null
      ? [...(searchedPositions), ...(searchedOrders ?? [])]
      : combinedPositions
    return sortData(base, sortConfig.key, sortConfig.direction)
  }, [combinedPositions, positionsSearch, searchedPositions, searchedOrders, sortConfig])
  
  // Helper: comparator for grouped arrays honoring header sort
  const compareByKey = (a, b, key) => {
    let av, bv
    switch (key) {
      case 'position':
        av = Number(a.position ?? a.order ?? 0)
        bv = Number(b.position ?? b.order ?? 0)
        break
      case 'symbol':
        av = String(a.symbol || '').toLowerCase()
        bv = String(b.symbol || '').toLowerCase()
        break
      case 'action':
        av = getActionText(a).toLowerCase()
        bv = getActionText(b).toLowerCase()
        break
      case 'volume':
        av = Number(a.volume ?? 0)
        bv = Number(b.volume ?? 0)
        break
      case 'priceOpen':
        av = Number(a.priceOpen ?? a.priceOrder ?? a.price ?? 0)
        bv = Number(b.priceOpen ?? b.priceOrder ?? b.price ?? 0)
        break
      case 'profit':
        av = Number(a.profit ?? 0)
        bv = Number(b.profit ?? 0)
        break
      default:
        return 0
    }
    if (typeof av === 'string' || typeof bv === 'string') {
      return sortConfig.direction === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return sortConfig.direction === 'asc' ? av - bv : bv - av
  }

  // Filter grouped data separately and apply sorting within each section
  const filteredGroupedPositions = useMemo(() => {
    // When API search is active, re-bucket the API results instead of locally filtering
    if (positionsSearch.trim() && searchedPositions !== null) {
      const regs = Array.isArray(searchedPositions) ? [...searchedPositions] : []
      const ords = Array.isArray(searchedOrders) ? [...searchedOrders] : []
      if (sortConfig.key) {
        regs.sort((a, b) => compareByKey(a, b, sortConfig.key))
        ords.sort((a, b) => compareByKey(a, b, sortConfig.key))
      }
      return { regularPositions: regs, pendingOrders: ords }
    }

    const regs = groupedPositionsData.regularPositions.slice()
    const ords = groupedPositionsData.pendingOrders.slice()

    // Apply sorting if a column is selected
    if (sortConfig.key) {
      regs.sort((a,b) => compareByKey(a,b, sortConfig.key))
      ords.sort((a,b) => compareByKey(a,b, sortConfig.key))
    }

    return { regularPositions: regs, pendingOrders: ords }
  }, [groupedPositionsData, positionsSearch, searchedPositions, searchedOrders, sortConfig])

  const filteredNetPositions = useMemo(() => {
    let filtered = netPositions
    if (netPositionsSearch.trim()) {
      const query = netPositionsSearch.toLowerCase()
      filtered = netPositions.filter(p => 
        (p.symbol || '').toLowerCase().includes(query)
      )
    }
    return sortData(filtered, sortConfig.key, sortConfig.direction)
  }, [netPositions, netPositionsSearch, sortConfig])

  const filteredDeals = useMemo(() => {
    // For deals, apply client-side filtering only (data is paginated from server)
    let filtered = deals
    if (dealsSearch.trim()) {
      const query = dealsSearch.toLowerCase()
      filtered = deals.filter(d => 
        (d.symbol || '').toLowerCase().includes(query) ||
        (d.deal || '').toString().includes(query) ||
        (d.action || '').toLowerCase().includes(query) ||
        (d.type || '').toLowerCase().includes(query)
      )
    }
    return sortData(filtered, sortConfig.key, sortConfig.direction)
  }, [deals, dealsSearch, sortConfig])

  // Paginate data (positions and netPositions only - deals are paginated from server)
  const paginatedPositions = useMemo(() => {
    // Show all positions without pagination
    return filteredPositions
  }, [filteredPositions])

  // Paginate grouped positions
  const paginatedGroupedPositions = useMemo(() => {
    // Show all positions without pagination
    return filteredGroupedPositions
  }, [filteredGroupedPositions])

  const paginatedNetPositions = useMemo(() => {
    // Show all net positions without pagination
    return filteredNetPositions
  }, [filteredNetPositions])

  // For deals, use filteredDeals directly (already paginated from server)
  const paginatedDeals = useMemo(() => {
    return filteredDeals
  }, [filteredDeals])

  const renderOverview = () => {
    // Account data
    const balance   = Number(clientData.balance   ?? client.balance   ?? 0)
    const equity    = Number(clientData.equity     ?? client.equity    ?? 0)
    const credit    = Number(clientData.credit     ?? client.credit    ?? 0)
    const floating  = Number(clientData.floatingProfit ?? clientData.floating ?? clientData.profit ?? client.floatingProfit ?? client.floating ?? client.profit ?? 0)
    const marginLvl = Number(clientData.margin_level ?? client.margin_level ?? clientData.marginLevel ?? 0)
    const margin    = Number(clientData.margin     ?? client.margin    ?? 0)
    const marginFree= Number(clientData.margin_free ?? client.margin_free ?? clientData.marginFree ?? 0)
    const currency  = clientData.currency ?? client.currency ?? ''
    const name      = clientData.name     ?? client.name     ?? 'Unknown'
    const login     = clientData.login    ?? client.login    ?? ''
    const server    = clientData.server   ?? client.server   ?? ''

    // Deal stats
    const ds = dealStats || {}
    const commission= Number(ds.totalCommission ?? ds.total_commission ?? clientData.commission ?? client.commission ?? 0)
    const totalDeals       = Number(ds.totalDeals        ?? ds.total_deals             ?? 0)
    const winRate          = Number(ds.winRate           ?? ds.win_rate                ?? 0)
    const profitableDeals  = Number(ds.profitableDealCount ?? ds.profitable_deal_count ?? 0)
    const losingDeals      = Number(ds.losingDealCount   ?? ds.losing_deal_count       ?? 0)
    const profitSum        = Number(ds.profitableDealsSum ?? ds.profitSum ?? ds.profit_sum ?? 0)
    const losingSum        = Number(ds.losingDealsSum    ?? ds.losingDealSum ?? ds.losingSum ?? ds.losing_sum ?? 0)
    const avgProfit        = Number(ds.averageProfitPerDeal ?? ds.avgProfitPerDeal ?? ds.average_profit_per_deal ?? ds.avg_profit_per_deal ?? 0)
    const avgLoss          = Number(ds.averageLossPerDeal   ?? ds.avgLossPerDeal  ?? ds.average_loss_per_deal  ?? ds.avg_loss_per_deal  ?? 0)
    const maxProfit        = Number(ds.maxProfit         ?? ds.max_profit               ?? 0)
    const maxLoss          = Number(ds.maxLoss           ?? ds.max_loss                 ?? 0)
    const buyVolume        = Number(ds.buyVolume         ?? ds.buy_volume              ?? 0)
    const sellVolume       = Number(ds.sellVolume        ?? ds.sell_volume             ?? 0)
    const totalVol         = Number(ds.totalVolume ?? ds.total_volume ?? (buyVolume + sellVolume)) || 1
    const netPL            = profitSum + losingSum

    const computedWinRate  = totalDeals > 0 ? (profitableDeals / totalDeals * 100) : (Number(ds.winRate ?? ds.win_rate ?? 0))
    const lossRate         = totalDeals > 0 ? (losingDeals / totalDeals * 100) : (100 - computedWinRate)

    const fmt = (n, d = 2) => formatNum(n, d)
    const fmtPct = (n) => `${Number(n).toFixed(1)}%`

    // ── SVG Donut ──────────────────────────────────────────────────────────────
    const SvgDonut = ({ segments, size = 100, sw = 14, label, sublabel }) => {
      const r = (size - sw) / 2
      const circ = 2 * Math.PI * r
      const cx = size / 2, cy = size / 2
      const total = segments.reduce((s, seg) => s + Math.max(0, seg.v), 0) || 1
      let acc = 0
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
          {segments.map((seg, i) => {
            const pct = Math.max(0, seg.v) / total
            const len = pct * circ
            const off = -(acc / total) * circ
            acc += Math.max(0, seg.v)
            return (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                stroke={seg.color} strokeWidth={sw}
                strokeDasharray={`${len} ${circ - len}`}
                strokeDashoffset={off}
                transform={`rotate(-90 ${cx} ${cy})`}
                strokeLinecap="butt" />
            )
          })}
          {label && (() => {
            const maxW = r * 1.75
            const fits = label.length * 6.5 <= maxW
            if (fits) return <text x={cx} y={sublabel ? cy - 6 : cy + 4} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#111827">{label}</text>
            const mid = Math.floor(label.length / 2)
            const commas = []
            for (let i = 0; i < label.length; i++) if (label[i] === ',') commas.push(i)
            const sp = commas.length ? commas.reduce((b, p) => Math.abs(p - mid) < Math.abs(b - mid) ? p : b, commas[0]) : mid
            const l1 = label.slice(0, sp)
            const l2 = label.slice(sp + 1)
            const fs = 8
            const yOff = sublabel ? cy - 11 : cy - 4
            return (
              <text textAnchor="middle" fontSize={fs} fontWeight="bold" fill="#111827">
                <tspan x={cx} y={yOff}>{l1}</tspan>
                <tspan x={cx} dy={fs + 2}>{l2}</tspan>
              </text>
            )
          })()}
          {sublabel && <text x={cx} y={label && label.length * 6.5 > r * 1.75 ? cy + 12 : cy + 10} textAnchor="middle" fontSize="9" fill="#6b7280">{sublabel}</text>}
        </svg>
      )
    }

    // ── SVG Line Chart ────────────────────────────────────────────────────────
    // Color: blue if pnl >= 0, red if pnl < 0. Hover tooltip shows date + value.
    const SvgLine = ({ data, w = 220, h = 70, hoverIdx, setHoverIdx }) => {
      if (!data || !data.length) return <div className="h-[70px] flex items-center justify-center text-xs text-gray-400">No data</div>
      if (data.length === 1) return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <circle cx={w / 2} cy={h / 2} r="3" fill={data[0].value >= 0 ? '#3b82f6' : '#ef4444'} />
        </svg>
      )
      const vals = data.map(d => d.value)
      const minV = Math.min(...vals), maxV = Math.max(...vals)
      const rng = maxV - minV || 1
      const step = w / Math.max(data.length - 1, 1)
      const pts = data.map((d, i) => ({ x: i * step, y: h - ((d.value - minV) / rng) * (h - 8) - 4 }))
      const segColor = (i) => data[i]?.value >= 0 ? '#3b82f6' : '#ef4444'
      const ptColor  = (i) => data[i]?.value >= 0 ? '#3b82f6' : '#ef4444'
      return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
          <defs>
            {pts.slice(0, -1).map((_, i) => (
              <linearGradient key={i} id={`lgm${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={segColor(i)} stopOpacity="0.18" />
                <stop offset="100%" stopColor={segColor(i)} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {pts.slice(0, -1).map((p, i) => (
            <path key={`a${i}`}
              d={`M${p.x.toFixed(1)},${p.y.toFixed(1)} L${pts[i+1].x.toFixed(1)},${pts[i+1].y.toFixed(1)} L${pts[i+1].x.toFixed(1)},${h} L${p.x.toFixed(1)},${h} Z`}
              fill={`url(#lgm${i})`} />
          ))}
          {pts.slice(0, -1).map((p, i) => (
            <line key={`l${i}`}
              x1={p.x.toFixed(1)} y1={p.y.toFixed(1)}
              x2={pts[i+1].x.toFixed(1)} y2={pts[i+1].y.toFixed(1)}
              stroke={segColor(i)} strokeWidth="2" strokeLinecap="round" />
          ))}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={ptColor(i)} />
          ))}
          {/* Invisible hover targets per point */}
          {setHoverIdx && pts.map((p, i) => (
            <circle key={`h${i}`} cx={p.x} cy={p.y} r="14"
              fill="transparent" style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)} />
          ))}
          {/* Tooltip inside SVG */}
          {hoverIdx != null && pts[hoverIdx] && (() => {
            const p = pts[hoverIdx]
            const d = data[hoverIdx]
            const tipLabel = `${d.label}: ${fmt(d.value)}`
            const tipW = Math.max(tipLabel.length * 5.2 + 16, 64)
            const tx = Math.min(Math.max(p.x, tipW / 2 + 4), w - tipW / 2 - 4)
            const ty = p.y > 26 ? p.y - 20 : p.y + 22
            return (
              <g pointerEvents="none">
                <rect x={tx - tipW / 2} y={ty - 12} width={tipW} height="17" rx="4" fill="#1f2937" opacity="0.92" />
                <text x={tx} y={ty + 1} textAnchor="middle" fontSize="8" fill="white" fontWeight="600">{tipLabel}</text>
              </g>
            )
          })()}
        </svg>
      )
    }

    // ── Allocation total for donut ─────────────────────────────────────────────
    // Use equity as the base so percentages of credit/balance/floating are relative to equity
    const allocTotal = Math.abs(equity) || (Math.abs(credit) + Math.abs(balance) + Math.abs(floating)) || 1

    return (
      <div className="p-3 space-y-3 pb-6">

        {/* ── Account Information ─────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Account Information</p>
          <div className="grid grid-cols-3 gap-y-2 gap-x-2">
            {[
              { label: 'Name', value: name },
              { label: 'Account', value: `${server ? server + ' - ' : ''}${login}` },
              { label: 'Currency', value: currency || '–' },
              { label: 'Equity', value: fmt(equity), color: equity >= 0 ? 'text-green-600' : 'text-red-600' },
              { label: 'Margin Level', value: marginLvl ? fmtPct(marginLvl) : '–', color: marginLvl >= 100 ? 'text-green-600' : 'text-red-600' },
              { label: 'Total Commission', value: fmt(commission) },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className="text-[9px] text-gray-400 leading-tight">{label}</p>
                <p className={`text-[11px] font-semibold truncate ${color ?? 'text-gray-800'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Account Allocation + Volume Overview ───────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Account Allocation */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Account Allocation</p>
            <div className="flex items-center gap-2">
              <SvgDonut
                size={80} sw={12}
                label={fmt(equity)}
                sublabel="Total Equity"
                segments={[
                  { v: Math.abs(credit),   color: '#6366f1' },
                  { v: Math.abs(balance),  color: '#22c55e' },
                  { v: Math.abs(floating), color: floating >= 0 ? '#3b82f6' : '#ef4444' },
                ]}
              />
              <div className="flex-1 space-y-1.5 min-w-0">
                {[
                  { label: 'Credit',          val: credit,   color: '#6366f1' },
                  { label: 'Balance',         val: balance,  color: '#22c55e' },
                  { label: 'Floating Profit', val: floating, color: floating >= 0 ? '#3b82f6' : '#ef4444' },
                ].map(({ label, val, color }) => {
                  const pct = allocTotal ? Math.abs(val) / allocTotal * 100 : 0
                  return (
                    <div key={label}>
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-[9px] text-gray-500 truncate">{label}</span>
                        <span className={`text-[9px] font-medium ${val >= 0 ? 'text-gray-700' : 'text-red-500'}`}>{fmt(val)} ({val >= 0 ? fmtPct(pct) : `-${fmtPct(pct)}`})</span>
                      </div>
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Volume Overview */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Volume Overview</p>
            <div className="flex flex-col items-center gap-1">
              <SvgDonut
                size={80} sw={12}
                label={fmt(Number(ds.totalVolume ?? ds.total_volume ?? (buyVolume + sellVolume)), 2)}
                sublabel="Total"
                segments={
                  buyVolume > 0 || sellVolume > 0
                    ? [{ v: buyVolume, color: '#3b82f6' }, { v: sellVolume, color: '#ef4444' }]
                    : [{ v: Number(ds.totalVolume ?? ds.total_volume ?? 1), color: '#3b82f6' }]
                }
              />
              <div className="flex items-center gap-3 text-[9px]">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  <span className="text-gray-600">Buy <span className="font-semibold text-gray-800">{fmt(buyVolume)}</span></span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  <span className="text-gray-600">Sell <span className="font-semibold text-gray-800">{fmt(sellVolume)}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Profit Trend ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Profit Trend</p>
            <div className="flex items-center gap-1">
              {['7d', '30d'].map(r => (
                <button key={r} onClick={() => setTrendRange(r)}
                  className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${trendRange === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {r === '7d' ? '7 Days' : '30 Days'}
                </button>
              ))}
            </div>
          </div>
          {trendLoading ? (
            <div className="h-[70px] flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <SvgLine data={profitTrend} w={260} h={70} hoverIdx={trendHoverIdx} setHoverIdx={setTrendHoverIdx} />
              <div className="flex justify-between mt-1">
                {profitTrend.filter((_, i) => i % Math.max(1, Math.floor(profitTrend.length / 5)) === 0).map((d, i) => (
                  <span key={i} className="text-[8px] text-gray-400">{d.label}</span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Margin Usage ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Margin Usage</p>
          {(() => {
            const usedPct = margin + marginFree > 0 ? (margin / (margin + marginFree)) * 100 : 0
            const freePct = 100 - usedPct
            return (
              <div className="space-y-2">
                {[
                  { label: 'Used Margin', val: margin,      pct: usedPct, color: '#ef4444' },
                  { label: 'Free Margin', val: marginFree,  pct: freePct, color: '#22c55e' },
                ].map(({ label, val, pct, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-semibold text-gray-700">{fmt(val)}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* ── Deals Summary ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Deals Summary</p>
          <div className="flex items-center gap-3">
            <SvgDonut
              size={90} sw={14}
              label={String(totalDeals)}
              sublabel="Total Deals"
              segments={[
                { v: profitableDeals, color: '#22c55e' },
                { v: losingDeals,     color: '#ef4444' },
              ]}
            />
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-[9px] text-gray-500">Profitable Deals</span>
                <span className="ml-auto text-[10px] font-bold text-green-600">{profitableDeals} ({fmtPct(computedWinRate)})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                <span className="text-[9px] text-gray-500">Losing Deals</span>
                <span className="ml-auto text-[10px] font-bold text-red-600">{losingDeals} ({fmtPct(lossRate)})</span>
              </div>
              <div className="h-px bg-gray-100 my-1" />
              <div className="grid grid-cols-2 gap-1">
                <div className="bg-green-50 rounded-lg p-1.5 text-center">
                  <p className="text-[9px] text-green-600 font-medium">Win Rate</p>
                  <p className="text-[11px] font-bold text-green-700">{fmtPct(computedWinRate)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-1.5 text-center">
                  <p className="text-[9px] text-red-500 font-medium">Loss Rate</p>
                  <p className="text-[11px] font-bold text-red-600">{fmtPct(lossRate)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Performance Overview ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Performance Overview</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Avg Profit / Deal', val: avgProfit,  color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Avg Loss / Deal',   val: avgLoss,    color: 'text-red-600',   bg: 'bg-red-50'   },
              { label: 'Max Profit',        val: maxProfit,  color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'Max Loss',          val: maxLoss,    color: 'text-red-700',   bg: 'bg-red-50'   },
            ].map(({ label, val, color, bg }) => (
              <div key={label} className={`${bg} rounded-lg p-2`}>
                <p className="text-[9px] text-gray-500 mb-0.5">{label}</p>
                <p className={`text-[12px] font-bold ${color}`}>{fmt(val)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Profitability ──────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Profitability</p>
          <div className="flex items-center gap-3">
            {/* Semi-circle gauge */}
            <div className="relative flex-shrink-0">
              {(() => {
                const size = 90, sw = 12, r = (size - sw) / 2
                const cx = size / 2, cy = size / 2
                const circ = 2 * Math.PI * r
                const half = circ / 2
                const total = Math.abs(profitSum) + Math.abs(losingSum) || 1
                const profitPct = Math.abs(profitSum) / total
                const profitLen = profitPct * half
                const losingLen = (1 - profitPct) * half
                return (
                  <svg width={size} height={size / 2 + sw / 2 + 2} viewBox={`0 0 ${size} ${size / 2 + sw / 2 + 2}`}>
                    {/* background arc */}
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw}
                      strokeDasharray={`${half} ${circ}`} strokeDashoffset={0}
                      transform={`rotate(-180 ${cx} ${cy})`} strokeLinecap="butt" />
                    {/* profit arc (green) */}
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeWidth={sw}
                      strokeDasharray={`${profitLen} ${circ - profitLen}`}
                      strokeDashoffset={0}
                      transform={`rotate(-180 ${cx} ${cy})`} strokeLinecap="butt" />
                    {/* losing arc (red, continues from profit arc) */}
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef4444" strokeWidth={sw}
                      strokeDasharray={`${losingLen} ${circ - losingLen}`}
                      strokeDashoffset={-profitLen}
                      transform={`rotate(-180 ${cx} ${cy})`} strokeLinecap="butt" />
                    <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#111827">{fmt(netPL)}</text>
                    <text x={cx} y={cy + 6} textAnchor="middle" fontSize="7.5" fill="#6b7280">Net P/L</text>
                  </svg>
                )
              })()}
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-[9px] text-gray-400">Profit Sum</p>
                <p className="text-[13px] font-bold text-green-600">{fmt(profitSum)}</p>
              </div>
              <div>
                <p className="text-[9px] text-gray-400">Losing Sum</p>
                <p className="text-[13px] font-bold text-red-600">{fmt(losingSum)}</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    )
  }

  const renderPositions = () => {
    const regularPositions = paginatedGroupedPositions.regularPositions
    const pendingOrders = paginatedGroupedPositions.pendingOrders
    
    return (
      <>
        <table className="w-full">
          <thead className="bg-blue-500 sticky top-0 z-20">
            <tr>
              {positionColumns.position && (
                <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('position')}>
                  <div className="flex items-center gap-1">
                    Position
                    {sortConfig.key === 'position' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              )}
              {positionColumns.symbol && (
                <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('symbol')}>
                  <div className="flex items-center gap-1">
                    Symbol
                    {sortConfig.key === 'symbol' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              )}
              {positionColumns.action && (
                <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('action')}>
                  <div className="flex items-center gap-1">
                    Type
                    {sortConfig.key === 'action' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              )}
              {positionColumns.volume && (
                <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('volume')}>
                  <div className="flex items-center gap-1">
                    Volume
                    {sortConfig.key === 'volume' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              )}
              {positionColumns.priceOpen && (
                <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('priceOpen')}>
                  <div className="flex items-center gap-1">
                    Price
                    {sortConfig.key === 'priceOpen' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              )}
              {positionColumns.profit && (
                <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('profit')}>
                  <div className="flex items-center gap-1">
                    Profit
                    {sortConfig.key === 'profit' && (
                      <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {/* Regular Positions Section */}
            {regularPositions.length > 0 && (
              <>
                <tr className="bg-gray-100">
                  <td colSpan={Object.values(positionColumns).filter(Boolean).length} className="px-3 py-2">
                    <div className="text-sm font-semibold text-gray-700">Positions</div>
                  </td>
                </tr>
                {regularPositions.map((pos, idx) => (
                  <tr key={`pos-${idx}`} className="hover:bg-gray-50 border-b border-gray-200">
                    {positionColumns.position && <td className="px-3 py-2 text-xs text-gray-900">{pos.position || pos.ticket || '-'}</td>}
                    {positionColumns.symbol && <td className="px-3 py-2 text-xs font-medium text-gray-900">{pos.symbol || '-'}</td>}
                    {positionColumns.action && (
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          (pos.action || pos.type || '').toLowerCase().includes('buy') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {pos.action || pos.type || '-'}
                        </span>
                      </td>
                    )}
                    {positionColumns.volume && <td className="px-3 py-2 text-xs text-gray-900">{formatNum(pos.volume || 0)}</td>}
                    {positionColumns.priceOpen && <td className="px-3 py-2 text-xs text-gray-900">{formatNum(pos.priceOpen || pos.price || 0, 5)}</td>}
                    {positionColumns.profit && (
                      <td className={`px-3 py-2 text-xs ${(pos.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatNum(pos.profit || 0)}
                      </td>
                    )}
                  </tr>
                ))}
              </>
            )}
            
            {/* Blue Divider */}
            {regularPositions.length > 0 && pendingOrders.length > 0 && (
              <tr>
                <td colSpan={Object.values(positionColumns).filter(Boolean).length} className="p-0">
                  <div className="h-0.5 bg-blue-500"></div>
                </td>
              </tr>
            )}
            
            {/* Pending Orders Section */}
            {pendingOrders.length > 0 && (
              <>
                <tr className="bg-gray-100">
                  <td colSpan={Object.values(positionColumns).filter(Boolean).length} className="px-3 py-2">
                    <div className="text-sm font-semibold text-gray-700">Pending Orders</div>
                  </td>
                </tr>
                {pendingOrders.map((order, idx) => (
                  <tr key={`order-${idx}`} className="hover:bg-gray-50 border-b border-gray-200">
                    {positionColumns.position && <td className="px-3 py-2 text-xs text-gray-900">{order.order || order.ticket || '-'}</td>}
                    {positionColumns.symbol && <td className="px-3 py-2 text-xs font-medium text-gray-900">{order.symbol || '-'}</td>}
                    {positionColumns.action && (
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          (order.action || order.type || '').toLowerCase().includes('buy') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {order.action || order.type || '-'}
                        </span>
                      </td>
                    )}
                    {positionColumns.volume && <td className="px-3 py-2 text-xs text-gray-900">{formatNum(order.volume || 0)}</td>}
                    {positionColumns.priceOpen && <td className="px-3 py-2 text-xs text-gray-900">{formatNum(order.priceOrder || order.price || 0, 5)}</td>}
                    {positionColumns.profit && (
                      <td className="px-3 py-2 text-xs text-gray-400">
                        -
                      </td>
                    )}
                  </tr>
                ))}
              </>
            )}
            
            {/* Empty State */}
            {regularPositions.length === 0 && pendingOrders.length === 0 && (
              <tr>
                <td colSpan={Object.values(positionColumns).filter(Boolean).length} className="px-3 py-4 text-center text-sm text-gray-500">
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </>
    )
  }

  const renderNetPositions = () => (
    <>
      <table className="w-full">
        <thead className="bg-blue-500 sticky top-0 z-20">
          <tr>
            {netPositionColumns.symbol && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('symbol')}>
                <div className="flex items-center gap-1">
                  Symbol
                  {sortConfig.key === 'symbol' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {netPositionColumns.netType && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('netType')}>
                <div className="flex items-center gap-1">
                  Net Type
                  {sortConfig.key === 'netType' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {netPositionColumns.volume && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('volume')}>
                <div className="flex items-center gap-1">
                  Net Volume
                  {sortConfig.key === 'volume' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {netPositionColumns.avgPrice && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('avgPrice')}>
                <div className="flex items-center gap-1">
                  Avg Open Price
                  {sortConfig.key === 'avgPrice' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {netPositionColumns.profit && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('profit')}>
                <div className="flex items-center gap-1">
                  Profit
                  {sortConfig.key === 'profit' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {netPositionColumns.positions && <th className="px-3 py-2 text-left text-xs font-medium text-white">Positions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {paginatedNetPositions.map((netPos, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {netPositionColumns.symbol && <td className="px-3 py-2 text-xs font-medium text-gray-900">{netPos.symbol}</td>}
              {netPositionColumns.netType && (
                <td className={`px-3 py-2 text-xs ${netPos.netType === 'Buy' ? 'text-red-600' : 'text-green-600'}`}>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${netPos.netType === 'Buy' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {netPos.netType}
                  </span>
                </td>
              )}
              {netPositionColumns.volume && <td className="px-3 py-2 text-xs text-gray-900">{formatNum(netPos.volume)}</td>}
              {netPositionColumns.avgPrice && <td className="px-3 py-2 text-xs text-gray-900">{formatNum(netPos.avgPrice, 5)}</td>}
              {netPositionColumns.profit && (
                <td className={`px-3 py-2 text-xs ${netPos.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatNum(netPos.totalProfit)}
                </td>
              )}
              {netPositionColumns.positions && <td className="px-3 py-2 text-xs text-gray-900">{netPos.positions}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )

  const renderDeals = () => (
    <>
      <table className="w-full">
        <thead className="bg-blue-500 sticky top-0 z-20">
          <tr>
            {dealColumns.deal && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('deal')}>
                <div className="flex items-center gap-1">
                  Deal
                  {sortConfig.key === 'deal' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {dealColumns.time && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('time')}>
                <div className="flex items-center gap-1">
                  Time
                  {sortConfig.key === 'time' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {dealColumns.symbol && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('symbol')}>
                <div className="flex items-center gap-1">
                  Symbol
                  {sortConfig.key === 'symbol' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {dealColumns.action && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('action')}>
                <div className="flex items-center gap-1">
                  Type
                  {sortConfig.key === 'action' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {dealColumns.volume && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('volume')}>
                <div className="flex items-center gap-1">
                  Volume
                  {sortConfig.key === 'volume' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
            {dealColumns.profit && (
              <th className="px-3 py-2 text-left text-xs font-medium text-white cursor-pointer select-none" onClick={() => handleSort('profit')}>
                <div className="flex items-center gap-1">
                  Profit
                  {sortConfig.key === 'profit' && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {paginatedDeals.map((deal, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              {dealColumns.deal && <td className="px-3 py-2 text-xs text-gray-900">{deal.deal}</td>}
              {dealColumns.time && <td className="px-3 py-2 text-xs text-gray-900">{formatDate(deal.time)}</td>}
              {dealColumns.symbol && <td className="px-3 py-2 text-xs text-gray-900">{deal.symbol}</td>}
              {dealColumns.action && (
                <td className="px-3 py-2 text-xs">
                  {(() => {
                    const actionStr = String(deal.action || '').toLowerCase()
                    const cls = actionStr === 'buy'
                      ? 'bg-red-100 text-red-700'
                      : actionStr === 'sell'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    return (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
                        {deal.action}
                      </span>
                    )
                  })()}
                </td>
              )}
              {dealColumns.volume && <td className="px-3 py-2 text-xs text-gray-900">{formatNum(deal.volume)}</td>}
              {dealColumns.profit && (
                <td className={`px-3 py-2 text-xs ${(deal.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatNum(deal.profit || 0)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .mobile-date-picker::-webkit-calendar-picker-indicator {
            width: 100%;
            height: 100%;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            opacity: 0;
            cursor: pointer;
          }
          
          input[type="date"].mobile-date-picker {
            font-size: 10px !important;
          }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end lg:hidden">

        <div className="bg-white w-full h-[90vh] rounded-t-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-white z-10 flex-shrink-0">
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="#404040" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="flex-1" />
          <div className="w-9" />
        </div>

        {/* Client Info Card */}
        <div className="px-4 py-4 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-lg font-semibold text-gray-600">
                {(clientData.name || client.name || client.fullName || String(client.login || 'U'))[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                {clientData.name || client.name || client.fullName || String(client.login || '')}
              </h3>
              <p className="text-sm text-gray-600">{client.login}</p>
              <p className="text-xs text-gray-500">{client.email || '-'}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="-mx-4 border-b border-gray-200 overflow-x-auto scrollbar-hide">
            <div className="flex items-stretch px-2 min-w-max">
              {[
                { key: 'overview',  label: 'Overview',  count: null },
                { key: 'positions', label: 'Positions', count: filteredPositions.length },
                { key: 'deals',     label: 'Deals',     count: hasAppliedFilter ? totalDealsCount : 0 },
                ...((user?.rights ? ['deposit','withdrawal','credit_in','credit_out'].some(r => user.rights.includes(r)) : true) ? [{ key: 'funds', label: 'Money', count: null }] : []),
                ...((user?.rights ? user.rights.includes('manage_rules') : true) ? [{ key: 'rules', label: 'Rules', count: null }] : []),
              ].map(tab => {
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {tab.label}
                      {tab.count != null && (
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                          isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                        }`}>{tab.count}</span>
                      )}
                    </span>
                    {isActive && (
                      <span className="absolute left-3 right-3 -bottom-px h-[2px] bg-blue-600 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Search */}
        {activeTab !== 'overview' && (
        <div className="px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 min-w-0 h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center px-2 gap-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <circle cx="6" cy="6" r="4" stroke="#9CA3AF" strokeWidth="1.5"/>
                <path d="M9 9L12 12" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={activeTab === 'positions' ? positionsSearch : activeTab === 'deals' ? dealsSearch : ''}
                onChange={(e) => {
                  const value = e.target.value
                  if (activeTab === 'positions') setPositionsSearch(value)
                  else if (activeTab === 'deals') setDealsSearch(value)
                  setCurrentPage(1)
                }}
                placeholder={activeTab === 'positions' || activeTab === 'deals' ? 'Search' : 'Search not required'}
                disabled={activeTab !== 'positions' && activeTab !== 'deals'}
                className="flex-1 min-w-0 text-[11px] text-[#000000] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit"
              />
            </div>
            {/* Column Selector Button */}
            <button
              onClick={() => setShowColumnSelector(!showColumnSelector)}
              className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50"
              title="Select Columns"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="5" width="4" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
                <rect x="8.5" y="5" width="4" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
                <rect x="14" y="5" width="3" height="10" stroke="#4B4B4B" strokeWidth="1.5" rx="1"/>
              </svg>
            </button>
            {/* Pagination Buttons - Visible for deals tab only */}
            {activeTab === 'deals' && (
              <>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M12 14L8 10L12 6" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <span className="text-[10px] font-semibold text-[#000000] font-outfit">
                  {`${currentPage} / ${Math.ceil(totalDealsCount / itemsPerPage)}`}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => {
                    const maxPage = Math.ceil(totalDealsCount / itemsPerPage)
                    return prev < maxPage ? prev + 1 : prev
                  })}
                  disabled={currentPage >= Math.ceil(totalDealsCount / itemsPerPage)}
                  className="w-[28px] h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center justify-center transition-colors flex-shrink-0 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path d="M8 6L12 10L8 14" stroke="#4B4B4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
        )}

        {/* Date Filter for Deals Tab - Single Row Compact Design */}
        {activeTab === 'deals' && (
          <div className="px-2 py-1.5 bg-blue-50 border-b border-blue-100 flex-shrink-0">
            <div className="flex items-center gap-1.5" style={{ justifyContent: 'space-between' }}>
              {/* Date Inputs */}
              <div 
                style={{ width: '95px', flex: '0 0 95px', position: 'relative' }}
                onClick={() => fromDateInputRef.current?.showPicker?.()}
              >
                <input
                  ref={fromDateInputRef}
                  type="date"
                  value={fromDate ? formatDateToValue(fromDate) : ''}
                  onChange={(e) => {
                    const dateValue = e.target.value
                    if (dateValue) {
                      const [year, month, day] = dateValue.split('-')
                      setFromDate(`${day}/${month}/${year.slice(-2)}`)
                    } else {
                      setFromDate('')
                    }
                  }}
                  className="mobile-date-picker absolute inset-0 opacity-0 cursor-pointer"
                  style={{ width: '100%', height: '100%', zIndex: 10 }}
                />
                <div className="w-full border border-gray-300 rounded text-gray-900 bg-white px-1 py-0.5 flex items-center justify-between cursor-pointer" style={{ fontSize: '10px', height: '24px' }}>
                  <span>{fromDate || 'dd/mm/yy'}</span>
                  <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <span className="text-[12px] text-gray-500 font-medium" style={{ flex: '0 0 auto' }}>to</span>
              <div 
                style={{ width: '95px', flex: '0 0 95px', position: 'relative' }}
                onClick={() => toDateInputRef.current?.showPicker?.()}
              >
                <input
                  ref={toDateInputRef}
                  type="date"
                  value={toDate ? formatDateToValue(toDate) : ''}
                  onChange={(e) => {
                    const dateValue = e.target.value
                    if (dateValue) {
                      const [year, month, day] = dateValue.split('-')
                      setToDate(`${day}/${month}/${year.slice(-2)}`)
                    } else {
                      setToDate('')
                    }
                  }}
                  className="mobile-date-picker absolute inset-0 opacity-0 cursor-pointer"
                  style={{ width: '100%', height: '100%', zIndex: 10 }}
                />
                <div className="w-full border border-gray-300 rounded text-gray-900 bg-white px-1 py-0.5 flex items-center justify-between cursor-pointer" style={{ fontSize: '10px', height: '24px' }}>
                  <span>{toDate || 'dd/mm/yy'}</span>
                  <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              {/* Quick Filter Dropdown */}
              <select
                value={quickFilter}
                onChange={(e) => handleQuickFilter(e.target.value)}
                className="px-1.5 py-0.5 border border-blue-300 rounded text-[9px] font-medium text-blue-700 bg-white"
                style={{ height: '24px', fontSize: '9px', width: '60px', flex: '0 0 60px' }}
              >
                <option value="Today">Today</option>
                <option value="Last Week">Week</option>
                <option value="Last Month">Month</option>
                <option value="Last 3 Months">3M</option>
                <option value="Last 6 Months">6M</option>
              </select>

              {/* Action Buttons */}
              <button
                onClick={handleApplyDateFilter}
                className="px-3 py-0.5 bg-blue-600 text-white text-[9px] font-medium rounded hover:bg-blue-700"
                style={{ height: '24px', flex: '0 0 auto', whiteSpace: 'nowrap' }}
              >
                Apply
              </button>
              <button
                onClick={handleClearDateFilter}
                className="px-3 py-0.5 bg-white border border-gray-300 text-gray-700 text-[9px] font-medium rounded hover:bg-gray-50"
                style={{ height: '24px', flex: '0 0 auto', whiteSpace: 'nowrap' }}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Table Content - Scrollable Area */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : activeTab === 'deals' && dealsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <div className="bg-white relative min-w-full">
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'positions' && renderPositions()}
              {activeTab === 'deals' && renderDeals()}
              
              {/* Money Transactions Tab */}
              {activeTab === 'funds' && (
                <div className="p-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Money Transactions</h3>
                    
                    {operationSuccess && (
                      <div className="mb-3 bg-green-50 border-l-4 border-green-500 rounded-r p-2">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-green-700 text-xs">{operationSuccess}</span>
                        </div>
                      </div>
                    )}

                    {operationError && (
                      <div className="mb-3 bg-red-50 border-l-4 border-red-500 rounded-r p-2">
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-red-700 text-xs">{operationError}</span>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleFundsOperation} className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Operation Type</label>
                        <select
                          value={operationType}
                          onChange={(e) => {
                            setOperationType(e.target.value)
                            setOperationSuccess('')
                            setOperationError('')
                          }}
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white text-gray-900"
                        >
                          {(user?.rights ? user.rights.includes('deposit') : true) && <option value="deposit">Deposit Funds</option>}
                          {(user?.rights ? user.rights.includes('withdrawal') : true) && <option value="withdrawal">Withdraw Funds</option>}
                          {(user?.rights ? user.rights.includes('credit_in') : true) && <option value="credit_in">Credit In</option>}
                          {(user?.rights ? user.rights.includes('credit_out') : true) && <option value="credit_out">Credit Out</option>}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Enter amount"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 placeholder-gray-400"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Comment (Optional)</label>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Add a comment"
                          rows="2"
                          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 placeholder-gray-400 resize-none"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAmount('')
                            setComment('')
                            setOperationSuccess('')
                            setOperationError('')
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Clear
                        </button>
                        <button
                          type="submit"
                          disabled={operationLoading}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-md hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-400 inline-flex items-center gap-1.5"
                        >
                          {operationLoading ? (
                            <>
                              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Processing...
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Execute
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Broker Rules Tab */}
              {activeTab === 'rules' && (
                <div className="p-4">
                  {rulesLoading ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="text-sm text-gray-500 mt-2">Loading rules...</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Rule</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Time</th>
                              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Toggle</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {availableRules.filter(r => r.is_active).map((rule) => {
                              const clientRule = clientRules.find(cr => cr.rule_code === rule.rule_code)
                              const isApplied = clientRule && clientRule.is_active === true
                              const requiresTimeParam = rule.requires_time_parameter
                              const timeOptions = rule.available_time_parameters || []
                              const currentTimeParam = clientRule?.time_parameter || ''
                              
                              return (
                                <tr key={rule.id} className="bg-white hover:bg-gray-50">
                                  <td className="px-3 py-2 text-xs text-gray-900 font-medium">{rule.rule_name}</td>
                                  <td className="px-3 py-2">
                                    {requiresTimeParam ? (
                                      <select
                                        value={selectedTimeParam[rule.rule_code] || currentTimeParam || ''}
                                        onChange={(e) => setSelectedTimeParam(prev => ({ ...prev, [rule.rule_code]: e.target.value }))}
                                        className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-900 w-full"
                                      >
                                        <option value="">Select</option>
                                        {timeOptions.map((time) => (
                                          <option key={time} value={time}>{time}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-xs text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex justify-center">
                                      <button
                                        onClick={() => isApplied ? handleRemoveRule(rule.rule_code) : handleApplyRule(rule)}
                                        disabled={rulesLoading}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                          isApplied ? 'bg-blue-600' : 'bg-gray-300'
                                        }`}
                                      >
                                        <span
                                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                            isApplied ? 'translate-x-5' : 'translate-x-0.5'
                                          }`}
                                        />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary Cards - Positions tab */}
        {activeTab === 'positions' && (
          <div className="px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Balance</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.balance)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Credit</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.credit)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Equity</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.equity)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Margin</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.margin)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Free Margin</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.marginFree)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Margin Level</p>
                <p className={`text-sm font-bold truncate ${stats.marginLevel >= 100 ? 'text-green-600' : stats.marginLevel > 0 ? 'text-orange-500' : 'text-gray-900'}`}>
                  {stats.marginLevel > 0 ? `${Number(stats.marginLevel).toFixed(1)}%` : '–'}
                </p>
              </div>
            </div>
          </div>
        )}


        {/* Column Selector Dropdown */}
        {showColumnSelector && (
          <>
            <div className="fixed inset-0 bg-transparent z-40" onClick={() => setShowColumnSelector(false)} />
            <div className="absolute top-[118px] right-[58px] bg-white rounded-lg shadow-xl border border-blue-500 z-50 w-56">
              {/* Header */}
              <div className="px-4 py-2.5 bg-blue-500 rounded-t-lg flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Show/Hide Columns</h3>
                <button
                  onClick={() => setShowColumnSelector(false)}
                  className="text-white hover:text-blue-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Column List */}
              <div className="p-2 max-h-80 overflow-y-auto bg-white rounded-b-lg">
                {activeTab === 'positions' && (
                  <div className="space-y-0.5">
                    {Object.entries({
                      position: 'Position',
                      symbol: 'Symbol',
                      action: 'Type',
                      volume: 'Volume',
                      priceOpen: 'Price',
                      profit: 'Profit'
                    }).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 rounded-md transition-colors">
                        <span className="text-sm text-gray-700 font-medium">{label}</span>
                        <button
                          onClick={() => setPositionColumns(prev => ({ ...prev, [key]: !prev[key] }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            positionColumns[key] ? 'bg-blue-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                              positionColumns[key] ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'deals' && (
                  <div className="space-y-0.5">
                    {Object.entries({
                      deal: 'Deal',
                      symbol: 'Symbol',
                      action: 'Type',
                      volume: 'Volume',
                      profit: 'Profit'
                    }).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 rounded-md transition-colors">
                        <span className="text-sm text-gray-700 font-medium">{label}</span>
                        <button
                          onClick={() => setDealColumns(prev => ({ ...prev, [key]: !prev[key] }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            dealColumns[key] ? 'bg-blue-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                              dealColumns[key] ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}

export default ClientDetailsMobileModal
