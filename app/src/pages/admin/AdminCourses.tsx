import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, FileClock, Plus } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Panel, Segmented, Select } from '@/components/ui'
import { TeacherAssignments } from '@/pages/admin/TeacherAssignments'
import { cn } from '@/lib/utils'
import { courseCode } from '@/components/course'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import {
  classroomLabel, createOffering, generateDigestsNow, listClassroomOfferings, listClassrooms, listSubjects, listTeachers,
  setClassroomTutor, subjectFitsClassroom, updateOffering, upsertOfferings,
} from '@/services/campus'
import type { Classroom, Offering } from '@/types'

const CLASSROOM_KEY = 'campus_admin_classroom'

/** Copia los cursos de un aula a otras del mismo nivel (por ejemplo 3.° A → 3.° B y C). */
function CopyCourses({ source, offerings, classrooms, onDone }: {
  source: Classroom
  offerings: Offering[]
  classrooms: Classroom[]
  onDone: () => void
}) {
  const toast = useToast()
  const sameLevel = (c: Classroom) => (c.level ?? '').trim().toLowerCase() === (source.level ?? '').trim().toLowerCase()
  const targets = classrooms.filter((c) => c.id !== source.id && sameLevel(c))
  const sameGrade = targets.filter((c) => (c.grade ?? '').trim() === (source.grade ?? '').trim()).map((c) => c.id)
  const [selected, setSelected] = useState<number[]>(sameGrade)
  const [withTeachers, setWithTeachers] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!selected.length) return
    setBusy(true)
    try {
      const rows = selected.flatMap((cid) => {
        const room = classrooms.find((c) => c.id === cid)
        return offerings
          .filter((o) => subjectFitsClassroom(o.subject, room))
          .map((o) => ({ classroom_id: cid, subject_id: o.subject_id, teacher_id: withTeachers ? o.teacher_id : null }))
      })
      const n = await upsertOfferings(rows, withTeachers)
      toast(withTeachers
        ? `Listo: ${rows.length} cursos en ${selected.length} aula${selected.length === 1 ? '' : 's'}, con sus docentes.`
        : `Se crearon ${n} curso${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} en ${selected.length} aula${selected.length === 1 ? '' : 's'}. Los que ya existían no cambiaron.`)
      onDone()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!targets.length) return <p className="text-sm text-texto-suave">No hay otras aulas de {source.level ?? 'este nivel'} para copiar.</p>

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-bold">Se copiarán {offerings.length} cursos de {classroomLabel(source)}:</p>
        <div className="flex flex-wrap gap-1.5">
          {offerings.map((o) => (
            <span key={o.id} className="inline-flex items-center gap-1.5 rounded-md bg-papel px-2 py-1 text-xs font-bold">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.subject.color }} />{o.subject.name}
            </span>
          ))}
        </div>
      </div>

      <fieldset>
        <div className="mb-2 flex items-center justify-between gap-3">
          <legend className="text-sm font-bold">A estas aulas</legend>
          <button type="button" className="text-sm font-bold text-tinta-500 hover:underline" onClick={() => setSelected(selected.length === targets.length ? [] : targets.map((t) => t.id))}>
            {selected.length === targets.length ? 'Quitar todas' : 'Elegir todas'}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {targets.map((c) => (
            <label key={c.id} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-bold', selected.includes(c.id) ? 'border-tinta bg-chispa-100' : 'border-linea')}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-tinta"
                checked={selected.includes(c.id)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
              />
              {classroomLabel(c)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 rounded-lg border border-linea p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-tinta" checked={withTeachers} onChange={(e) => setWithTeachers(e.target.checked)} />
        <span>
          <b>Copiar también los docentes</b>
          <span className="block text-texto-suave">
            {withTeachers ? 'Cada curso queda con el mismo docente que en el aula de origen (reemplaza al actual si había otro).' : 'Solo se crean los cursos que faltan, sin docente; los que ya existen no cambian.'}
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button onClick={() => void run()} loading={busy} disabled={!selected.length}>
          <Copy className="h-4 w-4" />Copiar a {selected.length} aula{selected.length === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  )
}


export default function AdminCourses() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const view = isAdmin && params.get('vista') === 'docente' ? 'docente' : 'aula'
  const [copyOpen, setCopyOpen] = useState(false)
  const base = useAsync(async () => {
    const [classrooms, subjects, teachers] = await Promise.all([listClassrooms(), listSubjects(), listTeachers()])
    return { classrooms, subjects, teachers }
  }, [])

  const [classroomId, setClassroomId] = useState<number | null>(() => Number(localStorage.getItem(CLASSROOM_KEY)) || null)
  useEffect(() => {
    if (!classroomId && base.data?.classrooms.length) setClassroomId(base.data.classrooms[0].id)
  }, [base.data, classroomId])

  const offerings = useAsync(
    async () => (classroomId ? listClassroomOfferings(classroomId, true) : []),
    [classroomId],
  )

  const [newSubject, setNewSubject] = useState('')
  const [newTeacher, setNewTeacher] = useState('')
  const [adding, setAdding] = useState(false)
  const [digestBusy, setDigestBusy] = useState(false)

  const classroom = base.data?.classrooms.find((c) => c.id === classroomId) ?? null
  const usedSubjects = new Set((offerings.data ?? []).map((o) => o.subject_id))
  const availableSubjects = (base.data?.subjects ?? []).filter((s) => !usedSubjects.has(s.id) && (!s.level || !classroom?.level || s.level.trim().toLowerCase() === classroom.level.trim().toLowerCase()))
  const teacherName = (id: string | null) => base.data?.teachers.find((t) => t.id === id)?.full_name

  async function run(action: () => Promise<void>, ok: string) {
    try {
      await action()
      toast(ok)
      void offerings.reload(true)
      void base.reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  async function onAdd() {
    if (!classroomId || !newSubject) return
    setAdding(true)
    await run(() => createOffering(classroomId, Number(newSubject), newTeacher || null), 'Curso agregado al aula.')
    setNewSubject('')
    setNewTeacher('')
    setAdding(false)
  }

  async function onDigests() {
    setDigestBusy(true)
    try {
      const n = await generateDigestsNow()
      toast(`Resumen de la semana generado para ${n} alumno${n === 1 ? '' : 's'}.`)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setDigestBusy(false)
    }
  }

  if (base.loading) return <Loading shape="table" />
  if (base.error) return <ErrorBox message={base.error} onRetry={() => void base.reload()} />
  const data = base.data!

  return (
    <>
      <PageHeader
        title="Cursos por aula"
        subtitle={isAdmin ? (view === 'docente' ? 'Marca los cursos que dicta cada docente en todas las aulas.' : 'Asigna docentes, tutor y cursos de cada aula.') : 'Consulta los cursos y docentes de cada aula.'}
        action={isAdmin && (
          <Button variant="secondary" onClick={() => void onDigests()} loading={digestBusy}>
            <FileClock className="h-4 w-4" />Generar resumen semanal
          </Button>
        )}
      />

      {isAdmin && (
        <div className="mb-6 overflow-x-auto">
          <Segmented<'aula' | 'docente'>
            value={view}
            onChange={(v) => setParams(v === 'docente' ? { vista: 'docente', docente: params.get('docente') ?? '' } : {}, { replace: true })}
            options={[{ value: 'aula', label: 'Por aula' }, { value: 'docente', label: 'Por docente' }]}
          />
        </div>
      )}

      {view === 'docente' ? (
        <TeacherAssignments
          classrooms={data.classrooms}
          subjects={data.subjects}
          teachers={data.teachers}
          teacherId={params.get('docente') ?? ''}
          onTeacher={(id) => setParams({ vista: 'docente', docente: id }, { replace: true })}
          onChanged={() => { void base.reload(true); void offerings.reload(true) }}
        />
      ) : (<>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
        <Field label="Aula">
          <Select
            value={classroomId ?? ''}
            onChange={(e) => {
              const id = Number(e.target.value)
              setClassroomId(id)
              localStorage.setItem(CLASSROOM_KEY, String(id))
            }}
          >
            {data.classrooms.map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </Select>
        </Field>
        {classroom && (
          <Field label="Tutor del aula" hint="Puede publicar avisos para el aula.">
            <Select
              value={classroom.tutor_id ?? ''}
              disabled={!isAdmin}
              onChange={(e) => void run(() => setClassroomTutor(classroom.id, e.target.value || null), 'Tutor actualizado.')}
            >
              <option value="">Sin tutor asignado</option>
              {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          </Field>
        )}
      </div>

      {data.teachers.length === 0 && isAdmin && (
        <div className="mb-6 rounded-xl bg-chispa-100 px-5 py-4 text-sm text-tinta">
          Todavía no hay docentes con cuenta. <Link to="/admin/cuentas?vista=docentes" className="font-bold underline">Crea las cuentas de docentes</Link> para asignarles cursos.
        </div>
      )}

      <Panel
        title={classroom ? `Cursos de ${classroomLabel(classroom)}` : 'Cursos'}
        action={isAdmin && !!offerings.data?.some((o) => o.is_active) && (
          <Button size="sm" variant="secondary" onClick={() => setCopyOpen(true)}><Copy className="h-4 w-4" />Copiar a otras aulas</Button>
        )}
        bodyClassName="p-0"
      >
        {offerings.error && <div className="p-5"><ErrorBox message={offerings.error} /></div>}
        {offerings.loading ? <div className="px-5"><Loading /></div> : !offerings.data?.length ? (
          <div className="p-5"><Empty title="Esta aula aún no tiene cursos" art="notebook">{isAdmin ? 'Agrega el primero con el formulario de abajo.' : undefined}</Empty></div>
        ) : (
          <ul className="divide-y divide-linea">
            {offerings.data.map((o) => (
              <li key={o.id} className={`flex flex-wrap items-center gap-4 px-5 py-3.5 ${o.is_active ? '' : 'opacity-60'}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold text-white" style={{ background: o.subject.color }}>
                  {courseCode(o)}
                </span>
                <div className="min-w-[10rem] flex-1">
                  <Link to={`/curso/${o.id}`} className="font-bold hover:underline">{o.subject.name}</Link>
                  {!o.is_active && <Badge className="ml-2">Inactivo</Badge>}
                  {!isAdmin && <p className="text-sm text-texto-suave">{teacherName(o.teacher_id) ?? 'Sin docente'}</p>}
                </div>
                {isAdmin && (
                  <>
                    <Select
                      aria-label={`Docente de ${o.subject.name}`}
                      value={o.teacher_id ?? ''}
                      onChange={(e) => void run(() => updateOffering(o.id, { teacher_id: e.target.value || null }), 'Docente asignado.')}
                      className="w-full sm:w-64"
                    >
                      <option value="">Sin docente</option>
                      {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </Select>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void run(() => updateOffering(o.id, { is_active: !o.is_active }), o.is_active ? 'Curso desactivado.' : 'Curso activado.')}
                    >
                      {o.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && classroom && (
          <div className="grid gap-3 border-t border-linea bg-papel/60 px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Agregar curso">
              <Select value={newSubject} onChange={(e) => setNewSubject(e.target.value)}>
                <option value="">Elegir área…</option>
                {availableSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Docente">
              <Select value={newTeacher} onChange={(e) => setNewTeacher(e.target.value)}>
                <option value="">Asignar después</option>
                {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </Select>
            </Field>
            <Button onClick={() => void onAdd()} disabled={!newSubject} loading={adding}><Plus className="h-4 w-4" />Agregar</Button>
          </div>
        )}
      </Panel>
      </>)}

      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="Copiar cursos a otras aulas" wide>
        {copyOpen && classroom && (
          <CopyCourses
            source={classroom}
            offerings={(offerings.data ?? []).filter((o) => o.is_active)}
            classrooms={data.classrooms}
            onDone={() => { setCopyOpen(false); void base.reload(true) }}
          />
        )}
      </Modal>
    </>
  )
}
