import { useState } from 'react'
import { BarChart3, CheckCircle2, ClipboardCheck, Lock, Pencil, Play, Plus, Send, Trash2, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Select, Textarea } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, localInputToIso, isoToLocalInput } from '@/lib/format'
import { haptic } from '@/lib/ux'
import { cn } from '@/lib/utils'
import { classroomLabel, listClassrooms } from '@/services/campus'
import {
  AUDIENCE_LABEL, SURVEY_TYPE_LABEL, deleteSurvey, listSurveyQuestions, listSurveys, mySurveys, saveSurvey, setSurveyStatus, submitSurvey, surveyResults,
  type OpenSurvey, type Survey, type SurveyAudience, type SurveyQuestion, type SurveyQuestionType,
} from '@/services/gestion'

// ---------------------------------------------------------------------------
// Responder
// ---------------------------------------------------------------------------
function AnswerSurvey({ survey, onDone }: { survey: OpenSurvey; onDone: () => void }) {
  const toast = useToast()
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const set = (id: number, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }))
  return (
    <form className="space-y-5" onSubmit={async (e) => {
      e.preventDefault()
      setBusy(true)
      try { await submitSurvey(survey.id, answers); haptic('success'); toast('¡Gracias por responder!'); onDone() } catch (err) { toast(toMessage(err), 'error') } finally { setBusy(false) }
    }}>
      {survey.description && <p className="text-texto-suave">{survey.description}</p>}
      {survey.anonymous && <p className="text-sm text-texto-suave"><Lock className="mr-1 inline h-4 w-4" />Es anónima: nadie verá quién respondió qué.</p>}
      {survey.questions.map((q, i) => (
        <fieldset key={q.id}>
          <legend className="mb-2 font-bold">{i + 1}. {q.prompt}{q.required && <span className="text-estado-alerta"> *</span>}</legend>
          {q.type === 'TEXT' && <Textarea value={(answers[q.id] as string) ?? ''} onChange={(e) => set(q.id, e.target.value)} maxLength={1000} className="min-h-20" />}
          {q.type === 'SCALE' && (
            <div className="flex gap-2">
              {['1', '2', '3', '4', '5'].map((v) => (
                <button key={v} type="button" onClick={() => set(q.id, v)} aria-pressed={answers[q.id] === v}
                  className={cn('h-12 w-12 rounded-xl border-2 font-display text-lg font-bold', answers[q.id] === v ? 'border-tinta bg-chispa-100' : 'border-linea')}>{v}</button>
              ))}
              <span className="ml-2 self-center text-xs text-texto-suave">1 = nada · 5 = mucho</span>
            </div>
          )}
          {(q.type === 'SINGLE' || q.type === 'MULTI') && (
            <div className="space-y-1.5">
              {q.options.map((o) => {
                const cur = answers[q.id]
                const on = q.type === 'MULTI' ? Array.isArray(cur) && cur.includes(o) : cur === o
                return (
                  <label key={o} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2', on ? 'border-tinta bg-chispa-100' : 'border-linea')}>
                    <input type={q.type === 'MULTI' ? 'checkbox' : 'radio'} name={`q${q.id}`} checked={on} className="h-4 w-4 accent-[#0B1D33]"
                      onChange={() => set(q.id, q.type === 'MULTI' ? (on ? (cur as string[]).filter((x) => x !== o) : [...((cur as string[]) ?? []), o]) : o)} />
                    {o}
                  </label>
                )
              })}
            </div>
          )}
        </fieldset>
      ))}
      <Button type="submit" loading={busy}><Send className="h-4 w-4" />Enviar respuestas</Button>
    </form>
  )
}

