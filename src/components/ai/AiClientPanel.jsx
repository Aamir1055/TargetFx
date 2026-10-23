import { useEffect, useState } from 'react'
import { aiAPI } from '../../services/api'

// ---- formatting helpers ----
const SYM = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', JPY: '¥' }
const sym = (cur) => SYM[String(cur || '').toUpperCase()] || (cur ? `${cur} ` : '')
const fmt2 = (n) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' }
const fmtNum = (n) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString('en-IN') : '—' }
const money = (n, cur) => { const v = Number(n); return Number.isFinite(v) ? `${sym(cur)}${fmt2(v)}` : '—' }
const signed = (n, cur) => { const v = Number(n); if (!Number.isFinite(v)) return '—'; return `${v < 0 ? '−' : '+'}${sym(cur)}${fmt2(Math.abs(v))}` }
const tone = (v) => Number(v) > 0 ? 'text-emerald-600' : Number(v) < 0 ? 'text-red-600' : 'text-slate-800'

const Section = ({ children, tint }) => (
  <div className={`border-b border-slate-100 px-4 py-3.5 ${tint ? 'bg-slate-50/50' : ''}`}>{children}</div>
)
const Label = ({ children, right }) => (
  <div className="mb-2 flex items-center justify-between gap-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</p>{right}</div>
)
const KV = ({ k, v, cls = '' }) => (
  <div className="flex items-center justify-between gap-3 py-0.5 text-[13px]"><span className="min-w-0 text-slate-500">{k}</span><span className={`shrink-0 tabular-nums font-semibold text-slate-800 ${cls}`}>{v}</span></div>
)

