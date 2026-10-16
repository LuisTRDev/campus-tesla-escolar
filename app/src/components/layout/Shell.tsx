import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { Bell, KeyRound, LogOut, Monitor, Moon, MoreHorizontal, RefreshCw, Search, Settings, Sun, X } from 'lucide-react'
import { Escudo } from '@/components/brand'
import {
  IcoAgenda, IcoAjustes, IcoAlertas, IcoAntitrampa, IcoAulas, IcoBimestres, IcoCampana, IcoCarnet, IcoCircular, IcoCitas, IcoConsolidado, IcoCuaderno, IcoEncuestas, IcoEscudo,
  IcoGrupos, IcoJustificacion, IcoLibreta, IcoMegafono, IcoMensajes, IcoNotas, IcoPanel, IcoPlanificador, IcoRayo, IcoRecursos, IcoSistema, IcoTareas, IcoTienda,
} from '@/components/icons'
import type { ComponentType } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Loading, useSwipeDown } from '@/components/ui'
import { useTheme } from '@/lib/theme'
import { isUpdateAvailable, refreshNow, startBackgroundSync, useUpdateAvailable } from '@/lib/sync'
import { usePullRefresh } from '@/lib/usePullRefresh'
import { cn } from '@/lib/utils'
import { studentName } from '@/services/campus'
import { ROLE_LABELS, type Role } from '@/types'
import { InstallBanner, OfflineBanner, ShortcutsHelp } from '@/components/ux'
import { applyReadingPrefs, installErrorReporting, trackPage } from '@/lib/ux'
import { useAsync } from '@/lib/useAsync'
import { publishDueContent } from '@/services/aprendizaje'
import { myPermissions, type CampusPermission } from '@/services/gestion'

// Se descargan solo cuando hacen falta (no en el primer arranque).
const CommandPalette = lazy(() => import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })))
const Onboarding = lazy(() => import('@/components/Onboarding').then((m) => ({ default: m.Onboarding })))
const TeslaCelebration = lazy(() => import('@/components/TeslaCelebration').then((m) => ({ default: m.TeslaCelebration })))
const SidebarRank = lazy(() => import('@/components/SidebarRank').then((m) => ({ default: m.SidebarRank })))

type NavItem = { to: string; label: string; icon: ComponentType<{ className?: string }> }

const I = {
  home: { to: '/', label: 'Inicio', icon: IcoEscudo },
  summary: { to: '/', label: 'Resumen', icon: IcoEscudo },
  courses: { to: '/cursos', label: 'Cursos', icon: IcoCuaderno },
  myCourses: { to: '/cursos', label: 'Mis cursos', icon: IcoCuaderno },
  tasks: { to: '/tareas', label: 'Tareas', icon: IcoTareas },
  grades: { to: '/notas', label: 'Notas', icon: IcoNotas },
  consolidated: { to: '/consolidado', label: 'Consolidado', icon: IcoConsolidado },
  reportCard: { to: '/libreta', label: 'Libreta', icon: IcoLibreta },
  circulars: { to: '/comunicados', label: 'Comunicados', icon: IcoCircular },
  messages: { to: '/mensajes', label: 'Mensajes', icon: IcoMensajes },
  agenda: { to: '/agenda', label: 'Agenda', icon: IcoAgenda },
  schedule: { to: '/horario', label: 'Horario', icon: IcoCampana },
  announcements: { to: '/anuncios', label: 'Anuncios', icon: IcoMegafono },
  panel: { to: '/', label: 'Panel', icon: IcoPanel },
  adminCourses: { to: '/admin/cursos', label: 'Cursos por aula', icon: IcoAulas },
  accounts: { to: '/admin/cuentas', label: 'Cuentas', icon: IcoCarnet },
  periods: { to: '/admin/bimestres', label: 'Bimestres', icon: IcoBimestres },
  tesla: { to: '/perfil-tesla', label: 'Perfil Tesla', icon: IcoRayo },
  store: { to: '/tienda', label: 'Tienda', icon: IcoTienda },
  teslaClass: { to: '/tesla/aula', label: 'Perfil Tesla', icon: IcoRayo },
  rewards: { to: '/admin/recompensas', label: 'Recompensas', icon: IcoTienda },
  planner: { to: '/planificador', label: 'Planificador', icon: IcoPlanificador },
  alerts: { to: '/alertas', label: 'Alertas', icon: IcoAlertas },
  appointments: { to: '/citas', label: 'Citas', icon: IcoCitas },
  justifications: { to: '/justificaciones', label: 'Justificaciones', icon: IcoJustificacion },
  channels: { to: '/grupos', label: 'Grupos', icon: IcoGrupos },
  surveys: { to: '/encuestas', label: 'Encuestas', icon: IcoEncuestas },
  resources: { to: '/recursos', label: 'Recursos', icon: IcoRecursos },
  system: { to: '/admin/sistema', label: 'Sistema', icon: IcoSistema },
  settings: { to: '/ajustes', label: 'Ajustes', icon: IcoAjustes },
  carnet: { to: '/carnet', label: 'Carnet', icon: IcoCarnet },
  antitrampa: { to: '/anti-trampa', label: 'Anti-trampa', icon: IcoAntitrampa },
} satisfies Record<string, NavItem>

