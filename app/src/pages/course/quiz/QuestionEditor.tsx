import { useState } from 'react'
import { CheckCircle2, Plus, Save, X } from 'lucide-react'
import { Button, Field, Input, Select, Textarea } from '@/components/ui'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { QUESTION_TYPE_LABEL, type EditorQuestion, type MatchOptions, type Option, type QuestionType } from '@/services/aprendizaje'

const newId = () => Math.random().toString(36).slice(2, 7)

export function blankQuestion(type: QuestionType): EditorQuestion {
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
export function QuestionForm({ initial, onSave, onCancel }: { initial: EditorQuestion; onSave: (q: EditorQuestion) => Promise<void>; onCancel: () => void }) {
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
export function QuestionSummary({ q }: { q: EditorQuestion }) {
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
