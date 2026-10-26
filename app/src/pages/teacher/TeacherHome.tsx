import { Link } from 'react-router-dom'
import { BookOpen, Inbox } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Empty, ErrorBox, Loading, Panel } from '@/components/ui'
import { GreetingHero, type TodayItem } from '@/components/ux'
import { CourseCover, CourseTag } from '@/components/course'
import { useAsync } from '@/lib/useAsync'
import { formatDay, formatShort, formatTime, isoDay, limaToday, relativeDue } from '@/lib/format'
import { PushPrompt } from '@/pages/NotificationsPage'
import { PrimerosPasos } from '@/components/PrimerosPasos'
import { teacherCourseProgress } from '@/services/progress'
import { currentPeriod, listPeriods } from '@/services/notas'
import { classroomLabel, listAssignmentsForOfferings, listStudentNames, listSubmissionsForAssignments, listTeacherOfferings } from '@/services/campus'

export default function TeacherHome() {
  const { profile } = useAuth()
  const teacherId = profile?.id ?? ''

  const { data, loading, error, reload } = useAsync(async () => {
    const [offerings, periods] = await Promise.all([listTeacherOfferings(teacherId), listPeriods()])
    const assignments = await listAssignmentsForOfferings(offerings)
    const [submissions, names] = await Promise.all([
      listSubmissionsForAssignments(assignments.map((a) => a.id)),
      listStudentNames(offerings.map((o) => o.classroom_id)),
    ])
    return { offerings, assignments, submissions, names, period: currentPeriod(periods) }
  }, [teacherId])

  const toReview = (data?.submissions ?? [])
    .filter((s) => s.status === 'SUBMITTED')
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))
  const assignmentById = new Map((data?.assignments ?? []).map((a) => [a.id, a]))
  const pendingByOffering = new Map<number, number>()
  for (const s of toReview) {
    const a = assignmentById.get(s.assignment_id)
    if (a) pendingByOffering.set(a.offering_id, (pendingByOffering.get(a.offering_id) ?? 0) + 1)
  }
  const upcoming = (data?.assignments ?? [])
    .filter((a) => a.status === 'PUBLISHED' && a.due_at && Date.parse(a.due_at) > Date.now())
    .slice(0, 5)

  const firstName = profile?.full_name?.split(' ')[0] ?? ''
  const dueToday = upcoming.filter((a) => isoDay(new Date(a.due_at!)) === limaToday()).length
  const today: TodayItem[] = loading ? [] : [
    toReview.length ? { label: `${toReview.length} por revisar`, tone: 'aviso' } : { label: 'Revisiones al día', tone: 'ok' },
    ...(dueToday ? [{ label: `${dueToday} tarea${dueToday === 1 ? '' : 's'} vence${dueToday === 1 ? '' : 'n'} hoy` }] : []),
    ...(data ? [{ label: `${data.offerings.length} curso${data.offerings.length === 1 ? '' : 's'}` }] : []),
  ]

  return (
    <>
      <GreetingHero
        name={firstName}
        subtitle={
          loading ? formatDay(limaToday())
            : toReview.length ? `Tienes ${toReview.length} entrega${toReview.length === 1 ? '' : 's'} por revisar.`
            : 'Estás al día con las revisiones.'
        }
        today={today}
      />
      <PushPrompt />
      <PrimerosPasos className="mb-6" />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading shape="page" /> : data && (
        data.offerings.length === 0 ? (
          <Empty title="Todavía no tienes cursos asignados" art="notebook" icon={<BookOpen className="h-6 w-6" />}>
            La administración del colegio te asigna tus cursos. Cuando lo haga, aparecerán aquí.
          </Empty>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {data.offerings.map((o) => {
                  const pending = pendingByOffering.get(o.id) ?? 0
                  return (
                    <CourseCover
                      key={o.id}
                      offering={o}
                      showClassroom
                      meta={pending > 0 ? <Badge tone="spark">{pending} por revisar</Badge> : undefined}
                      {...teacherCourseProgress(data.assignments, data.submissions, o.id, data.period)}
                    />
                  )
                })}
              </div>

              <Panel title="Por revisar">
                {toReview.length === 0 ? (
                  <Empty title="No hay entregas nuevas" art="tasks" compact icon={<Inbox className="h-5 w-5" />}>Las entregas de tus alumnos aparecerán aquí.</Empty>
                ) : (
                  <ul className="divide-y divide-linea">
                    {toReview.slice(0, 12).map((s) => {
                      const a = assignmentById.get(s.assignment_id)
                      if (!a) return null
                      return (
                        <li key={s.id}>
                          <Link to={`/tarea/${a.id}?alumno=${s.student_id}`} className="flex items-center gap-3 py-3 hover:bg-papel">
                            <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: a.offering.subject.color }} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold">{data.names[s.student_id] ?? 'Alumno'}</p>
                              <p className="truncate text-sm text-texto-suave">{a.title}, {classroomLabel(a.offering.classroom)}. Entregada el {formatShort(s.submitted_at)}, {formatTime(s.submitted_at)}</p>
                            </div>
                            {s.is_late && <Badge tone="late">Tarde</Badge>}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {toReview.length > 12 && <p className="mt-3 text-sm text-texto-suave">Y {toReview.length - 12} más dentro de cada tarea.</p>}
              </Panel>
            </div>

            <Panel title="Próximos vencimientos" className="h-fit">
              {upcoming.length === 0 ? (
                <p className="text-sm text-texto-suave">No hay tareas con fecha próxima.</p>
              ) : (
                <ul className="space-y-4">
                  {upcoming.map((a) => {
                    const delivered = data.submissions.filter((s) => s.assignment_id === a.id).length
                    return (
                      <li key={a.id}>
                        <Link to={`/tarea/${a.id}`} className="block hover:underline">
                          <CourseTag offering={a.offering} />
                          <p className="font-bold">{a.title}</p>
                        </Link>
                        <p className="text-sm text-texto-suave">{relativeDue(a.due_at).label}. {delivered} entrega{delivered === 1 ? '' : 's'} recibida{delivered === 1 ? '' : 's'}.</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          </div>
        )
      )}
    </>
  )
}
