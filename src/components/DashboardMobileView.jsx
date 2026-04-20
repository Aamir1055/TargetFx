import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const formatNum = (n) => {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0.00'
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatCurrency = (value) => {
  if (value === null || value === undefined) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

export default function DashboardMobileView({ 
  faceCardTotals, 
  getFaceCardConfig, 
  faceCardOrder, 
  topIBCommissions, 
  ibCommissionsLoading,
  topProfitableClients,
  recentPositions,
  connectionState,
  clientsCount,
  positionsCount,
  ordersCount
}) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [showViewAll, setShowViewAll] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [orderedCards, setOrderedCards] = useState([])
  const [dragStartLabel, setDragStartLabel] = useState(null)
  const [showCardFilter, setShowCardFilter] = useState(false)
  const [cardFilterSearchQuery, setCardFilterSearchQuery] = useState('')
  const [touchStartPos, setTouchStartPos] = useState(null)
  const [touchedCard, setTouchedCard] = useState(null)
  const CARD_ORDER_KEY = 'dashboard-mobile-card-order-v2' // Changed key to force reset
  const CARD_VISIBILITY_KEY = 'dashboardMobileCardVisibility'
  const CARD_VISIBILITY_VERSION = 'v3' // Increment this when changing default cards

  // Default card visibility - Show only 4 cards by default
  const defaultCardVisibility = (() => {
    const vis = {}
    for (let i = 1; i <= 50; i++) vis[i] = false
    // Show only 4 default cards
    vis[1] = true   // Total Clients
    vis[8] = true   // Daily Deposit
    vis[13] = true  // Lifetime PnL
    vis[40] = true  // NET Lifetime DW
    return vis
  })()

  const [cardVisibility, setCardVisibility] = useState(() => {
    const savedVersion = localStorage.getItem(CARD_VISIBILITY_KEY + '_version')
    const saved = localStorage.getItem(CARD_VISIBILITY_KEY)
    
    // Reset to defaults if version changed or no saved data
    if (savedVersion !== CARD_VISIBILITY_VERSION || !saved) {
      localStorage.setItem(CARD_VISIBILITY_KEY + '_version', CARD_VISIBILITY_VERSION)
      localStorage.setItem(CARD_VISIBILITY_KEY, JSON.stringify(defaultCardVisibility))
      return defaultCardVisibility
    }
    
    return JSON.parse(saved)
  })

  // Toggle card visibility
  const toggleCardVisibility = (cardId) => {
    const updated = { ...cardVisibility, [cardId]: !cardVisibility[cardId] }
    setCardVisibility(updated)
    localStorage.setItem(CARD_VISIBILITY_KEY, JSON.stringify(updated))
  }

  // Initialize card order from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CARD_ORDER_KEY)
      if (saved) {
        setOrderedCards(JSON.parse(saved))
      } else {
        // Default order - include all cards from faceCardOrder
        const defaultOrder = faceCardOrder.map(id => {
          const card = getFaceCardConfig(id, faceCardTotals)
          return card ? card.title : null
        }).filter(Boolean)
        setOrderedCards(defaultOrder)
        localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(defaultOrder))
      }
    } catch (err) {
      console.error('Failed to load card order:', err)
      const defaultOrder = faceCardOrder.map(id => {
        const card = getFaceCardConfig(id, faceCardTotals)
        return card ? card.title : null
      }).filter(Boolean)
      setOrderedCards(defaultOrder)
    }
  }, [faceCardOrder, faceCardTotals, getFaceCardConfig])

  // Get cards in order and filter by visibility
  const getOrderedCards = () => {
    return orderedCards.map(title => {
      // Find card by title
      const cardId = faceCardOrder.find(id => {
        const card = getFaceCardConfig(id, faceCardTotals)
        return card && card.title === title
      })
      if (!cardId) return null
      const card = getFaceCardConfig(cardId, faceCardTotals)
      // Filter by visibility
      if (card && cardVisibility[cardId]) {
        return card
      }
      return null
    }).filter(Boolean)
  }

  // Get icon path for each card
  const getCardIcon = (cardTitle) => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'Total Clients': `${baseUrl}Desktop cards icons/Total Clients.svg`,
      'Total Balance': `${baseUrl}Desktop cards icons/Total Balance.svg`,
      'Total Credit': `${baseUrl}Desktop cards icons/Total Credit.svg`,
      'Total Equity': `${baseUrl}Desktop cards icons/Total Equity.svg`,
      'PNL': `${baseUrl}Desktop cards icons/PNL.svg`,
      'Floating Profit': `${baseUrl}Desktop cards icons/Floating Profit.svg`,
      'Daily Deposit': `${baseUrl}Desktop cards icons/Daily Deposite.svg`,
      'Daily Withdrawal': `${baseUrl}Desktop cards icons/Daily WITHDRAWL.svg`,
      'Daily PnL': `${baseUrl}Desktop cards icons/Daily PNL.svg`,
      'This Week PnL': `${baseUrl}Desktop cards icons/This week pnl.svg`,
      'This Month PnL': `${baseUrl}Desktop cards icons/THIS MONTH PNL.svg`,
      'Lifetime PnL': `${baseUrl}Desktop cards icons/LIFETIME PNL.svg`,
      'Net DW': `${baseUrl}Desktop cards icons/NET WD.svg`,
      'Total Commission': `${baseUrl}Desktop cards icons/TOTAL COMMISION.svg`,
      'Available Commission': `${baseUrl}Desktop cards icons/AVAILABLE Commision.svg`,
      'Total Commission %': `${baseUrl}Desktop cards icons/TOTAL COMMISION%25.svg`,
      'Available Commission %': `${baseUrl}Desktop cards icons/AVAILABLE Commision%25.svg`,
      'Blocked Commission': `${baseUrl}Desktop cards icons/Blocked commision.svg`,
      'Daily Bonus IN': `${baseUrl}Desktop cards icons/Daily BONUS IN.svg`,
      'Daily Bonus OUT': `${baseUrl}Desktop cards icons/Daily BONUS OUT.svg`,
      'NET Daily Bonus': `${baseUrl}Desktop cards icons/Net Daily Bonus.svg`,
      'Week Bonus IN': `${baseUrl}Desktop cards icons/Weekly bonus in.svg`,
      'Week Bonus OUT': `${baseUrl}Desktop cards icons/WEEK BONUS OUT.svg`,
      'NET Week Bonus': `${baseUrl}Desktop cards icons/NET WEEK BONUS.svg`,
      'Monthly Bonus IN': `${baseUrl}Desktop cards icons/MONTHLY BONUS IN.svg`,
      'Monthly Bonus OUT': `${baseUrl}Desktop cards icons/MONTHLY BONUS OUt.svg`,
      'NET Monthly Bonus': `${baseUrl}Desktop cards icons/NET MONTHLY BONUS.svg`,
      'Lifetime Bonus IN': `${baseUrl}Desktop cards icons/LIFETIME BONUS IN.svg`,
      'Lifetime Bonus OUT': `${baseUrl}Desktop cards icons/LIFETIME BONUS OUT.svg`,
      'NET Lifetime Bonus': `${baseUrl}Desktop cards icons/NET LIFETIME BONUS.svg`,
      'Week Deposit': `${baseUrl}Desktop cards icons/WEEK DEPOSITE.svg`,
      'Week Withdrawal': `${baseUrl}Desktop cards icons/WEEK WITHDRAWL.svg`,
      'NET Week DW': `${baseUrl}Desktop cards icons/NET WEEK DAY.svg`,
      'Monthly Deposit': `${baseUrl}Desktop cards icons/MONTLY DEPOSITE.svg`,
      'Monthly Withdrawal': `${baseUrl}Desktop cards icons/MONTLY WITHDRAWL.svg`,
      'NET Monthly DW': `${baseUrl}Desktop cards icons/NET MONTHLY DW.svg`,
      'Lifetime Deposit': `${baseUrl}Desktop cards icons/Daily Deposite.svg`,
      'Lifetime Withdrawal': `${baseUrl}Desktop cards icons/Daily WITHDRAWL.svg`,
      'NET Lifetime DW': `${baseUrl}Desktop cards icons/NET WD.svg`,
      'Weekly Credit IN': `${baseUrl}Desktop cards icons/WEEKLY Credit IN.svg`,
      'Monthly Credit IN': `${baseUrl}Desktop cards icons/MONTHLY CREDIT IN.svg`,
      'Lifetime Credit IN': `${baseUrl}Desktop cards icons/LIFETIME CREDIT IN.svg`,
      'Weekly Credit OUT': `${baseUrl}Desktop cards icons/WEEKLY CREDIT OUT.svg`,
      'Monthly Credit OUT': `${baseUrl}Desktop cards icons/MOnthly CREDIT OUT.svg`,
      'Lifetime Credit OUT': `${baseUrl}Desktop cards icons/LIFETIME CREDIT OUT.svg`,
      'NET Credit': `${baseUrl}Desktop cards icons/NET CREDIT.svg`,
      'Previous Equity': `${baseUrl}Desktop cards icons/PREVIOUS EQUITY.svg`,
      'Weekly Previous Equity': `${baseUrl}Desktop cards icons/Weekly PREVIOUS EQUITY.svg`,
      'Monthly Previous Equity': `${baseUrl}Desktop cards icons/Monthly PREVIOUS EQUITY.svg`,
    }
    return iconMap[cardTitle] || `${baseUrl}Desktop cards icons/Total Clients.svg` // Default icon
  }

  // Render face card with updated UI matching Client2Module
  const renderFaceCard = (card, isDraggable = false) => {
    // Touch event handlers for mobile drag and drop
    const handleTouchStart = (e) => {
      if (!isDraggable) return
      const touch = e.touches[0]
      setTouchStartPos({ x: touch.clientX, y: touch.clientY })
      setTouchedCard(card.title)
      setDragStartLabel(card.title)
    }

    const handleTouchMove = (e) => {
      if (!isDraggable || !touchStartPos) return
      // Don't preventDefault here - causes passive event listener warning
    }

    const handleTouchEnd = (e) => {
      if (!isDraggable || !touchedCard) return
      
      const touch = e.changedTouches[0]
      const element = document.elementFromPoint(touch.clientX, touch.clientY)
      const dropTarget = element?.closest('[data-card-label]')
      
      if (dropTarget) {
        const toLabel = dropTarget.getAttribute('data-card-label')
        const fromLabel = touchedCard
        
        if (fromLabel && toLabel && fromLabel !== toLabel) {
          const newOrder = [...orderedCards]
          const fromIndex = newOrder.indexOf(fromLabel)
          const toIndex = newOrder.indexOf(toLabel)
          
          if (fromIndex !== -1 && toIndex !== -1) {
            // Swap
            [newOrder[fromIndex], newOrder[toIndex]] = [newOrder[toIndex], newOrder[fromIndex]]
            setOrderedCards(newOrder)
            localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(newOrder))
          }
        }
      }
      
      setTouchStartPos(null)
      setTouchedCard(null)
      setDragStartLabel(null)
    }

    const cardElement = (
      <div
        key={card.id}
        className="bg-white rounded-xl shadow-sm border-2 border-gray-100 p-2.5"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-[10px] font-medium text-gray-600 uppercase mb-0.5 leading-tight">{card.title}</div>
            <div className="flex items-baseline gap-1">
              {/* Triangle indicator based on value */}
              {card.simple ? null : (
                <>
                  {card.isPositive !== undefined && card.isPositive && (
                    <svg width="10" height="10" viewBox="0 0 8 8" className="flex-shrink-0">
                      <polygon points="4,0 8,8 0,8" fill="#16A34A"/>
                    </svg>
                  )}
                  {card.isPositive !== undefined && !card.isPositive && (
                    <svg width="10" height="10" viewBox="0 0 8 8" className="flex-shrink-0">
                      <polygon points="4,8 0,0 8,0" fill="#DC2626"/>
                    </svg>
                  )}
                </>
              )}
              <span className={`text-base font-bold ${
                card.isPositive !== undefined 
                  ? (card.isPositive ? 'text-[#16A34A]' : 'text-[#DC2626]')
                  : 'text-black'
              }`}>
                {card.formattedValue || card.value || '0'}
              </span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0">
            <img 
              src={getCardIcon(card.title)} 
              alt={card.title}
              className="w-5 h-5"
              onError={(e) => {
                // Fallback to default icon if image fails to load
                e.target.style.display = 'none'
              }}
            />
          </div>
        </div>
      </div>
    )

    return cardElement
  }

  // Main carousel (first 12 cards, NOT draggable)
  const visibleCards = getOrderedCards()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50">
      {/* Mobile Header with Sidebar Button */}
      <div className="sticky top-0 bg-white shadow-md z-30 px-4 py-5">
        <div className="flex items-center justify-between">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-black">Dashboard</h1>
          <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" fill="#9CA3AF"/>
              <path d="M4 20C4 16.6863 6.68629 14 10 14H14C17.3137 14 20 16.6863 20 20V20" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Sidebar overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 h-full w-[300px] bg-white shadow-xl rounded-r-2xl flex flex-col">
            <div className="p-4 flex items-center gap-3 border-b border-[#ECECEC]">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#1A63BC"/></svg>
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-[#1A63BC]">Broker Eyes</div>
                <div className="text-[11px] text-[#7A7A7A]">Trading Platform</div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#404040" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto py-2">
              <nav className="flex flex-col">
                {[
                  {label:'Dashboard', path:'/dashboard', active:true, icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#1A63BC"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#1A63BC"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#1A63BC"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#1A63BC"/></svg>
                  )},
                  {label:'Clients', path:'/client2', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="#404040"/><circle cx="16" cy="8" r="3" stroke="#404040"/><path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="#404040"/></svg>
                  )},
                  {label:'Positions', path:'/positions', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="3" rx="1" stroke="#404040"/><rect x="3" y="11" width="18" height="3" rx="1" stroke="#404040"/><rect x="3" y="16" width="18" height="3" rx="1" stroke="#404040"/></svg>
                  )},
                  {label:'Pending Orders', path:'/pending-orders', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#404040"/><circle cx="12" cy="12" r="2" fill="#404040"/></svg>
                  )},
                  {label:'Margin Level', path:'/margin-level', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 18L10 12L14 16L20 8" stroke="#404040" strokeWidth="2"/></svg>
                  )},
                  {label:'Live Dealing', path:'/live-dealing', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 18 0" stroke="#404040"/><path d="M7 12a5 5 0 0 1 10 0" stroke="#404040"/></svg>
                  )},
                  {label:'Client Percentage', path:'/client-percentage', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6" stroke="#404040"/><circle cx="8" cy="8" r="2" stroke="#404040"/><circle cx="16" cy="16" r="2" stroke="#404040"/></svg>
                  )},
                  {label:'IB Commissions', path:'/ib-commissions', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#404040" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 17l10 5 10-5" stroke="#404040" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12l10 5 10-5" stroke="#404040" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )},
                  {label:'Settings', path:'/settings', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" stroke="#404040"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2" stroke="#404040"/></svg>
                  )},
                ].map((item, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => {
                      navigate(item.path)
                      setIsSidebarOpen(false)
                    }}
                    className={`flex items-center gap-3 px-4 h-11 text-[13px] ${item.active ? 'text-[#1A63BC] bg-[#EFF4FB] rounded-lg font-semibold' : 'text-[#404040]'}`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-4 mt-auto border-t border-[#ECECEC]">
              <button 
                onClick={logout}
                className="flex items-center gap-3 px-2 h-10 text-[13px] text-[#404040]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 18.25C11.8011 18.25 11.6103 18.329 11.4697 18.4697C11.329 18.6103 11.25 18.8011 11.25 19C11.25 19.1989 11.329 19.3897 11.4697 19.5303C11.6103 19.671 11.8011 19.75 12 19.75H18C18.4641 19.75 18.9092 19.5656 19.2374 19.2374C19.5656 18.9092 19.75 18.4641 19.75 18V6C19.75 5.53587 19.5656 5.09075 19.2374 4.76256C18.9092 4.43437 18.4641 4.25 18 4.25H12C11.8011 4.25 11.6103 4.32902 11.4697 4.46967C11.329 4.61032 11.25 4.80109 11.25 5C11.25 5.19891 11.329 5.38968 11.4697 5.53033C11.6103 5.67098 11.8011 5.75 12 5.75H18C18.0663 5.75 18.1299 5.77634 18.1768 5.82322C18.2237 5.87011 18.25 5.9337 18.25 6V18C18.25 18.0663 18.2237 18.1299 18.1768 18.1768C18.1299 18.2237 18.0663 18.25 18 18.25H12Z" fill="#FF5F57"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M14.5029 14.365C15.1929 14.365 15.7529 13.805 15.7529 13.115V10.875C15.7529 10.185 15.1929 9.62498 14.5029 9.62498H9.8899L9.8699 9.40498L9.8159 8.84898C9.79681 8.65261 9.73064 8.46373 9.62301 8.29838C9.51538 8.13302 9.36946 7.99606 9.19763 7.8991C9.0258 7.80214 8.83312 7.74805 8.63593 7.74142C8.43874 7.73478 8.24286 7.77579 8.0649 7.86098C6.42969 8.64307 4.94977 9.71506 3.6969 11.025L3.5979 11.128C3.37433 11.3612 3.24951 11.6719 3.24951 11.995C3.24951 12.3181 3.37433 12.6287 3.5979 12.862L3.6979 12.965C4.95047 14.2748 6.43005 15.3468 8.0649 16.129C8.24286 16.2142 8.43874 16.2552 8.63593 16.2485C8.83312 16.2419 9.0258 16.1878 9.19763 16.0909C9.36946 15.9939 9.51538 15.8569 9.62301 15.6916C9.73064 15.5262 9.79681 15.3374 9.8159 15.141L9.8699 14.585L9.8899 14.365H14.5029ZM9.1949 12.865C9.00405 12.8651 8.82044 12.938 8.68147 13.0688C8.54249 13.1996 8.45861 13.3785 8.4469 13.569C8.42823 13.859 8.4049 14.1493 8.3769 14.44L8.3609 14.602C7.05583 13.9285 5.86846 13.0481 4.8449 11.995C5.86846 10.9418 7.05583 10.0614 8.3609 9.38798L8.3769 9.54998C8.4049 9.83998 8.42823 10.1303 8.4469 10.421C8.45861 10.6115 8.54249 10.7903 8.68147 10.9211C8.82044 11.0519 9.00405 11.1248 9.1949 11.125H14.2529V12.865H9.1949Z" fill="#FF5F57"/>
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-4">
        {/* Dashboard subtitle */}
        <p className="text-sm text-gray-600 mb-4">Quick overview of your broker metrics</p>

      {/* Face Cards Carousel */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Key Metrics</h2>
          <div className="flex items-center gap-2">
            {/* Card Filter Button */}
            <button
              onClick={() => setShowCardFilter(true)}
              className="text-xs text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-blue-50 border border-blue-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filter
            </button>
            {/* View All Button */}
            <button
              onClick={() => setShowViewAll(true)}
              className="text-xs text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1"
            >
              View All
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
        
        <div
          className="grid grid-cols-2 gap-3"
        >
          {!faceCardTotals || Object.keys(faceCardTotals).length === 0 ? (
            // Skeleton loading for face cards
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={`skeleton-card-${i}`} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
                    <div className="w-5 h-5 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="h-6 w-24 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ))}
            </>
          ) : (
            visibleCards.map(card => renderFaceCard(card, true))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/client2')}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-4 shadow-sm text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-xs font-semibold">Clients</p>
            </div>
            <p className="text-[10px] opacity-90">Manage accounts</p>
          </button>

          <button
            onClick={() => navigate('/positions')}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg p-4 shadow-sm text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-xs font-semibold">Positions</p>
            </div>
            <p className="text-[10px] opacity-90">Open positions</p>
          </button>

          <button
            onClick={() => navigate('/pending-orders')}
            className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg p-4 shadow-sm text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <p className="text-xs font-semibold">Orders</p>
            </div>
            <p className="text-[10px] opacity-90">Pending orders</p>
          </button>

          <button
            onClick={() => navigate('/live-dealing')}
            className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg p-4 shadow-sm text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-xs font-semibold">Live Dealing</p>
            </div>
            <p className="text-[10px] opacity-90">Real-time trades</p>
          </button>
        </div>
      </div>

      {/* Top Profitable Clients Table */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Top Profitable Clients</h2>
          <button
            onClick={() => navigate('/client2')}
            className="text-xs text-blue-600 font-medium hover:text-blue-700"
          >
            View All
          </button>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {topProfitableClients.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">No clients data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-500 text-white">
                    <th className="px-3 py-2 text-left font-semibold">Login</th>
                    <th className="px-3 py-2 text-left font-semibold">Name</th>
                    <th className="px-3 py-2 text-right font-semibold">Lifetime P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {topProfitableClients.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900">{row[0]}</td>
                      <td className="px-3 py-2 text-gray-900">{row[1]}</td>
                      <td className="px-3 py-2 text-right">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Largest Open Positions Table */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Largest Open Positions</h2>
          <button
            onClick={() => navigate('/positions')}
            className="text-xs text-blue-600 font-medium hover:text-blue-700"
          >
            View All
          </button>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {recentPositions.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-500">No positions data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-500 text-white">
                    <th className="px-3 py-2 text-left font-semibold">Login</th>
                    <th className="px-3 py-2 text-left font-semibold">Symbol</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-right font-semibold">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {recentPositions.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900">{row[0]}</td>
                      <td className="px-3 py-2 text-gray-900">{row[1]}</td>
                      <td className="px-3 py-2 text-gray-700">{row[2]}</td>
                      <td className="px-3 py-2 text-right">{row[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* System Status */}
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-3">System Status</h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-2 gap-4">
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
                <span className="text-lg font-bold text-blue-600">{clientsCount}</span>
              </div>
              <p className="text-xs font-medium text-gray-900">Total Clients</p>
              <p className="text-xs text-gray-500">Active accounts</p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-2">
                <span className="text-lg font-bold text-green-600">{positionsCount}</span>
              </div>
              <p className="text-xs font-medium text-gray-900">Open Positions</p>
              <p className="text-xs text-gray-500">Active trades</p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 mb-2">
                <span className="text-lg font-bold text-orange-600">{ordersCount}</span>
              </div>
              <p className="text-xs font-medium text-gray-900">Pending Orders</p>
              <p className="text-xs text-gray-500">Awaiting execution</p>
            </div>
          </div>
        </div>
      </div>

      {/* View All Modal */}
      {showViewAll && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">All Metrics</h3>
              <button
                onClick={() => setShowViewAll(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div 
              className="flex-1 overflow-y-scroll overflow-x-hidden p-4" 
              style={{ 
                minHeight: 0,
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                scrollbarWidth: 'thin',
                scrollbarColor: '#CBD5E1 #F1F5F9'
              }}
            >
              <div className="grid grid-cols-2 gap-3 pb-4">
                {faceCardOrder.map(cardId => {
                  const card = getFaceCardConfig(cardId, faceCardTotals)
                  return card ? renderFaceCard(card, false) : null
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card Filter Modal */}
      {showCardFilter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-[24px] flex flex-col overflow-hidden" style={{ height: '550px', maxHeight: '100vh' }}>
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-gray-900">Show/Hide Cards</h3>
              <button onClick={() => setShowCardFilter(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Box */}
            <div className="px-5 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={cardFilterSearchQuery}
                  onChange={(e) => setCardFilterSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 bg-gray-100 border-0 rounded-lg text-xs text-black font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg 
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" strokeWidth="2"/>
                  <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            {/* Cards List - Fixed height scrollable area */}
            <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
              <div className="p-3">
                {faceCardOrder.filter(cardId => {
                  const card = getFaceCardConfig(cardId, faceCardTotals)
                  if (!card) return false
                  return card.title.toLowerCase().includes(cardFilterSearchQuery.toLowerCase())
                }).map(cardId => {
                  const card = getFaceCardConfig(cardId, faceCardTotals)
                  if (!card) return null
                  return (
                    <label 
                      key={cardId} 
                      className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                    >
                      <span className="text-sm text-gray-900">{card.title}</span>
                      <div className="relative inline-block w-12 h-6">
                        <input
                          type="checkbox"
                          checked={cardVisibility[cardId]}
                          onChange={() => toggleCardVisibility(cardId)}
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
