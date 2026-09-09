import { useState, useEffect, useMemo, Fragment } from 'react'
import { brokerAPI } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { useGroups } from '../contexts/GroupContext'
import Sidebar from '../components/Sidebar'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'

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
// once and pick up the first Clients array, Totals object, and SettlementWeek.
const unwrapExchangeResponse = (response) => {
  if (!response || typeof response !== 'object') return null

  let clients = null
  let totals = null
  let settlementWeek = null

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
    Object.values(node).forEach(visit)
  }

  visit(response)

  if (!clients && !totals && !settlementWeek) return null
  return { Clients: clients || [], Totals: totals, SettlementWeek: settlementWeek }
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
      const v = localStorage.getItem('sidebarOpen')
      return v === null ? true : JSON.parse(v)
    } catch { return true }
  })

  const [weeks, setWeeks] = useState([])
  const [weeksLoading, setWeeksLoading] = useState(false)
  const [selectedWeekId, setSelectedWeekId] = useState('')

  const [data, setData] = useState(null) // full response.data
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)

  const activeGroupName = getActiveGroupFilter('exchange')
  const activeGroup = groups.find(group => group.name === activeGroupName) || null

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

  // Fetch exchange data when week changes
  useEffect(() => {
    if (!isAuthenticated || !selectedWeekId) return
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await brokerAPI.getExchangeData(
          Number(selectedWeekId),
          getExchangeGroupFilters(activeGroup)
        )
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
  }, [activeGroup, isAuthenticated, selectedWeekId])

  const rawClients = data?.Clients ?? data?.clients ?? data?.Client ?? data?.client ?? []
  const clients = Array.isArray(rawClients) ? rawClients : []
  const settlementWeek = data?.SettlementWeek ?? data?.settlementWeek ?? null
  const responseTotals = data?.Totals ?? data?.totals ?? null

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

  const exportCsv = () => {
    if (!clients.length) return
    const headerTop = ['Login', 'Name', 'Agent Commission']
    exchangeColumns.forEach(name => {
      headerTop.push(`${name} Commission`, `${name} Lots`, `${name} Volume`)
    })
    const rows = [headerTop.join(',')]
    clients.forEach(c => {
      const cells = [c.Login, `"${String(c.Name ?? '').replace(/"/g, '""')}"`, Number(c.AgentCommission || 0)]
      exchangeColumns.forEach(name => {
        const ex = getExchange(c, name)
        cells.push(Number(ex?.Commission || 0), Number(ex?.Lots || 0), Number(ex?.Volume || 0))
      })
      rows.push(cells.join(','))
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const wk = settlementWeek?.name ? settlementWeek.name.replace(/\s+/g, '_') : `week_${selectedWeekId}`
    a.href = url
    a.download = `exchange_${wk}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="hidden lg:block">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
          onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
        />
      </div>

      <main className={`flex-1 px-3 pt-0 pb-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        <div className="max-w-full mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Header Card */}
          <div className="-mx-3 sm:mx-0 bg-white rounded-none sm:rounded-2xl shadow-sm px-0 sm:px-6 py-0 sm:py-3 mb-2 sm:mb-4">
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-[#1A1A1A] leading-tight">Reports · Exchange</h1>
                {settlementWeek && (
                  <p className="hidden sm:block text-xs text-[#6B7280] mt-0.5">
                    {settlementWeek.name ? `${settlementWeek.name} · ` : ''}{settlementWeek.start_date} → {settlementWeek.end_date}
                  </p>
                )}
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

                <GroupSelector
                  moduleName="exchange"
                  onCreateClick={() => { setEditingGroup(null); setShowGroupModal(true) }}
                  onEditClick={(group) => { setEditingGroup(group); setShowGroupModal(true) }}
                />

                <button
                  onClick={exportCsv}
                  disabled={!clients.length}
                  className="h-10 px-3 rounded-md bg-white border border-[#E5E7EB] shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-2xl shadow-sm flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <ExchangeTableSkeleton />
            ) : error ? (
              <div className="flex-1 flex items-center justify-center text-sm text-red-600">{error}</div>
            ) : !hasExchangeData ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500">No exchange data</div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="min-w-full text-xs border-collapse">
                  <thead className="bg-blue-600 text-white sticky top-0 z-20">
                    <tr>
                      <th rowSpan={2} className="px-3 py-3 text-left font-semibold uppercase tracking-wide text-[11px] border-r border-blue-500/60 sticky left-0 bg-blue-600 z-30">Login</th>
                      <th rowSpan={2} className="px-3 py-3 text-left font-semibold uppercase tracking-wide text-[11px] border-r border-blue-500/60">Name</th>
                      <th rowSpan={2} className="px-3 py-3 text-right font-semibold uppercase tracking-wide text-[11px] border-r border-blue-500/60">Agent Commission</th>
                      {exchangeColumns.map(name => (
                        <th key={name} colSpan={3} className="px-3 py-2 text-center font-semibold uppercase tracking-wide text-[11px] border-r border-blue-500/60 border-b border-blue-500/60">
                          {name}
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {exchangeColumns.map(name => (
                        <Fragment key={name}>
                          <th className="px-2 py-2 text-right font-medium uppercase tracking-wide text-[10px] border-r border-blue-500/60">Commission</th>
                          <th className="px-2 py-2 text-right font-medium uppercase tracking-wide text-[10px] border-r border-blue-500/60">Lots</th>
                          <th className="px-2 py-2 text-right font-medium uppercase tracking-wide text-[10px] border-r border-blue-500/60">Volume</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr key={c.Login} className="group bg-white hover:bg-[#F8FAFC] border-b border-[#E1E1E1]">
                        <td className="px-3 py-2 font-medium text-[#1A63BC] border-r border-[#E1E1E1] sticky left-0 bg-white group-hover:bg-[#F8FAFC]">{c.Login}</td>
                        <td className="px-3 py-2 text-[#1F2937] border-r border-[#E1E1E1]">{c.Name}</td>
                        <td className="px-3 py-2 text-right border-r border-[#E1E1E1] tabular-nums text-[#1F2937]">
                          {fmtMoney(c.AgentCommission)}
                        </td>
                        {exchangeColumns.map(name => {
                          const ex = getExchange(c, name)
                          const commission = Number(ex?.Commission || 0)
                          return (
                            <Fragment key={name}>
                              <td className={`px-2 py-2 text-right border-r border-[#E1E1E1] tabular-nums ${commission < 0 ? 'text-red-600' : commission > 0 ? 'text-emerald-700' : 'text-[#9CA3AF]'}`}>
                                {fmtMoney(commission)}
                              </td>
                              <td className="px-2 py-2 text-right border-r border-[#E1E1E1] tabular-nums text-[#374151]">
                                {fmtLots(ex?.Lots)}
                              </td>
                              <td className="px-2 py-2 text-right border-r border-[#E1E1E1] tabular-nums text-[#374151]">
                                {fmtVolume(ex?.Volume)}
                              </td>
                            </Fragment>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-[#F1F5F9] text-[#1F2937] font-semibold">
                    <tr>
                      <td className="px-3 py-2.5 border-t border-[#CBD5E1] sticky left-0 bg-[#F1F5F9]">Totals</td>
                      <td className="px-3 py-2.5 border-t border-[#CBD5E1] text-[#4B5563]">{clients.length} clients</td>
                      <td className="px-3 py-2.5 border-t border-[#CBD5E1] text-right tabular-nums">
                        {fmtMoney(totals.agentCommission)}
                      </td>
                      {exchangeColumns.map(name => {
                        const t = totals.perEx[name] || { Commission: 0, Lots: 0, Volume: 0 }
                        return (
                          <Fragment key={name}>
                            <td className={`px-2 py-2.5 border-t border-[#CBD5E1] text-right tabular-nums ${t.Commission < 0 ? 'text-red-600' : t.Commission > 0 ? 'text-emerald-700' : ''}`}>
                              {fmtMoney(t.Commission)}
                            </td>
                            <td className="px-2 py-2.5 border-t border-[#CBD5E1] text-right tabular-nums">{fmtLots(t.Lots)}</td>
                            <td className="px-2 py-2.5 border-t border-[#CBD5E1] text-right tabular-nums">{fmtVolume(t.Volume)}</td>
                          </Fragment>
                        )
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
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
    </div>
  )
}

export default ReportsExchangePage
