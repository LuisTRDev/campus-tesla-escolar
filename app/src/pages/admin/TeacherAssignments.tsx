import { useMemo, useState } from 'react'
import { Check, Plus, UserRound } from 'lucide-react'
import { Badge, ErrorBox, Field, Loading, Panel, Segmented, Select } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { classroomLabel, listYearOfferings, setClassroomTutor, subjectFitsClassroom, updateOffering, upsertOfferings } from '@/services/campus'
import type { Classroom, Offering, Subject } from '@/types'

type Level = 'all' | 'Primaria' | 'Secundaria'

/**
 * Asignación por docente: todas las aulas con sus áreas; un toque asigna,
 * quita o reasigna el curso al docente elegido. Los cambios se ven al instante.
 */
export function TeacherAssignments({ classrooms, subjects, teachers, teacherId, onTeacher, onChanged }: {
  classrooms: Classroom[]
  subjects: Subject[]
  teachers: { id: string; full_name: string }[]
  teacherId: string
  onTeacher: (id: string) => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [level, setLevel] = useState<Level>('all')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const offerings = useAsync(listYearOfferings, [])
  const [tutors, setTutors] = useState<Record<number, string | null>>({})

  const teacherName = (id: string | null) => teachers.find((t) => t.id === id)?.full_name ?? 'otro docente'
  const shortName = (id: string | null) => {
    const parts = teacherName(id).split(' ')
    return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : parts[0]
  }

  const byKey = useMemo(() => {
    const m = new Map<string, Offering>()
    for (const o of offerings.data ?? []) m.set(`${o.classroom_id}:${o.subject_id}`, o)
    return m
  }, [offerings.data])

  const rooms = classrooms.filter((c) => level === 'all' || c.level?.trim().toLowerCase() === level.toLowerCase())
  const tutorOf = (c: Classroom) => (c.id in tutors ? tutors[c.id] : c.tutor_id ?? null)

  const mine = (offerings.data ?? []).filter((o) => o.is_active && o.teacher_id === teacherId)
  const mineRooms = new Set(mine.map((o) => o.classroom_id)).size
  const tutorCount = classrooms.filter((c) => tutorOf(c) === teacherId).length

  async function toggle(c: Classroom, s: Subject) {
    const key = `${c.id}:${s.id}`
    const current = byKey.get(key)
    const isMine = !!current && current.is_active && current.teacher_id === teacherId
    const isOther = !!current && current.is_active && !!current.teacher_id && current.teacher_id !== teacherId
    if (isOther && !confirm(`${s.name} de ${classroomLabel(c)} lo dicta ${teacherName(current!.teacher_id)}. ¿Pasarlo a ${teacherName(teacherId)}?`)) return

    setBusyKey(key)
    // Cambio inmediato en pantalla; se revierte si el servidor lo rechaza.
    const undo = offerings.mutate((list) => {
      const rest = (list ?? []).filter((o) => !(o.classroom_id === c.id && o.subject_id === s.id))
      const base: Offering = current ?? { id: -Date.now(), classroom_id: c.id, subject_id: s.id, teacher_id: null, description: null, is_active: true, subject: s, classroom: c }
      return [...rest, { ...base, teacher_id: isMine ? null : teacherId, is_active: true }]
    })
    try {
      if (isMine) await updateOffering(current!.id, { teacher_id: null })
      else await upsertOfferings([{ classroom_id: c.id, subject_id: s.id, teacher_id: teacherId }], true)
      toast(isMine ? `${s.name} de ${classroomLabel(c)} quedó sin docente.` : `${s.name} de ${classroomLabel(c)} asignado a ${teacherName(teacherId)}.`)
      void offerings.reload(true)
      onChanged()
    } catch (err) {
      undo()
      toast(toMessage(err), 'error')
    } finally {
      setBusyKey(null)
    }
  }

  async function toggleTutor(c: Classroom) {
    const isTutor = tutorOf(c) === teacherId
    const previous = tutorOf(c)
    if (!isTutor && previous && !confirm(`El tutor de ${classroomLabel(c)} es ${teacherName(previous)}. ¿Cambiarlo por ${teacherName(teacherId)}?`)) return
    setTutors((t) => ({ ...t, [c.id]: isTutor ? null : teacherId }))
    try {
      await setClassroomTutor(c.id, isTutor ? null : teacherId)
      toast(isTutor ? 'Tutor quitado.' : `${teacherName(teacherId)} es tutor de ${classroomLabel(c)}.`)
      onChanged()
    } catch (err) {
      setTutors((t) => ({ ...t, [c.id]: previous }))
      toast(toMessage(err), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Docente" className="w-full sm:w-80">
          <Select value={teacherId} onChange={(e) => onTeacher(e.target.value)}>
            <option value="">Elegir docente…</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </Select>
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-bold">Nivel</span>
          <Segmented<Level> value={level} onChange={setLevel} options={[{ value: 'all', label: 'Todos' }, { value: 'Primaria', label: 'Primaria' }, { value: 'Secundaria', label: 'Secundaria' }]} />
        </div>
      </div>

      {!teacherId ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-linea px-5 py-8 text-sm text-texto-suave">
          <UserRound className="h-5 w-5" />Elige un docente para ver y marcar sus cursos en todas las aulas.
        </p>
      ) : offerings.loading ? <Loading shape="table" /> : offerings.error ? <ErrorBox message={offerings.error} onRetry={() => void offerings.reload()} /> : (
        <>
          <p className="text-sm">
            <b>{teacherName(teacherId)}</b> dicta <b>{mine.length}</b> curso{mine.length === 1 ? '' : 's'} en <b>{mineRooms}</b> aula{mineRooms === 1 ? '' : 's'}
            {tutorCount > 0 && <> y es tutor de <b>{tutorCount}</b></>}.
            <span className="ml-1 text-texto-suave">Toca un área para asignarla o quitarla.</span>
          </p>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-texto-suave">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-tinta" />Lo dicta este docente</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-linea bg-papel" />Lo dicta otro docente</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-texto-suave/50" />Sin docente o sin crear</span>
          </div>

          <div className="space-y-3">
            {rooms.map((c) => {
              const roomSubjects = subjects.filter((s) => subjectFitsClassroom(s, c))
              const tutor = tutorOf(c)
              return (
                <Panel key={c.id} bodyClassName="p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-lg font-semibold">{classroomLabel(c)}</p>
                    <button
                      type="button"
                      onClick={() => void toggleTutor(c)}
                      aria-pressed={tutor === teacherId}
                      className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition-colors',
                        tutor === teacherId ? 'border-transparent bg-chispa text-tinta' : 'border-linea text-texto-suave hover:border-tinta-500')}
                    >
                      {tutor === teacherId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {tutor === teacherId ? 'Es tutor' : tutor ? `Tutor: ${shortName(tutor)}` : 'Hacer tutor'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {roomSubjects.map((s) => {
                      const o = byKey.get(`${c.id}:${s.id}`)
                      const isMine = !!o && o.is_active && o.teacher_id === teacherId
                      const isOther = !!o && o.is_active && !!o.teacher_id && o.teacher_id !== teacherId
                      const key = `${c.id}:${s.id}`
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={busyKey === key}
                          onClick={() => void toggle(c, s)}
                          aria-pressed={isMine}
                          title={isMine ? 'Quitar a este docente' : isOther ? `Lo dicta ${teacherName(o!.teacher_id)}` : 'Asignar a este docente'}
                          className={cn(
                            'inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition-colors disabled:opacity-60',
                            isMine && 'border-transparent bg-tinta text-white',
                            isOther && 'border-linea bg-papel text-texto-suave hover:border-tinta-500',
                            !isMine && !isOther && 'border-dashed border-texto-suave/50 text-texto-suave hover:border-tinta-500 hover:text-texto',
                          )}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                          {s.name}
                          {isMine && <Check className="h-4 w-4" />}
                          {isOther && <span className="font-normal">· {shortName(o!.teacher_id)}</span>}
                        </button>
                      )
                    })}
                    {roomSubjects.length === 0 && <Badge>No hay áreas para el nivel de esta aula</Badge>}
                  </div>
                </Panel>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
