import { BUCKET_MATERIALS, BUCKET_SUBMISSIONS, supabase } from '@/lib/supabase'
import { cleanSingleLine, cleanText, positiveInteger, safeFileName } from '@/lib/security'
import { UserError } from '@/lib/errors'
import { assertUploads, cleanLink, FILE_UPLOADS, isExternal, linkName } from '@/lib/links'
import type {
  Announcement, Assignment, AssignmentStatus, AssignmentWithCourse, AttendanceRow, Classroom, GradingType, Level,
  Material, NotificationRow, Offering, PensionRow, QuizSettings, StudentLite, StudentTaskState, Subject, Submission, SubmissionFile,
  WeeklyDigest,
} from '@/types'

const OFFERING_SELECT = 'id, classroom_id, subject_id, teacher_id, description, is_active, cover, subject:subjects(id, name, short_name, color, level), classroom:classrooms(id, grade, section, level, tutor_id)'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------
export async function getPeopleNames(ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  if (!unique.length) return {}
  const rows = must(await supabase.from('campus_people').select('id, full_name').in('id', unique)) as { id: string; full_name: string | null }[]
  return Object.fromEntries(rows.map((r) => [r.id, r.full_name ?? 'Docente']))
}

export async function listTeachers(): Promise<{ id: string; full_name: string }[]> {
  const rows = must(await supabase.from('campus_people').select('id, full_name').eq('role', 'TEACHER').order('full_name')) as { id: string; full_name: string | null }[]
  return rows.map((r) => ({ id: r.id, full_name: r.full_name ?? 'Sin nombre' }))
}

/** Alumnos que la cuenta puede ver como familia (el propio alumno o sus hijos). */
export async function listMyStudents(): Promise<StudentLite[]> {
  const rows = must(await supabase
    .from('students')
    .select('id, first_name, last_name, classroom_id, classroom:classrooms(id, grade, section, level)')
    .order('first_name')) as unknown as StudentLite[]
  return rows
}

export async function getSelfStudent(profileId: string): Promise<StudentLite | null> {
  const { data, error } = await supabase
    .from('students')
    .select('id, first_name, last_name, classroom_id, classroom:classrooms(id, grade, section, level)')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as StudentLite) ?? null
}

export async function listClassroomStudents(classroomId: number): Promise<{ id: number; first_name: string | null; last_name: string | null }[]> {
  return must(await supabase
    .from('students')
    .select('id, first_name, last_name')
    .eq('classroom_id', positiveInteger(classroomId))
    .order('last_name')
    .order('first_name')) as { id: number; first_name: string | null; last_name: string | null }[]
}

export async function listStudentNames(classroomIds: number[]): Promise<Record<number, string>> {
  const ids = [...new Set(classroomIds)].map((id) => positiveInteger(id))
  if (!ids.length) return {}
  const rows = must(await supabase.from('students').select('id, first_name, last_name').in('classroom_id', ids)) as { id: number; first_name: string | null; last_name: string | null }[]
  return Object.fromEntries(rows.map((r) => [r.id, studentName(r)]))
}

export function studentName(s: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!s) return 'Alumno'
  return [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Alumno'
}

export function classroomLabel(c: Classroom | null | undefined): string {
  if (!c) return ''
  // Si Tesla ya guarda el grado con ordinal ("1.º", "1°"), no se agrega otro.
  const g = (c.grade ?? '').trim()
  const grade = !g ? '' : /[º°]$/.test(g) ? g : `${g.replace(/\.$/, '')}.°`
  return [grade, c.section, c.level ? `de ${c.level}` : ''].filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Cursos
// ---------------------------------------------------------------------------
export async function listTeacherOfferings(teacherId: string): Promise<Offering[]> {
  return must(await supabase
    .from('course_offerings')
    .select(OFFERING_SELECT)
    .eq('teacher_id', teacherId)
    .eq('is_active', true)
    .order('classroom_id')) as unknown as Offering[]
}

export async function listClassroomOfferings(classroomId: number, includeInactive = false): Promise<Offering[]> {
  let query = supabase.from('course_offerings').select(OFFERING_SELECT).eq('classroom_id', positiveInteger(classroomId))
  if (!includeInactive) query = query.eq('is_active', true)
  const rows = must(await query) as unknown as Offering[]
  return rows.sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'es'))
}

