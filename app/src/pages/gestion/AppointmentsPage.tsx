import { useState, type FormEvent } from 'react'
import { CalendarCheck, CalendarPlus, Check, MapPin, Phone, Plus, Trash2, Video, X } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Select, Textarea } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatDay, formatTime, isoDay, limaToday } from '@/lib/format'
import { downloadIcs } from '@/lib/ux'
import {
  MODE_LABEL, appointmentOptions, bookAppointment, cancelAppointment, createSlots, deleteSlot, listMySlots, markAppointmentDone, myAppointments,
  type Appointment, type AppointmentMode, type Slot,
} from '@/services/gestion'

const ModeIcon = ({ mode }: { mode: AppointmentMode }) => (mode === 'VIRTUAL' ? <Video className="h-4 w-4" /> : mode === 'TELEFONO' ? <Phone className="h-4 w-4" /> : <MapPin className="h-4 w-4" />)

function groupByDay<T extends { starts_at: string }>(rows: T[]) {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const d = isoDay(new Date(r.starts_at))
    map.set(d, [...(map.get(d) ?? []), r])
  }
  return [...map.entries()]
}

function addToCalendar(a: Appointment | (Slot & { teacher?: string }), title: string) {
  downloadIcs('cita-campus-tesla', [{ uid: `cita-${a.id}`, title, start: new Date(a.starts_at), end: new Date(a.ends_at), description: a.location ?? MODE_LABEL[a.mode] }])
}

