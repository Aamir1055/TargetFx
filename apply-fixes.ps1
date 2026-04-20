# Simple script to gate WebSocket and fetches by authentication

Write-Host "Gating WebSocket connect in DataContext..." -ForegroundColor Cyan

$dcPath = "src\contexts\DataContext.jsx"
$content = Get-Content $dcPath -Raw

# Gate WebSocket connect
$old1 = @"
  // Setup WebSocket subscriptions
  useEffect(() => {
    // Connect WebSocket
    websocketService.connect()
"@

$new1 = @"
  // Setup WebSocket subscriptions
  useEffect(() => {
    // Connect WebSocket only when authenticated
    if (isAuthenticated) {
      websocketService.connect()
    }
"@

$content = $content.Replace($old1, $new1)

# Gate refetch on disconnect  
$content = $content.Replace(
  "if (state === 'disconnected' || state === 'failed') {",
  "if ((state === 'disconnected' || state === 'failed') && isAuthenticated) {"
)

# Update dependency array
$content = $content.Replace(
  "}, [fetchClients, fetchPositions, fetchOrders, fetchAccounts])",
  "}, [fetchClients, fetchPositions, fetchOrders, fetchAccounts, isAuthenticated])"
)

Set-Content $dcPath -Value $content -NoNewline
Write-Host "✓ DataContext.jsx updated" -ForegroundColor Green

# Fix PositionsPage
Write-Host "Fixing PositionsPage..." -ForegroundColor Cyan
$posPath = "src\pages\PositionsPage.jsx"
$lines = Get-Content $posPath
$lines[0..1] + "import { useAuth } from '../contexts/AuthContext'" + $lines[2..($lines.Count-1)] | Set-Content $posPath

$posContent = Get-Content $posPath -Raw
$posContent = $posContent.Replace(
  "const { positions: cachedPositions, fetchPositions, loading, connectionState } = useData()",
  @"
const { positions: cachedPositions, fetchPositions, loading, connectionState } = useData()
  const { isAuthenticated } = useAuth()
"@
)

$old = @"
  useEffect(() => {
    if (!hasInitialLoad.current) {
      hasInitialLoad.current = true
      console.log('[Positions] Initial load - fetching positions from DataContext')
    }
    // Let DataContext handle caching - it will fetch from API if stale, otherwise use cache
    // WebSocket will handle all real-time updates
    fetchPositions()
"@

$new = @"
  useEffect(() => {
    if (!isAuthenticated) return
    if (!hasInitialLoad.current) {
      hasInitialLoad.current = true
    }
    fetchPositions()
"@

$posContent = $posContent.Replace($old, $new)
$posContent = $posContent.Replace("}, [fetchPositions])", "}, [fetchPositions, isAuthenticated])")
Set-Content $posPath -Value $posContent -NoNewline
Write-Host "✓ PositionsPage.jsx updated" -ForegroundColor Green

# Fix ClientsPage  
Write-Host "Fixing ClientsPage..." -ForegroundColor Cyan
$clientsPath = "src\pages\ClientsPage.jsx"
$lines = Get-Content $clientsPath
$lines[0..1] + "import { useAuth } from '../contexts/AuthContext'" + $lines[2..($lines.Count-1)] | Set-Content $clientsPath

$clientsContent = Get-Content $clientsPath -Raw
$clientsContent = $clientsContent.Replace(
  "const { clients: cachedClients, positions: cachedPositions, fetchClients, fetchPositions, loading, connectionState } = useData()",
  @"
const { clients: cachedClients, positions: cachedPositions, fetchClients, fetchPositions, loading, connectionState } = useData()
  const { isAuthenticated } = useAuth()
"@
)

$clientsContent = $clientsContent.Replace(
  @"
  useEffect(() => {
    if (!hasInitialLoad.current) {
      hasInitialLoad.current = true
      // Fetch data from context (will use cache if available)
      fetchClients().catch(err => console.error('Failed to load clients:', err))
      fetchPositions().catch(err => console.error('Failed to load positions:', err))
    }
  }, [fetchClients, fetchPositions])
"@,
  @"
  useEffect(() => {
    if (!isAuthenticated) return
    if (!hasInitialLoad.current) {
      hasInitialLoad.current = true
      fetchClients().catch(() => {})
      fetchPositions().catch(() => {})
    }
  }, [fetchClients, fetchPositions, isAuthenticated])
"@
)

Set-Content $clientsPath -Value $clientsContent -NoNewline
Write-Host "✓ ClientsPage.jsx updated" -ForegroundColor Green

Write-Host "`nDone! Now rebuild the app." -ForegroundColor Green
