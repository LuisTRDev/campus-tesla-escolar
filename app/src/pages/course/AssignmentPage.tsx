import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Lock, Paperclip, Send, Trash2, Undo2, Unlock } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Panel, Segmented, Select, Textarea } from '@/components/ui'
import { TaskStateBadge, gradeText } from '@/components/course'
import { FileDropzone, LinkListField, StoredFileCard, usePreview } from '@/components/files'
import { FILE_UPLOADS, linkName } from '@/lib/links'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { BUCKET_MATERIALS, BUCKET_SUBMISSIONS } from '@/lib/supabase'
import { formatDue, formatShort, formatTime, relativeDue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { haptic, useDraft, useKey } from '@/lib/ux'
import { useHorizontalSwipe } from '@/lib/useSwipe'
import { getRubric, rubricLevel, rubricScore, type Rubric } from '@/services/aprendizaje'
import { QuizEditor, QuizResults, QuizTake } from '@/pages/course/Quiz'
import {
  AnnotationTools, DuplicateButton, FeedbackAudio, GroupBadge, GroupsButton, RubricGrid, RubricPicker, SnippetsMenu, VersionsButton,
} from '@/pages/course/GradingTools'
import {
  classroomLabel, deleteAssignment, getAssignment, gradeSubmission, listClassroomStudents, listStudentSubmissions,
  listSubmissionsForAssignment, setAssignmentStatus, studentName, submitWork, taskState,
} from '@/services/campus'
import { LEVEL_LABELS, type AssignmentWithCourse, type Level, type Submission, type SubmissionFile } from '@/types'

function FileChip({ file, onRemove }: { file: SubmissionFile; onRemove?: () => void }) {
  return <StoredFileCard file={{ bucket: BUCKET_SUBMISSIONS, path: file.path, name: file.name, type: file.type, size: file.size }} onRemove={onRemove} />
}

/**
 * Sello de "Entregado" con la hora: el único efecto llamativo del campus.
 * Se estampa con animación justo al entregar; después queda quieto.
 */
function SubmittedStamp({ at, late, animate }: { at: string; late: boolean; animate: boolean }) {
  const day = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(at))
  return (
    <div className="pointer-events-none absolute right-4 top-[4.25rem] z-10 sm:right-6" aria-hidden>
      <div className="relative">
        {animate && <span className="stamp-ink absolute inset-0 rounded-xl bg-estado-ok/40 blur-md" />}
        <div className={cn(
          'relative -rotate-[14deg] rounded-xl border-[3px] border-double px-3 py-1.5 text-center font-display uppercase',
          late ? 'border-estado-tarde text-estado-tarde' : 'border-estado-ok text-estado-ok',
          'bg-superficie/80',
          animate && 'stamp-in',
        )}>
          <p className="text-lg font-bold leading-none tracking-[0.12em]">{late ? 'Entregado tarde' : 'Entregado'}</p>
          <p className="mt-0.5 text-[11px] font-bold normal-case tracking-normal opacity-90">{day} · {formatTime(at)}</p>
        </div>
      </div>
    </div>
  )
}

