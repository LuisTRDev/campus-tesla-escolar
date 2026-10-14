import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Award, BookOpen, Brain, CalendarCheck, Check, Clock, Coins, Crown, Flag, Flame, Gem, Hand, Heart, HeartHandshake, Lightbulb, Lock,
  Medal as MedalIcon, Music, Package, Palette, Rocket, Shield, Sparkles, Star, Sunrise, Target, ThumbsUp, Trophy, Users, Zap, type LucideIcon,
} from 'lucide-react'
import { Badge, Skeleton } from '@/components/ui'
import { signedUrl } from '@/components/files'
import { SCENE_ACCENT, Scene, sceneInfo, starPoints } from '@/components/scenes'
import { AnimatedAvatar, animAvatarKey } from '@/components/avatars'
import './effects.css'
import './profile.css'
import { useAsync } from '@/lib/useAsync'
import { formatShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  BUCKET_REWARDS, DEFAULT_PIN_LEVELS, PIN_NAMES, RARITY_LABEL, cachedIdentity, getIdentity, getProfile, levelProgress, parseArt, rankOf,
  type Rarity, type TeslaIdentity, type TeslaProfile,
} from '@/services/tesla'

// ---------------------------------------------------------------------------
// Íconos de logros y categorías (se eligen por nombre desde la administración)
// ---------------------------------------------------------------------------
export const TESLA_ICONS: Record<string, LucideIcon> = {
  Trophy, Star, Flame, Zap, Clock, Target, Award, Medal: MedalIcon, Crown, Heart, HeartHandshake, Rocket, Sunrise, BookOpen,
  Sparkles, Gem, Shield, CalendarCheck, Hand, Lightbulb, Flag, ThumbsUp, Brain, Music, Palette, Users,
}
export const ICON_NAMES = Object.keys(TESLA_ICONS)

export function TeslaIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TESLA_ICONS[name] ?? Trophy
  return <Icon className={className} aria-hidden />
}

export const RARITY_TEXT: Record<Rarity, string> = {
  BRONZE: 'text-[#9a5a26] dark:text-[#e0a473]',
  SILVER: 'text-[#5b6b80] dark:text-[#c3cfdd]',
  GOLD: 'text-[#a8740c] dark:text-[#f5c451]',
  PLATINUM: 'text-[#2f8fa3] dark:text-[#8fe3f2]',
}

