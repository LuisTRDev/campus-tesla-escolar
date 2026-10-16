/**
 * Modo examen: registra lo que pasa mientras el alumno rinde una evaluación
 * (salidas de la app, texto pegado, copia, pantalla completa, pantalla
 * dividida, otra pestaña, conexión y tiempo por pregunta) y lo envía en
 * lotes a quiz_log_events (script 23). La cola se guarda en el dispositivo,
 * así que nada se pierde si se corta internet o se cierra la app.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { isMissingFunction, quizLogEvents, type GuardEvent, type GuardStatus } from '@/services/integridad'
import type { QuizSettings } from '@/types'

const FLUSH_EVERY = 8_000
const MIN_AWAY_MS = 1_500

function readQueue(key: string): GuardEvent[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as GuardEvent[] } catch { return [] }
}
function writeQueue(key: string, q: GuardEvent[]) {
  try {
    if (q.length) localStorage.setItem(key, JSON.stringify(q.slice(-200)))
    else localStorage.removeItem(key)
  } catch { /* sin almacenamiento */ }
}

export function useExamGuard({ attemptId, settings, questionId, onStatus, onBlocked, demo, onEvent }: {
  attemptId: number | null
  settings: QuizSettings
  questionId: number | null
  onStatus: (s: GuardStatus) => void
  onBlocked?: (what: 'paste' | 'copy') => void
  /** Modo prueba (panel anti-trampa): los mismos detectores, pero nada se envía ni se guarda. */
  demo?: boolean
  /** Cada evento detectado, al instante (lo usa el modo prueba para mostrarlo en vivo). */
  onEvent?: (e: GuardEvent) => void
}) {
  const key = demo ? 'quiz-guard:demo' : attemptId ? `quiz-guard:${attemptId}` : ''
  const queue = useRef<GuardEvent[]>([])
  const sending = useRef(false)
  const disabled = useRef(false)
  const statusRef = useRef(onStatus)
  const blockedRef = useRef(onBlocked)
  const qRef = useRef<number | null>(questionId)
  const qStart = useRef(Date.now())
  const eventRef = useRef(onEvent)
  const demoLeaves = useRef(0)
  const [needFullscreen, setNeedFullscreen] = useState(false)
  statusRef.current = onStatus
  blockedRef.current = onBlocked
  eventRef.current = onEvent

  const push = useCallback((e: GuardEvent) => {
    if (!key) return
    const ev = { ...e, c: Date.now() }
    queue.current.push(ev)
    if (!demo) writeQueue(key, queue.current)
    eventRef.current?.(ev)
  }, [key, demo])

  const flush = useCallback(async () => {
    if (demo) {
      // Prueba: el servidor no interviene; se aplica aquí la misma regla de salidas.
      demoLeaves.current += queue.current.filter((e) => e.t === 'LEAVE').length
      queue.current = []
      const max = settings.max_leaves ?? 3
      const action = settings.leave_action ?? 'WARN'
      if (demoLeaves.current) statusRef.current({ closed: action === 'CLOSE' && demoLeaves.current >= max, leaves: demoLeaves.current, max, action })
      return
    }
    if (!attemptId || sending.current || disabled.current || !queue.current.length || !navigator.onLine) return
    sending.current = true
    const batch = queue.current.slice(0, 60)
    try {
      const status = await quizLogEvents(attemptId, batch)
      queue.current = queue.current.slice(batch.length)
      writeQueue(key, queue.current)
      statusRef.current(status)
    } catch (err) {
      if (isMissingFunction(err)) disabled.current = true // la base no tiene el script 23
    } finally {
      sending.current = false
    }
  }, [attemptId, key, demo, settings.max_leaves, settings.leave_action])

  // Tiempo en cada pregunta (solo mientras la evaluación está a la vista).
  const closeQuestion = useCallback(() => {
    const ms = Date.now() - qStart.current
    if (qRef.current && ms > 200 && !document.hidden) push({ t: 'QTIME', q: String(qRef.current), v: ms })
    qStart.current = Date.now()
  }, [push])

  useEffect(() => {
    if (questionId === qRef.current) return
    closeQuestion()
    qRef.current = questionId
  }, [questionId, closeQuestion])

  useEffect(() => {
    if (!attemptId && !demo) return
    queue.current = demo ? [] : readQueue(key)
    demoLeaves.current = 0
    let awaySince: number | null = null
    let lastCtx = 0
    let shrunk = false
    // Pantalla dividida o ventana achicada (girar el celular no cuenta).
    const orientation = () => screen.orientation?.type ?? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
    let baseWidth = window.innerWidth
    let baseOrientation = orientation()

    const goAway = () => {
      if (awaySince != null) return
      awaySince = Date.now()
      const ms = awaySince - qStart.current
      if (qRef.current && ms > 200) push({ t: 'QTIME', q: String(qRef.current), v: ms })
    }
    const comeBack = () => {
      if (awaySince == null) return
      const ms = Date.now() - awaySince
      awaySince = null
      qStart.current = Date.now()
      if (ms >= MIN_AWAY_MS) {
        push({ t: 'LEAVE', v: ms, q: qRef.current ? String(qRef.current) : undefined })
        void flush()
      }
    }
    const onVisibility = () => (document.hidden ? goAway() : comeBack())
    const onBlur = () => goAway()
    const onFocus = () => comeBack()

    const onPaste = (e: ClipboardEvent) => {
      const len = e.clipboardData?.getData('text')?.length ?? 0
      push({ t: 'PASTE', v: len, q: qRef.current ? String(qRef.current) : undefined })
      if (settings.block_paste) {
        e.preventDefault()
        blockedRef.current?.('paste')
      }
    }
    const onCopy = (e: ClipboardEvent) => {
      push({ t: 'COPY', q: qRef.current ? String(qRef.current) : undefined })
      e.preventDefault()
      blockedRef.current?.('copy')
    }
    const onContext = (e: MouseEvent) => {
      e.preventDefault()
      if (Date.now() - lastCtx > 3000) push({ t: 'CONTEXT' })
      lastCtx = Date.now()
    }
    const onFullscreen = () => {
      if (!settings.fullscreen) return
      if (!document.fullscreenElement) {
        push({ t: 'FS_EXIT' })
        setNeedFullscreen(true)
      } else setNeedFullscreen(false)
    }
    let resizeTimer = 0
    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        if (orientation() !== baseOrientation) {
          baseOrientation = orientation()
          baseWidth = window.innerWidth
          shrunk = false
          return
        }
        const small = window.innerWidth < baseWidth * 0.75
        if (small && !shrunk) push({ t: 'RESIZE', v: window.innerWidth })
        shrunk = small
      }, 800)
    }
    const onOffline = () => push({ t: 'OFFLINE' })
    const onOnline = () => void flush()

    // Otra pestaña con el mismo intento.
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(demo ? 'quiz-demo' : `quiz-${attemptId}`)
      channel.onmessage = (m) => {
        if (m.data === 'hola') channel?.postMessage('aqui')
        if (m.data === 'hola' || m.data === 'aqui') { push({ t: 'MULTITAB' }); void flush() }
      }
      channel.postMessage('hola')
    } catch { /* navegador sin BroadcastChannel */ }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('paste', onPaste, true)
    document.addEventListener('copy', onCopy, true)
    document.addEventListener('cut', onCopy, true)
    document.addEventListener('contextmenu', onContext, true)
    document.addEventListener('fullscreenchange', onFullscreen)
    window.addEventListener('resize', onResize)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void flush(), FLUSH_EVERY)
    void flush() // lo que quedó en cola de una sesión anterior

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('copy', onCopy, true)
      document.removeEventListener('cut', onCopy, true)
      document.removeEventListener('contextmenu', onContext, true)
      document.removeEventListener('fullscreenchange', onFullscreen)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
      window.clearTimeout(resizeTimer)
      channel?.close()
    }
  }, [attemptId, demo, key, push, flush, settings.block_paste, settings.fullscreen])

  /** Cierra el tiempo de la pregunta actual y envía todo (antes de terminar). */
  const finalize = useCallback(async () => {
    closeQuestion()
    await flush()
  }, [closeQuestion, flush])

  return { needFullscreen, finalize, flush }
}

/** Pantalla completa (debe llamarse dentro de un toque del usuario). No existe en iPhone. */
export function enterFullscreen(): void {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined)
    else el.webkitRequestFullscreen?.()
  } catch { /* no disponible */ }
}

export function exitFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}

export const fullscreenSupported = () => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
