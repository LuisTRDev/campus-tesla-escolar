import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CalendarX, Clock, MessageCircle, NotebookPen, TrendingDown } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Empty, ErrorBox, Loading, Modal, PageHeader, Panel, Segmented, Select } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { classroomLabel, listClassrooms, listTeacherOfferings } from '@/services/campus'
import { startConversation } from '@/services/mensajes'
import { earlyAlerts, myPermissions, type CampusPermission, type EarlyAlert } from '@/services/gestion'
import type { Classroom } from '@/types'
import { ObservationsPanel } from '@/components/Observations'

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
function Metric({ icon, value, label, tone }: { icon: ReactNode; value: number; label: string; tone: string }) {
  if (!value) return null
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', tone)} title={label}>{icon}{value} {label}</span>
}

export default function AlertsPage() {
  const { profile, isAdmin, tutorClassrooms } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const isStaff = isAdmin || profile?.role === 'AUXILIARY'
  const { data: perms } = useAsync(() => (profile ? myPermissions(profile.id).catch(() => [] as CampusPermission[]) : Promise.resolve([] as CampusPermission[])), [profile?.id], { live: false })
  const watcher = isStaff || !!perms?.some((p) => p === 'COORDINADOR' || p === 'PSICOLOGIA')
  const canPsych = isAdmin || !!perms?.includes('PSICOLOGIA')

  const { data: rooms } = useAsync(async (): Promise<Classroom[]> => {
    if (watcher) return listClassrooms()
    const offerings = profile ? await listTeacherOfferings(profile.id) : []
    const map = new Map<number, Classroom>()
    for (const c of tutorClassrooms) map.set(c.id, c)
    for (const o of offerings) map.set(o.classroom_id, o.classroom)
    return [...map.values()]
  }, [watcher, profile?.id, tutorClassrooms], { live: false })

  const [classroomId, setClassroomId] = useState<number | 'all' | null>(null)
  const [days, setDays] = useState<'14' | '30' | '60'>('30')
  const effective = classroomId ?? (watcher ? 'all' : tutorClassrooms[0]?.id ?? rooms?.[0]?.id ?? null)
  const { data, loading, error, reload } = useAsync(
    () => (effective == null ? Promise.resolve([] as EarlyAlert[]) : earlyAlerts(effective === 'all' ? null : effective, Number(days))),
    [effective, days],
  )
  const [obs, setObs] = useState<EarlyAlert | null>(null)

  async function writeFamily(a: EarlyAlert) {
    try {
      const id = await startConversation(a.student_id, profile!.id)
      navigate(`/mensajes/${id}`)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <>
      <PageHeader title="Alertas tempranas" subtitle="Alumnos que juntan tareas vencidas, faltas, tardanzas o notas bajas. Actúa a tiempo." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select value={effective ?? ''} onChange={(e) => setClassroomId(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="w-auto min-w-56" aria-label="Aula">
          {watcher && <option value="all">Todo el colegio</option>}
          {(rooms ?? []).map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
        </Select>
        <Segmented value={days} onChange={setDays} options={[{ value: '14', label: '2 semanas' }, { value: '30', label: '30 días' }, { value: '60', label: '60 días' }]} />
      </div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading shape="cards" /> : !data?.length ? (
        <Empty title="Sin alertas" art="grades">Nadie supera el umbral de riesgo en este periodo. 🎉</Empty>
      ) : (
        <Panel bodyClassName="p-0">
          <ul className="divide-y divide-linea">
            {data.map((a) => (
              <li key={a.student_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display font-bold',
                  a.risk >= 12 ? 'bg-estado-alerta text-white' : a.risk >= 8 ? 'bg-estado-tarde text-white' : 'bg-chispa-100 text-tinta')} title="Puntaje de riesgo">
                  {a.risk}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/libreta/${a.student_id}`} className="font-bold hover:underline">{a.first_name} {a.last_name}</Link>
                  {effective === 'all' && <p className="text-xs text-texto-suave">{a.classroom}</p>}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Metric icon={<AlertTriangle className="h-3 w-3" />} value={a.overdue} label="tareas vencidas" tone="bg-estado-alerta/10 text-estado-alerta" />
                    <Metric icon={<CalendarX className="h-3 w-3" />} value={a.absent_days} label="faltas" tone="bg-estado-alerta/10 text-estado-alerta" />
                    <Metric icon={<Clock className="h-3 w-3" />} value={a.late_days} label="tardanzas" tone="bg-estado-tarde/10 text-estado-tarde" />
                    <Metric icon={<TrendingDown className="h-3 w-3" />} value={a.low_grades} label="notas B/C" tone="bg-estado-info/10 text-estado-info" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setObs(a)}><NotebookPen className="h-4 w-4" />Observaciones</Button>
                  {profile?.role === 'TEACHER' || isAdmin ? <Button size="sm" onClick={() => void writeFamily(a)}><MessageCircle className="h-4 w-4" />Escribir a la familia</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <p className="mt-3 text-xs text-texto-suave">Puntaje = tareas vencidas × 2 + faltas × 2 + notas B/C × 2 + tardanzas. Aparecen desde 4 puntos.</p>
      <Modal open={!!obs} onClose={() => setObs(null)} title={`Observaciones de ${obs?.first_name ?? ''}`} wide>
        {obs && <ObservationsPanel studentId={obs.student_id} name={obs.first_name ?? undefined} canPsych={canPsych} />}
      </Modal>
    </>
  )
}
