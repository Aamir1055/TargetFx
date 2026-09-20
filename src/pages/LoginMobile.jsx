import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import TwoFactorVerification from '../components/TwoFactorVerification'
import Group8 from '../assets/Group 8.svg'
import Group9 from '../assets/Group 9.svg'
import Group10 from '../assets/Group 10.svg'

const LoginMobile = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const showSelfRegister = Boolean(window.Telegram?.WebApp?.initData)

  const { login, requires2FA, authError, telegramLink } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')

    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please fill in all fields')
      return
    }

    setIsLoading(true)

    try {
      const initData = window.Telegram?.WebApp?.initData
      
      if (initData && showSelfRegister) {
        // Telegram self-register flow
        const result = await telegramLink(initData, username, password)
        if (!result.success) {
          setErrorMessage(result.error || 'Failed to link account')
        }
      } else {
        // Regular login
        const result = await login(username, password)
        if (!result?.success && !result?.requires2FA) {
          setErrorMessage(result?.error || 'Invalid credentials')
        }
      }
    } catch (err) {
      setErrorMessage('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (requires2FA) {
    return <TwoFactorVerification />
  }

  return (
    <div className="w-full min-h-screen bg-white overflow-hidden">
      <div className="relative w-full h-screen bg-white overflow-hidden">
        {/* Background Ellipses */}
        <div className="absolute rounded-full" style={{ width: 651, height: 651, left: -40, top: -250, background: '#4471D6' }} />
        <div className="absolute rounded-full" style={{ width: 651, height: 652, left: -32, top: -270, background: '#3B65C5' }} />
        <div className="absolute rounded-full" style={{ width: 651, height: 651, left: -22, top: -296, background: '#1641A2' }} />

        {/* Upper-right circle */}
        <div className="absolute rounded-full box-border" style={{ width: 243, height: 256, left: 286, top: -200, border: '30px solid rgba(220, 240, 153, 0.06)' }} />

        {/* Brand Logo */}
        <div className="absolute" style={{ left: '50%', transform: 'translateX(-50%)', top: 24, width: 149, height: 42 }}>
          <div className="w-full h-full flex flex-row items-center justify-center gap-[6.4px]">
            <div
              className="w-[33.07px] h-[33.07px] rounded-[8px] relative flex items-center justify-center"
              style={{ background: '#FFFFFF' }}
            >
              <img src="/Favicon.svg" alt="Broker Eyes" className="w-[17.08px] h-[17.08px]" />
            </div>
            <div className="flex flex-col justify-center items-start gap-[5px]" style={{ width: 97, height: 50 }}>
              <div className="font-outfit font-semibold text-[18px] leading-[24px] text-white flex items-center">Broker Eyes</div>
              <div className="font-outfit font-normal text-[10px] leading-[16px] tracking-[0.14em] text-[#F2F2F7] flex items-center whitespace-nowrap">Trading Platform</div>
            </div>
          </div>
        </div>

        {/* Hero heading */}
        <div className="absolute text-white font-outfit font-extrabold text-[26px] leading-[32px] capitalize text-center" style={{ width: 340, left: '50%', transform: 'translateX(-50%)', top: 75 }}>
          Your Path To Financial Recovery!
        </div>

        {/* Feature boxes */}
        <div className="absolute flex justify-center items-start gap-[20px]" style={{ left: '50%', transform: 'translateX(-50%)', top: 180, width: 320 }}>
          <div className="flex flex-col items-center gap-[6px]" style={{ width: 85 }}>
            <div className="relative w-[40px] h-[40px] flex items-center justify-center">
              <img src={Group8} alt="Secure Trading Infrastructure" className="w-full h-full object-contain select-none" />
            </div>
            <div className="font-outfit font-semibold text-[8px] leading-[10px] text-white text-center">Secure Trading<br />Infrastructure</div>
          </div>
          <div className="flex flex-col items-center gap-[6px]" style={{ width: 85 }}>
            <div className="relative w-[40px] h-[40px] flex items-center justify-center">
              <img src={Group9} alt="Fast and reliable execution" className="w-full h-full object-contain select-none" />
            </div>
            <div className="font-outfit font-semibold text-[8px] leading-[10px] text-white text-center">Fast And Reliable<br />Execution</div>
          </div>
          <div className="flex flex-col items-center gap-[6px]" style={{ width: 85 }}>
            <div className="relative w-[40px] h-[40px] flex items-center justify-center">
              <img src={Group10} alt="Real-time market insights" className="w-full h-full object-contain select-none" />
            </div>
            <div className="font-outfit font-semibold text-[8px] leading-[10px] text-white text-center">Real-Time Market<br />Insights</div>
          </div>
        </div>

        {/* Form header */}
        <div className="absolute" style={{ left: 20, top: 390, width: 324, height: 55 }}>
          <div className="flex flex-col items-start gap-[5px]">
            <div className="font-outfit font-semibold text-[22px] leading-[28px] text-[#2563EB]">
              {showSelfRegister ? 'Complete Registration' : 'Welcome Back'}
            </div>
            <div className="font-outfit font-normal text-[11px] leading-[14px] text-[#8C8C8C]">
              {showSelfRegister ? 'Link your Telegram account with broker credentials' : 'Welcome back to access your account'}
            </div>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          {/* Username field */}
          <div className="absolute" style={{ left: 20, top: 465, width: 372, height: 50 }}>
            <div className="w-full h-full rounded-[9px] bg-[rgba(239,246,255,0.36)] border border-[#EDEDED] flex items-center px-[17px] gap-[15px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1 bg-transparent outline-none text-[#333333] placeholder-[#999999] font-montserrat font-medium text-[14px]"
                placeholder="Username"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          {/* Password field */}
          <div className="absolute" style={{ left: 20, top: 535, width: 372, height: 50 }}>
            <div className="w-full h-full rounded-[9px] bg-[rgba(239,246,255,0.36)] border border-[#EDEDED] flex items-center px-[17px] gap-[15px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 bg-transparent outline-none text-[#333333] placeholder-[#999999] font-montserrat font-medium text-[14px]"
                placeholder="Password"
                disabled={isLoading}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="flex items-center flex-shrink-0"
                disabled={isLoading}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999999" strokeWidth="1.5">
                    <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                ) : (
                  <svg width="16" height="13" viewBox="0 0 24 24" fill="#999999">
                    <path d="M12 5c-4.477 0-8.268 2.943-9.542 7 1.274 4.057 5.064 7 9.542 7 4.478 0 8.268-2.943 9.542-7C20.268 7.943 16.478 5 12 5Z" />
                    <circle cx="12" cy="12" r="3" fill="#FFFFFF" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {(errorMessage || authError) && (
            <div className="absolute left-[20px] right-[20px]" style={{ top: 595 }}>
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-medium text-red-800">{errorMessage || authError}</span>
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className="absolute flex items-center justify-center gap-[10px] text-white font-montserrat font-bold text-[16px] disabled:opacity-60"
            style={{ 
              left: '50%', 
              transform: 'translateX(-50%)', 
              top: (errorMessage || authError) ? 670 : 610, 
              width: 372, 
              height: 50, 
              background: '#2563EB', 
              borderRadius: 12 
            }}
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                <span>{showSelfRegister ? 'Linking Account...' : 'Signing in...'}</span>
              </div>
            ) : (
              showSelfRegister ? 'Link & Continue' : 'Log In'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="absolute font-roboto font-normal text-[8px] leading-[9px] text-center text-gray-400" style={{ left: '50%', transform: 'translateX(-50%)', bottom: 10 }}>
          Copyright © {new Date().getFullYear()} Brokers Eye Platform
        </div>
      </div>
    </div>
  )
}

export default LoginMobile
