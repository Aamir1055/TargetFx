// Telegram can expose a smaller visible area than the WebView's layout viewport.
// VisualViewport also accounts for the iOS keyboard without disabling page zoom.
export function initializeAppViewport(win = window, doc = document) {
  const root = doc.documentElement
  const telegram = win.Telegram?.WebApp?.initData ? win.Telegram.WebApp : null
  const visual = win.visualViewport
  const update = () => {
    const heights = [win.innerHeight, visual?.height, telegram?.viewportStableHeight]
      .filter(value => Number.isFinite(value) && value > 0)
    const height = Math.min(...heights)
    if (Number.isFinite(height)) root.style.setProperty('--app-viewport-height', `${height}px`)
    root.style.setProperty('--app-viewport-top', `${visual?.offsetTop || 0}px`)
  }
  const updateTelegram = (event) => {
    if (event?.isStateStable === false) return
    update()
  }
  if (telegram) {
    root.dataset.telegram = 'true'
    telegram.onEvent?.('viewportChanged', updateTelegram)
    telegram.ready?.()
    telegram.expand?.()
  }
  update()
  win.addEventListener('resize', update)
  visual?.addEventListener('resize', update)
  visual?.addEventListener('scroll', update)
  return () => {
    win.removeEventListener('resize', update)
    visual?.removeEventListener('resize', update)
    visual?.removeEventListener('scroll', update)
    telegram?.offEvent?.('viewportChanged', updateTelegram)
    delete root.dataset.telegram
    root.style.removeProperty('--app-viewport-height')
    root.style.removeProperty('--app-viewport-top')
  }
}
