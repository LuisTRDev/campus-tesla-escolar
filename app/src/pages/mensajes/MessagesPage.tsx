import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Eye, MessageCircle, Plus, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Segmented, Select, Textarea } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { ChatAttachment, ChatComposer, TypingIndicator, useTyping } from '@/components/chat'
import { conversationSeen, uploadMessageFile } from '@/services/comunicacion'
import { CheckCheck } from 'lucide-react'
import { haptic } from '@/lib/ux'
import { supabase } from '@/lib/supabase'
import { formatShort, formatTime, limaToday, isoDay } from '@/lib/format'
import {
  classroomLabel, getPeopleNames, listClassroomOfferings, listClassrooms, listClassroomStudents, listTeacherOfferings, studentName,
} from '@/services/campus'
import {
  DEFAULT_HOURS, adminReadConversation, getConversation, getOfficeHours, hoursLabel, inHours, isUnread, listConversations,
  listMessages, listReads, markConversationRead, ownConversations, saveOfficeHours, sendMessage, startConversation,
} from '@/services/mensajes'
import { WEEKDAY_LABELS, type Classroom, type Conversation, type Message, type OfficeHours } from '@/types'

type Directory = { staff: Record<string, string>; students: Record<number, string> }

async function loadDirectory(conversations: Conversation[]): Promise<Directory> {
  const staff = await getPeopleNames(conversations.map((c) => c.staff_id))
  const ids = [...new Set(conversations.map((c) => c.student_id))]
  const students: Record<number, string> = {}
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from('students').select('id, first_name, last_name').in('id', ids.slice(i, i + 300))
    for (const s of data ?? []) students[s.id] = studentName(s)
  }
  return { staff, students }
}