export async function getOffering(id: number): Promise<Offering | null> {
  const { data, error } = await supabase.from('course_offerings').select(OFFERING_SELECT).eq('id', positiveInteger(id)).maybeSingle()
  if (error) throw error
  return (data as unknown as Offering) ?? null
}

// ---------------------------------------------------------------------------
// Anuncios
// ---------------------------------------------------------------------------
export async function listCourseAnnouncements(offeringId: number): Promise<Announcement[]> {
  return must(await supabase
    .from('announcements')
    .select('*')
    .eq('offering_id', positiveInteger(offeringId))
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(50)) as Announcement[]
}

/** Anuncios del colegio, del aula y de los cursos indicados. */
export async function listFeed(classroomId: number | null, offeringIds: number[], limit = 12): Promise<Announcement[]> {
  const filters = ['scope.eq.SCHOOL']
  if (classroomId) filters.push(`and(scope.eq.CLASSROOM,classroom_id.eq.${positiveInteger(classroomId)})`)
  if (offeringIds.length) filters.push(`offering_id.in.(${offeringIds.map((id) => positiveInteger(id)).join(',')})`)
  return must(await supabase
    .from('announcements')
    .select('*')
    .or(filters.join(','))
    .order('published_at', { ascending: false })
    .limit(limit)) as Announcement[]
}

export async function createAnnouncement(input: {
  scope: 'COURSE' | 'CLASSROOM' | 'SCHOOL'
  offeringId?: number
  classroomId?: number
  title: string
  body: string
  pinned?: boolean
  authorId: string
}): Promise<void> {
  const title = cleanSingleLine(input.title, 140)
  const body = cleanText(input.body, 5000)
  if (title.length < 2) throw new UserError('Escribe un título para el anuncio.')
  if (!body) throw new UserError('Escribe el mensaje del anuncio.')
  must(await supabase.from('announcements').insert({
    scope: input.scope,
    offering_id: input.scope === 'COURSE' ? positiveInteger(input.offeringId) : null,
    classroom_id: input.scope === 'CLASSROOM' ? positiveInteger(input.classroomId) : null,
    title,
    body,
    pinned: !!input.pinned,
    author_id: input.authorId,
  }))
}

export async function deleteAnnouncement(id: number): Promise<void> {
  must(await supabase.from('announcements').delete().eq('id', positiveInteger(id)))
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------
const MAX_MATERIAL_BYTES = 25 * 1024 * 1024
const MAX_SUBMISSION_BYTES = 15 * 1024 * 1024

function uniquePath(prefix: string, fileName: string): string {
  return `${prefix}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(fileName)}`
}

export async function openFile(bucket: string, path: string): Promise<void> {
  // Se abre la pestaña antes del await para que el navegador no la bloquee.
  const tab = window.open('', '_blank')
  if (tab) tab.opener = null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10)
  if (error || !data?.signedUrl) {
    tab?.close()
    throw error ?? new UserError('No se pudo abrir el archivo.')
  }
  if (tab) tab.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}

// ---------------------------------------------------------------------------
// Materiales
// ---------------------------------------------------------------------------
export async function listMaterials(offeringId: number): Promise<Material[]> {
  return must(await supabase
    .from('materials')
    .select('*')
    .eq('offering_id', positiveInteger(offeringId))
    .order('created_at', { ascending: false })) as Material[]
}

