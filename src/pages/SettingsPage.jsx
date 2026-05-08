import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { authAPI } from '../services/api'
import Sidebar from '../components/Sidebar'
import QRCodeSetup from '../components/QRCodeSetup'
import BackupCodesModal from '../components/BackupCodesModal'
import LoadingSpinner from '../components/LoadingSpinner'

const SettingsPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v !== null ? JSON.parse(v) : true
    } catch {
      return true
    }
  })
  const { user } = useAuth()
  // Mobile detection to hide sidebar on small screens
  const [isMobile, setIsMobile] = useState(() => {
    try { return typeof window !== 'undefined' ? window.innerWidth <= 768 : false } catch { return false }
  })
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const navigate = useNavigate()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  // 2FA States
  const [twoFAStatus, setTwoFAStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [setupData, setSetupData] = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [backupCodes, setBackupCodes] = useState([])
  const [showBackupCodes, setShowBackupCodes] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Fetch 2FA status on component mount
  useEffect(() => {
    fetchTwoFAStatus()
  }, [])

  const fetchTwoFAStatus = async () => {
    try {
      setLoading(true)
      const response = await authAPI.get2FAStatus()
      console.log('2FA Status Response:', response)
      
      // Handle different response structures
      const statusData = response.data?.data || response.data
      console.log('2FA Status Data:', statusData)
      
      // Update localStorage with the current status from API
      localStorage.setItem('2fa_enabled', statusData?.is_enabled ? 'true' : 'false')
      
      setTwoFAStatus(statusData)
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error)
      console.error('Error details:', error.response)
      
      // If 401, user might have 2FA enabled - check localStorage or set default
      const last2FAState = localStorage.getItem('2fa_enabled')
      if (last2FAState === 'true') {
        setTwoFAStatus({ is_enabled: true })
      } else {
        setTwoFAStatus({ is_enabled: false })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSetup2FA = async () => {
    try {
      setActionLoading(true)
      setError('')
      const response = await authAPI.setup2FA()
      console.log('2FA Setup Response:', response)
      console.log('2FA Setup Data:', response.data)
      setSetupData(response.data)
      setShowSetup(true)
    } catch (error) {
      console.error('Failed to setup 2FA:', error)
      setError('Failed to setup 2FA. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEnable2FA = async () => {
    if (!verificationCode.trim()) {
      setError('Please enter the verification code')
      return
    }

    try {
      setActionLoading(true)
      setError('')
      
      // Generate backup codes (10 random 8-digit codes)
      const generatedBackupCodes = Array.from({ length: 10 }, () => 
        Math.floor(10000000 + Math.random() * 90000000).toString()
      )
      
      const response = await authAPI.enable2FA(verificationCode, generatedBackupCodes)
      setSuccess('2FA has been successfully enabled!')
      setShowSetup(false)
      setVerificationCode('')
      setSetupData(null)
      
      // Show the generated backup codes
      setBackupCodes(generatedBackupCodes)
      setShowBackupCodes(true)
      
      // Save 2FA state to localStorage
      localStorage.setItem('2fa_enabled', 'true')
      
      // Update 2FA status immediately
      setTwoFAStatus({ is_enabled: true })
    } catch (error) {
      console.error('Failed to enable 2FA:', error)
      setError('Invalid verification code or failed to enable 2FA')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDisable2FA = async () => {
    const password = window.prompt('Please enter your password to disable 2FA:')
    if (!password) {
      return
    }

    try {
      setActionLoading(true)
      setError('')
      await authAPI.disable2FA(password)
      setSuccess('2FA has been disabled successfully')
      
      // Save 2FA state to localStorage
      localStorage.setItem('2fa_enabled', 'false')
      
      // Update 2FA status immediately
      setTwoFAStatus({ is_enabled: false })
    } catch (error) {
      console.error('Failed to disable 2FA:', error)
      setError(error.response?.data?.message || 'Failed to disable 2FA. Please check your password.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRegenerateBackupCodes = async () => {
    if (!window.confirm('Are you sure you want to regenerate backup codes? Your old codes will no longer work.')) {
      return
    }

    try {
      setActionLoading(true)
      setError('')
      const response = await authAPI.regenerateBackupCodes()
      setBackupCodes(response.data.backup_codes)
      setShowBackupCodes(true)
      setSuccess('New backup codes have been generated')
    } catch (error) {
      console.error('Failed to regenerate backup codes:', error)
      setError('Failed to regenerate backup codes. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const clearMessages = () => {
    setError('')
    setSuccess('')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex bg-gradient-to-br from-blue-50 via-white to-blue-50">
        {!isMobile && (
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
            onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
          />
        )}
        <main className={`flex-1 p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}>
          <div className="max-w-4xl mx-auto">
            {/* Shimmer Loading Cards */}
            <div className="mb-5">
              <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 w-64 bg-gray-100 rounded animate-pulse"></div>
            </div>
            
            {/* Account Info Skeleton */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-4 mb-4">
              <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-3"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i}>
                    <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mb-1"></div>
                    <div className="h-4 w-full bg-gray-200 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 2FA Section Skeleton */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-4">
              <div className="h-5 w-56 bg-gray-200 rounded animate-pulse mb-3"></div>
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse mb-2"></div>
              <div className="h-10 w-32 bg-blue-100 rounded animate-pulse"></div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50">

        {/* Sticky header */}
        <div className="sticky top-0 bg-white shadow-md z-30 px-4 py-5">
          <div className="flex items-center justify-between">
            <button onClick={() => setIsMobileSidebarOpen(true)} className="w-9 h-9 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 6h18M3 12h18M3 18h18" stroke="#000" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-black">Settings</h1>
            <div className="w-9 h-9" />
          </div>
        </div>

        {/* Sidebar drawer */}
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/25" onClick={() => setIsMobileSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[300px] bg-white shadow-xl rounded-r-2xl flex flex-col">
              <div className="p-4 flex items-center gap-3 border-b border-[#ECECEC]">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#1A63BC"/></svg>
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-[#1A63BC]">Broker Eyes</div>
                  <div className="text-[11px] text-[#7A7A7A]">Trading Platform</div>
                </div>
                <button onClick={() => setIsMobileSidebarOpen(false)} className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#404040" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto py-2">
                <nav className="flex flex-col">
                  {[
                    { label: 'Dashboard',        path: '/dashboard' },
                    { label: 'Clients',          path: '/client2' },
                    { label: 'Positions',        path: '/positions' },
                    { label: 'Pending Orders',   path: '/pending-orders' },
                    { label: 'Margin Level',     path: '/margin-level' },
                    { label: 'Live Dealing',     path: '/live-dealing' },
                    { label: 'Client Percentage',path: '/client-percentage' },
                    { label: 'Settings',         path: '/settings' },
                  ].map((item) => {
                    const isActive = item.path === '/settings'
                    const iconName = { '/dashboard': 'Dashboard', '/client2': 'Clients', '/positions': 'Positions', '/pending-orders': 'Pending-Orders', '/margin-level': 'Margin-Level', '/live-dealing': 'Live-Dealing', '/client-percentage': 'Client-Percentage', '/settings': 'Settings' }[item.path]
                    return (
                      <button key={item.path} onClick={() => { navigate(item.path); setIsMobileSidebarOpen(false) }}
                        className={`flex items-center gap-3 px-4 h-11 text-[13px] ${isActive ? 'text-[#1A63BC] bg-[#EFF4FB] rounded-lg font-semibold' : 'text-[#404040]'}`}>
                        <span className="w-5 h-5 flex items-center justify-center">
                          <img src={`${import.meta.env.BASE_URL || '/'}sidebar-icons/${iconName}.svg`} alt={item.label} style={{ filter: isActive ? undefined : 'brightness(0)' }} className="w-5 h-5" />
                        </span>
                        <span>{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>
              <div className="p-4 mt-auto border-t border-[#ECECEC]">
                <button onClick={() => { navigate('/login') }} className="flex items-center gap-3 px-2 h-10 text-[13px] text-[#404040]">
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

        <div className="p-4 space-y-4">

          {/* Alert messages */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-red-700 text-sm font-medium">{error}</span>
                </div>
                <button onClick={clearMessages} className="text-red-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 rounded-r-xl p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-green-700 text-sm font-medium">{success}</span>
                </div>
                <button onClick={clearMessages} className="text-green-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>
          )}

          {/* Account Information */}
          <div className="bg-white rounded-xl border-2 border-gray-100 shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <span className="text-[13px] font-semibold text-gray-900">Account Information</span>
            </div>
            {/* Fields */}
            {[
              { label: 'Full Name', value: user?.full_name || 'N/A' },
              { label: 'Email',     value: user?.email },
              { label: 'Username',  value: user?.username },
            ].map(({ label, value }, idx, arr) => (
              <div key={label} className={`flex items-center justify-between px-4 py-3 ${idx < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <span className="text-[12px] text-gray-500">{label}</span>
                <span className="text-[13px] font-medium text-gray-900 text-right max-w-[60%] truncate">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[12px] text-gray-500">Status</span>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${user?.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {user?.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          {/* Two-Factor Authentication */}
          <div className="bg-white rounded-xl border-2 border-gray-100 shadow-sm overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-gray-900 block">Two-Factor Authentication</span>
                  <span className="text-[11px] text-gray-400">Extra security for your account</span>
                </div>
              </div>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${twoFAStatus?.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {twoFAStatus?.is_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="p-4">
              {!showSetup ? (
                !twoFAStatus?.is_enabled ? (
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-[13px] font-semibold text-gray-900 mb-1">Enable Two-Factor Authentication</h3>
                        <p className="text-[12px] text-gray-500 mb-3">Add an extra layer of security to your account with 2FA</p>
                        <button onClick={handleSetup2FA} disabled={actionLoading}
                          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-[13px] font-medium inline-flex items-center gap-2 shadow-sm w-full justify-center">
                          {actionLoading ? (
                            <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Setting up...</>
                          ) : (
                            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>Enable 2FA</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-[13px] font-semibold text-gray-900 mb-0.5">2FA is Active</h3>
                        <p className="text-[12px] text-gray-500">Your account is secured with two-factor authentication</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={handleRegenerateBackupCodes} disabled={actionLoading}
                        className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-[13px] font-medium inline-flex items-center justify-center gap-2 shadow-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        {actionLoading ? 'Generating...' : 'Regenerate Backup Codes'}
                      </button>
                      <button onClick={handleDisable2FA} disabled={actionLoading}
                        className="bg-white hover:bg-red-50 border border-red-200 disabled:opacity-60 text-red-600 px-4 py-2.5 rounded-xl text-[13px] font-medium inline-flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        {actionLoading ? 'Disabling...' : 'Disable 2FA'}
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <QRCodeSetup
                  setupData={setupData}
                  verificationCode={verificationCode}
                  setVerificationCode={setVerificationCode}
                  onEnable={handleEnable2FA}
                  onCancel={() => { setShowSetup(false); setSetupData(null); setVerificationCode(''); clearMessages() }}
                  loading={actionLoading}
                />
              )}
            </div>
          </div>
        </div>

        {/* Backup Codes Modal */}
        {showBackupCodes && (
          <BackupCodesModal backupCodes={backupCodes} onClose={() => { setShowBackupCodes(false); setBackupCodes([]) }} />
        )}
      </div>
    )
  }
  // ── End mobile layout ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Sidebar */}
      {!isMobile && (
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
          onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
        />
      )}
      
      {/* Main Content */}
      <main className={`flex-1 p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}>
        <div className="max-w-4xl mx-auto">
          {/* Header Section */}
          <div className="mb-5">
            {/* Hide sidebar toggle on mobile for settings page */}
            {false && (
              <div className="flex items-center justify-end mb-3">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            )}
            <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage your account security</p>
          </div>

            {/* Alert Messages */}
            {error && (
              <div className="mb-3 bg-red-50 border-l-4 border-red-500 rounded-r p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-red-700 text-sm font-medium">{error}</span>
                  </div>
                  <button onClick={clearMessages} className="text-red-400 hover:text-red-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {success && (
              <div className="mb-3 bg-green-50 border-l-4 border-green-500 rounded-r p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-green-700 text-sm font-medium">{success}</span>
                  </div>
                  <button onClick={clearMessages} className="text-green-400 hover:text-green-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Account Information */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Account Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                  <p className="text-sm text-gray-900">{user?.full_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Email</label>
                  <p className="text-sm text-gray-900 truncate">{user?.email}</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Username</label>
                  <p className="text-sm text-gray-900">{user?.username}</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Status</label>
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                    user?.is_active 
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {user?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">Two-Factor Authentication</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Extra security for your account</p>
                </div>
                <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                  twoFAStatus?.is_enabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {twoFAStatus?.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {!showSetup ? (
                <div>
                  {!twoFAStatus?.is_enabled ? (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-gray-900 mb-1">Enable Two-Factor Authentication</h3>
                          <p className="text-sm text-gray-600 mb-3">
                            Add an extra layer of security to your account with 2FA
                          </p>
                          <button
                            onClick={handleSetup2FA}
                            disabled={actionLoading}
                            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-400 text-white px-4 py-2 rounded-lg transition-all text-sm font-medium inline-flex items-center shadow-sm hover:shadow"
                          >
                            {actionLoading ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Setting up...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Enable 2FA
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-gray-900 mb-1">Two-Factor Authentication Active</h3>
                          <p className="text-sm text-gray-600 mb-3">
                            Your account is secured with two-factor authentication
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleRegenerateBackupCodes}
                          disabled={actionLoading}
                          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-blue-400 disabled:to-blue-400 text-white px-3 py-2 rounded-lg transition-all text-sm font-medium inline-flex items-center shadow-sm"
                        >
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {actionLoading ? 'Generating...' : 'Regenerate Codes'}
                        </button>
                        <button
                          onClick={handleDisable2FA}
                          disabled={actionLoading}
                          className="bg-white hover:bg-red-50 border border-red-300 disabled:bg-gray-100 text-red-600 px-3 py-2 rounded-lg transition-all text-sm font-medium inline-flex items-center shadow-sm"
                        >
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          {actionLoading ? 'Disabling...' : 'Disable 2FA'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <QRCodeSetup
                  setupData={setupData}
                  verificationCode={verificationCode}
                  setVerificationCode={setVerificationCode}
                  onEnable={handleEnable2FA}
                  onCancel={() => {
                    setShowSetup(false)
                    setSetupData(null)
                    setVerificationCode('')
                    clearMessages()
                  }}
                  loading={actionLoading}
                />
              )}
            </div>
        </div>
      </main>

      {/* Backup Codes Modal */}
      {showBackupCodes && (
        <BackupCodesModal
          backupCodes={backupCodes}
          onClose={() => {
            setShowBackupCodes(false)
            setBackupCodes([])
          }}
        />
      )}
    </div>
  )
}

export default SettingsPage