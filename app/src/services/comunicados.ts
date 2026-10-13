import { supabase } from '@/lib/supabase'
import { cleanSingleLine, cleanText, positiveInteger, safeFileName } from '@/lib/security'
import { UserError } from '@/lib/errors'
import type { Circular, CircularRecipient, CircularScope, ConsentResponse } from '@/types'

export const BUCKET_CIRCULARS = 'campus-circulars'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

export async function listCirculars(limit = 60): Promise<Circular[]> {
  return must(await supabase.from('circulars').select('*').order('published_at', { ascending: false }).limit(limit)) as Circular[]
}

export async function getCircular(id: number): Promise<Circular | null> {
  const { data, error } = await supabase.from('circulars').select('*').eq('id', positiveInteger(id)).maybeSingle()
  if (error) throw error
  return (data as Circular) ?? null
}

/** Destinatarios visibles para quien consulta (la familia ve solo a sus hijos). */
export async function listRecipients(circularIds: number[]): Promise<CircularRecipient[]> {
  if (!circularIds.length) return []
  const rows: CircularRecipient[] = []
  // Paginado: un comunicado a todo el colegio puede tener cientos de filas.
  for (let from = 0; ; from += 1000) {
    const page = must(await supabase
      .from('circular_recipients')
      .select('id, circular_id, student_id, classroom_id, read_at, response, response_comment, responded_at, signer_name, signature')
      .in('circular_id', circularIds)
      .order('id')
      .range(from, from + 999)) as CircularRecipient[]
    rows.push(...page)
    if (page.length < 1000) break
  }
  return rows
}

/** Resumen por comunicado sin traer las firmas (para la lista). */
export async function listRecipientStats(circularIds: number[]): Promise<Map<number, { total: number; read: number; authorized: number; denied: number }>> {
  const stats = new Map<number, { total: number; read: number; authorized: number; denied: number }>()
  if (!circularIds.length) return stats
  for (let from = 0; ; from += 1000) {
    const page = must(await supabase
      .from('circular_recipients')
      .select('circular_id, read_at, response')
      .in('circular_id', circularIds)
      .order('id')
      .range(from, from + 999)) as { circular_id: number; read_at: string | null; response: ConsentResponse | null }[]
    for (const r of page) {
      const s = stats.get(r.circular_id) ?? { total: 0, read: 0, authorized: 0, denied: 0 }
      s.total++
      if (r.read_at) s.read++
      if (r.response === 'AUTHORIZED') s.authorized++
      if (r.response === 'NOT_AUTHORIZED') s.denied++
      stats.set(r.circular_id, s)
    }
    if (page.length < 1000) break
  }
  return stats
}

export async function createCircular(input: {
  scope: CircularScope
  level?: string
  classroomId?: number
  title: string
  body: string
  consent: boolean
  signature: boolean
  deadline: string | null
  file?: File | null
  authorId: string
}): Promise<number> {
  const title = cleanSingleLine(input.title, 160)
  const body = cleanText(input.body, 8000)
  if (title.length < 3) throw new UserError('Escribe un título para el comunicado.')
  if (!body) throw new UserError('Escribe el contenido del comunicado.')

  let attachmentPath: string | null = null
  let attachmentName: string | null = null
  if (input.file) {
    if (input.file.size > 15 * 1024 * 1024) throw new UserError('El adjunto supera los 15 MB.')
    attachmentPath = `${crypto.randomUUID()}/${safeFileName(input.file.name)}`
    attachmentName = cleanSingleLine(input.file.name, 160)
    const up = await supabase.storage.from(BUCKET_CIRCULARS).upload(attachmentPath, input.file, { contentType: input.file.type || undefined })
    if (up.error) throw up.error
  }

  const { data, error } = await supabase.from('circulars').insert({
    author_id: input.authorId,
    scope: input.scope,
    level: input.scope === 'LEVEL' ? input.level : null,
    classroom_id: input.scope === 'CLASSROOM' ? positiveInteger(input.classroomId) : null,
    title,
    body,
    response_type: input.consent ? 'CONSENT' : 'NONE',
    requires_signature: input.consent && input.signature,
    response_deadline: input.consent ? input.deadline : null,
    attachment_path: attachmentPath,
    attachment_name: attachmentName,
  }).select('id').single()
  if (error) {
    if (attachmentPath) await supabase.storage.from(BUCKET_CIRCULARS).remove([attachmentPath])
    throw error
  }
  return (data as { id: number }).id
}

export async function deleteCircular(circular: Circular): Promise<void> {
  must(await supabase.from('circulars').delete().eq('id', positiveInteger(circular.id)))
  if (circular.attachment_path) await supabase.storage.from(BUCKET_CIRCULARS).remove([circular.attachment_path])
}

export async function markCircularRead(id: number): Promise<void> {
  const { error } = await supabase.rpc('mark_circular_read', { p_circular_id: positiveInteger(id) })
  if (error) throw error
}

export async function respondCircular(input: {
  circularId: number
  studentId: number
  response: ConsentResponse
  comment: string
  signature: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('respond_circular', {
    p_circular_id: positiveInteger(input.circularId),
    p_student_id: positiveInteger(input.studentId),
    p_response: input.response,
    p_comment: cleanText(input.comment, 500) || null,
    p_signature: input.signature,
  })
  if (error) throw error
}

export const RESPONSE_LABELS: Record<ConsentResponse, string> = {
  AUTHORIZED: 'Autorizo',
  NOT_AUTHORIZED: 'No autorizo',
}