export function RarityBadge({ rarity, className }: { rarity: Rarity; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-bold', RARITY_TEXT[rarity], className)}>
      <span className={cn('h-2.5 w-2.5 rounded-full', `medal-${rarity}`)} aria-hidden />
      {RARITY_LABEL[rarity]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Medalla de logro
// ---------------------------------------------------------------------------
export function Medal({ icon, rarity, locked, size = 56, secret }: { icon: string; rarity: Rarity; locked?: boolean; size?: number; secret?: boolean }) {
  return (
    <span
      className={cn('medal relative inline-flex shrink-0 items-center justify-center rounded-full', locked ? 'medal-locked' : `medal-${rarity}`)}
      style={{ width: size, height: size }}
    >
      <span className="flex items-center justify-center rounded-full bg-black/15" style={{ width: size - 10, height: size - 10 }}>
        {secret ? <Lock className="h-1/2 w-1/2 text-white/90" /> : <TeslaIcon name={icon} className="h-1/2 w-1/2 text-white drop-shadow" />}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Avatar con marco
// ---------------------------------------------------------------------------
export function TeslaAvatar({ emoji, frame, aura, size = 56, className }: {
  emoji?: string | null; frame?: string | null; aura?: string | null; size?: number; className?: string
}) {
  return (
    <span
      className={cn('tesla-frame relative inline-flex shrink-0 items-center justify-center rounded-full', `frame-${frame || 'none'}`, className)}
      style={{ width: size, height: size, padding: Math.max(2, Math.round(size / 18)) }}
    >
      {aura && aura !== 'none' && <span className={cn('aura', `aura-${aura}`)} aria-hidden />}
      <span className="flex h-full w-full select-none items-center justify-center overflow-hidden rounded-full bg-superficie leading-none" style={{ fontSize: size * 0.5 }} aria-hidden>
        {animAvatarKey(emoji) ? <AnimatedAvatar name={animAvatarKey(emoji)!} /> : emoji || '⚡'}
      </span>
    </span>
  )
}

/** Marcos que dibuja la app (la base acepta cualquier clave de esta lista). */
export const FRAME_KEYS = ['none', 'bronze', 'silver', 'gold', 'platinum', 'spark', 'coil', 'cristal', 'rayo', 'circuito', 'holo', 'llamas', 'arcoiris', 'galaxia']

/** Temas del perfil: cambian el color de todos los paneles. */
export const THEMES: { key: string; name: string; swatch: [string, string] }[] = [
  { key: 'none', name: 'Clásico', swatch: ['#ffffff', '#0b1d33'] },
  { key: 'medianoche', name: 'Medianoche', swatch: ['#111827', '#60a5fa'] },
  { key: 'verano', name: 'Verano', swatch: ['#fffbeb', '#fb923c'] },
  { key: 'acero', name: 'Acero', swatch: ['#1e293b', '#94a3b8'] },
  { key: 'bosque', name: 'Bosque', swatch: ['#142820', '#4ade80'] },
  { key: 'cosmico', name: 'Cósmico', swatch: ['#1e143c', '#a78bfa'] },
  { key: 'sakura', name: 'Sakura', swatch: ['#fff1f6', '#f472b6'] },
  { key: 'neon', name: 'Neón', swatch: ['#0c0a1c', '#e879f9'] },
  { key: 'oro', name: 'Gran Estrella', swatch: ['#261c0a', '#facc15'] },
]
export const THEME_KEYS = THEMES.map((t) => t.key)

export function themeClass(value: string | null | undefined) {
  return value && value !== 'none' && THEME_KEYS.includes(value) ? `tesla-theme tesla-theme-${value}` : ''
}

export function ThemeSwatch({ value, size = 40 }: { value: string; size?: number }) {
  const t = THEMES.find((x) => x.key === value) ?? THEMES[0]
  return (
    <span className="relative inline-block overflow-hidden rounded-lg border border-linea" style={{ width: size * 1.6, height: size }} aria-hidden>
      <span className="absolute inset-0" style={{ background: t.swatch[0] }} />
      <span className="absolute bottom-1.5 left-1.5 right-1/3 h-1.5 rounded-full" style={{ background: t.swatch[1] }} />
      <span className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full" style={{ background: t.swatch[1], opacity: 0.7 }} />
      <span className="absolute right-1.5 top-1.5 h-1.5 w-1/3 rounded-full" style={{ background: t.swatch[1], opacity: 0.4 }} />
    </span>
  )
}

// ---------------------------------------------------------------------------
// Animaciones: números que cuentan y medallas que se inclinan
// ---------------------------------------------------------------------------
function motionOff() {
  return typeof window !== 'undefined' && (document.documentElement.classList.contains('motion-off') || prefersReducedMotion())
}

/** Cuenta desde 0 hasta el valor al aparecer (y suavemente cuando cambia). */
export function useCountUp(value: number, duration = 900) {
  const [shown, setShown] = useState(() => (motionOff() ? value : 0))
  const from = useRef(shown)
  useEffect(() => {
    if (motionOff()) { setShown(value); from.current = value; return }
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration)
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - k, 3)))
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return shown
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value)
  return <span className={cn('tabular-nums', className)}>{v.toLocaleString('es-PE')}</span>
}

/** Envuelve algo para que se incline en 3D con el cursor; las rarezas altas llevan brillo holográfico. */
export function Holo({ children, foil, className }: { children: ReactNode; foil?: 'GOLD' | 'PLATINUM' | null; className?: string }) {
  const [on, setOn] = useState(false)
  const move = useCallback((e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType !== 'mouse' || motionOff()) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    const s = e.currentTarget.style
    s.setProperty('--ry', `${((x - 0.5) * 28).toFixed(1)}deg`)
    s.setProperty('--rx', `${((0.5 - y) * 28).toFixed(1)}deg`)
    s.setProperty('--mx', `${(x * 100).toFixed(0)}%`)
    s.setProperty('--my', `${(y * 100).toFixed(0)}%`)
    setOn(true)
  }, [])
  return (
    <span className={cn('holo rounded-full', on && 'holo-on', foil && `holo-foil holo-${foil}`, className)} onPointerMove={move} onPointerLeave={() => setOn(false)}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Insignia de nivel: cambia de forma y color cada 10 niveles (como en Steam)
// ---------------------------------------------------------------------------
const BADGE_STYLES: { colors: [string, string, string]; shape: string; name: string }[] = [
  { colors: ['#cbd5e1', '#64748b', '#334155'], shape: 'circle', name: 'Círculo' },
  { colors: ['#fca5a5', '#dc2626', '#7f1d1d'], shape: 'hex', name: 'Hexágono rojo' },
  { colors: ['#fdba74', '#ea580c', '#7c2d12'], shape: 'shield', name: 'Escudo naranja' },
  { colors: ['#fde68a', '#d97706', '#78350f'], shape: 'star', name: 'Estrella dorada' },
  { colors: ['#86efac', '#16a34a', '#14532d'], shape: 'diamond', name: 'Rombo esmeralda' },
  { colors: ['#93c5fd', '#2563eb', '#1e3a8a'], shape: 'hex2', name: 'Doble hexágono azul' },
  { colors: ['#d8b4fe', '#9333ea', '#4c1d95'], shape: 'gear', name: 'Engranaje violeta' },
  { colors: ['#f9a8d4', '#db2777', '#831843'], shape: 'flame', name: 'Llama rosa' },
  { colors: ['#a5f3fc', '#0891b2', '#164e63'], shape: 'crown', name: 'Corona turquesa' },
  { colors: ['#fef08a', '#f472b6', '#6366f1'], shape: 'tesla', name: 'Estrella Tesla' },
]

export function badgeStyleOf(level: number) {
  return BADGE_STYLES[Math.min(BADGE_STYLES.length - 1, Math.floor(Math.max(0, level) / 10))]
}

function polygon(n: number, r: number, rot = -90, cx = 50, cy = 50) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  }).join(' ')
}

