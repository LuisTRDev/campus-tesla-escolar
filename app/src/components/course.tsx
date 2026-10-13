import type { CSSProperties, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArtLayer } from '@/components/tesla'
import { withViewTransition } from '@/lib/ux'
import { CalendarClock, Paperclip } from 'lucide-react'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { formatScore, relativeDue } from '@/lib/format'
import { classroomLabel } from '@/services/campus'
import type { Assignment, Offering, StudentTaskState, Submission } from '@/types'

/** Abreviatura del curso (MAT, COM…) para la tapa del cuaderno. */
export function courseCode(o: Offering): string {
  return o.subject.short_name || o.subject.name.slice(0, 3).toUpperCase()
}

/** Anillo de avance (0 a 1) con el porcentaje al centro. */
export function ProgressRing({ value, size = 56, stroke = 5, className, trackClass = 'text-white/25', barClass = 'text-white', children }: {
  value: number
  size?: number
  stroke?: number
  className?: string
  trackClass?: string
  barClass?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="currentColor" className={trackClass} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="currentColor" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} className={cn(barClass, 'transition-[stroke-dashoffset] duration-700 ease-out')}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold">{children ?? `${Math.round(v * 100)}%`}</span>
    </span>
  )
}

export type CourseProgress = { value: number; label: string }
export type NextTask = { title: string; due_at: string | null; to: string }

/**
 * Portada de cuaderno: cada curso lleva su color, como los cuadernos forrados
 * del colegio, con su etiqueta, el elástico, el avance del bimestre en un
 * anillo y la próxima tarea. Es el elemento visual que identifica al campus.
 */
export function CourseCover({ offering, teacherName, meta, showClassroom, progress, next }: {
  offering: Offering
  teacherName?: string
  meta?: ReactNode
  showClassroom?: boolean
  progress?: CourseProgress | null
  next?: NextTask | null
}) {
  const due = next ? relativeDue(next.due_at) : null
  const navigate = useNavigate()
  return (
    <Link
      to={`/curso/${offering.id}`}
      onClick={(e) => {
        // La tarjeta se expande hasta la cabecera del curso (View Transitions).
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        withViewTransition(() => navigate(`/curso/${offering.id}`))
      }}
      className="course-cover notebook-cover group relative flex min-h-[12.5rem] flex-col overflow-hidden rounded-2xl p-4 pl-7 text-white shadow-sm ring-1 ring-black/5 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5"
      style={{ backgroundColor: offering.subject.color, viewTransitionName: `course-${offering.id}` } as CSSProperties}
    >
      {offering.cover && <ArtLayer value={offering.cover} className="opacity-90" />}
      {offering.cover && <span className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />}
      {/* Lomo y elástico del cuaderno */}
      <span className="absolute inset-y-0 left-0 w-4 bg-black/20" aria-hidden />
      <span className="absolute inset-y-0 left-4 w-px bg-white/20" aria-hidden />
      <span className="absolute inset-y-0 right-7 w-2.5 bg-black/25 shadow-[inset_1px_0_0_rgba(255,255,255,0.15)]" aria-hidden />

      <div className="relative flex min-h-[4.6rem] items-start justify-between gap-3 pr-6">
        <span className="font-display text-3xl font-bold tracking-tight drop-shadow-sm">{courseCode(offering)}</span>
        {progress && (
          <span className="flex flex-col items-center" title={progress.label}>
            <ProgressRing value={progress.value} size={52} />
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80">{progress.label}</span>
          </span>
        )}
      </div>

      {/* Etiqueta blanca, como la de los cuadernos del colegio */}
      <div className="relative mr-6 mt-3 rounded-lg bg-superficie px-3 py-2 text-texto shadow-sm">
        <p className="font-display text-[17px] font-semibold leading-snug group-hover:underline">{offering.subject.name}</p>
        {showClassroom && <p className="text-xs font-bold text-texto-suave">{classroomLabel(offering.classroom)}</p>}
        {teacherName && <p className="truncate text-xs text-texto-suave">{teacherName}</p>}
      </div>

      <div className="relative mt-auto pr-6 pt-3">
        {next ? (
          <span className="flex items-start gap-2 rounded-lg bg-black/20 px-2.5 py-2 text-sm">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-bold">{next.title}</span>
              <span className={cn('text-xs', due?.tone === 'overdue' ? 'font-bold text-white' : 'text-white/80')}>{due?.label}</span>
            </span>
          </span>
        ) : meta ? (
          <span className="block text-sm text-white/90">{meta}</span>
        ) : (
          <span className="text-xs text-white/70">Sin tareas pendientes</span>
        )}
        {next && meta && <span className="mt-2 block text-sm text-white/90">{meta}</span>}
      </div>
    </Link>
  )
}

export function CourseTag({ offering }: { offering: Offering }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-texto-suave">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: offering.subject.color }} aria-hidden />
      {offering.subject.name}
    </span>
  )
}

const STATE_LABEL: Record<StudentTaskState, { text: string; tone: 'neutral' | 'ok' | 'late' | 'alert' | 'info' | 'spark' }> = {
  PENDING: { text: 'Pendiente', tone: 'spark' },
  OVERDUE: { text: 'Sin entregar', tone: 'alert' },
  SUBMITTED: { text: 'Entregada', tone: 'info' },
  LATE_SUBMITTED: { text: 'Entregada tarde', tone: 'late' },
  RETURNED: { text: 'Devuelta para corregir', tone: 'late' },
  GRADED: { text: 'Calificada', tone: 'ok' },
  CLOSED_MISSING: { text: 'No entregada', tone: 'alert' },
}

export function TaskStateBadge({ state }: { state: StudentTaskState }) {
  const s = STATE_LABEL[state]
  return <Badge tone={s.tone}>{s.text}</Badge>
}

export function gradeText(assignment: Assignment, submission: Submission | undefined): string | null {
  if (!submission || submission.status !== 'GRADED') return null
  return assignment.grading_type === 'LEVEL' ? submission.level ?? '—' : formatScore(submission.score, assignment.max_score)
}

/** Fila de agenda: franja del color del curso + título + vencimiento + estado. */
export function TaskRow({ assignment, offering, state, submission, to }: {
  assignment: Assignment
  offering: Offering
  state?: StudentTaskState
  submission?: Submission
  to: string
}) {
  const due = relativeDue(assignment.due_at)
  const grade = gradeText(assignment, submission)
  const done = state === 'GRADED' || state === 'SUBMITTED' || state === 'LATE_SUBMITTED'
  return (
    <Link to={to} className="group flex items-stretch gap-3 rounded-lg py-2.5 pr-2 hover:bg-papel focus-visible:bg-papel">
      <span className="w-1.5 shrink-0 rounded-full" style={{ background: offering.subject.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <CourseTag offering={offering} />
        <p className={cn('truncate font-bold text-texto group-hover:underline', done && 'text-texto-suave')}>
          {assignment.title}
          {assignment.attachment_path && <Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-texto-suave" aria-label="Con archivo adjunto" />}
        </p>
        <p className={cn('text-sm', !done && due.tone === 'overdue' ? 'text-estado-alerta' : !done && due.tone === 'soon' ? 'font-bold text-estado-tarde' : 'text-texto-suave')}>
          {due.label}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1">
        {grade && <span className="font-display text-lg font-bold text-texto">{grade}</span>}
        {state && <TaskStateBadge state={state} />}
      </div>
    </Link>
  )
}
