import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowUp, BookmarkPlus, Check, CheckCircle2, Clock, Library, Pencil, Play, Plus, RotateCcw, Save, Send, Timer, Trash2, X, XCircle,
} from 'lucide-react'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, Panel, Select, Textarea } from '@/components/ui'
import { useFocusMode } from '@/components/ux'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, formatTime } from '@/lib/format'
import { haptic } from '@/lib/ux'
import { cn } from '@/lib/utils'
import {
  QUESTION_TYPE_LABEL, deleteBankQuestion, deleteQuestion, importFromBank, listAttempts, listBank, questionToBank, quizEditor, quizFinish,
  quizGradeOpen, quizReview, quizSave, quizStart, reorderQuestions, saveQuestion, updateQuizSettings,
  type AttemptQuestion, type AttemptReview, type AttemptView, type EditorQuestion, type MatchOptions, type Option, type QuestionType, type QuizAnswer,
} from '@/services/aprendizaje'
import { studentName } from '@/services/campus'
import type { AssignmentWithCourse, QuizSettings } from '@/types'

const newId = () => Math.random().toString(36).slice(2, 7)

function blankQuestion(type: QuestionType): EditorQuestion {
  switch (type) {
    case 'SINGLE':
    case 'MULTI':
      return { type, prompt: '', points: 1, options: [{ id: newId(), text: '' }, { id: newId(), text: '' }, { id: newId(), text: '' }], answer: type === 'MULTI' ? [] : null }
    case 'TRUE_FALSE':
      return { type, prompt: '', points: 1, options: [], answer: true }
    case 'MATCH': {
      const l = [newId(), newId(), newId()]
      const r = [newId(), newId(), newId()]
      return { type, prompt: 'Relaciona cada elemento con su pareja.', points: 3, options: { left: l.map((id) => ({ id, text: '' })), right: r.map((id) => ({ id, text: '' })) }, answer: Object.fromEntries(l.map((id, i) => [id, r[i]])) }
    }
    case 'SHORT':
      return { type, prompt: '', points: 1, options: [], answer: [''] }
    default:
      return { type: 'OPEN', prompt: '', points: 4, options: [], answer: null }
  }
}

