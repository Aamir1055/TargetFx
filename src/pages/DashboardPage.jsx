import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { brokerAPI } from '../services/api'
import Sidebar from '../components/Sidebar'
import QuickActionCard from '../components/dashboard/QuickActionCard'
import MiniDataTable from '../components/dashboard/MiniDataTable'
import WebSocketIndicator from '../components/WebSocketIndicator'
import DashboardMobileView from '../components/DashboardMobileView'

// Local numeric parser aligned with Client2 normalization
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

const DashboardPage = () => {
  // Initialize sidebar state from localStorage
  const getInitialSidebarOpen = () => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      if (v === null) return true // open by default
      return JSON.parse(v)
    } catch {
      return true
    }
  }
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarOpen)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 768
  })
  const { user } = useAuth()
  const { positions, orders, connectionState } = useData()
  const navigate = useNavigate()

  // API-fetched clients state (replacing WebSocket data)
  const [clients, setClients] = useState([])
  const [clientsLoading, setClientsLoading] = useState(true)

  // Commission totals state
  const [commissionTotals, setCommissionTotals] = useState(null)

  // Face card drag and drop - using same card system as ClientsPage (cards 1-50)
  const defaultFaceCardOrder = [1, 2, 3, 4, 5, 6, 8, 9, 14, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50]
  
  // Load card order from localStorage or use default
  const [faceCardOrder, setFaceCardOrder] = useState(() => {
    const saved = localStorage.getItem('dashboardFaceCardOrder')
    return saved ? JSON.parse(saved) : defaultFaceCardOrder
  })

  // Card visibility filter - Default: show only the key dashboard cards (rest off by default)
  const defaultCardVisibility = (() => {
    // Start with everything hidden
    const vis = {}
    for (let i = 1; i <= 50; i++) vis[i] = false
    // Show only the cards in the provided screenshot by default
    // Row 1
    vis[1] = true   // Total Clients
    vis[2] = true   // Total Balance
    vis[3] = true   // Total Credit
    vis[4] = true   // Total Equity
    vis[5] = true   // PNL
    vis[6] = true   // Floating Profit
    // Row 2
    vis[8] = true   // Daily Deposit
    vis[9] = true   // Daily Withdrawal
    vis[14] = true  // Net DW
    vis[10] = true  // Daily PnL
    vis[11] = true  // This Week PnL
    vis[12] = true  // This Month PnL
    // Row 3 (visible in screenshot): Lifetime PnL
    vis[13] = true  // Lifetime PnL
    return vis
  })()

  const [cardVisibility, setCardVisibility] = useState(() => {
    const saved = localStorage.getItem('dashboardCardVisibility')
    return saved ? JSON.parse(saved) : defaultCardVisibility
  })

  // Show/hide card filter dropdown
  const [showCardFilter, setShowCardFilter] = useState(false)
  const [cardFilterSearchQuery, setCardFilterSearchQuery] = useState('')

  // Drag and drop state
  const [draggedCard, setDraggedCard] = useState(null)

  // Drag and drop handlers
  const handleDragStart = (e, cardId) => {
    setDraggedCard(cardId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', e.target)
    e.target.style.opacity = '0.5'
  }

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDraggedCard(null)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e, targetCardId) => {
    e.preventDefault()
    
    if (draggedCard === targetCardId) return

    const newOrder = [...faceCardOrder]
    const draggedIndex = newOrder.indexOf(draggedCard)
    const targetIndex = newOrder.indexOf(targetCardId)

    // Swap positions
    newOrder[draggedIndex] = targetCardId
    newOrder[targetIndex] = draggedCard

    setFaceCardOrder(newOrder)
    localStorage.setItem('dashboardFaceCardOrder', JSON.stringify(newOrder))
  }

  // Reset card order to default
  const resetCardOrder = () => {
    setFaceCardOrder(defaultFaceCardOrder)
    localStorage.setItem('dashboardFaceCardOrder', JSON.stringify(defaultFaceCardOrder))
  }

  // Toggle card visibility
  const toggleCardVisibility = (cardId) => {
    const updated = { ...cardVisibility, [cardId]: !cardVisibility[cardId] }
    setCardVisibility(updated)
    localStorage.setItem('dashboardCardVisibility', JSON.stringify(updated))
  }

  // Fetch commission totals on mount and every hour
  useEffect(() => {
    const fetchCommissionTotals = async () => {
      try {
        console.log('[Dashboard] Fetching IB Commission Totals...')
        const response = await brokerAPI.getIBCommissionTotals()
        console.log('[Dashboard] Commission Totals Response:', response?.data)
        setCommissionTotals(response?.data || null)
      } catch (err) {
        console.error('[Dashboard] Failed to fetch commission totals:', err)
      }
    }

    // Initial fetch
    fetchCommissionTotals()

    // Refresh every hour (3600000 ms)
    const interval = setInterval(fetchCommissionTotals, 3600000)

    return () => clearInterval(interval)
  }, [])

  // Fetch clients data via API (replacing WebSocket data)
  useEffect(() => {
    const fetchClients = async () => {
      try {
        setClientsLoading(true)
        console.log('[Dashboard] Fetching clients data from API...')
        
        // Fetch all clients without pagination for face cards calculation
        const response = await brokerAPI.searchClients({
          page: 1,
          limit: 10000, // Large limit to get all clients for totals
          percentage: false
        })
        
        const responseData = response?.data || {}
        const data = responseData?.data || responseData
        const clientsList = data.clients || []
        
        console.log('[Dashboard] Fetched', clientsList.length, 'clients from API')
        setClients(clientsList)
        setClientsLoading(false)
      } catch (err) {
        console.error('[Dashboard] Failed to fetch clients:', err)
        setClientsLoading(false)
      }
    }

    // Initial fetch
    fetchClients()

    // Refresh every 10 seconds to keep data fresh
    const interval = setInterval(fetchClients, 10000)

    return () => clearInterval(interval)
  }, [])

  // Mobile detection effect
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Format Indian number (with commas) - always limits to 2 decimal places
  const formatIndianNumber = (num) => {
    // Convert to number and ensure 2 decimal places
    const numValue = typeof num === 'number' ? num : parseFloat(num)
    if (!isFinite(numValue)) return '0.00'
    
    const fixed = numValue.toFixed(2)
    const [integerPart, decimalPart] = fixed.split('.')
    
    // Handle negative numbers
    const isNegative = integerPart.startsWith('-')
    const absoluteInteger = isNegative ? integerPart.substring(1) : integerPart
    
    if (absoluteInteger.length <= 3) {
      return `${integerPart}.${decimalPart}`
    }
    
    // Indian format: last 3 digits, then groups of 2
    const lastThree = absoluteInteger.substring(absoluteInteger.length - 3)
    const otherNumbers = absoluteInteger.substring(0, absoluteInteger.length - 3)
    const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    const formatted = `${formattedOther},${lastThree}`
    
    const result = (isNegative ? '-' : '') + formatted
    return `${result}.${decimalPart}`
  }

  // Calculate face card totals from clients data
  const faceCardTotals = useMemo(() => {
    const list = clients || []
    const sum = (key) => list.reduce((acc, c) => {
      const v = c?.[key]
      return acc + (typeof v === 'number' ? v : 0)
    }, 0)

    // PnL special handling
    const totalPnl = list.reduce((acc, c) => {
      const hasPnl = typeof c?.pnl === 'number'
      const computed = hasPnl ? c.pnl : ((c?.credit || 0) - (c?.equity || 0))
      return acc + (typeof computed === 'number' && !Number.isNaN(computed) ? computed : 0)
    }, 0)

    // Bonus calculations
    const dailyBonusIn = sum('dailyBonusIn')
    const dailyBonusOut = sum('dailyBonusOut')
    const weekBonusIn = sum('thisWeekBonusIn')
    const weekBonusOut = sum('thisWeekBonusOut')
    const monthBonusIn = sum('thisMonthBonusIn')
    const monthBonusOut = sum('thisMonthBonusOut')
    const lifetimeBonusIn = sum('lifetimeBonusIn')
    const lifetimeBonusOut = sum('lifetimeBonusOut')

    // Deposit/Withdrawal calculations
    const weekDeposit = sum('thisWeekDeposit')
    const weekWithdrawal = sum('thisWeekWithdrawal')
    const monthDeposit = sum('thisMonthDeposit')
    const monthWithdrawal = sum('thisMonthWithdrawal')
    const lifetimeDeposit = sum('lifetimeDeposit')
    const lifetimeWithdrawal = sum('lifetimeWithdrawal')

    // Credit IN/OUT calculations
    const weekCreditIn = sum('thisWeekCreditIn')
    const monthCreditIn = sum('thisMonthCreditIn')
    const lifetimeCreditIn = sum('lifetimeCreditIn')
    const weekCreditOut = sum('thisWeekCreditOut')
    const monthCreditOut = sum('thisMonthCreditOut')
    const lifetimeCreditOut = sum('lifetimeCreditOut')

    // Previous Equity calculations
    const weekPreviousEquity = sum('thisWeekPreviousEquity')
    const monthPreviousEquity = sum('thisMonthPreviousEquity')
    const previousEquity = sum('previousEquity')

    return {
      totalClients: list.length,
      totalBalance: sum('balance'),
      totalCredit: sum('credit'),
      totalEquity: sum('equity'),
      totalPnl,
      totalProfit: sum('profit'),
      dailyDeposit: sum('dailyDeposit'),
      dailyWithdrawal: sum('dailyWithdrawal'),
      dailyPnL: sum('dailyPnL'),
      thisWeekPnL: sum('thisWeekPnL'),
      thisMonthPnL: sum('thisMonthPnL'),
      lifetimePnL: sum('lifetimePnL'),
      // Commission metrics from API
      totalCommission: commissionTotals?.total_commission || 0,
      availableCommission: commissionTotals?.total_available_commission || 0,
      totalCommissionPercent: commissionTotals?.total_commission_percentage || 0,
      availableCommissionPercent: commissionTotals?.total_available_commission_percentage || 0,
      blockedCommission: sum('blockedCommission'),
      // Bonus metrics
      dailyBonusIn,
      dailyBonusOut,
      netDailyBonus: dailyBonusIn - dailyBonusOut,
      weekBonusIn,
      weekBonusOut,
      netWeekBonus: weekBonusIn - weekBonusOut,
      monthBonusIn,
      monthBonusOut,
      netMonthBonus: monthBonusIn - monthBonusOut,
      lifetimeBonusIn,
      lifetimeBonusOut,
      netLifetimeBonus: lifetimeBonusIn - lifetimeBonusOut,
      // Deposit/Withdrawal metrics
      weekDeposit,
      weekWithdrawal,
      netWeekDW: weekDeposit - weekWithdrawal,
      monthDeposit,
      monthWithdrawal,
      netMonthDW: monthDeposit - monthWithdrawal,
      lifetimeDeposit,
      lifetimeWithdrawal,
      netLifetimeDW: lifetimeDeposit - lifetimeWithdrawal,
      // Credit IN/OUT metrics
      weekCreditIn,
      monthCreditIn,
      lifetimeCreditIn,
      weekCreditOut,
      monthCreditOut,
      lifetimeCreditOut,
      netCredit: lifetimeCreditIn - lifetimeCreditOut,
      // Previous Equity metrics
      weekPreviousEquity,
      monthPreviousEquity,
      previousEquity
    }
  }, [clients, commissionTotals])

  // Get face card configuration by ID
  const getFaceCardConfig = (cardId, stats) => {
    const netDW = (stats.dailyDeposit || 0) - (stats.dailyWithdrawal || 0)
    
    const configs = {
      1: { id: 1, title: 'Total Clients', value: stats.totalClients, simple: true, borderColor: 'border-blue-200', textColor: 'text-blue-600' },
      2: { id: 2, title: 'Total Balance', value: formatIndianNumber(stats.totalBalance), simple: true, borderColor: 'border-indigo-200', textColor: 'text-indigo-600' },
      3: { id: 3, title: 'Total Credit', value: formatIndianNumber(stats.totalCredit), simple: true, borderColor: 'border-emerald-200', textColor: 'text-emerald-600' },
      4: { id: 4, title: 'Total Equity', value: formatIndianNumber(stats.totalEquity), simple: true, borderColor: 'border-sky-200', textColor: 'text-sky-600' },
      5: { id: 5, title: 'PNL', value: stats.totalPnl, withIcon: true, isPositive: stats.totalPnl >= 0, formattedValue: formatIndianNumber(Math.abs(stats.totalPnl)) },
      6: { id: 6, title: 'Floating Profit', value: stats.totalProfit, withIcon: true, isPositive: stats.totalProfit >= 0, formattedValue: formatIndianNumber(Math.abs(stats.totalProfit)), iconColor: stats.totalProfit >= 0 ? 'teal' : 'orange' },
      8: { id: 8, title: 'Daily Deposit', value: formatIndianNumber(stats.dailyDeposit), simple: true, borderColor: 'border-green-200', textColor: 'text-green-600', valueColor: 'text-green-700' },
      9: { id: 9, title: 'Daily Withdrawal', value: formatIndianNumber(stats.dailyWithdrawal), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      10: { id: 10, title: 'Daily PnL', value: stats.dailyPnL, withArrow: true, isPositive: stats.dailyPnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.dailyPnL)), borderColor: stats.dailyPnL >= 0 ? 'border-emerald-200' : 'border-rose-200', textColor: stats.dailyPnL >= 0 ? 'text-emerald-600' : 'text-rose-600', valueColor: stats.dailyPnL >= 0 ? 'text-emerald-700' : 'text-rose-700' },
      11: { id: 11, title: 'This Week PnL', value: stats.thisWeekPnL, withArrow: true, isPositive: stats.thisWeekPnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.thisWeekPnL)), borderColor: stats.thisWeekPnL >= 0 ? 'border-cyan-200' : 'border-amber-200', textColor: stats.thisWeekPnL >= 0 ? 'text-cyan-600' : 'text-amber-600', valueColor: stats.thisWeekPnL >= 0 ? 'text-cyan-700' : 'text-amber-700' },
      12: { id: 12, title: 'This Month PnL', value: stats.thisMonthPnL, withArrow: true, isPositive: stats.thisMonthPnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.thisMonthPnL)), borderColor: stats.thisMonthPnL >= 0 ? 'border-teal-200' : 'border-orange-200', textColor: stats.thisMonthPnL >= 0 ? 'text-teal-600' : 'text-orange-600', valueColor: stats.thisMonthPnL >= 0 ? 'text-teal-700' : 'text-orange-700' },
      13: { id: 13, title: 'Lifetime PnL', value: stats.lifetimePnL, withArrow: true, isPositive: stats.lifetimePnL >= 0, formattedValue: formatIndianNumber(Math.abs(stats.lifetimePnL)), borderColor: stats.lifetimePnL >= 0 ? 'border-violet-200' : 'border-pink-200', textColor: stats.lifetimePnL >= 0 ? 'text-violet-600' : 'text-pink-600', valueColor: stats.lifetimePnL >= 0 ? 'text-violet-700' : 'text-pink-700' },
      14: { id: 14, title: 'Net DW', value: netDW, withArrow: true, isPositive: netDW >= 0, formattedValue: formatIndianNumber(Math.abs(netDW)), borderColor: netDW >= 0 ? 'border-green-200' : 'border-red-200', textColor: netDW >= 0 ? 'text-green-600' : 'text-red-600', valueColor: netDW >= 0 ? 'text-green-700' : 'text-red-700' },
      15: { id: 15, title: 'Total Commission', value: stats.totalCommission, withArrow: true, isPositive: stats.totalCommission >= 0, formattedValue: formatIndianNumber(Math.abs(stats.totalCommission || 0)), borderColor: 'border-amber-200', textColor: 'text-amber-600', valueColor: 'text-amber-700' },
      16: { id: 16, title: 'Available Commission', value: stats.availableCommission, withArrow: true, isPositive: stats.availableCommission >= 0, formattedValue: formatIndianNumber(Math.abs(stats.availableCommission || 0)), borderColor: 'border-lime-200', textColor: 'text-lime-600', valueColor: 'text-lime-700' },
      17: { id: 17, title: 'Total Commission %', value: stats.totalCommissionPercent, withArrow: true, isPositive: stats.totalCommissionPercent >= 0, formattedValue: `${(Math.abs(stats.totalCommissionPercent || 0)).toFixed(2)}%`, borderColor: 'border-amber-300', textColor: 'text-amber-700', valueColor: 'text-amber-800' },
      18: { id: 18, title: 'Available Commission %', value: stats.availableCommissionPercent, withArrow: true, isPositive: stats.availableCommissionPercent >= 0, formattedValue: `${(Math.abs(stats.availableCommissionPercent || 0)).toFixed(2)}%`, borderColor: 'border-lime-300', textColor: 'text-lime-700', valueColor: 'text-lime-800' },
      19: { id: 19, title: 'Blocked Commission', value: formatIndianNumber(stats.blockedCommission || 0), simple: true, borderColor: 'border-gray-300', textColor: 'text-gray-600', valueColor: 'text-gray-700' },
      // Daily Bonus
      20: { id: 20, title: 'Daily Bonus IN', value: formatIndianNumber(stats.dailyBonusIn || 0), simple: true, borderColor: 'border-emerald-200', textColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
      21: { id: 21, title: 'Daily Bonus OUT', value: formatIndianNumber(stats.dailyBonusOut || 0), simple: true, borderColor: 'border-rose-200', textColor: 'text-rose-600', valueColor: 'text-rose-700' },
      22: { id: 22, title: 'NET Daily Bonus', value: stats.netDailyBonus || 0, withArrow: true, isPositive: (stats.netDailyBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netDailyBonus || 0)), borderColor: (stats.netDailyBonus || 0) >= 0 ? 'border-green-200' : 'border-red-200', textColor: (stats.netDailyBonus || 0) >= 0 ? 'text-green-600' : 'text-red-600', valueColor: (stats.netDailyBonus || 0) >= 0 ? 'text-green-700' : 'text-red-700' },
      // Weekly Bonus
      23: { id: 23, title: 'Week Bonus IN', value: formatIndianNumber(stats.weekBonusIn || 0), simple: true, borderColor: 'border-cyan-200', textColor: 'text-cyan-600', valueColor: 'text-cyan-700' },
      24: { id: 24, title: 'Week Bonus OUT', value: formatIndianNumber(stats.weekBonusOut || 0), simple: true, borderColor: 'border-orange-200', textColor: 'text-orange-600', valueColor: 'text-orange-700' },
      25: { id: 25, title: 'NET Week Bonus', value: stats.netWeekBonus || 0, withArrow: true, isPositive: (stats.netWeekBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netWeekBonus || 0)), borderColor: (stats.netWeekBonus || 0) >= 0 ? 'border-cyan-200' : 'border-orange-200', textColor: (stats.netWeekBonus || 0) >= 0 ? 'text-cyan-600' : 'text-orange-600', valueColor: (stats.netWeekBonus || 0) >= 0 ? 'text-cyan-700' : 'text-orange-700' },
      // Monthly Bonus
      26: { id: 26, title: 'Monthly Bonus IN', value: formatIndianNumber(stats.monthBonusIn || 0), simple: true, borderColor: 'border-blue-200', textColor: 'text-blue-600', valueColor: 'text-blue-700' },
      27: { id: 27, title: 'Monthly Bonus OUT', value: formatIndianNumber(stats.monthBonusOut || 0), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      28: { id: 28, title: 'NET Monthly Bonus', value: stats.netMonthBonus || 0, withArrow: true, isPositive: (stats.netMonthBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netMonthBonus || 0)), borderColor: (stats.netMonthBonus || 0) >= 0 ? 'border-blue-200' : 'border-red-200', textColor: (stats.netMonthBonus || 0) >= 0 ? 'text-blue-600' : 'text-red-600', valueColor: (stats.netMonthBonus || 0) >= 0 ? 'text-blue-700' : 'text-red-700' },
      // Lifetime Bonus
      29: { id: 29, title: 'Lifetime Bonus IN', value: formatIndianNumber(stats.lifetimeBonusIn || 0), simple: true, borderColor: 'border-purple-200', textColor: 'text-purple-600', valueColor: 'text-purple-700' },
      30: { id: 30, title: 'Lifetime Bonus OUT', value: formatIndianNumber(stats.lifetimeBonusOut || 0), simple: true, borderColor: 'border-pink-200', textColor: 'text-pink-600', valueColor: 'text-pink-700' },
      31: { id: 31, title: 'NET Lifetime Bonus', value: stats.netLifetimeBonus || 0, withArrow: true, isPositive: (stats.netLifetimeBonus || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netLifetimeBonus || 0)), borderColor: (stats.netLifetimeBonus || 0) >= 0 ? 'border-purple-200' : 'border-pink-200', textColor: (stats.netLifetimeBonus || 0) >= 0 ? 'text-purple-600' : 'text-pink-600', valueColor: (stats.netLifetimeBonus || 0) >= 0 ? 'text-purple-700' : 'text-pink-700' },
      // Weekly Deposit/Withdrawal
      32: { id: 32, title: 'Week Deposit', value: formatIndianNumber(stats.weekDeposit || 0), simple: true, borderColor: 'border-teal-200', textColor: 'text-teal-600', valueColor: 'text-teal-700' },
      33: { id: 33, title: 'Week Withdrawal', value: formatIndianNumber(stats.weekWithdrawal || 0), simple: true, borderColor: 'border-rose-200', textColor: 'text-rose-600', valueColor: 'text-rose-700' },
      34: { id: 34, title: 'NET Week DW', value: stats.netWeekDW || 0, withArrow: true, isPositive: (stats.netWeekDW || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netWeekDW || 0)), borderColor: (stats.netWeekDW || 0) >= 0 ? 'border-teal-200' : 'border-rose-200', textColor: (stats.netWeekDW || 0) >= 0 ? 'text-teal-600' : 'text-rose-600', valueColor: (stats.netWeekDW || 0) >= 0 ? 'text-teal-700' : 'text-rose-700' },
      // Monthly Deposit/Withdrawal
      35: { id: 35, title: 'Monthly Deposit', value: formatIndianNumber(stats.monthDeposit || 0), simple: true, borderColor: 'border-indigo-200', textColor: 'text-indigo-600', valueColor: 'text-indigo-700' },
      36: { id: 36, title: 'Monthly Withdrawal', value: formatIndianNumber(stats.monthWithdrawal || 0), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      37: { id: 37, title: 'NET Monthly DW', value: stats.netMonthDW || 0, withArrow: true, isPositive: (stats.netMonthDW || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netMonthDW || 0)), borderColor: (stats.netMonthDW || 0) >= 0 ? 'border-indigo-200' : 'border-red-200', textColor: (stats.netMonthDW || 0) >= 0 ? 'text-indigo-600' : 'text-red-600', valueColor: (stats.netMonthDW || 0) >= 0 ? 'text-indigo-700' : 'text-red-700' },
      // Lifetime Deposit/Withdrawal
      38: { id: 38, title: 'Lifetime Deposit', value: formatIndianNumber(stats.lifetimeDeposit || 0), simple: true, borderColor: 'border-green-200', textColor: 'text-green-600', valueColor: 'text-green-700' },
      39: { id: 39, title: 'Lifetime Withdrawal', value: formatIndianNumber(stats.lifetimeWithdrawal || 0), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      40: { id: 40, title: 'NET Lifetime DW', value: stats.netLifetimeDW || 0, withArrow: true, isPositive: (stats.netLifetimeDW || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netLifetimeDW || 0)), borderColor: (stats.netLifetimeDW || 0) >= 0 ? 'border-green-200' : 'border-red-200', textColor: (stats.netLifetimeDW || 0) >= 0 ? 'text-green-600' : 'text-red-600', valueColor: (stats.netLifetimeDW || 0) >= 0 ? 'text-green-700' : 'text-red-700' },
      // Credit IN
      41: { id: 41, title: 'Weekly Credit IN', value: formatIndianNumber(stats.weekCreditIn || 0), simple: true, borderColor: 'border-sky-200', textColor: 'text-sky-600', valueColor: 'text-sky-700' },
      42: { id: 42, title: 'Monthly Credit IN', value: formatIndianNumber(stats.monthCreditIn || 0), simple: true, borderColor: 'border-blue-200', textColor: 'text-blue-600', valueColor: 'text-blue-700' },
      43: { id: 43, title: 'Lifetime Credit IN', value: formatIndianNumber(stats.lifetimeCreditIn || 0), simple: true, borderColor: 'border-indigo-200', textColor: 'text-indigo-600', valueColor: 'text-indigo-700' },
      // Credit OUT
      44: { id: 44, title: 'Weekly Credit OUT', value: formatIndianNumber(stats.weekCreditOut || 0), simple: true, borderColor: 'border-orange-200', textColor: 'text-orange-600', valueColor: 'text-orange-700' },
      45: { id: 45, title: 'Monthly Credit OUT', value: formatIndianNumber(stats.monthCreditOut || 0), simple: true, borderColor: 'border-red-200', textColor: 'text-red-600', valueColor: 'text-red-700' },
      46: { id: 46, title: 'Lifetime Credit OUT', value: formatIndianNumber(stats.lifetimeCreditOut || 0), simple: true, borderColor: 'border-rose-200', textColor: 'text-rose-600', valueColor: 'text-rose-700' },
      // NET Credit
      47: { id: 47, title: 'NET Credit', value: stats.netCredit || 0, withArrow: true, isPositive: (stats.netCredit || 0) >= 0, formattedValue: formatIndianNumber(Math.abs(stats.netCredit || 0)), borderColor: (stats.netCredit || 0) >= 0 ? 'border-green-200' : 'border-red-200', textColor: (stats.netCredit || 0) >= 0 ? 'text-green-600' : 'text-red-600', valueColor: (stats.netCredit || 0) >= 0 ? 'text-green-700' : 'text-red-700' },
      // Previous Equity
      48: { id: 48, title: 'Weekly Previous Equity', value: formatIndianNumber(stats.weekPreviousEquity || 0), simple: true, borderColor: 'border-violet-200', textColor: 'text-violet-600', valueColor: 'text-violet-700' },
      49: { id: 49, title: 'Monthly Previous Equity', value: formatIndianNumber(stats.monthPreviousEquity || 0), simple: true, borderColor: 'border-purple-200', textColor: 'text-purple-600', valueColor: 'text-purple-700' },
      50: { id: 50, title: 'Previous Equity', value: formatIndianNumber(stats.previousEquity || 0), simple: true, borderColor: 'border-fuchsia-200', textColor: 'text-fuchsia-600', valueColor: 'text-fuchsia-700' }
    }
    return configs[cardId]
  }

  // Format currency for tables
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '$0.00'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)
  }

  // Calculate total positions P&L
  const totalPositionsPnL = useMemo(() => {
    return positions.reduce((sum, pos) => sum + (pos.profit || 0), 0)
  }, [positions])

  // Get top profitable clients
  const topProfitableClients = useMemo(() => {
    // Align with Client2 metrics using normalized `lifetimePnL`
    return [...clients]
      .sort((a, b) => (toNum(b.lifetimePnL) || 0) - (toNum(a.lifetimePnL) || 0))
      .slice(0, 5)
      .map(client => [
        client.login || '-',
        client.name || '-',
        formatCurrency(toNum(client.balance)),
        <span className={(toNum(client.lifetimePnL) || 0) >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
          {formatCurrency(toNum(client.lifetimePnL) || 0)}
        </span>
      ])
  }, [clients])

  // Get recent large positions
  const recentPositions = useMemo(() => {
    return [...positions]
      .sort((a, b) => Math.abs(b.profit || 0) - Math.abs(a.profit || 0))
      .slice(0, 5)
      .map(pos => [
        pos.login || '-',
        pos.symbol || '-',
        pos.type === 0 ? 'BUY' : 'SELL',
        formatCurrency(pos.volume || 0),
        <span className={(pos.profit || 0) >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
          {formatCurrency(pos.profit || 0)}
        </span>
      ])
  }, [positions])

  // Render mobile view
  if (isMobile) {
    return (
      <DashboardMobileView
        faceCardTotals={faceCardTotals}
        getFaceCardConfig={getFaceCardConfig}
        faceCardOrder={faceCardOrder}
        topProfitableClients={topProfitableClients}
        recentPositions={recentPositions}
        connectionState={connectionState}
        clientsCount={clients.length}
        positionsCount={positions.length}
        ordersCount={orders.length}
      />
    )
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
      />
      
      {/* Main Content */}
      <main className={`flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}>
        <div className="w-full mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-white shadow-sm"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  Dashboard
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Welcome back, {user?.full_name || user?.username}
                </p>
              </div>
            </div>
            <WebSocketIndicator />
          </div>

          {/* Face Cards Header with Reset Button and Card Filter */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              <p className="text-xs text-gray-600">Drag cards to reorder</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Card Filter Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowCardFilter(!showCardFilter)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors flex items-center gap-1.5 border border-blue-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Card Filter
                </button>
                {showCardFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowCardFilter(false)}></div>
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-20 max-h-96 overflow-y-auto">
                      <div className="p-3 border-b border-gray-200">
                        <p className="text-xs font-semibold text-gray-700">Show/Hide Cards</p>
                      </div>
                      <div className="px-3 py-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder="Search cards..."
                          value={cardFilterSearchQuery}
                          onChange={(e) => setCardFilterSearchQuery(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs text-gray-700 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-gray-400"
                        />
                      </div>
                      <div className="p-2">
                        {defaultFaceCardOrder.filter(cardId => {
                          const card = getFaceCardConfig(cardId, faceCardTotals)
                          if (!card) return false
                          return card.title.toLowerCase().includes(cardFilterSearchQuery.toLowerCase())
                        }).map(cardId => {
                          const card = getFaceCardConfig(cardId, faceCardTotals)
                          if (!card) return null
                          return (
                            <label key={cardId} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cardVisibility[cardId]}
                                onChange={() => toggleCardVisibility(cardId)}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <span className="text-xs text-gray-700">{card.title}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <button
                onClick={resetCardOrder}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors flex items-center gap-1.5 border border-blue-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Order
              </button>
            </div>
          </div>

          {/* Face Cards - All Metrics (Draggable) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {faceCardOrder.map((cardId) => {
              const card = getFaceCardConfig(cardId, faceCardTotals)
              if (!card || !cardVisibility[cardId]) return null
              
              // Simple cards (no icons)
              if (card.simple) {
                return (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, card.id)}
                    className={`bg-white rounded shadow-sm border ${card.borderColor} p-2 cursor-move transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95`}
                  >
                    <p className={`text-[10px] font-semibold ${card.textColor} uppercase tracking-wider mb-1`}>{card.title}</p>
                    <p className={`text-sm font-bold ${card.valueColor || 'text-gray-900'}`}>
                      {card.value}
                    </p>
                  </div>
                )
              }
              
              // Cards with icon (PNL, Floating Profit)
              if (card.withIcon) {
                const iconColor = card.iconColor || (card.isPositive ? 'green' : 'red')
                return (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, card.id)}
                    className={`bg-white rounded shadow-sm border ${card.isPositive ? `border-${iconColor}-200` : `border-${iconColor === 'green' ? 'red' : iconColor}-200`} p-2 cursor-move transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-[10px] font-semibold ${card.isPositive ? `text-${iconColor}-600` : `text-${iconColor === 'green' ? 'red' : iconColor}-600`} uppercase`}>{card.title}</p>
                      <div className={`w-6 h-6 ${card.isPositive ? `bg-${iconColor}-50 border border-${iconColor}-100` : `bg-${iconColor === 'green' ? 'red' : iconColor}-50 border border-${iconColor === 'green' ? 'red' : iconColor}-100`} rounded-lg flex items-center justify-center`}>
                        <svg className={`w-3 h-3 ${card.isPositive ? `text-${iconColor}-600` : `text-${iconColor === 'green' ? 'red' : iconColor}-600`}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          {card.isPositive ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                          )}
                        </svg>
                      </div>
                    </div>
                    <p className={`text-sm font-bold ${card.isPositive ? `text-${iconColor}-600` : `text-${iconColor === 'green' ? 'red' : iconColor}-600`}`}>
                      {card.isPositive ? '▲ ' : '▼ '}
                      {card.isPositive ? '' : '-'}
                      {card.formattedValue}
                    </p>
                  </div>
                )
              }
              
              // Cards with arrow (PnL cards)
              if (card.withArrow) {
                return (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, card.id)}
                    className={`bg-white rounded shadow-sm border ${card.borderColor} p-2 cursor-move transition-all duration-200 hover:shadow-md hover:scale-105 active:scale-95`}
                  >
                    <p className={`text-[10px] font-semibold ${card.textColor} uppercase mb-1`}>{card.title}</p>
                    <p className={`text-sm font-bold ${card.valueColor}`}>
                      {card.isPositive ? '▲ ' : '▼ '}
                      {card.isPositive ? '' : '-'}
                      {card.formattedValue}
                    </p>
                  </div>
                )
              }
              
              return null
            })}
          </div>

          {/* Quick Actions */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <QuickActionCard
                title="View Clients 2"
                description="Manage client accounts"
                path="/client2"
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
                gradient="from-blue-500 to-blue-600"
              />

              <QuickActionCard
                title="View Positions"
                description="Monitor open positions"
                path="/positions"
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
                gradient="from-green-500 to-green-600"
              />

              <QuickActionCard
                title="Pending Orders"
                description={`${orders.length} pending`}
                path="/pending-orders"
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                }
                gradient="from-orange-500 to-orange-600"
              />

              <QuickActionCard
                title="Live Dealing"
                description="Real-time trades"
                path="/live-dealing"
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
                gradient="from-purple-500 to-purple-600"
              />
              <QuickActionCard
                title="Graphical Analytics"
                description="Charts and insights"
                path="/analytics"
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3v18m-4-8l-4 4m8-4l4 4m4-12l-4 4" />
                  </svg>
                }
                gradient="from-indigo-500 to-indigo-600"
              />
            </div>
          </div>

          {/* Data Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <MiniDataTable
              title="Top Profitable Clients"
              headers={['Login', 'Name', 'Balance', 'Lifetime P&L']}
              rows={topProfitableClients}
              onViewAll={() => navigate('/client2')}
              loading={clientsLoading}
              emptyMessage="No clients data available"
            />

            <MiniDataTable
              title="Largest Open Positions"
              headers={['Login', 'Symbol', 'Type', 'Volume', 'Profit']}
              rows={recentPositions}
              onViewAll={() => navigate('/positions')}
              loading={false}
              emptyMessage="No positions data available"
            />
          </div>

          {/* System Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">System Status</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-2 ${
                  connectionState === 'connected' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  <div className={`w-3 h-3 rounded-full ${
                    connectionState === 'connected' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                </div>
                <p className="text-xs font-medium text-gray-900">WebSocket</p>
                <p className="text-xs text-gray-500 capitalize">{connectionState}</p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-2">
                  <span className="text-lg font-bold text-blue-600">{clients.length}</span>
                </div>
                <p className="text-xs font-medium text-gray-900">Total Clients</p>
                <p className="text-xs text-gray-500">Active accounts</p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-2">
                  <span className="text-lg font-bold text-green-600">{positions.length}</span>
                </div>
                <p className="text-xs font-medium text-gray-900">Open Positions</p>
                <p className="text-xs text-gray-500">Active trades</p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 mb-2">
                  <span className="text-lg font-bold text-orange-600">{orders.length}</span>
                </div>
                <p className="text-xs font-medium text-gray-900">Pending Orders</p>
                <p className="text-xs text-gray-500">Awaiting execution</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default DashboardPage