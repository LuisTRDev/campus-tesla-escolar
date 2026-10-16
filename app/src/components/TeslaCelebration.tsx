import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { LevelBadge, PIN_TEXT, RankPin, badgeStyleOf } from '@/components/tesla'
import { Cinta } from '@/components/brand'
import { playSound } from '@/lib/teslaSound'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { getProfile, rankOf } from '@/services/tesla'

// ---------------------------------------------------------------------------
// Ceremonia al subir de nivel o ganar una Estrella Tesla. Se muestra una vez
// por nivel: el último nivel celebrado se guarda en este dispositivo.
// ---------------------------------------------------------------------------
const key = (studentId: number) => `tesla-celebrated:${studentId}`

function readCelebrated(studentId: number): number | null {
  try {
    const v = Number(localStorage.getItem(key(studentId)))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function writeCelebrated(studentId: number, level: number) {
  try {
    localStorage.setItem(key(studentId), String(level))
  } catch {
    // Sin almacenamiento (modo privado): solo no se recordará.
  }
}

// Los colores del escudo y del buzo: dorado, rojo, azul y blanco.
const CONFETTI_COLORS = ['#F2B51C', '#D63620', '#ffffff', '#ffd86b', '#5b8fd6', '#F2B51C', '#D63620']

export function TeslaCelebration({ studentId }: { studentId: number }) {
  const navigate = useNavigate()
  const { data } = useAsync(() => getProfile(studentId), [studentId])
  const [show, setShow] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    if (!data) return
    const seen = readCelebrated(studentId)
    // Primera vez en este dispositivo: se guarda sin celebrar (para no festejar niveles viejos).
    if (seen == null) writeCelebrated(studentId, data.level)
    else if (data.level > seen) { setShow({ from: seen, to: data.level }); playSound('levelup') }
  }, [data, studentId])

  const confetti = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.2, dur: 2.4 + Math.random() * 2.2,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], spin: 360 + Math.random() * 900, drift: (Math.random() - 0.5) * 160, round: Math.random() < 0.3,
  })), [])

  if (!show || !data) return null
  const before = rankOf(show.from, data.pin_levels)
  const now = rankOf(show.to, data.pin_levels)
  const newStar = now.tier > before.tier
  // Cada 10 niveles cambia la forma de la insignia de nivel.
  const newBadge = !newStar && Math.floor(show.to / 10) > Math.floor(show.from / 10)

  function close(goToProfile: boolean) {
    writeCelebrated(studentId, show!.to)
    setShow(null)
    if (goToProfile) navigate('/perfil-tesla')
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[#050b18]/90 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
      <div className="celebrate-rays" aria-hidden />
      {confetti.map((c, i) => (
        <span key={i} className={cn('confetti', c.round && 'rounded-full')} aria-hidden
          style={{ left: `${c.left}%`, background: c.color, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s`, '--spin': `${c.spin}deg`, '--drift': `${c.drift}px` } as CSSProperties} />
      ))}
      <div className="relative flex max-w-sm flex-col items-center text-center text-white">
        <div className="relative">
          <span className="celebrate-shock" aria-hidden />
          <div className="celebrate-pin">
            {newStar ? <RankPin tier={now.tier} stars={now.stars} size={168} /> : <LevelBadge level={show.to} size={newBadge ? 150 : 128} />}
          </div>
        </div>
        <div className="celebrate-text mt-6">
          <Cinta tone="oro" className="text-base">
            {newStar ? '¡Nueva Estrella Tesla!' : newBadge ? `¡Nueva insignia: ${badgeStyleOf(show.to).name}!` : '¡Subiste de nivel!'}
          </Cinta>
          <h2 id="celebrate-title" className="mt-1 font-display text-4xl font-bold leading-tight">
            {newStar ? now.name : `Nivel ${show.to}`}
          </h2>
          <p className={cn('mt-1 font-bold', newStar ? 'text-white/80' : PIN_TEXT[now.tier])}>
            {newStar ? `Llegaste al nivel ${show.to}` : now.fullName}
          </p>
          <p className="mt-3 text-white/75">
            {newStar
              ? 'Tu tutor te entregará el pin en el colegio. ¡Lúcelo con orgullo!'
              : now.nextLevel ? `Te faltan ${now.nextLevel - show.to} nivel${now.nextLevel - show.to === 1 ? '' : 'es'} para la siguiente Estrella.` : '¡Tienes la Estrella más alta!'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={() => close(true)}>Ver mi perfil</Button>
            <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => close(false)}>¡Genial!</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
