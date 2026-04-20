import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const MobileClientsViewNew = ({ clients = [], onClientClick }) => {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isColumnsModalOpen, setIsColumnsModalOpen] = useState(false)
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Calculate metrics from clients data
  const metrics = {
    totalClients: clients.length,
    totalBalance: clients.reduce((acc, c) => acc + (c?.balance || 0), 0),
    totalCredit: clients.reduce((acc, c) => acc + (c?.credit || 0), 0),
    totalEquity: clients.reduce((acc, c) => acc + (c?.equity || 0), 0),
    totalRebatePercent: clients.reduce((acc, c) => acc + (c?.rebatePercent || 0), 0),
    floatingProfit: clients.reduce((acc, c) => acc + (c?.profit || 0), 0),
    dailyDeposit: clients.reduce((acc, c) => acc + (c?.dailyDeposit || 0), 0),
    dailyWithdrawal: clients.reduce((acc, c) => acc + (c?.dailyWithdrawal || 0), 0),
    totalCreditMetric: clients.reduce((acc, c) => acc + (c?.credit || 0), 0),
    dailyNetDW: clients.reduce((acc, c) => acc + ((c?.dailyDeposit || 0) - (c?.dailyWithdrawal || 0)), 0),
    monthlyEquity: clients.reduce((acc, c) => acc + (c?.monthlyEquity || 0), 0),
    netLifetime: clients.reduce((acc, c) => acc + (c?.lifetimePnL || 0), 0),
    weekWithdrawal: clients.reduce((acc, c) => acc + (c?.thisWeekWithdrawal || 0), 0),
    netWeekDW: clients.reduce((acc, c) => acc + ((c?.thisWeekDeposit || 0) - (c?.thisWeekWithdrawal || 0)), 0),
    monthlyWithdrawal: clients.reduce((acc, c) => acc + (c?.thisMonthWithdrawal || 0), 0),
    netMonthlyDW: clients.reduce((acc, c) => acc + ((c?.thisMonthDeposit || 0) - (c?.thisMonthWithdrawal || 0)), 0)
  }

  // Card config matching Figma order with state for drag-and-drop
  const initialCards = [
    { id: 1, label: 'TOTAL CLIENT', amount: metrics.totalClients, trend: 'up', percent: '', color: 'green' },
    { id: 2, label: 'TOTAL BALANCE', amount: metrics.totalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'up', percent: '', color: 'green' },
    { id: 3, label: 'TOTAL CREDIT', amount: metrics.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'down', percent: '', color: 'red' },
    { id: 4, label: 'TOTAL EQUITY', amount: metrics.totalEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'up', percent: '', color: 'green' },
    { id: 5, label: 'TOTAL REBATE %', amount: metrics.totalRebatePercent.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'up', percent: '', color: 'green' },
    { id: 6, label: 'FLOATING PROFIT', amount: metrics.floatingProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: metrics.floatingProfit >= 0 ? 'up' : 'down', percent: '', color: metrics.floatingProfit >= 0 ? 'green' : 'red' },
    { id: 7, label: 'DAILY DEPOSIT', amount: metrics.dailyDeposit.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'up', percent: '', color: 'green' },
    { id: 8, label: 'DAILY WITHDRAWAL', amount: metrics.dailyWithdrawal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'down', percent: '', color: 'red' },
    { id: 9, label: 'WEEK WITHDRAWAL', amount: metrics.weekWithdrawal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'down', percent: '', color: 'red' },
    { id: 10, label: 'NET WEEK DW', amount: metrics.netWeekDW.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: metrics.netWeekDW >= 0 ? 'up' : 'down', percent: '', color: metrics.netWeekDW >= 0 ? 'green' : 'red' },
    { id: 11, label: 'MONTHLY WITHDRAWAL', amount: metrics.monthlyWithdrawal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: 'down', percent: '', color: 'red' },
    { id: 12, label: 'NET MONTHLY DW', amount: metrics.netMonthlyDW.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: metrics.netMonthlyDW >= 0 ? 'up' : 'down', percent: '', color: metrics.netMonthlyDW >= 0 ? 'green' : 'red' },
    { id: 13, label: 'DAILY NET D/W', amount: metrics.dailyNetDW.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: metrics.dailyNetDW >= 0 ? 'up' : 'down', percent: '', color: metrics.dailyNetDW >= 0 ? 'green' : 'red' },
    { id: 14, label: 'MONTHLY EQUITY', amount: metrics.monthlyEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: metrics.monthlyEquity >= 0 ? 'up' : 'down', percent: '', color: metrics.monthlyEquity >= 0 ? 'green' : 'red' },
    { id: 15, label: 'NET LIFETIME', amount: metrics.netLifetime.toLocaleString('en-IN', { minimumFractionDigits: 2 }), trend: metrics.netLifetime >= 0 ? 'up' : 'down', percent: '', color: metrics.netLifetime >= 0 ? 'green' : 'red' }
  ]
  
  const [faceCards, setFaceCards] = useState(initialCards)

  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    balance: true,
    floatingProfit: true,
    equity: true,
    name: true
  })

  const toggleColumn = (column) => {
    setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }))
  }

  const FaceCard = ({ card }) => {
    const isGreen = card.color === 'green'
    const gradientId = `gradient-${card.id}`
    
    return (
      <div style={{
        boxSizing: 'border-box',
        width: '176px',
        minWidth: '176px',
        height: '82px',
        background: '#FFFFFF',
        border: card.simple ? '1px solid #F2F2F7' : '1px solid #ECECEC',
        boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
        borderRadius: '8px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flex: 'none'
      }}>
        {/* Top Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {/* Icon + Label */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '6px'
          }}>
            {/* Dynamic icon based on card label */}
            {card.label.includes('LIFETIME') || card.label.includes('NET') ? (
              // Wallet/Money icon
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M10.5 3H1.5C1.22386 3 1 3.22386 1 3.5V9.5C1 9.77614 1.22386 10 1.5 10H10.5C10.7761 10 11 9.77614 11 9.5V3.5C11 3.22386 10.7761 3 10.5 3Z" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 6.5C8 7.05228 7.55228 7.5 7 7.5C6.44772 7.5 6 7.05228 6 6.5C6 5.94772 6.44772 5.5 7 5.5C7.55228 5.5 8 5.94772 8 6.5Z" fill={card.simple ? "#2563EB" : "#1A63BC"}/>
              </svg>
            ) : card.label.includes('DAILY') ? (
              // Calendar/Day icon
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1.5" y="2.5" width="9" height="8" rx="1" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1"/>
                <path d="M1.5 4.5H10.5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1"/>
                <path d="M3.5 1.5V3.5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round"/>
                <path d="M8.5 1.5V3.5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round"/>
              </svg>
            ) : card.label.includes('MONTHLY') ? (
              // Calendar/Month icon
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1.5" y="2.5" width="9" height="8" rx="1" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1"/>
                <path d="M1.5 4.5H10.5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1"/>
                <path d="M4 6.5H5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round"/>
                <path d="M7 6.5H8" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round"/>
                <path d="M4 8.5H5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round"/>
                <path d="M7 8.5H8" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round"/>
              </svg>
            ) : card.label.includes('EQUITY') ? (
              // Pie chart/Portfolio icon
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1"/>
                <path d="M6 1.5V6H10.5" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              // Default wallet icon
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M10.5 3H1.5C1.22386 3 1 3.22386 1 3.5V9.5C1 9.77614 1.22386 10 1.5 10H10.5C10.7761 10 11 9.77614 11 9.5V3.5C11 3.22386 10.7761 3 10.5 3Z" stroke={card.simple ? "#2563EB" : "#1A63BC"} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 6.5C8 7.05228 7.55228 7.5 7 7.5C6.44772 7.5 6 7.05228 6 6.5C6 5.94772 6.44772 5.5 7 5.5C7.55228 5.5 8 5.94772 8 6.5Z" fill={card.simple ? "#2563EB" : "#1A63BC"}/>
              </svg>
            )}
            <span style={{
              fontFamily: 'Outfit',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '8px',
              lineHeight: '10px',
              textTransform: 'uppercase',
              color: card.simple ? '#333333' : '#475467',
              whiteSpace: 'nowrap'
            }}>{card.label}</span>
          </div>
          
          {/* Amount */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: '3px'
          }}>
            <span style={{
              fontFamily: 'Outfit',
              fontStyle: 'normal',
              fontWeight: 700,
              fontSize: '13px',
              lineHeight: '16px',
              color: card.simple ? '#333333' : '#4B4B4B',
              whiteSpace: 'nowrap'
            }}>{card.amount}</span>
            <span style={{
              fontFamily: 'Outfit',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '8px',
              lineHeight: '10px',
              color: card.simple ? '#333333' : '#475467'
            }}>USD</span>
          </div>
        </div>
        
        {/* Bottom Section - Percentage + Chart (only for non-simple cards) */}
        {!card.simple && (
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            {/* Percentage Badge */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '2px'
            }}>
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                {card.trend === 'up' ? (
                  <path d="M3 9L7 5L11 9" stroke="#15803D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                ) : (
                  <path d="M11 5L7 9L3 5" stroke="#B91C1C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
              <span style={{
                fontFamily: 'Inter',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '10px',
                lineHeight: '12px',
                color: isGreen ? '#15803D' : '#B91C1C'
              }}>{card.percent}</span>
            </div>
            
            {/* Mini Chart */}
            <svg width="50" height="24" viewBox="0 0 50 24" fill="none" style={{ marginRight: '-5px' }}>
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={isGreen ? "rgba(21, 128, 61, 0.3)" : "rgba(185, 28, 28, 0.3)"} />
                  <stop offset="100%" stopColor={isGreen ? "rgba(21, 128, 61, 0)" : "rgba(185, 28, 28, 0)"} />
                </linearGradient>
              </defs>
              {isGreen ? (
                <>
                  <path d="M0 24V14C7 12 14 10 21 8C28 6 35 7 42 9C45 10 48 8 50 6V24H0Z" fill={`url(#${gradientId})`}/>
                  <path d="M0 14C7 12 14 10 21 8C28 6 35 7 42 9C45 10 48 8 50 6" stroke="#15803D" strokeWidth="1.5" fill="none"/>
                </>
              ) : (
                <>
                  <path d="M0 0V10C7 12 14 14 21 16C28 18 35 17 42 15C45 14 48 16 50 18V0H0Z" fill={`url(#${gradientId})`}/>
                  <path d="M0 10C7 12 14 14 21 16C28 18 35 17 42 15C45 14 48 16 50 18" stroke="#B91C1C" strokeWidth="1.5" fill="none"/>
                </>
              )}
            </svg>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative',
      width: '412px',
      height: '918px',
      background: '#F2F2F7',
      fontFamily: 'Outfit, sans-serif',
      overflow: 'hidden',
      borderRadius: '20px',
      margin: '0 auto'
    }}>
      {/* Rectangle 41868 - Header */}
      <div style={{
        position: 'absolute',
        width: '412px',
        height: '118px',
        left: '0px',
        top: '0px',
        background: '#FFFFFF',
        boxShadow: '0px 3.64486px 44.9229px rgba(0, 0, 0, 0.05)',
        borderRadius: '20px 20px 0px 0px'
      }}>
        {/* Frame 1707486430 - Main Header Row */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0px',
          gap: '119px',
          position: 'absolute',
          width: '372px',
          height: '36px',
          left: '20px',
          top: '62px'
        }}>
          {/* Hamburger Menu */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
              width: '36px',
              height: '36px',
              background: 'rgba(230, 238, 248, 0.44)',
              boxShadow: 'inset 0px 2px 2px rgba(155, 151, 151, 0.2)',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect y="3.75" width="20" height="2.5" rx="1.25" fill="#4B4B4B"/>
              <rect y="8.75" width="20" height="2.5" rx="1.25" fill="#4B4B4B"/>
              <rect y="13.75" width="20" height="2.5" rx="1.25" fill="#4B4B4B"/>
            </svg>
          </button>

          {/* Title & Profile Container */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '118px',
            flex: 1
          }}>
            {/* Clients Title */}
            <span style={{
              fontFamily: 'Outfit',
              fontStyle: 'normal',
              fontWeight: 600,
              fontSize: '20px',
              lineHeight: '17px',
              color: '#4B4B4B'
            }}>
              Clients
            </span>

            {/* Profile Picture */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              overflow: 'hidden',
              boxShadow: 'inset 0px 4px 4px rgba(0, 0, 0, 0.25)'
            }}>
              <img 
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces" 
                alt="Profile"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Frame 1707486432 - Action Buttons Row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0px',
        gap: '10px',
        position: 'absolute',
        width: '372px',
        height: '18px',
        left: '20px',
        top: '110px'
      }}>
        {/* View All */}
        <span
          style={{
            width: '36px',
            height: '11px',
            fontFamily: 'Outfit',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '10px',
            lineHeight: '11px',
            color: '#1A63BC',
            flex: 'none',
            order: 0,
            flexGrow: 0,
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
          onClick={() => {
            document.querySelector('.scrollbar-hide')?.scrollTo({ left: 0, behavior: 'smooth' })
          }}
        >
          View All
        </span>

        {/* Frame 1707486431 - Icon Buttons Container */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0px',
          gap: '4px',
          width: '62px',
          height: '18px',
          flex: 'none',
          order: 1,
          flexGrow: 0
        }}>
          {/* Percentage Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.81846 8.06846C7.26347 8.06846 7.69848 7.9365 8.06849 7.68927C8.4385 7.44204 8.72689 7.09063 8.89719 6.6795C9.06748 6.26837 9.11204 5.81597 9.02523 5.37951C8.93841 4.94305 8.72412 4.54214 8.40945 4.22747C8.09478 3.9128 7.69387 3.69851 7.25741 3.6117C6.82095 3.52488 6.36855 3.56944 5.95742 3.73973C5.54629 3.91003 5.19488 4.19842 4.94765 4.56843C4.70042 4.93844 4.56846 5.37345 4.56846 5.81846C4.56933 6.41502 4.80658 6.98697 5.22841 7.40879C5.65023 7.83062 6.2219 8.06787 6.81846 8.06846ZM6.81846 5.06846C6.9668 5.06846 7.1118 5.11245 7.23514 5.19486C7.35848 5.27727 7.45461 5.3944 7.51137 5.53145C7.56814 5.66849 7.58299 5.81929 7.55405 5.96478C7.52511 6.11027 7.45368 6.2439 7.34879 6.34879C7.2439 6.45368 7.11027 6.52511 6.96478 6.55405C6.81929 6.58299 6.66849 6.56814 6.53145 6.51137C6.3944 6.45461 6.27727 6.35848 6.19486 6.23514C6.11245 6.1118 6.06846 5.9668 6.06846 5.81846C6.06846 5.61955 6.14748 5.42878 6.28813 5.28813C6.42878 5.14748 6.61955 5.06846 6.81846 5.06846ZM13.1815 9.93146C12.7365 9.93146 12.3015 10.0634 11.9315 10.3107C11.5615 10.5579 11.2731 10.9093 11.1028 11.3204C10.9325 11.7316 10.888 12.184 10.9748 12.6204C11.0616 13.0569 11.2759 13.4578 11.5906 13.7725C11.9052 14.0871 12.3062 14.3014 12.7426 14.3882C13.1791 14.475 13.6315 14.4305 14.0426 14.2602C14.4537 14.0899 14.8051 13.8015 15.0524 13.4315C15.2996 13.0615 15.4315 12.6265 15.4315 12.1815C15.4306 11.5849 15.1934 11.013 14.7716 10.5911C14.3497 10.1693 13.778 9.93206 13.1815 9.93146ZM13.1815 12.9315C13.0331 12.9315 12.8881 12.8875 12.7648 12.8051C12.6414 12.7227 12.5453 12.6055 12.4886 12.4685C12.4318 12.3314 12.4169 12.1806 12.4459 12.0351C12.4748 11.8897 12.5462 11.756 12.6511 11.6511C12.756 11.5462 12.8897 11.4748 13.0351 11.4459C13.1806 11.4169 13.3314 11.4318 13.4685 11.4886C13.6055 11.5453 13.7227 11.6414 13.8051 11.7648C13.8875 11.8881 13.9315 12.0331 13.9315 12.1815C13.9315 12.3804 13.8524 12.5711 13.7118 12.7118C13.5711 12.8524 13.3804 12.9315 13.1815 12.9315ZM15.7802 3.21971C15.6395 3.07911 15.4488 3.00012 15.2499 3.00012C15.051 3.00012 14.8603 3.07911 14.7197 3.21971L4.21971 13.7197C4.14888 13.7889 4.09106 13.8717 4.05175 13.9632C4.01244 14.0547 3.99236 14.1531 3.99144 14.2527C3.99053 14.3522 4.00881 14.451 4.04515 14.5432C4.08149 14.6353 4.13517 14.7191 4.20554 14.7895C4.27591 14.8599 4.35966 14.9156 4.45184 14.9533C4.54402 14.991 4.64285 15.01 4.74242 15.0091C4.842 15.0083 4.94056 14.9876 5.03204 14.9483C5.12353 14.909 5.20623 14.8518 5.27571 14.7802L15.7802 4.28021C15.9208 4.13957 15.9998 3.94883 15.9998 3.74996C15.9998 3.55109 15.9208 3.36036 15.7802 3.21971Z" fill="#4B4B4B"/>
            </svg>
          </button>

          {/* Download Icon Button */}
          <button style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 1,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 3H10.5V7.5H12.375L9 10.875M9 3H7.5V7.5H5.625L9 10.875" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4.5 14.25H13.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Filter Icon Button */}
          <button onClick={() => setIsFilterModalOpen(true)} style={{
            width: '18px',
            height: '18px',
            background: 'transparent',
            border: 'none',
            padding: '0px',
            cursor: 'pointer',
            flex: 'none',
            order: 2,
            flexGrow: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.25 8.25H12.75V9.75H5.25V8.25ZM3 5.25H15V6.75H3V5.25ZM7.5 11.25H10.5V12.75H7.5V11.25Z" fill="#4B4B4B"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Frame 1707486433 - Scrollable Face Cards */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '0px',
        gap: '10px',
        position: 'absolute',
        width: '372px',
        height: '82px',
        left: '20px',
        top: '138px',
        overflowX: 'scroll',
        overflowY: 'hidden'
      }} className="scrollbar-hide">
        {faceCards.map((card, index) => (
          <div
            key={card.id}
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer.setData('cardIndex', index)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
              e.preventDefault()
              const fromIndex = parseInt(e.dataTransfer.getData('cardIndex'))
              if (fromIndex !== index && !isNaN(fromIndex)) {
                const newCards = [...faceCards]
                const [movedCard] = newCards.splice(fromIndex, 1)
                newCards.splice(index, 0, movedCard)
                setFaceCards(newCards)
              }
            }}
            style={{ cursor: 'move' }}
          >
            <FaceCard card={card} />
          </div>
        ))}
      </div>

      {/* Search Input */}
      <div style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '6px 10px',
        gap: '10px',
        position: 'absolute',
        width: '269px',
        height: '42px',
        left: '20px',
        top: '230px',
        background: '#FFFFFF',
        border: '1px solid #ECECEC',
        boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
        borderRadius: '8px'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0px',
          gap: '10px',
          width: '100%',
          height: '24px'
        }}>
          {/* Search Icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M13.5233 14.4628L16.7355 17.6742L15.6742 18.7355L12.4628 15.5233C11.2678 16.4812 9.7815 17.0022 8.25 17C4.524 17 1.5 13.976 1.5 10.25C1.5 6.524 4.524 3.5 8.25 3.5C11.976 3.5 15 6.524 15 10.25C15.0022 11.7815 14.4812 13.2678 13.5233 14.4628ZM12.0187 13.9062C12.9704 12.9273 13.5019 11.6153 13.5 10.25C13.5 7.3498 11.1503 5 8.25 5C5.3498 5 3 7.3498 3 10.25C3 13.1503 5.3498 15.5 8.25 15.5C9.6153 15.5019 10.9273 14.9704 11.9062 14.0187L12.0187 13.9062Z" fill="#4B4B4B"/>
          </svg>

          {/* Search Input */}
          <input
            type="text"
            placeholder="Search by Login, Name and Email....."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '208px',
              height: '24px',
              fontFamily: 'Outfit',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '23px',
              letterSpacing: '0.03em',
              color: '#4B4B4B',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              flex: 'none',
              order: 1,
              flexGrow: 0
            }}
          />
        </div>
      </div>

      {/* Columns Button */}
      <div onClick={() => setIsColumnsModalOpen(true)} style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '6px 10px',
        gap: '10px',
        position: 'absolute',
        width: '93px',
        height: '42px',
        left: '299px',
        top: '230px',
        background: '#F4F8FC',
        border: '1px solid #ECECEC',
        boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05), inset 0px 2px 2px rgba(155, 151, 151, 0.2)',
        borderRadius: '8px',
        cursor: 'pointer'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0px',
          gap: '10px',
          width: '74px',
          height: '24px'
        }}>
          {/* Columns Icon */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 4H3.5C3.23478 4 2.98043 4.10536 2.79289 4.29289C2.60536 4.48043 2.5 4.73478 2.5 5V15C2.5 15.2652 2.60536 15.5196 2.79289 15.7071C2.98043 15.8946 3.23478 16 3.5 16H6C6.26522 16 6.51957 15.8946 6.70711 15.7071C6.89464 15.5196 7 15.2652 7 15V5C7 4.73478 6.89464 4.48043 6.70711 4.29289C6.51957 4.10536 6.26522 4 6 4ZM6 15H3.5V5H6V15ZM11.5 4H9C8.73478 4 8.48043 4.10536 8.29289 4.29289C8.10536 4.48043 8 4.73478 8 5V15C8 15.2652 8.10536 15.5196 8.29289 15.7071C8.48043 15.8946 8.73478 16 9 16H11.5C11.7652 16 12.0196 15.8946 12.2071 15.7071C12.3946 15.5196 12.5 15.2652 12.5 15V5C12.5 4.73478 12.3946 4.48043 12.2071 4.29289C12.0196 4.10536 11.7652 4 11.5 4ZM11.5 15H9V5H11.5V15Z" fill="#4B4B4B"/>
          </svg>

          {/* Columns Text */}
          <span style={{
            width: '48px',
            height: '24px',
            fontFamily: 'Outfit',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '12px',
            lineHeight: '23px',
            letterSpacing: '0.03em',
            color: '#4B4B4B'
          }}>
            Columns
          </span>
        </div>
      </div>

      {/* Clients Table Container */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        padding: '0px',
        gap: '10px',
        position: 'absolute',
        width: '372px',
        height: '626px',
        left: '20px',
        top: '282px'
      }}>
        {/* Pagination Controls */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0px',
          width: '372px',
          height: '25px',
          flex: 'none',
          order: 0,
          alignSelf: 'stretch',
          flexGrow: 0
        }}>
          {/* Showing text */}
          <span style={{
            fontFamily: 'Outfit',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '12px',
            lineHeight: '15px',
            color: '#666666'
          }}>
            Showing 1–10 of 533
          </span>

          {/* Pagination buttons */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '10px'
          }}>
            {/* Previous button */}
            <button style={{
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '6px 14px',
              gap: '16px',
              width: '66px',
              height: '25px',
              opacity: 0.4,
              border: '1px solid #344459',
              borderRadius: '24px',
              background: 'transparent',
              cursor: 'not-allowed'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '10px',
                lineHeight: '13px',
                textAlign: 'center',
                color: '#344459'
              }}>Previous</span>
            </button>

            {/* Next button */}
            <button style={{
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '6px 14px',
              gap: '16px',
              width: '50px',
              height: '25px',
              border: '1px solid #344459',
              borderRadius: '24px',
              background: 'transparent',
              cursor: 'pointer'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '10px',
                lineHeight: '13px',
                textAlign: 'center',
                color: '#344459'
              }}>Next</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '0px',
          width: '372px',
          height: '591px',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderRadius: '6px',
          flex: 'none',
          order: 1,
          alignSelf: 'stretch',
          flexGrow: 0
        }} className="scrollbar-hide">
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            width: '100%',
            overflowX: 'auto'
          }}>
          {/* Sample table data - replace with real data */}
          {/* Login Column */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            width: '63px',
            height: '420px',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px',
              width: '63px',
              height: '35px',
              background: '#1A63BC',
              boxShadow: 'inset 0px -1.30687px 0px #E1E1E1',
              borderRadius: '4px 4px 0px 0px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: '12px',
                lineHeight: '15px',
                color: '#F5F5F5'
              }}>Login</span>
            </div>
            {/* Rows */}
            {clients.map((client, idx) => (
              <div key={idx} style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '10px',
                width: '63px',
                height: '35px',
                background: '#FFFFFF',
                boxShadow: 'inset 0px -0.931668px 0px #E1E1E1'
              }}>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '12px',
                  lineHeight: '15px',
                  color: '#1A63BC'
                }}>{client?.login || ''}</span>
              </div>
            ))}
          </div>

          {/* Balance Column */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            width: '80px',
            height: '420px',
            flex: 'none',
            order: 1,
            flexGrow: 0
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px',
              width: '80px',
              height: '35px',
              background: '#1A63BC',
              boxShadow: 'inset 0px -1.30687px 0px #E1E1E1'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: '12px',
                lineHeight: '15px',
                color: '#F5F5F5'
              }}>Balance</span>
            </div>
            {/* Rows */}
            {clients.map((client, idx) => (
              <div key={idx} style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '10px',
                width: '80px',
                height: '35px',
                background: '#FFFFFF',
                boxShadow: 'inset 0px -0.931668px 0px #E1E1E1'
              }}>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '12px',
                  lineHeight: '15px',
                  color: '#4B4B4B'
                }}>{(client?.balance || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Floating Profit Column */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            width: '110px',
            height: '420px',
            flex: 'none',
            order: 2,
            flexGrow: 0
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px',
              width: '110px',
              height: '35px',
              background: '#1A63BC',
              boxShadow: 'inset 0px -1.30687px 0px #E1E1E1'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: '12px',
                lineHeight: '15px',
                color: '#F5F5F5',
                whiteSpace: 'nowrap'
              }}>Floating Profit</span>
            </div>
            {/* Rows */}
            {clients.map((client, idx) => (
              <div key={idx} style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '10px',
                width: '110px',
                height: '35px',
                background: '#FFFFFF',
                boxShadow: 'inset 0px -0.931668px 0px #E1E1E1'
              }}>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '12px',
                  lineHeight: '15px',
                  color: '#4B4B4B'
                }}>{(client?.profit || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Equity Column */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            width: '80px',
            height: '420px',
            flex: 'none',
            order: 3,
            flexGrow: 0
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px',
              width: '80px',
              height: '35px',
              background: '#1A63BC',
              boxShadow: 'inset 0px -1.30687px 0px #E1E1E1'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: '12px',
                lineHeight: '15px',
                color: '#F5F5F5'
              }}>Equity</span>
            </div>
            {/* Rows */}
            {clients.map((client, idx) => (
              <div key={idx} style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '10px',
                width: '80px',
                height: '35px',
                background: '#FFFFFF',
                boxShadow: 'inset 0px -0.931668px 0px #E1E1E1'
              }}>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '12px',
                  lineHeight: '15px',
                  color: '#4B4B4B'
                }}>{(client?.equity || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Name Column */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            width: '120px',
            height: '420px',
            flex: 'none',
            order: 4,
            flexGrow: 0
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '10px',
              width: '120px',
              height: '35px',
              background: '#1A63BC',
              boxShadow: 'inset 0px -1.30687px 0px #E1E1E1',
              borderRadius: '0px 4px 0px 0px'
            }}>
              <span style={{
                fontFamily: 'Outfit',
                fontStyle: 'normal',
                fontWeight: 600,
                fontSize: '12px',
                lineHeight: '15px',
                color: '#F5F5F5'
              }}>Name</span>
            </div>
            {/* Rows */}
            {clients.map((client, idx) => (
              <div key={idx} style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '10px',
                width: '120px',
                height: '35px',
                background: '#FFFFFF',
                boxShadow: 'inset 0px -0.931668px 0px #E1E1E1'
              }}>
                <span style={{
                  fontFamily: 'Outfit',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '12px',
                  lineHeight: '15px',
                  color: '#4B4B4B',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>{client?.name || ''}</span>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setIsSidebarOpen(false)}>
          <div 
            className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-[#ECECEC]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">BE</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#000000]">Broker Eyes</div>
                  <div className="text-xs text-[#404040]">Trading Platform</div>
                </div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#404040" strokeWidth="2"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto py-2">
              <nav className="flex flex-col">
                {[
                  {label:'Dashboard', path:'/dashboard', icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#404040"/></svg>
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
                    className={`flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      item.active 
                        ? 'bg-[#EFF6FF] border-l-4 border-[#1A63BC]' 
                        : 'hover:bg-[#F8F8F8]'
                    }`}
                  >
                    <div className="flex-shrink-0">{item.icon}</div>
                    <span className={`text-sm ${
                      item.active ? 'text-[#1A63BC] font-semibold' : 'text-[#404040]'
                    }`}>
                      {item.label}
                    </span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-4 mt-auto border-t border-[#ECECEC]">
              <button onClick={logout} className="flex items-center gap-3 px-2 h-[37px] text-[10px] text-[#404040]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M10 17l5-5-5-5" stroke="#404040" strokeWidth="2"/><path d="M4 12h11" stroke="#404040" strokeWidth="2"/></svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MobileClientsViewNew
