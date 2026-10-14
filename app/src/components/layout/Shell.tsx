import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, Bell, BookOpen, CalendarClock, ClipboardCheck, FileCheck, Gift, Library, ListTodo, MessagesSquare, Settings, ShieldCheck, Trophy,
  CalendarCheck, CalendarDays, CalendarRange, ClipboardList, Clock, FileSignature, FileText, Home, KeyRound,
  LayoutGrid, LogOut, Megaphone, MessageCircle, Monitor, Moon, MoreHorizontal, RefreshCw, Search, Sun, Table2, Users, X,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Loading, useSwipeDown } from '@/components/ui'
import { useTheme } from '@/lib/theme'
import { isUpdateAvailable, startBackgroundSync, useUpdateAvailable } from '@/lib/sync'
import { cn } from '@/lib/utils'
import { studentName } from '@/services/campus'
import { ROLE_LABELS, type Role } from '@/types'
import { InstallBanner, OfflineBanner, ShortcutsHelp } from '@/components/ux'
import { installErrorReporting, trackPage } from '@/lib/ux'
import { useAsync } from '@/lib/useAsync'
import { publishDueContent } from '@/services/aprendizaje'
import { myPermissions, type CampusPermission } from '@/services/gestion'

// Se descargan solo cuando hacen falta (no en el primer arranque).
const CommandPalette = lazy(() => import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })))
const Onboarding = lazy(() => import('@/components/Onboarding').then((m) => ({ default: m.Onboarding })))
const TeslaCelebration = lazy(() => import('@/components/TeslaCelebration').then((m) => ({ default: m.TeslaCelebration })))

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> }

