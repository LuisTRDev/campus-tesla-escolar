import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import readXlsxFile from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { AlertCircle, CalendarPlus, Database, Download, FileSpreadsheet, Monitor, Search, ShieldCheck, Smartphone, Tablet, Trash2, Upload } from 'lucide-react'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Panel, Segmented, Select } from '@/components/ui'
import { StatTile } from '@/components/charts'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, formatTime } from '@/lib/format'
import { downloadText } from '@/lib/ux'
import { classroomLabel, listClassroomOfferings, listClassrooms, listSubjects, upsertOfferings } from '@/services/campus'
import { createBlock } from '@/services/calendario'
import { createStaff, listStaffAccounts, type Credential } from '@/services/cuentas'
import {
  AUDIT_ACTION_LABEL, PERMISSION_LABEL, clearClientErrors, exportYear, listAudit, listClientErrors, listPermissions, listYears, setPermission,
  startYear, usageSummary, type CampusPermission,
} from '@/services/gestion'
import { ROLE_LABELS, type Classroom } from '@/types'

type Tab = 'auditoria' | 'uso' | 'errores' | 'permisos' | 'carga' | 'anio' | 'respaldo'

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------
function AuditTab() {
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')
  const { data, loading, error, reload } = useAsync(() => listAudit({ action: action || undefined, search }), [action, search])
  return (
    <Panel title="Bitácora" action={
      <div className="flex flex-wrap gap-2">
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto py-1.5" aria-label="Tipo">
          <option value="">Todo</option>
          {Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <span className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-texto-suave" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" className="w-48 py-1.5 pl-8" /></span>
      </div>
    }>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? <Empty title="Sin registros" art="search" compact>Aquí aparecen los cambios de notas, borrados, claves restablecidas y permisos.</Empty> : (
        <ul className="divide-y divide-linea">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 py-2.5 text-sm">
              <span className="w-28 shrink-0 text-texto-suave tabular-nums">{formatShort(r.at)} {formatTime(r.at)}</span>
              <Badge tone={r.action === 'DELETE' ? 'alert' : r.action === 'GRADE' ? 'info' : 'neutral'}>{AUDIT_ACTION_LABEL[r.action] ?? r.action}</Badge>
              <span className="min-w-0 flex-1">{r.summary}</span>
              <span className="text-texto-suave">{r.actor_name ?? 'Sistema'}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Uso
// ---------------------------------------------------------------------------
const PATH_LABEL: Record<string, string> = {
  '/': 'Inicio', '/cursos': 'Cursos', '/curso/:id': 'Curso', '/tarea/:id': 'Tarea', '/tareas': 'Tareas', '/notas': 'Notas', '/agenda': 'Agenda',
  '/mensajes': 'Mensajes', '/comunicados': 'Comunicados', '/perfil-tesla': 'Perfil Tesla', '/libreta': 'Libreta', '/horario': 'Horario',
}

function UsageTab() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const { data, loading, error, reload } = useAsync(() => usageSummary(Number(days)), [days])
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="cards" />
  const maxUsers = Math.max(1, ...data.daily.map((d) => d.users))
  const devices = data.by_device
  const totalDev = Object.values(devices).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="space-y-6">
      <Segmented value={days} onChange={setDays} options={[{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: '90', label: '90 días' }]} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Personas activas" value={String(data.active_users)} detail={`de ${data.total_accounts} cuentas`} />
        <StatTile label="Usan la app instalada" value={String(data.installed)} />
        <StatTile label="Promedio diario" value={String(data.daily.length ? Math.round(data.daily.reduce((s, d) => s + d.users, 0) / data.daily.length) : 0)} detail="personas por día" />
      </div>
      <Panel title="Personas por día">
        {!data.daily.length ? <p className="text-sm text-texto-suave">Sin datos todavía.</p> : (
          <div className="flex h-40 items-end gap-1">
            {data.daily.map((d, i) => (
              <div key={d.day} className="group relative flex-1" title={`${formatShort(d.day)}: ${d.users} personas`}>
                <div className="bar-grow rounded-t bg-tinta-500" style={{ height: `${(d.users / maxUsers) * 150}px`, animationDelay: `${i * 15}ms` }} />
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Por rol">
          <ul className="space-y-1.5">
            {Object.entries(data.by_role).sort((a, b) => b[1] - a[1]).map(([role, n]) => (
              <li key={role} className="flex justify-between text-sm"><span>{ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}</span><b className="tabular-nums">{n}</b></li>
            ))}
          </ul>
          <div className="mt-4 flex gap-4 text-sm">
            <span className="flex items-center gap-1"><Smartphone className="h-4 w-4" />{Math.round(((devices.MOBILE ?? 0) / totalDev) * 100)}%</span>
            <span className="flex items-center gap-1"><Tablet className="h-4 w-4" />{Math.round(((devices.TABLET ?? 0) / totalDev) * 100)}%</span>
            <span className="flex items-center gap-1"><Monitor className="h-4 w-4" />{Math.round(((devices.DESKTOP ?? 0) / totalDev) * 100)}%</span>
          </div>
        </Panel>
        <Panel title="Pantallas más y menos usadas">
          <ul className="space-y-1 text-sm">
            {data.paths.slice(0, 8).map((p) => (
              <li key={p.path} className="flex justify-between gap-2"><span className="truncate">{PATH_LABEL[p.path] ?? p.path}</span><span className="tabular-nums text-texto-suave">{p.users} personas · {p.views}</span></li>
            ))}
          </ul>
          {data.paths.length > 8 && (
            <>
              <p className="mb-1 mt-3 text-xs font-bold uppercase text-texto-suave">Casi no se usan</p>
              <ul className="space-y-1 text-sm">
                {data.paths.slice(-5).reverse().map((p) => <li key={p.path} className="flex justify-between gap-2"><span className="truncate">{PATH_LABEL[p.path] ?? p.path}</span><span className="tabular-nums text-texto-suave">{p.views}</span></li>)}
              </ul>
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Errores de la app
// ---------------------------------------------------------------------------
function ErrorsTab() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(listClientErrors, [])
  const [open, setOpen] = useState<number | null>(null)
  return (
    <Panel title="Errores que vieron los usuarios" action={!!data?.length && (
      <Button size="sm" variant="ghost" onClick={async () => { if (confirm('¿Vaciar la lista?')) { await clearClientErrors().catch((e) => toast(toMessage(e), 'error')); void reload(true) } }}><Trash2 className="h-4 w-4" />Vaciar</Button>
    )}>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? <Empty title="Sin errores registrados" art="coil" compact>¡Todo en orden! Los fallos de la app se registran aquí automáticamente.</Empty> : (
        <ul className="divide-y divide-linea">
          {data.map((e) => (
            <li key={e.id} className="py-2.5 text-sm">
              <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-start gap-2 text-left">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-estado-alerta" />
                <span className="min-w-0 flex-1"><b className="block truncate">{e.message}</b><span className="text-texto-suave">{e.path} · {formatShort(e.created_at)} {formatTime(e.created_at)}</span></span>
              </button>
              {open === e.id && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-papel p-3 text-xs">{e.stack}{'\n\n'}{e.user_agent}{'\n'}{e.app_version}</pre>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Permisos del personal
// ---------------------------------------------------------------------------
function PermissionsTab() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(async () => {
    const [accounts, perms] = await Promise.all([listStaffAccounts(), listPermissions()])
    return { accounts: accounts.filter((a) => a.role !== 'STUDENT' && a.role !== 'GUARDIAN' && a.is_active), perms }
  }, [])
  const [q, setQ] = useState('')
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />
  const has = (id: string, p: CampusPermission) => data.perms.some((x) => x.profile_id === id && x.permission === p)
  const list = data.accounts.filter((a) => !q || (a.full_name ?? '').toLowerCase().includes(q.toLowerCase()))
  return (
    <Panel title="Permisos especiales" action={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona" className="w-48 py-1.5" />}>
      <ul className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
        {(Object.keys(PERMISSION_LABEL) as CampusPermission[]).map((p) => <li key={p} className="rounded-lg bg-papel p-2"><b>{PERMISSION_LABEL[p].name}:</b> {PERMISSION_LABEL[p].hint}</li>)}
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-texto-suave"><th className="py-2">Persona</th>{(Object.keys(PERMISSION_LABEL) as CampusPermission[]).map((p) => <th key={p} className="text-center">{PERMISSION_LABEL[p].name}</th>)}</tr></thead>
          <tbody className="divide-y divide-linea">
            {list.map((a) => (
              <tr key={a.profile_id}>
                <td className="py-2"><b>{a.full_name}</b> <span className="text-texto-suave">· {ROLE_LABELS[a.role]}</span></td>
                {(Object.keys(PERMISSION_LABEL) as CampusPermission[]).map((p) => (
                  <td key={p} className="text-center">
                    <input type="checkbox" checked={has(a.profile_id, p)} className="h-5 w-5 accent-[#0B1D33]" aria-label={`${PERMISSION_LABEL[p].name} para ${a.full_name}`}
                      onChange={async (e) => { try { await setPermission(a.profile_id, p, e.target.checked); void reload(true) } catch (err) { toast(toMessage(err), 'error') } }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Carga masiva por Excel
// ---------------------------------------------------------------------------
type ImportKind = 'docentes' | 'cursos' | 'horario'
const TEMPLATES: Record<ImportKind, { headers: string[]; example: string[][]; hint: string }> = {
  docentes: { headers: ['Correo', 'Nombre completo'], example: [['ana.torres@colegio.edu.pe', 'Ana Torres Ruiz']], hint: 'Crea las cuentas de docentes. Se descargan las contraseñas temporales.' },
  cursos: { headers: ['Grado', 'Sección', 'Nivel', 'Área', 'Correo del docente'], example: [['3', 'A', 'Secundaria', 'Matemática', 'ana.torres@colegio.edu.pe']], hint: 'Asigna áreas y docentes a cada aula del año actual.' },
  horario: { headers: ['Grado', 'Sección', 'Nivel', 'Día', 'Inicio', 'Fin', 'Área o actividad'], example: [['3', 'A', 'Secundaria', 'Lunes', '08:00', '08:45', 'Matemática'], ['3', 'A', 'Secundaria', 'Lunes', '10:15', '10:30', 'Recreo']], hint: 'Agrega bloques al horario semanal de cada aula.' },
}
const DAYS: Record<string, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 }
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

function parseCsv(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()))
}

function cellTime(v: unknown): string {
  if (typeof v === 'number') { const m = Math.round(v * 24 * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
  if (v instanceof Date) return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`
  const m = String(v ?? '').match(/(\d{1,2})[:.](\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

function BulkImportTab() {
  const toast = useToast()
  const [kind, setKind] = useState<ImportKind>('docentes')
  const [rows, setRows] = useState<unknown[][]>([])
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([])
  const [creds, setCreds] = useState<Credential[]>([])
  const t = TEMPLATES[kind]

  async function read(file: File | undefined) {
    if (!file) return
    try {
      const data = /\.csv$/i.test(file.name) ? parseCsv(await file.text()) : (await readXlsxFile(file))[0]?.data ?? []
      const body = (data as unknown[][]).filter((r) => r.some((c) => String(c ?? '').trim()))
      // Si la primera fila son encabezados, se salta.
      setRows(norm(body[0]?.[0]).startsWith(norm(t.headers[0]).slice(0, 4)) ? body.slice(1) : body)
      setLog([])
      setCreds([])
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  async function run() {
    setBusy(true)
    const out: { ok: boolean; text: string }[] = []
    const newCreds: Credential[] = []
    try {
      const [classrooms, subjects, staff] = await Promise.all([listClassrooms(), listSubjects(), listStaffAccounts()])
      const findRoom = (g: unknown, s: unknown, l: unknown): Classroom | undefined =>
        classrooms.find((c) => norm(c.grade).replace(/\D/g, '') === norm(g).replace(/\D/g, '') && norm(c.section) === norm(s) && norm(c.level) === norm(l))
      const findTeacher = (email: unknown) => staff.find((a) => norm(a.username) === norm(email) || norm(a.username) === norm(email).split('@')[0])
      const offeringsCache = new Map<number, Awaited<ReturnType<typeof listClassroomOfferings>>>()

      for (const [i, r] of rows.entries()) {
        const n = i + 1
        try {
          if (kind === 'docentes') {
            const res = await createStaff(String(r[0] ?? '').trim(), String(r[1] ?? '').trim(), 'TEACHER')
            newCreds.push(...res.created)
            out.push({ ok: true, text: `Fila ${n}: ${r[1]} creado.` })
          } else if (kind === 'cursos') {
            const room = findRoom(r[0], r[1], r[2])
            const subject = subjects.find((s) => norm(s.name) === norm(r[3]) && (!s.level || norm(s.level) === norm(r[2])))
            const teacher = r[4] ? findTeacher(r[4]) : undefined
            if (!room) throw new Error(`no existe el aula ${r[0]} ${r[1]} ${r[2]}`)
            if (!subject) throw new Error(`no existe el área «${r[3]}»`)
            if (r[4] && !teacher) throw new Error(`no hay docente con el correo ${r[4]}`)
            await upsertOfferings([{ classroom_id: room.id, subject_id: subject.id, teacher_id: teacher?.profile_id ?? null }], true)
            out.push({ ok: true, text: `Fila ${n}: ${subject.name} en ${classroomLabel(room)}.` })
          } else {
            const room = findRoom(r[0], r[1], r[2])
            if (!room) throw new Error(`no existe el aula ${r[0]} ${r[1]} ${r[2]}`)
            const day = typeof r[3] === 'number' ? r[3] : DAYS[norm(r[3])]
            if (!day) throw new Error(`día no válido «${r[3]}»`)
            if (!offeringsCache.has(room.id)) offeringsCache.set(room.id, await listClassroomOfferings(room.id))
            const offering = offeringsCache.get(room.id)!.find((o) => norm(o.subject.name) === norm(r[6]))
            await createBlock({ classroom_id: room.id, weekday: day, starts_at: cellTime(r[4]), ends_at: cellTime(r[5]), offering_id: offering?.id ?? null, label: offering ? null : String(r[6] ?? '') })
            out.push({ ok: true, text: `Fila ${n}: ${classroomLabel(room)} ${r[3]} ${cellTime(r[4])}.` })
          }
        } catch (err) {
          out.push({ ok: false, text: `Fila ${n}: ${toMessage(err)}` })
        }
        setLog([...out])
      }
      setCreds(newCreds)
      toast(`${out.filter((x) => x.ok).length} de ${rows.length} filas importadas.`)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Carga masiva desde Excel">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented value={kind} onChange={(v) => { setKind(v); setRows([]); setLog([]) }} options={[{ value: 'docentes', label: 'Docentes' }, { value: 'cursos', label: 'Cursos por aula' }, { value: 'horario', label: 'Horario' }]} />
        <Button size="sm" variant="secondary" onClick={() => void writeXlsxFile([t.headers.map((h) => ({ value: h, fontWeight: 'bold' as const })), ...t.example]).toFile(`plantilla-${kind}.xlsx`)}>
          <FileSpreadsheet className="h-4 w-4" />Descargar plantilla
        </Button>
      </div>
      <p className="mb-3 text-sm text-texto-suave">{t.hint} Columnas: <b>{t.headers.join(' · ')}</b>. Acepta .xlsx o .csv.</p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-linea px-4 py-3 text-sm font-bold hover:border-tinta-500">
        <Upload className="h-4 w-4" />Elegir archivo
        <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
      </label>
      {rows.length > 0 && (
        <>
          <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-linea">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-papel text-left text-xs"><tr>{t.headers.map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-linea">{rows.slice(0, 200).map((r, i) => <tr key={i}>{t.headers.map((_, j) => <td key={j} className="px-2 py-1">{String(r[j] ?? '')}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={() => void run()} loading={busy}><Upload className="h-4 w-4" />Importar {rows.length} filas</Button>
            {creds.length > 0 && (
              <Button variant="secondary" onClick={() => void writeXlsxFile([
                ['Nombre', 'Usuario', 'Contraseña temporal'].map((h) => ({ value: h, fontWeight: 'bold' as const })),
                ...creds.map((c) => [c.name, c.username, c.password ?? '']),
              ]).toFile('cuentas-docentes.xlsx')}><Download className="h-4 w-4" />Descargar contraseñas</Button>
            )}
          </div>
        </>
      )}
      {log.length > 0 && (
        <ul className="mt-4 max-h-60 space-y-0.5 overflow-auto text-sm">
          {log.map((l, i) => <li key={i} className={l.ok ? 'text-estado-ok' : 'text-estado-alerta'}>{l.ok ? '✓' : '✗'} {l.text}</li>)}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Año escolar y respaldo
// ---------------------------------------------------------------------------
function YearTab() {
  const toast = useToast()
  const { data: years, reload } = useAsync(listYears, [])
  const next = (years?.[0]?.year ?? new Date().getFullYear()) + 1
  const [f, setF] = useState({ year: next, starts: `${next}-03-01`, ends: `${next}-12-20`, copy: true })
  const [busy, setBusy] = useState(false)
  useEffect(() => setF((x) => ({ ...x, year: next, starts: `${next}-03-01`, ends: `${next}-12-20` })), [next])
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Iniciar un año escolar nuevo">
        <p className="mb-3 text-sm text-texto-suave">Crea el año, lo marca como actual y (si quieres) copia los cursos de cada aula con sus docentes. Todo lo del año anterior se conserva para consultas. El paso de los alumnos al grado siguiente se hace en Tesla.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Año"><Input type="number" value={f.year} onChange={(e) => setF({ ...f, year: Number(e.target.value) })} /></Field>
          <Field label="Inicio"><Input type="date" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></Field>
          <Field label="Fin"><Input type="date" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={f.copy} onChange={(e) => setF({ ...f, copy: e.target.checked })} className="h-4 w-4 accent-[#0B1D33]" />Copiar los cursos por aula y sus docentes</label>
        <div className="mt-4 flex justify-end">
          <Button loading={busy} onClick={async () => {
            if (!confirm(`¿Iniciar el año ${f.year}? El año actual pasará al historial.`)) return
            setBusy(true)
            try { const r = await startYear(f.year, f.starts, f.ends, f.copy); toast(`Año ${f.year} iniciado. ${r.offerings} cursos copiados. Crea sus bimestres en «Bimestres».`); void reload(true) } catch (err) { toast(toMessage(err), 'error') } finally { setBusy(false) }
          }}><CalendarPlus className="h-4 w-4" />Iniciar año {f.year}</Button>
        </div>
      </Panel>
      <Panel title="Años registrados">
        <ul className="divide-y divide-linea">
          {(years ?? []).map((y) => (
            <li key={y.id} className="flex items-center justify-between py-2 text-sm"><span><b>{y.name}</b> {y.starts_on && <span className="text-texto-suave">· {formatShort(y.starts_on)} – {y.ends_on ? formatShort(y.ends_on) : '…'}</span>}</span>{y.is_current && <Badge tone="ok">Actual</Badge>}</li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

function BackupTab() {
  const toast = useToast()
  const { data: years } = useAsync(listYears, [])
  const [yearId, setYearId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const id = yearId || years?.find((y) => y.is_current)?.id
  return (
    <Panel title="Respaldo de datos">
      <p className="mb-3 text-sm text-texto-suave">
        Descarga en un archivo todo lo del campus de un año: cursos, unidades, materiales, tareas, entregas, notas, libretas, anuncios, comunicados y observaciones.
        Guárdalo en un lugar seguro (por ejemplo, Google Drive del colegio). Los archivos adjuntos quedan en Supabase Storage.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Año">
          <Select value={id ?? ''} onChange={(e) => setYearId(Number(e.target.value))} className="w-56">
            {(years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        </Field>
        <Button disabled={!id} loading={busy} onClick={async () => {
          setBusy(true)
          try {
            const data = await exportYear(Number(id))
            downloadText(`respaldo-campus-${years?.find((y) => y.id === id)?.year ?? id}.json`, JSON.stringify(data, null, 1))
            toast('Respaldo descargado.')
          } catch (err) {
            toast(toMessage(err), 'error')
          } finally {
            setBusy(false)
          }
        }}><Database className="h-4 w-4" />Descargar respaldo</Button>
      </div>
      <p className="mt-4 text-xs text-texto-suave">Para un respaldo completo de la base (incluido Tesla), usa también las copias automáticas de Supabase (Project Settings → Database → Backups).</p>
    </Panel>
  )
}

export default function SystemPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('vista') as Tab) || 'auditoria'
  return (
    <>
      <PageHeader title="Sistema" subtitle="Auditoría, uso del campus, errores, permisos, carga masiva y respaldo." />
      <div className="mb-5 overflow-x-auto">
        <Segmented value={tab} onChange={(v) => setParams({ vista: v }, { replace: true })} options={[
          { value: 'auditoria', label: 'Auditoría' }, { value: 'uso', label: 'Uso' }, { value: 'errores', label: 'Errores' }, { value: 'permisos', label: 'Permisos' },
          { value: 'carga', label: 'Carga masiva' }, { value: 'anio', label: 'Año escolar' }, { value: 'respaldo', label: 'Respaldo' },
        ]} />
      </div>
      {tab === 'auditoria' && <AuditTab />}
      {tab === 'uso' && <UsageTab />}
      {tab === 'errores' && <ErrorsTab />}
      {tab === 'permisos' && <PermissionsTab />}
      {tab === 'carga' && <BulkImportTab />}
      {tab === 'anio' && <YearTab />}
      {tab === 'respaldo' && <BackupTab />}
      <p className="mt-6 flex items-center gap-1.5 text-xs text-texto-suave"><ShieldCheck className="h-4 w-4" />Solo la dirección ve esta sección.</p>
    </>
  )
}

