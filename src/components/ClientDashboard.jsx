import React, { useState, useEffect } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { 
  FiUsers, FiDollarSign, FiTrendingUp, FiTrendingDown, FiCreditCard, 
  FiLock, FiGift, FiArrowUpCircle, FiArrowDownCircle, FiCalendar,
  FiPieChart, FiActivity, FiBarChart2, FiShield, FiPercent, FiClock,
  FiDatabase, FiRefreshCw, FiZap, FiTarget, FiAward, FiBookOpen,
  FiLayout, FiFilter
} from 'react-icons/fi'
import { 
  MdShowChart, MdTimeline, MdHistory, MdAutoGraph, MdDashboard 
} from 'react-icons/md'
import { 
  HiOutlineChartBar, HiOutlineChartSquareBar 
} from 'react-icons/hi'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

const ClientDashboard = ({ totals, clients, totalClients, rebateTotals }) => {
  // All available cards with their configuration (80 cards total)
  // Using exact field names and calculations from Client2Page getClient2CardConfig
  const allAvailableCards = [
    { key: 'totalClients', label: 'TOTAL CLIENTS', value: totalClients || 0, format: 'number', icon: FiUsers },
    { key: 'assets', label: 'ASSETS', value: totals?.assets || 0, format: 'currency', icon: FiTrendingUp },
    { key: 'balance', label: 'BALANCE', value: totals?.balance || 0, format: 'currency', icon: FiDollarSign },
    { key: 'blockedCommission', label: 'BLOCKED COMMISSION', value: totals?.blockedCommission || 0, format: 'currency', icon: FiLock },
    { key: 'blockedProfit', label: 'BLOCKED PROFIT', value: totals?.blockedProfit || 0, format: 'currency', icon: FiShield },
    { key: 'commission', label: 'COMMISSION', value: totals?.commission || 0, format: 'currency', icon: FiDollarSign },
    { key: 'credit', label: 'CREDIT', value: totals?.credit || 0, format: 'currency', icon: FiCreditCard },
    { key: 'dailyBonusIn', label: 'DAILY BONUS IN', value: totals?.dailyBonusIn || 0, format: 'currency', icon: FiGift },
    { key: 'dailyBonusOut', label: 'DAILY BONUS OUT', value: totals?.dailyBonusOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'dailyCreditIn', label: 'DAILY CREDIT IN', value: totals?.dailyCreditIn || 0, format: 'currency', icon: FiArrowUpCircle },
    { key: 'dailyCreditOut', label: 'DAILY CREDIT OUT', value: totals?.dailyCreditOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'dailyDeposit', label: 'DAILY DEPOSIT', value: totals?.dailyDeposit || 0, format: 'currency', icon: FiTrendingUp },
    { key: 'dailyPnL', label: 'DAILY P&L', value: totals?.dailyPnL || 0, format: 'currency', icon: FiActivity },
    { key: 'dailySOCompensationIn', label: 'DAILY SO COMPENSATION IN', value: totals?.dailySOCompensationIn || 0, format: 'currency', icon: FiArrowUpCircle },
    { key: 'dailySOCompensationOut', label: 'DAILY SO COMPENSATION OUT', value: totals?.dailySOCompensationOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'dailyWithdrawal', label: 'DAILY WITHDRAWAL', value: totals?.dailyWithdrawal || 0, format: 'currency', icon: FiTrendingDown },
    { key: 'dailyNetDW', label: 'DAILY NET D/W', value: (totals?.dailyDeposit || 0) - (totals?.dailyWithdrawal || 0), format: 'currency', icon: FiBarChart2 },
    { key: 'equity', label: 'EQUITY', value: totals?.equity || 0, format: 'currency', icon: FiPieChart },
    { key: 'floating', label: 'FLOATING', value: totals?.floating || 0, format: 'currency', icon: FiActivity },
    { key: 'liabilities', label: 'LIABILITIES', value: totals?.liabilities || 0, format: 'currency', icon: FiTrendingDown },
    { key: 'lifetimeBonusIn', label: 'LIFETIME BONUS IN', value: totals?.lifetimeBonusIn || 0, format: 'currency', icon: FiGift },
    { key: 'lifetimeBonusOut', label: 'LIFETIME BONUS OUT', value: totals?.lifetimeBonusOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'lifetimeCreditIn', label: 'LIFETIME CREDIT IN', value: totals?.lifetimeCreditIn || 0, format: 'currency', icon: FiCreditCard },
    { key: 'lifetimeCreditOut', label: 'LIFETIME CREDIT OUT', value: totals?.lifetimeCreditOut || 0, format: 'currency', icon: FiCreditCard },
    { key: 'lifetimeDeposit', label: 'LIFETIME DEPOSIT', value: totals?.lifetimeDeposit || 0, format: 'currency', icon: FiDatabase },
    { key: 'lifetimePnL', label: 'LIFETIME P&L', value: totals?.lifetimePnL || 0, format: 'currency', icon: MdShowChart },
    { key: 'lifetimeSOCompensationIn', label: 'LIFETIME SO COMPENSATION IN', value: totals?.lifetimeSOCompensationIn || 0, format: 'currency', icon: FiArrowUpCircle },
    { key: 'lifetimeSOCompensationOut', label: 'LIFETIME SO COMPENSATION OUT', value: totals?.lifetimeSOCompensationOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'lifetimeWithdrawal', label: 'LIFETIME WITHDRAWAL', value: totals?.lifetimeWithdrawal || 0, format: 'currency', icon: FiTrendingDown },
    { key: 'lifetimeCommission', label: 'LIFETIME COMMISSION', value: totals?.lifetimeCommission || 0, format: 'currency', icon: FiDollarSign },
    { key: 'lifetimeCorrection', label: 'LIFETIME CORRECTION', value: totals?.lifetimeCorrection || 0, format: 'currency', icon: FiRefreshCw },
    { key: 'lifetimeSwap', label: 'LIFETIME SWAP', value: totals?.lifetimeSwap || 0, format: 'currency', icon: FiRefreshCw },
    { key: 'margin', label: 'MARGIN', value: totals?.margin || 0, format: 'currency', icon: FiPercent },
    { key: 'marginFree', label: 'MARGIN FREE', value: totals?.marginFree || 0, format: 'currency', icon: FiZap },
    { key: 'marginInitial', label: 'MARGIN INITIAL', value: totals?.marginInitial || 0, format: 'currency', icon: FiTarget },
    { key: 'marginLevel', label: 'MARGIN LEVEL', value: totals?.marginLevel || 0, format: 'percent', icon: FiPercent },
    { key: 'marginMaintenance', label: 'MARGIN MAINTENANCE', value: totals?.marginMaintenance || 0, format: 'currency', icon: FiShield },
    { key: 'soEquity', label: 'SO EQUITY', value: totals?.soEquity || 0, format: 'currency', icon: FiPieChart },
    { key: 'soLevel', label: 'SO LEVEL', value: totals?.soLevel || 0, format: 'percent', icon: FiPercent },
    { key: 'soMargin', label: 'SO MARGIN', value: totals?.soMargin || 0, format: 'currency', icon: FiShield },
    { key: 'pnl', label: 'P&L', value: totals?.pnl || 0, format: 'currency', icon: FiBarChart2 },
    { key: 'previousEquity', label: 'PREVIOUS EQUITY', value: totals?.previousEquity || 0, format: 'currency', icon: MdHistory },
    { key: 'profit', label: 'PROFIT', value: totals?.profit || 0, format: 'currency', icon: FiTrendingUp },
    { key: 'storage', label: 'STORAGE', value: totals?.storage || 0, format: 'currency', icon: FiDatabase },
    { key: 'thisMonthBonusIn', label: 'THIS MONTH BONUS IN', value: totals?.thisMonthBonusIn || 0, format: 'currency', icon: FiGift },
    { key: 'thisMonthBonusOut', label: 'THIS MONTH BONUS OUT', value: totals?.thisMonthBonusOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'thisMonthCreditIn', label: 'THIS MONTH CREDIT IN', value: totals?.thisMonthCreditIn || 0, format: 'currency', icon: FiArrowUpCircle },
    { key: 'thisMonthCreditOut', label: 'THIS MONTH CREDIT OUT', value: totals?.thisMonthCreditOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'thisMonthDeposit', label: 'THIS MONTH DEPOSIT', value: totals?.thisMonthDeposit || 0, format: 'currency', icon: FiTrendingUp },
    { key: 'thisMonthPnL', label: 'THIS MONTH P&L', value: totals?.thisMonthPnL || 0, format: 'currency', icon: FiActivity },
    { key: 'thisMonthSOCompensationIn', label: 'THIS MONTH SO COMPENSATION IN', value: totals?.thisMonthSOCompensationIn || 0, format: 'currency', icon: FiArrowUpCircle },
    { key: 'thisMonthSOCompensationOut', label: 'THIS MONTH SO COMPENSATION OUT', value: totals?.thisMonthSOCompensationOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'thisMonthWithdrawal', label: 'THIS MONTH WITHDRAWAL', value: totals?.thisMonthWithdrawal || 0, format: 'currency', icon: FiTrendingDown },
    { key: 'thisMonthCommission', label: 'THIS MONTH COMMISSION', value: totals?.thisMonthCommission || 0, format: 'currency', icon: FiDollarSign },
    { key: 'thisMonthCorrection', label: 'THIS MONTH CORRECTION', value: totals?.thisMonthCorrection || 0, format: 'currency', icon: FiRefreshCw },
    { key: 'thisMonthSwap', label: 'THIS MONTH SWAP', value: totals?.thisMonthSwap || 0, format: 'currency', icon: FiRefreshCw },
    { key: 'thisWeekBonusIn', label: 'THIS WEEK BONUS IN', value: totals?.thisWeekBonusIn || 0, format: 'currency', icon: FiGift },
    { key: 'thisWeekBonusOut', label: 'THIS WEEK BONUS OUT', value: totals?.thisWeekBonusOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'thisWeekCreditIn', label: 'THIS WEEK CREDIT IN', value: totals?.thisWeekCreditIn || 0, format: 'currency', icon: FiArrowUpCircle },
    { key: 'thisWeekCreditOut', label: 'THIS WEEK CREDIT OUT', value: totals?.thisWeekCreditOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'thisWeekDeposit', label: 'THIS WEEK DEPOSIT', value: totals?.thisWeekDeposit || 0, format: 'currency', icon: FiTrendingUp },
    { key: 'thisWeekPnL', label: 'THIS WEEK P&L', value: totals?.thisWeekPnL || 0, format: 'currency', icon: FiActivity },
    { key: 'thisWeekSOCompensationIn', label: 'THIS WEEK SO COMPENSATION IN', value: totals?.thisWeekSOCompensationIn || 0, format: 'currency', icon: FiArrowUpCircle },
    { key: 'thisWeekSOCompensationOut', label: 'THIS WEEK SO COMPENSATION OUT', value: totals?.thisWeekSOCompensationOut || 0, format: 'currency', icon: FiArrowDownCircle },
    { key: 'thisWeekWithdrawal', label: 'THIS WEEK WITHDRAWAL', value: totals?.thisWeekWithdrawal || 0, format: 'currency', icon: FiTrendingDown },
    { key: 'thisWeekCommission', label: 'THIS WEEK COMMISSION', value: totals?.thisWeekCommission || 0, format: 'currency', icon: FiDollarSign },
    { key: 'thisWeekCorrection', label: 'THIS WEEK CORRECTION', value: totals?.thisWeekCorrection || 0, format: 'currency', icon: FiRefreshCw },
    { key: 'thisWeekSwap', label: 'THIS WEEK SWAP', value: totals?.thisWeekSwap || 0, format: 'currency', icon: FiRefreshCw },
    // Computed fields - matching Client2Page calculations
    { key: 'netDailyBonus', label: 'NET DAILY BONUS', value: (totals?.dailyBonusIn || 0) - (totals?.dailyBonusOut || 0), format: 'currency', icon: FiGift },
    { key: 'netWeekBonus', label: 'NET WEEK BONUS', value: (totals?.thisWeekBonusIn || 0) - (totals?.thisWeekBonusOut || 0), format: 'currency', icon: FiAward },
    { key: 'netWeekDW', label: 'NET WEEK DW', value: (totals?.thisWeekDeposit || 0) - (totals?.thisWeekWithdrawal || 0), format: 'currency', icon: FiBarChart2 },
    { key: 'availableRebate', label: 'AVAILABLE REBATE', value: rebateTotals?.availableRebate || 0, format: 'currency', icon: FiGift },
    { key: 'totalRebate', label: 'TOTAL REBATE', value: rebateTotals?.totalRebate || 0, format: 'currency', icon: FiAward },
    { key: 'netMonthDW', label: 'NET MONTHLY DW', value: (totals?.thisMonthDeposit || 0) - (totals?.thisMonthWithdrawal || 0), format: 'currency', icon: FiBarChart2 },
    { key: 'netMonthBonus', label: 'NET MONTHLY BONUS', value: (totals?.thisMonthBonusIn || 0) - (totals?.thisMonthBonusOut || 0), format: 'currency', icon: FiAward },
    { key: 'netLifetimeBonus', label: 'NET LIFETIME BONUS', value: (totals?.lifetimeBonusIn || 0) - (totals?.lifetimeBonusOut || 0), format: 'currency', icon: FiAward },
    { key: 'netLifetimeDW', label: 'NET LIFETIME DW', value: (totals?.lifetimeDeposit || 0) - (totals?.lifetimeWithdrawal || 0), format: 'currency', icon: MdShowChart },
    { key: 'netCredit', label: 'NET CREDIT', value: (totals?.lifetimeCreditIn || 0) - (totals?.lifetimeCreditOut || 0), format: 'currency', icon: FiCreditCard },
    { key: 'netLifetimePnL', label: 'NET LIFETIME PNL', value: (totals?.lifetimePnL || 0) - (rebateTotals?.totalRebate || 0), format: 'currency', icon: MdAutoGraph },
    { key: 'bookPnL', label: 'BOOK PNL', value: -((totals?.lifetimePnL || 0) + (totals?.floating || 0)), format: 'currency', icon: FiBookOpen },
  ]

  // Get initial selected cards from localStorage or defaults
  const getInitialSelectedCards = () => {
    try {
      const saved = localStorage.getItem('clientDashboardSelectedCards')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Error loading saved cards:', e)
    }
    return ['totalClients', 'dailyDeposit', 'equity'] // Default 3 cards
  }

  const [selectedCardKeys, setSelectedCardKeys] = useState(getInitialSelectedCards)
  const [showCardSelector, setShowCardSelector] = useState(false)
  const [performanceTab, setPerformanceTab] = useState('lifetime') // daily, week, month, lifetime
  const [cardSearchQuery, setCardSearchQuery] = useState('')
  
  // Save selected cards to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('clientDashboardSelectedCards', JSON.stringify(selectedCardKeys))
    } catch (e) {
      console.error('Error saving cards:', e)
    }
  }, [selectedCardKeys])

  const selectedCards = selectedCardKeys.map(key => 
    allAvailableCards.find(card => card.key === key)
  ).filter(Boolean)

  // Filter cards based on search query
  const filteredCards = allAvailableCards.filter(card => 
    card.label.toLowerCase().includes(cardSearchQuery.toLowerCase())
  )

  const formatValue = (value, format) => {
    const num = Number(value) || 0
    if (format === 'number') {
      return num.toLocaleString('en-IN')
    }
    return num.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  const getValueColor = (value) => {
    const num = Number(value) || 0
    if (num > 0) return 'text-[#16A34A]' // Green
    if (num < 0) return 'text-[#DC2626]' // Red
    return 'text-[#000000]' // Black
  }

  // Performance Analysis Data
  const getPerformanceData = () => {
    const data = {
      daily: {
        pnl: totals?.dailyPnL || 0,
        deposits: totals?.dailyDeposit || 0,
        withdrawals: totals?.dailyWithdrawal || 0,
        netProfit: totals?.dailyPnL || 0,
        // Account Summary
        netFlow: (totals?.dailyDeposit || 0) - (totals?.dailyWithdrawal || 0),
        bonusCredit: (totals?.dailyBonusIn || 0) - (totals?.dailyBonusOut || 0),
        floatingPL: totals?.floating || 0,
        marginUsed: totals?.margin || 0,
        freeMargin: totals?.marginFree || 0
      },
      week: {
        pnl: totals?.thisWeekPnL || 0,
        deposits: totals?.thisWeekDeposit || 0,
        commission: totals?.thisWeekCommission || 0,
        withdrawals: totals?.thisWeekWithdrawal || 0,
        netProfit: (totals?.thisWeekPnL || 0) + (totals?.thisWeekCommission || 0),
        // Account Summary
        netFlow: (totals?.thisWeekDeposit || 0) - (totals?.thisWeekWithdrawal || 0),
        bonusCredit: (totals?.thisWeekBonusIn || 0) - (totals?.thisWeekBonusOut || 0),
        adjustments: totals?.thisWeekCorrection || 0,
        floatingPL: totals?.floating || 0,
        marginUsed: totals?.margin || 0,
        freeMargin: totals?.marginFree || 0
      },
      month: {
        pnl: totals?.thisMonthPnL || 0,
        deposits: totals?.thisMonthDeposit || 0,
        commission: totals?.thisMonthCommission || 0,
        withdrawals: totals?.thisMonthWithdrawal || 0,
        netProfit: (totals?.thisMonthPnL || 0) + (totals?.thisMonthCommission || 0),
        // Account Summary
        netFlow: (totals?.thisMonthDeposit || 0) - (totals?.thisMonthWithdrawal || 0),
        bonusCredit: (totals?.thisMonthBonusIn || 0) - (totals?.thisMonthBonusOut || 0),
        adjustments: totals?.thisMonthCorrection || 0,
        floatingPL: totals?.floating || 0,
        marginUsed: totals?.margin || 0,
        freeMargin: totals?.marginFree || 0
      },
      lifetime: {
        pnl: totals?.lifetimePnL || 0,
        deposits: totals?.lifetimeDeposit || 0,
        commission: totals?.commission || 0,
        withdrawals: totals?.lifetimeWithdrawal || 0,
        netProfit: (totals?.lifetimePnL || 0) + (totals?.commission || 0),
        // Account Summary
        netFlow: (totals?.lifetimeDeposit || 0) - (totals?.lifetimeWithdrawal || 0),
        bonusCredit: (totals?.lifetimeBonusIn || 0) - (totals?.lifetimeBonusOut || 0),
        adjustments: totals?.lifetimeCorrection || 0,
        floatingPL: totals?.floating || 0,
        marginUsed: totals?.margin || 0,
        freeMargin: totals?.marginFree || 0
      }
    }
    return data[performanceTab]
  }

  const performanceData = getPerformanceData()

  // Chart Data for Balance vs Equity
  const chartData = {
    labels: ['Balance', 'Equity'],
    datasets: [
      {
        label: performanceTab.charAt(0).toUpperCase() + performanceTab.slice(1),
        data: [
          totals?.balance || 0,
          totals?.equity || 0
        ],
        backgroundColor: ['#E5E7EB', '#2563EB'],
        borderRadius: 8,
        barThickness: 120
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `${context.dataset.label}: $${context.parsed.y.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          display: true,
          color: '#F3F4F6'
        },
        ticks: {
          callback: (value) => `$${(value / 1000).toFixed(1)}K`
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  }

  const handleCardSelection = (cardKey) => {
    if (selectedCardKeys.includes(cardKey)) {
      // Remove card if already selected
      if (selectedCardKeys.length > 1) {
        setSelectedCardKeys(selectedCardKeys.filter(k => k !== cardKey))
      }
    } else {
      // Add card (replace last one if 3 are already selected)
      if (selectedCardKeys.length >= 3) {
        setSelectedCardKeys([...selectedCardKeys.slice(0, 2), cardKey])
      } else {
        setSelectedCardKeys([...selectedCardKeys, cardKey])
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Top 3 Cards Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MdDashboard className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Dashboard Overview</h2>
          </div>
          <button
            onClick={() => setShowCardSelector(!showCardSelector)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <FiFilter className="w-4 h-4" />
            Customize Cards
          </button>
        </div>

        {/* Card Selector Modal */}
        {showCardSelector && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-700">Select 3 cards to display</p>
              <button
                onClick={() => {
                  setShowCardSelector(false)
                  setCardSearchQuery('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Input */}
            <div className="mb-4 relative">
              <input
                type="text"
                value={cardSearchQuery}
                onChange={(e) => setCardSearchQuery(e.target.value)}
                placeholder="Search cards..."
                className="w-full px-4 py-2.5 pl-10 text-gray-900 text-sm font-medium bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
              />
              <svg 
                className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto">
              {filteredCards.length > 0 ? (
                filteredCards.map(card => (
                <button
                  key={card.key}
                  onClick={() => handleCardSelection(card.key)}
                  className={`p-3 rounded-lg text-left text-sm transition-all ${
                    selectedCardKeys.includes(card.key)
                      ? 'bg-blue-100 border-2 border-blue-600 text-blue-900'
                      : 'bg-white border-2 border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {React.createElement(card.icon, { className: 'w-5 h-5 mb-2' })}
                  <div className="font-medium text-xs">{card.label}</div>
                </button>
              ))
              ) : (
                <div className="col-span-full text-center py-8 text-gray-500">
                  <p className="text-sm">No cards found matching "{cardSearchQuery}"</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Selected 3 Cards Display */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {selectedCards.map((card, index) => (
            <div key={card.key} className="bg-gradient-to-br from-gray-50 to-white p-3 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{card.label}</span>
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  {React.createElement(card.icon, { className: 'w-3.5 h-3.5 text-blue-600' })}
                </div>
              </div>
              <div className={`text-lg font-bold ${getValueColor(card.value)}`}>
                {formatValue(card.value, card.format)}
                {card.format === 'currency' && <span className="text-[10px] font-normal text-gray-500 ml-1">USD</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Analysis Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MdAutoGraph className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Performance Analysis</h2>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            {[
              { label: 'Daily', icon: FiClock },
              { label: 'Week', icon: FiCalendar },
              { label: 'Month', icon: MdTimeline },
              { label: 'Lifetime', icon: MdHistory }
            ].map(tab => (
              <button
                key={tab.label}
                onClick={() => setPerformanceTab(tab.label.toLowerCase())}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                  performanceTab === tab.label.toLowerCase()
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {React.createElement(tab.icon, { className: 'w-4 h-4' })}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: P&L Performance */}
          <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-lg shadow-md border border-gray-100">
            <div className="mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total P&L</span>
            </div>
            <div className={`text-xl font-bold mb-4 ${getValueColor(performanceData.pnl)}`}>
              ${performanceData.pnl.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>

            <div className="space-y-2">
              {[
                { label: 'Deposits', value: performanceData.deposits, icon: FiTrendingUp, bgColor: 'bg-blue-100' },
                performanceData.commission !== undefined && { label: 'Commission', value: performanceData.commission, icon: FiDollarSign, bgColor: 'bg-purple-100' },
                { label: 'Withdrawals', value: performanceData.withdrawals, icon: FiTrendingDown, bgColor: 'bg-orange-100' },
                { label: 'Net Profit', value: performanceData.netProfit, icon: FiAward, bgColor: 'bg-green-100' }
              ].filter(Boolean).map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2.5 bg-white rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 ${item.bgColor} rounded-lg flex items-center justify-center`}>
                      {React.createElement(item.icon, { className: 'w-3.5 h-3.5 text-gray-600' })}
                    </div>
                    <span className="text-xs font-medium text-gray-700">{item.label}</span>
                  </div>
                  <span className={`text-base font-bold ${getValueColor(item.value)}`}>
                    ${item.value.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Account Summary */}
          <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-lg shadow-md border border-gray-100">
            <div className="mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Account Summary</span>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Net Flow', value: performanceData.netFlow, icon: FiBarChart2, bgColor: 'bg-blue-100', iconColor: 'text-blue-600' },
                { label: 'Bonus + Credit', value: performanceData.bonusCredit, icon: FiGift, bgColor: 'bg-purple-100', iconColor: 'text-purple-600' },
                performanceData.adjustments !== undefined && { label: 'Adjustments', value: performanceData.adjustments, icon: FiRefreshCw, bgColor: 'bg-orange-100', iconColor: 'text-orange-600' },
                { label: 'Floating P/L', value: performanceData.floatingPL, icon: FiActivity, bgColor: 'bg-yellow-100', iconColor: 'text-yellow-600' },
                { label: 'Margin Used', value: performanceData.marginUsed, icon: FiLock, bgColor: 'bg-red-100', iconColor: 'text-red-500' },
                { label: 'Free Margin', value: performanceData.freeMargin, icon: FiZap, bgColor: 'bg-green-100', iconColor: 'text-green-600' }
              ].filter(Boolean).map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2.5 bg-white rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 ${item.bgColor} rounded-lg flex items-center justify-center`}>
                      {React.createElement(item.icon, { className: `w-3.5 h-3.5 ${item.iconColor}` })}
                    </div>
                    <span className="text-xs font-medium text-gray-700">{item.label}</span>
                  </div>
                  <span className={`text-base font-bold ${getValueColor(item.value)}`}>
                    ${item.value.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Balance vs Equity Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-4">
          <HiOutlineChartBar className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Balance vs Equity</h2>
        </div>
        <div className="h-64">
          <Bar data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  )
}

export default ClientDashboard
