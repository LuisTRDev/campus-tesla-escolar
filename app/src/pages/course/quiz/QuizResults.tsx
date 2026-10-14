import { useMemo, useState } from 'react'
import { Unlock, Users } from 'lucide-react'
import { Badge, Button, Loading, Modal, Panel, Segmented } from '@/components/ui'
import { ExamTimeline, ReviewControls, RiskBadge, RiskSummary } from '@/components/integrity'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { attemptRisk, pairLevel, pairText, type Risk } from '@/lib/integrity'
import { listAttempts, quizReview } from '@/services/aprendizaje'
import { studentName } from '@/services/campus'
import { quizIntegrityReport, quizReleaseDevice, type AttemptSignals } from '@/services/integridad'
import type { AssignmentWithCourse } from '@/types'
import { AttemptReviewView } from './AttemptReview'

type StudentRow = { id: number; first_name: string | null; last_name: string | null }

export function QuizResults({ assignment, students }: { assignment: AssignmentWithCourse; students: StudentRow[] }) {
  const toast = useToast()
  const { data, loading, reload } = useAsync(() => listAttempts(assignment.id), [assignment.id])
  const report = useAsync(() => quizIntegrityReport(assignment.id), [assignment.id])
  const [open, setOpen] = useState<number | null>(null)
  const [tab, setTab] = useState<'answers' | 'integrity'>('answers')
  const review = useAsync(() => (open ? quizReview(open) : Promise.resolve(null)), [open], { live: false })

  const names = useMemo(() => new Map(students.map((s) => [s.id, studentName(s)])), [students])
  const nameOf = (id: number) => names.get(id) ?? 'Alumno'
  const pairs = useMemo(() => (report.data?.pairs ?? []).filter((p) => pairLevel(p) !== 'none'), [report.data])
  const signals = useMemo(() => {
    const m = new Map<number, { sig: AttemptSignals; risk: Risk }>()
    for (const sig of report.data?.attempts ?? []) m.set(sig.attempt_id, { sig, risk: attemptRisk(sig, report.data?.pairs ?? [], nameOf) })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.data, names])

  if (loading || !data) return <Loading />
  const byStudent = new Map<number, typeof data>()
  for (const a of data) byStudent.set(a.student_id, [...(byStudent.get(a.student_id) ?? []), a])
  const finished = data.filter((a) => a.finished_at)
  const avg = finished.length ? finished.reduce((s, a) => s + (Number(a.auto_points ?? 0) + Number(a.manual_points ?? 0)) / Number(a.max_points || 1), 0) / finished.length : null
  const high = [...signals.values()].filter((x) => x.risk.level === 'high' && !x.sig.review).length
  const current = open ? signals.get(open) : undefined

  function openAttempt(id: number, initial: 'answers' | 'integrity' = 'answers') {
    setTab(initial)
    setOpen(id)
  }

  async function release(id: number) {
    try {
      await quizReleaseDevice(id)
      toast('Intento liberado: el alumno puede continuar en otro dispositivo.')
      void report.reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <Panel title="Resultados" action={<span className="text-sm text-texto-suave">{byStudent.size}/{students.length} rindieron{avg != null ? ` · promedio ${Math.round(avg * 100)}%` : ''}</span>}>
      {report.data && (high > 0 || pairs.length > 0) && (
        <div className="mb-4 space-y-2 rounded-xl border border-estado-alerta/30 bg-estado-alerta/5 p-3">
          <p className="text-sm font-bold">{high > 0 && `${high} intento${high === 1 ? '' : 's'} con riesgo alto. `}{pairs.length > 0 && `${pairs.length} pareja${pairs.length === 1 ? '' : 's'} con respuestas muy parecidas.`}</p>
          {pairs.map((p) => (
            <div key={`${p.a}-${p.b}`} className="flex flex-wrap items-center gap-2 text-sm">
              <Users className="h-4 w-4 shrink-0 text-estado-alerta" />
              <span className="min-w-0 flex-1">{pairText(p, nameOf(p.a), nameOf(p.b))}</span>
              <Button size="sm" variant="ghost" onClick={() => openAttempt(p.a_attempt)}>Ver {nameOf(p.a).split(' ')[0]}</Button>
              <Button size="sm" variant="ghost" onClick={() => openAttempt(p.b_attempt)}>Ver {nameOf(p.b).split(' ')[0]}</Button>
            </div>
          ))}
        </div>
      )}
      <ul className="divide-y divide-linea">
        {students.map((st) => {
          const list = byStudent.get(st.id) ?? []
          return (
            <li key={st.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="min-w-0 flex-1 truncate font-bold">{studentName(st)}</span>
              {!list.length && <span className="text-sm text-texto-suave">No rindió</span>}
              {list.map((a) => {
                const s = signals.get(a.id)
                return (
                  <button key={a.id} onClick={() => openAttempt(a.id, s && s.risk.level !== 'none' && !s.sig.review ? 'integrity' : 'answers')}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-linea px-2.5 py-1 text-sm hover:border-tinta-500">
                    #{a.attempt_no} {a.finished_at ? `${Math.round((Number(a.auto_points ?? 0) + Number(a.manual_points ?? 0)) * 100) / 100}/${Number(a.max_points)}` : 'en curso'}
                    {a.needs_review && <Badge tone="late">Revisar</Badge>}
                    {s && <RiskBadge risk={s.risk} review={s.sig.review} />}
                  </button>
                )
              })}
            </li>
          )
        })}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={current ? `Intento de ${nameOf(current.sig.student_id)}` : 'Revisión del intento'} wide>
        {current && (
          <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'answers', label: 'Respuestas' }, { value: 'integrity', label: 'Integridad' }]} /></div>
        )}
        {tab === 'integrity' && current && open ? (
          <div className="space-y-5">
            <RiskSummary risk={current.risk} review={current.sig.review} />
            {!current.sig.finished_at && current.sig.device_locked && assignment.quiz_settings?.lock_device && (
              <Button size="sm" variant="secondary" onClick={() => void release(open)}><Unlock className="h-4 w-4" />Liberar para otro dispositivo</Button>
            )}
            <section>
              <h3 className="mb-2 font-display font-bold">Qué pasó durante el intento</h3>
              <ExamTimeline attemptId={open} questionNumber={(qid) => {
                const idx = review.data?.questions.findIndex((q) => String(q.id) === qid) ?? -1
                return idx >= 0 ? idx + 1 : null
              }} />
            </section>
            <section>
              <h3 className="mb-2 font-display font-bold">Tu revisión</h3>
              <ReviewControls kind="ATTEMPT" refId={open} review={current.sig.review} onChanged={() => void report.reload(true)} />
            </section>
          </div>
        ) : review.loading || !review.data ? <Loading /> : (
          <AttemptReviewView review={review.data} gradeOpen onGraded={() => { setOpen(null); void reload(true); void report.reload(true) }} />
        )}
      </Modal>
    </Panel>
  )
}
