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