export async function createMaterial(input: {
  offeringId: number
  title: string
  description?: string
  unit?: string
  unitId?: number | null
  publishAt?: string | null
  kind: 'FILE' | 'LINK' | 'VIDEO'
  url?: string
  file?: File | null
}): Promise<void> {
  const offeringId = positiveInteger(input.offeringId)
  const title = cleanSingleLine(input.title, 140)
  if (title.length < 2) throw new UserError('Escribe un título para el material.')
  const row: Record<string, unknown> = {
    offering_id: offeringId,
    title,
    description: cleanText(input.description, 2000) || null,
    unit: cleanSingleLine(input.unit, 80) || null,
    kind: input.kind,
    unit_id: input.unitId ?? null,
  }
  // Programado: queda oculto hasta la fecha (lo publica publish_due_content).
  if (input.publishAt && Date.parse(input.publishAt) > Date.now()) Object.assign(row, { published: false, publish_at: input.publishAt })

  if (input.kind === 'FILE') {
    assertUploads()
    const file = input.file
    if (!file) throw new UserError('Elige un archivo.')
    if (file.size > MAX_MATERIAL_BYTES) throw new UserError('El archivo supera los 25 MB.')
    const path = uniquePath(String(offeringId), file.name)
    const upload = await supabase.storage.from(BUCKET_MATERIALS).upload(path, file, { contentType: file.type || undefined, upsert: false })
    if (upload.error) throw upload.error
    Object.assign(row, { storage_path: path, file_name: cleanSingleLine(file.name, 160), file_size: file.size, mime_type: file.type || null })
    const insert = await supabase.from('materials').insert(row)
    if (insert.error) {
      await supabase.storage.from(BUCKET_MATERIALS).remove([path])
      throw insert.error
    }
    return
  }

  row.url = cleanLink(input.url)
  must(await supabase.from('materials').insert(row))
}

/** Borra el archivo solo si ningún otro material o tarea (por ejemplo, una copia) lo usa. */
async function removeIfUnused(path: string | null) {
  if (!path || isExternal(path)) return
  const [m, a] = await Promise.all([
    supabase.from('materials').select('id', { count: 'exact', head: true }).eq('storage_path', path),
    supabase.from('assignments').select('id', { count: 'exact', head: true }).eq('attachment_path', path),
  ])
  if ((m.count ?? 0) + (a.count ?? 0) === 0) await supabase.storage.from(BUCKET_MATERIALS).remove([path])
}

export async function deleteMaterial(material: Material): Promise<void> {
  must(await supabase.from('materials').delete().eq('id', positiveInteger(material.id)))
  await removeIfUnused(material.storage_path)
}

