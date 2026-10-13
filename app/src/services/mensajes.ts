import { supabase } from '@/lib/supabase'
import { cleanText, positiveInteger } from '@/lib/security'
import { UserError } from '@/lib/errors'
import type { Conversation, Message, OfficeHours } from '@/types'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

export const DEFAULT_HOURS: Omit<OfficeHours, 'profile_id'> = {
  weekdays: [1, 2, 3, 4, 5],
  starts_at: '07:30',
  ends_at: '16:00',
  away_message: null,
}

export async function listConversations(): Promise<Conversation[]> {
  return must(await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)) as Conversation[]
}

/** Conversaciones propias (como docente o como familia), sin las que dirección solo supervisa. */
export function ownConversations(all: Conversation[], profileId: string, childIds: number[]): Conversation[] {
  return all.filter((c) => c.staff_id === profileId || childIds.includes(c.student_id))
}

export async function listReads(): Promise<Map<number, string>> {
  const rows = must(await supabase.from('conversation_reads').select('conversation_id, last_read_at')) as { conversation_id: number; last_read_at: string }[]
  return new Map(rows.map((r) => [r.conversation_id, r.last_read_at]))
}

export function isUnread(c: Conversation, reads: Map<number, string>, me: string): boolean {
  if (!c.last_message_at || c.last_sender_id === me) return false
  const read = reads.get(c.id)
  return !read || Date.parse(read) < Date.parse(c.last_message_at)
}

export async function getConversation(id: number): Promise<Conversation | null> {
  const { data, error } = await supabase.from('conversations').select('*').eq('id', positiveInteger(id)).maybeSingle()
  if (error) throw error
  return (data as Conversation) ?? null
}

export async function listMessages(conversationId: number): Promise<Message[]> {
  return must(await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', positiveInteger(conversationId))
    .order('created_at')
    .limit(500)) as Message[]
}

export async function sendMessage(conversationId: number, body: string, attachment?: { path: string; kind: 'IMAGE' | 'AUDIO' | 'FILE'; name: string }): Promise<Message> {
  const label = attachment ? (attachment.kind === 'IMAGE' ? '📷 Foto' : attachment.kind === 'AUDIO' ? '🎤 Nota de voz' : '📎 Archivo') : ''
  const text = cleanText(body, 2000) || label
  if (!text) throw new UserError('Escribe un mensaje.')
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: positiveInteger(conversationId), body: text,
      attachment_path: attachment?.path ?? null, attachment_kind: attachment?.kind ?? null, attachment_name: attachment?.name ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Message
}

export async function startConversation(studentId: number, staffId: string): Promise<number> {
  const { data, error } = await supabase.rpc('start_conversation', { p_student_id: positiveInteger(studentId), p_staff_id: staffId })
  if (error) throw error
  return Number(data)
}

export async function markConversationRead(conversationId: number): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: positiveInteger(conversationId) })
}

export async function adminReadConversation(conversationId: number, reason: string): Promise<Message[]> {
  const { data, error } = await supabase.rpc('admin_read_conversation', {
    p_conversation_id: positiveInteger(conversationId),
    p_reason: cleanText(reason, 300),
  })
  if (error) throw error
  return (data ?? []) as Message[]
}

export async function getOfficeHours(profileIds: string[]): Promise<Map<string, OfficeHours>> {
  const ids = [...new Set(profileIds)]
  if (!ids.length) return new Map()
  const rows = must(await supabase.from('office_hours').select('*').in('profile_id', ids)) as OfficeHours[]
  return new Map(rows.map((r) => [r.profile_id, { ...r, starts_at: r.starts_at.slice(0, 5), ends_at: r.ends_at.slice(0, 5) }]))
}

export async function saveOfficeHours(profileId: string, hours: Omit<OfficeHours, 'profile_id'>): Promise<void> {
  if (!hours.weekdays.length) throw new UserError('Elige al menos un día de atención.')
  if (hours.ends_at <= hours.starts_at) throw new UserError('La hora de fin debe ser posterior a la de inicio.')
  must(await supabase.from('office_hours').upsert({
    profile_id: profileId,
    weekdays: hours.weekdays,
    starts_at: hours.starts_at,
    ends_at: hours.ends_at,
    away_message: cleanText(hours.away_message, 300) || null,
  }))
}

const DAY_SHORT = ['', 'L', 'M', 'Mi', 'J', 'V', 'S', 'D']

export function hoursLabel(h: Omit<OfficeHours, 'profile_id'>): string {
  const days = [...h.weekdays].sort()
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  const dayText = contiguous && days.length > 2 ? `${DAY_SHORT[days[0]]} a ${DAY_SHORT[days[days.length - 1]]}` : days.map((d) => DAY_SHORT[d]).join(', ')
  return `${dayText}, de ${h.starts_at} a ${h.ends_at}`
}

/** ¿Está el docente en horario de atención ahora (hora de Lima)? */
export function inHours(h: Omit<OfficeHours, 'profile_id'>, at = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at)
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '') + 1
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const time = `${hour === '24' ? '00' : hour}:${parts.find((p) => p.type === 'minute')?.value ?? '00'}`
  return h.weekdays.includes(wd) && time >= h.starts_at && time <= h.ends_at
}
