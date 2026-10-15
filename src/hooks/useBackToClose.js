import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Lets the phone/browser Back button close a full-screen modal instead of leaving the page.
// Opening adds one history entry; Back (or closing the modal by hand) removes it again.
export default function useBackToClose(onClose) {
  const location = useLocation()
  const navigate = useNavigate()
  const onCloseRef = useRef(onClose)
  const navigateRef = useRef(navigate)
  const locationRef = useRef(location)
  const entryKey = useRef(null)
  onCloseRef.current = onClose
  navigateRef.current = navigate
  locationRef.current = location

  useEffect(() => {
    // Deferred so React StrictMode's mount/unmount/mount probe never touches history.
    const timer = setTimeout(() => {
      const current = locationRef.current
      navigateRef.current(current.pathname + current.search + current.hash, { state: { overlay: true } })
      entryKey.current = window.history.state?.key ?? null
    }, 0)
    return () => {
      clearTimeout(timer)
      // Closed by hand while its entry is still on top: drop the entry. After Back it is already gone.
      if (entryKey.current && window.history.state?.key === entryKey.current) navigateRef.current(-1)
      entryKey.current = null
    }
  }, [])

  useEffect(() => {
    if (entryKey.current && location.key !== entryKey.current) {
      entryKey.current = null
      onCloseRef.current?.()
    }
  }, [location.key])
}
