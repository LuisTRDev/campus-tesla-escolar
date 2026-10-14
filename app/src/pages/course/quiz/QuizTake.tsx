import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, KeyRound, Maximize, Play, RotateCcw, Send, ShieldCheck, Timer, WifiOff } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Input, Loading, Modal, Panel } from '@/components/ui'
import { useFocusMode } from '@/components/ux'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, formatTime } from '@/lib/format'
import { haptic, useOnline } from '@/lib/ux'
import { useHorizontalSwipe } from '@/lib/useSwipe'
import { cn } from '@/lib/utils'
import { enterFullscreen, exitFullscreen, fullscreenSupported, useExamGuard } from '@/lib/examGuard'
import { monitoringNotice } from '@/lib/integrity'
import { listAttempts, quizFinish, quizReview, quizSave, type AttemptView, type QuizAnswer } from '@/services/aprendizaje'
import { quizBegin, quizNext, type GuardStatus } from '@/services/integridad'
import type { AssignmentWithCourse } from '@/types'
import { AttemptReviewView } from './AttemptReview'
import { QuestionInput, answered } from './QuestionInput'

function useCountdown(deadline: string | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])
  return deadline ? Math.max(0, Math.floor((Date.parse(deadline) - now) / 1000)) : null
}

// Copia local de las respuestas: si se corta internet, nada se pierde.
const localKey = (attemptId: number) => `quiz-answers:${attemptId}`
function readLocal(attemptId: number): Record<string, QuizAnswer> {
  try { return JSON.parse(localStorage.getItem(localKey(attemptId)) || '{}') } catch { return {} }
}
function writeLocal(attemptId: number, answers: Record<string, QuizAnswer>) {
  try { localStorage.setItem(localKey(attemptId), JSON.stringify(answers)) } catch { /* sin almacenamiento */ }
}
function clearLocal(attemptId: number) {
  try { localStorage.removeItem(localKey(attemptId)) } catch { /* nada */ }
}

const isNetworkError = (err: unknown) => !navigator.onLine || /fetch|network|conexi/i.test(String((err as Error)?.message ?? err))

/** Nombre y hora sobre las preguntas: desanima las capturas compartidas. */
function Watermark({ text }: { text: string }) {
  const rows = Array.from({ length: 14 })
  return (
    <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden" aria-hidden>
      <div className="absolute -inset-1/4 flex -rotate-[24deg] flex-col justify-around opacity-[0.07]">
        {rows.map((_, i) => <p key={i} className="whitespace-nowrap font-display text-lg font-bold">{`${text} · `.repeat(6)}</p>)}
      </div>
    </div>
  )
}

