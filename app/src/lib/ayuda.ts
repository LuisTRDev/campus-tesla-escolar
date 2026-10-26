import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/types'

// ---------------------------------------------------------------------------
// Ayuda dentro de la app: temas «¿Cómo se hace?», videos del colegio,
// recorrido de bienvenida y lista de «primeros pasos».
// Todo vive en el navegador de cada persona (localStorage); los enlaces de los
// videos los pega la dirección en Sistema → Ayuda (script 28, opcional).
// ---------------------------------------------------------------------------

export type HelpGroup = 'GUARDIAN' | 'STUDENT' | 'TEACHER' | 'STAFF'

export const helpGroup = (role: Role): HelpGroup =>
  role === 'GUARDIAN' ? 'GUARDIAN' : role === 'STUDENT' ? 'STUDENT' : role === 'TEACHER' ? 'TEACHER' : 'STAFF'


// ---------------------------------------------------------------------------
// Videos del colegio (script 28). Sin el script, simplemente no hay videos.
// ---------------------------------------------------------------------------
const VIDEOS_KEY = 'campus_help_videos'
let videos: Record<string, string> = (() => {
  try { return JSON.parse(localStorage.getItem(VIDEOS_KEY) ?? '{}') as Record<string, string> } catch { return {} }
})()
const videoListeners = new Set<() => void>()

function setVideos(next: Record<string, string>) {
  videos = next
  try { localStorage.setItem(VIDEOS_KEY, JSON.stringify(next)) } catch { /* sin almacenamiento */ }
  videoListeners.forEach((fn) => fn())
}

export async function loadHelpVideos(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('campus_help_videos')
  if (!error && data && typeof data === 'object' && !Array.isArray(data)) setVideos(data as Record<string, string>)
  return videos
}

/** Guarda los enlaces para todo el campus (solo la dirección; lo valida la base). */
export async function saveHelpVideos(next: Record<string, string>): Promise<void> {
  const { data, error } = await supabase.rpc('set_campus_help_videos', { p_videos: next })
  if (error) throw error
  setVideos((data ?? {}) as Record<string, string>)
}

export function useHelpVideos(): Record<string, string> {
  const [, tick] = useState(0)
  useEffect(() => {
    const fn = () => tick((n) => n + 1)
    videoListeners.add(fn)
    return () => { videoListeners.delete(fn) }
  }, [])
  return videos
}

// ---------------------------------------------------------------------------
// Abrir la ayuda y el recorrido desde cualquier lugar
// ---------------------------------------------------------------------------
const OPEN_EVENT = 'campus:ayuda'
const TOUR_EVENT = 'campus:recorrido'

/** Abre el panel de ayuda; con `topic` salta directo a ese tema. */
export const openHelp = (topic?: string) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: topic ?? null }))
export const onOpenHelp = (fn: (topic: string | null) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<string | null>).detail ?? null)
  window.addEventListener(OPEN_EVENT, h)
  return () => window.removeEventListener(OPEN_EVENT, h)
}
export const replayTour = () => window.dispatchEvent(new Event(TOUR_EVENT))
export const onReplayTour = (fn: () => void) => {
  window.addEventListener(TOUR_EVENT, fn)
  return () => window.removeEventListener(TOUR_EVENT, fn)
}

// ---------------------------------------------------------------------------
// Primeros pasos: lista que se tilda sola cuando la persona hace cada cosa
// ---------------------------------------------------------------------------
export type StepId = 'entrar' | 'clave' | 'notas' | 'comunicados' | 'mensaje' | 'avisos' | 'tarea' | 'curso' | 'registro' | 'ayuda'

export type FirstStep = { id: StepId; label: string; hint: string; to?: string; helpTopic?: string }