/** Devuelve el id de YouTube si el enlace es de YouTube. */
export function youtubeId(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return match ? match[1] : null
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------
export async function listAssignments(offeringId: number): Promise<Assignment[]> {
  return must(await supabase
    .from('assignments')
    .select('*')
    .eq('offering_id', positiveInteger(offeringId))
    .order('due_at', { ascending: false, nullsFirst: true })) as Assignment[]
}

export async function listAssignmentsForOfferings(offerings: Offering[]): Promise<AssignmentWithCourse[]> {
  if (!offerings.length) return []
  const byId = new Map(offerings.map((o) => [o.id, o]))
  const rows = must(await supabase
    .from('assignments')
    .select('*')
    .in('offering_id', offerings.map((o) => o.id))
    .neq('status', 'DRAFT')
    .order('due_at', { ascending: true, nullsFirst: false })) as Assignment[]
  return rows.filter((a) => byId.has(a.offering_id)).map((a) => ({ ...a, offering: byId.get(a.offering_id)! }))
}

export async function getAssignment(id: number): Promise<AssignmentWithCourse | null> {
  const { data, error } = await supabase
    .from('assignments')
    .select(`*, offering:course_offerings(${OFFERING_SELECT})`)
    .eq('id', positiveInteger(id))
    .maybeSingle()
  if (error) throw error
  return (data as unknown as AssignmentWithCourse) ?? null
}

export type AssignmentInput = {
  offeringId: number
  title: string
  instructions: string
  dueAt: string | null
  gradingType: GradingType
  maxScore: number
  allowLate: boolean
  status: AssignmentStatus
  file?: File | null
  /** Modo enlaces: enlace del archivo de apoyo (se guarda en attachment_path). */
  link?: string | null
  kind?: 'TASK' | 'QUIZ'
  unitId?: number | null
  rubricId?: number | null
  /** Publicación programada: se guarda como borrador hasta esa fecha. */
  publishAt?: string | null
  quizSettings?: QuizSettings
}

export async function createAssignment(input: AssignmentInput): Promise<number> {
  const offeringId = positiveInteger(input.offeringId)
  const title = cleanSingleLine(input.title, 140)
  if (title.length < 2) throw new UserError('Escribe un título para la tarea.')
  const maxScore = Number(input.maxScore)
  if (input.gradingType === 'SCORE' && (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 100)) {
    throw new UserError('La nota máxima debe estar entre 1 y 100.')
  }

  let attachmentPath: string | null = null
  let attachmentName: string | null = null
  if (input.link?.trim()) {
    attachmentPath = cleanLink(input.link)
    attachmentName = linkName(attachmentPath)
  } else if (input.file) {
    assertUploads()
    if (input.file.size > MAX_MATERIAL_BYTES) throw new UserError('El archivo supera los 25 MB.')
    attachmentPath = uniquePath(String(offeringId), input.file.name)
    attachmentName = cleanSingleLine(input.file.name, 160)
    const upload = await supabase.storage.from(BUCKET_MATERIALS).upload(attachmentPath, input.file, { contentType: input.file.type || undefined })
    if (upload.error) throw upload.error
  }

  const { data, error } = await supabase.from('assignments').insert({
    offering_id: offeringId,
    title,
    instructions: cleanText(input.instructions, 8000) || null,
    due_at: input.dueAt,
    grading_type: input.gradingType,
    max_score: input.gradingType === 'SCORE' ? maxScore : 20,
    allow_late: input.allowLate,
    status: input.status,
    attachment_path: attachmentPath,
    attachment_name: attachmentName,
    kind: input.kind ?? 'TASK',
    unit_id: input.unitId ?? null,
    rubric_id: input.rubricId ?? null,
    publish_at: input.publishAt && input.status === 'DRAFT' ? input.publishAt : null,
    quiz_settings: input.quizSettings ?? {},
  }).select('id').single()
  if (error) {
    if (attachmentPath && !isExternal(attachmentPath)) await supabase.storage.from(BUCKET_MATERIALS).remove([attachmentPath])
    throw error
  }
  return (data as { id: number }).id
}

export async function setAssignmentStatus(id: number, status: AssignmentStatus): Promise<void> {
  must(await supabase.from('assignments').update({ status }).eq('id', positiveInteger(id)))
}

export async function deleteAssignment(assignment: Assignment): Promise<void> {
  must(await supabase.from('assignments').delete().eq('id', positiveInteger(assignment.id)))
  await removeIfUnused(assignment.attachment_path)
}

// ---------------------------------------------------------------------------
// Entregas
// ---------------------------------------------------------------------------
function normalizeSubmission(row: Submission): Submission {
  return { ...row, files: Array.isArray(row.files) ? row.files : [], score: row.score == null ? null : Number(row.score) }
}

export async function listSubmissionsForAssignment(assignmentId: number): Promise<Submission[]> {
  const rows = must(await supabase.from('submissions').select('*').eq('assignment_id', positiveInteger(assignmentId))) as Submission[]
  return rows.map(normalizeSubmission)
}

export async function listSubmissionsForAssignments(assignmentIds: number[]): Promise<Submission[]> {
  if (!assignmentIds.length) return []
  const rows = must(await supabase.from('submissions').select('*').in('assignment_id', assignmentIds)) as Submission[]
  return rows.map(normalizeSubmission)
}

export async function listStudentSubmissions(studentId: number, assignmentIds?: number[]): Promise<Submission[]> {
  let query = supabase.from('submissions').select('*').eq('student_id', positiveInteger(studentId))
  if (assignmentIds) {
    if (!assignmentIds.length) return []
    query = query.in('assignment_id', assignmentIds)
  }
  const rows = must(await query) as Submission[]
  return rows.map(normalizeSubmission)
}

export async function submitWork(input: {
  assignmentId: number
  studentId: number
  content: string
  keepFiles: SubmissionFile[]
  newFiles: File[]
  /** Modo enlaces: enlaces nuevos (Drive, Docs…) que se guardan como archivos de tipo 'link'. */
  newLinks?: string[]
  existing: Submission | null
}): Promise<void> {
  const assignmentId = positiveInteger(input.assignmentId)
  const studentId = positiveInteger(input.studentId)
  const content = cleanText(input.content, 8000)
  const links: SubmissionFile[] = [...new Set((input.newLinks ?? []).map(cleanLink))]
    .filter((url) => !input.keepFiles.some((k) => k.path === url))
    .map((url) => ({ path: url, name: linkName(url), size: 0, type: 'link' }))
  const total = input.keepFiles.length + input.newFiles.length + links.length
  if (!content && total === 0) throw new UserError(FILE_UPLOADS ? 'Escribe una respuesta o adjunta al menos un archivo.' : 'Escribe una respuesta o pega al menos un enlace.')
  if (total > 5) throw new UserError(FILE_UPLOADS ? 'Puedes adjuntar hasta 5 archivos.' : 'Puedes adjuntar hasta 5 enlaces.')
  if (input.newFiles.length) assertUploads()
  for (const file of input.newFiles) {
    if (file.size > MAX_SUBMISSION_BYTES) throw new UserError(`"${file.name}" supera los 15 MB.`)
  }

  const uploaded: SubmissionFile[] = []
  for (const file of input.newFiles) {
    const path = uniquePath(`${assignmentId}/${studentId}`, file.name)
    const upload = await supabase.storage.from(BUCKET_SUBMISSIONS).upload(path, file, { contentType: file.type || undefined })
    if (upload.error) {
      if (uploaded.length) await supabase.storage.from(BUCKET_SUBMISSIONS).remove(uploaded.map((f) => f.path))
      throw upload.error
    }
    uploaded.push({ path, name: cleanSingleLine(file.name, 160), size: file.size, type: file.type })
  }

  const files = [...input.keepFiles, ...uploaded, ...links]
  const result = input.existing
    ? await supabase.from('submissions').update({ content: content || null, files }).eq('id', input.existing.id)
    : await supabase.from('submissions').insert({ assignment_id: assignmentId, student_id: studentId, content: content || null, files })

  if (result.error) {
    if (uploaded.length) await supabase.storage.from(BUCKET_SUBMISSIONS).remove(uploaded.map((f) => f.path))
    throw result.error
  }

  // Archivos que el alumno quitó de su entrega.
  const removed = (input.existing?.files ?? []).filter((f) => !isExternal(f.path) && !input.keepFiles.some((k) => k.path === f.path))
  if (removed.length) await supabase.storage.from(BUCKET_SUBMISSIONS).remove(removed.map((f) => f.path))
}

export async function gradeSubmission(input: {
  submissionId: number
  gradingType: GradingType
  maxScore: number
  score: string
  level: Level | ''
  feedback: string
  action: 'GRADED' | 'RETURNED'
  rubricScores?: Record<string, Level> | null
}): Promise<void> {
  const patch: Record<string, unknown> = {
    feedback: cleanText(input.feedback, 4000) || null,
    status: input.action,
  }
  if (input.rubricScores !== undefined) patch.rubric_scores = input.rubricScores
  if (input.action === 'GRADED') {
    if (input.gradingType === 'SCORE') {
      const score = Number(String(input.score).replace(',', '.'))
      if (input.score === '' || !Number.isFinite(score) || score < 0 || score > input.maxScore) {
        throw new UserError(`Escribe una nota entre 0 y ${input.maxScore}.`)
      }
      patch.score = Math.round(score * 100) / 100
    } else {
      if (!input.level) throw new UserError('Elige un nivel de logro.')
      patch.level = input.level
    }
  }
  must(await supabase.from('submissions').update(patch).eq('id', positiveInteger(input.submissionId)))
}

export function taskState(assignment: Assignment, submission: Submission | undefined): StudentTaskState {
  if (submission) {
    if (submission.status === 'GRADED') return 'GRADED'
    if (submission.status === 'RETURNED') return 'RETURNED'
    return submission.is_late ? 'LATE_SUBMITTED' : 'SUBMITTED'
  }
  if (assignment.status === 'CLOSED') return 'CLOSED_MISSING'
  if (assignment.due_at && new Date(assignment.due_at).getTime() < Date.now()) return 'OVERDUE'
  return 'PENDING'
}

// ---------------------------------------------------------------------------
// Datos de Tesla para la familia
// ---------------------------------------------------------------------------
export async function listAttendance(studentId: number, from: string, to: string): Promise<AttendanceRow[]> {
  return must(await supabase
    .from('attendance')
    .select('id, date, entry_time, exit_time, status')
    .eq('student_id', positiveInteger(studentId))
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: false })) as AttendanceRow[]
}

