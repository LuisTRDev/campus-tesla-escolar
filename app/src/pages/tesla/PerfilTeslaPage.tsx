import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowDown, ArrowUp, Award, Check, ChevronRight, Eraser, Eye, EyeOff, Gift, GripVertical, Heart, Lock, Medal as MedalIcon, MessageCircleHeart,
  Plus, Save, Shirt, ShoppingBag, Sparkles, Trash2, Users, Volume2, X,
} from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Panel, Segmented, Select, Textarea } from '@/components/ui'
import {
  ArtLayer, CoinAmount, Holo, LevelBadge, Medal, MiniCard, MiniProfileHover, NameFx, PIN_TEXT, PinPath, ProfileBackdrop, ProfileHero, RankPin, RarityBadge,
  TeslaAvatar, ThemeSwatch, artAccent, badgeStyleOf, isAnimatedArt, themeClass, type HeroPreview,
} from '@/components/tesla'
import { CofresTab, RetosTab, ShareButton, ShowcaseSection, SparkButton, TrayectoriaTab, WallTab } from '@/pages/tesla/PerfilTeslaExtras'
import { AdjustModal, AwardModal, RecognizeModal } from '@/components/TeslaActions'
import { ProgressRing } from '@/components/course'
import { Cinta } from '@/components/brand'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, limaToday } from '@/lib/format'
import { playSound, useSoundsEnabled } from '@/lib/teslaSound'
import { cn } from '@/lib/utils'
import { listClassroomOfferings } from '@/services/campus'
import {
  CONDITION_LABEL, DEFAULT_PIN_LEVELS, GOAL_METRIC_LABEL, KIND_LABEL, LEDGER_SOURCE, RARITIES, RARITY_LABEL, SHOWCASE_LABEL, SHOWCASE_MAX,
  buyCosmetic, clearBio, getAchievementRarity, getProfile, getProgress, listAchievements, listBoard, listClassroomCards, listCosmetics,
  listEarned, listGoals, listLedger, listOwnedCosmetics, moderateProfile, rankOf, rarityLabel, saveLoadout, saveMyProfile, statFor, unlockHint,
  VALOR_DE, VALORES,
  type Achievement, type ClassroomGoal, type Cosmetic, type CosmeticKind, type Loadout, type Rarity, type ShowcaseBlock, type ShowcaseConfig,
  type TeslaProfile,
} from '@/services/tesla'

type Tab = 'perfil' | 'logros' | 'muro' | 'retos' | 'cofres' | 'trayectoria' | 'historial' | 'aula' | 'personalizar'

