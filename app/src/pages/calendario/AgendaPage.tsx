import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Select, Textarea } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { downloadIcs } from '@/lib/ux'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { formatDay, isoDay, limaToday } from '@/lib/format'
import { classroomLabel, listAssignmentsForOfferings, listClassrooms, listTeacherOfferings } from '@/services/campus'
import { EVENT_COLORS, createEvent, deleteEvent, eventsForClassroom, listEvents } from '@/services/calendario'
import { useStudentWork } from '@/services/useStudentWork'
import { useHorizontalSwipe } from '@/lib/useSwipe'
import { EVENT_KIND_LABELS, type Classroom, type EventKind, type Offering, type SchoolEvent } from '@/types'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']

type Item = {
  key: string
  date: string
  title: string
  detail?: string
  color: string
  kind: 'event' | 'task'
  to?: string
  event?: SchoolEvent
  done?: boolean
}

function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month - 1, 1, 12))
  const lead = (first.getUTCDay() + 6) % 7
  const start = new Date(first)
  start.setUTCDate(1 - lead)
  const days: string[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T12:00:00Z`)
  while (d.toISOString().slice(0, 10) <= to && out.length < 120) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

// ---------------------------------------------------------------------------
// Nuevo evento
// ---------------------------------------------------------------------------
function NewEventForm({ day, offerings, classrooms, isAdmin, tutorRooms, onDone }: {
  day: string
  offerings: Offering[]
  classrooms: Classroom[]
  isAdmin: boolean
  tutorRooms: Classroom[]
  onDone: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<EventKind>(isAdmin ? 'ACTIVITY' : 'EXAM')
  const [startsOn, setStartsOn] = useState(day)
  const [endsOn, setEndsOn] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [target, setTarget] = useState(isAdmin ? 'SCHOOL' : offerings[0] ? `COURSE:${offerings[0].id}` : `CLASSROOM:${tutorRooms[0]?.id ?? ''}`)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const [scope, value] = target.split(':') as [SchoolEvent['scope'], string | undefined]
      await createEvent({
        title, description, kind, startsOn, endsOn, startsAt, scope,
        level: scope === 'LEVEL' ? value : undefined,
        classroomId: scope === 'CLASSROOM' ? Number(value) : undefined,
        offeringId: scope === 'COURSE' ? Number(value) : undefined,
      })
      toast('Evento agregado al calendario.')
      onDone()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const rooms = isAdmin ? classrooms : tutorRooms
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
            {(Object.keys(EVENT_KIND_LABELS) as EventKind[]).filter((k) => isAdmin || k !== 'HOLIDAY').map((k) => <option key={k} value={k}>{EVENT_KIND_LABELS[k]}</option>)}
          </Select>
        </Field>
        <Field label="Para">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {isAdmin && <option value="SCHOOL">Todo el colegio</option>}
            {isAdmin && <option value="LEVEL:Primaria">Primaria</option>}
            {isAdmin && <option value="LEVEL:Secundaria">Secundaria</option>}
            {rooms.map((c) => <option key={`c${c.id}`} value={`CLASSROOM:${c.id}`}>Aula {classroomLabel(c)}</option>)}
            {offerings.map((o) => <option key={`o${o.id}`} value={`COURSE:${o.id}`}>{o.subject.name} · {classroomLabel(o.classroom)}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required placeholder={kind === 'EXAM' ? 'Examen bimestral de Matemática' : ''} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fecha"><Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required /></Field>
        <Field label="Hasta" hint="Opcional, si dura varios días."><Input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
        <Field label="Hora" hint="Opcional."><Input type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
      </div>
      <Field label="Descripción"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} className="min-h-20" placeholder={kind === 'EXAM' ? 'Temas que entran, materiales que deben traer…' : ''} /></Field>
      <div className="flex justify-end"><Button type="submit" loading={busy}>Agregar</Button></div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function AgendaPage() {
  const { profile, isAdmin, tutorClassrooms } = useAuth()
  const toast = useToast()
  const focus = useFocusStudent()
  const today = limaToday()
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [selected, setSelected] = useState(today)
  const [creating, setCreating] = useState(false)
  const isFamily = profile?.role === 'STUDENT' || profile?.role === 'GUARDIAN'
  const isTeacher = profile?.role === 'TEACHER'
  const canCreate = isAdmin || isTeacher

  const grid = useMemo(() => monthGrid(month.y, month.m), [month])
  const from = grid[0]
  const to = grid[grid.length - 1]

  const work = useStudentWork(isFamily ? focus : null)
  const data = useAsync(async () => {
    const [events, offerings, classrooms] = await Promise.all([
      listEvents(from, to),
      isTeacher ? listTeacherOfferings(profile!.id) : Promise.resolve([] as Offering[]),
      isAdmin ? listClassrooms() : Promise.resolve([] as Classroom[]),
    ])
    const teacherTasks = isTeacher ? await listAssignmentsForOfferings(offerings) : []
    return { events, offerings, classrooms, teacherTasks }
  }, [from, to, isTeacher, isAdmin, profile?.id])

  const items = useMemo(() => {
    const out: Item[] = []
    const events = isFamily
      ? eventsForClassroom(data.data?.events ?? [], focus?.classroom ? { id: focus.classroom.id, level: focus.classroom.level } : null)
      : data.data?.events ?? []
    for (const e of events) {
      for (const d of eachDay(e.starts_on < from ? from : e.starts_on, e.ends_on > to ? to : e.ends_on)) {
        out.push({ key: `e${e.id}-${d}`, date: d, title: e.title, detail: [EVENT_KIND_LABELS[e.kind], e.starts_at?.slice(0, 5)].filter(Boolean).join(' · '), color: EVENT_COLORS[e.kind], kind: 'event', event: e })
      }
    }
    const tasks = isFamily ? work.data?.tasks ?? [] : data.data?.teacherTasks ?? []
    for (const t of tasks) {
      if (!t.due_at) continue
      const d = isoDay(new Date(t.due_at))
      if (d < from || d > to) continue
      const state = 'state' in t ? (t as { state: string }).state : undefined
      out.push({
        key: `t${t.id}`, date: d, title: t.title, detail: `Tarea · ${t.offering.subject.name}`, color: t.offering.subject.color, kind: 'task',
        to: `/tarea/${t.id}`, done: state === 'GRADED' || state === 'SUBMITTED' || state === 'LATE_SUBMITTED',
      })
    }
    return out
  }, [data.data, work.data, isFamily, focus?.classroom, from, to])

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it])
    return m
  }, [items])

  const upcoming = items
    .filter((i) => i.date >= today && !i.done)
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((i, idx, arr) => i.kind === 'task' || arr.findIndex((x) => x.event?.id === i.event?.id) === idx)
    .slice(0, 8)

  function shift(delta: number) {
    setMonth(({ y, m }) => {
      const n = m + delta
      return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n }
    })
  }

  const swipe = useHorizontalSwipe(() => shift(1), () => shift(-1))

  async function onDelete(e: SchoolEvent) {
    if (!confirm(`¿Eliminar "${e.title}" del calendario?`)) return
    const undo = data.mutate((cur) => cur && { ...cur, events: cur.events.filter((x) => x.id !== e.id) })
    try {
      await deleteEvent(e.id)
      toast('Evento eliminado.')
    } catch (err) {
      undo()
      toast(toMessage(err), 'error')
    }
  }

  const selectedItems = byDay.get(selected) ?? []
  const monthKey = `${month.y}-${String(month.m).padStart(2, '0')}`

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={isFamily ? 'Tareas, exámenes, feriados y actividades en un solo lugar.' : 'Calendario escolar: exámenes, feriados, actividades y reuniones.'}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => {
              // Un evento por elemento (los eventos de varios días se exportan una sola vez).
              const seen = new Set<string>()
              downloadIcs(`agenda-${monthKey}`, items.filter((i) => {
                const k = i.kind === 'event' ? `e${i.event?.id}` : i.key
                if (seen.has(k)) return false
                seen.add(k)
                return true
              }).map((i) => i.kind === 'event' && i.event ? {
                uid: `evento-${i.event.id}`, title: i.title, allDay: !i.event.starts_at, description: i.detail,
                start: i.event.starts_at ? new Date(`${i.event.starts_on}T${i.event.starts_at}-05:00`) : new Date(`${i.event.starts_on}T12:00:00-05:00`),
                end: i.event.starts_at ? undefined : new Date(new Date(`${i.event.ends_on}T12:00:00-05:00`).getTime() + 86_400_000),
              } : { uid: i.key, title: i.title, start: new Date(`${i.date}T23:00:00-05:00`), description: i.detail }))
            }}><CalendarPlus className="h-4 w-4" />A mi calendario</Button>
            {canCreate && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nuevo evento</Button>}
          </div>
        }
      />
      {(data.error || work.error) && <ErrorBox message={data.error || work.error} onRetry={() => { void data.reload(); void work.reload() }} />}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel
          title={`${MONTHS[month.m - 1]} ${month.y}`}
          action={
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }); setSelected(today) }}>Hoy</Button>
              <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          }
          bodyClassName="p-3 sm:p-4"
        >
          {data.loading ? <Loading shape="table" rows={4} /> : (
            <>
              <div className="grid grid-cols-7 gap-1 text-center font-slab text-[11px] font-extrabold uppercase text-texto-suave">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i} className={cn(i > 4 && 'opacity-60')}>{d}</span>)}
              </div>
              <div className="franja-h mt-1 h-[5px] rounded-sm" aria-hidden />
              <div className="mt-1 grid touch-pan-y grid-cols-7 gap-1" {...swipe}>
                {grid.map((d) => {
                  const list = byDay.get(d) ?? []
                  const inMonth = d.startsWith(monthKey)
                  const holiday = list.some((i) => i.event?.kind === 'HOLIDAY')
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelected(d)}
                      className={cn(
                        'flex min-h-16 flex-col items-stretch rounded-md border p-1 text-left transition-colors sm:min-h-20',
                        selected === d ? 'border-tinta ring-2 ring-chispa/60' : 'border-linea hover:border-tinta-500',
                        !inMonth && 'opacity-40',
                        holiday && 'bg-estado-ok/5',
                        inMonth && !holiday && [5, 6].includes(grid.indexOf(d) % 7) && 'bg-papel',
                      )}
                    >
                      <span className={cn('text-xs font-bold', d === today ? 'inline-flex h-5 w-5 items-center justify-center self-start rounded-full bg-chispa text-tinta' : 'text-texto-suave')}>{Number(d.slice(8))}</span>
                      <span className="mt-0.5 hidden space-y-0.5 sm:block">
                        {list.slice(0, 2).map((i) => (
                          <span key={i.key} className={cn('block truncate rounded px-1 text-[10px] font-bold text-white', i.done && 'opacity-50')} style={{ background: i.color }}>{i.title}</span>
                        ))}
                        {list.length > 2 && <span className="block text-[10px] text-texto-suave">+{list.length - 2} más</span>}
                      </span>
                      <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden">
                        {list.slice(0, 4).map((i) => <span key={i.key} className="h-1.5 w-1.5 rounded-full" style={{ background: i.color }} />)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-texto-suave">
                {(Object.keys(EVENT_KIND_LABELS) as EventKind[]).map((k) => (
                  <span key={k} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: EVENT_COLORS[k] }} />{EVENT_KIND_LABELS[k]}</span>
                ))}
                <span>Tareas: color de su curso</span>
              </div>
            </>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title={formatDay(selected)}>
            {selectedItems.length === 0 ? <p className="text-sm text-texto-suave">Nada programado.</p> : (
              <ul className="space-y-3">
                {selectedItems.map((i) => (
                  <li key={i.key} className="flex gap-3">
                    <span className="w-1.5 shrink-0 rounded-full" style={{ background: i.color }} />
                    <div className="min-w-0 flex-1">
                      {i.to ? <Link to={i.to} className="font-bold hover:underline">{i.title}</Link> : <p className="font-bold">{i.title}</p>}
                      <p className="text-sm text-texto-suave">{i.detail}</p>
                      {i.event?.description && <p className="mt-1 whitespace-pre-line text-sm">{i.event.description}</p>}
                      {i.done && <Badge tone="ok" className="mt-1">Entregada</Badge>}
                    </div>
                    {i.event && (isAdmin || i.event.author_id === profile?.id) && (
                      <button onClick={() => void onDelete(i.event!)} className="self-start rounded p-1 text-texto-suave hover:text-estado-alerta" aria-label={`Eliminar ${i.title}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Próximamente">
            {upcoming.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-texto-suave"><CalendarDays className="h-4 w-4" />Nada en lo que queda del mes.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((i) => (
                  <li key={i.key} className="flex gap-3">
                    <span className="w-12 shrink-0 text-center">
                      <span className="block font-display text-xl font-bold leading-none">{Number(i.date.slice(8))}</span>
                      <span className="text-[11px] uppercase text-texto-suave">{MONTHS[Number(i.date.slice(5, 7)) - 1].slice(0, 3)}</span>
                    </span>
                    <div className="min-w-0 border-l-2 pl-3" style={{ borderColor: i.color }}>
                      {i.to ? <Link to={i.to} className="font-bold hover:underline">{i.title}</Link> : <p className="font-bold">{i.title}</p>}
                      <p className="text-sm text-texto-suave">{i.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo evento" wide>
        {creating && data.data && (
          <NewEventForm
            day={selected}
            offerings={data.data.offerings}
            classrooms={data.data.classrooms}
            isAdmin={isAdmin}
            tutorRooms={tutorClassrooms}
            onDone={() => { setCreating(false); void data.reload(true) }}
          />
        )}
      </Modal>
    </>
  )
}
