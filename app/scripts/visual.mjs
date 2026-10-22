// Pruebas visuales del campus: captura las pantallas principales sobre `dist/` con datos
// de ejemplo (Supabase simulado) y las compara con las capturas aceptadas.
//
//   npm run build && npm run visual              → captura en visual/actual y compara con visual/base
//   npm run visual -- --actualizar               → acepta las capturas actuales como nueva base
//
// Usa Edge o Chrome instalados (o la ruta de BROWSER_PATH). La fecha se congela y las animaciones
// se apagan para que cada captura salga siempre igual en la misma máquina.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(ROOT, 'visual', 'actual')
const BASE = path.join(ROOT, 'visual', 'base')
const ACCEPT = process.argv.includes('--actualizar')
const PORT = 4190
const DEBUG_PORT = 9350
const FIXED_NOW = Date.parse('2026-10-16T20:00:00Z') // viernes 16 de octubre, 15:00 en Lima

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Falta dist/. Ejecuta primero: npm run build')
  process.exit(1)
}

// El proyecto de Supabase sale de .env.local (la clave de sesión usa su referencia).
const env = fs.existsSync(path.join(ROOT, '.env.local')) ? fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8') : ''
const REF = (env.match(/VITE_SUPABASE_URL=https?:\/\/([a-z0-9]+)\./) ?? [])[1] ?? 'proyecto'

