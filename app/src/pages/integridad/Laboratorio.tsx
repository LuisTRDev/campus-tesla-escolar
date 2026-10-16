/**
 * Laboratorio anti-trampa: demostraciones en vivo con el MISMO código que protege las
 * evaluaciones y tareas reales (useExamGuard, useWritingMetrics, submissionRisk,
 * sharedSegments). Nada se envía ni se guarda y no afecta a ningún alumno.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ClipboardCopy, Copy, ExternalLink, Eye, FileWarning, Maximize, MousePointerClick, PanelsLeftRight, Play, RotateCcw, ShieldAlert,
  ShieldCheck, WifiOff, Zap,
} from 'lucide-react'
import { Badge, Button, Panel, Segmented, Textarea } from '@/components/ui'
import { EVENT_LABEL, Marked, RiskSummary } from '@/components/integrity'
import { enterFullscreen, exitFullscreen, fullscreenSupported, useExamGuard } from '@/lib/examGuard'
import { useWritingMetrics } from '@/lib/writingMetrics'
import { attemptRisk, duration, sharedSegments, submissionRisk, textFeatures } from '@/lib/integrity'
import { useToast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { AttemptCounters, AttemptSignals, GuardEvent, GuardStatus, SubmissionSignals } from '@/services/integridad'
import type { QuizSettings } from '@/types'

type Lab = 'examen' | 'escritura' | 'similitud'

export function Laboratorio({ initial = 'examen' }: { initial?: Lab }) {
  const [lab, setLab] = useState<Lab>(initial)
  useEffect(() => setLab(initial), [initial])
  return (
    <section id="laboratorio" className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="lema text-[11px] text-rojo">Pruébalo tú mismo</p>
          <h2 className="font-display text-2xl font-bold">Laboratorio anti-trampa</h2>
          <p className="mt-1 max-w-prosa text-sm text-texto-suave">Usa el mismo código que protege las evaluaciones reales. Nada de lo que hagas aquí se guarda ni afecta a ningún alumno.</p>
        </div>
        <Segmented<Lab> value={lab} onChange={setLab} options={[
          { value: 'examen', label: 'Examen de prueba' },
          { value: 'escritura', label: 'Escritura' },
          { value: 'similitud', label: 'Copia entre alumnos' },
        ]} />
      </div>
      {lab === 'examen' && <ExamenPrueba />}
      {lab === 'escritura' && <EscrituraPrueba />}
      {lab === 'similitud' && <SimilitudPrueba />}
    </section>
  )
}

// ---------------------------------------------------------------------------
// 1) Examen de prueba: el monitor real en modo prueba
// ---------------------------------------------------------------------------
const DEMO_SETTINGS: QuizSettings = {
  integrity_level: 'STRICT', leave_action: 'CLOSE', max_leaves: 3, block_paste: true, watermark: true, fullscreen: true, sequential: true,
}

const RETOS: { t: string; label: string; how: string; icon: typeof Eye }[] = [
  { t: 'LEAVE', label: 'Salir de la evaluación', how: 'Cambia a otra pestaña o app y vuelve (más de 2 segundos).', icon: Eye },
  { t: 'PASTE', label: 'Pegar texto', how: 'Copia cualquier texto y pégalo en la respuesta.', icon: ClipboardCopy },
  { t: 'COPY', label: 'Copiar la pregunta', how: 'Selecciona la pregunta y presiona Ctrl + C.', icon: Copy },
  { t: 'CONTEXT', label: 'Clic derecho', how: 'Abre el menú del clic derecho sobre la pregunta.', icon: MousePointerClick },
  { t: 'FS_EXIT', label: 'Salir de pantalla completa', how: 'Pulsa «Pantalla completa» y luego Esc.', icon: Maximize },
  { t: 'RESIZE', label: 'Dividir la pantalla', how: 'Achica la ventana a menos de 3/4 de su ancho.', icon: PanelsLeftRight },
  { t: 'MULTITAB', label: 'Abrir otra pestaña', how: 'Abre esta página en otra pestaña e inicia la prueba allí también.', icon: ExternalLink },
  { t: 'OFFLINE', label: 'Quedarse sin internet', how: 'Apaga el wifi un momento (se registra y se envía al volver).', icon: WifiOff },
]

/** Convierte los eventos en los mismos contadores que guarda quiz_log_events (script 23). */
function countersFrom(events: GuardEvent[], closed: boolean): AttemptCounters {
  const c: AttemptCounters = {}
  const inc = (k: keyof AttemptCounters, n = 1) => { (c as Record<string, number>)[k] = ((c as Record<string, number>)[k] ?? 0) + n }
  for (const e of events) {
    if (e.t === 'LEAVE') { inc('leaves'); inc('leave_ms', e.v ?? 0) }
    if (e.t === 'PASTE') { inc('pastes'); inc('paste_chars', e.v ?? 0) }
    if (e.t === 'COPY') inc('copies')
    if (e.t === 'CONTEXT') inc('context')
    if (e.t === 'FS_EXIT') inc('fs_exits')
    if (e.t === 'RESIZE') inc('resizes')
    if (e.t === 'MULTITAB') inc('multitab')
    if (e.t === 'OFFLINE') inc('offline')
  }
  if (closed) c.closed_by = 'LEAVES'
  return c
}