export async function listNotifications(studentId: number, limit = 6): Promise<NotificationRow[]> {
  return must(await supabase
    .from('notifications')
    .select('id, date, notification_type, observation, notification_number')
    .eq('student_id', positiveInteger(studentId))
    .eq('voided', false)
    .order('date', { ascending: false })
    .limit(limit)) as NotificationRow[]
}

export async function listMyPensions(year: number): Promise<PensionRow[]> {
  const { data, error } = await supabase
    .from('pension_payments')
    .select('id, period_year, period_month, amount, due_date, paid')
    .eq('period_year', year)
    .order('period_month')
  if (error) return [] // La tabla puede no existir en algunas instalaciones.
  return (data as PensionRow[]).map((p) => ({ ...p, amount: Number(p.amount) }))
}

export async function getLatestDigest(studentId: number): Promise<WeeklyDigest | null> {
  const { data, error } = await supabase
    .from('weekly_digests')
    .select('*')
    .eq('student_id', positiveInteger(studentId))
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as WeeklyDigest) ?? null
}

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------
export async function listClassrooms(): Promise<Classroom[]> {
  const rows = must(await supabase.from('classrooms').select('id, grade, section, level, tutor_id')) as Classroom[]
  const levelOrder = (l: string | null) => (l === 'Inicial' ? 0 : l === 'Primaria' ? 1 : 2)
  return rows.sort((a, b) =>
    levelOrder(a.level) - levelOrder(b.level)
    || String(a.grade).localeCompare(String(b.grade), 'es', { numeric: true })
    || String(a.section).localeCompare(String(b.section), 'es'))
}

