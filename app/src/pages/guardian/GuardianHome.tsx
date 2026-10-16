import { Link } from 'react-router-dom'
import { Copy, FileSignature, FileText, MessageCircle, Wallet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Empty, ErrorBox, Loading, Panel } from '@/components/ui'
import { GreetingHero, type TodayItem } from '@/components/ux'
import { TaskRow } from '@/components/course'
import { AnnouncementFeed } from '@/pages/shared/AnnouncementFeed'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { formatDay, formatShort, isoDay, limaToday, relativeDue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { classroomLabel, getLatestDigest, listAttendance, listMyPensions, listNotifications } from '@/services/campus'
import { useStudentWork } from '@/services/useStudentWork'
import { listCirculars, listRecipients } from '@/services/comunicados'
import { isUnread, listConversations, listReads } from '@/services/mensajes'
import { PushPrompt } from '@/pages/NotificationsPage'
import { TeslaSummaryCard } from '@/components/tesla'
import type { AttendanceRow, NotificationRow, PensionRow, StudentLite } from '@/types'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']

function monthRange(today: string) {
  const [y, m] = today.split('-').map(Number)
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { y, m, first, last, lastDay }
}

function weekStart(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // lunes = 0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Asistencia del mes: un punto por día hábil
// ---------------------------------------------------------------------------
function AttendanceMonth({ rows }: { rows: AttendanceRow[] }) {
  const today = limaToday()
  const { y, m, lastDay } = monthRange(today)
  const byDate = new Map(rows.map((r) => [r.date, r]))
  const days: { date: string; dow: number }[] = []
  for (let d = 1; d <= lastDay; d++) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7
    if (dow < 5) days.push({ date, dow })
  }
  const lead = days.length ? days[0].dow : 0
  const onTime = rows.filter((r) => r.status === 'ON_TIME').length
  const late = rows.filter((r) => r.status === 'LATE').length

  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5 text-center text-[11px] font-bold text-texto-suave">
        {['L', 'M', 'M', 'J', 'V'].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => <span key={`e${i}`} />)}
        {days.map(({ date }) => {
          const row = byDate.get(date)
          const future = date > today
          const label = row
            ? `${formatDay(date)}: ${row.status === 'LATE' ? 'tardanza' : 'puntual'}${row.entry_time ? `, ingresó ${row.entry_time.slice(0, 5)}` : ''}`
            : future ? formatDay(date) : `${formatDay(date)}: sin registro de ingreso`
          return (
            <span
              key={date}
              title={label}
              aria-label={label}
              className={cn(
                'flex h-9 items-center justify-center rounded-md text-xs font-bold',
                row?.status === 'ON_TIME' && 'bg-estado-ok text-white',
                row?.status === 'LATE' && 'bg-estado-tarde text-white',
                !row && !future && 'border border-dashed border-texto-suave/40 text-texto-suave',
                !row && future && 'bg-papel text-texto-suave/60',
                date === today && 'ring-2 ring-chispa ring-offset-1',
              )}
            >
              {Number(date.slice(8))}
            </span>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-estado-ok" />Puntual: <b>{onTime}</b></span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-estado-tarde" />Tardanza: <b>{late}</b></span>
        <span className="inline-flex items-center gap-1.5 text-texto-suave"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-texto-suave/60" />Sin registro</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// La semana en frases
// ---------------------------------------------------------------------------
function WeekSentences({ child, attendance, pending, overdue, nextDue, notifications }: {
  child: StudentLite
  attendance: AttendanceRow[]
  pending: number
  overdue: number
  nextDue: string | null
  notifications: NotificationRow[]
}) {
  const today = limaToday()
  const start = weekStart(today)
  const week = attendance.filter((r) => r.date >= start && r.date <= today)
  let schoolDays = 0
  for (let d = new Date(`${start}T12:00:00Z`); isoDay(d) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) schoolDays++
  }
  const late = week.filter((r) => r.status === 'LATE').length
  const name = child.first_name ?? 'Tu hijo'
  const monthNotifs = notifications.filter((n) => n.date.slice(0, 7) === today.slice(0, 7)).length

  const sentences: { tone: 'ok' | 'late' | 'alert' | 'neutral'; text: string }[] = []
  if (schoolDays === 0) sentences.push({ tone: 'neutral', text: 'La semana escolar todavía no empieza.' })
  else if (week.length === schoolDays && late === 0) sentences.push({ tone: 'ok', text: `${name} llegó puntual los ${schoolDays} día${schoolDays === 1 ? '' : 's'} de esta semana.` })
  else sentences.push({ tone: late > 0 || week.length < schoolDays ? 'late' : 'ok', text: `Esta semana: ${week.length - late} día${week.length - late === 1 ? '' : 's'} puntual, ${late} tardanza${late === 1 ? '' : 's'}${week.length < schoolDays ? ` y ${schoolDays - week.length} sin registro de ingreso` : ''}.` })

  if (overdue > 0) sentences.push({ tone: 'alert', text: `Tiene ${overdue} tarea${overdue === 1 ? '' : 's'} vencida${overdue === 1 ? '' : 's'} sin entregar.` })
  if (pending > 0) sentences.push({ tone: 'neutral', text: `${pending} tarea${pending === 1 ? '' : 's'} por entregar${nextDue ? `; la próxima ${relativeDue(nextDue).label.toLowerCase()}` : ''}.` })
  if (overdue === 0 && pending === 0) sentences.push({ tone: 'ok', text: 'Está al día con sus tareas.' })
  sentences.push(monthNotifs > 0
    ? { tone: 'late', text: `${monthNotifs} notificación${monthNotifs === 1 ? '' : 'es'} del colegio este mes.` }
    : { tone: 'ok', text: 'Sin notificaciones del colegio este mes.' })

  const dot = { ok: 'bg-estado-ok', late: 'bg-estado-tarde', alert: 'bg-estado-alerta', neutral: 'bg-tinta-500' }
  return (
    <ul className="space-y-3">
      {sentences.map((s, i) => (
        <li key={i} className="flex gap-3 font-display text-lg leading-snug text-texto sm:text-xl">
          <span className={cn('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', dot[s.tone])} aria-hidden />
          {s.text}
        </li>
      ))}
    </ul>
  )
}

const NOTIF_LABEL: Record<string, string> = {
  LATE_ENTRY: 'Tardanza',
  PRESENTATION: 'Presentación personal',
  INAPPROPRIATE_CONDUCT: 'Conducta',
}

function PensionsCard({ rows }: { rows: PensionRow[] }) {
  const today = limaToday()
  const overdue = rows.filter((p) => !p.paid && p.due_date < today)
  const next = rows.find((p) => !p.paid && p.due_date >= today)
  return (
    <Panel title="Pensiones">
      <div className="flex items-start gap-3">
        <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-texto-suave" />
        <div className="text-sm">
          {overdue.length === 0
            ? <p className="font-bold text-estado-ok">Al día.</p>
            : <p className="font-bold text-estado-alerta">{overdue.length} pensión{overdue.length === 1 ? '' : 'es'} vencida{overdue.length === 1 ? '' : 's'}: {overdue.map((p) => MONTHS[p.period_month - 1]).join(', ')}.</p>}
          {next && <p className="mt-1 text-texto-suave">Próximo vencimiento: {MONTHS[next.period_month - 1]}, el {formatShort(next.due_date)} (S/ {next.amount.toFixed(2)}).</p>}
          <p className="mt-2 text-xs text-texto-suave">Para pagos o consultas, comunícate con secretaría.</p>
        </div>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Pendientes: comunicados por leer o responder y mensajes nuevos
// ---------------------------------------------------------------------------
function FamilyPending({ profileId }: { profileId: string }) {
  const { data } = useAsync(async () => {
    const circulars = await listCirculars(30)
    const [recipients, conversations, reads] = await Promise.all([listRecipients(circulars.map((c) => c.id)), listConversations(), listReads()])
    const pending = circulars.filter((c) => recipients.some((r) => r.circular_id === c.id && (!r.read_at || (c.response_type === 'CONSENT' && !r.response))))
    const unread = conversations.filter((c) => isUnread(c, reads, profileId)).length
    return { pending, unread }
  }, [profileId])
  if (!data || (!data.pending.length && !data.unread)) return null
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      {data.pending.length > 0 && (
        <Link to={data.pending.length === 1 ? `/comunicados/${data.pending[0].id}` : '/comunicados'} className="flex items-center gap-3 rounded-xl bg-chispa-100 px-5 py-4 text-tinta hover:ring-2 hover:ring-chispa">
          <FileSignature className="h-6 w-6 shrink-0" />
          <span><b>{data.pending.length} comunicado{data.pending.length === 1 ? '' : 's'}</b> por leer o responder{data.pending.length === 1 ? `: ${data.pending[0].title}` : ''}</span>
        </Link>
      )}
      {data.unread > 0 && (
        <Link to="/mensajes" className="flex items-center gap-3 rounded-xl bg-superficie px-5 py-4 ring-1 ring-linea hover:ring-tinta-500">
          <MessageCircle className="h-6 w-6 shrink-0 text-tinta-500" />
          <span><b>{data.unread} conversaci{data.unread === 1 ? 'ón' : 'ones'}</b> con mensajes nuevos</span>
        </Link>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function GuardianHome() {
  const { activeChild, children, profile } = useAuth()
  const toast = useToast()
  const work = useStudentWork(activeChild)
  const today = limaToday()
  const { first, last } = monthRange(today)
  const childId = activeChild?.id ?? null

  const tesla = useAsync(async () => {
    if (!childId) return null
    const [attendance, notifications, digest, pensions] = await Promise.all([
      listAttendance(childId, weekStart(today) < first ? weekStart(today) : first, last),
      listNotifications(childId, 8),
      getLatestDigest(childId),
      listMyPensions(Number(today.slice(0, 4))),
    ])
    return { attendance, notifications, digest, pensions }
  }, [childId, first, last, today])

  if (!children.length) {
    return <ErrorBox message="Su cuenta aún no está vinculada a ningún alumno. Comuníquese con secretaría." />
  }
  if (!activeChild) return <Loading shape="page" />

  const { groups } = work
  const nextDue = groups.todo.find((t) => t.due_at)?.due_at ?? null
  const monthAttendance = (tesla.data?.attendance ?? []).filter((r) => r.date >= first)
  // Formación del día para la familia: cómo llegó hoy y qué tiene pendiente.
  const todayRow = (tesla.data?.attendance ?? []).find((r) => r.date === today)
  const childName = activeChild.first_name ?? 'Su hijo'
  const todayItems: TodayItem[] = work.loading || tesla.loading ? [] : [
    todayRow
      ? { label: todayRow.status === 'LATE' ? `Hoy llegó tarde${todayRow.entry_time ? ` (${todayRow.entry_time.slice(0, 5)})` : ''}` : `Hoy llegó puntual${todayRow.entry_time ? ` (${todayRow.entry_time.slice(0, 5)})` : ''}`, tone: todayRow.status === 'LATE' ? 'aviso' : 'ok' }
      : { label: 'Asistencia de hoy aún sin registrar' },
    ...(groups.overdue.length ? [{ label: `${groups.overdue.length} tarea${groups.overdue.length === 1 ? '' : 's'} atrasada${groups.overdue.length === 1 ? '' : 's'}`, tone: 'alerta' as const }] : []),
    ...(groups.todo.length ? [{ label: `${groups.todo.length} pendiente${groups.todo.length === 1 ? '' : 's'}` }] : []),
  ]

  return (
    <>
      <GreetingHero name={profile?.full_name} subtitle={`Así va la semana de ${childName} · ${classroomLabel(activeChild.classroom)}. ${formatDay(today)}.`} today={todayItems} />
      <PushPrompt />
      {profile && <FamilyPending profileId={profile.id} />}

      {(work.error || tesla.error) && <div className="mb-6"><ErrorBox message={work.error || tesla.error} onRetry={() => { void work.reload(); void tesla.reload() }} /></div>}

      {work.loading || tesla.loading ? <Loading shape="page" /> : (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <section className="rounded-xl bg-superficie px-6 py-6 ring-1 ring-linea">
              <WeekSentences
                child={activeChild}
                attendance={tesla.data?.attendance ?? []}
                pending={groups.todo.length}
                overdue={groups.overdue.length}
                nextDue={nextDue}
                notifications={tesla.data?.notifications ?? []}
              />
            </section>

            <Panel title="Tareas" action={<Link to="/tareas" className="text-sm font-bold text-tinta-500 hover:underline">Ver todas</Link>}>
              {groups.overdue.length + groups.todo.length === 0 && groups.graded.length === 0 ? (
                <p className="text-sm text-texto-suave">Todavía no hay tareas publicadas.</p>
              ) : (
                <div className="divide-y divide-linea">
                  {[...groups.overdue, ...groups.todo].slice(0, 6).map((t) => (
                    <TaskRow key={t.id} assignment={t} offering={t.offering} state={t.state} to={`/tarea/${t.id}`} />
                  ))}
                </div>
              )}
              {groups.graded.length > 0 && (
                <>
                  <h3 className="mb-1 mt-5 text-sm font-bold text-texto-suave">Últimas notas</h3>
                  <div className="divide-y divide-linea">
                    {groups.graded.slice(0, 4).map((t) => (
                      <TaskRow key={t.id} assignment={t} offering={t.offering} state={t.state} submission={t.submission} to={`/tarea/${t.id}`} />
                    ))}
                  </div>
                </>
              )}
            </Panel>

            <Panel title="Resumen semanal del colegio">
              {tesla.data?.digest ? (
                <div>
                  <p className="text-sm text-texto-suave">
                    Semana del {formatShort(tesla.data.digest.summary.week_start)} al {formatShort(tesla.data.digest.summary.week_end)}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-[15px] leading-relaxed">
                    {tesla.data.digest.text_body.split('\n').slice(1).map((line, i) => (
                      <li key={i} className="flex gap-2"><FileText className="mt-1 h-4 w-4 shrink-0 text-texto-suave" />{line}</li>
                    ))}
                  </ul>
                  <button
                    onClick={() => { void navigator.clipboard.writeText(tesla.data!.digest!.text_body).then(() => toast('Resumen copiado.')) }}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-tinta-500 hover:underline"
                  >
                    <Copy className="h-4 w-4" />Copiar resumen
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(tesla.data.digest.text_body)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-estado-ok hover:underline"
                  >
                    Compartir por WhatsApp
                  </a>
                </div>
              ) : (
                <p className="text-sm text-texto-suave">El colegio publica el resumen cada viernes por la tarde.</p>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <TeslaSummaryCard key={activeChild.id} studentId={activeChild.id} forFamily />
            <Panel title={`Asistencia de ${MONTHS[Number(today.slice(5, 7)) - 1]}`}>
              <AttendanceMonth rows={monthAttendance} />
            </Panel>

            <Panel title="Notificaciones del colegio">
              {tesla.data?.notifications.length ? (
                <ul className="divide-y divide-linea">
                  {tesla.data.notifications.map((n) => (
                    <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={n.notification_type === 'INAPPROPRIATE_CONDUCT' ? 'alert' : 'late'}>{NOTIF_LABEL[n.notification_type ?? ''] ?? 'Notificación'}</Badge>
                        <span className="text-xs text-texto-suave">{formatShort(n.date)}</span>
                      </div>
                      {n.observation && <p className="mt-1 text-sm text-texto">{n.observation}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty title="Sin notificaciones" art="bell" compact>Aquí verá las tardanzas o incidencias que registre el colegio.</Empty>
              )}
            </Panel>

            {!!tesla.data?.pensions.length && <PensionsCard rows={tesla.data.pensions} />}

            <Panel title="Avisos">
              <AnnouncementFeed classroomId={activeChild.classroom_id} offerings={work.data?.offerings ?? []} limit={4} compact />
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
