import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Award } from 'lucide-react'
import { Cinta } from '@/components/brand'
import { TeslaAvatar } from '@/components/tesla'
import { ErrorBox, Loading } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { currentPeriod, listPeriods } from '@/services/notas'
import { VALORES, listHonorRoll } from '@/services/tesla'

const PLACE_MEDAL = ['medal-GOLD', 'medal-SILVER', 'medal-BRONZE']

/**
 * Cuadro de honor del bimestre: como la formación del lunes, pero digital.
 * Los tres alumnos con más logros de cada valor del escudo, con enlace a su diploma.
 */
export function CuadroHonor({ classroomId }: { classroomId: number }) {
  const { data, loading, error, reload } = useAsync(async () => {
    const period = currentPeriod(await listPeriods())
    return { period, roll: await listHonorRoll(classroomId, period) }
  }, [classroomId])

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="cards" rows={3} />
  const empty = VALORES.every((v) => data.roll[v.key].length === 0)

  return (
    <section className="relative overflow-hidden rounded-2xl border border-linea bg-superficie">
      <header className="relative overflow-hidden bg-[#102442] px-5 pb-5 pt-4 text-white">
        <span className="celosia pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <span className="franja-h absolute inset-x-0 bottom-0 h-[5px]" aria-hidden />
        <p className="lema relative text-[11px] text-chispa">{data.period?.name ?? 'Este año'}</p>
        <h2 className="relative font-display text-2xl font-bold">Cuadro de honor</h2>
      </header>
      {empty ? (
        <p className="px-5 py-6 text-sm text-texto-suave">Todavía nadie gana logros este bimestre. ¡El primer lugar está libre!</p>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          {VALORES.map((v, vi) => (
            <div key={v.key} className="rounded-xl border border-linea p-3 text-center">
              <Cinta tone={vi === 1 ? 'roja' : vi === 2 ? 'oro' : 'blanca'} className="text-xs">{v.label}</Cinta>
              {data.roll[v.key].length === 0 ? (
                <p className="mt-3 text-xs text-texto-suave">Sin logros aún.</p>
              ) : (
                <ol className="mt-3 space-y-2 text-left">
                  {data.roll[v.key].map((e, i) => (
                    <li key={e.student.student_id} className="cinta-in flex items-center gap-2.5" style={{ '--i': i } as CSSProperties}>
                      <span className={cn('forma-escudo flex h-8 w-7 shrink-0 items-center justify-center font-slab text-sm font-extrabold text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.45)]', PLACE_MEDAL[e.place - 1] ?? 'medal-BRONZE')} aria-label={`Puesto ${e.place}`}>{e.place}</span>
                      <TeslaAvatar emoji={e.student.avatar} frame={e.student.frame} size={30} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold" title={`${e.student.first_name ?? ''} ${e.student.last_name ?? ''}`}>{e.student.first_name?.split(' ')[0]} {e.student.last_name ? `${e.student.last_name[0]}.` : ''}</span>
                        <span className="cifras text-xs text-texto-suave">{e.count} logro{e.count === 1 ? '' : 's'}</span>
                      </span>
                      <Link
                        to={`/diploma?alumno=${e.student.student_id}&valor=${v.key}&puesto=${e.place}${data.period ? `&periodo=${data.period.id}` : ''}`}
                        className="rounded-md p-1.5 text-texto-suave hover:bg-papel hover:text-tinta"
                        title="Ver diploma" aria-label={`Diploma de ${e.student.first_name ?? 'alumno'}`}
                      >
                        <Award className="h-4 w-4" />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
