import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

// These only redirect to the first module, so they are not real pages.
const REDIRECT_PATHS = new Set(['/', '/login', '/dashboard'])

// Keeps the browser/phone Back button inside the app:
// - Back moves to the previously opened module and never leaves the app from the first module.
// - Opening the module that is already showing does not add a history entry that Back would
//   have to walk through (it would look like Back does nothing).
export default function BackNavigationGuard() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const previous = useRef({ target: null, index: null })

  useEffect(() => {
    const index = window.history.state?.idx
    const target = location.pathname + location.search
    const { target: previousTarget, index: previousIndex } = previous.current
    previous.current = { target, index }
    if (typeof index !== 'number' || REDIRECT_PATHS.has(location.pathname)) return

    // The first entry of the session is a stand-in: land on it and step forward again.
    if (index === 0) {
      const stepForward = () => navigate(target + location.hash, { state: location.state })
      // Browsers skip history entries a page adds before the user has touched it, so wait for that.
      if (window.navigator.userActivation && !window.navigator.userActivation.hasBeenActive) {
        const events = ['click', 'keydown', 'touchend']
        const stop = () => events.forEach(name => window.removeEventListener(name, onActivate, true))
        const onActivate = () => { stop(); stepForward() }
        events.forEach(name => window.addEventListener(name, onActivate, true))
        return stop
      }
      stepForward()
      return
    }
    // Same page pushed again. When the entry before it is the first one, this copy acts as the stand-in.
    // Modals push the same page on purpose (state.overlay) so Back can close them.
    if (navigationType === 'PUSH' && !location.state?.overlay && target === previousTarget && previousIndex > 0) navigate(-1)
  }, [location, navigationType, navigate])

  return null
}
