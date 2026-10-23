import { useLocation, useNavigate } from 'react-router-dom'
import { AskAiIcon } from './ReportIcons'

// Global floating "Ask AI" button. Sits bottom-right on every authenticated page
// except the Ask AI page itself. Clicking it always opens a FRESH chat session
// (state.newChat), matching the sidebar's "Ask AI" behaviour. Compact pill on both
// mobile and desktop. z-40 keeps it above page content but below modals (z-50+).
export default function AskAiFab() {
  const location = useLocation()
  const navigate = useNavigate()
  if (location.pathname.startsWith('/ai')) return null

  return (
    <button
      type="button"
      onClick={() => navigate('/ai', { state: { newChat: Date.now() } })}
      aria-label="Ask AI"
      title="Ask BrokerEye AI"
      className="ask-ai-fab group fixed bottom-6 right-0 z-40 flex items-center gap-1.5 rounded-full border-2 border-slate-200/70 bg-white py-1 pl-1 pr-3.5 shadow-[-6px_8px_22px_-8px_rgba(37,99,235,0.45)] backdrop-blur transition-all duration-200 hover:border-blue-500 active:translate-y-0 md:bottom-6 md:right-5 md:shadow-[0_8px_24px_-6px_rgba(37,99,235,0.40)]"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 p-[2px] transition-colors duration-200 group-hover:bg-none group-hover:bg-white">
        <span className="ask-ai-fab-halo pointer-events-none absolute inset-0 rounded-full group-hover:animate-none group-hover:shadow-none" aria-hidden="true" />
        <span className="flex h-full w-full items-center justify-center rounded-full bg-white">
          <AskAiIcon className="h-[23px] w-[23px]" />
        </span>
      </span>
      <span className="text-[13px] font-bold tracking-tight text-slate-900">Ask AI</span>
    </button>
  )
}