export function QuizTake({ assignment, studentId }: { assignment: AssignmentWithCourse; studentId: number }) {
  const toast = useToast()
  const online = useOnline()
  const { selfStudent } = useAuth()
  const settings = useMemo(() => assignment.quiz_settings ?? {}, [assignment.quiz_settings])
  const { data: attempts, loading, reload } = useAsync(() => listAttempts(assignment.id, studentId), [assignment.id, studentId], { live: false })
  const [view, setView] = useState<AttemptView | null>(null)
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({})
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [reviewId, setReviewId] = useState<number | null>(null)
  const [askCode, setAskCode] = useState(false)
  const [code, setCode] = useState('')
  const [blocked, setBlocked] = useState<string | null>(null)
  const [confirmSend, setConfirmSend] = useState(false)
  const [warning, setWarning] = useState<GuardStatus | null>(null)
  const [pendingFinish, setPendingFinish] = useState(false)
  const review = useAsync(() => (reviewId ? quizReview(reviewId) : Promise.resolve(null)), [reviewId], { live: false })
  const left = useCountdown(view?.deadline_at ?? null)
  const dirty = useRef(false)
  const finishing = useRef(false)
  const answersRef = useRef(answers)
  const lastLeaves = useRef(0)
  answersRef.current = answers
  useFocusMode(!!view)

  const sequential = !!view?.sequential
  const total = view?.total ?? view?.questions.length ?? 0
  const q = view?.questions[step] ?? null

  const endAttempt = useCallback((attemptId: number, message: string) => {
    clearLocal(attemptId)
    exitFullscreen()
    setView(null)
    setPendingFinish(false)
    setReviewId(attemptId)
    toast(message)
    void reload(true)
  }, [toast, reload])

  const guard = useExamGuard({
    attemptId: view?.attempt_id ?? null,
    settings,
    questionId: q?.id ?? null,
    onStatus: (s) => {
      if (!view) return
      if (s.closed) {
        endAttempt(view.attempt_id, `Tu evaluación se envió sola porque saliste ${s.leaves ?? ''} veces.`)
        return
      }
      if ((s.leaves ?? 0) > lastLeaves.current && s.action && s.action !== 'LOG') {
        haptic('error')
        setWarning(s)
      }
      lastLeaves.current = s.leaves ?? lastLeaves.current
    },
    onBlocked: (what) => toast(what === 'paste' ? 'En esta evaluación no se puede pegar texto.' : 'No se puede copiar el contenido de la evaluación.', 'error'),
  })

  const finalizeGuard = guard.finalize

  // Guardado automático cada 10 s y al volver la conexión.
  const saveNow = useCallback(async () => {
    if (!view || !dirty.current || !navigator.onLine) return
    dirty.current = false
    try { await quizSave(view.attempt_id, answersRef.current) } catch { dirty.current = true }
  }, [view])
  useEffect(() => {
    if (!view) return
    const t = setInterval(() => void saveNow(), 10_000)
    const onHide = () => { if (document.hidden) void saveNow() }
    document.addEventListener('visibilitychange', onHide)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onHide) }
  }, [view, saveNow])

  const finish = useCallback(async () => {
    if (!view || finishing.current) return
    finishing.current = true
    setBusy(true)
    setConfirmSend(false)
    try {
      await finalizeGuard()
      const r = await quizFinish(view.attempt_id, answersRef.current)
      haptic('success')
      endAttempt(view.attempt_id, r.needs_review ? 'Enviado. Tu docente revisará las preguntas de desarrollo.' : `¡Listo! Obtuviste ${r.auto_points} de ${r.max_points} puntos.`)
    } catch (err) {
      if (isNetworkError(err)) {
        setPendingFinish(true)
        toast('Sin conexión: tus respuestas están guardadas en el celular y se enviarán apenas vuelva internet.', 'error')
      } else toast(toMessage(err), 'error')
    } finally {
      finishing.current = false
      setBusy(false)
    }
  }, [view, finalizeGuard, endAttempt, toast])

  // Al volver internet: guarda y, si quedó pendiente, envía.
  const pendingRef = useRef(false)
  pendingRef.current = pendingFinish
  useEffect(() => {
    if (!online || !view) return
    void saveNow()
    if (pendingRef.current) void finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // Se acaba el tiempo: se envía solo.
  const timedOut = useRef<number | null>(null)
  useEffect(() => {
    if (left !== 0 || !view || timedOut.current === view.attempt_id) return
    timedOut.current = view.attempt_id
    void finish()
  }, [left, view, finish])

  function applyView(v: AttemptView) {
    const local = readLocal(v.attempt_id)
    const merged = { ...(v.answers ?? {}) }
    // Lo guardado en el celular gana (puede ser más nuevo que lo del servidor).
    for (const [k, val] of Object.entries(local)) {
      if (!v.sequential || v.questions[v.questions.length - 1]?.id === Number(k)) merged[k] = val
    }
    setView(v)
    setAnswers(merged)
    setStep(v.sequential ? Math.max(0, v.questions.length - 1) : 0)
    lastLeaves.current = v.leaves ?? 0
    if (Object.keys(local).length) dirty.current = true
  }

  async function start() {
    if (settings.fullscreen) enterFullscreen() // debe ir dentro del toque
    setBusy(true)
    setBlocked(null)
    try {
      const v = await quizBegin(assignment.id, code)
      if ('blocked' in v) {
        setBlocked(v.message)
        exitFullscreen()
        return
      }
      setAskCode(false)
      setReviewId(null)
      applyView(v)
    } catch (err) {
      exitFullscreen()
      const msg = toMessage(err)
      if (/código de acceso/i.test(msg)) {
        setAskCode(true)
        if (code) toast(msg, 'error')
      } else toast(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  function answer(v: QuizAnswer) {
    if (!view || !q) return
    dirty.current = true
    setAnswers((a) => {
      const next = { ...a, [q.id]: v }
      writeLocal(view.attempt_id, next)
      return next
    })
  }

  async function next() {
    if (!view) return
    if (!sequential) { setStep((s) => Math.min(view.questions.length - 1, s + 1)); return }
    setBusy(true)
    try {
      const v = await quizNext(view.attempt_id, answersRef.current)
      haptic()
      setView(v)
      setStep(v.questions.length - 1)
      dirty.current = false
    } catch (err) {
      toast(isNetworkError(err) ? 'Sin conexión: espera a que vuelva internet para pasar a la siguiente pregunta.' : toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const swipe = useHorizontalSwipe(
    () => { if (!sequential && view && step < view.questions.length - 1) { haptic(); setStep(step + 1) } },
    () => { if (!sequential && step > 0) { haptic(); setStep(step - 1) } },
  )

  if (loading) return <Loading />

  if (view && q) {
    const done = view.questions.filter((x) => answered(answers[x.id] ?? null)).length
    const mm = left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : null
    const isLast = sequential ? step >= total - 1 : step === view.questions.length - 1
    const who = [selfStudent?.first_name, selfStudent?.last_name].filter(Boolean).join(' ') || 'Alumno'
    const stamp = `${who} · ${new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date())}`
    return (
      <div className="exam-mode fixed inset-0 z-50 flex h-[100dvh] flex-col bg-papel">
        <header className="z-10 border-b border-linea bg-papel px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-bold">{assignment.title}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]">
                <div className="h-full rounded-full bg-tinta transition-[width] duration-300" style={{ width: `${((sequential ? step : done) / Math.max(total, 1)) * 100}%` }} />
              </div>
            </div>
            {!online && <WifiOff className="h-5 w-5 text-estado-tarde" aria-label="Sin conexión" />}
            {mm && <span className={cn('flex items-center gap-1 rounded-full px-3 py-1 font-bold tabular-nums', left! < 60 ? 'bg-estado-alerta text-white' : 'bg-superficie')} role="timer"><Timer className="h-4 w-4" />{mm}</span>}
          </div>
          {!sequential && (
            <div className="mx-auto mt-3 flex max-w-2xl gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Preguntas">
              {view.questions.map((x, i) => (
                <button key={x.id} onClick={() => setStep(i)} aria-current={i === step} aria-label={`Pregunta ${i + 1}`}
                  className={cn('h-9 min-w-9 shrink-0 rounded-lg text-sm font-bold', i === step ? 'bg-tinta text-white' : answered(answers[x.id] ?? null) ? 'bg-estado-ok/15 text-estado-ok' : 'bg-superficie text-texto-suave')}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </header>

        <main className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-4" {...swipe}>
          {settings.watermark !== false && <Watermark text={stamp} />}
          <section key={q.id} className="page-in relative z-[1] mx-auto max-w-2xl rounded-2xl border border-linea bg-superficie/95 p-5">
            <p className="text-xs font-bold text-texto-suave">Pregunta {step + 1} de {total} · {q.points} pt</p>
            <p className="mb-4 mt-1 select-none whitespace-pre-line text-lg font-bold [-webkit-touch-callout:none]">{q.prompt}</p>
            <div className="[&_button]:select-none">
              <QuestionInput q={q} value={answers[q.id] ?? null} onChange={answer} />
            </div>
          </section>
          {sequential && !isLast && <p className="mx-auto mt-3 max-w-2xl text-center text-xs text-texto-suave">Al pasar a la siguiente ya no podrás cambiar esta respuesta.</p>}
          {!sequential && <p className="mx-auto mt-3 max-w-2xl text-center text-xs text-texto-suave">Desliza para cambiar de pregunta. Tus respuestas se guardan solas, incluso sin internet.</p>}
        </main>

        <footer className="border-t border-linea bg-papel px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
            {!sequential
              ? <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="min-h-12" aria-label="Anterior"><ChevronLeft className="h-5 w-5" /></Button>
              : <span className="w-12" />}
            <span className="text-sm text-texto-suave">{sequential ? `${step + 1} de ${total}` : `${done} de ${total} respondidas`}</span>
            {!isLast
              ? <Button onClick={() => void next()} loading={busy} className="min-h-12 px-5">Siguiente<ChevronRight className="h-5 w-5" /></Button>
              : <Button onClick={() => setConfirmSend(true)} loading={busy} className="min-h-12 px-5"><Send className="h-4 w-4" />Enviar</Button>}
          </div>
          {pendingFinish && <p className="mx-auto mt-2 max-w-2xl text-center text-xs font-bold text-estado-tarde">Esperando conexión para enviar tus respuestas…</p>}
        </footer>

        {guard.needFullscreen && fullscreenSupported() && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-papel/95 p-6 text-center">
            <Maximize className="h-10 w-10 text-tinta" />
            <p className="max-w-xs font-bold">Esta evaluación se rinde en pantalla completa.</p>
            <Button className="min-h-12 px-6" onClick={() => enterFullscreen()}>Volver a pantalla completa</Button>
          </div>
        )}

        <Modal open={confirmSend} onClose={() => setConfirmSend(false)} title="¿Enviar tus respuestas?">
          <p className="text-texto-suave">{done < total ? `Te faltan ${total - done} pregunta${total - done === 1 ? '' : 's'} por responder. ` : ''}Después de enviar ya no podrás cambiarlas.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmSend(false)}>Seguir revisando</Button>
            <Button onClick={() => void finish()} loading={busy}><Send className="h-4 w-4" />Enviar</Button>
          </div>
        </Modal>

        <Modal open={!!warning} onClose={() => setWarning(null)} title="Saliste de la evaluación">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-estado-alerta" />
            <p>
              {warning?.action === 'CLOSE'
                ? <>Llevas <b>{warning.leaves} de {warning.max}</b> salidas. {(() => { const n = Math.max(0, (warning.max ?? 0) - (warning.leaves ?? 0)); return n === 1 ? 'Si sales una vez más' : `Si sales ${n} veces más` })()}, la evaluación se enviará sola.</>
                : <>Tu docente verá que saliste {warning?.leaves} {warning?.leaves === 1 ? 'vez' : 'veces'}. Quédate en la evaluación hasta terminar.</>}
            </p>
          </div>
          <div className="mt-5 flex justify-end"><Button onClick={() => setWarning(null)}>Entendido</Button></div>
        </Modal>
      </div>
    )
  }

  const used = attempts?.length ?? 0
  const max = settings.max_attempts ?? 1
  const pastDue = !!assignment.due_at && Date.parse(assignment.due_at) < Date.now() && !assignment.allow_late
  const startClosed = !!settings.start_until && Date.parse(settings.start_until) < Date.now()
  const unfinished = attempts?.find((a) => !a.finished_at)
  const canStart = assignment.status === 'PUBLISHED' && (unfinished || (used < max && !pastDue && !startClosed))

  return (
    <Panel title="Evaluación en línea">
      <ul className="mb-4 flex flex-wrap gap-2 text-sm">
        {settings.time_limit_min ? <Badge tone="info"><Timer className="h-3 w-3" />{settings.time_limit_min} minutos</Badge> : <Badge>Sin límite de tiempo</Badge>}
        <Badge>{max} intento{max === 1 ? '' : 's'}</Badge>
        {settings.sequential && <Badge>Una pregunta a la vez</Badge>}
        {settings.start_until && <Badge tone={startClosed ? 'alert' : 'late'}>Empieza hasta las {formatTime(settings.start_until)}</Badge>}
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
      {canStart && (
        <details className="mb-4 rounded-xl border border-linea p-3 text-sm" open={!used}>
          <summary className="flex cursor-pointer items-center gap-1.5 font-bold"><ShieldCheck className="h-4 w-4" />Antes de empezar</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-texto-suave">
            {monitoringNotice(settings).map((t) => <li key={t}>{t}</li>)}
            <li>Si se corta internet, sigue respondiendo: se guarda en tu celular y se envía al volver la conexión.</li>
          </ul>
        </details>
      )}
      {blocked && <p className="mb-4 rounded-lg bg-estado-alerta/10 p-3 text-sm font-bold text-estado-alerta">{blocked}</p>}
      {askCode && canStart && !unfinished && (
        <form className="mb-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void start() }}>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-bold"><KeyRound className="h-4 w-4" />Código de acceso</span>
            <Input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="Te lo da tu docente"
              className="w-44 font-mono text-lg uppercase tracking-widest" autoCapitalize="characters" autoComplete="off" enterKeyHint="go" />
          </label>
        </form>
      )}
      {assignment.status !== 'PUBLISHED' ? (
        <p className="text-texto-suave">La evaluación no está abierta.</p>
      ) : unfinished ? (
        <Button onClick={() => void start()} loading={busy} className="min-h-12 w-full sm:w-auto"><RotateCcw className="h-4 w-4" />Continuar intento</Button>
      ) : canStart ? (
        <Button onClick={() => void start()} loading={busy} disabled={askCode && !code.trim()} className="min-h-12 w-full px-6 sm:w-auto"><Play className="h-4 w-4" />{used ? 'Nuevo intento' : 'Empezar evaluación'}</Button>
      ) : (
        <p className="text-sm text-texto-suave">{pastDue ? 'La evaluación ya cerró.' : startClosed ? 'El horario para empezar ya terminó.' : 'Ya usaste todos tus intentos.'}</p>
      )}
      <Modal open={!!reviewId} onClose={() => setReviewId(null)} title="Tus respuestas" wide>
        {review.loading || !review.data ? <Loading /> : <AttemptReviewView review={review.data} />}
      </Modal>
    </Panel>
  )
}