export async function listSubjects(): Promise<Subject[]> {
  return must(await supabase.from('subjects').select('*').order('name')) as Subject[]
}

export async function getCurrentYearId(): Promise<number> {
  const row = must(await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle()) as { id: number } | null
  if (!row) throw new UserError('No hay un año escolar marcado como actual.')
  return row.id
}

export async function createOffering(classroomId: number, subjectId: number, teacherId: string | null): Promise<void> {
  const yearId = await getCurrentYearId()
  must(await supabase.from('course_offerings').insert({
    academic_year_id: yearId,
    classroom_id: positiveInteger(classroomId),
    subject_id: positiveInteger(subjectId),
    teacher_id: teacherId || null,
  }))
}

export async function updateOffering(id: number, patch: { teacher_id?: string | null; is_active?: boolean }): Promise<void> {
  must(await supabase.from('course_offerings').update(patch).eq('id', positiveInteger(id)))
}

export async function setClassroomTutor(classroomId: number, tutorId: string | null): Promise<void> {
  must(await supabase.from('classrooms').update({ tutor_id: tutorId || null }).eq('id', positiveInteger(classroomId)))
}

export async function generateDigestsNow(): Promise<number> {
  const { data, error } = await supabase.rpc('generate_weekly_digests')
  if (error) throw error
  return Number(data ?? 0)
}

export type AccountRow = {
  kind: 'STUDENT' | 'GUARDIAN' | 'TEACHER'
  name: string
  username: string
  password?: string
  detail?: string
}

export type AccountsResult = { created: AccountRow[]; skipped: { name: string; reason: string }[] }

export async function callAccounts(body: Record<string, unknown>): Promise<AccountsResult> {
  const { data, error } = await supabase.functions.invoke('campus-accounts', { body })
  if (error) {
    // Intenta leer el mensaje que devolvió la función.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const payload = await ctx.json().catch(() => null) as { error?: string } | null
      if (payload?.error) throw new UserError(payload.error)
    }
    throw error
  }
  return data as AccountsResult
}

