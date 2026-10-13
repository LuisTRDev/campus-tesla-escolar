import { useMemo, useState, type FormEvent } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Select } from '@/components/ui'
import { courseCode } from '@/components/course'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { classroomLabel, listClassroomOfferings, listClassrooms, listTeacherOfferings } from '@/services/campus'
import { copyDay, createBlock, deleteBlock, listSchedule } from '@/services/calendario'
import { useHorizontalSwipe } from '@/lib/useSwipe'
import { WEEKDAY_LABELS, type Classroom, type Offering, type ScheduleBlock } from '@/types'

const MY_SCHEDULE = 'mine'

function nowInLima(): { weekday: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '') + 1
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00'
  return { weekday, time: `${h === '24' ? '00' : h}:${parts.find((p) => p.type === 'minute')?.value ?? '00'}` }
}

function BlockCard({ block, offering, showClassroom, isNow, onDelete }: {
  block: ScheduleBlock
  offering?: Offering
  showClassroom?: boolean
  isNow: boolean
  onDelete?: () => void
}) {
  const color = offering?.subject.color ?? '#9AA8BC'
  return (
    <div
      className={cn('group relative rounded-lg border-l-4 bg-superficie px-3 py-2 ring-1 ring-linea', isNow && 'ring-2 ring-chispa', !offering && 'bg-papel')}
      style={{ borderLeftColor: color }}
    >
      <p className="text-xs font-bold text-texto-suave">{block.starts_at} – {block.ends_at}</p>
      <p className="font-bold leading-snug">{offering ? offering.subject.name : block.label}</p>
      {offering && block.label && <p className="text-xs text-texto-suave">{block.label}</p>}
      {showClassroom && offering && <p className="text-xs text-texto-suave">{classroomLabel(offering.classroom)}</p>}
      {isNow && <span className="absolute right-2 top-2 rounded bg-chispa px-1.5 text-[10px] font-bold text-tinta">Ahora</span>}
      {onDelete && (
        <button onClick={onDelete} className="absolute bottom-1.5 right-1.5 rounded p-1 text-texto-suave opacity-0 hover:text-estado-alerta focus:opacity-100 group-hover:opacity-100" aria-label="Quitar bloque">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function NewBlockForm({ classroomId, offerings, onDone }: { classroomId: number; offerings: Offering[]; onDone: () => void }) {
  const toast = useToast()
  const [weekday, setWeekday] = useState(1)
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('08:45')
  const [offeringId, setOfferingId] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await createBlock({ classroom_id: classroomId, weekday, starts_at: start, ends_at: end, offering_id: Number(offeringId) || null, label })
      toast('Bloque agregado.')
      // Deja el formulario listo para el siguiente bloque del mismo día.
      setStart(end)
      const [h, m] = end.split(':').map(Number)
      const next = h * 60 + m + 45
      setEnd(`${String(Math.floor(next / 60) % 24).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`)
      setOfferingId('')
      setLabel('')
      onDone()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Día">
          <Select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{WEEKDAY_LABELS[d]}</option>)}
          </Select>
        </Field>
        <Field label="Desde"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Hasta"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
      </div>
      <Field label="Curso">
        <Select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
          <option value="">Ninguno (recreo, tutoría, formación…)</option>
          {offerings.map((o) => <option key={o.id} value={o.id}>{o.subject.name}</option>)}
        </Select>
      </Field>
      <Field label={offeringId ? 'Nota' : 'Actividad'} hint={offeringId ? 'Opcional. Por ejemplo: Laboratorio, Aula de cómputo.' : 'Por ejemplo: Recreo, Tutoría, Formación.'}>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required={!offeringId} />
      </Field>
      <div className="flex justify-end"><Button type="submit" loading={busy}><Plus className="h-4 w-4" />Agregar bloque</Button></div>
    </form>
  )
}

export default function SchedulePage() {
  const { profile, isAdmin, tutorClassrooms } = useAuth()
  const focus = useFocusStudent()
  const toast = useToast()
  const isFamily = profile?.role === 'STUDENT' || profile?.role === 'GUARDIAN'
  const isTeacher = profile?.role === 'TEACHER'
  const now = nowInLima()
  const [mobileDay, setMobileDay] = useState(String(now.weekday >= 1 && now.weekday <= 5 ? now.weekday : 1))
  const [adding, setAdding] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const daySwipe = useHorizontalSwipe(
    () => setMobileDay((d) => String(Math.min(Number(d) + 1, 6))),
    () => setMobileDay((d) => String(Math.max(Number(d) - 1, 1))),
  )

  const rooms = useAsync(async () => {
    if (isFamily) return { classrooms: [] as Classroom[], teacherOfferings: [] as Offering[] }
    if (isTeacher) {
      const teacherOfferings = await listTeacherOfferings(profile!.id)
      const map = new Map<number, Classroom>()
      for (const o of teacherOfferings) map.set(o.classroom.id, o.classroom)
      for (const c of tutorClassrooms) map.set(c.id, c)
      return { classrooms: [...map.values()], teacherOfferings }
    }
    return { classrooms: await listClassrooms(), teacherOfferings: [] as Offering[] }
  }, [isFamily, isTeacher, profile?.id])

  const [choice, setChoice] = useState<string>(isTeacher ? MY_SCHEDULE : '')
  const classroomId = isFamily ? focus?.classroom_id ?? null : choice === MY_SCHEDULE ? null : Number(choice) || rooms.data?.classrooms[0]?.id || null
  const mine = isTeacher && choice === MY_SCHEDULE

  const schedule = useAsync(async () => {
    if (mine) {
      const offerings = rooms.data?.teacherOfferings ?? []
      const blocks = await listSchedule(offerings.map((o) => o.classroom_id))
      const ids = new Set(offerings.map((o) => o.id))
      return { blocks: blocks.filter((b) => b.offering_id && ids.has(b.offering_id)), offerings }
    }
    if (!classroomId) return { blocks: [] as ScheduleBlock[], offerings: [] as Offering[] }
    const [blocks, offerings] = await Promise.all([listSchedule([classroomId]), listClassroomOfferings(classroomId)])
    return { blocks, offerings }
  }, [mine, classroomId, rooms.data])

  const blocks = schedule.data?.blocks ?? []
  const byOffering = useMemo(() => new Map((schedule.data?.offerings ?? []).map((o) => [o.id, o])), [schedule.data])
  const days = blocks.some((b) => b.weekday === 6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]
  const canEdit = isAdmin && !mine && !!classroomId

  async function remove(b: ScheduleBlock) {
    const undo = schedule.mutate((cur) => cur && { ...cur, blocks: cur.blocks.filter((x) => x.id !== b.id) })
    try {
      await deleteBlock(b.id)
    } catch (err) {
      undo()
      toast(toMessage(err), 'error')
    }
  }

  const dayColumn = (d: number) => {
    const list = blocks.filter((b) => b.weekday === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    return list.length === 0 ? <p className="py-4 text-center text-sm text-texto-suave">Sin clases</p> : (
      <div className="space-y-2">
        {list.map((b) => (
          <BlockCard
            key={b.id}
            block={b}
            offering={b.offering_id ? byOffering.get(b.offering_id) : undefined}
            showClassroom={mine}
            isNow={d === now.weekday && b.starts_at <= now.time && now.time < b.ends_at}
            onDelete={canEdit ? () => void remove(b) : undefined}
          />
        ))}
      </div>
    )
  }

  const classroom = rooms.data?.classrooms.find((c) => c.id === classroomId) ?? (isFamily ? focus?.classroom : null)

  return (
    <>
      <PageHeader
        title="Horario"
        subtitle={mine ? 'Tus clases de la semana en todas tus aulas.' : classroom ? classroomLabel(classroom) : undefined}
        action={canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setCopyOpen(true)}><Copy className="h-4 w-4" />Copiar un día</Button>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Agregar bloque</Button>
          </div>
        )}
      />

      {!isFamily && (
        <div className="mb-6 max-w-sm">
          <Field label="Ver">
            <Select value={mine ? MY_SCHEDULE : String(classroomId ?? '')} onChange={(e) => setChoice(e.target.value)}>
              {isTeacher && <option value={MY_SCHEDULE}>Mi horario</option>}
              {(rooms.data?.classrooms ?? []).map((c) => <option key={c.id} value={c.id}>Aula {classroomLabel(c)}</option>)}
            </Select>
          </Field>
        </div>
      )}

      {(rooms.error || schedule.error) && <ErrorBox message={rooms.error || schedule.error} onRetry={() => { void rooms.reload(); void schedule.reload() }} />}
      {rooms.loading || schedule.loading ? <Loading shape="cards" rows={5} /> : blocks.length === 0 ? (
        <Empty title="Todavía no hay horario cargado" art="calendar">{canEdit ? 'Agrega los bloques del lunes y luego usa “Copiar un día” para el resto de la semana.' : 'Dirección publicará el horario del aula.'}</Empty>
      ) : (
        <>
          {/* Móvil: un día a la vez */}
          <div className="lg:hidden">
            <div className="mb-4 overflow-x-auto">
              <Segmented value={mobileDay} onChange={setMobileDay} options={days.map((d) => ({ value: String(d), label: WEEKDAY_LABELS[d].slice(0, 3) }))} />
            </div>
            <div key={mobileDay} className="page-in min-h-40 touch-pan-y" {...daySwipe}>{dayColumn(Number(mobileDay))}</div>
          </div>
          {/* Escritorio: la semana completa */}
          <div className={cn('hidden gap-3 lg:grid', days.length === 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-5')}>
            {days.map((d) => (
              <Panel key={d} title={<span className={cn(d === now.weekday && 'text-tinta-500')}>{WEEKDAY_LABELS[d]}</span>} bodyClassName="p-2">
                {dayColumn(d)}
              </Panel>
            ))}
          </div>
          {!mine && (
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-texto-suave">
              {(schedule.data?.offerings ?? []).map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.subject.color }} />{courseCode(o)} {o.subject.name}</span>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Agregar bloque">
        {adding && classroomId && <NewBlockForm classroomId={classroomId} offerings={schedule.data?.offerings ?? []} onDone={() => void schedule.reload(true)} />}
      </Modal>
      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="Copiar un día">
        {copyOpen && classroomId && <CopyDayForm classroomId={classroomId} blocks={blocks} onDone={() => { setCopyOpen(false); void schedule.reload(true) }} />}
      </Modal>
    </>
  )
}

function CopyDayForm({ classroomId, blocks, onDone }: { classroomId: number; blocks: ScheduleBlock[]; onDone: () => void }) {
  const toast = useToast()
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState<number[]>([2, 3, 4, 5])
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!to.length) return
    if (!confirm('Los días de destino se reemplazarán por completo. ¿Continuar?')) return
    setBusy(true)
    try {
      await copyDay(classroomId, from, to.filter((d) => d !== from), blocks)
      toast('Horario copiado. Ahora cambia los cursos de cada día.')
      onDone()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-texto-suave">Copia las horas y bloques de un día a otros. Útil cuando todos los días tienen la misma estructura de horas y recreos.</p>
      <Field label="Copiar el">
        <Select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{WEEKDAY_LABELS[d]}</option>)}
        </Select>
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">A estos días</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].filter((d) => d !== from).map((d) => (
            <label key={d} className={cn('cursor-pointer rounded-lg border px-3 py-2 text-sm font-bold', to.includes(d) ? 'border-tinta bg-tinta text-white' : 'border-linea text-texto-suave')}>
              <input type="checkbox" className="sr-only" checked={to.includes(d)} onChange={(e) => setTo((x) => e.target.checked ? [...x, d] : x.filter((y) => y !== d))} />
              {WEEKDAY_LABELS[d].slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end"><Button onClick={() => void run()} loading={busy}><Copy className="h-4 w-4" />Copiar</Button></div>
    </div>
  )
}
