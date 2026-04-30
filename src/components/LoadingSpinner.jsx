/**
 * Unified loading dialog used across all modules.
 *
 * Props:
 *  - message?: string  Title shown above the progress bar (default: "Loading...")
 *  - subtitle?: string Optional helper text below the bar
 *  - overlay?: boolean If false, renders inline (no fixed backdrop). Default true.
 *  - progress?: number 0-100. If omitted, an indeterminate animated bar is shown.
 */
const LoadingSpinner = ({
  message = 'Loading...',
  subtitle = 'Please wait while we fetch your data',
  overlay = true,
  progress = null,
}) => {
  const isDeterminate = typeof progress === 'number'
  const pct = isDeterminate ? Math.max(0, Math.min(100, progress)) : null

  const dialog = (
    <div className="bg-white rounded-2xl shadow-2xl border border-blue-100 px-6 py-5 w-[320px] max-w-[90vw]">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md flex-shrink-0">
          <svg className="w-5 h-5 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{message}</p>
          {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
        {isDeterminate ? (
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-blue-400 via-blue-600 to-blue-400 rounded-full loading-bar-indeterminate" />
        )}
      </div>
      {isDeterminate && (
        <div className="mt-2 text-right text-[10px] font-medium text-slate-500">{pct}%</div>
      )}
    </div>
  )

  if (!overlay) {
    return (
      <div className="w-full flex items-center justify-center py-10">
        {dialog}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 backdrop-blur-[2px]">
      {dialog}
    </div>
  )
}

export default LoadingSpinner
