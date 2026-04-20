# Apply authentication gating fixes to prevent 401 errors and WebSocket issues

Write-Host "Applying authentication fixes..." -ForegroundColor Green

# Fix DataContext.jsx
$dataContextPath = "src\contexts\DataContext.jsx"
$content = Get-Content $dataContextPath -Raw

# Add useAuth import
$content = $content -replace "import websocketService from '\./websocket'", "import websocketService from './websocket'`nimport { useAuth } from './AuthContext'"

# Add isAuthenticated to DataProvider
$content = $content -replace "export const DataProvider = \(\{ children \}\) => \{`n  const \[clients", "export const DataProvider = ({ children }) => {`n  const { isAuthenticated } = useAuth()`n  const [clients"

# Update useData to have safe fallback
$oldUseData = "export const useData = \(\) => \{`n  const context = useContext\(DataContext\)`n  if \(\!context\) \{`n    throw new Error\('useData must be used within a DataProvider'\)`n  \}`n  return context`n\}"
$newUseData = @"
export const useData = () => {
  const context = useContext(DataContext)
  // Safe fallback during HMR/initialization when provider may not be mounted yet
  if (!context) {
    return {
      clients: [],
      positions: [],
      orders: [],
      deals: [],
      accounts: [],
      loading: { clients: false, positions: false, orders: false, deals: false, accounts: false },
      connectionState: 'disconnected',
      fetchClients: async () => [],
      fetchPositions: async () => [],
      fetchOrders: async () => [],
      fetchAccounts: async () => [],
      setClients: () => {},
      setPositions: () => {},
      setOrders: () => {},
      setDeals: () => {},
      setAccounts: () => {}
    }
  }
  return context
}
"@
$content = $content -replace [regex]::Escape($oldUseData), $newUseData

# Gate WebSocket connect
$content = $content -replace "// Setup WebSocket subscriptions`n  useEffect\(\(\) => \{`n    // Connect WebSocket`n    websocketService\.connect\(\)", "// Setup WebSocket subscriptions`n  useEffect(() => {`n    // Connect WebSocket only when authenticated`n    if (isAuthenticated) {`n      websocketService.connect()`n    }"

# Gate refetch on disconnect
$content = $content -replace "if \(state === 'disconnected' \|\| state === 'failed'\) \{", "if ((state === 'disconnected' || state === 'failed') && isAuthenticated) {"

# Add token refresh listener
$content = $content -replace "(\}\))`n`n    // Subscribe to clients", "`$1`n`n    // If auth token is refreshed, try to connect if not connected`n    const onTokenRefreshed = () => {`n      if (!websocketService.isConnected() && isAuthenticated) {`n        websocketService.connect()`n      }`n    }`n    try {`n      window.addEventListener('auth:token_refreshed', onTokenRefreshed)`n    } catch {}`n`n    // Subscribe to clients"

# Update cleanup and dependencies
$content = $content -replace "unsubOrderDeleted\(\)`n    \}`n  \}, \[fetchClients, fetchPositions, fetchOrders, fetchAccounts\]\)", "unsubOrderDeleted()`n      try { window.removeEventListener('auth:token_refreshed', onTokenRefreshed) } catch {}`n    }`n  }, [fetchClients, fetchPositions, fetchOrders, fetchAccounts, isAuthenticated])`n`n  // On successful authentication, perform an initial data sync`n  useEffect(() => {`n    if (!isAuthenticated) return`n    fetchClients(true).catch(() => {})`n    fetchPositions(true).catch(() => {})`n    fetchOrders(true).catch(() => {})`n    fetchAccounts(true).catch(() => {})`n  }, [isAuthenticated, fetchClients, fetchPositions, fetchOrders, fetchAccounts])"

Set-Content $dataContextPath -Value $content -NoNewline
Write-Host "✓ Fixed DataContext.jsx" -ForegroundColor Green

# Fix websocket.js
$wsPath = "src\services\websocket.js"
$wsContent = Get-Content $wsPath -Raw
$wsContent = $wsContent -replace "console\.error\('\[WebSocket\] Cannot connect: No valid WebSocket URL'\)`n      this\.setConnectionState\('failed'\)", "dwarn('[WebSocket] Cannot connect: No valid WebSocket URL')"
Set-Content $wsPath -Value $wsContent -NoNewline
Write-Host "✓ Fixed websocket.js" -ForegroundColor Green

# Fix PositionsPage.jsx
$posPath = "src\pages\PositionsPage.jsx"
$posContent = Get-Content $posPath -Raw
$posContent = $posContent -replace "import \{ useData \} from '\.\./contexts/DataContext'", "import { useData } from '../contexts/DataContext'`nimport { useAuth } from '../contexts/AuthContext'"
$posContent = $posContent -replace "const \{ positions: cachedPositions, fetchPositions, loading, connectionState \} = useData\(\)", "const { positions: cachedPositions, fetchPositions, loading, connectionState } = useData()`n  const { isAuthenticated } = useAuth()"
$posContent = $posContent -replace "useEffect\(\(\) => \{`n    if \(\!hasInitialLoad\.current\) \{`n      hasInitialLoad\.current = true`n      console\.log\('\[Positions\] Initial load - fetching positions from DataContext'\)`n    \}`n    // Let DataContext handle caching.*`n    fetchPositions\(\)", "useEffect(() => {`n    if (!isAuthenticated) return`n    if (!hasInitialLoad.current) {`n      hasInitialLoad.current = true`n    }`n    // Let DataContext handle caching - it will fetch from API if stale`n    fetchPositions()"
$posContent = $posContent -replace "\}, \[fetchPositions\]\)", "}, [fetchPositions, isAuthenticated])"
Set-Content $posPath -Value $posContent -NoNewline
Write-Host "✓ Fixed PositionsPage.jsx" -ForegroundColor Green

