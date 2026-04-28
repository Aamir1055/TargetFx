import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DEFAULT_OPTIONS = [25, 50, 100, 150]

const PageSizeSelect = ({ value, onChange, options = DEFAULT_OPTIONS, label = 'Rows', menuZIndex = 9999 }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const wrapRef = useRef(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const updatePos = () => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.right, width: r.width })
  }

  useLayoutEffect(() => {
    if (open) updatePos()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScrollResize = () => updatePos()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
    }
  }, [open])

  return (
    <div className="flex items-center gap-1.5" ref={wrapRef}>
      {label && <span className="text-xs text-[#6B7280]">{label}</span>}
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`h-8 px-2.5 pr-7 text-sm font-medium border border-[#E5E7EB] rounded-lg bg-white text-[#374151] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all flex items-center gap-1 min-w-[60px] ${open ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="flex-1 text-left">{value}</span>
          <svg
            className={`absolute right-2 w-3.5 h-3.5 text-[#6B7280] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
          >
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && typeof document !== 'undefined' && createPortal(
          <div
            ref={menuRef}
            className="fixed bg-white border border-[#E5E7EB] rounded-lg shadow-lg overflow-hidden"
            style={{
              top: pos.top,
              left: pos.left,
              transform: 'translateX(-100%)',
              minWidth: pos.width,
              zIndex: menuZIndex,
              animation: 'pageSizeFadeIn 120ms ease-out',
            }}
            role="listbox"
          >
            <style>{`@keyframes pageSizeFadeIn { from { opacity: 0; transform: translate(-100%, -4px); } to { opacity: 1; transform: translate(-100%, 0); } }`}</style>
            {options.map((opt) => {
              const active = Number(opt) === Number(value)
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(Number(opt))
                    setOpen(false)
                  }}
                  className={`w-full px-3 py-1.5 text-sm text-left transition-colors flex items-center justify-between gap-3 ${active ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-[#374151] hover:bg-gray-50'}`}
                >
                  <span>{opt}</span>
                  {active && (
                    <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L7 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>,
          document.body
        )}
      </div>
    </div>
  )
}

export default PageSizeSelect
