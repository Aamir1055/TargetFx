import { useEffect, useMemo, useState } from 'react'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'

const formatNumber = (value, digits = 2) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0.00'
  return number.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const formatTime = (value) => {
  if (!value) return '-'
  return String(value).replace(' ', ' · ')
}

const getDefaultDates = () => {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 7)
  const toDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return { from: toDate(from), to: toDate(today) }
}

const HistorySkeleton = () => (
  <div className="divide-y divide-slate-100" aria-label="Loading historical positions" aria-busy="true">
    {Array.from({ length: 6 }, (_, row) => (
      <div key={row} className="grid grid-cols-5 gap-4 px-5 py-4">
        {Array.from({ length: 5 }, (_, cell) => <div key={cell} className="h-4 rounded bg-slate-100 animate-pulse" />)}
      </div>
    ))}
  </div>
)

const PaginationControls = ({ page, totalPages, onPageChange }) => (
  <div className="flex items-center gap-2">
    <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg leading-none text-slate-400 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Previous page">&#8249;</button>
    <input type="number" min="1" max={totalPages} value={page} onChange={(event) => { const nextPage = Number(event.target.value); if (Number.isInteger(nextPage) && nextPage >= 1 && nextPage <= totalPages) onPageChange(nextPage) }} onBlur={(event) => { if (!event.target.value || Number(event.target.value) < 1) onPageChange(1); else if (Number(event.target.value) > totalPages) onPageChange(totalPages) }} className="h-9 w-14 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" aria-label="Current page" />
    <span className="text-sm font-medium text-slate-400">/ {totalPages}</span>
    <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-lg leading-none text-slate-400 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Next page">&#8250;</button>
  </div>
)

const ReportPaginationControls = ({ page, totalPages, onPageChange }) => (
  <div className="flex shrink-0 items-center gap-1">
    <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-base leading-none text-slate-400 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Previous page">&#8249;</button>
    <input type="number" min="1" max={totalPages} value={page} onChange={(event) => { const nextPage = Number(event.target.value); if (Number.isInteger(nextPage) && nextPage >= 1 && nextPage <= totalPages) onPageChange(nextPage) }} onBlur={(event) => { if (!event.target.value || Number(event.target.value) < 1) onPageChange(1); else if (Number(event.target.value) > totalPages) onPageChange(totalPages) }} className="h-8 w-10 rounded-md border border-slate-200 bg-white px-1 text-center text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" aria-label="Current page" />
    <span className="text-[11px] font-medium text-slate-400">/ {totalPages}</span>
    <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-base leading-none text-slate-400 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Next page">&#8250;</button>
  </div>
)

