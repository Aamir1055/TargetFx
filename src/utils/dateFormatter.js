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
 * Format timestamp to dd/mm/yyyy hh:mm:ss format
 * Handles both epoch seconds and milliseconds automatically.
 * @param {number|string} timestamp - Unix timestamp in seconds or milliseconds
 * @returns {string} Formatted date string
 */
export const formatTime = (timestamp) => {
  if (!timestamp) return 'N/A'
  const ms = toMs(timestamp)
  if (!ms) return 'N/A'
  const date = new Date(ms)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

/**
 * Format timestamp to dd/mm/yyyy format (date only)
 * Handles both epoch seconds and milliseconds automatically.
 * @param {number|string} timestamp - Unix timestamp in seconds or milliseconds
 * @returns {string} Formatted date string
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A'
  const ms = toMs(timestamp)
  if (!ms) return 'N/A'
  const date = new Date(ms)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}
