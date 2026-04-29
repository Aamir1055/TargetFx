import { useState, useMemo } from 'react'

/**
 * Reusable column chooser list with:
 * - Search filter
 * - Visibility toggle (checkbox)
 * - Drag-to-reorder (drag handle on each row)
 *
 * Props:
 *  - columns: Array<{ key: string, label: string }>  (full list of available columns)
 *  - visibleColumns: Object<key, boolean>           (visibility map)
 *  - onToggle: (key: string) => void                (toggle visibility)
 *  - columnOrder: string[] | null | undefined       (current order; if null/empty, uses columns prop order)
 *  - onReorder: (newOrder: string[]) => void        (called with the full ordered key list after a drag)
 *  - onResetOrder?: () => void                      (optional reset handler -> shows reset button)
 *  - searchPlaceholder?: string
 *  - title?: string
 *  - accent?: 'amber' | 'blue' | 'gray'             (visual theme)
 */
const ACCENTS = {
  amber: {
    border: 'border-amber-200',
    headBorder: 'border-amber-200',
    titleText: 'text-amber-700',
    closeText: 'text-amber-500 hover:text-amber-700 hover:bg-amber-100',
    inputBorder: 'border-amber-300 focus:ring-amber-500',
    rowHover: 'hover:bg-amber-100',
    checkbox: 'text-amber-600 focus:ring-amber-500',
    dragOverRing: 'ring-2 ring-amber-400'
  },
  blue: {
    border: 'border-grey-200',
    headBorder: 'border-blue-200',
    titleText: 'text-blue-700',
    closeText: 'text-blue-500 hover:text-blue-700 hover:bg-blue-100',
    inputBorder: 'border-gray-300 focus:ring-blue-500',
    rowHover: 'hover:bg-blue-50',
    checkbox: 'text-blue-600 focus:ring-blue-500',
    dragOverRing: 'ring-2 ring-blue-400'
  },
  gray: {
    border: 'border-gray-200',
    headBorder: 'border-gray-200',
    titleText: 'text-gray-700',
    closeText: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
    inputBorder: 'border-gray-300 focus:ring-gray-500',
    rowHover: 'hover:bg-gray-50',
    checkbox: 'text-blue-600 focus:ring-blue-500',
    dragOverRing: 'ring-2 ring-gray-400'
  }
}