// ---------------------------------------------------------------------------
// Docente
// ---------------------------------------------------------------------------
function TeacherView() {
  const { profile } = useAuth()
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [slots, booked] = await Promise.all([listMySlots(profile!.id), myAppointments()])
    return { slots, booked: booked.filter((b) => b.mine) }
  }, [profile?.id])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ date: limaToday(), from: '15:00', to: '17:00', minutes: 20, mode: 'PRESENCIAL' as AppointmentMode, location: '' })
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const n = await createSlots(form)
      toast(`${n} horario${n === 1 ? '' : 's'} publicado${n === 1 ? '' : 's'}.`)
      setCreating(false)
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />
  const bookedById = new Map(data.booked.map((b) => [b.id, b]))
  const upcoming = data.slots.filter((s) => s.status !== 'CANCELLED' && Date.parse(s.ends_at) > Date.now())

  return (
    <>
      <div className="mb-4"><Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Publicar horarios</Button></div>
      {!upcoming.length ? (
        <Empty title="Sin horarios publicados" art="calendar">Publica bloques libres y las familias de tus alumnos podrán reservar una cita.</Empty>
      ) : (
        <div className="space-y-4">
          {groupByDay(upcoming).map(([day, slots]) => (
            <Panel key={day} title={formatDay(day)}>
              <ul className="divide-y divide-linea">
                {slots.map((s) => {
                  const b = bookedById.get(s.id)
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="w-28 font-bold tabular-nums">{formatTime(s.starts_at)} – {formatTime(s.ends_at)}</span>
                      <span className="flex items-center gap-1 text-sm text-texto-suave"><ModeIcon mode={s.mode} />{s.location || MODE_LABEL[s.mode]}</span>
                      <span className="min-w-0 flex-1">
                        {s.status === 'OPEN' ? <Badge>Libre</Badge> : s.status === 'DONE' ? <Badge tone="ok">Realizada</Badge> : b ? (
                          <span className="text-sm"><b>{b.student}</b> · {b.family}{b.note ? <span className="block text-xs italic text-texto-suave">“{b.note}”</span> : null}</span>
                        ) : <Badge tone="spark">Reservada</Badge>}
                      </span>
                      {s.status === 'OPEN' && (
                        <Button size="sm" variant="ghost" onClick={async () => { await deleteSlot(s.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) }} aria-label="Quitar horario"><Trash2 className="h-4 w-4" /></Button>
                      )}
                      {s.status === 'BOOKED' && (
                        <span className="flex gap-1">
                          {b && <Button size="sm" variant="ghost" onClick={() => addToCalendar(b, `Cita: ${b.student}`)} aria-label="Agregar al calendario"><CalendarPlus className="h-4 w-4" /></Button>}
                          <Button size="sm" variant="secondary" onClick={async () => { await markAppointmentDone(s.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) }}><Check className="h-4 w-4" />Realizada</Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            const reason = prompt('Motivo (la familia lo verá):', 'Tuve un imprevisto. Por favor, reserve otro horario.')
                            if (reason == null) return
                            await cancelAppointment(s.id, reason).then(() => toast('Cita cancelada. Se avisó a la familia.'), (e) => toast(toMessage(e), 'error'))
                            void reload(true)
                          }} aria-label="Cancelar cita"><X className="h-4 w-4" /></Button>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Publicar horarios de atención">
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Día"><Input type="date" min={limaToday()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
            <Field label="Desde"><Input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required /></Field>
            <Field label="Hasta"><Input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} required /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duración de cada cita">
              <Select value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}>
                {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
              </Select>
            </Field>
            <Field label="Modalidad">
              <Select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as AppointmentMode })}>
                {(Object.keys(MODE_LABEL) as AppointmentMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Lugar o enlace" hint="Ej.: Sala de profesores, o el enlace de la videollamada."><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} maxLength={200} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" loading={busy}>Publicar</Button></div>
        </form>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Familia
// ---------------------------------------------------------------------------
function FamilyView() {
  const toast = useToast()
  const child = useFocusStudent()
  const { data, loading, error, reload } = useAsync(async () => {
    if (!child) return null
    const [options, mine] = await Promise.all([appointmentOptions(child.id), myAppointments()])
    return { options, mine: mine.filter((a) => !a.mine && a.status !== 'CANCELLED' && Date.parse(a.ends_at) > Date.now() - 86_400_000) }
  }, [child?.id])
  const [booking, setBooking] = useState<Slot | null>(null)
  const [note, setNote] = useState('')
  const [teacher, setTeacher] = useState('')
  const [busy, setBusy] = useState(false)

  if (!child) return <Empty title="Elige a tu hijo" art="calendar" />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />
  const teachers = [...new Map(data.options.map((o) => [o.teacher_id, o.teacher ?? 'Docente'])).entries()]
  const shown = data.options.filter((o) => !teacher || o.teacher_id === teacher)

  return (
    <div className="space-y-6">
      {data.mine.length > 0 && (
        <Panel title="Tus citas">
          <ul className="divide-y divide-linea">
            {data.mine.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <CalendarCheck className="h-5 w-5 text-estado-ok" />
                <span className="min-w-0 flex-1">
                  <b>{formatDay(a.starts_at)}, {formatTime(a.starts_at)}</b>
                  <span className="block text-sm text-texto-suave">con {a.teacher} · {a.location || MODE_LABEL[a.mode]}</span>
                </span>
                {a.status === 'DONE' ? <Badge tone="ok">Realizada</Badge> : (
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => addToCalendar(a, `Cita con ${a.teacher}`)}><CalendarPlus className="h-4 w-4" />Calendario</Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (!confirm('¿Cancelar esta cita?')) return
                      await cancelAppointment(a.id).then(() => toast('Cita cancelada.'), (e) => toast(toMessage(e), 'error'))
                      void reload(true)
                    }}>Cancelar</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={`Reservar una cita (${child.first_name ?? 'tu hijo'})`} action={teachers.length > 1 && (
        <Select value={teacher} onChange={(e) => setTeacher(e.target.value)} className="w-auto" aria-label="Docente">
          <option value="">Todos los docentes</option>
          {teachers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
      )}>
        {!shown.length ? <Empty title="No hay horarios libres" art="calendar" compact>Cuando los docentes publiquen horarios de atención, aparecerán aquí.</Empty> : (
          <div className="space-y-4">
            {groupByDay(shown).map(([day, slots]) => (
              <div key={day}>
                <p className="mb-2 text-sm font-bold">{formatDay(day)}</p>
                <ul className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <li key={s.id}>
                      <button onClick={() => { setBooking(s); setNote('') }} className="rounded-xl border border-linea px-3 py-2 text-left text-sm hover:border-tinta-500">
                        <b className="tabular-nums">{formatTime(s.starts_at)}</b> <span className="text-texto-suave">· {s.teacher}</span>
                        <span className="flex items-center gap-1 text-xs text-texto-suave"><ModeIcon mode={s.mode} />{MODE_LABEL[s.mode]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Modal open={!!booking} onClose={() => setBooking(null)} title="Confirmar cita">
        {booking && (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              await bookAppointment(booking.id, child.id, note)
              toast('¡Cita reservada! El docente recibió el aviso.')
              setBooking(null)
              void reload(true)
            } catch (err) {
              toast(toMessage(err), 'error')
            } finally {
              setBusy(false)
            }
          }}>
            <p><b>{formatDay(booking.starts_at)}</b>, de {formatTime(booking.starts_at)} a {formatTime(booking.ends_at)}<br />con {booking.teacher} · {booking.location || MODE_LABEL[booking.mode]}</p>
            <Field label="Tema a conversar (opcional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setBooking(null)}>Volver</Button><Button type="submit" loading={busy}>Reservar</Button></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export default function AppointmentsPage() {
  const { profile } = useAuth()
  const family = profile?.role === 'GUARDIAN'
  return (
    <>
      <PageHeader title="Citas" subtitle={family ? 'Reserva una reunión con los docentes de tu hijo.' : 'Publica tus horarios de atención y revisa las reservas.'} />
      {family ? <FamilyView /> : <TeacherView />}
    </>
  )
}
