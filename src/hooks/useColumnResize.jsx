import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Reusable column-resize hook. Mirrors the Client2Page resize behaviour:
 * drag the handle on the right edge of a header to grow/shrink that column,
 * the table grows horizontally instead of stealing width from the neighbour.
 *
 * Persists widths to localStorage under `storageKey` when provided.
 */
export default function useColumnResize(storageKey) {
  const [columnWidths, setColumnWidths] = useState(() => {
    if (!storageKey) return {}
    try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
  })
  const [resizingColumn, setResizingColumn] = useState(null)

  const headerRefs = useRef({})
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)
  const resizeRAF = useRef(null)

  useEffect(() => {
    if (!storageKey) return
    try { localStorage.setItem(storageKey, JSON.stringify(columnWidths)) } catch {}
  }, [columnWidths, storageKey])

  const handleResizeStart = useCallback((e, columnKey) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(columnKey)
    resizeStartX.current = e.clientX
    const measured = headerRefs.current?.[columnKey]?.getBoundingClientRect()?.width
    resizeStartWidth.current = (typeof measured === 'number' && measured > 0)
      ? measured
      : (columnWidths[columnKey] || 120)
  }, [columnWidths])

  const handleResizeMove = useCallback((e) => {
    if (!resizingColumn) return
    if (resizeRAF.current) cancelAnimationFrame(resizeRAF.current)
    resizeRAF.current = requestAnimationFrame(() => {
      const diff = e.clientX - resizeStartX.current
      const newWidth = Math.max(50, resizeStartWidth.current + diff)
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }))
    })
  }, [resizingColumn])

  const handleResizeEnd = useCallback(() => {
    if (resizeRAF.current) {
      cancelAnimationFrame(resizeRAF.current)
      resizeRAF.current = null
    }
    setResizingColumn(null)
  }, [])

  useEffect(() => {
    if (!resizingColumn) return
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [resizingColumn, handleResizeMove, handleResizeEnd])

  // Helper: register a header ref for a given column key
  const setHeaderRef = useCallback((columnKey) => (el) => {
    if (!headerRefs.current) headerRefs.current = {}
    if (el) headerRefs.current[columnKey] = el
  }, [])

  // Helper: style fragment to merge into the <th> inline style
  const getHeaderStyle = useCallback((columnKey) => {
    const w = columnWidths[columnKey]
    const base = { position: 'relative', whiteSpace: 'nowrap' }
    if (!w) return base
    return { ...base, width: w, minWidth: w, maxWidth: w }
  }, [columnWidths])

  return {
    columnWidths,
    setColumnWidths,
    resizingColumn,
    headerRefs,
    setHeaderRef,
    getHeaderStyle,
    handleResizeStart,
  }
}

/**
 * Renderable resize handle for a table header cell.
 * Place as a child of a `position: relative` <th>.
 */
export function ColumnResizeHandle({ columnKey, onResizeStart }) {
  return (
    <div
      onMouseDown={(e) => onResizeStart(e, columnKey)}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none z-30 hover:bg-white/60 active:bg-white/80 transition-colors"
      style={{ userSelect: 'none', touchAction: 'none', pointerEvents: 'auto' }}
      title="Drag to resize"
      draggable={false}
    />
  )
}
