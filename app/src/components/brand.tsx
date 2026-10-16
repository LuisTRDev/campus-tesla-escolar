import { useId, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ESCUDO } from '@/components/escudoPaths'

/**
 * Marca del colegio en SVG (antes era un PNG con fondo blanco).
 * La "T" roja y la "N" azul con contorno dorado, como en el escudo y el mural del patio.
 * Los colores son fijos: el escudo se ve igual en modo claro y oscuro.
 */
const { rojo: ROJO, azul: AZUL, oro: ORO, oroOscuro: ORO_OSCURO } = ESCUDO

function TN() {
  return (
    <>
      <path d={ESCUDO.t} fill={ROJO} stroke={ORO} strokeWidth="7" strokeLinejoin="miter" paintOrder="stroke" />
      <path d={ESCUDO.n} fill={AZUL} stroke={ORO} strokeWidth="6" strokeLinejoin="miter" paintOrder="stroke" />
    </>
  )
}

/** Solo las letras "TN": favicon, cargas y espacios muy pequeños. */
export function Monograma({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="-4 -4 108 108" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <TN />
    </svg>
  )
}

const SHIELD = ESCUDO.shield

/**
 * Escudo del colegio.
 * - `simple`: escudo blanco con borde dorado y las letras (menú, cabeceras).
 * - `completo`: con la cinta "IEPr NIKOLA TESLA" y el lema (ingreso, portadas).
 */
export function Escudo({ variant = 'simple', className, title = 'Escudo de la I.E.P. Nikola Tesla' }: { variant?: 'simple' | 'completo'; className?: string; title?: string }) {
  const curva = 'cinta' + useId().replace(/:/g, '')
  if (variant === 'simple') {
    return (
      <svg viewBox="-2 -4 104 120" className={className} role="img" aria-label={title}>
        <path d={SHIELD} fill="#fff" stroke={ORO} strokeWidth="7" strokeLinejoin="round" />
        <g transform="translate(18 21) scale(0.64)"><TN /></g>
      </svg>
    )
  }
  return (
    <svg viewBox="0 -2 140 172" className={className} role="img" aria-label={title}>
      <path d="M16 34Q70 24 124 34V96Q124 146 70 166Q16 146 16 96Z" fill="#fff" stroke={ORO} strokeWidth="7" strokeLinejoin="round" />
      <g transform="translate(38 46) scale(0.64)"><TN /></g>
      <path d="M40 111H100" stroke="#1B2433" strokeWidth="1.4" />
      <text x="70" y="124" textAnchor="middle" fontFamily='"Atkinson Hyperlegible", sans-serif' fontWeight="700" fontSize="8.4" fill="#0E1E57" letterSpacing="0.3">PASIÓN POR EDUCAR</text>
      {/* Cinta superior con puntas dobladas */}
      <path d="M14 26L2 30L8 36L2 44L14 38Z" fill={ORO_OSCURO} />
      <path d="M126 26L138 30L132 36L138 44L126 38Z" fill={ORO_OSCURO} />
      <path d="M14 24Q70 -2 126 24L126 38Q70 12 14 38Z" fill="#fff" stroke={ORO} strokeWidth="3" strokeLinejoin="round" />
      <path id={curva} d="M18 34Q70 8 122 34" fill="none" />
      <text fontFamily='"Roboto Slab Variable", Georgia, serif' fontWeight="800" fontSize="9.5" fill="#3A3A3A" letterSpacing="0.4">
        <textPath href={`#${curva}`} startOffset="50%" textAnchor="middle">IEPr “NIKOLA TESLA”</textPath>
      </text>
    </svg>
  )
}

/**
 * Cinta (pergamino) como las del escudo: "Disciplina", "Liderazgo", "Excelencia".
 * Para títulos de logros, sellos y encabezados especiales; el texto queda en HTML.
 */
export function Cinta({ children, tone = 'blanca', className, style }: { children: ReactNode; tone?: 'blanca' | 'oro' | 'roja'; className?: string; style?: CSSProperties }) {
  return <span className={cn('cinta', `cinta-${tone}`, className)} style={style}>{children}</span>
}

/** Pantalla de carga: la "T" y la "N" se dibujan con su contorno dorado y luego se rellenan. */
export function CargaTesla({ label = 'Cargando…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center gap-4', className)}>
      <svg viewBox="-4 -4 108 108" className="tn-draw tn-latido h-20 w-20" aria-hidden>
        <TN />
      </svg>
      <p className="lema text-[11px] text-texto-suave">{label}</p>
    </div>
  )
}