const HistoricalPositionDetails = ({ row, onClose }) => {
  const symbol = row.Symbol ?? row.symbol ?? 'Unknown symbol'
  const events = Array.isArray(row.Events) ? row.Events : Array.isArray(row.events) ? row.events : []
  const eventCount = Number(row.EventCount ?? row.eventCount) || events.length
  const [eventPage, setEventPage] = useState(1)
  const eventPageSize = 10
  const eventTotalPages = Math.max(1, Math.ceil(events.length / eventPageSize))
  const visibleEvents = events.slice((eventPage - 1) * eventPageSize, eventPage * eventPageSize)

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="historical-position-title">
      <button type="button" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]" aria-label="Close historical position details" />
      <div className="relative flex max-h-[calc(100vh-24px)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100vh-48px)]">
        <div className="flex items-start justify-between gap-4 bg-blue-600 px-4 py-3 text-white sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-blue-100 sm:text-[10px]">Historical position details</p>
            <h2 id="historical-position-title" className="mt-0.5 truncate text-lg font-extrabold tracking-tight sm:text-xl">{symbol}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/30 bg-white/10 text-xl leading-none text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60" aria-label="Close details" title="Close details">&times;</button>
        </div>

        <div className="overflow-hidden px-5 py-4 sm:px-7 sm:py-5">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">Position events</h3><div className="flex w-full items-center justify-between gap-3 sm:w-auto"><span className="text-xs text-slate-500">Showing {visibleEvents.length.toLocaleString()} of {eventCount.toLocaleString()}</span><PaginationControls page={eventPage} totalPages={eventTotalPages} onPageChange={setEventPage} /></div></div>
            <div className="max-h-[430px] overflow-auto sm:max-h-[560px]">
              <div className="sm:hidden">
                <div className="grid grid-cols-[1.55fr_0.72fr_0.82fr_0.82fr_0.78fr_0.78fr] gap-1 bg-blue-600 px-2 py-2 text-[8px] font-bold uppercase tracking-[0.03em] text-white">
                  <span>Time</span><span>Action</span><span className="text-right">Previous</span><span className="text-right">New</span><span className="text-right">Change</span><span>Direction</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleEvents.map((event, index) => {
                    const change = Number(event.ChangePercentage ?? event.changePercentage)
                    const increase = String(event.Direction ?? event.direction ?? '').toLowerCase() === 'increase' || change > 0
                    return <div key={`${symbol}-mobile-${event.Timestamp ?? event.timestamp ?? index}`} className="grid grid-cols-[1.55fr_0.72fr_0.82fr_0.82fr_0.78fr_0.78fr] items-center gap-1 px-2 py-2 text-[9px] leading-tight odd:bg-white even:bg-slate-50/50">
                      <span className="min-w-0 break-words text-slate-600">{formatTime(event.Time ?? event.time)}</span>
                      <span className="capitalize text-slate-800">{event.PositionAction ?? event.positionAction ?? '-'}</span>
                      <span className="text-right tabular-nums text-slate-600">{formatNumber(event.PreviousPosition ?? event.previousPosition)}</span>
                      <span className="text-right tabular-nums text-slate-800">{formatNumber(event.NewPosition ?? event.newPosition)}</span>
                      <span className={`text-right font-semibold tabular-nums ${increase ? 'text-emerald-600' : 'text-rose-600'}`}>{change > 0 ? '+' : ''}{formatNumber(change)}%</span>
                      <span className={`capitalize ${increase ? 'text-emerald-600' : 'text-rose-600'}`}>{event.Direction ?? event.direction ?? '-'}</span>
                    </div>
                  })}
                </div>
              </div>
              <table className="hidden min-w-[720px] w-full text-xs sm:table">
                <thead className="sticky top-0 z-10 bg-blue-600 text-[10px] uppercase tracking-wide text-white shadow-[0_1px_0_#1d4ed8]"><tr><th className="px-4 py-3 text-left">Time</th><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-right">Previous</th><th className="px-4 py-3 text-right">New</th><th className="px-4 py-3 text-right">Change</th><th className="px-4 py-3 text-left">Direction</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{visibleEvents.map((event, index) => { const change = Number(event.ChangePercentage ?? event.changePercentage); const increase = String(event.Direction ?? event.direction ?? '').toLowerCase() === 'increase' || change > 0; return <tr key={`${symbol}-${event.Timestamp ?? event.timestamp ?? index}`} className="hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatTime(event.Time ?? event.time)}</td><td className="px-4 py-3 font-semibold capitalize text-slate-800">{event.PositionAction ?? event.positionAction ?? '-'}</td><td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatNumber(event.PreviousPosition ?? event.previousPosition)}</td><td className="px-4 py-3 text-right tabular-nums text-slate-800">{formatNumber(event.NewPosition ?? event.newPosition)}</td><td className={`px-4 py-3 text-right font-semibold tabular-nums ${increase ? 'text-emerald-600' : 'text-rose-600'}`}>{change > 0 ? '+' : ''}{formatNumber(change)}%</td><td className={`px-4 py-3 capitalize ${increase ? 'text-emerald-600' : 'text-rose-600'}`}>{event.Direction ?? event.direction ?? '-'}</td></tr> })}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-7"><button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30">Close details</button></div>
      </div>
    </div>
  )
}

