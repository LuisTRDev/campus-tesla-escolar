export type Role = 'ADMIN' | 'MANAGEMENT' | 'AUXILIARY' | 'TEACHER' | 'STUDENT' | 'GUARDIAN'

export type Profile = {
  id: string
  full_name: string | null
  role: Role
}

export type Classroom = {
  id: number
  grade: string | null
  section: string | null
  level: string | null
  tutor_id?: string | null
}

export type StudentLite = {
  id: number
  first_name: string | null
  last_name: string | null
  classroom_id: number | null
  classroom: Classroom | null
}

export type Subject = {
  id: number
  name: string
  short_name: string | null
  color: string
  level: string | null
}

export type Offering = {
  id: number
  classroom_id: number
  subject_id: number
  teacher_id: string | null
  description: string | null
  is_active: boolean
  subject: Subject
  classroom: Classroom
  cover?: string | null
}

export type AnnouncementScope = 'COURSE' | 'CLASSROOM' | 'SCHOOL'

export type Announcement = {
  id: number
  scope: AnnouncementScope
  offering_id: number | null
  classroom_id: number | null
  author_id: string
  title: string
  body: string
  pinned: boolean
  published_at: string
  require_ack?: boolean
}

export type MaterialKind = 'FILE' | 'LINK' | 'VIDEO'

export type Material = {
  id: number
  offering_id: number
  title: string
  description: string | null
  unit: string | null
  kind: MaterialKind
  url: string | null
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  published: boolean
  created_at: string
  unit_id?: number | null
  publish_at?: string | null
}

export type AssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'
export type GradingType = 'SCORE' | 'LEVEL'

export type Assignment = {
  id: number
  offering_id: number
  title: string
  instructions: string | null
  due_at: string | null
  grading_type: GradingType
  max_score: number
  allow_late: boolean
  status: AssignmentStatus
  attachment_path: string | null
  attachment_name: string | null
  published_at: string | null
  created_at: string
  kind?: 'TASK' | 'QUIZ'
  unit_id?: number | null
  rubric_id?: number | null
  is_group?: boolean
  publish_at?: string | null
  quiz_settings?: QuizSettings
}

export type QuizSettings = {
  time_limit_min?: number | null
  max_attempts?: number | null
  shuffle_questions?: boolean
  shuffle_options?: boolean
  show_answers?: 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_DUE'
}

export type AssignmentWithCourse = Assignment & { offering: Offering }

/** `path` es la ruta en Storage o, en modo enlaces, el enlace (https://…) con `type: 'link'`. */
export type SubmissionFile = { path: string; name: string; size: number; type: string }
export type SubmissionStatus = 'SUBMITTED' | 'RETURNED' | 'GRADED'
export type Level = 'AD' | 'A' | 'B' | 'C'

export type Submission = {
  id: number
  assignment_id: number
  student_id: number
  content: string | null
  files: SubmissionFile[]
  status: SubmissionStatus
  submitted_at: string
  is_late: boolean
  score: number | null
  level: Level | null
  feedback: string | null
  graded_at: string | null
  rubric_scores?: Record<string, Level> | null
  feedback_audio_path?: string | null
  feedback_annotations?: { file_index: number; path: string }[]
}

export type AttendanceRow = {
  id: number
  date: string
  entry_time: string | null
  exit_time: string | null
  status: 'ON_TIME' | 'LATE' | null
}

export type NotificationRow = {
  id: number
  date: string
  notification_type: 'PRESENTATION' | 'LATE_ENTRY' | 'INAPPROPRIATE_CONDUCT' | null
  observation: string | null
  notification_number: number
}

export type PensionRow = {
  id: number
  period_year: number
  period_month: number
  amount: number
  due_date: string
  paid: boolean
}

export type DigestItem = { course: string; title: string; due_at?: string; score?: number | null; max_score?: number; level?: string | null; grading_type?: GradingType }

export type WeeklyDigest = {
  id: number
  student_id: number
  week_start: string
  text_body: string
  generated_at: string
  summary: {
    week_start: string
    week_end: string
    school_days: number
    attendance: { on_time: number; late: number; no_record: number }
    assignments: { due: number; delivered: number; missing: DigestItem[] }
    graded: DigestItem[]
    notifications: { date: string; type: string; observation: string | null }[]
    upcoming: DigestItem[]
  }
}

