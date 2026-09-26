import { useEffect, useRef, useState } from 'react'

// Date field that always shows dd/mm/yyyy (native <input type="date"> follows the OS locale).
// value / onChange use 'YYYY-MM-DD' so callers keep the same format as a native date input.
// Typing is masked (slashes added automatically); the calendar button opens the native picker.

const ymdToDmy = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// 'dd/mm/yyyy' -> 'YYYY-MM-DD', or null if it is not a real calendar date
const dmyToYmd = (dmy) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy || '')
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

const maskDigits = (raw) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

const DateInputDMY = ({ value, onChange, min, max, className = '', ariaLabel }) => {
  const [text, setText] = useState(() => ymdToDmy(value))
  const pickerRef = useRef(null)

  useEffect(() => { setText(ymdToDmy(value)) }, [value])

  const commit = (next) => {
    const ymd = dmyToYmd(next)
    if (!ymd) return false
    if ((min && ymd < min) || (max && ymd > max)) return false
    onChange(ymd)
    return true
  }

  const handleChange = (event) => {
    const masked = maskDigits(event.target.value)
    setText(masked)
    if (masked.length === 10) commit(masked)
  }

  // Leaving the field with an incomplete/invalid date restores the last valid one
  const handleBlur = () => {
    if (!commit(text)) setText(ymdToDmy(value))
  }

  const openPicker = () => {
    const picker = pickerRef.current
    if (!picker) return
    try {
      if (typeof picker.showPicker === 'function') picker.showPicker()
      else picker.click()
    } catch {
      picker.focus()
    }
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={(event) => { if (event.key === 'Enter') handleBlur() }}
        aria-label={ariaLabel}
        className="h-9 w-full rounded-lg border border-slate-200 pl-2.5 pr-8 text-sm tabular-nums text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      />
      <button type="button" onClick={openPicker} className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Open calendar" tabIndex={-1}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M8 2.5v4M16 2.5v4M3 9h18" /></svg>
      </button>
      {/* Hidden native picker, only used for its calendar popup */}
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        onChange={(event) => { if (event.target.value) onChange(event.target.value) }}
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}

export default DateInputDMY
