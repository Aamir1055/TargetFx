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
    } catch {
      setErrorMessage('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (requires2FA) {
    return <TwoFactorVerification />
  }

  return (
    <main className="mobile-login bg-white">
      <section className="mobile-login-hero text-white text-center font-outfit">
        <div className="relative mx-auto flex max-w-sm flex-col items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
              <img src="/Favicon.svg" alt="" className="h-6 w-6" />
            </div>
            <div className="text-left">
              <div className="text-xl font-semibold leading-6">Broker Eyes</div>
              <div className="text-[10px] tracking-[0.14em] text-blue-100">Trading Platform</div>
            </div>
          </div>
          <h1 className="mobile-login-heading max-w-xs text-[26px] font-bold leading-tight">
            Your Path To Financial Recovery!
          </h1>
          <div className="mobile-login-features grid w-full grid-cols-3 gap-3">
            {[
              [Group8, 'Secure Trading Infrastructure'],
              [Group9, 'Fast And Reliable Execution'],
              [Group10, 'Real-Time Market Insights'],
            ].map(([icon, label]) => (
              <div key={label} className="flex min-w-0 flex-col items-center gap-2">
                <img src={icon} alt="" className="h-9 w-9 object-contain" />
                <span className="max-w-[100px] text-[10px] font-medium leading-tight">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mobile-login-content mx-auto w-full max-w-md">
        <header className="mb-5">
          <h2 className="font-outfit text-2xl font-semibold leading-tight text-[#2563EB]">
            {showSelfRegister ? 'Complete Registration' : 'Welcome Back'}
          </h2>
          <p className="mt-2 text-sm leading-5 text-gray-500">
            {showSelfRegister ? 'Link your Telegram account with broker credentials' : 'Welcome back to access your account'}
          </p>
        </header>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="mobile-username" className="sr-only">Username</label>
            <input
              id="mobile-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-12 w-full min-w-0 rounded-xl border border-gray-200 bg-blue-50/40 px-4 text-base text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Username"
              disabled={isLoading}
              required
            />
          </div>
          <div className="relative">
            <label htmlFor="mobile-password" className="sr-only">Password</label>
            <input
              id="mobile-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full min-w-0 rounded-xl border border-gray-200 bg-blue-50/40 pl-4 pr-12 text-base text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Password"
              disabled={isLoading}
              required
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-gray-500 focus-visible:ring-2 focus-visible:ring-blue-500"
              disabled={isLoading}
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {showPassword && <path d="m3 3 18 18" />}
              </svg>
            </button>
          </div>
          {(errorMessage || authError) && (
            <div role="alert" className="break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800">
              {errorMessage || authError}
            </div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#2563EB] px-4 py-3 text-base font-semibold text-white disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {isLoading && <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {isLoading ? (showSelfRegister ? 'Linking Account...' : 'Signing in...') : (showSelfRegister ? 'Link & Continue' : 'Log In')}
          </button>
        </form>
        <footer className="mt-6 text-center text-[10px] leading-4 text-gray-400">
          Copyright ? {new Date().getFullYear()} Brokers Eye Platform
        </footer>
      </div>
    </main>
  )
}

export default LoginMobile
