import { useState, useMemo, useEffect, useRef } from 'react'
import { useIB } from '../contexts/IBContext'

const IBSelector = () => {
  const { selectedIB, ibList, ibMT5Accounts, isLoading, selectIB, clearIBSelection, refreshIBList } = useIB()
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef(null)

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showDropdown])

  // Filter IB list based on search query
  const filteredIBList = useMemo(() => {
    if (!searchQuery.trim()) return ibList

    const query = searchQuery.toLowerCase()
    return ibList.filter(ib => {
      const name = (ib.name || '').toLowerCase()
      const email = (ib.email || '').toLowerCase()
      return name.includes(query) || email.includes(query)
    })
  }, [ibList, searchQuery])

  const handleIBSelect = (ib) => {
    selectIB(ib)
    setShowDropdown(false)
    setSearchQuery('')
  }

  const handleClearSelection = () => {
    clearIBSelection()
    setShowDropdown(false)
    setSearchQuery('')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          const willShow = !showDropdown
          setShowDropdown(willShow)
          // Data is now prefetched on login, refresh, and page entry; optional on-demand refresh left disabled here
        }}
        className="px-2.5 py-1.5 rounded-md bg-white border border-[#E5E7EB] hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5 text-xs font-medium text-[#374151] shadow-sm h-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        IB Filter
        {selectedIB && (
          <span className="ml-0.5 px-1.5 py-0.5 bg-slate-600 text-white text-[10px] font-bold rounded-full shadow-sm">
            Active
          </span>
        )}
        {selectedIB && ibMT5Accounts.length > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 bg-slate-700 text-white text-[10px] font-bold rounded-full shadow-sm">
            {ibMT5Accounts.length}
          </span>
        )}
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-[100] w-80">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
              IB Filter
            </p>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 placeholder:text-gray-400"
              autoFocus
            />
          </div>
          
          {isLoading ? (
            <div className="px-3 py-4 text-center text-xs text-slate-500">
              Loading IB data...
            </div>
          ) : filteredIBList.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-500">
              {searchQuery ? 'No IBs found matching your search' : 'No IBs available'}
            </div>
          ) : (
            <div className="py-1 max-h-96 overflow-y-auto">
              {/* Clear Selection Option */}
              {selectedIB && (
                <button
                  onClick={handleClearSelection}
                  className="w-full text-left px-3 py-2 text-xs transition-colors text-slate-700 hover:bg-slate-50 font-medium border-b border-slate-100"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Filter (Show All)
                  </span>
                </button>
              )}
              
              {filteredIBList.map((ib) => {
                const isSelected = selectedIB?.email === ib.email
                const percentage = parseFloat(ib.percentage || 0)
                
                return (
                  <button
                    key={ib.id}
                    onClick={() => handleIBSelect(ib)}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-l-4 border-blue-500' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                          {ib.email} <span className="text-blue-600">({percentage}%)</span>
                        </div>
                      </div>
                      {isSelected && (
                        <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Show MT5 accounts info if IB is selected */}
          {selectedIB && ibMT5Accounts.length > 0 && (
            <div className="px-3 py-2 border-t border-slate-200 bg-slate-50">
              <p className="text-[10px] font-semibold text-slate-600 mb-1">
                Filtering by {ibMT5Accounts.length} MT5 account{ibMT5Accounts.length !== 1 ? 's' : ''}:
              </p>
              <div className="text-[10px] text-slate-700 font-mono">
                {ibMT5Accounts.slice(0, 10).join(', ')}
                {ibMT5Accounts.length > 10 && ` and ${ibMT5Accounts.length - 10} more...`}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default IBSelector