const ColumnChooserList = ({
  columns = [],
  visibleColumns = {},
  onToggle,
  columnOrder,
  onReorder,
  onResetOrder,
  searchPlaceholder = 'Search columns...',
  title = 'Show / Hide & Reorder Columns',
  accent = 'amber',
  groupVisibleFirst = false
}) => {
  const [search, setSearch] = useState('')
  const [draggedKey, setDraggedKey] = useState(null)
  const [dragOverKey, setDragOverKey] = useState(null)

  const theme = ACCENTS[accent] || ACCENTS.amber

  // Compute the ordered list based on columnOrder (with any missing/new keys appended)
  const orderedColumns = useMemo(() => {
    let base
    if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
      base = columns
    } else {
      const map = new Map(columns.map(c => [c.key, c]))
      const ordered = []
      columnOrder.forEach(k => { if (map.has(k)) { ordered.push(map.get(k)); map.delete(k) } })
      map.forEach(c => ordered.push(c)) // append any new columns not yet in saved order
      base = ordered
    }
    if (!groupVisibleFirst) return base
    // Stable partition: visible columns first, then hidden — preserves relative order in each group.
    const visible = base.filter(c => !!visibleColumns[c.key])
    const hidden = base.filter(c => !visibleColumns[c.key])
    return [...visible, ...hidden]
  }, [columns, columnOrder, groupVisibleFirst, visibleColumns])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orderedColumns
    return orderedColumns.filter(c =>
      (c.label || '').toLowerCase().includes(q) ||
      (c.key || '').toLowerCase().includes(q)
    )
  }, [orderedColumns, search])

  const reorderTo = (sourceKey, targetKey) => {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return
    const keys = orderedColumns.map(c => c.key)
    const from = keys.indexOf(sourceKey)
    const to = keys.indexOf(targetKey)
    if (from === -1 || to === -1) return
    // Swap: dragged column takes target's position, target takes dragged column's position.
    const next = [...keys]
    ;[next[from], next[to]] = [next[to], next[from]]
    if (typeof onReorder === 'function') onReorder(next)
  }

  const handleDragStart = (e, key) => {
    setDraggedKey(key)
    try {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', key)
    } catch {}
  }
  const handleDragOver = (e, key) => {
    e.preventDefault()
    try { e.dataTransfer.dropEffect = 'move' } catch {}
    if (key !== draggedKey) setDragOverKey(key)
  }
  const handleDragLeave = (key) => {
    if (dragOverKey === key) setDragOverKey(null)
  }
  const handleDrop = (e, key) => {
    e.preventDefault()
    e.stopPropagation()
    const src = draggedKey || (() => {
      try { return e.dataTransfer.getData('text/plain') } catch { return null }
    })()
    reorderTo(src, key)
    setDraggedKey(null)
    setDragOverKey(null)
  }
  const handleDragEnd = () => {
    setDraggedKey(null)
    setDragOverKey(null)
  }

  const isSearching = search.trim().length > 0

  return (
    <div className={`flex flex-col ${theme.border}`} style={{ width: '100%', flex: 1, minHeight: 0, maxHeight: 'inherit' }}>
      {title && (
        <div className={`px-3 py-2 border-b ${theme.headBorder} flex items-center justify-between`}>
          <p className={`text-[10px] font-bold uppercase tracking-wide ${theme.titleText}`}>{title}</p>
          {typeof onResetOrder === 'function' && (
            <div className="relative group">
              <button
                type="button"
                onClick={onResetOrder}
                className={`p-1 rounded ${theme.closeText}`}
                aria-label="Reset column order"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20v-6h-6" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10a8 8 0 0114-3m2 7a8 8 0 01-14 3" />
                </svg>
              </button>
              <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-gray-900 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow">
                Reset Order
              </span>
            </div>
          )}
        </div>
      )}

      <div className={`px-3 py-2 border-b ${theme.headBorder}`}>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className={`w-full px-3 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-2 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 ${theme.inputBorder}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {!isSearching && (
          <p className="mt-1 text-[10px] text-gray-500">Drag <span className="font-semibold">⋮⋮</span> to reorder</p>
        )}
      </div>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-gray-500">
            No columns found{isSearching ? ` matching "${search}"` : ''}
          </div>
        )}
        {filtered.map((col) => {
          const isDragging = draggedKey === col.key
          const isOver = dragOverKey === col.key && draggedKey && draggedKey !== col.key
          const dragDisabled = isSearching // disable reorder while searching to avoid confusion
          return (
            <div
              key={col.key}
              draggable={!dragDisabled}
              onDragStart={(e) => !dragDisabled && handleDragStart(e, col.key)}
              onDragOver={(e) => !dragDisabled && handleDragOver(e, col.key)}
              onDragLeave={() => !dragDisabled && handleDragLeave(col.key)}
              onDrop={(e) => !dragDisabled && handleDrop(e, col.key)}
              onDragEnd={handleDragEnd}
              className={`flex items-center px-2 py-1.5 mx-2 rounded-md cursor-pointer transition-colors ${theme.rowHover} ${isDragging ? 'opacity-50' : ''} ${isOver ? theme.dragOverRing : ''}`}
              title={dragDisabled ? 'Clear search to reorder' : 'Drag to reorder'}
            >
              {/* Drag handle */}
              <span
                className={`select-none mr-1 px-1 text-gray-400 ${dragDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing'}`}
                aria-hidden
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6-10a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/>
                </svg>
              </span>
              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={visibleColumns?.[col.key] === true}
                  onChange={() => onToggle && onToggle(col.key)}
                  className={`w-3.5 h-3.5 border-gray-300 rounded focus:ring-1 ${theme.checkbox}`}
                />
                <span className="text-xs font-semibold text-gray-700 truncate">{col.label}</span>
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ColumnChooserList
