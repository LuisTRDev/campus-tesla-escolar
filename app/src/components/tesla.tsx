import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Award, BookOpen, Brain, CalendarCheck, Check, Clock, Coins, Crown, Flag, Flame, Gem, Hand, Heart, HeartHandshake, Lightbulb, Lock,
  Medal as MedalIcon, Music, Palette, Rocket, Shield, Sparkles, Star, Sunrise, Target, ThumbsUp, Trophy, Users, Zap, type LucideIcon,
} from 'lucide-react'
import { Badge, Skeleton } from '@/components/ui'
import { signedUrl } from '@/components/files'
import { SCENE_ACCENT, Scene, sceneInfo, starPoints } from '@/components/scenes'
import './effects.css'
import { useAsync } from '@/lib/useAsync'
import { formatShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  BUCKET_REWARDS, DEFAULT_PIN_LEVELS, PIN_NAMES, RARITY_LABEL, getProfile, levelProgress, parseArt, rankOf,
  type Rarity, type TeslaProfile,
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
      <span className="flex h-full w-full select-none items-center justify-center rounded-full bg-superficie leading-none" style={{ fontSize: size * 0.5 }} aria-hidden>
        {emoji || '⚡'}
      </span>
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

export function LevelBar({ profile, className }: { profile: Pick<TeslaProfile, 'xp' | 'level' | 'level_xp' | 'next_level_xp'>; className?: string }) {
  const v = levelProgress(profile)
  const missing = profile.next_level_xp - profile.xp
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold">Nivel {profile.level}</span>
        <span className="text-texto-suave tabular-nums">{missing.toLocaleString('es-PE')} XP para el nivel {profile.level + 1}</span>
      </div>
      <div
        className="mt-1.5 h-3 overflow-hidden rounded-full bg-[var(--meter-track)]"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={`Avance del nivel ${profile.level}`}
      >
        <div className="xp-fill h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(v * 100, 3)}%` }} />
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

/** Fondo de toda la página del perfil, como en los perfiles de Steam. */
export function ProfileBackdrop({ value }: { value?: string | null }) {
  const art = parseArt(value)
  const show = art.type !== 'none' && art.type !== 'colors'
  const ref = useParallax(show)
  if (!show) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden lg:left-64" aria-hidden>
      <div ref={ref} className="absolute inset-0 transition-transform duration-300 ease-out" style={{ transform: 'scale(1.06)' }}>
        <ArtLayer value={value} />
      </div>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(var(--papel) / 0) 35%, rgb(var(--papel) / 0.35) 75%, rgb(var(--papel) / 0.7) 100%)' }} />
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
  avatar?: string; frame?: string; banner?: string; title?: string; background?: string; name_fx?: string; aura?: string
  bio?: string | null; featured?: TeslaProfile['featured']
}

export function ProfileHero({ profile, preview, actions, glass }: { profile: TeslaProfile; preview?: HeroPreview; actions?: ReactNode; glass?: boolean }) {
  const featured = preview?.featured ?? profile.featured
  const bio = preview?.bio !== undefined ? preview.bio : profile.bio
  const title = preview?.title ?? profile.title?.value
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
  const rank = rankOf(profile.level, profile.pin_levels)

  return (
    <section className={cn('overflow-hidden rounded-2xl border border-linea', glass ? 'bg-superficie/85 shadow-xl backdrop-blur-md' : 'bg-superficie')}>
      <div className="relative h-28 sm:h-40">
        <ArtLayer value={preview?.banner ?? profile.banner?.value} />
        {actions && <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
      <div className="px-5 pb-5">
        {/* El avatar y la Estrella se montan sobre el banner (z-10 para que el banner no los tape). */}
        <div className="relative z-10 -mt-12 flex items-end justify-between gap-4 sm:-mt-14">
          <TeslaAvatar emoji={preview?.avatar ?? profile.avatar?.value} frame={preview?.frame ?? profile.frame?.value} aura={preview?.aura ?? profile.aura?.value} size={104} className="shadow-lg" />
          <div className="flex flex-col items-center">
            <RankPin tier={rank.tier} stars={rank.stars} size={64} />
            <span className="level-chip -mt-1 inline-flex items-baseline gap-1 rounded-lg px-2.5 py-1 leading-none">
              <span className="text-[10px] font-bold uppercase tracking-wide">Nivel</span>
              <span className="font-display text-lg font-bold">{profile.level}</span>
            </span>
          </div>
        </div>
        <div className="mt-2 min-w-0">
          {title && <p className="text-xs font-bold uppercase tracking-wider text-chispa-600">{title}</p>}
          <h1 className="truncate font-display text-2xl font-bold leading-tight sm:text-3xl"><NameFx fx={preview?.name_fx ?? profile.name_fx?.value} text={name || 'Alumno'} /></h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-texto-suave">
            <span>{profile.classroom}</span>
            <span aria-hidden>·</span>
            <span className={cn('inline-flex items-center gap-1 font-bold', PIN_TEXT[rank.tier])}><Star className="h-3.5 w-3.5" aria-hidden />{rank.fullName}</span>
          </p>
        </div>

        <LevelBar profile={profile} className="mt-4" />

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1 font-bold tabular-nums"><Zap className="h-4 w-4 text-estado-info" aria-hidden />{profile.xp.toLocaleString('es-PE')} XP</span>
          {profile.coins !== undefined && (
            <span className="inline-flex items-center gap-1.5">
              <CoinAmount value={profile.coins} />
              {!!profile.reserved && <span className="text-texto-suave">({profile.reserved} reservadas)</span>}
            </span>
          )}
          {profile.current_streak !== undefined && profile.current_streak > 0 && (
            <span className="inline-flex items-center gap-1 font-bold"><Flame className="h-4 w-4 text-estado-tarde" aria-hidden />Racha de {profile.current_streak}</span>
          )}
          <span className="inline-flex items-center gap-1 text-texto-suave"><Trophy className="h-4 w-4" aria-hidden />{profile.counts.total} logro{profile.counts.total === 1 ? '' : 's'}</span>
        </div>

        {(featured.length > 0 || bio) && (
          <div className="mt-4 flex flex-col gap-3 border-t border-linea pt-4 sm:flex-row sm:items-center">
            {featured.length > 0 && (
              <ul className="flex gap-2" aria-label="Insignias destacadas">
                {featured.map((f) => (
                  <li key={f.id} title={`${f.name} · ${RARITY_LABEL[f.rarity]}`}>
                    <Medal icon={f.icon} rarity={f.rarity} size={44} />
                    <span className="sr-only">{f.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {bio && <p className="min-w-0 flex-1 text-[15px] italic text-texto-suave sm:border-l sm:border-linea sm:pl-4">“{bio}”</p>}
          </div>
        )}
      </div>
    </section>
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
