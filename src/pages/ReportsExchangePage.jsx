import { useState, useEffect, useMemo, useRef, Fragment } from 'react'
import * as XLSX from 'xlsx-js-style'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useGroups } from '../contexts/GroupContext'
import Sidebar from '../components/Sidebar'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import PageSizeSelect from '../components/PageSizeSelect'
import ExchangeBreakdownModal from '../components/ExchangeBreakdownModal'

const fmtMoney = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtLots = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtVolume = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

const isClientRow = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) &&
  ('Login' in value || 'login' in value) &&
  ('Exchanges' in value || 'exchanges' in value)

const isTotalsShape = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) &&
  ('Exchanges' in value || 'exchanges' in value) &&
  ('AgentCommission' in value || 'agentCommission' in value)

const isSettlementWeekShape = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) &&
  ('start_date' in value || 'startDate' in value) &&
  ('end_date' in value || 'endDate' in value)

// Response envelopes vary (data / data.data / result / payload); walk the tree
// once and pick up the first Clients array, Totals object, SettlementWeek, and pagination block.
const unwrapExchangeResponse = (response) => {
  if (!response || typeof response !== 'object') return null

  let clients = null
  let totals = null
  let settlementWeek = null
  let pagination = null

  const isPaginationShape = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) &&
    ('total' in value || 'total_items' in value || 'totalItems' in value ||
      'total_pages' in value || 'totalPages' in value || 'pages' in value)

  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      if (!clients && node.length > 0 && node.every(isClientRow)) {
        clients = node
      } else {
        node.forEach(visit)
      }
      return
    }
    if (!totals && isTotalsShape(node)) totals = node
    if (!settlementWeek && isSettlementWeekShape(node)) settlementWeek = node
    if (!pagination && isPaginationShape(node) && !isTotalsShape(node)) pagination = node
    Object.values(node).forEach(visit)
  }

  visit(response)

  if (!clients && !totals && !settlementWeek) return null
  return { Clients: clients || [], Totals: totals, SettlementWeek: settlementWeek, Pagination: pagination }
}

const getExchangeGroupFilters = (group) => {
  if (!group) return {}

  if (group.range) {
    const accountRangeMin = Number(group.range.from)
    const accountRangeMax = Number(group.range.to)
    if (Number.isFinite(accountRangeMin) && Number.isFinite(accountRangeMax)) {
      return { accountRangeMin, accountRangeMax }
    }
    return {}
  }

  const logins = (Array.isArray(group.loginIds) ? group.loginIds : [])
    .map(Number)
    .filter(Number.isFinite)

  return logins.length ? { logins: [...new Set(logins)] } : {}
}

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
  </svg>
)

