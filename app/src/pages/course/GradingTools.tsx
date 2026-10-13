import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { Copy, History, Mic, MessageSquarePlus, PenLine, Save, Square, Trash2, Users, Wand2, X } from 'lucide-react'
import { Badge, Button, Empty, Field, Input, Loading, Modal, Select } from '@/components/ui'
import { signedUrl } from '@/components/files'
import { LevelChip } from '@/components/levels'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { BUCKET_SUBMISSIONS } from '@/lib/supabase'
import { formatShort, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  BUCKET_FEEDBACK, deleteSnippet, duplicateAssignment, listGroups, listRubrics, listSnippets, listVersions, rubricLevel, rubricScore, saveGroups,
  saveSnippet, setAssignmentRubric, setFeedbackAnnotations, setFeedbackAudio, uploadFeedbackFile,
  type Rubric,
} from '@/services/aprendizaje'
import { classroomLabel, listTeacherOfferings, studentName } from '@/services/campus'
import type { AssignmentWithCourse, Level, Submission, SubmissionFile } from '@/types'

const LEVELS: Level[] = ['AD', 'A', 'B', 'C']

// ---------------------------------------------------------------------------
// Rúbrica
// ---------------------------------------------------------------------------
export function RubricPicker({ assignment, rubric, onChanged }: { assignment: AssignmentWithCourse; rubric: Rubric | null; onChanged: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const { data } = useAsync(() => (open ? listRubrics() : Promise.resolve([])), [open], { live: false })
  async function pick(id: number | null) {
    try {
      await setAssignmentRubric(assignment.id, id)
      toast(id ? 'Rúbrica asignada.' : 'Rúbrica quitada.')
      setOpen(false)
      onChanged()
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{rubric ? `Rúbrica: ${rubric.title}` : 'Usar rúbrica'}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Rúbrica de la tarea">
        {!data ? <Loading /> : !data.length ? (
          <Empty title="Todavía no tienes rúbricas" art="grades" compact>Créalas en <Link to="/recursos?vista=rubricas" className="font-bold underline">Recursos → Rúbricas</Link>.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.map((r) => (
              <li key={r.id}>
                <button onClick={() => void pick(r.id)} className={cn('w-full rounded-xl border p-3 text-left hover:border-tinta-500', rubric?.id === r.id ? 'border-tinta bg-chispa-100' : 'border-linea')}>
                  <p className="font-bold">{r.title}</p>
                  <p className="text-sm text-texto-suave">{r.criteria.map((c) => c.name).join(' · ')}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-between">
          {rubric ? <Button variant="ghost" onClick={() => void pick(null)}>Quitar rúbrica</Button> : <span />}
          <Link to="/recursos?vista=rubricas" className="text-sm font-bold text-tinta-500 hover:underline">Crear o editar rúbricas</Link>
        </div>
      </Modal>
    </>
  )
}

/** Grilla para calificar marcando un nivel por criterio. */
export function RubricGrid({ rubric, value, onChange, readOnly, maxScore, gradingType }: {
  rubric: Rubric; value: Record<string, Level> | null; onChange?: (v: Record<string, Level>) => void; readOnly?: boolean
  maxScore?: number; gradingType?: 'SCORE' | 'LEVEL'
}) {
  const scores = value ?? {}
  const level = rubricLevel(scores, rubric.criteria)
  const score = gradingType === 'SCORE' && maxScore ? rubricScore(scores, rubric.criteria, maxScore) : null
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-40 text-left text-xs text-texto-suave">Criterio</th>
            {LEVELS.map((l) => <th key={l} className="text-center"><LevelChip level={l} /></th>)}
          </tr>
        </thead>
        <tbody>
          {rubric.criteria.map((c) => (
            <tr key={c.id}>
              <td className="align-top font-bold">{c.name}</td>
              {LEVELS.map((l) => {
                const on = scores[c.id] === l
                return (
                  <td key={l} className="align-top">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => onChange?.({ ...scores, [c.id]: l })}
                      aria-pressed={on}
                      className={cn('h-full min-h-14 w-full rounded-lg border p-2 text-left text-xs leading-snug transition-colors',
                        on ? 'border-tinta bg-chispa-100 font-bold text-tinta' : 'border-linea text-texto-suave', !readOnly && !on && 'hover:border-tinta-500')}
                    >
                      {c.levels[l] || '—'}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {(level || score != null) && (
        <p className="mt-2 flex items-center gap-2 text-sm">
          Resultado: {level && <LevelChip level={level} />} {score != null && <b className="font-display text-lg">{score}/{maxScore}</b>}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nota de voz
// ---------------------------------------------------------------------------
function pickMime() {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) if (window.MediaRecorder?.isTypeSupported?.(t)) return t
  return ''
}

export function AudioRecorder({ onDone, maxSeconds = 180 }: { onDone: (blob: Blob) => Promise<void>; maxSeconds?: number }) {
  const toast = useToast()
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [busy, setBusy] = useState(false)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<number>()

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickMime()
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        window.clearInterval(timer.current)
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })
        setRec(null)
        if (blob.size < 1500) return
        setBusy(true)
        try { await onDone(blob) } catch (err) { toast(toMessage(err), 'error') } finally { setBusy(false) }
      }
      r.start()
      setRec(r)
      setSeconds(0)
      timer.current = window.setInterval(() => setSeconds((s) => {
        if (s + 1 >= maxSeconds) r.stop()
        return s + 1
      }), 1000)
    } catch {
      toast('No se pudo usar el micrófono. Revisa el permiso del navegador.', 'error')
    }
  }

  useEffect(() => () => window.clearInterval(timer.current), [])

  if (busy) return <Button size="sm" variant="secondary" loading>Subiendo audio…</Button>
  return rec ? (
    <Button size="sm" variant="danger" onClick={() => rec.stop()}>
      <span className="rec-dot h-2.5 w-2.5 rounded-full bg-estado-alerta" />Detener {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}<Square className="h-3.5 w-3.5" />
    </Button>
  ) : (
    <Button size="sm" variant="secondary" onClick={() => void start()}><Mic className="h-4 w-4" />Grabar nota de voz</Button>
  )
}

export function StoredAudio({ bucket, path, className }: { bucket: string; path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    signedUrl(bucket, path).then((u) => { if (alive) setUrl(u) }).catch(() => undefined)
    return () => { alive = false }
  }, [bucket, path])
  if (!url) return <span className="text-sm text-texto-suave">Cargando audio…</span>
  return <audio controls src={url} className={cn('h-10 w-full max-w-sm', className)} preload="metadata" />
}

export function FeedbackAudio({ submission, canEdit, onChanged }: { submission: Submission; canEdit: boolean; onChanged: (path: string | null) => void }) {
  const toast = useToast()
  const path = submission.feedback_audio_path
  return (
    <div className="space-y-2">
      {path && (
        <div className="flex items-center gap-2">
          <StoredAudio bucket={BUCKET_FEEDBACK} path={path} />
          {canEdit && (
            <button onClick={async () => { await setFeedbackAudio(submission.id, null).catch((e) => toast(toMessage(e), 'error')); onChanged(null) }}
              className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label="Quitar audio"><Trash2 className="h-4 w-4" /></button>
          )}
        </div>
      )}
      {canEdit && (
        <AudioRecorder onDone={async (blob) => {
          const p = await uploadFeedbackFile(submission.id, blob, `voz.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
          await setFeedbackAudio(submission.id, p)
          toast('Nota de voz guardada.')
          onChanged(p)
        }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Anotar sobre una imagen entregada
// ---------------------------------------------------------------------------
export function ImageAnnotator({ file, onSave, onClose }: { file: SubmissionFile; onSave: (blob: Blob) => Promise<void>; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const [color, setColor] = useState('#e11d48')
  const [busy, setBusy] = useState(false)
  const drawing = useRef(false)
  const toast = useToast()

  useEffect(() => {
    let alive = true
    signedUrl(BUCKET_SUBMISSIONS, file.path).then((url) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (!alive || !canvas.current) return
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
        canvas.current.width = Math.round(img.width * scale)
        canvas.current.height = Math.round(img.height * scale)
        canvas.current.getContext('2d')!.drawImage(img, 0, 0, canvas.current.width, canvas.current.height)
        setReady(true)
      }
      img.onerror = () => toast('No se pudo abrir la imagen.', 'error')
      img.src = url
    }).catch(() => toast('No se pudo abrir la imagen.', 'error'))
    return () => { alive = false }
  }, [file.path, toast])

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0b1222]/95 p-3" role="dialog" aria-modal="true" aria-label="Anotar imagen">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-white">
        <PenLine className="h-5 w-5" /><span className="font-bold">Marca correcciones sobre la entrega</span>
        <span className="ml-auto flex gap-1">
          {['#e11d48', '#16a34a', '#2563eb', '#f59e0b'].map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`} className={cn('h-8 w-8 rounded-full border-2', color === c ? 'border-white' : 'border-transparent')} style={{ background: c }} />
          ))}
        </span>
        <Button size="sm" variant="secondary" onClick={onClose}><X className="h-4 w-4" />Cerrar</Button>
        <Button size="sm" loading={busy} disabled={!ready} onClick={() => {
          setBusy(true)
          canvas.current!.toBlob(async (blob) => {
            try {
              if (blob) await onSave(blob)
            } catch (err) {
              toast(toMessage(err), 'error')
            } finally {
              setBusy(false)
            }
          }, 'image/png')
        }}><Save className="h-4 w-4" />Guardar</Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {!ready && <Loading label="Abriendo la imagen…" />}
        <canvas
          ref={canvas}
          className={cn('max-h-full max-w-full touch-none rounded bg-white', !ready && 'hidden')}
          onPointerDown={(e) => {
            drawing.current = true
            const ctx = canvas.current!.getContext('2d')!
            const p = point(e)
            ctx.strokeStyle = color
            ctx.lineWidth = Math.max(3, canvas.current!.width / 250)
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            const ctx = canvas.current!.getContext('2d')!
            const p = point(e)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }}
          onPointerUp={() => { drawing.current = false }}
        />
      </div>
    </div>
  )
}

export function AnnotationTools({ submission, canEdit, onChanged }: { submission: Submission; canEdit: boolean; onChanged: (list: { file_index: number; path: string }[]) => void }) {
  const toast = useToast()
  const [editing, setEditing] = useState<number | null>(null)
  const list = submission.feedback_annotations ?? []
  const images = submission.files.map((f, i) => ({ f, i })).filter(({ f }) => f.type?.startsWith('image/'))
  if (!list.length && (!canEdit || !images.length)) return null
  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-bold">Correcciones sobre la entrega</p>
          <ul className="flex flex-wrap gap-2">
            {list.map((a) => <li key={a.path}><AnnotatedThumb path={a.path} /></li>)}
          </ul>
        </div>
      )}
      {canEdit && images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map(({ f, i }) => (
            <Button key={f.path} size="sm" variant="secondary" onClick={() => setEditing(i)}><PenLine className="h-4 w-4" />Anotar {images.length > 1 ? `imagen ${i + 1}` : 'la imagen'}</Button>
          ))}
        </div>
      )}
      {editing != null && (
        <ImageAnnotator file={submission.files[editing]} onClose={() => setEditing(null)} onSave={async (blob) => {
          const path = await uploadFeedbackFile(submission.id, blob, `correccion-${editing + 1}.png`)
          const next = [...list.filter((a) => a.file_index !== editing), { file_index: editing, path }]
          await setFeedbackAnnotations(submission.id, next)
          toast('Corrección guardada. El alumno la verá con su nota.')
          setEditing(null)
          onChanged(next)
        }} />
      )}
    </div>
  )
}

function AnnotatedThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { signedUrl(BUCKET_FEEDBACK, path).then(setUrl).catch(() => undefined) }, [path])
  if (!url) return <span className="block h-24 w-24 animate-pulse rounded-lg bg-linea" />
  return <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Corrección del docente" className="h-24 w-24 rounded-lg border border-linea object-cover" /></a>
}

// ---------------------------------------------------------------------------
// Comentarios guardados
// ---------------------------------------------------------------------------
export function SnippetsMenu({ current, onInsert }: { current: string; onInsert: (text: string) => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const { data, reload } = useAsync(() => (open ? listSnippets() : Promise.resolve([])), [open], { live: false })
  return (
    <div className="relative inline-block">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}><MessageSquarePlus className="h-4 w-4" />Comentarios guardados</Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-xl border border-linea bg-superficie p-2 shadow-lg">
          {!data ? <Loading rows={2} /> : !data.length ? <p className="p-2 text-sm text-texto-suave">Todavía no guardas comentarios.</p> : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {data.map((s) => (
                <li key={s.id} className="flex items-start gap-1">
                  <button type="button" onClick={() => { onInsert(s.body); setOpen(false) }} className="flex-1 rounded-lg p-2 text-left text-sm hover:bg-papel">{s.body}</button>
                  <button type="button" onClick={async () => { await deleteSnippet(s.id).catch(() => undefined); void reload(true) }} className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label="Borrar"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          {current.trim() && (
            <Button type="button" size="sm" variant="secondary" className="mt-2 w-full" onClick={async () => {
              try { await saveSnippet(current); toast('Comentario guardado.'); void reload(true) } catch (err) { toast(toMessage(err), 'error') }
            }}>Guardar el comentario actual</Button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Versiones anteriores de una entrega
// ---------------------------------------------------------------------------
export function VersionsButton({ submissionId }: { submissionId: number }) {
  const [open, setOpen] = useState(false)
  const { data } = useAsync(() => listVersions(submissionId), [submissionId], { live: false })
  if (!data?.length) return null
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><History className="h-4 w-4" />Versiones anteriores ({data.length})</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Versiones anteriores" wide>
        <ol className="space-y-3">
          {data.map((v, i) => (
            <li key={v.id} className="rounded-xl border border-linea p-4">
              <p className="text-sm font-bold">Versión {data.length - i} · entregada el {formatShort(v.submitted_at)} a las {formatTime(v.submitted_at)}</p>
              {(v.score != null || v.level) && <p className="text-sm text-texto-suave">Nota en ese momento: {v.score ?? v.level}</p>}
              {v.feedback && <p className="mt-1 text-sm italic text-texto-suave">Comentario: “{v.feedback}”</p>}
              {v.content && <p className="mt-2 whitespace-pre-line rounded-lg bg-papel p-3 text-sm">{v.content}</p>}
              {v.files.length > 0 && <p className="mt-2 text-sm text-texto-suave">{v.files.length} archivo{v.files.length === 1 ? '' : 's'}: {v.files.map((f) => f.name).join(', ')}</p>}
            </li>
          ))}
        </ol>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Grupos de la tarea
// ---------------------------------------------------------------------------
export function GroupsButton({ assignment, students, onChanged }: { assignment: AssignmentWithCourse; students: { id: number; first_name: string | null; last_name: string | null }[]; onChanged: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const { data, reload } = useAsync(() => listGroups(assignment.id), [assignment.id], { live: false })
  const [assign, setAssign] = useState<Record<number, number>>({})
  const [count, setCount] = useState(0)
  const [size, setSize] = useState(4)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !data) return
    const map: Record<number, number> = {}
    data.forEach((g, gi) => g.students.forEach((s) => { map[s] = gi + 1 }))
    setAssign(map)
    setCount(Math.max(data.length, 1))
  }, [open, data])

  function auto() {
    const shuffled = [...students].sort(() => Math.random() - 0.5)
    const n = Math.max(1, Math.ceil(shuffled.length / Math.max(2, size)))
    setCount(n)
    setAssign(Object.fromEntries(shuffled.map((s, i) => [s.id, (i % n) + 1])))
  }

  async function save() {
    setBusy(true)
    try {
      const groups = Array.from({ length: count }, (_, i) => ({ name: `Grupo ${i + 1}`, students: students.filter((s) => assign[s.id] === i + 1).map((s) => s.id) }))
      await saveGroups(assignment.id, groups)
      toast('Grupos guardados. Una entrega cuenta para todo el grupo.')
      setOpen(false)
      void reload(true)
      onChanged()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" />{data?.length ? `${data.length} grupos` : 'Hacer en grupos'}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Grupos de la tarea" wide>
        <p className="mb-3 text-sm text-texto-suave">Cada grupo entrega una sola vez y todos reciben la misma nota. Sin grupos, la tarea es individual.</p>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <Field label="Integrantes por grupo"><Input type="number" min={2} max={10} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24" /></Field>
          <Button variant="secondary" onClick={auto}><Wand2 className="h-4 w-4" />Armar al azar</Button>
          <Button variant="ghost" onClick={() => setCount((c) => c + 1)}>+ Grupo</Button>
          <Button variant="ghost" onClick={() => { setAssign({}); setCount(0) }}>Sin grupos</Button>
        </div>
        <ul className="grid max-h-[50vh] gap-1.5 overflow-y-auto sm:grid-cols-2">
          {students.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border border-linea px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">{studentName(s)}</span>
              <Select value={assign[s.id] ?? ''} onChange={(e) => setAssign((a) => ({ ...a, [s.id]: Number(e.target.value) }))} className="w-32 py-1.5" aria-label={`Grupo de ${studentName(s)}`}>
                <option value="">Sin grupo</option>
                {Array.from({ length: count }, (_, i) => <option key={i} value={i + 1}>Grupo {i + 1}</option>)}
              </Select>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => void save()} loading={busy}><Save className="h-4 w-4" />Guardar grupos</Button>
        </div>
      </Modal>
    </>
  )
}

export function GroupBadge({ assignmentId, studentId }: { assignmentId: number; studentId: number }) {
  const { data } = useAsync(() => listGroups(assignmentId), [assignmentId], { live: false })
  const g = data?.find((x) => x.students.includes(studentId))
  if (!g) return null
  return <Badge tone="info"><Users className="h-3 w-3" />{g.name} · {g.students.length} integrantes</Badge>
}

// ---------------------------------------------------------------------------
// Duplicar la tarea a otras secciones
// ---------------------------------------------------------------------------
export function DuplicateButton({ assignment, teacherId }: { assignment: AssignmentWithCourse; teacherId: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [draft, setDraft] = useState(true)
  const [busy, setBusy] = useState(false)
  const { data } = useAsync(() => (open ? listTeacherOfferings(teacherId) : Promise.resolve([])), [open, teacherId], { live: false })
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Copy className="h-4 w-4" />Duplicar</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Duplicar a otros cursos">
        {!data ? <Loading /> : (
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {data.filter((o) => o.id !== assignment.offering_id).map((o) => (
              <li key={o.id}>
                <label className="flex items-center gap-3 rounded-lg border border-linea px-3 py-2">
                  <input type="checkbox" checked={picked.includes(o.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, o.id] : p.filter((x) => x !== o.id)))} className="h-5 w-5 accent-[#0B1D33]" />
                  <span><b>{o.subject.name}</b> <span className="text-texto-suave">{classroomLabel(o.classroom)}</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <label className="mt-3 flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} className="h-4 w-4 accent-[#0B1D33]" />Copiar como borrador (sin fecha) para revisarla antes de publicar
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!picked.length} loading={busy} onClick={async () => {
            setBusy(true)
            try {
              const n = await duplicateAssignment(assignment.id, picked, draft)
              toast(`Copiada a ${n} curso${n === 1 ? '' : 's'}.`)
              setOpen(false)
              setPicked([])
            } catch (err) {
              toast(toMessage(err), 'error')
            } finally {
              setBusy(false)
            }
          }}><Copy className="h-4 w-4" />Duplicar</Button>
        </div>
      </Modal>
    </>
  )
}