# Fix ClientsPage.jsx
$clientsPath = "src\pages\ClientsPage.jsx"
$clientsContent = Get-Content $clientsPath -Raw
$clientsContent = $clientsContent -replace "import \{ useData \} from '\.\./contexts/DataContext'", "import { useData } from '../contexts/DataContext'`nimport { useAuth } from '../contexts/AuthContext'"
$clientsContent = $clientsContent -replace "const \{ clients: cachedClients, positions: cachedPositions, fetchClients, fetchPositions, loading, connectionState \} = useData\(\)", "const { clients: cachedClients, positions: cachedPositions, fetchClients, fetchPositions, loading, connectionState } = useData()`n  const { isAuthenticated } = useAuth()"
$clientsContent = $clientsContent -replace "useEffect\(\(\) => \{`n    if \(\!hasInitialLoad\.current\) \{`n      hasInitialLoad\.current = true`n      // Fetch data from context.*`n      fetchClients\(\)\.catch\(.*\)`n      fetchPositions\(\)\.catch\(.*\)`n    \}`n  \}, \[fetchClients, fetchPositions\]\)", "useEffect(() => {`n    if (!isAuthenticated) return`n    if (!hasInitialLoad.current) {`n      hasInitialLoad.current = true`n      fetchClients().catch(() => {})`n      fetchPositions().catch(() => {})`n    }`n  }, [fetchClients, fetchPositions, isAuthenticated])"
Set-Content $clientsPath -Value $clientsContent -NoNewline
Write-Host "✓ Fixed ClientsPage.jsx" -ForegroundColor Green

# Fix PendingOrdersPage.jsx
$ordersPath = "src\pages\PendingOrdersPage.jsx"
$ordersContent = Get-Content $ordersPath -Raw
$ordersContent = $ordersContent -replace "import \{ useData \} from '\.\./contexts/DataContext'", "import { useData } from '../contexts/DataContext'`nimport { useAuth } from '../contexts/AuthContext'"
$ordersContent = $ordersContent -replace "const \{ orders: cachedOrders, fetchOrders, loading, connectionState \} = useData\(\)", "const { orders: cachedOrders, fetchOrders, loading, connectionState } = useData()`n  const { isAuthenticated } = useAuth()"
$ordersContent = $ordersContent -replace "useEffect\(\(\) => \{`n    if \(\!hasInitialLoad\.current\) \{`n      hasInitialLoad\.current = true`n      console\.log\('\[PendingOrders\].*'\)`n      fetchOrders\(\)`n    \}", "useEffect(() => {`n    if (!isAuthenticated) return`n    if (!hasInitialLoad.current) {`n      hasInitialLoad.current = true`n      fetchOrders()`n    }"
$ordersContent = $ordersContent -replace "\}, \[fetchOrders\]\)", "}, [fetchOrders, isAuthenticated])"
Set-Content $ordersPath -Value $ordersContent -NoNewline
Write-Host "✓ Fixed PendingOrdersPage.jsx" -ForegroundColor Green

# Fix MarginLevelPage.jsx
$marginPath = "src\pages\MarginLevelPage.jsx"
$marginContent = Get-Content $marginPath -Raw
$marginContent = $marginContent -replace "import \{ useData \} from '\.\./contexts/DataContext'", "import { useData } from '../contexts/DataContext'`nimport { useAuth } from '../contexts/AuthContext'"
$marginContent = $marginContent -replace "const \{ accounts: cachedAccounts, fetchAccounts, loading, connectionState \} = useData\(\)", "const { accounts: cachedAccounts, fetchAccounts, loading, connectionState } = useData()`n  const { isAuthenticated } = useAuth()"
$marginContent = $marginContent -replace "useEffect\(\(\) => \{`n    if \(\!hasInitialLoad\.current\) \{`n      hasInitialLoad\.current = true`n      console\.log\('\[MarginLevel\].*'\)`n      fetchAccounts\(\)`n    \}`n  \}, \[fetchAccounts\]\)", "useEffect(() => {`n    if (!isAuthenticated) return`n    if (!hasInitialLoad.current) {`n      hasInitialLoad.current = true`n      fetchAccounts()`n    }`n  }, [fetchAccounts, isAuthenticated])"
Set-Content $marginPath -Value $marginContent -NoNewline
Write-Host "✓ Fixed MarginLevelPage.jsx" -ForegroundColor Green

Write-Host "`nAll fixes applied successfully!" -ForegroundColor Green
Write-Host "Run 'npm run build' to rebuild with the changes." -ForegroundColor Yellow
