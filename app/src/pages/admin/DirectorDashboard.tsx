import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, MessageCircle, UserX } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Loading, PageHeader, Panel, Segmented, Select } from '@/components/ui'
import { LevelDivergingChart, MeterCell, SortTh, StatTile, StatusTag, pct, useSort, type LevelRow } from '@/components/charts'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, isoDay, limaToday } from '@/lib/format'
import { cn } from '@/lib/utils'
import { classroomLabel, listClassrooms } from '@/services/campus'
import { currentPeriod, listPeriods } from '@/services/notas'
import { startConversation } from '@/services/mensajes'
import { SchoolAlertsPanel } from '@/pages/admin/SchoolAlertsPanel'
import { PrimerosPasos } from '@/components/PrimerosPasos'
import {
  THRESHOLDS, dashboardAreas, dashboardClassrooms, dashboardTeachers, dashboardUnreadFamilies, ratio, toneFor,
  type ClassroomStats, type TeacherStats, type UnreadFamily,
} from '@/services/panel'
import type { Classroom, GradingPeriod } from '@/types'

type Level = 'all' | 'Primaria' | 'Secundaria'
const LAST_30 = 'last30'

function rangeFor(choice: string, periods: GradingPeriod[]): { from: string; to: string; periodId: number | null; label: string } {
  const today = limaToday()
  const cur = currentPeriod(periods)
  if (choice === LAST_30) {
    return { from: isoDay(new Date(Date.now() - 29 * 86_400_000)), to: today, periodId: cur?.id ?? null, label: 'últimos 30 días' }
  }
  const p = periods.find((x) => String(x.id) === choice) ?? cur
  if (!p) return { from: isoDay(new Date(Date.now() - 29 * 86_400_000)), to: today, periodId: null, label: 'últimos 30 días' }
  return { from: p.starts_on, to: p.ends_on < today ? p.ends_on : today, periodId: p.id, label: p.name }
}