function ToAnswer() {
  const { data, loading, error, reload } = useAsync(mySurveys, [])
  const [open, setOpen] = useState<OpenSurvey | null>(null)
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />
  if (!data.length) return <Empty title="No hay encuestas abiertas" art="tasks">Cuando el colegio publique una encuesta para ti, aparecerá aquí.</Empty>
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {data.map((s) => (
          <li key={s.id} className="rounded-xl border border-linea bg-superficie p-4">
            <p className="font-bold">{s.title}</p>
            <p className="text-sm text-texto-suave">{s.questions.length} pregunta{s.questions.length === 1 ? '' : 's'}{s.closes_at ? ` · hasta el ${formatShort(s.closes_at)}` : ''}</p>
            <div className="mt-3">
              {s.answered
                ? <span className="inline-flex items-center gap-1 text-sm font-bold text-estado-ok"><CheckCircle2 className="h-4 w-4" />Respondida <button className="ml-2 font-normal underline" onClick={() => setOpen(s)}>cambiar</button></span>
                : <Button size="sm" onClick={() => setOpen(s)}><ClipboardCheck className="h-4 w-4" />Responder</Button>}
            </div>
          </li>
        ))}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} wide>
        {open && <AnswerSurvey survey={open} onDone={() => { setOpen(null); void reload(true) }} />}
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Crear y ver resultados
// ---------------------------------------------------------------------------
function SurveyBuilder({ survey, onClose, onSaved }: { survey: Survey | 'new'; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const edit = survey === 'new' ? null : survey
  const { data: classrooms } = useAsync(listClassrooms, [], { live: false })
  const { data: existing } = useAsync(() => (edit ? listSurveyQuestions(edit.id) : Promise.resolve(null)), [edit?.id], { live: false })
  const [f, setF] = useState({
    title: edit?.title ?? '', description: edit?.description ?? '', audience: (edit?.audience ?? 'FAMILIES') as SurveyAudience,
    classroomId: edit?.classroom_id ?? null as number | null, anonymous: edit?.anonymous ?? true, closesAt: isoToLocalInput(edit?.closes_at ?? null),
  })
  const [questions, setQuestions] = useState<SurveyQuestion[] | null>(edit ? null : [{ type: 'SCALE', prompt: '', options: [], required: true }])
  const qs = questions ?? existing ?? []
  const [busy, setBusy] = useState(false)
  const setQ = (i: number, patch: Partial<SurveyQuestion>) => setQuestions(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))

  if (edit && !existing && !questions) return <Loading />
  return (
    <div className="space-y-4">
      <Field label="Título"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} /></Field>
      <Field label="Descripción"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} className="min-h-16" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Para">
          <Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as SurveyAudience })}>
            {(Object.keys(AUDIENCE_LABEL) as SurveyAudience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </Select>
        </Field>
        <Field label="Aula (opcional)">
          <Select value={f.classroomId ?? ''} onChange={(e) => setF({ ...f, classroomId: e.target.value ? Number(e.target.value) : null })} disabled={f.audience === 'TEACHERS'}>
            <option value="">Todo el colegio</option>
            {(classrooms ?? []).map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </Select>
        </Field>
        <Field label="Cierra el (opcional)"><Input type="datetime-local" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} className="h-4 w-4 accent-[#0B1D33]" />Anónima</label>

      <ol className="space-y-3">
        {qs.map((q, i) => (
          <li key={i} className="rounded-xl border border-linea p-3">
            <div className="flex gap-2">
              <Select value={q.type} onChange={(e) => setQ(i, { type: e.target.value as SurveyQuestionType, options: q.options.length ? q.options : ['', ''] })} className="w-48">
                {(Object.keys(SURVEY_TYPE_LABEL) as SurveyQuestionType[]).map((t) => <option key={t} value={t}>{SURVEY_TYPE_LABEL[t]}</option>)}
              </Select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} className="accent-[#0B1D33]" />Obligatoria</label>
              <button onClick={() => setQuestions(qs.filter((_, j) => j !== i))} className="ml-auto rounded p-1.5 text-texto-suave hover:text-estado-alerta" aria-label="Quitar pregunta"><Trash2 className="h-4 w-4" /></button>
            </div>
            <Input className="mt-2" value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder={`Pregunta ${i + 1}`} maxLength={500} />
            {(q.type === 'SINGLE' || q.type === 'MULTI') && (
              <div className="mt-2 space-y-1.5 pl-4">
                {q.options.map((o, k) => (
                  <div key={k} className="flex gap-1">
                    <Input value={o} onChange={(e) => setQ(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} placeholder={`Opción ${k + 1}`} maxLength={120} />
                    <button onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k) })} className="rounded p-1.5 text-texto-suave" aria-label="Quitar opción"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setQ(i, { options: [...q.options, ''] })}><Plus className="h-4 w-4" />Opción</Button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <Button variant="secondary" size="sm" onClick={() => setQuestions([...qs, { type: 'SINGLE', prompt: '', options: ['', ''], required: true }])}><Plus className="h-4 w-4" />Pregunta</Button>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true)
          try {
            await saveSurvey({ id: edit?.id, ...f, closesAt: f.closesAt ? localInputToIso(f.closesAt) : null, questions: qs })
            toast('Encuesta guardada. Ábrela cuando esté lista.')
            onSaved()
          } catch (err) {
            toast(toMessage(err), 'error')
          } finally {
            setBusy(false)
          }
        }}>Guardar</Button>
      </div>
    </div>
  )
}

