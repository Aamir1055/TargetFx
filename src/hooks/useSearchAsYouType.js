import { useEffect } from 'react'

// Keep the applied query and pagination in the same update. Cancel an older
// draft when typing continues, the user submits manually, or the view unmounts.
export default function useSearchAsYouType(input, applied, setApplied, setPage) {
  useEffect(() => {
    const next = input.trim()
    if (next === applied) return undefined
    const apply = () => {
      setApplied(next)
      setPage?.(1)
    }
    if (!next) {
      apply()
      return undefined
    }
    const timer = setTimeout(apply, 350)
    return () => clearTimeout(timer)
  }, [input, applied, setApplied, setPage])
}
