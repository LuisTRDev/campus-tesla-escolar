import qrcode from 'qrcode-generator'
import { ESCUDO, escudoSvgMarkup } from '@/components/escudoPaths'

// ---------------------------------------------------------------------------
// Carnet escolar (proporción de tarjeta ID-1, 85,6 × 54 mm) dibujado como SVG.
// El mismo texto se muestra en pantalla y se pasa a PNG para descargarlo.
// ---------------------------------------------------------------------------
export const CARNET_W = 1012
export const CARNET_H = 638

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

/** Módulos oscuros del QR como un solo trazo, dentro de un cuadrado de `size` px. */
export function qrPath(text: string, size: number): { d: string; cell: number } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const cell = size / n
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${(c * cell).toFixed(2)} ${(r * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`
    }
  }
  return { d, cell }
}

/** Corta el nombre en hasta dos líneas. */
function nameLines(name: string, max = 18): string[] {
  const lines: string[] = ['']
  for (const w of name.split(/\s+/).filter(Boolean)) {
    const cur = lines[lines.length - 1]
    if ((cur + ' ' + w).trim().length > max && cur && lines.length < 2) lines.push(w)
    else lines[lines.length - 1] = (cur + ' ' + w).trim()
  }
  return lines
}

export function buildCarnetSvg({ firstName, lastName, classroom, year, avatar, code }: {
  firstName: string; lastName: string; classroom: string; year: number; avatar: string; code: string
}): string {
  const qrSize = 250
  const { d } = qrPath(code, qrSize)
  const zig = Array.from({ length: 23 }, (_, i) => `${i * 46},${i % 2 ? 70 : 30}`).join(' ')
  const names = nameLines(firstName, 16)
  const surnames = nameLines(lastName, 22)
  const font = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARNET_W}" height="${CARNET_H}" viewBox="0 0 ${CARNET_W} ${CARNET_H}" font-family="${font}">
  <defs>
    <linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d3f73"/><stop offset="0.55" stop-color="${ESCUDO.navy}"/><stop offset="1" stop-color="#0c1a33"/></linearGradient>
    <clipPath id="ccard"><rect width="${CARNET_W}" height="${CARNET_H}" rx="36"/></clipPath>
  </defs>
  <g clip-path="url(#ccard)">
    <rect width="${CARNET_W}" height="${CARNET_H}" fill="url(#cbg)"/>
    <g stroke="${ESCUDO.rojo}" stroke-opacity="0.28" stroke-width="3" fill="none">
      <polyline points="${zig}"/><path d="M0 30H${CARNET_W}M0 70H${CARNET_W}"/>
    </g>
    <rect y="${CARNET_H - 36}" width="${CARNET_W}" height="18" fill="${ESCUDO.rojo}"/>
    <rect y="${CARNET_H - 18}" width="${CARNET_W}" height="18" fill="${ESCUDO.oro}"/>
  </g>
  <g transform="translate(44 104) scale(0.95)"><g transform="translate(2 4)">${escudoSvgMarkup()}</g></g>
  <text x="160" y="146" font-size="26" font-weight="800" letter-spacing="3" fill="#fff">I.E.P. NIKOLA TESLA</text>
  <text x="160" y="182" font-size="22" font-weight="700" letter-spacing="6" fill="${ESCUDO.oro}">CARNET ESCOLAR ${year}</text>
  <circle cx="132" cy="352" r="78" fill="#fff"/>
  <circle cx="132" cy="352" r="78" fill="none" stroke="${ESCUDO.oro}" stroke-width="7"/>
  <text x="132" y="356" text-anchor="middle" dominant-baseline="central" font-size="84">${esc(avatar)}</text>
  ${names.map((l, i) => `<text x="236" y="${318 + i * 50}" font-size="46" font-weight="800" fill="#fff">${esc(l)}</text>`).join('')}
  ${surnames.map((l, i) => `<text x="236" y="${318 + names.length * 50 + i * 36}" font-size="30" font-weight="600" fill="#ffffff" fill-opacity="0.85">${esc(l)}</text>`).join('')}
  <text x="236" y="${318 + names.length * 50 + surnames.length * 36 + 22}" font-size="24" font-weight="700" fill="${ESCUDO.oro}">${esc(classroom)}</text>
  <text x="44" y="548" font-size="18" font-weight="700" letter-spacing="5" fill="#ffffff" fill-opacity="0.6">PASIÓN POR EDUCAR</text>
  <rect x="${CARNET_W - 330}" y="196" width="290" height="330" rx="22" fill="#fff"/>
  <g transform="translate(${CARNET_W - 310} 216)"><path d="${d}" fill="#0b1220"/></g>
  <text x="${CARNET_W - 185}" y="503" text-anchor="middle" font-size="18" font-weight="700" fill="#5b6b82">Muéstralo en la puerta</text>
</svg>`
}

/** Cinta del escudo en SVG, centrada en `cx`: banda con borde dorado y puntas dobladas detrás. */
function cintaSvg(cx: number, y: number, label: string, tone: 'blanca' | 'roja'): string {
  const w = label.length * 17 + 56
  const h = 44
  const x = cx - w / 2
  const band = tone === 'roja' ? ESCUDO.rojo : '#ffffff'
  const tail = tone === 'roja' ? '#8f2213' : ESCUDO.oroOscuro
  const ink = tone === 'roja' ? '#ffffff' : '#2b2f36'
  return `
  <polygon points="${x - 30},${y + 12} ${x + 12},${y + 12} ${x + 12},${y + h + 12} ${x - 30},${y + h + 12} ${x - 16},${y + 12 + h / 2}" fill="${tail}"/>
  <polygon points="${x + w + 30},${y + 12} ${x + w - 12},${y + 12} ${x + w - 12},${y + h + 12} ${x + w + 30},${y + h + 12} ${x + w + 16},${y + 12 + h / 2}" fill="${tail}"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${band}"/>
  <rect x="${x}" y="${y}" width="${w}" height="4" fill="${ESCUDO.oro}"/><rect x="${x}" y="${y + h - 4}" width="${w}" height="4" fill="${ESCUDO.oro}"/>
  <text x="${cx}" y="${y + h / 2 + 7}" text-anchor="middle" font-family="'Roboto Slab', Georgia, serif" font-size="20" font-weight="800" letter-spacing="2.5" fill="${ink}">${esc(label.toUpperCase())}</text>`
}

/** Reverso del carnet: tutor(a), aula, rango Tesla con su Estrella y los valores del colegio. */
export function buildCarnetBackSvg({ tutor, classroom, year, level, rankName, pin }: {
  tutor: string | null; classroom: string; year: number; level: number | null; rankName: string | null; pin: string
}): string {
  const font = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
  const tutorLines = nameLines(tutor ?? 'Por asignar', 24)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARNET_W}" height="${CARNET_H}" viewBox="0 0 ${CARNET_W} ${CARNET_H}" font-family="${font}">
  <defs><clipPath id="kcard"><rect width="${CARNET_W}" height="${CARNET_H}" rx="36"/></clipPath></defs>
  <g clip-path="url(#kcard)">
    <rect width="${CARNET_W}" height="${CARNET_H}" fill="#fdfcf9"/>
    <g opacity="0.06" transform="translate(${CARNET_W / 2 - 166} 150) scale(3.2)"><g transform="translate(2 4)">${escudoSvgMarkup()}</g></g>
    <rect width="${CARNET_W}" height="96" fill="${ESCUDO.navy}"/>
    <rect y="96" width="${CARNET_W}" height="10" fill="${ESCUDO.rojo}"/><rect y="106" width="${CARNET_W}" height="10" fill="${ESCUDO.oro}"/>
    <rect y="${CARNET_H - 36}" width="${CARNET_W}" height="18" fill="${ESCUDO.rojo}"/>
    <rect y="${CARNET_H - 18}" width="${CARNET_W}" height="18" fill="${ESCUDO.oro}"/>
  </g>
  <text x="44" y="60" font-size="24" font-weight="800" letter-spacing="3" fill="#fff">I.E.P. NIKOLA TESLA</text>
  <text x="${CARNET_W - 44}" y="60" text-anchor="end" font-size="20" font-weight="700" letter-spacing="5" fill="${ESCUDO.oro}">CARNET ESCOLAR ${year}</text>

  <text x="60" y="180" font-size="17" font-weight="800" letter-spacing="4" fill="#7a8699">TUTOR(A)</text>
  ${tutorLines.map((l, i) => `<text x="60" y="${220 + i * 38}" font-size="32" font-weight="800" fill="${ESCUDO.navy}">${esc(l)}</text>`).join('')}
  <text x="60" y="${236 + tutorLines.length * 38 + 20}" font-size="17" font-weight="800" letter-spacing="4" fill="#7a8699">AULA</text>
  <text x="60" y="${236 + tutorLines.length * 38 + 58}" font-size="30" font-weight="700" fill="${ESCUDO.navy}">${esc(classroom)}</text>

  <rect x="560" y="146" width="410" height="214" rx="22" fill="#f4f6f9" stroke="#dce3ec" stroke-width="2"/>
  <text x="596" y="186" font-size="17" font-weight="800" letter-spacing="4" fill="#7a8699">RANGO TESLA</text>
  ${level != null ? `${pin}
  <text x="716" y="262" font-size="40" font-weight="800" fill="${ESCUDO.navy}">Nivel ${level}</text>
  <text x="716" y="300" font-size="22" font-weight="700" fill="#9a6a00">${esc(rankName ?? '')}</text>` : `<text x="596" y="270" font-size="22" fill="#7a8699">Aún sin Perfil Tesla</text>`}

  ${cintaSvg(206, 418, 'Disciplina', 'blanca')}
  ${cintaSvg(506, 418, 'Liderazgo', 'roja')}
  ${cintaSvg(806, 418, 'Excelencia', 'blanca')}
  <text x="${CARNET_W / 2}" y="548" text-anchor="middle" font-size="19" font-weight="800" letter-spacing="7" fill="${ESCUDO.navy}" fill-opacity="0.75">PASIÓN POR EDUCAR</text>
</svg>`
}

/** Las dos caras una sobre otra, para descargarlas en una sola imagen. */
export function buildCarnetBothSvg(front: string, back: string, gap = 40): { svg: string; width: number; height: number } {
  const height = CARNET_H * 2 + gap
  const inner = (s: string, y: number) => s.replace('<svg ', `<svg x="0" y="${y}" `)
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${CARNET_W}" height="${height}" viewBox="0 0 ${CARNET_W} ${height}"><rect width="${CARNET_W}" height="${height}" fill="#ffffff"/>${inner(front, 0)}${inner(back, CARNET_H + gap)}</svg>`, width: CARNET_W, height }
}
