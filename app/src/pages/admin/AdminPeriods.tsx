import { useState } from 'react'
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import { Badge, Button, Empty, ErrorBox, Input, Loading, PageHeader, Panel } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { limaToday } from '@/lib/format'
import { listPeriods, updatePeriod } from '@/services/notas'
import type { GradingPeriod } from '@/types'

function PeriodRow({ period, onChanged }: { period: GradingPeriod; onChanged: () => void }) {
  const toast = useToast()
  const [startsOn, setStartsOn] = useState(period.starts_on)
  const [endsOn, setEndsOn] = useState(period.ends_on)
  const [busy, setBusy] = useState<string | null>(null)
  const today = limaToday()
  const status = today < period.starts_on ? 'Por empezar' : today > period.ends_on ? 'Terminado' : 'En curso'
  const datesChanged = startsOn !== period.starts_on || endsOn !== period.ends_on

  async function run(label: string, patch: Parameters<typeof updatePeriod>[1], ok: string) {
    setBusy(label)
    try {
      await updatePeriod(period.id, patch)
      toast(ok)
      onChanged()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <li className="grid gap-4 py-5 lg:grid-cols-[12rem_1fr_auto] lg:items-center">
      <div>
        <p className="font-display text-lg font-semibold">{period.name}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone={status === 'En curso' ? 'spark' : 'neutral'}>{status}</Badge>
          {period.is_closed && <Badge><Lock className="h-3 w-3" />Cerrado</Badge>}
          {period.is_published && <Badge tone="ok">Publicado</Badge>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="w-auto" aria-label="Inicio" />
        <span className="text-texto-suave">al</span>
        <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="w-auto" aria-label="Fin" />
        {datesChanged && (
          <Button size="sm" variant="secondary" loading={busy === 'dates'} onClick={() => void run('dates', { starts_on: startsOn, ends_on: endsOn }, 'Fechas actualizadas.')}>
            Guardar fechas
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={busy === 'close'}
          onClick={() => {
            if (!period.is_closed && !confirm(`¿Cerrar el ${period.name}? Los docentes ya no podrán cambiar sus notas.`)) return
            void run('close', { is_closed: !period.is_closed }, period.is_closed ? 'Bimestre reabierto.' : 'Bimestre cerrado.')
          }}
        >
          {period.is_closed ? <><Unlock className="h-4 w-4" />Reabrir</> : <><Lock className="h-4 w-4" />Cerrar notas</>}
        </Button>
        <Button
          size="sm"
          variant={period.is_published ? 'secondary' : 'primary'}
          loading={busy === 'publish'}
          onClick={() => {
            if (!period.is_published && !confirm(`¿Publicar la libreta del ${period.name}? Alumnos y familias verán las notas.`)) return
            void run('publish', { is_published: !period.is_published }, period.is_published ? 'Libreta ocultada a las familias.' : 'Libreta publicada.')
          }}
        >
          {period.is_published ? <><EyeOff className="h-4 w-4" />Ocultar</> : <><Eye className="h-4 w-4" />Publicar libreta</>}
        </Button>
      </div>
    </li>
  )
}

export default function AdminPeriods() {
  const { data, loading, error, reload } = useAsync(listPeriods, [])
  return (
    <>
      <PageHeader title="Bimestres" subtitle="Fechas del año escolar, cierre del registro y publicación de libretas." />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      <Panel>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-texto-suave">
          <li>Los docentes registran sus notas mientras el bimestre está abierto.</li>
          <li><b>Cerrar notas</b> bloquea el registro (dirección aún puede corregir).</li>
          <li><b>Publicar libreta</b> hace visibles las notas y la libreta a alumnos y familias.</li>
        </ol>
        {loading ? <Loading /> : !data?.length ? (
          <Empty title="No hay bimestres" art="calendar">Ejecuta el script 07 o marca un año escolar como actual.</Empty>
        ) : (
          <ul className="divide-y divide-linea">
            {data.map((p) => <PeriodRow key={`${p.id}-${p.starts_on}-${p.ends_on}`} period={p} onChanged={() => void reload(true)} />)}
          </ul>
        )}
      </Panel>
    </>
  )
}
