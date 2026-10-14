import { supabase } from '@/lib/supabase'
import { cleanSingleLine, cleanText, positiveInteger, safeFileName } from '@/lib/security'
import { UserError } from '@/lib/errors'
import { assertUploads, cleanLink, linkName } from '@/lib/links'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

// ---------------------------------------------------------------------------
// Permisos del personal
// ---------------------------------------------------------------------------
export type CampusPermission = 'COORDINADOR' | 'PSICOLOGIA' | 'SECRETARIA'
export const PERMISSION_LABEL: Record<CampusPermission, { name: string; hint: string }> = {
  COORDINADOR: { name: 'Coordinación', hint: 'Ve las alertas tempranas, el panel de alertas y las observaciones de todo el colegio.' },
  PSICOLOGIA: { name: 'Psicología', hint: 'Lo mismo que coordinación, y además escribe y lee observaciones psicológicas (privadas).' },
  SECRETARIA: { name: 'Secretaría', hint: 'Revisa las justificaciones de inasistencia de todas las aulas.' },
}
export type StaffPermission = { profile_id: string; permission: CampusPermission; level: string | null }

export const listPermissions = async () => must(await supabase.from('staff_permissions').select('profile_id, permission, level')) as StaffPermission[]
export const myPermissions = async (profileId: string) =>
  (must(await supabase.from('staff_permissions').select('permission').eq('profile_id', profileId)) as { permission: CampusPermission }[]).map((r) => r.permission)
export async function setPermission(profileId: string, permission: CampusPermission, on: boolean) {
  if (on) must(await supabase.from('staff_permissions').upsert({ profile_id: profileId, permission }))
  else must(await supabase.from('staff_permissions').delete().eq('profile_id', profileId).eq('permission', permission))
}

// ---------------------------------------------------------------------------
// Observaciones
// ---------------------------------------------------------------------------
export type ObservationKind = 'ACADEMICO' | 'CONDUCTA' | 'SALUD' | 'FAMILIA' | 'PSICOLOGICA' | 'LOGRO' | 'OTRO'
export const OBSERVATION_LABEL: Record<ObservationKind, string> = {
  ACADEMICO: 'Académica', CONDUCTA: 'Conducta', SALUD: 'Salud', FAMILIA: 'Familia', PSICOLOGICA: 'Psicológica (privada)', LOGRO: 'Logro', OTRO: 'Otra',
}
export type Observation = { id: number; student_id: number; author_id: string; kind: ObservationKind; body: string; created_at: string }

export const listObservations = async (studentId: number) =>
  must(await supabase.from('student_observations').select('*').eq('student_id', positiveInteger(studentId)).order('created_at', { ascending: false })) as Observation[]
