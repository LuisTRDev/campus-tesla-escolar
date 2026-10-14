import { avatarEmoji } from '@/components/avatars'
import { SCENE_ACCENT, starPoints } from '@/components/scenes'
import { PIN_METAL } from '@/components/tesla'
import { RARITY_LABEL, parseArt, rankOf, type TeslaProfile } from '@/services/tesla'

// ---------------------------------------------------------------------------
// Tarjeta del Perfil Tesla para descargar o compartir (1080 × 1350, PNG).
// Se dibuja como SVG y se pasa a un canvas: todo ocurre en el navegador.
// ---------------------------------------------------------------------------
const W = 1080
const H = 1350

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

function accentOf(profile: TeslaProfile): [string, string, string] {
  for (const v of [profile.background?.value, profile.banner?.value]) {
    const art = parseArt(v)
    if (art.type === 'scene' && SCENE_ACCENT[art.key]) return SCENE_ACCENT[art.key]
    if (art.type === 'colors') return [art.c2, '#ffd36b', art.c1]
  }
  return ['#f0b429', '#60a5fa', '#0b1d33']
}

/** Corta el nombre en hasta dos líneas. */
function nameLines(name: string): string[] {
  const words = name.split(/\s+/).filter(Boolean)
  const lines: string[] = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if ((cur + ' ' + w).trim().length > 20 && cur && lines.length < 2) lines.push(w)
    else lines[lines.length - 1] = (cur + ' ' + w).trim()
  }
  return lines
}

function pinSvg(tier: number, stars: number, cx: number, cy: number, scale: number) {
  const [light, mid, dark, deep] = PIN_METAL[tier] ?? PIN_METAL[0]
  const starRow = Array.from({ length: stars }).map((_, i) =>
    `<polygon points="${starPoints(32 + (i - (stars - 1) / 2) * 10, 65, 4.6, 1.9, 5)}" fill="url(#pm)" stroke="${deep}" stroke-width="0.6"/>`).join('')
  return `
  <defs>
    <linearGradient id="pm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <radialGradient id="pc" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
  </defs>
  <g transform="translate(${cx - 32 * scale} ${cy - 36 * scale}) scale(${scale})">
    ${tier === 4 ? `<polygon points="${starPoints(32, 30, 31, 24, 16)}" fill="${dark}" opacity="0.55"/>` : ''}
    <polygon points="${starPoints(32, 30, 29, 19)}" fill="url(#pm)" stroke="${deep}" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="32" cy="30" r="13.5" fill="url(#pc)" stroke="${light}" stroke-width="1.6"/>
    <path d="M34.5 19.5 L25.5 32.5 H31 L28.5 41.5 L38.5 27.5 H33 Z" fill="${tier === 0 ? '#cbd5e1' : '#fff'}" stroke="${deep}" stroke-width="0.7" stroke-linejoin="round"/>
    <ellipse cx="22" cy="17" rx="8" ry="3.4" fill="#fff" opacity="0.35" transform="rotate(-35 22 17)"/>
    ${starRow}
  </g>`
}

export function buildShareSvg(profile: TeslaProfile): string {
  const [a1, a2, base] = accentOf(profile)
  const rank = rankOf(profile.level, profile.pin_levels)
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Alumno'
  const lines = nameLines(name)
  const stars = Array.from({ length: 70 }, (_, i) => {
    const x = (i * 397) % W
    const y = (i * 173 + (i % 7) * 61) % H
    const r = 1 + (i % 3)
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.15 + (i % 5) * 0.1}"/>`
  }).join('')
  const featured = profile.featured.slice(0, 3)
  const stat = (x: number, value: string, label: string) => `
    <g transform="translate(${x} 1040)">
      <rect x="-150" y="0" width="300" height="130" rx="28" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-opacity="0.16"/>
      <text x="0" y="62" text-anchor="middle" font-size="54" font-weight="800" fill="#fff">${esc(value)}</text>
      <text x="0" y="104" text-anchor="middle" font-size="26" fill="#ffffff" fill-opacity="0.7">${esc(label)}</text>
    </g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="#05070f"/></linearGradient>
    <radialGradient id="g1" cx="0.15" cy="0.1" r="0.7"><stop offset="0" stop-color="${a1}" stop-opacity="0.55"/><stop offset="1" stop-color="${a1}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="0.9" cy="0.85" r="0.7"><stop offset="0" stop-color="${a2}" stop-opacity="0.4"/><stop offset="1" stop-color="${a2}" stop-opacity="0"/></radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a1}"/><stop offset="1" stop-color="${a2}"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>
  ${stars}
  <g opacity="0.12" stroke="#fff" fill="none">${[220, 300, 380, 460].map((r) => `<circle cx="540" cy="400" r="${r}"/>`).join('')}</g>
  <text x="540" y="96" text-anchor="middle" font-size="30" font-weight="800" letter-spacing="10" fill="${a2}">PERFIL TESLA</text>
  <circle cx="540" cy="400" r="170" fill="url(#ring)"/>
  <circle cx="540" cy="400" r="154" fill="#0b1222"/>
  <text x="540" y="404" text-anchor="middle" dominant-baseline="central" font-size="170">${esc(avatarEmoji(profile.avatar?.value))}</text>
  ${profile.title?.value ? `<text x="540" y="636" text-anchor="middle" font-size="30" font-weight="800" letter-spacing="4" fill="#f0b429">${esc(profile.title.value.toUpperCase())}</text>` : ''}
  ${lines.map((l, i) => `<text x="540" y="${706 + i * 70}" text-anchor="middle" font-size="64" font-weight="800" fill="#fff">${esc(l)}</text>`).join('')}
  <text x="540" y="${706 + lines.length * 70 - 12}" text-anchor="middle" font-size="30" fill="#ffffff" fill-opacity="0.7">${esc(profile.classroom)}</text>
  ${pinSvg(rank.tier, rank.stars, 330, 940, 1.6)}
  <text x="400" y="928" font-size="40" font-weight="800" fill="#fff">${esc(rank.fullName)}</text>
  <text x="400" y="972" font-size="30" fill="#ffffff" fill-opacity="0.75">Nivel ${profile.level} · ${profile.xp.toLocaleString('es-PE')} XP</text>
  ${stat(200, String(profile.counts.total), 'logros')}
  ${stat(540, String(profile.sparks ?? 0), 'chispas')}
  ${stat(880, String(profile.level), 'nivel')}
  ${featured.length ? `<text x="540" y="1232" text-anchor="middle" font-size="28" fill="#ffffff" fill-opacity="0.85">${esc(featured.map((f) => `${f.name} (${RARITY_LABEL[f.rarity]})`).join('  ·  '))}</text>` : ''}
  <rect x="140" y="1276" width="800" height="6" rx="3" fill="url(#bar)" opacity="0.8"/>
  <text x="540" y="1322" text-anchor="middle" font-size="26" fill="#ffffff" fill-opacity="0.65">Campus Virtual · I.E.P. Nikola Tesla</text>
</svg>`
}

/** Genera el PNG y lo comparte (celular) o lo descarga (computadora). */
export async function shareProfileCard(profile: TeslaProfile): Promise<'shared' | 'downloaded'> {
  const svg = buildShareSvg(profile)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  canvas.getContext('2d')!.drawImage(img, 0, 0, W, H)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'))
  const fileName = `perfil-tesla-${(profile.first_name ?? 'alumno').toLowerCase().split(' ')[0]}.png`
  const file = new File([blob], fileName, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Mi Perfil Tesla' })
      return 'shared'
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'shared'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}