const FIRST_STEPS: Record<HelpGroup, FirstStep[]> = {
  GUARDIAN: [
    { id: 'entrar', label: 'Entrar al campus', hint: 'Ya lo hizo: ¡buen comienzo!' },
    { id: 'clave', label: 'Cambiar mi contraseña', hint: 'Elija una clave que solo usted conozca.', to: '/cambiar-clave', helpTopic: 'clave' },
    { id: 'notas', label: 'Ver las notas de mi hijo', hint: 'Están en la libreta.', to: '/libreta', helpTopic: 'familia-notas' },
    { id: 'comunicados', label: 'Leer un comunicado', hint: 'Reemplazan a la agenda.', to: '/comunicados', helpTopic: 'familia-comunicados' },
    { id: 'avisos', label: 'Activar los avisos', hint: 'Para enterarse al instante.', to: '/notificaciones', helpTopic: 'avisos' },
  ],
  STUDENT: [
    { id: 'entrar', label: 'Entrar al campus', hint: '¡Ya estás dentro!' },
    { id: 'clave', label: 'Cambiar mi contraseña', hint: 'Elige una clave que solo tú conozcas.', to: '/cambiar-clave', helpTopic: 'clave' },
    { id: 'tarea', label: 'Abrir una tarea', hint: 'Mira qué te pidieron.', to: '/tareas', helpTopic: 'entregar-tarea' },
    { id: 'notas', label: 'Ver mis notas', hint: 'Están en la libreta.', to: '/libreta', helpTopic: 'alumno-notas' },
    { id: 'avisos', label: 'Activar los avisos', hint: 'Para saber cuándo hay tarea nueva.', to: '/notificaciones', helpTopic: 'avisos' },
  ],
  TEACHER: [
    { id: 'entrar', label: 'Entrar al campus', hint: 'Ya está dentro.' },
    { id: 'clave', label: 'Cambiar mi contraseña', hint: 'Elija una clave propia.', to: '/cambiar-clave', helpTopic: 'clave' },
    { id: 'curso', label: 'Abrir uno de mis cursos', hint: 'Cada curso es un cuaderno.', to: '/cursos', helpTopic: 'crear-tarea' },
    { id: 'registro', label: 'Abrir el registro de notas', hint: 'Aquí pone los niveles de logro.', to: '/notas', helpTopic: 'subir-notas' },
    { id: 'avisos', label: 'Activar los avisos', hint: 'Para enterarse de las entregas.', to: '/notificaciones', helpTopic: 'avisos' },
  ],
  STAFF: [
    { id: 'entrar', label: 'Entrar al campus', hint: 'Ya está dentro.' },
    { id: 'clave', label: 'Cambiar mi contraseña', hint: 'Elija una clave propia.', to: '/cambiar-clave', helpTopic: 'clave' },
    { id: 'comunicados', label: 'Abrir los comunicados', hint: 'Desde aquí avisa a las familias.', to: '/comunicados', helpTopic: 'enviar-comunicado' },
    { id: 'ayuda', label: 'Probar el botón Ayuda', hint: 'Ahí encontrará los pasos de cada tarea.' },
  ],
}

export const firstStepsFor = (group: HelpGroup) => FIRST_STEPS[group]

/** Pantallas que, solo con visitarlas, cuentan como paso hecho. */
const ROUTE_STEPS: [prefix: string, step: StepId][] = [
  ['/libreta', 'notas'], ['/expediente', 'notas'], ['/comunicados', 'comunicados'], ['/mensajes', 'mensaje'],
  ['/tareas', 'tarea'], ['/tarea/', 'tarea'], ['/cursos', 'curso'], ['/curso/', 'curso'], ['/notas', 'registro'],
]

const progressKey = (userId: string) => `campus_primeros_pasos_${userId}`
const doneListeners = new Set<() => void>()

export function readDone(userId: string): StepId[] {
  try { return JSON.parse(localStorage.getItem(progressKey(userId)) ?? '[]') as StepId[] } catch { return [] }
}

export function markStep(userId: string, step: StepId) {
  const done = readDone(userId)
  if (done.includes(step)) return
  try { localStorage.setItem(progressKey(userId), JSON.stringify([...done, step])) } catch { /* sin almacenamiento */ }
  doneListeners.forEach((fn) => fn())
}

export const markRoute = (userId: string, pathname: string) => {
  const hit = ROUTE_STEPS.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
  if (hit) markStep(userId, hit[1])
}

export function useDoneSteps(userId: string): StepId[] {
  const [done, setDone] = useState(() => readDone(userId))
  useEffect(() => {
    const fn = () => setDone(readDone(userId))
    fn()
    doneListeners.add(fn)
    return () => { doneListeners.delete(fn) }
  }, [userId])
  return done
}

const hiddenKey = (userId: string) => `campus_primeros_pasos_oculto_${userId}`
export const isChecklistHidden = (userId: string) => { try { return localStorage.getItem(hiddenKey(userId)) === '1' } catch { return false } }
export const hideChecklist = (userId: string) => { try { localStorage.setItem(hiddenKey(userId), '1') } catch { /* sin almacenamiento */ } doneListeners.forEach((fn) => fn()) }
