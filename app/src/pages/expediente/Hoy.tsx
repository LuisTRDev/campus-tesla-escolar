import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, BookOpen, Check, PartyPopper, School } from 'lucide-react'
import { Loading, Panel } from '@/components/ui'
import { formatDay, relativeDue } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { getPeopleNames, listClassroomOfferings } from '@/services/campus'
import { listSchedule } from '@/services/calendario'
import type { TaskItem } from '@/services/expediente'
import { WEEKDAY_LABELS, type Offering, type ScheduleBlock } from '@/types'

type Now = { weekday: number; minutes: number }

/** Día de la semana (1 = lunes) y minutos desde la medianoche, en hora de Lima. */
function nowInLima(): Now {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '') + 1
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return { weekday: weekday || 1, minutes: h * 60 + m }
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function span(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** La hora actual, que se renueva sola cada medio minuto. */
function useNow(): Now {
  const [now, setNow] = useState(nowInLima)
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowInLima()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

type Data = { blocks: ScheduleBlock[]; offerings: Map<number, Offering>; teachers: Record<string, string> }

export function TodayAtSchool({ classroomId, pending, todayIso, isHoliday }: {
  classroomId: number | null
  pending: TaskItem[]
  todayIso: string
  isHoliday: boolean
}) {
  const now = useNow()
  const { data, loading } = useAsync<Data | null>(async () => {
    if (!classroomId) return null
    const [blocks, offerings] = await Promise.all([listSchedule([classroomId]), listClassroomOfferings(classroomId)])
    const teachers = await getPeopleNames(offerings.map((o) => o.teacher_id))
    return { blocks, offerings: new Map(offerings.map((o) => [o.id, o])), teachers }
  }, [classroomId], { live: false })

  const today = useMemo(() => (data?.blocks ?? []).filter((b) => b.weekday === now.weekday).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [data, now.weekday])

  // Próximo día con clases (mañana, o el lunes si hoy es viernes) y sus cursos.
  const next = useMemo(() => {
    if (!data) return null
    for (let d = 1; d <= 7; d++) {
      const wd = ((now.weekday - 1 + d) % 7) + 1
      const blocks = data.blocks.filter((b) => b.weekday === wd && b.offering_id)
      if (blocks.length) {
        const ids = [...new Set(blocks.map((b) => b.offering_id!))]
        return { label: d === 1 ? 'Mañana' : `El ${WEEKDAY_LABELS[wd].toLowerCase()}`, offerings: ids.map((i) => data.offerings.get(i)).filter((o): o is Offering => !!o) }
      }
    }
    return null
  }, [data, now.weekday])

  const first = today[0]
  const lastBlock = today[today.length - 1]
  const state: 'none' | 'holiday' | 'before' | 'during' | 'after' = isHoliday ? 'holiday'
    : today.length === 0 ? 'none'
    : now.minutes < toMin(first.starts_at) ? 'before'
    : now.minutes >= toMin(lastBlock.ends_at) ? 'after' : 'during'
  const soon = pending.filter((t) => new Date(t.due_at).getTime() - Date.now() < 4 * 86_400_000)

  if (!classroomId) return null
  return (
    <Panel title="Hoy en el colegio" action={<span className="text-sm font-semibold text-texto-suave">{formatDay(todayIso)}</span>}>
      {loading && !data ? <Loading shape="list" rows={3} /> : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
          <div>
            {state === 'holiday' && <Banner icon={<PartyPopper className="h-5 w-5" aria-hidden />} text="Hoy es feriado: no hay clases." />}
            {state === 'none' && <Banner icon={<School className="h-5 w-5" aria-hidden />} text="Hoy no hay clases en el horario." />}
            {state === 'before' && <Banner icon={<School className="h-5 w-5" aria-hidden />} text={`Las clases empiezan a las ${first.starts_at} (en ${span(toMin(first.starts_at) - now.minutes)}).`} />}
            {state === 'after' && <Banner icon={<Check className="h-5 w-5" aria-hidden />} text="Terminaron las clases de hoy." tone="ok" />}

            {(state === 'before' || state === 'during' || state === 'after') && (
              <ol className="relative mt-4 space-y-2.5 pl-7 before:absolute before:bottom-2 before:left-[0.6rem] before:top-2 before:w-0.5 before:rounded before:bg-linea">
                {today.map((b) => {
                  const o = b.offering_id ? data?.offerings.get(b.offering_id) : undefined
                  const start = toMin(b.starts_at)
                  const end = toMin(b.ends_at)
                  const past = now.minutes >= end
                  const current = state === 'during' && now.minutes >= start && now.minutes < end
                  const color = o?.subject.color ?? '#9AA8BC'
                  const progress = current ? Math.round(((now.minutes - start) / (end - start)) * 100) : 0
                  const teacher = o?.teacher_id ? data?.teachers[o.teacher_id] : null
                  return (
                    <li key={b.id} className="relative">
                      <span
                        className={cn('absolute -left-7 top-3.5 flex h-[1.35rem] w-[1.35rem] items-center justify-center rounded-full border-2 bg-superficie', past && 'text-white')}
                        style={{ borderColor: past || current ? color : 'rgb(var(--linea))', background: past ? color : undefined }}
                        aria-hidden
                      >
                        {past ? <Check className="h-3 w-3" /> : current ? <span className="rec-dot h-2 w-2 rounded-full" style={{ background: color }} /> : null}
                      </span>
                      <div
                        className={cn('rounded-xl border-l-4 px-3.5 py-2.5 ring-1 ring-linea', past && 'opacity-55', current ? 'bg-superficie shadow-md' : o ? 'bg-superficie' : 'border-dashed bg-papel')}
                        style={{ borderLeftColor: color, backgroundImage: o ? `linear-gradient(90deg, ${color}${current ? '2e' : '18'}, transparent 70%)` : undefined, boxShadow: current ? `0 0 0 2px ${color}` : undefined }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="cifras text-xs font-bold text-texto-suave">{b.starts_at} – {b.ends_at}</p>
                          {current && <span className="inline-flex items-center gap-1 rounded bg-chispa px-1.5 text-[10px] font-bold uppercase text-[#102442]"><span className="rec-dot h-1.5 w-1.5 rounded-full bg-rojo" />Ahora</span>}
                        </div>
                        {o
                          ? <p className="font-bold leading-snug text-texto">{o.subject.name}</p>
                          : <p className="flex items-center gap-1.5 font-slab text-sm font-extrabold uppercase tracking-wide text-texto-suave"><Bell className="h-3.5 w-3.5" aria-hidden />{b.label}</p>}
                        {teacher && <p className="text-xs text-texto-suave">{teacher}</p>}
                        {current && (
                          <div className="mt-2">
                            <div className="h-1.5 overflow-hidden rounded-full bg-papel" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la clase">
                              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: color, transition: 'width 1s var(--ease-out)' }} />
                            </div>
                            <p className="mt-1 text-xs font-semibold text-texto-suave">Faltan {span(end - now.minutes)}</p>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>

          <div className="space-y-5">
            {next && next.offerings.length > 0 && (
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-texto"><BookOpen className="h-4 w-4 text-texto-suave" aria-hidden />{next.label} toca</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {next.offerings.map((o, i) => (
                    <li key={o.id} className="exp-rise inline-flex items-center gap-1.5 rounded-full border border-linea bg-superficie px-3 py-1 text-[13px] font-semibold text-texto" style={{ animationDelay: `${i * 60}ms` }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.subject.color }} aria-hidden />{o.subject.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-texto">Para entregar pronto</p>
              {soon.length === 0 ? (
                <p className="mt-1.5 text-sm text-texto-suave">No hay tareas por vencer en los próximos días.</p>
              ) : (
                <ul className="mt-1.5 divide-y divide-linea">
                  {soon.map((t) => {
                    const due = relativeDue(t.due_at)
                    return (
                      <li key={t.id}>
                        <Link to={`/tarea/${t.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-tinta">
                          <span className="min-w-0"><span className="block truncate font-semibold text-texto">{t.title}</span><span className="text-texto-suave">{t.course}</span></span>
                          <span className={cn('shrink-0 text-xs font-bold', due.tone === 'overdue' ? 'text-estado-alerta' : due.tone === 'soon' ? 'text-estado-tarde' : 'text-texto-suave')}>{due.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function Banner({ icon, text, tone }: { icon: React.ReactNode; text: string; tone?: 'ok' }) {
  return (
    <p className={cn('flex items-center gap-2.5 rounded-xl p-3.5 text-[15px] font-semibold', tone === 'ok' ? 'bg-estado-ok/10 text-estado-ok' : 'bg-papel text-texto')}>
      {icon}{text}
    </p>
  )
}
