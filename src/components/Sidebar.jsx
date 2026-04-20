import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useGroups } from '../contexts/GroupContext'
import { useIB } from '../contexts/IBContext'
import { useState, useEffect } from 'react'

const Sidebar = ({ isOpen, onClose, onToggle, marginLevelCount = 0 }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const { setActiveGroupFilter } = useGroups()
  const { clearIBSelection } = useIB()
  const [storedMarginCount, setStoredMarginCount] = useState(0)

  // Read margin count from localStorage on mount and listen for changes
  useEffect(() => {
    const updateCount = () => {
      const count = parseInt(localStorage.getItem('marginLevelCount') || '0', 10)
      setStoredMarginCount(count)
    }
    
    // Initial load
    updateCount()
    
    // Listen for changes
    window.addEventListener('marginLevelCountChanged', updateCount)
    window.addEventListener('storage', updateCount)
    
    return () => {
      window.removeEventListener('marginLevelCountChanged', updateCount)
      window.removeEventListener('storage', updateCount)
    }
  }, [])

  // Use either passed prop or stored count (stored count takes priority for cross-page visibility)
  const displayCount = storedMarginCount || marginLevelCount
  
  const navigationItems = [
    { name: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { name: 'Clients', path: '/client2', icon: 'client2' },
    { name: 'Positions', path: '/positions', icon: 'positions' },
    { name: 'Pending Orders', path: '/pending-orders', icon: 'orders' },
    { name: 'Margin Level', path: '/margin-level', icon: 'margin' },
    { name: 'Live Dealing', path: '/live-dealing', icon: 'live-dealing' },
    { name: 'Client Percentage', path: '/client-percentage', icon: 'percentage' },
    { name: "IB'S", path: '/ib-commissions', icon: 'rebate' },
    { name: 'Settings', path: '/settings', icon: 'settings' }
  ]
  
  const handleNavigate = (path) => {
    // Clear cross-module filters on navigation (desktop parity with mobile)
    try {
      setActiveGroupFilter('client2', null)
    } catch {}
    try {
      clearIBSelection()
    } catch {}
    navigate(path)
    // Close sidebar after navigation only on mobile (below lg breakpoint)
    if (typeof onClose === 'function' && window.innerWidth < 1024) {
      onClose()
    }
  }
  
  const isActivePath = (path) => {
    return location.pathname === path || (path === '/dashboard' && location.pathname === '/')
  }

  const handleLogout = async () => {
    await logout()
    if (typeof onClose === 'function') {
      onClose()
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fadeIn"
          onClick={() => typeof onClose === 'function' && onClose()}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 lg:z-auto
          w-64 bg-white
          border-r border-slate-200 shadow-lg
          transform transition-transform duration-300 ease-in-out
          flex flex-col h-screen overflow-visible
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
          ${isOpen ? 'lg:w-60' : 'lg:w-16'}
        `}
      >
        {/* Toggle Button - Positioned on the right edge of sidebar */}
        <button
          onClick={() => typeof onToggle === 'function' && onToggle()}
          className="hidden lg:block absolute -right-3 top-6 z-50 w-6 h-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all duration-200 transform hover:scale-110"
          title={isOpen ? "Close sidebar" : "Open sidebar"}
        >
          <svg 
            className={`w-4 h-4 mx-auto transition-transform duration-300 ${isOpen ? '' : 'rotate-180'}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex flex-col flex-1">
          <div className={`flex items-center ${isOpen ? 'px-4' : 'px-2'} py-4 border-b border-slate-200`}>
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            {isOpen && (
              <div className="ml-3">
                <h1 className="text-lg font-bold text-slate-800 tracking-tight">Broker Eyes</h1>
                <p className="text-xs text-slate-500">Trading Platform</p>
              </div>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-4">
            {navigationItems.map((item) => (
              <button
                key={item.name}
                onClick={() => handleNavigate(item.path)}
                className={`
                  group w-full text-left flex items-center ${isOpen ? 'px-4' : 'px-2 justify-center'} py-3 rounded-xl text-sm font-medium
                  transition-all duration-200 transform hover:scale-[1.02]
                  ${
                  isActivePath(item.path)
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.icon === 'dashboard' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v0" />
                  </svg>
                )}
                {item.icon === 'client2' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                )}
                {item.icon === 'positions' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18M3 9h18M3 15h18M3 21h18" />
                  </svg>
                )}
                {item.icon === 'orders' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-9 4h9M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                  </svg>
                )}
                {item.icon === 'margin' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18M3 21h18M5 7h14M5 17h14M8 10h8M8 14h8" />
                  </svg>
                )}
                {item.icon === 'live-dealing' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                {item.icon === 'percentage' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                {item.icon === 'rebate' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-3.866 0-7 1.79-7 4s3.134 4 7 4 7-1.79 7-4-3.134-4-7-4zm0 0V5m0 11v3m-5-6h10" />
                  </svg>
                )}
                {item.icon === 'settings' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110 group-hover:rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
                {isOpen && <span className="flex-1 tracking-wide">{item.name}</span>}
                {item.icon === 'margin' && displayCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md animate-pulse">
                    {displayCount}
                  </span>
                )}
                {isActivePath(item.path) && (
                  <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-white rounded-l-full"></div>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Logout Button at Bottom */}
        <div className="p-2 lg:p-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={handleLogout}
            className={`group w-full flex items-center ${isOpen ? 'px-4' : 'px-2 justify-center'} py-3 text-sm font-medium text-slate-700 hover:bg-red-500 hover:text-white rounded-xl transition-all duration-200 transform hover:scale-[1.02]`}
          >
            <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 group-hover:translate-x-1`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {isOpen && <span className="tracking-wide">Logout</span>}
          </button>
        </div>
      </aside>
    </>
  )
}

export default Sidebar