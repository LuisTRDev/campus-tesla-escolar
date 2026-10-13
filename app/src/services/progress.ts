import type { CourseProgress, NextTask } from '@/components/course'
import type { Assignment, AssignmentWithCourse, GradingPeriod, Submission } from '@/types'
import type { StudentTask } from '@/services/useStudentWork'

function inPeriod(a: Pick<Assignment, 'due_at' | 'created_at'>, period: GradingPeriod | null): boolean {
  if (!period) return true
  const day = (a.due_at ?? a.created_at).slice(0, 10)
  return day >= period.starts_on && day <= period.ends_on
}

const byDue = (a: { due_at: string | null }, b: { due_at: string | null }) =>
  (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity)

/** Alumno o familia: tareas entregadas del bimestre y la próxima por entregar. */
export function familyCourseProgress(tasks: StudentTask[], offeringId: number, period: GradingPeriod | null): { progress: CourseProgress | null; next: NextTask | null } {
  const mine = tasks.filter((t) => t.offering_id === offeringId)
  const scoped = mine.filter((t) => inPeriod(t, period))
  const done = scoped.filter((t) => t.state === 'GRADED' || t.state === 'SUBMITTED' || t.state === 'LATE_SUBMITTED').length
  const pending = mine.filter((t) => t.state === 'PENDING' || t.state === 'RETURNED' || t.state === 'OVERDUE').sort(byDue)[0]
  return {
    progress: scoped.length ? { value: done / scoped.length, label: `${done}/${scoped.length} tareas` } : null,
    next: pending ? { title: pending.title, due_at: pending.due_at, to: `/tarea/${pending.id}` } : null,
  }
}

/** Docente: entregas revisadas del bimestre y la próxima tarea que vence. */
export function teacherCourseProgress(assignments: AssignmentWithCourse[], submissions: Submission[], offeringId: number, period: GradingPeriod | null): { progress: CourseProgress | null; next: NextTask | null } {
  const mine = assignments.filter((a) => a.offering_id === offeringId)
  const ids = new Set(mine.filter((a) => inPeriod(a, period)).map((a) => a.id))
  const received = submissions.filter((s) => ids.has(s.assignment_id))
  const graded = received.filter((s) => s.status === 'GRADED').length
  const upcoming = mine.filter((a) => a.status === 'PUBLISHED' && a.due_at && Date.parse(a.due_at) > Date.now()).sort(byDue)[0]
  return {
    progress: received.length ? { value: graded / received.length, label: 'revisado' } : null,
    next: upcoming ? { title: upcoming.title, due_at: upcoming.due_at, to: `/tarea/${upcoming.id}` } : null,
  }
}
