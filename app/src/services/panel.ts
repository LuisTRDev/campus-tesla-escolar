import { supabase } from '@/lib/supabase'

export type ClassroomStats = {
  classroom_id: number
  students: number
  school_days: number
  on_time: number
  late: number
  tasks_expected: number
  tasks_delivered: number
  tasks_on_time: number
  avg_score20: number | null
  levels_total: number
  levels_achieved: number
  circulars_total: number
  circulars_read: number
}

export type AreaStats = {
  subject_id: number
  subject_name: string
  subject_level: string | null
  color: string
  ad_count: number
  a_count: number
  b_count: number
  c_count: number
}

export type TeacherStats = {
  teacher_id: string
  full_name: string | null
  offerings: number
  assignments: number
  received: number
  graded: number
  pending: number
  overdue: number
  oldest_pending: string | null
  avg_grading_days: number | null
  register_filled: number
  register_total: number
}

export type UnreadFamily = {
  student_id: number
  student_name: string
  classroom_id: number | null
  total: number
  unread: number
  consent_pending: number
  family_accounts: number
  last_unread_title: string | null
  last_unread_at: string | null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return (data ?? []) as T[]
}

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row }
  for (const k of keys) if (out[k] != null) (out as Record<string, unknown>)[k as string] = Number(out[k])
  return out
}

export const dashboardClassrooms = async (from: string, to: string, periodId: number | null) =>
  (await rpc<ClassroomStats>('dashboard_classrooms', { p_from: from, p_to: to, p_period_id: periodId }))
    .map((r) => num(r, ['classroom_id', 'avg_score20']))

export const dashboardAreas = async (periodId: number, classroomId: number | null) =>
  (await rpc<AreaStats>('dashboard_areas', { p_period_id: periodId, p_classroom_id: classroomId })).map((r) => num(r, ['subject_id']))

export const dashboardTeachers = async (from: string, to: string, periodId: number | null, lateDays = 7) =>
  (await rpc<TeacherStats>('dashboard_teachers', { p_from: from, p_to: to, p_period_id: periodId, p_late_days: lateDays }))
    .map((r) => num(r, ['avg_grading_days']))

export const dashboardUnreadFamilies = async (from: string, to: string, minUnread = 1) =>
  (await rpc<UnreadFamily>('dashboard_unread_families', { p_from: from, p_to: to, p_min_unread: minUnread }))
    .map((r) => num(r, ['student_id', 'classroom_id']))

/** Proporción segura (null si no hay base para calcularla). */
export const ratio = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null)

export type Tone = 'ok' | 'warning' | 'critical'

/** Umbrales del colegio para marcar alertas (se ajustan aquí). */
export const THRESHOLDS = {
  attendance: { warning: 0.85, critical: 0.75 },
  punctuality: { warning: 0.85, critical: 0.7 },
  delivery: { warning: 0.75, critical: 0.6 },
  achievement: { warning: 0.6, critical: 0.45 },
  reading: { warning: 0.7, critical: 0.5 },
  register: { warning: 0.8, critical: 0.5 },
} as const

export function toneFor(value: number | null, t: { warning: number; critical: number }): Tone | null {
  if (value == null) return null
  if (value < t.critical) return 'critical'
  if (value < t.warning) return 'warning'
  return 'ok'
}
