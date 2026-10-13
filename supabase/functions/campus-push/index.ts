// ============================================================================
// Campus Virtual Tesla · Edge Function "campus-push"
//
// Envía las notificaciones push encoladas en public.push_outbox.
// La llama la base de datos (pg_net) cada vez que se encola un aviso.
//
// Desplegar (sin verificación de JWT: se protege con un secreto propio):
//   supabase functions deploy campus-push --no-verify-jwt
//   supabase secrets set PUSH_WEBHOOK_SECRET=<el mismo de campus_private.settings>
//   supabase secrets set VAPID_PUBLIC_KEY=<clave pública>
//   supabase secrets set VAPID_PRIVATE_KEY=<clave privada>
//   supabase secrets set VAPID_SUBJECT=mailto:sistemas@tu-colegio.edu.pe
//
// Las claves VAPID se generan una sola vez con:  npx web-push generate-vapid-keys
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:sistemas@campus.tesla.edu.pe'

type OutboxRow = {
  id: number
  profile_id: string
  kind: string
  title: string
  body: string
  url: string
  data: Record<string, unknown>
}

type Subscription = { id: number; profile_id: string; endpoint: string; p256dh: string; auth: string }

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  if (!SECRET || !safeEqual(req.headers.get('x-campus-secret') ?? '', SECRET)) {
    return new Response('No autorizado', { status: 401 })
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response('Faltan las claves VAPID', { status: 500 })
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

  let sent = 0
  let failed = 0
  // Hasta 5 lotes por llamada para vaciar la cola en ráfagas (p. ej. una tarea para 30 familias).
  for (let round = 0; round < 5; round++) {
    const { data: batch, error } = await admin.rpc('claim_push_batch', { p_limit: 300 })
    if (error) {
      console.error('[campus-push] claim', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
    const rows = (batch ?? []) as OutboxRow[]
    if (!rows.length) break

    const profileIds = [...new Set(rows.map((r) => r.profile_id))]
    const { data: subsData } = await admin
      .from('push_subscriptions')
      .select('id, profile_id, endpoint, p256dh, auth')
      .in('profile_id', profileIds)
    const subs = (subsData ?? []) as Subscription[]
    const byProfile = new Map<string, Subscription[]>()
    for (const s of subs) byProfile.set(s.profile_id, [...(byProfile.get(s.profile_id) ?? []), s])

    const deadSubs = new Set<number>()
    const delivered: number[] = []
    const errors: { id: number; error: string }[] = []

    await Promise.all(rows.map(async (row) => {
      const targets = byProfile.get(row.profile_id) ?? []
      if (!targets.length) { delivered.push(row.id); return }
      const payload = JSON.stringify({
        title: row.title,
        body: row.body,
        url: row.url,
        kind: row.kind,
        tag: `${row.kind}-${row.url}`,
        data: row.data ?? {},
      })
      let ok = false
      let lastError = ''
      for (const sub of targets) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 60 * 60 * 24, urgency: row.kind === 'LATE' || row.kind === 'MESSAGE' ? 'high' : 'normal' },
          )
          ok = true
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          // 404/410: el navegador anuló la suscripción.
          if (status === 404 || status === 410) deadSubs.add(sub.id)
          else lastError = `${status ?? ''} ${(err as Error).message}`.trim().slice(0, 300)
        }
      }
      if (ok || !lastError) delivered.push(row.id)
      else errors.push({ id: row.id, error: lastError })
    }))

    if (delivered.length) {
      await admin.from('push_outbox').update({ sent_at: new Date().toISOString(), last_error: null }).in('id', delivered)
      sent += delivered.length
    }
    for (const e of errors) {
      await admin.from('push_outbox').update({ last_error: e.error }).eq('id', e.id)
      failed++
    }
    if (deadSubs.size) await admin.from('push_subscriptions').delete().in('id', [...deadSubs])
    if (rows.length < 300) break
  }

  // Limpieza: avisos enviados hace más de 30 días.
  await admin.from('push_outbox').delete().lt('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString())

  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } })
})