// ---------------------------------------------------------------------------
// Editor de una pregunta
// ---------------------------------------------------------------------------
function QuestionForm({ initial, onSave, onCancel }: { initial: EditorQuestion; onSave: (q: EditorQuestion) => Promise<void>; onCancel: () => void }) {
  const [q, setQ] = useState<EditorQuestion>(initial)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const set = (patch: Partial<EditorQuestion>) => setQ((x) => ({ ...x, ...patch }))
  const opts = q.options as Option[]
  const match = q.options as MatchOptions

  async function submit() {
    setBusy(true)
    try {
      await onSave(q)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-tinta-500/40 bg-papel/50 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Tipo">
          <Select value={q.type} onChange={(e) => setQ({ ...blankQuestion(e.target.value as QuestionType), prompt: q.prompt, id: q.id, position: q.position })}>
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Puntos"><Input type="number" min={0.5} step={0.5} value={q.points} onChange={(e) => set({ points: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Pregunta"><Textarea value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} maxLength={2000} className="min-h-20" /></Field>

      {(q.type === 'SINGLE' || q.type === 'MULTI') && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-bold">Opciones <span className="font-normal text-texto-suave">(marca {q.type === 'SINGLE' ? 'la correcta' : 'las correctas'})</span></legend>
          {opts.map((o, i) => {
            const checked = q.type === 'SINGLE' ? q.answer === o.id : Array.isArray(q.answer) && (q.answer as string[]).includes(o.id)
            return (
              <div key={o.id} className="flex items-center gap-2">
                <input
                  type={q.type === 'SINGLE' ? 'radio' : 'checkbox'}
                  checked={checked}
                  onChange={() => set({ answer: q.type === 'SINGLE' ? o.id : checked ? (q.answer as string[]).filter((x) => x !== o.id) : [...(q.answer as string[]), o.id] })}
                  className="h-5 w-5 accent-[#1e8e5a]"
                  aria-label={`Marcar opción ${i + 1} como correcta`}
                />
                <Input value={o.text} onChange={(e) => set({ options: opts.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} placeholder={`Opción ${i + 1}`} maxLength={300} />
                <button type="button" onClick={() => set({ options: opts.filter((x) => x.id !== o.id) })} disabled={opts.length <= 2} className="rounded-md p-2 text-texto-suave hover:text-estado-alerta disabled:opacity-30" aria-label="Quitar opción"><X className="h-4 w-4" /></button>
              </div>
            )
          })}
          {opts.length < 8 && <Button type="button" size="sm" variant="ghost" onClick={() => set({ options: [...opts, { id: newId(), text: '' }] })}><Plus className="h-4 w-4" />Opción</Button>}
        </fieldset>
      )}

      {q.type === 'TRUE_FALSE' && (
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" onClick={() => set({ answer: v })}
              className={cn('rounded-lg border px-4 py-2 font-bold', q.answer === v ? 'border-estado-ok bg-estado-ok/10 text-estado-ok' : 'border-linea')}>
              {v ? 'Verdadero' : 'Falso'}
            </button>
          ))}
        </div>
      )}

      {q.type === 'MATCH' && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-bold">Pares correctos <span className="font-normal text-texto-suave">(a los alumnos se les mezcla la columna derecha)</span></legend>
          {match.left.map((l, i) => {
            const rId = (q.answer as Record<string, string>)[l.id]
            const r = match.right.find((x) => x.id === rId)
            return (
              <div key={l.id} className="flex items-center gap-2">
                <Input value={l.text} placeholder={`Elemento ${i + 1}`} maxLength={200}
                  onChange={(e) => set({ options: { ...match, left: match.left.map((x) => (x.id === l.id ? { ...x, text: e.target.value } : x)) } })} />
                <span className="text-texto-suave">↔</span>
                <Input value={r?.text ?? ''} placeholder={`Pareja ${i + 1}`} maxLength={200}
                  onChange={(e) => set({ options: { ...match, right: match.right.map((x) => (x.id === rId ? { ...x, text: e.target.value } : x)) } })} />
                <button type="button" disabled={match.left.length <= 2} className="rounded-md p-2 text-texto-suave hover:text-estado-alerta disabled:opacity-30" aria-label="Quitar par"
                  onClick={() => {
                    const ans = { ...(q.answer as Record<string, string>) }
                    delete ans[l.id]
                    set({ options: { left: match.left.filter((x) => x.id !== l.id), right: match.right.filter((x) => x.id !== rId) }, answer: ans })
                  }}><X className="h-4 w-4" /></button>
              </div>
            )
          })}
          {match.left.length < 8 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => {
              const l = newId(); const r = newId()
              set({ options: { left: [...match.left, { id: l, text: '' }], right: [...match.right, { id: r, text: '' }] }, answer: { ...(q.answer as Record<string, string>), [l]: r } })
            }}><Plus className="h-4 w-4" />Par</Button>
          )}
        </fieldset>
      )}

      {q.type === 'SHORT' && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-bold">Respuestas aceptadas <span className="font-normal text-texto-suave">(sin importar mayúsculas ni tildes)</span></legend>
          {(q.answer as string[]).map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={a} maxLength={200} onChange={(e) => set({ answer: (q.answer as string[]).map((x, j) => (j === i ? e.target.value : x)) })} placeholder="Respuesta válida" />
              <button type="button" disabled={(q.answer as string[]).length <= 1} onClick={() => set({ answer: (q.answer as string[]).filter((_, j) => j !== i) })}
                className="rounded-md p-2 text-texto-suave hover:text-estado-alerta disabled:opacity-30" aria-label="Quitar respuesta"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => set({ answer: [...(q.answer as string[]), ''] })}><Plus className="h-4 w-4" />Otra forma válida</Button>
        </fieldset>
      )}

      {q.type === 'OPEN' && <p className="text-sm text-texto-suave">El alumno escribe su respuesta y tú le pones los puntos al revisar.</p>}

      <Field label="Explicación (opcional)" hint="Se muestra al alumno al revisar sus respuestas.">
        <Textarea value={q.explanation ?? ''} onChange={(e) => set({ explanation: e.target.value })} maxLength={1000} className="min-h-14" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="button" onClick={() => void submit()} loading={busy}><Save className="h-4 w-4" />Guardar pregunta</Button>
      </div>
    </div>
  )
}

