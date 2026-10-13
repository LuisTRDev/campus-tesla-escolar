import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, FileText, MessageSquareText, Printer } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Panel, Select, Textarea } from '@/components/ui'
import { courseCode } from '@/components/course'
import { LevelChip } from '@/components/levels'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { classroomLabel, listClassroomOfferings, listClassrooms, studentName } from '@/services/campus'
import {
  currentPeriod, listCompetencies, listComments, listGradesForOfferings, listPeriods, periodAttendance, saveComment,
} from '@/services/notas'
import type { Classroom, Competency, CompetencyGrade, GradingPeriod, Offering } from '@/types'

type Student = { id: number; first_name: string | null; last_name: string | null; dni: string | null }

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}

/**
 * Exportación para el SIAGIE: una fila por alumno, columnas por competencia
 * (nivel y conclusión). Separador ";" para que Excel en español la abra bien.
 */
function exportSiagie(opts: {
  classroom: Classroom
  period: GradingPeriod
  students: Student[]
  offerings: Offering[]
  competencies: Competency[]
  grades: CompetencyGrade[]
  offeringFilter: number | null
}) {
  const offerings = opts.offerings.filter((o) => !opts.offeringFilter || o.id === opts.offeringFilter)
  const cols = offerings.flatMap((o) => opts.competencies.filter((c) => c.subject_id === o.subject_id).map((c) => ({ o, c })))
  const header = ['N°', 'DNI', 'Apellidos y nombres', ...cols.flatMap(({ o, c }) => [`${courseCode(o)} ${c.code}`, `${courseCode(o)} ${c.code} conclusión`])]
  const rows = opts.students.map((s, i) => [
    i + 1,
    s.dni ?? '',
    `${s.last_name ?? ''}, ${s.first_name ?? ''}`,
    ...cols.flatMap(({ c }) => {
      const g = opts.grades.find((x) => x.student_id === s.id && x.competency_id === c.id)
      return [g?.level ?? '', g?.conclusion ?? '']
    }),
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const area = opts.offeringFilter ? `-${courseCode(offerings[0])}` : ''
  a.href = url
  a.download = `siagie-${classroomLabel(opts.classroom).replace(/[^\w]+/g, '-')}-${opts.period.name.replace(/\s+/g, '-')}${area}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function CommentEditor({ periodId, student, initial, onSaved }: { periodId: number; student: Student; initial: string; onSaved: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await saveComment(periodId, student.id, text)
      toast('Apreciación guardada.')
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <Field label="Apreciación del tutor" hint="Aparece en la libreta del bimestre. Destaca avances y da una recomendación concreta.">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} className="min-h-36" />
      </Field>
      <div className="flex justify-end"><Button onClick={() => void save()} loading={busy}>Guardar</Button></div>
    </div>
  )
}

export default function ConsolidatedPage() {
  const { profile, tutorClassrooms } = useAuth()
  const [params, setParams] = useSearchParams()
  const isStaff = profile?.role === 'ADMIN' || profile?.role === 'MANAGEMENT' || profile?.role === 'AUXILIARY'

  const base = useAsync(async () => {
    const [classrooms, periods] = await Promise.all([isStaff ? listClassrooms() : Promise.resolve(tutorClassrooms), listPeriods()])
    return { classrooms, periods }
  }, [isStaff, tutorClassrooms.map((c) => c.id).join(',')])

  const classrooms = base.data?.classrooms ?? []
  const periods = base.data?.periods ?? []
  const classroomId = Number(params.get('aula')) || classrooms[0]?.id || null
  const periodId = Number(params.get('bimestre')) || currentPeriod(periods)?.id || null
  const classroom = classrooms.find((c) => c.id === classroomId) ?? null
  const period = periods.find((p) => p.id === periodId) ?? null

  const detail = useAsync(async () => {
    if (!classroomId || !periodId) return null
    const [studentsRes, offerings] = await Promise.all([
      supabase.from('students').select('id, first_name, last_name, dni').eq('classroom_id', classroomId).order('last_name').order('first_name'),
      listClassroomOfferings(classroomId),
    ])
    if (studentsRes.error) throw studentsRes.error
    const students = (studentsRes.data ?? []) as Student[]
    const [competencies, grades, comments, attendance] = await Promise.all([
      listCompetencies(offerings.map((o) => o.subject_id)),
      listGradesForOfferings(offerings.map((o) => o.id), [periodId]),
      listComments(students.map((s) => s.id), [periodId]),
      periodAttendance(periodId, classroomId),
    ])
    return { students, offerings, competencies, grades, comments, attendance }
  }, [classroomId, periodId])

  const [commentFor, setCommentFor] = useState<Student | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportArea, setExportArea] = useState('')
  useEffect(() => setExportArea(''), [classroomId])

  const gradeMap = useMemo(() => {
    const m = new Map<string, CompetencyGrade>()
    for (const g of detail.data?.grades ?? []) m.set(`${g.student_id}:${g.competency_id}`, g)
    return m
  }, [detail.data])

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params)
    next.set(name, value)
    setParams(next, { replace: true })
  }

  if (base.loading) return <Loading shape="table" />
  if (base.error) return <ErrorBox message={base.error} onRetry={() => void base.reload()} />
  if (!classrooms.length) {
    return (
      <>
        <PageHeader title="Consolidado del aula" />
        <Empty title="No eres tutor de ningún aula" art="grades">Dirección asigna los tutores en “Cursos por aula”.</Empty>
      </>
    )
  }

  const d = detail.data
  const columns = (d?.offerings ?? []).map((o) => ({ o, comps: (d?.competencies ?? []).filter((c) => c.subject_id === o.subject_id) }))

  return (
    <>
      <PageHeader
        title="Consolidado del aula"
        subtitle="Niveles de logro de todas las áreas por bimestre."
        action={classroom && period && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setExportOpen(true)} disabled={!d}><Download className="h-4 w-4" />Exportar SIAGIE</Button>
            <Link to={`/libretas/${classroom.id}?bimestre=${period.id}`}>
              <Button><Printer className="h-4 w-4" />Libretas del aula</Button>
            </Link>
          </div>
        )}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <Field label="Aula">
          <Select value={classroomId ?? ''} onChange={(e) => setParam('aula', e.target.value)}>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </Select>
        </Field>
        <Field label="Bimestre">
          <Select value={periodId ?? ''} onChange={(e) => setParam('bimestre', e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_closed ? ' (cerrado)' : ''}</option>)}
          </Select>
        </Field>
      </div>

      {detail.error && <ErrorBox message={detail.error} onRetry={() => void detail.reload()} />}
      {detail.loading ? <Loading shape="table" rows={8} /> : d && (
        d.offerings.length === 0 ? <Empty title="El aula no tiene cursos" art="notebook" /> : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {columns.map(({ o, comps }) => {
                const total = comps.length * d.students.length
                const done = d.students.reduce((n, s) => n + comps.filter((c) => gradeMap.get(`${s.id}:${c.id}`)?.level).length, 0)
                const pct = total ? Math.round((done / total) * 100) : 0
                return (
                  <Link key={o.id} to={`/notas/${o.id}?bimestre=${periodId}`}>
                    <Badge tone={pct === 100 ? 'ok' : pct === 0 ? 'alert' : 'late'}>{courseCode(o)} {pct}%</Badge>
                  </Link>
                )
              })}
            </div>

            <Panel bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-linea">
                      <th rowSpan={2} className="sticky left-0 z-10 min-w-[14rem] bg-superficie px-4 py-2 text-left">Alumno</th>
                      {columns.map(({ o, comps }) => comps.length > 0 && (
                        <th key={o.id} colSpan={comps.length} className="border-l border-linea px-2 py-2 text-center">
                          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.subject.color }} />{courseCode(o)}</span>
                        </th>
                      ))}
                      <th rowSpan={2} className="border-l border-linea px-2 py-2 text-center">B/C</th>
                      <th rowSpan={2} className="px-2 py-2 text-center">Tard.</th>
                      <th rowSpan={2} className="px-2 py-2" />
                    </tr>
                    <tr className="border-b border-linea text-xs text-texto-suave">
                      {columns.flatMap(({ comps }) => comps.map((c, i) => (
                        <th key={c.id} title={c.name} className={cn('px-1 py-1 text-center font-normal', i === 0 && 'border-l border-linea')}>{c.code}</th>
                      )))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linea">
                    {d.students.map((s) => {
                      const lows = columns.reduce((n, { comps }) => n + comps.filter((c) => {
                        const l = gradeMap.get(`${s.id}:${c.id}`)?.level
                        return l === 'B' || l === 'C'
                      }).length, 0)
                      const att = d.attendance.find((a) => a.student_id === s.id)
                      const hasComment = d.comments.some((c) => c.student_id === s.id && c.comment.trim())
                      return (
                        <tr key={s.id} className="hover:bg-papel/60">
                          <td className="sticky left-0 z-10 bg-superficie px-4 py-1.5 font-bold">{s.last_name}, {s.first_name}</td>
                          {columns.flatMap(({ comps }) => comps.map((c, i) => (
                            <td key={c.id} className={cn('px-1 py-1.5 text-center', i === 0 && 'border-l border-linea')}>
                              <LevelChip level={gradeMap.get(`${s.id}:${c.id}`)?.level} className="h-6 min-w-8 text-xs" />
                            </td>
                          )))}
                          <td className={cn('border-l border-linea px-2 text-center font-bold', lows >= 3 ? 'text-estado-alerta' : lows > 0 ? 'text-estado-tarde' : 'text-texto-suave')}>{lows}</td>
                          <td className="px-2 text-center">{att?.late ?? '—'}</td>
                          <td className="whitespace-nowrap px-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => setCommentFor(s)} aria-label={`Apreciación de ${studentName(s)}`}>
                              <MessageSquareText className={cn('h-4 w-4', hasComment && 'text-estado-ok')} />
                            </Button>
                            <Link to={`/libreta/${s.id}?bimestre=${periodId}`} className="inline-flex rounded-md p-2 text-texto-suave hover:text-texto" aria-label={`Libreta de ${studentName(s)}`}>
                              <FileText className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
            <p className="mt-3 text-xs text-texto-suave">B/C: competencias en proceso o en inicio. Tres o más se marcan en rojo para seguimiento del tutor.</p>
          </>
        )
      )}

      <Modal open={!!commentFor} onClose={() => setCommentFor(null)} title={commentFor ? `Apreciación de ${studentName(commentFor)}` : ''}>
        {commentFor && periodId && (
          <CommentEditor
            key={commentFor.id}
            periodId={periodId}
            student={commentFor}
            initial={d?.comments.find((c) => c.student_id === commentFor.id)?.comment ?? ''}
            onSaved={() => { setCommentFor(null); void detail.reload(true) }}
          />
        )}
      </Modal>

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Exportar para el SIAGIE">
        <div className="space-y-4">
          <p className="text-sm text-texto-suave">
            Se descarga un archivo CSV (se abre en Excel) con el nivel y la conclusión descriptiva de cada competencia. Revisa que las columnas coincidan con la plantilla del SIAGIE antes de cargarlo.
          </p>
          <Field label="Área">
            <Select value={exportArea} onChange={(e) => setExportArea(e.target.value)}>
              <option value="">Todas las áreas</option>
              {(d?.offerings ?? []).map((o) => <option key={o.id} value={o.id}>{o.subject.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (!d || !classroom || !period) return
                exportSiagie({ classroom, period, students: d.students, offerings: d.offerings, competencies: d.competencies, grades: d.grades, offeringFilter: Number(exportArea) || null })
                setExportOpen(false)
              }}
            >
              <Download className="h-4 w-4" />Descargar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