// A rule / status chip.
const Tag = ({ children, variant }) => {
  const styles = {
    default: 'bg-slate-100 text-slate-600',
    good: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-700',
    bad: 'bg-red-50 text-red-600',
  }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${styles[variant] || styles.default}`}>{children}</span>
}

// Quick-look + actions panel for a login mentioned in chat. Mirrors the reference app's
// /ai/clients/{login}/panel: account snapshot, rules, positions, credit, last 7 days, and
// the account actions the broker's rights allow (each one drives a chat command).
const AiClientPanel = ({ login, onClose, onAsk, onPrefill }) => {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!login) return undefined
    let active = true
    setData(null); setError('')
    aiAPI.getClientPanel(login).then(r => active && setData(r)).catch(e => active && setError(e.message))
    return () => { active = false }
  }, [login])

  if (!login) return null
  const c = data?.client || {}
  const cur = c.currency || ''
  const rights = data?.rights || {}
  const st = data?.status || {}
  const ask = (t) => onAsk?.(t)
  const prefill = (t) => (onPrefill || onAsk)?.(t)

  const ml = Number(c.marginLevel)
  const mlTone = Number.isFinite(ml) && ml > 0 ? (ml < 120 ? 'text-red-600' : ml < 150 ? 'text-amber-600' : 'text-slate-900') : 'text-slate-900'

  // Rule / status chips
  const ruleNames = data?.active_rules?.length ? data.active_rules.map(r => r.name + (r.time_parameter ? ` ${r.time_parameter}` : '')) : (data?.rules || [])
  const onAccount = new Set((data?.active_rules || []).map(r => r.code))

  // Action buttons, gated by rights (a missing right disables the button).
  const actions = []
  const add = (label, right, run, opts = {}) => actions.push({ label, right, run, ...opts })
  if (data) {
    add('Credit in', 'credit_in', () => prefill(`Give  credit to ${login}`))
    add('Credit out', 'credit_out', () => prefill(`Credit out  from ${login}`))
    for (const d of data.rule_defs || []) {
      if (onAccount.has(d.code)) add(`Remove ${d.name}`, 'manage_rules', () => ask(`Remove the rule ${d.name} from ${login}`))
      else if (d.needs_minutes) add(`${d.name}…`, 'manage_rules', () => prefill(`Put ${d.name} of  minutes on ${login}`))
      else add(d.name, 'manage_rules', () => ask(`Put ${d.name} on ${login}`))
    }
    for (const r of data.active_rules || []) if (!(data.rule_defs || []).some(d => d.code === r.code)) add(`Remove ${r.name}`, 'manage_rules', () => ask(`Remove the rule ${r.name} from ${login}`))
    const tradingOn = st.trading_enabled !== false, loginOn = st.account_enabled !== false
    add(tradingOn ? 'Disable trading' : 'Enable trading', tradingOn ? 'mt5.trading_disable' : 'mt5.trading_enable', () => ask(`${tradingOn ? 'Disable' : 'Enable'} trading for ${login}`))
    add(loginOn ? 'Disable account' : 'Enable account', loginOn ? 'mt5.account_disable' : 'mt5.account_enable', () => ask(`${loginOn ? 'Disable' : 'Enable'} the account ${login}`))
    add('Reset password', 'mt5.trading_password_change', () => ask(`Reset the trading password of ${login}`))
    add('Investor password', 'mt5.investor_password_change', () => ask(`Reset the investor password of ${login}`))
    add('Watch this account', '', () => prefill(`Alert me when ${login}'s margin level drops below 120%`), { wide: true })
  }

  const subtitle = [c.group, cur, c.liquidateType ? `${c.liquidateType} type` : ''].filter(Boolean).join(' · ')

  return (
    <aside className="absolute inset-0 z-40 flex h-full min-w-0 flex-col overflow-hidden bg-white md:relative md:inset-auto md:z-auto md:w-[350px] md:shrink-0 md:border-l md:border-slate-200">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-sm">
          {(c.name || String(login)).trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-bold text-slate-900">{login}{c.name ? ` · ${c.name}` : ''}</b>
          {subtitle && <div className="truncate text-[11px] text-slate-400">{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close panel"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white">
        {error && <p className="m-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {!data && !error && (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
          </div>
        )}
        {data && (
          <>
            {/* Headline metrics */}
            <Section>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Equity</p><p className={`mt-0.5 text-[17px] font-bold tabular-nums ${tone(c.equity)}`}>{money(c.equity, cur)}</p></div>
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Margin level</p><p className={`mt-0.5 text-[17px] font-bold tabular-nums ${mlTone}`}>{Number.isFinite(ml) && ml > 0 ? `${ml.toFixed(1)}%` : '—'}</p></div>
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Balance · Credit</p><p className="mt-0.5 text-[13px] font-semibold tabular-nums"><span className={tone(c.balance)}>{money(c.balance, cur)}</span><span className="text-slate-400"> · </span><span className={tone(c.credit)}>{money(c.credit, cur)}</span></p></div>
                <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Floating</p><p className={`mt-0.5 text-[13px] font-semibold tabular-nums ${tone(c.floating ?? c.profit)}`}>{signed(c.floating ?? c.profit, cur)}</p></div>
              </div>
            </Section>

            {/* Rules + status */}
            <Section>
              <Label right={<button type="button" onClick={() => prefill(`Put ${login} on `)} disabled={!rights.manage_rules} title={rights.manage_rules ? '' : 'Needs the manage_rules right'} className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">Add rule</button>}>Rules</Label>
              <div className="flex flex-wrap gap-1.5">
                {ruleNames.length ? ruleNames.map((r, i) => <Tag key={i} variant="warn">{r}</Tag>) : <span className="text-[12px] text-slate-400">No rule applied.</span>}
              </div>
              {(st.account_enabled != null || st.trading_enabled != null || st.readonly) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {st.account_enabled != null && <Tag variant={st.account_enabled ? 'good' : 'bad'}>{st.account_enabled ? 'Login enabled' : 'Login disabled'}</Tag>}
                  {st.trading_enabled != null && <Tag variant={st.trading_enabled ? 'good' : 'bad'}>{st.trading_enabled ? 'Trading enabled' : 'Trading disabled'}</Tag>}
                  {st.readonly && <Tag>Read only</Tag>}
                </div>
              )}
            </Section>

            {/* Open positions */}
            <Section tint>
              <Label>Open positions · {data.positions_total ?? (data.positions || []).length}</Label>
              {(data.positions || []).length === 0 ? <span className="text-[12px] text-slate-400">None</span> : (
                <div className="flex flex-col gap-1">
                  {data.positions.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 truncate text-slate-600">{p.symbol} · <span className={p.action === 'BUY' ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>{p.action}</span> {fmtNum(p.volume)}</span>
                      <span className={`shrink-0 tabular-nums font-semibold ${Number(p.profit) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{signed(p.profit, cur)}</span>
                    </div>
                  ))}
                  {data.positions.length > 8 && <span className="text-[11px] text-slate-400">{data.positions.length - 8} more</span>}
                </div>
              )}
            </Section>

            {/* Credit */}
            <Section>
              <Label>Credit</Label>
              {(data.temp_credits || []).map(t => (
                <KV key={t.id} k={`Temp credit ${t.direction} ${money(t.amount, cur)}`} v={<span className="text-slate-400">{t.expires_at_text ? `reverses ${t.expires_at_text}` : ''}</span>} />
              ))}
              <KV k="Headroom" v={data.credit?.headroom != null ? `${money(data.credit.headroom, cur)} of ${money(data.credit.max_per_account, cur)}` : 'unlimited'} />
              <KV k="Broker available" v={data.credit?.broker_available != null ? money(data.credit.broker_available, cur) : 'unlimited'} />
            </Section>

            {/* Last 7 days */}
            {data.last7 && (
              <Section tint>
                <Label>Last 7 days</Label>
                <KV k="Deposits" v={money(data.last7.deposit, cur)} />
                <KV k="Withdrawals" v={money(data.last7.withdrawal, cur)} />
                <KV k="Realised P/L" v={signed(data.last7.profit, cur)} cls={tone(data.last7.profit)} />
                <KV k="Volume (lots)" v={fmtNum(data.last7.volume)} />
              </Section>
            )}

            {data.errors?.length > 0 && <p className="px-4 py-3 text-xs text-amber-600">Some sections could not load: {data.errors.join('; ')}</p>}

            {/* Actions */}
            {actions.length > 0 && (
              <div className="grid grid-cols-2 gap-2 p-4">
                {actions.map((a, i) => {
                  const allowed = !a.right || rights[a.right]
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!allowed}
                      title={allowed ? '' : `Needs the ${a.right} right`}
                      onClick={allowed ? a.run : undefined}
                      className={`${a.wide ? 'col-span-2' : ''} rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300`}
                    >
                      {a.label}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

export default AiClientPanel
