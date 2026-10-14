/**
 * Integridad académica (script 23): examen seguro, monitoreo y originalidad.
 * El cálculo del riesgo y los motivos está en src/lib/integrity.ts.
 */
import { supabase } from '@/lib/supabase'
import { positiveInteger } from '@/lib/security'
import type { AttemptView, QuizAnswer } from '@/services/aprendizaje'

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

/** La base todavía no tiene el script 23 (función inexistente). */
export function isMissingFunction(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  return e?.code === 'PGRST202' || e?.code === '42883' || /could not find the function/i.test(e?.message ?? '')
}

// ---------------------------------------------------------------------------
// Examen
// ---------------------------------------------------------------------------
export type BeginResult = AttemptView | { blocked: 'DEVICE'; message: string }

/** Identificador estable de este dispositivo (no es un dato personal). */
export function deviceId(): string {
  const KEY = 'campus-device'
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g, '')
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'sin-almacenamiento'
  }
}

/** Empieza o retoma el intento; sin el script 23 usa quiz_start. */
export async function quizBegin(assignmentId: number, code?: string): Promise<BeginResult> {
  try {
    return await rpc<BeginResult>('quiz_begin', { p_assignment_id: positiveInteger(assignmentId), p_code: code?.trim() || null, p_device: deviceId() })
  } catch (err) {
    if (!isMissingFunction(err)) throw err
    return rpc<AttemptView>('quiz_start', { p_assignment_id: positiveInteger(assignmentId) })
  }
}

export const quizNext = (attemptId: number, answers: Record<string, QuizAnswer>) =>
  rpc<AttemptView>('quiz_next', { p_attempt_id: positiveInteger(attemptId), p_answers: answers })

export type GuardEvent = { t: string; v?: number; q?: string; c?: number }
export type GuardStatus = { closed: boolean; leaves?: number; max?: number; action?: 'LOG' | 'WARN' | 'CLOSE' }

export const quizLogEvents = (attemptId: number, events: GuardEvent[]) =>
  rpc<GuardStatus>('quiz_log_events', { p_attempt_id: positiveInteger(attemptId), p_events: events })

export const quizReleaseDevice = (attemptId: number) => rpc<void>('quiz_release_device', { p_attempt_id: positiveInteger(attemptId) })

export async function getQuizAccessCode(assignmentId: number): Promise<string | null> {
  const { data, error } = await supabase.from('quiz_access').select('code').eq('assignment_id', positiveInteger(assignmentId)).maybeSingle()
  if (error) return null // sin el script 23
  return (data as { code: string } | null)?.code ?? null
}

export const setQuizAccessCode = (assignmentId: number, code: string | null) =>
  rpc<void>('set_quiz_access_code', { p_assignment_id: positiveInteger(assignmentId), p_code: code })

// ---------------------------------------------------------------------------
// Reportes
// ---------------------------------------------------------------------------
export type ReviewStatus = 'REVIEWED' | 'FALSE_POSITIVE' | 'CONFIRMED'
export type IntegrityReview = { status: ReviewStatus; note: string | null } | null

export type AttemptCounters = {
  leaves?: number; leave_ms?: number; pastes?: number; paste_chars?: number; copies?: number; context?: number
  fs_exits?: number; resizes?: number; multitab?: number; offline?: number; resumes?: number; devices?: number
  closed_by?: 'LEAVES'; q_ms?: Record<string, number>; typed?: Record<string, number>
}

export type AttemptSignals = {
  attempt_id: number; student_id: number; attempt_no: number; started_at: string; finished_at: string | null
  device_locked: boolean; integrity: AttemptCounters; events: number; questions: number
  pct: number | null; duration_s: number | null; fast_correct: number
  course: { avg: number | null; n: number }
  review: IntegrityReview
}

export type CollusionPair = {
  a: number; b: number; a_attempt: number; b_attempt: number
  shared_wrong: number; wrong_a: number; wrong_b: number; same: number; both_answered: number
  open_similar: number; finish_gap_s: number
}

export type QuizIntegrityReport = { attempts: AttemptSignals[]; pairs: CollusionPair[] }

export async function quizIntegrityReport(assignmentId: number): Promise<QuizIntegrityReport | null> {
  try {
    return await rpc<QuizIntegrityReport>('quiz_integrity_report', { p_assignment_id: positiveInteger(assignmentId) })
  } catch (err) {
    if (isMissingFunction(err)) return null
    throw err
  }
}

export type TimelineEvent = { t: string; v?: number; q?: string; c?: number; s: string }
export const quizIntegrityEvents = (attemptId: number) =>
  rpc<{ events: TimelineEvent[]; integrity: AttemptCounters; started_at: string; finished_at: string | null } | null>(
    'quiz_integrity_events', { p_attempt_id: positiveInteger(attemptId) })

export type TextFeatures = {
  words?: number; sentences?: number; avg_sentence?: number; sentence_cv?: number; avg_word?: number; long_ratio?: number
  ttr?: number; accent_rate?: number; comma_rate?: number; semi_rate?: number
  dashes?: number; curly?: number; hidden?: number; markdown?: number; inverted_ok?: number | null
}

export type WritingMetrics = { typed?: number; pasted?: number; pastes?: number; max_paste?: number; active_ms?: number; sessions?: number }

export type TextMatch = {
  submission_id: number; student_id: number; student_name: string; assignment_id: number; same_assignment: boolean
  assignment_title: string; year: number | null; shared: number; ratio: number
}

export type SubmissionSignals = {
  submission_id: number; student_id: number; words: number; fp_size: number
  features: TextFeatures; writing: WritingMetrics; baseline: TextFeatures; history_n: number
  matches: TextMatch[]
  dup_links: { submission_id: number; student_id: number; student_name: string; same_assignment: boolean; assignment_title: string }[]
  review: IntegrityReview
}

export async function submissionIntegrityReport(assignmentId: number): Promise<SubmissionSignals[] | null> {
  try {
    return await rpc<SubmissionSignals[]>('integrity_submission_report', { p_assignment_id: positiveInteger(assignmentId) })
  } catch (err) {
    if (isMissingFunction(err)) return null
    throw err
  }
}

export const integrityCompare = (submissionId: number, otherId: number) =>
  rpc<{ a: string | null; b: string | null; instructions: string | null }>('integrity_compare', { p_submission_id: positiveInteger(submissionId), p_other_id: positiveInteger(otherId) })

export const setIntegrityReview = (kind: 'ATTEMPT' | 'SUBMISSION', refId: number, status: ReviewStatus | null, note?: string) =>
  rpc<void>('set_integrity_review', { p_kind: kind, p_ref_id: positiveInteger(refId), p_status: status, p_note: note ?? null })

/** Cómo se escribió la entrega. Si falta el script 23, no pasa nada. */
export async function logWriting(assignmentId: number, metrics: WritingMetrics): Promise<void> {
  try {
    await rpc<void>('integrity_log_writing', { p_assignment_id: positiveInteger(assignmentId), p_metrics: metrics })
  } catch {
    /* opcional */
  }
}
