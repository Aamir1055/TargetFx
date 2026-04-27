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
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center text-gray-600 hover:text-gray-900 transition-colors text-sm"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              {/* Hide sidebar toggle on mobile for settings page */}
              {false && (
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="lg:hidden text-gray-600 hover:text-gray-900 p-2 rounded-lg hover:bg-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
            </div>
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