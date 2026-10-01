import { serverNowEpoch, serverNowDate, serverEpochFromParts } from './dateFormatter'

// Same presets (and ranges) as the Deals tab in the login details modal
export const QUICK_FILTERS = [
  { value: 'today', label: 'Today' },
  { value: 'lastweek', label: 'Last Week' },
  { value: 'lastmonth', label: 'Last Month' },
  { value: 'last3months', label: 'Last 3 Months' },
  { value: 'last6months', label: 'Last 6 Months' },
  { value: 'allhistory', label: 'All History' }
]
// All ranges are in server (MT5) time: they start at 00:00:00 of the first day and run until now.
// "Today" is the current server calendar day; "Last Week" is today plus the 6 days before it, etc.
const PRESET_DAYS = { today: 1, lastweek: 7, lastmonth: 30, last3months: 90, last6months: 180 }
export const getPresetRange = (preset) => {
  const to = serverNowEpoch()
  const today = serverNowDate()
  const startOfDay = (date) => serverEpochFromParts(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)
  if (PRESET_DAYS[preset]) {
    const first = new Date(today)
    first.setDate(today.getDate() - (PRESET_DAYS[preset] - 1))
    return { from: startOfDay(first), to }
  }
  if (preset === 'allhistory') return { from: serverEpochFromParts(today.getFullYear() - 2, 0, 1, 0, 0, 0), to }
  return null
}

