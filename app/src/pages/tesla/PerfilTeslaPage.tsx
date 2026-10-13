import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Award, Check, EyeOff, Gift, Heart, Lock, Medal as MedalIcon, Sparkles, Trash2, Users } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Loading, Panel, Segmented, Textarea } from '@/components/ui'
import {
  ArtLayer, CoinAmount, Medal, NameFx, PinPath, ProfileBackdrop, ProfileHero, RankPin, RarityBadge, TeslaAvatar, artAccent, isAnimatedArt, type HeroPreview,
} from '@/components/tesla'
import { CofresTab, RetosTab, ShareButton, ShowcaseSection, SparkButton, TrayectoriaTab } from '@/pages/tesla/PerfilTeslaExtras'
import { AdjustModal, AwardModal, RecognizeModal } from '@/components/TeslaActions'
import { ProgressRing } from '@/components/course'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, limaToday } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  CONDITION_LABEL, GOAL_METRIC_LABEL, KIND_LABEL, LEDGER_SOURCE, RARITY_LABEL, buyCosmetic, clearBio, getProfile, getProgress,
  SHOWCASE_LABEL, listAchievements, listBoard, listClassroomCards, listCosmetics, listEarned, listGoals, listLedger, listOwnedCosmetics, saveMyProfile,
  statFor, unlockHint, type ShowcaseBlock,
  type Achievement, type ClassroomGoal, type Cosmetic, type CosmeticKind, type TeslaProfile,
} from '@/services/tesla'

type Tab = 'logros' | 'retos' | 'cofres' | 'trayectoria' | 'historial' | 'aula' | 'personalizar'

