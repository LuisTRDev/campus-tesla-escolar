import { supabase } from '@/lib/supabase'
import { cleanText, positiveInteger } from '@/lib/security'
import { limaToday } from '@/lib/format'
import type {
  Competency, CompetencyGrade, GradingPeriod, Level, PeriodAttendance, ReportCardComment, Submission,
} from '@/types'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

// ---------------------------------------------------------------------------
// Bimestres
// ---------------------------------------------------------------------------
export async function listPeriods(): Promise<GradingPeriod[]> {
  const year = must(await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle()) as { id: number } | null
  if (!year) return []
  return must(await supabase.from('grading_periods').select('*').eq('academic_year_id', year.id).order('number')) as GradingPeriod[]
}

/** Bimestre en curso; si hoy cae en vacaciones, el último que empezó. */
export function currentPeriod(periods: GradingPeriod[]): GradingPeriod | null {
  const today = limaToday()
  return periods.find((p) => p.starts_on <= today && today <= p.ends_on)
    ?? [...periods].reverse().find((p) => p.starts_on <= today)
    ?? periods[0]
    ?? null
}

export async function updatePeriod(id: number, patch: Partial<Pick<GradingPeriod, 'name' | 'starts_on' | 'ends_on' | 'is_closed' | 'is_published'>>): Promise<void> {
  must(await supabase.from('grading_periods').update(patch).eq('id', positiveInteger(id)))
}

// ---------------------------------------------------------------------------
// Competencias
// ---------------------------------------------------------------------------
export async function listCompetencies(subjectIds: number[]): Promise<Competency[]> {
  const ids = [...new Set(subjectIds)].map((id) => positiveInteger(id))
  if (!ids.length) return []
  return must(await supabase
    .from('competencies')
    .select('*')
    .in('subject_id', ids)
    .eq('is_active', true)
    .order('sort_order')) as Competency[]
}

export async function listAssignmentCompetencies(assignmentIds: number[]): Promise<{ assignment_id: number; competency_id: number }[]> {
  if (!assignmentIds.length) return []
  return must(await supabase
    .from('assignment_competencies')
    .select('assignment_id, competency_id')
    .in('assignment_id', assignmentIds)) as { assignment_id: number; competency_id: number }[]
}

export async function setAssignmentCompetencies(assignmentId: number, competencyIds: number[]): Promise<void> {
  const id = positiveInteger(assignmentId)
  must(await supabase.from('assignment_competencies').delete().eq('assignment_id', id))
  if (competencyIds.length) {
    must(await supabase.from('assignment_competencies').insert(competencyIds.map((c) => ({ assignment_id: id, competency_id: positiveInteger(c) }))))
  }
}

// ---------------------------------------------------------------------------
// Calificaciones
// ---------------------------------------------------------------------------
export async function listOfferingGrades(offeringId: number, periodId: number): Promise<CompetencyGrade[]> {
  return must(await supabase
    .from('competency_grades')
    .select('*')
    .eq('offering_id', positiveInteger(offeringId))
    .eq('period_id', positiveInteger(periodId))) as CompetencyGrade[]
}

export async function listGradesForOfferings(offeringIds: number[], periodIds?: number[]): Promise<CompetencyGrade[]> {
  if (!offeringIds.length) return []
  let query = supabase.from('competency_grades').select('*').in('offering_id', offeringIds)
  if (periodIds) query = query.in('period_id', periodIds)
  return must(await query) as CompetencyGrade[]
}

export async function listStudentGrades(studentId: number): Promise<CompetencyGrade[]> {
  return must(await supabase.from('competency_grades').select('*').eq('student_id', positiveInteger(studentId))) as CompetencyGrade[]
}

export type GradeDraft = { student_id: number; competency_id: number; level: Level | null; conclusion: string | null }

export async function saveGrades(offeringId: number, periodId: number, rows: GradeDraft[]): Promise<void> {
  if (!rows.length) return
  const payload = rows.map((r) => ({
    offering_id: positiveInteger(offeringId),
    period_id: positiveInteger(periodId),
    student_id: positiveInteger(r.student_id),
    competency_id: positiveInteger(r.competency_id),
    level: r.level,
    conclusion: cleanText(r.conclusion, 1000) || null,
  }))
  must(await supabase.from('competency_grades').upsert(payload, { onConflict: 'period_id,student_id,competency_id' }))
}

