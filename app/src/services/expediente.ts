import { supabase } from '@/lib/supabase'
import { positiveInteger } from '@/lib/security'
import { isMissingFunction } from '@/services/integridad'
import type { Level } from '@/types'

// ---------------------------------------------------------------------------
// Retrato Tesla: el expediente de la familia (script 25, child_overview).
// El Índice Tesla es REFERENCIAL: no es una nota oficial ni reemplaza la libreta.
// ---------------------------------------------------------------------------
export type PartKey = 'rendimiento' | 'tareas' | 'asistencia' | 'constancia'

export type ScorePart = { key: PartKey; label: string; value: number; weight: number; detail: string }

export type AreaGrade = {
  subject_id: number
  name: string
  short_name: string | null
  color: string
  periods: { number: number; points: number; level: Level }[]
}

export type TaskItem = { id: number; title: string; course: string; offering_id: number; due_at: string }

export type CircularItem = { id: number; title: string; published_at: string; read: boolean; needs_answer: boolean }

export type Expediente = {
  generated_at: string
  student: { id: number; first_name: string | null; last_name: string | null; classroom: string; level: string | null; tutor: string | null }
  year: number | null
  periods: { number: number; name: string; starts_on: string; ends_on: string; is_published: boolean; is_current: boolean }[]
  score: { value: number | null; parts: ScorePart[] }
  grades: {
    areas: AreaGrade[]
    periods: { number: number; points: number; level: Level }[]
    current: number | null
    previous: number | null
    graded_avg: number | null
  }
  attendance: {
    from: string
    to: string | null
    school_days: number
    on_time: number
    late: number
    justified: number
    absent: number
    days: { d: string; s: 'ON_TIME' | 'LATE' }[]
    holidays: string[]
  }
  tasks: { expected: number; on_time: number; late: number; missing: number; pending: TaskItem[]; overdue: TaskItem[] }
  tesla: null | {
    xp: number
    level: number
    streak: number
    xp30: number
    achievements: number
    star: string
    level_xp: number
    next_level_xp: number
    recent: { name: string; icon: string; rarity: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'; earned_at: string }[]
  }
  family: {
    circulars_unread: number
    circulars_to_answer: number
    circulars: CircularItem[]
    appointments: { id: number; starts_at: string; mode: string; location: string | null; teacher: string | null }[]
    justifications_pending: number
    events: { id: number; title: string; kind: string; starts_on: string; ends_on: string }[]
  }
  signals: { missing_14d: number; late_14d: number; low_30d: number }
}

export async function getExpediente(studentId: number): Promise<Expediente> {
  const { data, error } = await supabase.rpc('child_overview', { p_student_id: positiveInteger(studentId) })
  if (error) throw error
  return data as Expediente
}

// ---------------------------------------------------------------------------
// Rangos del índice: siempre color + palabra (el color solo nunca basta).
// Ninguno es rojo de error: el más bajo es un coral cálido, para orientar y no alarmar.
// ---------------------------------------------------------------------------
export type Band = {
  id: 'sobresaliente' | 'muybien' | 'buencamino' | 'mejorar' | 'apoyo'
  min: number
  label: string
  /** Frase para la familia (se completa con el nombre del hijo). */
  phrase: (name: string) => string
  /** Degradado del anillo (de principio a fin) y brillo. */
  from: string
  to: string
  glow: string
}

export const BANDS: Band[] = [
  { id: 'sobresaliente', min: 90, label: 'Sobresaliente', phrase: (n) => `${n} está teniendo un desempeño brillante.`, from: '#F2B51C', to: '#FF7A3D', glow: '#F2B51C' },
  { id: 'muybien', min: 75, label: 'Muy bien', phrase: (n) => `${n} va muy bien. Sigan acompañándolo con constancia.`, from: '#1E8E5A', to: '#5FD9A0', glow: '#34C77B' },
  { id: 'buencamino', min: 60, label: 'En buen camino', phrase: (n) => `${n} avanza bien y tiene espacio para crecer.`, from: '#2563EB', to: '#7DB4FF', glow: '#4C8DF6' },
  { id: 'mejorar', min: 45, label: 'Podemos mejorar', phrase: (n) => `Con un pequeño impulso, ${n} puede subir pronto.`, from: '#D99A1E', to: '#F7D774', glow: '#F0B83A' },
  { id: 'apoyo', min: 0, label: 'Necesita apoyo', phrase: (n) => `Vale la pena conversar con ${n} y con su tutor.`, from: '#E0572F', to: '#FF9C7A', glow: '#F2784D' },
]

export function bandOf(value: number | null | undefined): Band {
  const v = value ?? 0
  return BANDS.find((b) => v >= b.min) ?? BANDS[BANDS.length - 1]
}

export const PART_HELP: Record<PartKey, string> = {
  rendimiento: 'Sale de los niveles AD, A, B y C del último bimestre que dirección publicó (AD vale 100, A 85, B 65 y C 40). Si todavía no hay bimestre publicado, usa el promedio de las tareas ya calificadas.',
  tareas: 'Compara las tareas entregadas con las que ya vencieron este año. Una entrega a tiempo cuenta completa y una tarde cuenta el 60 %.',
  asistencia: 'Un ingreso puntual cuenta completo y una tardanza el 80 %, frente a los días de clase. Las faltas que el colegio aprobó como justificadas no restan.',
  constancia: 'Mezcla la racha de tareas entregadas a tiempo (60 %) con los puntos de experiencia ganados en los últimos 30 días en el Perfil Tesla (40 %).',
}

/** Primera palabra del nombre, en formato de nombre propio. */
export function firstName(name: string | null | undefined): string {
  const w = (name ?? '').trim().split(/\s+/)[0] ?? ''
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : 'Tu hijo'
}

/** Cambio entre dos puntajes en palabras. */
export function trendOf(current: number | null, previous: number | null): { dir: 'up' | 'down' | 'same'; text: string } | null {
  if (current == null || previous == null) return null
  const d = Math.round(current - previous)
  if (Math.abs(d) < 3) return { dir: 'same', text: 'Se mantiene parecido al bimestre anterior' }
  return d > 0 ? { dir: 'up', text: `Subió ${d} puntos frente al bimestre anterior` } : { dir: 'down', text: `Bajó ${-d} puntos frente al bimestre anterior` }
}

/** Una foto semanal del índice (script 27). */
export type Snapshot = { week: string; score: number; parts: ScorePart[] }

/** Guarda la foto de esta semana y devuelve el recorrido; null si la base no tiene el script 27. */
export async function getHistory(studentId: number): Promise<Snapshot[] | null> {
  const { data, error } = await supabase.rpc('expediente_history', { p_student_id: positiveInteger(studentId) })
  if (error) {
    if (isMissingFunction(error)) return null
    throw error
  }
  return (data ?? []) as Snapshot[]
}

// ---------------------------------------------------------------------------
// Celebración al subir de rango: se compara con el último rango visto en este dispositivo.
// ---------------------------------------------------------------------------
const bandKey = (studentId: number) => `expediente-band:${studentId}`
const rankOf = (id: Band['id']) => BANDS.length - BANDS.findIndex((b) => b.id === id)

/** ¿Subió de rango desde la última vez? (no escribe nada; usa `rememberBand` cuando ya se celebró) */
export function peekRankUp(studentId: number, band: Band): Band | null {
  try {
    const prev = BANDS.find((b) => b.id === localStorage.getItem(bandKey(studentId)))
    return prev && rankOf(band.id) > rankOf(prev.id) ? prev : null
  } catch {
    return null
  }
}

export function rememberBand(studentId: number, band: Band): void {
  try {
    localStorage.setItem(bandKey(studentId), band.id)
  } catch {
    // Sin almacenamiento (modo privado): solo no se recordará.
  }
}