function BadgeShape({ shape, fill, stroke }: { shape: string; fill: string; stroke: string }) {
  const p = { fill, stroke, strokeWidth: 4, strokeLinejoin: 'round' as const }
  switch (shape) {
    case 'hex': return <polygon points={polygon(6, 44, -90)} {...p} />
    case 'shield': return <path d="M50 5 L88 18 V48 Q88 78 50 95 Q12 78 12 48 V18 Z" {...p} />
    case 'star': return <polygon points={starPoints(50, 50, 47, 32, 8)} {...p} />
    case 'diamond': return <polygon points="50,4 94,50 50,96 6,50" {...p} />
    case 'hex2': return <><polygon points={polygon(6, 46, 0)} {...p} opacity="0.55" /><polygon points={polygon(6, 38, -90)} {...p} /></>
    case 'gear': return <><polygon points={starPoints(50, 50, 47, 38, 12)} {...p} /><circle cx="50" cy="50" r="32" fill={fill} stroke={stroke} strokeWidth="2" /></>
    case 'flame': return <path d="M50 4 Q62 24 74 30 Q92 44 86 66 Q80 92 50 96 Q20 92 14 66 Q8 44 26 30 Q38 24 50 4 Z" {...p} />
    case 'crown': return <path d="M10 30 L30 46 L50 14 L70 46 L90 30 L84 88 H16 Z" {...p} />
    case 'tesla': return <><polygon points={starPoints(50, 50, 48, 22, 16)} {...p} opacity="0.6" /><polygon points={starPoints(50, 50, 44, 30, 8)} {...p} /></>
    default: return <circle cx="50" cy="50" r="44" {...p} />
  }
}

