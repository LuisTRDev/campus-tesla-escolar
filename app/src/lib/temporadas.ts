// Calendario de temporadas del colegio: decide, solo con la fecha (hora de Lima), qué tema
// lleva el campus. Los colores y las animaciones viven en src/temporadas.css, que se carga
// únicamente los días en que hay una temporada activa.

export type Movimiento = 'caer' | 'subir' | 'flotar'

export type Temporada = {
  key: string
  label: string
  emoji: string
  /** Emojis que decoran la pantalla; vacío = confeti de los colores de la temporada. */
  particulas: string[]
  movimiento: Movimiento
}

export type Season = Temporada | null

type Fecha = { y: number; m: number; d: number; md: number }

type Def = Temporada & { cuando: (f: Fecha) => boolean }

const rango = (desde: number, hasta: number) => (f: Fecha) => f.md >= desde && f.md <= hasta
const dia = (md: number) => (f: Fecha) => f.md === md

/** Día del mes del n-ésimo domingo (1 = primer domingo). */
function nthSunday(y: number, month: number, n: number) {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay()
  return 1 + ((7 - first) % 7) + (n - 1) * 7
}

/** Domingo de Pascua (algoritmo de Gauss-Meeus para el calendario gregoriano). */
export function pascua(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, g = Math.floor((8 * b + 13) / 25)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dd = ((h + l - 7 * m + 114) % 31) + 1
  return { m: mes, d: dd }
}

/** Semana Santa: del Domingo de Ramos al Domingo de Pascua. */
function semanaSanta(f: Fecha) {
  const p = pascua(f.y)
  const hoy = Date.UTC(f.y, f.m - 1, f.d)
  const fin = Date.UTC(f.y, p.m - 1, p.d)
  return hoy <= fin && hoy >= fin - 7 * 86_400_000
}

/**
 * Orden = prioridad: gana la primera que coincide. Las fechas puntuales van antes que los
 * periodos largos (el Día del Maestro, por ejemplo, cae dentro de la semana de Fiestas Patrias).
 */
const TEMPORADAS: Def[] = [
  { key: 'halloween', label: '¡Feliz Halloween!', emoji: '🎃', particulas: ['🦇', '🎃', '👻', '🕸️'], movimiento: 'flotar', cuando: rango(1024, 1031) },
  { key: 'santos', label: 'Día de Todos los Santos', emoji: '🕯️', particulas: ['🌼', '🕯️'], movimiento: 'flotar', cuando: rango(1101, 1102) },
  { key: 'navidad', label: '¡Feliz Navidad!', emoji: '🎄', particulas: ['❄️', '❄️', '⭐', '🎄'], movimiento: 'caer', cuando: rango(1201, 1226) },
  { key: 'anio', label: '¡Feliz Año Nuevo!', emoji: '🎆', particulas: [], movimiento: 'caer', cuando: (f) => f.md >= 1227 || f.md <= 103 },
  { key: 'amor', label: 'Día del Amor y la Amistad', emoji: '💗', particulas: ['💗', '💕', '💖'], movimiento: 'subir', cuando: rango(210, 214) },
  { key: 'inicio', label: '¡Bienvenidos al nuevo año escolar!', emoji: '🎒', particulas: ['🎒', '✏️', '📚'], movimiento: 'flotar', cuando: rango(301, 315) },
  { key: 'semanasanta', label: 'Semana Santa', emoji: '🕊️', particulas: ['🕊️'], movimiento: 'flotar', cuando: semanaSanta },
  { key: 'madre', label: '¡Feliz Día de la Madre!', emoji: '💐', particulas: ['🌸', '💐', '🌷'], movimiento: 'caer', cuando: (f) => { const s = nthSunday(f.y, 5, 2); return f.m === 5 && f.d >= s - 3 && f.d <= s } },
  { key: 'padre', label: '¡Feliz Día del Padre!', emoji: '👔', particulas: ['⭐', '👔', '🏆'], movimiento: 'flotar', cuando: (f) => { const s = nthSunday(f.y, 6, 3); return f.m === 6 && f.d >= s - 3 && f.d <= s } },
  { key: 'maestro', label: '¡Feliz Día del Maestro! Gracias por su pasión por educar', emoji: '🍎', particulas: ['🍎', '📖', '✏️'], movimiento: 'caer', cuando: dia(706) },
  { key: 'tesla', label: '¡Feliz cumpleaños, Nikola Tesla!', emoji: '⚡', particulas: ['⚡', '💡'], movimiento: 'flotar', cuando: dia(710) },
  { key: 'patrias', label: '¡Felices Fiestas Patrias!', emoji: '🇵🇪', particulas: [], movimiento: 'caer', cuando: rango(720, 731) },
  { key: 'santarosa', label: 'Santa Rosa de Lima', emoji: '🌹', particulas: ['🌹', '🌸'], movimiento: 'caer', cuando: dia(830) },
  { key: 'nino', label: 'Día del Niño Peruano', emoji: '🎈', particulas: ['🎈', '🎨', '⭐'], movimiento: 'subir', cuando: (f) => { const s = nthSunday(f.y, 8, 2); return f.m === 8 && f.d >= s - 2 && f.d <= s } },
  { key: 'primavera', label: 'Día de la Primavera', emoji: '🌻', particulas: ['🌻', '🌼', '🦋'], movimiento: 'flotar', cuando: rango(920, 923) },
]

/** Fecha de Lima. */
function fechaLima(date: Date): Fecha {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: 'numeric', day: 'numeric' }).format(date).split(/\D+/).map(Number)
  return { y, m, d, md: m * 100 + d }
}

/** Vista previa: `?tema=halloween` en la dirección fuerza un tema en este dispositivo (`?tema=ninguno` lo quita). */
function temaForzado(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('tema')
    if (q) sessionStorage.setItem('campus-tema', q)
    return sessionStorage.getItem('campus-tema')
  } catch { return null }
}

/** Temporada de hoy (hora de Lima), o null. */
export function currentSeason(date = new Date()): Season {
  const forzado = temaForzado()
  const f = fechaLima(date)
  const t = forzado ? TEMPORADAS.find((x) => x.key === forzado) : TEMPORADAS.find((x) => x.cuando(f))
  if (!t) return null
  const { cuando: _cuando, ...resto } = t
  // El 31 de octubre también es el Día de la Canción Criolla.
  if (t.key === 'halloween' && !forzado && f.md === 1031) return { ...resto, label: '¡Feliz Halloween! Hoy también es el Día de la Canción Criolla' }
  return resto
}
