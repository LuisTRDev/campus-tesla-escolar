import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Vibración leve (solo celulares que la soportan)
// ---------------------------------------------------------------------------
export function haptic(kind: 'light' | 'success' | 'error' = 'light') {
  try {
    if (!('vibrate' in navigator)) return
    navigator.vibrate(kind === 'success' ? [20, 40, 30] : kind === 'error' ? [40, 30, 40] : 12)
  } catch {
    /* sin vibración */
  }
}

// ---------------------------------------------------------------------------
// Borradores que se guardan solos en el dispositivo
// ---------------------------------------------------------------------------
function readDraft<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`draft:${key}`)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

/**
 * useState que se guarda en el dispositivo mientras se escribe.
 * Llama a `clear()` al enviar para borrarlo.
 */
export function useDraft<T>(key: string | null, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void, boolean] {
  const [value, setValue] = useState<T>(() => (key ? readDraft(key, initial) : initial))
  const restored = useRef(key ? localStorage.getItem(`draft:${key}`) != null : false)
  const timer = useRef<number>()
  useEffect(() => {
    if (!key) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try {
        const empty = value == null || value === '' || (typeof value === 'object' && Object.values(value as object).every((v) => v === '' || v == null || (Array.isArray(v) && !v.length)))
        if (empty) localStorage.removeItem(`draft:${key}`)
        else localStorage.setItem(`draft:${key}`, JSON.stringify(value))
      } catch {
        /* almacenamiento lleno o bloqueado */
      }
    }, 400)
    return () => window.clearTimeout(timer.current)
  }, [key, value])
  const clear = useCallback(() => {
    if (key) try { localStorage.removeItem(`draft:${key}`) } catch { /* nada */ }
    restored.current = false
  }, [key])
  return [value, setValue, clear, restored.current]
}

// ---------------------------------------------------------------------------
// Conexión e instalación como app
// ---------------------------------------------------------------------------
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferredPrompt: BeforeInstallPromptEvent | null = null
const installListeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    installListeners.forEach((fn) => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installListeners.forEach((fn) => fn())
  })
}

export function isStandaloneApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    installListeners.add(fn)
    return () => { installListeners.delete(fn) }
  }, [])
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandaloneApp()
  return {
    canInstall: !!deferredPrompt,
    ios,
    install: async () => {
      if (!deferredPrompt) return false
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      deferredPrompt = null
      installListeners.forEach((fn) => fn())
      return choice.outcome === 'accepted'
    },
  }
}

// ---------------------------------------------------------------------------
// Preferencias de lectura (texto grande, menos movimiento)
// ---------------------------------------------------------------------------
/** `dense`: tablas compactas; null = automático (sí para docentes y personal, no para alumnos y familias). */
export type ReadingPrefs = { largeText: boolean; reduceMotion: boolean; highContrast: boolean; dense: boolean | null }
const READING_KEY = 'campus-reading'

export function readReadingPrefs(): ReadingPrefs {
  try {
    return { largeText: false, reduceMotion: false, highContrast: false, dense: null, ...JSON.parse(localStorage.getItem(READING_KEY) ?? '{}') }
  } catch {
    return { largeText: false, reduceMotion: false, highContrast: false, dense: null }
  }
}

export function applyReadingPrefs(p: ReadingPrefs = readReadingPrefs()) {
  const root = document.documentElement
  root.classList.toggle('text-large', p.largeText)
  root.classList.toggle('motion-off', p.reduceMotion)
  root.classList.toggle('contrast-high', p.highContrast)
  // El menú marca <html data-personal> para docentes y personal (src/components/layout/Shell.tsx).
  root.classList.toggle('denso', p.dense ?? root.dataset.personal === '1')
}

export function useReadingPrefs(): [ReadingPrefs, (p: Partial<ReadingPrefs>) => void] {
  const [prefs, setPrefs] = useState(readReadingPrefs)
  const update = useCallback((patch: Partial<ReadingPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch }
      try { localStorage.setItem(READING_KEY, JSON.stringify(next)) } catch { /* nada */ }
      applyReadingPrefs(next)
      return next
    })
  }, [])
  return [prefs, update]
}

// ---------------------------------------------------------------------------
// Transición entre pantallas (View Transitions API, si el navegador la tiene)
// ---------------------------------------------------------------------------
export function withViewTransition(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (!doc.startViewTransition || document.documentElement.classList.contains('motion-off') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fn()
    return
  }
  doc.startViewTransition(() => flushSync(fn))
}

// ---------------------------------------------------------------------------
// Saludo y temporada
// ---------------------------------------------------------------------------
export function limaHour(): number {
  return Number(new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }).format(new Date()))
}

export function greeting(): { text: string; period: 'morning' | 'afternoon' | 'night' } {
  const h = limaHour()
  if (h >= 5 && h < 12) return { text: 'Buenos días', period: 'morning' }
  if (h >= 12 && h < 19) return { text: 'Buenas tardes', period: 'afternoon' }
  return { text: 'Buenas noches', period: 'night' }
}

export type Season = { key: string; label: string; emoji: string } | null

