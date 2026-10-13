import { supabase } from '@/lib/supabase'
import { cleanText, positiveInteger, safeFileName } from '@/lib/security'
import { UserError } from '@/lib/errors'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export const BUCKET_MESSAGES = 'campus-messages'

// ---------------------------------------------------------------------------
// Preferencias de avisos
// ---------------------------------------------------------------------------
export type PushKind = 'ASSIGNMENT' | 'GRADE' | 'LATE' | 'CIRCULAR' | 'MESSAGE' | 'DIGEST' | 'TESLA' | 'FORUM' | 'APPOINTMENT' | 'JUSTIFICATION' | 'SURVEY' | 'CHANNEL'
export const PUSH_KIND_LABEL: Record<PushKind, string> = {
  ASSIGNMENT: 'Tareas nuevas', GRADE: 'Notas', LATE: 'Tardanzas', CIRCULAR: 'Comunicados', MESSAGE: 'Mensajes', DIGEST: 'Resumen semanal',
  TESLA: 'Perfil Tesla', FORUM: 'Foro', APPOINTMENT: 'Citas', JUSTIFICATION: 'Justificaciones', SURVEY: 'Encuestas', CHANNEL: 'Grupos del aula',
}
export type NotificationPrefs = { quiet_enabled: boolean; quiet_start: string; quiet_end: string; quiet_weekends: boolean; muted_kinds: PushKind[] }
export const DEFAULT_PREFS: NotificationPrefs = { quiet_enabled: true, quiet_start: '21:00', quiet_end: '06:30', quiet_weekends: false, muted_kinds: [] }

export async function getPrefs(): Promise<NotificationPrefs> {
  const { data, error } = await supabase.from('notification_prefs').select('quiet_enabled, quiet_start, quiet_end, quiet_weekends, muted_kinds').maybeSingle()
  if (error) throw error
  if (!data) return DEFAULT_PREFS
  const d = data as NotificationPrefs
  return { ...d, quiet_start: d.quiet_start.slice(0, 5), quiet_end: d.quiet_end.slice(0, 5) }
}

export async function savePrefs(p: NotificationPrefs) {
  must(await supabase.from('notification_prefs').upsert({ ...p, updated_at: new Date().toISOString() }))
}

// ---------------------------------------------------------------------------
// Archivos de mensajes (chat "c/{conv}/…" o grupo "g/{canal}/…")
// ---------------------------------------------------------------------------
export type AttachmentKind = 'IMAGE' | 'AUDIO' | 'FILE'

export async function uploadMessageFile(scope: 'c' | 'g', id: number, blob: Blob, name: string): Promise<{ path: string; kind: AttachmentKind; name: string }> {
  if (blob.size > 10 * 1024 * 1024) throw new UserError('El archivo supera los 10 MB.')
  const kind: AttachmentKind = blob.type.startsWith('image/') ? 'IMAGE' : blob.type.startsWith('audio/') ? 'AUDIO' : 'FILE'
  const path = `${scope}/${positiveInteger(id)}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`
  const up = await supabase.storage.from(BUCKET_MESSAGES).upload(path, blob, { contentType: blob.type || undefined })
  if (up.error) throw up.error
  return { path, kind, name }
}

export const attachmentLabel = (kind: AttachmentKind) => (kind === 'IMAGE' ? '📷 Foto' : kind === 'AUDIO' ? '🎤 Nota de voz' : '📎 Archivo')

// ---------------------------------------------------------------------------
// Grupos del aula
// ---------------------------------------------------------------------------
export type Channel = {
  id: number; classroom_id: number; audience: 'STUDENTS' | 'FAMILIES'; mode: 'ANNOUNCE' | 'OPEN'; title: string; role: 'STAFF' | 'MEMBER'
  last: { body: string; at: string; sender: string | null } | null; unread: number
}
export type ChannelMessage = {
  id: number; channel_id: number; sender_id: string; sender_name: string | null; sender_role: string | null; body: string
  attachment_path: string | null; attachment_kind: AttachmentKind | null; attachment_name: string | null; hidden: boolean; created_at: string
}

export const myChannels = () => rpc<Channel[]>('my_channels')
export const markChannelRead = (id: number) => rpc<void>('mark_channel_read', { p_channel_id: positiveInteger(id) }).catch(() => undefined)
export const saveChannel = (classroomId: number, audience: 'STUDENTS' | 'FAMILIES', mode: 'ANNOUNCE' | 'OPEN', title = '') =>
  rpc<number>('save_class_channel', { p_classroom_id: positiveInteger(classroomId), p_audience: audience, p_mode: mode, p_title: title || null })

