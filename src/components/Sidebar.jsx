import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useGroups } from '../contexts/GroupContext'
import { useIB } from '../contexts/IBContext'
import { useState, useEffect } from 'react'

const Sidebar = ({ isOpen, onClose, onToggle, marginLevelCount = 0, mobileOnly = false, desktopOnly = false }) => {
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

  // Global Compact / Full numeric display mode (applies across all pages)
  const [displayMode, setDisplayMode] = useState(() => {
    try {
      const saved = localStorage.getItem('globalDisplayMode')
      return saved === 'full' ? 'full' : 'compact'
    } catch { return 'compact' }
  })
  const changeDisplayMode = (next) => {
    setDisplayMode(next)
    try { localStorage.setItem('globalDisplayMode', next) } catch {}
    try { window.dispatchEvent(new CustomEvent('globalDisplayModeChanged', { detail: next })) } catch {}
  }
  useEffect(() => {
    const onChange = (e) => {
      const v = (e && e.detail) || localStorage.getItem('globalDisplayMode')
      if (v === 'full' || v === 'compact') setDisplayMode(v)
    }
    window.addEventListener('globalDisplayModeChanged', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('globalDisplayModeChanged', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  
  const navigationItems = [
    { name: 'Clients', path: '/client2', icon: 'client2', img: 'Clients.svg' },
    { name: 'Positions', path: '/positions', icon: 'positions', img: 'Positions.svg' },
    { name: 'Pending Orders', path: '/pending-orders', icon: 'orders', img: 'Pending-Orders.svg' },
    { name: 'Margin Level', path: '/margin-level', icon: 'margin', img: 'Margin-Level.svg' },
    { name: 'Live Dealing', path: '/live-dealing', icon: 'live-dealing', img: 'Live-Dealing.svg' },
    { name: 'Client Percentage', path: '/client-percentage', icon: 'percentage', img: 'Client-Percentage.svg' },
    { name: 'Bills', path: '/bills', icon: 'bills', img: 'Bills.svg' },
    {
      name: 'Reports',
      icon: 'reports',
      img: 'Bills.svg',
      children: [
        { name: 'Exchange Data', path: '/reports/exchange' },
        { name: 'Historical Positions', path: '/reports/historical-positions' }
      ]
    },
    { name: 'Settings', path: '/settings', icon: 'settings', img: 'Settings.svg' }
  ]

  const isReportsActive = location.pathname.startsWith('/reports')
  const [reportsOpen, setReportsOpen] = useState(isReportsActive)
  useEffect(() => { if (isReportsActive) setReportsOpen(true) }, [isReportsActive])
  const reportsExpanded = reportsOpen

  const baseUrl = import.meta.env.BASE_URL || '/'
  
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
    return location.pathname === path
  }

  const handleLogout = async () => {
    await logout()
    if (typeof onClose === 'function') {
      onClose()
    }
  }

  return (
    <>
      {/* Mobile navigation drawer */}
      {!desktopOnly && isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/10"
            onClick={() => typeof onClose === 'function' && onClose()}
          />
          <aside className="absolute left-0 top-0 h-full w-[300px] bg-white shadow-xl rounded-r-2xl flex flex-col">
            <div className="p-4 flex items-center gap-3 border-b border-[#ECECEC]">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <img src={`${baseUrl}Favicon.svg`} alt="Broker Eyes" className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-[#1A63BC]">Broker Eyes</div>
                <div className="text-[11px] text-[#7A7A7A]">Trading Platform</div>
              </div>
              <button
                type="button"
                onClick={() => typeof onClose === 'function' && onClose()}
                className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center"
                aria-label="Close menu"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" stroke="#404040" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto py-2">
              <div className="px-3 pb-3 pt-1">
                <p className="text-[9px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5 px-1">Display Mode</p>
                <div className="flex items-center bg-[#F3F4F6] p-0.5 w-full rounded">
                  <button
                    type="button"
                    onClick={() => changeDisplayMode('compact')}
                    className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${displayMode === 'compact' ? 'bg-[#3B5BDB] text-white shadow-sm' : 'text-[#374151] hover:bg-white/70'}`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => changeDisplayMode('full')}
                    className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${displayMode === 'full' ? 'bg-[#3B5BDB] text-white shadow-sm' : 'text-[#374151] hover:bg-white/70'}`}
                  >
                    Full
                  </button>
                </div>
              </div>
              <div className="border-t border-[#ECECEC] mb-2" />
              <nav className="flex flex-col">
                {navigationItems.map(item => {
                  const isParentActive = item.children?.some(child => isActivePath(child.path))
                  if (item.children) {
                    return (
                      <div key={item.name}>
                        <button
                          type="button"
                          onClick={() => setReportsOpen(value => !value)}
                          className="flex items-center gap-3 px-4 h-11 w-full text-[13px] text-[#404040]"
                        >
                          <img
                            src={`${baseUrl}sidebar-icons/${item.img}`}
                            alt={item.name}
                            className="w-5 h-5"
                            style={{ filter: 'brightness(0)' }}
                          />
                          <span className="flex-1 text-left">{item.name}</span>
                          <svg className={`w-4 h-4 transition-transform ${reportsExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        {reportsExpanded && item.children.map(child => (
                          <button
                            key={child.path}
                            type="button"
                            onClick={() => handleNavigate(child.path)}
                            className={`flex items-center w-full h-10 pl-14 pr-4 text-left text-[13px] ${isActivePath(child.path) ? 'text-[#1A63BC] bg-[#EFF4FB] rounded-lg font-semibold' : 'text-[#404040]'}`}
                          >
                            {child.name}
                          </button>
                        ))}
                      </div>
                    )
                  }

                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => handleNavigate(item.path)}
                      onTouchEnd={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        handleNavigate(item.path)
                      }}
                      className={`flex items-center gap-3 px-4 h-11 w-full text-[13px] ${isActivePath(item.path) ? 'text-[#1A63BC] bg-[#EFF4FB] rounded-lg font-semibold' : 'text-[#404040]'}`}
                    >
                      <img
                        src={`${baseUrl}sidebar-icons/${item.img}`}
                        alt={item.name}
                        className="w-5 h-5"
                        style={{ filter: isActivePath(item.path) ? undefined : 'brightness(0)' }}
                      />
                      <span>{item.name}</span>
                      {item.icon === 'margin' && displayCount > 0 && <span className="ml-auto rounded-full bg-red-400 px-2 py-0.5 text-[11px] font-bold text-white">{displayCount}</span>}
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="p-4 mt-auto border-t border-[#ECECEC]">
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-3 px-2 h-[37px] text-[10px] text-[#404040]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M4 12h11" stroke="#404040" strokeWidth="2" />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Sidebar */}
      {!mobileOnly && <aside
        className={`
          hidden lg:flex fixed inset-y-0 left-0 z-50 lg:z-auto
          w-64 bg-white
          border-r border-slate-200 shadow-lg
          transform transition-transform duration-300 ease-in-out
          lg:flex-col h-screen overflow-visible
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
              <img src={`${baseUrl}Favicon.svg`} alt="Broker Eyes" className="w-6 h-6" style={{ filter: 'brightness(0) invert(1)' }} />
            </div>
            {isOpen && (
              <div className="ml-3">
                <h1 className="text-lg font-bold text-slate-800 tracking-tight">Broker Eyes</h1>
                <p className="text-xs text-slate-500">Trading Platform</p>
              </div>
            )}
          </div>

          {/* Global Compact / Full numeric display mode (applies across all pages) */}
          {isOpen ? (
            <div className="px-3 pt-3">
              <div className="flex items-center bg-[#F3F4F6] p-0.5 w-full overflow-hidden" style={{borderRadius:'4px'}}>
                <button
                  type="button"
                  onClick={() => changeDisplayMode('compact')}
                  className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${displayMode === 'compact' ? 'bg-[#3B5BDB] text-white shadow-sm' : 'text-[#374151] hover:bg-white/70'}`}
                  style={{borderRadius:'4px'}}
                >
                  Compact
                </button>
                <button
                  type="button"
                  onClick={() => changeDisplayMode('full')}
                  className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${displayMode === 'full' ? 'bg-[#3B5BDB] text-white shadow-sm' : 'text-[#374151] hover:bg-white/70'}`}
                  style={{borderRadius:'4px'}}
                >
                  Full
                </button>
              </div>
            </div>
          ) : (
            <div className="px-2 pt-3 flex justify-center">
              <button
                type="button"
                onClick={() => changeDisplayMode(displayMode === 'compact' ? 'full' : 'compact')}
                title={`Display: ${displayMode === 'compact' ? 'Compact' : 'Full'} (click to toggle)`}
                className="w-9 h-9 flex items-center justify-center rounded-md bg-[#F3F4F6] text-[10px] font-bold text-[#3B5BDB] hover:bg-white border border-[#E5E7EB]"
              >
                {displayMode === 'compact' ? 'C' : 'F'}
              </button>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto px-2 py-4">
            {navigationItems.map((item) => {
              if (item.children) {
                const anyChildActive = item.children.some(c => isActivePath(c.path))
                const expanded = isOpen && reportsExpanded
                return (
                  <div key={item.name}>
                    <button
                      onClick={() => {
                        if (!isOpen) {
                          // Collapsed sidebar: navigate to first child directly
                          handleNavigate(item.children[0].path)
                        } else {
                          setReportsOpen(v => !v)
                        }
                      }}
                      className={`
                        group w-full text-left flex items-center ${isOpen ? 'px-4' : 'px-2 justify-center'} py-3 rounded-xl text-sm font-medium
                        transition-all duration-200 transform hover:scale-[1.02]
                        ${anyChildActive
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                    >
                      <img
                        src={`${baseUrl}sidebar-icons/${item.img}`}
                        alt={item.name}
                        className={`w-5 h-5 flex-shrink-0 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${anyChildActive ? '' : 'group-hover:scale-110'}`}
                        style={{ filter: anyChildActive ? 'brightness(0) invert(1)' : 'brightness(0)' }}
                      />
                      {isOpen && <span className="flex-1 tracking-wide">{item.name}</span>}
                      {isOpen && (
                        <svg
                          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''} ${anyChildActive ? 'text-white' : 'text-slate-500'}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </button>
                    {expanded && (
                      <div className="mt-1 ml-6 border-l border-slate-200 pl-2 space-y-1">
                        {item.children.map(child => (
                          <button
                            key={child.name}
                            onClick={() => handleNavigate(child.path)}
                            className={`w-full text-left flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200
                              ${isActivePath(child.path)
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                              }`}
                          >
                            <span className="flex-1 tracking-wide">{child.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }

              return (
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
                <img
                  src={`${baseUrl}sidebar-icons/${item.img}`}
                  alt={item.name}
                  className={`w-5 h-5 flex-shrink-0 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`}
                  style={{ filter: isActivePath(item.path) ? 'brightness(0) invert(1)' : 'brightness(0)' }}
                />
                {item.icon === 'rebate' && (
                  <svg className={`w-5 h-5 ${isOpen ? 'mr-3' : ''} transition-transform duration-200 ${isActivePath(item.path) ? '' : 'group-hover:scale-110'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-3.866 0-7 1.79-7 4s3.134 4 7 4 7-1.79 7-4-3.134-4-7-4zm0 0V5m0 11v3m-5-6h10" />
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
              )
            })}
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
      </aside>}
    </>
  )
}

export default Sidebar