import type { ReactNode } from 'react'

/**
 * Iconos propios de las secciones principales, con el mismo trazo que Lucide (24 px, 2 de grosor).
 * Las partes `ti-fill` (rojo) y `ti-acc` (dorado) se rellenan solo cuando el enlace está
 * activo (`aria-current="page"` o la clase `ti-on`); las reglas están en src/index.css.
 */
function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  )
}

type P = { className?: string }

/** Inicio: el escudo con la "T". */
export function IcoEscudo({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M12 2.8l7.5 2.6V11c0 4.6-3.1 7.8-7.5 10.2C7.6 18.8 4.5 15.6 4.5 11V5.4z" />
      <path className="ti-fill" strokeWidth="1.6" d="M8.4 7.6h7.2v2.6h-2.3v6.2h-2.6v-6.2H8.4z" />
    </Svg>
  )
}

/** Cursos: cuaderno forrado con lomo y etiqueta. */
export function IcoCuaderno({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="2.8" width="15" height="18.4" rx="2" />
      <path className="ti-fill" d="M4.5 4.8a2 2 0 0 1 2-2H9v18.4H6.5a2 2 0 0 1-2-2z" />
      <rect className="ti-acc" x="11.5" y="6.5" width="5.5" height="3.6" rx="0.8" strokeWidth="1.6" />
    </Svg>
  )
}

/** Tareas: tablero con pinza dorada y check. */
export function IcoTareas({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="4" width="15" height="17.2" rx="2" />
      <rect className="ti-acc" x="8.5" y="2.2" width="7" height="4" rx="1.2" strokeWidth="1.7" />
      <path d="m8.6 13.4 2.4 2.4 4.6-4.8" />
    </Svg>
  )
}

/** Notas: hoja calificada con sello. */
export function IcoNotas({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M16.5 10V4.8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2H11" />
      <path d="M7.8 7.5h5.4M7.8 11.2h3.4" />
      <circle className="ti-fill" cx="16.3" cy="16.3" r="4.6" />
      <path d="m14.6 16.4 1.2 1.2 2.2-2.4" strokeWidth="1.7" />
    </Svg>
  )
}

/** Libreta: cuadernillo con marcapáginas rojo. */
export function IcoLibreta({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M5 5.2a2.4 2.4 0 0 1 2.4-2.4H19v15.4H7.4A2.4 2.4 0 0 0 5 20.6z" />
      <path d="M5 20.6a2.4 2.4 0 0 0 2.4 0.6H19" />
      <path className="ti-fill" strokeWidth="1.7" d="M12.5 2.8v7.4l2.2-1.6 2.2 1.6V2.8" />
    </Svg>
  )
}

/** Comunicados: sobre lacrado (el lacre es rojo cuando está activo). */
export function IcoCircular({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="2.8" y="5.2" width="18.4" height="14" rx="2" />
      <path d="m3.4 6.6 8.6 6.4 8.6-6.4" />
      <circle className="ti-fill" cx="12" cy="14.6" r="2.7" strokeWidth="1.7" />
    </Svg>
  )
}

/** Anuncios: megáfono del patio. */
export function IcoMegafono({ className }: P) {
  return (
    <Svg className={className}>
      <path className="ti-fill" d="M13.5 5v14L8 15.2H5.2a1.4 1.4 0 0 1-1.4-1.4v-3.6a1.4 1.4 0 0 1 1.4-1.4H8z" />
      <path d="M8 15.2l1.2 4.6" />
      <path d="M16.8 9.4a3.8 3.8 0 0 1 0 5.2M19.4 6.8a7.6 7.6 0 0 1 0 10.4" />
    </Svg>
  )
}

/** Horario: la campana del colegio. */
export function IcoCampana({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="10.4" y="2.2" width="3.2" height="4.2" rx="1.2" />
      <path className="ti-acc" d="M5.6 16.6c0-5.6 2.6-10.2 6.4-10.2s6.4 4.6 6.4 10.2z" />
      <path d="M4.2 16.6h15.6" />
      <circle cx="12" cy="19.6" r="1.6" />
    </Svg>
  )
}

/** Agenda: calendario con cabecera roja y el día marcado en dorado. */
export function IcoAgenda({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3.2" y="4.6" width="17.6" height="16.4" rx="2" />
      <path className="ti-fill" d="M3.2 6.6a2 2 0 0 1 2-2h13.6a2 2 0 0 1 2 2v3.2H3.2z" />
      <path d="M8 2.6v4M16 2.6v4" />
      <circle className="ti-acc" cx="15.4" cy="15.4" r="2" strokeWidth="1.7" />
    </Svg>
  )
}

