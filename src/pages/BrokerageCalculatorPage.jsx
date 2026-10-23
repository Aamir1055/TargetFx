import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import Sidebar from '../components/Sidebar'
import BrokerCreditSummary from '../components/BrokerCreditSummary'
import { brokerAPI, brokerageCalcAPI } from '../services/api'

// ---------- helpers ----------
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const fmtMoney = (v) => { const n = num(v); return n == null ? (v ?? '—') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
const fmtNum = (v) => { const n = num(v); return n == null ? (v ?? '—') : n.toLocaleString('en-IN') }
const titleCase = (k) => String(k).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const SYM = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ' }
const sym = (c) => SYM[String(c || '').toUpperCase()] || (c ? `${c} ` : '')
const money = (v, cur) => { const n = num(v); return n == null ? '—' : `${sym(cur)}${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
const ISSUE_LABEL = { method_missing: 'method', rate_missing: 'rate', usd_inr_missing: 'USD–INR', lots_missing: 'lots', turnover_missing: 'turnover', client_rate_missing: 'client rate' }

function StatusBadge({ status }) {
  const s = String(status || '').toLowerCase()
  const cls = s === 'pending' ? 'bg-amber-50 text-amber-700'
    : (s === 'done' || s === 'paid' || s === 'charged' || s === 'ok' || s === 'complete') ? 'bg-emerald-50 text-emerald-700'
    : 'bg-slate-100 text-slate-500'
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize ${cls}`}>{status || '—'}</span>
}

