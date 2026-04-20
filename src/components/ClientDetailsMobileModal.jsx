import { useState, useEffect, useMemo, useRef } from 'react'
import { brokerAPI } from '../services/api'

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
  const [activeTab, setActiveTab] = useState('positions')
  const [positions, setPositions] = useState([])
  const [orders, setOrders] = useState([])
  const [netPositions, setNetPositions] = useState([])
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [positionsSearch, setPositionsSearch] = useState('')
  const [netPositionsSearch, setNetPositionsSearch] = useState('')
  const [dealsSearch, setDealsSearch] = useState('')
  
  // Broker Rules states
  const [availableRules, setAvailableRules] = useState([])
  const [clientRules, setClientRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(false)
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

  // Deal stats from API
  const [dealStats, setDealStats] = useState(null)

  // Summary stats
  const [stats, setStats] = useState({
    positionsCount: 0,
    totalPnL: 0,
    lifetimePnL: 0,
    bookPnL: 0,
    balance: 0,
    credit: 0,
    equity: 0,
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

  // Fetch deal stats from API
  const fetchDealStats = async () => {
    try {
      const data = await brokerAPI.getClientDealStatsGET(client.login)
      setDealStats(data || null)
    } catch (error) {
      console.error('Failed to load deal stats:', error)
      setDealStats(null)
    }
  }

  useEffect(() => {
    fetchPositionsAndInitDeals()
    fetchAvailableRules()
    fetchClientRules()
    fetchDealStats()
  }, [client.login])

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
      const positionsData = allPositionsCache ? allPositionsCache.filter(pos => pos.login === client.login) : []
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

      // Calculate and set stats using client data from WebSocket (like desktop)
      const totalPnL = positionsData.reduce((sum, p) => sum + (p.profit || 0), 0)
      const lifetimePnL = Number(client.lifetimePnL ?? client.pnl ?? 0)
      const floating = Number(client.floating ?? totalPnL)
      const bookPnL = lifetimePnL + floating
      
      setStats({
        positionsCount: positionsData.length,
        totalPnL,
        lifetimePnL,
        bookPnL,
        balance: Number(client.balance ?? 0),
        credit: Number(client.credit ?? 0),
        equity: Number(client.equity ?? 0),
        totalVolume: dealStats?.totalVolume ?? 0,
        totalDeals: dealStats?.totalDeals ?? 0,
        winRate: dealStats?.winRate ?? 0
      })

      // Set default date range to Today
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      setFromDate(formatDateToDisplay(todayStr))
      setToDate(formatDateToDisplay(todayStr))
      
      // Fetch deals for today by default, passing positionsData so it can calculate stats correctly
      const startOfDay = new Date(today)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(today)
      endOfDay.setHours(23, 59, 59, 999)
      
      await fetchDealsWithDateFilter(Math.floor(startOfDay.getTime() / 1000), Math.floor(endOfDay.getTime() / 1000), 1, positionsData)
      
      setLoading(false)
    } catch (error) {
      console.error('Error fetching client details:', error)
      setLoading(false)
    }
  }

  const fetchDealsWithDateFilter = async (fromTimestamp, toTimestamp, page = 1, positionsArray = null) => {
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

      // Calculate stats using client data and dealStats from API
      // Use provided positionsArray or fall back to state
      const positionsToUse = positionsArray !== null ? positionsArray : positions
      const totalPnL = positionsToUse.reduce((sum, p) => sum + (p.profit || 0), 0)
      const lifetimePnL = Number(client.lifetimePnL ?? client.pnl ?? 0)
      const floating = Number(client.floating ?? totalPnL)
      const bookPnL = lifetimePnL + floating
      const totalVolume = dealsData.reduce((sum, d) => sum + (d.volume || 0), 0)
      
      const profitableDeals = dealsData.filter(d => (d.profit || 0) > 0).length
      const winRate = dealsData.length > 0 ? (profitableDeals / dealsData.length) * 100 : 0

      setStats({
        positionsCount: positionsToUse.length,
        totalPnL,
        lifetimePnL,
        bookPnL,
        balance: client.balance || 0,
        credit: client.credit || 0,
        equity: client.equity || 0,
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
  
  // Filter data based on search
  const filteredPositions = useMemo(() => {
    let filtered = combinedPositions
    if (positionsSearch.trim()) {
      const query = positionsSearch.toLowerCase()
      filtered = combinedPositions.filter(p => 
        (p.symbol || '').toLowerCase().includes(query) ||
        (p.position || p.order || '').toString().includes(query) ||
        (p.action || '').toLowerCase().includes(query) ||
        (p.type || '').toLowerCase().includes(query)
      )
    }
    return sortData(filtered, sortConfig.key, sortConfig.direction)
  }, [combinedPositions, positionsSearch, sortConfig])
  
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
    const applySearch = (arr) => {
      if (!positionsSearch.trim()) return arr
      const q = positionsSearch.toLowerCase()
      return arr.filter(it =>
        (it.symbol || '').toLowerCase().includes(q) ||
        String(it.position ?? it.order ?? '').includes(q) ||
        String(it.action ?? it.type ?? '').toLowerCase().includes(q)
      )
    }

    const regs = applySearch(groupedPositionsData.regularPositions)
    const ords = applySearch(groupedPositionsData.pendingOrders)

    // Apply sorting if a column is selected
    if (sortConfig.key) {
      regs.sort((a,b) => compareByKey(a,b, sortConfig.key))
      ords.sort((a,b) => compareByKey(a,b, sortConfig.key))
    }

    return { regularPositions: regs, pendingOrders: ords }
  }, [groupedPositionsData, positionsSearch, sortConfig])

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
                {(client.name || client.fullName || 'U')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                {client.name || client.fullName || 'Unknown'}
              </h3>
              <p className="text-sm text-gray-600">{client.login}</p>
              <p className="text-xs text-gray-500">{client.email || '-'}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('positions')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'positions'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Positions ({filteredPositions.length})
            </button>
            <button
              onClick={() => setActiveTab('netPositions')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'netPositions'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Net Positions ({filteredNetPositions.length})
            </button>
            <button
              onClick={() => setActiveTab('deals')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'deals'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Deals ({hasAppliedFilter ? totalDealsCount : 0})
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 min-w-0 h-[28px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] flex items-center px-2 gap-1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                <circle cx="6" cy="6" r="4" stroke="#9CA3AF" strokeWidth="1.5"/>
                <path d="M9 9L12 12" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                value={activeTab === 'positions' ? positionsSearch : activeTab === 'netPositions' ? netPositionsSearch : dealsSearch}
                onChange={(e) => {
                  const value = e.target.value
                  if (activeTab === 'positions') setPositionsSearch(value)
                  else if (activeTab === 'netPositions') setNetPositionsSearch(value)
                  else setDealsSearch(value)
                  setCurrentPage(1)
                }}
                placeholder="Search"
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
            {/* Pagination Buttons - Hidden for positions and netPositions tabs */}
            {activeTab !== 'positions' && activeTab !== 'netPositions' && (
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
                  {activeTab === 'netPositions' && `${currentPage} / ${Math.ceil(filteredNetPositions.length / itemsPerPage)}`}
                  {activeTab === 'deals' && `${currentPage} / ${Math.ceil(totalDealsCount / itemsPerPage)}`}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => {
                    const maxPage = activeTab === 'netPositions'
                      ? Math.ceil(filteredNetPositions.length / itemsPerPage)
                      : Math.ceil(totalDealsCount / itemsPerPage)
                    return prev < maxPage ? prev + 1 : prev
                  })}
                  disabled={
                    (activeTab === 'netPositions' && currentPage >= Math.ceil(filteredNetPositions.length / itemsPerPage)) ||
                    (activeTab === 'deals' && currentPage >= Math.ceil(totalDealsCount / itemsPerPage))
                  }
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
              {activeTab === 'positions' && renderPositions()}
              {activeTab === 'netPositions' && renderNetPositions()}
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
                          <option value="deposit">Deposit Funds</option>
                          <option value="withdrawal">Withdraw Funds</option>
                          <option value="credit_in">Credit In</option>
                          <option value="credit_out">Credit Out</option>
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

        {/* Summary Cards - Different for Positions vs NET Position tab */}
        {activeTab === 'positions' && (
          <div className="px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Lifetime PnL</p>
                <p className={`text-sm font-bold truncate ${stats.lifetimePnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatNum(stats.lifetimePnL)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Floating Profit</p>
                <p className={`text-sm font-bold truncate ${stats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatNum(stats.totalPnL)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Balance</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.balance)}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Equity</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.equity)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Credit</p>
                <p className="text-sm font-bold text-gray-900 truncate">{formatNum(stats.credit)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Book PnL</p>
                <p className={`text-sm font-bold truncate ${stats.bookPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatNum(stats.bookPnL)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* NET Position Face Cards (matching Positions tab styling) */}
        {activeTab === 'netPositions' && (
          <div className="px-4 py-3 bg-white border-t border-gray-200 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Total NET Volume</p>
                <p className="text-sm font-bold text-gray-900 truncate">
                  {netStats.totalNetVolume.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Buy Floating</p>
                <p className={`text-sm font-bold truncate ${netStats.buyFloating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatNum(netStats.buyFloating)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-[10px] text-gray-600 uppercase font-semibold">Sell Floating</p>
                <p className={`text-sm font-bold truncate ${netStats.sellFloating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatNum(netStats.sellFloating)}
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

                {activeTab === 'netPositions' && (
                  <div className="space-y-0.5">
                    {Object.entries({
                      symbol: 'Symbol',
                      netType: 'Net Type',
                      volume: 'Net Volume',
                      avgPrice: 'Avg Open Price',
                      profit: 'Profit',
                      positions: 'Positions'
                    }).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between px-3 py-2.5 hover:bg-blue-50 rounded-md transition-colors">
                        <span className="text-sm text-gray-700 font-medium">{label}</span>
                        <button
                          onClick={() => setNetPositionColumns(prev => ({ ...prev, [key]: !prev[key] }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            netPositionColumns[key] ? 'bg-blue-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                              netPositionColumns[key] ? 'translate-x-5' : 'translate-x-0.5'
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
