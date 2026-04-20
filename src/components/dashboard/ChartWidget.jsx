import { memo, useMemo } from 'react'

const ChartWidget = memo(({ 
  title, 
  type = 'line', // 'line' | 'bar' | 'donut'
  data = [],
  height = 200,
  loading = false,
  color = 'blue'
}) => {
  // Simple SVG-based visualization for lightweight performance
  const chartContent = useMemo(() => {
    if (loading || !data || data.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          {loading ? 'Loading...' : 'No data available'}
        </div>
      )
    }

    if (type === 'line') {
      const max = Math.max(...data.map(d => d.value))
      const min = Math.min(...data.map(d => d.value))
      const range = max - min || 1
      
      const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100
        const y = 100 - ((d.value - min) / range) * 80
        return `${x},${y}`
      }).join(' ')

      return (
        <svg width="100%" height={height} className="text-blue-500">
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100
            const y = 100 - ((d.value - min) / range) * 80
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r="3"
                fill="currentColor"
                className="hover:r-5 transition-all"
              />
            )
          })}
        </svg>
      )
    }

    if (type === 'bar') {
      const max = Math.max(...data.map(d => d.value))
      const barWidth = 100 / data.length - 2

      return (
        <svg width="100%" height={height}>
          {data.map((d, i) => {
            const barHeight = (d.value / max) * 80
            const x = (i / data.length) * 100 + 1
            const y = 100 - barHeight

            return (
              <g key={i}>
                <rect
                  x={`${x}%`}
                  y={`${y}%`}
                  width={`${barWidth}%`}
                  height={`${barHeight}%`}
                  className={`fill-current text-${color}-500 hover:text-${color}-600 transition-colors`}
                  rx="2"
                />
                <text
                  x={`${x + barWidth / 2}%`}
                  y="95%"
                  fontSize="10"
                  textAnchor="middle"
                  className="fill-gray-500"
                >
                  {d.label}
                </text>
              </g>
            )
          })}
        </svg>
      )
    }

    return null
  }, [data, type, height, loading, color])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 hover:shadow-md transition-shadow">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <div style={{ height }}>
        {chartContent}
      </div>
    </div>
  )
})

ChartWidget.displayName = 'ChartWidget'

export default ChartWidget
