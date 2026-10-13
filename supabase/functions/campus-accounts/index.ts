// ============================================================================
// Campus Virtual Tesla · Edge Function "campus-accounts"
//
// Crea cuentas de alumnos, familias y docentes, y restablece contraseñas.
// Solo la puede usar una cuenta con rol ADMIN o MANAGEMENT.
//
// Desplegar:
//   supabase functions deploy campus-accounts
//   supabase secrets set LOGIN_DOMAIN=campus.tesla.edu.pe
//   supabase secrets set CAMPUS_ALLOWED_ORIGINS=https://campus-tesla.netlify.app
//
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta
// Supabase automáticamente. La service role NUNCA sale de este servidor.
// ============================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOGIN_DOMAIN = (Deno.env.get('LOGIN_DOMAIN') ?? 'campus.tesla.edu.pe').toLowerCase()
const ALLOWED_ORIGINS = (Deno.env.get('CAMPUS_ALLOWED_ORIGINS') ?? '*').split(',').map((o) => o.trim()).filter(Boolean)

type Kind = 'STUDENT' | 'GUARDIAN' | 'TEACHER'
type Created = { kind: Kind; name: string; username: string; password: string; detail?: string }
type Skipped = { name: string; reason: string }

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// Contraseña temporal fácil de dictar: Palabra-1234 (sin letras confusas).
const WORDS = ['Chispa', 'Bobina', 'Voltio', 'Cometa', 'Prisma', 'Radar', 'Faro', 'Orbita', 'Nube', 'Condor', 'Puma', 'Andes', 'Lucuma', 'Quinua', 'Colibri', 'Vicuna']
function tempPassword(): string {
  const bytes = new Uint32Array(2)
  crypto.getRandomValues(bytes)
  const word = WORDS[bytes[0] % WORDS.length]
  const digits = String(1000 + (bytes[1] % 9000))
  return `${word}-${digits}`
}

function cleanName(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
}

function cleanDni(value: unknown): string | null {
  const dni = String(value ?? '').replace(/[\s.-]/g, '').toUpperCase()
  return /^[A-Z0-9]{8,12}$/.test(dni) ? dni : null
}

/** Busca un usuario de Auth por correo (recorre páginas; suficiente para un colegio). */
async function findUserIdByEmail(admin: SupabaseClient, email: string, cache: Map<string, string>): Promise<string | null> {
  if (cache.size === 0) {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw error
      for (const u of data.users) if (u.email) cache.set(u.email.toLowerCase(), u.id)
      if (data.users.length < 1000) break
    }
  }
  return cache.get(email.toLowerCase()) ?? null
}

async function createOrReuseUser(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  cache: Map<string, string>,
): Promise<{ id: string; password: string; reused: boolean }> {
  const password = tempPassword()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, must_change_password: true },
  })
  if (!error && data.user) return { id: data.user.id, password, reused: false }

  // Si ya existía (p. ej. un intento anterior a medias), reutilízalo con clave nueva.
  const msg = (error?.message ?? '').toLowerCase()
  if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
    const id = await findUserIdByEmail(admin, email, cache)
    if (!id) throw new Error('La cuenta ya existe pero no se pudo encontrar.')
    const upd = await admin.auth.admin.updateUserById(id, { password, user_metadata: { full_name: fullName, must_change_password: true } })
    if (upd.error) throw upd.error
    return { id, password, reused: true }
  }
  throw error ?? new Error('No se pudo crear la cuenta.')
}

async function linkAccount(admin: SupabaseClient, args: Record<string, unknown>) {
  const { error } = await admin.rpc('admin_link_account', args)
  if (error) throw error
}

// ----------------------------------------------------------------------------
// Acciones
// ----------------------------------------------------------------------------
async function classroomAccounts(admin: SupabaseClient, classroomId: number, includeGuardians: boolean) {
  const created: Created[] = []
  const skipped: Skipped[] = []
  const cache = new Map<string, string>()

  const { data: classroom } = await admin.from('classrooms').select('id, grade, section, level').eq('id', classroomId).maybeSingle()
  if (!classroom) throw new Error('El aula no existe.')
  const aula = `${classroom.grade ?? ''}.° ${classroom.section ?? ''} de ${classroom.level ?? ''}`.trim()

  const { data: students, error } = await admin
    .from('students')
    .select('id, first_name, last_name, dni, profile_id')
    .eq('classroom_id', classroomId)
    .order('last_name')
  if (error) throw error

  for (const s of students ?? []) {
    const name = cleanName(`${s.first_name ?? ''} ${s.last_name ?? ''}`)
    if (s.profile_id) continue
    const dni = cleanDni(s.dni)
    if (!dni) { skipped.push({ name, reason: 'no tiene DNI registrado en Tesla' }); continue }
    try {
      const user = await createOrReuseUser(admin, `alumno.${dni.toLowerCase()}@${LOGIN_DOMAIN}`, name, cache)
      await linkAccount(admin, { p_user_id: user.id, p_role: 'STUDENT', p_full_name: name, p_student_id: s.id, p_dni: dni })
      created.push({ kind: 'STUDENT', name, username: dni, password: user.password, detail: aula })
    } catch (err) {
      skipped.push({ name, reason: (err as Error).message })
    }
  }

  if (includeGuardians && students?.length) {
    const { data: links, error: linkError } = await admin
      .from('student_guardians')
      .select('student_id, guardian:guardians(id, full_name, dni, profile_id)')
      .in('student_id', students.map((s) => s.id))
    if (linkError) throw linkError

    const studentNames = new Map(students.map((s) => [s.id, cleanName(`${s.first_name ?? ''} ${s.last_name ?? ''}`)]))
    const seen = new Set<number>()
    for (const link of links ?? []) {
      // deno-lint-ignore no-explicit-any
      const g = (link as any).guardian as { id: number; full_name: string | null; dni: string | null; profile_id: string | null } | null
      if (!g || seen.has(g.id)) continue
      seen.add(g.id)
      if (g.profile_id) continue
      const name = cleanName(g.full_name) || 'Apoderado'
      const dni = cleanDni(g.dni)
      if (!dni) { skipped.push({ name, reason: 'el apoderado no tiene DNI registrado' }); continue }
      try {
        const user = await createOrReuseUser(admin, `familia.${dni.toLowerCase()}@${LOGIN_DOMAIN}`, name, cache)
        await linkAccount(admin, { p_user_id: user.id, p_role: 'GUARDIAN', p_full_name: name, p_guardian_id: g.id, p_dni: dni })
        created.push({ kind: 'GUARDIAN', name, username: dni, password: user.password, detail: `Familia de ${studentNames.get(link.student_id) ?? ''}` })
      } catch (err) {
        skipped.push({ name, reason: (err as Error).message })
      }
    }
  }

  return { created, skipped }
}

