import { supabase } from '@/lib/supabase'
import { cleanSingleLine, cleanText, positiveInteger, safeFileName } from '@/lib/security'
import { UserError } from '@/lib/errors'
import type { Level } from '@/types'

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export const BUCKET_FEEDBACK = 'campus-feedback'

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------
export type CourseUnit = { id: number; offering_id: number; title: string; description: string | null; position: number }

export async function listUnits(offeringId: number): Promise<CourseUnit[]> {
  return must(await supabase.from('course_units').select('id, offering_id, title, description, position')
    .eq('offering_id', positiveInteger(offeringId)).order('position').order('id')) as CourseUnit[]
}

export async function saveUnit(u: { id?: number; offeringId: number; title: string; description?: string; position?: number }) {
  const row = { offering_id: positiveInteger(u.offeringId), title: cleanSingleLine(u.title, 120), description: cleanText(u.description, 1000) || null, position: u.position ?? 999 }
  if (row.title.length < 2) throw new UserError('Escribe el nombre de la unidad.')
  if (u.id) must(await supabase.from('course_units').update(row).eq('id', positiveInteger(u.id)))
  else must(await supabase.from('course_units').insert(row))
}

export const deleteUnit = async (id: number) => must(await supabase.from('course_units').delete().eq('id', positiveInteger(id)))

/** Guarda el orden nuevo (después de arrastrar). */
export async function reorderUnits(ids: number[]) {
  await Promise.all(ids.map((id, i) => supabase.from('course_units').update({ position: i + 1 }).eq('id', positiveInteger(id))))
}

export async function setMaterialUnit(materialId: number, unitId: number | null) {
  must(await supabase.from('materials').update({ unit_id: unitId }).eq('id', positiveInteger(materialId)))
}

export async function setAssignmentUnit(assignmentId: number, unitId: number | null) {
  must(await supabase.from('assignments').update({ unit_id: unitId }).eq('id', positiveInteger(assignmentId)))
}

export async function listMaterialViews(materialIds: number[], studentId: number): Promise<Set<number>> {
  if (!materialIds.length) return new Set()
  const rows = must(await supabase.from('material_views').select('material_id').eq('student_id', positiveInteger(studentId)).in('material_id', materialIds)) as { material_id: number }[]
  return new Set(rows.map((r) => Number(r.material_id)))
}

export const markMaterialViewed = (materialId: number) => rpc<void>('mark_material_viewed', { p_material_id: positiveInteger(materialId) }).catch(() => undefined)

// ---------------------------------------------------------------------------
// Publicaciones programadas
// ---------------------------------------------------------------------------
let lastPublishCheck = 0
/** Publica lo programado que ya llegó a su fecha (como mucho una vez por minuto). */
export function publishDueContent(): void {
  if (Date.now() - lastPublishCheck < 60_000) return
  lastPublishCheck = Date.now()
  void supabase.rpc('publish_due_content').then(() => undefined, () => undefined)
}

export type ScheduledAnnouncement = { id: number; scope: 'COURSE' | 'CLASSROOM' | 'SCHOOL'; offering_id: number | null; classroom_id: number | null; title: string; body: string; publish_at: string }

export async function listScheduledAnnouncements(offeringId?: number): Promise<ScheduledAnnouncement[]> {
  let q = supabase.from('scheduled_announcements').select('*').order('publish_at')
  if (offeringId) q = q.eq('offering_id', positiveInteger(offeringId))
  return must(await q) as ScheduledAnnouncement[]
}

export async function scheduleAnnouncement(input: { scope: 'COURSE' | 'CLASSROOM' | 'SCHOOL'; offeringId?: number; classroomId?: number; title: string; body: string; publishAt: string }) {
  const title = cleanSingleLine(input.title, 140)
  const body = cleanText(input.body, 5000)
  if (title.length < 2 || !body) throw new UserError('Completa el título y el mensaje.')
  if (!(Date.parse(input.publishAt) > Date.now())) throw new UserError('La fecha de publicación debe ser futura.')
  must(await supabase.from('scheduled_announcements').insert({
    scope: input.scope, offering_id: input.offeringId ?? null, classroom_id: input.classroomId ?? null, title, body, publish_at: input.publishAt,
  }))
}

