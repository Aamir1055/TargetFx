import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler } from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler)

const C_BLUE = '#3451b2', C_BLUE2 = '#7b93f0', C_GREEN = '#1f7a4d', C_GREEN2 = '#0f766e', C_RED = '#b42318', C_GRID = '#e6e9ef'
const INDIAN = new Set(['INR', 'RS', 'RS.', '₹', 'RUPEE', 'RUPEES'])

// Matches the reference app's fmtK() exactly: Cr/L for Indian currencies, M for everything
// else above a million, K above a thousand — otherwise plain 2-decimal figures.
const fmtK = (v, unit) => {
  const num = Number(v)
  if (v == null || Number.isNaN(num)) return '–'
  const a = Math.abs(num)
  const sign = num < 0 ? '−' : ''
  const indian = INDIAN.has((unit || '').toUpperCase())
  if (indian && a >= 1e7) return `${sign}${(a / 1e7).toFixed(2)} Cr`
  if (indian && a >= 1e5) return `${sign}${(a / 1e5).toFixed(2)} L`
  if (!indian && a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)} M`
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(2)} K`
  return `${sign}${a.toFixed(2)}`
}

// Tailwind's JIT scanner needs literal class strings, not an interpolated `col-span-${n}`.
const SPAN_CLASS = { 5: 'col-span-12 md:col-span-5', 6: 'col-span-12 md:col-span-6', 7: 'col-span-12 md:col-span-7', 12: 'col-span-12' }
const Card = ({ title, sub, span, children }) => (
  <div className={`${SPAN_CLASS[span]} rounded-lg border border-slate-200 bg-white p-3`}>
    <h4 className="mb-2 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      {title}{sub && <span className="font-normal normal-case text-slate-400">{sub}</span>}
    </h4>
    {children}
  </div>
)

const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart) {
    const center = chart.options.plugins?.centerText
    if (!center) return
    const { ctx, chartArea: { left, right, top, bottom } } = chart
    const x = (left + right) / 2, y = (top + bottom) / 2
    ctx.save()
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillStyle = '#171b26'; ctx.font = '600 13px "IBM Plex Sans", system-ui, sans-serif'
    ctx.fillText(center.value, x, y - 6)
    ctx.fillStyle = '#737b8c'; ctx.font = '500 10px "IBM Plex Sans", system-ui, sans-serif'
    ctx.fillText(center.label, x, y + 10)
    ctx.restore()
  }
}

