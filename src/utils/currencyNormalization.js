/**
 * USD Normalization Utility
 * Converts position values to USD and normalizes volumes
 */

// Exchange rates (update these from an API or configuration)
const EXCHANGE_RATES = {
  USD: 1.0,
  EUR: 1.10,
  GBP: 1.27,
  JPY: 0.0067,
  AUD: 0.66,
  CAD: 0.74,
  CHF: 1.16,
  NZD: 0.60,
  // Add more currencies as needed
}

// Contract sizes for volume normalization
const CONTRACT_SIZES = {
  // Forex pairs (standard lot = 100,000 units)
  'EURUSD': 100000,
  'GBPUSD': 100000,
  'USDJPY': 100000,
  'AUDUSD': 100000,
  'USDCAD': 100000,
  'USDCHF': 100000,
  'NZDUSD': 100000,
  // Metals
  'XAUUSD': 100, // Gold
  'XAGUSD': 5000, // Silver
  // Indices (varies by broker)
  'US30': 10,
  'NAS100': 20,
  'SPX500': 50,
  // Default
  'default': 100000
}

/**
 * Get exchange rate for a currency
 * @param {string} currency - Currency code (e.g., 'EUR', 'GBP')
 * @returns {number} - Exchange rate to USD
 */
export const getExchangeRate = (currency) => {
  if (!currency) return 1.0
  const upperCurrency = currency.toUpperCase()
  return EXCHANGE_RATES[upperCurrency] || 1.0
}

/**
 * Get contract size for a symbol
 * @param {string} symbol - Trading symbol (e.g., 'EURUSD', 'XAUUSD')
 * @returns {number} - Contract size
 */
export const getContractSize = (symbol) => {
  if (!symbol) return CONTRACT_SIZES.default
  const upperSymbol = symbol.toUpperCase()
  return CONTRACT_SIZES[upperSymbol] || CONTRACT_SIZES.default
}

/**
 * Extract currency from symbol
 * @param {string} symbol - Trading symbol (e.g., 'EURUSD')
 * @returns {string} - Profit currency (usually quote currency)
 */
export const getCurrencyFromSymbol = (symbol) => {
  if (!symbol || symbol.length < 6) return 'USD'
  
  // For standard forex pairs (6 characters)
  if (symbol.length === 6) {
    return symbol.substring(3, 6) // Quote currency (last 3 chars)
  }
  
  // For metals and other symbols
  if (symbol.startsWith('XAU') || symbol.startsWith('XAG')) {
    return 'USD'
  }
  
  // Default to USD
  return 'USD'
}

/**
 * Normalize monetary value to USD
 * @param {number} value - Value to normalize
 * @param {string} currency - Source currency
 * @returns {number} - Normalized value in USD
 */
export const normalizeToUSD = (value, currency) => {
  if (value === null || value === undefined || isNaN(value)) return 0
  const rate = getExchangeRate(currency)
  return Number((value * rate).toFixed(2))
}

/**
 * Normalize volume to standard lots
 * @param {number} volume - Volume in lots
 * @param {string} symbol - Trading symbol
 * @returns {number} - Normalized volume
 */
export const normalizeVolume = (volume, symbol) => {
  if (volume === null || volume === undefined || isNaN(volume)) return 0
  // Volume is already in lots, just return as is
  // Or you can normalize to contracts: volume * contractSize
  return Number(volume.toFixed(2))
}

/**
 * Normalize position object to USD (handle USC currency by dividing by 100)
 * Only handles USC and USD currencies
 * @param {object} position - Position object
 * @param {object} clientCurrencyMap - Map of login -> currency (e.g., { '900117': 'USC', '301499': 'USD' })
 * @returns {object} - Position with normalized values
 */
export const normalizePosition = (position, clientCurrencyMap = {}) => {
  if (!position) return position
  
  // Check if this login uses USC currency
  const clientCurrency = clientCurrencyMap[position.login]
  const isUSC = clientCurrency === 'USC'
  
  // For USC, divide by 100 to convert to USD. For USD or any other currency, use as-is
  const uscDivisor = isUSC ? 100 : 1
  
  return {
    ...position,
    profit: (position.profit || 0) / uscDivisor,
    storage: (position.storage || 0) / uscDivisor,
    commission: (position.commission || 0) / uscDivisor,
    volume_normalized: normalizeVolume(position.volume, position.symbol),
    currency: isUSC ? 'USC' : 'USD',
    isUSC: isUSC, // Flag for USC client
    _original_profit: position._original_profit || position.profit * uscDivisor, // Keep original for reference
    _original_storage: position._original_storage || position.storage * uscDivisor,
    _original_commission: position._original_commission || position.commission * uscDivisor
  }
}

/**
 * Normalize array of positions
 * @param {array} positions - Array of position objects
 * @param {object} clientCurrencyMap - Map of login -> currency
 * @returns {array} - Array with normalized positions
 */
export const normalizePositions = (positions, clientCurrencyMap = {}) => {
  if (!Array.isArray(positions)) return []
  return positions.map(pos => normalizePosition(pos, clientCurrencyMap))
}

/**
 * Calculate total normalized profit in USD
 * @param {array} positions - Array of positions
 * @param {object} clientCurrencyMap - Map of login -> currency
 * @returns {number} - Total profit in USD
 */
export const getTotalProfitUSD = (positions, clientCurrencyMap = {}) => {
  if (!Array.isArray(positions)) return 0
  return positions.reduce((sum, pos) => {
    const clientCurrency = clientCurrencyMap[pos.login]
    const isUSC = clientCurrency === 'USC'
    const uscDivisor = isUSC ? 100 : 1
    return sum + ((pos.profit || 0) / uscDivisor)
  }, 0)
}

/**
 * Update exchange rates (call this periodically or on mount)
 * @param {object} rates - New exchange rates object
 */
export const updateExchangeRates = (rates) => {
  if (rates && typeof rates === 'object') {
    Object.assign(EXCHANGE_RATES, rates)
  }
}
