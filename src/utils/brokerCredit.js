export const CREDIT_REFRESH_MS = 30000

export const creditOperations = [
  { value: 'credit_in', label: 'Credit In', right: 'credit_in' },
  { value: 'credit_out', label: 'Credit Out', right: 'credit_out' },
  { value: 'temp_credit_in', label: 'Temp Credit In', right: 'credit_in' },
  { value: 'temp_credit_out', label: 'Temp Credit Out', right: 'credit_out' }
]

export const showCreditSummary = credit => credit?.credit_limit != null && credit.credit_limit !== 0
export const formatCredit = value => value === null ? 'Unlimited' : Number.isFinite(value) ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Unavailable'

// The reversal schedule for temporary credit is managed by the backend.
export function temporaryCreditBody(amount, comment) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Please enter a valid positive amount.')
  return { amount, comment }
}