// ---------------------------------------------------------------------------
// Logros
// ---------------------------------------------------------------------------
function AchievementsTab({ profile }: { profile: TeslaProfile }) {
  const priv = profile.coins !== undefined
  const { data, loading, error, reload } = useAsync(async () => {
    const [catalog, earned, progress, rarity] = await Promise.all([
      listAchievements(), listEarned(profile.student_id), priv ? getProgress(profile.student_id) : Promise.resolve(null), getAchievementRarity(),
    ])
    return { catalog, earned, progress, rarity }
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
  const total = data.catalog.filter((a) => !a.is_secret).length + (data.progress?.secret_total ?? 0)

  const progressOf = (a: Achievement) => {
    if (!data.progress || a.condition_type === 'MANUAL') return null
    const v = statFor(a.is_seasonal ? data.progress.season : data.progress.all, a.condition_type)
    return { v: Math.min(v, a.threshold), max: a.threshold }
  }
  const pctOf = (id: number) => data.rarity.get(id)?.pct

  return (
    <div className="space-y-6">
      <PinPath profile={profile} />
      <div className="tp-card tp-rise flex flex-wrap items-center gap-3 rounded-2xl border border-linea bg-superficie p-4">
        {(['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const).map((r) => (
          <span key={r} className="inline-flex items-center gap-2 rounded-xl bg-papel/70 px-3 py-2">
            <Medal icon="Trophy" rarity={r} size={28} />
            <span className="text-sm"><b className="font-display text-lg">{profile.counts[r]}</b> {RARITY_LABEL[r].toLowerCase()}</span>
          </span>
        ))}
        {total > 0 && (
          <span className="ml-auto inline-flex items-center gap-2 text-sm">
            <ProgressRing value={Math.min(1, earned.length / total)} size={44} stroke={5} trackClass="text-[var(--meter-track)]" barClass="text-chispa">
              <span className="text-[10px] font-bold">{Math.round((earned.length / total) * 100)}%</span>
            </ProgressRing>
            <span><b>{earned.length}</b> de {total}</span>
          </span>
        )}
      </div>

      {/* Los tres valores del escudo: cuánto de cada uno lleva el alumno. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {VALORES.map((v, i) => {
          const all = data.catalog.filter((a) => VALOR_DE[a.condition_type] === v.key && !a.is_secret)
          const got = earned.filter((a) => VALOR_DE[a.condition_type] === v.key).length
          const pct = all.length ? Math.min(1, got / all.length) : 0
          return (
            <div key={v.key} className="tp-card tp-rise rounded-2xl border border-linea bg-superficie p-4 text-center" style={{ '--i': i } as CSSProperties}>
              <Cinta tone={i === 1 ? 'roja' : 'blanca'} className="text-[13px]">{v.label}</Cinta>
              <p className="mt-2 font-display text-3xl font-bold cifras">{got}<span className="text-base font-semibold text-texto-suave"> / {all.length}</span></p>
              <div className="mx-auto mt-2 h-1.5 max-w-[10rem] overflow-hidden rounded-full bg-[var(--meter-track)]">
                <div className="xp-fill bar-grow-x h-full rounded-full" style={{ width: `${pct * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-texto-suave">{v.hint}</p>
            </div>
          )
        })}
      </div>

      <Panel title={`Obtenidos (${earned.length})`} className="tp-card">
        {earned.length === 0 ? (
          <Empty title="Todavía no hay logros" art="grades" compact>Entregar a tiempo es la forma más rápida de ganar el primero: así empieza la disciplina.</Empty>
        ) : VALORES.filter((v) => earned.some((a) => VALOR_DE[a.condition_type] === v.key)).map((v, vi) => (
          <section key={v.key} className={cn(vi > 0 && 'mt-6')}>
            <h3 className="mb-3"><Cinta tone={v.key === 'LIDERAZGO' ? 'roja' : v.key === 'EXCELENCIA' ? 'oro' : 'blanca'} className="text-xs">{v.label}</Cinta></h3>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {earned.filter((a) => VALOR_DE[a.condition_type] === v.key).map((a, i) => {
              const e = earnedBy.get(a.id)!
              const pct = pctOf(a.id)
              return (
                <li key={a.id} className="tp-rise flex items-center gap-3 rounded-xl border border-linea p-3" style={{ '--i': Math.min(i, 12) } as CSSProperties}>
                  <Holo foil={a.rarity === 'GOLD' || a.rarity === 'PLATINUM' ? a.rarity : null}>
                    <span className="medal-pop"><Medal icon={a.icon} rarity={a.rarity} size={52} /></span>
                  </Holo>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">{a.name}{e.count > 1 && <span className="ml-1 text-sm text-texto-suave">×{e.count}</span>}</p>
                    <p className="text-sm text-texto-suave">{a.description}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-texto-suave">
                      <RarityBadge rarity={a.rarity} />
                      <span>{formatShort(e.last)}</span>
                      {pct != null && <span className={cn('font-bold', pct < 10 && 'text-[#2f8fa3] dark:text-[#8fe3f2]')}>{rarityLabel(pct)}</span>}
                      {a.is_seasonal && <Badge tone="spark">Temporada</Badge>}
                      {a.is_secret && <Badge tone="info">Secreto</Badge>}
                    </p>
                    {e.note && <p className="mt-1 text-xs italic text-texto-suave">“{e.note}”</p>}
                  </div>
                </li>
              )
            })}
          </ul>
          </section>
        ))}
      </Panel>

      {(pending.length > 0 || secretsLeft > 0) && (
        <Panel title="Por desbloquear" className="tp-card">
          {season && pending.some((a) => a.is_seasonal) && (
            <p className="mb-3 text-sm text-texto-suave">Los logros de temporada cuentan solo lo que haces en el {season.name} y se pueden volver a ganar cada bimestre.</p>
          )}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pending.map((a) => {
              const p = progressOf(a)
              const pct = pctOf(a.id)
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
                    {pct != null && <p className="text-[11px] text-texto-suave">Lo tiene el {rarityLabel(pct)}</p>}
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
    <Panel bodyClassName="p-0" className="tp-card">
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
        {data.map((r, i) => (
          <li key={r.student_id} className={cn('tp-rise flex items-center gap-3 rounded-xl px-3 py-2', r.is_mine ? 'bg-chispa-100' : 'bg-papel/60')} style={{ '--i': Math.min(i, 10) } as CSSProperties}>
            <span className={cn('w-7 text-center font-display text-lg font-bold', r.rank <= 3 ? 'text-chispa-600' : 'text-texto-suave')}>{r.rank}</span>
            {highlightOnly ? <TeslaAvatar emoji={r.avatar} frame={r.frame} size={36} /> : (
              <MiniProfileHover studentId={r.student_id} className="shrink-0"><TeslaAvatar emoji={r.avatar} frame={r.frame} size={36} /></MiniProfileHover>
            )}
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
    <div className="grid gap-6 2xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <Panel title="Metas del aula" className="tp-card">
          {data.goals.length === 0 ? (
            <Empty title="No hay metas activas" art="tasks" compact>El tutor puede proponer una meta para todo el aula.</Empty>
          ) : (
            <ul className="space-y-3">{data.goals.map((g) => <GoalCard key={g.id} goal={g} />)}</ul>
          )}
        </Panel>
        {data.mates.length > 0 && (
          <Panel title="Compañeros" className="tp-card" action={<span className="text-xs text-texto-suave">Pasa el cursor para ver su tarjeta</span>}>
            <ul className="grid grid-cols-2 gap-2 xl:grid-cols-3">
              {data.mates.map((m, i) => (
                <li key={m.student_id} className="tp-pop" style={{ '--i': Math.min(i, 14) } as CSSProperties}>
                  <MiniProfileHover studentId={m.student_id}>
                    <Link to={`/perfil-tesla/${m.student_id}`} className={cn('flex items-center gap-2 rounded-xl border p-2 transition-transform hover:-translate-y-0.5 hover:border-tinta-500',
                      m.student_id === profile.student_id ? 'border-chispa bg-chispa-100/40' : 'border-linea')}>
                      <TeslaAvatar emoji={m.avatar} frame={m.frame} aura={m.aura} size={40} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold"><NameFx fx={m.name_fx} text={m.first_name ?? ''} /></span>
                        <span className="flex items-center gap-1 truncate text-xs text-texto-suave"><RankPin tier={m.pin_tier} size={16} />Nv. {m.level} · {m.title}</span>
                      </span>
                    </Link>
                  </MiniProfileHover>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
      <Panel title="Ranking de constancia" className="tp-card h-fit">
        <ConstancyBoard classroomId={classroomId} highlightOnly={me?.role === 'GUARDIAN'} />
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Barra lateral (como la columna derecha de Steam)
// ---------------------------------------------------------------------------
function SideCard({ title, children, action, i = 0 }: { title: string; children: ReactNode; action?: ReactNode; i?: number }) {
  return (
    <section className="tp-card tp-rise rounded-2xl border border-linea bg-superficie p-4" style={{ '--i': i } as CSSProperties}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-texto-suave">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function SideLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-0.5 text-xs font-bold text-tinta-500 hover:underline">
      {children}<ChevronRight className="h-3.5 w-3.5" />
    </button>
  )
}

function ProfileSidebar({ profile, onTab }: { profile: TeslaProfile; onTab: (t: Tab) => void }) {
  const { profile: me } = useAuth()
  const levels = profile.pin_levels?.length === 4 ? profile.pin_levels : DEFAULT_PIN_LEVELS
  const rank = rankOf(profile.level, levels)
  const badge = badgeStyleOf(profile.level)
  const nextShape = (Math.floor(profile.level / 10) + 1) * 10
  const showMates = me?.role !== 'GUARDIAN' && !!profile.classroom_id
  const { data: mates } = useAsync(() => (showMates ? listClassroomCards(profile.classroom_id!) : Promise.resolve([])), [profile.classroom_id, showMates])
  const others = (mates ?? []).filter((m) => m.student_id !== profile.student_id).sort((a, b) => b.level - a.level).slice(0, 6)
  const hasWall = profile.wall_enabled !== undefined

  return (
    <aside className="space-y-4">
      <SideCard title="Nivel" i={1}>
        <div className="flex items-center gap-4">
          <LevelBadge level={profile.level} size={72} />
          <div className="min-w-0">
            <p className="font-display text-2xl font-bold leading-none">Nivel {profile.level}</p>
            <p className="mt-1 text-sm text-texto-suave">Insignia: <b>{badge.name}</b></p>
            {nextShape <= 99 && <p className="text-xs text-texto-suave">Cambia de forma en el nivel {nextShape}</p>}
          </div>
        </div>
        <div className="mt-4 flex justify-between gap-1">
          {[1, 2, 3, 4].map((t) => (
            <span key={t} className="flex flex-col items-center">
              <RankPin tier={t} stars={rank.tier >= t ? (t === rank.tier ? rank.stars : 3) : 0} size={38} locked={rank.tier < t} />
              <span className="mt-0.5 text-[10px] text-texto-suave">Nv. {levels[t - 1]}</span>
            </span>
          ))}
        </div>
        <p className={cn('mt-2 text-center text-sm font-bold', PIN_TEXT[rank.tier])}>{rank.fullName}</p>
      </SideCard>

      <SideCard title={`Insignias · ${profile.counts.total}`} i={2} action={<SideLink onClick={() => onTab('logros')}>Ver todas</SideLink>}>
        <div className="grid grid-cols-4 gap-2">
          {RARITIES.slice().reverse().map((r: Rarity) => (
            <span key={r} className="flex flex-col items-center rounded-xl bg-papel/70 py-2">
              <Holo foil={r === 'GOLD' || r === 'PLATINUM' ? r : null}><Medal icon="Trophy" rarity={r} size={34} locked={!profile.counts[r]} /></Holo>
              <b className="mt-1 font-display text-lg leading-none">{profile.counts[r]}</b>
              <span className="text-[10px] text-texto-suave">{RARITY_LABEL[r]}</span>
            </span>
          ))}
        </div>
      </SideCard>

      {hasWall && (
        <SideCard title={`Muro · ${profile.wall_count ?? 0}`} i={3} action={<SideLink onClick={() => onTab('muro')}>{profile.is_self ? 'Ver muro' : 'Felicitar'}</SideLink>}>
          <WallTab profile={profile} compact />
        </SideCard>
      )}

      {others.length > 0 && (
        <SideCard title="Compañeros" i={4} action={<SideLink onClick={() => onTab('aula')}>Mi aula</SideLink>}>
          <ul className="space-y-1.5">
            {others.map((m) => (
              <li key={m.student_id}>
                <MiniProfileHover studentId={m.student_id}>
                  <Link to={`/perfil-tesla/${m.student_id}`} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-papel">
                    <TeslaAvatar emoji={m.avatar} frame={m.frame} aura={m.aura} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold"><NameFx fx={m.name_fx} text={m.first_name ?? ''} /></span>
                      <span className="block truncate text-xs text-texto-suave">{m.title}</span>
                    </span>
                    <LevelBadge level={m.level} size={28} />
                  </Link>
                </MiniProfileHover>
              </li>
            ))}
          </ul>
        </SideCard>
      )}

      {profile.is_self && (
        <Link to="/tienda" className="tp-card tp-rise flex items-center gap-3 rounded-2xl border border-linea bg-superficie p-4 hover:border-tinta-500" style={{ '--i': 5 } as CSSProperties}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-chispa-100 text-chispa-600"><Gift className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-bold">Tienda de canjes</span><span className="block text-xs text-texto-suave">Cambia tus monedas por premios</span></span>
          <ChevronRight className="h-4 w-4 text-texto-suave" />
        </Link>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Personalizar (solo el propio alumno): editor con inventario, vitrina y conjuntos
// ---------------------------------------------------------------------------
type Pick7 = Record<CosmeticKind, number | null>
type Section = 'apariencia' | 'vitrina' | 'insignias' | 'conjuntos' | 'privacidad'
type Filter = 'all' | 'owned' | 'locked' | 'shop'

const KIND_ORDER: CosmeticKind[] = ['BACKGROUND', 'BANNER', 'MINI_BG', 'THEME', 'AVATAR', 'FRAME', 'AURA', 'NAME_FX', 'TITLE']
const RARITY_RANK: Record<Rarity, number> = { BRONZE: 0, SILVER: 1, GOLD: 2, PLATINUM: 3 }

const seenKey = (sid: number) => `tesla-seen:${sid}`
function readSeen(sid: number): Set<number> | null {
  try {
    const raw = localStorage.getItem(seenKey(sid))
    return raw ? new Set(JSON.parse(raw) as number[]) : null
  } catch {
    return null
  }
}
function writeSeen(sid: number, ids: Set<number>) {
  try {
    localStorage.setItem(seenKey(sid), JSON.stringify([...ids]))
  } catch {
    // Sin almacenamiento solo no se recuerda qué es nuevo.
  }
}

/** Vista previa fija del editor: muestra la combinación elegida aunque la portada quede fuera de la pantalla. */
function EditorPreview({ profile, preview }: { profile: TeslaProfile; preview: HeroPreview }) {
  const rank = rankOf(profile.level, profile.pin_levels)
  return (
    <div className={cn('tp-card overflow-hidden rounded-2xl border border-linea bg-superficie shadow-lg', themeClass(preview.theme))}>
      <div className="relative h-24"><ArtLayer value={preview.banner} /></div>
      <div className="-mt-10 px-4 pb-4">
        <div className="flex items-end justify-between">
          <TeslaAvatar emoji={preview.avatar} frame={preview.frame} aura={preview.aura} size={76} className="shadow-lg" />
          <LevelBadge level={profile.level} size={40} />
        </div>
        {preview.title && <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-chispa-600">{preview.title}</p>}
        <p className="truncate font-display text-xl font-bold"><NameFx fx={preview.name_fx} text={profile.first_name ?? 'Alumno'} /></p>
        <p className={cn('flex items-center gap-1 text-xs font-bold', PIN_TEXT[rank.tier])}><RankPin tier={rank.tier} size={16} />{rank.fullName}</p>
        {preview.background && preview.background !== 'none' && (
          <div className="relative mt-3 aspect-video overflow-hidden rounded-xl border border-linea">
            <ArtLayer value={preview.background} />
            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Fondo</span>
          </div>
        )}
      </div>
    </div>
  )
}

function CosmeticTile({ c, kind, open, selected, trying, isNew, busy, pickAvatar, firstName, onClick, unlockText }: {
  c: Cosmetic; kind: CosmeticKind; open: boolean; selected: boolean; trying?: boolean; isNew: boolean; busy: boolean; pickAvatar?: string; firstName: string
  onClick: () => void; unlockText: string
}) {
  const art = kind === 'BANNER' || kind === 'BACKGROUND' || kind === 'MINI_BG'
  return (
    <button
      type="button"
      aria-pressed={selected || trying}
      title={open ? undefined : 'Toca para probarlo en tu perfil'}
      onClick={onClick}
      className={cn(
        'relative flex w-full flex-col items-center gap-1.5 rounded-xl border p-2 text-center text-xs font-bold transition-all hover:-translate-y-0.5',
        art && 'art-tile',
        selected ? 'border-tinta bg-chispa-100 text-tinta shadow-md' : trying ? 'border-dashed border-chispa-600 bg-chispa-100/60 shadow-md' : 'border-linea hover:border-tinta-500',
        !open && 'opacity-80',
      )}
    >
      {kind === 'AVATAR' && <TeslaAvatar emoji={c.value} frame="none" size={52} className={cn(!open && !trying && 'grayscale')} />}
      {kind === 'FRAME' && <TeslaAvatar emoji={pickAvatar} frame={c.value} size={52} className={cn(!open && !trying && 'grayscale')} />}
      {kind === 'THEME' && <span className={cn('py-1', !open && !trying && 'grayscale')}><ThemeSwatch value={c.value} size={40} /></span>}
      {art && (
        <span className={cn('relative w-full overflow-hidden rounded-lg border border-linea', kind === 'BACKGROUND' ? 'aspect-video' : kind === 'MINI_BG' ? 'aspect-[4/3]' : 'h-12', !open && !trying && 'grayscale')}>
          {c.value === 'none'
            ? <span className="absolute inset-0 flex items-center justify-center bg-papel font-normal text-texto-suave">Sin fondo</span>
            : <ArtLayer value={c.value} />}
          {isAnimatedArt(c.value) && (
            <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Animado</span>
          )}
        </span>
      )}
      {kind === 'TITLE' && <span className="py-2 text-sm">{c.value}</span>}
      {kind === 'AURA' && <TeslaAvatar emoji={pickAvatar} aura={c.value} size={40} className={cn('m-2', !open && !trying && 'grayscale')} />}
      {kind === 'NAME_FX' && <span className="py-2 font-display text-lg"><NameFx fx={c.value} text={firstName || c.name} /></span>}
      {kind !== 'TITLE' && <span className="max-w-full truncate">{c.name}</span>}
      <span className="flex items-center gap-1"><RarityBadge rarity={c.rarity} className="text-[10px]" /></span>
      {!open && (
        <span className="inline-flex items-center gap-1 font-normal text-texto-suave">
          {c.unlock_type === 'PURCHASE' ? <CoinAmount value={c.price_coins ?? 0} className="font-bold text-texto" /> : <><Lock className="h-3 w-3" />{unlockText}</>}
        </span>
      )}
      {trying && <span className="rounded-full bg-chispa px-2 py-0.5 text-[10px] uppercase text-tinta">Probando</span>}
      {busy && <span className="text-texto-suave">Comprando…</span>}
      {isNew && <span className="absolute left-1.5 top-1.5 rounded-full bg-estado-alerta px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">Nuevo</span>}
      {selected && <Check className={cn('absolute right-1.5 top-1.5 h-4 w-4', art && 'rounded-full bg-tinta p-0.5 text-white')} />}
    </button>
  )
}

function CustomizeTab({ profile, onPreview, onSaved }: { profile: TeslaProfile; onPreview: (p: HeroPreview | null) => void; onSaved: () => void }) {
  const toast = useToast()
  const v22 = profile.theme !== undefined
  const { data, reload } = useAsync(async () => {
    const [cosmetics, owned, catalog, earned, courses] = await Promise.all([
      listCosmetics(), listOwnedCosmetics(profile.student_id), listAchievements(), listEarned(profile.student_id),
      v22 && profile.classroom_id ? listClassroomOfferings(profile.classroom_id).catch(() => []) : Promise.resolve([]),
    ])
    return { cosmetics, owned: new Set(owned), catalog, earned, courses }
  }, [profile.student_id], { live: false })

  const initialPick = (): Pick7 => ({
    AVATAR: profile.avatar?.id ?? null, FRAME: profile.frame?.id ?? null, BANNER: profile.banner?.id ?? null, TITLE: profile.title?.id ?? null,
    BACKGROUND: profile.background?.id ?? null, NAME_FX: profile.name_fx?.id ?? null, AURA: profile.aura?.id ?? null, THEME: profile.theme?.id ?? null,
    MINI_BG: profile.mini_bg?.id ?? null,
  })
  const [pick, setPick] = useState<Pick7>(initialPick)
  const [featured, setFeatured] = useState<number[]>(profile.featured.map((f) => f.id))
  const [bio, setBio] = useState(profile.bio ?? '')
  const [hide, setHide] = useState(profile.hide_from_rankings)
  const [wall, setWall] = useState(profile.wall_enabled ?? true)
  const [showcase, setShowcase] = useState<ShowcaseBlock[]>(profile.showcase ?? [])
  const [config, setConfig] = useState<ShowcaseConfig>(profile.showcase_config ?? {})
  const [loadouts, setLoadouts] = useState<Loadout[]>(profile.loadouts ?? [])
  const [busy, setBusy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [section, setSection] = useState<Section>('apariencia')
  const [kind, setKind] = useState<CosmeticKind>('BACKGROUND')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<'rarity' | 'name' | 'price'>('rarity')
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [seen, setSeen] = useState<Set<number> | null>(null)
  const [sounds, setSounds] = useSoundsEnabled()
  // «Probar antes de comprar»: un cosmético bloqueado que se ve en la vista previa sin guardarse.
  const [trial, setTrial] = useState<Cosmetic | null>(null)
  const [search, setSearch] = useSearchParams()

  const byId = useMemo(() => new Map((data?.cosmetics ?? []).map((c) => [c.id, c])), [data])
  const achievementsById = useMemo(() => new Map((data?.catalog ?? []).map((a) => [a.id, a])), [data])
  const earnedIds = useMemo(() => new Set((data?.earned ?? []).map((e) => e.achievement_id)), [data])

  const unlocked = (c: Cosmetic) => {
    if (!data) return false
    if (data.owned.has(c.id)) return true
    switch (c.unlock_type) {
      case 'DEFAULT': return true
      case 'LEVEL': return profile.level >= (c.unlock_level ?? 1)
      case 'ACHIEVEMENT': return !!c.unlock_achievement_id && earnedIds.has(c.unlock_achievement_id)
      default: return false
    }
  }

  // «Nuevo»: lo desbloqueado desde la última visita al editor en este dispositivo.
  useEffect(() => {
    if (!data) return
    const ids = new Set(data.cosmetics.filter(unlocked).map((c) => c.id))
    const prev = readSeen(profile.student_id)
    if (!prev) { writeSeen(profile.student_id, ids); setSeen(ids) } else setSeen(prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, profile.student_id])
  const markSeen = (id: number) => {
    if (!seen || seen.has(id)) return
    const next = new Set(seen).add(id)
    setSeen(next)
    writeSeen(profile.student_id, next)
  }

  const preview: HeroPreview = useMemo(() => {
    // Lo que se está probando reemplaza a lo equipado solo en la vista previa.
    const val = (k: CosmeticKind, saved?: string) => (trial?.kind === k ? trial.value : byId.get(pick[k] ?? -1)?.value ?? saved)
    return {
      avatar: val('AVATAR', profile.avatar?.value), frame: val('FRAME', profile.frame?.value),
      banner: val('BANNER', profile.banner?.value), title: val('TITLE', profile.title?.value),
      background: val('BACKGROUND', profile.background?.value), name_fx: val('NAME_FX', profile.name_fx?.value),
      aura: val('AURA', profile.aura?.value), theme: val('THEME', profile.theme?.value), mini_bg: val('MINI_BG', profile.mini_bg?.value),
      bio: bio.trim() || null,
      featured: featured.map((id) => achievementsById.get(id)).filter((a): a is Achievement => !!a)
        .map((a) => ({ id: a.id, name: a.name, icon: a.icon, rarity: a.rarity })),
    }
  }, [byId, pick, trial, bio, featured, achievementsById, profile])

  // Llegar desde la tienda con «Probar en mi perfil» (?probar=ID).
  const probar = Number(search.get('probar')) || null
  useEffect(() => {
    if (!data || !probar) return
    const c = data.cosmetics.find((x) => x.id === probar)
    if (c) {
      setSection('apariencia')
      setKind(c.kind)
      if (unlocked(c)) { setPick((p) => ({ ...p, [c.kind]: c.id })); setDirty(true) } else setTrial(c)
    }
    setSearch((s) => { const n = new URLSearchParams(s); n.delete('probar'); return n }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, probar])

  // Vista previa en vivo en la portada y en toda la página.
  useEffect(() => { if (data) onPreview(preview) }, [data, preview, onPreview])
  useEffect(() => () => onPreview(null), [onPreview])

  // Avisa antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!data) return <Loading shape="cards" />
  const change = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true) }

  async function buy(c: Cosmetic) {
    if (!confirm(`¿Comprar «${c.name}» por ${c.price_coins} monedas?`)) return
    setBusy(`buy${c.id}`)
    try {
      await buyCosmetic(c.id)
      playSound('reveal')
      toast(`¡«${c.name}» es tuyo!`)
      setPick((p) => ({ ...p, [c.kind]: c.id }))
      setTrial(null)
      setDirty(true)
      markSeen(c.id)
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
      await saveMyProfile({
        cosmeticIds: Object.values(pick), featured, bio, hideFromRankings: hide,
        showcase: v22 ? showcase : showcase.filter((b) => !(b in V22_ONLY)),
        ...(v22 ? { config, wallEnabled: wall } : {}),
      })
      playSound('levelup')
      toast('¡Perfil guardado!')
      setDirty(false)
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  function discard() {
    setPick(initialPick())
    setFeatured(profile.featured.map((f) => f.id))
    setBio(profile.bio ?? '')
    setHide(profile.hide_from_rankings)
    setWall(profile.wall_enabled ?? true)
    setShowcase(profile.showcase ?? [])
    setConfig(profile.showcase_config ?? {})
    setDirty(false)
  }

  // --- Conjuntos ---
  async function storeLoadout(slot: number) {
    const name = prompt('Nombre del conjunto (por ejemplo «Modo espacial»):', loadouts.find((l) => l.slot === slot)?.name ?? '')
    if (!name?.trim()) return
    setBusy(`lo${slot}`)
    try {
      setLoadouts(await saveLoadout(slot, name, Object.values(pick).filter((x): x is number => x != null)))
      toast('Conjunto guardado.')
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }
  async function deleteLoadout(slot: number) {
    if (!confirm('¿Borrar este conjunto?')) return
    try {
      setLoadouts(await saveLoadout(slot, '', null))
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }
  function equipLoadout(l: Loadout) {
    const next = { ...pick }
    let skipped = 0
    for (const id of l.ids) {
      const c = byId.get(id)
      if (c && unlocked(c)) next[c.kind] = id
      else skipped++
    }
    setPick(next)
    setDirty(true)
    playSound('equip')
    toast(skipped ? `Conjunto aplicado (${skipped} ya no está disponible). Guarda para publicarlo.` : 'Conjunto aplicado. Guarda para publicarlo.')
  }

  // --- Vitrina ---
  const move = (from: number, to: number) => {
    if (to < 0 || to >= showcase.length || from === to) return
    const next = [...showcase]
    const [b] = next.splice(from, 1)
    next.splice(to, 0, b)
    setShowcase(next)
    setDirty(true)
  }
  const setCfg = <K extends keyof ShowcaseConfig>(k: K, v: ShowcaseConfig[K]) => { setConfig((c) => ({ ...c, [k]: v })); setDirty(true) }

  const earnedList = data.catalog.filter((a) => earnedIds.has(a.id))
  const ownedCosmetics = data.cosmetics.filter((c) => c.unlock_type !== 'DEFAULT' && unlocked(c))
  const kinds = KIND_ORDER.filter((k) => data.cosmetics.some((c) => c.kind === k))
  const newCount = (k: CosmeticKind) => seen ? data.cosmetics.filter((c) => c.kind === k && unlocked(c) && !seen.has(c.id)).length : 0

  const list = data.cosmetics
    .filter((c) => c.kind === kind)
    .filter((c) => filter === 'all' || (filter === 'owned' ? unlocked(c) : filter === 'locked' ? !unlocked(c) : !unlocked(c) && c.unlock_type === 'PURCHASE'))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'es')
      : sort === 'price' ? (a.price_coins ?? 0) - (b.price_coins ?? 0)
        : (Number(unlocked(b)) - Number(unlocked(a))) || RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity] || a.sort - b.sort)

  const sections: { value: Section; label: string }[] = [
    { value: 'apariencia', label: 'Apariencia' },
    { value: 'vitrina', label: `Vitrina (${showcase.length})` },
    { value: 'insignias', label: 'Insignias' },
    ...(v22 ? [{ value: 'conjuntos' as Section, label: 'Conjuntos' }] : []),
    { value: 'privacidad', label: 'Presentación y ajustes' },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        <div className="overflow-x-auto"><Segmented value={section} onChange={setSection} options={sections} /></div>

        {trial && (
          <div className="tp-pop flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-chispa-600 bg-superficie p-3 shadow-lg">
            <Eye className="h-5 w-5 shrink-0 text-chispa-600" />
            <p className="min-w-0 flex-1 text-sm">
              Estás probando <b>«{trial.name}»</b> ({KIND_LABEL[trial.kind].toLowerCase()}). Así se vería tu perfil; todavía no es tuyo.
              {trial.unlock_type !== 'PURCHASE' && <span className="block text-texto-suave">Se consigue con: {unlockHint(trial, achievementsById)}.</span>}
            </p>
            {trial.unlock_type === 'PURCHASE' && (
              <Button size="sm" loading={busy === `buy${trial.id}`} disabled={(profile.coins ?? 0) < (trial.price_coins ?? 0)} onClick={() => void buy(trial)}>
                <ShoppingBag className="h-4 w-4" />{(profile.coins ?? 0) < (trial.price_coins ?? 0) ? `Te faltan ${(trial.price_coins ?? 0) - (profile.coins ?? 0)} monedas` : `Comprar por ${trial.price_coins}`}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setTrial(null)}>Dejar de probar</Button>
          </div>
        )}

        {section === 'apariencia' && (
          <Panel className="tp-card" title={KIND_LABEL[kind]}
            action={<span className="text-sm text-texto-suave">{data.cosmetics.filter((c) => c.kind === kind && unlocked(c)).length} de {data.cosmetics.filter((c) => c.kind === kind).length}</span>}>
            <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {kinds.map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={cn('relative shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors',
                    kind === k ? 'border-tinta bg-tinta text-white' : 'border-linea hover:border-tinta-500')}>
                  {KIND_LABEL[k]}
                  {newCount(k) > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-estado-alerta px-1 text-[10px] text-white">{newCount(k)}</span>}
                </button>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <Segmented value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'Todos' }, { value: 'owned', label: 'Tengo' }, { value: 'locked', label: 'Bloqueados' }, { value: 'shop', label: 'En venta' },
              ]} />
              <label className="flex items-center gap-2 text-sm text-texto-suave">Ordenar
                <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto py-1.5">
                  <option value="rarity">Por rareza</option><option value="name">Por nombre</option><option value="price">Por precio</option>
                </Select>
              </label>
            </div>
            {list.length === 0 ? <p className="text-sm text-texto-suave">No hay cosméticos con este filtro.</p> : (
              <ul className={cn('grid gap-2',
                kind === 'TITLE' || kind === 'NAME_FX' || kind === 'THEME' ? 'grid-cols-2 sm:grid-cols-3'
                  : kind === 'BACKGROUND' ? 'grid-cols-2 sm:grid-cols-3'
                    : kind === 'BANNER' ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4'
                      : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-6')}>
                {list.map((c, i) => {
                  const open = unlocked(c)
                  return (
                    <li key={c.id} className="tp-pop" style={{ '--i': Math.min(i, 16) } as CSSProperties} onPointerEnter={() => open && markSeen(c.id)}>
                      <CosmeticTile c={c} kind={kind} open={open} selected={trial?.kind !== kind && pick[kind] === c.id} trying={trial?.id === c.id} isNew={!!seen && open && !seen.has(c.id)}
                        busy={busy === `buy${c.id}`} pickAvatar={preview.avatar} firstName={profile.first_name?.split(' ')[0] ?? ''}
                        unlockText={unlockHint(c, achievementsById)}
                        onClick={() => {
                          if (open) { setPick((p) => ({ ...p, [kind]: c.id })); setTrial(null); setDirty(true); markSeen(c.id); playSound('equip') }
                          else { setTrial(trial?.id === c.id ? null : c); playSound('equip') }
                        }} />
                    </li>
                  )
                })}
              </ul>
            )}
            {(kind === 'BACKGROUND' || kind === 'BANNER') && <p className="mt-3 text-xs text-texto-suave">Pasa el cursor sobre las miniaturas para verlas moverse.</p>}
          </Panel>
        )}

        {section === 'vitrina' && (
          <>
            <Panel className="tp-card" title="Tu vitrina" action={<span className="text-sm text-texto-suave">{showcase.length} de {SHOWCASE_MAX} · arrastra para ordenar</span>}>
              {showcase.length === 0 ? <p className="text-sm text-texto-suave">Agrega bloques desde la lista de abajo. Se muestran bajo tu portada, como en Steam.</p> : (
                <ol className="space-y-2">
                  {showcase.map((b, i) => (
                    <li key={b} draggable
                      onDragStart={() => setDragging(i)} onDragEnd={() => { setDragging(null); setOver(null) }}
                      onDragOver={(e) => { e.preventDefault(); setOver(i) }}
                      onDrop={(e) => { e.preventDefault(); if (dragging != null) move(dragging, i); setDragging(null); setOver(null) }}
                      className={cn('flex items-center gap-2 rounded-xl border border-linea bg-papel/60 p-2.5', dragging === i && 'drag-ghost', over === i && dragging !== i && 'drag-over')}>
                      <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-texto-suave" aria-hidden />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tinta text-sm font-bold text-white">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{SHOWCASE_LABEL[b].name}</span>
                        <span className="block truncate text-xs text-texto-suave">{SHOWCASE_LABEL[b].hint}</span>
                      </span>
                      <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="rounded-lg p-1.5 hover:bg-superficie disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => move(i, i + 1)} disabled={i === showcase.length - 1} className="rounded-lg p-1.5 hover:bg-superficie disabled:opacity-30" aria-label="Bajar"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => { setShowcase((s) => s.filter((x) => x !== b)); setDirty(true) }} className="rounded-lg p-1.5 hover:bg-superficie hover:text-estado-alerta" aria-label="Quitar"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            {showcase.some((b) => b in V22_ONLY) && (
              <Panel className="tp-card" title="Contenido de los bloques">
                <div className="space-y-6">
                  {showcase.includes('TEXT') && (
                    <div>
                      <h4 className="mb-2 font-bold">Caja de texto</h4>
                      <Field label="Título"><Input value={config.TEXT?.title ?? ''} maxLength={40} placeholder="Sobre mí"
                        onChange={(e) => setCfg('TEXT', { body: config.TEXT?.body ?? '', title: e.target.value })} /></Field>
                      <Field label="Texto" hint={`${(config.TEXT?.body ?? '').length}/400. Lo ven tu aula, tu familia y el colegio; tu tutor puede quitarlo.`} className="mt-3">
                        <Textarea value={config.TEXT?.body ?? ''} maxLength={400} className="min-h-28"
                          placeholder="Me encanta la robótica. Mi meta este año es ganar la feria de ciencias 🚀"
                          onChange={(e) => setCfg('TEXT', { title: config.TEXT?.title, body: e.target.value.slice(0, 400) })} />
                      </Field>
                    </div>
                  )}
                  {showcase.includes('PROJECT') && (
                    <div>
                      <h4 className="mb-2 font-bold">Proyecto destacado</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Nombre"><Input value={config.PROJECT?.title ?? ''} maxLength={60} placeholder="Maqueta del sistema solar"
                          onChange={(e) => setCfg('PROJECT', { url: config.PROJECT?.url ?? '', note: config.PROJECT?.note, title: e.target.value })} /></Field>
                        <Field label="Enlace (https://…)" hint="De Drive, Canva, YouTube, Scratch… Revisa que se pueda ver sin pedir permiso.">
                          <Input value={config.PROJECT?.url ?? ''} maxLength={300} inputMode="url" placeholder="https://drive.google.com/…"
                            onChange={(e) => setCfg('PROJECT', { title: config.PROJECT?.title ?? '', note: config.PROJECT?.note, url: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Descripción corta" className="mt-3"><Input value={config.PROJECT?.note ?? ''} maxLength={140}
                        onChange={(e) => setCfg('PROJECT', { title: config.PROJECT?.title ?? '', url: config.PROJECT?.url ?? '', note: e.target.value })} /></Field>
                    </div>
                  )}
                  {showcase.includes('COURSE') && (
                    <div>
                      <h4 className="mb-2 font-bold">Curso favorito</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Curso">
                          <Select value={config.COURSE?.offering_id ?? ''} onChange={(e) => setCfg('COURSE', { note: config.COURSE?.note, offering_id: Number(e.target.value) })}>
                            <option value="">Elige un curso…</option>
                            {data.courses.map((o) => <option key={o.id} value={o.id}>{o.subject?.name ?? `Curso ${o.id}`}</option>)}
                          </Select>
                        </Field>
                        <Field label="¿Por qué te gusta?"><Input value={config.COURSE?.note ?? ''} maxLength={140}
                          onChange={(e) => setCfg('COURSE', { offering_id: config.COURSE?.offering_id ?? 0, note: e.target.value })} /></Field>
                      </div>
                    </div>
                  )}
                  {showcase.includes('ACHIEVEMENTS') && (
                    <div>
                      <h4 className="mb-2 flex items-center justify-between font-bold">Vitrina de logros <span className="text-sm font-normal text-texto-suave">{config.ACHIEVEMENTS?.ids.length ?? 0} de 6</span></h4>
                      {earnedList.length === 0 ? <p className="text-sm text-texto-suave">Cuando ganes logros podrás lucirlos aquí.</p> : (
                        <ul className="flex flex-wrap gap-2">
                          {earnedList.map((a) => {
                            const ids = config.ACHIEVEMENTS?.ids ?? []
                            const on = ids.includes(a.id)
                            return (
                              <li key={a.id}>
                                <button type="button" aria-pressed={on} disabled={!on && ids.length >= 6}
                                  onClick={() => setCfg('ACHIEVEMENTS', { ids: on ? ids.filter((x) => x !== a.id) : [...ids, a.id] })}
                                  className={cn('flex items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-3 text-sm font-bold disabled:opacity-40',
                                    on ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
                                  <Medal icon={a.icon} rarity={a.rarity} size={30} />{a.name}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                  {showcase.includes('COLLECTION') && (
                    <div>
                      <h4 className="mb-2 flex items-center justify-between font-bold">Colección <span className="text-sm font-normal text-texto-suave">{config.COLLECTION?.ids.length ?? 0} de 8</span></h4>
                      {ownedCosmetics.length === 0 ? <p className="text-sm text-texto-suave">Todavía no tienes cosméticos especiales. ¡Sube de nivel, abre cofres o visita la tienda!</p> : (
                        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
                          {ownedCosmetics.map((c) => {
                            const ids = config.COLLECTION?.ids ?? []
                            const on = ids.includes(c.id)
                            return (
                              <li key={c.id}>
                                <button type="button" aria-pressed={on} disabled={!on && ids.length >= 8}
                                  onClick={() => setCfg('COLLECTION', { ids: on ? ids.filter((x) => x !== c.id) : [...ids, c.id] })}
                                  className={cn('relative flex w-full flex-col items-center gap-1 rounded-xl border p-2 text-xs font-bold disabled:opacity-40',
                                    on ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
                                  <span className="flex h-12 items-center justify-center">
                                    {c.kind === 'BANNER' || c.kind === 'BACKGROUND'
                                      ? <span className="relative block h-9 w-14 overflow-hidden rounded-md border border-linea"><ArtLayer value={c.value} still /></span>
                                      : c.kind === 'THEME' ? <ThemeSwatch value={c.value} size={28} />
                                        : c.kind === 'TITLE' ? <span className="text-[10px] uppercase text-chispa-600">{c.value}</span>
                                          : c.kind === 'NAME_FX' ? <NameFx fx={c.value} text="Aa" className="font-display text-lg" />
                                            : <TeslaAvatar emoji={c.kind === 'AVATAR' ? c.value : preview.avatar} frame={c.kind === 'FRAME' ? c.value : 'none'} aura={c.kind === 'AURA' ? c.value : null} size={38} />}
                                  </span>
                                  <span className="max-w-full truncate">{c.name}</span>
                                  {on && <Check className="absolute right-1 top-1 h-3.5 w-3.5" />}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                  {showcase.includes('RAREST') && <p className="text-sm text-texto-suave"><b>Logros más raros</b> se calcula solo con tus logros que menos alumnos del colegio tienen.</p>}
                </div>
              </Panel>
            )}

            <Panel className="tp-card" title="Agregar bloques">
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {(Object.keys(SHOWCASE_LABEL) as ShowcaseBlock[]).filter((b) => !showcase.includes(b)).map((b) => {
                  const needs22 = b in V22_ONLY && !v22
                  return (
                    <li key={b}>
                      <button type="button" disabled={showcase.length >= SHOWCASE_MAX || needs22}
                        onClick={() => { setShowcase((s) => [...s, b]); setDirty(true); playSound('equip') }}
                        className="flex w-full items-start gap-3 rounded-xl border border-linea p-3 text-left transition-colors hover:border-tinta-500 disabled:opacity-40">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-papel text-texto-suave"><Plus className="h-4 w-4" /></span>
                        <span>
                          <span className="block font-bold">{SHOWCASE_LABEL[b].name}</span>
                          <span className="block text-sm text-texto-suave">{needs22 ? 'Disponible cuando la dirección ejecute el script 22.' : SHOWCASE_LABEL[b].hint}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          </>
        )}

        {section === 'insignias' && (
          <Panel className="tp-card" title="Insignias destacadas" action={<span className="text-sm text-texto-suave">{featured.length} de 3 · junto a tu nombre</span>}>
            {earnedList.length === 0 ? (
              <p className="text-sm text-texto-suave">Cuando ganes logros podrás destacar hasta 3 en tu portada.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {earnedList.map((a) => {
                  const on = featured.includes(a.id)
                  return (
                    <li key={a.id}>
                      <button type="button" aria-pressed={on} disabled={!on && featured.length >= 3}
                        onClick={() => { setFeatured((f) => (on ? f.filter((x) => x !== a.id) : [...f, a.id])); setDirty(true) }}
                        className={cn('flex items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-3 text-sm font-bold disabled:opacity-40',
                          on ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
                        <Medal icon={a.icon} rarity={a.rarity} size={32} />{a.name}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        )}

        {section === 'conjuntos' && (
          <Panel className="tp-card" title="Conjuntos guardados" action={<span className="text-sm text-texto-suave">Cambia de estilo con un toque</span>}>
            <p className="mb-4 text-sm text-texto-suave">Guarda hasta 3 combinaciones de fondo, banner, tema, avatar, marco, aura, efecto y título.</p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((slot) => {
                const l = loadouts.find((x) => x.slot === slot)
                const get = (k: CosmeticKind) => l?.ids.map((id) => byId.get(id)).find((c) => c?.kind === k)?.value
                return (
                  <li key={slot} className={cn('flex flex-col rounded-2xl border p-3', l ? 'border-linea' : 'border-dashed border-linea')}>
                    <div className={cn('relative h-16 overflow-hidden rounded-xl border border-linea', !l && 'bg-papel')}>
                      {l && <ArtLayer value={get('BANNER')} still />}
                      {l && <span className="absolute bottom-1 left-2"><TeslaAvatar emoji={get('AVATAR')} frame={get('FRAME')} size={40} /></span>}
                      {!l && <span className="absolute inset-0 flex items-center justify-center text-sm text-texto-suave"><Shirt className="mr-1.5 h-4 w-4" />Vacío</span>}
                    </div>
                    <p className="mt-2 truncate font-bold">{l?.name ?? `Espacio ${slot}`}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {l && <Button size="sm" onClick={() => equipLoadout(l)}><Check className="h-4 w-4" />Equipar</Button>}
                      <Button size="sm" variant="secondary" loading={busy === `lo${slot}`} onClick={() => void storeLoadout(slot)}>
                        <Save className="h-4 w-4" />{l ? 'Reemplazar' : 'Guardar el actual'}
                      </Button>
                      {l && <Button size="sm" variant="ghost" onClick={() => void deleteLoadout(slot)} aria-label="Borrar conjunto"><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        )}

        {section === 'privacidad' && (
          <Panel className="tp-card" title="Presentación y ajustes">
            <Field label="Sobre mí (frase corta bajo tu nombre)" hint={`${bio.length}/140. La ven tu aula, tu familia y el personal del colegio.`}>
              <Textarea value={bio} onChange={(e) => change(setBio)(e.target.value.replace(/\n/g, ' ').slice(0, 140))} maxLength={140} className="min-h-20"
                placeholder="Me gusta la robótica y el fútbol ⚽" />
            </Field>
            <label className="mt-4 flex items-start gap-3">
              <input type="checkbox" checked={hide} onChange={(e) => change(setHide)(e.target.checked)} className="mt-1 h-5 w-5 accent-[#0B1D33]" />
              <span>
                <span className="flex items-center gap-1.5 font-bold"><EyeOff className="h-4 w-4" />Ocultarme de los rankings</span>
                <span className="block text-sm text-texto-suave">Seguirás ganando puntos y logros; solo no aparecerás en la lista de tu aula.</span>
              </span>
            </label>
            {v22 && (
              <label className="mt-4 flex items-start gap-3">
                <input type="checkbox" checked={wall} onChange={(e) => change(setWall)(e.target.checked)} className="mt-1 h-5 w-5 accent-[#0B1D33]" />
                <span>
                  <span className="flex items-center gap-1.5 font-bold"><MessageCircleHeart className="h-4 w-4" />Muro de felicitaciones abierto</span>
                  <span className="block text-sm text-texto-suave">Tu aula, tu familia y tus docentes pueden dejarte stickers y frases. Puedes quitar cualquier mensaje.</span>
                </span>
              </label>
            )}
            <label className="mt-4 flex items-start gap-3">
              <input type="checkbox" checked={sounds} onChange={(e) => { setSounds(e.target.checked); if (e.target.checked) window.setTimeout(() => playSound('levelup'), 50) }} className="mt-1 h-5 w-5 accent-[#0B1D33]" />
              <span>
                <span className="flex items-center gap-1.5 font-bold"><Volume2 className="h-4 w-4" />Sonidos del perfil</span>
                <span className="block text-sm text-texto-suave">Suenan al subir de nivel, abrir cofres y equipar cosméticos. Solo en este dispositivo.</span>
              </span>
            </label>
            <p className="mt-4 text-xs text-texto-suave">¿Las animaciones te marean? Actívalas o desactívalas en <Link to="/ajustes" className="font-bold underline">Ajustes → Menos movimiento</Link>.</p>
          </Panel>
        )}
      </div>

      <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <p className="text-xs font-bold uppercase tracking-wider text-texto-suave">Vista previa</p>
        <EditorPreview profile={profile} preview={preview} />
        {v22 && (
          <>
            <p className="pt-1 text-xs font-bold uppercase tracking-wider text-texto-suave">Tu mini-perfil</p>
            <div className="flex justify-center"><MiniCard profile={profile} preview={preview} /></div>
          </>
        )}
        <div className="sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl border border-linea bg-superficie/95 p-3 shadow-lg backdrop-blur lg:static">
          {dirty && <p className="text-xs font-bold text-estado-tarde">Tienes cambios sin guardar.</p>}
          <Button onClick={() => void save()} loading={busy === 'save'} className="w-full"><Check className="h-4 w-4" />Guardar perfil</Button>
          {dirty && <Button variant="ghost" onClick={discard} className="w-full">Descartar cambios</Button>}
        </div>
      </div>
    </div>
  )
}

/** Bloques de la vitrina que necesitan el script 22 (como objeto para usar «in»). */
const V22_ONLY: Partial<Record<ShowcaseBlock, true>> = { TEXT: true, ACHIEVEMENTS: true, RAREST: true, COLLECTION: true, PROJECT: true, COURSE: true }

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
  const hasWall = profile?.wall_enabled !== undefined

  const tabs: { value: Tab; label: ReactNode }[] = [
    { value: 'perfil', label: 'Perfil' },
    { value: 'logros', label: 'Logros' },
    ...(hasWall ? [{ value: 'muro' as Tab, label: `Muro${profile?.wall_count ? ` · ${profile.wall_count}` : ''}` }] : []),
    ...(priv ? [{ value: 'retos' as Tab, label: 'Retos' }] : []),
    ...(profile?.is_self ? [{ value: 'cofres' as Tab, label: 'Cofres' }] : []),
    { value: 'trayectoria', label: 'Trayectoria' },
    ...(priv ? [{ value: 'historial' as Tab, label: 'Historial' }] : []),
    { value: 'aula', label: 'Mi aula' },
    ...(profile?.is_self ? [{ value: 'personalizar' as Tab, label: <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-chispa-600" />Personalizar</span> }] : []),
  ]
  const requested = (search.get('vista') as Tab) || 'perfil'
  const tab = tabs.some((t) => t.value === requested) ? requested : 'perfil'
  const setTab = (t: Tab) => {
    setSearch((s) => { const n = new URLSearchParams(s); n.set('vista', t); return n }, { replace: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!studentId) return <ErrorBox message="Tu cuenta no está vinculada a un alumno. Avisa a secretaría." />
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !profile) return <Loading shape="page" label="Cargando el perfil…" />

  const target = { id: profile.student_id, name: profile.first_name ?? 'el alumno' }

  async function moderate(part: 'BIO' | 'TEXT' | 'PROJECT') {
    const what = part === 'BIO' ? 'la presentación' : part === 'TEXT' ? 'la caja de texto' : 'el proyecto destacado'
    if (!confirm(`¿Quitar ${what} de este alumno?`)) return
    try {
      if (part === 'BIO') await clearBio(profile!.student_id)
      else await moderateProfile(profile!.student_id, part)
      toast('Listo, se quitó del perfil.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  const staffActions = (canReward || profile.can_manage) && !profile.is_self
  const canShare = profile.is_self || me?.role === 'GUARDIAN'
  const moderatable = staffActions && profile.can_manage
    ? ([profile.bio ? 'BIO' : null, profile.showcase_data?.TEXT ? 'TEXT' : null, profile.showcase_data?.PROJECT ? 'PROJECT' : null]
      .filter(Boolean) as ('BIO' | 'TEXT' | 'PROJECT')[])
    : []
  const heroActions = staffActions || profile.is_classmate || canShare ? (
    <>
      {profile.is_classmate && <SparkButton profile={profile} onDone={() => void reload(true)} />}
      {canShare && <ShareButton profile={profile} />}
      {staffActions && canReward && <Button size="sm" variant="secondary" onClick={() => setModal('recognize')}><Heart className="h-4 w-4" />Reconocer</Button>}
      {staffActions && canReward && <Button size="sm" variant="secondary" onClick={() => setModal('award')}><Award className="h-4 w-4" />Logro</Button>}
      {staffActions && isAdmin && <Button size="sm" variant="secondary" onClick={() => setModal('adjust')}>Ajustar</Button>}
      {moderatable.map((part) => (
        <Button key={part} size="sm" variant="secondary" onClick={() => void moderate(part)}
          aria-label={part === 'BIO' ? 'Quitar presentación' : part === 'TEXT' ? 'Quitar caja de texto' : 'Quitar proyecto'}
          title={part === 'BIO' ? 'Quitar presentación' : part === 'TEXT' ? 'Quitar caja de texto' : 'Quitar proyecto'}>
          <Eraser className="h-4 w-4" />{part === 'BIO' ? '' : part === 'TEXT' ? 'Texto' : 'Proyecto'}
        </Button>
      ))}
    </>
  ) : undefined

  const background = preview?.background ?? profile.background?.value
  const theme = preview?.theme ?? profile.theme?.value
  const hasBackdrop = !!background && background !== 'none'
  // La barra de XP y las partículas toman los colores del fondo (o del banner) elegido.
  const accent = artAccent(background, preview?.banner ?? profile.banner?.value)
  const accentStyle = accent ? ({ '--xp-a': accent[0], '--xp-b': accent[1] } as CSSProperties) : undefined

  const emptyShowcase = (
    <div className="tp-card tp-rise flex flex-col items-center rounded-2xl border border-dashed border-linea bg-superficie p-8 text-center">
      <Sparkles className="h-8 w-8 text-chispa-600" />
      <p className="mt-2 font-display text-lg font-bold">{profile.is_self ? 'Arma tu vitrina' : `${profile.first_name ?? 'Este alumno'} todavía no armó su vitrina`}</p>
      {profile.is_self && (
        <>
          <p className="mt-1 max-w-md text-sm text-texto-suave">Elige hasta {SHOWCASE_MAX} bloques: tus logros más raros, tu colección, un proyecto, tu curso favorito, una caja de texto…</p>
          <Button className="mt-4" onClick={() => setTab('personalizar')}><Sparkles className="h-4 w-4" />Personalizar mi perfil</Button>
        </>
      )}
    </div>
  )

  return (
    <div className={cn(themeClass(theme), hasBackdrop && 'tesla-glass')} style={accentStyle}>
      <ProfileBackdrop value={background} accent={accent} theme={theme} />
      <ProfileHero profile={profile} preview={preview ?? undefined} actions={heroActions} glass={hasBackdrop} />

      <div className="sticky top-0 z-20 -mx-1 my-5 overflow-x-auto px-1 py-1">
        <div className="inline-flex rounded-2xl bg-superficie/80 p-1 shadow-sm backdrop-blur"><Segmented value={tab} onChange={setTab} options={tabs} /></div>
      </div>

      {tab === 'personalizar' ? (
        <CustomizeTab profile={profile} onPreview={setPreview} onSaved={() => void reload(true)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {tab === 'perfil' && <ShowcaseSection profile={profile} empty={emptyShowcase} />}
            {tab === 'logros' && <AchievementsTab profile={profile} />}
            {tab === 'muro' && <WallTab profile={profile} onChange={() => void reload(true)} />}
            {tab === 'retos' && <RetosTab profile={profile} onChange={() => void reload(true)} />}
            {tab === 'cofres' && <CofresTab profile={profile} onChange={() => void reload(true)} />}
            {tab === 'trayectoria' && <TrayectoriaTab studentId={profile.student_id} />}
            {tab === 'historial' && <HistoryTab studentId={profile.student_id} />}
            {tab === 'aula' && <ClassroomTab profile={profile} />}
          </div>
          <ProfileSidebar profile={profile} onTab={setTab} />
        </div>
      )}

      <RecognizeModal student={modal === 'recognize' ? target : null} onClose={() => setModal(null)} onDone={() => void reload(true)} />
      <AwardModal student={modal === 'award' ? target : null} isAdmin={isAdmin} onClose={() => setModal(null)} onDone={() => void reload(true)} />
      <AdjustModal student={modal === 'adjust' ? target : null} onClose={() => setModal(null)} onDone={() => void reload(true)} />
    </div>
  )
}