// ---------------------------------------------------------------------------
// Horario de atención (docente)
// ---------------------------------------------------------------------------
function OfficeHoursForm({ initial, onSaved }: { initial: Omit<OfficeHours, 'profile_id'>; onSaved: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [days, setDays] = useState<number[]>(initial.weekdays)
  const [start, setStart] = useState(initial.starts_at)
  const [end, setEnd] = useState(initial.ends_at)
  const [away, setAway] = useState(initial.away_message ?? '')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await saveOfficeHours(profile!.id, { weekdays: days, starts_at: start, ends_at: end, away_message: away })
      toast('Horario de atención guardado.')
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-texto-suave">Las familias pueden escribirte siempre, pero solo recibirás notificaciones dentro de este horario.</p>
      <fieldset>
        <legend className="mb-1.5 text-sm font-bold">Días</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <label key={d} className={cn('cursor-pointer rounded-lg border px-3 py-2 text-sm font-bold', days.includes(d) ? 'border-tinta bg-tinta text-white' : 'border-linea text-texto-suave')}>
              <input type="checkbox" className="sr-only" checked={days.includes(d)} onChange={(e) => setDays((x) => e.target.checked ? [...x, d].sort() : x.filter((y) => y !== d))} />
              {WEEKDAY_LABELS[d].slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde"><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Hasta"><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
      </div>
      <Field label="Mensaje fuera de horario" hint="Opcional. Lo verán las familias cuando escriban fuera de tu horario.">
        <Textarea value={away} onChange={(e) => setAway(e.target.value)} maxLength={300} className="min-h-20" placeholder="Gracias por escribir. Responderé en mi horario de atención." />
      </Field>
      <div className="flex justify-end"><Button type="submit" loading={busy}>Guardar</Button></div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Nueva conversación
// ---------------------------------------------------------------------------
function NewConversation({ onStarted }: { onStarted: (id: number) => void }) {
  const { profile, children, isAdmin, tutorClassrooms } = useAuth()
  const toast = useToast()
  const isFamily = profile?.role === 'GUARDIAN'
  const [childId, setChildId] = useState(children[0]?.id ?? 0)
  const [staffId, setStaffId] = useState('')
  const [classroomId, setClassroomId] = useState(0)
  const [studentId, setStudentId] = useState(0)
  const [busy, setBusy] = useState(false)
  const child = children.find((c) => c.id === childId)

  // Familia: docentes y tutor del aula del hijo.
  const teachers = useAsync(async () => {
    if (!isFamily || !child?.classroom_id) return []
    const [offerings, room] = await Promise.all([
      listClassroomOfferings(child.classroom_id),
      supabase.from('classrooms').select('tutor_id').eq('id', child.classroom_id).maybeSingle(),
    ])
    const tutorId = (room.data as { tutor_id: string | null } | null)?.tutor_id ?? null
    const names = await getPeopleNames([...offerings.map((o) => o.teacher_id), tutorId])
    const map = new Map<string, string[]>()
    for (const o of offerings) if (o.teacher_id) map.set(o.teacher_id, [...(map.get(o.teacher_id) ?? []), o.subject.name])
    if (tutorId) map.set(tutorId, ['Tutor(a)', ...(map.get(tutorId) ?? [])])
    return [...map.entries()].map(([id, roles]) => ({ id, name: names[id] ?? 'Docente', roles })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [isFamily, child?.classroom_id])

  // Personal: aulas y alumnos.
  const rooms = useAsync(async (): Promise<Classroom[]> => {
    if (isFamily) return []
    if (isAdmin) return listClassrooms()
    const offerings = await listTeacherOfferings(profile!.id)
    const map = new Map<number, Classroom>()
    for (const o of offerings) map.set(o.classroom.id, o.classroom)
    for (const c of tutorClassrooms) map.set(c.id, c)
    return [...map.values()]
  }, [isFamily, isAdmin, profile?.id])
  const roster = useAsync(async () => (classroomId ? listClassroomStudents(classroomId) : []), [classroomId])

  async function start() {
    setBusy(true)
    try {
      const id = isFamily ? await startConversation(childId, staffId) : await startConversation(studentId, profile!.id)
      onStarted(id)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (isFamily) {
    return (
      <div className="space-y-4">
        {children.length > 1 && (
          <Field label="Sobre">
            <Select value={childId} onChange={(e) => { setChildId(Number(e.target.value)); setStaffId('') }}>
              {children.map((c) => <option key={c.id} value={c.id}>{studentName(c)}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Docente">
          {teachers.loading ? <Loading /> : (
            <Select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Elegir…</option>
              {(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} · {t.roles.join(', ')}</option>)}
            </Select>
          )}
        </Field>
        <div className="flex justify-end"><Button onClick={() => void start()} disabled={!staffId} loading={busy}>Abrir conversación</Button></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Field label="Aula">
        <Select value={classroomId} onChange={(e) => { setClassroomId(Number(e.target.value)); setStudentId(0) }}>
          <option value={0}>Elegir…</option>
          {(rooms.data ?? []).map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
        </Select>
      </Field>
      <Field label="Alumno" hint="Escribirás a su padre, madre o apoderado.">
        <Select value={studentId} onChange={(e) => setStudentId(Number(e.target.value))} disabled={!classroomId}>
          <option value={0}>Elegir…</option>
          {(roster.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.last_name}, {s.first_name}</option>)}
        </Select>
      </Field>
      <div className="flex justify-end"><Button onClick={() => void start()} disabled={!studentId} loading={busy}>Abrir conversación</Button></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hilo
// ---------------------------------------------------------------------------
/** Mensaje en pantalla: puede estar enviándose o haber fallado (cambio optimista). */
type UiMessage = Message & { pending?: 'sending' | 'failed' }

function Bubble({ m, mine, onRetry, seen }: { m: UiMessage; mine: boolean; onRetry?: () => void; seen?: boolean }) {
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 transition-opacity',
        mine ? 'rounded-br-md bg-tinta text-white' : 'rounded-bl-md bg-superficie ring-1 ring-linea',
        m.pending === 'sending' && 'opacity-70',
        m.pending === 'failed' && 'ring-2 ring-estado-alerta',
      )}>
        {!mine && <p className="mb-0.5 text-xs font-bold text-tinta-500">{m.sender_name ?? 'Familia'}</p>}
        {m.attachment_path && m.attachment_kind
          ? <ChatAttachment path={m.attachment_path} kind={m.attachment_kind} name={m.attachment_name} />
          : <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">{m.body}</p>}
        <p className={cn('mt-1 text-right text-[11px]', mine ? 'text-white/60' : 'text-texto-suave')}>
          {m.pending === 'sending' ? 'Enviando…'
            : m.pending === 'failed' ? <button onClick={onRetry} className="font-bold text-white underline">No se envió · Reintentar</button>
            : <>{formatTime(m.created_at)}{!m.notify && ' · fuera de horario'}{mine && seen && <CheckCheck className="ml-1 inline h-3.5 w-3.5 text-chispa" aria-label="Visto" />}</>}
        </p>
      </div>
    </div>
  )
}

function Thread({ conversationId, directory, onActivity }: { conversationId: number; directory: Directory | null; onActivity: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [messages, setMessages] = useState<UiMessage[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const { typing, notify } = useTyping(`conv-${conversationId}`, profile?.full_name)
  const [seenAt, setSeenAt] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const check = () => void conversationSeen(conversationId).then((v) => { if (alive) setSeenAt(v) })
    check()
    const t = window.setInterval(check, 15_000)
    return () => { alive = false; window.clearInterval(t) }
  }, [conversationId, messages.length])

  const base = useAsync(async () => {
    const conversation = await getConversation(conversationId)
    if (!conversation) return null
    const [msgs, hours] = await Promise.all([listMessages(conversationId), getOfficeHours([conversation.staff_id])])
    return { conversation, msgs, hours: hours.get(conversation.staff_id) ?? { profile_id: conversation.staff_id, ...DEFAULT_HOURS } }
  }, [conversationId])

  useEffect(() => {
    // Conserva los mensajes que aún se están enviando al sincronizar.
    if (base.data) setMessages((list) => [...base.data!.msgs, ...list.filter((m) => m.pending)])
  }, [base.data])

  useEffect(() => {
    void markConversationRead(conversationId).then(onActivity)
    const channel = supabase
      .channel(`conversation-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const m = payload.new as Message
        setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]))
        void markConversationRead(conversationId).then(onActivity)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  if (base.loading) return <Loading shape="chat" />
  if (base.error) return <ErrorBox message={base.error} onRetry={() => void base.reload()} />
  if (!base.data) return <Empty title="No encontramos esta conversación" art="search" />

  const { conversation, hours } = base.data
  const iAmStaff = conversation.staff_id === profile?.id
  const otherName = iAmStaff ? `Familia de ${directory?.students[conversation.student_id] ?? 'alumno'}` : directory?.staff[conversation.staff_id] ?? 'Docente'
  const open = inHours(hours)

  // Envío optimista: el mensaje aparece al instante y se confirma al responder el servidor.
  async function deliver(body: string, tempId: number) {
    try {
      const m = await sendMessage(conversationId, body)
      haptic()
      setMessages((list) => {
        const without = list.filter((x) => x.id !== tempId)
        return without.some((x) => x.id === m.id) ? without : [...without, m]
      })
      onActivity()
    } catch (err) {
      setMessages((list) => list.map((x) => (x.id === tempId ? { ...x, pending: 'failed' } : x)))
      toast(toMessage(err), 'error')
    }
  }

  async function sendFile(blob: Blob, name: string) {
    const att = await uploadMessageFile('c', conversationId, blob, name)
    const m = await sendMessage(conversationId, '', att)
    setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]))
    onActivity()
  }

  function onSend(body: string) {
    if (!body || !profile) return
    const tempId = -Date.now()
    setMessages((list) => [...list, {
      id: tempId, conversation_id: conversationId, sender_id: profile.id, sender_name: profile.full_name, sender_role: profile.role,
      body, notify: true, created_at: new Date().toISOString(), pending: 'sending',
    }])
    void deliver(body, tempId)
  }

  function retry(m: UiMessage) {
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, pending: 'sending' } : x)))
    void deliver(m.body, m.id)
  }

  let lastDay = ''
  return (
    <div className="flex h-full min-h-[60vh] flex-col">
      <header className="border-b border-linea px-5 py-3">
        <p className="font-display text-lg font-semibold">{otherName}</p>
        <p className="text-sm text-texto-suave">Sobre {directory?.students[conversation.student_id] ?? 'el alumno'}</p>
      </header>
      {!iAmStaff && (
        <div className={cn('flex items-start gap-2 px-5 py-2.5 text-sm', open ? 'bg-papel text-texto-suave' : 'bg-chispa-100 text-tinta')}>
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Atiende {hoursLabel(hours)}.{' '}
            {open ? 'Ahora está en horario.' : 'Ahora está fuera de horario: tu mensaje llega, pero sin notificación.'}
            {!open && hours.away_message && <span className="mt-1 block italic">“{hours.away_message}”</span>}
          </span>
        </div>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto bg-papel/50 px-4 py-4">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-texto-suave">Escribe el primer mensaje.</p>}
        {messages.map((m) => {
          const day = isoDay(new Date(m.created_at))
          const showDay = day !== lastDay
          lastDay = day
          return (
            <div key={m.id}>
              {showDay && <p className="my-3 text-center text-xs font-bold text-texto-suave">{day === limaToday() ? 'Hoy' : formatShort(m.created_at)}</p>}
              <Bubble m={m} mine={m.sender_id === profile?.id} onRetry={() => retry(m)} seen={!!seenAt && m.id > 0 && Date.parse(m.created_at) <= Date.parse(seenAt)} />
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <TypingIndicator names={typing} />
      <ChatComposer onSend={onSend} onFile={sendFile} onTyping={notify} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Supervisión (dirección)
// ---------------------------------------------------------------------------
function Supervision({ conversations, directory }: { conversations: Conversation[]; directory: Directory | null }) {
  const toast = useToast()
  const [target, setTarget] = useState<Conversation | null>(null)
  const [reason, setReason] = useState('')
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = conversations.filter((c) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return (directory?.students[c.student_id] ?? '').toLowerCase().includes(q) || (directory?.staff[c.staff_id] ?? '').toLowerCase().includes(q)
  })

  async function open() {
    if (!target) return
    setBusy(true)
    try {
      setMessages(await adminReadConversation(target.id, reason))
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-chispa-100 px-4 py-3 text-sm text-tinta">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        Cada revisión queda registrada con tu nombre, la fecha y el motivo. Úsala solo cuando haya un problema que atender.
      </p>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por alumno o docente" className="mb-3 max-w-sm" />
      <ul className="divide-y divide-linea rounded-xl border border-linea bg-superficie">
        {filtered.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{directory?.staff[c.staff_id] ?? 'Docente'} ↔ familia de {directory?.students[c.student_id] ?? 'alumno'}</p>
              <p className="text-sm text-texto-suave">{c.last_message_at ? `Último mensaje: ${formatShort(c.last_message_at)}, ${formatTime(c.last_message_at)}` : 'Sin mensajes'}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setTarget(c); setReason(''); setMessages(null) }}><Eye className="h-4 w-4" />Revisar</Button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-4 py-6 text-sm text-texto-suave">No hay conversaciones.</li>}
      </ul>

      <Modal open={!!target} onClose={() => setTarget(null)} title="Revisión de conversación" wide>
        {target && (messages ? (
          <div className="space-y-2">
            {messages.length === 0 && <p className="text-sm text-texto-suave">La conversación no tiene mensajes.</p>}
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg border border-linea p-3">
                <p className="text-xs text-texto-suave"><b className="text-texto">{m.sender_name}</b> · {formatShort(m.created_at)}, {formatTime(m.created_at)}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Motivo de la revisión" hint="Queda registrado. Mínimo 5 caracteres.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-20" />
            </Field>
            <div className="flex justify-end"><Button onClick={() => void open()} disabled={reason.trim().length < 5} loading={busy}>Ver conversación</Button></div>
          </div>
        ))}
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function MessagesPage() {
  const { conversationId } = useParams()
  const selected = Number(conversationId) || null
  const navigate = useNavigate()
  const { profile, isAdmin, children } = useAuth()
  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  const [creating, setCreating] = useState(false)
  const [hoursOpen, setHoursOpen] = useState(false)
  const isStaff = profile?.role === 'TEACHER' || isAdmin
  const childIds = children.map((c) => c.id)

  const { data, loading, error, reload } = useAsync(async () => {
    const [all, reads] = await Promise.all([listConversations(), listReads()])
    const [directory, hours] = await Promise.all([
      loadDirectory(all),
      isStaff ? getOfficeHours([profile!.id]) : Promise.resolve(new Map<string, OfficeHours>()),
    ])
    return { all, reads, directory, myHours: hours.get(profile!.id) ?? null }
  }, [profile?.id, isStaff])

  const mine = useMemo(() => ownConversations(data?.all ?? [], profile?.id ?? '', childIds), [data, profile?.id, childIds.join(',')])
  const others = useMemo(() => (data?.all ?? []).filter((c) => !mine.includes(c)), [data, mine])

  const list = (
    <div>
      {loading ? <Loading /> : mine.length === 0 ? (
        <div className="p-5"><Empty title="Sin conversaciones" art="chat" compact icon={<MessageCircle className="h-6 w-6" />}>Empieza una con “Nueva”.</Empty></div>
      ) : (
        <ul className="divide-y divide-linea">
          {mine.map((c) => {
            const unread = data ? isUnread(c, data.reads, profile!.id) : false
            const title = c.staff_id === profile?.id
              ? `Familia de ${data?.directory.students[c.student_id] ?? 'alumno'}`
              : data?.directory.staff[c.staff_id] ?? 'Docente'
            return (
              <li key={c.id}>
                <Link to={`/mensajes/${c.id}`} className={cn('flex gap-3 px-4 py-3 hover:bg-papel', selected === c.id && 'bg-chispa-100 hover:bg-chispa-100')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate', unread ? 'font-bold' : 'font-semibold')}>{title}</p>
                      {c.last_message_at && <span className="shrink-0 text-xs text-texto-suave">{formatShort(c.last_message_at)}</span>}
                    </div>
                    {c.staff_id !== profile?.id && <p className="text-xs text-texto-suave">Sobre {data?.directory.students[c.student_id]}</p>}
                    <p className={cn('truncate text-sm', unread ? 'text-texto' : 'text-texto-suave')}>{c.last_message_preview ?? 'Sin mensajes todavía'}</p>
                  </div>
                  {unread && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-chispa" aria-label="Sin leer" />}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  return (
    <>
      <div className={cn(selected && 'hidden lg:block')}>
        <PageHeader
          title="Mensajes"
          subtitle={profile?.role === 'GUARDIAN' ? 'Conversa con los docentes de tus hijos.' : 'Conversaciones con las familias.'}
          action={
            <div className="flex flex-wrap gap-2">
              {isStaff && <Button variant="secondary" onClick={() => setHoursOpen(true)}><Clock className="h-4 w-4" />Horario de atención</Button>}
              <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nueva</Button>
            </div>
          }
        />
        {isAdmin && (
          <div className="mb-4">
            <Segmented value={tab} onChange={setTab} options={[{ value: 'mine', label: 'Mis conversaciones' }, { value: 'all', label: <>Supervisión <Badge className="ml-1">{others.length}</Badge></> }]} />
          </div>
        )}
      </div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}

      {tab === 'all' && isAdmin ? (
        <Supervision conversations={others} directory={data?.directory ?? null} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-linea bg-superficie lg:grid lg:h-[calc(100vh-15rem)] lg:min-h-[32rem] lg:grid-cols-[20rem_1fr]">
          <div className={cn('overflow-y-auto border-linea lg:border-r', selected && 'hidden lg:block')}>{list}</div>
          <div className={cn('min-w-0', !selected && 'hidden lg:flex lg:items-center lg:justify-center')}>
            {selected ? (
              <>
                <button onClick={() => navigate('/mensajes')} className="flex items-center gap-1.5 px-4 pt-3 text-sm font-bold text-texto-suave lg:hidden">
                  <ArrowLeft className="h-4 w-4" />Mensajes
                </button>
                <Thread key={selected} conversationId={selected} directory={data?.directory ?? null} onActivity={() => void reload(true)} />
              </>
            ) : <p className="text-sm text-texto-suave">Elige una conversación.</p>}
          </div>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva conversación">
        <NewConversation onStarted={(id) => { setCreating(false); void reload(true); navigate(`/mensajes/${id}`) }} />
      </Modal>
      <Modal open={hoursOpen} onClose={() => setHoursOpen(false)} title="Horario de atención">
        {hoursOpen && (
          <OfficeHoursForm
            initial={data?.myHours ?? DEFAULT_HOURS}
            onSaved={() => { setHoursOpen(false); void reload(true) }}
          />
        )}
      </Modal>
    </>
  )
}
