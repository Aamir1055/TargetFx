import { memo, useEffect, useRef, useState } from 'react'

// Keep keystrokes local so the large Positions table only renders when a
// search is applied, rather than blocking the controlled input on every key.
const PositionsSearchInput = memo(function PositionsSearchInput({ value, onSearch }) {
  const [draft, setDraft] = useState(value)
  const timer = useRef(null)

  useEffect(() => {
    if (draft.trim() === value) return undefined
    timer.current = setTimeout(() => onSearch(draft.trim()), 350)
    return () => clearTimeout(timer.current)
  }, [draft, value, onSearch])

  const submit = (next) => {
    clearTimeout(timer.current)
    onSearch(next.trim())
  }

  return (
    <form className="relative" role="search" onSubmit={event => { event.preventDefault(); submit(draft) }}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none" fill="none" viewBox="0 0 18 18">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={draft}
        onChange={event => {
          const next = event.target.value
          setDraft(next)
          if (!next.trim()) submit('')
        }}
        aria-label="Search positions"
        placeholder="Search"
        className={`w-full h-10 pl-10 ${draft ? 'pr-20' : 'pr-10'} text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all`}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {draft && <button type="button" onClick={() => { setDraft(''); submit('') }} className="p-1 text-[#9CA3AF] hover:text-[#4B5563] transition-colors" title="Clear search" aria-label="Clear search">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>}
        <button type="submit" className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors" title="Search" aria-label="Search">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
    </form>
  )
})

export default PositionsSearchInput