const I = {
  home: { to: '/', label: 'Inicio', icon: Home },
  summary: { to: '/', label: 'Resumen', icon: Home },
  courses: { to: '/cursos', label: 'Cursos', icon: BookOpen },
  myCourses: { to: '/cursos', label: 'Mis cursos', icon: BookOpen },
  tasks: { to: '/tareas', label: 'Tareas', icon: CalendarCheck },
  grades: { to: '/notas', label: 'Notas', icon: ClipboardList },
  consolidated: { to: '/consolidado', label: 'Consolidado', icon: Table2 },
  reportCard: { to: '/libreta', label: 'Libreta', icon: FileText },
  circulars: { to: '/comunicados', label: 'Comunicados', icon: FileSignature },
  messages: { to: '/mensajes', label: 'Mensajes', icon: MessageCircle },
  agenda: { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  schedule: { to: '/horario', label: 'Horario', icon: Clock },
  announcements: { to: '/anuncios', label: 'Anuncios', icon: Megaphone },
  panel: { to: '/', label: 'Panel', icon: BarChart3 },
  adminCourses: { to: '/admin/cursos', label: 'Cursos por aula', icon: LayoutGrid },
  accounts: { to: '/admin/cuentas', label: 'Cuentas', icon: Users },
  periods: { to: '/admin/bimestres', label: 'Bimestres', icon: CalendarRange },
  tesla: { to: '/perfil-tesla', label: 'Perfil Tesla', icon: Trophy },
  store: { to: '/tienda', label: 'Tienda', icon: Gift },
  teslaClass: { to: '/tesla/aula', label: 'Perfil Tesla', icon: Trophy },
  rewards: { to: '/admin/recompensas', label: 'Recompensas', icon: Gift },
  planner: { to: '/planificador', label: 'Planificador', icon: ListTodo },
  alerts: { to: '/alertas', label: 'Alertas', icon: AlertTriangle },
  appointments: { to: '/citas', label: 'Citas', icon: CalendarClock },
  justifications: { to: '/justificaciones', label: 'Justificaciones', icon: FileCheck },
  channels: { to: '/grupos', label: 'Grupos', icon: MessagesSquare },
  surveys: { to: '/encuestas', label: 'Encuestas', icon: ClipboardCheck },
  resources: { to: '/recursos', label: 'Recursos', icon: Library },
  system: { to: '/admin/sistema', label: 'Sistema', icon: ShieldCheck },
  settings: { to: '/ajustes', label: 'Ajustes', icon: Settings },
} satisfies Record<string, NavItem>

/** Las 4 primeras van en la barra inferior del celular; el resto, en "Más". */
function navFor(role: Role, isTutor: boolean, perms: CampusPermission[] = []): NavItem[] {
  const secretary = perms.includes('SECRETARIA')
  switch (role) {
    case 'TEACHER':
      return [
        I.home, I.myCourses, I.grades, I.messages, I.planner, ...(isTutor ? [I.consolidated] : []), I.alerts, I.teslaClass, I.appointments,
        I.channels, I.resources, ...(isTutor || secretary ? [I.justifications] : []), I.agenda, I.schedule, I.circulars, I.announcements,
        I.surveys, I.settings,
      ]
    case 'STUDENT':
      return [I.home, I.tasks, I.tesla, I.agenda, I.store, I.courses, I.channels, I.schedule, I.reportCard, I.announcements, I.surveys, I.settings]
    case 'GUARDIAN':
      return [
        I.summary, I.circulars, I.messages, I.tasks, I.appointments, I.justifications, I.agenda, I.schedule, I.reportCard, I.tesla,
        I.store, I.courses, I.channels, I.announcements, I.surveys, I.settings,
      ]
    case 'ADMIN':
    case 'MANAGEMENT':
      return [
        I.panel, I.circulars, I.messages, I.alerts, I.consolidated, I.adminCourses, I.teslaClass, I.rewards, I.justifications, I.channels,
        I.surveys, I.agenda, I.schedule, I.periods, I.accounts, I.system, I.announcements, I.settings,
      ]
    default:
      return [
        I.panel, I.alerts, I.adminCourses, I.consolidated, I.justifications, I.teslaClass, I.agenda, I.schedule,
        I.circulars, I.announcements, I.settings,
      ]
  }
}

function ChildSwitcher({ compact }: { compact?: boolean }) {
  const { children, activeChild, setActiveChildId } = useAuth()
  if (children.length < 2) return null
  return (
    <div className={cn('flex gap-1.5', compact ? 'overflow-x-auto' : 'flex-col')}>
      {children.map((child) => {
        const active = child.id === activeChild?.id
        return (
          <button
            key={child.id}
            onClick={() => setActiveChildId(child.id)}
            aria-pressed={active}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-bold transition-colors',
              compact
                ? active ? 'bg-tinta text-white' : 'border border-linea bg-superficie text-texto-suave'
                : active ? 'bg-chispa text-tinta' : 'text-white/75 hover:bg-white/10 hover:text-white',
            )}
          >
            {child.first_name ?? studentName(child)}
          </button>
        )
      })}
    </div>
  )
}

