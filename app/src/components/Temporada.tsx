import { useEffect, useState, type CSSProperties } from 'react'
import { currentSeason, type Season } from '@/lib/temporadas'

const PARTICULAS = 10

/**
 * Tema de temporada: pone `data-temporada` en <html> (colores) y dibuja la guirnalda y las
 * partículas animadas. El CSS se carga solo los días con temporada. Se revisa al volver a la
 * pestaña y cada 10 minutos, así que cambia solo a medianoche sin recargar.
 */
export function SeasonTheme() {
  const [t, setT] = useState<Season>(() => currentSeason())

  useEffect(() => {
    const revisar = () => setT((prev) => { const n = currentSeason(); return n?.key === prev?.key && n?.label === prev?.label ? prev : n })
    const id = window.setInterval(revisar, 10 * 60_000)
    document.addEventListener('visibilitychange', revisar)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', revisar) }
  }, [])

  const key = t?.key
  useEffect(() => {
    const el = document.documentElement
    if (!key) { el.removeAttribute('data-temporada'); return }
    el.setAttribute('data-temporada', key)
    void import('@/temporadas.css')
    return () => el.removeAttribute('data-temporada')
  }, [key])

  if (!t) return null
  return (
    <div className="temporada-capa" data-mov={t.movimiento} aria-hidden>
      <div className="temporada-guirnalda" />
      {Array.from({ length: PARTICULAS }).map((_, i) => (
        <span
          key={i}
          className={t.particulas.length ? undefined : 'confeti'}
          style={{ '--x': `${(i * 37 + 8) % 96}%`, '--d': `${9 + (i * 3) % 7}s`, '--s': `${-((i * 1.7) % 9)}s`, '--z': `${18 + (i * 5) % 12}px`, '--c': i % 2 ? 'var(--tb)' : 'var(--ta)' } as CSSProperties}
        >{t.particulas.length ? t.particulas[i % t.particulas.length] : ''}</span>
      ))}
    </div>
  )
}
