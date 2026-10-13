import { Link } from 'react-router-dom'
import { AlertTriangle, ClipboardX, UserRoundX } from 'lucide-react'
import { Badge, Panel } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { formatShort } from '@/lib/format'
import { schoolAlerts } from '@/services/gestion'

/** Panel de alertas del colegio: aulas con más entregas faltantes, docentes con calificaciones atrasadas y alumnos en riesgo. */
export function SchoolAlertsPanel() {
  const { data, error } = useAsync(() => schoolAlerts(14), [])
  if (error || !data) return null
  const nothing = !data.classrooms.length && !data.teachers.length && !data.at_risk_total
  if (nothing) return null
  return (
    <Panel
      className="mb-6 border-estado-tarde/40"
      title={<span className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-estado-tarde" />Alertas del colegio</span>}
      action={<Link to="/alertas" className="text-sm font-bold text-tinta-500 hover:underline">Ver alumnos en riesgo</Link>}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><ClipboardX className="h-4 w-4" />Aulas con más entregas faltantes</h3>
          {!data.classrooms.length ? <p className="text-sm text-texto-suave">Sin pendientes en las últimas 2 semanas.</p> : (
            <ul className="space-y-1.5 text-sm">
              {data.classrooms.slice(0, 5).map((c) => (
                <li key={c.classroom_id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.classroom}</span><Badge tone="alert">{c.missing} faltan</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><AlertTriangle className="h-4 w-4" />Calificaciones atrasadas (+7 días)</h3>
          {!data.teachers.length ? <p className="text-sm text-texto-suave">Todos los docentes califican a tiempo.</p> : (
            <ul className="space-y-1.5 text-sm">
              {data.teachers.slice(0, 5).map((t) => (
                <li key={t.teacher_id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{t.teacher}</span>
                  <span className="text-xs text-texto-suave">desde {formatShort(t.oldest)}</span>
                  <Badge tone="late">{t.pending}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold"><UserRoundX className="h-4 w-4" />Alumnos en riesgo</h3>
          <p className="font-display text-4xl font-bold text-estado-alerta">{data.at_risk_total}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {data.at_risk.slice(0, 4).map((a) => (
              <li key={a.student_id} className="flex justify-between gap-2"><Link to={`/libreta/${a.student_id}`} className="truncate hover:underline">{a.first_name} {a.last_name}</Link><span className="text-xs text-texto-suave">{a.classroom}</span></li>
            ))}
          </ul>
        </section>
      </div>
    </Panel>
  )
}
