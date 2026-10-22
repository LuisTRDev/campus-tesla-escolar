import { bandOf, type Band, type Expediente, type PartKey } from '@/services/expediente'

// ---------------------------------------------------------------------------
// «¿Cómo subir el índice?»: simula qué pasaría si pasa algo concreto.
// Usa las mismas fórmulas del SQL (campus_25_expediente.sql): si cambias una
// regla allá, cámbiala aquí.
// ---------------------------------------------------------------------------
export type SuggestionIcon = 'tasks' | 'late' | 'attendance' | 'streak' | 'grade'

export type Suggestion = {
  id: string
  icon: SuggestionIcon
  part: PartKey
  title: string
  detail: string
  /** Valor que tendría esa parte del índice. */
  partTo: number
  /** Índice actual y el que se lograría. */
  from: number
  to: number
  /** Puntos que sube (siempre ≥ 1). */
  gain: number
  /** Rango al que pasaría, si cambia. */
  newBand: Band | null
}

/** Índice si una de las partes cambia de valor (promedio ponderado, como en la base). */
export function indexWith(parts: Expediente['score']['parts'], key: PartKey, value: number): number | null {
  let sum = 0
  let weights = 0
  for (const p of parts) {
    const w = Math.max(p.weight, 0)
    sum += (p.key === key ? value : p.value) * w
    weights += w
  }
  return weights > 0 ? Math.round(sum / weights) : null
}

const clamp = (v: number) => Math.min(100, Math.max(0, v))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const NEXT: Record<string, { to: string; pts: number }> = { C: { to: 'B', pts: 25 }, B: { to: 'A', pts: 20 }, A: { to: 'AD', pts: 15 } }

export function suggestions(e: Expediente, max = 4): Suggestion[] {
  const parts = e.score.parts
  const now = e.score.value
  if (now == null || parts.length === 0) return []
  const has = (k: PartKey) => parts.some((p) => p.key === k)
  const out: Suggestion[] = []
  const push = (s: Omit<Suggestion, 'from' | 'to' | 'gain' | 'newBand' | 'partTo'>, newPart: number) => {
    const partTo = clamp(Math.round(newPart))
    const to = indexWith(parts, s.part, partTo)
    if (to == null) return
    const gain = to - now
    if (gain < 1) return
    const band = bandOf(to)
    out.push({ ...s, partTo, from: now, to, gain, newBand: band.id !== bandOf(now).id ? band : null })
  }

  const t = e.tasks
  // Tareas: entregar a tiempo las que vienen.
  if (has('tareas') && t.pending.length > 0) {
    const k = Math.min(t.pending.length, 3)
    push({
      id: 'tasks-next', icon: 'tasks', part: 'tareas',
      title: `Entregar a tiempo ${k === 1 ? 'la próxima tarea' : `las próximas ${k} tareas`}`,
      detail: t.pending.slice(0, k).map((x) => x.title).join(', '),
    }, ((t.on_time + k) + 0.6 * t.late) / (t.expected + k) * 100)
  }
  // Tareas: ponerse al día con las vencidas (si el docente todavía las recibe).
  if (has('tareas') && t.missing > 0 && t.expected > 0) {
    const k = Math.min(t.missing, 3)
    push({
      id: 'tasks-late', icon: 'late', part: 'tareas',
      title: `Entregar ${plural(k, 'tarea vencida', 'tareas vencidas')}`,
      detail: 'Si el docente todavía las recibe, cuentan como entregas con retraso.',
    }, (t.on_time + 0.6 * (t.late + k)) / t.expected * 100)
  }
  // Asistencia: cinco días puntuales más.
  const a = e.attendance
  const den = a.school_days - a.justified
  if (has('asistencia') && den > 0) {
    const n = 5
    push({
      id: 'att-5', icon: 'attendance', part: 'asistencia',
      title: `${n} días puntuales seguidos`,
      detail: a.late > 0 ? 'Llegar antes de la hora de ingreso evita sumar tardanzas.' : 'Mantener la puntualidad sostiene el índice.',
    }, (a.on_time + n + 0.8 * a.late) / (den + n) * 100)
  }
  // Constancia: alargar la racha.
  if (has('constancia') && e.tesla) {
    const s = e.tesla.streak
    const up = s + 3
    push({
      id: 'streak-3', icon: 'streak', part: 'constancia',
      title: `Una racha de ${up} tareas a tiempo`,
      detail: s > 0 ? `Hoy lleva ${s}. Cada entrega puntual suma a la racha.` : 'Cada tarea entregada a tiempo empieza la racha.',
    }, 0.6 * Math.min(100, up * 10) + 0.4 * Math.min(100, e.tesla.xp30 / 1.5))
  }
  // Rendimiento: subir de nivel el área más baja (solo con bimestre publicado).
  if (has('rendimiento') && e.grades.current != null && e.grades.areas.length > 0) {
    const rows = e.grades.areas
      .map((x) => ({ x, p: x.periods[x.periods.length - 1] }))
      .filter((r) => NEXT[r.p.level])
      .sort((m, n) => m.p.points - n.p.points)
    const low = rows[0]
    if (low) {
      const step = NEXT[low.p.level]
      push({
        id: 'grade-up', icon: 'grade', part: 'rendimiento',
        title: `${low.x.name}: de ${low.p.level} a ${step.to}`,
        detail: 'Es el área con más espacio para crecer. Repasar con el docente ayuda.',
      }, e.grades.current + step.pts / e.grades.areas.length)
    }
  }

  return out.sort((m, n) => n.gain - m.gain).slice(0, max)
}

/** Índice si se cumplen todas las sugerencias a la vez (de cada parte cuenta la mejor). */
export function combinedIndex(e: Expediente, list: Suggestion[]): { to: number; gain: number; newBand: Band | null } | null {
  const now = e.score.value
  if (now == null || list.length === 0) return null
  const best = new Map<PartKey, number>()
  for (const s of list) best.set(s.part, Math.max(best.get(s.part) ?? 0, s.partTo))
  let sum = 0
  let weights = 0
  for (const p of e.score.parts) {
    const w = Math.max(p.weight, 0)
    sum += Math.max(p.value, best.get(p.key) ?? p.value) * w
    weights += w
  }
  if (weights <= 0) return null
  const to = Math.round(sum / weights)
  const band = bandOf(to)
  return { to, gain: to - now, newBand: band.id !== bandOf(now).id ? band : null }
}
