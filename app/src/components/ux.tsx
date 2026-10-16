import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Keyboard, Share, WifiOff, X } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { cn } from '@/lib/utils'
import { currentSeason, greeting, isStandaloneApp, useInstallPrompt, useKey, useOnline } from '@/lib/ux'

// ---------------------------------------------------------------------------
// Sin conexión
// ---------------------------------------------------------------------------
export function OfflineBanner() {
  const online = useOnline()
  const [back, setBack] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)
  useEffect(() => {
    if (!online) setWasOffline(true)
    else if (wasOffline) {
      setBack(true)
      const t = setTimeout(() => { setBack(false); setWasOffline(false) }, 2500)
      return () => clearTimeout(t)
    }
  }, [online, wasOffline])
  if (online && !back) return null
  return (
    <div role="status" className={cn('toast-in fixed inset-x-0 top-0 z-[65] flex justify-center px-4 pt-[max(0.5rem,env(safe-area-inset-top))]')}>
      <div className={cn('relative flex items-center gap-2 overflow-hidden rounded-full px-4 py-1.5 text-sm font-bold text-white shadow-lg', online ? 'bg-estado-ok' : 'bg-tinta')}>
        {!online && <span className="franja-h absolute inset-x-0 bottom-0 h-[3px]" aria-hidden />}
        {online ? '¡Conexión recuperada!' : <><WifiOff className="h-4 w-4 text-chispa" />Sin conexión: verás lo último que se cargó</>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Instalar como app
// ---------------------------------------------------------------------------
const INSTALL_KEY = 'campus-install-dismissed'

export function InstallBanner() {
  const { canInstall, ios, install } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(INSTALL_KEY) ?? 0) < 14 * 86_400_000 } catch { return false }
  })
  const [showIos, setShowIos] = useState(false)
  if (dismissed || isStandaloneApp() || (!canInstall && !ios)) return null

  function close() {
    setDismissed(true)
    try { localStorage.setItem(INSTALL_KEY, String(Date.now())) } catch { /* nada */ }
  }

  return (
    <div className="mx-auto mb-5 flex max-w-6xl items-center gap-3 rounded-xl border border-linea bg-superficie px-4 py-3 text-sm shadow-sm print:hidden">
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Instala el Campus Tesla</p>
        <p className="text-texto-suave">Ábrelo como una app, con ícono propio y avisos al instante.</p>
        {showIos && (
          <p className="mt-1 text-texto">
            En el iPhone: toca <Share className="inline h-4 w-4" /> <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>.
          </p>
        )}
      </div>
      {canInstall ? (
        <Button size="sm" onClick={() => void install().then((ok) => ok && close())}><Download className="h-4 w-4" />Instalar</Button>
      ) : !showIos && (
        <Button size="sm" variant="secondary" onClick={() => setShowIos(true)}>Cómo</Button>
      )}
      <button onClick={close} className="rounded-md p-1.5 text-texto-suave hover:text-texto" aria-label="Ahora no"><X className="h-4 w-4" /></button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Atajos de teclado (se abre con «?»)
// ---------------------------------------------------------------------------
const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Buscar alumnos, cursos y tareas' },
  { keys: ['?'], label: 'Ver esta ayuda' },
  { keys: ['G', 'I'], label: 'Ir al inicio' },
  { keys: ['G', 'A'], label: 'Ir a la agenda' },
  { keys: ['G', 'M'], label: 'Ir a mensajes' },
  { keys: ['N'], label: 'Nueva tarea o material (dentro de un curso)' },
  { keys: ['J', 'K'], label: 'Siguiente y anterior entrega al calificar' },
  { keys: ['/'], label: 'Buscar dentro del curso' },
  { keys: ['Esc'], label: 'Cerrar ventanas' },
]

