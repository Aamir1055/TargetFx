import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { brokerAPI } from '../services/api'
import { exportStyledExcel, styledColumnsFromHeaders } from '../utils/exportStyledExcel'
import LoadingSpinner from './LoadingSpinner'
import NetTypeChip from './NetTypeChip'

// NET positions segregated by exchange — POST /api/broker/positions/net/by-exchange.
// Exchanges come back already ordered by the 'exchange_sort_order' setting; we keep that order.
// Used by the desktop Positions page (variant="desktop") and the mobile Positions module (variant="mobile").

const POLL_MS = 3000

// Mobile: keep the column header and totals above up to 10 scrolling data rows.
const MOBILE_ROWS_PER_EXCHANGE = 10
const MOBILE_TABLE_MAX_HEIGHT = 28 + 34 + MOBILE_ROWS_PER_EXCHANGE * 34 + 1
// Mobile view fills the screen below the app header + toolbar so the exchange list can scroll
const MOBILE_VIEW_HEIGHT = 'calc(var(--vh, 1vh) * 100 - 150px)'

const formatNumber = (value, digits = 2) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0.00'
  return number.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const toNetType = (action) => {
  const a = String(action ?? '').toUpperCase()
  if (a === 'BUY' || a === '0') return 'Buy'
  if (a === 'SELL' || a === '1') return 'Sell'
  return 'Flat'
}

const mapPosition = (item) => ({
  symbol: item.symbol || item.baseSymbol || '-',
  netType: toNetType(item.action ?? item.netType),
  netVolume: Number(item.netVolume ?? 0),
  avgPrice: Number(item.averagePrice ?? item.avgPrice ?? 0),
  currentPrice: Number(item.currentPrice ?? item.priceCurrent ?? 0),
  totalProfit: Number(item.totalProfit ?? item.profit ?? 0),
  totalStorage: Number(item.totalStorage ?? item.storage ?? 0),
  loginCount: Number(item.clientCount ?? item.loginCount ?? 0),
  positionCount: Number(item.positionCount ?? item.totalPositions ?? 0)
})

// The exchanges list may be strings or objects depending on the backend version
const normalizeExchangeList = (response) => {
  const payload = response?.data ?? response
  const list = Array.isArray(payload) ? payload : (payload?.exchanges ?? payload?.data ?? [])
  return (Array.isArray(list) ? list : [])
    .map(e => (typeof e === 'string' ? e : e?.exchange ?? e?.name ?? ''))
    .filter(Boolean)
}

const COLUMNS = [
  { key: 'symbol', label: 'Symbol', sortable: true },
  { key: 'netType', label: 'NET Type', sortKey: 'action' },
  { key: 'netVolume', label: 'NET Volume', sortable: true, pct: true },
  { key: 'avgPrice', label: 'Avg Price', sortKey: 'averagePrice' },
  { key: 'currentPrice', label: 'Current Price' },
  { key: 'totalProfit', label: 'Total Profit', sortable: true, pct: true },
  { key: 'loginCount', label: 'Logins', sortKey: 'clientCount' },
  { key: 'positionCount', label: 'Positions', sortKey: 'positionCount' }
]

