import { useState, useEffect, useMemo, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import BrokerCreditSummary from '../components/BrokerCreditSummary'
import { useAuth } from '../contexts/authContextStore'
import { tutorialsAPI } from '../services/api'

// Normalise one tutorial record regardless of the exact field names the API uses.
const normalize = (t = {}) => {
  const id = t.id ?? t._id ?? t.tutorial_id ?? t.uuid
  const thumbPath = t.thumbnail_url || t.thumbnailUrl || null
  const videoPath = t.video_url || t.videoUrl || (id != null ? `/api/public/tutorials/${id}/video` : null)
  return {
    id,
    title: t.title || t.name || 'Untitled tutorial',
    description: t.description || t.desc || t.summary || '',
    category: t.category || t.category_name || t.topic || '',
    language: t.language_name || t.language || t.lang || '',
    duration: t.duration || t.length || t.duration_seconds || t.duration_sec || null,
    thumbUrl: thumbPath ? tutorialsAPI.mediaUrl(thumbPath) : '',
    videoUrl: videoPath ? tutorialsAPI.mediaUrl(videoPath) : '',
    hasThumbnail: !!thumbPath,
    raw: t,
  }
}

// Pull the tutorials array out of whatever envelope the list endpoint returns,
// including the nested { status, data: { tutorials: [...] } } shape.
const extractList = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.tutorials)) return data.tutorials
  for (const key of ['items', 'results', 'records']) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  if (data?.data && typeof data.data === 'object') return extractList(data.data)
  return []
}

const formatDuration = (d) => {
  if (d == null || d === '') return ''
  if (typeof d === 'string' && /[:a-z]/i.test(d)) return d // already "3:45" or "4 min"
  const secs = Number(d)
  if (!Number.isFinite(secs) || secs <= 0) return ''
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function Thumbnail({ src, title }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700">
        <svg className="h-10 w-10 text-white/90" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  )
}

function VideoModal({ tutorial, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 p-3 backdrop-blur-sm sm:p-5" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* Minimal player: the video fills the card (sized to its own aspect ratio) with the
          title and close button overlaid on a subtle gradient at the top. */}
      <div className="relative w-fit max-w-[96vw] overflow-hidden rounded-2xl bg-black shadow-2xl">
        <video
          key={tutorial.id}
          src={tutorial.videoUrl}
          poster={tutorial.hasThumbnail ? tutorial.thumbUrl : undefined}
          controls
          autoPlay
          playsInline
          controlsList="nodownload noremoteplayback"
          onContextMenu={e => e.preventDefault()}
          className="block h-auto max-h-[92vh] w-auto max-w-[96vw] bg-black"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-4 pb-8 pt-3">
          <h3 className="pointer-events-auto min-w-0 truncate text-[15px] font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{tutorial.title}</h3>
          <button type="button" onClick={onClose} className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function TutorialCard({ tutorial, onPlay }) {
  const duration = formatDuration(tutorial.duration)
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_18px_44px_-14px_rgba(37,99,235,0.38)]"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
        <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.07]">
          <Thumbnail src={tutorial.hasThumbnail ? tutorial.thumbUrl : ''} title={tutorial.title} />
        </div>
        {/* gradient scrim for legibility of the duration chip */}
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/35 via-transparent to-transparent" />
        {/* play button — softly visible at rest, solid blue on hover */}
        <span className="absolute inset-0 flex items-center justify-center transition group-hover:bg-slate-900/10">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85 shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:bg-blue-600 group-hover:shadow-blue-500/40 sm:h-14 sm:w-14">
            <svg className="ml-0.5 h-5 w-5 text-blue-600 transition-colors group-hover:text-white sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </span>
        {duration && <span className="absolute bottom-2 right-2 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm sm:text-[11px]">{duration}</span>}
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[13.5px] font-bold leading-snug text-slate-900 transition-colors group-hover:text-blue-700 sm:text-[15px]">{tutorial.title}</h3>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-blue-600 transition-colors group-hover:text-blue-700 sm:text-[12px]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 transition-colors group-hover:bg-blue-600">
              <svg className="ml-0.5 h-2.5 w-2.5 text-blue-600 transition-colors group-hover:text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            </span>
            Watch now
          </span>
          <svg className="h-4 w-4 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-blue-600" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </button>
  )
}

