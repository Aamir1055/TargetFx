import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

const TwoFactorVerification = () => {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const { verify2FA, logout, loading } = useAuth()

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!code || code.length !== 6) {
      setError('Please enter a valid 6-digit code')
      setIsLoading(false)
      return
    }

    console.log('Attempting 2FA verification with code:', code)

    try {
      const result = await verify2FA(code)
      console.log('2FA verification result:', result)
      
      if (!result.success) {
        const errorMsg = result.error || 'Verification failed. Please try again.'
        console.error('2FA verification failed:', errorMsg)
        setError(errorMsg)
      } else {
        console.log('2FA verification successful!')
        // Success case - the auth context will handle the redirect
      }
    } catch (err) {
      console.error('2FA verification error:', err)
      const errorMsg = err.response?.data?.message || err.message || 'Verification failed. Please try again.'
      setError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Background - Responsive */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100">
        {/* Animated Background Patterns - Responsive */}
        <div className="absolute inset-0">
          <div className="absolute top-16 left-8 sm:top-32 sm:left-32 w-32 h-32 sm:w-64 sm:h-64 bg-blue-200/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse" />
          <div className="absolute top-10 right-8 sm:top-20 sm:right-32 w-32 h-32 sm:w-64 sm:h-64 bg-indigo-200/20 rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-16 left-4 sm:bottom-32 sm:left-20 w-32 h-32 sm:w-64 sm:h-64 bg-blue-300/15 rounded-full mix-blend-multiply filter blur-xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
        
        {/* Security-themed floating elements - Responsive */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="absolute w-4 h-4 sm:w-6 sm:h-6 bg-blue-400/10 rounded-full animate-float"
              style={{
                left: `${30 + i * 20}%`,
                top: `${30 + i * 15}%`,
                animationDelay: `${i * 0.8}s`,
                animationDuration: `${4 + i * 0.3}s`
              }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen py-4 sm:py-8 lg:py-12 px-3 sm:px-4 lg:px-6">
        <div className={`max-w-xs sm:max-w-sm w-full space-y-4 sm:space-y-6 transition-all duration-1000 transform ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}>
          {/* Enhanced Header - Responsive */}
          <div className="text-center">
            <div className="flex justify-center mb-3 sm:mb-4">
              <div className="relative">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg sm:rounded-xl flex items-center justify-center shadow-xl transform hover:scale-105 transition-transform duration-300">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="absolute -inset-1 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-lg sm:rounded-xl blur opacity-25 animate-pulse" />
                
                {/* Security badge - Responsive */}
                <div className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 w-5 h-5 sm:w-6 sm:h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
            <h2 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent mb-2 px-2 sm:px-0">
              Two-Factor Authentication
            </h2>
            <p className="text-gray-700 text-xs sm:text-sm font-medium px-4 sm:px-0">
              Enter the 6-digit code from your authenticator app
            </p>
            
            {/* Progress dots - Responsive */}
            <div className="flex justify-center space-x-1 sm:space-x-2 mt-3 sm:mt-4">
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-400 rounded-full" />
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-blue-400 rounded-full animate-pulse" />
              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-gray-300 rounded-full" />
            </div>
          </div>

          {/* Enhanced 2FA Form - Responsive */}
          <div className="relative">
            {/* Glass Effect Background */}
            <div className="absolute inset-0 bg-white/70 backdrop-blur-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-white/50" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/80 to-blue-50/50 rounded-2xl sm:rounded-3xl" />
            
            <div className="relative p-3 sm:p-4">
              <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                {/* Enhanced Code Input - Responsive */}
                <div className="transform hover:scale-105 transition-transform duration-200">
                  <label htmlFor="code" className="block text-xs sm:text-sm font-bold text-gray-800 mb-2 sm:mb-3 text-center">
                    Verification Code
                  </label>
                  <div className="relative group">
                    <input
                      id="code"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="block w-full px-3 sm:px-4 py-3 sm:py-4 text-lg sm:text-xl text-center text-gray-900 bg-white/90 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-300 tracking-[0.25em] sm:tracking-[0.35em] font-mono shadow-inner placeholder-gray-400"
                      placeholder="● ● ● ● ● ●"
                      maxLength={6}
                      disabled={isLoading}
                      required
                    />
                    <div className="absolute inset-0 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-400/5 to-indigo-400/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                    
                    {/* Progress indicator - Responsive */}
                    <div className="absolute -bottom-1 sm:-bottom-2 left-1/2 transform -translate-x-1/2">
                      <div className="flex space-x-0.5 sm:space-x-1">
                        {[...Array(6)].map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-0.5 sm:w-2 sm:h-1 rounded-full transition-all duration-200 ${
                              i < code.length ? 'bg-blue-500 shadow-sm' : 'bg-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center mt-3 sm:mt-4">
                    <div className="flex items-center space-x-1 sm:space-x-2 text-xs text-gray-600">
                      <svg className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium">Check your authenticator app</span>
                    </div>
                  </div>
                </div>

                {/* Enhanced Error Message - Responsive */}
                {error && (
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg sm:rounded-xl p-3 sm:p-4 animate-shake">
                    <div className="flex items-center">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 bg-red-100 rounded-full flex items-center justify-center mr-2 sm:mr-3 flex-shrink-0">
                        <svg className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <span className="text-xs sm:text-sm font-medium text-red-800">{error}</span>
                    </div>
                  </div>
                )}

                {/* Enhanced Submit Button - Responsive */}
                <button
                  type="submit"
                  disabled={isLoading || loading || code.length !== 6}
                  className="group relative w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-lg hover:shadow-xl"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-700 to-indigo-700 rounded-lg sm:rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative flex items-center justify-center">
                    {isLoading || loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white mr-2 sm:mr-3" />
                        <span className="text-sm sm:text-base">Verifying...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm sm:text-base">Verify Code</span>
                      </>
                    )}
                  </div>
                </button>

                {/* Enhanced Back Button - Responsive */}
                <button
                  type="button"
                  onClick={() => logout()}
                  className="group relative w-full bg-white/80 hover:bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-2.5 sm:py-3 px-4 rounded-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500/20 shadow-md hover:shadow-lg"
                  disabled={isLoading}
                >
                  <div className="flex items-center justify-center">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 group-hover:-translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="text-sm sm:text-base">Back to Login</span>
                  </div>
                </button>
              </form>
            </div>
          </div>

          {/* Enhanced Footer - Responsive */}
          <div className="text-center text-xs sm:text-sm text-gray-600 font-medium px-4 sm:px-0">
            © 2025 Broker Eyes. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  )
}

export default TwoFactorVerification