function StatTile({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-[16px] font-bold tabular-nums ${tone === 'amber' ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

const Missing = () => <span className="text-[11px] font-medium text-amber-600">missing</span>

// Pull the array of rows out of whatever envelope the calculate endpoint returns.
const extractRows = (data) => {
  if (Array.isArray(data)) return data
  for (const k of ['rows', 'data', 'results', 'items', 'records', 'clients', 'logins']) {
    if (Array.isArray(data?.[k])) return data[k]
  }
  if (data?.data && typeof data.data === 'object') return extractRows(data.data)
  return []
}
const extractTotal = (data) => num(data?.total ?? data?.total_count ?? data?.data?.total ?? data?.pagination?.total) ?? null
const extractSummary = (data) => data?.summary || data?.totals || data?.data?.summary || null

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
]

function Modal({ title, subtitle, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

// ---------- Exchange rates editor ----------
function ExchangeRatesModal({ onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    brokerageCalcAPI.getExchanges()
      .then(r => { if (active) setRows((r?.exchanges || r?.data?.exchanges || []).map(x => ({ exchange: x.exchange || '', method: x.method || 'lot', rate: x.rate ?? '', currency: x.currency || 'INR' }))) })
      .catch(e => active && setError(e?.response?.data?.message || e.message))
    return () => { active = false }
  }, [])
  const update = (i, k, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows(rs => [...(rs || []), { exchange: '', method: 'lot', rate: '', currency: 'INR' }])
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i))
  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = rows.filter(r => r.exchange.trim()).map(r => ({ exchange: r.exchange.trim(), method: r.method, rate: num(r.rate) ?? 0, currency: r.currency }))
      await brokerageCalcAPI.setExchanges(payload)
      onSaved?.('Exchange rates saved'); onClose()
    } catch (e) { setError(e?.response?.data?.message || e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title="Exchange Rates" subtitle="Brokerage rate per exchange — applied to every client unless overridden." onClose={onClose} wide
      footer={<>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !rows} className="rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save rates'}</button>
      </>}>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      {!rows ? <p className="py-8 text-center text-[13px] text-slate-400">Loading…</p> : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr_auto] gap-2 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Exchange</span><span>Method</span><span>Rate</span><span>Currency</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_0.9fr_auto] items-center gap-2">
              <input value={r.exchange} onChange={e => update(i, 'exchange', e.target.value.toUpperCase())} placeholder="NSE" className={inputCls} />
              <select value={r.method} onChange={e => update(i, 'method', e.target.value)} className={inputCls}>
                <option value="lot">lot</option><option value="crore">crore</option><option value="percentage">percentage</option>
              </select>
              <input value={r.rate} onChange={e => update(i, 'rate', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0" className={`${inputCls} text-right tabular-nums`} />
              <select value={r.currency} onChange={e => update(i, 'currency', e.target.value)} className={inputCls}>
                <option value="INR">INR</option><option value="USD">USD</option>
              </select>
              <button type="button" onClick={() => removeRow(i)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>Add exchange</button>
        </div>
      )}
    </Modal>
  )
}

// ---------- Client rate overrides editor ----------
function ClientRatesModal({ onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    brokerageCalcAPI.getClientRates()
      .then(r => { if (active) setRows((r?.rates || r?.data?.rates || []).map(x => ({ login: x.login ?? '', exchange: x.exchange || '', method: x.method ?? '', rate: x.rate ?? '' }))) })
      .catch(e => active && setError(e?.response?.data?.message || e.message))
    return () => { active = false }
  }, [])
  const update = (i, k, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r))
  const addRow = () => setRows(rs => [...(rs || []), { login: '', exchange: '', method: '', rate: '' }])
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i))
  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = rows.filter(r => String(r.login).trim() && r.exchange.trim()).map(r => ({
        login: num(r.login), exchange: r.exchange.trim(),
        method: r.method ? r.method : null, rate: num(r.rate) ?? 0,
      }))
      await brokerageCalcAPI.setClientRates(payload)
      onSaved?.('Client rates saved'); onClose()
    } catch (e) { setError(e?.response?.data?.message || e.message) } finally { setSaving(false) }
  }
  return (
    <Modal title="Client Rate Overrides" subtitle="Per-client rate for an exchange. Leave method empty to inherit the exchange default." onClose={onClose} wide
      footer={<>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !rows} className="rounded-lg bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save overrides'}</button>
      </>}>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
      {!rows ? <p className="py-8 text-center text-[13px] text-slate-400">Loading…</p> : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1.1fr_1.2fr_1fr_1fr_auto] gap-2 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Login</span><span>Exchange</span><span>Method</span><span>Rate</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.1fr_1.2fr_1fr_1fr_auto] items-center gap-2">
              <input value={r.login} onChange={e => update(i, 'login', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="543602" className={`${inputCls} tabular-nums`} />
              <input value={r.exchange} onChange={e => update(i, 'exchange', e.target.value.toUpperCase())} placeholder="NSE" className={inputCls} />
              <select value={r.method} onChange={e => update(i, 'method', e.target.value)} className={inputCls}>
                <option value="">inherit</option><option value="lot">lot</option><option value="crore">crore</option><option value="percentage">percentage</option>
              </select>
              <input value={r.rate} onChange={e => update(i, 'rate', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="0" className={`${inputCls} text-right tabular-nums`} />
              <button type="button" onClick={() => removeRow(i)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5h6v2M8 7l1 13h6l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            </div>
          ))}
          <button type="button" onClick={addRow} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>Add override</button>
        </div>
      )}
    </Modal>
  )
}