export const deleteScheduledAnnouncement = async (id: number) => must(await supabase.from('scheduled_announcements').delete().eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Rúbricas
// ---------------------------------------------------------------------------
export type RubricCriterion = { id: string; name: string; levels: Record<Level, string> }
export type Rubric = { id: number; owner_id: string; title: string; description: string | null; criteria: RubricCriterion[]; shared: boolean }

const LEVEL_POINTS: Record<Level, number> = { AD: 4, A: 3, B: 2, C: 1 }

/** Nivel final de una rúbrica: promedio de los criterios (AD=4 … C=1). */
export function rubricLevel(scores: Record<string, Level> | null | undefined, criteria: RubricCriterion[]): Level | null {
  if (!scores) return null
  const vals = criteria.map((c) => scores[c.id]).filter((v): v is Level => !!v)
  if (vals.length < criteria.length || !vals.length) return null
  const avg = vals.reduce((s, v) => s + LEVEL_POINTS[v], 0) / vals.length
  return avg >= 3.5 ? 'AD' : avg >= 2.5 ? 'A' : avg >= 1.5 ? 'B' : 'C'
}

/** Nota numérica equivalente (para tareas con nota). */
export function rubricScore(scores: Record<string, Level> | null | undefined, criteria: RubricCriterion[], max: number): number | null {
  if (!scores) return null
  const vals = criteria.map((c) => scores[c.id]).filter((v): v is Level => !!v)
  if (vals.length < criteria.length || !vals.length) return null
  const avg = vals.reduce((s, v) => s + LEVEL_POINTS[v], 0) / vals.length
  return Math.round((avg / 4) * max * 100) / 100
}

export async function listRubrics(): Promise<Rubric[]> {
  return must(await supabase.from('rubrics').select('*').order('updated_at', { ascending: false })) as Rubric[]
}

export async function getRubric(id: number): Promise<Rubric | null> {
  const { data, error } = await supabase.from('rubrics').select('*').eq('id', positiveInteger(id)).maybeSingle()
  if (error) throw error
  return (data as Rubric) ?? null
}

export async function saveRubric(r: { id?: number; title: string; description?: string; criteria: RubricCriterion[]; shared: boolean }): Promise<number> {
  const title = cleanSingleLine(r.title, 120)
  if (title.length < 2) throw new UserError('Escribe el nombre de la rúbrica.')
  const criteria = r.criteria
    .map((c) => ({ id: c.id, name: cleanSingleLine(c.name, 120), levels: { AD: cleanText(c.levels.AD, 400), A: cleanText(c.levels.A, 400), B: cleanText(c.levels.B, 400), C: cleanText(c.levels.C, 400) } }))
    .filter((c) => c.name)
  if (!criteria.length) throw new UserError('Agrega al menos un criterio.')
  if (criteria.length > 12) throw new UserError('Máximo 12 criterios.')
  const row = { title, description: cleanText(r.description, 600) || null, criteria, shared: r.shared, updated_at: new Date().toISOString() }
  if (r.id) {
    must(await supabase.from('rubrics').update(row).eq('id', positiveInteger(r.id)))
    return r.id
  }
  return (must(await supabase.from('rubrics').insert(row).select('id').single()) as { id: number }).id
}

export const deleteRubric = async (id: number) => must(await supabase.from('rubrics').delete().eq('id', positiveInteger(id)))
export const setAssignmentRubric = async (assignmentId: number, rubricId: number | null) =>
  must(await supabase.from('assignments').update({ rubric_id: rubricId }).eq('id', positiveInteger(assignmentId)))

// ---------------------------------------------------------------------------
// Evaluaciones en línea
// ---------------------------------------------------------------------------
export type QuestionType = 'SINGLE' | 'MULTI' | 'TRUE_FALSE' | 'MATCH' | 'SHORT' | 'OPEN'
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE: 'Opción múltiple (una correcta)', MULTI: 'Varias correctas', TRUE_FALSE: 'Verdadero o falso',
  MATCH: 'Relacionar columnas', SHORT: 'Respuesta corta', OPEN: 'Desarrollo (la corriges tú)',
}

export type Option = { id: string; text: string }
export type MatchOptions = { left: Option[]; right: Option[] }
export type QuizAnswer = string | string[] | boolean | Record<string, string> | null

export type EditorQuestion = {
  id?: number
  position?: number
  type: QuestionType
  prompt: string
  options: Option[] | MatchOptions
  points: number
  explanation?: string | null
  answer: QuizAnswer
}

