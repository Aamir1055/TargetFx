import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { brokerAPI } from '../services/api'

const GraphicalAnalyticsPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v !== null ? JSON.parse(v) : true
    } catch {
      return true
    }
  })
  const { user } = useAuth()
  const navigate = useNavigate()
  const { clients, positions } = useData()

  // Commission totals from API
  const [commissionTotals, setCommissionTotals] = useState(null)
  const [topIB, setTopIB] = useState([])
  const [loadingCommissions, setLoadingCommissions] = useState(true)

  // Time period filter
  const [timePeriod, setTimePeriod] = useState('monthly') // 'daily', 'weekly', 'monthly', 'lifetime', 'all'

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [totalsRes, ibRes] = await Promise.all([
          brokerAPI.getIBCommissionTotals(),
          brokerAPI.getIBCommissions(1, 10, '', 'available_commission', 'desc')
        ])
        setCommissionTotals(totalsRes?.data || null)
        setTopIB(ibRes?.data?.records || [])
      } catch (e) {
        console.error('Failed to fetch commission data:', e)
      } finally {
        setLoadingCommissions(false)
      }
    }
    fetchAll()
  }, [])

  // Calculate comprehensive stats
  const analytics = useMemo(() => {
    const list = clients || []
    const sum = (key) => list.reduce((acc, c) => acc + (typeof c?.[key] === 'number' ? c[key] : 0), 0)

    const totalPnl = list.reduce((acc, c) => {
      const pnl = typeof c?.pnl === 'number' ? c.pnl : ((c?.credit || 0) - (c?.equity || 0))
      return acc + (typeof pnl === 'number' && !isNaN(pnl) ? pnl : 0)
    }, 0)

    const totalBalance = sum('balance')
    const totalEquity = sum('equity')
    const totalCredit = sum('credit')
    const totalProfit = sum('profit')
    
    const dailyPnL = sum('dailyPnL')
    const weeklyPnL = sum('thisWeekPnL')
    const monthlyPnL = sum('thisMonthPnL')
    const lifetimePnL = sum('lifetimePnL')

    const dailyDeposit = sum('dailyDeposit')
    const dailyWithdrawal = sum('dailyWithdrawal')
    const weekDeposit = sum('thisWeekDeposit')
    const weekWithdrawal = sum('thisWeekWithdrawal')
    const monthDeposit = sum('thisMonthDeposit')
    const monthWithdrawal = sum('thisMonthWithdrawal')

    // Client segmentation by balance
    const segments = {
      micro: list.filter(c => (c.balance || 0) < 1000).length,
      small: list.filter(c => (c.balance || 0) >= 1000 && (c.balance || 0) < 10000).length,
      medium: list.filter(c => (c.balance || 0) >= 10000 && (c.balance || 0) < 100000).length,
      large: list.filter(c => (c.balance || 0) >= 100000).length
    }

    // Performance metrics
    const profitableClients = list.filter(c => (c.lifetimePnL || 0) > 0).length
    const losingClients = list.filter(c => (c.lifetimePnL || 0) < 0).length
    const winRate = list.length > 0 ? (profitableClients / list.length) * 100 : 0

    // Risk metrics
    const avgMarginLevel = list.length > 0 ? list.reduce((sum, c) => sum + (c.marginLevel || 0), 0) / list.length : 0
    const highRiskClients = list.filter(c => (c.marginLevel || 0) < 150).length

    // Trading activity
    const activeClients = list.filter(c => (c.profit || 0) !== 0).length
    const totalPositions = positions.length
    const avgPositionsPerClient = list.length > 0 ? totalPositions / list.length : 0

    // Growth metrics
    const dailyGrowth = totalBalance > 0 ? (dailyPnL / totalBalance) * 100 : 0
    const weeklyGrowth = totalBalance > 0 ? (weeklyPnL / totalBalance) * 100 : 0
    const monthlyGrowth = totalBalance > 0 ? (monthlyPnL / totalBalance) * 100 : 0

    return {
      totalClients: list.length,
      totalBalance,
      totalEquity,
      totalCredit,
      totalPnl,
      totalProfit,
      dailyPnL,
      weeklyPnL,
      monthlyPnL,
      lifetimePnL,
      dailyDeposit,
      dailyWithdrawal,
      netDailyFlow: dailyDeposit - dailyWithdrawal,
      weekDeposit,
      weekWithdrawal,
      netWeeklyFlow: weekDeposit - weekWithdrawal,
      monthDeposit,
      monthWithdrawal,
      netMonthlyFlow: monthDeposit - monthWithdrawal,
      segments,
      profitableClients,
      losingClients,
      winRate,
      avgMarginLevel,
      highRiskClients,
      activeClients,
      totalPositions,
      avgPositionsPerClient,
      dailyGrowth,
      weeklyGrowth,
      monthlyGrowth,
      commTotal: commissionTotals?.total_commission || 0,
      commAvail: commissionTotals?.total_available_commission || 0
    }
  }, [clients, positions, commissionTotals])

  const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n || 0)
  const fmtCompact = (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)

  // Get PnL value based on selected time period
  const getPnLByPeriod = () => {
    switch (timePeriod) {
      case 'daily': return analytics.dailyPnL
      case 'weekly': return analytics.weeklyPnL
      case 'monthly': return analytics.monthlyPnL
      case 'lifetime': return analytics.lifetimePnL
      default: return analytics.totalPnl
    }
  }

  const getDepositByPeriod = () => {
    switch (timePeriod) {
      case 'daily': return analytics.dailyDeposit
      case 'weekly': return analytics.weekDeposit
      case 'monthly': return analytics.monthDeposit
      default: return analytics.dailyDeposit
    }
  }

  const getWithdrawalByPeriod = () => {
    switch (timePeriod) {
      case 'daily': return analytics.dailyWithdrawal
      case 'weekly': return analytics.weekWithdrawal
      case 'monthly': return analytics.monthWithdrawal
      default: return analytics.dailyWithdrawal
    }
  }

  // Generate trend data for charts (mock historical data based on current values)
  const trendData = useMemo(() => {
    const periods = timePeriod === 'daily' ? 7 : timePeriod === 'weekly' ? 8 : timePeriod === 'monthly' ? 12 : 6
    const data = []
    const currentPnL = getPnLByPeriod()
    
    for (let i = periods - 1; i >= 0; i--) {
      const variance = (Math.random() - 0.5) * 0.3
      const value = currentPnL * (1 - (i * 0.1) + variance)
      data.push({
        period: i,
        value: value,
        label: timePeriod === 'daily' ? `Day ${periods - i}` : 
               timePeriod === 'weekly' ? `W${periods - i}` : 
               timePeriod === 'monthly' ? `M${periods - i}` : `P${periods - i}`
      })
    }
    return data
  }, [timePeriod, analytics])

  // Balance distribution data
  const balanceDistribution = useMemo(() => {
    const ranges = [
      { label: '<$500', min: 0, max: 500 },
      { label: '$500-1K', min: 500, max: 1000 },
      { label: '$1K-5K', min: 1000, max: 5000 },
      { label: '$5K-10K', min: 5000, max: 10000 },
      { label: '$10K-50K', min: 10000, max: 50000 },
      { label: '$50K+', min: 50000, max: Infinity }
    ]
    return ranges.map(range => ({
      ...range,
      count: clients.filter(c => (c.balance || 0) >= range.min && (c.balance || 0) < range.max).length
    }))
  }, [clients])

  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
      />
      
      <main className={`flex-1 p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} overflow-x-hidden`}>
        <div className="max-w-[1600px] mx-auto">
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
                <h1 className="text-3xl font-black bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Advanced Analytics
                </h1>
                <p className="text-sm text-gray-600 mt-1 font-medium">Comprehensive performance insights for {user?.full_name || user?.username}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold px-4 py-2 rounded-lg hover:bg-blue-50 transition-all border border-blue-200 flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </button>
          </div>

          {/* Time Period Filter */}
          <div className="mb-6 flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
            <span className="text-sm font-semibold text-gray-700">Time Period:</span>
            <div className="flex gap-2">
              {['daily', 'weekly', 'monthly', 'lifetime', 'all'].map(period => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period)}
                  className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                    timePeriod === period
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Executive KPIs - Tableau Style */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {/* Total Clients KPI */}
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-2xl p-6 shadow-lg border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-full">Active</span>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 mb-1">Total Clients</h3>
              <p className="text-4xl font-black text-gray-900 mb-2">{analytics.totalClients}</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-600 font-bold">↑ {analytics.activeClients} Active</span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600">{fmt(analytics.avgPositionsPerClient)} avg positions</span>
              </div>
            </div>

            {/* Total Equity KPI */}
            <div className="bg-gradient-to-br from-white to-emerald-50 rounded-2xl p-6 shadow-lg border-l-4 border-emerald-500">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">{((analytics.totalEquity / analytics.totalBalance) * 100).toFixed(1)}%</span>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 mb-1">Total Equity</h3>
              <p className="text-4xl font-black text-gray-900 mb-2">${fmtCompact(analytics.totalEquity)}</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">Balance: ${fmtCompact(analytics.totalBalance)}</span>
                <span className="text-gray-400">|</span>
                <span className="text-gray-600">Credit: ${fmtCompact(analytics.totalCredit)}</span>
              </div>
            </div>

            {/* PnL KPI */}
            <div className={`bg-gradient-to-br from-white ${getPnLByPeriod() >= 0 ? 'to-green-50 border-green-500' : 'to-red-50 border-red-500'} rounded-2xl p-6 shadow-lg border-l-4`}>
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 ${getPnLByPeriod() >= 0 ? 'bg-green-100' : 'bg-red-100'} rounded-xl flex items-center justify-center`}>
                  <svg className={`w-6 h-6 ${getPnLByPeriod() >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={getPnLByPeriod() >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
                  </svg>
                </div>
                <span className={`text-xs font-bold ${getPnLByPeriod() >= 0 ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'} px-3 py-1 rounded-full`}>
                  {getPnLByPeriod() >= 0 ? '↑' : '↓'} {timePeriod === 'daily' ? analytics.dailyGrowth.toFixed(2) : timePeriod === 'weekly' ? analytics.weeklyGrowth.toFixed(2) : analytics.monthlyGrowth.toFixed(2)}%
                </span>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 mb-1">P&L ({timePeriod})</h3>
              <p className={`text-4xl font-black mb-2 ${getPnLByPeriod() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${fmtCompact(Math.abs(getPnLByPeriod()))}
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600">Floating: ${fmtCompact(analytics.totalProfit)}</span>
              </div>
            </div>

            {/* Win Rate KPI */}
            <div className="bg-gradient-to-br from-white to-violet-50 rounded-2xl p-6 shadow-lg border-l-4 border-violet-500">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-violet-600 bg-violet-100 px-3 py-1 rounded-full">{analytics.winRate.toFixed(1)}%</span>
              </div>
              <h3 className="text-sm font-semibold text-gray-600 mb-1">Win Rate</h3>
              <p className="text-4xl font-black text-gray-900 mb-2">{analytics.profitableClients}/{analytics.totalClients}</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-green-600 font-bold">{analytics.profitableClients} Profitable</span>
                <span className="text-gray-400">|</span>
                <span className="text-red-600 font-bold">{analytics.losingClients} Loss</span>
              </div>
            </div>
          </div>

          {/* Main Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* PnL Trend Chart - Line Graph */}
            <div className="bg-white rounded-xl p-6 shadow border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                P&L Trend ({timePeriod})
              </h3>
              <div className="h-64">
                <svg viewBox="0 0 400 200" className="w-full h-full">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map(i => (
                    <line key={i} x1="40" y1={40 + i * 35} x2="380" y2={40 + i * 35} stroke="#e5e7eb" strokeWidth="1" />
                  ))}
                  
                  {/* Y-axis */}
                  <line x1="40" y1="20" x2="40" y2="180" stroke="#9ca3af" strokeWidth="2" />
                  {/* X-axis */}
                  <line x1="40" y1="180" x2="380" y2="180" stroke="#9ca3af" strokeWidth="2" />
                  
                  {/* Line chart */}
                  {trendData.length > 1 && (() => {
                    const maxVal = Math.max(...trendData.map(d => Math.abs(d.value)), 1)
                    const minVal = Math.min(...trendData.map(d => d.value), 0)
                    const range = maxVal - minVal || 1
                    const xStep = 340 / (trendData.length - 1)
                    
                    const points = trendData.map((d, i) => {
                      const x = 40 + i * xStep
                      const y = 180 - ((d.value - minVal) / range) * 160
                      return `${x},${y}`
                    }).join(' ')
                    
                    const areaPoints = `40,180 ${points} ${40 + (trendData.length - 1) * xStep},180`
                    
                    return (
                      <>
                        {/* Area fill */}
                        <polygon points={areaPoints} fill="url(#gradient)" opacity="0.2" />
                        {/* Line */}
                        <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="3" />
                        {/* Points */}
                        {trendData.map((d, i) => {
                          const x = 40 + i * xStep
                          const y = 180 - ((d.value - minVal) / range) * 160
                          return (
                            <g key={i}>
                              <circle cx={x} cy={y} r="4" fill="#fff" stroke="#3b82f6" strokeWidth="2" />
                              {i % Math.ceil(trendData.length / 6) === 0 && (
                                <text x={x} y="195" textAnchor="middle" fontSize="10" fill="#6b7280">
                                  {d.label}
                                </text>
                              )}
                            </g>
                          )
                        })}
                      </>
                    )
                  })()}
                  
                  {/* Gradient definition */}
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <div>
                  <span className="text-gray-600">Current: </span>
                  <span className={`font-bold ${getPnLByPeriod() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${fmtCompact(Math.abs(getPnLByPeriod()))}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Trend: </span>
                  <span className={`font-bold ${getPnLByPeriod() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {getPnLByPeriod() >= 0 ? '↑' : '↓'} {timePeriod === 'daily' ? analytics.dailyGrowth.toFixed(2) : timePeriod === 'weekly' ? analytics.weeklyGrowth.toFixed(2) : analytics.monthlyGrowth.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Balance Distribution - Bar Chart */}
            <div className="bg-white rounded-xl p-6 shadow border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                Client Balance Distribution
              </h3>
              <div className="h-64">
                <svg viewBox="0 0 400 200" className="w-full h-full">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map(i => (
                    <line key={i} x1="60" y1={40 + i * 35} x2="380" y2={40 + i * 35} stroke="#e5e7eb" strokeWidth="1" />
                  ))}
                  
                  {/* Y-axis */}
                  <line x1="60" y1="20" x2="60" y2="180" stroke="#9ca3af" strokeWidth="2" />
                  {/* X-axis */}
                  <line x1="60" y1="180" x2="380" y2="180" stroke="#9ca3af" strokeWidth="2" />
                  
                  {/* Bars */}
                  {balanceDistribution.map((range, i) => {
                    const maxCount = Math.max(...balanceDistribution.map(r => r.count), 1)
                    const barWidth = 45
                    const x = 70 + i * 55
                    const barHeight = (range.count / maxCount) * 140
                    const y = 180 - barHeight
                    
                    return (
                      <g key={i}>
                        {/* Bar */}
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          fill="#6366f1"
                          rx="4"
                        />
                        {/* Value on top */}
                        <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#4f46e5">
                          {range.count}
                        </text>
                        {/* Label */}
                        <text x={x + barWidth / 2} y="195" textAnchor="middle" fontSize="9" fill="#6b7280">
                          {range.label}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="text-center">
                  <p className="text-gray-600">Low Balance</p>
                  <p className="font-bold text-blue-600">{balanceDistribution.slice(0, 2).reduce((sum, r) => sum + r.count, 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">Mid Balance</p>
                  <p className="font-bold text-indigo-600">{balanceDistribution.slice(2, 4).reduce((sum, r) => sum + r.count, 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">High Balance</p>
                  <p className="font-bold text-violet-600">{balanceDistribution.slice(4).reduce((sum, r) => sum + r.count, 0)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Analytics Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Client Segmentation - Donut Chart */}
            <div className="bg-white rounded-xl p-6 shadow border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                Client Segments
              </h3>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-40 h-40">
                  <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#f3f4f6" strokeWidth="20" />
                    {(() => {
                      const total = analytics.segments.micro + analytics.segments.small + analytics.segments.medium + analytics.segments.large
                      if (total === 0) return null
                      let offset = 0
                      const segments = [
                        { value: analytics.segments.micro, color: '#3b82f6' },
                        { value: analytics.segments.small, color: '#10b981' },
                        { value: analytics.segments.medium, color: '#f59e0b' },
                        { value: analytics.segments.large, color: '#8b5cf6' }
                      ]
                      return segments.map((seg, i) => {
                        const percentage = (seg.value / total) * 100
                        const circumference = 2 * Math.PI * 40
                        const segmentLength = (percentage / 100) * circumference
                        const result = (
                          <circle
                            key={i}
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="20"
                            strokeDasharray={`${segmentLength} ${circumference}`}
                            strokeDashoffset={-offset}
                          />
                        )
                        offset += segmentLength
                        return result
                      })
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center flex-col">
                    <p className="text-2xl font-black text-gray-900">{analytics.totalClients}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Micro', count: analytics.segments.micro, color: 'bg-blue-500' },
                  { label: 'Small', count: analytics.segments.small, color: 'bg-emerald-500' },
                  { label: 'Medium', count: analytics.segments.medium, color: 'bg-amber-500' },
                  { label: 'Large', count: analytics.segments.large, color: 'bg-violet-500' }
                ].map((seg, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-3 h-3 ${seg.color} rounded`}></div>
                    <div>
                      <p className="text-xs text-gray-600">{seg.label}</p>
                      <p className="text-sm font-bold text-gray-900">{seg.count}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cash Flow Analysis with Chart */}
            <div className="bg-white rounded-xl p-6 shadow border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                Cash Flow ({timePeriod})
              </h3>
              <div className="h-32 mb-4">
                <svg viewBox="0 0 300 100" className="w-full h-full">
                  {/* Deposit bar */}
                  <rect x="20" y="20" width="120" height="25" fill="#10b981" rx="4" />
                  <text x="25" y="37" fill="white" fontSize="11" fontWeight="bold">Deposits</text>
                  <text x="145" y="37" fill="#10b981" fontSize="12" fontWeight="bold">${fmtCompact(getDepositByPeriod())}</text>
                  
                  {/* Withdrawal bar */}
                  <rect x="20" y="55" width="120" height="25" fill="#ef4444" rx="4" />
                  <text x="25" y="72" fill="white" fontSize="11" fontWeight="bold">Withdrawals</text>
                  <text x="145" y="72" fill="#ef4444" fontSize="12" fontWeight="bold">${fmtCompact(getWithdrawalByPeriod())}</text>
                </svg>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-700">Net Flow</span>
                  <span className={`text-2xl font-black ${(getDepositByPeriod() - getWithdrawalByPeriod()) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(getDepositByPeriod() - getWithdrawalByPeriod()) >= 0 ? '+' : '-'}${fmtCompact(Math.abs(getDepositByPeriod() - getWithdrawalByPeriod()))}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {(getDepositByPeriod() - getWithdrawalByPeriod()) >= 0 ? '✓ Positive inflow' : '⚠ Negative outflow'}
                </p>
              </div>
            </div>

            {/* Risk Dashboard with Gauge */}
            <div className="bg-white rounded-xl p-6 shadow border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                Risk Metrics
              </h3>
              <div className="flex items-center justify-center mb-4">
                {/* Gauge Chart */}
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100">
                    {/* Background arc */}
                    <path
                      d="M 10 80 A 40 40 0 0 1 90 80"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="12"
                      strokeLinecap="round"
                    />
                    {/* Progress arc */}
                    <path
                      d="M 10 80 A 40 40 0 0 1 90 80"
                      fill="none"
                      stroke={analytics.avgMarginLevel < 150 ? '#ef4444' : analytics.avgMarginLevel < 300 ? '#f59e0b' : '#10b981'}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.min(100, (analytics.avgMarginLevel / 500) * 126)} 126`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center mt-4">
                      <p className={`text-2xl font-black ${analytics.avgMarginLevel < 150 ? 'text-red-600' : analytics.avgMarginLevel < 300 ? 'text-orange-600' : 'text-green-600'}`}>
                        {fmt(analytics.avgMarginLevel)}%
                      </p>
                      <p className="text-xs text-gray-500">Avg Margin</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-xs text-red-700 font-semibold mb-1">High Risk</p>
                  <p className="text-2xl font-black text-red-600">{analytics.highRiskClients}</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-700 font-semibold mb-1">Positions</p>
                  <p className="text-2xl font-black text-blue-600">{analytics.totalPositions}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Comparison - Horizontal Bar Chart */}
          <div className="bg-white rounded-xl p-6 shadow border border-gray-200 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
              Performance Comparison (Period-over-Period)
            </h3>
            <div className="space-y-4">
              {[
                { label: 'Daily', value: analytics.dailyPnL, growth: analytics.dailyGrowth },
                { label: 'Weekly', value: analytics.weeklyPnL, growth: analytics.weeklyGrowth },
                { label: 'Monthly', value: analytics.monthlyPnL, growth: analytics.monthlyGrowth },
                { label: 'Lifetime', value: analytics.lifetimePnL, growth: 0 }
              ].map((period, idx) => {
                const maxVal = Math.max(Math.abs(analytics.dailyPnL), Math.abs(analytics.weeklyPnL), Math.abs(analytics.monthlyPnL), Math.abs(analytics.lifetimePnL), 1)
                const barWidth = (Math.abs(period.value) / maxVal) * 100
                
                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700 w-20">{period.label}</span>
                      <span className={`text-lg font-black ${period.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {period.value >= 0 ? '+' : '-'}${fmtCompact(Math.abs(period.value))}
                      </span>
                      {period.growth !== 0 && (
                        <span className={`text-xs font-bold px-2 py-1 rounded ${period.value >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {period.value >= 0 ? '↑' : '↓'} {period.growth.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                      <div
                        className={`h-full rounded-lg ${period.value >= 0 ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gradient-to-r from-red-500 to-red-400'}`}
                        style={{ width: `${barWidth}%` }}
                      >
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-white">
                          {barWidth.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Commission Overview with Chart */}
          <div className="bg-white rounded-xl p-6 shadow border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              Commission Insights
            </h3>
            {loadingCommissions ? (
              <div className="text-center py-8 text-gray-500">Loading commission data...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700">Total Commission</span>
                      <span className="text-2xl font-black text-amber-600">${fmtCompact(analytics.commTotal)}</span>
                    </div>
                    <div className="h-4 bg-gray-100 rounded-lg overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700">Available</span>
                      <span className="text-2xl font-black text-green-600">${fmtCompact(analytics.commAvail)}</span>
                    </div>
                    <div className="h-4 bg-gray-100 rounded-lg overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-400 to-green-500" style={{ width: `${analytics.commTotal > 0 ? (analytics.commAvail / analytics.commTotal) * 100 : 0}%` }}></div>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      {analytics.commTotal > 0 ? ((analytics.commAvail / analytics.commTotal) * 100).toFixed(1) : 0}% available for withdrawal
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-700 mb-3">Top 5 IB Partners</h4>
                  <div className="space-y-2">
                    {topIB.slice(0, 5).map((ib, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg border border-blue-100">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-orange-600' : 'bg-blue-500'}`}>
                          #{idx + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-gray-900">{ib.name || ib.email}</p>
                          <p className="text-xs text-blue-600 font-bold">${fmt(ib.available_commission || 0)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Insights Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h4 className="font-bold text-gray-900">Growth Trend</h4>
              </div>
              <p className="text-sm text-gray-700 mb-2">
                {analytics.monthlyGrowth >= 0 ? 'Positive' : 'Negative'} momentum with <span className="font-bold text-blue-600">{Math.abs(analytics.monthlyGrowth).toFixed(2)}%</span> monthly growth
              </p>
              <p className="text-xs text-gray-600">
                {analytics.profitableClients > analytics.losingClients ? '✓ More clients are profitable' : '⚠ Monitor client performance'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 border border-emerald-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="font-bold text-gray-900">Capital Health</h4>
              </div>
              <p className="text-sm text-gray-700 mb-2">
                Equity ratio at <span className="font-bold text-emerald-600">{((analytics.totalEquity / analytics.totalBalance) * 100).toFixed(1)}%</span>
              </p>
              <p className="text-xs text-gray-600">
                {((analytics.totalEquity / analytics.totalBalance) * 100) > 80 ? '✓ Strong capital position' : '⚠ Monitor leverage'}
              </p>
            </div>

            <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-6 border border-violet-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-violet-500 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h4 className="font-bold text-gray-900">Client Activity</h4>
              </div>
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-bold text-violet-600">{((analytics.activeClients / analytics.totalClients) * 100).toFixed(0)}%</span> active trading rate
              </p>
              <p className="text-xs text-gray-600">
                {analytics.avgPositionsPerClient.toFixed(1)} avg positions per client
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default GraphicalAnalyticsPage