export default function TutorialsPage() {
  const { isAuthenticated } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { const v = localStorage.getItem('sidebarOpen'); return v !== null ? JSON.parse(v) : true } catch { return true }
  })
  const [isMobile, setIsMobile] = useState(() => { try { return window.innerWidth < 1024 } catch { return false } })
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const [tutorials, setTutorials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState('all')
  const [active, setActive] = useState(null) // tutorial being played (logged-in modal)
  const [featuredId, setFeaturedId] = useState(null) // selected video in the anonymous playlist

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024)
    onResize(); window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const persistSidebar = (n) => { try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch { /* ignore */ } return n }
  const toggleSidebar = () => setSidebarOpen(v => persistSidebar(!v))
  const closeSidebar = () => setSidebarOpen(() => persistSidebar(false))

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // Same endpoint for everyone: the API returns public videos to anonymous visitors and the
      // broker's full set (public + logged-in) when the auth token is attached (done automatically
      // by the api client when logged in). /api/tutorials is admin-only, so it is NOT used here.
      const data = await tutorialsAPI.list()
      setTutorials(extractList(data).map(normalize).filter(t => t.id != null))
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not load tutorials')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => { load() }, [load])

  const languages = useMemo(() => Array.from(new Set(tutorials.map(t => t.language).filter(Boolean))), [tutorials])

  const visible = useMemo(() => tutorials.filter(t =>
    language === 'all' || t.language === language
  ), [tutorials, language])

  // Keep the anonymous playlist's selected video valid as the list/filter changes.
  useEffect(() => {
    if (!visible.length) { if (featuredId !== null) setFeaturedId(null); return }
    if (!visible.some(t => t.id === featuredId)) setFeaturedId(visible[0].id)
  }, [visible, featuredId])
  const featured = visible.find(t => t.id === featuredId) || visible[0] || null

  // Fixed desktop header — same white rounded card the other modules use (Clients, Positions…),
  // kept outside the scroll area so it stays put while the video list scrolls.
  const desktopHeader = (
    <div className="shrink-0 px-6 pt-6">
      <div className="rounded-2xl bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#1A1A1A]">Tutorials</h1>
            <p className="mt-0.5 text-xs text-[#6B7280]">Watch short guides on rules, reports, and getting the most out of Broker Eye.</p>
          </div>
          <BrokerCreditSummary variant="header" />
        </div>
        <BrokerCreditSummary variant="desktop-header" />
      </div>
    </div>
  )

  // Language filter — rendered in the fixed region so it stays constant while scrolling.
  const languageFilter = languages.length > 0 ? (
    <div className="relative inline-block">
      <select value={language} onChange={e => setLanguage(e.target.value)} className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-[13px] font-medium text-slate-700 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
        <option value="all">All languages</option>
        {languages.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 9 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  ) : null

  const content = (
    <>
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-[13px] font-medium text-red-700">{error}</span>
          <button type="button" onClick={load} className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="aspect-video w-full animate-pulse bg-slate-200" />
              <div className="space-y-2 p-3.5">
                <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-16 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <svg className="h-7 w-7 text-blue-500" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M10 9.5v5l4-2.5-4-2.5z" fill="currentColor" /></svg>
          </span>
          <p className="text-[14px] font-semibold text-slate-700">No tutorials found</p>
          <p className="mt-1 text-[12.5px] text-slate-500">{tutorials.length ? 'No tutorials in this language.' : 'Check back soon — new guides are on the way.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map(t => <TutorialCard key={t.id} tutorial={t} onPlay={() => setActive(t)} />)}
        </div>
      )}
    </>
  )

  // Anonymous visitors: a standalone Tutorials page — no sidebar, no hamburger, no other
  // modules. Just the public videos, a brand bar, and a Login button.
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-[#F8FAFC]">
        <header className="shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-2.5 px-4 py-3 sm:px-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>
            </span>
            <div className="leading-tight">
              <p className="text-[15px] font-bold text-slate-900">Broker Eye</p>
              <p className="text-[11px] text-slate-500">Tutorials</p>
            </div>
          </div>
        </header>
        {/* Fixed title + language filter — stays constant while the list scrolls */}
        <div className="mx-auto w-full max-w-7xl shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
          <div className="mb-4">
            <h1 className="text-[22px] font-bold tracking-tight text-slate-900">Tutorials</h1>
            <p className="mt-1 text-[13px] text-slate-500">Watch short guides and get the most out of Broker Eye.</p>
          </div>
          {languageFilter}
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-6" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(28px + var(--app-safe-bottom, 0px))' }}>
          {error && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <span className="text-[13px] font-medium text-red-700">{error}</span>
              <button type="button" onClick={load} className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700">Retry</button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-5 lg:flex-row">
              <div className="aspect-video w-full animate-pulse rounded-2xl bg-slate-200 lg:flex-1" />
              <div className="flex shrink-0 flex-col gap-2 lg:w-80 xl:w-96">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-slate-200" />)}
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center">
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <svg className="h-7 w-7 text-blue-500" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M10 9.5v5l4-2.5-4-2.5z" fill="currentColor" /></svg>
              </span>
              <p className="text-[14px] font-semibold text-slate-700">No tutorials yet</p>
              <p className="mt-1 text-[12.5px] text-slate-500">Check back soon — new guides are on the way.</p>
            </div>
          ) : (
            <>
            {/* Mobile: card grid (tap to play in a modal) */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:hidden">
              {visible.map(t => <TutorialCard key={t.id} tutorial={t} onPlay={() => setActive(t)} />)}
            </div>

            {/* Desktop: playlist (left) + inline player (right) */}
            <div className="hidden gap-5 lg:flex">
              {/* Main inline player */}
              <section className="order-1 min-w-0 lg:order-2 lg:flex-1">
                {featured && (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm">
                      <video
                        key={featured.id}
                        src={featured.videoUrl}
                        poster={featured.hasThumbnail ? featured.thumbUrl : undefined}
                        controls
                        autoPlay
                        playsInline
                        controlsList="nodownload noremoteplayback"
                        onContextMenu={e => e.preventDefault()}
                        className="aspect-video w-full bg-black"
                      />
                    </div>
                    <div className="mt-3.5">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        {featured.category && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-blue-600">{featured.category}</span>}
                        {featured.language && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{featured.language}</span>}
                      </div>
                      <h2 className="text-[17px] font-bold leading-snug text-slate-900 sm:text-[19px]">{featured.title}</h2>
                      {featured.description && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{featured.description}</p>}
                    </div>
                  </>
                )}
              </section>

              {/* Playlist */}
              <aside className="order-2 shrink-0 lg:order-1 lg:w-80 xl:w-96">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="mb-2.5 px-1">
                    <h3 className="text-[13px] font-bold text-slate-900">All tutorials <span className="ml-0.5 font-semibold text-slate-400">· {visible.length}</span></h3>
                  </div>
                  <div className="flex max-h-[62vh] flex-col gap-1 overflow-y-auto pr-0.5">
                    {visible.map(t => {
                      const isActive = featured && t.id === featured.id
                      const d = formatDuration(t.duration)
                      return (
                        <button key={t.id} type="button" onClick={() => setFeaturedId(t.id)} className={`flex items-start gap-2.5 rounded-xl p-2 text-left transition ${isActive ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}>
                          <span className="relative h-[52px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-slate-100">
                            <Thumbnail src={t.hasThumbnail ? t.thumbUrl : ''} title={t.title} />
                            {d && <span className="absolute bottom-1 right-1 rounded bg-slate-900/80 px-1 py-px text-[9px] font-semibold text-white">{d}</span>}
                            {isActive && <span className="absolute inset-0 flex items-center justify-center bg-blue-600/25"><svg className="h-5 w-5 text-white drop-shadow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>}
                          </span>
                          <span className="min-w-0 flex-1 pt-0.5">
                            <span className={`line-clamp-2 block text-[12.5px] font-semibold leading-snug ${isActive ? 'text-blue-700' : 'text-slate-800'}`}>{t.title}</span>
                            <span className="mt-1 flex flex-wrap items-center gap-1">
                              {t.category && <span className="rounded bg-slate-100 px-1.5 py-px text-[9.5px] font-medium uppercase text-slate-500">{t.category}</span>}
                              {t.language && <span className="rounded bg-slate-100 px-1.5 py-px text-[9.5px] font-medium uppercase text-slate-500">{t.language}</span>}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </aside>
            </div>
            </>
          )}
        </main>
        {active && <VideoModal tutorial={active} onClose={() => setActive(null)} />}
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {isMobile ? (
        <Sidebar isOpen={isMobileSidebarOpen} onClose={() => setIsMobileSidebarOpen(false)} onToggle={() => setIsMobileSidebarOpen(v => !v)} mobileOnly />
      ) : (
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} onToggle={toggleSidebar} />
      )}

      {/* Content column: fixed to the viewport height; the <main> inside is the scroll area. */}
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden ${isMobile ? '' : `transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'}`}`}>
        {isMobile ? (
          <div className="shrink-0 bg-white shadow-sm">
            <div className="flex items-center justify-between px-4 py-4">
              <button onClick={() => setIsMobileSidebarOpen(true)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F8F8F8]" aria-label="Open navigation">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3"><h1 className="min-w-0 text-xl font-semibold text-black max-sm:text-base">Tutorials</h1><BrokerCreditSummary variant="header" /></div>
              <div className="h-9 w-9" />
            </div>
            <BrokerCreditSummary variant="desktop-header" />
          </div>
        ) : desktopHeader}

        {/* Fixed language filter — stays constant while the list scrolls */}
        {languageFilter && <div className="shrink-0 px-3 pt-4 sm:px-4 lg:px-6 lg:pt-5">{languageFilter}</div>}

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-4 sm:px-4 lg:px-6 lg:pt-5" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(28px + var(--app-safe-bottom, 0px))' }}>
          <div className="w-full">{content}</div>
        </main>
      </div>

      {active && <VideoModal tutorial={active} onClose={() => setActive(null)} />}
    </div>
  )
}
