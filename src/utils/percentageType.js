// Shared helper for deriving the "Type" of a client percentage row.
// Priority: Auto (is_autofill) -> Custom (is_custom) -> Default
export const getPercentageType = (item) => {
  if (!item) return 'Default'
  if (item.is_autofill) return 'Auto'
  if (item.is_custom) return 'Custom'
  return 'Default'
}

// Tailwind badge classes per type.
export const getPercentageTypeBadgeClass = (item) => {
  const type = getPercentageType(item)
  if (type === 'Auto') return 'bg-amber-100 text-amber-800'
  if (type === 'Custom') return 'bg-blue-100 text-blue-800'
  return 'bg-gray-100 text-gray-600'
}