/** Botón que alterna tema: sistema → claro → oscuro. */
function ThemeButton({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const { pref, setPref } = useTheme()
  const next = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system'
  const Icon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Monitor
  const label = pref === 'dark' ? 'Modo oscuro' : pref === 'light' ? 'Modo claro' : 'Tema del sistema'
  return (
    <button onClick={() => setPref(next)} className={className} aria-label={`${label}. Cambiar tema`} title={label}>
      <Icon className={withLabel ? 'h-4 w-4' : 'h-5 w-5'} />
      {withLabel && label}
    </button>
  )
}

export function Shell() {
  const { profile, signOut, children, tutorClassrooms, setActiveChildId, selfStudent } = useAuth()
  const [params] = useSearchParams()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchUsed = useRef(false)
  if (searchOpen) searchUsed.current = true
  const updateAvailable = useUpdateAvailable()
  const moreSwipe = useSwipeDown(() => setMoreOpen(false))
  const canSearch = !!profile && profile.role !== 'STUDENT' && profile.role !== 'GUARDIAN'

  // Sincronización en segundo plano mientras la sesión está abierta.
  useEffect(() => startBackgroundSync(), [])
  useEffect(() => installErrorReporting(), [])
  const { data: perms } = useAsync(() => (profile ? myPermissions(profile.id).catch(() => []) : Promise.resolve([])), [profile?.id], { live: false })

  // Cada pantalla: estadística de uso y publicación de lo programado.
  useEffect(() => {
    trackPage(location.pathname)
    publishDueContent()
  }, [location.pathname])

  // Los avisos push traen ?hijo=ID para abrir en el hijo correcto.
  const hijo = Number(params.get('hijo'))
  useEffect(() => {
    if (hijo && children.some((c) => c.id === hijo)) setActiveChildId(hijo)
  }, [hijo, children, setActiveChildId])

  // Al cambiar de pantalla: cerrar "Más", subir al inicio y, si hay versión nueva, aplicarla.
  const first = useRef(true)
  useEffect(() => {
    setMoreOpen(false)
    if (first.current) { first.current = false; return }
    if (isUpdateAvailable()) { window.location.reload(); return }
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  // Ctrl + K (o Cmd + K) abre la búsqueda rápida.
  useEffect(() => {
    if (!canSearch) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canSearch])

  if (!profile) return null
  const items = navFor(profile.role, tutorClassrooms.length > 0, perms ?? [])
  const primary = items.slice(0, 4)
  const more = items.slice(4)
  const moreActive = more.some((i) => i.to !== '/' && location.pathname.startsWith(i.to))

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr] print:block">
      {/* Barra lateral (escritorio) */}
      <aside className="shell-chrome sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-tinta px-4 py-6 text-white lg:flex print:hidden">
        <div className="flex items-center gap-3 px-2">
          <img src="/images/logo-nikola-tesla.png" alt="" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
          <div className="leading-tight">
            <p className="font-display text-lg font-bold">Campus Tesla</p>
            <p className="text-xs text-white/60">{ROLE_LABELS[profile.role]}</p>
          </div>
        </div>

        {canSearch && (
          <button
            onClick={() => setSearchOpen(true)}
            className="mt-6 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Buscar…</span>
            <kbd className="rounded border border-white/20 px-1.5 text-[11px] font-bold">Ctrl K</kbd>
          </button>
        )}

        {profile.role === 'GUARDIAN' && children.length > 1 && (
          <div className="mt-8 px-1">
            <p className="mb-2 px-2 text-xs font-bold text-white/50">Viendo a</p>
            <ChildSwitcher />
          </div>
        )}

        <nav className={cn('flex flex-col gap-0.5', canSearch ? 'mt-5' : 'mt-8')} aria-label="Principal">
          {items.map((item) => (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-bold transition-colors',
                isActive ? 'bg-white text-[#0B1D33]' : 'text-white/75 hover:bg-white/10 hover:text-white',
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 px-2 pt-4">
          <p className="truncate text-sm font-bold">{profile.full_name}</p>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/70">
            <NavLink to="/notificaciones" className="inline-flex items-center gap-1.5 hover:text-white"><Bell className="h-4 w-4" />Avisos</NavLink>
            <NavLink to="/ajustes" className="inline-flex items-center gap-1.5 hover:text-white"><Settings className="h-4 w-4" />Ajustes</NavLink>
            <NavLink to="/cambiar-clave" className="inline-flex items-center gap-1.5 hover:text-white"><KeyRound className="h-4 w-4" />Contraseña</NavLink>
            <button onClick={() => void signOut()} className="inline-flex items-center gap-1.5 hover:text-white"><LogOut className="h-4 w-4" />Salir</button>
          </div>
          <ThemeButton withLabel className="mt-2 inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white" />
        </div>
      </aside>

      {/* Barra superior (móvil) */}
      <header className="shell-chrome sticky top-0 z-30 border-b border-linea bg-superficie px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden print:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/images/logo-nikola-tesla.png" alt="" className="logo-chip h-8 w-8 rounded-md object-contain" />
            <p className="truncate font-display text-lg font-bold text-tinta">Campus Tesla</p>
          </div>
          <div className="flex items-center">
            {canSearch && <button onClick={() => setSearchOpen(true)} className="rounded-md p-2.5 text-texto-suave" aria-label="Buscar"><Search className="h-5 w-5" /></button>}
            <NavLink to="/notificaciones" className="rounded-md p-2.5 text-texto-suave" aria-label="Notificaciones"><Bell className="h-5 w-5" /></NavLink>
            <ThemeButton className="rounded-md p-2.5 text-texto-suave" />
          </div>
        </div>
        {profile.role === 'GUARDIAN' && children.length > 1 && <div className="mt-3"><ChildSwitcher compact /></div>}
      </header>

      <main className="min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10 print:p-0">
        <InstallBanner />
        {updateAvailable && (
          <div className="mx-auto mb-5 flex max-w-6xl items-center gap-3 rounded-xl bg-chispa-100 px-4 py-3 text-sm text-tinta print:hidden">
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span className="flex-1">Hay una versión nueva del campus.</span>
            <button onClick={() => window.location.reload()} className="font-bold underline">Actualizar</button>
          </div>
        )}
        {/* La clave hace que cada pantalla entre con una transición suave. */}
        <div key={location.pathname} className="page-in mx-auto max-w-6xl print:max-w-none print:animate-none">
          <Suspense fallback={<Loading shape="page" />}><Outlet /></Suspense>
        </div>
      </main>

      {profile.role === 'STUDENT' && selfStudent && <Suspense fallback={null}><TeslaCelebration studentId={selfStudent.id} /></Suspense>}

      {/* Navegación inferior (móvil) */}
      <nav className="shell-chrome fixed inset-x-0 bottom-0 z-30 flex border-t border-linea bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden" aria-label="Principal">
        {primary.map((item) => (
          <NavLink
            key={item.to + item.label}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', isActive ? 'text-tinta' : 'text-texto-suave')}
          >
            {({ isActive }) => (
              <>
                <span className={cn('rounded-full px-4 py-1 transition-colors', isActive && 'bg-chispa-100')}><item.icon className="h-5 w-5" /></span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
        {more.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', moreActive ? 'text-tinta' : 'text-texto-suave')}
            aria-haspopup="dialog"
          >
            <span className={cn('rounded-full px-4 py-1', moreActive && 'bg-chispa-100')}><MoreHorizontal className="h-5 w-5" /></span>
            Más
          </button>
        )}
      </nav>

      {/* Panel "Más" (móvil): sube desde abajo y se cierra deslizándolo */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button className="backdrop-in absolute inset-0 bg-tinta/50" onClick={() => setMoreOpen(false)} aria-label="Cerrar" />
          <div
            className="sheet-up absolute inset-x-0 bottom-0 rounded-t-2xl bg-superficie px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            style={moreSwipe.dy ? { transform: `translateY(${moreSwipe.dy}px)` } : undefined}
          >
            <div className="cursor-grab touch-none pb-3 pt-2" {...moreSwipe.handlers}>
              <span className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-linea" aria-hidden />
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-semibold">Más</p>
                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setMoreOpen(false)} className="rounded-md p-2 text-texto-suave" aria-label="Cerrar"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {more.map((item) => (
                <NavLink
                  key={item.to + item.label}
                  to={item.to}
                  className={({ isActive }) => cn('flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-bold', isActive ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea text-texto')}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </NavLink>
              ))}
            </div>
            <div className="mt-4 flex justify-between border-t border-linea pt-3 text-sm">
              <NavLink to="/cambiar-clave" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-texto-suave"><KeyRound className="h-4 w-4" />Contraseña</NavLink>
              <button onClick={() => void signOut()} className="inline-flex min-h-11 items-center gap-1.5 font-bold text-estado-alerta"><LogOut className="h-4 w-4" />Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      {canSearch && searchUsed.current && <Suspense fallback={null}><CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} commands={items} /></Suspense>}
      <Suspense fallback={null}><Onboarding /></Suspense>
      <OfflineBanner />
      <ShortcutsHelp />
    </div>
  )
}