async function teacherAccount(admin: SupabaseClient, emailRaw: unknown, nameRaw: unknown) {
  const email = String(emailRaw ?? '').trim().toLowerCase()
  const name = cleanName(nameRaw)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El correo no es válido.')
  if (name.length < 3) throw new Error('Escribe el nombre completo del docente.')
  if (email.endsWith(`@${LOGIN_DOMAIN}`)) throw new Error('Usa el correo real del docente, no el dominio interno del campus.')

  const cache = new Map<string, string>()
  const existingId = await findUserIdByEmail(admin, email, cache)
  if (existingId) {
    const { data: profile } = await admin.from('profiles').select('role').eq('id', existingId).maybeSingle()
    if (profile && profile.role !== 'TEACHER') {
      return { created: [], skipped: [{ name, reason: `ese correo ya pertenece a una cuenta con rol ${profile.role}` }] }
    }
  }
  const user = await createOrReuseUser(admin, email, name, cache)
  await linkAccount(admin, { p_user_id: user.id, p_role: 'TEACHER', p_full_name: name })
  return { created: [{ kind: 'TEACHER' as Kind, name, username: email, password: user.password, detail: user.reused ? 'Cuenta existente: se generó una clave nueva' : undefined }], skipped: [] }
}

async function resetPassword(admin: SupabaseClient, profileId: unknown) {
  const id = String(profileId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Cuenta no válida.')
  const { data: profile } = await admin.from('profiles').select('id, full_name, role').eq('id', id).maybeSingle()
  if (!profile) throw new Error('La cuenta no existe.')
  if (!['STUDENT', 'GUARDIAN', 'TEACHER'].includes(profile.role)) {
    throw new Error('Las claves del personal administrativo se cambian desde Supabase.')
  }
  const { data: authUser, error } = await admin.auth.admin.getUserById(id)
  if (error || !authUser.user) throw new Error('La cuenta no existe en Auth.')
  const password = tempPassword()
  const upd = await admin.auth.admin.updateUserById(id, {
    password,
    user_metadata: { ...(authUser.user.user_metadata ?? {}), must_change_password: true },
  })
  if (upd.error) throw upd.error
  const email = authUser.user.email ?? ''
  const username = profile.role === 'TEACHER' ? email : email.split('@')[0].split('.').slice(1).join('.').toUpperCase()
  return {
    created: [{ kind: profile.role as Kind, name: profile.full_name ?? '', username, password, detail: 'Contraseña restablecida' }],
    skipped: [],
  }
}

// ----------------------------------------------------------------------------
// Servidor
// ----------------------------------------------------------------------------
Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, origin)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Inicia sesión.' }, 401, origin)

    // 1) ¿Quién llama?
    const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await caller.auth.getUser()
    if (userError || !userData.user) return json({ error: 'Tu sesión expiró. Vuelve a ingresar.' }, 401, origin)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: me } = await admin.from('profiles').select('role, is_active').eq('id', userData.user.id).maybeSingle()
    if (!me || !me.is_active || !['ADMIN', 'MANAGEMENT'].includes(me.role)) {
      return json({ error: 'Solo administración o dirección pueden gestionar cuentas.' }, 403, origin)
    }

    // 2) ¿Qué quiere hacer?
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    switch (body.action) {
      case 'classroom_accounts': {
        const classroomId = Number(body.classroom_id)
        if (!Number.isSafeInteger(classroomId) || classroomId <= 0) return json({ error: 'Aula no válida.' }, 400, origin)
        return json(await classroomAccounts(admin, classroomId, body.include_guardians !== false), 200, origin)
      }
      case 'teacher_account':
        return json(await teacherAccount(admin, body.email, body.full_name), 200, origin)
      case 'reset_password':
        return json(await resetPassword(admin, body.profile_id), 200, origin)
      default:
        return json({ error: 'Acción no reconocida.' }, 400, origin)
    }
  } catch (err) {
    console.error('[campus-accounts]', err)
    return json({ error: (err as Error).message || 'Error inesperado.' }, 500, origin)
  }
})
