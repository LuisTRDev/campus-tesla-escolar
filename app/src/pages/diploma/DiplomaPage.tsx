import { useSearchParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { Cinta, Escudo } from '@/components/brand'
import { Button, Empty, ErrorBox, Loading } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { listPeriods } from '@/services/notas'
import { RARITY_LABEL, VALORES, VALOR_DE, getProfile, listAchievements, listEarned, type Valor } from '@/services/tesla'

const PUESTO = ['primer', 'segundo', 'tercer']

const longDate = (iso: string) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))

/**
 * Diploma imprimible (A4 horizontal) con el escudo completo y las cintas de los valores.
 * - Logro:  /diploma?alumno=ID&logro=ID
 * - Cuadro de honor:  /diploma?alumno=ID&valor=DISCIPLINA&puesto=1&periodo=ID
 */
export default function DiplomaPage() {
  const [params] = useSearchParams()
  const studentId = Number(params.get('alumno'))
  const achievementId = Number(params.get('logro')) || null
  const valor = (params.get('valor') as Valor | null) ?? null
  const puesto = Math.max(1, Math.min(3, Number(params.get('puesto')) || 1))
  const periodId = Number(params.get('periodo')) || null

  const { data, loading, error, reload } = useAsync(async () => {
    if (!studentId) return null
    const [profile, catalog, earned, periods] = await Promise.all([
      getProfile(studentId), achievementId ? listAchievements() : Promise.resolve([]),
      achievementId ? listEarned(studentId) : Promise.resolve([]), periodId ? listPeriods() : Promise.resolve([]),
    ])
    const achievement = catalog.find((a) => a.id === achievementId) ?? null
    const earnedAt = earned.find((e) => e.achievement_id === achievementId)?.earned_at ?? null
    return { profile, achievement, earnedAt, period: periods.find((p) => p.id === periodId) ?? null }
  }, [studentId, achievementId, periodId], { live: false })

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading) return <Loading shape="page" />
  if (!data || (achievementId && (!data.achievement || !data.earnedAt)) || (!achievementId && !valor)) {
    return <Empty title="No encontramos este diploma" art="patio">Revisa el enlace o vuelve al Perfil Tesla.</Empty>
  }

  const { profile, achievement, earnedAt, period } = data
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
  const destacado: Valor = achievement ? VALOR_DE[achievement.condition_type] : valor!
  const valorLabel = VALORES.find((v) => v.key === destacado)?.label ?? ''
  const fecha = longDate(earnedAt ?? new Date().toISOString())

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-texto-suave">Se imprime en una hoja A4 horizontal. Activa «Gráficos de fondo» en la ventana de impresión.</p>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" />Imprimir diploma</Button>
      </div>

      <article className="diploma force-light relative mx-auto aspect-[297/210] w-full max-w-[1100px] overflow-hidden bg-white text-[#1b2433] shadow-xl ring-1 ring-linea print:shadow-none print:ring-0">
        {/* Marco doble dorado y la franja del buzo abajo */}
        <div className="absolute inset-[2.2%] rounded-sm border-[6px] border-double border-[#d9a514]" aria-hidden />
        <div className="absolute inset-[3.6%] border border-[#d9a514]/50" aria-hidden />
        <div className="celosia absolute inset-x-0 top-0 h-[16%] opacity-60 [mask-image:linear-gradient(black,transparent)]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-[2.4%] bg-[#D63620]" aria-hidden />
        <div className="absolute inset-x-0 bottom-[2.4%] h-[2.4%] bg-[#F2B51C]" aria-hidden />

        <div className="relative flex h-full flex-col items-center px-[9%] pb-[6%] pt-[5%] text-center">
          <Escudo variant="completo" className="h-[22%] w-auto" />
          <p className="lema mt-[1.2%] text-[clamp(8px,1.2vw,13px)] text-[#102442]">Institución Educativa Privada «Nikola Tesla»</p>
          <p className="font-slab text-[clamp(26px,5.4vw,60px)] font-extrabold uppercase leading-none tracking-[0.12em] text-[#D63620]">Diploma</p>
          <p className="mt-[0.8%] text-[clamp(10px,1.4vw,16px)] text-[#586880]">{achievement ? 'de logro, otorgado a' : 'de honor, otorgado a'}</p>
          <p className="mt-[0.6%] font-display text-[clamp(22px,4vw,46px)] font-bold leading-tight text-[#102442]">{name || 'Alumno'}</p>
          <div className="my-[1%] h-px w-[46%] bg-[#d9a514]" aria-hidden />
          <p className="max-w-[78%] text-[clamp(11px,1.55vw,18px)] leading-relaxed">
            {achievement
              ? <>de {profile.classroom}, por obtener el logro <b>«{achievement.name}»</b> ({RARITY_LABEL[achievement.rarity].toLowerCase()}): {achievement.description.replace(/\.$/, '')}.</>
              : <>de {profile.classroom}, por ocupar el <b>{PUESTO[puesto - 1]} puesto en {valorLabel}</b> del cuadro de honor{period ? <> del <b>{period.name}</b></> : ''}.</>}
          </p>

          <div className="mt-[2%] flex flex-wrap items-center justify-center gap-y-1 text-[clamp(9px,1.2vw,14px)]">
            {VALORES.map((v) => (
              <Cinta key={v.key} tone={v.key === destacado ? 'roja' : 'blanca'} className={cn(v.key !== destacado && 'opacity-70')}>{v.label}</Cinta>
            ))}
          </div>

          <p className="mt-auto text-[clamp(9px,1.2vw,14px)] text-[#586880]">Nuevo Imperial, {fecha}</p>
          <div className="mt-[3%] grid w-[70%] grid-cols-2 gap-[12%] text-[clamp(9px,1.15vw,13px)]">
            <div className="border-t border-[#1b2433] pt-1">La Dirección</div>
            <div className="border-t border-[#1b2433] pt-1">Tutor(a)</div>
          </div>
          <p className="lema mt-[1.4%] text-[clamp(7px,0.9vw,10px)] text-[#9a6a00]">Pasión por educar</p>
        </div>
      </article>
    </>
  )
}