function ExamenPrueba() {
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<GuardEvent[]>([])
  const [status, setStatus] = useState<GuardStatus | null>(null)
  const [answer, setAnswer] = useState('')
  const startedAt = useRef(Date.now())

  const { needFullscreen } = useExamGuard({
    attemptId: null,
    demo: running,
    settings: DEMO_SETTINGS,
    questionId: running ? 1 : null,
    onStatus: (s) => {
      setStatus(s)
      if (s.closed) { setRunning(false); exitFullscreen() }
    },
    onBlocked: (what) => toast(what === 'paste' ? 'Pegar está bloqueado en esta evaluación (y quedó registrado).' : 'Copiar las preguntas está bloqueado (y quedó registrado).', 'error'),
    onEvent: (e) => { if (e.t !== 'QTIME') setEvents((list) => [e, ...list].slice(0, 60)) },
  })

  function start() {
    setEvents([]); setStatus(null); setAnswer('')
    startedAt.current = Date.now()
    setRunning(true)
  }

  const detected = new Set(events.map((e) => e.t))
  const closed = !!status?.closed
  const risk = useMemo(() => {
    const signals: AttemptSignals = {
      attempt_id: 0, student_id: 0, attempt_no: 1, started_at: new Date(startedAt.current).toISOString(), finished_at: null,
      device_locked: true, integrity: countersFrom(events, closed), events: events.length, questions: 1, pct: null, duration_s: null,
      fast_correct: 0, course: { avg: null, n: 0 }, review: null,
    }
    return attemptRisk(signals, [], () => '')
  }, [events, closed])

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <div className="space-y-4">
        {/* La evaluación de prueba, con la marca de agua como en la real */}
        <div className={cn('relative overflow-hidden rounded-2xl border-2 bg-superficie p-5 transition-colors duration-medio', running ? 'border-estado-ok/60' : closed ? 'border-estado-alerta/60' : 'border-linea')}>
          {running && (
            <div className="pointer-events-none absolute inset-0 flex select-none flex-wrap content-start gap-x-10 gap-y-8 overflow-hidden p-4 text-xs font-bold text-texto/[0.06]" aria-hidden>
              {Array.from({ length: 40 }).map((_, i) => <span key={i} className="-rotate-[24deg]">PRUEBA · Docente</span>)}
            </div>
          )}
          <div className="relative">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-slab text-sm font-extrabold uppercase tracking-wide">Evaluación de prueba · Modo estricto</p>
              {running ? <Badge tone="ok"><span className="rec-dot h-1.5 w-1.5 rounded-full bg-estado-ok" />Monitoreando</Badge>
                : closed ? <Badge tone="alert">Enviada sola</Badge> : <Badge>Detenida</Badge>}
            </div>
            {closed ? (
              <div className="py-6 text-center">
                <ShieldAlert className="mx-auto h-10 w-10 text-estado-alerta" />
                <p className="mt-2 font-display text-xl font-bold">La evaluación se habría enviado sola</p>
                <p className="mt-1 text-sm text-texto-suave">Saliste {status?.leaves} veces y el límite era {status?.max}. En un examen real se entrega con lo que el alumno haya respondido.</p>
              </div>
            ) : (
              <>
                <p className="select-none text-[15px] font-bold">1. Si un terreno mide 3/4 de hectárea y se le suma 1/4, ¿cuánto mide en total? Explica tu respuesta.</p>
                <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={!running} className="mt-3 min-h-24" placeholder={running ? 'Escribe aquí… o intenta pegar un texto' : 'Inicia la prueba para responder'} />
              </>
            )}
            {status && !closed && status.leaves ? (
              <p className="mt-3 rounded-lg bg-estado-tarde/10 px-3 py-2 text-sm font-bold text-estado-tarde">Saliste de la evaluación ({status.leaves} de {status.max}). Al llegar a {status.max} se envía sola.</p>
            ) : null}
            {needFullscreen && running && <p className="mt-3 rounded-lg bg-estado-tarde/10 px-3 py-2 text-sm text-estado-tarde">Saliste de la pantalla completa: el alumno vería un aviso para volver.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {!running
                ? <Button variant="accion" onClick={start}><Play className="h-4 w-4" />{closed || events.length ? 'Volver a empezar' : 'Iniciar prueba'}</Button>
                : <Button variant="secondary" onClick={() => { setRunning(false); exitFullscreen() }}><RotateCcw className="h-4 w-4" />Detener</Button>}
              {running && fullscreenSupported() && <Button variant="secondary" onClick={() => enterFullscreen()}><Maximize className="h-4 w-4" />Pantalla completa</Button>}
              {running && <Button variant="ghost" onClick={() => window.open(`${location.pathname}#laboratorio`, '_blank')}><ExternalLink className="h-4 w-4" />Abrir en otra pestaña</Button>}
            </div>
          </div>
        </div>

        {/* Retos: cada uno se marca cuando el sistema lo detecta */}
        <Panel title="Intenta hacer trampa">
          <ul className="grid gap-2 sm:grid-cols-2">
            {RETOS.map((r) => {
              const ok = detected.has(r.t)
              return (
                <li key={r.t} className={cn('flex gap-3 rounded-xl border p-3 transition duration-medio', ok ? 'border-estado-ok/40 bg-estado-ok/5' : 'border-linea')}>
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', ok ? 'check-pop bg-estado-ok text-white' : 'bg-papel text-texto-suave')}>
                    {ok ? <ShieldCheck className="h-4 w-4" /> : <r.icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{r.label}</span>
                    <span className="block text-xs text-texto-suave">{ok ? '¡Detectado!' : r.how}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="Lo que ve el docente" bodyClassName="p-4">
          <RiskSummary risk={risk} />
        </Panel>
        <Panel title={`Registro en vivo (${events.length})`} bodyClassName="p-4">
          {events.length === 0 ? (
            <p className="text-sm text-texto-suave">{running ? 'Esperando… intenta alguno de los retos.' : 'Inicia la prueba para ver cómo se registra cada acción.'}</p>
          ) : (
            <ol className="max-h-80 space-y-1.5 overflow-y-auto">
              {events.map((e, i) => (
                <li key={`${e.c}-${i}`} className="toast-in flex items-start gap-2 text-sm">
                  <span className="mt-0.5 font-mono text-xs tabular-nums text-texto-suave">+{Math.max(0, Math.round(((e.c ?? Date.now()) - startedAt.current) / 1000))} s</span>
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chispa-600" />
                  <span>{EVENT_LABEL[e.t] ?? e.t}{e.t === 'LEAVE' && e.v ? ` (${duration(e.v)})` : ''}{e.t === 'PASTE' && e.v ? ` (${e.v} caracteres)` : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2) Escritura: tecleado frente a pegado e indicios de IA
// ---------------------------------------------------------------------------
const TEXTO_IA = '## El ciclo del agua\n\n¡Claro! Aquí tienes un ensayo sobre el ciclo del agua. Es importante destacar que el ciclo hidrológico desempeña un papel crucial en la regulación del clima — y, asimismo, en la distribución de los recursos hídricos. En la actualidad, cabe destacar que este proceso resulta fundamental para la vida en el planeta. En conclusión, constituye un proceso fundamental que sin lugar a dudas debemos proteger. Espero que esto te ayude.'

function EscrituraPrueba() {
  const toast = useToast()
  const metrics = useWritingMetrics('panel-antitrampa')
  const [text, setText] = useState('')
  const [, setTick] = useState(0)
  useEffect(() => { metrics.take() }, []) // empieza en cero cada vez

  const m = metrics.peek()
  const total = m.typed + m.pasted
  const pastedPct = total ? m.pasted / total : 0
  const words = textFeatures(text).words ?? 0
  const risk = useMemo(() => {
    const signals: SubmissionSignals = {
      submission_id: 0, student_id: 0, words, fp_size: 0, features: textFeatures(text), writing: m, baseline: {}, history_n: 0,
      matches: [], dup_links: [], review: null,
    }
    return submissionRisk(signals, text)
  }, [text, total])

  function onChange(e: ChangeEvent<HTMLTextAreaElement>) {
    metrics.track(text, e.target.value)
    setText(e.target.value)
    setTick((t) => t + 1)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
      <Panel title="Escribe una entrega de prueba" bodyClassName="p-4">
        <Textarea value={text} onChange={onChange} onPaste={metrics.onPaste} className="min-h-56" placeholder="Escribe unas líneas con el teclado… luego copia el texto de ejemplo de abajo y pégalo aquí." />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard?.writeText(TEXTO_IA).then(() => toast('Texto de ejemplo copiado: ahora pégalo en el cuadro.'), () => toast('No se pudo copiar automáticamente: selecciona el ejemplo y cópialo.', 'error'))}>
            <ClipboardCopy className="h-4 w-4" />Copiar texto de ejemplo (hecho con IA)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { metrics.take(); setText(''); setTick((t) => t + 1) }}><RotateCcw className="h-4 w-4" />Borrar</Button>
        </div>
        <details className="mt-3 text-xs text-texto-suave">
          <summary className="cursor-pointer font-bold">Ver el texto de ejemplo</summary>
          <p className="mt-2 whitespace-pre-line rounded-lg bg-papel p-3">{TEXTO_IA}</p>
        </details>
      </Panel>
      <div className="space-y-4">
        <Panel title="Cómo se escribió" bodyClassName="p-4">
          <div className="flex items-end justify-between text-sm">
            <span><b className="cifras font-display text-2xl">{Math.round((1 - pastedPct) * 100)}%</b> tecleado</span>
            <span className="text-right"><b className="cifras font-display text-2xl text-estado-alerta">{Math.round(pastedPct * 100)}%</b> pegado</span>
          </div>
          <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-[var(--meter-track)]" aria-hidden>
            <div className="h-full bg-estado-ok transition-[width] duration-medio" style={{ width: `${total ? (1 - pastedPct) * 100 : 0}%` }} />
            <div className="h-full bg-estado-alerta transition-[width] duration-medio" style={{ width: `${pastedPct * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-texto-suave">{m.typed} caracteres tecleados · {m.pasted} pegados en {m.pastes} pegado{m.pastes === 1 ? '' : 's'} · {words} palabras</p>
        </Panel>
        <Panel title="Lo que ve el docente" bodyClassName="p-4">
          {words < 40 ? <p className="text-sm text-texto-suave">El análisis empieza a partir de 40 palabras (como en las tareas reales). Llevas {words}.</p> : <RiskSummary risk={risk} />}
        </Panel>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3) Copia entre alumnos: tramos de 5 palabras en común
// ---------------------------------------------------------------------------
const ORIGINAL = 'El ciclo del agua es el recorrido continuo que hace el agua en la naturaleza. Primero el sol calienta los mares y los ríos y el agua se evapora. Después el vapor sube y se enfría formando las nubes. Cuando las nubes se cargan de gotas cae la lluvia sobre los cerros y los campos de Cañete.'
const COPIA = 'El agua siempre está en movimiento. Primero el sol calienta los mares y los ríos y el agua se evapora. Luego el vapor sube y se enfría formando las nubes. Cuando las nubes se cargan de gotas cae la lluvia y el agua regresa al mar.'

function SimilitudPrueba() {
  const [a, setA] = useState(ORIGINAL)
  const [b, setB] = useState(COPIA)
  const result = useMemo(() => sharedSegments(a, b), [a, b])
  const pct = Math.round(result.ratio * 100)
  const level = result.ratio >= 0.5 ? 'alert' : result.ratio >= 0.25 ? 'alert' : result.ratio >= 0.12 ? 'late' : 'ok'
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Entrega de Ana" bodyClassName="p-4"><Textarea value={a} onChange={(e) => setA(e.target.value)} className="min-h-36" /></Panel>
        <Panel title="Entrega de Bruno" bodyClassName="p-4"><Textarea value={b} onChange={(e) => setB(e.target.value)} className="min-h-36" /></Panel>
      </div>
      <Panel
        title="Comparación lado a lado"
        action={<Badge tone={level as 'alert' | 'late' | 'ok'}><FileWarning className="h-3 w-3" />{pct}% en común</Badge>}
        bodyClassName="p-4"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-linea p-3"><p className="mb-1 text-xs font-bold text-texto-suave">Ana</p><Marked segments={result.a} /></div>
          <div className="rounded-xl border border-linea p-3"><p className="mb-1 text-xs font-bold text-texto-suave">Bruno</p><Marked segments={result.b} /></div>
        </div>
        <p className="mt-3 text-xs text-texto-suave">
          Se marcan los tramos de 5 palabras seguidas que aparecen en las dos. Cambiar el orden o algunas palabras no alcanza para esconder la copia.
          En las tareas reales cada entrega se compara con todas las del colegio (también de años anteriores) mediante una huella digital del texto.
        </p>
      </Panel>
    </div>
  )
}
