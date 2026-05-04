import React, { createContext, useContext, useState, useEffect } from 'react'
import { authAPI, scheduleTokenRefresh, cancelTokenRefresh } from '../services/api'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState(null)

  // Check if user is already logged in on app start
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user_data')
    
    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData)
        setUser(parsedUser)
        setIsAuthenticated(true)
        scheduleTokenRefresh() // proactively refresh before token expires
        console.log('[Auth] Session restored from localStorage')
      } catch (error) {
        console.error('Error parsing stored user data:', error)
        logout()
      }
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    try {
      setLoading(true)
      setAuthError(null)
      const response = await authAPI.login(username, password)
      
      // Check if the response indicates 2FA is required
      if (response.status === 'success' && response.data?.requires_2fa) {
        // 2FA required
        setRequires2FA(true)
        setTempToken(response.data.temp_token)
        return { success: true, requires2FA: true }
      } else if (response.status === 'success' && response.data?.access_token) {
        // Direct login success
        handleLoginSuccess(response.data)
        return { success: true, requires2FA: false }
      } else {
        // Unexpected response format
        const errMsg = response.message || 'Login failed'
        setAuthError(errMsg)
        return { 
          success: false, 
          error: errMsg 
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      console.error('Error response:', error.response)
      console.error('Error data:', error.response?.data)
      
      // Extract error message from various possible locations
      let errorMessage = 'Login failed. Please check your credentials.'
      
      if (error.response?.data) {
        // Try different paths where error message might be
        errorMessage = error.response.data.message 
          || error.response.data.data?.message 
          || error.response.data.error
          || error.response.data.data?.error
          || (typeof error.response.data === 'string' ? error.response.data : null)
          || errorMessage
      } else if (error.message) {
        errorMessage = error.message
      }
      
      console.log('Final error message to display:', errorMessage)
      setAuthError(errorMessage)
      
      return { 
        success: false, 
        error: errorMessage 
      }
    } finally {
      setLoading(false)
    }
  }

  const verify2FA = async (code) => {
    try {
      setLoading(true)
      const response = await authAPI.verify2FA(tempToken, code)
      
      if (response.status === 'success' && response.data?.access_token) {
        handleLoginSuccess(response.data)
        setRequires2FA(false)
        setTempToken(null)
        return { success: true }
      } else {
        return { 
          success: false, 
          error: response.message || '2FA verification failed' 
        }
      }
    } catch (error) {
      console.error('2FA verification error:', error)
      return { 
        success: false, 
        error: error.response?.data?.message || error.response?.data?.data?.message || '2FA verification failed' 
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLoginSuccess = (data) => {
    // Store tokens
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('user_data', JSON.stringify(data.broker))
    // Reset sidebar to open on every login
    localStorage.setItem('sidebarOpen', JSON.stringify(true))
    
    // Update state
    setUser(data.broker)
    setIsAuthenticated(true)
    setAuthError(null)
    
    scheduleTokenRefresh() // proactively refresh before token expires
    console.log('[Auth] Login successful - tokens stored')
    console.log('[Auth] Refresh token will be used automatically when access token expires')
    
    // Dispatch login event to trigger IB email fetch
    window.dispatchEvent(new CustomEvent('auth:login'))
    console.log('[Auth] Login event dispatched')
  }

  const logout = async () => {
    try {
      await authAPI.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear storage and state regardless of API call success
      cancelTokenRefresh()
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user_data')
      
      setUser(null)
      setIsAuthenticated(false)
      setRequires2FA(false)
      setTempToken(null)

      // Navigate to login explicitly so user is redirected immediately
      try { window.dispatchEvent(new CustomEvent('auth:logout')) } catch {}
      if (typeof window !== 'undefined') {
        window.location.href = window.location.origin + '/login'
      }
    }
  }

  const setup2FA = async () => {
    try {
      const response = await authAPI.setup2FA()
      return { success: true, data: response.data }
    } catch (error) {
      console.error('2FA setup error:', error)
      return { 
        success: false, 
        error: error.response?.data?.message || '2FA setup failed' 
      }
    }
  }

  const enable2FA = async (code) => {
    try {
      const response = await authAPI.enable2FA(code)
      return { success: true, data: response.data }
    } catch (error) {
      console.error('2FA enable error:', error)
      return { 
        success: false, 
        error: error.response?.data?.message || '2FA enable failed' 
      }
    }
  }

  const get2FAStatus = async () => {
    try {
      const response = await authAPI.get2FAStatus()
      return { success: true, data: response.data }
    } catch (error) {
      console.error('Get 2FA status error:', error)
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to get 2FA status' 
      }
    }
  }

  const regenerateBackupCodes = async () => {
    try {
      const response = await authAPI.regenerateBackupCodes()
      return { success: true, data: response.data }
    } catch (error) {
      console.error('Regenerate backup codes error:', error)
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to regenerate backup codes' 
      }
    }
  }

  const resetLogin = () => {
    setRequires2FA(false)
    setTempToken(null)
    setLoading(false)
  }

  // Refresh user rights from /api/auth/broker/me on every page load/refresh.
  useEffect(() => {
    if (!isAuthenticated) return

    const refreshRights = async () => {
      try {
        const res = await authAPI.getMe()
        // Response may be wrapped: { status, data: { broker } } or { data: broker } or the broker directly
        const broker =
          res?.data?.broker ??
          res?.broker ??
          (res?.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : null)
        if (broker && typeof broker === 'object') {
          setUser((prev) => ({ ...prev, ...broker }))
          localStorage.setItem('user_data', JSON.stringify({ ...(JSON.parse(localStorage.getItem('user_data') || '{}')), ...broker }))
          console.log('[Auth] User rights refreshed from /api/auth/broker/me')
        }
      } catch (err) {
        // 401 is handled globally by the axios interceptor (auto-logout)
        if (err?.response?.status !== 401) {
          console.warn('[Auth] Failed to refresh user rights:', err?.message)
        }
      }
    }

    refreshRights()
  }, [isAuthenticated])

  const value = {
    user,
    isAuthenticated,
    loading,
    requires2FA,
    authError,
    login,
    verify2FA,
    logout,
    setup2FA,
    enable2FA,
    get2FAStatus,
    regenerateBackupCodes,
    resetLogin
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext