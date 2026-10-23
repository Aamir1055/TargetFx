import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { AskAiIcon } from '../components/ReportIcons'
import { aiAPI } from '../services/api'
import AiMarkdown from '../components/ai/AiMarkdown'
import AiChart from '../components/ai/AiChart'
import AiHistoricalChart from '../components/ai/AiHistoricalChart'
import AiFileCard from '../components/ai/AiFileCard'
import AiBillCard from '../components/ai/AiBillCard'
import AiDashboard from '../components/ai/AiDashboard'
import AiActionCard from '../components/ai/AiActionCard'
import AiWorkingSteps from '../components/ai/AiWorkingSteps'
import AiNotificationsBell from '../components/ai/AiNotificationsBell'
import AiMemoryDialog from '../components/ai/AiMemoryDialog'
import AiDigestsDialog from '../components/ai/AiDigestsDialog'
import AiAlertsDialog from '../components/ai/AiAlertsDialog'
import AiPinnedHome from '../components/ai/AiPinnedHome'
import AiClientPanel from '../components/ai/AiClientPanel'
import AiCommandPalette from '../components/ai/AiCommandPalette'
import AiTokenDialog from '../components/ai/AiTokenDialog'
import AiFeedbackDialog from '../components/ai/AiFeedbackDialog'
import AiConversationList from '../components/ai/AiConversationList'

const MAX_ATTACHMENTS = 5

const STARTERS = [
  { title: 'Margin watch', text: 'Which clients currently need my attention because of low margin level?' },
  { title: 'Daily pulse', text: 'Give me a concise summary of today\'s trading activity and P&L.' },
  { title: 'Client lookup', text: 'Show me the most important details for client login' }
]

// Matches the reference app's fmtTok(): 3600 -> "3.6k", 420 -> "420".
const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n))
const initialsOf = (name) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()

// navigator.clipboard only exists in secure contexts (HTTPS or localhost) — a plain-http LAN
// dev URL (e.g. http://192.168.x.x:3001) doesn't have it, so "Copy" would silently no-op there.
// Same fallback the reference app uses: a hidden textarea + document.execCommand('copy').
const legacyCopy = (text) => new Promise((resolve, reject) => {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  document.body.appendChild(ta)
  ta.focus(); ta.select(); ta.setSelectionRange(0, text.length)
  let done = false
  try { done = document.execCommand('copy') } catch { /* execCommand itself can throw; treated as failure below. */ }
  ta.remove()
  done ? resolve() : reject(new Error('Copy not permitted'))
})
const writeClipboard = (text) => {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(() => legacyCopy(text))
  return legacyCopy(text)
}

const formatTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Pulls a plain-text excerpt out of a message's parts, for the reply-quote bar and for seeding
// a pinned answer's "last result" text.
// User messages only ever have `.text`; assistant messages carry their prose inside `.parts`.
const plainTextOf = (message) => (message?.parts
  ? message.parts.filter(p => p.kind === 'text').map(p => p.text).join('\n')
  : message?.text || ''
).trim()

// Strips a "> quoted text\n\n" reply-quote prefix off a user message's raw text, so Retry and
// Pin resend/capture only the actual question, same as the reference app's splitQuote().
const stripQuote = (text) => {
  const m = /^((?:> ?.*\n?)+)\n+([\s\S]*)$/.exec(text || '')
  return m ? m[2] : (text || '')
}

