import { useMemo, useState } from 'react'
import { Download, Maximize2, RotateCw } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button, Empty, ErrorBox, Loading, Modal, PageHeader } from '@/components/ui'
import { avatarEmoji } from '@/components/avatars'
import { pinSvg } from '@/components/shareCard'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { limaToday } from '@/lib/format'
import { shareOrDownload, svgToPng } from '@/lib/svgImage'
import { cn } from '@/lib/utils'
import { carnetCode, classroomLabel, getClassroomTutorName, getStudentCard } from '@/services/campus'
import { getProfile, rankOf } from '@/services/tesla'
import { CARNET_H, CARNET_W, buildCarnetBackSvg, buildCarnetBothSvg, buildCarnetSvg, qrPath } from '@/pages/carnet/carnetSvg'

/** Muestra un SVG del carnet ocupando todo el ancho de su contenedor. */
const fluid = (svg: string) => svg.replace(`width="${CARNET_W}" height="${CARNET_H}"`, 'style="width:100%;height:auto"')

/**
 * Carnet escolar digital. Al frente: escudo, avatar, nombre, aula y un QR con el DNI (o el
 * código del colegio), que no se muestra en texto. Detrás: tutor(a), rango Tesla y los valores.
 * Se da vuelta con un giro en 3D (o al tocarlo); con "menos movimiento" cambia de cara sin girar.
 */
export default function CarnetPage() {
  const { profile, selfStudent, activeChild } = useAuth()
  const student = profile?.role === 'GUARDIAN' ? activeChild : selfStudent
  const toast = useToast()
  const [door, setDoor] = useState(false)
  const [busy, setBusy] = useState(false)
  const [back, setBack] = useState(false)

  const { data, loading, error, reload } = useAsync(async () => {
    if (!student) return null
    const [card, tesla, tutor] = await Promise.all([
      getStudentCard(student.id),
      getProfile(student.id).catch(() => null),
      student.classroom_id ? getClassroomTutorName(student.classroom_id).catch(() => null) : Promise.resolve(null),
    ])
    return card ? { card, tesla, tutor } : null
  }, [student?.id], { live: false })

  const year = Number(limaToday().slice(0, 4))
  const sides = useMemo(() => {
    if (!data || !student) return null
    const classroom = classroomLabel(student.classroom)
    const front = buildCarnetSvg({
      firstName: data.card.first_name ?? '', lastName: data.card.last_name ?? '',
      classroom, year, avatar: avatarEmoji(data.tesla?.avatar?.value), code: carnetCode(data.card),
    })
    const rank = data.tesla ? rankOf(data.tesla.level, data.tesla.pin_levels) : null
    const backSvg = buildCarnetBackSvg({
      tutor: data.tutor, classroom, year, level: data.tesla?.level ?? null, rankName: rank?.fullName ?? null,
      pin: rank ? pinSvg(rank.tier, rank.stars, 650, 262, 1.35, 'carnet') : '',
    })
    return { front, back: backSvg, rank }
  }, [data, student, year])
  const doorQr = useMemo(() => (data ? qrPath(carnetCode(data.card), 300).d : ''), [data])

  async function download() {
    if (!data || !sides) return
    setBusy(true)
    try {
      const both = buildCarnetBothSvg(sides.front, sides.back)
      const blob = await svgToPng(both.svg, both.width, both.height)
      const name = (data.card.first_name ?? 'alumno').toLowerCase().split(' ')[0]
      const how = await shareOrDownload(blob, `carnet-tesla-${name}.png`, 'Carnet escolar')
      if (how === 'downloaded') toast('Carnet descargado (las dos caras).')
    } catch (err) {
      toast(toMessage(err, 'No se pudo crear la imagen del carnet.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const forFamily = profile?.role === 'GUARDIAN'
  const frontLabel = `Frente del carnet de ${data?.card.first_name ?? ''} ${data?.card.last_name ?? ''}, ${student ? classroomLabel(student.classroom) : ''}, con código QR.`
  const backLabel = `Reverso del carnet. Tutor(a): ${data?.tutor ?? 'por asignar'}.${sides?.rank && data?.tesla ? ` Nivel ${data.tesla.level}, ${sides.rank.fullName}.` : ''} Disciplina, Liderazgo y Excelencia. Pasión por educar.`

  return (
    <>
      <PageHeader
        title="Carnet escolar"
        subtitle={forFamily ? `El carnet digital de ${student?.first_name ?? 'su hijo'}.` : 'Tu carnet digital del colegio.'}
      />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading shape="page" /> : !data || !sides ? (
        <Empty title="No encontramos el carnet" art="patio">{forFamily ? 'Comuníquese con secretaría para revisar los datos del alumno.' : 'Avisa en secretaría para revisar tus datos.'}</Empty>
      ) : (
        <div className="mx-auto max-w-xl">
          {/* Tarjeta con dos caras: gira en 3D sobre su eje vertical. */}
          <div className="carnet-escena escudo-in">
            <button
              type="button"
              onClick={() => setBack((b) => !b)}
              className={cn('carnet-giro block w-full rounded-[1.4rem] text-left', back && 'vuelta')}
              aria-label={back ? 'Ver el frente del carnet' : 'Ver el reverso del carnet'}
            >
              <span className="carnet-cara block overflow-hidden rounded-[1.4rem] shadow-xl ring-1 ring-black/10" role="img" aria-label={frontLabel} aria-hidden={back} dangerouslySetInnerHTML={{ __html: fluid(sides.front) }} />
              <span className="carnet-cara carnet-cara-atras block overflow-hidden rounded-[1.4rem] shadow-xl ring-1 ring-black/10" role="img" aria-label={backLabel} aria-hidden={!back} dangerouslySetInnerHTML={{ __html: fluid(sides.back) }} />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-texto-suave">{back ? 'Reverso' : 'Frente'} · toca el carnet para darle la vuelta</p>

          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={() => setBack((b) => !b)} aria-pressed={back}><RotateCw className={cn('h-4 w-4 transition-transform duration-lento', back && 'rotate-180')} />Dar vuelta</Button>
            <Button variant="accion" onClick={() => setDoor(true)}><Maximize2 className="h-4 w-4" />Mostrar en la puerta</Button>
            <Button variant="secondary" loading={busy} onClick={() => void download()}><Download className="h-4 w-4" />Descargar</Button>
          </div>
          <p className="mt-4 text-center text-sm text-texto-suave">
            {forFamily ? 'El QR identifica al alumno en la puerta del colegio. No lo comparta en redes sociales.' : 'El QR te identifica en la puerta del colegio. No lo compartas en redes sociales.'}
          </p>
        </div>
      )}

      {/* Pantalla para la puerta: QR grande sobre blanco, para que el lector lo tome rápido. */}
      <Modal open={door} onClose={() => setDoor(false)} title="Carnet para la puerta">
        <div className="flex flex-col items-center gap-4 rounded-xl bg-white p-6 text-[#102442]">
          <svg viewBox="-16 -16 332 332" className="w-full max-w-[19rem]" role="img" aria-label="Código QR del carnet"><rect x="-16" y="-16" width="332" height="332" fill="#fff" /><path d={doorQr} fill="#0b1220" /></svg>
          <p className="text-center font-display text-xl font-bold">{data?.card.first_name} {data?.card.last_name}</p>
          <p className="lema text-xs text-[#9a6a00]">{student ? classroomLabel(student.classroom) : ''}</p>
          <p className="text-center text-sm text-[#586880]">Sube el brillo de la pantalla si el lector no lo toma.</p>
        </div>
      </Modal>
    </>
  )
}
