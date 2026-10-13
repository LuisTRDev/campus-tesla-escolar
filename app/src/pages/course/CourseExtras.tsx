import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown, ArrowUp, Bot, CheckCircle2, ClipboardList, Copy, ExternalLink, FileText, GripVertical, HelpCircle, Image as ImageIcon, Link2, Lock, MessageSquare,
  Pencil, Pin, PlayCircle, Plus, Search, Send, Sparkles, Star, Trash2, Unlock, X,
} from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, Panel, Select, Textarea } from '@/components/ui'
import { StoredThumb, usePreview } from '@/components/files'
import { ArtLayer } from '@/components/tesla'
import { SCENES } from '@/components/scenes'
import { useAsync } from '@/lib/useAsync'
import { useToast, useUndoableDelete } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { BUCKET_MATERIALS } from '@/lib/supabase'
import { formatBytes, formatShort, formatTime, relativeDue } from '@/lib/format'
import { cn } from '@/lib/utils'
import { haptic, useKey } from '@/lib/ux'
import {
  answerCheckpoint, createPost, createThread, deleteCheckpoint, deletePost, deleteThread, deleteUnit, duplicateOfferingContent, listCheckpoints,
  listMaterialViews, listPosts, listThreads, listUnits, markMaterialViewed, moderateForum, reorderUnits, saveCheckpoint, saveUnit,
  setAssignmentUnit, setMaterialUnit, setOfferingCover,
  type Checkpoint, type CourseUnit, type ForumThread,
} from '@/services/aprendizaje'
import {
  classroomLabel, deleteMaterial, listAssignments, listCourseAnnouncements, listMaterials, listStudentSubmissions, listTeacherOfferings, taskState, youtubeId,
} from '@/services/campus'
import { askTutor, getTutorSettings, listTutorMessages, saveTutorSettings, type TutorMessage } from '@/services/comunicacion'
import type { Assignment, Material, Offering } from '@/types'
import { NewAssignmentForm } from '@/pages/course/NewAssignmentForm'
import { NewMaterialForm } from '@/pages/course/NewMaterialForm'