/** Decoración automática por fecha (hora de Lima). */
export function currentSeason(date = new Date()): Season {
  const [m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', month: 'numeric', day: 'numeric' }).format(date).split(/\D+/).map(Number)
  const md = m * 100 + d
  // Fechas que se celebran en el colegio. Día de la Madre: 2.º domingo de mayo; del Padre: 3.er domingo de junio.
  const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric' }).format(date))
  const nthSunday = (month: number, n: number) => { const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7 }
  const madre = nthSunday(5, 2)
  const padre = nthSunday(6, 3)
  if (m === 5 && d >= madre - 3 && d <= madre) return { key: 'madre', label: '¡Feliz Día de la Madre!', emoji: '💐' }
  if (m === 6 && d >= padre - 3 && d <= padre) return { key: 'padre', label: '¡Feliz Día del Padre!', emoji: '👔' }
  if (md === 706) return { key: 'maestro', label: '¡Feliz Día del Maestro! Gracias por su pasión por educar', emoji: '🍎' }
  if (md >= 301 && md <= 315) return { key: 'inicio', label: '¡Bienvenidos al nuevo año escolar!', emoji: '🎒' }
  if (md >= 720 && md <= 731) return { key: 'patrias', label: '¡Felices Fiestas Patrias!', emoji: '🇵🇪' }
  if (md >= 1201 && md <= 1231) return { key: 'navidad', label: '¡Feliz Navidad!', emoji: '🎄' }
  if (md >= 1028 && md <= 1031) return { key: 'criolla', label: 'Día de la Canción Criolla', emoji: '🎶' }
  if (md === 710) return { key: 'tesla', label: '¡Feliz cumpleaños, Nikola Tesla!', emoji: '⚡' }
  return null
}

// ---------------------------------------------------------------------------
// Telemetría: páginas visitadas y errores (para Estadísticas y Errores)
// ---------------------------------------------------------------------------
const seenPaths = new Map<string, number>()

function deviceType(): 'MOBILE' | 'TABLET' | 'DESKTOP' {
  const w = Math.min(window.screen.width, window.screen.height)
  if (/mobi|android|iphone/i.test(navigator.userAgent) && w < 600) return 'MOBILE'
  if (/ipad|tablet|android/i.test(navigator.userAgent) || (w >= 600 && 'ontouchstart' in window && w < 1100)) return 'TABLET'
  return 'DESKTOP'
}

/** Normaliza la ruta (sin ids) para agrupar: /curso/12 → /curso/:id */
export function normalizePath(path: string): string {
  return path.replace(/\/\d+(?=\/|$)/g, '/:id').slice(0, 120) || '/'
}

export function trackPage(path: string) {
  const p = normalizePath(path)
  const last = seenPaths.get(p) ?? 0
  if (Date.now() - last < 10 * 60_000) return
  seenPaths.set(p, Date.now())
  void supabase.from('usage_events').insert({ path: p, device: deviceType(), standalone: isStandaloneApp() }).then(() => undefined, () => undefined)
}

let errorsSent = 0
export function reportError(message: string, stack?: string | null) {
  if (errorsSent > 20 || !message) return
  errorsSent++
  const bundle = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? 'dev'
  void supabase.from('client_errors').insert({
    message: message.slice(0, 500), stack: stack?.slice(0, 4000) ?? null, path: location.pathname.slice(0, 200),
    user_agent: navigator.userAgent.slice(0, 300), app_version: bundle.slice(0, 60),
  }).then(() => undefined, () => undefined)
}

let telemetryInstalled = false
export function installErrorReporting() {
  if (telemetryInstalled) return
  telemetryInstalled = true
  window.addEventListener('error', (e) => {
    // Errores de recursos externos (extensiones) no se reportan.
    if (!e.message || /ResizeObserver loop/.test(e.message)) return
    reportError(e.message, e.error?.stack ?? `${e.filename}:${e.lineno}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string; code?: string } | undefined
    // Errores de reglas del negocio (P0001) o de red ya se muestran al usuario.
    if (!r || r.code === 'P0001' || /fetch|network|Failed to load/i.test(r.message ?? '')) return
    reportError(r.message ?? String(r), r.stack)
  })
}

// ---------------------------------------------------------------------------
// Atajos de teclado
// ---------------------------------------------------------------------------
export function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

/** Atajo de una tecla (ignorado mientras se escribe). */
export function useKey(key: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const fn = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      if (e.key.toLowerCase() === key.toLowerCase()) ref.current(e)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [key, enabled])
}

// ---------------------------------------------------------------------------
// Calendario (.ics) para Google Calendar o el celular
// ---------------------------------------------------------------------------
export type IcsEvent = { uid: string; title: string; start: Date; end?: Date; allDay?: boolean; description?: string }

function icsDate(d: Date, allDay?: boolean) {
  const iso = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return allDay ? iso.slice(0, 8) : iso
}

function icsText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
}

export function downloadIcs(name: string, events: IcsEvent[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus Tesla//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Campus Tesla']
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@campus-tesla`, `DTSTAMP:${icsDate(new Date())}`)
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start, true)}`)
    else lines.push(`DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end ?? new Date(e.start.getTime() + 3600_000))}`)
    lines.push(`SUMMARY:${icsText(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name.endsWith('.ics') ? name : `${name}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Descarga un archivo de texto (JSON, CSV…). */
export function downloadText(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
