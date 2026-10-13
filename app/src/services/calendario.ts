import { supabase } from '@/lib/supabase'
import { cleanSingleLine, cleanText, positiveInteger } from '@/lib/security'
import { UserError } from '@/lib/errors'
import type { EventKind, ScheduleBlock, SchoolEvent } from '@/types'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

// ---------------------------------------------------------------------------
// Horario
// ---------------------------------------------------------------------------
export async function listSchedule(classroomIds: number[]): Promise<ScheduleBlock[]> {
  const ids = [...new Set(classroomIds)].map((id) => positiveInteger(id))
  if (!ids.length) return []
  const rows = must(await supabase
    .from('schedule_blocks')
    .select('*')
    .in('classroom_id', ids)
    .order('weekday')
    .order('starts_at')) as ScheduleBlock[]
  return rows.map((b) => ({ ...b, starts_at: b.starts_at.slice(0, 5), ends_at: b.ends_at.slice(0, 5) }))
}

export async function createBlock(input: Omit<ScheduleBlock, 'id'>): Promise<void> {
  if (!input.offering_id && !cleanSingleLine(input.label, 60)) throw new UserError('Elige un curso o escribe una actividad (Recreo, Tutoría…).')
  if (input.ends_at <= input.starts_at) throw new UserError('La hora de fin debe ser posterior a la de inicio.')
  must(await supabase.from('schedule_blocks').insert({
    classroom_id: positiveInteger(input.classroom_id),
    weekday: input.weekday,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    offering_id: input.offering_id || null,
    label: cleanSingleLine(input.label, 60) || null,
  }))
}

export async function deleteBlock(id: number): Promise<void> {
  must(await supabase.from('schedule_blocks').delete().eq('id', positiveInteger(id)))
}

/** Copia el horario de un día a otros (útil al armar la semana). */
export async function copyDay(classroomId: number, fromDay: number, toDays: number[], blocks: ScheduleBlock[]): Promise<void> {
  const source = blocks.filter((b) => b.classroom_id === classroomId && b.weekday === fromDay)
  if (!source.length) throw new UserError('Ese día no tiene bloques para copiar.')
  for (const day of toDays) {
    const existing = blocks.filter((b) => b.classroom_id === classroomId && b.weekday === day)
    if (existing.length) must(await supabase.from('schedule_blocks').delete().in('id', existing.map((b) => b.id)))
    must(await supabase.from('schedule_blocks').insert(source.map((b) => ({
      classroom_id: classroomId, weekday: day, starts_at: b.starts_at, ends_at: b.ends_at, offering_id: b.offering_id, label: b.label,
    }))))
  }
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------
export async function listEvents(from: string, to: string): Promise<SchoolEvent[]> {
  return must(await supabase
    .from('school_events')
    .select('*')
    .lte('starts_on', to)
    .gte('ends_on', from)
    .order('starts_on')
    .limit(500)) as SchoolEvent[]
}

/** Filtra lo que corresponde a un aula concreta (para alumno y familia). */
export function eventsForClassroom(events: SchoolEvent[], classroom: { id: number; level: string | null } | null): SchoolEvent[] {
  if (!classroom) return events.filter((e) => e.scope === 'SCHOOL')
  return events.filter((e) =>
    e.scope === 'SCHOOL'
    || (e.scope === 'LEVEL' && e.level === classroom.level)
    || ((e.scope === 'CLASSROOM' || e.scope === 'COURSE') && e.classroom_id === classroom.id))
}

export async function createEvent(input: {
  title: string
  description: string
  kind: EventKind
  startsOn: string
  endsOn: string
  startsAt: string
  scope: SchoolEvent['scope']
  level?: string
  classroomId?: number
  offeringId?: number
}): Promise<void> {
  const title = cleanSingleLine(input.title, 140)
  if (title.length < 2) throw new UserError('Escribe un título para el evento.')
  if (!input.startsOn) throw new UserError('Elige la fecha.')
  const endsOn = input.endsOn && input.endsOn >= input.startsOn ? input.endsOn : input.startsOn
  must(await supabase.from('school_events').insert({
    title,
    description: cleanText(input.description, 2000) || null,
    kind: input.kind,
    starts_on: input.startsOn,
    ends_on: endsOn,
    starts_at: input.startsAt || null,
    scope: input.scope,
    level: input.scope === 'LEVEL' ? input.level : null,
    classroom_id: input.scope === 'CLASSROOM' ? positiveInteger(input.classroomId) : null,
    offering_id: input.scope === 'COURSE' ? positiveInteger(input.offeringId) : null,
  }))
}

export async function deleteEvent(id: number): Promise<void> {
  must(await supabase.from('school_events').delete().eq('id', positiveInteger(id)))
}

export const EVENT_COLORS: Record<EventKind, string> = {
  EXAM: '#C4412F',
  HOLIDAY: '#1E8E5A',
  ACTIVITY: '#2563EB',
  MEETING: '#7C3AED',
  OTHER: '#5B6B82',
}