function GradeResult({ assignment, submission, rubric }: { assignment: AssignmentWithCourse; submission: Submission; rubric?: Rubric | null }) {
  const grade = gradeText(assignment, submission)
  return (
    <div className="rounded-xl bg-papel p-5">
      {submission.status === 'GRADED' && (
        <div className="flex items-baseline gap-3">
          <span className="font-display text-5xl font-bold tracking-tight text-texto">{grade}</span>
          {assignment.grading_type === 'LEVEL' && submission.level && (
            <span className="text-texto-suave">{LEVEL_LABELS[submission.level].split(' · ')[1]}</span>
          )}
        </div>
      )}
      {submission.status === 'RETURNED' && <p className="font-bold text-estado-tarde">Tu docente te devolvió esta tarea para que la corrijas.</p>}
      {submission.feedback && (
        <div className="mt-3">
          <p className="text-sm font-bold text-texto-suave">Comentario del docente</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed">{submission.feedback}</p>
        </div>
      )}
      {submission.feedback_audio_path && (
        <div className="mt-3">
          <p className="mb-1 text-sm font-bold text-texto-suave">Nota de voz del docente</p>
          <FeedbackAudio submission={submission} canEdit={false} onChanged={() => undefined} />
        </div>
      )}
      {!!submission.feedback_annotations?.length && (
        <div className="mt-3"><AnnotationTools submission={submission} canEdit={false} onChanged={() => undefined} /></div>
      )}
      {rubric && submission.rubric_scores && submission.status === 'GRADED' && (
        <div className="mt-4">
          <p className="mb-1 text-sm font-bold text-texto-suave">Rúbrica: {rubric.title}</p>
          <RubricGrid rubric={rubric} value={submission.rubric_scores} readOnly maxScore={Number(assignment.max_score)} gradingType={assignment.grading_type} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista del alumno
// ---------------------------------------------------------------------------
function StudentSubmit({ assignment, studentId, rubric }: { assignment: AssignmentWithCourse; studentId: number; rubric: Rubric | null }) {
  const toast = useToast()
  const { data, loading, error, reload, mutate } = useAsync(
    async () => (await listStudentSubmissions(studentId, [assignment.id]))[0] ?? null,
    [studentId, assignment.id],
  )
  const [content, setContent, clearDraft, hadDraft] = useDraft<string>(`entrega:${assignment.id}:${studentId}`, '')
  const [keep, setKeep] = useState<SubmissionFile[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newLinks, setNewLinks] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stampedAt, setStampedAt] = useState<number | null>(null)

  // Solo se reinicia el formulario cuando cambia la entrega (no en cada sincronización).
  const version = data ? `${data.id}-${data.status}-${data.submitted_at}` : 'none'
  useEffect(() => {
    // Si hay un borrador sin enviar, se respeta lo que el alumno estaba escribiendo.
    if (!hadDraft || data?.status === 'GRADED') setContent(data?.content ?? '')
    setKeep(data?.files ?? [])
    setNewFiles([])
    setNewLinks([])
    setEditing(!data || data.status === 'RETURNED')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />

  const state = taskState(assignment, data ?? undefined)
  const pastDue = !!assignment.due_at && Date.parse(assignment.due_at) < Date.now()
  const canSubmit = assignment.status === 'PUBLISHED' && (!pastDue || assignment.allow_late) && data?.status !== 'GRADED'
  const showStamp = !!data && !editing && data.status === 'SUBMITTED'

  async function onSubmit() {
    setBusy(true)
    try {
      await submitWork({ assignmentId: assignment.id, studentId, content, keepFiles: keep, newFiles, newLinks, existing: data })
      const now = new Date().toISOString()
      // Cambio inmediato en pantalla; la sincronización trae los datos definitivos.
      mutate((cur) => ({
        ...(cur ?? { id: -1, assignment_id: assignment.id, student_id: studentId, score: null, level: null, feedback: null, graded_at: null }),
        content: content || null,
        files: [
          ...keep,
          ...newFiles.map((f) => ({ path: `pending/${f.name}`, name: f.name, size: f.size, type: f.type })),
          ...newLinks.map((url) => ({ path: url, name: linkName(url), size: 0, type: 'link' })),
        ],
        status: 'SUBMITTED',
        submitted_at: now,
        is_late: pastDue,
      }) as Submission)
      setEditing(false)
      setStampedAt(Date.now())
      clearDraft()
      haptic('success')
      toast(data ? 'Entrega actualizada.' : 'Tarea entregada.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Tu entrega" action={<TaskStateBadge state={state} />} className="relative overflow-hidden">
      {showStamp && <SubmittedStamp at={data.submitted_at} late={data.is_late} animate={!!stampedAt && Date.now() - stampedAt < 4000} />}
      <div className="space-y-5">
        {assignment.is_group && <GroupBadge assignmentId={assignment.id} studentId={studentId} />}
        {data && (data.status === 'GRADED' || data.status === 'RETURNED' || data.feedback) && <GradeResult assignment={assignment} submission={data} rubric={rubric} />}
        {rubric && !data?.rubric_scores && (
          <details className="rounded-xl border border-linea p-3">
            <summary className="cursor-pointer text-sm font-bold">Cómo te van a evaluar (rúbrica)</summary>
            <div className="mt-3"><RubricGrid rubric={rubric} value={null} readOnly /></div>
          </details>
        )}

        {data && !editing && (
          <div className="space-y-3">
            <p className={cn('text-sm text-texto-suave', showStamp && 'pr-36')}>
              Entregada el {formatShort(data.submitted_at)} a las {formatTime(data.submitted_at)}{data.is_late ? ', fuera de plazo' : ''}.
            </p>
            {data.content && <p className="whitespace-pre-line rounded-lg border border-linea p-4 leading-relaxed">{data.content}</p>}
            {data.files.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{data.files.map((f) => <FileChip key={f.path} file={f} />)}</ul>}
            <div className="flex flex-wrap gap-2">
              {canSubmit && <Button variant="secondary" onClick={() => setEditing(true)}>Editar entrega</Button>}
              <VersionsButton submissionId={data.id} />
            </div>
          </div>
        )}

        {editing && canSubmit && (
          <div className="space-y-4">
            <Field label="Tu respuesta" hint={hadDraft ? 'Recuperamos lo que estabas escribiendo.' : `Puedes escribir aquí, ${FILE_UPLOADS ? 'adjuntar archivos' : 'pegar enlaces'} o ambas cosas. Se guarda solo mientras escribes.`}>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={8000} className="min-h-40" />
            </Field>
            <div>
              <p className="mb-2 text-sm font-bold">{FILE_UPLOADS ? 'Archivos' : 'Enlaces'} ({keep.length + newFiles.length + newLinks.length} de 5)</p>
              {keep.length > 0 && (
                <ul className="mb-2 grid gap-2 sm:grid-cols-2">
                  {keep.map((f) => <FileChip key={f.path} file={f} onRemove={() => setKeep((k) => k.filter((x) => x.path !== f.path))} />)}
                </ul>
              )}
              {FILE_UPLOADS ? (
                <FileDropzone
                  files={newFiles}
                  onChange={setNewFiles}
                  max={5 - keep.length}
                  maxBytes={15 * 1024 * 1024}
                  hint="Fotos, PDF, Word, Excel, PowerPoint o audio. Máximo 15 MB por archivo."
                />
              ) : (
                <LinkListField
                  links={newLinks}
                  onChange={setNewLinks}
                  max={5 - keep.length}
                  hint="Sube tu trabajo (fotos, documento, presentación…) a Google Drive y pega aquí el enlace."
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void onSubmit()} loading={busy} className={cn('min-h-12 px-6 text-base', busy && 'progress-fill')}><Send className="h-4 w-4" />{data ? 'Actualizar entrega' : 'Entregar tarea'}</Button>
              {data && data.status !== 'RETURNED' && <Button variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>}
            </div>
          </div>
        )}

        {!canSubmit && !data && (
          <p className="text-sm text-texto-suave">
            {assignment.status === 'CLOSED' ? 'Tu docente cerró las entregas de esta tarea.' : 'La fecha límite pasó y esta tarea no acepta entregas tardías.'}
          </p>
        )}
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Vista de la familia (solo lectura)
// ---------------------------------------------------------------------------
function GuardianView({ assignment, studentId, name, rubric }: { assignment: AssignmentWithCourse; studentId: number; name: string; rubric: Rubric | null }) {
  const { data, loading, error, reload } = useAsync(
    async () => (await listStudentSubmissions(studentId, [assignment.id]))[0] ?? null,
    [studentId, assignment.id],
  )
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  const state = taskState(assignment, data ?? undefined)
  return (
    <Panel title={`Entrega de ${name}`} action={<TaskStateBadge state={state} />}>
      {!data ? (
        <p className="text-texto-suave">{state === 'PENDING' ? `${name} todavía no entrega esta tarea. ${relativeDue(assignment.due_at).label}.` : `${name} no entregó esta tarea.`}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-texto-suave">Entregada el {formatShort(data.submitted_at)} a las {formatTime(data.submitted_at)}{data.is_late ? ', fuera de plazo' : ''}.</p>
          {(data.status !== 'SUBMITTED' || data.feedback) && <GradeResult assignment={assignment} submission={data} rubric={rubric} />}
          {data.content && <p className="whitespace-pre-line rounded-lg border border-linea p-4 leading-relaxed">{data.content}</p>}
          {data.files.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{data.files.map((f) => <FileChip key={f.path} file={f} />)}</ul>}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Vista del docente: lista del aula + calificación
// ---------------------------------------------------------------------------
function GradePanel({ assignment, submission, name, onSaved, readOnly, rubric }: {
  assignment: AssignmentWithCourse
  submission: Submission
  name: string
  onSaved: (patch: Partial<Submission>) => void
  readOnly: boolean
  rubric: Rubric | null
}) {
  const toast = useToast()
  const [score, setScore] = useState(submission.score == null ? '' : String(submission.score))
  const [level, setLevel] = useState<Level | ''>(submission.level ?? '')
  const [feedback, setFeedback] = useState(submission.feedback ?? '')
  const [rubricScores, setRubricScores] = useState<Record<string, Level> | null>(submission.rubric_scores ?? null)
  const [extra, setExtra] = useState<Partial<Submission>>({})
  const shown = { ...submission, ...extra }

  // Al marcar la rúbrica, la nota se calcula sola (se puede ajustar a mano).
  function onRubric(v: Record<string, Level>) {
    setRubricScores(v)
    if (!rubric) return
    if (assignment.grading_type === 'LEVEL') {
      const l = rubricLevel(v, rubric.criteria)
      if (l) setLevel(l)
    } else {
      const sc = rubricScore(v, rubric.criteria, Number(assignment.max_score))
      if (sc != null) setScore(String(sc))
    }
  }
  const [busy, setBusy] = useState<'GRADED' | 'RETURNED' | null>(null)

  async function save(action: 'GRADED' | 'RETURNED') {
    setBusy(action)
    try {
      await gradeSubmission({
        submissionId: submission.id, gradingType: assignment.grading_type, maxScore: Number(assignment.max_score),
        score, level, feedback, action, rubricScores: rubric ? rubricScores : undefined,
      })
      toast(action === 'GRADED' ? `Calificación de ${name} guardada.` : `Tarea devuelta a ${name}.`)
      onSaved(action === 'GRADED'
        ? { status: 'GRADED', feedback: feedback || null, score: assignment.grading_type === 'SCORE' ? Number(score.replace(',', '.')) : null, level: assignment.grading_type === 'LEVEL' ? (level || null) : null }
        : { status: 'RETURNED', feedback: feedback || null })
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-texto-suave">
          Entregada el {formatShort(submission.submitted_at)} a las {formatTime(submission.submitted_at)}
          {submission.is_late && <Badge tone="late" className="ml-2">Fuera de plazo</Badge>}
        </p>
        {submission.content
          ? <p className="mt-3 whitespace-pre-line rounded-lg border border-linea p-4 leading-relaxed">{submission.content}</p>
          : <p className="mt-3 text-sm text-texto-suave">Sin texto; revisa los archivos.</p>}
        {submission.files.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2">{submission.files.map((f) => <FileChip key={f.path} file={f} />)}</ul>}
        <div className="mt-2"><VersionsButton submissionId={submission.id} /></div>
      </div>

      {readOnly ? (
        submission.status !== 'SUBMITTED' && <GradeResult assignment={assignment} submission={submission} rubric={rubric} />
      ) : (
        <div className="space-y-4 border-t border-linea pt-5">
          {rubric && (
            <div>
              <p className="mb-1 text-sm font-bold">Rúbrica: {rubric.title}</p>
              <RubricGrid rubric={rubric} value={rubricScores} onChange={onRubric} maxScore={Number(assignment.max_score)} gradingType={assignment.grading_type} />
            </div>
          )}
          {assignment.grading_type === 'SCORE' ? (
            <Field label={`Nota (de 0 a ${Number(assignment.max_score)})`}>
              <Input inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} className="max-w-32 font-display text-2xl font-bold" />
            </Field>
          ) : (
            <Field label="Nivel de logro">
              <Select value={level} onChange={(e) => setLevel(e.target.value as Level | '')} className="max-w-xs">
                <option value="">Elegir…</option>
                {(Object.keys(LEVEL_LABELS) as Level[]).map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Comentario para el alumno" hint="Lo verán el alumno y su familia.">
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={4000} className="min-h-24" />
          </Field>
          <div className="-mt-2 flex flex-wrap items-start gap-2">
            <SnippetsMenu current={feedback} onInsert={(t) => setFeedback((f) => (f.trim() ? f.trim() + '\n' + t : t))} />
          </div>
          <FeedbackAudio submission={shown} canEdit onChanged={(path) => setExtra((x) => ({ ...x, feedback_audio_path: path }))} />
          <AnnotationTools submission={shown} canEdit onChanged={(list) => setExtra((x) => ({ ...x, feedback_annotations: list }))} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save('GRADED')} loading={busy === 'GRADED'} disabled={!!busy}>Guardar calificación</Button>
            <Button variant="secondary" onClick={() => void save('RETURNED')} loading={busy === 'RETURNED'} disabled={!!busy}>
              <Undo2 className="h-4 w-4" />Devolver para corregir
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function TeacherReview({ assignment, readOnly, rubric, onChanged }: { assignment: AssignmentWithCourse; readOnly: boolean; rubric: Rubric | null; onChanged: () => void }) {
  const [params, setParams] = useSearchParams()
  const selected = Number(params.get('alumno')) || null
  const { data, loading, error, reload, mutate } = useAsync(async () => {
    const [students, submissions] = await Promise.all([
      listClassroomStudents(assignment.offering.classroom_id),
      listSubmissionsForAssignment(assignment.id),
    ])
    return { students, submissions }
  }, [assignment.id, assignment.offering.classroom_id])

  const rows = useMemo(() => {
    if (!data) return []
    const bySt = new Map(data.submissions.map((s) => [s.student_id, s]))
    return data.students.map((st) => {
      const sub = bySt.get(st.id)
      return { student: st, submission: sub, state: taskState(assignment, sub) }
    })
  }, [data, assignment])

  function select(id: number | null) {
    const next = new URLSearchParams(params)
    if (id) next.set('alumno', String(id))
    else next.delete('alumno')
    setParams(next, { replace: true })
  }

  // Calificación rápida: J / K o deslizar para pasar entre entregas.
  const withSub = rows.filter((r) => r.submission)
  const pos = withSub.findIndex((r) => r.student.id === selected)
  const go = (dir: 1 | -1) => {
    if (!withSub.length) return
    const next = withSub[(pos + dir + withSub.length) % withSub.length]
    if (next) { haptic(); select(next.student.id) }
  }
  useKey('j', () => go(1), !!data)
  useKey('k', () => go(-1), !!data)
  const swipe = useHorizontalSwipe(() => go(1), () => go(-1))

  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />

  const delivered = rows.filter((r) => r.submission).length
  const graded = rows.filter((r) => r.submission?.status === 'GRADED').length
  const current = rows.find((r) => r.student.id === selected) ?? null

  // La lista se actualiza al instante y pasa al siguiente alumno sin esperar la recarga.
  function afterSave(patch: Partial<Submission>) {
    const id = current?.submission?.id
    mutate((cur) => cur && { ...cur, submissions: cur.submissions.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
    const idx = rows.findIndex((r) => r.student.id === selected)
    const next = [...rows.slice(idx + 1), ...rows.slice(0, idx)].find((r) => r.submission?.status === 'SUBMITTED' && r.submission.id !== id)
    if (next) select(next.student.id)
    void reload(true)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_1fr]">
      <Panel className="h-fit" title="Alumnos" action={<span className="text-sm text-texto-suave">{delivered}/{rows.length} entregas, {graded} calificadas</span>} bodyClassName="p-2">
        {rows.length === 0 ? <p className="p-3 text-sm text-texto-suave">El aula no tiene alumnos registrados.</p> : (
          <ul>
            {rows.map((r) => (
              <li key={r.student.id}>
                <button
                  onClick={() => select(r.student.id)}
                  aria-current={r.student.id === selected}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-papel', r.student.id === selected && 'bg-chispa-100 hover:bg-chispa-100')}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{r.student.last_name}, {r.student.first_name}</span>
                  {r.submission?.status === 'GRADED'
                    ? <span className="font-display font-bold">{gradeText(assignment, r.submission)}</span>
                    : <TaskStateBadge state={r.state} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={current ? studentName(current.student) : 'Revisión'}
        action={withSub.length > 1 && (
          <span className="flex items-center gap-1 text-sm text-texto-suave">
            <Button size="sm" variant="ghost" onClick={() => go(-1)} aria-label="Entrega anterior (K)">‹</Button>
            {pos >= 0 ? pos + 1 : '–'}/{withSub.length}
            <Button size="sm" variant="ghost" onClick={() => go(1)} aria-label="Siguiente entrega (J)">›</Button>
          </span>
        )}
      >
        <div {...swipe}>
        {!current ? (
          <p className="text-texto-suave">Elige un alumno de la lista para ver su entrega{readOnly ? '' : ' y calificarla'}.</p>
        ) : !current.submission ? (
          <p className="text-texto-suave">{studentName(current.student)} todavía no entrega esta tarea.</p>
        ) : (
          <GradePanel
            key={`${current.submission.id}-${current.submission.status}`}
            assignment={assignment}
            submission={current.submission}
            name={current.student.first_name ?? studentName(current.student)}
            onSaved={afterSave}
            readOnly={readOnly}
            rubric={rubric}
          />
        )}
        </div>
        {!readOnly && withSub.length > 1 && <p className="mt-4 text-xs text-texto-suave">Atajo: <b>J</b> siguiente, <b>K</b> anterior (o desliza en el celular).</p>}
      </Panel>
      {!readOnly && assignment.kind !== 'QUIZ' && (
        <div className="flex flex-wrap gap-2 xl:col-span-2">
          <GroupsButton assignment={assignment} students={data?.students ?? []} onChanged={() => { onChanged(); void reload(true) }} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function AssignmentPage() {
  const { assignmentId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, isAdmin } = useAuth()
  const focus = useFocusStudent()
  const preview = usePreview()
  const { data: assignment, loading, error, reload } = useAsync(() => getAssignment(Number(assignmentId)), [assignmentId])
  const [busy, setBusy] = useState(false)
  const rubricId = assignment?.rubric_id ?? null
  const { data: rubric, reload: reloadRubric } = useAsync(() => (rubricId ? getRubric(rubricId) : Promise.resolve(null)), [rubricId], { live: false })
  const [quizTab, setQuizTab] = useState<'questions' | 'results'>('questions')
  const roster = useAsync(
    () => (assignment?.kind === 'QUIZ' ? listClassroomStudents(assignment.offering.classroom_id) : Promise.resolve([])),
    [assignment?.kind, assignment?.offering.classroom_id], { live: false },
  )

  if (loading) return <Loading shape="page" />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (!assignment) return <Empty title="No encontramos esta tarea" art="search">Puede que haya sido eliminada o que no tengas acceso.</Empty>

  const role = profile?.role
  const canManage = isAdmin || (role === 'TEACHER' && assignment.offering.teacher_id === profile?.id)
  const isStaffViewer = role === 'AUXILIARY' || (role === 'TEACHER' && !canManage)
  const due = relativeDue(assignment.due_at)

  async function changeStatus(status: 'PUBLISHED' | 'CLOSED') {
    setBusy(true)
    try {
      await setAssignmentStatus(assignment!.id, status)
      toast(status === 'CLOSED' ? 'Entregas cerradas.' : 'Tarea publicada y recibiendo entregas.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('¿Eliminar esta tarea? También se borrarán las entregas y notas de los alumnos.')) return
    try {
      await deleteAssignment(assignment!)
      toast('Tarea eliminada.')
      navigate(`/curso/${assignment!.offering_id}?vista=tasks`, { replace: true })
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <>
      <Link to={`/curso/${assignment.offering_id}?vista=tasks`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-texto-suave hover:text-texto">
        <ArrowLeft className="h-4 w-4" />{assignment.offering.subject.name}
      </Link>
      <PageHeader
        accent={assignment.offering.subject.color}
        title={assignment.title}
        subtitle={`${classroomLabel(assignment.offering.classroom)}. ${formatDue(assignment.due_at)}.`}
        action={canManage && (
          <div className="flex flex-wrap gap-2">
            {assignment.status === 'DRAFT' && <Button size="sm" onClick={() => void changeStatus('PUBLISHED')} loading={busy}><Send className="h-4 w-4" />Publicar</Button>}
            {assignment.status === 'PUBLISHED' && <Button size="sm" variant="secondary" onClick={() => void changeStatus('CLOSED')} loading={busy}><Lock className="h-4 w-4" />Cerrar entregas</Button>}
            {assignment.status === 'CLOSED' && <Button size="sm" variant="secondary" onClick={() => void changeStatus('PUBLISHED')} loading={busy}><Unlock className="h-4 w-4" />Reabrir entregas</Button>}
            {assignment.kind !== 'QUIZ' && <RubricPicker assignment={assignment} rubric={rubric ?? null} onChanged={() => { void reload(true); void reloadRubric(true) }} />}
            {profile && <DuplicateButton assignment={assignment} teacherId={profile.id} />}
            <Button size="sm" variant="danger" onClick={() => void remove()}><Trash2 className="h-4 w-4" />Eliminar</Button>
          </div>
        )}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {assignment.status === 'DRAFT' && <Badge>Borrador: los alumnos aún no la ven</Badge>}
        {assignment.status === 'CLOSED' && <Badge>Entregas cerradas</Badge>}
        {assignment.status === 'PUBLISHED' && <Badge tone={due.tone === 'overdue' ? 'alert' : due.tone === 'soon' ? 'late' : 'neutral'}>{due.label}</Badge>}
        <Badge tone="info">{assignment.grading_type === 'SCORE' ? `Nota sobre ${Number(assignment.max_score)}` : 'Nivel de logro AD, A, B, C'}</Badge>
        {!assignment.allow_late && <Badge>No acepta entregas tardías</Badge>}
        {assignment.kind === 'QUIZ' && <Badge tone="spark">Evaluación en línea</Badge>}
        {assignment.is_group && <Badge tone="info">Tarea en grupo</Badge>}
        {assignment.status === 'DRAFT' && assignment.publish_at && <Badge tone="info">Se publica el {formatShort(assignment.publish_at)} a las {formatTime(assignment.publish_at)}</Badge>}
      </div>

      <div className={cn('grid gap-6', !canManage && !isStaffViewer && 'lg:grid-cols-[1fr_1.1fr]')}>
        <Panel title="Indicaciones">
          {assignment.instructions
            ? <p className="max-w-prosa whitespace-pre-line text-[15px] leading-relaxed">{assignment.instructions}</p>
            : <p className="text-texto-suave">Sin indicaciones escritas.</p>}
          {assignment.attachment_path && (
            <button
              onClick={() => preview({ bucket: BUCKET_MATERIALS, path: assignment.attachment_path!, name: assignment.attachment_name ?? 'Archivo adjunto' })}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-linea px-3 py-2 text-sm font-bold hover:border-tinta-500"
            >
              <Paperclip className="h-4 w-4" />{assignment.attachment_name ?? 'Archivo adjunto'}
            </button>
          )}
        </Panel>

        {assignment.kind === 'QUIZ' && (canManage || isStaffViewer) ? (
          <div className="space-y-4">
            <Segmented value={quizTab} onChange={setQuizTab} options={[{ value: 'questions', label: 'Preguntas' }, { value: 'results', label: 'Resultados' }]} />
            {quizTab === 'questions' && canManage
              ? <QuizEditor assignment={assignment} onChanged={() => void reload(true)} />
              : <QuizResults assignment={assignment} students={roster.data ?? []} />}
          </div>
        ) : canManage || isStaffViewer ? (
          <TeacherReview assignment={assignment} readOnly={!canManage} rubric={rubric ?? null} onChanged={() => void reload(true)} />
        ) : role === 'STUDENT' && focus ? (
          assignment.kind === 'QUIZ'
            ? <QuizTake assignment={assignment} studentId={focus.id} />
            : <StudentSubmit assignment={assignment} studentId={focus.id} rubric={rubric ?? null} />
        ) : role === 'GUARDIAN' && focus ? (
          <GuardianView assignment={assignment} studentId={focus.id} name={focus.first_name ?? 'Tu hijo'} rubric={rubric ?? null} />
        ) : null}
      </div>
    </>
  )
}
