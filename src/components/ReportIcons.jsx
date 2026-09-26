// Icons for the Reports menu and its sub modules (desktop sidebar + mobile menus).
// Stroke uses currentColor so they follow the text colour of the menu item.

const Svg = ({ className = 'w-5 h-5', children }) => (
  <svg className={`${className} flex-shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

// Reports: clipboard with a bar chart (distinct from the Bills document icon)
export const ReportsIcon = ({ className }) => (
  <Svg className={className}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="M9 17v-3M12 17v-6M15 17v-4" />
  </Svg>
)

// Brokerage Data: stacked coins
const BrokerageIcon = ({ className }) => (
  <Svg className={className}>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
    <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
  </Svg>
)

// Historical Positions: clock with a back arrow
const HistoryIcon = ({ className }) => (
  <Svg className={className}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </Svg>
)

// Deals: two opposite arrows (buy / sell)
const DealsIcon = ({ className }) => (
  <Svg className={className}>
    <path d="M7 4 3 8l4 4" />
    <path d="M3 8h13" />
    <path d="m17 12 4 4-4 4" />
    <path d="M21 16H8" />
  </Svg>
)

const SUB_ICONS = {
  '/reports/exchange': BrokerageIcon,
  '/reports/historical-positions': HistoryIcon,
  '/reports/deals': DealsIcon
}

export const ReportSubIcon = ({ path, className = 'w-4 h-4' }) => {
  const Icon = SUB_ICONS[path]
  return Icon ? <Icon className={className} /> : null
}