// A donut with a two-line value/label drawn in its hole, matching the reference's donutChart().
const StatDonut = ({ labels, values, colors, centerValue, centerLabel, unit }) => (
  <div className="relative h-28 w-28 shrink-0">
    <Doughnut
      plugins={[centerTextPlugin]}
      data={{ labels, datasets: [{ data: values.map(v => Math.abs(v || 0)), backgroundColor: colors, borderColor: '#fff', borderWidth: 2, hoverOffset: 2 }] }}
      options={{
        cutout: '70%', responsive: true, maintainAspectRatio: false, animation: false,
        centerText: { value: centerValue, label: centerLabel },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtK(values[c.dataIndex] || 0, unit)}` } }, centerText: { value: centerValue, label: centerLabel } },
      }}
    />
  </div>
)

const LegendRow = ({ color, name, value, pct, withBar }) => (
  <div className="flex items-center gap-2 py-0.5 text-xs">
    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />
    <span className="min-w-[80px] flex-1 truncate text-slate-600">{name}</span>
    {withBar && <span className="h-1 min-w-[50px] flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></span>}
    <b className="whitespace-nowrap font-semibold text-slate-800">{value}</b>
    {pct != null && <small className="whitespace-nowrap text-slate-400">{pct.toFixed(1)}%</small>}
  </div>
)

const Tile = ({ label, value, up }) => (
  <div className="rounded-md border border-slate-100 px-2.5 py-2">
    <small className="block text-xs text-slate-500">{label}</small>
    <b className={`mt-0.5 block text-[15px] font-semibold tabular-nums ${up ? 'text-emerald-700' : 'text-red-700'}`}>{value}</b>
  </div>
)

// The client overview dashboard, sent as a `dashboard` SSE event: `{ data }`. Mirrors the
// reference Ask AI app's dashboardNode() card-for-card — same cards, same donuts, same gauge.
const AiDashboard = ({ data }) => {
  if (!data) return null
  const u = data.currency || ''
  const acc = data.account || {}
  const st = data.stats || {}
  const n = (v) => (v == null ? null : Number(v))
  const trend = Array.isArray(data.trend) ? data.trend : []

  const allocParts = [
    ['Credit', n(acc.credit) || 0, C_BLUE2],
    ['Balance', n(acc.balance) || 0, C_GREEN],
    ['Floating P/L', n(acc.floatingProfit) || 0, C_BLUE],
  ]
  const allocBase = allocParts.reduce((t, p) => t + Math.abs(p[1]), 0) || 1

  const bv = n(st.buyVolume) || 0, sv = n(st.sellVolume) || 0, tv = bv + sv || 1
  const used = n(acc.margin) || 0, free = n(acc.marginFree) || 0, tm = used + free || 1
  const pc = n(st.profitableDealCount) || 0, lc = n(st.losingDealCount) || 0
  const td = n(st.tradingDeals) || (pc + lc) || 1
  const win = (pc / td) * 100, loss = (lc / td) * 100

  const ps = n(st.profitableDealsSum) || 0, ls = -Math.abs(n(st.losingDealsSum) || 0), net = ps + ls
  const gaugeTotal = ps + Math.abs(ls) || 1

  const trendData = { labels: trend.map(t => (t.date || '').slice(5)), datasets: [{ data: trend.map(t => n(t.pnl) || 0), borderColor: C_BLUE, backgroundColor: 'rgba(52,81,178,.10)', fill: true, tension: 0.2, pointRadius: 2.5, pointBackgroundColor: C_BLUE, borderWidth: 1.5 }] }
  const trendOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` P&L: ${fmtK(c.parsed.y, u)}` } } },
    scales: {
      x: { ticks: { color: '#737b8c', font: { size: 10 }, maxTicksLimit: 4 }, grid: { display: false } },
      y: { ticks: { color: '#737b8c', font: { size: 10 }, maxTicksLimit: 4, callback: v => fmtK(v, u) }, grid: { color: C_GRID } },
    },
  }
  const gaugeOpts = { rotation: -90, circumference: 180, cutout: '76%', responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
  const gaugeData = { datasets: [{ data: [(ps / gaugeTotal) * 100, (Math.abs(ls) / gaugeTotal) * 100], backgroundColor: [C_BLUE, '#eef1f8'], borderWidth: 0 }] }

  return (
    <div className="max-w-[820px] overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <b className="text-[15px] font-semibold text-slate-900">{data.login} · {data.name || 'Client'}</b>
        {data.lastTradingDate && <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Last trade {data.lastTradingDate}</span>}
        <span className="ml-auto text-xs text-slate-500">{data.positionCount ?? 0} positions · {data.orderCount ?? 0} orders</span>
      </div>

      <div className="grid grid-cols-12 gap-2 bg-slate-50 p-2">
        <Card title="Account" span={5}>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
            <div><small className="block text-xs text-slate-500">Name</small><b className="block text-sm font-semibold text-slate-900">{data.name || '–'}</b></div>
            <div><small className="block text-xs text-slate-500">Account</small><b className="block text-sm font-semibold text-slate-900">{data.login}</b></div>
            <div><small className="block text-xs text-slate-500">Currency</small><b className="block text-sm font-semibold text-slate-900">{u || '–'}</b></div>
            <div><small className="block text-xs text-slate-500">Equity</small><b className="block text-sm font-semibold text-slate-900">{fmtK(n(acc.equity), u)}</b></div>
            <div><small className="block text-xs text-slate-500">Margin level</small><b className={`block text-sm font-semibold ${acc.marginLevel != null && Number(acc.marginLevel) < 120 ? 'text-red-700' : 'text-slate-900'}`}>{acc.marginLevel != null ? `${Number(acc.marginLevel).toFixed(2)}%` : '–'}</b></div>
            <div><small className="block text-xs text-slate-500">Total commission</small><b className="block text-sm font-semibold text-slate-900">{fmtK(n(st.totalCommission), u)}</b></div>
          </div>
        </Card>

        <Card title="Account allocation" span={7}>
          <div className="flex items-center gap-4">
            <StatDonut labels={allocParts.map(p => p[0])} values={allocParts.map(p => p[1])} colors={allocParts.map(p => p[2])} centerValue={fmtK(n(acc.equity), u)} centerLabel="Equity" unit={u} />
            <div className="min-w-0 flex-1">
              {allocParts.map(([name, v, c]) => <LegendRow key={name} color={c} name={name} value={fmtK(v, u)} pct={(Math.abs(v) / allocBase) * 100} withBar />)}
            </div>
          </div>
        </Card>

        <Card title="Profit trend" sub={data.trendFrom && data.trendTo ? `${data.trendFrom} to ${data.trendTo}` : ''} span={6}>
          {trend.length ? <div className="h-[150px]"><Line data={trendData} options={trendOpts} /></div> : <p className="text-xs text-slate-400">No daily snapshots in this window yet.</p>}
        </Card>

        <Card title="Volume" span={6}>
          <div className="flex items-center gap-4">
            <StatDonut labels={['Buy', 'Sell']} values={[bv, sv]} colors={[C_BLUE, C_RED]} centerValue={fmtK(bv + sv, '')} centerLabel="Lots" unit="lots" />
            <div className="min-w-0 flex-1">
              <LegendRow color={C_BLUE} name="Buy volume" value={bv.toFixed(2)} pct={(bv / tv) * 100} />
              <LegendRow color={C_RED} name="Sell volume" value={sv.toFixed(2)} pct={(sv / tv) * 100} />
            </div>
          </div>
        </Card>

        <Card title="Margin usage" span={6}>
          <div className="flex items-center gap-4">
            <StatDonut labels={['Used', 'Free']} values={[used, free]} colors={[C_GREEN2, C_GREEN]} centerValue={fmtK(used + free, u)} centerLabel="Total margin" unit={u} />
            <div className="min-w-0 flex-1">
              <LegendRow color={C_GREEN2} name="Used margin" value={fmtK(used, u)} pct={(used / tm) * 100} />
              <LegendRow color={C_GREEN} name="Free margin" value={fmtK(free, u)} pct={(free / tm) * 100} />
            </div>
          </div>
        </Card>

        <Card title="Deals" span={6}>
          <div className="flex items-center gap-4">
            <StatDonut labels={['Profitable', 'Losing']} values={[pc, lc]} colors={[C_GREEN, C_RED]} centerValue={String(n(st.totalDeals) ?? td)} centerLabel="Deals" unit="" />
            <div className="min-w-0 flex-1">
              <LegendRow color={C_GREEN} name="Profitable" value={String(pc)} pct={win} />
              <LegendRow color={C_RED} name="Losing" value={String(lc)} pct={loss} />
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-slate-100 px-2.5 py-2 text-center"><small className="block text-xs text-slate-500">Win rate</small><b className="block text-[15px] font-semibold text-emerald-700">{win.toFixed(1)}%</b></div>
            <div className="rounded-md border border-slate-100 px-2.5 py-2 text-center"><small className="block text-xs text-slate-500">Loss rate</small><b className="block text-[15px] font-semibold text-red-700">{loss.toFixed(1)}%</b></div>
          </div>
        </Card>

        <Card title="Performance" span={12}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Avg profit / deal" value={fmtK(n(st.averageProfitPerDeal), u)} up />
            <Tile label="Avg loss / deal" value={fmtK(-Math.abs(n(st.averageLossPerDeal) || 0), u)} up={false} />
            <Tile label="Max profit" value={fmtK(n(st.maxProfit), u)} up />
            <Tile label="Max loss" value={fmtK(-Math.abs(n(st.maxLoss) || 0), u)} up={false} />
          </div>
        </Card>

        <Card title="Profitability" span={12}>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            <div className="text-center">
              <small className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Profit sum</small>
              <b className="mt-1 block text-base font-semibold text-emerald-700">{fmtK(ps, u)}</b>
            </div>
            <div className="relative h-24 w-44">
              <Doughnut data={gaugeData} options={gaugeOpts} />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 text-center">
                <b className={`block text-sm font-semibold ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtK(net, u)}</b>
                <small className="block text-[10px] text-slate-400">Net P/L</small>
              </div>
            </div>
            <div className="text-center">
              <small className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Losing sum</small>
              <b className="mt-1 block text-base font-semibold text-red-700">{fmtK(ls, u)}</b>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default AiDashboard
