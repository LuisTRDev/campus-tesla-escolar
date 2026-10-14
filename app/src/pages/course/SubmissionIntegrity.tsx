/**
 * Originalidad de las entregas (script 23): coincidencias con otras entregas
 * del colegio, enlaces repetidos, cómo se escribió el texto e indicios de IA.
 */
import { useMemo, useState } from 'react'
import { GitCompare, ShieldAlert } from 'lucide-react'
import { Button, Modal } from '@/components/ui'
import { CompareView, ReviewControls, RiskSummary } from '@/components/integrity'
import { useAsync } from '@/lib/useAsync'
import { duration, submissionRisk, type Risk } from '@/lib/integrity'
import { submissionIntegrityReport, type SubmissionSignals, type TextMatch } from '@/services/integridad'
import type { Submission } from '@/types'

export type SubmissionIntegrity = { sig: SubmissionSignals; risk: Risk }

/** Reporte de la tarea, con el riesgo de cada entrega. null si falta el script 23. */
export function useSubmissionIntegrity(assignmentId: number, submissions: Submission[] | undefined) {
  const report = useAsync(() => submissionIntegrityReport(assignmentId), [assignmentId])
  const byId = useMemo(() => {
    const m = new Map<number, SubmissionIntegrity>()
    const content = new Map((submissions ?? []).map((s) => [s.id, s.content]))
    for (const sig of report.data ?? []) m.set(sig.submission_id, { sig, risk: submissionRisk(sig, content.get(sig.submission_id) ?? null) })
    return m
  }, [report.data, submissions])
  return { byId, available: report.data != null, reload: report.reload }
}

export function IntegrityBanner({ items }: { items: SubmissionIntegrity[] }) {
  const high = items.filter((x) => x.risk.level === 'high' && !x.sig.review).length
  const medium = items.filter((x) => x.risk.level === 'medium' && !x.sig.review).length
  if (!high && !medium) return null
  return (
    <p className="flex items-center gap-2 rounded-xl border border-estado-alerta/30 bg-estado-alerta/5 px-3 py-2 text-sm font-bold">
      <ShieldAlert className="h-4 w-4 shrink-0 text-estado-alerta" />
      {[high && `${high} entrega${high === 1 ? '' : 's'} con riesgo alto`, medium && `${medium} con riesgo medio`].filter(Boolean).join(' y ')} de copia o uso de IA. Revisa la sección «Originalidad» de cada una.
    </p>
  )
}

export function IntegrityPanel({ item, studentName, onChanged }: { item: SubmissionIntegrity; studentName: string; onChanged: () => void }) {
  const [compare, setCompare] = useState<TextMatch | null>(null)
  const { sig, risk } = item
  const w = sig.writing ?? {}
  const others = sig.matches.map((m) => ({ id: m.submission_id, label: `${m.student_name || 'Otro alumno'} · ${Math.round(m.ratio * 100)} %`, m }))
  return (
    <details className="rounded-xl border border-linea p-3" open={risk.level === 'high' || risk.level === 'medium'}>
      <summary className="cursor-pointer font-display font-bold">Originalidad</summary>
      <div className="mt-3 space-y-4">
        <RiskSummary risk={risk} review={sig.review} />
        {(w.typed || w.pasted) ? (
          <p className="text-sm text-texto-suave">
            Escrito en la app: {w.typed ?? 0} caracteres tecleados, {w.pasted ?? 0} pegados en {w.pastes ?? 0} vez(es)
            {w.active_ms ? `, ${duration(w.active_ms)} escribiendo` : ''}{w.sessions ? ` en ${w.sessions} sesión(es)` : ''}.
          </p>
        ) : null}
        {others.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Button key={o.id} size="sm" variant="secondary" onClick={() => setCompare(o.m)}><GitCompare className="h-4 w-4" />Comparar con {o.label}</Button>
            ))}
          </div>
        )}
        <div>
          <p className="mb-1 text-sm font-bold">Tu revisión</p>
          <ReviewControls kind="SUBMISSION" refId={sig.submission_id} review={sig.review} onChanged={onChanged} />
        </div>
      </div>
      <Modal open={!!compare} onClose={() => setCompare(null)} title="Comparar entregas" wide>
        {compare && <CompareView submissionId={sig.submission_id} otherId={compare.submission_id} mineLabel={studentName} otherLabel={compare.student_name || 'Otra entrega'} />}
      </Modal>
    </details>
  )
}