const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const browserPath = BROWSERS.find((p) => fs.existsSync(p))
if (!browserPath) {
  console.error('No encontré Edge ni Chrome. Indica la ruta con BROWSER_PATH.')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Datos de ejemplo
// ---------------------------------------------------------------------------
const day = (d) => new Date(FIXED_NOW - d * 86_400_000).toISOString()
const USERS = {
  student: { id: 's1', full_name: 'Sofía Pérez', role: 'STUDENT' },
  teacher: { id: 't1', full_name: 'Tito Tutor', role: 'TEACHER' },
  guardian: { id: 'g1', full_name: 'Gloria Pérez', role: 'GUARDIAN' },
}
const room = { id: 1, grade: '3', section: 'A', level: 'Primaria', tutor_id: 't1' }
const students = [
  { id: 11, first_name: 'Sofía', last_name: 'Pérez Ramos', classroom_id: 1, classroom: room, profile_id: 's1', dni: '71234567' },
  { id: 12, first_name: 'Bruno', last_name: 'Díaz', classroom_id: 1, classroom: room, profile_id: 's2', dni: '72345678' },
]
const offering = { id: 1, classroom_id: 1, subject_id: 1, teacher_id: 't1', description: null, is_active: true, subject: { id: 1, name: 'Matemática', short_name: 'MAT', color: '#2563EB', level: 'Primaria' }, classroom: room }
const task = { id: 60, offering_id: 1, author_id: 't1', title: 'Ensayo sobre el agua', instructions: 'Escribe un ensayo sobre el ciclo del agua.', due_at: day(-3), grading_type: 'SCORE', max_score: 20, allow_late: true, status: 'PUBLISHED', kind: 'TASK', quiz_settings: {}, offering, is_group: false, rubric_id: null }
const schedule = [1, 2, 3, 4, 5].flatMap((d, i) => [
  { id: i * 3 + 1, classroom_id: 1, weekday: d, starts_at: '07:45:00', ends_at: '08:00:00', offering_id: null, label: 'Formación' },
  { id: i * 3 + 2, classroom_id: 1, weekday: d, starts_at: '08:00:00', ends_at: '09:30:00', offering_id: 1, label: null },
  { id: i * 3 + 3, classroom_id: 1, weekday: d, starts_at: '09:30:00', ends_at: '10:00:00', offering_id: null, label: 'Recreo' },
])
const circular = { id: 12, title: 'Paseo de integración', body: 'Estimadas familias:\n\nEl viernes realizaremos el paseo de integración.\n\nAtentamente.', published_at: day(1), author_id: 't1', response_type: 'READ', response_deadline: null, scope: 'SCHOOL', attachment_path: null, attachment_name: null, classroom_ids: null }
const teslaProfile = { student_id: 11, first_name: 'Sofía', last_name: 'Pérez Ramos', classroom_id: 1, classroom: '3.° A', xp: 1300, level: 14, level_xp: 300, next_level_xp: 500, is_self: true, can_manage: false, bio: null, hide_from_rankings: false, avatar: null, frame: null, banner: null, title: null, background: null, pin_levels: [10, 20, 30, 40], pins: [], counts: { total: 3, BRONZE: 2, SILVER: 1, GOLD: 0, PLATINUM: 0 }, coins: 120, sparks: 4, featured: [] }

// Expediente de ejemplo (Retrato Tesla, script 25): seis áreas, dos bimestres publicados y asistencia desde marzo.
const attDays = []
for (let d = new Date('2026-03-09T12:00:00Z'); d <= new Date('2026-10-15T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) continue
  const iso = d.toISOString().slice(0, 10)
  const n = d.getUTCDate() * 7 + d.getUTCMonth() * 3
  if (n % 29 === 0) continue
  attDays.push({ d: iso, s: n % 11 === 0 ? 'LATE' : 'ON_TIME' })
}
const area = (id, name, short, color, a, b) => ({ subject_id: id, name, short_name: short, color, periods: [{ number: 1, points: a, level: a >= 92.5 ? 'AD' : a >= 75 ? 'A' : a >= 52.5 ? 'B' : 'C' }, { number: 2, points: b, level: b >= 92.5 ? 'AD' : b >= 75 ? 'A' : b >= 52.5 ? 'B' : 'C' }] })
const expediente = {
  generated_at: new Date(FIXED_NOW).toISOString(),
  student: { id: 11, first_name: 'Sofía', last_name: 'Pérez Ramos', classroom: '3° A · Primaria', level: 'Primaria', tutor: 'Tito Tutor' },
  year: 2026,
  periods: [1, 2, 3, 4].map((n) => ({ number: n, name: ['I', 'II', 'III', 'IV'][n - 1] + ' Bimestre', starts_on: '2026-03-09', ends_on: '2026-05-08', is_published: n <= 2, is_current: n === 4 })),
  score: { value: 82, parts: [
    { key: 'rendimiento', label: 'Rendimiento', value: 88, weight: 45, detail: 'Niveles del último bimestre publicado' },
    { key: 'tareas', label: 'Tareas', value: 76, weight: 20, detail: '14 a tiempo, 3 tarde y 2 sin entregar de 19' },
    { key: 'asistencia', label: 'Asistencia', value: 91, weight: 20, detail: '120 puntuales y 9 tardanzas en 138 días de clase' },
    { key: 'constancia', label: 'Constancia', value: 62, weight: 15, detail: 'Racha de 4 tareas a tiempo y 90 XP en 30 días' },
  ] },
  grades: {
    areas: [
      area(1, 'Matemática', 'MAT', '#2563EB', 82, 96), area(2, 'Comunicación', 'COM', '#D63620', 88, 90), area(3, 'Inglés', 'ING', '#7C3AED', 70, 78),
      area(4, 'Ciencia y Tecnología', 'CYT', '#1E8E5A', 84, 88), area(5, 'Personal Social', 'PS', '#D99A1E', 92, 100), area(6, 'Arte y Cultura', 'ARTE', '#DB2777', 62, 66),
    ],
    periods: [{ number: 1, points: 79.7, level: 'A' }, { number: 2, points: 88, level: 'A' }], current: 88, previous: 79.7, graded_avg: 81,
  },
  attendance: { from: '2026-03-09', to: '2026-10-15', school_days: 138, on_time: 120, late: 9, justified: 2, absent: 7, days: attDays, holidays: ['2026-05-01', '2026-06-29', '2026-07-28', '2026-07-29', '2026-08-06', '2026-08-30', '2026-10-08'] },
  tasks: { expected: 19, on_time: 14, late: 3, missing: 2,
    pending: [{ id: 61, title: 'Maqueta del sistema solar', course: 'Ciencia y Tecnología', offering_id: 4, due_at: day(-3) }, { id: 62, title: 'Problemas de fracciones', course: 'Matemática', offering_id: 1, due_at: day(-6) }],
    overdue: [{ id: 58, title: 'Resumen de lectura', course: 'Comunicación', offering_id: 2, due_at: day(5) }] },
  tesla: { xp: 1300, level: 14, streak: 4, xp30: 90, achievements: 9, star: 'Estrella de Plata', level_xp: 1100, next_level_xp: 1300 + 200,
    recent: [{ name: 'Puntual de hierro', icon: 'Clock', rarity: 'SILVER', earned_at: day(3) }, { name: 'Racha de cinco', icon: 'Flame', rarity: 'BRONZE', earned_at: day(8) }, { name: 'Corazón Tesla', icon: 'Heart', rarity: 'GOLD', earned_at: day(15) }] },
  family: { circulars_unread: 1, circulars_to_answer: 1, circulars: [{ id: 12, title: 'Paseo de integración', published_at: day(1), read: false, needs_answer: true }],
    appointments: [{ id: 5, starts_at: new Date(FIXED_NOW + 4 * 86_400_000).toISOString(), mode: 'PRESENCIAL', location: 'Sala de tutoría', teacher: 'Tito Tutor' }],
    justifications_pending: 0,
    events: [{ id: 1, title: 'Examen bimestral de Matemática', kind: 'EXAM', starts_on: '2026-10-21', ends_on: '2026-10-21' }, { id: 2, title: 'Día del Logro', kind: 'ACTIVITY', starts_on: '2026-10-28', ends_on: '2026-10-28' }] },
  signals: { missing_14d: 2, late_14d: 2, low_30d: 0 },
}
const TABLES = {
  students, classrooms: [room], course_offerings: [offering], assignments: [task], submissions: [], academic_years: [{ id: 1 }],
  grading_periods: [], subjects: [], schedule_blocks: schedule, circulars: [circular], circular_recipients: [], achievements: [], student_achievements: [],
}
const overview = {
  scope: 'SCHOOL', since: day(30),
  quizzes: { total: 12, free: 0, standard: 7, strict: 5, custom: 0, with_code: 6, lock_device: 5, sequential: 5, block_paste: 5, fullscreen: 3, watermark: 10, shuffle: 9, pick: 1, time_limit: 8, close_on_leave: 5, hidden_answers: 6 },
  attempts: { total: 284, finished: 281, with_events: 71, events: 412, leaves: 96, leave_ms: 2954000, pastes: 23, copies: 17, fs_exits: 6, resizes: 9, multitab: 3, devices: 2, resumes: 14, offline: 11, auto_closed: 4, last_event: day(0.05) },
  submissions: { analyzed: 530, with_text: 310, writing_logged: 402, mostly_pasted: 19 },
  reviews: { reviewed: 12, false_positive: 8, confirmed: 3 },
}
const history = [['2026-09-07', 61], ['2026-09-14', 64], ['2026-09-21', 70], ['2026-09-28', 72], ['2026-10-05', 79], ['2026-10-12', 82]].map(([week, score]) => ({ week, score, parts: [] }))
const RPC = { child_overview: expediente, expediente_history: history, tesla_profile: teslaProfile, tesla_classroom_profiles: [], tesla_constancy_board: [], integrity_overview: overview }

// Pantallas: [nombre, ruta, usuario (null = sin sesión), opciones]
const PHONE = { width: 390, height: 844, mobile: true }
const SCREENS = [
  ['login', '/', null, {}],
  ['login-movil', '/', null, PHONE],
  ['alumno-inicio', '/', 'student', {}],
  ['alumno-inicio-movil', '/', 'student', PHONE],
  ['alumno-cursos', '/cursos', 'student', {}],
  ['alumno-tarea-movil', '/tarea/60', 'student', PHONE],
  ['alumno-horario', '/horario', 'student', {}],
  ['alumno-carnet', '/carnet', 'student', {}],
  ['alumno-perfil', '/perfil-tesla', 'student', {}],
  ['alumno-404', '/no-existe', 'student', {}],
  ['docente-inicio-oscuro', '/', 'teacher', { theme: 'dark' }],
  ['docente-comunicado', '/comunicados/12', 'teacher', {}],
  ['docente-alto-contraste', '/horario', 'teacher', { contrast: true }],
  ['docente-antitrampa', '/anti-trampa', 'teacher', {}],
  ['familia-retrato', '/expediente', 'guardian', {}],
  ['familia-retrato-movil', '/expediente', 'guardian', PHONE],
  ['familia-retrato-oscuro', '/expediente', 'guardian', { theme: 'dark' }],
]

// ---------------------------------------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/json' }
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const file = path.join(DIST, p)
  if (p !== '/' && file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' })
    return res.end(fs.readFileSync(file))
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(fs.readFileSync(path.join(DIST, 'index.html')))
}).listen(PORT)

const jwt = (sub) => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256' })}.${b({ sub, role: 'authenticated', exp: Math.floor(FIXED_NOW / 1000) + 3600 })}.firma`
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-visual-'))
const edge = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null })

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const errors = []

