import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Recover from stale cached chunks after app updates (common on mobile reopen).
const CHUNK_RELOAD_KEY = 'chunk-reload-once'
const maybeRecoverFromChunkError = (errLike) => {
  const message = String(errLike?.message || errLike?.reason?.message || errLike || '')
  const isChunkLoadError =
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message)

  if (!isChunkLoadError) return

  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
  } catch {
    // If storage fails, still attempt a single reload path.
  }

  if (typeof window !== 'undefined') {
    window.location.reload()
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => maybeRecoverFromChunkError(event?.error || event?.message))
  window.addEventListener('unhandledrejection', (event) => maybeRecoverFromChunkError(event?.reason))
}

// Unregister any existing service workers in development
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let registration of registrations) {
        registration.unregister()
        console.log('Service Worker unregistered:', registration.scope)
      }
    })
  }
}

createRoot(document.getElementById('root')).render(
  <App />
)
