import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck, Clock } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader, Panel } from '@/components/ui'
import { CourseTag } from '@/components/course'
import { useAsync } from '@/lib/useAsync'
import { formatDay, formatShort, formatTime, isoDay } from '@/lib/format'
import { downloadIcs } from '@/lib/ux'
import { cn } from '@/lib/utils'
import { classroomLabel, listAssignmentsForOfferings, listSubmissionsForAssignments, listTeacherOfferings } from '@/services/campus'

/** Lunes de la semana de una fecha (hora de Lima). */
function mondayOf(d: Date): Date {
  const day = new Date(`${isoDay(d)}T12:00:00-05:00`)
  const dow = (day.getUTCDay() + 6) % 7
  return new Date(day.getTime() - dow * 86_400_000)
}

export default function PlannerPage() {
  const { profile } = useAuth()
  const [week, setWeek] = useState(() => mondayOf(new Date()))
  const { data, loading, error, reload } = useAsync(async () => {
    const offerings = await listTeacherOfferings(profile!.id)
    const assignments = await listAssignmentsForOfferings(offerings)
    const submissions = await listSubmissionsForAssignments(assignments.map((a) => a.id))
    return { offerings, assignments, submissions }
  }, [profile?.id])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDay(new Date(week.getTime() + i * 86_400_000))), [week])

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="page" />

  const inWeek = data.assignments.filter((a) => a.due_at && days.includes(isoDay(new Date(a.due_at))))
  const scheduled = data.assignments.filter((a) => a.status === 'DRAFT' && a.publish_at && days.includes(isoDay(new Date(a.publish_at))))
  const pending = data.submissions.filter((s) => s.status === 'SUBMITTED')
  const pendingBy = new Map<number, number>()
  for (const s of pending) pendingBy.set(s.assignment_id, (pendingBy.get(s.assignment_id) ?? 0) + 1)
  const toGrade = data.assignments.filter((a) => pendingBy.get(a.id)).sort((a, b) => (pendingBy.get(b.id) ?? 0) - (pendingBy.get(a.id) ?? 0))
  const today = isoDay(new Date())

  return (
    <>
      <PageHeader
        title="Planificador"
        subtitle="Todo lo que pasa esta semana en tus aulas."
        action={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setWeek((w) => new Date(w.getTime() - 7 * 86_400_000))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="secondary" onClick={() => setWeek(mondayOf(new Date()))}>Esta semana</Button>
            <Button size="sm" variant="ghost" onClick={() => setWeek((w) => new Date(w.getTime() + 7 * 86_400_000))} aria-label="Semana siguiente"><ChevronRight className="h-4 w-4" /></Button>
            <Button size="sm" variant="secondary" onClick={() => downloadIcs('tareas-semana', inWeek.map((a) => ({
              uid: `tarea-${a.id}`, title: `${a.offering.subject.name}: ${a.title}`, start: new Date(a.due_at!), description: classroomLabel(a.offering.classroom),
            })))}><CalendarPlus className="h-4 w-4" />A mi calendario</Button>
          </div>
        }
      />
      <p className="-mt-3 mb-5 text-sm text-texto-suave">Semana del {formatShort(days[0])} al {formatShort(days[6])}</p>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const items = inWeek.filter((a) => isoDay(new Date(a.due_at!)) === d)
          const pub = scheduled.filter((a) => isoDay(new Date(a.publish_at!)) === d)
          return (
            <section key={d} className={cn('min-h-32 rounded-xl border bg-superficie p-2', d === today ? 'border-chispa ring-2 ring-chispa/40' : 'border-linea')}>
              <p className="mb-2 px-1 text-xs font-bold uppercase text-texto-suave">{formatDay(d).split(',')[0]} {d.slice(8)}</p>
              <ul className="space-y-1.5">
                {items.map((a) => {
                  const subs = data.submissions.filter((s) => s.assignment_id === a.id)
                  return (
                    <li key={a.id}>
                      <Link to={`/tarea/${a.id}`} className="block rounded-lg p-2 text-sm hover:bg-papel" style={{ borderLeft: `4px solid ${a.offering.subject.color}` }}>
                        <span className="block font-bold leading-tight">{a.title}</span>
                        <span className="block text-xs text-texto-suave">{a.offering.subject.short_name || a.offering.subject.name} · {classroomLabel(a.offering.classroom)}</span>
                        <span className="block text-xs text-texto-suave">{formatTime(a.due_at!)} · {subs.length} entregas</span>
                      </Link>
                    </li>
                  )
                })}
                {pub.map((a) => (
                  <li key={`p${a.id}`}>
                    <Link to={`/tarea/${a.id}`} className="block rounded-lg border border-dashed border-linea p-2 text-xs hover:bg-papel">
                      <Clock className="mr-1 inline h-3 w-3" />Se publica: <b>{a.title}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Por calificar" action={<Badge tone={pending.length ? 'late' : 'ok'}>{pending.length} entregas</Badge>}>
          {!toGrade.length ? <Empty title="Todo calificado" art="grades" compact>¡Buen trabajo! No hay entregas pendientes.</Empty> : (
            <ul className="divide-y divide-linea">
              {toGrade.slice(0, 12).map((a) => (
                <li key={a.id}>
                  <Link to={`/tarea/${a.id}`} className="flex items-center gap-3 py-2.5 hover:bg-papel">
                    <ClipboardCheck className="h-5 w-5 shrink-0 text-tinta-500" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{a.title}</span><CourseTag offering={a.offering} /></span>
                    <Badge tone="late">{pendingBy.get(a.id)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Mis cursos">
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.offerings.map((o) => {
              const open = data.assignments.filter((a) => a.offering_id === o.id && a.status === 'PUBLISHED').length
              return (
                <li key={o.id}>
                  <Link to={`/curso/${o.id}`} className="block rounded-xl border border-linea p-3 hover:border-tinta-500" style={{ borderLeft: `5px solid ${o.subject.color}` }}>
                    <span className="block font-bold">{o.subject.name}</span>
                    <span className="block text-xs text-texto-suave">{classroomLabel(o.classroom)} · {open} tareas abiertas</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>
    </>
  )
}
