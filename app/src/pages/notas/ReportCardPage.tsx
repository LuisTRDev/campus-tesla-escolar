import { Fragment } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Minus, NotebookPen, Printer, TrendingDown, TrendingUp } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Button, Empty, ErrorBox, Loading, PageHeader, Panel, Segmented } from '@/components/ui'
import { LevelChip } from '@/components/levels'
import { ObservationsPanel } from '@/components/Observations'
import { supabase } from '@/lib/supabase'
import { useAsync } from '@/lib/useAsync'
import { positiveInteger } from '@/lib/security'
import { classroomLabel, getPeopleNames, listClassroomOfferings, studentName } from '@/services/campus'
import { currentPeriod, listCompetencies, listComments, listGradesForOfferings, listPeriods, periodAttendance } from '@/services/notas'
import { LEVEL_LABELS, type Classroom, type Competency, type CompetencyGrade, type GradingPeriod, type Offering, type PeriodAttendance } from '@/types'

type Student = { id: number; first_name: string | null; last_name: string | null; dni: string | null }

type ReportData = {
  classroom: Classroom
  students: Student[]
  offerings: Offering[]
  competencies: Competency[]
  periods: GradingPeriod[]
  grades: CompetencyGrade[]
  comments: { period_id: number; student_id: number; comment: string }[]
  attendance: Map<number, PeriodAttendance[]>
  tutorName: string | null
  year: number
}

async function loadReportData(classroomId: number, onlyStudentId?: number): Promise<ReportData | null> {
  const { data: classroom, error } = await supabase.from('classrooms').select('id, grade, section, level, tutor_id').eq('id', positiveInteger(classroomId)).maybeSingle()
  if (error) throw error
  if (!classroom) return null

  let studentQuery = supabase.from('students').select('id, first_name, last_name, dni').eq('classroom_id', classroomId).order('last_name').order('first_name')
  if (onlyStudentId) studentQuery = studentQuery.eq('id', positiveInteger(onlyStudentId))
  const [studentsRes, offerings, periods] = await Promise.all([studentQuery, listClassroomOfferings(classroomId), listPeriods()])
  if (studentsRes.error) throw studentsRes.error
  const students = (studentsRes.data ?? []) as Student[]

  const [competencies, grades, comments, names, yearRow] = await Promise.all([
    listCompetencies(offerings.map((o) => o.subject_id)),
    listGradesForOfferings(offerings.map((o) => o.id)),
    listComments(students.map((s) => s.id)),
    getPeopleNames([(classroom as Classroom).tutor_id ?? null]),
    supabase.from('academic_years').select('year').eq('is_current', true).maybeSingle(),
  ])

  const attendance = new Map<number, PeriodAttendance[]>()
  const today = new Date().toISOString().slice(0, 10)
  await Promise.all(periods.filter((p) => p.starts_on <= today).map(async (p) => {
    attendance.set(p.id, await periodAttendance(p.id, classroomId))
  }))

  return {
    classroom: classroom as Classroom,
    students,
    offerings,
    competencies,
    periods,
    grades,
    comments,
    attendance,
    tutorName: (classroom as Classroom).tutor_id ? names[(classroom as Classroom).tutor_id!] ?? null : null,
    year: (yearRow.data as { year: number } | null)?.year ?? new Date().getFullYear(),
  }
}

