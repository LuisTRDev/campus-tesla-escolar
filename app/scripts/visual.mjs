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
const RPC = { tesla_profile: teslaProfile, tesla_classroom_profiles: [], tesla_constancy_board: [], integrity_overview: overview }

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