/** Resumen de una pregunta en el editor. */
function QuestionSummary({ q }: { q: EditorQuestion }) {
  if (q.type === 'SINGLE' || q.type === 'MULTI') {
    const correct = Array.isArray(q.answer) ? q.answer : [q.answer]
    return (
      <ul className="mt-1 space-y-0.5 text-sm">
        {(q.options as Option[]).map((o) => (
          <li key={o.id} className={cn('flex items-center gap-1.5', correct.includes(o.id) ? 'font-bold text-estado-ok' : 'text-texto-suave')}>
            {correct.includes(o.id) ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5" />}{o.text}
          </li>
        ))}
      </ul>
    )
  }
  if (q.type === 'TRUE_FALSE') return <p className="mt-1 text-sm font-bold text-estado-ok">{q.answer ? 'Verdadero' : 'Falso'}</p>
  if (q.type === 'SHORT') return <p className="mt-1 text-sm text-estado-ok">Acepta: {(q.answer as string[]).join(' · ')}</p>
  if (q.type === 'MATCH') {
    const m = q.options as MatchOptions
    return (
      <ul className="mt-1 text-sm text-texto-suave">
        {m.left.map((l) => <li key={l.id}>{l.text} ↔ {m.right.find((r) => r.id === (q.answer as Record<string, string>)[l.id])?.text}</li>)}
      </ul>
    )
  }
  return <p className="mt-1 text-sm text-texto-suave">Respuesta de desarrollo.</p>
}

// ---------------------------------------------------------------------------
// Banco de preguntas
// ---------------------------------------------------------------------------
export function BankPicker({ open, subjectId, onClose, onPick }: { open: boolean; subjectId?: number | null; onClose: () => void; onPick?: (ids: number[]) => Promise<void> }) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [onlySubject, setOnlySubject] = useState(true)
  const [picked, setPicked] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useAsync(
    () => (open ? listBank({ subjectId: onlySubject ? subjectId : null, search }) : Promise.resolve([])),
    [open, onlySubject, subjectId, search], { live: false },
  )

  async function add() {
    if (!onPick) return
    setBusy(true)
    try {
      await onPick(picked)
      setPicked([])
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Banco de preguntas" wide>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en el banco…" className="max-w-xs" />
        {subjectId && (
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={onlySubject} onChange={(e) => setOnlySubject(e.target.checked)} className="h-4 w-4 accent-[#0B1D33]" />Solo de esta área
          </label>
        )}
      </div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? (
        <Empty title="El banco está vacío" art="search" compact>Guarda preguntas desde tus evaluaciones con el botón «Al banco».</Empty>
      ) : (
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {data.map((b) => {
            const on = picked.includes(b.id)
            return (
              <li key={b.id} className={cn('rounded-xl border p-3', on ? 'border-tinta bg-chispa-100/50' : 'border-linea')}>
                <div className="flex items-start gap-3">
                  {onPick && <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== b.id) : [...p, b.id]))} className="mt-1 h-5 w-5 accent-[#0B1D33]" aria-label="Elegir" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-texto-suave">{QUESTION_TYPE_LABEL[b.type]} · {b.points} pt{b.grade ? ` · ${b.grade}°` : ''}</p>
                    <p className="whitespace-pre-line font-bold">{b.prompt}</p>
                    <QuestionSummary q={b} />
                  </div>
                  {!onPick && (
                    <button onClick={async () => { if (confirm('¿Quitar esta pregunta del banco?')) { await deleteBankQuestion(b.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) } }}
                      className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label="Quitar del banco"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {onPick && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void add()} disabled={!picked.length} loading={busy}><Plus className="h-4 w-4" />Agregar {picked.length || ''} pregunta{picked.length === 1 ? '' : 's'}</Button>
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Editor de la evaluación (docente)
// ---------------------------------------------------------------------------
function SettingsForm({ assignment, onSaved }: { assignment: AssignmentWithCourse; onSaved: () => void }) {
  const toast = useToast()
  const [s, setS] = useState<QuizSettings>({ time_limit_min: null, max_attempts: 1, shuffle_questions: true, shuffle_options: true, show_answers: 'AFTER_SUBMIT', ...(assignment.quiz_settings ?? {}) })
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await updateQuizSettings(assignment.id, s)
      toast('Configuración guardada.')
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Tiempo límite (minutos)" hint="Vacío: sin límite.">
        <Input type="number" min={1} max={300} value={s.time_limit_min ?? ''} onChange={(e) => setS({ ...s, time_limit_min: e.target.value ? Number(e.target.value) : null })} />
      </Field>
      <Field label="Intentos permitidos"><Input type="number" min={1} max={10} value={s.max_attempts ?? 1} onChange={(e) => setS({ ...s, max_attempts: Number(e.target.value) })} /></Field>
      <Field label="Mostrar respuestas correctas">
        <Select value={s.show_answers} onChange={(e) => setS({ ...s, show_answers: e.target.value as QuizSettings['show_answers'] })}>
          <option value="AFTER_SUBMIT">Al terminar</option>
          <option value="AFTER_DUE">Después de la fecha límite</option>
          <option value="NEVER">Nunca (solo ve su nota)</option>
        </Select>
      </Field>
      <div className="space-y-2 pt-6">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!s.shuffle_questions} onChange={(e) => setS({ ...s, shuffle_questions: e.target.checked })} className="h-4 w-4 accent-[#0B1D33]" />Preguntas en orden al azar</label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={!!s.shuffle_options} onChange={(e) => setS({ ...s, shuffle_options: e.target.checked })} className="h-4 w-4 accent-[#0B1D33]" />Opciones en orden al azar</label>
      </div>
      <div className="sm:col-span-2 flex justify-end"><Button size="sm" variant="secondary" onClick={() => void save()} loading={busy}><Save className="h-4 w-4" />Guardar configuración</Button></div>
    </div>
  )
}

export function QuizEditor({ assignment, onChanged }: { assignment: AssignmentWithCourse; onChanged: () => void }) {
  const toast = useToast()
  const { data, loading, error, reload, mutate } = useAsync(() => quizEditor(assignment.id), [assignment.id], { live: false })
  const [editing, setEditing] = useState<EditorQuestion | 'new' | null>(null)
  const [bank, setBank] = useState(false)
  const total = (data ?? []).reduce((s, q) => s + Number(q.points), 0)

  async function save(q: EditorQuestion) {
    await saveQuestion(assignment.id, q)
    toast('Pregunta guardada.')
    setEditing(null)
    await reload(true)
  }

  async function move(idx: number, dir: -1 | 1) {
    if (!data) return
    const list = [...data]
    const [item] = list.splice(idx, 1)
    list.splice(idx + dir, 0, item)
    mutate(() => list)
    await reorderQuestions(list.map((q) => q.id!)).catch((e) => toast(toMessage(e), 'error'))
  }

  return (
    <div className="space-y-6">
      <Panel title="Configuración"><SettingsForm assignment={assignment} onSaved={onChanged} /></Panel>
      <Panel
        title={`Preguntas (${data?.length ?? 0})`}
        action={<span className="text-sm text-texto-suave">{total} punto{total === 1 ? '' : 's'} en total</span>}
      >
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {loading ? <Loading /> : (
          <ol className="space-y-3">
            {(data ?? []).map((q, i) => (
              <li key={q.id}>
                {editing !== 'new' && editing?.id === q.id ? (
                  <QuestionForm initial={q} onSave={save} onCancel={() => setEditing(null)} />
                ) : (
                  <div className="flex gap-3 rounded-xl border border-linea p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-papel text-sm font-bold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-texto-suave">{QUESTION_TYPE_LABEL[q.type]} · {Number(q.points)} pt</p>
                      <p className="whitespace-pre-line font-bold">{q.prompt}</p>
                      <QuestionSummary q={q} />
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button onClick={() => setEditing(q)} className="rounded-md p-1.5 text-texto-suave hover:text-texto" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => void move(i, -1)} disabled={i === 0} className="rounded-md p-1.5 text-texto-suave hover:text-texto disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                      <button onClick={() => void move(i, 1)} disabled={i === (data?.length ?? 0) - 1} className="rounded-md p-1.5 text-texto-suave hover:text-texto disabled:opacity-30" aria-label="Bajar"><ArrowDown className="h-4 w-4" /></button>
                      <button onClick={() => void questionToBank(q.id!).then(() => toast('Guardada en el banco de preguntas.'), (e) => toast(toMessage(e), 'error'))}
                        className="rounded-md p-1.5 text-texto-suave hover:text-texto" aria-label="Guardar en el banco" title="Al banco"><BookmarkPlus className="h-4 w-4" /></button>
                      <button onClick={async () => {
                        if (!confirm('¿Eliminar esta pregunta?')) return
                        await deleteQuestion(q.id!).catch((e) => toast(toMessage(e), 'error'))
                        void reload(true)
                      }} className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {editing === 'new' ? (
          <div className="mt-3"><QuestionForm initial={blankQuestion('SINGLE')} onSave={save} onCancel={() => setEditing(null)} /></div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Agregar pregunta</Button>
            <Button variant="secondary" onClick={() => setBank(true)}><Library className="h-4 w-4" />Desde el banco</Button>
          </div>
        )}
      </Panel>
      <BankPicker open={bank} subjectId={assignment.offering.subject_id} onClose={() => setBank(false)}
        onPick={async (ids) => { const n = await importFromBank(assignment.id, ids); toast(`${n} pregunta${n === 1 ? '' : 's'} agregada${n === 1 ? '' : 's'}.`); await reload(true) }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Respuesta a una pregunta (alumno) y revisión
// ---------------------------------------------------------------------------
function QuestionInput({ q, value, onChange, disabled }: { q: AttemptQuestion; value: QuizAnswer; onChange: (v: QuizAnswer) => void; disabled?: boolean }) {
  if (q.type === 'SINGLE' || q.type === 'MULTI') {
    const sel = q.type === 'MULTI' ? ((value as string[]) ?? []) : value
    return (
      <div className="space-y-2">
        {(q.options as Option[]).map((o) => {
          const on = q.type === 'MULTI' ? (sel as string[]).includes(o.id) : sel === o.id
          return (
            <button key={o.id} type="button" disabled={disabled} aria-pressed={on}
              onClick={() => { haptic(); onChange(q.type === 'MULTI' ? (on ? (sel as string[]).filter((x) => x !== o.id) : [...(sel as string[]), o.id]) : o.id) }}
              className={cn('flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors', on ? 'border-tinta bg-chispa-100 font-bold text-tinta' : 'border-linea hover:border-tinta-500')}>
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center border-2', q.type === 'MULTI' ? 'rounded' : 'rounded-full', on ? 'border-tinta bg-tinta text-white' : 'border-linea')}>
                {on && <Check className="h-3 w-3" />}
              </span>
              {o.text}
            </button>
          )
        })}
        {q.type === 'MULTI' && <p className="text-xs text-texto-suave">Puedes marcar varias.</p>}
      </div>
    )
  }
  if (q.type === 'TRUE_FALSE') {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((v) => (
          <button key={String(v)} type="button" disabled={disabled} aria-pressed={value === v} onClick={() => { haptic(); onChange(v) }}
            className={cn('rounded-xl border-2 px-4 py-3 font-bold', value === v ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
            {v ? 'Verdadero' : 'Falso'}
          </button>
        ))}
      </div>
    )
  }
  if (q.type === 'MATCH') {
    const m = q.options as MatchOptions
    const v = (value as Record<string, string>) ?? {}
    return (
      <div className="space-y-2">
        {m.left.map((l) => (
          <div key={l.id} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
            <span className="rounded-lg bg-papel px-3 py-2 font-bold">{l.text}</span>
            <Select disabled={disabled} value={v[l.id] ?? ''} onChange={(e) => onChange({ ...v, [l.id]: e.target.value })} aria-label={`Pareja de ${l.text}`}>
              <option value="">Elegir…</option>
              {m.right.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
            </Select>
          </div>
        ))}
      </div>
    )
  }
  if (q.type === 'SHORT') return <Input disabled={disabled} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder="Tu respuesta" />
  return <Textarea disabled={disabled} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={4000} className="min-h-32" placeholder="Desarrolla tu respuesta" />
}

function answered(v: QuizAnswer): boolean {
  if (v == null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.values(v).some(Boolean)
  return true
}

function describeAnswer(q: AttemptQuestion, v: QuizAnswer): string {
  if (!answered(v)) return 'Sin responder'
  if (q.type === 'SINGLE') return (q.options as Option[]).find((o) => o.id === v)?.text ?? '—'
  if (q.type === 'MULTI') return (q.options as Option[]).filter((o) => (v as string[]).includes(o.id)).map((o) => o.text).join(', ')
  if (q.type === 'TRUE_FALSE') return v ? 'Verdadero' : 'Falso'
  if (q.type === 'MATCH') {
    const m = q.options as MatchOptions
    return m.left.map((l) => `${l.text} → ${m.right.find((r) => r.id === (v as Record<string, string>)[l.id])?.text ?? '—'}`).join(' · ')
  }
  return String(v)
}

export function AttemptReviewView({ review, gradeOpen, onGraded }: { review: AttemptReview; gradeOpen?: boolean; onGraded?: () => void }) {
  const toast = useToast()
  const [points, setPoints] = useState<Record<string, number>>(() => Object.fromEntries(review.questions.filter((q) => q.type === 'OPEN').map((q) => [q.id, review.results[q.id] ?? 0])))
  const [busy, setBusy] = useState(false)
  const total = Number(review.auto_points ?? 0) + Number(review.manual_points ?? 0)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel p-4">
        <span className="font-display text-4xl font-bold">{Math.round(total * 100) / 100}</span>
        <span className="text-texto-suave">de {Number(review.max_points ?? 0)} puntos</span>
        {review.needs_review && <Badge tone="late">Falta revisar preguntas de desarrollo</Badge>}
      </div>
      <ol className="space-y-3">
        {review.questions.map((q, i) => {
          const pts = review.results[q.id]
          const ok = pts != null && pts >= Number(q.points)
          const partial = pts != null && pts > 0 && !ok
          const key = review.keys?.[q.id]
          return (
            <li key={q.id} className={cn('rounded-xl border p-4', pts == null ? 'border-linea' : ok ? 'border-estado-ok/40 bg-estado-ok/5' : partial ? 'border-estado-tarde/40 bg-estado-tarde/5' : 'border-estado-alerta/30 bg-estado-alerta/5')}>
              <div className="flex items-start gap-2">
                {pts == null ? <Clock className="mt-0.5 h-5 w-5 shrink-0 text-texto-suave" /> : ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-estado-ok" /> : <XCircle className={cn('mt-0.5 h-5 w-5 shrink-0', partial ? 'text-estado-tarde' : 'text-estado-alerta')} />}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{i + 1}. {q.prompt}</p>
                  <p className="mt-1 text-sm"><span className="text-texto-suave">Respuesta: </span>{describeAnswer(q, review.answers[q.id] ?? null)}</p>
                  {review.show_answers && key && q.type !== 'OPEN' && !ok && (
                    <p className="mt-1 text-sm text-estado-ok"><b>Correcta:</b> {q.type === 'SHORT' ? (key.answer as string[]).join(' / ') : describeAnswer(q, key.answer)}</p>
                  )}
                  {review.show_answers && key?.explanation && <p className="mt-1 text-sm italic text-texto-suave">{key.explanation}</p>}
                </div>
                {gradeOpen && q.type === 'OPEN' ? (
                  <Input type="number" min={0} max={q.points} step={0.5} value={points[q.id] ?? 0} onChange={(e) => setPoints((p) => ({ ...p, [q.id]: Number(e.target.value) }))}
                    className="w-20" aria-label="Puntos" />
                ) : (
                  <span className="shrink-0 text-sm font-bold tabular-nums">{pts == null ? '—' : pts}/{Number(q.points)}</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {gradeOpen && review.questions.some((q) => q.type === 'OPEN') && (
        <div className="flex justify-end">
          <Button loading={busy} onClick={async () => {
            setBusy(true)
            try {
              await quizGradeOpen(review.attempt_id, points)
              toast('Revisión guardada. La nota se actualizó.')
              onGraded?.()
            } catch (err) {
              toast(toMessage(err), 'error')
            } finally {
              setBusy(false)
            }
          }}><Save className="h-4 w-4" />Guardar revisión</Button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resultados (docente)
// ---------------------------------------------------------------------------
export function QuizResults({ assignment, students }: { assignment: AssignmentWithCourse; students: { id: number; first_name: string | null; last_name: string | null }[] }) {
  const { data, loading, reload } = useAsync(() => listAttempts(assignment.id), [assignment.id])
  const [open, setOpen] = useState<number | null>(null)
  const review = useAsync(() => (open ? quizReview(open) : Promise.resolve(null)), [open], { live: false })
  if (loading || !data) return <Loading />
  const byStudent = new Map<number, typeof data>()
  for (const a of data) byStudent.set(a.student_id, [...(byStudent.get(a.student_id) ?? []), a])
  const finished = data.filter((a) => a.finished_at)
  const avg = finished.length ? finished.reduce((s, a) => s + (Number(a.auto_points ?? 0) + Number(a.manual_points ?? 0)) / Number(a.max_points || 1), 0) / finished.length : null
  return (
    <Panel title="Resultados" action={<span className="text-sm text-texto-suave">{byStudent.size}/{students.length} rindieron{avg != null ? ` · promedio ${Math.round(avg * 100)}%` : ''}</span>}>
      <ul className="divide-y divide-linea">
        {students.map((st) => {
          const list = byStudent.get(st.id) ?? []
          return (
            <li key={st.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 truncate font-bold">{studentName(st)}</span>
              {!list.length && <span className="text-sm text-texto-suave">No rindió</span>}
              {list.map((a) => (
                <button key={a.id} onClick={() => setOpen(a.id)} className="rounded-lg border border-linea px-2.5 py-1 text-sm hover:border-tinta-500">
                  #{a.attempt_no} {a.finished_at ? `${Math.round((Number(a.auto_points ?? 0) + Number(a.manual_points ?? 0)) * 100) / 100}/${Number(a.max_points)}` : 'en curso'}
                  {a.needs_review && <Badge tone="late" className="ml-1">Revisar</Badge>}
                </button>
              ))}
            </li>
          )
        })}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title="Revisión del intento" wide>
        {review.loading || !review.data ? <Loading /> : <AttemptReviewView review={review.data} gradeOpen onGraded={() => { setOpen(null); void reload(true) }} />}
      </Modal>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Rendir la evaluación (alumno)
// ---------------------------------------------------------------------------
function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])
  return deadline ? Math.max(0, Math.floor((Date.parse(deadline) - now) / 1000)) : null
}

export function QuizTake({ assignment, studentId }: { assignment: AssignmentWithCourse; studentId: number }) {
  const toast = useToast()
  const settings = assignment.quiz_settings ?? {}
  const { data: attempts, loading, reload } = useAsync(() => listAttempts(assignment.id, studentId), [assignment.id, studentId], { live: false })
  const [view, setView] = useState<AttemptView | null>(null)
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({})
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const review = useAsync(() => (reviewId ? quizReview(reviewId) : Promise.resolve(null)), [reviewId], { live: false })
  const left = useCountdown(view?.deadline_at ?? null)
  const dirty = useRef(false)
  const finishing = useRef(false)
  useFocusMode(!!view)

  // Guardado automático cada 10 s.
  useEffect(() => {
    if (!view) return
    const t = setInterval(() => {
      if (!dirty.current) return
      dirty.current = false
      void quizSave(view.attempt_id, answers).catch(() => { dirty.current = true })
    }, 10_000)
    return () => clearInterval(t)
  }, [view, answers])

  const finish = useMemo(() => async (auto = false) => {
    if (!view || finishing.current) return
    if (!auto && !confirm('¿Terminar y enviar tus respuestas?')) return
    finishing.current = true
    setBusy(true)
    try {
      const r = await quizFinish(view.attempt_id, answers)
      haptic('success')
      toast(r.needs_review ? 'Enviado. Tu docente revisará las preguntas de desarrollo.' : `¡Listo! Obtuviste ${r.auto_points} de ${r.max_points} puntos.`)
      setView(null)
      setReviewId(view.attempt_id)
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      finishing.current = false
      setBusy(false)
    }
  }, [view, answers, toast, reload])

  // Se acaba el tiempo: se envía solo.
  useEffect(() => { if (left === 0 && view) void finish(true) }, [left, view, finish])

  async function start() {
    setBusy(true)
    try {
      const v = await quizStart(assignment.id)
      setView(v)
      setAnswers(v.answers ?? {})
      setStep(0)
      setReviewId(null)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loading />

  if (view) {
    const q = view.questions[step]
    const done = view.questions.filter((x) => answered(answers[x.id] ?? null)).length
    const mm = left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : null
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-papel">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
          <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 bg-papel/95 px-4 py-3 backdrop-blur">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-bold">{assignment.title}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]">
                <div className="xp-fill h-full rounded-full transition-[width] duration-500" style={{ width: `${(done / view.questions.length) * 100}%` }} />
              </div>
            </div>
            {mm && <span className={cn('flex items-center gap-1 rounded-full px-3 py-1 font-bold tabular-nums', left! < 60 ? 'bg-estado-alerta text-white' : 'bg-superficie')}><Timer className="h-4 w-4" />{mm}</span>}
          </header>

          <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Preguntas">
            {view.questions.map((x, i) => (
              <button key={x.id} onClick={() => setStep(i)} aria-current={i === step}
                className={cn('h-9 w-9 rounded-lg text-sm font-bold', i === step ? 'bg-tinta text-white' : answered(answers[x.id] ?? null) ? 'bg-estado-ok/15 text-estado-ok' : 'bg-superficie text-texto-suave')}>
                {i + 1}
              </button>
            ))}
          </div>

          <section key={q.id} className="page-in flex-1 rounded-2xl border border-linea bg-superficie p-5">
            <p className="text-xs font-bold text-texto-suave">Pregunta {step + 1} de {view.questions.length} · {q.points} pt</p>
            <p className="mb-4 mt-1 whitespace-pre-line text-lg font-bold">{q.prompt}</p>
            <QuestionInput q={q} value={answers[q.id] ?? null} onChange={(v) => { dirty.current = true; setAnswers((a) => ({ ...a, [q.id]: v })) }} />
          </section>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Anterior</Button>
            <span className="text-sm text-texto-suave">{done} de {view.questions.length} respondidas</span>
            {step < view.questions.length - 1
              ? <Button onClick={() => setStep((s) => s + 1)}>Siguiente</Button>
              : <Button onClick={() => void finish()} loading={busy} className="progress-fill"><Send className="h-4 w-4" />Enviar</Button>}
          </div>
          <p className="mt-3 text-center text-xs text-texto-suave">Tus respuestas se guardan solas. Si se cierra la app, vuelve a entrar y continúa.</p>
        </div>
      </div>
    )
  }

  const used = attempts?.length ?? 0
  const max = settings.max_attempts ?? 1
  const pastDue = !!assignment.due_at && Date.parse(assignment.due_at) < Date.now() && !assignment.allow_late
  const unfinished = attempts?.find((a) => !a.finished_at)

  return (
    <Panel title="Evaluación en línea">
      <ul className="mb-4 flex flex-wrap gap-2 text-sm">
        {settings.time_limit_min ? <Badge tone="info"><Timer className="h-3 w-3" />{settings.time_limit_min} minutos</Badge> : <Badge>Sin límite de tiempo</Badge>}
        <Badge>{max} intento{max === 1 ? '' : 's'}</Badge>
        {settings.shuffle_questions && <Badge>Preguntas al azar</Badge>}
      </ul>
      {!!attempts?.length && (
        <ul className="mb-4 space-y-2">
          {attempts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl border border-linea px-3 py-2">
              <span className="font-bold">Intento {a.attempt_no}</span>
              <span className="flex-1 text-sm text-texto-suave">{formatShort(a.started_at)} {formatTime(a.started_at)}</span>
              {a.finished_at ? (
                <>
                  <span className="font-display font-bold">{Math.round((Number(a.auto_points ?? 0) + Number(a.manual_points ?? 0)) * 100) / 100}/{Number(a.max_points)}</span>
                  <Button size="sm" variant="ghost" onClick={() => setReviewId(a.id)}>Ver</Button>
                </>
              ) : <Badge tone="late">Sin terminar</Badge>}
            </li>
          ))}
        </ul>
      )}
      {assignment.status !== 'PUBLISHED' ? (
        <p className="text-texto-suave">La evaluación no está abierta.</p>
      ) : unfinished ? (
        <Button onClick={() => void start()} loading={busy} className="min-h-12"><RotateCcw className="h-4 w-4" />Continuar intento</Button>
      ) : used < max && !pastDue ? (
        <Button onClick={() => void start()} loading={busy} className="min-h-12 px-6"><Play className="h-4 w-4" />{used ? 'Nuevo intento' : 'Empezar evaluación'}</Button>
      ) : (
        <p className="text-sm text-texto-suave">{pastDue ? 'La evaluación ya cerró.' : 'Ya usaste todos tus intentos.'}</p>
      )}
      <Modal open={!!reviewId} onClose={() => setReviewId(null)} title="Tus respuestas" wide>
        {review.loading || !review.data ? <Loading /> : <AttemptReviewView review={review.data} />}
      </Modal>
    </Panel>
  )
}

