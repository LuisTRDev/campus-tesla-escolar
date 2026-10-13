import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, EyeOff, Megaphone, MessagesSquare, Plus, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Select } from '@/components/ui'
import { ChatAttachment, ChatComposer, TypingIndicator, useTyping } from '@/components/chat'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { formatShort, formatTime, isoDay, limaToday } from '@/lib/format'
import { haptic } from '@/lib/ux'
import { cn } from '@/lib/utils'
import { classroomLabel, listClassrooms } from '@/services/campus'
import {
  hideChannelMessage, listChannelMessages, markChannelRead, myChannels, saveChannel, sendChannelMessage, uploadMessageFile,
  type Channel, type ChannelMessage,
} from '@/services/comunicacion'
import type { Classroom } from '@/types'

function ChannelThread({ channel }: { channel: Channel }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const { data, loading, error, reload } = useAsync(() => listChannelMessages(channel.id), [channel.id])
  const { typing, notify } = useTyping(`grupo-${channel.id}`, profile?.full_name)
  const end = useRef<HTMLDivElement>(null)
  const staff = channel.role === 'STAFF'
  const canWrite = staff || channel.mode === 'OPEN'

  useEffect(() => { if (data) setMessages(data) }, [data])
  useEffect(() => {
    void markChannelRead(channel.id)
    const ch = supabase
      .channel(`grupo-msgs-${channel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channel.id}` }, (payload) => {
        const m = payload.new as ChannelMessage
        setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]))
        void markChannelRead(channel.id)
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [channel.id])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages.length])

  async function send(text: string) {
    try { await sendChannelMessage(channel.id, text); haptic(); void reload(true) } catch (err) { toast(toMessage(err), 'error') }
  }
  async function sendFile(blob: Blob, name: string) {
    const att = await uploadMessageFile('g', channel.id, blob, name)
    await sendChannelMessage(channel.id, '', att)
    void reload(true)
  }

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading && !messages.length) return <Loading shape="chat" />
  let lastDay = ''
  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-linea bg-superficie">
      <header className="flex items-center gap-3 border-b border-linea px-5 py-3">
        <span className="rounded-lg bg-papel p-2 text-tinta-500">{channel.mode === 'ANNOUNCE' ? <Megaphone className="h-5 w-5" /> : <MessagesSquare className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{channel.title}</p>
          <p className="text-sm text-texto-suave">{channel.audience === 'STUDENTS' ? 'Alumnos del aula' : 'Familias del aula'} · {channel.mode === 'ANNOUNCE' ? 'solo escriben los docentes' : 'todos conversan'}</p>
        </div>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto bg-papel/50 px-4 py-4">
        {!messages.length && <p className="py-10 text-center text-sm text-texto-suave">Todavía no hay mensajes.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === profile?.id
          const day = isoDay(new Date(m.created_at))
          const showDay = day !== lastDay
          lastDay = day
          const teacher = m.sender_role !== 'STUDENT' && m.sender_role !== 'GUARDIAN'
          return (
            <div key={m.id}>
              {showDay && <p className="my-3 text-center text-xs font-bold text-texto-suave">{day === limaToday() ? 'Hoy' : formatShort(m.created_at)}</p>}
              <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('group max-w-[85%] rounded-2xl px-4 py-2.5', mine ? 'rounded-br-md bg-tinta text-white' : 'rounded-bl-md bg-superficie ring-1 ring-linea', m.hidden && 'opacity-50')}>
                  {!mine && <p className="mb-0.5 flex items-center gap-1 text-xs font-bold text-tinta-500">{m.sender_name ?? 'Alguien'}{teacher && <Badge tone="info">Docente</Badge>}</p>}
                  {m.attachment_path && m.attachment_kind
                    ? <ChatAttachment path={m.attachment_path} kind={m.attachment_kind} name={m.attachment_name} />
                    : <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">{m.body}</p>}
                  <p className={cn('mt-1 flex items-center justify-end gap-2 text-[11px]', mine ? 'text-white/60' : 'text-texto-suave')}>
                    {staff && !mine && (
                      <button className="opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={m.hidden ? 'Mostrar' : 'Ocultar mensaje'}
                        onClick={async () => { await hideChannelMessage(m.id, !m.hidden).catch((e) => toast(toMessage(e), 'error')); void reload(true) }}>
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <TypingIndicator names={typing} />
      {canWrite ? <ChatComposer onSend={(t) => void send(t)} onFile={sendFile} onTyping={notify} />
        : <p className="border-t border-linea p-3 text-center text-sm text-texto-suave">En este grupo solo escriben los docentes.</p>}
    </div>
  )
}

function NewChannel({ onDone }: { onDone: (id: number) => void }) {
  const toast = useToast()
  const { isAdmin, profile, tutorClassrooms } = useAuth()
  const staff = isAdmin || profile?.role === 'AUXILIARY'
  const { data: all } = useAsync(() => (staff ? listClassrooms() : Promise.resolve(tutorClassrooms as Classroom[])), [staff], { live: false })
  const [f, setF] = useState({ classroomId: 0, audience: 'FAMILIES' as 'STUDENTS' | 'FAMILIES', mode: 'ANNOUNCE' as 'ANNOUNCE' | 'OPEN', title: '' })
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-4">
      <Field label="Aula">
        <Select value={f.classroomId || ''} onChange={(e) => setF({ ...f, classroomId: Number(e.target.value) })}>
          <option value="">Elegir…</option>
          {(all ?? []).map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
        </Select>
      </Field>
      <Field label="Para"><Segmented value={f.audience} onChange={(v) => setF({ ...f, audience: v })} options={[{ value: 'FAMILIES', label: 'Familias' }, { value: 'STUDENTS', label: 'Alumnos' }]} /></Field>
      <Field label="Quién escribe"><Segmented value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={[{ value: 'ANNOUNCE', label: 'Solo docentes' }, { value: 'OPEN', label: 'Todos' }]} /></Field>
      <Field label="Nombre (opcional)"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={80} placeholder="Familias de 3.° A" /></Field>
      <div className="flex justify-end">
        <Button disabled={!f.classroomId} loading={busy} onClick={async () => {
          setBusy(true)
          try { const id = await saveChannel(f.classroomId, f.audience, f.mode, f.title); toast('Grupo listo.'); onDone(id) } catch (err) { toast(toMessage(err), 'error') } finally { setBusy(false) }
        }}>Crear grupo</Button>
      </div>
      <p className="text-xs text-texto-suave">Si el aula ya tenía un grupo para el mismo público, se actualiza su configuración.</p>
    </div>
  )
}

export default function ChannelsPage() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const { isAdmin, profile, tutorClassrooms } = useAuth()
  const canCreate = isAdmin || profile?.role === 'AUXILIARY' || tutorClassrooms.length > 0
  const { data, loading, error, reload } = useAsync(myChannels, [])
  const [creating, setCreating] = useState(false)
  const current = data?.find((c) => c.id === Number(channelId)) ?? null

  return (
    <>
      <PageHeader title="Grupos del aula" subtitle="Avisos y conversación con todo el salón." action={canCreate && <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nuevo grupo</Button>} />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading && !data ? <Loading /> : !data?.length ? (
        <Empty title="Todavía no hay grupos" art="chat">{canCreate ? 'Crea el grupo de familias o de alumnos de tu aula.' : 'Cuando el tutor cree el grupo del aula, aparecerá aquí.'}</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Panel bodyClassName="p-2" className={cn('h-fit', current && 'hidden lg:block')}>
            <ul>
              {data.map((c) => (
                <li key={c.id}>
                  <Link to={`/grupos/${c.id}`} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-papel', c.id === current?.id && 'bg-chispa-100')}>
                    <span className="rounded-lg bg-papel p-2 text-tinta-500"><Users className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.title}</span>
                      <span className="block truncate text-xs text-texto-suave">{c.last ? `${c.last.sender ?? ''}: ${c.last.body}` : c.audience === 'STUDENTS' ? 'Alumnos' : 'Familias'}</span>
                    </span>
                    {c.unread > 0 && <span className="rounded-full bg-estado-alerta px-2 py-0.5 text-xs font-bold text-white">{c.unread}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          {current ? (
            <div>
              <button onClick={() => navigate('/grupos')} className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-texto-suave lg:hidden"><ArrowLeft className="h-4 w-4" />Grupos</button>
              <ChannelThread key={current.id} channel={current} />
            </div>
          ) : <div className="hidden lg:block"><Empty title="Elige un grupo" art="chat" /></div>}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo grupo del aula">
        <NewChannel onDone={(id) => { setCreating(false); void reload(true); navigate(`/grupos/${id}`) }} />
      </Modal>
    </>
  )
}
