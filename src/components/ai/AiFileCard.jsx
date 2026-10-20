import { AI_BASE_URL } from '../../services/api'

const formatBytes = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num < 1024) return `${num} B`
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`
  return `${(num / (1024 * 1024)).toFixed(1)} MB`
}

// A downloadable file the assistant generated (export_table / export_report), sent as a
// `file` SSE event: { filename, format, rows, bytes, url }.
const AiFileCard = ({ filename, format, rows, bytes, url }) => (
  <a
    href={`${AI_BASE_URL}${url}`}
    download={filename}
    className="flex max-w-[480px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-800 no-underline transition hover:border-slate-300"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-[10px] font-semibold uppercase text-slate-500">
      {(format || filename?.split('.').pop() || '?').slice(0, 3)}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold">{filename}</span>
      <span className="block text-xs text-slate-500">{[rows ? `${rows.toLocaleString('en-IN')} rows` : null, formatBytes(bytes)].filter(Boolean).join(' · ')}</span>
    </span>
    <span className="shrink-0 text-xs font-medium text-blue-600">Download</span>
  </a>
)

export default AiFileCard
