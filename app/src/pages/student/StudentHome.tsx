import { CalendarCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading, Panel } from '@/components/ui'
import { GreetingHero, type TodayItem } from '@/components/ux'
import { CourseCover, TaskRow } from '@/components/course'
import { AnnouncementFeed } from '@/pages/shared/AnnouncementFeed'
import { formatDay, isoDay, limaToday } from '@/lib/format'
import { classroomLabel } from '@/services/campus'
import { useStudentWork } from '@/services/useStudentWork'
import { PushPrompt } from '@/pages/NotificationsPage'
import { familyCourseProgress } from '@/services/progress'
import { TeslaSummaryCard } from '@/components/tesla'

export default function StudentHome() {
  const { selfStudent } = useAuth()
  const { data, loading, error, reload, groups } = useStudentWork(selfStudent)

  if (!selfStudent) {
    return <ErrorBox message="Tu cuenta no está vinculada a un alumno. Avisa a secretaría." />
  }

  const inAWeek = Date.now() + 7 * 86_400_000
  const thisWeek = groups.todo.filter((t) => !t.due_at || Date.parse(t.due_at) <= inAWeek)
  const later = groups.todo.filter((t) => t.due_at && Date.parse(t.due_at) > inAWeek)
  const dueToday = groups.todo.filter((t) => t.due_at && isoDay(new Date(t.due_at)) === limaToday()).length
  const today: TodayItem[] = loading ? [] : [
    ...(groups.overdue.length ? [{ label: `${groups.overdue.length} atrasada${groups.overdue.length === 1 ? '' : 's'}`, tone: 'alerta' as const }] : []),
    ...(dueToday ? [{ label: `${dueToday} vence${dueToday === 1 ? '' : 'n'} hoy`, tone: 'aviso' as const }] : []),
    thisWeek.length ? { label: `${thisWeek.length} para esta semana` } : { label: '¡Al día con tus tareas!', tone: 'ok' as const },
  ]

  return (
    <>
      <GreetingHero name={selfStudent.first_name} subtitle={`${formatDay(limaToday())}. ${classroomLabel(selfStudent.classroom)}`} today={today} />
      <PushPrompt />

      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading shape="page" /> : data && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Panel title="Tu semana" action={<Link to="/tareas" className="text-sm font-bold text-tinta-500 hover:underline">Ver todas</Link>}>
              {groups.overdue.length === 0 && thisWeek.length === 0 ? (
                <Empty title="Nada pendiente para esta semana" art="tasks" icon={<CalendarCheck className="h-6 w-6" />}>
                  Cuando tus docentes publiquen una tarea aparecerá aquí.
                </Empty>
              ) : (
                <div className="space-y-5">
                  {groups.overdue.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-sm font-bold text-estado-alerta">Atrasadas</h3>
                      <div className="divide-y divide-linea">
                        {groups.overdue.map((t) => <TaskRow key={t.id} assignment={t} offering={t.offering} state={t.state} to={`/tarea/${t.id}`} />)}
                      </div>
                    </div>
                  )}
                  {thisWeek.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-sm font-bold text-texto-suave">Próximos 7 días</h3>
                      <div className="divide-y divide-linea">
                        {thisWeek.map((t) => <TaskRow key={t.id} assignment={t} offering={t.offering} state={t.state} to={`/tarea/${t.id}`} />)}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {later.length > 0 && <p className="mt-4 text-sm text-texto-suave">Y {later.length} tarea{later.length === 1 ? '' : 's'} más adelante.</p>}
            </Panel>

            <Panel title="Últimas notas">
              {groups.graded.length === 0 ? (
                <p className="text-sm text-texto-suave">Todavía no tienes tareas calificadas.</p>
              ) : (
                <div className="divide-y divide-linea">
                  {groups.graded.slice(0, 5).map((t) => (
                    <TaskRow key={t.id} assignment={t} offering={t.offering} state={t.state} submission={t.submission} to={`/tarea/${t.id}`} />
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <TeslaSummaryCard studentId={selfStudent.id} />
            <Panel title="Avisos">
              <AnnouncementFeed classroomId={selfStudent.classroom_id} offerings={data.offerings} limit={4} compact />
            </Panel>
            <div>
              <h2 className="mb-3 font-display text-lg font-semibold">Mis cursos</h2>
              <div className="grid gap-3">
                {data.offerings.map((o) => (
                  <CourseCover key={o.id} offering={o} teacherName={o.teacher_id ? data.teachers[o.teacher_id] : undefined} {...familyCourseProgress(data.tasks, o.id, data.period)} />
                ))}
                {data.offerings.length === 0 && <p className="text-sm text-texto-suave">Tu aula aún no tiene cursos en el campus.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
