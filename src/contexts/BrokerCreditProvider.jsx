import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './authContextStore'
import { BrokerCreditContext } from './brokerCreditStore'
import { brokerAPI } from '../services/api'
import { CREDIT_REFRESH_MS } from '../utils/brokerCredit'

export default function BrokerCreditProvider({ children }) {
  const { isAuthenticated, user } = useAuth()
  const [state, setState] = useState({ credit: null, error: '' })
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion(value => value + 1), [])
  const identity = user?.id ?? user?.username
  const updateCredit = useCallback(credit => {
    if (credit?.credit_limit !== undefined) setState({ credit, error: '', identity })
  }, [identity])

  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()
    let timer
    let running = false
    const poll = async () => {
      if (running || controller.signal.aborted) return
      clearTimeout(timer)
      if (document.hidden) return
      running = true
      try {
        const response = await brokerAPI.getCreditSummary({ signal: controller.signal })
        if (response.status === 'error' || !response.data || response.data.credit_limit === undefined) throw new Error(response.message || 'Credit summary unavailable')
        if (!controller.signal.aborted) setState({ credit: response.data, error: '', identity })
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ credit: previous.identity === identity ? previous.credit : null, identity, error: error.response?.data?.message || error.message || 'Credit summary unavailable' }))
      } finally {
        running = false
        if (!controller.signal.aborted) timer = setTimeout(poll, CREDIT_REFRESH_MS)
      }
    }
    void poll()
    document.addEventListener('visibilitychange', poll)
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [isAuthenticated, identity, version])

  return <BrokerCreditContext.Provider value={{ ...(isAuthenticated && state.identity === identity ? state : { credit: null, error: '' }), refresh, updateCredit }}>{children}</BrokerCreditContext.Provider>
}
