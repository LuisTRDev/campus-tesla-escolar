import { useState } from 'react'
import { NotebookPen, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Loading, Select, Textarea } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { OBSERVATION_LABEL, addObservation, deleteObservation, listObservations, type ObservationKind } from '@/services/gestion'

// ---------------------------------------------------------------------------
// Observaciones privadas de un alumno (también se usa desde la libreta)
// ---------------------------------------------------------------------------
export function ObservationsPanel({ studentId, name, canPsych }: { studentId: number; name?: string; canPsych?: boolean }) {
  const toast = useToast()
  const { profile } = useAuth()
  const { data, loading, reload } = useAsync(() => listObservations(studentId), [studentId])
  const [kind, setKind] = useState<ObservationKind>('ACADEMICO')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const kinds = (Object.keys(OBSERVATION_LABEL) as ObservationKind[]).filter((k) => k !== 'PSICOLOGICA' || canPsych)
  return (
    <div className="space-y-4">
      <p className="text-sm text-texto-suave">Solo las ve el personal del colegio y los docentes de {name ?? 'el alumno'}. Nunca las ve la familia.</p>
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try { await addObservation(studentId, kind, body); setBody(''); toast('Observación guardada.'); void reload(true) } catch (err) { toast(toMessage(err), 'error') } finally { setBusy(false) }
      }}>
        <div className="flex flex-wrap gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as ObservationKind)} className="w-auto" aria-label="Tipo">
            {kinds.map((k) => <option key={k} value={k}>{OBSERVATION_LABEL[k]}</option>)}
          </Select>
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} className="min-h-20" placeholder="Ej.: Conversé con la mamá; está atravesando una mudanza." />
        <div className="flex justify-end"><Button type="submit" size="sm" loading={busy} disabled={body.trim().length < 3}><NotebookPen className="h-4 w-4" />Guardar observación</Button></div>
      </form>
      {loading ? <Loading rows={2} /> : !data?.length ? <p className="text-sm text-texto-suave">Sin observaciones todavía.</p> : (
        <ul className="space-y-2">
          {data.map((o) => (
            <li key={o.id} className={cn('rounded-xl border p-3', o.kind === 'PSICOLOGICA' ? 'border-[#a78bfa]/50 bg-[#a78bfa]/5' : 'border-linea')}>
              <div className="flex items-center gap-2 text-xs">
                <Badge tone={o.kind === 'LOGRO' ? 'ok' : o.kind === 'CONDUCTA' ? 'alert' : 'neutral'}>{OBSERVATION_LABEL[o.kind]}</Badge>
                <span className="text-texto-suave">{formatShort(o.created_at)}</span>
                {o.author_id === profile?.id && (
                  <button className="ml-auto text-texto-suave hover:text-estado-alerta" aria-label="Borrar"
                    onClick={async () => { if (confirm('¿Borrar esta observación?')) { await deleteObservation(o.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) } }}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{o.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