const ExchangeTableSkeleton = () => (
  <div className="flex-1 overflow-auto" aria-label="Loading exchange data" aria-busy="true">
    <table className="min-w-full text-xs">
      <thead className="bg-slate-100">
        <tr>
          {Array.from({ length: 9 }, (_, columnIndex) => (
            <th key={`skeleton-header-${columnIndex}`} className="px-3 py-3 border-r border-slate-200">
              <div className={`h-3 bg-slate-200 rounded animate-pulse ${columnIndex < 3 ? 'w-20' : 'w-14'}`} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 10 }, (_, rowIndex) => (
          <tr key={`skeleton-row-${rowIndex}`} className="border-b border-slate-100">
            {Array.from({ length: 9 }, (_, cellIndex) => (
              <td key={`skeleton-cell-${rowIndex}-${cellIndex}`} className="px-3 py-3 border-r border-slate-100">
                <div className={`h-3 bg-slate-100 rounded animate-pulse ${cellIndex === 1 ? 'w-28' : 'w-16'}`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const ReportsExchangePage = () => {
  const { isAuthenticated } = useAuth()
  const { groups, getActiveGroupFilter } = useGroups()

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) return false
      const v = localStorage.getItem('sidebarOpen')
      return v === null ? true : JSON.parse(v)
    } catch { return false }
  })

  const [weeks, setWeeks] = useState([])
  const [weeksLoading, setWeeksLoading] = useState(false)
  const [selectedWeekId, setSelectedWeekId] = useState('')

  const [data, setData] = useState(null) // full response.data
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customFromDate, setCustomFromDate] = useState('')
  const [customToDate, setCustomToDate] = useState('')
  const [appliedFromDate, setAppliedFromDate] = useState('')
  const [appliedToDate, setAppliedToDate] = useState('')
  const [dateError, setDateError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [exporting, setExporting] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const desktopDatePickerRef = useRef(null)
  const mobileDatePickerRef = useRef(null)

  const activeGroupName = getActiveGroupFilter('exchange')
  const activeGroup = groups.find(group => group.name === activeGroupName) || null

  useEffect(() => {
    if (!showDatePicker) return undefined
    const closeOnOutsideClick = (event) => {
      const insideDesktopPicker = desktopDatePickerRef.current?.contains(event.target)
      const insideMobilePicker = mobileDatePickerRef.current?.contains(event.target)
      if (!insideDesktopPicker && !insideMobilePicker) {
        setShowDatePicker(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [showDatePicker])

  // Load settlement weeks; select highest-id week by default
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    const load = async () => {
      try {
        setWeeksLoading(true)
        const res = await brokerAPI.getSettlementWeeks({ page: 1, limit: 100 })
        const list = res?.data?.weeks ?? res?.weeks ?? []
        if (cancelled) return
        setWeeks(list)
        if (list.length) {
          const highest = list.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a))
          setSelectedWeekId(String(highest.id))
        }
      } catch {
        if (!cancelled) setError('Failed to load settlement weeks')
      } finally {
        if (!cancelled) setWeeksLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isAuthenticated])

  // Fetch exchange data when week / filters / page changes
  useEffect(() => {
    if (!isAuthenticated || !selectedWeekId) return
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const dateFilters = appliedFromDate && appliedToDate
          ? { from: appliedFromDate, to: appliedToDate }
          : {}
        const res = await brokerAPI.getExchangeData(Number(selectedWeekId), {
          ...dateFilters,
          ...getExchangeGroupFilters(activeGroup),
          ...(search ? { search } : {}),
          page: currentPage,
          limit: pageSize
        })
        if (cancelled) return
        setData(unwrapExchangeResponse(res))
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.message || 'Failed to load exchange data')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [activeGroup, appliedFromDate, appliedToDate, search, currentPage, isAuthenticated, pageSize, selectedWeekId])

  const submitSearch = (event) => {
    event?.preventDefault?.()
    setSearch(searchInput.trim())
    setCurrentPage(1)
  }

  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
    setCurrentPage(1)
  }

  const applyDateFilter = () => {
    if (!customFromDate || !customToDate) {
      setDateError('Select both From and To dates')
      return
    }
    if (customFromDate > customToDate) {
      setDateError('From date must be before To date')
      return
    }
    setDateError('')
    setAppliedFromDate(customFromDate)
    setAppliedToDate(customToDate)
    setShowDatePicker(false)
  }

  const clearDateFilter = () => {
    setCustomFromDate('')
    setCustomToDate('')
    setAppliedFromDate('')
    setAppliedToDate('')
    setDateError('')
    setShowDatePicker(false)
  }

  const handlePageSizeChange = (value) => {
    setPageSize(value)
    setCurrentPage(1)
  }

  const rawClients = data?.Clients ?? data?.clients ?? data?.Client ?? data?.client ?? []
  const clients = Array.isArray(rawClients) ? rawClients : []
  const settlementWeek = data?.SettlementWeek ?? data?.settlementWeek ?? null
  const responseTotals = data?.Totals ?? data?.totals ?? null
  const responsePagination = data?.Pagination ?? data?.pagination ?? null

  const totalClients = Number(
    responsePagination?.total ??
    responsePagination?.total_items ??
    responsePagination?.totalItems ??
    clients.length
  ) || clients.length
  const totalPages = Math.max(1, Number(
    responsePagination?.total_pages ??
    responsePagination?.totalPages ??
    responsePagination?.pages ??
    Math.ceil(totalClients / pageSize)
  ) || 1)
  const pagedClients = clients

  useEffect(() => {
    setCurrentPage(1)
  }, [activeGroupName, appliedFromDate, appliedToDate, selectedWeekId])

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])

  // Build the union of exchange columns across all clients (stable order = first-seen)
  const exchangeColumns = useMemo(() => {
    const seen = new Set()
    const cols = []
    const addExchanges = (exchanges) => (exchanges || []).forEach(e => {
        const name = e.Exchange || 'UNKNOWN'
        if (!seen.has(name)) {
          seen.add(name)
          cols.push(name)
        }
      })
    clients.forEach(c => addExchanges(c.Exchanges))
    addExchanges(responseTotals?.Exchanges ?? responseTotals?.exchanges)
    return cols
  }, [clients, responseTotals])

  const hasExchangeData = clients.length > 0 || exchangeColumns.length > 0

  // Totals per exchange (Commission, Lots, Volume) + AgentCommission
  const totals = useMemo(() => {
    const perEx = {}
    exchangeColumns.forEach(name => { perEx[name] = { Commission: 0, Lots: 0, Volume: 0 } })

    if (responseTotals) {
      const apiExchanges = responseTotals.Exchanges ?? responseTotals.exchanges ?? []
      apiExchanges.forEach(e => {
        const name = e.Exchange || 'UNKNOWN'
        perEx[name] = {
          Commission: Number(e.Commission || 0),
          Lots: Number(e.Lots || 0),
          Volume: Number(e.Volume || 0)
        }
      })
      return {
        perEx,
        agentCommission: Number(responseTotals.AgentCommission ?? responseTotals.agentCommission ?? 0)
      }
    }

    let agentCommission = 0
    clients.forEach(c => {
      agentCommission += Number(c.AgentCommission || 0)
      ;(c.Exchanges || []).forEach(e => {
        const name = e.Exchange || 'UNKNOWN'
        if (!perEx[name]) perEx[name] = { Commission: 0, Lots: 0, Volume: 0 }
        perEx[name].Commission += Number(e.Commission || 0)
        perEx[name].Lots += Number(e.Lots || 0)
        perEx[name].Volume += Number(e.Volume || 0)
      })
    })
    return { perEx, agentCommission }
  }, [clients, exchangeColumns, responseTotals])

  // Lookup helper: exchange row for a given client
  const getExchange = (client, name) => {
    return (client.Exchanges || []).find(e => (e.Exchange || 'UNKNOWN') === name) || null
  }

  // Fetch a single login's exchange breakdown via POST /api/broker/exchange-data
  const fetchExchangeForLogin = async (login) => {
    if (!selectedWeekId) return null
    const dateFilters = (appliedFromDate && appliedToDate)
      ? { from: appliedFromDate, to: appliedToDate }
      : {}
    const res = await brokerAPI.getExchangeData(Number(selectedWeekId), {
      ...dateFilters,
      ...getExchangeGroupFilters(activeGroup),
      search: String(login),
      page: 1,
      limit: 50,
    })
    const unwrapped = unwrapExchangeResponse(res)
    const list = Array.isArray(unwrapped?.Clients) ? unwrapped.Clients : []
    return list.find(c => String(c.Login ?? c.login) === String(login)) ?? list[0] ?? null
  }

  const exportExcel = async () => {
    if (exporting || !selectedWeekId) return

    setExporting(true)
    try {
      const dateFilters = appliedFromDate && appliedToDate
        ? { from: appliedFromDate, to: appliedToDate }
        : {}
      const exportFilters = {
        ...dateFilters,
        ...getExchangeGroupFilters(activeGroup),
        ...(search ? { search } : {}),
        limit: 500
      }
      const exportClients = []
      let page = 1
      let totalPages = null

      while (totalPages === null || page <= totalPages) {
        const response = await brokerAPI.getExchangeData(Number(selectedWeekId), {
          ...exportFilters,
          page
        })
        const exportData = unwrapExchangeResponse(response)
        const pageClients = exportData?.Clients ?? []
        exportClients.push(...pageClients)

        const pagination = exportData?.Pagination ?? {}
        const parsedTotalPages = Number(
          pagination.total_pages ?? pagination.totalPages ?? pagination.pages
        )
        totalPages = Number.isFinite(parsedTotalPages) && parsedTotalPages > 0
          ? parsedTotalPages
          : (pageClients.length < 500 ? page : null)
        page += 1
      }

      if (!exportClients.length) return

      const exportColumns = []
      const seenExchanges = new Set()
      exportClients.forEach(client => {
        ;(client.Exchanges || []).forEach(exchange => {
          const name = exchange.Exchange || 'UNKNOWN'
          if (!seenExchanges.has(name)) {
            seenExchanges.add(name)
            exportColumns.push(name)
          }
        })
      })

      const totalColumns = 1 + exportColumns.length * 3
      const worksheetData = [Array(totalColumns).fill('')]
      worksheetData[0][0] = 'Exchange Data'
      const groupedHeader = Array(totalColumns).fill('')
      const subHeader = Array(totalColumns).fill('')
      groupedHeader[0] = 'Login'
      subHeader[0] = 'Login'
      exportColumns.forEach(name => {
        const startColumn = 1 + exportColumns.indexOf(name) * 3
        groupedHeader[startColumn] = name
        subHeader[startColumn] = 'Lots'
        subHeader[startColumn + 1] = 'Volume'
        subHeader[startColumn + 2] = 'Commission'
      })
      worksheetData.push(groupedHeader, subHeader)
      exportClients.forEach(client => {
        const cells = [client.Login]
        exportColumns.forEach(name => {
          const exchange = (client.Exchanges || []).find(item => (item.Exchange || 'UNKNOWN') === name)
          cells.push(Number(exchange?.Lots || 0), Number(exchange?.Volume || 0), Number(exchange?.Commission || 0))
        })
        worksheetData.push(cells)
      })
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
      const lastColumn = totalColumns - 1
      const headerBorder = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } }
      }
      const dataBorder = {
        top: { style: 'thin', color: { rgb: 'B7B7B7' } },
        bottom: { style: 'thin', color: { rgb: 'B7B7B7' } },
        left: { style: 'thin', color: { rgb: 'B7B7B7' } },
        right: { style: 'thin', color: { rgb: 'B7B7B7' } }
      }
      const darkHeaderStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
        fill: { patternType: 'solid', fgColor: { rgb: '006B9A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: headerBorder
      }
      const subHeaderStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
        fill: { patternType: 'solid', fgColor: { rgb: '006B9A' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: headerBorder
      }
      for (let column = 0; column <= lastColumn; column += 1) {
        worksheet[XLSX.utils.encode_cell({ r: 0, c: column })].s = darkHeaderStyle
        worksheet[XLSX.utils.encode_cell({ r: 1, c: column })].s = darkHeaderStyle
        worksheet[XLSX.utils.encode_cell({ r: 2, c: column })].s = subHeaderStyle
      }
      for (let row = 3; row < worksheetData.length; row += 1) {
        for (let column = 0; column <= lastColumn; column += 1) {
          const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]
          cell.s = {
            alignment: { horizontal: column === 0 ? 'right' : 'right', vertical: 'center' },
            border: dataBorder
          }
        }
      }
      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
        { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } },
        ...exportColumns.map((_, index) => {
          const startColumn = 1 + index * 3
          return { s: { r: 1, c: startColumn }, e: { r: 1, c: startColumn + 2 } }
        })
      ]
      worksheet['!cols'] = [
        { wch: 14 },
        ...exportColumns.flatMap(() => [{ wch: 14 }, { wch: 16 }, { wch: 14 }])
      ]
      worksheet['!rows'] = [
        { hpt: 28 },
        { hpt: 24 },
        { hpt: 22 }
      ]
      worksheet['!freeze'] = { xSplit: 1, ySplit: 3 }

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Exchange Data')
      const wk = settlementWeek?.name ? settlementWeek.name.replace(/\s+/g, '_') : `week_${selectedWeekId}`
      XLSX.writeFile(workbook, `exchange_data_${wk}.xlsx`)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to export exchange data')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex h-[100dvh] bg-gray-50">
      <div className="hidden lg:block">
        <Sidebar
          desktopOnly
          isOpen={sidebarOpen}
          onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
          onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
        />
      </div>
      <div className="lg:hidden">
        <Sidebar
          mobileOnly
          isOpen={sidebarOpen}
          onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
          onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
        />
      </div>

      <main className={`flex-1 px-0 pt-0 pb-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        <div className="max-w-full mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Header Card */}
          <div className="bg-white rounded-none sm:rounded-2xl shadow-sm px-0 sm:px-6 py-0 sm:py-3 mb-0 sm:mb-2">
            <div className="sm:hidden flex items-center px-4 py-4 bg-white border-b border-[#ECECEC] relative">
              <button
                type="button"
                onClick={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {} ; return n })}
                className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center"
                aria-label="Open menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-black absolute left-1/2 transform -translate-x-1/2">Exchange Data</h1>
            </div>

            <div className="hidden sm:flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-[#1A1A1A] leading-tight">Reports · Exchange Data</h1>
              </div>

              <div className="hidden sm:flex flex-nowrap items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Settlement Weeks</label>
                  {weeksLoading ? (
                    <div className="h-10 rounded-md bg-gray-200 animate-pulse min-w-[260px]" aria-label="Loading weeks" />
                  ) : (
                    <select
                      value={selectedWeekId}
                      onChange={(e) => setSelectedWeekId(e.target.value)}
                      disabled={!weeks.length}
                      className="h-10 px-3 rounded-md border border-[#E5E7EB] bg-white text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 min-w-[260px]"
                    >
                      {!weeks.length && <option>No weeks available</option>}
                      {weeks.map(w => (
                        <option key={w.id} value={String(w.id)}>
                          {w.name} ({w.start_date} → {w.end_date})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="relative" ref={desktopDatePickerRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFromDate(appliedFromDate)
                      setCustomToDate(appliedToDate)
                      setDateError('')
                      setShowDatePicker(value => !value)
                    }}
                    className={`h-10 px-3 rounded-md border shadow-sm text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${
                      appliedFromDate && appliedToDate
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-[#E5E7EB] bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    aria-label="Choose custom date range"
                    title="Choose custom date range"
                  >
                    <CalendarIcon />
                    <span className="hidden xl:inline">Custom Dates</span>
                  </button>

                  {showDatePicker && (
                    <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-xl">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-[#1F2937]">Custom date range</p>
                        <p className="mt-0.5 text-[11px] text-[#6B7280]">Filter exchange data for the selected period.</p>
                      </div>
                      <div className="space-y-3">
                        <label className="block text-xs font-medium text-[#374151]">
                          From
                          <input
                            type="date"
                            value={customFromDate}
                            onChange={(event) => setCustomFromDate(event.target.value)}
                            className="mt-1 h-9 w-full rounded-md border border-[#E5E7EB] px-2.5 text-sm text-[#1F2937] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#374151]">
                          To
                          <input
                            type="date"
                            value={customToDate}
                            min={customFromDate || undefined}
                            onChange={(event) => setCustomToDate(event.target.value)}
                            className="mt-1 h-9 w-full rounded-md border border-[#E5E7EB] px-2.5 text-sm text-[#1F2937] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                        </label>
                      </div>
                      {dateError && <p className="mt-2 text-xs text-red-600">{dateError}</p>}
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={clearDateFilter}
                          disabled={!appliedFromDate && !appliedToDate}
                          className="h-8 rounded-md px-2.5 text-xs font-medium text-[#6B7280] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={applyDateFilter}
                          className="h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Apply dates
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <GroupSelector
                  moduleName="exchange"
                  onCreateClick={() => { setEditingGroup(null); setShowGroupModal(true) }}
                  onEditClick={(group) => { setEditingGroup(group); setShowGroupModal(true) }}
                />

                <button
                  onClick={exportExcel}
                  disabled={!clients.length || exporting}
                  className="h-10 px-3 rounded-md bg-white border border-[#E5E7EB] shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {exporting ? 'Exporting...' : 'Export Excel'}
                </button>
              </div>
            </div>

            <div className="sm:hidden relative flex items-center gap-1.5 px-3 py-2 overflow-visible">
              {weeksLoading ? (
                <div className="h-8 rounded-md bg-gray-200 animate-pulse flex-1 min-w-0" aria-label="Loading weeks" />
              ) : (
                <select
                  value={selectedWeekId}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  disabled={!weeks.length}
                  className="h-8 flex-1 min-w-0 px-2 rounded-md border border-[#E5E7EB] bg-white text-[11px] text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 truncate"
                >
                  {!weeks.length && <option>No weeks</option>}
                  {weeks.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
                </select>
              )}

              <div className="flex-shrink-0" ref={mobileDatePickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setCustomFromDate(appliedFromDate)
                    setCustomToDate(appliedToDate)
                    setDateError('')
                    setShowDatePicker(value => !value)
                  }}
                  className={`h-8 w-8 rounded-md border shadow-sm flex items-center justify-center ${appliedFromDate && appliedToDate ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-[#E5E7EB] bg-white text-gray-700'}`}
                  aria-label="Choose custom date range"
                  title="Choose custom date range"
                >
                  <CalendarIcon />
                </button>
                {showDatePicker && (
                  <div className="absolute left-1/2 top-full z-50 mt-2 w-[calc(100vw-1rem)] max-w-72 -translate-x-1/2 rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-xl">
                    <p className="text-sm font-semibold text-[#1F2937]">Custom date range</p>
                    <p className="mt-0.5 text-[11px] text-[#6B7280]">Filter exchange data for the selected period.</p>
                    <div className="mt-3 space-y-3">
                      <label className="block text-xs font-medium text-[#374151]">
                        From
                        <input
                          type="date"
                          value={customFromDate}
                          onChange={(event) => setCustomFromDate(event.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-[#E5E7EB] px-2.5 text-sm text-[#1F2937] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </label>
                      <label className="block text-xs font-medium text-[#374151]">
                        To
                        <input
                          type="date"
                          value={customToDate}
                          min={customFromDate || undefined}
                          onChange={(event) => setCustomToDate(event.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-[#E5E7EB] px-2.5 text-sm text-[#1F2937] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </label>
                    </div>
                    {dateError && <p className="mt-2 text-xs text-red-600">{dateError}</p>}
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <button type="button" onClick={clearDateFilter} disabled={!appliedFromDate && !appliedToDate} className="h-8 rounded-md px-2.5 text-xs font-medium text-[#6B7280] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Clear</button>
                      <button type="button" onClick={applyDateFilter} className="h-8 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">Apply dates</button>
                    </div>
                  </div>
                )}
              </div>

              <GroupSelector
                moduleName="exchange"
                onCreateClick={() => { setEditingGroup(null); setShowGroupModal(true) }}
                onEditClick={(group) => { setEditingGroup(group); setShowGroupModal(true) }}
              />
              <button
                type="button"
                onClick={exportExcel}
                disabled={!clients.length || exporting}
                className="h-8 w-8 rounded-md border border-[#E5E7EB] bg-white text-gray-700 shadow-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Export Excel"
                title="Export Excel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
            </div>
          </div>

          {!loading && !error && selectedWeekId && (
            <div className="flex items-center gap-2 px-3 py-4 sm:px-4 sm:py-5">
              <form onSubmit={submitSearch} className="min-w-0 flex-1 sm:max-w-md">
                <div className="relative w-full">
                  <svg className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF] sm:hidden" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search"
                    aria-label="Search by Login or Name"
                    className="h-8 w-full rounded-md border border-[#E5E7EB] bg-[#F9FAFB] pl-7 pr-12 text-[11px] text-[#1F2937] placeholder:text-[#9CA3AF] transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 sm:h-10 sm:pl-3 sm:pr-16 sm:text-sm"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {searchInput && (
                      <button
                        type="button"
                        onClick={clearSearch}
                        title="Clear search"
                        aria-label="Clear search"
                        className="flex h-6 w-6 items-center justify-center text-[#9CA3AF] transition-colors hover:text-[#4B5563]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="submit"
                      title="Search"
                      aria-label="Search"
                      className="flex h-6 w-6 items-center justify-center rounded bg-blue-500 text-white transition-colors hover:bg-blue-600 sm:h-8 sm:w-8"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </form>
              <div className="ml-auto flex items-center gap-1 sm:gap-3">
                <div className="hidden sm:block">
                  <PageSizeSelect value={pageSize} options={[50, 100, 200, 500]} onChange={handlePageSizeChange} />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                    disabled={currentPage <= 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
                    aria-label="Previous page"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12 14L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <div className="flex items-center gap-0.5 text-[11px] font-medium text-[#4B5563] sm:text-sm">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={currentPage}
                      onChange={(event) => {
                        const page = Number(event.target.value)
                        if (Number.isInteger(page) && page >= 1 && page <= totalPages) setCurrentPage(page)
                      }}
                      className="h-7 w-8 rounded-md border border-[#E5E7EB] text-center text-[11px] font-semibold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-blue-500 sm:h-8 sm:w-10 sm:text-sm"
                      aria-label="Current page"
                    />
                    <span className="text-[#9CA3AF]">/</span>
                    <span>{totalPages}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                    disabled={currentPage >= totalPages}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8"
                    aria-label="Next page"
                  >
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 6L12 10L8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="bg-white rounded-none shadow-sm flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <ExchangeTableSkeleton />
            ) : error ? (
              <div className="flex-1 flex items-center justify-center text-sm text-red-600">{error}</div>
            ) : !hasExchangeData ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">No exchange data</div>
            ) : (
              <>
                <div className="exchange-table-scrollbar flex-1 min-h-0 overflow-auto isolate">
                  <table className="min-w-full text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr>
                      <th rowSpan={2} className="relative z-30 bg-blue-600 text-white px-3 py-3 text-left font-semibold uppercase tracking-wide text-[11px] border-r border-blue-500/60 sticky left-0">Login</th>
                      <th rowSpan={2} className="bg-blue-600 text-white px-3 py-3 text-left font-semibold uppercase tracking-wide text-[11px] border-r border-blue-500/60">Name</th>
                      <th rowSpan={2} className="bg-blue-600 text-white px-3 py-3 text-right font-semibold uppercase tracking-wide text-[11px] border-r border-blue-500/60">Agent Commission</th>
                      {exchangeColumns.map(name => (
                        <th key={name} colSpan={3} className="bg-blue-600 text-white px-3 py-2 text-center font-semibold uppercase tracking-wide text-[11px] border-r-2 border-r-[#94A3B8] border-b border-white/25">
                          {name}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {exchangeColumns.map(name => (
                        <Fragment key={name}>
                          <th className="bg-[#DBEAFE] text-[#1E40AF] px-2 py-2 text-right font-semibold uppercase tracking-wide text-[10px] border-r border-[#BFDBFE]">Commission</th>
                          <th className="bg-[#DBEAFE] text-[#1E40AF] px-2 py-2 text-right font-semibold uppercase tracking-wide text-[10px] border-r border-[#BFDBFE]">Lots</th>
                          <th className="bg-[#DBEAFE] text-[#1E40AF] px-2 py-2 text-right font-semibold uppercase tracking-wide text-[10px] border-r-2 border-r-[#94A3B8]">Volume</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedClients.map((c) => (
                      <tr key={c.Login} className="group bg-white hover:bg-[#F8FAFC]">
                        <td
                          className="relative z-10 sticky left-0 bg-white px-3 py-2 font-medium text-[#1A63BC] hover:text-blue-700 hover:underline cursor-pointer border-b border-r border-[#E1E1E1] group-hover:bg-[#F8FAFC]"
                          onClick={(e) => { e.stopPropagation(); setSelectedClient({ login: c.Login, name: c.Name, ...c }) }}
                          title="Click to view client details"
                        >{c.Login}</td>
                        <td className="px-3 py-2 text-[#4B4B4B] border-b border-r border-[#E1E1E1]">{c.Name}</td>
                        <td className="px-3 py-2 text-right border-b border-r border-[#E1E1E1] tabular-nums text-[#4B4B4B]">
                          {fmtMoney(c.AgentCommission)}
                        </td>
                        {exchangeColumns.map(name => {
                          const ex = getExchange(c, name)
                          const commission = Number(ex?.Commission || 0)
                          return (
                            <Fragment key={name}>
                              <td className={`px-2 py-2 text-right border-b border-r border-[#E1E1E1] tabular-nums ${commission < 0 ? 'text-[#EF4444]' : commission > 0 ? 'text-[#059669]' : 'text-[#6B7280]'}`}>
                                {fmtMoney(commission)}
                              </td>
                              <td className="px-2 py-2 text-right border-b border-r border-[#E1E1E1] tabular-nums text-[#4B4B4B]">
                                {fmtLots(ex?.Lots)}
                              </td>
                              <td className="px-2 py-2 text-right border-b border-r-2 border-b-[#E1E1E1] border-r-[#94A3B8] tabular-nums text-[#4B4B4B]">
                                {fmtVolume(ex?.Volume)}
                              </td>
                            </Fragment>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#F8FAFC] text-[#4B4B4B] font-semibold">
                    <tr className="sticky bottom-0 z-20 bg-[#F8FAFC]">
                      <td className="relative z-30 sticky bottom-0 left-0 bg-[#F8FAFC] px-3 py-2.5 border-t border-[#E1E1E1]">Totals</td>
                      <td className="sticky bottom-0 z-20 bg-[#F8FAFC] px-3 py-2.5 border-t border-[#E1E1E1] text-[#6B7280]">{totalClients} clients</td>
                      <td className="sticky bottom-0 z-20 bg-[#F8FAFC] px-3 py-2.5 border-t border-[#E1E1E1] text-right tabular-nums">
                        {fmtMoney(totals.agentCommission)}
                      </td>
                      {exchangeColumns.map(name => {
                        const t = totals.perEx[name] || { Commission: 0, Lots: 0, Volume: 0 }
                        return (
                          <Fragment key={name}>
                            <td className={`sticky bottom-0 z-20 bg-[#F8FAFC] px-2 py-2.5 border-t border-r border-[#E1E1E1] text-right tabular-nums ${t.Commission < 0 ? 'text-[#EF4444]' : t.Commission > 0 ? 'text-[#059669]' : 'text-[#6B7280]'}`}>
                              {fmtMoney(t.Commission)}
                            </td>
                            <td className="sticky bottom-0 z-20 bg-[#F8FAFC] px-2 py-2.5 border-t border-r border-[#E1E1E1] text-right tabular-nums">{fmtLots(t.Lots)}</td>
                            <td className="sticky bottom-0 z-20 bg-[#F8FAFC] px-2 py-2.5 border-t border-r-2 border-t-[#E1E1E1] border-r-[#94A3B8] text-right tabular-nums">{fmtVolume(t.Volume)}</td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <GroupModal
        isOpen={showGroupModal}
        onClose={() => { setShowGroupModal(false); setEditingGroup(null) }}
        availableItems={clients}
        loginField="Login"
        displayField="Name"
        editGroup={editingGroup}
      />

      {/* Exchange Breakdown Modal */}
      {selectedClient && (
        <ExchangeBreakdownModal
          client={selectedClient}
          onFetch={fetchExchangeForLogin}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  )
}

export default ReportsExchangePage
