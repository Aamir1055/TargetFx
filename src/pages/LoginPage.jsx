import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TwoFactorVerification from '../components/TwoFactorVerification'
import Group8 from '../../Login Desktop Icons/Group 8.svg'
import Group9 from '../../Login Desktop Icons/Group 9.svg'
import Group10 from '../../Login Desktop Icons/Group 10.svg'

const LoginPage = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  const { login, requires2FA, authError } = useAuth()

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Clear previous error
    setErrorMessage('')

    // Validation
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please fill in all fields')
      return
    }

    setIsLoading(true)

    try {
      const result = await login(username, password)
      
      // Handle login response
      if (result?.requires2FA) {
        // 2FA required - AuthContext will handle the state
        setIsLoading(false)
      } else if (result?.success) {
        // Login successful - user will be redirected by AuthContext
        setIsLoading(false)
      } else {
        // Login failed - show error
        setErrorMessage(result?.error || 'Invalid username or password. Please try again.')
        setIsLoading(false)
      }
    } catch (err) {
      // Handle unexpected errors
      console.error('Login error:', err)
      setErrorMessage('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  // Show 2FA verification if required
  if (requires2FA) {
    return <TwoFactorVerification />
  }

  return (
    <div className="h-screen overflow-hidden bg-white relative flex">
      {/* Left Side - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 relative z-10">
        <div className={`w-[372px] transition-all duration-1000 transform lg:-translate-x-40 xl:-translate-x-64 2xl:-translate-x-80 ${
          isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}>
          {/* Logo and Header */}
          <div className="mb-8">
            <div className="flex items-center justify-center gap-4 mb-8">
              {/* Gradient square + eye icon per Figma */}
              <div
                className="w-10 h-10 rounded-lg relative flex items-center justify-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(26, 99, 188, 0.6) 0%, #1A63BC 100%)'
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5c-4.477 0-8.268 2.943-9.542 7 1.274 4.057 5.064 7 9.542 7 4.478 0 8.268-2.943 9.542-7C20.268 7.943 16.478 5 12 5Z" fill="#FFFFFF"/>
                  <circle cx="12" cy="12" r="3" fill="#1A63BC"/>
                </svg>
              </div>
              <div className="flex flex-col justify-center items-center text-center">
                <h1 className="text-[16px] leading-5 font-semibold text-[#404040]">Broker Eyes</h1>
                <p className="text-[12px] leading-5 font-medium text-[#64748B]">Trading Platform</p>
              </div>
            </div>

            <h2 className="text-[20px] leading-[25px] font-semibold text-[#333333] mb-2">Welcome Back</h2>
            <p className="text-[#8C8C8C] text-[12px] leading-[15px]">Welcome back to access your account. Make sure you use correct information</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="mt-[24px] space-y-[24px]">
            {/* Username Field */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-[#999999]" viewBox="0 0 24 24" fill="none" stroke="#999999" strokeWidth="1.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full h-[55px] pl-12 pr-4 text-[#333] bg-[rgba(239,246,255,0.36)] border-[2px] border-[#9CA3AF] rounded-[9px] focus:ring-2 focus:ring-[#9CA3AF] focus:border-[#9CA3AF] transition-all duration-200 placeholder-[#8A93A6]"
                  placeholder="Username"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-[#999999]" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="9" width="16" height="11" rx="2" stroke="#999999" strokeWidth="1.5"/>
                    <path d="M8 9V7a4 4 0 118 0v2" stroke="#999999" strokeWidth="1.5"/>
                  </svg>
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full h-[55px] pl-12 pr-12 text-[#333] bg-[rgba(239,246,255,0.36)] border-[2px] border-[#9CA3AF] rounded-[9px] focus:ring-2 focus:ring-[#9CA3AF] focus:border-[#9CA3AF] transition-all duration-200 placeholder-[#8A93A6]"
                  placeholder="Password"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#999999] hover:text-[#5B8DEF] transition-colors duration-200"
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {/* Reset Password link removed as requested */}
            </div>

            {/* Error Message */}
            {(errorMessage || authError) && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                    <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium text-red-800">{errorMessage || authError}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[55px] bg-[#2563EB] hover:bg-[#1E55D0] disabled:bg-gray-400 text-white font-bold rounded-[12px] transition-all duration-300 shadow-lg hover:shadow-xl disabled:cursor-not-allowed text-[16px]"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3" />
                  <span>Signing in...</span>
                </div>
              ) : (
                'Log In'
              )}
            </button>
          </form>

          {/* Footer removed; copyright moved to hero side */}
        </div>
      </div>

      {/* Right Side - Blue Wave Design (true circles, beyond semicircle, absolute overlay) */}
      <div className="hidden lg:block pointer-events-none absolute inset-0 z-0">
        {/* Ellipse 49 (shifted right with stronger bottom-right taper) */}
         <div
           className="absolute rounded-full"
           style={{
            width: '1549px',
            height: '1490px',
            left: '758px',
            top: '-372px',
             background: '#4471D6',
             WebkitMaskImage: 'linear-gradient(115deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)',
             maskImage: 'linear-gradient(115deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)'
           }}
         />

        {/* Ellipse 51 (shifted right with stronger bottom-right taper) */}
         <div
           className="absolute rounded-full"
           style={{
            width: '1549px',
            height: '1490px',
            left: '808px',
            top: '-377px',
             background: '#3B65C5',
             WebkitMaskImage: 'linear-gradient(115deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)',
             maskImage: 'linear-gradient(115deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)'
           }}
         />

        {/* Ellipse 50 (shifted right with stronger bottom-right taper) */}
         <div
           className="absolute rounded-full"
           style={{
            width: '1549px',
            height: '1456px',
            left: '856px',
            top: '-359px',
             background: '#1641A2',
             WebkitMaskImage: 'linear-gradient(115deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)',
             maskImage: 'linear-gradient(115deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%)'
           }}
         />

        {/* Ellipse 29 - Border Circle (no mask per Figma) */}
        <div
          className="absolute rounded-full box-border"
          style={{
            width: '320px',
            height: '320px',
            right: '-160px',
            top: 'calc(20% - 160px)',
            border: '80px solid rgba(220, 240, 153, 0.06)',
            background: 'transparent'
          }}
        />

        {/* Copyright at page bottom inside the dark inner circle */}
        <div
          className="absolute text-white text-[12px]"
          style={{
            right: '40px',
            bottom: '24px',
            opacity: 0.85
          }}
        >
          Copyright © 2025 Brokers Eye Platform
        </div>

        {/* Content inside dark blue semicircle */}
        <div
          className="absolute text-white text-left"
          style={{
            right: '60px',
            top: '10%',
            maxWidth: '540px',
          }}
        >
          {/* Main Heading */}
          <h1
            className="font-bold text-3xl lg:text-4xl xl:text-5xl mb-10"
            style={{
              lineHeight: '1.2',
              textShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}
          >
            Your Path To Financial<br />Recovery!
          </h1>

          {/* Feature Icons */}
          <div className="flex gap-8 mb-6 justify-center">
            {/* Secure Trading Infrastructure */}
            <div className="flex flex-col items-center text-center" style={{ width: '160px' }}>
              <div className="relative w-20 h-20 mb-3">
                <img src={Group8} alt="Secure Trading Infrastructure" className="absolute inset-0 w-full h-full select-none" />
              </div>
              <span className="text-sm font-semibold" style={{ lineHeight: '1.3' }}>Secure Trading<br />Infrastructure</span>
            </div>

            {/* Fast And Reliable Execution */}
            <div className="flex flex-col items-center text-center" style={{ width: '160px' }}>
              <div className="relative w-20 h-20 mb-3">
                <img src={Group9} alt="Fast And Reliable Execution" className="absolute inset-0 w-full h-full select-none" />
              </div>
              <span className="text-sm font-semibold" style={{ lineHeight: '1.3' }}>Fast And Reliable<br />Execution</span>
            </div>

            {/* Real-Time Market Insights */}
            <div className="flex flex-col items-center text-center" style={{ width: '160px' }}>
              <div className="relative w-20 h-20 mb-3">
                <img src={Group10} alt="Real-Time Market Insights" className="absolute inset-0 w-full h-full select-none" />
              </div>
              <span className="text-sm font-semibold" style={{ lineHeight: '1.3' }}>Real-Time Market<br />Insights</span>
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-sm text-center" style={{ lineHeight: '1.6', opacity: 0.9, paddingLeft: '30px' }}>
            
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
