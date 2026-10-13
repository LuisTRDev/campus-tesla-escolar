import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CalendarClock, ClipboardList, Pin, Plus, Trash2 } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Textarea } from '@/components/ui'
import { TaskRow } from '@/components/course'
import { AnnouncementItem } from '@/pages/shared/AnnouncementFeed'
import { NewAssignmentForm } from '@/pages/course/NewAssignmentForm'
import { CopyContentButton, CourseSearch, CoverPicker, ForumTab, TutorTab, UnitsTab, useTutorEnabled } from '@/pages/course/CourseExtras'
import { ArtLayer } from '@/components/tesla'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, formatTime, localInputToIso, relativeDue } from '@/lib/format'
import { useKey } from '@/lib/ux'
import {
  classroomLabel, createAnnouncement, deleteAnnouncement, getOffering, getPeopleNames, listAssignments,
  listCourseAnnouncements, listStudentSubmissions, listSubmissionsForAssignments, taskState,
} from '@/services/campus'
import { deleteScheduledAnnouncement, listScheduledAnnouncements, scheduleAnnouncement } from '@/services/aprendizaje'
import { setAnnouncementAck } from '@/services/comunicacion'
import type { Assignment, Offering } from '@/types'

type Tab = 'news' | 'units' | 'tasks' | 'forum' | 'tutor'

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------
function NewsTab({ offering, canManage }: { offering: Offering; canManage: boolean }) {
  const { profile, isAdmin } = useAuth()
  const toast = useToast()
  const { data, loading, error, reload, mutate } = useAsync(async () => {
    const items = await listCourseAnnouncements(offering.id)
    const authors = await getPeopleNames(items.map((i) => i.author_id))
    return { items, authors }
  }, [offering.id])

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [ack, setAck] = useState(false)
  const [later, setLater] = useState(false)
  const [publishAt, setPublishAt] = useState('')
  const [busy, setBusy] = useState(false)
  const scheduled = useAsync(() => (canManage ? listScheduledAnnouncements(offering.id) : Promise.resolve([])), [offering.id, canManage])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    if (later) {
      try {
        const at = localInputToIso(publishAt)
        await scheduleAnnouncement({ scope: 'COURSE', offeringId: offering.id, title, body, publishAt: at ?? '' })
        setTitle(''); setBody(''); setLater(false); setPublishAt('')
        toast('Anuncio programado.')
        void scheduled.reload(true)
      } catch (err) {
        toast(toMessage(err), 'error')
      } finally {
        setBusy(false)
      }
      return
    }
    // Aparece al instante arriba de la lista; se revierte si el servidor lo rechaza.
    const undo = mutate((cur) => cur && {
      ...cur,
      items: [{ id: -Date.now(), scope: 'COURSE', offering_id: offering.id, classroom_id: null, author_id: profile.id, title: title.trim(), body: body.trim(), pinned, published_at: new Date().toISOString() }, ...cur.items],
      authors: { ...cur.authors, [profile.id]: profile.full_name ?? '' },
    })
    try {
      await createAnnouncement({ scope: 'COURSE', offeringId: offering.id, title, body, pinned, authorId: profile.id })
      if (ack) {
        const fresh = await listCourseAnnouncements(offering.id)
        const mine = fresh.find((a) => a.author_id === profile.id && a.title === title.trim())
        if (mine) await setAnnouncementAck(mine.id, true)
      }
      setTitle(''); setBody(''); setPinned(false); setAck(false)
      toast('Anuncio publicado.')
      void reload(true)
    } catch (err) {
      undo()
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="Novedades del curso">
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {loading ? <Loading /> : !data?.items.length ? (
          <Empty title="Sin novedades todavía" art="bell">{canManage ? 'Publica un anuncio para dar la bienvenida al curso.' : 'Tu docente publicará aquí los avisos del curso.'}</Empty>
        ) : (
          <div className="divide-y divide-linea">
            {data.items.map((item) => (
              <AnnouncementItem
                key={item.id}
                item={item}
                author={data.authors[item.author_id]}
                onDelete={item.author_id === profile?.id || isAdmin ? async () => {
                  if (!confirm('¿Eliminar este anuncio?')) return
                  const undo = mutate((cur) => cur && { ...cur, items: cur.items.filter((x) => x.id !== item.id) })
                  try { await deleteAnnouncement(item.id) } catch (err) { undo(); toast(toMessage(err), 'error') }
                } : undefined}
              />
            ))}
          </div>
        )}
      </Panel>
      {canManage && (
        <Panel title="Publicar anuncio" className="h-fit">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></Field>
            <Field label="Mensaje"><Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required /></Field>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4 accent-tinta" />
              <Pin className="h-4 w-4" />Fijar arriba
            </label>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 accent-tinta" />
              Pedir confirmación de lectura
            </label>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} className="h-4 w-4 accent-tinta" />
              <CalendarClock className="h-4 w-4" />Programar
            </label>
            {later && <Field label="Se publica el"><Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} required /></Field>}
            <Button type="submit" loading={busy}>{later ? 'Programar anuncio' : 'Publicar anuncio'}</Button>
          </form>
          {!!scheduled.data?.length && (
            <div className="mt-5 border-t border-linea pt-4">
              <p className="mb-2 text-sm font-bold">Programados</p>
              <ul className="space-y-2">
                {scheduled.data.map((sa) => (
                  <li key={sa.id} className="flex items-start gap-2 text-sm">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-tinta-500" />
                    <span className="min-w-0 flex-1"><b className="block truncate">{sa.title}</b><span className="text-texto-suave">{formatShort(sa.publish_at)} {formatTime(sa.publish_at)}</span></span>
                    <button onClick={async () => { await deleteScheduledAnnouncement(sa.id).catch((e) => toast(toMessage(e), 'error')); void scheduled.reload(true) }}
                      className="rounded p-1 text-texto-suave hover:text-estado-alerta" aria-label="Cancelar"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tareas
// ---------------------------------------------------------------------------
function TeacherTaskItem({ assignment, delivered, graded }: { assignment: Assignment; delivered: number; graded: number }) {
  const due = relativeDue(assignment.due_at)
  return (
    <li>
      <Link to={`/tarea/${assignment.id}`} className="flex flex-wrap items-center gap-3 py-3.5 hover:bg-papel">
        <div className="min-w-0 flex-1">
          <p className="font-bold">{assignment.title}</p>
          <p className="text-sm text-texto-suave">{due.label}</p>
        </div>
        {assignment.kind === 'QUIZ' && <Badge tone="spark">Evaluación</Badge>}
        {assignment.status === 'DRAFT' && <Badge>{assignment.publish_at ? `Se publica el ${formatShort(assignment.publish_at)}` : 'Borrador'}</Badge>}
        {assignment.status === 'CLOSED' && <Badge>Cerrada</Badge>}
        <span className="text-sm text-texto-suave"><b className="text-texto">{delivered}</b> entregas, <b className="text-texto">{graded}</b> calificadas</span>
      </Link>
    </li>
  )
}

function TasksTab({ offering, canManage }: { offering: Offering; canManage: boolean }) {
  const student = useFocusStudent()
  const [creating, setCreating] = useState(false)
  useKey('n', () => setCreating(true), canManage)
  const { data, loading, error, reload } = useAsync(async () => {
    const assignments = await listAssignments(offering.id)
    const ids = assignments.map((a) => a.id)
    const submissions = canManage
      ? await listSubmissionsForAssignments(ids)
      : student ? await listStudentSubmissions(student.id, ids) : []
    return { assignments, submissions }
  }, [offering.id, canManage, student?.id])

  return (
    <>
      {canManage && (
        <div className="mb-4">
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nueva tarea o evaluación</Button>
        </div>
      )}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.assignments.length ? (
        <Empty title="Sin tareas todavía" art="tasks">{canManage ? 'Crea la primera tarea del curso.' : 'Las tareas del curso aparecerán aquí.'}</Empty>
      ) : (
        <Panel bodyClassName="py-2">
          <ul className="divide-y divide-linea">
            {data.assignments.map((a) => {
              const subs = data.submissions.filter((s) => s.assignment_id === a.id)
              if (canManage) {
                return <TeacherTaskItem key={a.id} assignment={a} delivered={subs.length} graded={subs.filter((s) => s.status === 'GRADED').length} />
              }
              const mine = subs[0]
              return (
                <li key={a.id}>
                  <TaskRow assignment={a} offering={offering} state={taskState(a, mine)} submission={mine} to={`/tarea/${a.id}`} />
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva tarea" wide>
        <NewAssignmentForm offeringId={offering.id} subjectId={offering.subject_id} onDone={() => { setCreating(false); void reload(true) }} />
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function CoursePage() {
  const { offeringId } = useParams()
  const [params, setParams] = useSearchParams()
  const { profile, isAdmin } = useAuth()
  const id = Number(offeringId)
  const rawTab = params.get('vista')
  const tab = (rawTab === 'materials' ? 'units' : rawTab as Tab) || 'news'
  const tutor = useTutorEnabled(id)

  const { data, loading, error, reload } = useAsync(async () => {
    const offering = await getOffering(id)
    const names = offering ? await getPeopleNames([offering.teacher_id]) : {}
    return { offering, teacherName: offering?.teacher_id ? names[offering.teacher_id] : undefined }
  }, [id])

  if (loading) return <Loading shape="page" />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (!data?.offering) return <Empty title="No encontramos este curso" art="search">Puede que ya no esté disponible o que no tengas acceso.</Empty>

  const { offering, teacherName } = data
  const canManage = isAdmin || (profile?.role === 'TEACHER' && offering.teacher_id === profile.id)
  const showTutor = canManage || !!tutor.data?.enabled
  const go = (v: string) => setParams({ vista: v }, { replace: true })

  return (
    <>
      {offering.cover && (
        <div className="relative -mt-2 mb-4 h-24 overflow-hidden rounded-2xl sm:h-32" style={{ viewTransitionName: `course-${offering.id}` } as CSSProperties}>
          <ArtLayer value={offering.cover} />
        </div>
      )}
      <div style={offering.cover ? undefined : ({ viewTransitionName: `course-${offering.id}` } as CSSProperties)}>
        <PageHeader
          accent={offering.subject.color}
          title={offering.subject.name}
          subtitle={[classroomLabel(offering.classroom), teacherName].filter(Boolean).join('. ')}
          action={
            <div className="flex flex-wrap gap-2">
              <CourseSearch offering={offering} onGo={go} />
              {canManage && <CoverPicker offering={offering} onChanged={() => void reload(true)} />}
              {canManage && profile && <CopyContentButton offering={offering} teacherId={profile.id} />}
              {canManage && <Link to={`/notas/${offering.id}`}><Button size="sm" variant="secondary"><ClipboardList className="h-4 w-4" />Registro de notas</Button></Link>}
            </div>
          }
        />
      </div>
      {offering.description && <p className="-mt-3 mb-6 max-w-prosa text-texto-suave">{offering.description}</p>}
      <div className="mb-6 overflow-x-auto">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => go(v)}
          options={[
            { value: 'news', label: 'Novedades' },
            { value: 'units', label: 'Unidades' },
            { value: 'tasks', label: 'Tareas' },
            { value: 'forum', label: 'Foro' },
            ...(showTutor ? [{ value: 'tutor' as Tab, label: 'Tutor IA' }] : []),
          ]}
        />
      </div>
      {tab === 'news' && <NewsTab offering={offering} canManage={canManage} />}
      {tab === 'units' && <UnitsTab offering={offering} canManage={canManage} />}
      {tab === 'tasks' && <TasksTab offering={offering} canManage={canManage} />}
      {tab === 'forum' && <ForumTab offering={offering} canManage={canManage} />}
      {tab === 'tutor' && showTutor && <TutorTab offering={offering} canManage={canManage} />}
    </>
  )
}
