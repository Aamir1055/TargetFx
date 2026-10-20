import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js'
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const COLORS = ['#2563eb', '#f59e0b', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5']

// A chart re-rendered from its underlying data (store.chart_spec), not the rendered PNG —
// the file behind a *live* chart event expires after about an hour, so a reopened past
// conversation only has the labels/series it was drawn from, meant to be redrawn client-side.
const AiHistoricalChart = ({ spec }) => {
  if (!spec?.labels?.length || !spec?.series?.length) return null
  const { chart_type: type, title, labels, series, unit, subtitle } = spec
  const isPie = type === 'pie' || type === 'doughnut'
  const data = isPie
    ? { labels, datasets: [{ data: series[0].values, backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]), borderWidth: 0 }] }
    : { labels, datasets: series.map((s, i) => ({ label: s.name, data: s.values, backgroundColor: COLORS[i % COLORS.length], borderColor: COLORS[i % COLORS.length], fill: type === 'area', tension: 0.3 })) }
  const options = {
    responsive: true, maintainAspectRatio: false, indexAxis: type === 'horizontal_bar' ? 'y' : 'x',
    plugins: { legend: { display: series.length > 1 || isPie, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
    scales: isPie ? undefined : { x: { stacked: type === 'stacked_bar', ticks: { font: { size: 10 } }, grid: { display: false } }, y: { stacked: type === 'stacked_bar', ticks: { font: { size: 10 } }, grid: { color: '#f1f5f9' } } }
  }
  const Comp = isPie ? (type === 'pie' ? Pie : Doughnut) : (type === 'line' || type === 'area' ? Line : Bar)

  return (
    <div className="max-w-[560px] rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-700">{title}{unit ? ` (${unit})` : ''}</p>
      {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      <div className="mt-2 h-56"><Comp data={data} options={options} /></div>
    </div>
  )
}

export default AiHistoricalChart
