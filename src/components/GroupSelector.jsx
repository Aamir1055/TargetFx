import { useState, useEffect, useRef } from 'react'
import { useGroups } from '../contexts/GroupContext'

const GroupSelector = ({ onCreateClick, onEditClick, moduleName }) => {
  const { groups, getActiveGroupFilter, setActiveGroupFilter, deleteGroup } = useGroups()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)

  const activeGroupFilter = getActiveGroupFilter(moduleName)

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

  const handleEdit = (group, e) => {
    e.stopPropagation()
    setShowDropdown(false)
    if (onEditClick) {
      console.log('[GroupSelector] Calling onEditClick with group:', group)
      onEditClick(group)
    } else {
      console.warn('[GroupSelector] onEditClick is not defined')
    }
  }

  const handleDelete = (groupName, e) => {
    e.stopPropagation()
    if (confirm(`Delete group "${groupName}"?`)) {
      deleteGroup(groupName)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="px-2.5 py-1.5 rounded-md bg-white border border-[#E5E7EB] hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5 text-xs font-medium text-[#374151] shadow-sm h-8"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        Groups
        {groups.length > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 bg-slate-600 text-white text-[10px] font-bold rounded-full shadow-sm">
            {groups.length}
          </span>
        )}
        {activeGroupFilter && (
          <span className="ml-0.5 px-1.5 py-0.5 bg-slate-600 text-white text-[10px] font-bold rounded-full shadow-sm">
            Active
          </span>
        )}
      </button>
      
      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-[9999] w-64">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Login Groups</p>
            <button
              onClick={() => {
                setShowDropdown(false)
                onCreateClick()
              }}
              className="text-xs text-slate-700 hover:text-slate-900 font-bold hover:bg-slate-100 px-2 py-1 rounded transition-colors"
            >
              + New
            </button>
          </div>
          
          {groups.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-500">
              No groups created yet
            </div>
          ) : (
            <div className="py-1 max-h-80 overflow-y-auto">
              <button
                onClick={() => {
                  setActiveGroupFilter(moduleName, null)
                  setShowDropdown(false)
                }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  activeGroupFilter === null 
                    ? 'bg-slate-100 text-slate-900 font-bold' 
                    : 'text-slate-700 hover:bg-slate-50 font-medium'
                }`}
              >
                All Items
              </button>
              
              {groups.map((group, idx) => (
                <div key={idx} className="flex items-center hover:bg-slate-50">
                  <button
                    onClick={() => {
                      setActiveGroupFilter(moduleName, group.name)
                      setShowDropdown(false)
                    }}
                    className={`flex-1 text-left px-3 py-2 text-xs transition-colors ${
                      activeGroupFilter === group.name 
                        ? 'bg-slate-100 text-slate-900 font-bold' 
                        : 'text-slate-700 font-medium'
                    }`}
                  >
                    {group.name}
                    {group.range && (
                      <span className="ml-2 text-xs text-slate-500">
                        ({group.range.from}-{group.range.to})
                      </span>
                    )}
                    {!group.range && group.loginIds && (
                      <span className="ml-2 text-xs text-slate-500">
                        ({group.loginIds.length} logins)
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(e) => handleEdit(group, e)}
                    className="px-2 py-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    title="Edit group"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleDelete(group.name, e)}
                    className="px-2 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Delete group"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GroupSelector
