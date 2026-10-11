import { useEffect, useId, useRef, useState } from 'react'
import { PERCENTAGE_TYPES } from '../utils/percentageType'

export default function PercentageTypeFilter({ selectedTypes, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const buttonRef = useRef(null)
  const dropdownId = useId()

  useEffect(() => {
    if (!isOpen) return
    const closeOutside = event => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false)
    }
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        onClick={() => setIsOpen(open => !open)}
        className={`h-8 sm:h-10 px-2 sm:px-3 rounded-md border shadow-sm inline-flex items-center gap-1.5 text-[10px] sm:text-sm font-medium transition-colors ${
          selectedTypes.length ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        Type
        {selectedTypes.length > 0 && <span className="rounded-full bg-blue-100 px-1.5 text-xs">{selectedTypes.length}</span>}
        <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <fieldset id={dropdownId} className="absolute left-0 top-full z-50 mt-2 w-48 rounded-lg border border-gray-200 bg-white p-2 text-xs text-gray-700 shadow-lg">
          <legend className="sr-only">Filter by percentage type</legend>
          {PERCENTAGE_TYPES.map(type => (
            <label key={type} className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={selectedTypes.includes(type)}
                onChange={event => onChange(event.target.checked
                  ? [...selectedTypes, type]
                  : selectedTypes.filter(value => value !== type))}
                className="h-4 w-4 rounded border-gray-300 accent-blue-600 focus:ring-blue-500"
              />
              {type}
            </label>
          ))}
          <p className="border-t border-gray-100 px-2 pt-2 text-gray-500">Unchecked shows all types.</p>
        </fieldset>
      )}
    </div>
  )
}