export type AttemptQuestion = { id: number; type: QuestionType; prompt: string; points: number; options: Option[] | MatchOptions }
export type AttemptView = {
  attempt_id: number
  attempt_no: number
  started_at: string
  deadline_at: string | null
  finished_at: string | null
  answers: Record<string, QuizAnswer>
  questions: AttemptQuestion[]
}
export type AttemptReview = AttemptView & {
  results: Record<string, number | null>
  auto_points: number | null
  manual_points: number | null
  max_points: number | null
  needs_review: boolean
  show_answers: boolean
  keys: Record<string, { answer: QuizAnswer; explanation: string | null }> | null
}
export type QuizAttempt = {
  id: number; assignment_id: number; student_id: number; attempt_no: number; started_at: string; finished_at: string | null
  auto_points: number | null; manual_points: number | null; max_points: number | null; needs_review: boolean
}

export const quizEditor = (assignmentId: number) => rpc<EditorQuestion[] | null>('quiz_editor', { p_assignment_id: positiveInteger(assignmentId) }).then((r) => r ?? [])

export function validateQuestion(q: EditorQuestion): void {
  if (!q.prompt.trim()) throw new UserError('Escribe la pregunta.')
  if (!(q.points > 0)) throw new UserError('Los puntos deben ser mayores que cero.')
  if (q.type === 'SINGLE' || q.type === 'MULTI') {
    const opts = q.options as Option[]
    if (opts.filter((o) => o.text.trim()).length < 2) throw new UserError('Escribe al menos dos opciones.')
    if (q.type === 'SINGLE' && typeof q.answer !== 'string') throw new UserError('Marca la opción correcta.')
    if (q.type === 'MULTI' && (!Array.isArray(q.answer) || !q.answer.length)) throw new UserError('Marca al menos una opción correcta.')
  }
  if (q.type === 'TRUE_FALSE' && typeof q.answer !== 'boolean') throw new UserError('Elige verdadero o falso.')
  if (q.type === 'MATCH') {
    const m = q.options as MatchOptions
    if (m.left.length < 2) throw new UserError('Agrega al menos dos pares para relacionar.')
    if (m.left.some((l) => !l.text.trim()) || m.right.some((r) => !r.text.trim())) throw new UserError('Completa todos los pares.')
  }
  if (q.type === 'SHORT' && (!Array.isArray(q.answer) || !(q.answer as string[]).some((a) => a.trim()))) throw new UserError('Escribe al menos una respuesta válida.')
}

export function saveQuestion(assignmentId: number, q: EditorQuestion) {
  validateQuestion(q)
  const payload = {
    ...q,
    prompt: cleanText(q.prompt, 2000),
    explanation: cleanText(q.explanation ?? '', 1000) || null,
    answer: q.type === 'SHORT' ? (q.answer as string[]).map((a) => cleanSingleLine(a, 200)).filter(Boolean) : q.type === 'OPEN' ? null : q.answer,
  }
  return rpc<number>('quiz_save_question', { p_assignment_id: positiveInteger(assignmentId), p_question: payload })
}

export async function updateQuizSettings(assignmentId: number, settings: import('@/types').QuizSettings) {
  must(await supabase.from('assignments').update({ quiz_settings: settings }).eq('id', positiveInteger(assignmentId)))
}

export const deleteQuestion = async (id: number) => must(await supabase.from('quiz_questions').delete().eq('id', positiveInteger(id)))
export async function reorderQuestions(ids: number[]) {
  await Promise.all(ids.map((id, i) => supabase.from('quiz_questions').update({ position: i + 1 }).eq('id', positiveInteger(id))))
}

export const quizStart = (assignmentId: number) => rpc<AttemptView>('quiz_start', { p_assignment_id: positiveInteger(assignmentId) })
export const quizSave = (attemptId: number, answers: Record<string, QuizAnswer>) => rpc<void>('quiz_save', { p_attempt_id: positiveInteger(attemptId), p_answers: answers })
export const quizFinish = (attemptId: number, answers: Record<string, QuizAnswer>) =>
  rpc<{ attempt_id: number; auto_points: number; max_points: number; needs_review: boolean }>('quiz_finish', { p_attempt_id: positiveInteger(attemptId), p_answers: answers })
export const quizReview = (attemptId: number) => rpc<AttemptReview>('quiz_review', { p_attempt_id: positiveInteger(attemptId) })
export const quizGradeOpen = (attemptId: number, points: Record<string, number>) => rpc<void>('quiz_grade_open', { p_attempt_id: positiveInteger(attemptId), p_points: points })