// ---------------------------------------------------------------------------
// Logros
// ---------------------------------------------------------------------------
function AchievementsTab({ profile }: { profile: TeslaProfile }) {
  const priv = profile.coins !== undefined
  const { data, loading, error, reload } = useAsync(async () => {
    const [catalog, earned, progress] = await Promise.all([
      listAchievements(), listEarned(profile.student_id), priv ? getProgress(profile.student_id) : Promise.resolve(null),
    ])
    return { catalog, earned, progress }
  }, [profile.student_id, priv])

  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="cards" />

  const earnedBy = new Map<number, { count: number; last: string; note: string | null }>()
  for (const e of data.earned) {
    const cur = earnedBy.get(e.achievement_id)
    earnedBy.set(e.achievement_id, { count: (cur?.count ?? 0) + 1, last: cur?.last ?? e.earned_at, note: cur?.note ?? e.note })
  }
  const earned = data.catalog.filter((a) => earnedBy.has(a.id))
    .sort((a, b) => Date.parse(earnedBy.get(b.id)!.last) - Date.parse(earnedBy.get(a.id)!.last))
  const pending = data.catalog.filter((a) => !earnedBy.has(a.id) && !a.is_secret)
  const secretsLeft = Math.max(0, (data.progress?.secret_total ?? 0) - earned.filter((a) => a.is_secret).length)
  const season = data.progress?.period

  const progressOf = (a: Achievement) => {
    if (!data.progress || a.condition_type === 'MANUAL') return null
    const v = statFor(a.is_seasonal ? data.progress.season : data.progress.all, a.condition_type)
    return { v: Math.min(v, a.threshold), max: a.threshold }
  }

  return (
    <div className="space-y-6">
      <PinPath profile={profile} />
      <div className="flex flex-wrap gap-2">
        {(['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const).map((r) => (
          <span key={r} className="inline-flex items-center gap-2 rounded-xl border border-linea bg-superficie px-3 py-2">
            <Medal icon="Trophy" rarity={r} size={28} />
            <span className="text-sm"><b className="font-display text-lg">{profile.counts[r]}</b> {RARITY_LABEL[r].toLowerCase()}</span>
          </span>
        ))}
      </div>

      <Panel title={`Obtenidos (${earned.length})`}>
        {earned.length === 0 ? (
          <Empty title="Todavía no hay logros" art="grades" compact>Entregar a tiempo es la forma más rápida de ganar el primero.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {earned.map((a) => {
              const e = earnedBy.get(a.id)!
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-linea p-3">
                  <span className="medal-pop"><Medal icon={a.icon} rarity={a.rarity} size={52} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{a.name}{e.count > 1 && <span className="ml-1 text-sm text-texto-suave">×{e.count}</span>}</p>
                    <p className="text-sm text-texto-suave">{a.description}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-texto-suave">
                      <RarityBadge rarity={a.rarity} />
                      <span>{formatShort(e.last)}</span>
                      {a.is_seasonal && <Badge tone="spark">Temporada</Badge>}
                      {a.is_secret && <Badge tone="info">Secreto</Badge>}
                    </p>
                    {e.note && <p className="mt-1 text-xs italic text-texto-suave">“{e.note}”</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {(pending.length > 0 || secretsLeft > 0) && (
        <Panel title="Por desbloquear">
          {season && pending.some((a) => a.is_seasonal) && (
            <p className="mb-3 text-sm text-texto-suave">Los logros de temporada cuentan solo lo que haces en el {season.name} y se pueden volver a ganar cada bimestre.</p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((a) => {
              const p = progressOf(a)
              return (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-dashed border-linea p-3">
                  <Medal icon={a.icon} rarity={a.rarity} size={52} locked />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{a.name}</p>
                    <p className="text-sm text-texto-suave">{a.description}</p>
                    {p ? (
                      <div className="mt-1.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--meter-track)]">
                          <div className="xp-fill h-full rounded-full" style={{ width: `${(p.v / p.max) * 100}%` }} />
                        </div>
                        <p className="mt-0.5 text-xs text-texto-suave tabular-nums">{p.v} de {p.max}{a.is_seasonal ? ' este bimestre' : ''}</p>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-xs text-texto-suave">{a.condition_type === 'MANUAL' ? CONDITION_LABEL.MANUAL : <RarityBadge rarity={a.rarity} />}</p>
                    )}
                  </div>
                </li>
              )
            })}
            {Array.from({ length: Math.min(secretsLeft, 6) }).map((_, i) => (
              <li key={`s${i}`} className="flex items-center gap-3 rounded-xl border border-dashed border-linea p-3">
                <Medal icon="Lock" rarity="PLATINUM" size={52} locked secret />
                <div>
                  <p className="font-bold">Logro secreto</p>
                  <p className="text-sm text-texto-suave">Se revela cuando lo consigas.</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Historial de puntos
// ---------------------------------------------------------------------------
function HistoryTab({ studentId }: { studentId: number }) {
  const { data, loading, error, reload } = useAsync(() => listLedger(studentId, 80), [studentId])
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />
  if (data.length === 0) return <Empty title="Sin movimientos todavía" art="tasks">Aquí aparecerá cada punto ganado o gastado.</Empty>
  return (
    <Panel bodyClassName="p-0">
      <ul className="divide-y divide-linea">
        {data.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              r.source === 'RECOGNITION' ? 'bg-estado-alerta/10 text-estado-alerta' : r.coins < 0 ? 'bg-papel text-texto-suave' : 'bg-chispa-100 text-tinta')}>
              {r.source === 'RECOGNITION' ? <Heart className="h-4 w-4" /> : r.source === 'ACHIEVEMENT' ? <MedalIcon className="h-4 w-4" />
                : r.source === 'GOAL' ? <Users className="h-4 w-4" /> : r.coins < 0 || r.source === 'REFUND' ? <Gift className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{r.reason}</p>
              <p className="text-xs text-texto-suave">{LEDGER_SOURCE[r.source]} · {formatShort(r.created_at)}</p>
            </div>
            <div className="text-right text-sm">
              {r.xp > 0 && <p className="font-bold text-estado-info tabular-nums">+{r.xp} XP</p>}
              {r.coins !== 0 && <CoinAmount value={r.coins} signed className={r.coins < 0 ? 'text-texto-suave' : ''} />}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Mi aula: metas cooperativas, ranking opcional y compañeros
// ---------------------------------------------------------------------------
export function GoalCard({ goal, actions }: { goal: ClassroomGoal; actions?: ReactNode }) {
  const v = Math.min(1, goal.progress / goal.target)
  const unit = GOAL_METRIC_LABEL[goal.metric]
  const ended = goal.status === 'ACTIVE' && goal.ends_on < limaToday()
  return (
    <li className="flex items-center gap-4 rounded-xl border border-linea p-4">
      <ProgressRing value={v} size={64} stroke={6} trackClass="text-[var(--meter-track)]" barClass={goal.status === 'COMPLETED' ? 'text-estado-ok' : 'text-chispa'} >
        {goal.status === 'COMPLETED' ? <Check className="h-6 w-6 text-estado-ok" /> : `${Math.round(v * 100)}%`}
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-bold">
          {goal.title}
          {goal.status === 'COMPLETED' && <Badge tone="ok">¡Cumplida!</Badge>}
          {ended && <Badge>No se alcanzó</Badge>}
        </p>
        {goal.description && <p className="text-sm text-texto-suave">{goal.description}</p>}
        <p className="text-sm text-texto-suave tabular-nums">
          {goal.progress.toLocaleString('es-PE')} de {goal.target.toLocaleString('es-PE')} {unit.unit} · hasta el {formatShort(goal.ends_on)}
        </p>
        {(goal.reward_text || goal.reward_xp > 0 || goal.reward_coins > 0) && (
          <p className="mt-1 text-sm"><Gift className="mr-1 inline h-4 w-4 text-chispa-600" />
            {[goal.reward_text, goal.reward_xp ? `+${goal.reward_xp} XP` : '', goal.reward_coins ? `+${goal.reward_coins} monedas` : ''].filter(Boolean).join(' · ')} para todo el aula
          </p>
        )}
      </div>
      {actions}
    </li>
  )
}

export function ConstancyBoard({ classroomId, highlightOnly }: { classroomId: number; highlightOnly?: boolean }) {
  const [mode, setMode] = useState<'CONSTANCY' | 'IMPROVEMENT'>('CONSTANCY')
  const { data, loading } = useAsync(() => listBoard(classroomId, mode), [classroomId, mode])
  if (loading && !data) return <Loading rows={3} />
  if (!data || data.length === 0) {
    return <p className="text-sm text-texto-suave">El ranking aparece cuando el aula suma puntos de constancia en el bimestre (o la dirección lo desactivó).</p>
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'CONSTANCY', label: 'Constancia' }, { value: 'IMPROVEMENT', label: 'Mejora' }]} />
        <p className="text-xs text-texto-suave">{mode === 'CONSTANCY' ? 'Entregas a tiempo, rachas, asistencia y puntualidad del bimestre.' : 'Cuánto subió la constancia frente al bimestre anterior.'}</p>
      </div>
      <ol className="space-y-1.5">
        {data.map((r) => (
          <li key={r.student_id} className={cn('flex items-center gap-3 rounded-xl px-3 py-2', r.is_mine ? 'bg-chispa-100' : 'bg-papel/60')}>
            <span className="w-7 text-center font-display text-lg font-bold text-texto-suave">{r.rank}</span>
            <TeslaAvatar emoji={r.avatar} frame={r.frame} size={36} />
            <span className="min-w-0 flex-1 truncate font-bold">{r.first_name} {highlightOnly ? '' : (r.last_name ?? '').split(' ')[0]}</span>
            <span className="font-bold tabular-nums">{mode === 'IMPROVEMENT' && r.points > 0 ? '+' : ''}{r.points}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-texto-suave">Cada alumno puede ocultarse del ranking desde «Personalizar». No hay rankings de notas.</p>
    </div>
  )
}

function ClassroomTab({ profile }: { profile: TeslaProfile }) {
  const { profile: me } = useAuth()
  const classroomId = profile.classroom_id
  const showMates = me?.role !== 'GUARDIAN'
  const { data, loading, error, reload } = useAsync(async () => {
    if (!classroomId) return null
    const [goals, mates] = await Promise.all([listGoals(classroomId), showMates ? listClassroomCards(classroomId) : Promise.resolve([])])
    return { goals, mates }
  }, [classroomId, showMates])

  if (!classroomId) return <Empty title="Sin aula asignada" art="notebook" />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="page" />

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Panel title="Metas del aula">
          {data.goals.length === 0 ? (
            <Empty title="No hay metas activas" art="tasks" compact>El tutor puede proponer una meta para todo el aula.</Empty>
          ) : (
            <ul className="space-y-3">{data.goals.map((g) => <GoalCard key={g.id} goal={g} />)}</ul>
          )}
        </Panel>
        {data.mates.length > 0 && (
          <Panel title="Compañeros">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.mates.map((m) => (
                <li key={m.student_id}>
                  <Link to={`/perfil-tesla/${m.student_id}`} className={cn('flex items-center gap-2 rounded-xl border p-2 hover:border-tinta-500',
                    m.student_id === profile.student_id ? 'border-chispa bg-chispa-100/40' : 'border-linea')}>
                    <TeslaAvatar emoji={m.avatar} frame={m.frame} aura={m.aura} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold"><NameFx fx={m.name_fx} text={m.first_name ?? ''} /></span>
                      <span className="flex items-center gap-1 truncate text-xs text-texto-suave"><RankPin tier={m.pin_tier} size={16} />Nv. {m.level} · {m.title}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
      <Panel title="Ranking de constancia" className="h-fit">
        <ConstancyBoard classroomId={classroomId} highlightOnly={me?.role === 'GUARDIAN'} />
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Personalizar (solo el propio alumno)
// ---------------------------------------------------------------------------
function CustomizeTab({ profile, onPreview, onSaved }: { profile: TeslaProfile; onPreview: (p: HeroPreview | null) => void; onSaved: () => void }) {
  const toast = useToast()
  const { data, reload } = useAsync(async () => {
    const [cosmetics, owned, catalog, earned] = await Promise.all([
      listCosmetics(), listOwnedCosmetics(profile.student_id), listAchievements(), listEarned(profile.student_id),
    ])
    return { cosmetics, owned: new Set(owned), catalog, earned }
  }, [profile.student_id], { live: false })

  const [pick, setPick] = useState<Record<CosmeticKind, number | null>>({
    AVATAR: profile.avatar?.id ?? null, FRAME: profile.frame?.id ?? null, BANNER: profile.banner?.id ?? null, TITLE: profile.title?.id ?? null,
    BACKGROUND: profile.background?.id ?? null, NAME_FX: profile.name_fx?.id ?? null, AURA: profile.aura?.id ?? null,
  })
  const [featured, setFeatured] = useState<number[]>(profile.featured.map((f) => f.id))
  const [bio, setBio] = useState(profile.bio ?? '')
  const [hide, setHide] = useState(profile.hide_from_rankings)
  const [showcase, setShowcase] = useState<ShowcaseBlock[]>(profile.showcase ?? [])
  const [busy, setBusy] = useState<string | null>(null)

  const byId = useMemo(() => new Map((data?.cosmetics ?? []).map((c) => [c.id, c])), [data])
  const achievementsById = useMemo(() => new Map((data?.catalog ?? []).map((a) => [a.id, a])), [data])
  const earnedIds = useMemo(() => new Set((data?.earned ?? []).map((e) => e.achievement_id)), [data])

  // Vista previa en vivo en la portada.
  useEffect(() => {
    if (!data) return
    onPreview({
      avatar: byId.get(pick.AVATAR ?? -1)?.value, frame: byId.get(pick.FRAME ?? -1)?.value,
      banner: byId.get(pick.BANNER ?? -1)?.value, title: byId.get(pick.TITLE ?? -1)?.value,
      background: byId.get(pick.BACKGROUND ?? -1)?.value, name_fx: byId.get(pick.NAME_FX ?? -1)?.value, aura: byId.get(pick.AURA ?? -1)?.value,
      bio: bio.trim() || null,
      featured: featured.map((id) => achievementsById.get(id)).filter((a): a is Achievement => !!a)
        .map((a) => ({ id: a.id, name: a.name, icon: a.icon, rarity: a.rarity })),
    })
  }, [data, pick, bio, featured, byId, achievementsById, onPreview])
  useEffect(() => () => onPreview(null), [onPreview])

  if (!data) return <Loading shape="cards" />

  const unlocked = (c: Cosmetic) => {
    if (data.owned.has(c.id)) return true
    switch (c.unlock_type) {
      case 'DEFAULT': return true
      case 'LEVEL': return profile.level >= (c.unlock_level ?? 1)
      case 'ACHIEVEMENT': return !!c.unlock_achievement_id && earnedIds.has(c.unlock_achievement_id)
      default: return false
    }
  }

  async function buy(c: Cosmetic) {
    if (!confirm(`¿Comprar «${c.name}» por ${c.price_coins} monedas?`)) return
    setBusy(`buy${c.id}`)
    try {
      await buyCosmetic(c.id)
      toast(`¡«${c.name}» es tuyo!`)
      setPick((p) => ({ ...p, [c.kind]: c.id }))
      await reload(true)
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    try {
      await saveMyProfile({ cosmeticIds: Object.values(pick), featured, bio, hideFromRankings: hide, showcase })
      toast('Perfil guardado.')
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const earnedList = data.catalog.filter((a) => earnedIds.has(a.id))

  return (
    <div className="space-y-6">
      {(['BACKGROUND', 'BANNER', 'AVATAR', 'AURA', 'FRAME', 'NAME_FX', 'TITLE'] as CosmeticKind[]).map((kind) => (
        <Panel
          key={kind}
          title={KIND_LABEL[kind]}
          action={kind === 'BACKGROUND' ? <span className="text-sm text-texto-suave">Pasa el cursor para verlos moverse</span> : undefined}
        >
          {!data.cosmetics.some((c) => c.kind === kind) && (
            <p className="text-sm text-texto-suave">Todavía no hay opciones disponibles. Pronto la dirección agregará nuevas.</p>
          )}
          <ul className={cn('grid gap-2',
            kind === 'TITLE' || kind === 'NAME_FX' ? 'grid-cols-2 sm:grid-cols-3'
              : kind === 'BACKGROUND' ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                : kind === 'BANNER' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5'
                  : 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7')}>
            {data.cosmetics.filter((c) => c.kind === kind).map((c) => {
              const open = unlocked(c)
              const selected = pick[kind] === c.id
              const art = kind === 'BANNER' || kind === 'BACKGROUND'
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={!open && c.unlock_type !== 'PURCHASE'}
                    aria-pressed={selected}
                    onClick={() => (open ? setPick((p) => ({ ...p, [kind]: c.id })) : c.unlock_type === 'PURCHASE' ? void buy(c) : undefined)}
                    className={cn(
                      'relative flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 text-center text-xs font-bold transition-colors',
                      art && 'art-tile',
                      selected ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500',
                      !open && 'opacity-80',
                    )}
                  >
                    {kind === 'AVATAR' && <TeslaAvatar emoji={c.value} frame="none" size={48} className={cn(!open && 'grayscale')} />}
                    {kind === 'FRAME' && <TeslaAvatar emoji={byId.get(pick.AVATAR ?? -1)?.value} frame={c.value} size={48} className={cn(!open && 'grayscale')} />}
                    {art && (
                      <span className={cn('relative w-full overflow-hidden rounded-lg border border-linea', kind === 'BACKGROUND' ? 'aspect-video' : 'h-12', !open && 'grayscale')}>
                        {c.value === 'none'
                          ? <span className="absolute inset-0 flex items-center justify-center bg-papel font-normal text-texto-suave">Sin fondo</span>
                          : <ArtLayer value={c.value} />}
                        {isAnimatedArt(c.value) && (
                          <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Animado</span>
                        )}
                      </span>
                    )}
                    {kind === 'TITLE' && <span className="py-2 text-sm">{c.value}</span>}
                    {kind === 'AURA' && <TeslaAvatar emoji={byId.get(pick.AVATAR ?? -1)?.value} aura={c.value} size={40} className={cn('m-2', !open && 'grayscale')} />}
                    {kind === 'NAME_FX' && <span className="py-2 font-display text-lg"><NameFx fx={c.value} text={profile.first_name?.split(' ')[0] ?? c.name} /></span>}
                    {kind !== 'TITLE' && <span className="max-w-full truncate">{c.name}</span>}
                    {!open && (
                      <span className="inline-flex items-center gap-1 font-normal text-texto-suave">
                        {c.unlock_type === 'PURCHASE' ? <CoinAmount value={c.price_coins ?? 0} className="font-bold text-texto" /> : <><Lock className="h-3 w-3" />{unlockHint(c, achievementsById)}</>}
                      </span>
                    )}
                    {busy === `buy${c.id}` && <span className="text-texto-suave">Comprando…</span>}
                    {selected && <Check className={cn('absolute right-1.5 top-1.5 h-4 w-4', art && 'rounded-full bg-tinta p-0.5 text-white')} />}
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      ))}

      <Panel title="Insignias destacadas" action={<span className="text-sm text-texto-suave">{featured.length} de 3</span>}>
        {earnedList.length === 0 ? (
          <p className="text-sm text-texto-suave">Cuando ganes logros podrás destacar hasta 3 en tu portada.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {earnedList.map((a) => {
              const on = featured.includes(a.id)
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={!on && featured.length >= 3}
                    onClick={() => setFeatured((f) => (on ? f.filter((x) => x !== a.id) : [...f, a.id]))}
                    className={cn('flex items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-3 text-sm font-bold disabled:opacity-40',
                      on ? 'border-tinta bg-chispa-100' : 'border-linea hover:border-tinta-500')}
                  >
                    <Medal icon={a.icon} rarity={a.rarity} size={32} />{a.name}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Vitrina" action={<span className="text-sm text-texto-suave">{showcase.length} de 4 · en el orden que los elijas</span>}>
        <p className="mb-3 text-sm text-texto-suave">Bloques que se muestran bajo tu portada, como en Steam. Solo se publica lo que elijas.</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(SHOWCASE_LABEL) as ShowcaseBlock[]).map((b) => {
            const pos = showcase.indexOf(b)
            const on = pos >= 0
            return (
              <li key={b}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && showcase.length >= 4}
                  onClick={() => setShowcase((s) => (on ? s.filter((x) => x !== b) : [...s, b]))}
                  className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left disabled:opacity-40',
                    on ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}
                >
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold', on ? 'bg-tinta text-white' : 'bg-papel text-texto-suave')}>
                    {on ? pos + 1 : '+'}
                  </span>
                  <span>
                    <span className="block font-bold">{SHOWCASE_LABEL[b].name}</span>
                    <span className="block text-sm text-texto-suave">{SHOWCASE_LABEL[b].hint}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel title="Presentación y privacidad">
        <Field label="Sobre mí" hint={`${bio.length}/140. La ven tu aula, tu familia y el personal del colegio.`}>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value.replace(/\n/g, ' ').slice(0, 140))} maxLength={140} className="min-h-20"
            placeholder="Me gusta la robótica y el fútbol ⚽" />
        </Field>
        <label className="mt-4 flex items-start gap-3">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="mt-1 h-5 w-5 accent-[#0B1D33]" />
          <span>
            <span className="flex items-center gap-1.5 font-bold"><EyeOff className="h-4 w-4" />Ocultarme de los rankings</span>
            <span className="block text-sm text-texto-suave">Seguirás ganando puntos y logros; solo no aparecerás en la lista de tu aula.</span>
          </span>
        </label>
      </Panel>

      <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
        <Button onClick={() => void save()} loading={busy === 'save'} className="shadow-lg"><Check className="h-4 w-4" />Guardar perfil</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function PerfilTeslaPage() {
  const params = useParams()
  const focus = useFocusStudent()
  const { profile: me, isAdmin } = useAuth()
  const studentId = params.studentId ? Number(params.studentId) : focus?.id ?? 0
  const [search, setSearch] = useSearchParams()
  const toast = useToast()
  const [preview, setPreview] = useState<HeroPreview | null>(null)
  const [modal, setModal] = useState<'recognize' | 'award' | 'adjust' | null>(null)

  const { data: profile, loading, error, reload } = useAsync(() => getProfile(studentId), [studentId])
  const priv = profile?.coins !== undefined
  const canReward = me?.role === 'TEACHER' || isAdmin

  const tabs: { value: Tab; label: string }[] = [
    { value: 'logros', label: 'Logros' },
    ...(priv ? [{ value: 'retos' as Tab, label: 'Retos' }] : []),
    ...(profile?.is_self ? [{ value: 'cofres' as Tab, label: 'Cofres' }] : []),
    { value: 'trayectoria', label: 'Trayectoria' },
    ...(priv ? [{ value: 'historial' as Tab, label: 'Historial' }] : []),
    { value: 'aula', label: 'Mi aula' },
    ...(profile?.is_self ? [{ value: 'personalizar' as Tab, label: 'Personalizar' }] : []),
  ]
  const requested = (search.get('vista') as Tab) || 'logros'
  const tab = tabs.some((t) => t.value === requested) ? requested : 'logros'
  const setTab = (t: Tab) => setSearch((s) => { const n = new URLSearchParams(s); n.set('vista', t); return n }, { replace: true })

  if (!studentId) return <ErrorBox message="Tu cuenta no está vinculada a un alumno. Avisa a secretaría." />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !profile) return <Loading shape="page" label="Cargando el perfil…" />

  const target = { id: profile.student_id, name: profile.first_name ?? 'el alumno' }

  async function removeBio() {
    if (!confirm('¿Borrar la presentación de este alumno?')) return
    try {
      await clearBio(profile!.student_id)
      toast('Presentación borrada.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  const staffActions = (canReward || profile.can_manage) && !profile.is_self
  const canShare = profile.is_self || me?.role === 'GUARDIAN'
  const heroActions = staffActions || profile.is_classmate || canShare ? (
    <>
      {profile.is_classmate && <SparkButton profile={profile} onDone={() => void reload(true)} />}
      {canShare && <ShareButton profile={profile} />}
      {staffActions && canReward && <Button size="sm" variant="secondary" onClick={() => setModal('recognize')}><Heart className="h-4 w-4" />Reconocer</Button>}
      {staffActions && canReward && <Button size="sm" variant="secondary" onClick={() => setModal('award')}><Award className="h-4 w-4" />Logro</Button>}
      {staffActions && isAdmin && <Button size="sm" variant="secondary" onClick={() => setModal('adjust')}>Ajustar</Button>}
      {staffActions && profile.can_manage && profile.bio && (
        <Button size="sm" variant="secondary" onClick={() => void removeBio()} aria-label="Borrar presentación"><Trash2 className="h-4 w-4" /></Button>
      )}
    </>
  ) : undefined

  const background = preview?.background ?? profile.background?.value
  const hasBackdrop = !!background && background !== 'none'
  // La barra de XP toma los colores del fondo (o del banner) elegido.
  const accent = artAccent(background, preview?.banner ?? profile.banner?.value)
  const accentStyle = accent ? ({ '--xp-a': accent[0], '--xp-b': accent[1] } as CSSProperties) : undefined

  return (
    <div className={cn(hasBackdrop && 'tesla-glass')} style={accentStyle}>
      <ProfileBackdrop value={background} />
      <ProfileHero profile={profile} preview={preview ?? undefined} actions={heroActions} glass={hasBackdrop} />
      <ShowcaseSection profile={profile} />
      {profile.is_self && (
        <div className="mt-3 flex justify-end">
          <Link to="/tienda" className={cn('inline-flex items-center gap-1.5 text-sm font-bold text-tinta-500 hover:underline',
            hasBackdrop && 'rounded-lg bg-superficie/85 px-3 py-1.5 shadow backdrop-blur')}>
            <Gift className="h-4 w-4" />Ir a la tienda de canjes
          </Link>
        </div>
      )}
      <div className="my-5 overflow-x-auto"><Segmented value={tab} onChange={setTab} options={tabs} /></div>

      {tab === 'logros' && <AchievementsTab profile={profile} />}
      {tab === 'retos' && <RetosTab profile={profile} onChange={() => void reload(true)} />}
      {tab === 'cofres' && <CofresTab profile={profile} onChange={() => void reload(true)} />}
      {tab === 'trayectoria' && <TrayectoriaTab studentId={profile.student_id} />}
      {tab === 'historial' && <HistoryTab studentId={profile.student_id} />}
      {tab === 'aula' && <ClassroomTab profile={profile} />}
      {tab === 'personalizar' && <CustomizeTab profile={profile} onPreview={setPreview} onSaved={() => void reload(true)} />}

      <RecognizeModal student={modal === 'recognize' ? target : null} onClose={() => setModal(null)} onDone={() => void reload(true)} />
      <AwardModal student={modal === 'award' ? target : null} isAdmin={isAdmin} onClose={() => setModal(null)} onDone={() => void reload(true)} />
      <AdjustModal student={modal === 'adjust' ? target : null} onClose={() => setModal(null)} onDone={() => void reload(true)} />
    </div>
  )
}