export async function addObservation(studentId: number, kind: ObservationKind, body: string) {
  const text = cleanText(body, 3000)
  if (text.length < 3) throw new UserError('Escribe la observación.')
  must(await supabase.from('student_observations').insert({ student_id: positiveInteger(studentId), kind, body: text }))
}
export const deleteObservation = async (id: number) => must(await supabase.from('student_observations').delete().eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------
export type EarlyAlert = {
  student_id: number; first_name: string | null; last_name: string | null; classroom_id: number; classroom: string
  overdue: number; late_days: number; absent_days: number; low_grades: number; risk: number
}
export async function earlyAlerts(classroomId: number | null, days = 30, minRisk = 4): Promise<EarlyAlert[]> {
  const rows = await rpc<EarlyAlert[]>('early_alerts', { p_classroom_id: classroomId, p_days: days, p_min_risk: minRisk })
  return rows.map((r) => ({ ...r, student_id: Number(r.student_id), classroom_id: Number(r.classroom_id) }))
}

export type SchoolAlerts = {
  classrooms: { classroom_id: number; classroom: string; students: number; assignments: number; missing: number }[]
  teachers: { teacher_id: string; teacher: string; pending: number; oldest: string }[]
  at_risk: EarlyAlert[]
  at_risk_total: number
}
export const schoolAlerts = (days = 14) => rpc<SchoolAlerts>('school_alerts', { p_days: days })

// ---------------------------------------------------------------------------
// Citas
// ---------------------------------------------------------------------------
export type AppointmentMode = 'PRESENCIAL' | 'VIRTUAL' | 'TELEFONO'
export const MODE_LABEL: Record<AppointmentMode, string> = { PRESENCIAL: 'Presencial', VIRTUAL: 'Videollamada', TELEFONO: 'Llamada' }
export type Slot = { id: number; teacher_id: string; teacher?: string; starts_at: string; ends_at: string; mode: AppointmentMode; location: string | null }
export type Appointment = Slot & { status: 'OPEN' | 'BOOKED' | 'CANCELLED' | 'DONE'; note: string | null; student_id: number | null; student: string; family: string | null; mine: boolean }

export const myAppointments = () => rpc<Appointment[]>('my_appointments')
export const appointmentOptions = (studentId: number) => rpc<Slot[] | null>('appointment_options', { p_student_id: positiveInteger(studentId) }).then((r) => r ?? [])
export const listMySlots = async (teacherId: string) =>
  must(await supabase.from('appointment_slots').select('*').eq('teacher_id', teacherId).gte('starts_at', new Date(Date.now() - 86_400_000).toISOString()).order('starts_at')) as (Slot & { status: string; booked_by: string | null })[]

/** Crea varios horarios seguidos: desde/hasta en bloques de N minutos. */
export async function createSlots(input: { date: string; from: string; to: string; minutes: number; mode: AppointmentMode; location: string }) {
  const start = new Date(`${input.date}T${input.from}:00-05:00`)
  const end = new Date(`${input.date}T${input.to}:00-05:00`)
  if (!(end > start)) throw new UserError('La hora de fin debe ser posterior al inicio.')
  if (start.getTime() < Date.now()) throw new UserError('Elige un horario futuro.')
  const rows: Record<string, unknown>[] = []
  for (let t = start.getTime(); t + input.minutes * 60_000 <= end.getTime(); t += input.minutes * 60_000) {
    rows.push({ starts_at: new Date(t).toISOString(), ends_at: new Date(t + input.minutes * 60_000).toISOString(), mode: input.mode, location: cleanSingleLine(input.location, 200) || null })
  }
  if (!rows.length) throw new UserError('El rango es muy corto para un bloque.')
  if (rows.length > 40) throw new UserError('Máximo 40 horarios a la vez.')
  must(await supabase.from('appointment_slots').insert(rows))
  return rows.length
}

export const deleteSlot = async (id: number) => must(await supabase.from('appointment_slots').delete().eq('id', positiveInteger(id)))
export const bookAppointment = (slotId: number, studentId: number, note: string) =>
  rpc<void>('book_appointment', { p_slot_id: positiveInteger(slotId), p_student_id: positiveInteger(studentId), p_note: cleanText(note, 500) || null })
export const cancelAppointment = (slotId: number, reason = '') => rpc<void>('cancel_appointment', { p_slot_id: positiveInteger(slotId), p_reason: cleanText(reason, 300) || null })
export const markAppointmentDone = async (id: number) => must(await supabase.from('appointment_slots').update({ status: 'DONE' }).eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Justificaciones
// ---------------------------------------------------------------------------
export const BUCKET_JUSTIFICATIONS = 'campus-justifications'
export type Justification = {
  id: number; student_id: number; kind: 'FALTA' | 'TARDANZA'; date_from: string; date_to: string; reason: string
  attachment_path: string | null; attachment_name: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string; reviewed_at: string | null; review_note: string | null
  student?: { id: number; first_name: string | null; last_name: string | null; classroom_id: number | null }
}

export async function listJustifications(filter: { studentId?: number; pendingOnly?: boolean } = {}): Promise<Justification[]> {
  let q = supabase.from('absence_justifications').select('*, student:students(id, first_name, last_name, classroom_id)').order('created_at', { ascending: false }).limit(150)
  if (filter.studentId) q = q.eq('student_id', positiveInteger(filter.studentId))
  if (filter.pendingOnly) q = q.eq('status', 'PENDING')
  return must(await q) as unknown as Justification[]
}

export async function createJustification(input: { studentId: number; kind: 'FALTA' | 'TARDANZA'; from: string; to: string; reason: string; file?: File | null; link?: string | null }) {
  const reason = cleanText(input.reason, 1000)
  if (reason.length < 5) throw new UserError('Explica el motivo (al menos 5 letras).')
  if (input.to < input.from) throw new UserError('La fecha final es anterior a la inicial.')
  let path: string | null = null
  let name: string | null = null
  if (input.link?.trim()) {
    path = cleanLink(input.link)
    name = linkName(path)
  } else if (input.file) {
    assertUploads()
    name = cleanSingleLine(input.file.name, 160)
    if (input.file.size > 5 * 1024 * 1024) throw new UserError('El archivo supera los 5 MB.')
    path = `${positiveInteger(input.studentId)}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(input.file.name)}`
    const up = await supabase.storage.from(BUCKET_JUSTIFICATIONS).upload(path, input.file, { contentType: input.file.type || undefined })
    if (up.error) throw up.error
  }
  must(await supabase.from('absence_justifications').insert({
    student_id: positiveInteger(input.studentId), kind: input.kind, date_from: input.from, date_to: input.to, reason,
    attachment_path: path, attachment_name: name,
  }))
}

export const reviewJustification = (id: number, approve: boolean, note: string) =>
  rpc<void>('review_justification', { p_id: positiveInteger(id), p_approve: approve, p_note: cleanText(note, 500) || null })
export const deleteJustification = async (id: number) => must(await supabase.from('absence_justifications').delete().eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------
export type AuditRow = { id: number; at: string; actor: string | null; actor_name: string | null; action: string; entity: string; entity_id: string | null; summary: string }
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  GRADE: 'Nota', DELETE: 'Eliminación', RESET_PASSWORD: 'Contraseña', ACCOUNT_ACTIVE: 'Cuenta', GRANT: 'Permiso', REVOKE: 'Permiso', START_YEAR: 'Año escolar',
  SETTING: 'Configuración',
}

// Espacio usado en Supabase (para elegir modo enlaces o archivos)
export type StorageUsage = { database_bytes: number; buckets: { bucket: string; files: number; bytes: number }[] }
export const STORAGE_LIMIT_BYTES = 1024 ** 3 // plan gratuito: 1 GB de Storage
export const DATABASE_LIMIT_BYTES = 500 * 1024 ** 2 // plan gratuito: 500 MB de base de datos
export async function storageUsage(): Promise<StorageUsage> {
  const { data, error } = await supabase.rpc('campus_storage_usage')
  if (error) throw error
  return data as StorageUsage
}
export async function listAudit(filter: { action?: string; search?: string; limit?: number } = {}): Promise<AuditRow[]> {
  let q = supabase.from('audit_log').select('id, at, actor, actor_name, action, entity, entity_id, summary').order('at', { ascending: false }).limit(filter.limit ?? 200)
  if (filter.action) q = q.eq('action', filter.action)
  if (filter.search?.trim()) q = q.ilike('summary', `%${filter.search.trim().replace(/[%_]/g, '')}%`)
  return must(await q) as AuditRow[]
}

// ---------------------------------------------------------------------------
// Encuestas
// ---------------------------------------------------------------------------
export type SurveyAudience = 'FAMILIES' | 'STUDENTS' | 'TEACHERS' | 'ALL'
export const AUDIENCE_LABEL: Record<SurveyAudience, string> = { FAMILIES: 'Familias', STUDENTS: 'Alumnos', TEACHERS: 'Docentes', ALL: 'Todos' }
export type SurveyQuestionType = 'SINGLE' | 'MULTI' | 'SCALE' | 'TEXT'
export const SURVEY_TYPE_LABEL: Record<SurveyQuestionType, string> = { SINGLE: 'Una opción', MULTI: 'Varias opciones', SCALE: 'Escala del 1 al 5', TEXT: 'Respuesta libre' }
export type SurveyQuestion = { id?: number; type: SurveyQuestionType; prompt: string; options: string[]; required: boolean }
export type Survey = { id: number; title: string; description: string | null; audience: SurveyAudience; classroom_id: number | null; anonymous: boolean; status: 'DRAFT' | 'OPEN' | 'CLOSED'; closes_at: string | null; created_at: string }
export type OpenSurvey = { id: number; title: string; description: string | null; anonymous: boolean; closes_at: string | null; answered: boolean; questions: (SurveyQuestion & { id: number })[] }
export type SurveyResults = {
  responses: number
  questions: { id: number; type: SurveyQuestionType; prompt: string; options: string[]; counts: Record<string, number> | null; texts: { text: string; who: string | null }[] | null }[]
}

export const listSurveys = async () => must(await supabase.from('surveys').select('*').order('created_at', { ascending: false })) as Survey[]
export const listSurveyQuestions = async (surveyId: number) =>
  must(await supabase.from('survey_questions').select('id, type, prompt, options, required').eq('survey_id', positiveInteger(surveyId)).order('position')) as (SurveyQuestion & { id: number })[]

export async function saveSurvey(input: { id?: number; title: string; description: string; audience: SurveyAudience; classroomId: number | null; anonymous: boolean; closesAt: string | null; questions: SurveyQuestion[] }): Promise<number> {
  const title = cleanSingleLine(input.title, 160)
  if (title.length < 3) throw new UserError('Escribe el título de la encuesta.')
  const questions = input.questions.map((q) => ({ ...q, prompt: cleanText(q.prompt, 500), options: q.options.map((o) => cleanSingleLine(o, 120)).filter(Boolean) })).filter((q) => q.prompt)
  if (!questions.length) throw new UserError('Agrega al menos una pregunta.')
  for (const q of questions) {
    if ((q.type === 'SINGLE' || q.type === 'MULTI') && q.options.length < 2) throw new UserError(`La pregunta «${q.prompt.slice(0, 40)}» necesita al menos dos opciones.`)
  }
  const row = { title, description: cleanText(input.description, 1000) || null, audience: input.audience, classroom_id: input.classroomId, anonymous: input.anonymous, closes_at: input.closesAt }
  let id = input.id
  if (id) must(await supabase.from('surveys').update(row).eq('id', positiveInteger(id)))
  else id = (must(await supabase.from('surveys').insert(row).select('id').single()) as { id: number }).id
  must(await supabase.from('survey_questions').delete().eq('survey_id', id))
  must(await supabase.from('survey_questions').insert(questions.map((q, i) => ({
    survey_id: id, position: i + 1, type: q.type, prompt: q.prompt, options: q.type === 'SCALE' ? ['1', '2', '3', '4', '5'] : q.options, required: q.required,
  }))))
  return id!
}

export const setSurveyStatus = async (id: number, status: 'DRAFT' | 'OPEN' | 'CLOSED') => must(await supabase.from('surveys').update({ status }).eq('id', positiveInteger(id)))
export const deleteSurvey = async (id: number) => must(await supabase.from('surveys').delete().eq('id', positiveInteger(id)))
export const mySurveys = () => rpc<OpenSurvey[]>('my_surveys')
export const submitSurvey = (id: number, answers: Record<string, unknown>) => rpc<void>('submit_survey', { p_survey_id: positiveInteger(id), p_answers: answers })
export const surveyResults = (id: number) => rpc<SurveyResults>('survey_results', { p_survey_id: positiveInteger(id) })

// ---------------------------------------------------------------------------
// Uso, errores, año escolar y respaldo
// ---------------------------------------------------------------------------
export type UsageSummary = {
  daily: { day: string; users: number; views: number }[]
  by_role: Record<string, number>
  by_device: Record<string, number>
  installed: number
  paths: { path: string; views: number; users: number }[]
  active_users: number
  total_accounts: number
}
export const usageSummary = (days = 30) => rpc<UsageSummary>('usage_summary', { p_days: days })

export type ClientError = { id: number; profile_id: string | null; message: string; stack: string | null; path: string | null; user_agent: string | null; app_version: string | null; created_at: string }
export const listClientErrors = async () => must(await supabase.from('client_errors').select('*').order('created_at', { ascending: false }).limit(200)) as ClientError[]
export const clearClientErrors = async () => must(await supabase.from('client_errors').delete().lt('created_at', new Date().toISOString()))

export const startYear = (year: number, starts: string, ends: string, copy: boolean) =>
  rpc<{ year_id: number; offerings: number }>('campus_start_year', { p_year: year, p_starts: starts, p_ends: ends, p_copy_offerings: copy })
export const listYears = async () => must(await supabase.from('academic_years').select('id, year, name, starts_on, ends_on, is_current').order('year', { ascending: false })) as
  { id: number; year: number; name: string; starts_on: string | null; ends_on: string | null; is_current: boolean }[]
export const exportYear = (yearId: number) => rpc<Record<string, unknown>>('admin_export_year', { p_year_id: positiveInteger(yearId) })
