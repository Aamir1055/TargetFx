export const CREDIT_REFRESH_MS = 30000

export const creditOperations = [
  { value: 'credit_in', label: 'Credit In', right: 'credit_in' },
  { value: 'credit_out', label: 'Credit Out', right: 'credit_out' },
  { value: 'temp_credit_in', label: 'Temp Credit In', right: 'credit_in' },
  { value: 'temp_credit_out', label: 'Temp Credit Out', right: 'credit_out' }
]

export const showCreditSummary = credit => credit?.credit_limit != null && credit.credit_limit !== 0
export const formatCredit = value => value === null ? 'Unlimited' : Number.isFinite(value) ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Unavailable'

export function temporaryCreditBody(amount, comment, weekday, time) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Please enter a valid positive amount.')
  if (!['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].includes(weekday)) throw new Error('Choose a reversal weekday.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a reversal time in HH:MM format.')
  return { amount, comment, expire_weekday: weekday, expire_time: time }
}