export function ShortcutsHelp() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [g, setG] = useState(0)
  useKey('?', () => setOpen(true))
  useKey('g', () => setG(Date.now()))
  useKey('i', () => { if (Date.now() - g < 1200) navigate('/') }, !!g)
  useKey('a', () => { if (Date.now() - g < 1200) navigate('/agenda') }, !!g)
  useKey('m', () => { if (Date.now() - g < 1200) navigate('/mensajes') }, !!g)
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Atajos de teclado">
      <ul className="space-y-2">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4">
            <span>{s.label}</span>
            <span className="flex shrink-0 gap-1">{s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-sm text-texto-suave"><Keyboard className="h-4 w-4" />«G» seguido de otra letra para ir a una sección.</p>
    </Modal>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="min-w-7 rounded-md border border-linea bg-papel px-1.5 py-0.5 text-center text-xs font-bold">{children}</kbd>
}

// ---------------------------------------------------------------------------
// Saludo según la hora y decoración por fecha
// ---------------------------------------------------------------------------
// Siempre el azul del colegio; la hora se nota en el sol o la luna y en el tono del cielo.
const GREETING_BG = {
  morning: 'from-[#173563] via-[#102442] to-[#102442]',
  afternoon: 'from-[#1d3f73] via-[#132b50] to-[#102442]',
  night: 'from-[#0a1830] via-[#0d1d3a] to-[#14203f]',
}

export type TodayItem = { label: ReactNode; tone?: 'alerta' | 'ok' | 'aviso' }
const TODAY_TONE = { alerta: 'bg-[#ff6b8f]/20 text-[#ffd1dc]', ok: 'bg-[#40c480]/20 text-[#c8f5dc]', aviso: 'bg-chispa/20 text-[#ffe7a8]' }

/**
 * "Formación del día": el saludo del inicio como la formación de la mañana en el patio.
 * `today` resume lo que toca hoy (tareas que vencen, entregas por revisar…).
 */
export function GreetingHero({ name, subtitle, children, today }: { name?: string | null; subtitle?: ReactNode; children?: ReactNode; today?: TodayItem[] }) {
  const g = greeting()
  const season = currentSeason()
  const first = (name ?? '').trim().split(/\s+/)[0]
  const pretty = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : ''
  return (
    <section className={cn('greeting-hero relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br p-5 pb-6 text-white sm:p-6 sm:pb-7', GREETING_BG[g.period])}>
      <span className="celosia pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70 [mask-image:linear-gradient(black,transparent)]" aria-hidden />
      <span className={cn('greeting-orb', `greeting-${g.period}`)} aria-hidden />
      {season && <SeasonDecor season={season.key} />}
      <span className="franja-h absolute inset-x-0 bottom-0 h-[6px]" aria-hidden />
      <div className="relative">
        <p className="lema text-[11px] text-chispa">{season ? `${season.emoji} ${season.label}` : 'Formación del día'}</p>
        <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{g.text}{pretty ? `, ${pretty}` : ''}</h1>
        {subtitle && <p className="mt-1 text-white/80">{subtitle}</p>}
        {today && today.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Para hoy">
            {today.map((t, i) => (
              <li key={i} className={cn('cinta-in rounded-full px-3 py-1 text-sm font-bold', t.tone ? TODAY_TONE[t.tone] : 'bg-white/10 text-white/90')} style={{ '--i': i - 3 } as CSSProperties}>{t.label}</li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </section>
  )
}

function SeasonDecor({ season }: { season: string }) {
  if (season === 'patrias') {
    return <div className="season-flags" aria-hidden>{Array.from({ length: 14 }).map((_, i) => <span key={i} className={i % 2 ? 'bg-white' : 'bg-[#d91023]'} />)}</div>
  }
  if (season === 'navidad') {
    return <div className="season-snow" aria-hidden>{Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${-(i * 0.7) % 6}s`, animationDuration: `${5 + (i % 4)}s` }} />)}</div>
  }
  return <div className="season-confetti" aria-hidden>{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ left: `${(i * 23) % 100}%`, animationDelay: `${-(i * 0.6) % 5}s`, background: ['#F2B51C', '#D63620', '#ffffff', '#5b8fd6'][i % 4] }} />)}</div>
}

// ---------------------------------------------------------------------------
// Modo concentración: oculta el menú mientras se rinde una evaluación o se lee
// ---------------------------------------------------------------------------
export function useFocusMode(on: boolean) {
  useEffect(() => {
    document.documentElement.classList.toggle('focus-mode', on)
    return () => document.documentElement.classList.remove('focus-mode')
  }, [on])
}