// ---------------------------------------------------------------------------
// Evidencias: notas de tareas vinculadas a cada competencia
// ---------------------------------------------------------------------------
const LEVEL_VALUE: Record<Level, number> = { C: 1, B: 2, A: 3, AD: 4 }
const VALUE_LEVEL: Level[] = ['C', 'C', 'B', 'A', 'AD']

/** Escala vigesimal → nivel de logro (18–20 AD, 14–17 A, 11–13 B, 0–10 C). */
export function levelFromScore(score: number, max: number): Level {
  const n = (score / max) * 20
  if (n >= 17.5) return 'AD'
  if (n >= 13.5) return 'A'
  if (n >= 10.5) return 'B'
  return 'C'
}

export type Evidence = { assignmentId: number; title: string; level: Level; label: string }

/** Nivel sugerido a partir de las evidencias (promedio redondeado de niveles). */
export function suggestLevel(evidence: Evidence[]): Level | null {
  if (!evidence.length) return null
  const avg = evidence.reduce((sum, e) => sum + LEVEL_VALUE[e.level], 0) / evidence.length
  return VALUE_LEVEL[Math.round(avg)]
}

export async function listEvidence(offeringId: number, period: GradingPeriod): Promise<Map<string, Evidence[]>> {
  const assignments = must(await supabase
    .from('assignments')
    .select('id, title, due_at, created_at, grading_type, max_score')
    .eq('offering_id', positiveInteger(offeringId))
    .neq('status', 'DRAFT')) as { id: number; title: string; due_at: string | null; created_at: string; grading_type: 'SCORE' | 'LEVEL'; max_score: number }[]

  const inPeriod = assignments.filter((a) => {
    const day = (a.due_at ?? a.created_at).slice(0, 10)
    return day >= period.starts_on && day <= period.ends_on
  })
  const links = await listAssignmentCompetencies(inPeriod.map((a) => a.id))
  if (!links.length) return new Map()

  const subs = must(await supabase
    .from('submissions')
    .select('assignment_id, student_id, status, score, level')
    .in('assignment_id', [...new Set(links.map((l) => l.assignment_id))])
    .eq('status', 'GRADED')) as Pick<Submission, 'assignment_id' | 'student_id' | 'status' | 'score' | 'level'>[]

  const byId = new Map(inPeriod.map((a) => [a.id, a]))
  const result = new Map<string, Evidence[]>()
  for (const s of subs) {
    const a = byId.get(s.assignment_id)
    if (!a) continue
    let level: Level | null = null
    let label = ''
    if (a.grading_type === 'LEVEL' && s.level) {
      level = s.level
      label = s.level
    } else if (s.score != null) {
      level = levelFromScore(Number(s.score), Number(a.max_score))
      label = `${Number(s.score)}/${Number(a.max_score)}`
    }
    if (!level) continue
    for (const link of links.filter((l) => l.assignment_id === a.id)) {
      const key = `${s.student_id}:${link.competency_id}`
      result.set(key, [...(result.get(key) ?? []), { assignmentId: a.id, title: a.title, level, label }])
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Libreta: apreciación del tutor y asistencia
// ---------------------------------------------------------------------------
export async function listComments(studentIds: number[], periodIds?: number[]): Promise<ReportCardComment[]> {
  if (!studentIds.length) return []
  let query = supabase.from('report_card_comments').select('id, period_id, student_id, comment').in('student_id', studentIds)
  if (periodIds) query = query.in('period_id', periodIds)
  return must(await query) as ReportCardComment[]
}

export async function saveComment(periodId: number, studentId: number, comment: string): Promise<void> {
  must(await supabase.from('report_card_comments').upsert({
    period_id: positiveInteger(periodId),
    student_id: positiveInteger(studentId),
    comment: cleanText(comment, 1500),
  }, { onConflict: 'period_id,student_id' }))
}

export async function periodAttendance(periodId: number, classroomId: number): Promise<PeriodAttendance[]> {
  const { data, error } = await supabase.rpc('period_attendance', { p_period_id: positiveInteger(periodId), p_classroom_id: positiveInteger(classroomId) })
  if (error) throw error
  return (data ?? []) as PeriodAttendance[]
}

export const LEVELS: Level[] = ['AD', 'A', 'B', 'C']