// ---------------------------------------------------------------------------
// Hoja de la libreta (una página A4 por alumno)
// ---------------------------------------------------------------------------
function ReportCardSheet({ data, student, upTo }: { data: ReportData; student: Student; upTo: GradingPeriod }) {
  const shown = data.periods.filter((p) => p.number <= upTo.number)
  const isFinal = upTo.number === data.periods.length
  const gradeOf = (periodId: number, competencyId: number) =>
    data.grades.find((g) => g.period_id === periodId && g.student_id === student.id && g.competency_id === competencyId)
  const comment = data.comments.find((c) => c.period_id === upTo.id && c.student_id === student.id)?.comment
  const conclusions = data.offerings.flatMap((o) =>
    data.competencies
      .filter((c) => c.subject_id === o.subject_id)
      .map((c) => ({ o, c, g: gradeOf(upTo.id, c.id) }))
      .filter((x) => x.g?.conclusion))

  return (
    <article className="report-card force-light mx-auto max-w-[210mm] bg-superficie p-8 text-[12px] leading-snug text-black ring-1 ring-linea print:p-0 print:ring-0">
      <header className="flex items-center gap-4 border-b-2 border-tinta pb-3">
        <img src="/images/logo-nikola-tesla.png" alt="" className="h-16 w-16 object-contain" />
        <div className="flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-texto-suave">I.E.P. Nikola Tesla</p>
          <h1 className="font-display text-lg font-bold leading-tight">Informe de progreso del aprendizaje del estudiante</h1>
          <p>Año escolar {data.year} · {upTo.name}</p>
        </div>
      </header>

      <table className="mt-3 w-full text-[12px]">
        <tbody>
          <tr>
            <td className="w-24 py-0.5 text-texto-suave">Estudiante</td><td className="font-bold">{student.last_name}, {student.first_name}</td>
            <td className="w-16 py-0.5 text-texto-suave">DNI</td><td className="font-bold">{student.dni ?? '—'}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-texto-suave">Nivel</td><td>{data.classroom.level ?? '—'}</td>
            <td className="py-0.5 text-texto-suave">Grado</td><td>{classroomLabel({ ...data.classroom, level: null })}</td>
          </tr>
          <tr>
            <td className="py-0.5 text-texto-suave">Tutor(a)</td><td colSpan={3}>{data.tutorName ?? '—'}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-4 w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-tinta text-white">
            <th className="border border-tinta px-2 py-1 text-left">Área</th>
            <th className="border border-tinta px-2 py-1 text-left">Competencia</th>
            {shown.map((p) => <th key={p.id} className="w-10 border border-tinta px-1 py-1 text-center">{['I', 'II', 'III', 'IV'][p.number - 1]}</th>)}
            {isFinal && <th className="w-12 border border-tinta px-1 py-1 text-center">Final</th>}
          </tr>
        </thead>
        <tbody>
          {data.offerings.map((o) => {
            const comps = data.competencies.filter((c) => c.subject_id === o.subject_id)
            if (!comps.length) return null
            return comps.map((c, i) => (
              <tr key={c.id} className="break-inside-avoid">
                {i === 0 && <td rowSpan={comps.length} className="border border-linea px-2 py-1 align-top font-bold">{o.subject.name}</td>}
                <td className="border border-linea px-2 py-1">{c.name}</td>
                {shown.map((p) => (
                  <td key={p.id} className="border border-linea text-center font-display text-[13px] font-bold">{gradeOf(p.id, c.id)?.level ?? ''}</td>
                ))}
                {isFinal && <td className="border border-linea bg-papel text-center font-display text-[13px] font-bold">{gradeOf(upTo.id, c.id)?.level ?? ''}</td>}
              </tr>
            ))
          })}
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
        <div>
          <h2 className="mb-1 text-[12px] font-bold uppercase">Conclusiones descriptivas · {upTo.name}</h2>
          {conclusions.length === 0 ? <p className="text-texto-suave">Sin conclusiones registradas.</p> : (
            <ul className="space-y-1">
              {conclusions.map(({ o, c, g }) => (
                <li key={c.id}><b>{o.subject.short_name ?? o.subject.name} {c.code} ({g!.level ?? '—'}):</b> {g!.conclusion}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h2 className="mb-1 text-[12px] font-bold uppercase">Asistencia</h2>
          <table className="border-collapse text-[11px]">
            <thead>
              <tr><th /><th className="px-2 text-center">Puntual</th><th className="px-2 text-center">Tardanza</th><th className="px-2 text-center">Sin reg.</th></tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const a = data.attendance.get(p.id)?.find((x) => x.student_id === student.id)
                return (
                  <tr key={p.id}>
                    <td className="pr-2 font-bold">{['I', 'II', 'III', 'IV'][p.number - 1]}</td>
                    <td className="text-center">{a?.on_time ?? '—'}</td>
                    <td className="text-center">{a?.late ?? '—'}</td>
                    <td className="text-center">{a ? Math.max(a.school_days - a.on_time - a.late, 0) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <h2 className="mb-1 text-[12px] font-bold uppercase">Apreciación del tutor(a)</h2>
        <p className="min-h-[3em] whitespace-pre-line border border-linea px-2 py-1">{comment || ' '}</p>
      </div>

      <p className="mt-3 text-[10px] text-texto-suave">
        {Object.values(LEVEL_LABELS).join(' · ')}
      </p>

      <footer className="mt-12 grid grid-cols-3 gap-8 text-center text-[11px]">
        {['Tutor(a)', 'Dirección', 'Padre, madre o apoderado'].map((s) => (
          <div key={s} className="border-t border-black pt-1">{s}</div>
        ))}
      </footer>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Avance frente al bimestre anterior (solo contra sí mismo, nunca contra otros)
// ---------------------------------------------------------------------------
const POINTS: Record<string, number> = { AD: 4, A: 3, B: 2, C: 1 }

function Comparison({ data, student, upTo, periods }: { data: ReportData; student: Student; upTo: GradingPeriod; periods: GradingPeriod[] }) {
  const idx = periods.findIndex((p) => p.id === upTo.id)
  const prev = idx > 0 ? periods[idx - 1] : null
  if (!prev) return null
  const levelsOf = (periodId: number) => data.grades.filter((g) => g.period_id === periodId && g.student_id === student.id && g.level).map((g) => g.level as string)
  const now = levelsOf(upTo.id)
  const before = levelsOf(prev.id)
  if (!now.length || !before.length) return null
  const avg = (l: string[]) => l.reduce((a, x) => a + POINTS[x], 0) / l.length
  const diff = avg(now) - avg(before)
  const count = (l: string[], k: string) => l.filter((x) => x === k).length
  // Competencias que subieron o bajaron.
  const changes = data.competencies.map((c) => {
    const a = data.grades.find((g) => g.period_id === prev.id && g.student_id === student.id && g.competency_id === c.id)?.level
    const b = data.grades.find((g) => g.period_id === upTo.id && g.student_id === student.id && g.competency_id === c.id)?.level
    return a && b && a !== b ? { c, a, b, up: POINTS[b] > POINTS[a] } : null
  }).filter((x): x is NonNullable<typeof x> => !!x)
  return (
    <Panel className="mb-6 print:hidden" title={<span className="flex items-center gap-2">
      {diff > 0.1 ? <TrendingUp className="h-5 w-5 text-estado-ok" /> : diff < -0.1 ? <TrendingDown className="h-5 w-5 text-estado-alerta" /> : <Minus className="h-5 w-5 text-texto-suave" />}
      Frente al {prev.name}
    </span>}>
      <p className="mb-3 text-sm text-texto-suave">
        {diff > 0.1 ? '¡Mejoró! Cada vez más competencias en A y AD.' : diff < -0.1 ? 'Bajó un poco. Revisen juntos las competencias marcadas.' : 'Se mantiene estable.'}
      </p>
      <div className="flex flex-wrap gap-4">
        {['AD', 'A', 'B', 'C'].map((k) => {
          const d = count(now, k) - count(before, k)
          return (
            <span key={k} className="flex items-center gap-1.5 text-sm">
              <LevelChip level={k as 'AD'} /><b className="font-display text-lg">{count(now, k)}</b>
              <span className={d > 0 ? (k === 'AD' || k === 'A' ? 'text-estado-ok' : 'text-estado-alerta') : d < 0 ? (k === 'AD' || k === 'A' ? 'text-estado-alerta' : 'text-estado-ok') : 'text-texto-suave'}>
                {d > 0 ? `+${d}` : d < 0 ? d : '='}
              </span>
            </span>
          )
        })}
      </div>
      {changes.length > 0 && (
        <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {changes.slice(0, 10).map((x) => (
            <li key={x.c.id} className="flex items-center gap-2">
              {x.up ? <TrendingUp className="h-4 w-4 shrink-0 text-estado-ok" /> : <TrendingDown className="h-4 w-4 shrink-0 text-estado-alerta" />}
              <span className="min-w-0 flex-1 truncate">{x.c.name}</span>
              <span className="shrink-0 text-xs">{x.a} → {x.b}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------
function ReportCardView({ classroomId, studentId, title }: { classroomId: number | null; studentId?: number; title: string }) {
  const [params, setParams] = useSearchParams()
  const { profile } = useAuth()
  const isFamily = profile?.role === 'STUDENT' || profile?.role === 'GUARDIAN'
  const { data, loading, error, reload } = useAsync(async () => (classroomId ? loadReportData(classroomId, studentId) : null), [classroomId, studentId])

  if (loading) return <Loading shape="page" />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (!data) return <Empty title="No encontramos el aula" art="search" />

  // La familia solo ve bimestres publicados.
  const available = isFamily ? data.periods.filter((p) => p.is_published) : data.periods
  if (!available.length) {
    return (
      <>
        <PageHeader title={title} />
        <Empty title="Aún no hay libretas publicadas" art="grades">El colegio publica la libreta al cierre de cada bimestre.</Empty>
      </>
    )
  }
  const requested = Number(params.get('bimestre'))
  const upTo = available.find((p) => p.id === requested)
    ?? (isFamily ? available[available.length - 1] : currentPeriod(available))!

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={title}
          subtitle={`${classroomLabel(data.classroom)}. ${data.students.length} libreta${data.students.length === 1 ? '' : 's'}.`}
          action={<Button onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir o guardar PDF</Button>}
        />
        <div className="mb-6">
          <Segmented<string>
            value={String(upTo.id)}
            onChange={(v) => setParams({ bimestre: v }, { replace: true })}
            options={available.map((p) => ({ value: String(p.id), label: p.name }))}
          />
        </div>
        {!upTo.is_published && !isFamily && (
          <p className="mb-6 rounded-lg bg-chispa-100 px-4 py-3 text-sm text-tinta">Este bimestre todavía no está publicado: las familias aún no ven estas notas.</p>
        )}
      </div>
      {studentId && data.students[0] && <Comparison data={data} student={data.students[0]} upTo={upTo} periods={available} />}
      {data.students.length === 0 ? <Empty title="No hay alumnos" art="search" /> : (
        <div className="space-y-8 print:space-y-0">
          {data.students.map((s) => (
            <Fragment key={s.id}>
              <ReportCardSheet data={data} student={s} upTo={upTo} />
            </Fragment>
          ))}
        </div>
      )}
      {studentId && !isFamily && (
        <Panel className="mt-8 print:hidden" title={<span className="flex items-center gap-2"><NotebookPen className="h-5 w-5" />Observaciones privadas</span>}>
          <ObservationsPanel studentId={studentId} name={data.students[0]?.first_name ?? undefined} canPsych={profile?.role === 'ADMIN'} />
        </Panel>
      )}
    </>
  )
}

/** /libreta (familia), /libreta/:studentId (personal) y /libretas/:classroomId (aula completa). */
export default function ReportCardPage({ bulk }: { bulk?: boolean }) {
  const { studentId, classroomId } = useParams()
  const focus = useFocusStudent()

  const single = useAsync(async () => {
    if (bulk || !studentId) return null
    const { data, error } = await supabase.from('students').select('id, first_name, last_name, classroom_id').eq('id', positiveInteger(studentId)).maybeSingle()
    if (error) throw error
    return data as { id: number; first_name: string | null; last_name: string | null; classroom_id: number | null } | null
  }, [bulk, studentId])

  if (bulk) return <ReportCardView classroomId={Number(classroomId) || null} title="Libretas del aula" />
  if (studentId) {
    if (single.loading) return <Loading />
    if (single.error) return <ErrorBox message={single.error} />
    if (!single.data) return <Empty title="No encontramos al alumno" art="search" />
    return <ReportCardView classroomId={single.data.classroom_id} studentId={single.data.id} title={`Libreta de ${studentName(single.data)}`} />
  }
  if (!focus) return <Empty title="Tu cuenta no está vinculada a un alumno" />
  return <ReportCardView classroomId={focus.classroom_id} studentId={focus.id} title={`Libreta de ${focus.first_name ?? 'tu hijo'}`} />
}