export default function BrokerageCalculatorPage() {
  const [sidebarOpen, setSidebarOpen] = useState(() => { try { const v = localStorage.getItem('sidebarOpen'); return v !== null ? JSON.parse(v) : true } catch { return true } })
  const [isMobile, setIsMobile] = useState(() => { try { return window.innerWidth < 1024 } catch { return false } })
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  useEffect(() => { const r = () => setIsMobile(window.innerWidth < 1024); r(); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])
  const persist = (n) => { try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch { /* ignore */ } return n }
  const toggleSidebar = () => setSidebarOpen(v => persist(!v))
  const closeSidebar = () => setSidebarOpen(() => persist(false))

  const [weeks, setWeeks] = useState([])
  const [weekId, setWeekId] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 100

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const showToast = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2400) }

  const [usdInr, setUsdInr] = useState(null)
  const [usdDraft, setUsdDraft] = useState('')
  const [editingUsd, setEditingUsd] = useState(false)
  const [savingUsd, setSavingUsd] = useState(false)
  const [exporting, setExporting] = useState('')
  const [showExchanges, setShowExchanges] = useState(false)
  const [showClientRates, setShowClientRates] = useState(false)

  // Load settlement weeks once.
  useEffect(() => {
    let active = true
    brokerAPI.getSettlementWeeks({ page: 1, limit: 100 })
      .then(res => { const list = res?.data?.weeks ?? res?.weeks ?? []; if (active) { setWeeks(list); if (list.length && weekId == null) setWeekId(list[0].id) } })
      .catch(e => active && setError(e?.response?.data?.message || e.message))
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedWeek = useMemo(() => weeks.find(w => w.id === weekId) || null, [weeks, weekId])

  // Load the USD→INR rate for the selected week.
  useEffect(() => {
    if (weekId == null) return
    let active = true
    brokerageCalcAPI.getUsdInr(weekId)
      .then(r => { if (active) setUsdInr(num(r?.rate ?? r?.data?.rate ?? r?.usd_inr)) })
      .catch(() => active && setUsdInr(null))
    return () => { active = false }
  }, [weekId])

  const load = useCallback(async () => {
    if (weekId == null) return
    setLoading(true); setError('')
    try {
      const data = await brokerageCalcAPI.calculate({ week_id: weekId, search, status, page, limit })
      setRows(extractRows(data)); setTotal(extractTotal(data)); setSummary(extractSummary(data))
    } catch (e) { setError(e?.response?.data?.message || e.message || 'Could not calculate brokerage'); setRows([]) }
    finally { setLoading(false) }
  }, [weekId, search, status, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [weekId, status])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Debounced search.
  const searchTimer = useRef(null)
  const onSearchChange = (v) => { setSearch(v); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setPage(1), 400) }

  const saveUsd = async () => {
    const r = num(usdDraft)
    if (r == null) { setEditingUsd(false); return }
    setSavingUsd(true)
    try { await brokerageCalcAPI.setUsdInr(weekId, r); setUsdInr(r); setEditingUsd(false); showToast('USD–INR rate saved'); load() }
    catch (e) { setError(e?.response?.data?.message || e.message) } finally { setSavingUsd(false) }
  }

  const doExport = async (kind) => {
    if (weekId == null) return
    setExporting(kind)
    const wk = (selectedWeek?.name || `week-${weekId}`).replace(/[^a-z0-9\-_ ]/gi, '_').trim()
    try {
      if (kind === 'xlsx') await brokerageCalcAPI.exportFile({ week_id: weekId, format: 'xlsx', view: 'logins' }, `brokerage_${wk}.xlsx`)
      else await brokerageCalcAPI.exportFile({ week_id: weekId, format: 'csv', view: 'pending' }, `brokerage_pending_${wk}.csv`)
      showToast(kind === 'xlsx' ? 'Final report downloaded' : 'Pending list downloaded')
    } catch (e) { setError(e?.response?.data?.message || e.message || 'Export failed') } finally { setExporting('') }
  }

  const [expanded, setExpanded] = useState(() => new Set())
  const toggleRow = (id) => setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  // Totals for the current page (the API returns no summary block of its own).
  const totals = useMemo(() => rows.reduce((a, r) => ({
    charged: a.charged + (num(r?.charged_inr) || 0),
    brokerage: a.brokerage + (num(r?.our_brokerage_inr) || 0),
    rebate: a.rebate + (num(r?.rebate_inr) || 0),
    pending: a.pending + (String(r?.status).toLowerCase() === 'pending' ? 1 : 0),
  }), { charged: 0, brokerage: 0, rebate: 0, pending: 0 }), [rows])

  const pages = total != null ? Math.max(1, Math.ceil(total / limit)) : (rows.length < limit ? page : page + 1)

  // ---------- toolbar controls (inside the header card) ----------
  const toolbarControls = (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {/* Week */}
        <div className="relative">
          <select value={weekId ?? ''} onChange={e => setWeekId(num(e.target.value))} className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-[13px] font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-400">
            {weeks.length === 0 && <option value="">No weeks</option>}
            {weeks.map(w => <option key={w.id} value={w.id}>{w.name || w.label || `Week ${w.id}`}</option>)}
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none"><path d="m7 9 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>

        {/* USD-INR */}
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">USD–INR</span>
          {editingUsd ? (
            <>
              <input autoFocus value={usdDraft} onChange={e => setUsdDraft(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') saveUsd(); if (e.key === 'Escape') setEditingUsd(false) }} inputMode="decimal" className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[13px] tabular-nums outline-none focus:border-blue-400" />
              <button type="button" onClick={saveUsd} disabled={savingUsd} className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{savingUsd ? '…' : 'Save'}</button>
            </>
          ) : (
            <button type="button" onClick={() => { setUsdDraft(usdInr != null ? String(usdInr) : ''); setEditingUsd(true) }} className="flex items-center gap-1 text-[13px] font-bold tabular-nums text-slate-800 hover:text-blue-700">
              {usdInr != null ? usdInr.toFixed(2) : 'set'}
              <svg className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder="Search login or name" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </div>

        {/* Status */}
        <div className="relative">
          <select value={status} onChange={e => setStatus(e.target.value)} className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-[13px] font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none"><path d="m7 9 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowExchanges(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M3 7h13M3 7l3-3M3 7l3 3M21 17H8M21 17l-3-3M21 17l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Exchange Rates</button>
          <button type="button" onClick={() => setShowClientRates(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 11l2 2 3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Client Rates</button>
          <button type="button" onClick={() => doExport('csv')} disabled={!!exporting || weekId == null} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>{exporting === 'csv' ? 'Exporting…' : 'Pending (CSV)'}</button>
          <button type="button" onClick={() => doExport('xlsx')} disabled={!!exporting || weekId == null} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>{exporting === 'xlsx' ? 'Exporting…' : 'Final Report (XLSX)'}</button>
        </div>
      </div>
  )

  // ---------- header card (fixed) — title + credit summary + the toolbar controls ----------
  const headerBar = (
    <div className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="rounded-2xl bg-white px-5 py-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isMobile && (
                <button onClick={() => setIsMobileSidebarOpen(true)} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg" aria-label="Open navigation">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="#000" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
              )}
              <h1 className="text-xl font-bold text-[#1A1A1A]">Brokerage Calculator</h1>
            </div>
            <p className="mt-0.5 text-xs text-[#6B7280]">Per-client brokerage for a settlement week, from your exchange & client rates.</p>
          </div>
          <BrokerCreditSummary variant="header" />
        </div>
        {toolbarControls}
      </div>
    </div>
  )

  const body = (
    <>
      {error && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-[13px] font-medium text-red-700">{error}</span>
          <button type="button" onClick={load} className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700">Retry</button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Logins" value={fmtNum(total ?? rows.length)} />
          <StatTile label="Pending" value={fmtNum(totals.pending)} tone="amber" />
          <StatTile label="Charged (INR)" value={`₹${fmtMoney(totals.charged)}`} />
          <StatTile label="Our Brokerage (INR)" value={`₹${fmtMoney(totals.brokerage)}`} />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-blue-600 text-left text-white">
                <th className="w-9 px-2 py-2.5" />
                <th className="px-3.5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide">Login</th>
                <th className="px-3.5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide">Name</th>
                <th className="px-3.5 py-2.5 text-center text-[11.5px] font-semibold uppercase tracking-wide">LD %</th>
                <th className="px-3.5 py-2.5 text-center text-[11.5px] font-semibold uppercase tracking-wide">Exchanges</th>
                <th className="px-3.5 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide">Charged (INR)</th>
                <th className="px-3.5 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide">Our Brokerage</th>
                <th className="px-3.5 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide">Rebate (INR)</th>
                <th className="px-3.5 py-2.5 text-center text-[11.5px] font-semibold uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t border-slate-100">{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-3.5 py-3"><div className="h-3.5 w-full max-w-[110px] animate-pulse rounded bg-slate-100" /></td>)}</tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center text-[13px] text-slate-400">No brokerage data for this week{search ? ' matching your search' : ''}.</td></tr>
              ) : (
                rows.map((r) => {
                  const open = expanded.has(r.login)
                  const exs = Array.isArray(r.exchanges) ? r.exchanges : []
                  return (
                    <Fragment key={r.login}>
                      <tr onClick={() => toggleRow(r.login)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/70">
                        <td className="px-2 py-2.5 text-center text-slate-400">
                          <svg className={`mx-auto h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-semibold text-[#1A63BC]">{r.login}</td>
                        <td className="px-3.5 py-2.5 text-slate-700">{r.name?.trim() || '—'}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-center text-slate-700">
                          {r.ld_percent != null ? `${r.ld_percent}%` : '—'}
                          {r.ld_is_custom && <span className="ml-1 rounded bg-blue-50 px-1 py-px text-[9px] font-bold uppercase text-blue-600">custom</span>}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-center text-slate-600">
                          {exs.length}
                          {num(r.pending_exchanges) > 0 && <span className="ml-1 text-[11px] font-semibold text-amber-600">· {r.pending_exchanges} pending</span>}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-slate-800">{fmtMoney(r.charged_inr)}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums">{r.our_brokerage_inr != null ? <span className="font-semibold text-slate-900">{fmtMoney(r.our_brokerage_inr)}</span> : <Missing />}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-emerald-700">{r.rebate_inr != null ? fmtMoney(r.rebate_inr) : '—'}</td>
                        <td className="px-3.5 py-2.5 text-center"><StatusBadge status={r.status} /></td>
                      </tr>
                      {open && (
                        <tr className="border-t border-slate-100 bg-slate-50/60">
                          <td colSpan={9} className="px-3 py-2.5">
                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                              <table className="w-full min-w-[720px] border-collapse text-[12px]">
                                <thead>
                                  <tr className="bg-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-500">
                                    <th className="px-3 py-2">Exchange</th>
                                    <th className="px-3 py-2 text-right">Lots</th>
                                    <th className="px-3 py-2 text-right">Turnover</th>
                                    <th className="px-3 py-2 text-right">Charged</th>
                                    <th className="px-3 py-2">Method</th>
                                    <th className="px-3 py-2 text-right">Rate</th>
                                    <th className="px-3 py-2">Source</th>
                                    <th className="px-3 py-2 text-right">Our Brokerage</th>
                                    <th className="px-3 py-2 text-center">Status</th>
                                    <th className="px-3 py-2">Issues</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {exs.map((e, i) => (
                                    <tr key={i} className="border-t border-slate-100">
                                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{e.exchange}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{fmtNum(e.lots)}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{fmtNum(e.turnover)}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">{money(e.charged, e.charged_currency)}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{e.method || <Missing />}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-600">{e.rate != null ? money(e.rate, e.rate_currency) : <Missing />}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-slate-400">{e.rate_source && e.rate_source !== 'none' ? e.rate_source : '—'}</td>
                                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{e.our_brokerage_inr != null ? <span className="font-semibold text-slate-900">{fmtMoney(e.our_brokerage_inr)}</span> : <Missing />}</td>
                                      <td className="px-3 py-2 text-center"><StatusBadge status={e.status} /></td>
                                      <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1">
                                          {(e.issues || []).map((is, k) => <span key={k} className="rounded bg-amber-50 px-1.5 py-px text-[9.5px] font-semibold text-amber-700" title={is}>{ISSUE_LABEL[is] || is.replace(/_/g, ' ')}</span>)}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
          <span className="text-[12px] text-slate-500">{total != null ? `${total.toLocaleString('en-IN')} rows` : `${rows.length} rows`}{total != null && ` · page ${page} of ${pages}`}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:enabled:bg-slate-50"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            <span className="min-w-[2rem] text-center text-[12.5px] font-semibold text-slate-700">{page}</span>
            <button type="button" disabled={loading || (total != null ? page >= pages : rows.length < limit)} onClick={() => setPage(p => p + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40 hover:enabled:bg-slate-50"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {isMobile ? (
        <Sidebar isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} onToggle={() => setIsMobileSidebarOpen(v => !v)} mobileOnly />
      ) : (
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} onToggle={toggleSidebar} />
      )}

      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden ${isMobile ? '' : `transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}`}>
        {headerBar}
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-6 sm:pt-5" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(28px + var(--app-safe-bottom, 0px))' }}>
          {body}
        </main>
      </div>

      {showExchanges && <ExchangeRatesModal onClose={() => setShowExchanges(false)} onSaved={(m) => { showToast(m); load() }} />}
      {showClientRates && <ClientRatesModal onClose={() => setShowClientRates(false)} onSaved={(m) => { showToast(m); load() }} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[110] flex justify-center">
          <div className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  )
}
