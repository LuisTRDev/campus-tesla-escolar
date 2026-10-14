import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, Check, Coins, ExternalLink, Flame, Gem, Gift, Heart, Lock, Medal as MedalIcon, MessageSquareQuote, Package, PackageCheck, Rocket, Send,
  Share2, Sparkles, Star, Target, Trash2, Trophy, Zap,
} from 'lucide-react'
import { Badge, Button, Empty, ErrorBox, Loading, Modal, Panel } from '@/components/ui'
import {
  ArtLayer, CoinAmount, Holo, Medal, MiniProfileHover, NameFx, PIN_TEXT, RankPin, RarityBadge, TeslaAvatar, TeslaIcon, ThemeSwatch, isAnimatedArt,
} from '@/components/tesla'
import { shareProfileCard } from '@/components/shareCard'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort } from '@/lib/format'
import { linkName } from '@/lib/links'
import { playSound } from '@/lib/teslaSound'
import { cn } from '@/lib/utils'
import {
  DEFAULT_PIN_LEVELS, KIND_LABEL, PIN_NAMES, RARITIES, RARITY_LABEL, SPARK_KINDS, WALL_PHRASES, WALL_STICKERS,
  chestOdds, claimMission, claimSeasonReward, getMissions, getSeason, getTimeline, getWall, giveSpark, listChests, listCosmetics,
  listOwnedCosmetics, mySparksToday, openChest, postWall, rankOf, rarityLabel, removeWallPost,
  type Chest, type ChestResult, type Rarity, type SeasonCosmetic, type SparkKind, type TeslaProfile, type TimelineEvent,
  type WallSticker,
} from '@/services/tesla'

const linkHost = (url: string) => linkName(url)

// ---------------------------------------------------------------------------
// Vista previa de cualquier cosmético (premios de temporada y de cofres)
// ---------------------------------------------------------------------------
export function CosmeticPreview({ c, size = 64, avatar }: { c: Pick<SeasonCosmetic, 'kind' | 'value' | 'name'>; size?: number; avatar?: string }) {
  switch (c.kind) {
    case 'AVATAR': return <TeslaAvatar emoji={c.value} size={size} />
    case 'FRAME': return <TeslaAvatar emoji={avatar} frame={c.value} size={size} />
    case 'AURA': return <TeslaAvatar emoji={avatar} aura={c.value} size={size * 0.8} className="m-[10%]" />
    case 'NAME_FX': return <span className="font-display text-lg font-bold"><NameFx fx={c.value} text={c.name} /></span>
    case 'TITLE': return <span className="text-xs font-bold uppercase tracking-wider text-chispa-600">{c.value}</span>
    case 'THEME': return <ThemeSwatch value={c.value} size={size * 0.7} />
    default:
      return (
        <span className="relative block overflow-hidden rounded-lg border border-linea" style={{ width: size * 1.6, height: size }}>
          <ArtLayer value={c.value} />
        </span>
      )
  }
}

// ---------------------------------------------------------------------------
// Vitrina
// ---------------------------------------------------------------------------
function ShowcaseCard({ title, icon, children, className, i = 0, wide }: { title: string; icon: ReactNode; children: ReactNode; className?: string; i?: number; wide?: boolean }) {
  return (
    <section className={cn('tp-card tp-rise rounded-2xl border border-linea bg-superficie p-4', wide && 'sm:col-span-2', className)} style={{ '--i': i } as CSSProperties}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-texto-suave">{icon}{title}</h3>
      {children}
    </section>
  )
}