const HistoricalPositionsPage = () => {
  const { isAuthenticated } = useAuth()
  const defaults = useMemo(getDefaultDates, [])
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) return false
      const value = localStorage.getItem('sidebarOpen')
      return value === null ? true : JSON.parse(value)
    } catch { return true }
  })
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [threshold, setThreshold] = useState('5')
  const [percentage, setPercentage] = useState(true)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [report, setReport] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedFilters, setAppliedFilters] = useState({ from: defaults.from, to: defaults.to, threshold: 5, percentage: true })

  useEffect(() => {
    if (!isAuthenticated) return undefined
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await brokerAPI.getHistoricalPositions({
          from: appliedFilters.from,
          to: appliedFilters.to,
          up_down_percentage: appliedFilters.threshold,
          percentage: appliedFilters.percentage,
          page,
          limit: pageSize
        })
        if (cancelled) return
        const data = response?.data ?? response ?? {}
        setReport(Array.isArray(data.Report) ? data.Report : Array.isArray(data.report) ? data.report : [])
        setPagination(data.pagination ?? data.Pagination ?? null)
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError?.response?.data?.message || requestError?.message || 'Failed to load historical positions')
          setReport([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [appliedFilters, isAuthenticated, page, pageSize])

  const total = Number(pagination?.total ?? report.length) || report.length
  const totalPages = Math.max(1, Number(pagination?.total_pages ?? pagination?.totalPages ?? Math.ceil(total / pageSize)) || 1)
  const filteredReport = report.filter((row) => {
    const symbol = String(row.Symbol ?? row.symbol ?? '').toLowerCase()
    return symbol.includes(searchTerm.trim().toLowerCase())
  })

  const applyFilters = (event) => {
    event.preventDefault()
    if (!from || !to || from > to) {
      setError('Choose a valid date range before applying filters.')
      return
    }
    const parsedThreshold = Number(threshold)
    if (!Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
      setError('The percentage threshold must be zero or greater.')
      return
    }
    setError('')
    setPage(1)
    setAppliedFilters({ from, to, threshold: parsedThreshold, percentage })
  }

  const formatDateLabel = (value) => {
    if (!value) return 'Custom dates'
    const [year, month, day] = value.split('-')
    return `${day} - ${month} - ${year}`
  }

  const applyCustomDates = () => {
    if (!from || !to || from > to) {
      setError('Choose a valid date range before applying dates.')
      return
    }
    setError('')
    setDatePickerOpen(false)
  }

  const handlePageSizeChange = (value) => {
    setPageSize(value)
    setPage(1)
  }

  return (
    <div className="flex h-screen bg-[#F5F7FB]">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(value => { const next = !value; try { localStorage.setItem('sidebarOpen', JSON.stringify(next)) } catch {}; return next })}
      />

      <main className={`flex-1 min-w-0 px-3 pt-0 pb-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden">
          <header className="mb-0 rounded-none bg-transparent sm:mb-3 sm:rounded-xl sm:bg-white sm:px-6 sm:py-4 sm:shadow-sm">
            <div className="relative flex items-center justify-between border-b border-[#ECECEC] bg-transparent px-4 py-4 shadow-sm sm:hidden">
              <button type="button" onClick={() => setSidebarOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F8F8F8] text-slate-900" aria-label="Open menu">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="absolute left-1/2 -translate-x-1/2 text-xl font-semibold text-black">Historical Positions</h1>
              <span className="h-12 w-12" aria-hidden="true" />
            </div>
            <div className="hidden items-center gap-5 sm:flex">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">Historical Positions</h1>
              </div>
              <form onSubmit={applyFilters} className="flex min-w-0 flex-1 items-end justify-end gap-2">
              <div className="relative shrink-0">
                <button type="button" onClick={() => setDatePickerOpen(value => !value)} className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:text-sm" aria-expanded={datePickerOpen} aria-haspopup="dialog">
                  <svg className="h-4 w-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M8 2.5v4M16 2.5v4M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" /></svg>
                  <span>Custom Dates</span>
                </button>
                {datePickerOpen && <div className="absolute right-0 top-11 z-30 w-[min(340px,calc(100vw-32px))] rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl" role="dialog" aria-label="Custom date range">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-bold text-slate-800">Custom date range</h3>
                    <button type="button" onClick={() => setDatePickerOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" aria-label="Close custom date range">&times;</button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Filter historical positions for the selected period.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-600">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
                    <label className="text-xs font-semibold text-slate-600">To<input type="date" min={from} value={to} onChange={event => setTo(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2"><button type="button" onClick={() => { setFrom(''); setTo('') }} disabled={!from && !to} className="h-9 rounded-lg px-3 text-xs font-semibold text-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">Clear</button><button type="button" onClick={applyCustomDates} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700">Apply dates</button></div>
                </div>}
              </div>
              <label className="flex h-9 w-[126px] shrink-0 items-center gap-1 text-[9px] font-semibold text-slate-600 sm:w-[142px] sm:text-[11px]">Threshold (%)<input type="number" min="0" step="0.1" value={threshold} onChange={event => setThreshold(event.target.value)} className="h-9 w-12 rounded-lg border border-slate-200 px-2 text-[10px] font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:w-14 sm:text-sm" /></label>
              <label className="relative flex h-9 w-14 shrink-0 cursor-pointer items-center justify-center transition-colors" title={percentage ? 'Percentage filter is on' : 'Percentage filter is off'}>
                <input type="checkbox" checked={percentage} onChange={event => setPercentage(event.target.checked)} className="peer sr-only" aria-label="Apply percentage filter" />
                <span className="absolute inset-x-1.5 top-1/2 h-5 -translate-y-1/2 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600" aria-hidden="true" />
                <span className="pointer-events-none absolute left-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500 shadow-sm transition-transform peer-checked:translate-x-5 peer-checked:text-blue-600" aria-hidden="true">%</span>
              </label>
              <button type="submit" className="h-9 shrink-0 rounded-lg bg-blue-600 px-3 text-[10px] font-semibold text-white shadow-sm hover:bg-blue-700 sm:px-4 sm:text-sm">Apply</button>
              <button type="button" onClick={() => setAppliedFilters(value => ({ ...value }))} disabled={loading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:gap-2 sm:px-3" title="Refresh report">
                <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M20 11a8.1 8.1 0 0 0-15.5-3M4 5v3h3M4 13a8.1 8.1 0 0 0 15.5 3M20 19v-3h-3" /></svg>
                <span className="hidden sm:inline">Refresh</span>
              </button>
              </form>
            </div>
          </header>
          <form onSubmit={applyFilters} className="mb-3 flex items-center gap-2 overflow-visible border-b border-slate-200 bg-white px-3 py-2 shadow-sm sm:hidden">
              <div className="relative shrink-0">
                <button type="button" onClick={() => setDatePickerOpen(value => !value)} className="flex h-8 w-[110px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-1 text-[9px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50" aria-expanded={datePickerOpen} aria-haspopup="dialog">
                  <svg className="h-3 w-3 shrink-0 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M8 2.5v4M16 2.5v4M3 9h18" /></svg>
                  <span className="truncate">Custom Dates</span>
                </button>
                {datePickerOpen && <div className="absolute left-0 top-10 z-30 w-[min(340px,calc(100vw-24px))] rounded-lg border border-slate-200 bg-white p-4 text-left shadow-xl" role="dialog" aria-label="Custom date range">
                  <div className="flex items-start justify-between gap-3"><h3 className="text-sm font-bold text-slate-800">Custom date range</h3><button type="button" onClick={() => setDatePickerOpen(false)} className="text-lg leading-none text-slate-400" aria-label="Close custom date range">&times;</button></div>
                  <p className="mt-1 text-xs text-slate-500">Filter historical positions for the selected period.</p>
                  <div className="mt-3 grid gap-3"><label className="text-xs font-semibold text-slate-600">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm text-slate-800" /></label><label className="text-xs font-semibold text-slate-600">To<input type="date" min={from} value={to} onChange={event => setTo(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm text-slate-800" /></label></div>
                  <div className="mt-4 flex items-center justify-between gap-2"><button type="button" onClick={() => { setFrom(''); setTo('') }} disabled={!from && !to} className="h-8 rounded-md px-2.5 text-xs font-medium text-slate-400 disabled:opacity-50">Clear</button><button type="button" onClick={applyCustomDates} className="h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white">Apply dates</button></div>
                </div>}
              </div>
              <label className="flex h-8 shrink-0 items-center gap-1 whitespace-nowrap text-[8px] font-semibold text-slate-600">Threshold (%)<input type="number" min="0" step="0.1" value={threshold} onChange={event => setThreshold(event.target.value)} className="h-8 w-10 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-normal text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" /></label>
              <label className="relative flex h-8 w-10 shrink-0 cursor-pointer items-center justify-center" title={percentage ? 'Percentage filter is on' : 'Percentage filter is off'}><input type="checkbox" checked={percentage} onChange={event => setPercentage(event.target.checked)} className="peer sr-only" aria-label="Apply percentage filter" /><span className="absolute inset-x-0.5 top-1/2 h-5 -translate-y-1/2 rounded-full bg-slate-200 transition-colors peer-checked:bg-blue-600" aria-hidden="true" /><span className="pointer-events-none absolute left-0.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[9px] font-bold text-blue-600 shadow-sm transition-transform peer-checked:translate-x-5" aria-hidden="true">%</span></label>
              <button type="submit" className="h-8 shrink-0 rounded-md bg-blue-600 px-2.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-blue-700">Apply</button>
              <button type="button" onClick={() => setAppliedFilters(value => ({ ...value }))} disabled={loading} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh report" title="Refresh report"><svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M20 11a8.1 8.1 0 0 0-15.5-3M4 5v3h3M4 13a8.1 8.1 0 0 0 15.5 3M20 19v-3h-3" /></svg></button>
          </form>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="sm:hidden">
                <label className="relative block">
                  <span className="sr-only">Search symbols</span>
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m16.5 16.5 4 4" /></svg>
                  <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by symbol" className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </label>
                <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-slate-500">{total} symbols</span><div className="flex min-w-0 items-center gap-2"><PageSizeSelect label="Rows" value={pageSize} options={[50, 100, 200, 500]} onChange={handlePageSizeChange} /><ReportPaginationControls page={page} totalPages={totalPages} onPageChange={setPage} /></div></div>
              </div>
              <div className="hidden flex-wrap items-center justify-between gap-3 sm:flex">
                <label className="relative min-w-0 flex-1 sm:max-w-md">
                  <span className="sr-only">Search symbols</span>
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m16.5 16.5 4 4" /></svg>
                  <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by symbol" className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </label>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end"><span className="text-[11px] font-medium text-slate-500 sm:hidden">{total} symbols</span><span className="hidden text-xs font-medium text-slate-500 sm:inline">Rows</span><PageSizeSelect value={pageSize} options={[50, 100, 200, 500]} onChange={handlePageSizeChange} /><span className="hidden text-xs font-medium text-slate-500 sm:inline">{total} symbols</span><ReportPaginationControls page={page} totalPages={totalPages} onPageChange={setPage} /></div>
              </div>
            </div>
            {loading ? <div className="flex-1 overflow-auto"><HistorySkeleton /></div> : error ? <div className="flex flex-1 items-center justify-center px-5 text-center text-sm text-red-600">{error}</div> : !filteredReport.length ? <div className="flex flex-1 flex-col items-center justify-center px-5 text-center"><div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400"><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-6" /></svg></div><p className="text-sm font-semibold text-slate-700">{searchTerm ? 'No matching symbols found' : 'No historical position changes found'}</p><p className="mt-1 text-xs text-slate-500">{searchTerm ? 'Try a different symbol name.' : 'Try a wider date range or a lower threshold.'}</p></div> : (
              <div className="min-h-0 flex-1 overflow-auto">
                <div className="sm:hidden">
                  <div className="grid grid-cols-[minmax(0,1.3fr)_0.8fr_0.8fr_36px] gap-2 bg-blue-600 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.06em] text-white">
                    <span className="text-left">Symbol</span>
                    <span className="text-right">Open</span>
                    <span className="text-right">Close</span>
                    <span className="text-right">Events</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                  {filteredReport.map((row, index) => {
                    const symbol = row.Symbol ?? row.symbol ?? `Symbol ${index + 1}`
                    const events = Array.isArray(row.Events) ? row.Events : Array.isArray(row.events) ? row.events : []
                    const eventCount = Number(row.EventCount ?? row.eventCount) || events.length
                    return <button key={symbol} type="button" onClick={() => setSelectedSymbol(row)} className="grid w-full grid-cols-[minmax(0,1.3fr)_0.8fr_0.8fr_36px] items-center gap-2 px-3 py-3 text-left transition-colors odd:bg-white even:bg-slate-50/40 active:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/30">
                      <span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-900">{symbol}</span><span className="mt-0.5 block text-[9px] uppercase tracking-wide text-slate-400">Symbol</span></span>
                      <span className="text-right"><span className="block text-[9px] uppercase tracking-wide text-slate-400">Open</span><span className={`mt-0.5 block text-[11px] font-semibold tabular-nums ${Number(row.OpeningPosition) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{formatNumber(row.OpeningPosition)}</span></span>
                      <span className="text-right"><span className="block text-[9px] uppercase tracking-wide text-slate-400">Close</span><span className={`mt-0.5 block text-[11px] font-semibold tabular-nums ${Number(row.ClosingPosition) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{formatNumber(row.ClosingPosition)}</span></span>
                      <span className="text-right"><span className="block text-[9px] uppercase tracking-wide text-slate-400">Events</span><span className="mt-0.5 inline-flex min-w-7 justify-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">{eventCount}</span></span>
                    </button>
                  })}
                  </div>
                </div>
                <table className="hidden min-w-[720px] w-full text-sm sm:table">
                  <thead className="sticky top-0 z-10 border-b border-blue-700 bg-blue-600 text-[11px] uppercase tracking-[0.08em] text-white"><tr><th className="px-4 py-3.5 text-left font-bold">Symbol</th><th className="px-4 py-3.5 text-right font-bold">Opening position</th><th className="px-4 py-3.5 text-right font-bold">Closing position</th><th className="px-4 py-3.5 text-right font-bold">Events</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredReport.map((row, index) => {
                      const symbol = row.Symbol ?? row.symbol ?? `Symbol ${index + 1}`
                      const events = Array.isArray(row.Events) ? row.Events : Array.isArray(row.events) ? row.events : []
                      const eventCount = Number(row.EventCount ?? row.eventCount) || events.length
                      return <tr key={symbol} className="transition-colors odd:bg-white even:bg-slate-50/40 hover:bg-blue-50/60">
                        <td className="px-4 py-3.5"><button type="button" onClick={() => setSelectedSymbol(row)} className="group inline-flex items-center gap-2 rounded-md text-left font-bold text-slate-900 transition hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" title={`View ${symbol} details`}><span>{symbol}</span><svg className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" /></svg></button></td>
                        <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${Number(row.OpeningPosition) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{formatNumber(row.OpeningPosition)}</td>
                        <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${Number(row.ClosingPosition) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{formatNumber(row.ClosingPosition)}</td>
                        <td className="px-4 py-3.5 text-right"><span className="inline-flex min-w-10 justify-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{eventCount}</span></td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
      {selectedSymbol && <HistoricalPositionDetails row={selectedSymbol} onClose={() => setSelectedSymbol(null)} />}
    </div>
  )
}

export default HistoricalPositionsPage