export async function listClassroomAccounts(classroomId: number): Promise<{
  students: { id: number; name: string; dni: string | null; profile_id: string | null }[]
  guardians: { id: number; name: string; dni: string | null; profile_id: string | null; student: string }[]
}> {
  const students = must(await supabase
    .from('students')
    .select('id, first_name, last_name, dni, profile_id')
    .eq('classroom_id', positiveInteger(classroomId))
    .order('last_name')) as { id: number; first_name: string | null; last_name: string | null; dni: string | null; profile_id: string | null }[]

  const links = students.length
    ? must(await supabase
        .from('student_guardians')
        .select('student_id, guardian:guardians(id, full_name, dni, profile_id)')
        .in('student_id', students.map((s) => s.id))) as unknown as { student_id: number; guardian: { id: number; full_name: string | null; dni: string | null; profile_id: string | null } | null }[]
    : []

  const byStudent = new Map(students.map((s) => [s.id, studentName(s)]))
  const seen = new Set<number>()
  const guardians = links
    .filter((l) => l.guardian && !seen.has(l.guardian.id) && seen.add(l.guardian.id))
    .map((l) => ({
      id: l.guardian!.id,
      name: l.guardian!.full_name ?? 'Apoderado',
      dni: l.guardian!.dni,
      profile_id: l.guardian!.profile_id,
      student: byStudent.get(l.student_id) ?? '',
    }))

  return {
    students: students.map((s) => ({ id: s.id, name: studentName(s), dni: s.dni, profile_id: s.profile_id })),
    guardians,
  }
}

// ---------------------------------------------------------------------------
// Asignación masiva de cursos (administración)
// ---------------------------------------------------------------------------
/** Todos los cursos del año actual (activos e inactivos). */
export async function listYearOfferings(): Promise<Offering[]> {
  const yearId = await getCurrentYearId()
  return must(await supabase.from('course_offerings').select(OFFERING_SELECT).eq('academic_year_id', yearId)) as unknown as Offering[]
}

/**
 * Crea o actualiza cursos (aula + área) del año actual.
 * overwrite = true: asigna el docente indicado y reactiva el curso si existía.
 * overwrite = false: solo crea los que faltan (no toca los existentes).
 */
export async function upsertOfferings(rows: { classroom_id: number; subject_id: number; teacher_id: string | null }[], overwrite: boolean): Promise<number> {
  if (!rows.length) return 0
  const yearId = await getCurrentYearId()
  const payload = rows.map((r) => ({
    academic_year_id: yearId,
    classroom_id: positiveInteger(r.classroom_id),
    subject_id: positiveInteger(r.subject_id),
    teacher_id: r.teacher_id,
    ...(overwrite ? { is_active: true } : {}),
  }))
  const { data, error } = await supabase
    .from('course_offerings')
    .upsert(payload, { onConflict: 'academic_year_id,classroom_id,subject_id', ignoreDuplicates: !overwrite })
    .select('id')
  if (error) throw error
  return (data ?? []).length
}

/** ¿El área corresponde al nivel del aula? (sin distinguir mayúsculas). */
export function subjectFitsClassroom(subject: Subject, classroom: Classroom | null | undefined): boolean {
  if (!subject.level || !classroom?.level) return true
  return subject.level.trim().toLowerCase() === classroom.level.trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Carnet escolar digital
// ---------------------------------------------------------------------------
export type StudentCard = { id: number; first_name: string | null; last_name: string | null; dni: string | null }

/** Datos del carnet. El alumno y su familia ya pueden leer su propia fila (igual que en la libreta). */
export async function getStudentCard(studentId: number): Promise<StudentCard | null> {
  const { data, error } = await supabase.from('students').select('id, first_name, last_name, dni').eq('id', positiveInteger(studentId)).maybeSingle()
  if (error) throw error
  return (data as StudentCard | null) ?? null
}

/** Lo que codifica el QR: el DNI o el código del colegio (el mismo con el que se ingresa). */
export function carnetCode(card: StudentCard): string {
  return (card.dni ?? '').trim().toUpperCase() || `NT-${card.id}`
}

/** Nombre del tutor(a) del aula, para el reverso del carnet (igual que en la libreta). */
export async function getClassroomTutorName(classroomId: number): Promise<string | null> {
  const { data, error } = await supabase.from('classrooms').select('tutor_id').eq('id', positiveInteger(classroomId)).maybeSingle()
  if (error) throw error
  const tutorId = (data as { tutor_id: string | null } | null)?.tutor_id ?? null
  if (!tutorId) return null
  return (await getPeopleNames([tutorId]))[tutorId] ?? null
}
