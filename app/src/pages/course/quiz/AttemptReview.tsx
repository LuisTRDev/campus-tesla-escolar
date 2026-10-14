import { useState } from 'react'
import { CheckCircle2, Clock, Save, XCircle } from 'lucide-react'
import { Badge, Button, Input } from '@/components/ui'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { quizGradeOpen, type AttemptReview } from '@/services/aprendizaje'
import { describeAnswer } from './QuestionInput'

export function AttemptReviewView({ review, gradeOpen, onGraded }: { review: AttemptReview; gradeOpen?: boolean; onGraded?: () => void }) {
  const toast = useToast()
  const [points, setPoints] = useState<Record<string, number>>(() => Object.fromEntries(review.questions.filter((q) => q.type === 'OPEN').map((q) => [q.id, review.results[q.id] ?? 0])))
  const [busy, setBusy] = useState(false)
  const total = Number(review.auto_points ?? 0) + Number(review.manual_points ?? 0)
  // Sin corrección por pregunta: la evaluación sigue abierta para el alumno.
  const hidden = !review.show_answers && !Object.keys(review.results ?? {}).length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-papel p-4">
        <span className="font-display text-4xl font-bold">{Math.round(total * 100) / 100}</span>
        <span className="text-texto-suave">de {Number(review.max_points ?? 0)} puntos</span>
        {review.needs_review && <Badge tone="late">Falta revisar preguntas de desarrollo</Badge>}
      </div>
      {hidden && <p className="rounded-lg border border-linea px-3 py-2 text-sm text-texto-suave">{review.answers_later ? 'Verás qué acertaste y las respuestas correctas cuando cierre la evaluación (o cuando ya no te queden intentos).' : 'Tu docente eligió no mostrar las respuestas correctas.'}</p>}
      <ol className="space-y-3">
        {review.questions.map((q, i) => {
          const pts = review.results[q.id]
          const ok = pts != null && pts >= Number(q.points)
          const partial = pts != null && pts > 0 && !ok
          const key = review.keys?.[q.id]
          return (
            <li key={q.id} className={cn('rounded-xl border p-4', pts == null ? 'border-linea' : ok ? 'border-estado-ok/40 bg-estado-ok/5' : partial ? 'border-estado-tarde/40 bg-estado-tarde/5' : 'border-estado-alerta/30 bg-estado-alerta/5')}>
              <div className="flex items-start gap-2">
                {hidden ? <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold text-texto-suave">{i + 1}</span> : pts == null ? <Clock className="mt-0.5 h-5 w-5 shrink-0 text-texto-suave" /> : ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-estado-ok" /> : <XCircle className={cn('mt-0.5 h-5 w-5 shrink-0', partial ? 'text-estado-tarde' : 'text-estado-alerta')} />}
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
                  !hidden && <span className="shrink-0 text-sm font-bold tabular-nums">{pts == null ? '—' : pts}/{Number(q.points)}</span>
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
