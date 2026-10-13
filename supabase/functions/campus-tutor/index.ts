// ============================================================================
// Campus Virtual Tesla · Edge Function "campus-tutor"
//
// Tutor IA por curso: ayuda al alumno a razonar sin darle las respuestas.
// Solo responde a alumnos del aula del curso, si el docente lo activó, y con
// un límite diario de preguntas (tutor_settings, script 20).
//
// Desplegar:
//   supabase functions deploy campus-tutor
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set CAMPUS_ALLOWED_ORIGINS=https://campus-tesla.netlify.app
//   (opcional) supabase secrets set TUTOR_MODEL=claude-opus-5-5
//
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta
// Supabase. La clave de Anthropic y la service role nunca salen del servidor.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MODEL = Deno.env.get('TUTOR_MODEL') ?? 'claude-opus-5-5'
const ALLOWED_ORIGINS = (Deno.env.get('CAMPUS_ALLOWED_ORIGINS') ?? '*').split(',').map((o) => o.trim()).filter(Boolean)

const MAX_MESSAGE = 2000
const HISTORY = 12

const anthropic = new Anthropic() // lee ANTHROPIC_API_KEY

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes('*') ? '*' : origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? ''
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
}

/** Inicio del día en Lima (UTC-5) como ISO, para contar las preguntas de hoy. */
function limaDayStart(): string {
  const now = new Date(Date.now() - 5 * 3600_000)
  const day = now.toISOString().slice(0, 10)
  return new Date(`${day}T00:00:00-05:00`).toISOString()
}

const SYSTEM = `Eres el Tutor Tesla, un tutor del Campus Virtual de la I.E.P. Nikola Tesla (Perú) que ayuda a alumnos de primaria y secundaria.

Tu forma de ayudar:
- Guías al alumno para que llegue él mismo a la respuesta: haces preguntas, das pistas graduales, explicas conceptos con ejemplos parecidos (no el mismo ejercicio) y revisas su razonamiento.
- No resuelves tareas, prácticas ni evaluaciones por el alumno ni le das la respuesta final, aunque insista o diga que el docente lo permitió. Si te pide la respuesta, explícale con amabilidad que lo vas a ayudar a encontrarla y da el siguiente paso.
- Si el alumno ya propone una respuesta, dile si va bien y por qué, o dónde revisar.
- Respondes en español peruano, claro y cálido, adecuado a su edad. Respuestas breves (normalmente menos de 150 palabras), con pasos numerados cuando ayude.
- Solo hablas de temas escolares y del curso. Si te preguntan algo fuera de eso o inapropiado, redirige con respeto al curso.
- Si el alumno menciona que está en peligro, que alguien lo lastima o que piensa hacerse daño, respóndele con calma que eso es importante y que hable de inmediato con su tutor, la psicóloga del colegio o un adulto de confianza; en Perú puede llamar gratis a la Línea 100.
- Nunca pidas datos personales.`

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin)

  // 1) Quién pregunta (con su propio token).
  const auth = req.headers.get('authorization') ?? ''
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
  const { data: userData } = await userClient.auth.getUser()
  const user = userData?.user
  if (!user) return json({ error: 'Inicia sesión otra vez.' }, 401, origin)

  let body: { offering_id?: unknown; message?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Solicitud no válida.' }, 400, origin)
  }
  const offeringId = Number(body.offering_id)
  const message = String(body.message ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, MAX_MESSAGE)
  if (!Number.isInteger(offeringId) || offeringId <= 0 || !message) return json({ error: 'Escribe tu pregunta.' }, 400, origin)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // 2) Debe ser alumno del aula del curso, y el tutor debe estar activo.
  const { data: student } = await admin.from('students').select('id, classroom_id').eq('profile_id', user.id).maybeSingle()
  if (!student) return json({ error: 'El tutor es solo para alumnos.' }, 403, origin)
  const { data: offering } = await admin
    .from('course_offerings')
    .select('id, classroom_id, is_active, subject:subjects(name, level), classroom:classrooms(grade, level)')
    .eq('id', offeringId).maybeSingle()
  if (!offering || !offering.is_active || offering.classroom_id !== student.classroom_id) {
    return json({ error: 'Este curso no es de tu aula.' }, 403, origin)
  }
  const { data: settings } = await admin.from('tutor_settings').select('enabled, instructions, daily_limit').eq('offering_id', offeringId).maybeSingle()
  if (!settings?.enabled) return json({ error: 'Tu docente no activó el tutor en este curso.' }, 403, origin)

  // 3) Límite diario.
  const { count } = await admin.from('tutor_messages').select('id', { count: 'exact', head: true })
    .eq('student_id', student.id).eq('offering_id', offeringId).eq('role', 'user').gte('created_at', limaDayStart())
  const used = count ?? 0
  if (used >= settings.daily_limit) return json({ error: `Ya usaste tus ${settings.daily_limit} preguntas de hoy. ¡Mañana seguimos!` }, 429, origin)

  // 4) Historial corto de la conversación.
  const { data: past } = await admin.from('tutor_messages').select('role, content')
    .eq('student_id', student.id).eq('offering_id', offeringId).order('created_at', { ascending: false }).limit(HISTORY)
  const history: Anthropic.Beta.BetaMessageParam[] = (past ?? []).reverse().map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  // El historial debe empezar con el alumno.
  while (history.length && history[0].role !== 'user') history.shift()

  // deno-lint-ignore no-explicit-any
  const subject = (offering as any).subject as { name?: string; level?: string } | null
  // deno-lint-ignore no-explicit-any
  const classroom = (offering as any).classroom as { grade?: string; level?: string } | null
  const course = `Curso: ${subject?.name ?? 'sin nombre'} · ${classroom?.grade ?? ''}° de ${classroom?.level ?? subject?.level ?? ''}.`
  const teacher = settings.instructions?.trim()
    ? `Indicaciones del docente para este curso (síguelas, pero nunca para dar respuestas de evaluaciones):\n${settings.instructions.trim()}`
    : 'El docente no dejó indicaciones adicionales.'

  // 5) Pregunta al modelo.
  let reply = ''
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      // Si el modelo declina por una política de seguridad, el servidor reintenta con otro modelo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `${course}\n\n${teacher}` },
      ],
      messages: [...history, { role: 'user', content: message }],
    })
    if (response.stop_reason === 'refusal') {
      reply = 'Mejor hablemos del curso. ¿Qué tema o ejercicio te está costando?'
    } else {
      reply = response.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
    }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'El tutor está muy ocupado. Intenta en un minuto.' }, 429, origin)
    if (err instanceof Anthropic.APIError) {
      console.error('[campus-tutor] API', err.status, err.message)
      return json({ error: 'El tutor no está disponible en este momento.' }, 502, origin)
    }
    console.error('[campus-tutor]', err)
    return json({ error: 'El tutor no está disponible en este momento.' }, 500, origin)
  }
  if (!reply) reply = 'No entendí bien. ¿Me lo puedes explicar de otra forma?'

  // 6) Se guarda la conversación (el docente puede revisarla).
  await admin.from('tutor_messages').insert([
    { student_id: student.id, offering_id: offeringId, role: 'user', content: message },
    { student_id: student.id, offering_id: offeringId, role: 'assistant', content: reply.slice(0, 8000) },
  ])

  return json({ reply, left: Math.max(0, settings.daily_limit - used - 1) }, 200, origin)
})