export function ShowcaseSection({ profile, empty }: { profile: TeslaProfile; empty?: ReactNode }) {
  const blocks = profile.showcase ?? []
  const data = profile.showcase_data ?? {}
  if (blocks.length === 0) return <>{empty ?? null}</>
  const levels = profile.pin_levels?.length === 4 ? profile.pin_levels : DEFAULT_PIN_LEVELS
  const rank = rankOf(profile.level, levels)
  const delivered = new Set((profile.pins ?? []).map((p) => p.tier))

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {blocks.map((b, i) => {
        if (b === 'TEXT' && data.TEXT) return (
          <ShowcaseCard key={b} i={i} wide title={data.TEXT.title || 'Sobre mí'} icon={<MessageSquareQuote className="h-4 w-4 text-chispa-600" />}>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{data.TEXT.body}</p>
          </ShowcaseCard>
        )
        if (b === 'ACHIEVEMENTS' && data.ACHIEVEMENTS) return (
          <ShowcaseCard key={b} i={i} wide title="Vitrina de logros" icon={<Trophy className="h-4 w-4 text-chispa-600" />}>
            {data.ACHIEVEMENTS.length === 0 ? <p className="text-sm text-texto-suave">Todavía no eligió logros para mostrar.</p> : (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {data.ACHIEVEMENTS.map((a, k) => (
                  <li key={a.id} className="tp-pop flex flex-col items-center text-center" style={{ '--i': k } as CSSProperties} title={a.name}>
                    <Holo foil={a.rarity === 'GOLD' || a.rarity === 'PLATINUM' ? a.rarity : null}><Medal icon={a.icon} rarity={a.rarity} size={64} /></Holo>
                    <span className="mt-1.5 line-clamp-2 text-xs font-bold leading-tight">{a.name}</span>
                    {a.pct != null && <span className="text-[11px] text-texto-suave">{rarityLabel(a.pct)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </ShowcaseCard>
        )
        if (b === 'RAREST' && data.RAREST) return (
          <ShowcaseCard key={b} i={i} title="Logros más raros" icon={<Gem className="h-4 w-4 text-[#2f8fa3]" />}>
            {data.RAREST.length === 0 ? <p className="text-sm text-texto-suave">Todavía sin logros.</p> : (
              <ul className="space-y-2.5">
                {data.RAREST.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <Holo foil={a.rarity === 'GOLD' || a.rarity === 'PLATINUM' ? a.rarity : null}><Medal icon={a.icon} rarity={a.rarity} size={44} /></Holo>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold leading-tight">{a.name}</span>
                      <span className="block truncate text-xs text-texto-suave">{a.description}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-papel px-2 py-0.5 text-xs font-bold tabular-nums">{rarityLabel(a.pct)}</span>
                  </li>
                ))}
              </ul>
            )}
          </ShowcaseCard>
        )
        if (b === 'COLLECTION' && data.COLLECTION) return (
          <ShowcaseCard key={b} i={i} wide title="Colección" icon={<Package className="h-4 w-4 text-[#8b5cf6]" />}>
            <div className="mb-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--meter-track)]">
                <div className="xp-fill h-full rounded-full" style={{ width: `${(data.COLLECTION.owned / Math.max(1, data.COLLECTION.total)) * 100}%` }} />
              </div>
              <span className="text-sm font-bold tabular-nums">{data.COLLECTION.owned} de {data.COLLECTION.total}</span>
            </div>
            {data.COLLECTION.items.length > 0 && (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {data.COLLECTION.items.map((c, k) => (
                  <li key={c.id} className="tp-pop flex flex-col items-center gap-1 rounded-xl bg-papel/70 p-2 text-center" style={{ '--i': k } as CSSProperties}>
                    <div className="flex h-16 items-center justify-center"><CosmeticPreview c={c} size={46} avatar={profile.avatar?.value} /></div>
                    <span className="max-w-full truncate text-xs font-bold">{c.name}</span>
                    <RarityBadge rarity={c.rarity} />
                  </li>
                ))}
              </ul>
            )}
          </ShowcaseCard>
        )
        if (b === 'PROJECT' && data.PROJECT) return (
          <ShowcaseCard key={b} i={i} title="Proyecto destacado" icon={<Rocket className="h-4 w-4 text-estado-info" />}>
            <a href={data.PROJECT.url} target="_blank" rel="noopener noreferrer nofollow"
              className="group flex items-center gap-3 rounded-xl border border-linea p-3 transition-colors hover:border-tinta-500">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow">
                <ExternalLink className="h-5 w-5 transition-transform group-hover:scale-110" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{data.PROJECT.title}</span>
                <span className="block truncate text-xs text-texto-suave">{linkHost(data.PROJECT.url)}</span>
              </span>
            </a>
            {data.PROJECT.note && <p className="mt-2 text-sm text-texto-suave">{data.PROJECT.note}</p>}
          </ShowcaseCard>
        )
        if (b === 'COURSE' && data.COURSE) return (
          <ShowcaseCard key={b} i={i} title="Curso favorito" icon={<BookOpen className="h-4 w-4 text-estado-ok" />}>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow"><Heart className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block truncate font-display text-xl font-bold">{data.COURSE.name}</span>
                {data.COURSE.teacher && <span className="block truncate text-xs text-texto-suave">con {data.COURSE.teacher}</span>}
              </span>
            </div>
            {data.COURSE.note && <p className="mt-2 text-sm italic text-texto-suave">“{data.COURSE.note}”</p>}
          </ShowcaseCard>
        )
        if (b === 'STREAK' && data.STREAK) return (
          <ShowcaseCard key={b} i={i} title="Racha" icon={<Flame className="h-4 w-4 text-estado-tarde" />}>
            <div className="flex items-center gap-4">
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg">
                <Flame className={cn('h-9 w-9', data.STREAK.current > 0 && 'animate-pulse')} />
              </span>
              <div>
                <p className="font-display text-4xl font-bold leading-none tabular-nums">{data.STREAK.current}</p>
                <p className="text-sm text-texto-suave">entregas seguidas a tiempo · mejor racha: <b>{data.STREAK.best}</b></p>
              </div>
            </div>
          </ShowcaseCard>
        )
        if (b === 'STATS' && data.STATS) return (
          <ShowcaseCard key={b} i={i} title="Estadísticas" icon={<Target className="h-4 w-4 text-estado-info" />}>
            <dl className="grid grid-cols-2 gap-2">
              {[
                ['A tiempo', data.STATS.on_time], ['Anticipadas', data.STATS.early], ['Con A o AD', data.STATS.high], ['Reconocimientos', data.STATS.recognitions],
              ].map(([label, v]) => (
                <div key={label} className="rounded-xl bg-papel px-3 py-2">
                  <dt className="text-xs text-texto-suave">{label}</dt>
                  <dd className="font-display text-2xl font-bold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </ShowcaseCard>
        )
        if (b === 'PINS') return (
          <ShowcaseCard key={b} i={i} title="Estrellas Tesla" icon={<Star className="h-4 w-4 text-chispa-600" />}>
            <div className="flex justify-between gap-2">
              {[1, 2, 3, 4].map((t) => (
                <div key={t} className="flex flex-col items-center text-center">
                  <RankPin tier={t} stars={rank.tier >= t ? (t === rank.tier ? rank.stars : 3) : 0} size={44} locked={rank.tier < t} />
                  <span className={cn('mt-1 text-[11px] font-bold leading-tight', rank.tier >= t ? PIN_TEXT[t] : 'text-texto-suave')}>{PIN_NAMES[t].replace('Estrella de ', '')}</span>
                  {delivered.has(t) && <Check className="h-3.5 w-3.5 text-estado-ok" aria-label="Pin entregado" />}
                </div>
              ))}
            </div>
          </ShowcaseCard>
        )
        if (b === 'SPARKS' && data.SPARKS) return (
          <ShowcaseCard key={b} i={i} title="Chispas" icon={<Sparkles className="h-4 w-4 text-chispa-600" />}>
            <p className="font-display text-4xl font-bold leading-none tabular-nums">{data.SPARKS.total}<span className="ml-2 text-base font-normal text-texto-suave">de sus compañeros</span></p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {SPARK_KINDS.filter((k) => data.SPARKS!.kinds[k.value]).map((k) => (
                <li key={k.value} className="rounded-full bg-papel px-2.5 py-1 text-sm">{k.emoji} {k.label} <b>×{data.SPARKS!.kinds[k.value]}</b></li>
              ))}
            </ul>
          </ShowcaseCard>
        )
        if (b === 'RECENT' && data.RECENT) return (
          <ShowcaseCard key={b} i={i} title="Últimos logros" icon={<Trophy className="h-4 w-4 text-chispa-600" />}>
            {data.RECENT.length === 0 ? <p className="text-sm text-texto-suave">Todavía sin logros.</p> : (
              <ul className="grid grid-cols-2 gap-2">
                {data.RECENT.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Medal icon={a.icon} rarity={a.rarity} size={36} />
                    <span className="min-w-0"><span className="block truncate text-sm font-bold">{a.name}</span><span className="block text-xs text-texto-suave">{formatShort(a.earned_at)}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </ShowcaseCard>
        )
        return null
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chispas entre compañeros
// ---------------------------------------------------------------------------
export function SparkButton({ profile, onDone }: { profile: TeslaProfile; onDone: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<SparkKind | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: today, reload } = useAsync(() => (open ? mySparksToday() : Promise.resolve(null)), [open], { live: false })
  const already = !!today?.given_to.map(Number).includes(profile.student_id)

  async function send() {
    if (!kind) return
    setBusy(true)
    try {
      const r = await giveSpark(profile.student_id, kind)
      toast(`⚡ Le diste una chispa a ${profile.first_name ?? 'tu compañero'}. Te quedan ${r.left_today} hoy.`)
      setOpen(false)
      setKind(null)
      onDone()
    } catch (err) {
      toast(toMessage(err), 'error')
      void reload(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4" />Dar chispa</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Dar una chispa a ${profile.first_name ?? 'tu compañero'}`}>
        <p className="text-sm text-texto-suave">
          Las chispas reconocen algo bueno que hizo un compañero. Puedes dar 3 al día (una por compañero).
          {today && <> Hoy te quedan <b>{today.left}</b>.</>}
        </p>
        {already ? (
          <p className="mt-4 rounded-xl bg-papel p-3 text-sm">Hoy ya le diste una chispa. ¡Mañana podrás darle otra!</p>
        ) : (
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {SPARK_KINDS.map((k) => (
              <li key={k.value}>
                <button type="button" aria-pressed={kind === k.value} onClick={() => setKind(k.value)}
                  className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left font-bold transition-colors',
                    kind === k.value ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
                  <span className="text-2xl" aria-hidden>{k.emoji}</span>{k.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => void send()} loading={busy} disabled={!kind || already || today?.left === 0}><Zap className="h-4 w-4" />Enviar chispa</Button>
        </div>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Compartir
// ---------------------------------------------------------------------------
export function ShareButton({ profile }: { profile: TeslaProfile }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function share() {
    setBusy(true)
    try {
      const r = await shareProfileCard(profile)
      if (r === 'downloaded') toast('Tarjeta descargada. ¡Compártela con tu familia!')
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return <Button size="sm" variant="secondary" loading={busy} onClick={() => void share()}><Share2 className="h-4 w-4" />Compartir</Button>
}

// ---------------------------------------------------------------------------
// Retos: misiones semanales y pase de temporada
// ---------------------------------------------------------------------------
function RewardLine({ xp, coins }: { xp: number; coins: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-sm">
      {xp > 0 && <span className="font-bold text-estado-info tabular-nums">+{xp} XP</span>}
      {coins > 0 && <CoinAmount value={coins} signed />}
    </span>
  )
}

export function RetosTab({ profile, onChange }: { profile: TeslaProfile; onChange: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const [missions, season] = await Promise.all([getMissions(profile.student_id), getSeason(profile.student_id)])
    return { missions, season }
  }, [profile.student_id])

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id)
    try {
      await fn()
      toast(ok)
      await reload(true)
      onChange()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="cards" />
  const { missions, season } = data
  const maxXp = season.rewards.length ? season.rewards[season.rewards.length - 1].xp_needed : 1

  return (
    <div className="space-y-6">
      <Panel title="Misiones de la semana" action={<span className="text-sm text-texto-suave">{formatShort(missions.week_start)} – {formatShort(missions.week_end)} · se renuevan el lunes</span>}>
        {missions.missions.length === 0 ? <Empty title="No hay misiones esta semana" art="tasks" compact /> : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {missions.missions.map((m) => {
              const done = m.progress >= m.target
              return (
                <li key={m.id} className={cn('flex gap-3 rounded-xl border p-3', m.claimed ? 'border-estado-ok/40 bg-estado-ok/5' : done ? 'border-chispa bg-chispa-100/40' : 'border-linea')}>
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', done ? 'bg-chispa text-tinta' : 'bg-papel text-texto-suave')}>
                    <TeslaIcon name={m.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{m.name}</p>
                    <p className="text-sm text-texto-suave">{m.description}</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--meter-track)]">
                      <div className="xp-fill h-full rounded-full transition-[width] duration-700" style={{ width: `${(m.progress / m.target) * 100}%` }} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-texto-suave tabular-nums">{m.progress} de {m.target}</span>
                      <RewardLine xp={m.reward_xp} coins={m.reward_coins} />
                    </div>
                    {m.claimed ? <Badge tone="ok" className="mt-2"><Check className="h-3 w-3" />Reclamada</Badge>
                      : done && profile.is_self ? (
                        <Button size="sm" className="mt-2" loading={busy === `m${m.id}`}
                          onClick={() => void run(`m${m.id}`, () => claimMission(m.id), `¡Misión cumplida! +${m.reward_xp} XP`)}>
                          <Gift className="h-4 w-4" />Reclamar
                        </Button>
                      ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title={season.period ? `Pase de temporada · ${season.period.name}` : 'Pase de temporada'}
        action={season.period && <span className="text-sm text-texto-suave">hasta el {formatShort(season.period.ends_on)}</span>}
      >
        {!season.period ? (
          <Empty title="No hay una temporada en curso" art="notebook" compact>La temporada coincide con el bimestre del colegio.</Empty>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p><span className="font-display text-3xl font-bold tabular-nums">{season.xp.toLocaleString('es-PE')}</span> <span className="text-texto-suave">XP de temporada</span></p>
              <p className="text-sm text-texto-suave">Toda la XP que ganas este bimestre cuenta. Los premios exclusivos no vuelven.</p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--meter-track)]">
              <div className="xp-fill h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (season.xp / maxXp) * 100)}%` }} />
            </div>
            <ol className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
              {season.rewards.map((r) => {
                const reached = season.xp >= r.xp_needed
                return (
                  <li key={r.id} className={cn('flex w-40 shrink-0 snap-start flex-col items-center rounded-2xl border p-3 text-center',
                    r.claimed ? 'border-estado-ok/40' : reached ? 'border-chispa shadow-[0_0_0_3px_rgba(240,180,41,0.25)]' : 'border-dashed border-linea')}>
                    <span className={cn('mb-2 rounded-full px-2 py-0.5 text-xs font-bold', reached ? 'bg-chispa text-tinta' : 'bg-papel text-texto-suave')}>Nivel {r.tier}</span>
                    <div className={cn('flex h-24 items-center justify-center', !reached && 'opacity-50 grayscale')}>
                      {r.cosmetic ? <CosmeticPreview c={r.cosmetic} size={56} avatar={profile.avatar?.value} />
                        : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-chispa-100"><Coins className="h-7 w-7 text-chispa-600" /></span>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-bold leading-tight">{r.cosmetic ? r.cosmetic.name : `${r.coins} monedas`}</p>
                    <p className="text-xs text-texto-suave">{r.cosmetic ? KIND_LABEL[r.cosmetic.kind] : 'Monedas'}{r.cosmetic && r.coins ? ` + ${r.coins} monedas` : ''}</p>
                    <p className="mt-1 text-xs text-texto-suave tabular-nums">{r.xp_needed} XP</p>
                    <div className="mt-2">
                      {r.claimed ? <Badge tone="ok"><Check className="h-3 w-3" />Tuyo</Badge>
                        : reached && profile.is_self ? (
                          <Button size="sm" loading={busy === `s${r.id}`}
                            onClick={() => void run(`s${r.id}`, () => claimSeasonReward(r.id), r.cosmetic ? `¡«${r.cosmetic.name}» es tuyo!` : `+${r.coins} monedas`)}>
                            Reclamar
                          </Button>
                        ) : !reached ? <Lock className="h-4 w-4 text-texto-suave" aria-label="Bloqueado" /> : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          </>
        )}
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cofres sorpresa
// ---------------------------------------------------------------------------
const CHEST_COLORS: Record<Rarity, string> = { BRONZE: '#d08a4e', SILVER: '#cbd5e1', GOLD: '#f5c451', PLATINUM: '#67e8f9' }

function ChestArt({ chest, size = 96, className }: { chest: Pick<Chest, 'w_gold' | 'w_platinum'>; size?: number; className?: string }) {
  const premium = chest.w_platinum + chest.w_gold > 40
  const body = premium ? ['#1e3a8a', '#0b1d33'] : ['#92400e', '#5a2d0c']
  return (
    <svg viewBox="0 0 64 56" width={size} height={size * 0.875} className={className} aria-hidden>
      <defs>
        <linearGradient id={`cb${premium ? 1 : 0}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={body[0]} /><stop offset="1" stopColor={body[1]} /></linearGradient>
        <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1bf" /><stop offset="0.5" stopColor="#f5c451" /><stop offset="1" stopColor="#a8740c" /></linearGradient>
      </defs>
      <path d="M6 24 Q6 6 32 6 Q58 6 58 24 Z" fill={`url(#cb${premium ? 1 : 0})`} stroke="#3b1d06" strokeWidth="1.2" />
      <rect x="6" y="24" width="52" height="28" rx="3" fill={`url(#cb${premium ? 1 : 0})`} stroke="#3b1d06" strokeWidth="1.2" />
      <rect x="6" y="22" width="52" height="5" fill="url(#cg)" />
      <rect x="14" y="7" width="5" height="45" fill="url(#cg)" opacity="0.9" />
      <rect x="45" y="7" width="5" height="45" fill="url(#cg)" opacity="0.9" />
      <rect x="27" y="22" width="10" height="13" rx="2" fill="url(#cg)" stroke="#6b4906" strokeWidth="0.8" />
      <circle cx="32" cy="28" r="1.8" fill="#3b1d06" />
      {premium && <path d="M33 10 l-4 7 h3 l-2 6 l6 -8 h-3 l2 -5 z" fill="#fde047" />}
    </svg>
  )
}

export function CofresTab({ profile, onChange }: { profile: TeslaProfile; onChange: () => void }) {
  const toast = useToast()
  const [opening, setOpening] = useState<{ chest: Chest; result: ChestResult | null } | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const [chests, cosmetics, owned] = await Promise.all([listChests(), listCosmetics(), listOwnedCosmetics(profile.student_id)])
    return { chests, pool: cosmetics.filter((c) => c.unlock_type === 'CHEST'), owned: new Set(owned) }
  }, [profile.student_id], { live: false })

  async function open(chest: Chest) {
    if (!confirm(`¿Abrir «${chest.name}» por ${chest.price} monedas?`)) return
    setOpening({ chest, result: null })
    playSound('chest')
    const started = Date.now()
    try {
      const result = await openChest(chest.id)
      // Deja terminar la animación del cofre antes de mostrar el premio.
      await new Promise((r) => setTimeout(r, Math.max(0, 1000 - (Date.now() - started))))
      setOpening({ chest, result })
      playSound('reveal')
      void reload(true)
      onChange()
    } catch (err) {
      setOpening(null)
      toast(toMessage(err), 'error')
    }
  }

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="cards" />
  const coins = profile.coins ?? 0
  const result = opening?.result

  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-superficie p-3 text-sm text-texto-suave">
        Los cofres se abren <b>solo con monedas ganadas</b> en el campus (nunca con dinero). Cada uno muestra sus probabilidades.
        Si ya tienes todos sus premios, te devolvemos la mitad de las monedas.
      </p>
      {data.chests.length === 0 ? <Empty title="No hay cofres disponibles" art="tasks" /> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.chests.map((ch) => {
            const odds = chestOdds(ch)
            return (
              <li key={ch.id} className="flex flex-col rounded-2xl border border-linea bg-superficie p-5">
                <div className="flex items-center gap-4">
                  <ChestArt chest={ch} size={88} className="drop-shadow-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl font-bold">{ch.name}</p>
                    <p className="text-sm text-texto-suave">{ch.description}</p>
                    <CoinAmount value={ch.price} className="mt-1 text-lg" />
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5" aria-label="Probabilidades">
                  {RARITIES.filter((r) => odds[r] > 0).map((r) => (
                    <li key={r} className="flex items-center gap-2 text-sm">
                      <span className="w-14 shrink-0"><RarityBadge rarity={r} /></span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--meter-track)]">
                        <span className="block h-full rounded-full" style={{ width: `${odds[r] * 100}%`, background: CHEST_COLORS[r] }} />
                      </span>
                      <span className="w-12 text-right tabular-nums text-texto-suave">{(odds[r] * 100).toFixed(odds[r] < 0.1 ? 1 : 0)}%</span>
                    </li>
                  ))}
                </ul>
                {profile.is_self && (
                  <Button className="mt-4" disabled={coins < ch.price || !!opening} onClick={() => void open(ch)}>
                    <Gift className="h-4 w-4" />{coins < ch.price ? `Te faltan ${ch.price - coins} monedas` : 'Abrir cofre'}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Panel title="Premios que pueden salir" action={<span className="text-sm text-texto-suave">{data.pool.filter((c) => data.owned.has(c.id)).length} de {data.pool.length} conseguidos</span>}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.pool.map((c) => {
            const have = data.owned.has(c.id)
            return (
              <li key={c.id} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center', have ? 'border-linea' : 'border-dashed border-linea')}>
                <div className={cn('flex h-20 items-center justify-center', !have && 'opacity-60')}><CosmeticPreview c={c} size={52} avatar={profile.avatar?.value} /></div>
                <p className="text-sm font-bold leading-tight">{c.name}</p>
                <p className="text-xs text-texto-suave">{KIND_LABEL[c.kind]}{isAnimatedArt(c.value) ? ' · animado' : ''}</p>
                <span className="flex items-center gap-1.5"><RarityBadge rarity={c.rarity} />{have && <Check className="h-3.5 w-3.5 text-estado-ok" aria-label="Lo tienes" />}</span>
              </li>
            )
          })}
        </ul>
      </Panel>

      {opening && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#050b18]/90 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Abriendo cofre">
          {!result ? (
            <div className="flex flex-col items-center text-white">
              <ChestArt chest={opening.chest} size={180} className="chest-shake drop-shadow-2xl" />
              <p className="mt-4 font-display text-xl font-bold">Abriendo…</p>
            </div>
          ) : (
            <div className="chest-reveal flex max-w-sm flex-col items-center text-center text-white">
              <div className={cn('flex h-44 w-44 items-center justify-center rounded-3xl bg-white/10', `chest-glow-${result.cosmetic.rarity}`)}>
                <CosmeticPreview c={result.cosmetic} size={96} avatar={profile.avatar?.value} />
              </div>
              <p className="mt-5 text-sm font-bold uppercase tracking-[0.2em]" style={{ color: CHEST_COLORS[result.cosmetic.rarity] }}>
                {RARITY_LABEL[result.cosmetic.rarity]}{result.duplicate ? ' · repetido' : ''}
              </p>
              <h2 className="mt-1 font-display text-3xl font-bold">{result.cosmetic.name}</h2>
              <p className="text-white/75">{KIND_LABEL[result.cosmetic.kind]}</p>
              <p className="mt-3 text-white/80">
                {result.duplicate ? `Ya lo tenías: te devolvimos ${result.refund} monedas.` : '¡Es tuyo! Equípalo en la pestaña Personalizar.'}
              </p>
              <Button className="mt-6" onClick={() => setOpening(null)}>¡Genial!</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trayectoria
// ---------------------------------------------------------------------------
function TimelineIcon({ e }: { e: TimelineEvent }) {
  switch (e.type) {
    case 'ACHIEVEMENT': return <Medal icon={e.icon ?? 'Trophy'} rarity={e.rarity ?? 'BRONZE'} size={40} />
    case 'PIN': return <RankPin tier={e.tier ?? 1} size={36} />
    case 'PIN_DELIVERED': return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-estado-ok/15 text-estado-ok"><PackageCheck className="h-5 w-5" /></span>
    case 'LEVEL': return <span className="level-chip flex h-10 w-10 items-center justify-center rounded-full"><Zap className="h-5 w-5 text-chispa" /></span>
    case 'SPARKS': return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-chispa-100 text-chispa-600"><Sparkles className="h-5 w-5" /></span>
    case 'SEASON': return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ede9fe] text-[#7c3aed]"><Gift className="h-5 w-5" /></span>
    case 'RECOGNITION': return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-estado-alerta/10 text-estado-alerta"><Heart className="h-5 w-5" /></span>
    default: return <MedalIcon className="h-5 w-5" />
  }
}

export function TrayectoriaTab({ studentId }: { studentId: number }) {
  const { data, loading, error, reload } = useAsync(() => getTimeline(studentId), [studentId])
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />
  if (data.length === 0) return <Empty title="La historia recién empieza" art="tasks">Cada nivel, logro, Estrella y chispa aparecerá aquí.</Empty>
  return (
    <Panel>
      <ol className="relative ml-5 border-l-2 border-linea">
        {data.map((e, i) => (
          <li key={`${e.type}-${e.at}-${i}`} className="relative mb-5 pl-8 last:mb-0">
            <span className="absolute -left-[21px] top-0 flex h-10 w-10 items-center justify-center rounded-full bg-superficie">
              <TimelineIcon e={e} />
            </span>
            <p className="pt-1 font-bold leading-tight">{e.title}</p>
            {e.detail && <p className="text-sm text-texto-suave">{e.detail}</p>}
            <p className="mt-0.5 text-xs text-texto-suave">{formatShort(e.at)}</p>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Muro de felicitaciones (solo stickers y frases predefinidas)
// ---------------------------------------------------------------------------
const stickerEmoji = (s: WallSticker) => WALL_STICKERS.find((x) => x.value === s)?.emoji ?? '⚡'

export function WallTab({ profile, compact, onChange }: { profile: TeslaProfile; compact?: boolean; onChange?: () => void }) {
  const toast = useToast()
  const [sticker, setSticker] = useState<WallSticker | null>(null)
  const [phrase, setPhrase] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<number | null>(null)
  const { data, loading, error, reload } = useAsync(() => getWall(profile.student_id), [profile.student_id])
  const canPost = !profile.is_self && profile.wall_enabled !== false

  async function send() {
    if (!sticker || !phrase) return
    setBusy(true)
    try {
      const id = await postWall(profile.student_id, sticker, phrase)
      playSound('pop')
      setFresh(Number(id))
      setSticker(null)
      setPhrase(null)
      toast(`🎉 Le dejaste una felicitación a ${profile.first_name ?? 'tu compañero'}.`)
      await reload(true)
      onChange?.()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!confirm('¿Quitar este mensaje del muro?')) return
    try {
      await removeWallPost(id)
      await reload(true)
      onChange?.()
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  if (error) {
    return compact ? null : <ErrorBox message={/tesla_wall|function/i.test(error) ? 'El muro estará disponible cuando la dirección ejecute el script 22.' : error} onRetry={() => void reload()} />
  }
  const posts = data ?? []
  const shown = compact ? posts.slice(0, 4) : posts

  return (
    <div className="space-y-4">
      {canPost && !compact && (
        <Panel title={`Felicitar a ${profile.first_name ?? 'este alumno'}`} className="tp-card">
          <p className="text-sm text-texto-suave">Elige un sticker y una frase. Puedes dejar una felicitación por día.</p>
          <ul className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-12" aria-label="Stickers">
            {WALL_STICKERS.map((s) => (
              <li key={s.value}>
                <button type="button" aria-pressed={sticker === s.value} aria-label={s.label} title={s.label} onClick={() => setSticker(s.value)}
                  className={cn('wall-sticker flex aspect-square w-full items-center justify-center rounded-xl border text-2xl',
                    sticker === s.value ? 'border-tinta bg-chispa-100 shadow-inner' : 'border-linea hover:border-tinta-500')}>
                  {s.emoji}
                </button>
              </li>
            ))}
          </ul>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Frases">
            {WALL_PHRASES.map((p) => (
              <li key={p.value}>
                <button type="button" aria-pressed={phrase === p.value} onClick={() => setPhrase(p.value)}
                  className={cn('rounded-full border px-3 py-1.5 text-sm font-bold transition-colors',
                    phrase === p.value ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-texto-suave">
              {sticker && phrase ? <>Vista previa: <span className="text-lg">{stickerEmoji(sticker)}</span> <b>{WALL_PHRASES.find((p) => p.value === phrase)?.label}</b></> : 'Elige un sticker y una frase.'}
            </p>
            <Button onClick={() => void send()} loading={busy} disabled={!sticker || !phrase}><Send className="h-4 w-4" />Publicar</Button>
          </div>
        </Panel>
      )}
      {!compact && profile.wall_enabled === false && !profile.is_self && (
        <p className="rounded-xl bg-superficie p-3 text-sm text-texto-suave">{profile.first_name ?? 'Este alumno'} cerró su muro por ahora.</p>
      )}

      <section className={cn(compact ? '' : 'tp-card rounded-2xl border border-linea bg-superficie p-4')}>
        {!compact && <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-texto-suave">Mensajes ({posts.length})</h3>}
        {loading && !data ? <Loading rows={2} /> : shown.length === 0 ? (
          <p className="text-sm text-texto-suave">{profile.is_self ? 'Cuando tus compañeros, tu familia o tus docentes te feliciten, aparecerá aquí.' : 'Todavía no hay mensajes. ¡Sé el primero en felicitar!'}</p>
        ) : (
          <ul className={cn('grid gap-3', !compact && 'sm:grid-cols-2')}>
            {shown.map((w, i) => (
              <li key={w.id} className={cn('tp-rise flex items-center gap-3 rounded-xl bg-papel/70 p-3', fresh === w.id && 'wall-new')} style={{ '--i': i } as CSSProperties}>
                <span className="wall-sticker wall-bob shrink-0 text-4xl" style={{ '--i': i } as CSSProperties} aria-hidden>{stickerEmoji(w.sticker)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg font-bold leading-tight">{w.text}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-texto-suave">
                    {w.author.kind === 'STUDENT' ? (
                      <MiniProfileHover studentId={w.author.student_id} className="inline-flex">
                        <Link to={`/perfil-tesla/${w.author.student_id}`} className="inline-flex items-center gap-1.5 font-bold hover:underline">
                          <TeslaAvatar emoji={w.author.avatar} frame={w.author.frame} size={20} />{w.author.name}
                        </Link>
                      </MiniProfileHover>
                    ) : (
                      <b>{w.author.name}{w.author.kind === 'STAFF' && <span className="font-normal"> · {w.author.role}</span>}</b>
                    )}
                    <span aria-hidden>·</span>{formatShort(w.created_at)}
                  </p>
                </div>
                {w.can_remove && !compact && (
                  <button type="button" onClick={() => void remove(w.id)} className="rounded-lg p-2 text-texto-suave hover:bg-superficie hover:text-estado-alerta" aria-label="Quitar mensaje">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
