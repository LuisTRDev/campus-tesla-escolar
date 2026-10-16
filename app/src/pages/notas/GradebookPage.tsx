import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ClipboardList, Lock, MessageSquareText, Save, Sparkles, FileSpreadsheet } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Panel, Segmented, Textarea } from '@/components/ui'
import { CourseCover } from '@/components/course'
import { LevelChip, LevelPicker } from '@/components/levels'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { formatShort } from '@/lib/format'
import { classroomLabel, getOffering, listClassroomStudents, listTeacherOfferings, studentName } from '@/services/campus'
import {
  currentPeriod, listCompetencies, listEvidence, listOfferingGrades, listPeriods, saveGrades, suggestLevel,
  type Evidence, type GradeDraft,
} from '@/services/notas'
import type { Competency, Level, Offering } from '@/types'

type Cell = { level: Level | null; conclusion: string | null }
const key = (studentId: number, competencyId: number) => `${studentId}:${competencyId}`

// ---------------------------------------------------------------------------
// Lista de cursos del docente
// ---------------------------------------------------------------------------
function PickCourse() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useAsync(() => listTeacherOfferings(profile!.id), [profile?.id])
  return (
    <>
      <PageHeader title="Registro de notas" subtitle="Elige el curso para registrar los niveles de logro por competencia." />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading shape="cards" /> : !data?.length ? (
        <Empty title="No tienes cursos asignados" art="notebook" icon={<ClipboardList className="h-6 w-6" />}>La administración te asigna los cursos.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((o) => (
            <CourseCover key={o.id} offering={o} showClassroom meta={<Link to={`/notas/${o.id}`} className="text-sm font-bold text-tinta-500">Abrir registro</Link>} />
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Ficha de un alumno: nivel + conclusión descriptiva por competencia
// ---------------------------------------------------------------------------
function StudentSheet({ name, competencies, cells, evidence, readOnly, onChange }: {
  name: string
  competencies: Competency[]
  cells: (competencyId: number) => Cell
  evidence: (competencyId: number) => Evidence[]
  readOnly: boolean
  onChange: (competencyId: number, patch: Partial<Cell>) => void
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-texto-suave">
        La conclusión descriptiva es obligatoria en la libreta cuando el nivel es B o C. Explica qué logró {name} y qué le falta.
      </p>
      {competencies.map((c) => {
        const cell = cells(c.id)
        const ev = evidence(c.id)
        const suggested = suggestLevel(ev)
        const needsConclusion = (cell.level === 'B' || cell.level === 'C') && !cell.conclusion
        return (
          <div key={c.id} className="border-t border-linea pt-5 first:border-0 first:pt-0">
            <p className="text-xs font-bold text-texto-suave">{c.code}</p>
            <p className="font-bold leading-snug">{c.name}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <LevelPicker value={cell.level} onChange={(level) => onChange(c.id, { level })} disabled={readOnly} />
              {suggested && !readOnly && cell.level !== suggested && (
                <button type="button" onClick={() => onChange(c.id, { level: suggested })} className="inline-flex items-center gap-1 text-sm font-bold text-tinta-500 hover:underline">
                  <Sparkles className="h-4 w-4" />Usar sugerido: {suggested}
                </button>
              )}
            </div>
            {ev.length > 0 && (
              <p className="mt-2 text-xs text-texto-suave">
                Evidencias: {ev.map((e) => `${e.title} (${e.label})`).join(' · ')}
              </p>
            )}
            <Field label="Conclusión descriptiva" className="mt-3">
              <Textarea
                value={cell.conclusion ?? ''}
                onChange={(e) => onChange(c.id, { conclusion: e.target.value })}
                maxLength={1000}
                readOnly={readOnly}
                className={cn('min-h-20', needsConclusion && 'border-estado-tarde')}
                placeholder={cell.level === 'B' || cell.level === 'C' ? 'Obligatoria para B y C' : 'Opcional'}
              />
            </Field>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Registro de un curso
// ---------------------------------------------------------------------------
/** Registro en Excel: hoja de niveles (una columna por competencia, como el SIAGIE), conclusiones y leyenda. */
async function exportGradebook({ offering, period, competencies, students, cell }: {
  offering: Offering
  period: { name: string } | null
  competencies: { id: number; code: string; name: string }[]
  students: { id: number; first_name: string | null; last_name: string | null }[]
  cell: (s: number, c: number) => Cell
}) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const bold = (v: string) => ({ value: v, fontWeight: 'bold' as const })
  const sorted = [...students].sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '', 'es'))
  const fullName = (s: { first_name: string | null; last_name: string | null }) => `${s.last_name ?? ''}, ${s.first_name ?? ''}`
  const levels = [
    [bold('N.°'), bold('Apellidos y nombres'), ...competencies.map((c) => bold(c.code || c.name))],
    ...sorted.map((s, i) => [i + 1, fullName(s), ...competencies.map((c) => cell(s.id, c.id).level ?? '')]),
  ]
  const conclusions = [
    [bold('Apellidos y nombres'), bold('Competencia'), bold('Nivel'), bold('Conclusión descriptiva')],
    ...sorted.flatMap((s) => competencies.map((c) => ({ c, v: cell(s.id, c.id) })).filter((x) => x.v.conclusion)
      .map(({ c, v }) => [fullName(s), c.name, v.level ?? '', v.conclusion ?? ''])),
  ]
  const legend = [[bold('Código'), bold('Competencia')], ...competencies.map((c) => [c.code, c.name])]
  const name = `registro ${offering.subject.name} ${classroomLabel(offering.classroom)} ${period?.name ?? ''}`.replace(/[^\p{L}\p{N} .-]+/gu, '').trim()
  await writeXlsxFile([
    { data: levels, sheet: 'Niveles', columns: [{ width: 5 }, { width: 38 }, ...competencies.map(() => ({ width: 9 }))] },
    { data: conclusions, sheet: 'Conclusiones', columns: [{ width: 38 }, { width: 40 }, { width: 8 }, { width: 70 }] },
    { data: legend, sheet: 'Competencias', columns: [{ width: 10 }, { width: 80 }] },
  ]).toFile(`${name}.xlsx`)
}

function Gradebook({ offeringId }: { offeringId: number }) {
  const { profile, isAdmin } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const base = useAsync(async () => {
    const [offering, periods] = await Promise.all([getOffering(offeringId), listPeriods()])
    if (!offering) return null
    const [competencies, students] = await Promise.all([
      listCompetencies([offering.subject_id]),
      listClassroomStudents(offering.classroom_id),
    ])
    return { offering, periods, competencies, students }
  }, [offeringId])

  const periods = base.data?.periods ?? []
  const periodId = Number(params.get('bimestre')) || currentPeriod(periods)?.id || null
  const period = periods.find((p) => p.id === periodId) ?? null

  const grades = useAsync(async () => {
    if (!period) return null
    const [rows, evidence] = await Promise.all([listOfferingGrades(offeringId, period.id), listEvidence(offeringId, period)])
    return { rows, evidence }
  }, [offeringId, period?.id])

  const [drafts, setDrafts] = useState<Map<string, Cell>>(new Map())
  const [sheetFor, setSheetFor] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDrafts(new Map()), [period?.id])

  const saved = useMemo(() => {
    const m = new Map<string, Cell>()
    for (const g of grades.data?.rows ?? []) m.set(key(g.student_id, g.competency_id), { level: g.level, conclusion: g.conclusion })
    return m
  }, [grades.data])

  if (base.loading) return <Loading shape="table" />
  if (base.error) return <ErrorBox message={base.error} onRetry={() => void base.reload()} />
  if (!base.data) return <Empty title="No encontramos este curso" art="search" />

  const { offering, competencies, students } = base.data
  const canEdit = isAdmin || (profile?.role === 'TEACHER' && offering.teacher_id === profile.id)
  const locked = !!period?.is_closed && !isAdmin
  const readOnly = !canEdit || locked

  const cell = (s: number, c: number): Cell => drafts.get(key(s, c)) ?? saved.get(key(s, c)) ?? { level: null, conclusion: null }
  const evidenceFor = (s: number, c: number) => grades.data?.evidence.get(key(s, c)) ?? []

  function change(studentId: number, competencyId: number, patch: Partial<Cell>) {
    setDrafts((prev) => {
      const next = new Map(prev)
      next.set(key(studentId, competencyId), { ...cell(studentId, competencyId), ...patch })
      return next
    })
  }

  function applySuggestions() {
    let n = 0
    setDrafts((prev) => {
      const next = new Map(prev)
      for (const s of students) for (const c of competencies) {
        const current = next.get(key(s.id, c.id)) ?? saved.get(key(s.id, c.id))
        if (current?.level) continue
        const sug = suggestLevel(evidenceFor(s.id, c.id))
        if (sug) { next.set(key(s.id, c.id), { level: sug, conclusion: current?.conclusion ?? null }); n++ }
      }
      return next
    })
    toast(n ? `Se completaron ${n} casilla${n === 1 ? '' : 's'} con el nivel sugerido. Revisa y guarda.` : 'No hay sugerencias para casillas vacías.')
  }

  async function onSave() {
    if (!period) return
    const rows: GradeDraft[] = []
    for (const [k, v] of drafts) {
      const [student_id, competency_id] = k.split(':').map(Number)
      const before = saved.get(k)
      if (before && before.level === v.level && (before.conclusion ?? '') === (v.conclusion ?? '')) continue
      rows.push({ student_id, competency_id, level: v.level, conclusion: v.conclusion })
    }
    if (!rows.length) { toast('No hay cambios por guardar.'); return }
    setSaving(true)
    try {
      await saveGrades(offeringId, period.id, rows)
      toast(`Se guardaron ${rows.length} calificaci${rows.length === 1 ? 'ón' : 'ones'}.`)
      setDrafts(new Map())
      void grades.reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const total = students.length * competencies.length
  const filled = students.reduce((n, s) => n + competencies.filter((c) => cell(s.id, c.id).level).length, 0)
  const missingConclusions = students.reduce((n, s) => n + competencies.filter((c) => {
    const v = cell(s.id, c.id)
    return (v.level === 'B' || v.level === 'C') && !v.conclusion
  }).length, 0)
  const dirty = drafts.size > 0
  const sheetStudent = students.find((s) => s.id === sheetFor) ?? null

  return (
    <>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-texto-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />Volver
      </button>
      <PageHeader
        accent={offering.subject.color}
        title={`Registro de ${offering.subject.name}`}
        subtitle={`${classroomLabel(offering.classroom)}. ${students.length} alumnos, ${competencies.length} competencias.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportGradebook({ offering, period, competencies, students, cell })}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            {!readOnly && <Button variant="secondary" onClick={applySuggestions}><Sparkles className="h-4 w-4" />Completar con sugeridos</Button>}
            {!readOnly && <Button onClick={() => void onSave()} loading={saving} disabled={!dirty}><Save className="h-4 w-4" />Guardar{dirty ? ` (${drafts.size})` : ''}</Button>}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented<string>
          value={String(period?.id ?? '')}
          onChange={(v) => {
            if (dirty && !confirm('Tienes cambios sin guardar. ¿Cambiar de bimestre y descartarlos?')) return
            setParams({ bimestre: v }, { replace: true })
          }}
          options={periods.map((p) => ({ value: String(p.id), label: p.name.replace(' Bimestre', '') }))}
        />
        {period && <span className="text-sm text-texto-suave">{formatShort(period.starts_on)} al {formatShort(period.ends_on)}</span>}
        {period?.is_closed && <Badge><Lock className="h-3 w-3" />Cerrado{isAdmin ? ' (puedes editar como dirección)' : ''}</Badge>}
        {period?.is_published && <Badge tone="ok">Publicado a familias</Badge>}
      </div>

      {competencies.length === 0 ? (
        <Empty title="Esta área no tiene competencias cargadas" art="grades">Dirección debe cargarlas (script 07) para poder registrar notas.</Empty>
      ) : grades.loading ? <Loading shape="table" rows={8} /> : grades.error ? <ErrorBox message={grades.error} onRetry={() => void grades.reload()} /> : (
        <>
          <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><b>{filled}</b> de {total} casillas registradas</span>
            {missingConclusions > 0 && (
              <span className="inline-flex items-center gap-1 font-bold text-estado-tarde">
                <AlertTriangle className="h-4 w-4" />{missingConclusions} B o C sin conclusión descriptiva
              </span>
            )}
          </div>

          <Panel bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="tabla-colegio w-full min-w-[40rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left">
                    <th className="sticky left-0 z-10 bg-superficie px-4 py-3 font-bold">Alumno</th>
                    {competencies.map((c) => (
                      <th key={c.id} className="px-2 py-3 text-center font-bold" title={c.name}>
                        {c.code}
                        <span className="block max-w-[9rem] truncate text-[11px] font-normal text-texto-suave">{c.name}</span>
                      </th>
                    ))}
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {students.map((s, i) => (
                    <tr key={s.id} className="hover:bg-papel/60">
                      <td className="sticky left-0 z-10 bg-superficie px-4 py-2">
                        <span className="mr-2 text-xs text-texto-suave">{i + 1}</span>
                        <span className="font-bold">{s.last_name}, {s.first_name}</span>
                      </td>
                      {competencies.map((c) => {
                        const v = cell(s.id, c.id)
                        const sug = suggestLevel(evidenceFor(s.id, c.id))
                        const isDirty = drafts.has(key(s.id, c.id))
                        return (
                          <td key={c.id} className="px-2 py-2 text-center">
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <select
                                aria-label={`${studentName(s)}, ${c.code}`}
                                value={v.level ?? ''}
                                disabled={readOnly}
                                onChange={(e) => change(s.id, c.id, { level: (e.target.value || null) as Level | null })}
                                className={cn(
                                  'h-9 w-16 rounded-md border text-center font-display font-bold focus:outline-none focus:ring-2 focus:ring-chispa/50',
                                  isDirty ? 'border-chispa-600' : 'border-linea',
                                  v.level === 'AD' && 'bg-estado-ok text-white',
                                  v.level === 'A' && 'bg-estado-ok/15 text-estado-ok',
                                  v.level === 'B' && 'bg-estado-tarde/15 text-estado-tarde',
                                  v.level === 'C' && 'bg-estado-alerta/15 text-estado-alerta',
                                )}
                              >
                                <option value="">–</option>
                                <option value="AD">AD</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                              </select>
                              {(v.level === 'B' || v.level === 'C') && !v.conclusion
                                ? <span className="text-[10px] font-bold text-estado-tarde">sin conclusión</span>
                                : sug && !v.level ? <span className="text-[10px] text-texto-suave">sug. {sug}</span> : null}
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setSheetFor(s.id)} aria-label={`Ficha de ${studentName(s)}`}>
                          <MessageSquareText className="h-4 w-4" />Ficha
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-texto-suave">
            <span className="inline-flex items-center gap-1"><LevelChip level="AD" />Logro destacado</span>
            <span className="inline-flex items-center gap-1"><LevelChip level="A" />Logro esperado</span>
            <span className="inline-flex items-center gap-1"><LevelChip level="B" />En proceso</span>
            <span className="inline-flex items-center gap-1"><LevelChip level="C" />En inicio</span>
            <span>“sug.” = nivel sugerido por las notas de tareas vinculadas a la competencia.</span>
          </div>
        </>
      )}

      <Modal open={!!sheetStudent} onClose={() => setSheetFor(null)} title={sheetStudent ? studentName(sheetStudent) : ''} wide>
        {sheetStudent && (
          <>
            <StudentSheet
              name={sheetStudent.first_name ?? 'el alumno'}
              competencies={competencies}
              cells={(c) => cell(sheetStudent.id, c)}
              evidence={(c) => evidenceFor(sheetStudent.id, c)}
              readOnly={readOnly}
              onChange={(c, patch) => change(sheetStudent.id, c, patch)}
            />
            <div className="mt-6 flex justify-end gap-2 border-t border-linea pt-4">
              <Button variant="secondary" onClick={() => setSheetFor(null)}>Cerrar</Button>
              {!readOnly && <Button onClick={() => { setSheetFor(null); void onSave() }} loading={saving}><Save className="h-4 w-4" />Guardar</Button>}
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

export default function GradebookPage() {
  const { offeringId } = useParams()
  const id = Number(offeringId)
  return Number.isSafeInteger(id) && id > 0 ? <Gradebook offeringId={id} /> : <PickCourse />
}