/** Perfil Tesla: el rayo. */
export function IcoRayo({ className }: P) {
  return (
    <Svg className={className}>
      <path className="ti-acc" d="M13.4 2.4 4.8 13.6h6.4l-1 8 8.6-11.2h-6.4z" />
    </Svg>
  )
}

/** Mensajes: globo de conversación con tres puntos dorados. */
export function IcoMensajes({ className }: P) {
  return (
    <Svg className={className}>
      <path className="ti-fill" d="M20.5 11.6c0 4.4-3.8 7.9-8.5 7.9-1.3 0-2.6-.3-3.7-.8L3.5 20l1.4-3.9c-.9-1.3-1.4-2.8-1.4-4.5C3.5 7.2 7.3 3.7 12 3.7s8.5 3.5 8.5 7.9z" />
      <circle className="ti-acc" cx="8.3" cy="11.6" r="1.1" strokeWidth="1.4" />
      <circle className="ti-acc" cx="12" cy="11.6" r="1.1" strokeWidth="1.4" />
      <circle className="ti-acc" cx="15.7" cy="11.6" r="1.1" strokeWidth="1.4" />
    </Svg>
  )
}

/** Citas: calendario con reloj dorado. */
export function IcoCitas({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M20 10.5V6.6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h5.5" />
      <path d="M7.5 2.6v4M15.5 2.6v4M3 9.6h8" />
      <circle className="ti-acc" cx="17" cy="17" r="4.6" />
      <path d="M17 15v2.2l1.4 1" strokeWidth="1.7" />
    </Svg>
  )
}

/** Justificaciones: hoja con sello rojo. */
export function IcoJustificacion({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M14 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.8z" />
      <path d="M14 2.8v5h5M8.5 11.5h7M8.5 14.5h3" />
      <circle className="ti-fill" cx="14.6" cy="17" r="2.4" strokeWidth="1.6" />
    </Svg>
  )
}

/** Grupos: tres alumnos en formación; el del centro, de rojo. */
export function IcoGrupos({ className }: P) {
  return (
    <Svg className={className}>
      <circle cx="5.6" cy="8.6" r="2.2" />
      <circle cx="18.4" cy="8.6" r="2.2" />
      <circle className="ti-fill" cx="12" cy="6.6" r="2.6" />
      <path d="M2.4 19.2c0-2.4 1.4-4.3 3.2-4.3M21.6 19.2c0-2.4-1.4-4.3-3.2-4.3" />
      <path className="ti-acc" d="M7.6 20c0-3.3 2-5.6 4.4-5.6s4.4 2.3 4.4 5.6z" />
    </Svg>
  )
}

/** Encuestas: ánfora con la cédula dorada entrando. */
export function IcoEncuestas({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M3.5 13.5h17v6.2a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3z" />
      <path d="M8 13.5h8" />
      <rect className="ti-acc" x="8.4" y="3" width="7.2" height="9" rx="1" transform="rotate(8 12 7.5)" strokeWidth="1.7" />
      <path className="ti-fill" d="M3.5 13.5h17v2.6h-17z" strokeWidth="0" />
    </Svg>
  )
}

/** Recursos: libros en el estante. */
export function IcoRecursos({ className }: P) {
  return (
    <Svg className={className}>
      <rect className="ti-fill" x="3.5" y="4" width="4.2" height="16" rx="1" />
      <rect x="9.2" y="6.5" width="4.2" height="13.5" rx="1" />
      <rect className="ti-acc" x="14.8" y="5.6" width="4.2" height="14.6" rx="1" transform="rotate(-12 16.9 12.9)" />
      <path d="M2.5 21h19" />
    </Svg>
  )
}

/** Tienda y recompensas: regalo con cinta roja y moño dorado. */
export function IcoTienda({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="8" width="17" height="4.2" rx="1" />
      <path d="M5 12.2v7.3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7.3" />
      <path className="ti-fill" d="M10.6 8h2.8v13h-2.8z" strokeWidth="1.5" />
      <path className="ti-acc" d="M12 8c-1.2-3.4-5.2-4.4-5.2-1.8C6.8 7.6 9 8 12 8zm0 0c1.2-3.4 5.2-4.4 5.2-1.8 0 1.4-2.2 1.8-5.2 1.8z" strokeWidth="1.6" />
    </Svg>
  )
}