for (const [name, route, who, opts] of SCREENS) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  await page.setViewport({ width: opts.width ?? 1360, height: opts.height ?? 900, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: opts.mobile ? 2 : 1 })
  await page.setBypassServiceWorker(true)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (!url.host.includes('supabase.co')) return req.continue()
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' }
    if (req.method() === 'OPTIONS') return req.respond({ status: 200, headers, body: '' })
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?(\w+)/)
    let body = null
    if (m?.[1]) body = RPC[m[2]] ?? null
    else if (m && req.method() === 'GET') {
      body = m[2] === 'profiles' ? (who ? [USERS[who]] : []) : TABLES[m[2]] ?? []
      for (const [k, v] of url.searchParams) {
        if (/^(select|order|limit|offset|or)$/.test(k) || !v.startsWith('eq.') || k.includes('.')) continue
        body = body.filter((r) => r[k] === undefined || String(r[k]) === v.slice(3))
      }
    } else if (m) body = []
    const single = (req.headers().accept ?? '').includes('vnd.pgrst.object')
    return req.respond({ status: 200, headers, body: JSON.stringify(single && Array.isArray(body) ? body[0] ?? null : body) })
  })
  await page.evaluateOnNewDocument((ref, token, user, now, theme, contrast) => {
    // Fecha congelada: los saludos, vencimientos y el día de hoy salen siempre iguales.
    const Real = Date
    const offset = now - Real.now()
    class FixedDate extends Real {
      constructor(...a) { super(...(a.length ? a : [Real.now() + offset])) }
      static now() { return Real.now() + offset }
    }
    window.Date = FixedDate
    // Intl.DateTimeFormat#format() sin fecha usa el reloj real: también se congela.
    const proto = Intl.DateTimeFormat.prototype
    const formatGetter = Object.getOwnPropertyDescriptor(proto, 'format').get
    const formatToParts = proto.formatToParts
    Object.defineProperty(proto, 'format', { configurable: true, get() { const f = formatGetter.call(this); return (d) => f(d === undefined ? new FixedDate() : d) } })
    proto.formatToParts = function (d) { return formatToParts.call(this, d === undefined ? new FixedDate() : d) }
    localStorage.clear()
    localStorage.setItem('campus_theme', theme)
    localStorage.setItem('campus-reading', JSON.stringify({ reduceMotion: true, highContrast: contrast }))
    localStorage.setItem('campus-install-dismissed', String(now))
    if (user) {
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now / 1000) + 3600, user: { id: user.id, aud: 'authenticated', user_metadata: {} } }))
      localStorage.setItem(`campus_tour_done_${user.id}`, '1')
    }
  }, REF, who ? jwt(USERS[who].id) : '', who ? USERS[who] : null, FIXED_NOW, opts.theme ?? 'light', !!opts.contrast)
  try { await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle0', timeout: 30_000 }) } catch (e) { errors.push(`${name}: ${e.message}`) }
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !opts.mobile })
  await page.close()
  process.stdout.write('.')
}

await browser.close()
edge.kill()
server.close()
// Edge tarda en soltar su carpeta de perfil: se intenta borrar, y si sigue ocupada se deja en la carpeta temporal.
try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) } catch { /* nada */ }
console.log(`\n${SCREENS.length} pantallas capturadas en visual/actual`)

if (ACCEPT || !fs.existsSync(BASE)) {
  fs.rmSync(BASE, { recursive: true, force: true })
  fs.cpSync(OUT, BASE, { recursive: true })
  console.log('Capturas aceptadas como base en visual/base.')
} else {
  const changed = SCREENS.map(([n]) => n).filter((n) => {
    const a = path.join(OUT, `${n}.png`)
    const b = path.join(BASE, `${n}.png`)
    return !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b))
  })
  console.log(changed.length ? `Cambiaron ${changed.length}: ${changed.join(', ')}\nRevísalas y, si están bien, ejecuta: npm run visual -- --actualizar` : 'Sin cambios respecto a la base.')
}
if (errors.length) {
  console.error(`\nErrores en la página:\n${errors.join('\n')}`)
  process.exitCode = 1
}
process.exit()