function downloadCsv(name: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Indicadores por aula
// ---------------------------------------------------------------------------
type RoomRow = ClassroomStats & {
  room: Classroom
  attendance: number | null
  punctuality: number | null
  delivery: number | null
  achievement: number | null
  reading: number | null
}
type RoomKey = 'name' | 'attendance' | 'punctuality' | 'delivery' | 'achievement' | 'reading'

function ClassroomTable({ rows, periodId }: { rows: RoomRow[]; periodId: number | null }) {
  const { sort, onSort, compare } = useSort<RoomKey>('attendance', 1)
  const sorted = [...rows].sort(compare<RoomRow>((r, k) => (k === 'name' ? classroomLabel(r.room) : r[k])))
  return (
    <div className="overflow-x-auto">
      <table className="tabla-colegio w-full min-w-[56rem] text-sm">
        <thead className="border-b border-linea text-left">
          <tr>
            <SortTh k="name" sort={sort} onSort={onSort} className="pl-5">Aula</SortTh>
            <SortTh k="attendance" sort={sort} onSort={onSort}>Asistencia</SortTh>
            <SortTh k="punctuality" sort={sort} onSort={onSort}>Puntualidad</SortTh>
            <SortTh k="delivery" sort={sort} onSort={onSort}>Tareas entregadas</SortTh>
            <SortTh k="achievement" sort={sort} onSort={onSort}>Logro A o AD</SortTh>
            <SortTh k="reading" sort={sort} onSort={onSort} className="pr-5">Comunicados leídos</SortTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {sorted.map((r) => (
            <tr key={r.classroom_id} className="align-top hover:bg-papel/70">
              <td className="py-3 pl-5 pr-3">
                <Link to={`/consolidado?aula=${r.classroom_id}${periodId ? `&bimestre=${periodId}` : ''}`} className="font-bold hover:underline">{classroomLabel(r.room)}</Link>
                <span className="block text-xs text-texto-suave">{r.students} alumnos</span>
              </td>
              <td className="px-3 py-3"><MeterCell value={r.attendance} tone={toneFor(r.attendance, THRESHOLDS.attendance)} sub={`${r.on_time + r.late} ingresos en ${r.school_days} días`} /></td>
              <td className="px-3 py-3"><MeterCell value={r.punctuality} tone={toneFor(r.punctuality, THRESHOLDS.punctuality)} sub={`${r.late} tardanzas`} /></td>
              <td className="px-3 py-3"><MeterCell value={r.delivery} tone={toneFor(r.delivery, THRESHOLDS.delivery)} sub={r.tasks_expected ? `${r.tasks_delivered} de ${r.tasks_expected}${r.avg_score20 != null ? ` · prom. ${r.avg_score20}` : ''}` : 'Sin tareas vencidas'} /></td>
              <td className="px-3 py-3"><MeterCell value={r.achievement} tone={toneFor(r.achievement, THRESHOLDS.achievement)} sub={r.levels_total ? `${r.levels_achieved} de ${r.levels_total} notas` : 'Sin notas del bimestre'} /></td>
              <td className="py-3 pl-3 pr-5"><MeterCell value={r.reading} tone={toneFor(r.reading, THRESHOLDS.reading)} sub={r.circulars_total ? `${r.circulars_read} de ${r.circulars_total}` : 'Sin comunicados'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Docentes
// ---------------------------------------------------------------------------
type TeacherRow = TeacherStats & { gradedShare: number | null; register: number | null }
type TeacherKey = 'name' | 'overdue' | 'pending' | 'gradedShare' | 'avg_grading_days' | 'register'

function TeacherTable({ rows, lateDays }: { rows: TeacherRow[]; lateDays: number }) {
  const { sort, onSort, compare } = useSort<TeacherKey>('overdue', -1)
  const sorted = [...rows].sort(compare<TeacherRow>((r, k) => (k === 'name' ? r.full_name ?? '' : r[k])))
  return (
    <div className="overflow-x-auto">
      <table className="tabla-colegio w-full min-w-[54rem] text-sm">
        <thead className="border-b border-linea text-left">
          <tr>
            <SortTh k="name" sort={sort} onSort={onSort} className="pl-5">Docente</SortTh>
            <SortTh k="overdue" sort={sort} onSort={onSort}>Sin calificar +{lateDays} días</SortTh>
            <SortTh k="pending" sort={sort} onSort={onSort}>Por calificar</SortTh>
            <SortTh k="gradedShare" sort={sort} onSort={onSort}>Entregas calificadas</SortTh>
            <SortTh k="avg_grading_days" sort={sort} onSort={onSort}>Demora promedio</SortTh>
            <SortTh k="register" sort={sort} onSort={onSort} className="pr-5">Registro del bimestre</SortTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {sorted.map((t) => {
            const overdueTone = t.overdue >= 5 ? 'critical' : t.overdue > 0 ? 'warning' : null
            return (
              <tr key={t.teacher_id} className={cn('align-top hover:bg-papel/70', overdueTone === 'critical' && 'bg-estado-alerta/[0.04]')}>
                <td className="py-3 pl-5 pr-3">
                  <span className="font-bold">{t.full_name ?? 'Docente'}</span>
                  <span className="block text-xs text-texto-suave">{t.offerings} curso{t.offerings === 1 ? '' : 's'} · {t.assignments} tarea{t.assignments === 1 ? '' : 's'} en el periodo</span>
                </td>
                <td className="px-3 py-3">
                  <span className="text-lg font-bold tabular-nums">{t.overdue}</span>{' '}
                  <StatusTag tone={overdueTone} label={overdueTone === 'critical' ? 'Muy atrasado' : 'Atrasado'} />
                  {t.oldest_pending && t.overdue > 0 && <span className="block text-[11px] text-texto-suave">La más antigua: {formatShort(t.oldest_pending)}</span>}
                </td>
                <td className="px-3 py-3 font-bold tabular-nums">{t.pending}</td>
                <td className="px-3 py-3"><MeterCell value={t.gradedShare} tone={null} sub={t.received ? `${t.graded} de ${t.received}` : 'Sin entregas'} /></td>
                <td className="px-3 py-3 tabular-nums">{t.avg_grading_days == null ? '—' : `${t.avg_grading_days.toLocaleString('es-PE')} días`}</td>
                <td className="py-3 pl-3 pr-5"><MeterCell value={t.register} tone={toneFor(t.register, THRESHOLDS.register)} sub={t.register_total ? `${t.register_filled} de ${t.register_total} casillas` : 'Sin cursos con competencias'} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Familias que no leen
// ---------------------------------------------------------------------------
function FamiliesTable({ rows, rooms, canWrite }: { rows: UnreadFamily[]; rooms: Map<number, Classroom>; canWrite: boolean }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<number | null>(null)

  async function write(studentId: number) {
    setBusy(studentId)
    try {
      navigate(`/mensajes/${await startConversation(studentId, profile!.id)}`)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="tabla-colegio w-full min-w-[48rem] text-sm">
        <thead className="border-b border-linea text-left text-texto-suave">
          <tr>
            <th className="py-2.5 pl-5 pr-3 font-bold">Alumno</th>
            <th className="px-3 font-bold">Sin leer</th>
            <th className="px-3 font-bold">Autorizaciones pendientes</th>
            <th className="px-3 font-bold">Último sin leer</th>
            <th className="py-2.5 pl-3 pr-5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {rows.map((f) => {
            const share = f.unread / f.total
            const tone = share >= 0.5 ? 'critical' : 'warning'
            return (
              <tr key={f.student_id} className="align-top hover:bg-papel/70">
                <td className="py-3 pl-5 pr-3">
                  <span className="font-bold">{f.student_name}</span>
                  <span className="block text-xs text-texto-suave">{classroomLabel(rooms.get(f.classroom_id ?? 0))}</span>
                </td>
                <td className="px-3 py-3">
                  <span className="font-bold tabular-nums">{f.unread} de {f.total}</span>{' '}
                  <StatusTag tone={tone} label={tone === 'critical' ? 'No lee' : 'Lee poco'} />
                </td>
                <td className="px-3 py-3 tabular-nums">{f.consent_pending > 0 ? <Badge tone="late">{f.consent_pending} sin responder</Badge> : <span className="text-texto-suave">—</span>}</td>
                <td className="px-3 py-3">
                  <span className="line-clamp-1">{f.last_unread_title ?? '—'}</span>
                  {f.last_unread_at && <span className="text-xs text-texto-suave">{formatShort(f.last_unread_at)}</span>}
                </td>
                <td className="py-3 pl-3 pr-5 text-right">
                  {f.family_accounts === 0 ? (
                    <Link to="/admin/cuentas" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-estado-alerta hover:underline">
                      <UserX className="h-3.5 w-3.5" />Sin cuenta en el campus
                    </Link>
                  ) : canWrite ? (
                    <Button size="sm" variant="secondary" loading={busy === f.student_id} onClick={() => void write(f.student_id)}>
                      <MessageCircle className="h-4 w-4" />Escribir
                    </Button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function DirectorDashboard() {
  const { isAdmin } = useAuth()
  const [choice, setChoice] = useState<string>('')
  const [level, setLevel] = useState<Level>('all')
  const [areaRoom, setAreaRoom] = useState<string>('')
  const [minUnread, setMinUnread] = useState('2')
  const LATE_DAYS = 7

  const base = useAsync(async () => {
    const [periods, classrooms] = await Promise.all([listPeriods(), listClassrooms()])
    return { periods, classrooms }
  }, [])

  const periods = base.data?.periods ?? []
  const effectiveChoice = choice || String(currentPeriod(periods)?.id ?? LAST_30)
  const range = rangeFor(effectiveChoice, periods)

  const stats = useAsync(async () => {
    if (!base.data) return null
    const [rooms, teachers, families] = await Promise.all([
      dashboardClassrooms(range.from, range.to, range.periodId),
      dashboardTeachers(range.from, range.to, range.periodId, LATE_DAYS),
      dashboardUnreadFamilies(range.from, range.to, 1),
    ])
    return { rooms, teachers, families }
  }, [base.data, range.from, range.to, range.periodId])

  const areas = useAsync(async () => (range.periodId ? dashboardAreas(range.periodId, Number(areaRoom) || null) : []), [range.periodId, areaRoom])

  const roomById = useMemo(() => new Map((base.data?.classrooms ?? []).map((c) => [c.id, c])), [base.data])
  const inLevel = (c: Classroom | undefined) => level === 'all' || c?.level === level

  const roomRows: RoomRow[] = useMemo(() => (stats.data?.rooms ?? [])
    .map((r) => ({ ...r, room: roomById.get(r.classroom_id)! }))
    .filter((r) => r.room && inLevel(r.room) && r.students > 0)
    .map((r) => ({
      ...r,
      attendance: ratio(r.on_time + r.late, r.students * r.school_days),
      punctuality: ratio(r.on_time, r.on_time + r.late),
      delivery: ratio(r.tasks_delivered, r.tasks_expected),
      achievement: ratio(r.levels_achieved, r.levels_total),
      reading: ratio(r.circulars_read, r.circulars_total),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    })), [stats.data, roomById, level])

  const sum = (k: keyof ClassroomStats) => roomRows.reduce((n, r) => n + Number(r[k] ?? 0), 0)
  const kpi = {
    attendance: ratio(sum('on_time') + sum('late'), roomRows.reduce((n, r) => n + r.students * r.school_days, 0)),
    punctuality: ratio(sum('on_time'), sum('on_time') + sum('late')),
    delivery: ratio(sum('tasks_delivered'), sum('tasks_expected')),
    achievement: ratio(sum('levels_achieved'), sum('levels_total')),
    reading: ratio(sum('circulars_read'), sum('circulars_total')),
  }

  const teacherRows: TeacherRow[] = (stats.data?.teachers ?? []).map((t) => ({
    ...t, gradedShare: ratio(t.graded, t.received), register: ratio(t.register_filled, t.register_total),
  }))
  const overdueTotal = teacherRows.reduce((n, t) => n + t.overdue, 0)
  const lateTeachers = teacherRows.filter((t) => t.overdue > 0).length

  const familyRows = (stats.data?.families ?? []).filter((f) => f.unread >= Number(minUnread) && inLevel(roomById.get(f.classroom_id ?? 0)))
  const familiesPending = (stats.data?.families ?? []).filter((f) => inLevel(roomById.get(f.classroom_id ?? 0))).length
  const noAccount = familyRows.filter((f) => f.family_accounts === 0).length

  const areaRows: LevelRow[] = (areas.data ?? [])
    .filter((a) => level === 'all' || a.subject_level === level)
    .map((a) => ({ key: a.subject_id, label: a.subject_name, group: level === 'all' ? a.subject_level : undefined, ad: a.ad_count, a: a.a_count, b: a.b_count, c: a.c_count }))

  if (base.loading) return <Loading shape="page" />
  if (base.error) return <ErrorBox message={base.error} onRetry={() => void base.reload()} />

  return (
    <>
      <PageHeader title="Panel de dirección" subtitle={`Indicadores del colegio · ${range.label} (${formatShort(range.from)} al ${formatShort(range.to)}). Se actualiza solo cada 2 minutos.`} />
      <PrimerosPasos className="mb-6" />
      <SchoolAlertsPanel />

      {/* Filtros: una sola fila sobre todos los indicadores */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <Field label="Periodo" className="w-56">
          <Select value={effectiveChoice} onChange={(e) => setChoice(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={LAST_30}>Últimos 30 días</option>
          </Select>
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-bold">Nivel</span>
          <Segmented<Level> value={level} onChange={setLevel} options={[{ value: 'all', label: 'Todos' }, { value: 'Primaria', label: 'Primaria' }, { value: 'Secundaria', label: 'Secundaria' }]} />
        </div>
      </div>

      {stats.error && <div className="mb-6"><ErrorBox message={stats.error} onRetry={() => void stats.reload()} /></div>}

      {stats.loading ? <Loading shape="page" /> : (
        <div className="space-y-8">
          {/* Indicadores principales */}
          <section aria-label="Indicadores principales" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Asistencia registrada" value={pct(kpi.attendance)} meter={kpi.attendance} tone={toneFor(kpi.attendance, THRESHOLDS.attendance)} detail="ingresos / días de clase" />
            <StatTile label="Puntualidad" value={pct(kpi.punctuality)} meter={kpi.punctuality} tone={toneFor(kpi.punctuality, THRESHOLDS.punctuality)} detail={`${sum('late')} tardanzas`} />
            <StatTile label="Tareas entregadas" value={pct(kpi.delivery)} meter={kpi.delivery} tone={toneFor(kpi.delivery, THRESHOLDS.delivery)} detail="de las tareas ya vencidas" />
            <StatTile label="Logro A o AD" value={pct(kpi.achievement)} meter={kpi.achievement} tone={toneFor(kpi.achievement, THRESHOLDS.achievement)} detail="notas por competencia" />
            <StatTile label="Comunicados leídos" value={pct(kpi.reading)} meter={kpi.reading} tone={toneFor(kpi.reading, THRESHOLDS.reading)} detail={`${familiesPending} familias con algo sin leer`} />
            <StatTile
              label={`Sin calificar +${LATE_DAYS} días`}
              value={String(overdueTotal)}
              tone={overdueTotal >= 10 ? 'critical' : overdueTotal > 0 ? 'warning' : 'ok'}
              detail={lateTeachers ? `${lateTeachers} docente${lateTeachers === 1 ? '' : 's'}` : 'Todos al día'}
            />
          </section>

          <Panel title="Por aula" action={<span className="hidden text-xs text-texto-suave sm:inline">Toca una columna para ordenar · el aula abre su consolidado</span>} bodyClassName="p-0">
            {roomRows.length === 0 ? <div className="p-5"><Empty title="Sin aulas con alumnos" art="notebook" compact /></div> : <ClassroomTable rows={roomRows} periodId={range.periodId} />}
          </Panel>

          <Panel
            title="Rendimiento por área"
            action={
              <Select value={areaRoom} onChange={(e) => setAreaRoom(e.target.value)} className="w-auto py-1.5 text-sm" aria-label="Aula">
                <option value="">Todas las aulas</option>
                {(base.data?.classrooms ?? []).filter(inLevel).map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
              </Select>
            }
          >
            {!range.periodId ? <p className="text-sm text-texto-suave">Elige un bimestre para ver los niveles de logro.</p>
              : areas.loading ? <Loading shape="table" rows={4} />
              : <LevelDivergingChart rows={areaRows} />}
          </Panel>

          <Panel
            title="Docentes"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadCsv(`docentes-${range.from}.csv`, ['Docente', 'Cursos', 'Tareas', 'Recibidas', 'Calificadas', 'Por calificar', `Más de ${LATE_DAYS} días`, 'Demora promedio (días)', 'Registro (%)'],
                  teacherRows.map((t) => [t.full_name ?? '', t.offerings, t.assignments, t.received, t.graded, t.pending, t.overdue, t.avg_grading_days ?? '', t.register == null ? '' : Math.round(t.register * 100)]))}
              >
                <Download className="h-4 w-4" />CSV
              </Button>
            }
            bodyClassName="p-0"
          >
            {teacherRows.length === 0 ? <div className="p-5"><Empty title="No hay docentes con cuenta" art="notebook" compact /></div> : <TeacherTable rows={teacherRows} lateDays={LATE_DAYS} />}
          </Panel>

          <Panel
            title="Familias que no leen los comunicados"
            action={
              <div className="flex items-center gap-2">
                <Select value={minUnread} onChange={(e) => setMinUnread(e.target.value)} className="w-auto py-1.5 text-sm" aria-label="Mínimo sin leer">
                  <option value="1">1 o más sin leer</option>
                  <option value="2">2 o más sin leer</option>
                  <option value="3">3 o más sin leer</option>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => downloadCsv(`familias-sin-leer-${range.from}.csv`, ['Alumno', 'Aula', 'Sin leer', 'Total', 'Autorizaciones pendientes', 'Cuenta de familia', 'Último sin leer'],
                    familyRows.map((f) => [f.student_name, classroomLabel(roomById.get(f.classroom_id ?? 0)), f.unread, f.total, f.consent_pending, f.family_accounts ? 'Sí' : 'No', f.last_unread_title ?? '']))}
                >
                  <Download className="h-4 w-4" />CSV
                </Button>
              </div>
            }
            bodyClassName="p-0"
          >
            {noAccount > 0 && (
              <p className="flex items-start gap-2 border-b border-linea bg-chispa-100/60 px-5 py-3 text-sm text-tinta">
                <UserX className="mt-0.5 h-4 w-4 shrink-0" />
                {noAccount} de estas familias no tiene cuenta en el campus: no pueden leer los comunicados. <Link to="/admin/cuentas" className="font-bold underline">Crear cuentas</Link>
              </p>
            )}
            {familyRows.length === 0
              ? <div className="p-5"><Empty title="Todas las familias están al día" art="mail" compact>Ninguna tiene {minUnread} o más comunicados sin leer en el periodo.</Empty></div>
              : <FamiliesTable rows={familyRows} rooms={roomById} canWrite={isAdmin} />}
          </Panel>
        </div>
      )}
    </>
  )
}