function Results({ survey }: { survey: Survey }) {
  const { data, loading } = useAsync(() => surveyResults(survey.id), [survey.id], { live: false })
  if (loading || !data) return <Loading />
  return (
    <div className="space-y-5">
      <p className="text-lg"><b className="font-display text-3xl">{data.responses}</b> respuesta{data.responses === 1 ? '' : 's'}</p>
      {data.questions.map((q, i) => {
        const counts = q.counts ?? {}
        const keys = q.type === 'SCALE' ? ['1', '2', '3', '4', '5'] : q.options
        const max = Math.max(1, ...Object.values(counts))
        const avg = q.type === 'SCALE' && data.responses ? Object.entries(counts).reduce((s, [k, n]) => s + Number(k) * n, 0) / Math.max(1, Object.values(counts).reduce((a, b) => a + b, 0)) : null
        return (
          <section key={q.id}>
            <p className="mb-2 font-bold">{i + 1}. {q.prompt}{avg != null && <span className="ml-2 text-sm font-normal text-texto-suave">promedio {avg.toFixed(1)} de 5</span>}</p>
            {q.type === 'TEXT' ? (
              <ul className="max-h-60 space-y-1.5 overflow-y-auto">
                {(q.texts ?? []).map((t, k) => <li key={k} className="rounded-lg bg-papel px-3 py-2 text-sm">“{t.text}”{t.who && <span className="text-texto-suave"> — {t.who}</span>}</li>)}
                {!q.texts?.length && <li className="text-sm text-texto-suave">Sin respuestas.</li>}
              </ul>
            ) : (
              <ul className="space-y-1.5">
                {keys.map((k, idx) => (
                  <li key={k} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 truncate">{k}</span>
                    <span className="h-5 flex-1 overflow-hidden rounded-full bg-[var(--meter-track)]">
                      <span className="bar-grow-x block h-full rounded-full bg-tinta-500" style={{ width: `${((counts[k] ?? 0) / max) * 100}%`, animationDelay: `${idx * 60}ms` }} />
                    </span>
                    <span className="w-8 text-right font-bold tabular-nums">{counts[k] ?? 0}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function Manage() {
  const toast = useToast()
  const { data, loading, error, reload } = useAsync(listSurveys, [])
  const [editing, setEditing] = useState<Survey | 'new' | null>(null)
  const [results, setResults] = useState<Survey | null>(null)
  return (
    <>
      <div className="mb-4"><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Nueva encuesta</Button></div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? <Empty title="Sin encuestas" art="tasks">Pregunta a familias, alumnos o docentes lo que necesites saber.</Empty> : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-linea">
            {data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <b className="block">{s.title}</b>
                  <span className="text-sm text-texto-suave">{AUDIENCE_LABEL[s.audience]} · {formatShort(s.created_at)}{s.anonymous ? ' · anónima' : ''}</span>
                </span>
                <Badge tone={s.status === 'OPEN' ? 'ok' : s.status === 'CLOSED' ? 'neutral' : 'spark'}>{s.status === 'OPEN' ? 'Abierta' : s.status === 'CLOSED' ? 'Cerrada' : 'Borrador'}</Badge>
                <span className="flex gap-1">
                  {s.status !== 'OPEN' && <Button size="sm" onClick={async () => { await setSurveyStatus(s.id, 'OPEN').then(() => toast('Encuesta abierta. Se avisó a los destinatarios.'), (e) => toast(toMessage(e), 'error')); void reload(true) }}><Play className="h-4 w-4" />Abrir</Button>}
                  {s.status === 'OPEN' && <Button size="sm" variant="secondary" onClick={async () => { await setSurveyStatus(s.id, 'CLOSED').catch((e) => toast(toMessage(e), 'error')); void reload(true) }}><Lock className="h-4 w-4" />Cerrar</Button>}
                  <Button size="sm" variant="secondary" onClick={() => setResults(s)}><BarChart3 className="h-4 w-4" />Resultados</Button>
                  {s.status === 'DRAFT' && <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>}
                  <Button size="sm" variant="ghost" onClick={async () => { if (confirm('¿Eliminar la encuesta y sus respuestas?')) { await deleteSurvey(s.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) } }} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></Button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva encuesta' : 'Editar encuesta'} wide>
        {editing && <SurveyBuilder survey={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(true) }} />}
      </Modal>
      <Modal open={!!results} onClose={() => setResults(null)} title={results?.title ?? ''} wide>
        {results && <Results survey={results} />}
      </Modal>
    </>
  )
}

export default function SurveysPage() {
  const { profile, isAdmin } = useAuth()
  const canCreate = isAdmin || profile?.role === 'AUXILIARY' || profile?.role === 'TEACHER'
  const [tab, setTab] = useState<'answer' | 'manage'>('answer')
  return (
    <>
      <PageHeader title="Encuestas" subtitle="Tu opinión ayuda a mejorar el colegio." />
      {canCreate && <div className="mb-5"><Segmented value={tab} onChange={setTab} options={[{ value: 'answer', label: 'Para responder' }, { value: 'manage', label: 'Mis encuestas' }]} /></div>}
      {tab === 'answer' || !canCreate ? <ToAnswer /> : <Manage />}
    </>
  )
}
