let activeExports = 0
const listeners = new Set()
export const getExportLoading = () => activeExports > 0
export const subscribeExportLoading = listener => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const notify = () => listeners.forEach(listener => listener())

// Yield before synchronous CSV generation so the loading dialog can paint.
export const withExportLoading = operation => async (...args) => {
  activeExports += 1
  notify()
  try {
    await new Promise(resolve => setTimeout(resolve, 50))
    return await operation(...args)
  } finally {
    activeExports -= 1
    notify()
  }
}