export function LevelBadge({ level, size = 56, className }: { level: number; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const st = badgeStyleOf(level)
  const [light, mid, dark] = st.colors
  const decade = Math.floor(level / 10)
  return (
    <span
      className={cn('level-badge', decade >= 3 && decade < 9 && 'level-badge-shine', decade >= 9 && 'level-badge-rainbow', className)}
      style={{ width: size, height: size, '--badge-glow': mid } as CSSProperties}
      role="img"
      aria-label={`Nivel ${level}`}
      title={`Nivel ${level} · ${st.name}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={light} /><stop offset="0.5" stopColor={mid} /><stop offset="1" stopColor={dark} /></linearGradient>
        </defs>
        <BadgeShape shape={st.shape} fill={`url(#${id}f)`} stroke={dark} />
        <ellipse cx="36" cy="28" rx="16" ry="6" fill="#fff" opacity="0.3" transform="rotate(-30 36 28)" />
      </svg>
      <span className="level-badge-num" style={{ fontSize: size * (level >= 100 ? 0.3 : 0.38) }}>{level}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Efecto del nombre
// ---------------------------------------------------------------------------
export const NAME_FX_KEYS = ['none', 'oro', 'hielo', 'neon', 'electrico', 'arcoiris', 'fuego', 'glitch']
export const AURA_KEYS = ['none', 'chispas', 'halo', 'orbita', 'plasma', 'petalos', 'estelar', 'corona']

export function NameFx({ fx, text, className }: { fx?: string | null; text: string; className?: string }) {
  const on = !!fx && fx !== 'none'
  return <span className={cn(on && 'name-fx', on && `name-fx-${fx}`, className)} data-text={text}>{text}</span>
}

// ---------------------------------------------------------------------------
// Monedas, XP y nivel
// ---------------------------------------------------------------------------
export function CoinAmount({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 font-bold tabular-nums', className)}>
      <Coins className="h-4 w-4 text-chispa-600" aria-hidden />
      {signed && value > 0 ? '+' : ''}{value.toLocaleString('es-PE')}
      <span className="sr-only"> monedas</span>
    </span>
  )
}

export function LevelBar({ profile, className, big }: { profile: Pick<TeslaProfile, 'xp' | 'level' | 'level_xp' | 'next_level_xp'>; className?: string; big?: boolean }) {
  const v = levelProgress(profile)
  const missing = profile.next_level_xp - profile.xp
  // Se llena desde cero al aparecer.
  const [shown, setShown] = useState(() => (motionOff() ? v : 0))
  useEffect(() => {
    const t = window.setTimeout(() => setShown(v), 120)
    return () => window.clearTimeout(t)
  }, [v])
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold">Nivel {profile.level}</span>
        <span className="text-texto-suave tabular-nums">{missing.toLocaleString('es-PE')} XP para el nivel {profile.level + 1}</span>
      </div>
      <div
        className={cn('mt-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]', big ? 'h-4' : 'h-3')}
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={`Avance del nivel ${profile.level}`}
      >
        <div className="xp-fill xp-shine h-full rounded-full transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(shown * 100, 3)}%` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Banners y fondos: degradado, escena animada, imagen o video
// ---------------------------------------------------------------------------
function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function MediaArt({ type, path, still }: { type: 'img' | 'vid'; path: string; still?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    signedUrl(BUCKET_REWARDS, path).then((u) => { if (alive) setUrl(u) }).catch(() => undefined)
    return () => { alive = false }
  }, [path])
  if (!url) return <div className="absolute inset-0 animate-pulse bg-tinta" />
  if (type === 'img') return <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
  const play = !still && !prefersReducedMotion()
  return <video src={url} autoPlay={play} muted loop playsInline preload={play ? 'auto' : 'metadata'} className="absolute inset-0 h-full w-full object-cover" />
}

/** Colores de acento del perfil según el fondo (o el banner) elegido. */
export function artAccent(...values: (string | null | undefined)[]): [string, string] | null {
  for (const v of values) {
    const art = parseArt(v)
    if (art.type === 'scene' && SCENE_ACCENT[art.key]) return [SCENE_ACCENT[art.key][0], SCENE_ACCENT[art.key][1]]
  }
  return null
}

/** ¿El banner o fondo se mueve? (para la etiqueta «Animado»). */
export function isAnimatedArt(value: string | null | undefined) {
  const art = parseArt(value)
  return art.type === 'vid' || (art.type === 'scene' && !!sceneInfo(art.key)?.animated)
}

/** Dibuja un banner o fondo ocupando todo su contenedor (que debe ser `relative`). */
export function ArtLayer({ value, still, className }: { value?: string | null; still?: boolean; className?: string }) {
  const art = parseArt(value)
  return (
    <div className={cn('absolute inset-0 overflow-hidden', still && 'art-still', className)} aria-hidden>
      {art.type === 'colors' && (
        <>
          <div className="notebook-cover absolute inset-0" style={{ backgroundColor: art.c1, backgroundImage: `linear-gradient(120deg, ${art.c1}, ${art.c2})` }} />
          <div className="tesla-sparks absolute inset-0" />
        </>
      )}
      {art.type === 'scene' && <Scene name={art.key} />}
      {(art.type === 'img' || art.type === 'vid') && <MediaArt type={art.type} path={art.path} still={still} />}
      {art.type === 'none' && <div className="absolute inset-0 bg-papel" />}
    </div>
  )
}

/** Desplaza levemente el fondo según el mouse o la inclinación del celular. */
function useParallax(enabled: boolean) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!enabled || !el || prefersReducedMotion()) return
    let frame = 0
    const move = (x: number, y: number) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { el.style.transform = `translate3d(${(x * 14).toFixed(1)}px, ${(y * 14).toFixed(1)}px, 0) scale(1.06)` })
    }
    const onPointer = (e: PointerEvent) => move(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5)
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      move(Math.max(-1, Math.min(1, e.gamma / 30)) / 2, Math.max(-1, Math.min(1, (e.beta - 45) / 30)) / 2)
    }
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('deviceorientation', onTilt, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('deviceorientation', onTilt)
    }
  }, [enabled, el])
  return setEl
}

/** Partículas que suben despacio sobre el fondo, con los colores del perfil. */
function Particles({ colors }: { colors: [string, string] }) {
  const items = Array.from({ length: 22 }, (_, i) => {
    const r = (n: number) => ((i * 9301 + n * 49297) % 233280) / 233280
    return {
      left: `${(r(1) * 100).toFixed(1)}%`, size: 2 + Math.round(r(2) * 4), dur: 9 + r(3) * 12, delay: -r(4) * 20,
      dx: `${Math.round((r(5) - 0.5) * 120)}px`, color: i % 3 === 0 ? '#ffffff' : colors[i % 2],
    }
  })
  return (
    <div className="absolute inset-0 overflow-hidden">
      {items.map((p, i) => (
        <span key={i} className="tp-particle" style={{
          left: p.left, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
          '--dx': p.dx, '--p': p.color,
        } as CSSProperties} />
      ))}
    </div>
  )
}