export async function listAttempts(assignmentId: number, studentId?: number): Promise<QuizAttempt[]> {
  let q = supabase.from('quiz_attempts').select('id, assignment_id, student_id, attempt_no, started_at, finished_at, auto_points, manual_points, max_points, needs_review')
    .eq('assignment_id', positiveInteger(assignmentId)).order('attempt_no')
  if (studentId) q = q.eq('student_id', positiveInteger(studentId))
  return (must(await q) as QuizAttempt[]).map((a) => ({
    ...a, auto_points: a.auto_points == null ? null : Number(a.auto_points), manual_points: a.manual_points == null ? null : Number(a.manual_points),
    max_points: a.max_points == null ? null : Number(a.max_points),
  }))
}

// Banco de preguntas
export type BankQuestion = EditorQuestion & { id: number; owner_id: string; subject_id: number | null; grade: string | null; level: string | null; shared: boolean; tags: string[]; created_at: string }

export async function listBank(filter: { subjectId?: number | null; search?: string } = {}): Promise<BankQuestion[]> {
  let q = supabase.from('question_bank').select('*').order('created_at', { ascending: false }).limit(200)
  if (filter.subjectId) q = q.eq('subject_id', positiveInteger(filter.subjectId))
  if (filter.search?.trim()) q = q.ilike('prompt', `%${filter.search.trim().replace(/[%_]/g, '')}%`)
  return (must(await q) as BankQuestion[]).map((b) => ({ ...b, points: Number(b.points) }))
}

export const importFromBank = (assignmentId: number, ids: number[]) =>
  rpc<number>('quiz_import_from_bank', { p_assignment_id: positiveInteger(assignmentId), p_ids: ids.map((i) => positiveInteger(i)) })
