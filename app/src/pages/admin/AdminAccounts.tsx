import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, Download, KeyRound, Pencil, Power, Printer, UserPlus, Users } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Select } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { classroomLabel, listClassrooms } from '@/services/campus'
import {
  classroomRoster, createClassroomAccounts, createStaff, listStaffAccounts, resetPassword, setAccountActive, studentCode, updateAccount,
  type Credential, type CredentialsResult, type RosterRow, type StaffAccount,
} from '@/services/cuentas'
import { ROLE_LABELS, type Role } from '@/types'

type Tab = 'familias' | 'docentes' | 'personal'

const LOGIN_TAB: Partial<Record<Role, string>> = { STUDENT: 'Alumno', GUARDIAN: 'Familia' }
const isCode = (u: string) => /^A\d{7}$/.test(u)

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function userLabel(c: Credential) {
  if (c.kind === 'STUDENT') return isCode(c.username) ? 'Código' : 'DNI'
  if (c.kind === 'GUARDIAN') return 'DNI'
  return 'Correo'
}

function downloadCsv(result: CredentialsResult) {
  const header = ['Tipo', 'Nombre', 'Pestaña del login', 'Usuario', 'Contraseña temporal', 'Detalle']
  const rows = result.created.map((r) => [ROLE_LABELS[r.kind], r.name, LOGIN_TAB[r.kind] ?? 'Docente', r.username, r.password ?? '(no cambia)', r.detail ?? ''])
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `cuentas-campus-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Hoja con fichas recortables para entregar a cada persona. */
function printSlips(result: CredentialsResult) {
  const w = window.open('', '_blank')
  if (!w) return
  const site = window.location.origin
  const slips = result.created.map((r) => `
    <div class="slip">
      <p class="kind">${escapeHtml(ROLE_LABELS[r.kind])}</p>
      <p class="name">${escapeHtml(r.name)}</p>
      ${r.detail ? `<p class="detail">${escapeHtml(r.detail)}</p>` : ''}
      <table>
        <tr><td>Ingresa en</td><td><b>${escapeHtml(site)}</b></td></tr>
        <tr><td>Pestaña</td><td><b>${escapeHtml(LOGIN_TAB[r.kind] ?? 'Docente')}</b></td></tr>
        <tr><td>${escapeHtml(userLabel(r))}</td><td><b>${escapeHtml(r.username)}</b></td></tr>
        <tr><td>Contraseña</td><td><b class="pw">${escapeHtml(r.password ?? 'la misma de siempre')}</b></td></tr>
      </table>
      <p class="note">Al ingresar por primera vez te pediremos crear una contraseña nueva.</p>
    </div>`).join('')
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cuentas del Campus Tesla</title>
    <style>
      body{font-family:Arial,sans-serif;margin:16px;color:#0B1D33}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .slip{border:1.5px dashed #9AA8BC;border-radius:8px;padding:12px 14px;break-inside:avoid}
      .kind{margin:0;font-size:11px;font-weight:bold;color:#5B6B82}
      .name{margin:2px 0 0;font-size:16px;font-weight:bold}
      .detail{margin:2px 0 0;font-size:12px;color:#5B6B82}
      table{margin-top:8px;font-size:13px;border-collapse:collapse}
      td{padding:2px 10px 2px 0;vertical-align:top}
      .pw{font-family:monospace;font-size:15px;letter-spacing:.5px}
      .note{margin:8px 0 0;font-size:11px;color:#5B6B82}
    </style></head><body><div class="grid">${slips}</div></body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

function ResultPanel({ result, onClose }: { result: CredentialsResult; onClose: () => void }) {
  return (
    <Panel title="Credenciales" className="border-chispa" action={<Button size="sm" variant="ghost" onClick={onClose}>Ocultar</Button>}>
      {result.created.length > 0 ? (
        <>
          <p className="mb-4 rounded-lg bg-chispa-100 px-4 py-3 text-sm text-tinta">
            Imprime o descarga estas credenciales ahora: las contraseñas no se vuelven a mostrar. Cada persona deberá cambiarla al ingresar.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => printSlips(result)}><Printer className="h-4 w-4" />Imprimir fichas</Button>
            <Button size="sm" variant="secondary" onClick={() => downloadCsv(result)}><Download className="h-4 w-4" />Descargar CSV</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-colegio w-full min-w-[36rem] text-left text-sm">
              <thead className="text-texto-suave">
                <tr><th className="py-2 pr-4">Tipo</th><th className="py-2 pr-4">Nombre</th><th className="py-2 pr-4">Usuario</th><th className="py-2">Contraseña temporal</th></tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {result.created.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4">{ROLE_LABELS[r.kind]}</td>
                    <td className="py-2 pr-4 font-bold">{r.name}{r.detail && <span className="block text-xs font-normal text-texto-suave">{r.detail}</span>}</td>
                    <td className="py-2 pr-4">{r.username}<span className="block text-xs text-texto-suave">pestaña {LOGIN_TAB[r.kind] ?? 'Docente'}</span></td>
                    <td className="py-2 font-mono">{r.password ?? <span className="font-sans text-texto-suave">no cambia</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="text-sm text-texto-suave">No se creó ninguna cuenta nueva.</p>}
      {result.skipped.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-bold">No se crearon ({result.skipped.length})</p>
          <ul className="space-y-1 text-sm text-texto-suave">
            {result.skipped.map((s, i) => <li key={i}><b className="text-texto">{s.name}</b>: {s.reason}</li>)}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function lastSeen(at: string | null) {
  return at ? `Último ingreso: ${formatShort(at)}` : 'Nunca ingresó'
}

// ---------------------------------------------------------------------------
// Alumnos y familias por aula
// ---------------------------------------------------------------------------
function FamiliesTab({ onResult, onReset }: { onResult: (r: CredentialsResult) => void; onReset: (id: string, name: string) => void }) {
  const toast = useToast()
  const classrooms = useAsync(listClassrooms, [])
  const [classroomId, setClassroomId] = useState<number | null>(null)
  useEffect(() => {
    if (!classroomId && classrooms.data?.length) setClassroomId(classrooms.data[0].id)
  }, [classrooms.data, classroomId])
  const roster = useAsync(async () => (classroomId ? classroomRoster(classroomId) : []), [classroomId])
  const [includeGuardians, setIncludeGuardians] = useState(true)
  const [busy, setBusy] = useState(false)

  const rows = roster.data ?? []
  const students = rows.filter((r) => r.kind === 'STUDENT')
  const guardians = rows.filter((r) => r.kind === 'GUARDIAN')
  const missing = students.filter((s) => !s.profile_id).length + (includeGuardians ? guardians.filter((g) => !g.profile_id && g.dni).length : 0)
  const toDni = students.filter((s) => s.profile_id && s.dni && s.username && isCode(s.username)).length

  async function onBulk() {
    if (!classroomId) return
    setBusy(true)
    try {
      onResult(await createClassroomAccounts(classroomId, includeGuardians))
      void roster.reload(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(r: RosterRow) {
    const active = r.is_active === false
    const undo = roster.mutate((cur) => cur && cur.map((x) => (x.profile_id === r.profile_id ? { ...x, is_active: active } : x)))
    try {
      await setAccountActive(r.profile_id!, active)
      toast(active ? 'Cuenta reactivada.' : 'Cuenta desactivada: ya no puede ingresar.')
    } catch (err) {
      undo()
      toast(toMessage(err), 'error')
    }
  }

  function status(r: RosterRow) {
    if (r.profile_id) {
      if (r.is_active === false) return <Badge tone="alert">Desactivada</Badge>
      return <Badge tone="ok">Con cuenta</Badge>
    }
    if (r.kind === 'GUARDIAN' && !r.dni) return <Badge tone="alert">Falta DNI</Badge>
    if (r.kind === 'STUDENT' && !r.dni) return <Badge tone="spark">Usará código</Badge>
    return <Badge>Sin cuenta</Badge>
  }

  const row = (r: RosterRow) => (
    <li key={`${r.kind}${r.person_id}`} className={cn('flex flex-wrap items-center gap-3 py-3', r.is_active === false && 'opacity-60')}>
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-bold">{r.name}</p>
        <p className="text-xs text-texto-suave">
          {r.kind === 'GUARDIAN' && r.student_name ? `de ${r.student_name} · ` : ''}
          {r.dni ? `DNI ${r.dni}` : 'Sin DNI en Tesla'}
          {r.profile_id && <> · usuario <b className="text-texto">{r.username}</b> · {lastSeen(r.last_sign_in_at)}</>}
          {!r.profile_id && r.kind === 'STUDENT' && !r.dni && <> · recibirá el código <b className="text-texto">{studentCode(r.person_id)}</b></>}
        </p>
      </div>
      {status(r)}
      {r.profile_id && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onReset(r.profile_id!, r.name)}><KeyRound className="h-4 w-4" />Nueva clave</Button>
          <Button size="sm" variant="ghost" onClick={() => void toggle(r)} aria-label={r.is_active === false ? 'Reactivar' : 'Desactivar'}>
            <Power className="h-4 w-4" />{r.is_active === false ? 'Reactivar' : 'Desactivar'}
          </Button>
        </div>
      )}
    </li>
  )

  return (
    <Panel title="Alumnos y familias por aula">
      {classrooms.error && <ErrorBox message={classrooms.error} />}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Aula" className="min-w-[14rem] flex-1">
          <Select value={classroomId ?? ''} onChange={(e) => setClassroomId(Number(e.target.value))}>
            {(classrooms.data ?? []).map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </Select>
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={includeGuardians} onChange={(e) => setIncludeGuardians(e.target.checked)} className="h-4 w-4 accent-tinta" />
          Incluir familias
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={() => void onBulk()} loading={busy} disabled={!missing && !toDni}>
          <Users className="h-4 w-4" />
          {missing ? `Crear ${missing} cuenta${missing === 1 ? '' : 's'} faltante${missing === 1 ? '' : 's'}` : toDni ? `Pasar ${toDni} código${toDni === 1 ? '' : 's'} a DNI` : 'Todas las cuentas creadas'}
        </Button>
        <span className="text-sm text-texto-suave">Solo se crean las que faltan. Los alumnos sin DNI reciben un código provisional.</span>
      </div>
      {toDni > 0 && missing > 0 && <p className="mt-2 text-sm text-texto-suave">Además, {toDni} alumno{toDni === 1 ? '' : 's'} ya tiene{toDni === 1 ? '' : 'n'} DNI: su usuario pasará del código al DNI (sin cambiar la clave).</p>}

      {roster.loading ? <Loading /> : roster.error ? <div className="mt-4"><ErrorBox message={roster.error} /></div> : (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="mb-1 text-sm font-bold text-texto-suave">Alumnos ({students.length})</h3>
            {students.length === 0 ? <p className="text-sm text-texto-suave">El aula no tiene alumnos en Tesla.</p> : <ul className="divide-y divide-linea">{students.map(row)}</ul>}
          </div>
          {includeGuardians && (
            <div>
              <h3 className="mb-1 text-sm font-bold text-texto-suave">Familias ({guardians.length})</h3>
              {guardians.length === 0 ? <p className="text-sm text-texto-suave">No hay apoderados registrados en Tesla para esta aula.</p> : <ul className="divide-y divide-linea">{guardians.map(row)}</ul>}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Docentes y personal
// ---------------------------------------------------------------------------
const STAFF_ROLES: Role[] = ['ADMIN', 'MANAGEMENT', 'AUXILIARY']

function EditAccount({ account, onDone }: { account: StaffAccount; onDone: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(account.full_name ?? '')
  const [email, setEmail] = useState(account.username)
  const [busy, setBusy] = useState(false)
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await updateAccount(account.profile_id, name, email !== account.username ? email : undefined)
      toast('Datos actualizados.')
      onDone()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nombre completo"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></Field>
      <Field label="Correo" hint="Si lo cambias, la persona ingresará con el correo nuevo y la misma contraseña.">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <div className="flex justify-end"><Button type="submit" loading={busy}>Guardar</Button></div>
    </form>
  )
}

function StaffTab({ mode, onResult, onReset }: { mode: 'docentes' | 'personal'; onResult: (r: CredentialsResult) => void; onReset: (id: string, name: string) => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const { data, loading, error, reload, mutate } = useAsync(listStaffAccounts, [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>(mode === 'docentes' ? 'TEACHER' : 'AUXILIARY')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<StaffAccount | null>(null)
  const [query, setQuery] = useState('')

  const rows = (data ?? [])
    .filter((a) => (mode === 'docentes' ? a.role === 'TEACHER' : STAFF_ROLES.includes(a.role)))
    .filter((a) => !query.trim() || `${a.full_name} ${a.username}`.toLowerCase().includes(query.trim().toLowerCase()))

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      onResult(await createStaff(email, name, mode === 'docentes' ? 'TEACHER' : role))
      setName('')
      setEmail('')
      void reload(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(a: StaffAccount) {
    const active = !a.is_active
    if (!active && !confirm(`¿Desactivar la cuenta de ${a.full_name}? No podrá ingresar al campus ni a Tesla.`)) return
    const undo = mutate((cur) => cur && cur.map((x) => (x.profile_id === a.profile_id ? { ...x, is_active: active } : x)))
    try {
      await setAccountActive(a.profile_id, active)
      toast(active ? 'Cuenta reactivada.' : 'Cuenta desactivada.')
    } catch (err) {
      undo()
      toast(toMessage(err), 'error')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.7fr]">
      <Panel title={mode === 'docentes' ? 'Nuevo docente' : 'Nueva cuenta del personal'} className="h-fit">
        <form onSubmit={onCreate} className="space-y-4">
          <Field label="Nombre completo"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></Field>
          <Field label="Correo" hint="Con este correo ingresará (pestaña Docente).">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {mode === 'personal' && (
            <Field label="Rol" hint={role === 'AUXILIARY' ? 'Solo consulta: ve cursos, asistencia y comunicados.' : 'Gestiona cursos, cuentas, bimestres y el panel. También tiene acceso completo a Tesla.'}>
              <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </Field>
          )}
          <Button type="submit" loading={busy}><UserPlus className="h-4 w-4" />Crear cuenta</Button>
        </form>
      </Panel>

      <Panel
        title={`${mode === 'docentes' ? 'Docentes' : 'Personal'} (${rows.length})`}
        action={<Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="w-40 py-1.5 text-sm sm:w-56" />}
        bodyClassName="p-0"
      >
        {error && <div className="p-5"><ErrorBox message={error} onRetry={() => void reload()} /></div>}
        {loading ? <div className="px-5"><Loading /></div> : rows.length === 0 ? (
          <div className="p-5"><Empty title={query ? 'Sin resultados' : 'Aún no hay cuentas'} art="notebook" compact /></div>
        ) : (
          <ul className="divide-y divide-linea">
            {rows.map((a) => (
              <li key={a.profile_id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3.5', !a.is_active && 'opacity-60')}>
                <div className="min-w-[12rem] flex-1">
                  <p className="font-bold">{a.full_name}{a.profile_id === profile?.id && <span className="ml-1 font-normal text-texto-suave">(tú)</span>}</p>
                  <p className="text-xs text-texto-suave">
                    {a.username} · {mode === 'personal' ? `${ROLE_LABELS[a.role]} · ` : ''}{lastSeen(a.last_sign_in_at)}
                  </p>
                  {mode === 'docentes' && (
                    <p className="mt-0.5 text-xs text-texto-suave">
                      {a.offerings} curso{a.offerings === 1 ? '' : 's'}{a.tutor_of ? ` · tutor de ${a.tutor_of} aula${a.tutor_of === 1 ? '' : 's'}` : ''}
                    </p>
                  )}
                </div>
                {!a.is_active && <Badge tone="alert">Desactivada</Badge>}
                <div className="flex flex-wrap gap-1">
                  {mode === 'docentes' && (
                    <Link to={`/admin/cursos?vista=docente&docente=${a.profile_id}`}>
                      <Button size="sm" variant="ghost"><BookOpen className="h-4 w-4" />Cursos</Button>
                    </Link>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label={`Editar ${a.full_name}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => onReset(a.profile_id, a.full_name ?? '')}><KeyRound className="h-4 w-4" />Nueva clave</Button>
                  {a.profile_id !== profile?.id && (
                    <Button size="sm" variant="ghost" onClick={() => void toggle(a)}><Power className="h-4 w-4" />{a.is_active ? 'Desactivar' : 'Reactivar'}</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Editar ${editing.full_name}` : ''}>
        {editing && <EditAccount key={editing.profile_id} account={editing} onDone={() => { setEditing(null); void reload(true) }} />}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function AdminAccounts() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('vista') as Tab) || 'familias'
  const [result, setResult] = useState<CredentialsResult | null>(null)

  async function onReset(profileId: string, name: string) {
    if (!confirm(`¿Crear una contraseña temporal nueva para ${name}? La anterior dejará de funcionar.`)) return
    try {
      setResult(await resetPassword(profileId))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <>
      <PageHeader title="Cuentas" subtitle="Crea los accesos al campus, entrega las credenciales y gestiona contraseñas." />
      {result && <div className="mb-6"><ResultPanel result={result} onClose={() => setResult(null)} /></div>}
      <div className="mb-6 overflow-x-auto">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => setParams({ vista: v }, { replace: true })}
          options={[{ value: 'familias', label: 'Alumnos y familias' }, { value: 'docentes', label: 'Docentes' }, { value: 'personal', label: 'Personal' }]}
        />
      </div>
      {tab === 'familias' && <FamiliesTab onResult={setResult} onReset={(id, n) => void onReset(id, n)} />}
      {tab === 'docentes' && <StaffTab key="docentes" mode="docentes" onResult={setResult} onReset={(id, n) => void onReset(id, n)} />}
      {tab === 'personal' && <StaffTab key="personal" mode="personal" onResult={setResult} onReset={(id, n) => void onReset(id, n)} />}
    </>
  )
}