function MessageBubble({ message, isLast, question, onFeedback, onConfirm, onCancel, actionBusy, onReply, onPin, onRetry, onAsk, onPrefill, onOpenClient, onCopy, onEditResend, onSave, onSchedule }) {
  const isUser = message.role === 'user'
  if (isUser) {
    return (
      <div className="flex min-w-0 justify-end">
        <div className="flex min-w-0 max-w-[88%] flex-col items-end">
          <div className="mb-1 flex items-baseline gap-2 px-1 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">You</span>
            <span>{formatTime(message.createdAt)}</span>
          </div>
          {message.replyTo && (
            <div className="mb-1 max-w-full rounded-md border-l-2 border-blue-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-500">
              <span className="line-clamp-2 whitespace-pre-wrap">{message.replyTo}</span>
            </div>
          )}
          <div className="max-w-3xl rounded-xl border border-blue-300 bg-blue-50 px-4 py-1.5 text-sm leading-6 text-black">{message.text}</div>
          <div className="mt-1.5 flex items-center gap-1 px-1">
            <button type="button" onClick={() => onReply(message)} aria-label="Reply" title="Reply" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            </button>
            <button type="button" onClick={() => onCopy(message)} aria-label="Copy" title="Copy" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            </button>
            <button type="button" onClick={() => onEditResend(message)} aria-label="Edit and resend" title="Edit and resend" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
            <button type="button" onClick={() => onSave(message)} title="Keep this question under Saved questions" className="ml-1 h-7 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50">Save</button>
            <button type="button" onClick={() => onSchedule(message)} title="Run this on a schedule as a digest" className="h-7 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50">Schedule</button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 justify-start">
      <div className="flex min-w-0 max-w-[88%] flex-col items-start gap-3 max-md:w-full max-md:max-w-full">
        {message.status === 'streaming' && <AiWorkingSteps steps={message.steps} stage={message.stage} />}
        {(message.parts || []).map((part, i) => {
          if (part.kind === 'text') return part.text ? <AiMarkdown key={i} text={part.text} className={message.status === 'error' ? 'text-red-700' : ''} onOpenClient={onOpenClient} onAsk={onAsk} onPrefill={onPrefill} /> : null
          if (part.kind === 'chart') return <AiChart key={i} id={part.id} title={part.title} url={part.url} />
          if (part.kind === 'historicalChart') return <AiHistoricalChart key={i} spec={part.spec} />
          if (part.kind === 'file') return <AiFileCard key={i} {...part} />
          if (part.kind === 'bill') return <AiBillCard key={i} data={part.data} />
          if (part.kind === 'dashboard') return <AiDashboard key={i} data={part.data} />
          if (part.kind === 'action') return <AiActionCard key={i} action={part.action} onConfirm={onConfirm} onCancel={onCancel} busy={actionBusy === part.action.id} />
          return null
        })}
        {message.status !== 'streaming' && (
          <div className="flex items-center gap-1 px-1">
            <span className="mr-1 text-[11px] text-slate-400">{formatTime(message.created_at || message.createdAt)}</span>
            <button type="button" onClick={() => onCopy(message)} aria-label="Copy answer" title="Copy answer" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            </button>
            <button type="button" onClick={() => onFeedback(message, 1)} aria-label="Good answer" title="Good answer" className={`flex h-7 w-7 items-center justify-center rounded-md ${message.rating === 1 ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 11v10H4V11h3Zm3 10h7a3 3 0 0 0 3-2.6l1-6A3 3 0 0 0 18 9h-5l1-4a2 2 0 0 0-3.6-1.5L10 9" /></svg>
            </button>
            <button type="button" onClick={() => onFeedback(message, -1)} aria-label="Something was wrong" title="Something was wrong" className={`flex h-7 w-7 items-center justify-center rounded-md ${message.rating === -1 ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 13V3h3v10h-3Zm-3-10H7a3 3 0 0 0-3 2.6l-1 6A3 3 0 0 0 6 15h5l-1 4a2 2 0 0 0 3.6 1.5L14 15" /></svg>
            </button>
            <button type="button" onClick={() => onReply(message)} aria-label="Reply" title="Reply" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
            </button>
            {!!question && (
              <button type="button" onClick={() => onRetry(question)} aria-label="Retry" title="Retry" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
              </button>
            )}
            {!!question && !!plainTextOf(message) && (
              <button type="button" disabled={!!message.pinned} onClick={() => onPin(message, question)} title={message.pinned ? 'Pinned to Home' : 'Pin this answer to Home; it refreshes itself'} className="ml-1 h-7 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent">{message.pinned ? 'Pinned' : 'Pin'}</button>
            )}
          </div>
        )}
        {isLast && message.suggestions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.suggestions.map((s, i) => (
              <button key={i} type="button" onClick={() => onAsk(s)} className="rounded-md border border-slate-200 bg-blue-50 px-2.5 py-1.5 text-xs text-slate-600 hover:border-slate-300">{s}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AskAIPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [appMenuOpen, setAppMenuOpen] = useState(false)
  const [conversationsOpen, setConversationsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [conversations, setConversations] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [attachments, setAttachments] = useState([])
  const [actionBusy, setActionBusy] = useState(null)
  const [conversationSearch, setConversationSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [replyTarget, setReplyTarget] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [pins, setPins] = useState([])
  const [me, setMe] = useState(null)
  const [tokensToday, setTokensToday] = useState(0)
  const [saved, setSaved] = useState([])
  const [toastMsg, setToastMsg] = useState('')
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [digestsOpen, setDigestsOpen] = useState(false)
  const [digestPrefill, setDigestPrefill] = useState('')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [clientLogin, setClientLogin] = useState(null)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [feedbackTarget, setFeedbackTarget] = useState(null)
  const scrollRef = useRef(null)
  const abortRef = useRef(null)
  const fileRef = useRef(null)
  const composerRef = useRef(null)
  const conversationSearchRef = useRef(null)
  const moreRef = useRef(null)
  const mobileMoreRef = useRef(null)

  useEffect(() => {
    if (!searchOpen) return undefined
    const focusSearch = () => conversationSearchRef.current?.focus()
    focusSearch()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setConversationSearch('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  // Ctrl+K / Cmd+K opens the command palette from anywhere on this page.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(v => !v) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!moreOpen) return undefined
    const onDoc = (e) => {
      if (!moreRef.current?.contains(e.target) && !mobileMoreRef.current?.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [moreOpen])

  const loadConversations = async (selectLatest = true) => {
    const result = await aiAPI.getConversations()
    const list = result.conversations || []
    setConversations(list)
    if (selectLatest && !conversationId && list[0]?.id) setConversationId(list[0].id)
  }

  useEffect(() => {
    let active = true
    // Captured once at mount: if this page load came from the "Ask AI" nav's forced-new-chat
    // signal, don't let the just-loaded conversation list auto-select and override that reset
    // once this fetch resolves (it used to win the race, silently restoring the last chat).
    const skipAutoSelect = !!location.state?.newChat
    aiAPI.getMe().then(m => active && setMe(m)).catch(() => {})
    Promise.all([aiAPI.getConversations(), aiAPI.getPins().catch(() => ({ pins: [] })), aiAPI.getSaved().catch(() => ({ saved: [] }))])
      .then(([conversationResult, pinsResult, savedResult]) => {
        if (!active) return
        const list = conversationResult.conversations || []
        setConversations(list)
        if (!skipAutoSelect) setConversationId(list[0]?.id || null)
        const usage = conversationResult.usage_today
        if (usage) setTokensToday((usage.input_tokens || 0) + (usage.output_tokens || 0))
        setPins(pinsResult.pins || [])
        setSaved(savedResult.saved || [])
      })
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => { active = false; abortRef.current?.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Converts stored transcript messages (reload of a past conversation) into the same
  // { parts, actions, suggestions } shape sendMessage builds live, so MessageBubble doesn't
  // need two code paths.
  // GET /ai/conversations/{id}/messages (store.load_transcript) returns a different shape than
  // the live SSE stream: tool-call rounds are collapsed and their chart/bill/file/dashboard
  // results are attached to the message as raw.charts/bills/files/dashboards/actions instead of
  // being separate events. Reopening an old conversation was previously only showing raw.text —
  // every dashboard, bill, chart and pending action it had was silently dropped.
  const hydrateMessage = (raw) => {
    if (raw.role === 'user') return { role: 'user', text: raw.text || raw.display_text || raw.content || '', createdAt: raw.created_at, seq: raw.seq }
    const text = raw.text || raw.display_text || raw.content || ''
    const parts = []
    if (text) parts.push({ kind: 'text', text })
    ;(raw.dashboards || []).forEach(data => parts.push({ kind: 'dashboard', data }))
    ;(raw.bills || []).forEach(data => parts.push({ kind: 'bill', data }))
    // Charts only survive as the data they were drawn from (the rendered PNG expires after
    // about an hour) — redrawn client-side instead of linked to a file that's likely gone.
    ;(raw.charts || []).forEach(c => c.spec && parts.push({ kind: 'historicalChart', spec: c.spec }))
    ;(raw.files || []).forEach(file => parts.push({ kind: 'file', filename: file.filename, format: file.format, rows: file.rows, bytes: file.bytes, url: file.url }))
    ;(raw.actions || []).forEach(action => parts.push({ kind: 'action', action }))
    return { role: 'assistant', status: 'done', parts, created_at: raw.created_at, seq: raw.seq }
  }

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return undefined
    }
    // A brand-new chat's first reply assigns conversationId mid-stream (the SSE 'meta' event),
    // while the live, actively-streaming messages array is still the only authoritative copy —
    // it hasn't been persisted with all its parts yet. Re-fetching here would race the stream and
    // overwrite that in-progress assistant message with an incomplete/hydrated one lacking the
    // `steps` field updateLast() depends on, crashing the next tool_start/tool_end event.
    if (sending) return undefined
    let active = true
    setError('')
    aiAPI.getMessages(conversationId)
      .then(result => active && setMessages((result.messages || []).filter(m => m.role === 'user' || m.role === 'assistant').map(hydrateMessage)))
      .catch(err => active && setError(err.message))
    return () => { active = false }
    // Deliberately conversationId-only: this must react to switching conversations, not to
    // `sending` toggling back to false once a stream finishes (that would re-fetch right as the
    // live message finishes rendering and risk swapping it for a slightly different hydrated copy).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, sending])

  // Appends to (or starts) the trailing text part so streamed deltas read as one continuous
  // paragraph even when a tool call's chart/bill/action lands in between.
  const appendText = (parts, delta) => {
    const next = [...parts]
    const last = next[next.length - 1]
    if (last?.kind === 'text') next[next.length - 1] = { ...last, text: last.text + delta }
    else next.push({ kind: 'text', text: delta })
    return next
  }

  const sendMessage = async (event, overrideText) => {
    event?.preventDefault()
    const typed = (overrideText ?? draft).trim()
    if (!typed || sending) return
    const quoted = (overrideText == null && replyTarget) ? plainTextOf(replyTarget) : ''
    const message = quoted ? `> ${quoted.split('\n').join('\n> ')}\n\n${typed}` : typed
    setDraft('')
    setReplyTarget(null)
    setError('')
    setSending(true)
    const userMessage = { role: 'user', text: typed, replyTo: quoted || null, createdAt: new Date().toISOString() }
    const assistantMessage = { role: 'assistant', parts: [], steps: [], stage: 'Thinking...', suggestions: [], status: 'streaming', createdAt: new Date().toISOString() }
    setMessages(current => [...current, userMessage, assistantMessage])
    const controller = new AbortController()
    abortRef.current = controller
    const updateLast = (fn) => setMessages(current => current.map((item, index) => index === current.length - 1 ? fn(item) : item))
    let currentConversationId = conversationId
    let textPartCount = 0
    try {
      await aiAPI.streamChat({ message, conversation_id: conversationId || undefined, attachments: attachments.length ? attachments.map(a => a.id) : undefined }, eventData => {
        switch (eventData.type) {
          case 'meta':
            currentConversationId = eventData.conversation_id || currentConversationId
            if (currentConversationId) setConversationId(currentConversationId)
            break
          case 'tool_start':
            updateLast(item => ({ ...item, steps: [...item.steps, { name: eventData.name, ok: null }], stage: 'Thinking...' }))
            break
          case 'progress':
            updateLast(item => ({ ...item, stage: eventData.text || '' }))
            break
          case 'tool_end':
            updateLast(item => ({ ...item, steps: item.steps.map(s => (s.ok === null && s.name === eventData.name) ? { ...s, ok: eventData.ok } : s), stage: 'Thinking...' }))
            break
          case 'text':
            textPartCount += 1
            updateLast(item => ({ ...item, parts: appendText(item.parts, eventData.delta || ''), stage: 'Generating...' }))
            break
          case 'chart':
            updateLast(item => ({ ...item, parts: [...item.parts, { kind: 'chart', id: eventData.id, title: eventData.title, url: eventData.url }] }))
            break
          case 'bill':
            updateLast(item => ({ ...item, parts: [...item.parts, { kind: 'bill', data: eventData.data }] }))
            break
          case 'file':
            updateLast(item => ({ ...item, parts: [...item.parts, { kind: 'file', filename: eventData.filename, format: eventData.format, rows: eventData.rows, bytes: eventData.bytes, url: eventData.url }] }))
            break
          case 'dashboard':
            updateLast(item => ({ ...item, parts: [...item.parts, { kind: 'dashboard', data: eventData.data }] }))
            break
          case 'action':
            updateLast(item => ({ ...item, parts: [...item.parts, { kind: 'action', action: eventData.action }] }))
            break
          case 'suggestions':
            updateLast(item => ({ ...item, suggestions: eventData.items || [] }))
            break
          case 'title':
            if (currentConversationId && eventData.title) {
              setConversations(prev => prev.some(c => c.id === currentConversationId)
                ? prev.map(c => c.id === currentConversationId ? { ...c, title: eventData.title } : c)
                : prev)
            }
            break
          case 'error':
            // The backend never follows an error event with 'done' (agent.py returns right after
            // yielding it) — without this, the message stays status:'streaming' forever: the
            // working-steps spinner never stops and the Copy/Retry/Pin row never appears, even
            // though sending has already flipped back to false and the rest of the chat works fine.
            setError(eventData.message || 'The assistant could not complete this request.')
            updateLast(item => ({
              ...item,
              status: 'error',
              stage: '',
              parts: item.parts.length ? item.parts : [{ kind: 'text', text: eventData.message || 'The assistant could not complete this request.' }],
            }))
            break
          case 'done':
            updateLast(item => ({
              ...item,
              status: 'done',
              stage: '',
              // Only trust the final text over the streamed deltas when nothing else interrupted it —
              // tool-call output (charts/bills/actions) splits the answer into several text parts,
              // and we can't safely tell which one the final text replaces.
              parts: textPartCount <= 1 && eventData.text ? [{ kind: 'text', text: eventData.text }, ...item.parts.filter(p => p.kind !== 'text')] : item.parts,
            }))
            break
          default:
            break
        }
      }, controller.signal)
      setAttachments([])
      // Refreshing the sidebar's conversation list is a non-critical follow-up — its own failure
      // shouldn't recolor an otherwise-successful reply red and relabel it as an error.
      loadConversations(false).catch(() => {})
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
      updateLast(item => ({ ...item, status: 'error', parts: item.parts.length ? item.parts : [{ kind: 'text', text: 'I could not reach the AI service.' }] }))
    } finally {
      setSending(false)
      abortRef.current = null
    }
  }

  // Stop an in-flight generation. The abort surfaces as an AbortError in sendMessage's
  // catch, which keeps whatever was streamed so far and marks the message "stopped".
  const stopGenerating = () => abortRef.current?.abort()

  // Put a command into the composer (without sending) and focus it, placing the cursor at
  // the first double-space gap so the broker can type the amount/minutes — e.g. "Give  credit
  // to 90023". Used by the client panel and the per-row Panel/Credit/Rule/Watch actions.
  const prefillComposer = (text) => {
    setClientLogin(null)
    setDraft(text)
    requestAnimationFrame(() => {
      const el = composerRef.current
      if (!el) return
      el.focus()
      const gap = text.indexOf('  ')
      const pos = gap >= 0 ? gap + 1 : text.length
      try { el.selectionStart = el.selectionEnd = pos } catch { /* ignore */ }
    })
  }

  const chooseConversation = (id) => {
    if (sending) return
    setConversationId(id)
    setConversationsOpen(false)
  }

  const newConversation = () => {
    if (sending) return
    setConversationId(null)
    setMessages([])
    setError('')
    setReplyTarget(null)
    setConversationsOpen(false)
  }

  // The sidebar's "Ask AI" link always means "start a new chat" — including when you're already
  // on this page, where a plain route navigation wouldn't remount or reset anything by itself.
  useEffect(() => {
    if (location.state?.newChat) newConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.newChat])

  const visibleConversations = conversations.filter(item => (item.title || 'Untitled conversation').toLowerCase().includes(conversationSearch.trim().toLowerCase()))
  const visibleSaved = saved.filter(item => `${item.title} ${item.question}`.toLowerCase().includes(conversationSearch.trim().toLowerCase()))

  const toastTimerRef = useRef(null)
  const showToast = (msg) => {
    setToastMsg(msg)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMsg(''), 2200)
  }
  useEffect(() => () => clearTimeout(toastTimerRef.current), [])

  const deleteConversation = async (id) => {
    try {
      await aiAPI.archiveConversation(id)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (id === conversationId) newConversation()
    } catch (err) { setError(err.message) }
  }

  const attachOne = async (file) => {
    if (attachments.length >= MAX_ATTACHMENTS) return
    const tempId = `pending-${Date.now()}-${file.name}`
    const isImage = (file.type || '').startsWith('image/')
    const previewUrl = isImage ? URL.createObjectURL(file) : null
    setAttachments(prev => [...prev, { id: tempId, filename: file.name, pending: true, isImage, previewUrl }])
    try {
      const uploaded = await aiAPI.uploadFile(file)
      setAttachments(prev => prev.map(a => a.id === tempId ? { ...uploaded, isImage, previewUrl } : a))
    } catch (err) {
      setError(err.message)
      setAttachments(prev => prev.filter(a => a.id !== tempId))
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }
  const attachFiles = (fileList) => Array.from(fileList || []).slice(0, MAX_ATTACHMENTS - attachments.length).forEach(attachOne)
  const onFileInputChange = (event) => { attachFiles(event.target.files); event.target.value = '' }
  const removeAttachment = (id) => setAttachments(prev => {
    const gone = prev.find(a => a.id === id)
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
    return prev.filter(a => a.id !== id)
  })

  // Paste images/screenshots straight into the composer (Ctrl/Cmd+V from a screenshot
  // tool or a copied image). Non-image clipboard content falls through to normal paste.
  const onComposerPaste = (event) => {
    const items = Array.from(event.clipboardData?.items || [])
    const images = items.filter(it => it.kind === 'file' && (it.type || '').startsWith('image/'))
    if (!images.length) return
    event.preventDefault()
    const files = images.map(it => {
      const blob = it.getAsFile()
      if (!blob) return null
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const named = blob.name && blob.name !== 'image.png' ? blob.name : `screenshot-${Date.now()}.${ext}`
      return new File([blob], named, { type: blob.type })
    }).filter(Boolean)
    if (files.length) attachFiles(files)
  }

  const feedback = async (message, rating, comment = '') => {
    if (rating < 0 && !comment) { setFeedbackTarget(message); return }
    setMessages(current => current.map(m => (m === message ? { ...m, rating } : m)))
    try {
      const r = await aiAPI.sendFeedback({ rating, comment, conversation_id: conversationId, message_seq: message.seq })
      showToast(rating > 0 ? 'Thanks for the feedback' : (r?.proposed_rule ? 'Thanks. Proposed to the admins as a rule' : 'Thanks. Your note was sent to the admins'))
    } catch { /* Feedback should never interrupt the conversation. */ }
  }

  const sendFeedbackComment = (comment) => {
    const target = feedbackTarget
    setFeedbackTarget(null)
    if (target) feedback(target, -1, comment)
  }

  const retryMessage = (question) => sendMessage(null, question)

  const resolveAction = async (actionId, method) => {
    setActionBusy(actionId)
    try {
      const result = await method(actionId)
      setMessages(current => current.map(message => ({
        ...message,
        parts: (message.parts || []).map(part => part.kind === 'action' && part.action.id === actionId ? { ...part, action: result } : part),
      })))
    } catch (err) { setError(err.message) } finally { setActionBusy(null) }
  }

  const lastUserQuestion = useMemo(() => [...messages].reverse().find(m => m.role === 'user')?.text || '', [messages])

  const pinMessage = async (message, question) => {
    const text = plainTextOf(message)
    const q = question || lastUserQuestion
    try {
      const r = await aiAPI.addPin(q.slice(0, 80), q, text)
      setPins(r.pins || [])
      setMessages(current => current.map(m => (m === message ? { ...m, pinned: true } : m)))
      showToast(r.item?.existing ? 'Already pinned' : 'Pinned to Home')
    } catch (err) { showToast(`Could not pin: ${err.message}`) }
  }

  const askFromPalette = (question) => { setPaletteOpen(false); sendMessage(null, question) }

  // The reference app's per-user-message action row: Reply/Copy/Edit & resend, plus Save
  // (reusable question) and Schedule (turn this exact question into a recurring digest).
  const copyMessage = (message) => { writeClipboard(plainTextOf(message)).then(() => showToast('Copied'), () => showToast('Could not copy: select the text and press Ctrl+C')) }
  const editAndResend = (message) => { setDraft(message.text); requestAnimationFrame(() => composerRef.current?.focus()) }
  const saveQuestion = async (message) => {
    try {
      // No title: the backend derives one from the question itself (whitespace-collapsed, 80
      // chars), same as the reference app's saveQuestion().
      const r = await aiAPI.addSaved('', message.text)
      setSaved(r.saved || [])
      showToast(r.item?.existing ? 'Already saved' : 'Saved under Saved questions')
    } catch (err) { setError(err.message) }
  }
  const deleteSaved = async (id) => {
    try { const r = await aiAPI.deleteSaved(id); setSaved(r.saved || []) } catch (err) { showToast(err.message) }
  }
  const scheduleQuestion = (message) => { setDigestPrefill(message.text); setDigestsOpen(true) }

  return (
    <div className="ask-ai-page flex h-screen overflow-hidden bg-white">
      <Sidebar mobileOnly isOpen={appMenuOpen} onClose={() => setAppMenuOpen(false)} onToggle={() => setAppMenuOpen(value => !value)} />
      <main className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1">
          <aside className={`${historyOpen ? 'w-72 px-4' : 'w-11 px-1'} hidden shrink-0 overflow-hidden border-r border-slate-200 bg-white py-5 transition-all duration-200 md:flex md:flex-col`}>
            {historyOpen && (
              <button type="button" onClick={() => navigate('/client2')} className="group mb-3 flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12.5px] font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700" title="Back to BrokerEye App">
                <svg className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="truncate">Back to BrokerEye App</span>
              </button>
            )}
            <div className={`${historyOpen ? '' : 'relative h-full justify-center'} flex items-center justify-between gap-2 px-1`}>
              <div className={`${historyOpen ? 'flex' : 'hidden'} min-w-0 flex-1 items-center gap-2`}>
                <AskAiIcon className="h-7 w-7 shrink-0" />
                <p className="truncate text-[15px] font-bold tracking-tight text-slate-900">BrokerEye AI</p>
              </div>
              <div className={`${historyOpen ? 'flex shrink-0' : 'absolute left-1/2 top-0 -translate-x-1/2'} items-center gap-1`}>
                <button type="button" onClick={() => setSearchOpen(true)} className={`${historyOpen ? 'flex' : 'hidden'} h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-blue-50 hover:text-blue-600`} aria-label="Search conversations" title="Search conversations">
                  <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                </button>
                <button type="button" onClick={() => setHistoryOpen(value => !value)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-blue-50 hover:text-blue-600" aria-label={historyOpen ? 'Close conversation history' : 'Open conversation history'} title={historyOpen ? 'Close conversation history' : 'Open conversation history'}>
                  <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M9 4v16" stroke="currentColor" strokeWidth="2" /></svg>
                </button>
              </div>
            </div>
            {historyOpen && <>
            <button type="button" onClick={newConversation} className="mt-5 flex items-center gap-2.5 rounded-lg bg-slate-100 px-3 py-2.5 text-left text-[12px] font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"><svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> New chat</button>
            {searchOpen && <div className="relative mt-3"><label className="block"><span className="sr-only">Search conversations</span><svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg><input ref={conversationSearchRef} value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder="Search conversations" className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /></label><button type="button" onClick={() => { setSearchOpen(false); setConversationSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Close search" title="Close search"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></div>}
            <button type="button" onClick={() => setConversationsOpen(true)} className="mt-3 flex w-full items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2 text-left text-[11px] font-semibold text-slate-700 hover:bg-slate-100" aria-label="Select current conversation"><span className="truncate">{conversationId ? conversations.find(item => item.id === conversationId)?.title || 'Current conversation' : 'New conversation'}</span><svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 9 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            <div className="history-edge-scrollbar compact-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
              {!loading && <AiConversationList conversations={visibleConversations} saved={visibleSaved} activeId={conversationId} searchActive={!!conversationSearch.trim()} onSelect={chooseConversation} onDelete={deleteConversation} onAskSaved={text => sendMessage(null, text)} onDeleteSaved={deleteSaved} />}
            </div>
            <div className="mt-3 shrink-0 border-t border-slate-100 pt-3">
              <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-3 py-2.5 shadow-sm">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-[13px] font-semibold text-white shadow-sm shadow-blue-200">
                  {me ? initialsOf(me.display_name || me.username || `Broker ${me.broker_id}`) : '?'}
                  {me && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold text-slate-800">{me ? (me.display_name || me.username || `Broker ${me.broker_id}`) : 'Not signed in'}</b>
                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" /></svg>
                    {me ? 'Broker' : 'Click to sign in'}
                  </span>
                </div>
              </div>
            </div>
            </>}
          </aside>
          <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="ask-ai-mobile-backbar ask-ai-mobile-header flex shrink-0 items-center gap-1 border-b border-slate-100 bg-white px-3 pb-2.5 md:hidden">
              <button type="button" onClick={() => navigate('/client2')} className="group mr-auto flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-blue-600 transition hover:bg-blue-50 hover:text-blue-700" title="Back to BrokerEye App" aria-label="Back to BrokerEye App">
                <svg className="h-[17px] w-[17px] shrink-0 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>Back to <span className="font-bold">BrokerEye</span></span>
              </button>
              <button type="button" onClick={() => setConversationsOpen(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Open conversation history" title="Open conversation history">
                <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" /></svg>
              </button>
              <button type="button" onClick={() => setPaletteOpen(true)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Search" title="Search">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
              <AiNotificationsBell />
              <button type="button" onClick={newConversation} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700" aria-label="Start new conversation" title="New chat"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <div className="relative" ref={mobileMoreRef}>
                <button type="button" onClick={() => setMoreOpen(value => !value)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="More options" title="More options">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                </button>
                {moreOpen && (
                  <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {[
                      ['Alerts', <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />, () => setAlertsOpen(true)],
                      ['Digests', <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="m9 15 2 2 4-4" /></>, () => setDigestsOpen(true)],
                      ['Memory', <path d="M12 3a4 4 0 0 0-4 4v1.2A4 4 0 0 0 5 12a4 4 0 0 0 2 3.5V17a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-1.5A4 4 0 0 0 19 12a4 4 0 0 0-3-3.8V7a4 4 0 0 0-4-4ZM12 3v17" />, () => setMemoryOpen(true)],
                    ].map(([label, icon, run]) => (
                      <button key={label} type="button" onClick={() => { setMoreOpen(false); run() }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-50">
                        <svg className="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Desktop-only top strip: command palette + a "more" menu for Memory/Alerts/Digests/Client lookup */}
            <div className="hidden shrink-0 items-center justify-end gap-2 border-b border-slate-100 bg-white px-4 py-2 md:flex">
              <AiNotificationsBell />
              <button type="button" onClick={() => setPaletteOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600" aria-label="Search" title="Search (Ctrl K)">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
              <div className="relative" ref={moreRef}>
                <button type="button" onClick={() => setMoreOpen(v => !v)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="More">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                </button>
                {moreOpen && (
                  <div className="absolute right-0 top-9 z-40 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {[
                      ['Alerts', <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />, () => setAlertsOpen(true)],
                      ['Digests', <><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="m9 15 2 2 4-4" /></>, () => setDigestsOpen(true)],
                      ['Memory', <path d="M12 3a4 4 0 0 0-4 4v1.2A4 4 0 0 0 5 12a4 4 0 0 0 2 3.5V17a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-1.5A4 4 0 0 0 19 12a4 4 0 0 0-3-3.8V7a4 4 0 0 0-4-4ZM12 3v17" />, () => setMemoryOpen(true)],
                    ].map(([label, icon, run]) => (
                      <button key={label} type="button" onClick={() => { setMoreOpen(false); run() }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50">
                        <svg className="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {conversationsOpen && (
              <div className="fixed inset-0 z-[70] md:hidden">
                <button type="button" className="absolute inset-0 bg-slate-900/20" onClick={() => setConversationsOpen(false)} aria-label="Close conversations" />
                <aside className="ask-ai-mobile-drawer relative flex h-full w-[min(84vw,320px)] flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2"><button type="button" onClick={() => setConversationsOpen(false)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-blue-600" aria-label="Close conversation history" title="Close conversation history"><svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M9 4v16" stroke="currentColor" strokeWidth="1.8" /></svg></button><span className="flex h-9 w-9 shrink-0 items-center justify-center"><AskAiIcon className="h-7 w-7" /></span><p className="min-w-0 truncate text-[15px] font-bold tracking-tight text-slate-900">BrokerEye AI</p></div>
                    <button type="button" onClick={() => setSearchOpen(true)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600" aria-label="Search conversations" title="Search conversations"><svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
                  </div>
                  <button type="button" onClick={newConversation} className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2.5 text-[12px] font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"><svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> New chat</button>
                  {searchOpen && <div className="relative mt-3"><label className="block"><span className="sr-only">Search conversations</span><input ref={conversationSearchRef} value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder="Search conversations" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 pr-8 text-[11px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" /></label><button type="button" onClick={() => { setSearchOpen(false); setConversationSearch('') }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="Close search" title="Close search"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button></div>}
                  <div className="history-edge-scrollbar compact-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
                    {!loading && <AiConversationList conversations={visibleConversations} saved={visibleSaved} activeId={conversationId} searchActive={!!conversationSearch.trim()} onSelect={chooseConversation} onDelete={deleteConversation} onAskSaved={text => sendMessage(null, text)} onDeleteSaved={deleteSaved} />}
                  </div>
                  <div className="mt-2.5 shrink-0 border-t border-slate-100 pt-2.5">
                    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white px-3 py-2.5 shadow-sm">
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-[13px] font-semibold text-white shadow-sm shadow-blue-200">
                        {me ? initialsOf(me.display_name || me.username || `Broker ${me.broker_id}`) : '?'}
                        {me && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[13.5px] font-semibold text-slate-800">{me ? (me.display_name || me.username || `Broker ${me.broker_id}`) : 'Not signed in'}</b>
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                          <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" /></svg>
                          {me ? 'Broker' : 'Click to sign in'}
                        </span>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            <div className="flex min-h-0 flex-1">
              <div
                ref={scrollRef}
                className="ask-ai-mobile-scroll compact-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); attachFiles(e.dataTransfer.files) }}
              >
                {!messages.length ? (
                  <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center">
                    <div className="mb-8">
                      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center"><AskAiIcon className="h-11 w-11" /></div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Live broker intelligence</p>
                      <h2 className="text-3xl font-bold tracking-tight text-slate-900">A sharper view of your trading desk.</h2>
                      <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Ask about clients, positions, margin, deals, credits, or reports. The assistant uses your existing Broker Eye permissions and live data.</p>
                    </div>
                    {pins.length > 0 && <div className="mb-6"><AiPinnedHome pins={pins} onChange={setPins} onAsk={text => sendMessage(null, text)} /></div>}
                    <div className="grid gap-3 sm:grid-cols-3">
                      {STARTERS.map(starter => <button key={starter.title} type="button" onClick={() => setDraft(starter.text)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><p className="text-sm font-semibold text-slate-800">{starter.title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{starter.text}</p></button>)}
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto min-w-0 max-w-5xl space-y-6">
                    {messages.map((message, index) => (
                      <MessageBubble
                        key={`${message.seq || index}-${index}`}
                        message={message}
                        isLast={index === messages.length - 1}
                        question={message.role === 'assistant' && messages[index - 1]?.role === 'user' ? stripQuote(messages[index - 1].text) : ''}
                        onFeedback={feedback}
                        onConfirm={id => resolveAction(id, aiAPI.confirmAction)}
                        onCancel={id => resolveAction(id, aiAPI.cancelAction)}
                        actionBusy={actionBusy}
                        onReply={setReplyTarget}
                        onPin={pinMessage}
                        onRetry={retryMessage}
                        onAsk={text => sendMessage(null, text)}
                        onPrefill={prefillComposer}
                        onOpenClient={setClientLogin}
                        onCopy={copyMessage}
                        onEditResend={editAndResend}
                        onSave={saveQuestion}
                        onSchedule={scheduleQuestion}
                      />
                    ))}
                  </div>
                )}
                {dragOver && <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-blue-50/80"><p className="rounded-xl border-2 border-dashed border-blue-400 bg-white px-6 py-4 text-sm font-semibold text-blue-700">Drop to attach</p></div>}
              </div>
              {clientLogin && <AiClientPanel login={clientLogin} onClose={() => setClientLogin(null)} onAsk={text => { setClientLogin(null); sendMessage(null, text) }} onPrefill={prefillComposer} />}
            </div>

            <div className={`ask-ai-composer bg-white px-3 pb-4 pt-2 sm:px-8 sm:pb-5 sm:pt-3 ${clientLogin ? 'max-md:hidden' : ''}`}>
              <div className="mx-auto max-w-5xl">
                {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
                {replyTarget && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-200 border-l-[3px] border-l-blue-400 bg-white px-3 py-1.5 text-xs text-slate-600">
                    <b className="shrink-0 text-slate-700">Replying to</b>
                    <span className="min-w-0 flex-1 truncate">{plainTextOf(replyTarget)}</span>
                    <button type="button" onClick={() => setReplyTarget(null)} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Cancel reply">✕</button>
                  </div>
                )}
                <form onSubmit={sendMessage} className="flex min-h-[52px] flex-col rounded-[20px] border border-blue-300 bg-white px-3 py-2 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 sm:px-4">
                  <input ref={fileRef} type="file" accept="image/*,.csv,.xlsx,.xls,.xlsm,.tsv,.txt,.log" multiple onChange={onFileInputChange} className="hidden" />
                  {attachments.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{attachments.map(a => <div key={a.id} className={`flex max-w-full items-center gap-2 rounded-lg border py-1.5 pl-1.5 pr-2.5 text-xs ${a.pending ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>{a.isImage && a.previewUrl ? <img src={a.previewUrl} alt="" className={`h-7 w-7 shrink-0 rounded object-cover ${a.pending ? 'opacity-60' : ''}`} /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/70"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3v5h5M8 3h7l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg></span>}<span className="max-w-[180px] truncate font-medium">{a.filename}</span>{a.pending && <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" /><path d="M20 12a8 8 0 0 1-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>}<button type="button" onClick={() => removeAttachment(a.id)} aria-label="Remove attachment" className="shrink-0 font-semibold hover:text-blue-900">✕</button></div>)}</div>}
                  <div className="flex min-w-0 items-end gap-2">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 disabled:opacity-40" aria-label="Attach file" title="Attach file">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                    <textarea ref={composerRef} value={draft} onChange={event => setDraft(event.target.value)} onPaste={onComposerPaste} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event) } else if (event.key === 'Escape' && sending) { event.preventDefault(); stopGenerating() } }} rows={1} placeholder="Ask Broker Eye" className="max-h-32 min-h-[30px] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[15px] leading-6 text-slate-800 outline-none placeholder:text-slate-400" />
                    {sending ? (
                      <button type="button" onClick={stopGenerating} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-700" aria-label="Stop generating" title="Stop generating">
                        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>
                      </button>
                    ) : (
                      <button type="submit" disabled={!draft.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400" aria-label="Send message" title="Send">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </section>
        </div>
      </main>

      <AiMemoryDialog open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <AiTokenDialog
        open={tokenOpen}
        onClose={() => setTokenOpen(false)}
        onSaved={() => {
          // The pasted token may belong to a different broker — reload everything that was
          // fetched under the old one instead of leaving stale data on screen.
          newConversation()
          aiAPI.getMe().then(setMe).catch(() => setMe(null))
          loadConversations(false).catch(() => {})
          showToast('Token saved')
        }}
      />
      <AiFeedbackDialog open={!!feedbackTarget} onClose={() => setFeedbackTarget(null)} onSend={sendFeedbackComment} />
      <AiAlertsDialog open={alertsOpen} onClose={() => setAlertsOpen(false)} />
      <AiDigestsDialog open={digestsOpen} onClose={() => { setDigestsOpen(false); setDigestPrefill('') }} onRan={id => { setConversationId(id); loadConversations(false).catch(() => {}) }} initialPrompt={digestPrefill} />
      <AiCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conversations={conversations}
        saved={saved}
        onSelectConversation={chooseConversation}
        onAsk={askFromPalette}
        onNewConversation={newConversation}
        onOpenMemory={() => setMemoryOpen(true)}
        onOpenAlerts={() => setAlertsOpen(true)}
        onOpenDigests={() => setDigestsOpen(true)}
      />
      {toastMsg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[110] flex justify-center">
          <div className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toastMsg}</div>
        </div>
      )}
    </div>
  )
}
