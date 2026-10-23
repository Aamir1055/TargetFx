// Icons for the Reports menu and its sub modules (desktop sidebar + mobile menus).
// Stroke uses currentColor so they follow the text colour of the menu item.

// `?inline` forces Vite to embed the logo as a base64 data URI inside the JS bundle, so it
// always loads with the app (no separate /assets request that could 404 on a partial deploy
// or load slowly on mobile). The PNG is small (~8 KB) so the bundle cost is negligible.
import askAiIcon from '../assets/brokereye-ai-icon.png?inline'

const Svg = ({ className = 'w-5 h-5', children }) => (
  <svg className={`${className} flex-shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const AskAiIcon = ({ className = 'w-5 h-5' }) => (
  <img src={askAiIcon} alt="" aria-hidden="true" className={`${className} flex-shrink-0 object-contain`} />
)

// Tutorials: a video frame with a play triangle. Inline (currentColor) so it ships in the
// JS bundle and follows the menu item's text colour — no external /sidebar-icons file to deploy.
export const TutorialIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={`${className} flex-shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
    <path d="M10 9.2v5.6l5-2.8-5-2.8z" fill="currentColor" stroke="none" />
  </svg>
)

// Brokerage Calculator: a calculator. Inline (currentColor), like the Tutorials icon.
export const BrokerageCalcIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={`${className} flex-shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 7h8" />
    <path d="M8 11h.01M12 11h.01M16 11h.01M8 14.5h.01M12 14.5h.01M16 14.5h.01M8 18h.01M12 18h.01M16 18h.01" />
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

const CreditIcon = ({ className }) => (
  <Svg className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M7 15h3m6-2v4m-2-2h4" />
  </Svg>
)

// Deposit and withdrawal: cash tray with incoming and outgoing funds.
const DepositWithdrawalIcon = ({ className }) => (
  <Svg className={className}>
    <path d="M3 14v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
    <path d="M3 14h5l2 3h4l2-3h5" />
    <path d="M8 3v9m-3-3 3 3 3-3M16 12V3m-3 3 3-3 3 3" />
  </Svg>
)

const AgentDetailsIcon = ({ className }) => (
  <Svg className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2.5" />
    <path d="M5.5 17v-1a3.5 3.5 0 0 1 7 0v1M15 8h3M15 12h3M15 16h3" />
  </Svg>
)

// Summary: a framed overview chart with a total/underline — reads as "aggregated totals",
// distinct from the Reports parent icon (plain clipboard) and the other sub-icons.
const SummaryIcon = ({ className }) => (
  <Svg className={className}>
    <rect x="4" y="3.5" width="16" height="16" rx="3" />
    <path d="M8 13.5v-3M12 13.5V8M16 13.5v-5.2" />
    <path d="M7.5 17h9" />
  </Svg>
)

// Settlement: a statement page with a check mark — "settled / reconciled for the week".
const SettlementIcon = ({ className }) => (
  <Svg className={className}>
    <path d="M6 3h8.5L19 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5" />
    <path d="m8.5 14.5 2.2 2.2 4.3-4.4" />
  </Svg>
)

const SUB_ICONS = {
  '/reports/settlement': SettlementIcon,
  '/reports/exchange': BrokerageIcon,
  '/reports/historical-positions': HistoryIcon,
  '/reports/deals': DealsIcon,
  '/reports/credit': CreditIcon,
  '/reports/agent-details': AgentDetailsIcon,
  '/reports/deposit-withdrawal': DepositWithdrawalIcon,
  '/reports/summary': SummaryIcon
}

export const ReportSubIcon = ({ path, className = 'w-4 h-4' }) => {
  const Icon = SUB_ICONS[path]
  return Icon ? <Icon className={className} /> : null
}
