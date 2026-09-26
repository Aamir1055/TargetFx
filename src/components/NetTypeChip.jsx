const NetTypeChip = ({ type, compact = false }) => {
  const value = String(type ?? '').toLowerCase()
  const color = value === 'buy' ? 'bg-green-100 text-green-700'
    : value === 'sell' ? 'bg-red-100 text-red-700'
      : 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded font-semibold ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'} ${color}`}>
      {type}
    </span>
  )
}

export default NetTypeChip