/** Alertas: señal de atención dorada. */
export function IcoAlertas({ className }: P) {
  return (
    <Svg className={className}>
      <path className="ti-acc" d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.2v4.4" />
      <circle cx="12" cy="16.9" r="0.6" fill="currentColor" />
    </Svg>
  )
}

/** Consolidado: tabla con la fila de títulos en rojo. */
export function IcoConsolidado({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3" y="3.5" width="18" height="17" rx="2" />
      <path className="ti-fill" d="M3 5.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3.3H3z" />
      <path d="M3 14.4h18M9 8.8v11.7M15 8.8v11.7" />
    </Svg>
  )
}

/** Planificador: lista con el primer pendiente marcado en dorado. */
export function IcoPlanificador({ className }: P) {
  return (
    <Svg className={className}>
      <rect className="ti-acc" x="3" y="4" width="5" height="5" rx="1.2" />
      <path d="m4.3 6.5 1 1 1.6-1.8" strokeWidth="1.5" />
      <rect x="3" y="14" width="5" height="5" rx="1.2" />
      <path d="M11 6.5h10M11 16.5h10" />
    </Svg>
  )
}

/** Panel de dirección: barras, la más alta en rojo. */
export function IcoPanel({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M3 21h18" />
      <rect x="4.5" y="12" width="3.6" height="9" rx="0.8" />
      <rect className="ti-fill" x="10.2" y="4" width="3.6" height="17" rx="0.8" />
      <rect className="ti-acc" x="15.9" y="8.5" width="3.6" height="12.5" rx="0.8" />
    </Svg>
  )
}

/** Cuentas: carnet escolar con la foto en rojo. */
export function IcoCarnet({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="2.6" y="5" width="18.8" height="14" rx="2" />
      <rect className="ti-fill" x="5.5" y="8.2" width="5" height="6" rx="1" strokeWidth="1.6" />
      <path d="M13.5 9.5h5M13.5 12.5h3.5" />
      <path className="ti-acc" d="M2.6 16.2h18.8V17a2 2 0 0 1-2 2H4.6a2 2 0 0 1-2-2z" strokeWidth="0" />
    </Svg>
  )
}

/** Cursos por aula: cuatro cuadernos, uno forrado de rojo. */
export function IcoAulas({ className }: P) {
  return (
    <Svg className={className}>
      <rect className="ti-fill" x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect className="ti-acc" x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </Svg>
  )
}

/** Bimestres: calendario dividido en cuatro, el actual en dorado. */
export function IcoBimestres({ className }: P) {
  return (
    <Svg className={className}>
      <rect x="3" y="4.6" width="18" height="16.4" rx="2" />
      <path d="M8 2.6v4M16 2.6v4M3 9.8h18" />
      <rect className="ti-acc" x="6" y="12.6" width="5" height="5.4" rx="0.8" strokeWidth="1.6" />
      <path d="M13.5 15.3h4.5" />
    </Svg>
  )
}

/** Ajustes: engranaje con el centro dorado. */
export function IcoAjustes({ className }: P) {
  return (
    <Svg className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle className="ti-acc" cx="12" cy="12" r="3" />
    </Svg>
  )
}

/** Sistema: el escudo dorado con el visto bueno. */
export function IcoSistema({ className }: P) {
  return (
    <Svg className={className}>
      <path className="ti-acc" d="M12 2.8l7.5 2.6V11c0 4.6-3.1 7.8-7.5 10.2C7.6 18.8 4.5 15.6 4.5 11V5.4z" />
      <path className="ti-fill" d="m8.8 11.8 2.2 2.2 4.2-4.4" strokeWidth="2.2" />
    </Svg>
  )
}

/** Anti-trampa: el escudo con un ojo vigilante. */
export function IcoAntitrampa({ className }: P) {
  return (
    <Svg className={className}>
      <path className="ti-fill" d="M12 2.8l7.5 2.6V11c0 4.6-3.1 7.8-7.5 10.2C7.6 18.8 4.5 15.6 4.5 11V5.4z" />
      <path d="M7.6 11.6s1.7-3 4.4-3 4.4 3 4.4 3-1.7 3-4.4 3-4.4-3-4.4-3z" strokeWidth="1.7" />
      <circle className="ti-acc" cx="12" cy="11.6" r="1.4" strokeWidth="1.5" />
    </Svg>
  )
}
