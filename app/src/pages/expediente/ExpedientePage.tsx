import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, FileSignature, Info, Printer, Sparkles as SparklesIcon, Trophy, Wallet } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader, Panel } from '@/components/ui'
import { TESLA_ICONS } from '@/components/tesla'
import { formatDay, formatShort, formatTime, limaToday, relativeDue } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { listMyPensions } from '@/services/campus'
import { PART_HELP, bandOf, firstName, getExpediente, getHistory, peekRankUp, rememberBand, trendOf, type Expediente, type PartKey, type ScorePart } from '@/services/expediente'
import { isMissingFunction } from '@/services/integridad'
import { AreaBars, AreaRadar, AreaTable, AttendanceYear, MiniRing, ScoreRing, Sparkles, TrendChart, TrendNote } from './widgets'
import { IndexHistory } from './Historial'
import { TodayAtSchool } from './Hoy'
import { HowToRise } from './Simulador'

type Loaded = { data: Expediente } | { missing: true }

const ROMAN = ['I', 'II', 'III', 'IV']

function Card({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <div className={cn('exp-rise exp-card', className)} style={{ animationDelay: `${delay}ms` }}>{children}</div>
}

// ---------------------------------------------------------------------------
// Cómo se calculó el índice (se abre al tocar el círculo o un anillo)
// ---------------------------------------------------------------------------
function ScoreDetail({ parts, selected }: { parts: ScorePart[]; selected: PartKey | 'all' }) {
  const total = parts.reduce((a, p) => a + p.weight, 0)
  const one = selected === 'all' ? null : parts.find((p) => p.key === selected)
  const band = bandOf(one ? one.value : null)
  return (
    <div key={selected} className="exp-detail rounded-xl bg-papel p-4 sm:p-5" style={{ ['--b1' as string]: one ? band.from : 'rgb(var(--tinta-500))' }}>
      {one ? (
        <>
          <p className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold text-texto">
            {one.label}: {one.value}/100 <Badge tone="info">pesa {Math.round((one.weight / total) * 100)} % del índice</Badge>
          </p>
          <p className="mt-1.5 text-sm font-semibold text-texto">{one.detail}.</p>
          <p className="mt-2 text-sm text-texto-suave">{PART_HELP[one.key]}</p>
        </>
      ) : (
        <>
          <p className="font-display text-lg font-semibold text-texto">Así se arma el Índice Tesla</p>
          <p className="mt-1 text-sm text-texto-suave">Es el promedio de estas partes, según cuánto pesa cada una. Toca un anillo para ver su detalle.</p>
          <ul className="mt-3 space-y-2.5">
            {parts.map((p) => {
              const b = bandOf(p.value)
              return (
                <li key={p.key} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-texto">{p.label} <span className="font-normal text-texto-suave">· pesa {Math.round((p.weight / total) * 100)} %</span></span>
                    <span className="cifras font-bold text-texto">{p.value}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-superficie">
                    <div className="h-full rounded-full" style={{ width: `${p.value}%`, background: `linear-gradient(90deg, ${b.from}, ${b.to})`, transition: 'width 1s var(--ease-out)' }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lo que merece atención, dicho con calma
// ---------------------------------------------------------------------------
type Attention = { tone: 'late' | 'info' | 'ok'; text: string; to?: string; cta?: string }

function attentionItems(e: Expediente, name: string): Attention[] {
  const items: Attention[] = []
  const f = e.family
  if (f.circulars_to_answer > 0) items.push({ tone: 'late', text: `${f.circulars_to_answer === 1 ? 'Un comunicado espera' : `${f.circulars_to_answer} comunicados esperan`} su respuesta o su firma.`, to: '/comunicados', cta: 'Responder' })
  if (e.tasks.missing > 0) items.push({ tone: 'late', text: `${name} tiene ${e.tasks.missing === 1 ? 'una tarea vencida' : `${e.tasks.missing} tareas vencidas`} sin entregar.`, to: '/tareas', cta: 'Ver tareas' })
  if (e.signals.late_14d >= 2) items.push({ tone: 'info', text: `${name} llegó tarde ${e.signals.late_14d} veces en las últimas dos semanas. Si hay un motivo, pueden enviar una justificación.`, to: '/justificaciones', cta: 'Justificar' })
  if (e.signals.low_30d >= 2) items.push({ tone: 'info', text: `${e.signals.low_30d} de sus tareas recientes quedaron «en proceso». Puede ser un buen momento para repasar juntos.`, to: '/mensajes', cta: 'Hablar con el docente' })
  if (f.circulars_unread > 0 && f.circulars_to_answer === 0) items.push({ tone: 'info', text: `${f.circulars_unread === 1 ? 'Tienen un comunicado' : `Tienen ${f.circulars_unread} comunicados`} sin leer.`, to: '/comunicados', cta: 'Leer' })
  if (f.justifications_pending > 0) items.push({ tone: 'info', text: `${f.justifications_pending === 1 ? 'Una justificación enviada' : `${f.justifications_pending} justificaciones enviadas`} esperan la revisión del colegio.`, to: '/justificaciones', cta: 'Ver estado' })
  for (const a of f.appointments) items.push({ tone: 'ok', text: `Cita con ${a.teacher ?? 'el docente'}: ${formatDay(a.starts_at)}, ${formatTime(a.starts_at)}.`, to: '/citas', cta: 'Ver cita' })
  return items
}

function AttentionList({ items }: { items: Attention[] }) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2.5 rounded-xl bg-estado-ok/10 p-4 font-semibold text-estado-ok">
        <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />Todo está al día. No hay nada pendiente por ahora.
      </p>
    )
  }
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => {
        const Icon = it.tone === 'late' ? AlertCircle : it.tone === 'ok' ? CalendarClock : Info
        return (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-linea bg-superficie p-3.5">
            <Icon className={cn('h-5 w-5 shrink-0', it.tone === 'late' ? 'text-estado-tarde' : it.tone === 'ok' ? 'text-estado-ok' : 'text-estado-info')} aria-hidden />
            <span className="min-w-0 flex-1 text-[15px] text-texto">{it.text}</span>
            {it.to && <Link to={it.to} className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-tinta underline dark:text-tinta-ink print:hidden">{it.cta}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------
function TaskList({ title, items, empty }: { title: string; items: Expediente['tasks']['pending']; empty: string }) {
  return (
    <div>
      <p className="text-sm font-bold text-texto">{title}</p>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-texto-suave">{empty}</p>
      ) : (
        <ul className="mt-1.5 divide-y divide-linea">
          {items.map((t) => {
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
  )
}

function Counts({ items }: { items: { label: string; value: number; tone: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {items.map((c) => (
        <div key={c.label} className="rounded-xl bg-papel p-3 text-center">
          <p className={cn('cifras font-display text-2xl font-bold', c.tone)}>{c.value}</p>
          <p className="text-xs font-semibold text-texto-suave">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------
function Retrato({ e }: { e: Expediente }) {
  const [selected, setSelected] = useState<PartKey | 'all'>('all')
  const today = limaToday()
  const name = firstName(e.student.first_name)
  const value = e.score.value
  const band = bandOf(value)
  const child = useFocusStudent()
  const history = useAsync(() => getHistory(e.student.id), [e.student.id], { live: false })
  // ¿Subió de rango desde la última vez? Se celebra y se recuerda unos segundos después.
  const rankUp = useMemo(() => (value != null ? peekRankUp(e.student.id, band) : null), [e.student.id, band.id, value])
  useEffect(() => {
    if (value == null) return
    if (!rankUp) { rememberBand(e.student.id, band); return }
    const t = window.setTimeout(() => rememberBand(e.student.id, band), 6000)
    return () => window.clearTimeout(t)
  }, [e.student.id, band.id, value, rankUp])
  const pensions = useAsync(async () => {
    try { return await listMyPensions(e.year ?? Number(today.slice(0, 4))) } catch { return [] }
  }, [e.student.id])
  const dueNow = (pensions.data ?? []).filter((p) => !p.paid && p.due_date && p.due_date <= today)
  const trend = trendOf(e.grades.current, e.grades.previous)
  const publishedNumbers = e.grades.periods.map((p) => p.number)
  const items = attentionItems(e, name)
  const att = e.attendance
  const attRate = att.school_days - att.justified > 0 ? Math.round(((att.on_time + att.late) / (att.school_days - att.justified)) * 100) : null
  const tesla = e.tesla
  const levelSpan = tesla ? Math.max(1, tesla.next_level_xp - tesla.level_xp) : 1
  const levelPct = tesla ? Math.min(100, Math.max(0, ((tesla.xp - tesla.level_xp) / levelSpan) * 100)) : 0

  return (
    <div className="space-y-6">
      {/* Portada: el círculo del Índice Tesla */}
      <Card>
        <section className="exp-hero relative overflow-hidden rounded-3xl border border-linea p-5 sm:p-8" style={{ ['--b1' as string]: band.from, ['--b2' as string]: band.to }}>
          {rankUp && <Sparkles band={band} />}
          <div className="relative grid items-center gap-8 md:grid-cols-[19rem_1fr]">
            {value != null ? (
              <ScoreRing value={value} band={band} active={selected === 'all'} onClick={() => setSelected('all')} />
            ) : (
              <div className="mx-auto flex aspect-square w-full max-w-[19rem] items-center justify-center rounded-full border-2 border-dashed border-linea text-center text-sm text-texto-suave">Aún sin datos</div>
            )}
            <div className="min-w-0">
              <p className="lema text-xs text-rojo">Retrato Tesla</p>
              <h2 className="mt-1 font-display text-3xl font-bold leading-tight text-texto sm:text-4xl">{[e.student.first_name, e.student.last_name].filter(Boolean).join(' ') || name}</h2>
              <p className="mt-1 text-texto-suave">{e.student.classroom}{e.student.tutor ? ` · Tutor(a): ${e.student.tutor}` : ''}</p>
              {rankUp && (
                <p className="exp-chip-fast mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold text-white exp-chip" style={{ background: `linear-gradient(90deg, ${band.from}, ${band.to})` }}>
                  <Trophy className="h-4 w-4" aria-hidden />¡{name} subió a {band.label}!
                </p>
              )}
              {value != null ? (
                <p className="mt-4 font-display text-xl font-semibold text-texto">{band.phrase(name)}</p>
              ) : (
                <p className="mt-4 text-texto">Todavía no hay suficientes datos del año para calcular el índice. Aparecerá apenas haya tareas, asistencia o notas publicadas.</p>
              )}
              <p className="mt-3 inline-flex items-start gap-2 rounded-lg bg-papel px-3 py-2 text-[13px] text-texto-suave">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span><b className="text-texto">Referencial, no oficial.</b> Es una guía para conversar en casa; no reemplaza la libreta ni las notas del colegio.</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5 print:hidden">
                <Button onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir o guardar PDF</Button>
                <Link to="/libreta" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-linea bg-superficie px-4 text-sm font-bold text-texto hover:bg-papel">Ver libreta<ArrowRight className="h-4 w-4" aria-hidden /></Link>
              </div>
              <p className="mt-3 text-xs text-texto-suave">Actualizado hoy a las {formatTime(e.generated_at)}</p>
            </div>
          </div>
        </section>
      </Card>

      {/* Las cuatro partes del índice */}
      {e.score.parts.length > 0 && (
        <Card delay={80}>
          <div className={cn('grid gap-3', e.score.parts.length >= 4 ? 'grid-cols-2 md:grid-cols-4' : e.score.parts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {e.score.parts.map((p, i) => <MiniRing key={p.key} part={p} index={i} selected={selected === p.key} onClick={() => setSelected(selected === p.key ? 'all' : p.key)} />)}
          </div>
          <div className="mt-3"><ScoreDetail parts={e.score.parts} selected={selected} /></div>
        </Card>
      )}

      {/* ¿Cómo subir el índice? */}
      <Card delay={110}><HowToRise e={e} name={name} /></Card>

      {/* Lo que merece atención y la evolución del índice */}
      <Card delay={140}>
        <div className={cn('grid gap-6 [&>*]:min-w-0', history.data && 'lg:grid-cols-2')}>
          <Panel title="Para tener presente">
            <AttentionList items={items} />
          </Panel>
          {history.data && history.data.length > 0 && <IndexHistory history={history.data} />}
        </div>
      </Card>

      {/* Hoy en el colegio */}
      <Card delay={170}>
        <TodayAtSchool classroomId={child?.classroom_id ?? null} pending={e.tasks.pending} todayIso={today} isHoliday={e.attendance.holidays.includes(today)} />
      </Card>

      {/* Rendimiento */}
      <Card delay={200}>
        <Panel title="Rendimiento por áreas" action={trend ? <span className="hidden sm:block"><TrendNote {...trend} /></span> : undefined}>
          {e.grades.areas.length === 0 ? (
            <div className="space-y-2 text-[15px] text-texto-suave">
              <p>Dirección aún no publicó ningún bimestre, por eso todavía no se muestran los niveles por área.</p>
              {e.grades.graded_avg != null && <p>Mientras tanto, el índice usa el promedio de las tareas ya calificadas ({Math.round(e.grades.graded_avg)}/100).</p>}
            </div>
          ) : (
            <div className="space-y-6">
              {trend && <div className="sm:hidden"><TrendNote {...trend} /></div>}
              <div className="grid items-center gap-6 lg:grid-cols-2 [&>*]:min-w-0">
                {e.grades.areas.length >= 3 ? <AreaRadar areas={e.grades.areas} /> : <AreaBars areas={e.grades.areas} />}
                <div className="space-y-5">
                  {e.grades.periods.length > 0 && <TrendChart periods={e.grades.periods} />}
                  <p className="text-xs text-texto-suave">Solo se comparan los bimestres del propio {name}. Los niveles son AD (destacado), A (esperado), B (en proceso) y C (inicio).</p>
                </div>
              </div>
              <AreaTable areas={e.grades.areas} periodNumbers={publishedNumbers} />
            </div>
          )}
        </Panel>
      </Card>

      {/* Asistencia */}
      <Card delay={260}>
        <Panel title="Asistencia y puntualidad">
          {att.school_days === 0 ? (
            <p className="text-[15px] text-texto-suave">Todavía no hay días de clase registrados este año.</p>
          ) : (
            <div className="space-y-5">
              <Counts items={[
                { label: 'Puntual', value: att.on_time, tone: 'text-estado-ok' },
                { label: 'Tardanzas', value: att.late, tone: 'text-estado-tarde' },
                { label: 'Sin registro', value: att.absent, tone: 'text-texto-suave' },
              ]} />
              {attRate != null && <p className="text-sm text-texto-suave"><b className="text-texto">{attRate} %</b> de los {att.school_days - att.justified} días de clase con ingreso registrado{att.justified > 0 ? ` (${att.justified} falta${att.justified === 1 ? '' : 's'} justificada${att.justified === 1 ? '' : 's'} no cuenta${att.justified === 1 ? '' : 'n'})` : ''}. Un día sin registro no siempre es una falta.</p>}
              <AttendanceYear data={att} today={today} />
            </div>
          )}
        </Panel>
      </Card>

      {/* Tareas */}
      <Card delay={320}>
        <Panel title="Tareas del año" action={<Link to="/tareas" className="text-sm font-bold text-tinta underline dark:text-tinta-ink print:hidden">Ver todas</Link>}>
          <div className="space-y-5">
            <Counts items={[
              { label: 'A tiempo', value: e.tasks.on_time, tone: 'text-estado-ok' },
              { label: 'Con retraso', value: e.tasks.late, tone: 'text-estado-tarde' },
              { label: 'Sin entregar', value: e.tasks.missing, tone: e.tasks.missing ? 'text-estado-alerta' : 'text-texto-suave' },
            ]} />
            <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
              <TaskList title="Próximas a vencer" items={e.tasks.pending} empty="No hay tareas por entregar." />
              <TaskList title="Vencidas sin entregar" items={e.tasks.overdue} empty="Ninguna. ¡Muy bien!" />
            </div>
          </div>
        </Panel>
      </Card>

      {/* Perfil Tesla */}
      {tesla && (
        <Card delay={380}>
          <Panel title="Perfil Tesla" action={<Link to="/perfil-tesla" className="text-sm font-bold text-tinta underline dark:text-tinta-ink print:hidden">Abrir perfil</Link>}>
            <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
              <div>
                <div className="flex items-end justify-between">
                  <p className="font-display text-3xl font-bold text-texto">Nivel {tesla.level}</p>
                  <p className="text-sm font-semibold text-texto-suave">{tesla.xp.toLocaleString('es-PE')} XP</p>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-papel" role="progressbar" aria-valuenow={Math.round(levelPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance al siguiente nivel">
                  <div className="h-full rounded-full" style={{ width: `${levelPct}%`, background: 'linear-gradient(90deg, #F2B51C, #FF7A3D)', transition: 'width 1.2s var(--ease-out)' }} />
                </div>
                <p className="mt-1.5 text-xs text-texto-suave">Faltan {Math.max(0, tesla.next_level_xp - tesla.xp).toLocaleString('es-PE')} XP para el nivel {tesla.level + 1}</p>
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  <div className="rounded-xl bg-papel p-3 text-center"><p className="cifras font-display text-xl font-bold text-texto">{tesla.streak}</p><p className="text-xs font-semibold text-texto-suave">Racha de tareas</p></div>
                  <div className="rounded-xl bg-papel p-3 text-center"><p className="cifras font-display text-xl font-bold text-texto">{tesla.achievements}</p><p className="text-xs font-semibold text-texto-suave">Logros</p></div>
                  <div className="rounded-xl bg-papel p-3 text-center"><p className="cifras font-display text-xl font-bold text-texto">{tesla.xp30}</p><p className="text-xs font-semibold text-texto-suave">XP en 30 días</p></div>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-texto">Logros recientes</p>
                {tesla.recent.length === 0 ? (
                  <p className="mt-1.5 text-sm text-texto-suave">Todavía no hay logros. Cada tarea a tiempo suma.</p>
                ) : (
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {tesla.recent.map((a, i) => {
                      const Icon = TESLA_ICONS[a.icon] ?? SparklesIcon
                      return (
                        <li key={i} className="flex items-center gap-3 rounded-xl border border-linea p-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chispa/20 text-chispa-ink"><Icon className="h-5 w-5" aria-hidden /></span>
                          <span className="min-w-0"><span className="block truncate text-sm font-bold text-texto">{a.name}</span><span className="text-xs text-texto-suave">{formatShort(a.earned_at)}</span></span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </Panel>
        </Card>
      )}

      {/* Familia: comunicados, calendario y pensiones */}
      <Card delay={440}>
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <Panel title="Próximos días" bodyClassName="p-0">
            {e.family.events.length === 0 ? (
              <p className="p-5 text-[15px] text-texto-suave">No hay exámenes ni actividades en las próximas tres semanas.</p>
            ) : (
              <ul className="divide-y divide-linea">
                {e.family.events.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-papel text-center leading-none"><span className="cifras text-base font-bold text-texto">{Number(ev.starts_on.slice(8))}</span><span className="text-[10px] font-bold uppercase text-texto-suave">{formatShort(ev.starts_on).split(' ').pop()}</span></span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-texto">{ev.title}</span>
                    {ev.kind === 'EXAM' && <Badge tone="late">Examen</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Comunicados y pagos">
            <div className="space-y-4">
              {e.family.circulars.length === 0 ? (
                <p className="flex items-center gap-2 text-[15px] text-texto-suave"><CheckCircle2 className="h-5 w-5 text-estado-ok" aria-hidden />Sin comunicados pendientes.</p>
              ) : (
                <ul className="space-y-2">
                  {e.family.circulars.slice(0, 4).map((c) => (
                    <li key={c.id}>
                      <Link to={`/comunicados/${c.id}`} className="flex items-center gap-2.5 text-[15px] hover:text-tinta">
                        <FileSignature className="h-4 w-4 shrink-0 text-texto-suave" aria-hidden />
                        <span className="min-w-0 flex-1 truncate font-semibold text-texto">{c.title}</span>
                        {c.needs_answer ? <Badge tone="late">Responder</Badge> : <Badge tone="info">Sin leer</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {(pensions.data ?? []).length > 0 && (
                <p className={cn('flex items-center gap-2 rounded-xl p-3 text-sm font-semibold', dueNow.length ? 'bg-estado-tarde/10 text-estado-tarde' : 'bg-estado-ok/10 text-estado-ok')}>
                  <Wallet className="h-4 w-4 shrink-0" aria-hidden />
                  {dueNow.length ? `${dueNow.length === 1 ? 'Una cuota vencida' : `${dueNow.length} cuotas vencidas`} de pensión.` : 'Pensiones al día.'}
                </p>
              )}
            </div>
          </Panel>
        </div>
      </Card>

      <p className="pb-2 text-center text-xs text-texto-suave">
        Retrato Tesla se arma con los datos del campus y de Tesla Control Escolar. El Índice Tesla es una guía; las notas oficiales son las de la libreta.
        {e.periods.length > 0 && <> Bimestres publicados: {e.periods.filter((p) => p.is_published).map((p) => ROMAN[p.number - 1]).join(', ') || 'ninguno todavía'}.</>}
      </p>
    </div>
  )
}

export default function ExpedientePage() {
  const { children } = useAuth()
  const child = useFocusStudent()
  const { data, loading, error, reload } = useAsync<Loaded | null>(async () => {
    if (!child) return null
    try {
      return { data: await getExpediente(child.id) }
    } catch (err) {
      if (isMissingFunction(err)) return { missing: true as const }
      throw err
    }
  }, [child?.id])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Retrato Tesla" subtitle={child ? `El expediente de ${firstName(child.first_name)}, en un vistazo.` : 'El expediente de tu hijo, en un vistazo.'} />
      {!child && children.length === 0 ? (
        <Empty title="Aún no hay un hijo vinculado a tu cuenta">Cuando el colegio vincule a tu hijo, aquí aparecerá su expediente.</Empty>
      ) : loading && !data ? (
        <Loading shape="page" />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => void reload()} />
      ) : data && 'missing' in data ? (
        <Empty title="El Retrato Tesla todavía no está activado">La dirección del colegio debe ejecutar el script 25 en la base de datos para activarlo.</Empty>
      ) : data ? (
        <Retrato e={data.data} />
      ) : null}
    </div>
  )
}
