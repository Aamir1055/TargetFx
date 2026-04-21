import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { GroupProvider } from './contexts/GroupContext'
import { IBProvider } from './contexts/IBContext'
import LoginPage from './pages/LoginPage'
import LoginMobile from './pages/LoginMobile'
import LoadingSpinner from './components/LoadingSpinner'

// Lazy load heavy components for code splitting and faster navigation
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const Client2Page = lazy(() => import('./pages/Client2Page'))
const PositionsPage = lazy(() => import('./pages/PositionsPage'))
const PendingOrdersPage = lazy(() => import('./pages/PendingOrdersPage'))
const MarginLevelPage = lazy(() => import('./pages/MarginLevelPage'))
const LiveDealingPage = lazy(() => import('./pages/LiveDealingPage'))
const ClientPercentagePage = lazy(() => import('./pages/ClientPercentagePage'))
const BrokerRulePage = lazy(() => import('./pages/BrokerRulePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const GraphicalAnalyticsPage = lazy(() => import('./pages/GraphicalAnalyticsPage'))
const ClientDashboardDesignCPage = lazy(() => import('./pages/ClientDashboardDesignC'))

// Main App Content Component
const AppContent = () => {
  const { isAuthenticated, loading } = useAuth()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    // Check on mount
    checkMobile()

    // Listen for resize events
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  if (loading) {
    return <LoadingSpinner />
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/" element={isMobile ? <LoginMobile /> : <LoginPage />} />
        <Route path="/login" element={isMobile ? <LoginMobile /> : <LoginPage />} />
        <Route path="/m/login" element={<LoginMobile />} />
        <Route path="/d/login" element={<LoginPage />} />
        <Route path="*" element={isMobile ? <LoginMobile /> : <LoginPage />} />
      </Routes>
    )
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      {/* Preload other routes in the background to speed up navigation */}
      <PreloadRoutes />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/client2" element={<Client2Page />} />
        <Route path="/positions" element={<PositionsPage />} />
        <Route path="/pending-orders" element={<PendingOrdersPage />} />
        <Route path="/margin-level" element={<MarginLevelPage />} />
        <Route path="/live-dealing" element={<LiveDealingPage />} />
        <Route path="/client-percentage" element={<ClientPercentagePage />} />
        <Route path="/broker-rules" element={<BrokerRulePage />} />
  <Route path="/analytics" element={<GraphicalAnalyticsPage />} />
          <Route path="/client-dashboard-c" element={<ClientDashboardDesignCPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </Suspense>
  )
}

// Preloads lazy routes after initial render to make navigation snappy
function PreloadRoutes() {
  useEffect(() => {
    const preload = () => {
      try {
        // Preload commonly navigated pages
        import('./pages/Client2Page')
        import('./pages/PendingOrdersPage')
        import('./pages/MarginLevelPage')
        import('./pages/LiveDealingPage')
        import('./pages/ClientPercentagePage')
        import('./pages/BrokerRulePage')
        import('./pages/SettingsPage')
        import('./pages/GraphicalAnalyticsPage')
        import('./pages/ClientDashboardDesignC')
      } catch {}
    }
    if ('requestIdleCallback' in window) {
      // Prefer idle time so we don't impact interactivity
      window.requestIdleCallback(preload, { timeout: 2000 })
    } else {
      // Fallback to a short delay
      const t = setTimeout(preload, 1200)
      return () => clearTimeout(t)
    }
  }, [])
  return null
}

function App() {
  // Set basename for htdocs root deployment
  const getBasename = () => {
    return '/'
  }

  return (
    <Router basename={getBasename()}>
      <AuthProvider>
        <DataProvider>
          <GroupProvider>
            <IBProvider>
              <AppContent />
            </IBProvider>
          </GroupProvider>
        </DataProvider>
      </AuthProvider>
    </Router>
  )
}

export default App