export async function listChannelMessages(channelId: number, limit = 150): Promise<ChannelMessage[]> {
  const rows = must(await supabase.from('channel_messages').select('*').eq('channel_id', positiveInteger(channelId))
    .order('created_at', { ascending: false }).limit(limit)) as ChannelMessage[]
  return rows.reverse()
}

export async function sendChannelMessage(channelId: number, body: string, attachment?: { path: string; kind: AttachmentKind; name: string }) {
  const text = cleanText(body, 2000) || (attachment ? attachmentLabel(attachment.kind) : '')
  if (!text) throw new UserError('Escribe un mensaje.')
  must(await supabase.from('channel_messages').insert({
    channel_id: positiveInteger(channelId), body: text,
    attachment_path: attachment?.path ?? null, attachment_kind: attachment?.kind ?? null, attachment_name: attachment?.name ?? null,
  }))
}

export const hideChannelMessage = async (id: number, hidden: boolean) => must(await supabase.from('channel_messages').update({ hidden }).eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Anuncios: reacciones y confirmación de lectura
// ---------------------------------------------------------------------------
export const REACTIONS = ['👍', '❤️', '🎉', '👏', '😮'] as const
export type Reaction = (typeof REACTIONS)[number]
export type AnnouncementSocial = { reactions: Record<string, number>; mine: string[]; acked: boolean; reads: number | null }

export async function announcementSocial(ids: number[]): Promise<Record<string, AnnouncementSocial>> {
  const valid = ids.filter((id) => id > 0)
  if (!valid.length) return {}
  return rpc<Record<string, AnnouncementSocial>>('announcement_social', { p_ids: valid })
}

export async function toggleReaction(announcementId: number, emoji: Reaction, on: boolean) {
  if (on) must(await supabase.from('announcement_reactions').insert({ announcement_id: positiveInteger(announcementId), emoji }))
  else must(await supabase.from('announcement_reactions').delete().eq('announcement_id', positiveInteger(announcementId)).eq('emoji', emoji))
}

export async function ackAnnouncement(announcementId: number) {
  const { error } = await supabase.from('announcement_reads').insert({ announcement_id: positiveInteger(announcementId) })
  if (error && error.code !== '23505') throw error
}

export const announcementReaders = (id: number) =>
  rpc<{ name: string; role: string; read_at: string }[] | null>('announcement_readers', { p_id: positiveInteger(id) }).then((r) => r ?? [])

export const setAnnouncementAck = async (id: number, require: boolean) =>
  must(await supabase.from('announcements').update({ require_ack: require }).eq('id', positiveInteger(id)))

// ---------------------------------------------------------------------------
// Tutor IA
// ---------------------------------------------------------------------------
export type TutorSettings = { offering_id: number; enabled: boolean; instructions: string | null; daily_limit: number }
export type TutorMessage = { id: number; role: 'user' | 'assistant'; content: string; created_at: string }

export async function getTutorSettings(offeringId: number): Promise<TutorSettings | null> {
  const { data, error } = await supabase.from('tutor_settings').select('*').eq('offering_id', positiveInteger(offeringId)).maybeSingle()
  if (error) throw error
  return (data as TutorSettings) ?? null
}

export async function saveTutorSettings(s: TutorSettings) {
  must(await supabase.from('tutor_settings').upsert({
    offering_id: positiveInteger(s.offering_id), enabled: s.enabled, instructions: cleanText(s.instructions ?? '', 2000) || null,
    daily_limit: Math.min(200, Math.max(1, Math.round(s.daily_limit))), updated_at: new Date().toISOString(),
  }))
}

export async function listTutorMessages(offeringId: number, studentId: number): Promise<TutorMessage[]> {
  const rows = must(await supabase.from('tutor_messages').select('id, role, content, created_at')
    .eq('offering_id', positiveInteger(offeringId)).eq('student_id', positiveInteger(studentId))
    .order('created_at', { ascending: false }).limit(60)) as TutorMessage[]
  return rows.reverse()
}

/** Pregunta al tutor (Edge Function campus-tutor). */
export async function askTutor(offeringId: number, message: string): Promise<{ reply: string; left: number }> {
  const text = cleanText(message, 2000)
  if (!text) throw new UserError('Escribe tu pregunta.')
  const { data, error } = await supabase.functions.invoke('campus-tutor', { body: { offering_id: positiveInteger(offeringId), message: text } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null
    throw new UserError(detail?.error ?? 'El tutor no está disponible en este momento.')
  }
  return data as { reply: string; left: number }
}

/** Hasta cuándo leyó la otra persona del chat (para mostrar «Visto»). */
export const conversationSeen = (conversationId: number) =>
  rpc<string | null>('conversation_seen', { p_conversation_id: positiveInteger(conversationId) }).catch(() => null)