/** Las 4 primeras van en la barra inferior del celular; el resto, en "Más". */
function navFor(role: Role, isTutor: boolean, perms: CampusPermission[] = []): NavItem[] {
  const secretary = perms.includes('SECRETARIA')
  switch (role) {
    case 'TEACHER':
      return [
        I.home, I.myCourses, I.grades, I.messages, I.planner, ...(isTutor ? [I.consolidated] : []), I.alerts, I.antitrampa, I.teslaClass, I.appointments,
        I.channels, I.resources, ...(isTutor || secretary ? [I.justifications] : []), I.agenda, I.schedule, I.circulars, I.announcements,
        I.surveys, I.settings,
      ]
    case 'STUDENT':
      return [I.home, I.tasks, I.tesla, I.agenda, I.store, I.courses, I.carnet, I.channels, I.schedule, I.reportCard, I.announcements, I.surveys, I.settings]
    case 'GUARDIAN':
      return [
        I.summary, I.circulars, I.messages, I.tasks, I.appointments, I.justifications, I.agenda, I.schedule, I.reportCard, I.tesla,
        I.store, I.courses, I.carnet, I.channels, I.announcements, I.surveys, I.settings,
      ]
    case 'ADMIN':
    case 'MANAGEMENT':
      return [
        I.panel, I.circulars, I.messages, I.alerts, I.antitrampa, I.consolidated, I.adminCourses, I.teslaClass, I.rewards, I.justifications, I.channels,
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
  const { profile, signOut, children, tutorClassrooms, setActiveChildId, selfStudent, activeChild } = useAuth()
  const pull = usePullRefresh(refreshNow)
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
  // Docentes y personal: <html data-personal> activa las tablas compactas por defecto (Ajustes).
  const staff = !!profile && profile.role !== 'STUDENT' && profile.role !== 'GUARDIAN'
  useEffect(() => {
    document.documentElement.dataset.personal = staff ? '1' : '0'
    applyReadingPrefs()
  }, [staff])

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
  // Pestaña activa de la barra inferior: el indicador tricolor se desliza hasta ella.
  const isOn = (to: string) => (to === '/' ? location.pathname === '/' : location.pathname === to || location.pathname.startsWith(`${to}/`))
  const tabCount = primary.length + (more.length > 0 ? 1 : 0)
  const tabIndex = primary.findIndex((i) => isOn(i.to))
  const activeTab = tabIndex >= 0 ? tabIndex : moreActive ? primary.length : -1
  const rankStudentId = profile.role === 'STUDENT' ? selfStudent?.id : profile.role === 'GUARDIAN' ? activeChild?.id : undefined

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr] print:block">
      {/* Barra lateral (escritorio) */}
      <aside className="shell-chrome shell-side isolate sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-tinta dark:bg-[#0c1a33] py-6 pl-4 pr-6 text-white lg:flex print:hidden">
        {/* Franja del buzo en el borde del menú */}
        <span className="celosia celosia-suave pointer-events-none absolute inset-0 -z-10" aria-hidden />
        <span className="franja-v pointer-events-none absolute inset-y-0 right-0 w-[9px]" aria-hidden />
        <div className="flex items-center gap-3 px-2">
          <Escudo className="h-12 w-11 shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" />
          <div className="leading-tight">
            <p className="font-display text-lg font-extrabold uppercase tracking-wide">Campus Tesla</p>
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
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-bold transition duration-rapido',
                isActive ? 'bg-white text-[#102442] shadow-[inset_4px_0_0_rgb(var(--rojo))]' : 'text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white',
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/10 px-2 pt-4">
          <p className="lema mb-3 text-[10px] text-chispa">Pasión por educar</p>
          <p className="truncate text-sm font-bold">{profile.full_name}</p>
          {rankStudentId && <Suspense fallback={null}><SidebarRank studentId={rankStudentId} /></Suspense>}
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
      <header className="shell-chrome sticky top-0 z-30 bg-superficie px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden print:hidden">
        <span className="franja-h absolute inset-x-0 bottom-0 h-[4px]" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Escudo className="h-9 w-8 shrink-0" />
            <p className="truncate font-display text-lg font-extrabold uppercase tracking-wide text-tinta">Campus Tesla</p>
          </div>
          <div className="flex items-center">
            {canSearch && <button onClick={() => setSearchOpen(true)} className="rounded-md p-2.5 text-texto-suave" aria-label="Buscar"><Search className="h-5 w-5" /></button>}
            <NavLink to="/notificaciones" className="rounded-md p-2.5 text-texto-suave" aria-label="Notificaciones"><Bell className="h-5 w-5" /></NavLink>
            <ThemeButton className="rounded-md p-2.5 text-texto-suave" />
          </div>
        </div>
        {profile.role === 'GUARDIAN' && children.length > 1 && <div className="mt-3"><ChildSwitcher compact /></div>}
      </header>

      {/* Deslizar para actualizar (celular): el rayo baja y se carga de dorado */}
      {pull.state !== 'idle' && (
        <div className={cn('jalar pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center lg:hidden', pull.state === 'ready' && 'jalar-listo', pull.state === 'refreshing' && 'jalar-cargando')} style={{ transform: `translateY(${pull.dy}px)`, opacity: Math.min(1, pull.dy / 40) }} aria-hidden>
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-linea bg-superficie text-texto-suave shadow-md"><IcoRayo className={cn('h-5 w-5', pull.state !== 'pulling' && 'ti-on')} /></span>
        </div>
      )}
      {pull.state === 'refreshing' && <span className="sr-only" role="status">Actualizando…</span>}

      {/* Barra tricolor al cambiar de pantalla */}
      <span key={`ruta${location.pathname}`} className="franja-h ruta-carga pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] print:hidden" aria-hidden />

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
        {activeTab >= 0 && (
          <span className="franja-h tab-on pointer-events-none absolute top-0 h-[5px] w-9 rounded-b-sm" style={{ left: `calc(${((activeTab + 0.5) / tabCount) * 100}% - 1.125rem)`, transition: 'left var(--dur-3) var(--ease-spring)' }} aria-hidden />
        )}
        {primary.map((item) => (
          <NavLink
            key={item.to + item.label}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', isActive ? 'text-tinta' : 'text-texto-suave')}
          >
            {({ isActive }) => (
              <>
                <span className={cn('rounded-full px-4 py-1 transition duration-medio', isActive && 'bg-chispa-100')}><item.icon className="h-5 w-5" /></span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
        {more.length > 0 && (
          <button
            onClick={() => setMoreOpen(true)}
            className={cn('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-bold', moreActive ? 'text-tinta' : 'text-texto-suave')}
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
