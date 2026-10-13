import { useMemo } from 'react'
import { useAsync } from '@/lib/useAsync'
import {
  getPeopleNames, listAssignmentsForOfferings, listClassroomOfferings, listStudentSubmissions, taskState,
} from '@/services/campus'
import { currentPeriod, listPeriods } from '@/services/notas'
import type { AssignmentWithCourse, GradingPeriod, Offering, StudentLite, StudentTaskState, Submission } from '@/types'

export type StudentTask = AssignmentWithCourse & { submission?: Submission; state: StudentTaskState }

/** Cursos, tareas y entregas de un alumno (para el alumno o su familia). */
export function useStudentWork(student: StudentLite | null) {
  const classroomId = student?.classroom_id ?? null
  const studentId = student?.id ?? null

  const query = useAsync(async () => {
    if (!classroomId || !studentId) return { offerings: [] as Offering[], tasks: [] as StudentTask[], teachers: {} as Record<string, string>, period: null as GradingPeriod | null }
    const [offerings, periods] = await Promise.all([listClassroomOfferings(classroomId), listPeriods()])
    const [assignments, teachers] = await Promise.all([
      listAssignmentsForOfferings(offerings),
      getPeopleNames(offerings.map((o) => o.teacher_id)),
    ])
    const submissions = await listStudentSubmissions(studentId, assignments.map((a) => a.id))
    const byAssignment = new Map(submissions.map((s) => [s.assignment_id, s]))
    const tasks: StudentTask[] = assignments.map((a) => {
      const submission = byAssignment.get(a.id)
      return { ...a, submission, state: taskState(a, submission) }
    })
    return { offerings, tasks, teachers, period: currentPeriod(periods) }
  }, [classroomId, studentId])

  const groups = useMemo(() => {
    const tasks = query.data?.tasks ?? []
    const byDue = (a: StudentTask, b: StudentTask) =>
      (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity)
    const todo = tasks.filter((t) => t.state === 'PENDING' || t.state === 'RETURNED').sort(byDue)
    const overdue = tasks.filter((t) => t.state === 'OVERDUE').sort(byDue)
    const graded = tasks
      .filter((t) => t.state === 'GRADED')
      .sort((a, b) => Date.parse(b.submission?.graded_at ?? '0') - Date.parse(a.submission?.graded_at ?? '0'))
    const delivered = tasks.filter((t) => t.state === 'SUBMITTED' || t.state === 'LATE_SUBMITTED')
    const missing = tasks.filter((t) => t.state === 'CLOSED_MISSING')
    return { todo, overdue, graded, delivered, missing }
  }, [query.data])

  return { ...query, groups }
}
