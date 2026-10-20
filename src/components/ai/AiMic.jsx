import { useEffect, useRef, useState } from 'react'
import { aiAPI } from '../../services/api'

// Voice question: record with MediaRecorder, send the raw audio to /ai/transcribe, hand the
// text back. Hidden entirely when the server has no STT configured (/ai/transcribe/status).
const AiMic = ({ onTranscript, disabled }) => {
  const [available, setAvailable] = useState(false)
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  useEffect(() => {
    let active = true
    aiAPI.getTranscribeStatus().then(s => { if (active) setAvailable(!!s?.enabled) }).catch(() => {})
    return () => { active = false }
  }, [])

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const start = async () => {
    if (recording || busy) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const mime = ['audio/webm', 'audio/ogg', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported?.(t)) || ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorder.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stopStream()
        setRecording(false)
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 500) return // too short to be a real question
        setBusy(true)
        try {
          const out = await aiAPI.transcribeAudio(blob)
          if (out?.text) onTranscript(out.text)
        } catch { /* The composer just stays empty; the user can retry or type instead. */ }
        finally { setBusy(false) }
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch { /* Mic permission denied or unavailable — fail silently, typing still works. */ }
  }

  const stop = () => { recorderRef.current?.state === 'recording' && recorderRef.current.stop() }

  useEffect(() => () => { recorderRef.current?.state === 'recording' && recorderRef.current.stop(); stopStream() }, [])

  if (!available) return null

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled || busy}
      aria-label={recording ? 'Stop recording' : 'Ask by voice'}
      title={recording ? 'Stop recording' : 'Ask by voice'}
      className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${recording ? 'animate-pulse bg-red-50 text-red-600' : 'text-slate-500 hover:bg-slate-100 hover:text-blue-600'}`}
    >
      {busy ? (
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" /><path d="M20 12a8 8 0 0 1-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      )}
    </button>
  )
}

export default AiMic
