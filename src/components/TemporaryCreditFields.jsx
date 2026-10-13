export default function TemporaryCreditFields({ weekday, time, onWeekdayChange, onTimeChange }) {
  return <fieldset className="space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs">
    <legend className="px-1 font-medium text-gray-700">Automatic reversal</legend>
    <label className="block">Weekday<select required value={weekday} onChange={event => onWeekdayChange(event.target.value)} className="mt-1 block w-full rounded border border-gray-300 bg-white p-2 text-gray-900">
      <option value="">Choose weekday</option>
      {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(day => <option key={day} value={day}>{day[0].toUpperCase() + day.slice(1)}</option>)}
    </select></label>
    <label className="block">Time (server time, UTC+05:30)<input required type="time" value={time} onChange={event => onTimeChange(event.target.value)} className="mt-1 block w-full rounded border border-gray-300 bg-white p-2 text-gray-900" /></label>
    <p className="text-gray-600">Credit changes immediately and reverses at the next occurrence of this weekday and time.</p>
  </fieldset>
}
