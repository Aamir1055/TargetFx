import { QUICK_FILTERS } from '../utils/dealTimePresets'

export default function QuickTimeFilter({ value, onChange }) {
  return (
    <select
      aria-label="Quick time filters"
      value={value}
      onChange={event => onChange(event.target.value)}
      className="h-8 w-28 shrink-0 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs font-normal text-[#374151] shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option disabled value="">Quick Filters</option>
      {QUICK_FILTERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      {value === 'custom' && <option value="custom" disabled>Custom</option>}
      {value === '24h' && <option value="24h" disabled>Last 24 Hours</option>}
      {value === '7d' && <option value="7d" disabled>Last 7 Days</option>}
    </select>
  )
}
