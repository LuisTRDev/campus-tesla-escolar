// Trazos y colores del escudo, compartidos por el componente <Escudo> (brand.tsx)
// y por las imágenes generadas como texto SVG (tarjeta para compartir).
export const ESCUDO = {
  rojo: '#D63620',
  azul: '#1F3A5F',
  oro: '#F2B51C',
  oroOscuro: '#B07D0C',
  navy: '#102442',
  /** La "T" con su pie escalonado (viewBox 0 0 100 100). */
  t: 'M10 8H90V38H78V26H62V80H72V94H28V80H38V26H22V38H10Z',
  /** La "N" sobre el tronco de la T. */
  n: 'M30 76V40H42L58 62V40H70V76H58L42 54V76Z',
  /** Escudo simple (viewBox -2 -4 104 120). */
  shield: 'M6 8Q50 -2 94 8V58Q94 96 50 112Q6 96 6 58Z',
}

/** Escudo simple como texto SVG (sin <svg>), para insertarlo dentro de otra imagen. */
export function escudoSvgMarkup(): string {
  const { rojo, azul, oro, t, n, shield } = ESCUDO
  return `<path d="${shield}" fill="#fff" stroke="${oro}" stroke-width="7" stroke-linejoin="round"/>`
    + `<g transform="translate(18 21) scale(0.64)"><path d="${t}" fill="${rojo}" stroke="${oro}" stroke-width="7" paint-order="stroke"/>`
    + `<path d="${n}" fill="${azul}" stroke="${oro}" stroke-width="6" paint-order="stroke"/></g>`
}
