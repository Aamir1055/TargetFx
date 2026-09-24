/**
 * MT5 timestamps (deal/position/order time, lastAccess, lastTradingDate, ...)
 * are the trade server's wall clock (IST) encoded as if it were UTC.
 * So they must be read with UTC getters, and date-range filters sent to the
 * API must be built from the selected wall-clock date as UTC — never from the
 * browser's local timezone, which shifts everything by the viewer's offset.
 */
export const SERVER_UTC_OFFSET_SEC =
  Number(import.meta?.env?.VITE_SERVER_UTC_OFFSET_MINUTES ?? 330) * 60

/**
 * Convert any epoch timestamp to milliseconds.
 * Handles both seconds (10 digits, e.g., 1781320739) and
 * milliseconds (13 digits, e.g., 1781705020702) automatically.
 * @param {number|string} ts - Unix timestamp in seconds or milliseconds
 * @returns {number} Timestamp in milliseconds (0 if invalid)
 */
export const toMs = (ts) => {
  if (!ts) return 0
  const n = Number(ts)
  if (!isFinite(n) || n <= 0) return 0
  // If less than 10 billion, it's in seconds — convert to ms
  return n < 10000000000 ? n * 1000 : n
}

/**
 * Server epoch (seconds) for a server wall-clock date/time.
 * @param {number} year
 * @param {number} month - 0-indexed
 */
export const serverEpochFromParts = (year, month, day, hours = 0, minutes = 0, seconds = 0) =>
  Math.floor(Date.UTC(year, month, day, hours, minutes, seconds) / 1000)

/**
 * Server epoch (seconds) for a Date whose local wall clock is the wanted
 * server wall clock (e.g. a date picked in a date input, or serverNowDate()).
 */
export const toServerEpoch = (date) =>
  serverEpochFromParts(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds()
  )

/** Current time as a server epoch (seconds). */
export const serverNowEpoch = () => Math.floor(Date.now() / 1000) + SERVER_UTC_OFFSET_SEC

/**
 * A local Date whose wall clock equals the server's current wall clock.
 * Use in place of `new Date()` when computing date ranges ("today",
 * "this month", ...) and pass the results through toServerEpoch().
 */
export const serverNowDate = () => fromServerEpoch(serverNowEpoch())

/**
 * A local Date whose wall clock equals the server wall clock of an MT5
 * timestamp. Use its getDate()/getHours()/... or toLocale*() for display.
 */
export const fromServerEpoch = (ts) => {
  const ms = toMs(ts)
  if (!ms) return new Date(NaN)
  const d = new Date(ms)
  return new Date(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()
  )
}

const pad2 = (v) => String(v).padStart(2, '0')

/**
 * Split an API time value into its wall-clock parts exactly as the API sent
 * it — no timezone conversion. Accepts an epoch (seconds or ms, read as UTC)
 * or a date string such as "2026-09-24 20:04:30" / "2026.09.24 20:04:30".
 */
const apiTimeParts = (value) => {
  if (value == null || value === '') return null
  const n = Number(value)
  if (isFinite(n)) {
    const ms = toMs(n)
    if (!ms) return null
    const d = new Date(ms)
    return {
      day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear(),
      hours: d.getUTCHours(), minutes: d.getUTCMinutes(), seconds: d.getUTCSeconds(), hasTime: true
    }
  }
  const str = String(value).trim()
  let m = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    return { year: m[1], month: m[2], day: m[3], hours: m[4] ?? 0, minutes: m[5] ?? 0, seconds: m[6] ?? 0, hasTime: m[4] != null }
  }
  m = str.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    return { day: m[1], month: m[2], year: m[3], hours: m[4] ?? 0, minutes: m[5] ?? 0, seconds: m[6] ?? 0, hasTime: m[4] != null }
  }
  return null
}

/**
 * Format an API time value as dd/mm/yyyy HH:mm:ss, showing exactly the time
 * the API returned (epoch seconds/ms or a date string).
 * @param {number|string} value
 * @param {string} empty - returned when there is no value
 */
export const formatTime = (value, empty = 'N/A') => {
  const p = apiTimeParts(value)
  if (!p) return value == null || value === '' || Number(value) === 0 ? empty : String(value)
  const date = `${pad2(p.day)}/${pad2(p.month)}/${p.year}`
  return p.hasTime ? `${date} ${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}` : date
}

/**
 * Format an API time value as dd/mm/yyyy (date only), exactly as the API returned it.
 * @param {number|string} value
 * @param {string} empty - returned when there is no value
 */
export const formatDate = (value, empty = 'N/A') => {
  const p = apiTimeParts(value)
  if (!p) return value == null || value === '' || Number(value) === 0 ? empty : String(value)
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`
}

/** yyyy-mm-dd from a Date's local wall clock (unlike toISOString, which is UTC). */
export const toYmd = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