export const questionToBank = (questionId: number, shared = true) => rpc<number>('quiz_question_to_bank', { p_question_id: positiveInteger(questionId), p_shared: shared })
export const deleteBankQuestion = async (id: number) => must(await supabase.from('question_bank').delete().eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------
export type AssignmentGroup = { id: number; name: string; students: number[] }

export async function listGroups(assignmentId: number): Promise<AssignmentGroup[]> {
  const [groups, members] = await Promise.all([
    supabase.from('assignment_groups').select('id, name').eq('assignment_id', positiveInteger(assignmentId)).order('id'),
    supabase.from('assignment_group_members').select('group_id, student_id').eq('assignment_id', positiveInteger(assignmentId)),
  ])
  const g = must(groups) as { id: number; name: string }[]
  const m = must(members) as { group_id: number; student_id: number }[]
  return g.map((x) => ({ ...x, students: m.filter((y) => y.group_id === x.id).map((y) => Number(y.student_id)) }))
}

export const saveGroups = (assignmentId: number, groups: { name: string; students: number[] }[]) =>
  rpc<void>('set_assignment_groups', { p_assignment_id: positiveInteger(assignmentId), p_groups: groups.filter((g) => g.students.length) })

// ---------------------------------------------------------------------------
// Versiones, retroalimentación y comentarios guardados
// ---------------------------------------------------------------------------
export type SubmissionVersion = { id: number; content: string | null; files: { path: string; name: string; size: number; type: string }[]; submitted_at: string; status: string; score: number | null; level: string | null; feedback: string | null; saved_at: string }

export async function listVersions(submissionId: number): Promise<SubmissionVersion[]> {
  return must(await supabase.from('submission_versions').select('*').eq('submission_id', positiveInteger(submissionId)).order('saved_at', { ascending: false })) as SubmissionVersion[]
}

export async function uploadFeedbackFile(submissionId: number, blob: Blob, name: string): Promise<string> {
  const path = `${positiveInteger(submissionId)}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`
  const up = await supabase.storage.from(BUCKET_FEEDBACK).upload(path, blob, { contentType: blob.type || undefined, upsert: false })
  if (up.error) throw up.error
  return path
}

export async function setFeedbackAudio(submissionId: number, path: string | null) {
  must(await supabase.from('submissions').update({ feedback_audio_path: path }).eq('id', positiveInteger(submissionId)))
}

export async function setFeedbackAnnotations(submissionId: number, list: { file_index: number; path: string }[]) {
  must(await supabase.from('submissions').update({ feedback_annotations: list }).eq('id', positiveInteger(submissionId)))
}

export type Snippet = { id: number; body: string }
export const listSnippets = async () => must(await supabase.from('feedback_snippets').select('id, body').order('created_at', { ascending: false })) as Snippet[]
export async function saveSnippet(body: string) {
  const text = cleanText(body, 1000)
  if (!text) throw new UserError('Escribe el comentario.')
  must(await supabase.from('feedback_snippets').insert({ body: text }))
}
export const deleteSnippet = async (id: number) => must(await supabase.from('feedback_snippets').delete().eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Foro
// ---------------------------------------------------------------------------
export type ForumThread = {
  id: number; title: string; body: string; pinned: boolean; locked: boolean; hidden: boolean; posts_count: number
  last_post_at: string; created_at: string; author_id: string; author_name: string | null; author_role: string | null; has_best: boolean
}
export type ForumPost = { id: number; body: string | null; hidden: boolean; is_best: boolean; created_at: string; author_id: string; author_name: string | null; author_role: string | null }

export const listThreads = (offeringId: number) => rpc<ForumThread[] | null>('forum_threads_view', { p_offering_id: positiveInteger(offeringId) }).then((r) => r ?? [])
export const listPosts = (threadId: number) => rpc<ForumPost[] | null>('forum_posts_view', { p_thread_id: positiveInteger(threadId) }).then((r) => r ?? [])

export async function createThread(offeringId: number, title: string, body: string): Promise<number> {
  const t = cleanSingleLine(title, 160)
  const b = cleanText(body, 5000)
  if (t.length < 3) throw new UserError('Escribe un título (mínimo 3 letras).')
  if (!b) throw new UserError('Escribe tu pregunta o idea.')
  return (must(await supabase.from('forum_threads').insert({ offering_id: positiveInteger(offeringId), title: t, body: b }).select('id').single()) as { id: number }).id
}

export async function createPost(threadId: number, body: string) {
  const b = cleanText(body, 4000)
  if (!b) throw new UserError('Escribe tu respuesta.')
  must(await supabase.from('forum_posts').insert({ thread_id: positiveInteger(threadId), body: b }))
}

export const moderateForum = (kind: 'PIN' | 'LOCK' | 'HIDE_THREAD' | 'HIDE_POST' | 'BEST', id: number, value: boolean) =>
  rpc<void>('forum_moderate', { p_kind: kind, p_id: positiveInteger(id), p_value: value })
export const deleteThread = async (id: number) => must(await supabase.from('forum_threads').delete().eq('id', positiveInteger(id)))
export const deletePost = async (id: number) => must(await supabase.from('forum_posts').delete().eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Videos con preguntas
// ---------------------------------------------------------------------------
export type Checkpoint = { id: number; material_id: number; at_seconds: number; question: string; options: string[]; answer_index: number | null }

export async function listCheckpoints(materialId: number): Promise<Checkpoint[]> {
  return must(await supabase.from('material_checkpoints').select('*').eq('material_id', positiveInteger(materialId)).order('at_seconds')) as Checkpoint[]
}

export async function saveCheckpoint(c: { materialId: number; atSeconds: number; question: string; options: string[]; answerIndex: number | null }) {
  const options = c.options.map((o) => cleanSingleLine(o, 200)).filter(Boolean)
  if (!cleanText(c.question, 500)) throw new UserError('Escribe la pregunta.')
  if (options.length < 2) throw new UserError('Escribe al menos dos opciones.')
  must(await supabase.from('material_checkpoints').insert({
    material_id: positiveInteger(c.materialId), at_seconds: Math.max(0, Math.round(c.atSeconds)), question: cleanText(c.question, 500),
    options, answer_index: c.answerIndex,
  }))
}

export const deleteCheckpoint = async (id: number) => must(await supabase.from('material_checkpoints').delete().eq('id', positiveInteger(id)))
export const answerCheckpoint = (id: number, index: number) =>
  rpc<{ correct: boolean | null; answer_index: number | null }>('answer_checkpoint', { p_checkpoint_id: positiveInteger(id), p_answer_index: index })

// ---------------------------------------------------------------------------
// Duplicar
// ---------------------------------------------------------------------------
export const duplicateAssignment = (assignmentId: number, targets: number[], asDraft = true) =>
  rpc<number>('duplicate_assignment', { p_assignment_id: positiveInteger(assignmentId), p_target_offering_ids: targets.map((t) => positiveInteger(t)), p_as_draft: asDraft })
export const duplicateOfferingContent = (from: number, to: number) =>
  rpc<{ units: number; materials: number; assignments: number }>('duplicate_offering_content', { p_from_offering: positiveInteger(from), p_to_offering: positiveInteger(to) })

export const setOfferingCover = (offeringId: number, cover: string | null) =>
  rpc<void>('set_offering_cover', { p_offering_id: positiveInteger(offeringId), p_cover: cover })