// ---------------------------------------------------------------------------
// Video de YouTube con preguntas intercaladas (sin cargar scripts externos:
// se usa la API de mensajes del reproductor)
// ---------------------------------------------------------------------------
function InteractiveVideo({ material, canManage }: { material: Material; canManage: boolean }) {
  const toast = useToast()
  const ytId = youtubeId(material.url)!
  const frame = useRef<HTMLIFrameElement>(null)
  const { data: checkpoints, reload } = useAsync(() => listCheckpoints(material.id), [material.id], { live: false })
  const [time, setTime] = useState(0)
  const [asking, setAsking] = useState<Checkpoint | null>(null)
  const [result, setResult] = useState<{ correct: boolean | null; answer_index: number | null; picked: number } | null>(null)
  const done = useRef(new Set<number>())
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ at: '', question: '', options: ['', '', ''], answer: 0 })

  const post = (msg: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), '*')

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        const t = data?.info?.currentTime
        if (typeof t === 'number') setTime(t)
      } catch { /* mensajes ajenos */ }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Al llegar a una pregunta: pausa y la muestra.
  useEffect(() => {
    if (asking || canManage || !checkpoints?.length) return
    const next = checkpoints.find((c) => !done.current.has(c.id) && time >= c.at_seconds && time < c.at_seconds + 3)
    if (next) {
      post({ event: 'command', func: 'pauseVideo', args: '' })
      setAsking(next)
      setResult(null)
    }
  }, [time, checkpoints, asking, canManage])

  async function answer(i: number) {
    if (!asking) return
    const r = await answerCheckpoint(asking.id, i).catch(() => ({ correct: null, answer_index: null }))
    haptic(r.correct === false ? 'error' : 'success')
    setResult({ ...r, picked: i })
  }

  function resume() {
    if (asking) done.current.add(asking.id)
    setAsking(null)
    post({ event: 'command', func: 'playVideo', args: '' })
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  return (
    <div className="mt-3 max-w-xl">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-tinta">
        <iframe
          ref={frame}
          src={`https://www.youtube-nocookie.com/embed/${ytId}?enablejsapi=1&origin=${encodeURIComponent(location.origin)}`}
          title={material.title}
          className="h-full w-full"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => post({ event: 'listening', id: material.id, channel: 'widget' })}
        />
        {asking && (
          <div className="absolute inset-0 flex items-center justify-center bg-tinta/90 p-4">
            <div className="w-full max-w-md rounded-xl bg-superficie p-4 text-texto">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-texto-suave"><HelpCircle className="h-4 w-4" />Pregunta del video</p>
              <p className="mb-3 font-bold">{asking.question}</p>
              <div className="space-y-1.5">
                {asking.options.map((o, i) => (
                  <button key={i} disabled={!!result} onClick={() => void answer(i)}
                    className={cn('w-full rounded-lg border px-3 py-2 text-left text-sm',
                      result && i === result.answer_index ? 'border-estado-ok bg-estado-ok/10 font-bold' : result && i === result.picked ? 'border-estado-alerta bg-estado-alerta/10' : 'border-linea hover:border-tinta-500')}>
                    {o}
                  </button>
                ))}
              </div>
              {result && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{result.correct == null ? '¡Gracias!' : result.correct ? '¡Correcto! 🎉' : 'Casi. Mira la respuesta marcada.'}</p>
                  <Button size="sm" onClick={resume}><PlayCircle className="h-4 w-4" />Seguir viendo</Button>
                </div>
              )}
              {!result && <button onClick={resume} className="mt-2 text-xs text-texto-suave underline">Omitir</button>}
            </div>
          </div>
        )}
      </div>
      {!!checkpoints?.length && (
        <p className="mt-1 text-xs text-texto-suave">{checkpoints.length} pregunta{checkpoints.length === 1 ? '' : 's'} en el video{canManage ? `: ${checkpoints.map((c) => fmt(c.at_seconds)).join(', ')}` : ''}</p>
      )}
      {canManage && (
        <div className="mt-2">
          {checkpoints?.map((c) => (
            <span key={c.id} className="mr-2 inline-flex items-center gap-1 rounded-full bg-papel px-2 py-0.5 text-xs">
              {fmt(c.at_seconds)} {c.question.slice(0, 30)}
              <button onClick={async () => { await deleteCheckpoint(c.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) }} aria-label="Quitar pregunta"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {!adding ? (
            <Button size="sm" variant="ghost" onClick={() => { setAdding(true); setForm((f) => ({ ...f, at: fmt(time) })) }}><Plus className="h-4 w-4" />Pregunta en el minuto {fmt(time)}</Button>
          ) : (
            <form className="mt-2 space-y-2 rounded-xl border border-linea p-3" onSubmit={async (e) => {
              e.preventDefault()
              const [m, s] = form.at.split(':').map(Number)
              try {
                await saveCheckpoint({ materialId: material.id, atSeconds: (m || 0) * 60 + (s || 0), question: form.question, options: form.options, answerIndex: form.answer })
                toast('Pregunta agregada al video.')
                setAdding(false)
                setForm({ at: '', question: '', options: ['', '', ''], answer: 0 })
                void reload(true)
              } catch (err) {
                toast(toMessage(err), 'error')
              }
            }}>
              <div className="grid grid-cols-[6rem_1fr] gap-2">
                <Field label="Minuto"><Input value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} placeholder="1:30" required /></Field>
                <Field label="Pregunta"><Input value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} maxLength={500} required /></Field>
              </div>
              {form.options.map((o, i) => (
                <label key={i} className="flex items-center gap-2">
                  <input type="radio" checked={form.answer === i} onChange={() => setForm({ ...form, answer: i })} className="h-4 w-4 accent-[#1e8e5a]" aria-label="Correcta" />
                  <Input value={o} onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Opción ${i + 1}`} maxLength={200} />
                </label>
              ))}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
                <Button type="submit" size="sm">Guardar</Button>
              </div>
              <p className="text-xs text-texto-suave">Tip: reproduce el video hasta el momento exacto y luego toca «Pregunta en el minuto…».</p>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Material (con avance para el alumno)
// ---------------------------------------------------------------------------
export function MaterialItem({ material, canManage, viewed, units, onDelete, onChanged }: {
  material: Material; canManage: boolean; viewed?: boolean; units?: CourseUnit[]; onDelete: () => void; onChanged?: () => void
}) {
  const toast = useToast()
  const { profile } = useAuth()
  const [showVideo, setShowVideo] = useState(false)
  const preview = usePreview()
  const ytId = material.kind === 'VIDEO' ? youtubeId(material.url) : null
  const Icon = material.kind === 'FILE' ? FileText : material.kind === 'VIDEO' ? PlayCircle : Link2

  function open() {
    try {
      if (profile?.role === 'STUDENT') void markMaterialViewed(material.id)
      if (material.kind === 'FILE' && material.storage_path) preview({ bucket: BUCKET_MATERIALS, path: material.storage_path, name: material.file_name ?? material.title, type: material.mime_type, size: material.file_size })
      else if (ytId) setShowVideo((v) => !v)
      else if (material.url) window.open(material.url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {material.kind === 'FILE' && material.storage_path ? (
          <button type="button" onClick={open} className="shrink-0" aria-label={`Ver ${material.title}`}>
            <StoredThumb file={{ bucket: BUCKET_MATERIALS, path: material.storage_path, name: material.file_name ?? material.title, type: material.mime_type }} className="h-12 w-12 rounded-lg" />
          </button>
        ) : (
          <span className="mt-0.5 rounded-lg bg-papel p-2 text-tinta-500"><Icon className="h-5 w-5" /></span>
        )}
        <div className="min-w-0 flex-1">
          <button onClick={open} className="text-left font-bold text-texto hover:underline">
            {material.title}
            {material.kind === 'LINK' && <ExternalLink className="ml-1 inline h-3.5 w-3.5" />}
          </button>
          {viewed && <CheckCircle2 className="ml-1.5 inline h-4 w-4 text-estado-ok" aria-label="Visto" />}
          {!material.published && <Badge tone="info" className="ml-2">{material.publish_at ? `Se publica el ${formatShort(material.publish_at)} ${formatTime(material.publish_at)}` : 'Oculto'}</Badge>}
          {material.description && <p className="mt-0.5 whitespace-pre-line text-sm text-texto-suave">{material.description}</p>}
          <p className="mt-1 text-xs text-texto-suave">
            {material.kind === 'FILE' ? `${material.file_name ?? 'Archivo'} ${formatBytes(material.file_size)}` : material.kind === 'VIDEO' ? 'Video' : 'Enlace'}
            {', '}publicado el {formatShort(material.created_at)}
          </p>
          {showVideo && ytId && <InteractiveVideo material={material} canManage={canManage} />}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            {units && units.length > 0 && (
              <Select value={material.unit_id ?? ''} className="w-36 py-1.5 text-xs" aria-label="Unidad"
                onChange={async (e) => {
                  try { await setMaterialUnit(material.id, e.target.value ? Number(e.target.value) : null); onChanged?.() } catch (err) { toast(toMessage(err), 'error') }
                }}>
                <option value="">Sin unidad</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
              </Select>
            )}
            <button onClick={onDelete} className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label={`Eliminar ${material.title}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Unidades: materiales y tareas en secuencia, con avance por unidad
// ---------------------------------------------------------------------------
export function UnitsTab({ offering, canManage }: { offering: Offering; canManage: boolean }) {
  const toast = useToast()
  const undoDelete = useUndoableDelete()
  const student = useFocusStudent()
  const { profile } = useAuth()
  const isFamily = profile?.role === 'STUDENT' || profile?.role === 'GUARDIAN'
  const { data, loading, error, reload, mutate } = useAsync(async () => {
    const [units, materials, assignments] = await Promise.all([listUnits(offering.id), listMaterials(offering.id), listAssignments(offering.id)])
    const viewed = isFamily && student ? await listMaterialViews(materials.map((m) => m.id), student.id) : new Set<number>()
    const subs = isFamily && student ? await listStudentSubmissions(student.id, assignments.map((a) => a.id)) : []
    return { units, materials, assignments, viewed, subs }
  }, [offering.id, student?.id, isFamily])
  const [adding, setAdding] = useState<{ kind: 'material' | 'task'; unitId: number | null } | null>(null)
  const [unitForm, setUnitForm] = useState<{ id?: number; title: string; description: string } | null>(null)
  const [dragId, setDragId] = useState<number | null>(null)
  useKey('n', () => canManage && setAdding({ kind: 'material', unitId: null }), canManage)

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />

  const groups: { unit: CourseUnit | null; label: string; materials: Material[]; tasks: Assignment[] }[] = [
    ...data.units.map((u) => ({
      unit: u, label: u.title,
      materials: data.materials.filter((m) => m.unit_id === u.id),
      tasks: data.assignments.filter((a) => a.unit_id === u.id),
    })),
  ]
  // Materiales antiguos sin unidad: se agrupan por su texto de unidad.
  const loose = data.materials.filter((m) => !m.unit_id || !data.units.some((u) => u.id === m.unit_id))
  const legacy = new Map<string, Material[]>()
  for (const m of loose) legacy.set(m.unit?.trim() || 'General', [...(legacy.get(m.unit?.trim() || 'General') ?? []), m])
  for (const [label, materials] of legacy) groups.push({ unit: null, label, materials, tasks: [] })
  const looseTasks = data.assignments.filter((a) => !a.unit_id || !data.units.some((u) => u.id === a.unit_id))

  function progressOf(g: (typeof groups)[number]) {
    if (!isFamily) return null
    const total = g.materials.length + g.tasks.length
    if (!total) return null
    const done = g.materials.filter((m) => data!.viewed.has(m.id)).length
      + g.tasks.filter((t) => data!.subs.some((s) => s.assignment_id === t.id)).length
    return { done, total }
  }

  async function moveUnit(from: number, to: number) {
    const list = [...data!.units]
    const [it] = list.splice(from, 1)
    list.splice(to, 0, it)
    mutate((cur) => cur && { ...cur, units: list })
    await reorderUnits(list.map((u) => u.id)).catch((e) => toast(toMessage(e), 'error'))
  }

  function removeMaterial(m: Material) {
    undoDelete({
      label: `«${m.title}» eliminado.`,
      hide: () => mutate((cur) => cur && { ...cur, materials: cur.materials.filter((x) => x.id !== m.id) }),
      commit: () => deleteMaterial(m),
      onError: (err) => toast(toMessage(err), 'error'),
    })
  }

  return (
    <>
      {canManage && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={() => setAdding({ kind: 'material', unitId: null })}><Plus className="h-4 w-4" />Agregar material</Button>
          <Button variant="secondary" onClick={() => setUnitForm({ title: '', description: '' })}><Plus className="h-4 w-4" />Nueva unidad</Button>
        </div>
      )}
      {!groups.length && !looseTasks.length ? (
        <Empty title="Sin materiales todavía" art="notebook">{canManage ? 'Crea unidades y sube guías, enlaces o videos para tus alumnos.' : 'Aquí aparecerán las guías y recursos del curso.'}</Empty>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const p = progressOf(g)
            const unitIdx = g.unit ? data.units.findIndex((u) => u.id === g.unit!.id) : -1
            return (
              <Panel
                key={g.unit ? `u${g.unit.id}` : `l${g.label}`}
                className={cn(dragId != null && g.unit && 'transition-shadow', dragId === g.unit?.id && 'opacity-60')}
                title={
                  <span
                    className="flex items-center gap-2"
                    draggable={canManage && !!g.unit}
                    onDragStart={() => g.unit && setDragId(g.unit.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(e) => { if (dragId != null && g.unit) e.preventDefault() }}
                    onDrop={() => {
                      if (dragId == null || !g.unit) return
                      const from = data.units.findIndex((u) => u.id === dragId)
                      if (from >= 0 && from !== unitIdx) void moveUnit(from, unitIdx)
                      setDragId(null)
                    }}
                  >
                    {canManage && g.unit && <GripVertical className="h-4 w-4 cursor-grab text-texto-suave" aria-hidden />}
                    {g.label}
                  </span>
                }
                action={
                  <span className="flex items-center gap-2">
                    {p && (
                      <span className="flex items-center gap-2 text-sm text-texto-suave">
                        <span className="h-2 w-20 overflow-hidden rounded-full bg-[var(--meter-track)]"><span className="xp-fill block h-full rounded-full" style={{ width: `${(p.done / p.total) * 100}%` }} /></span>
                        {p.done}/{p.total}
                      </span>
                    )}
                    {canManage && g.unit && (
                      <>
                        <button onClick={() => void moveUnit(unitIdx, unitIdx - 1)} disabled={unitIdx === 0} className="rounded p-1 text-texto-suave disabled:opacity-30" aria-label="Subir unidad"><ArrowUp className="h-4 w-4" /></button>
                        <button onClick={() => void moveUnit(unitIdx, unitIdx + 1)} disabled={unitIdx === data.units.length - 1} className="rounded p-1 text-texto-suave disabled:opacity-30" aria-label="Bajar unidad"><ArrowDown className="h-4 w-4" /></button>
                        <button onClick={() => setUnitForm({ id: g.unit!.id, title: g.unit!.title, description: g.unit!.description ?? '' })} className="rounded p-1 text-texto-suave" aria-label="Editar unidad"><Pencil className="h-4 w-4" /></button>
                        <button onClick={async () => {
                          if (!confirm(`¿Eliminar la unidad «${g.unit!.title}»? Los materiales y tareas no se borran.`)) return
                          await deleteUnit(g.unit!.id).catch((e) => toast(toMessage(e), 'error'))
                          void reload(true)
                        }} className="rounded p-1 text-texto-suave hover:text-estado-alerta" aria-label="Eliminar unidad"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </span>
                }
              >
                {g.unit?.description && <p className="mb-3 text-sm text-texto-suave">{g.unit.description}</p>}
                {g.materials.length + g.tasks.length === 0 && <p className="text-sm text-texto-suave">Unidad vacía.</p>}
                <ul className="divide-y divide-linea">
                  {g.materials.map((m) => (
                    <MaterialItem key={m.id} material={m} canManage={canManage} viewed={data.viewed.has(m.id)} units={data.units}
                      onDelete={() => removeMaterial(m)} onChanged={() => void reload(true)} />
                  ))}
                  {g.tasks.map((a) => <UnitTaskRow key={a.id} assignment={a} offering={offering} done={data.subs.some((s) => s.assignment_id === a.id)} state={isFamily ? taskState(a, data.subs.find((s) => s.assignment_id === a.id)) : null} />)}
                </ul>
                {canManage && g.unit && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-linea pt-3">
                    <Button size="sm" variant="ghost" onClick={() => setAdding({ kind: 'material', unitId: g.unit!.id })}><Plus className="h-4 w-4" />Material</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding({ kind: 'task', unitId: g.unit!.id })}><Plus className="h-4 w-4" />Tarea o evaluación</Button>
                  </div>
                )}
              </Panel>
            )
          })}
          {canManage && data.units.length > 0 && looseTasks.length > 0 && (
            <Panel title="Tareas sin unidad">
              <ul className="divide-y divide-linea">
                {looseTasks.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <Link to={`/tarea/${a.id}`} className="min-w-0 flex-1 truncate font-bold hover:underline">{a.title}</Link>
                    <Select value="" className="w-40 py-1.5 text-xs" aria-label="Mover a unidad"
                      onChange={async (e) => { if (!e.target.value) return; await setAssignmentUnit(a.id, Number(e.target.value)).catch((err) => toast(toMessage(err), 'error')); void reload(true) }}>
                      <option value="">Mover a unidad…</option>
                      {data.units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
                    </Select>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}

      <Modal open={adding?.kind === 'material'} onClose={() => setAdding(null)} title="Agregar material">
        <NewMaterialForm offeringId={offering.id} defaultUnitId={adding?.unitId ?? null} onDone={() => { setAdding(null); void reload(true) }} />
      </Modal>
      <Modal open={adding?.kind === 'task'} onClose={() => setAdding(null)} title="Nueva tarea" wide>
        <NewAssignmentForm offeringId={offering.id} subjectId={offering.subject_id} defaultUnitId={adding?.unitId ?? null} onDone={() => { setAdding(null); void reload(true) }} />
      </Modal>
      <Modal open={!!unitForm} onClose={() => setUnitForm(null)} title={unitForm?.id ? 'Editar unidad' : 'Nueva unidad'}>
        {unitForm && (
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await saveUnit({ id: unitForm.id, offeringId: offering.id, title: unitForm.title, description: unitForm.description, position: unitForm.id ? undefined : data.units.length + 1 })
              toast('Unidad guardada.')
              setUnitForm(null)
              void reload(true)
            } catch (err) {
              toast(toMessage(err), 'error')
            }
          }}>
            <Field label="Nombre"><Input value={unitForm.title} onChange={(e) => setUnitForm({ ...unitForm, title: e.target.value })} maxLength={120} required placeholder="Unidad 1: Fracciones" /></Field>
            <Field label="Descripción (opcional)"><Textarea value={unitForm.description} onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })} maxLength={1000} className="min-h-20" /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setUnitForm(null)}>Cancelar</Button><Button type="submit">Guardar</Button></div>
          </form>
        )}
      </Modal>
    </>
  )
}

function UnitTaskRow({ assignment, done, state }: { assignment: Assignment; offering: Offering; done: boolean; state: ReturnType<typeof taskState> | null }) {
  const due = relativeDue(assignment.due_at)
  return (
    <li className="py-3">
      <Link to={`/tarea/${assignment.id}`} className="flex items-center gap-3 hover:underline">
        <span className="rounded-lg bg-papel p-2 text-tinta-500">{assignment.kind === 'QUIZ' ? <Sparkles className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{assignment.title}</span>
          <span className="block text-xs text-texto-suave">{assignment.kind === 'QUIZ' ? 'Evaluación en línea · ' : ''}{due.label}</span>
        </span>
        {state && (done ? <CheckCircle2 className="h-5 w-5 text-estado-ok" aria-label="Entregada" /> : <Badge tone={due.tone === 'overdue' ? 'alert' : 'neutral'}>Pendiente</Badge>)}
        {assignment.status === 'DRAFT' && <Badge>{assignment.publish_at ? 'Programada' : 'Borrador'}</Badge>}
      </Link>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Foro
// ---------------------------------------------------------------------------
function roleTag(role: string | null) {
  return role === 'TEACHER' || role === 'ADMIN' || role === 'MANAGEMENT' ? <Badge tone="info">Docente</Badge> : null
}

export function ForumTab({ offering, canManage }: { offering: Offering; canManage: boolean }) {
  const toast = useToast()
  const { profile } = useAuth()
  const canPost = canManage || profile?.role === 'STUDENT'
  const { data, loading, error, reload } = useAsync(() => listThreads(offering.id), [offering.id])
  const [open, setOpen] = useState<ForumThread | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await createThread(offering.id, title, body)
      toast('Tema publicado.')
      setCreating(false); setTitle(''); setBody('')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (open) return <ThreadView thread={open} canManage={canManage} canPost={canPost} onBack={() => { setOpen(null); void reload(true) }} />

  return (
    <>
      {canPost && <div className="mb-4"><Button onClick={() => setCreating(true)}><MessageSquare className="h-4 w-4" />Nueva pregunta o tema</Button></div>}
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? (
        <Empty title="El foro está vacío" art="chat">{canPost ? 'Haz la primera pregunta: tus compañeros y tu docente pueden responder.' : 'Aquí los alumnos conversan sobre el curso.'}</Empty>
      ) : (
        <Panel bodyClassName="p-2">
          <ul>
            {data.map((t) => (
              <li key={t.id}>
                <button onClick={() => setOpen(t)} className={cn('flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-papel', t.hidden && 'opacity-50')}>
                  <span className="mt-0.5 rounded-lg bg-papel p-2 text-tinta-500"><MessageSquare className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 font-bold">
                      {t.pinned && <Pin className="h-3.5 w-3.5 text-chispa-600" />}{t.locked && <Lock className="h-3.5 w-3.5 text-texto-suave" />}
                      {t.title}
                      {t.has_best && <Badge tone="ok"><Star className="h-3 w-3" />Resuelta</Badge>}
                    </span>
                    <span className="block truncate text-sm text-texto-suave">{t.body}</span>
                    <span className="mt-0.5 block text-xs text-texto-suave">{t.author_name ?? 'Alumno'} · {t.posts_count} respuesta{t.posts_count === 1 ? '' : 's'} · {formatShort(t.last_post_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva pregunta o tema">
        <form onSubmit={create} className="space-y-4">
          <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="¿Cómo se resuelve el ejercicio 4?" /></Field>
          <Field label="Detalle"><Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} required className="min-h-28" /></Field>
          <p className="text-xs text-texto-suave">Recuerda: escribe con respeto. Tu docente modera el foro.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button><Button type="submit" loading={busy}>Publicar</Button></div>
        </form>
      </Modal>
    </>
  )
}

function ThreadView({ thread, canManage, canPost, onBack }: { thread: ForumThread; canManage: boolean; canPost: boolean; onBack: () => void }) {
  const toast = useToast()
  const { profile } = useAuth()
  const [t, setT] = useState(thread)
  const { data, loading, reload } = useAsync(() => listPosts(thread.id), [thread.id])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const isAuthor = t.author_id === profile?.id

  async function act(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast(ok); void reload(true) } catch (err) { toast(toMessage(err), 'error') }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-bold text-texto-suave hover:text-texto">← Volver al foro</button>
      <Panel
        title={<span className="flex items-center gap-2">{t.pinned && <Pin className="h-4 w-4 text-chispa-600" />}{t.title}</span>}
        action={canManage && (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => act(() => moderateForum('PIN', t.id, !t.pinned).then(() => setT({ ...t, pinned: !t.pinned })), t.pinned ? 'Tema desfijado.' : 'Tema fijado.')}><Pin className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => act(() => moderateForum('LOCK', t.id, !t.locked).then(() => setT({ ...t, locked: !t.locked })), t.locked ? 'Tema abierto.' : 'Tema cerrado.')}>{t.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (!confirm('¿Eliminar el tema?')) return; await deleteThread(t.id).catch((e) => toast(toMessage(e), 'error')); onBack() }}><Trash2 className="h-4 w-4" /></Button>
          </span>
        )}
      >
        <p className="whitespace-pre-line">{t.body}</p>
        <p className="mt-2 flex items-center gap-2 text-xs text-texto-suave">{t.author_name ?? 'Alumno'} {roleTag(t.author_role)} · {formatShort(t.created_at)} {formatTime(t.created_at)}</p>
      </Panel>
      {loading ? <Loading /> : (
        <ul className="space-y-3">
          {(data ?? []).map((p) => (
            <li key={p.id} className={cn('rounded-xl border p-4', p.is_best ? 'border-estado-ok bg-estado-ok/5' : 'border-linea bg-superficie', p.hidden && 'opacity-60')}>
              {p.is_best && <p className="mb-1 flex items-center gap-1 text-xs font-bold text-estado-ok"><Star className="h-3.5 w-3.5" />Mejor respuesta</p>}
              <p className="whitespace-pre-line">{p.body ?? <i className="text-texto-suave">Respuesta ocultada por el docente.</i>}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-texto-suave">
                <span>{p.author_name ?? 'Alumno'}</span>{roleTag(p.author_role)}<span>· {formatShort(p.created_at)} {formatTime(p.created_at)}</span>
                <span className="ml-auto flex gap-2">
                  {(canManage || isAuthor) && !p.hidden && (
                    <button className="font-bold hover:text-estado-ok" onClick={() => act(() => moderateForum('BEST', p.id, !p.is_best), p.is_best ? 'Desmarcada.' : '¡Marcada como mejor respuesta!')}>
                      {p.is_best ? 'Quitar «mejor»' : 'Mejor respuesta'}
                    </button>
                  )}
                  {canManage && <button className="font-bold hover:text-texto" onClick={() => act(() => moderateForum('HIDE_POST', p.id, !p.hidden), p.hidden ? 'Respuesta visible.' : 'Respuesta ocultada.')}>{p.hidden ? 'Mostrar' : 'Ocultar'}</button>}
                  {(canManage || p.author_id === profile?.id) && <button className="font-bold hover:text-estado-alerta" onClick={() => act(() => deletePost(p.id), 'Respuesta eliminada.')}>Eliminar</button>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canPost && !t.locked ? (
        <form className="flex items-end gap-2" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try { await createPost(t.id, body); setBody(''); void reload(true) } catch (err) { toast(toMessage(err), 'error') } finally { setBusy(false) }
        }}>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="Escribe una respuesta…" className="min-h-14 flex-1" />
          <Button type="submit" loading={busy} disabled={!body.trim()} aria-label="Responder"><Send className="h-4 w-4" /></Button>
        </form>
      ) : t.locked && <p className="text-sm text-texto-suave"><Lock className="mr-1 inline h-4 w-4" />El docente cerró este tema.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tutor IA
// ---------------------------------------------------------------------------
export function useTutorEnabled(offeringId: number) {
  return useAsync(() => getTutorSettings(offeringId).catch(() => null), [offeringId], { live: false })
}

export function TutorTab({ offering, canManage }: { offering: Offering; canManage: boolean }) {
  const toast = useToast()
  const student = useFocusStudent()
  const { profile } = useAuth()
  const settings = useTutorEnabled(offering.id)
  const [form, setForm] = useState<{ enabled: boolean; instructions: string; daily_limit: number } | null>(null)
  useEffect(() => {
    if (settings.data !== undefined && !form) setForm({ enabled: settings.data?.enabled ?? false, instructions: settings.data?.instructions ?? '', daily_limit: settings.data?.daily_limit ?? 25 })
  }, [settings.data, form])

  if (canManage) {
    if (!form) return <Loading />
    return (
      <Panel title="Tutor IA del curso">
        <p className="mb-4 text-sm text-texto-suave">
          Un asistente que ayuda a tus alumnos a entender el curso <b>sin darles las respuestas</b>: explica, da pistas y hace preguntas. Puedes ver lo que le preguntan.
        </p>
        <label className="mb-4 flex items-center gap-2 font-bold">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-5 w-5 accent-[#0B1D33]" />Activar el tutor para este curso
        </label>
        <Field label="Indicaciones para el tutor" hint="Temas de la unidad, nivel de los alumnos, qué no debe resolver, etc.">
          <Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} maxLength={2000} className="min-h-28"
            placeholder="Estamos en la unidad de fracciones. No resuelvas la práctica calificada del viernes; guía con preguntas." />
        </Field>
        <Field label="Preguntas por alumno al día" className="mt-3 max-w-xs">
          <Input type="number" min={1} max={200} value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: Number(e.target.value) })} />
        </Field>
        <div className="mt-4 flex justify-end">
          <Button onClick={async () => {
            try { await saveTutorSettings({ offering_id: offering.id, ...form }); toast('Tutor guardado.'); void settings.reload(true) } catch (err) { toast(toMessage(err), 'error') }
          }}><Bot className="h-4 w-4" />Guardar</Button>
        </div>
      </Panel>
    )
  }
  if (settings.loading) return <Loading />
  if (!settings.data?.enabled) return <Empty title="El tutor IA no está activo" art="chat">Tu docente puede activarlo para este curso.</Empty>
  if (profile?.role !== 'STUDENT' || !student) return <Empty title="Solo para alumnos" art="chat">El alumno conversa con el tutor desde su cuenta.</Empty>
  return <TutorChat offeringId={offering.id} studentId={student.id} />
}

function TutorChat({ offeringId, studentId }: { offeringId: number; studentId: number }) {
  const toast = useToast()
  const { data, mutate } = useAsync(() => listTutorMessages(offeringId, studentId), [offeringId, studentId], { live: false })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useState<number | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [data, busy])

  async function send(e: FormEvent) {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    setBusy(true)
    setText('')
    const now = new Date().toISOString()
    mutate((cur) => [...(cur ?? []), { id: -Date.now(), role: 'user', content: q, created_at: now } as TutorMessage])
    try {
      const r = await askTutor(offeringId, q)
      setLeft(r.left)
      mutate((cur) => [...(cur ?? []), { id: -Date.now() - 1, role: 'assistant', content: r.reply, created_at: new Date().toISOString() } as TutorMessage])
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={<span className="flex items-center gap-2"><Bot className="h-5 w-5 text-tinta-500" />Tutor IA</span>} action={left != null && <span className="text-sm text-texto-suave">Te quedan {left} preguntas hoy</span>}>
      <div className="mb-3 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {!data?.length && <p className="text-sm text-texto-suave">Pregúntame lo que no entiendas del curso. Te ayudo a razonar paso a paso (no hago la tarea por ti 😉).</p>}
        {data?.map((m) => (
          <div key={m.id} className={cn('max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-[15px]', m.role === 'user' ? 'ml-auto bg-tinta text-white' : 'bg-papel')}>{m.content}</div>
        ))}
        {busy && <div className="w-fit rounded-2xl bg-papel px-4 py-3 text-texto-suave"><span className="typing-dots"><span /><span /><span /></span></div>}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="flex items-end gap-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Escribe tu pregunta…" className="min-h-12 flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit() } }} />
        <Button type="submit" loading={busy} disabled={!text.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
      </form>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Búsqueda dentro del curso (atajo «/»)
// ---------------------------------------------------------------------------
export function CourseSearch({ offering, onGo }: { offering: Offering; onGo: (tab: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  useKey('/', (e) => { e.preventDefault(); setOpen(true) })
  const { data } = useAsync(async () => {
    if (!open) return null
    const [materials, assignments, news] = await Promise.all([listMaterials(offering.id), listAssignments(offering.id), listCourseAnnouncements(offering.id)])
    return { materials, assignments, news }
  }, [open, offering.id], { live: false })
  const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const term = norm(q.trim())
  const results = useMemo(() => {
    if (!data || term.length < 2) return []
    return [
      ...data.materials.filter((m) => norm(`${m.title} ${m.description} ${m.unit}`).includes(term)).map((m) => ({ key: `m${m.id}`, kind: 'Material', title: m.title, tab: 'units', to: null as string | null })),
      ...data.assignments.filter((a) => norm(`${a.title} ${a.instructions}`).includes(term)).map((a) => ({ key: `a${a.id}`, kind: a.kind === 'QUIZ' ? 'Evaluación' : 'Tarea', title: a.title, tab: 'tasks', to: `/tarea/${a.id}` })),
      ...data.news.filter((n) => norm(`${n.title} ${n.body}`).includes(term)).map((n) => ({ key: `n${n.id}`, kind: 'Anuncio', title: n.title, tab: 'news', to: null })),
    ].slice(0, 30)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, term])
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Search className="h-4 w-4" />Buscar en el curso</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Buscar en el curso">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Materiales, tareas o anuncios…" />
        <ul className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
          {!data && open && <Loading rows={2} />}
          {term.length >= 2 && data && !results.length && <p className="p-2 text-sm text-texto-suave">Sin resultados.</p>}
          {results.map((r) => (
            <li key={r.key}>
              {r.to ? (
                <Link to={r.to} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg p-2 hover:bg-papel"><Badge>{r.kind}</Badge><span className="truncate font-bold">{r.title}</span></Link>
              ) : (
                <button onClick={() => { onGo(r.tab); setOpen(false) }} className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-papel"><Badge>{r.kind}</Badge><span className="truncate font-bold">{r.title}</span></button>
              )}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Portada y copia de contenido (docente)
// ---------------------------------------------------------------------------
export function CoverPicker({ offering, onChanged }: { offering: Offering; onChanged: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  async function pick(cover: string | null) {
    try { await setOfferingCover(offering.id, cover); toast('Portada actualizada.'); setOpen(false); onChanged() } catch (err) { toast(toMessage(err), 'error') }
  }
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><ImageIcon className="h-4 w-4" />Portada</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Portada del curso" wide>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <li>
            <button onClick={() => void pick(null)} className={cn('art-tile w-full rounded-xl border p-1 text-xs font-bold', !offering.cover ? 'border-tinta' : 'border-linea')} aria-pressed={!offering.cover}>
              <span className="block aspect-video rounded-lg" style={{ background: offering.subject.color }} />
              <span className="mt-1 block">Color del área</span>
            </button>
          </li>
          {SCENES.map((s) => {
            const v = `scene:${s.key}`
            return (
              <li key={s.key}>
                <button onClick={() => void pick(v)} aria-pressed={offering.cover === v} className={cn('art-tile w-full rounded-xl border p-1 text-xs font-bold', offering.cover === v ? 'border-tinta' : 'border-linea hover:border-tinta-500')}>
                  <span className="relative block aspect-video overflow-hidden rounded-lg"><ArtLayer value={v} /></span>
                  <span className="mt-1 block">{s.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </Modal>
    </>
  )
}

export function CopyContentButton({ offering, teacherId }: { offering: Offering; teacherId: string }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const { data } = useAsync(() => (open ? listTeacherOfferings(teacherId) : Promise.resolve([])), [open, teacherId], { live: false })
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Copy className="h-4 w-4" />Traer contenido</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Copiar contenido desde otro curso">
        <p className="mb-3 text-sm text-texto-suave">Copia unidades, materiales y tareas (como borradores) desde otra sección o del año anterior. No copia entregas ni notas.</p>
        <Select value={from} onChange={(e) => setFrom(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Elegir curso de origen…</option>
          {(data ?? []).filter((o) => o.id !== offering.id).map((o) => <option key={o.id} value={o.id}>{o.subject.name} · {classroomLabel(o.classroom)}</option>)}
        </Select>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!from} loading={busy} onClick={async () => {
            setBusy(true)
            try {
              const r = await duplicateOfferingContent(Number(from), offering.id)
              toast(`Copiado: ${r.units} unidades, ${r.materials} materiales y ${r.assignments} tareas.`)
              setOpen(false)
              setTimeout(() => location.reload(), 600)
            } catch (err) {
              toast(toMessage(err), 'error')
            } finally {
              setBusy(false)
            }
          }}><Copy className="h-4 w-4" />Copiar</Button>
        </div>
      </Modal>
    </>
  )
}
