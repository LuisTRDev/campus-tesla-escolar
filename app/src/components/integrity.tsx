/**
 * Piezas de la interfaz de integridad académica: semáforo de riesgo, motivos,
 * línea de tiempo del examen, comparación lado a lado y marca de revisión.
 */
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Badge, Button, ErrorBox, Loading, Textarea } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { RISK_LABEL, duration, sharedSegments, type Reason, type Risk, type Segment } from '@/lib/integrity'
import {
  integrityCompare, quizIntegrityEvents, setIntegrityReview, type IntegrityReview, type ReviewStatus, type TimelineEvent,
} from '@/services/integridad'

const TONE = { none: 'ok', low: 'info', medium: 'late', high: 'alert' } as const

export const REVIEW_LABEL: Record<ReviewStatus, string> = { REVIEWED: 'Revisado', FALSE_POSITIVE: 'Falsa alarma', CONFIRMED: 'Confirmado' }

/** Semáforo compacto. Si el docente ya lo revisó, muestra su decisión. */
export function RiskBadge({ risk, review, className }: { risk: Risk; review?: IntegrityReview; className?: string }) {
  if (review) {
    return <Badge tone={review.status === 'CONFIRMED' ? 'alert' : 'neutral'} className={className}><ShieldCheck className="h-3 w-3" />{REVIEW_LABEL[review.status]}</Badge>
  }
  if (risk.level === 'none') return null
  return (
    <Badge tone={TONE[risk.level]} className={className}>
      {risk.level === 'high' ? <ShieldAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {risk.level === 'low' ? 'Bajo' : risk.level === 'medium' ? 'Medio' : 'Alto'}
    </Badge>
  )
}

export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (!reasons.length) return <p className="flex items-center gap-2 text-sm text-estado-ok"><CheckCircle2 className="h-4 w-4" />No hay alertas.</p>
  return (
    <ul className="space-y-1.5">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {r.tone === 'info'
            ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-texto-suave" />
            : <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', r.tone === 'alert' ? 'text-estado-alerta' : 'text-estado-tarde')} />}
          <span className={r.tone === 'info' ? 'text-texto-suave' : undefined}>{r.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function RiskSummary({ risk, review }: { risk: Risk; review?: IntegrityReview }) {
  return (
    <div className={cn('rounded-xl border p-4', risk.level === 'high' ? 'border-estado-alerta/40 bg-estado-alerta/5' : risk.level === 'medium' ? 'border-estado-tarde/40 bg-estado-tarde/5' : 'border-linea')}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-bold">{RISK_LABEL[risk.level]}</p>
        {risk.score > 0 && <span className="text-sm tabular-nums text-texto-suave">{risk.score}/100</span>}
        <RiskBadge risk={risk} review={review} />
      </div>
      <ReasonList reasons={risk.reasons} />
      <p className="mt-3 text-xs text-texto-suave">Son indicios para revisar, no pruebas. Conversa con el alumno antes de decidir.</p>
    </div>
  )
}

export function ReviewControls({ kind, refId, review, onChanged }: { kind: 'ATTEMPT' | 'SUBMISSION'; refId: number; review: IntegrityReview; onChanged: () => void }) {
  const toast = useToast()
  const [note, setNote] = useState(review?.note ?? '')
  const [busy, setBusy] = useState<ReviewStatus | 'clear' | null>(null)
  async function save(status: ReviewStatus | null) {
    setBusy(status ?? 'clear')
    try {
      await setIntegrityReview(kind, refId, status, note)
      toast(status ? `Marcado como «${REVIEW_LABEL[status]}».` : 'Revisión quitada.')
      onChanged()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-2">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-14 text-sm" placeholder="Nota privada (opcional): qué conversaste con el alumno, qué decidiste…" />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(REVIEW_LABEL) as ReviewStatus[]).map((s) => (
          <Button key={s} size="sm" variant={review?.status === s ? 'primary' : 'secondary'} loading={busy === s} disabled={!!busy} onClick={() => void save(s)}>{REVIEW_LABEL[s]}</Button>
        ))}
        {review && <Button size="sm" variant="ghost" loading={busy === 'clear'} disabled={!!busy} onClick={() => void save(null)}>Quitar</Button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Línea de tiempo del examen
// ---------------------------------------------------------------------------
const EVENT_LABEL: Record<string, string> = {
  LEAVE: 'Salió de la evaluación', PASTE: 'Pegó texto', COPY: 'Intentó copiar', CONTEXT: 'Abrió el menú contextual',
  FS_EXIT: 'Salió de la pantalla completa', RESIZE: 'Achicó la ventana o dividió la pantalla', MULTITAB: 'La evaluación estaba abierta en otra pestaña',
  OFFLINE: 'Se quedó sin conexión', RESUME: 'Volvió a abrir la evaluación', DEVICE: 'Intentó continuar en otro dispositivo', RELEASED: 'El docente liberó el dispositivo',
}

function eventDetail(e: TimelineEvent): string {
  if (e.t === 'LEAVE' && e.v) return ` (${duration(e.v)})`
  if (e.t === 'PASTE' && e.v) return ` (${e.v} caracteres)`
  return ''
}

export function ExamTimeline({ attemptId, questionNumber }: { attemptId: number; questionNumber?: (qid: string) => number | null }) {
  const { data, loading, error, reload } = useAsync(() => quizIntegrityEvents(attemptId), [attemptId], { live: false })
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (!data?.events.length) return <p className="text-sm text-texto-suave">No se registraron eventos durante el intento.</p>
  const start = Date.parse(data.started_at)
  return (
    <ol className="relative space-y-2 border-l-2 border-linea pl-4">
      {data.events.map((e, i) => {
        const at = e.c ?? Date.parse(e.s)
        const offset = Math.max(0, at - start)
        const n = e.q && questionNumber ? questionNumber(e.q) : null
        return (
          <li key={i} className="text-sm">
            <span className="mr-2 font-mono text-xs tabular-nums text-texto-suave">+{Math.floor(offset / 60000)}:{String(Math.floor(offset / 1000) % 60).padStart(2, '0')}</span>
            {EVENT_LABEL[e.t] ?? e.t}{eventDetail(e)}{n ? ` · pregunta ${n}` : ''}
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Comparación lado a lado
// ---------------------------------------------------------------------------
function Marked({ segments }: { segments: Segment[] }) {
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed">
      {segments.map((s, i) => (s.hit ? <mark key={i} className="rounded bg-estado-alerta/20 px-0.5 text-texto">{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </p>
  )
}

export function CompareView({ submissionId, otherId, mineLabel, otherLabel }: { submissionId: number; otherId: number; mineLabel: string; otherLabel: string }) {
  const { data, loading, error, reload } = useAsync(() => integrityCompare(submissionId, otherId), [submissionId, otherId], { live: false })
  if (loading) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (!data?.a) return <p className="text-texto-suave">La entrega no tiene texto.</p>
  if (!data.b) {
    return <p className="text-sm text-texto-suave">La otra entrega es de un alumno que no está a tu cargo. Para verla completa, pide a dirección que la revise.</p>
  }
  const seg = sharedSegments(data.a, data.b, data.instructions ?? '')
  return (
    <div>
      <p className="mb-3 text-sm text-texto-suave">En rojo, los tramos de 5 palabras o más que aparecen en las dos entregas (sin contar lo copiado de las indicaciones).</p>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-linea p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-texto-suave">{mineLabel}</p>
          <Marked segments={seg.a} />
        </section>
        <section className="rounded-xl border border-linea p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-texto-suave">{otherLabel}</p>
          <Marked segments={seg.b} />
        </section>
      </div>
    </div>
  )
}