const profitClass = (value) => (value > 0 ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-700')

const ExchangeNetPositions = forwardRef(({ variant = 'desktop', displayMode = 'value', loginFilter = null, masterLabel = 'ALL', onTotals, onLoaded }, ref) => {
  const isMobile = variant === 'mobile'
  const percentage = displayMode === 'percentage'

  const [availableExchanges, setAvailableExchanges] = useState([])
  const [selectedExchanges, setSelectedExchanges] = useState([])
  const [exchangeMenuOpen, setExchangeMenuOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [searchVersion, setSearchVersion] = useState(0)
  const [sortBy, setSortBy] = useState('netVolume')
  const [sortOrder, setSortOrder] = useState('desc')
  const [groups, setGroups] = useState([])
  const [hasFetched, setHasFetched] = useState(false)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [exporting, setExporting] = useState(false)

  const loginKey = loginFilter ? loginFilter.join(',') : ''

  useEffect(() => {
    let cancelled = false
    brokerAPI.getPositionExchanges()
      .then(res => { if (!cancelled) setAvailableExchanges(normalizeExchangeList(res)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isMobile) return undefined
    const timer = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(timer)
  }, [searchInput, isMobile])

  useEffect(() => {
    if (!exchangeMenuOpen) return undefined
    const close = (event) => { if (!event.target.closest?.('[data-exchange-filter]')) setExchangeMenuOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [exchangeMenuOpen])

  const buildBody = () => {
    const body = { sortBy, sortOrder }
    if (search) body.search = search
    if (percentage) body.percentage = true
    if (selectedExchanges.length) body.exchange = selectedExchanges
    if (loginFilter) body.filters = [{ field: 'login', operator: 'in', value: loginFilter.length ? loginFilter : [-1] }]
    return body
  }

  const parseResponse = (response) => {
    const payload = response?.data ?? response ?? {}
    const exchanges = Array.isArray(payload.exchanges) ? payload.exchanges : []
    return {
      groups: exchanges.map(group => ({
        exchange: group.exchange || 'Unknown',
        sortRank: group.sortRank,
        totals: group.totals || {},
        positions: (group.positions || []).map(mapPosition)
      })),
      totals: payload.totals || {},
      count: Number(payload.count ?? 0)
    }
  }

  // Poll while mounted (same live behaviour as the NET Position tab)
  useEffect(() => {
    let timer = null
    let cancelled = false
    const poll = async () => {
      try {
        const parsed = parseResponse(await brokerAPI.getNetPositionsByExchange(buildBody()))
        if (cancelled) return
        setGroups(parsed.groups)
        setError('')
        setHasFetched(true)
        onTotals?.(parsed.totals, parsed.count)
        onLoaded?.()
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load exchange positions')
          setHasFetched(true)
        }
      }
      if (!cancelled && document.visibilityState === 'visible') timer = setTimeout(poll, POLL_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !timer) poll()
    }
    setHasFetched(false)
    poll()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, searchVersion, sortBy, sortOrder, percentage, selectedExchanges, loginKey])

  const handleSort = (column) => {
    const key = column.sortKey || column.key
    if (sortBy === key) setSortOrder(order => (order === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(key); setSortOrder('desc') }
  }

  const toggleCollapsed = (exchange) => setCollapsed(prev => {
    const next = new Set(prev)
    if (next.has(exchange)) next.delete(exchange)
    else next.add(exchange)
    return next
  })

  // An empty selection means "all exchanges" (no filter sent) - shown as every box ticked
  const isExchangeChecked = (exchange) => !selectedExchanges.length || selectedExchanges.includes(exchange)
  const toggleExchange = (exchange) => setSelectedExchanges(prev => {
    const current = prev.length ? prev : availableExchanges
    const next = current.includes(exchange) ? current.filter(e => e !== exchange) : [...current, exchange]
    if (!next.length) return prev // keep at least one exchange selected
    return next.length === availableExchanges.length ? [] : next
  })

  const exportData = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const parsed = parseResponse(await brokerAPI.getNetPositionsByExchange(buildBody()))
      const groupsWithRows = parsed.groups.filter(group => group.positions.length)
      if (!groupsWithRows.length) return
      const columns = styledColumnsFromHeaders(COLUMNS.map(column => ({
        key: column.key,
        label: `${column.label}${column.pct && percentage ? ' %' : ''}`
      })))
      const sections = groupsWithRows.map(group => ({
        title: group.exchange,
        rows: group.positions,
        totals: {
          label: 'TOTAL',
          values: {
            netVolume: Number(group.totals.netVolume ?? group.totals.volume ?? 0),
            totalProfit: Number(group.totals.totalProfit ?? group.totals.profit ?? 0),
            loginCount: group.totals.uniqueLogins ?? '',
            positionCount: group.totals.positionCount ?? group.totals.totalPositions ?? ''
          }
        }
      }))
      exportStyledExcel({
        showTitle: false,
        title: 'Position',
        columns,
        sections,
        sheetName: 'Position',
        fileName: `position_by_exchange_${new Date().toISOString().slice(0, 10)}.xlsx`
      })
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to export exchange positions')
    } finally {
      setExporting(false)
    }
  }

  useImperativeHandle(ref, () => ({ exportData, isExporting: exporting }))

  const visibleGroups = useMemo(() => groups.filter(g => g.positions.length || !search), [groups, search])
  const exportOverlay = exporting && <LoadingSpinner message="Exporting exchange positions…" subtitle="Please wait" />

  const exchangeFilter = (
    <div className="relative" data-exchange-filter="">
      <button
        type="button"
        onClick={() => setExchangeMenuOpen(v => !v)}
        className={`${isMobile ? 'h-[28px] px-2 text-[10px] rounded-[10px]' : 'h-10 px-3 text-xs rounded-lg'} bg-white border border-[#E5E7EB] shadow-sm flex items-center gap-1.5 font-medium text-[#374151] hover:bg-gray-50 whitespace-nowrap`}
        aria-expanded={exchangeMenuOpen}
      >
        <svg className={isMobile ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
        {selectedExchanges.length ? `${selectedExchanges.length} Exchange${selectedExchanges.length > 1 ? 's' : ''}` : 'All Exchanges'}
      </button>
      {exchangeMenuOpen && (
        <div className={`absolute ${isMobile ? 'right-0' : 'left-0'} top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-[#E5E7EB] z-50 py-1 max-h-72 overflow-y-auto`}>
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#F3F4F6]">
            <span className="text-[11px] font-semibold uppercase text-[#6B7280]">Exchanges</span>
            {selectedExchanges.length > 0 && (
              <button type="button" onClick={() => setSelectedExchanges([])} className="text-[11px] font-medium text-blue-600">Select all</button>
            )}
          </div>
          {availableExchanges.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#9CA3AF]">No exchanges found</p>
          ) : availableExchanges.map(exchange => (
            <label key={exchange} className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#374151] hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={isExchangeChecked(exchange)} onChange={() => toggleExchange(exchange)} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              {exchange}
            </label>
          ))}
        </div>
      )}
    </div>
  )

  const emptyState = (
    <div className="py-10 text-center">
      {error
        ? <p className="text-sm text-red-600">{error}</p>
        : <p className="text-sm text-gray-500">{search ? 'No symbols match your search' : 'No exchange positions available'}</p>}
    </div>
  )

  // ───────── Mobile ─────────
  if (isMobile) {
    const grid = '130px 64px 90px 96px 104px 96px 60px 76px'
    return (
      <div className="bg-[#F5F7FA] flex flex-col" style={{ height: MOBILE_VIEW_HEIGHT }}>
        {exportOverlay}
        <div className="pb-3 px-4 flex-shrink-0">
          <div className="flex items-center gap-1">
            <div className="w-[55%] max-w-[200px] min-w-0 mr-auto h-[32px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_0_12px_rgba(75,75,75,0.05)] px-2 flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className="flex-shrink-0"><circle cx="8" cy="8" r="6.5" stroke="#4B4B4B" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <input placeholder="Search symbol" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="flex-1 min-w-0 text-[11px] text-[#000000] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit" />
            </div>
            {exchangeFilter}
          </div>
        </div>

        {/* Whole list scrolls vertically; each exchange shows up to 10 rows and scrolls inside */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-8 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {!hasFetched ? (
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="bg-white rounded-lg border border-blue-100 overflow-hidden">
                <div className="h-9 bg-blue-50 animate-pulse" />
                {Array.from({ length: 4 }, (_, r) => <div key={r} className="h-[34px] border-b border-[#F0F0F0] px-2 flex items-center"><div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse" /></div>)}
              </div>
            ))
          ) : !visibleGroups.length ? emptyState : visibleGroups.map(group => {
            const isCollapsed = collapsed.has(group.exchange)
            const profit = Number(group.totals.totalProfit ?? group.totals.profit ?? 0)
            const volume = Number(group.totals.netVolume ?? group.totals.volume ?? 0)
            return (
              <div key={group.exchange} className="relative isolate bg-white rounded-lg border border-blue-100 overflow-hidden shadow-sm">
                <button type="button" onClick={() => toggleCollapsed(group.exchange)} aria-expanded={!isCollapsed} className="relative z-40 w-full h-9 px-3 flex items-center gap-2 bg-blue-50 text-left">
                  <svg className={`w-3.5 h-3.5 text-blue-600 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-[12px] font-bold text-[#1A63BC]">{group.exchange}</span>
                  <span className="text-[10px] text-[#6B7280]">{group.positions.length} symbols</span>
                </button>
                {!isCollapsed && (
                  <div className="relative isolate overflow-auto" style={{ contain: 'paint', maxHeight: MOBILE_TABLE_MAX_HEIGHT, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                    <div className="w-max min-w-full">
                      <div className="grid bg-blue-500 text-white text-[10px] font-bold uppercase tracking-wide sticky top-0 z-30" style={{ gridTemplateColumns: grid, isolation: 'isolate' }}>
                        {COLUMNS.map(column => (
                          <div key={column.key} onClick={() => handleSort(column)} className={`h-[28px] flex items-center px-1.5 min-w-0 overflow-hidden bg-blue-500 cursor-pointer select-none ${column.key === 'symbol' ? 'sticky left-0 z-10 px-2' : ''}`} style={column.key === 'symbol' ? { boxShadow: '2px 0 4px rgba(0,0,0,0.12)' } : undefined}>
                            <span className="truncate">{column.label}{column.pct && percentage ? ' %' : ''}</span>
                            {sortBy === (column.sortKey || column.key) && <span className="ml-0.5">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                          </div>
                        ))}
                      </div>
                      <div className="grid sticky top-[28px] z-20 bg-blue-50 text-[12px] font-semibold tabular-nums border-b border-blue-200" style={{ gridTemplateColumns: grid }}>
                        <div className="h-[34px] flex items-center px-2 sticky left-0 z-10 bg-blue-50 text-[#1A63BC]">TOTAL</div>
                        <div className="h-[34px] bg-blue-50" />
                        <div className="h-[34px] flex items-center px-1.5 bg-blue-50 text-[#374151]">{formatNumber(volume)}</div>
                        <div className="h-[34px] bg-blue-50" />
                        <div className="h-[34px] bg-blue-50" />
                        <div className={`h-[34px] flex items-center px-1.5 bg-blue-50 ${profitClass(profit)}`}>{formatNumber(profit)}</div>
                        <div className="h-[34px] flex items-center px-1.5 bg-blue-50 text-[#374151]">{group.totals.uniqueLogins ?? ''}</div>
                        <div className="h-[34px] flex items-center px-1.5 bg-blue-50 text-[#374151]">{group.totals.positionCount ?? group.totals.totalPositions ?? ''}</div>
                      </div>
                      {group.positions.map((p, index) => (
                        <div key={`${p.symbol}-${index}`} className="grid text-[12px] text-[#374151] tabular-nums bg-white border-b border-[#E1E1E1]" style={{ gridTemplateColumns: grid }}>
                          <div className="h-[34px] flex items-center px-2 sticky left-0 bg-white z-10 font-semibold text-[#1F2937] min-w-0" style={{ boxShadow: '2px 0 4px rgba(0,0,0,0.05)' }}><span className="truncate">{p.symbol}</span></div>
                          <div className="h-[34px] flex items-center px-1.5"><NetTypeChip type={p.netType} compact /></div>
                          <div className="h-[34px] flex items-center px-1.5">{formatNumber(p.netVolume)}</div>
                          <div className="h-[34px] flex items-center px-1.5">{formatNumber(p.avgPrice)}</div>
                          <div className="h-[34px] flex items-center px-1.5">{formatNumber(p.currentPrice)}</div>
                          <div className={`h-[34px] flex items-center px-1.5 font-semibold ${profitClass(p.totalProfit)}`}>{formatNumber(p.totalProfit)}</div>
                          <div className="h-[34px] flex items-center px-1.5">{p.loginCount}</div>
                          <div className="h-[34px] flex items-center px-1.5">{p.positionCount}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ───────── Desktop ─────────
  return (
    <div className="bg-white rounded-lg shadow-sm border border-blue-100 overflow-hidden flex flex-col flex-1 min-h-0">
      {exportOverlay}
      <div className="border-b border-gray-200 flex-shrink-0 flex items-center gap-3 px-4 py-3">
        <form className="relative w-72" role="search" onSubmit={(event) => {
          event.preventDefault()
          setSearch(searchInput.trim())
          setSearchVersion(version => version + 1)
        }}>
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" fill="none" viewBox="0 0 18 18"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search symbol"
            className="w-full h-10 pl-9 pr-20 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); setSearch('') }} className="absolute right-12 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#4B5563]" title="Clear search">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          <button type="submit" aria-label="Search symbol" title="Search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </form>
        {exchangeFilter}
      </div>

      <div className="overflow-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#9ca3af #e5e7eb' }}>
        {hasFetched && !visibleGroups.length ? emptyState : (
          <table className="w-full text-sm">
            <thead className="bg-blue-600 sticky top-0 z-10">
              <tr>
                {COLUMNS.map(column => (
                  <th key={column.key} onClick={() => handleSort(column)} className="px-3 py-[9.5px] text-left text-[11px] font-bold text-white uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-blue-700">
                    {column.label}{column.pct && percentage ? ' %' : ''}
                    {sortBy === (column.sortKey || column.key) && <span className="ml-1 text-[9px]">{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!hasFetched ? (
                Array.from({ length: 10 }, (_, row) => (
                  <tr key={`sk-${row}`} className="border-b border-gray-100">
                    {COLUMNS.map(column => <td key={column.key} className="px-3 py-3"><div className="h-3.5 w-16 bg-gray-200 rounded animate-pulse" /></td>)}
                  </tr>
                ))
              ) : visibleGroups.map(group => {
                const isCollapsed = collapsed.has(group.exchange)
                const t = group.totals
                const groupProfit = Number(t.totalProfit ?? t.profit ?? 0)
                const groupVolume = Number(t.netVolume ?? t.volume ?? 0)
                return [
                  <tr key={`h-${group.exchange}`} onClick={() => toggleCollapsed(group.exchange)} className="bg-blue-50 border-b border-blue-100 cursor-pointer hover:bg-blue-100/70">
                    <td colSpan={2} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <svg className={`w-3.5 h-3.5 text-blue-600 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="font-bold text-[#1A63BC]">{group.exchange}</span>
                        <span className="text-xs text-[#6B7280]">{group.positions.length} symbols</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-[#374151]">{formatNumber(groupVolume)}</td>
                    <td colSpan={2} />
                    <td className="px-3 py-2.5"><span className={`text-xs font-bold ${profitClass(groupProfit)}`}>{formatNumber(groupProfit)}</span></td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-[#374151]">{t.uniqueLogins ?? ''}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-[#374151]">{t.positionCount ?? t.totalPositions ?? ''}</td>
                  </tr>,
                  ...(isCollapsed ? [] : group.positions.map((p, index) => (
                    <tr key={`${group.exchange}-${p.symbol}-${index}`} className="border-b border-gray-100 hover:bg-blue-50/40">
                      <td className="px-3 py-2 pl-9 font-medium text-[#1F2937] whitespace-nowrap">{p.symbol}</td>
                      <td className="px-3 py-2"><NetTypeChip type={p.netType} /></td>
                      <td className="px-3 py-2 text-[#374151]">{formatNumber(p.netVolume)}</td>
                      <td className="px-3 py-2 text-[#374151]">{formatNumber(p.avgPrice)}</td>
                      <td className="px-3 py-2 text-[#374151]">{formatNumber(p.currentPrice)}</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${p.totalProfit >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{formatNumber(p.totalProfit)}</span></td>
                      <td className="px-3 py-2 text-[#374151]">{p.loginCount}</td>
                      <td className="px-3 py-2 text-[#374151]">{p.positionCount}</td>
                    </tr>
                  )))
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
})

ExchangeNetPositions.displayName = 'ExchangeNetPositions'

export default ExchangeNetPositions