/** Fondo de toda la página del perfil, como en los perfiles de Steam (con tinte del tema si no hay fondo). */
export function ProfileBackdrop({ value, accent, theme, particles = true }: {
  value?: string | null; accent?: [string, string] | null; theme?: string | null; particles?: boolean
}) {
  const art = parseArt(value)
  const show = art.type !== 'none' && art.type !== 'colors'
  const tint = !show && !!themeClass(theme)
  const ref = useParallax(show)
  if (!show && !tint) return null
  return createPortal(
    <div className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden lg:left-64', tint && themeClass(theme))} aria-hidden>
      {show ? (
        <>
          <div ref={ref} className="absolute inset-0 transition-transform duration-300 ease-out" style={{ transform: 'scale(1.06)' }}>
            <ArtLayer value={value} />
          </div>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(var(--papel) / 0) 35%, rgb(var(--papel) / 0.35) 75%, rgb(var(--papel) / 0.7) 100%)' }} />
        </>
      ) : (
        <div className="tp-theme-tint absolute inset-0" />
      )}
      {particles && <Particles colors={accent ?? ['#fde68a', '#93c5fd']} />}
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Estrellas Tesla: el pin de rango (inspirado en las «Stella» de SPY×FAMILY)
// ---------------------------------------------------------------------------
export const PIN_METAL: [string, string, string, string][] = [
  ['#e2e8f0', '#94a3b8', '#64748b', '#334155'],
  ['#f6c79a', '#d08a4e', '#8c5226', '#4a2810'],
  ['#ffffff', '#d5dde8', '#8796ab', '#3e4b5c'],
  ['#fff1bf', '#f5c451', '#c99319', '#6b4906'],
  ['#fffbe6', '#ffe07a', '#e9a90f', '#6b4906'],
]

export const PIN_TEXT = ['text-texto-suave', 'text-[#9a5a26] dark:text-[#e0a473]', 'text-[#5b6b80] dark:text-[#c3cfdd]', 'text-[#a8740c] dark:text-[#f5c451]', 'text-[#a8740c] dark:text-[#f5c451]']

export function RankPin({ tier, stars = 0, size = 56, locked, className }: { tier: number; stars?: number; size?: number; locked?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  const [light, mid, dark, deep] = PIN_METAL[tier] ?? PIN_METAL[0]
  const empty = tier === 0
  const label = empty ? PIN_NAMES[0] : `${PIN_NAMES[tier]}${locked ? ' (bloqueada)' : ''}`
  return (
    <span
      className={cn('rank-pin relative inline-block shrink-0', tier === 4 && !locked && 'rank-pin-grand', (locked || empty) && 'rank-pin-off', className)}
      style={{ width: size, height: size * 1.125 }}
      role="img"
      aria-label={label}
      title={label}
    >
      {tier === 4 && !locked && <span className="rank-pin-aura" aria-hidden />}
      <svg viewBox="0 0 64 72" className="relative h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} /><stop offset="0.45" stopColor={mid} /><stop offset="1" stopColor={dark} />
          </linearGradient>
          <radialGradient id={`${id}c`} cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor={mid} /><stop offset="1" stopColor={deep} />
          </radialGradient>
        </defs>
        {tier === 4 && <polygon points={starPoints(32, 30, 31, 24, 16)} fill={dark} opacity="0.55" />}
        <polygon points={starPoints(32, 30, 29, 19)} fill={`url(#${id}m)`} stroke={deep} strokeWidth="1" strokeLinejoin="round" />
        <circle cx="32" cy="30" r="13.5" fill={`url(#${id}c)`} stroke={light} strokeWidth="1.6" />
        <path d="M34.5 19.5 L25.5 32.5 H31 L28.5 41.5 L38.5 27.5 H33 Z" fill={empty ? '#cbd5e1' : '#fff'} stroke={deep} strokeWidth="0.7" strokeLinejoin="round" />
        <ellipse cx="22" cy="17" rx="8" ry="3.4" fill="#fff" opacity="0.35" transform="rotate(-35 22 17)" />
        {Array.from({ length: stars }).map((_, i) => (
          <polygon key={i} points={starPoints(32 + (i - (stars - 1) / 2) * 10, 65, 4.6, 1.9, 5)} fill={`url(#${id}m)`} stroke={deep} strokeWidth="0.6" />
        ))}
      </svg>
    </span>
  )
}

/** Camino de las cuatro Estrellas, con la entrega del pin físico. */
export function PinPath({ profile }: { profile: TeslaProfile }) {
  const levels = profile.pin_levels?.length === 4 ? profile.pin_levels : DEFAULT_PIN_LEVELS
  const rank = rankOf(profile.level, levels)
  const delivered = new Map((profile.pins ?? []).map((p) => [p.tier, p.delivered_at]))
  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-bold">Estrellas Tesla</h2>
        <p className="text-sm text-texto-suave">Cada estrella también es un pin de verdad que el tutor entrega en el colegio.</p>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((t) => {
          const got = rank.tier >= t
          const date = delivered.get(t)
          return (
            <li key={t} className={cn('flex flex-col items-center rounded-xl border p-3 text-center', got ? 'border-linea' : 'border-dashed border-linea')}>
              <RankPin tier={t} stars={got ? (t === rank.tier ? rank.stars : 3) : 0} size={60} locked={!got} />
              <p className={cn('mt-2 text-sm font-bold leading-tight', got && PIN_TEXT[t])}>{PIN_NAMES[t]}</p>
              <p className="text-xs text-texto-suave">Desde el nivel {levels[t - 1]}</p>
              <div className="mt-2">
                {!got ? (
                  <span className="text-xs text-texto-suave">Faltan {levels[t - 1] - profile.level} nivel{levels[t - 1] - profile.level === 1 ? '' : 'es'}</span>
                ) : date ? (
                  <Badge tone="ok"><Check className="h-3 w-3" />Pin entregado · {formatShort(date)}</Badge>
                ) : (
                  <Badge tone="spark">Pin por recoger</Badge>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Portada del perfil (banner, avatar, título, Estrella, monedas e insignias)
// ---------------------------------------------------------------------------
export type HeroPreview = {
  avatar?: string; frame?: string; banner?: string; title?: string; background?: string; name_fx?: string; aura?: string; theme?: string; mini_bg?: string
  bio?: string | null; featured?: TeslaProfile['featured']
}

function HeroStat({ icon, value, label, i }: { icon: ReactNode; value: ReactNode; label: string; i: number }) {
  return (
    <div className="tp-pop flex min-w-0 items-center gap-2 rounded-xl bg-papel/70 px-3 py-2" style={{ '--i': i } as CSSProperties}>
      <span className="shrink-0" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-bold leading-none">{value}</span>
        <span className="block truncate text-[11px] font-bold uppercase tracking-wide text-texto-suave">{label}</span>
      </span>
    </div>
  )
}

/** Portada del perfil al estilo Steam: banner amplio, avatar grande, nombre con efecto e insignia de nivel. */
export function ProfileHero({ profile, preview, actions, glass }: { profile: TeslaProfile; preview?: HeroPreview; actions?: ReactNode; glass?: boolean }) {
  const featured = preview?.featured ?? profile.featured
  const bio = preview?.bio !== undefined ? preview.bio : profile.bio
  const title = preview?.title ?? profile.title?.value
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
  const rank = rankOf(profile.level, profile.pin_levels)

  return (
    <section className={cn('tp-card tp-rise relative overflow-hidden rounded-2xl border border-linea', glass ? 'bg-superficie/85 shadow-2xl backdrop-blur-md' : 'bg-superficie shadow-sm')}>
      <div className="relative h-36 sm:h-56">
        <ArtLayer value={preview?.banner ?? profile.banner?.value} />
        <div className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--superficie) / 0.92))' }} aria-hidden />
        {actions && <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
      <div className="relative z-10 -mt-20 px-5 pb-5 sm:-mt-24 sm:px-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="tp-avatar-in shrink-0 self-start sm:self-auto">
            <TeslaAvatar emoji={preview?.avatar ?? profile.avatar?.value} frame={preview?.frame ?? profile.frame?.value}
              aura={preview?.aura ?? profile.aura?.value} size={136} className="shadow-2xl" />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {title && <p className="inline-block rounded-md bg-tinta/85 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-chispa">{title}</p>}
            <h1 className="mt-1 truncate font-display text-3xl font-bold leading-tight sm:text-4xl">
              <NameFx fx={preview?.name_fx ?? profile.name_fx?.value} text={name || 'Alumno'} />
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-texto-suave">
              <span>{profile.classroom}</span>
              <span aria-hidden>·</span>
              <span className={cn('inline-flex items-center gap-1 font-bold', PIN_TEXT[rank.tier])}><Star className="h-3.5 w-3.5" aria-hidden />{rank.fullName}</span>
            </p>
            {bio && <p className="mt-2 max-w-prosa text-[15px] italic text-texto-suave">“{bio}”</p>}
          </div>
          {/* Bloque de nivel, como el de Steam */}
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-linea bg-superficie/80 p-3 shadow-sm">
            <div className="text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-texto-suave">Nivel</p>
              <p className="font-display text-sm font-bold"><CountUp value={profile.xp} /> XP</p>
            </div>
            <LevelBadge level={profile.level} size={60} />
            <RankPin tier={rank.tier} stars={rank.stars} size={46} />
          </div>
        </div>

        <LevelBar profile={profile} className="mt-5" big />

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <HeroStat i={0} icon={<Zap className="h-5 w-5 text-estado-info" />} value={<CountUp value={profile.xp} />} label="XP total" />
          {profile.coins !== undefined && (
            <HeroStat i={1} icon={<Coins className="h-5 w-5 text-chispa-600" />} value={<CountUp value={profile.coins} />}
              label={profile.reserved ? `${profile.reserved} reservadas` : 'Monedas'} />
          )}
          {profile.current_streak !== undefined && (
            <HeroStat i={2} icon={<Flame className={cn('h-5 w-5 text-estado-tarde', profile.current_streak > 0 && 'animate-pulse')} />} value={<CountUp value={profile.current_streak} />} label="Racha" />
          )}
          <HeroStat i={3} icon={<Trophy className="h-5 w-5 text-chispa-600" />} value={<CountUp value={profile.counts.total} />} label={profile.counts.total === 1 ? 'Logro' : 'Logros'} />
          <HeroStat i={4} icon={<Sparkles className="h-5 w-5 text-chispa-600" />} value={<CountUp value={profile.sparks ?? 0} />} label="Chispas" />
          {profile.cosmetics_owned !== undefined && (
            <HeroStat i={5} icon={<Package className="h-5 w-5 text-[#8b5cf6]" />} value={<CountUp value={profile.cosmetics_owned} />} label="Cosméticos" />
          )}
        </div>

        {featured.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-linea pt-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-texto-suave">Insignias destacadas</span>
            <ul className="flex gap-3" aria-label="Insignias destacadas">
              {featured.map((f, i) => (
                <li key={f.id} title={`${f.name} · ${RARITY_LABEL[f.rarity]}`} className="tp-pop" style={{ '--i': i + 3 } as CSSProperties}>
                  <Holo foil={f.rarity === 'GOLD' || f.rarity === 'PLATINUM' ? f.rarity : null}><Medal icon={f.icon} rarity={f.rarity} size={50} /></Holo>
                  <span className="sr-only">{f.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Mini-perfil flotante (al pasar el cursor o mantener el dedo sobre un alumno)
// ---------------------------------------------------------------------------
const miniCache = new Map<number, Promise<TeslaProfile>>()
function miniProfile(id: number) {
  let p = miniCache.get(id)
  if (!p) {
    p = getProfile(id)
    p.catch(() => miniCache.delete(id))
    miniCache.set(id, p)
    // Se renueva cada 2 minutos.
    window.setTimeout(() => miniCache.delete(id), 120_000)
  }
  return p
}

/** Tarjeta del mini-perfil. Con un «Fondo del mini-perfil» elegido, el fondo ocupa toda la tarjeta (como en Steam). */
export function MiniCard({ profile, preview }: { profile: TeslaProfile; preview?: HeroPreview }) {
  const rank = rankOf(profile.level, profile.pin_levels)
  const bg = preview?.mini_bg ?? profile.mini_bg?.value
  const hasBg = !!bg && bg !== 'none'
  const theme = preview?.theme ?? profile.theme?.value
  return (
    <div className={cn('relative w-72 overflow-hidden rounded-2xl border border-linea bg-superficie text-texto shadow-2xl', themeClass(theme))}>
      {hasBg && (
        <>
          <ArtLayer value={bg} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(var(--superficie) / 0.05) 0%, rgb(var(--superficie) / 0.55) 45%, rgb(var(--superficie) / 0.92) 100%)' }} aria-hidden />
        </>
      )}
      <div className="relative h-20">{!hasBg && <ArtLayer value={preview?.banner ?? profile.banner?.value} />}</div>
      <div className="relative -mt-9 px-4 pb-4">
        <div className="flex items-end gap-3">
          <TeslaAvatar emoji={preview?.avatar ?? profile.avatar?.value} frame={preview?.frame ?? profile.frame?.value} aura={preview?.aura ?? profile.aura?.value} size={64} className="shadow-lg" />
          <LevelBadge level={profile.level} size={38} className="mb-1 ml-auto" />
        </div>
        <p className="mt-2 truncate font-display text-lg font-bold leading-tight"><NameFx fx={preview?.name_fx ?? profile.name_fx?.value} text={`${profile.first_name ?? ''} ${(profile.last_name ?? '').split(' ')[0]}`.trim()} /></p>
        {(preview?.title ?? profile.title?.value) && <p className="text-[11px] font-bold uppercase tracking-wider text-chispa-600">{preview?.title ?? profile.title?.value}</p>}
        <p className={cn('mt-1 flex items-center gap-1 text-xs font-bold', PIN_TEXT[rank.tier])}><RankPin tier={rank.tier} size={18} />{rank.fullName}</p>
        {profile.featured.length > 0 && (
          <div className="mt-3 flex gap-2">{profile.featured.map((f) => <Medal key={f.id} icon={f.icon} rarity={f.rarity} size={34} />)}</div>
        )}
        <p className="mt-2 text-xs text-texto-suave">{profile.counts.total} logros · {profile.sparks ?? 0} chispas</p>
      </div>
    </div>
  )
}

export function MiniProfileHover({ studentId, children, className }: { studentId: number; children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null)
  const [data, setData] = useState<TeslaProfile | null>(null)
  const el = useRef<HTMLSpanElement | null>(null)
  const timer = useRef(0)
  const longPress = useRef(false)

  const open = useCallback(() => {
    const r = el.current?.getBoundingClientRect()
    if (!r) return
    const above = r.bottom + 260 > window.innerHeight && r.top > 280
    setPos({ x: Math.max(8, Math.min(window.innerWidth - 296, r.left)), y: above ? r.top - 8 : r.bottom + 8, above })
    miniProfile(studentId).then(setData).catch(() => setPos(null))
  }, [studentId])
  const close = useCallback(() => { window.clearTimeout(timer.current); setPos(null) }, [])

  useEffect(() => {
    if (!pos) return
    const off = () => close()
    window.addEventListener('scroll', off, { passive: true, capture: true })
    window.addEventListener('pointerdown', off)
    return () => { window.removeEventListener('scroll', off, { capture: true }); window.removeEventListener('pointerdown', off) }
  }, [pos, close])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <span
      ref={el}
      className={cn('block', className)}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') { window.clearTimeout(timer.current); timer.current = window.setTimeout(open, 350) } }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') close() }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return
        longPress.current = false
        timer.current = window.setTimeout(() => { longPress.current = true; open() }, 450)
      }}
      onPointerUp={() => window.clearTimeout(timer.current)}
      onClickCapture={(e) => { if (longPress.current) { e.preventDefault(); e.stopPropagation(); longPress.current = false } }}
      onContextMenu={(e) => { if (longPress.current) e.preventDefault() }}
    >
      {children}
      {pos && data && createPortal(
        <div className="mini-pop pointer-events-none fixed z-[70]" style={{ left: pos.x, top: pos.y, transform: pos.above ? 'translateY(-100%)' : undefined }} role="tooltip">
          <MiniCard profile={data} />
        </div>,
        document.body,
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tarjeta para el inicio del alumno o la familia
// ---------------------------------------------------------------------------
export function TeslaSummaryCard({ studentId, forFamily }: { studentId: number; forFamily?: boolean }) {
  const { data, error } = useAsync(() => getProfile(studentId), [studentId])
  if (error) return null
  if (!data) return <Skeleton className="h-36 w-full rounded-2xl" />
  const q = forFamily ? `?hijo=${studentId}` : ''
  const rank = rankOf(data.level, data.pin_levels)
  return (
    <section className="overflow-hidden rounded-2xl border border-linea bg-superficie">
      <div className="relative h-12"><ArtLayer value={data.banner?.value} /></div>
      <div className="p-4">
        <div className="flex items-center gap-3">
          <TeslaAvatar emoji={data.avatar?.value} frame={data.frame?.value} aura={data.aura?.value} size={52} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-texto-suave">{forFamily ? `Perfil Tesla de ${data.first_name ?? ''}` : 'Tu Perfil Tesla'}</p>
            <p className="truncate font-display text-lg font-semibold">{data.title?.value ?? 'Aprendiz'}</p>
            <p className={cn('truncate text-xs font-bold', PIN_TEXT[rank.tier])}>{rank.fullName}</p>
          </div>
          <RankPin tier={rank.tier} stars={rank.stars} size={36} />
          {data.coins !== undefined && <CoinAmount value={data.coins} className="text-sm" />}
        </div>
        <LevelBar profile={data} className="mt-3" />
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Link to={`/perfil-tesla${q}`} className="font-bold text-tinta-500 hover:underline">{forFamily ? 'Ver perfil' : 'Ver mi perfil'}</Link>
          <span className="text-linea" aria-hidden>·</span>
          <Link to={`/tienda${q}`} className="font-bold text-tinta-500 hover:underline">Tienda</Link>
          {data.featured.length > 0 && (
            <span className="ml-auto flex gap-1">{data.featured.map((f) => <Medal key={f.id} icon={f.icon} rarity={f.rarity} size={26} />)}</span>
          )}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Nombre de una persona en todo el campus (mensajes, grupos, foro y anuncios).
// Si es un alumno cuyo perfil puedes ver, lleva su efecto de nombre, su avatar
// opcional y el mini-perfil al pasar el cursor; si no, se ve como texto normal.
// ---------------------------------------------------------------------------
export function useTeslaIdentity(profileId: string | null | undefined): TeslaIdentity | null {
  const [id, setId] = useState<TeslaIdentity | null>(() => (profileId ? cachedIdentity(profileId) ?? null : null))
  useEffect(() => {
    if (!profileId) { setId(null); return }
    let alive = true
    getIdentity(profileId).then((v) => { if (alive) setId(v) }).catch(() => undefined)
    return () => { alive = false }
  }, [profileId])
  return id
}

export function CampusName({ profileId, name, avatar, className }: {
  profileId: string | null | undefined; name: string; avatar?: boolean; className?: string
}) {
  const who = useTeslaIdentity(profileId)
  if (!who) return <span className={className}>{name}</span>
  return (
    <MiniProfileHover studentId={who.student_id} className={cn('inline-flex max-w-full', className)}>
      <span className="inline-flex max-w-full items-center gap-1.5">
        {avatar && <TeslaAvatar emoji={who.avatar} frame={who.frame} size={22} />}
        <NameFx fx={who.name_fx} text={name} className="truncate" />
        <LevelBadge level={who.level} size={18} />
      </span>
    </MiniProfileHover>
  )
}