/** Estado de una tarea desde el punto de vista de un alumno. */
export type StudentTaskState = 'PENDING' | 'OVERDUE' | 'SUBMITTED' | 'LATE_SUBMITTED' | 'RETURNED' | 'GRADED' | 'CLOSED_MISSING'

export const LEVEL_LABELS: Record<Level, string> = {
  AD: 'AD · Logro destacado',
  A: 'A · Logro esperado',
  B: 'B · En proceso',
  C: 'C · En inicio',
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administración',
  MANAGEMENT: 'Dirección',
  AUXILIARY: 'Auxiliar',
  TEACHER: 'Docente',
  STUDENT: 'Alumno',
  GUARDIAN: 'Familia',
}

// ---------------------------------------------------------------------------
// Fase 2 · Notas por competencias
// ---------------------------------------------------------------------------
export type GradingPeriod = {
  id: number
  academic_year_id: number
  number: number
  name: string
  starts_on: string
  ends_on: string
  is_closed: boolean
  is_published: boolean
}

export type Competency = {
  id: number
  subject_id: number
  code: string
  name: string
  sort_order: number
  is_active: boolean
}

export type CompetencyGrade = {
  id: number
  period_id: number
  offering_id: number
  student_id: number
  competency_id: number
  level: Level | null
  conclusion: string | null
  updated_at: string
}

export type ReportCardComment = { id: number; period_id: number; student_id: number; comment: string }

export type PeriodAttendance = { student_id: number; on_time: number; late: number; school_days: number }

// ---------------------------------------------------------------------------
// Fase 2 · Comunicados
// ---------------------------------------------------------------------------
export type CircularScope = 'SCHOOL' | 'LEVEL' | 'CLASSROOM'
export type ConsentResponse = 'AUTHORIZED' | 'NOT_AUTHORIZED'

export type Circular = {
  id: number
  author_id: string
  scope: CircularScope
  level: string | null
  classroom_id: number | null
  title: string
  body: string
  response_type: 'NONE' | 'CONSENT'
  requires_signature: boolean
  response_deadline: string | null
  attachment_path: string | null
  attachment_name: string | null
  published_at: string
}

export type CircularRecipient = {
  id: number
  circular_id: number
  student_id: number
  classroom_id: number | null
  read_at: string | null
  response: ConsentResponse | null
  response_comment: string | null
  responded_at: string | null
  signer_name: string | null
  signature: string | null
}

// ---------------------------------------------------------------------------
// Fase 2 · Mensajería
// ---------------------------------------------------------------------------
export type OfficeHours = { profile_id: string; weekdays: number[]; starts_at: string; ends_at: string; away_message: string | null }

export type Conversation = {
  id: number
  student_id: number
  staff_id: string
  last_message_at: string | null
  last_message_preview: string | null
  last_sender_id: string | null
  created_at: string
}

export type Message = {
  id: number
  conversation_id: number
  sender_id: string
  sender_name: string | null
  sender_role: Role | null
  body: string
  notify: boolean
  created_at: string
  attachment_path?: string | null
  attachment_kind?: 'IMAGE' | 'AUDIO' | 'FILE' | null
  attachment_name?: string | null
}

// ---------------------------------------------------------------------------
// Fase 2 · Calendario y horario
// ---------------------------------------------------------------------------
export type ScheduleBlock = {
  id: number
  classroom_id: number
  weekday: number
  starts_at: string
  ends_at: string
  offering_id: number | null
  label: string | null
}

export type EventKind = 'EXAM' | 'HOLIDAY' | 'ACTIVITY' | 'MEETING' | 'OTHER'

export type SchoolEvent = {
  id: number
  title: string
  description: string | null
  kind: EventKind
  starts_on: string
  ends_on: string
  starts_at: string | null
  scope: 'SCHOOL' | 'LEVEL' | 'CLASSROOM' | 'COURSE'
  level: string | null
  classroom_id: number | null
  offering_id: number | null
  author_id: string | null
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  EXAM: 'Examen',
  HOLIDAY: 'Feriado',
  ACTIVITY: 'Actividad',
  MEETING: 'Reunión',
  OTHER: 'Otro',
}

export const WEEKDAY_LABELS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
