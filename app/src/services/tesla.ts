import { supabase } from '@/lib/supabase'
import { cleanSingleLine, cleanText, positiveInteger, safeFileName } from '@/lib/security'
import { UserError } from '@/lib/errors'
import { assertUploads, cleanLink } from '@/lib/links'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export type Rarity = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'
export type CosmeticKind = 'AVATAR' | 'FRAME' | 'BANNER' | 'TITLE' | 'BACKGROUND' | 'NAME_FX' | 'AURA' | 'THEME' | 'MINI_BG'
export type UnlockType = 'DEFAULT' | 'LEVEL' | 'ACHIEVEMENT' | 'PURCHASE' | 'SEASON' | 'CHEST'
export type ConditionType =
  | 'MANUAL' | 'TASKS_ON_TIME' | 'TASKS_HIGH' | 'STREAK' | 'RECOGNITIONS'
  | 'MONTH_ATTENDANCE' | 'MONTH_PUNCTUALITY' | 'LEVEL' | 'EARLY_TASKS' | 'SPARKS' | 'WALL' | 'COLLECTION'

type CosmeticRef = { id: number; name: string; value: string }

export type TeslaProfile = {
  student_id: number
  first_name: string | null
  last_name: string | null
  classroom_id: number | null
  classroom: string
  xp: number
  level: number
  level_xp: number
  next_level_xp: number
  is_self: boolean
  can_manage: boolean
  bio: string | null
  hide_from_rankings: boolean
  avatar: CosmeticRef | null
  frame: CosmeticRef | null
  banner: CosmeticRef | null
  title: CosmeticRef | null
  background: CosmeticRef | null
  /** Niveles en que se gana cada Estrella Tesla (bronce, plata, oro, Gran Estrella). */
  pin_levels: number[]
  /** Pines físicos ya entregados. */
  pins: { tier: number; delivered_at: string }[]
  name_fx: CosmeticRef | null
  aura: CosmeticRef | null
  /** Tema de los paneles (script 22; falta si no se ejecutó). */
  theme?: CosmeticRef | null
  /** Fondo de la tarjeta del mini-perfil (script 22). */
  mini_bg?: CosmeticRef | null
  /** ¿Acepta mensajes en su muro de felicitaciones? */
  wall_enabled?: boolean
  wall_count?: number
  /** Cosméticos que ya tiene (sin contar los gratuitos). */
  cosmetics_owned?: number
  /** Chispas recibidas de compañeros. */
  sparks: number
  /** ¿Quien mira es un alumno del mismo aula? (puede darle una chispa). */
  is_classmate: boolean
  showcase: ShowcaseBlock[]
  showcase_data?: ShowcaseData
  /** Solo para el propio alumno (lo usa el editor). */
  showcase_config?: ShowcaseConfig
  loadouts?: Loadout[]
  featured: { id: number; name: string; icon: string; rarity: Rarity }[]
  counts: Record<Rarity | 'total', number>
  /** Solo para el alumno, su familia, sus docentes y el personal. */
  coins?: number
  reserved?: number
  best_streak?: number
  current_streak?: number
}

export type Stats = {
  on_time: number; early: number; high: number; recognitions: number; att_months: number; punct_months: number
  sparks?: number; streak?: number; level?: number; wall?: number; collection?: number
}

export type TeslaProgress = {
  all: Stats
  season: Stats | null
  period: { id: number; name: string; starts_on: string; ends_on: string } | null
  secret_total: number
}

export type Achievement = {
  id: number
  code: string
  name: string
  description: string
  icon: string
  rarity: Rarity
  is_secret: boolean
  is_seasonal: boolean
  condition_type: ConditionType
  threshold: number
  reward_xp: number
  reward_coins: number
  is_active: boolean
  sort: number
}

export type EarnedAchievement = { id: number; achievement_id: number; student_id: number; period_id: number | null; note: string | null; earned_at: string }

export type Cosmetic = {
  id: number
  kind: CosmeticKind
  name: string
  value: string
  rarity: Rarity
  unlock_type: UnlockType
  unlock_level: number | null
  unlock_achievement_id: number | null
  price_coins: number | null
  is_active: boolean
  sort: number
}

export type LedgerRow = {
  id: number
  xp: number
  coins: number
  source: 'RULE' | 'RECOGNITION' | 'ACHIEVEMENT' | 'GOAL' | 'REDEMPTION' | 'REFUND' | 'PURCHASE' | 'ADJUST' | 'SPARK' | 'MISSION' | 'SEASON' | 'CHEST'
  rule_code: string | null
  reason: string
  created_at: string
}

export type ClassmateCard = {
  student_id: number
  first_name: string | null
  last_name: string | null
  level: number
  pin_tier: number
  xp: number | null
  coins: number | null
  avatar: string
  frame: string
  title: string
  name_fx: string
  aura: string
  achievements: number
  recognitions_today: number | null
}

export type BoardRow = {
  rank: number
  student_id: number
  first_name: string | null
  last_name: string | null
  avatar: string
  frame: string
  points: number
  previous: number | null
  is_mine: boolean
}

export type GoalMetric = 'ON_TIME_TASKS' | 'ATTENDANCE' | 'RECOGNITIONS' | 'XP'

export type ClassroomGoal = {
  id: number
  title: string
  description: string | null
  metric: GoalMetric
  target: number
  progress: number
  starts_on: string
  ends_on: string
  reward_text: string | null
  reward_xp: number
  reward_coins: number
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  completed_at: string | null
  can_manage: boolean
}

export type RewardKind = 'PRIVILEGE' | 'PHYSICAL'

export type Reward = {
  id: number
  name: string
  description: string | null
  kind: RewardKind
  price_coins: number
  stock: number | null
  per_student_limit: number | null
  image_path: string | null
  level: string | null
  starts_on: string | null
  ends_on: string | null
  is_active: boolean
}

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELIVERED' | 'EXPIRED' | 'CANCELLED'

export type RewardRequest = {
  id: number
  reward_id: number
  student_id: number
  reward_name: string
  reward_kind: RewardKind
  price: number
  status: RequestStatus
  note: string | null
  created_at: string
  expires_at: string
  decided_at: string | null
  decision_reason: string | null
  delivered_at: string | null
  student?: { id: number; first_name: string | null; last_name: string | null; classroom_id: number | null }
}

export type PointRule = { code: string; name: string; description: string | null; xp: number; coins: number; params: Record<string, number>; is_active: boolean; sort: number }
export type RecognitionCategory = { id: number; name: string; icon: string; xp: number; coins: number; is_active: boolean; sort: number }
export type Recognition = { id: number; student_id: number; given_by: string; category_id: number; reason: string; xp: number; coins: number; created_at: string }
export type TeslaSettings = {
  level_step: number
  teacher_daily_recognitions: number
  student_daily_recognitions: number
  request_expiry_days: number
  ranking_enabled: boolean
  pin_levels: number[]
}

export type PinQueueRow = {
  student_id: number
  first_name: string | null
  last_name: string | null
  classroom_id: number | null
  classroom: string
  level: number
  tier: number
  delivered_at: string | null
  can_deliver: boolean
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------
export const RARITY_LABEL: Record<Rarity, string> = { BRONZE: 'Bronce', SILVER: 'Plata', GOLD: 'Oro', PLATINUM: 'Platino' }
export const RARITIES: Rarity[] = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM']

export const CONDITION_LABEL: Record<ConditionType, string> = {
  MANUAL: 'Lo otorga un docente o la dirección',
  TASKS_ON_TIME: 'Tareas entregadas a tiempo',
  TASKS_HIGH: 'Tareas con A o AD',
  STREAK: 'Mejor racha de entregas',
  RECOGNITIONS: 'Reconocimientos recibidos',
  MONTH_ATTENDANCE: 'Meses con asistencia completa',
  MONTH_PUNCTUALITY: 'Meses sin tardanzas',
  LEVEL: 'Nivel alcanzado',
  EARLY_TASKS: 'Tareas entregadas con 1 día de anticipación',
  SPARKS: 'Chispas recibidas de compañeros',
  WALL: 'Felicitaciones recibidas en el muro',
  COLLECTION: 'Porcentaje de la colección de cosméticos',
}

/** Valor del progreso según la condición del logro. */
export function statFor(stats: Stats | null | undefined, condition: ConditionType): number {
  if (!stats) return 0
  switch (condition) {
    case 'TASKS_ON_TIME': return stats.on_time
    case 'TASKS_HIGH': return stats.high
    case 'EARLY_TASKS': return stats.early
    case 'RECOGNITIONS': return stats.recognitions
    case 'MONTH_ATTENDANCE': return stats.att_months
    case 'MONTH_PUNCTUALITY': return stats.punct_months
    case 'STREAK': return stats.streak ?? 0
    case 'LEVEL': return stats.level ?? 0
    case 'SPARKS': return stats.sparks ?? 0
    case 'WALL': return stats.wall ?? 0
    case 'COLLECTION': return stats.collection ?? 0
    default: return 0
  }
}

export const KIND_LABEL: Record<CosmeticKind, string> = {
  AVATAR: 'Avatar', FRAME: 'Marco', BANNER: 'Banner', TITLE: 'Título', BACKGROUND: 'Fondo del perfil', NAME_FX: 'Efecto del nombre', AURA: 'Aura del avatar',
  THEME: 'Tema del perfil', MINI_BG: 'Fondo del mini-perfil',
}

export const GOAL_METRIC_LABEL: Record<GoalMetric, { name: string; unit: string }> = {
  ON_TIME_TASKS: { name: 'Tareas entregadas a tiempo', unit: 'entregas' },
  ATTENDANCE: { name: 'Asistencias del aula', unit: 'asistencias' },
  RECOGNITIONS: { name: 'Reconocimientos del aula', unit: 'reconocimientos' },
  XP: { name: 'XP ganada por el aula', unit: 'XP' },
}

export const REQUEST_STATUS: Record<RequestStatus, { label: string; tone: 'neutral' | 'ok' | 'late' | 'alert' | 'info' | 'spark' }> = {
  PENDING: { label: 'Esperando aprobación', tone: 'spark' },
  APPROVED: { label: 'Aprobado', tone: 'info' },
  DELIVERED: { label: 'Entregado', tone: 'ok' },
  REJECTED: { label: 'Rechazado', tone: 'alert' },
  EXPIRED: { label: 'Venció', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
}

export const LEDGER_SOURCE: Record<LedgerRow['source'], string> = {
  RULE: 'Automático', RECOGNITION: 'Reconocimiento', ACHIEVEMENT: 'Logro', GOAL: 'Meta del aula',
  REDEMPTION: 'Canje', REFUND: 'Devolución', PURCHASE: 'Compra', ADJUST: 'Ajuste',
  SPARK: 'Chispa', MISSION: 'Misión', SEASON: 'Temporada', CHEST: 'Cofre',
}

/** Avance dentro del nivel actual (0 a 1). */
export function levelProgress(p: Pick<TeslaProfile, 'xp' | 'level_xp' | 'next_level_xp'>): number {
  const span = p.next_level_xp - p.level_xp
  return span > 0 ? Math.max(0, Math.min(1, (p.xp - p.level_xp) / span)) : 0
}

/** Los dos colores de un banner de degradado ("#0B1D33,#F0B429"). */
export function bannerColors(value: string | null | undefined): [string, string] {
  const parts = (value ?? '').split(',')
  const ok = (c: string | undefined) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : null)
  return [ok(parts[0]) ?? '#0B1D33', ok(parts[1]) ?? '#F0B429']
}

/** Qué dibuja un banner o fondo: degradado, escena de la app, imagen, video o nada. */
export type Art =
  | { type: 'colors'; c1: string; c2: string }
  | { type: 'scene'; key: string }
  | { type: 'img' | 'vid'; path: string }
  | { type: 'none' }

export function parseArt(value: string | null | undefined): Art {
  const v = value ?? ''
  const m = /^(scene|img|vid):(.+)$/.exec(v)
  if (m) return m[1] === 'scene' ? { type: 'scene', key: m[2] } : { type: m[1] as 'img' | 'vid', path: m[2] }
  if (!v || v === 'none') return { type: 'none' }
  const [c1, c2] = bannerColors(v)
  return { type: 'colors', c1, c2 }
}

// ---------------------------------------------------------------------------
// Estrellas Tesla (insignias de rango por nivel; también son pines físicos)
// ---------------------------------------------------------------------------
export const PIN_NAMES = ['Aspirante', 'Estrella de Bronce', 'Estrella de Plata', 'Estrella de Oro', 'Gran Estrella Tesla'] as const
export const DEFAULT_PIN_LEVELS = [2, 5, 8, 12]
const ROMAN = ['', 'I', 'II', 'III']

export type Rank = { tier: number; stars: number; name: string; fullName: string; nextLevel: number | null }

/** Estrella según el nivel: tier de 0 a 4 y de 1 a 3 estrellitas dentro de cada una. */
export function rankOf(level: number, pinLevels?: number[] | null): Rank {
  const levels = pinLevels?.length === 4 ? pinLevels : DEFAULT_PIN_LEVELS
  const tier = levels.filter((l) => level >= l).length
  const nextLevel = tier < 4 ? levels[tier] : null
  if (tier === 0) return { tier, stars: 0, name: PIN_NAMES[0], fullName: PIN_NAMES[0], nextLevel }
  const start = levels[tier - 1]
  const stars = tier === 4
    ? Math.min(3, 1 + Math.floor((level - start) / 4))
    : Math.min(3, 1 + Math.floor(((level - start) * 3) / (levels[tier] - start)))
  return { tier, stars, name: PIN_NAMES[tier], fullName: `${PIN_NAMES[tier]} ${ROMAN[stars]}`, nextLevel }
}

export function unlockHint(c: Cosmetic, achievements: Map<number, Achievement>): string {
  switch (c.unlock_type) {
    case 'LEVEL': return `Nivel ${c.unlock_level}`
    case 'ACHIEVEMENT': {
      const a = c.unlock_achievement_id ? achievements.get(c.unlock_achievement_id) : null
      return a ? `Logro «${a.name}»` : 'Logro secreto'
    }
    case 'PURCHASE': return `${c.price_coins} monedas`
    case 'SEASON': return 'Pase de temporada'
    case 'CHEST': return 'Cofres sorpresa'
    default: return 'Disponible'
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export const BUCKET_REWARDS = 'campus-rewards'

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row }
  for (const k of keys) if (out[k] != null) (out as Record<string, unknown>)[k as string] = Number(out[k])
  return out
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
export const getProfile = (studentId: number) => rpc<TeslaProfile>('tesla_profile', { p_student_id: positiveInteger(studentId) })
export const getProgress = (studentId: number) => rpc<TeslaProgress>('tesla_progress', { p_student_id: positiveInteger(studentId) })

export async function listAchievements(includeInactive = false): Promise<Achievement[]> {
  let q = supabase.from('achievements').select('*').order('sort').order('id')
  if (!includeInactive) q = q.eq('is_active', true)
  return (must(await q) as Achievement[]).map((a) => num(a, ['id']))
}

export async function listEarned(studentId: number): Promise<EarnedAchievement[]> {
  const rows = must(await supabase.from('student_achievements').select('id, achievement_id, student_id, period_id, note, earned_at')
    .eq('student_id', positiveInteger(studentId)).order('earned_at', { ascending: false })) as EarnedAchievement[]
  return rows.map((r) => num(r, ['id', 'achievement_id', 'student_id', 'period_id']))
}

export async function listLedger(studentId: number, limit = 60): Promise<LedgerRow[]> {
  const rows = must(await supabase.from('point_ledger').select('id, xp, coins, source, rule_code, reason, created_at')
    .eq('student_id', positiveInteger(studentId)).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)) as LedgerRow[]
  return rows.map((r) => num(r, ['id']))
}

export async function listCosmetics(includeInactive = false): Promise<Cosmetic[]> {
  let q = supabase.from('cosmetics').select('*').order('kind').order('sort').order('id')
  if (!includeInactive) q = q.eq('is_active', true)
  return (must(await q) as Cosmetic[]).map((c) => num(c, ['id', 'unlock_achievement_id']))
}

export async function listOwnedCosmetics(studentId: number): Promise<number[]> {
  const rows = must(await supabase.from('student_cosmetics').select('cosmetic_id').eq('student_id', positiveInteger(studentId))) as { cosmetic_id: number }[]
  return rows.map((r) => Number(r.cosmetic_id))
}

export const buyCosmetic = (id: number) => rpc<void>('buy_cosmetic', { p_cosmetic_id: positiveInteger(id) })
export const clearBio = (studentId: number) => rpc<void>('clear_tesla_bio', { p_student_id: positiveInteger(studentId) })

export async function listClassroomCards(classroomId: number): Promise<ClassmateCard[]> {
  const rows = await rpc<ClassmateCard[]>('tesla_classroom_profiles', { p_classroom_id: positiveInteger(classroomId) })
  return rows.map((r) => ({ ...r, student_id: Number(r.student_id) }))
}

export async function listPinQueue(classroomId?: number): Promise<PinQueueRow[]> {
  const rows = await rpc<PinQueueRow[]>('tesla_pin_queue', { p_classroom_id: classroomId ? positiveInteger(classroomId) : null })
  return rows.map((r) => ({ ...r, student_id: Number(r.student_id), classroom_id: r.classroom_id == null ? null : Number(r.classroom_id) }))
}

export const setPinDelivered = (studentId: number, tier: number, delivered: boolean) =>
  rpc<void>('set_pin_delivered', { p_student_id: positiveInteger(studentId), p_tier: Math.round(tier), p_delivered: delivered })

export async function listBoard(classroomId: number, mode: 'CONSTANCY' | 'IMPROVEMENT'): Promise<BoardRow[]> {
  const rows = await rpc<BoardRow[]>('tesla_constancy_board', { p_classroom_id: positiveInteger(classroomId), p_mode: mode })
  return rows.map((r) => ({ ...r, student_id: Number(r.student_id) }))
}

// ---------------------------------------------------------------------------
// Metas de aula
// ---------------------------------------------------------------------------
export async function listGoals(classroomId: number): Promise<ClassroomGoal[]> {
  const rows = await rpc<ClassroomGoal[]>('tesla_classroom_goals', { p_classroom_id: positiveInteger(classroomId) })
  return rows.map((r) => ({ ...r, id: Number(r.id) }))
}

export type GoalInput = {
  id?: number | null; classroomId: number; title: string; description: string; metric: GoalMetric; target: number
  startsOn: string; endsOn: string; rewardText: string; rewardXp: number; rewardCoins: number
}

export function saveGoal(g: GoalInput) {
  const title = cleanSingleLine(g.title, 100)
  if (title.length < 3) throw new UserError('Escribe el nombre de la meta.')
  if (!(g.target > 0)) throw new UserError('El objetivo debe ser mayor que cero.')
  if (g.endsOn < g.startsOn) throw new UserError('La fecha de fin debe ser posterior al inicio.')
  return rpc<number>('save_classroom_goal', {
    p_id: g.id ?? null, p_classroom_id: positiveInteger(g.classroomId), p_title: title, p_description: cleanText(g.description, 300) || null,
    p_metric: g.metric, p_target: Math.round(g.target), p_starts_on: g.startsOn, p_ends_on: g.endsOn,
    p_reward_text: cleanSingleLine(g.rewardText, 120) || null, p_reward_xp: Math.round(g.rewardXp) || 0, p_reward_coins: Math.round(g.rewardCoins) || 0,
  })
}

export const cancelGoal = (id: number) => rpc<void>('cancel_classroom_goal', { p_id: positiveInteger(id) })

// ---------------------------------------------------------------------------
// Reconocimientos y logros manuales
// ---------------------------------------------------------------------------
export async function listCategories(includeInactive = false): Promise<RecognitionCategory[]> {
  let q = supabase.from('recognition_categories').select('*').order('sort').order('id')
  if (!includeInactive) q = q.eq('is_active', true)
  return (must(await q) as RecognitionCategory[]).map((c) => num(c, ['id']))
}

export async function listRecognitions(studentId: number, limit = 20): Promise<Recognition[]> {
  const rows = must(await supabase.from('recognitions').select('*').eq('student_id', positiveInteger(studentId))
    .order('created_at', { ascending: false }).limit(limit)) as Recognition[]
  return rows.map((r) => num(r, ['id', 'student_id', 'category_id']))
}

export function giveRecognition(studentId: number, categoryId: number, reason: string) {
  const text = cleanSingleLine(reason, 200)
  if (text.length < 5) throw new UserError('Escribe el motivo (al menos 5 caracteres).')
  return rpc<{ xp: number; coins: number }>('give_recognition', { p_student_id: positiveInteger(studentId), p_category_id: positiveInteger(categoryId), p_reason: text })
}

export const awardAchievement = (achievementId: number, studentId: number, note: string) =>
  rpc<void>('award_achievement', { p_achievement_id: positiveInteger(achievementId), p_student_id: positiveInteger(studentId), p_note: cleanSingleLine(note, 200) || null })

export const adjustPoints = (studentId: number, xp: number, coins: number, reason: string) =>
  rpc<void>('admin_adjust_points', { p_student_id: positiveInteger(studentId), p_xp: Math.round(xp), p_coins: Math.round(coins), p_reason: cleanSingleLine(reason, 160) })

// ---------------------------------------------------------------------------
// Tienda
// ---------------------------------------------------------------------------
export async function listRewards(includeInactive = false): Promise<Reward[]> {
  let q = supabase.from('rewards').select('*').order('price_coins').order('id')
  if (!includeInactive) q = q.eq('is_active', true)
  return (must(await q) as Reward[]).map((r) => num(r, ['id']))
}

/** ¿Se puede pedir hoy? (vigencia y stock; el resto lo valida la base). */
export function rewardAvailability(r: Reward, today: string): { ok: boolean; reason?: string } {
  if (!r.is_active) return { ok: false, reason: 'No disponible' }
  if (r.starts_on && today < r.starts_on) return { ok: false, reason: 'Aún no empieza' }
  if (r.ends_on && today > r.ends_on) return { ok: false, reason: 'Terminó' }
  if (r.stock != null && r.stock <= 0) return { ok: false, reason: 'Agotado' }
  return { ok: true }
}

export type RewardInput = Omit<Reward, 'id' | 'image_path'> & { id?: number; image_path?: string | null }

export async function saveReward(input: RewardInput, image?: File | null, removeImage = false): Promise<void> {
  const name = cleanSingleLine(input.name, 80)
  if (name.length < 2) throw new UserError('Escribe el nombre de la recompensa.')
  if (!(input.price_coins >= 1)) throw new UserError('El precio debe ser de al menos 1 moneda.')
  if (input.kind === 'PHYSICAL' && (input.stock == null || input.stock < 0)) throw new UserError('Los productos físicos necesitan stock.')
  if (input.starts_on && input.ends_on && input.ends_on < input.starts_on) throw new UserError('La vigencia termina antes de empezar.')
  const row = {
    name,
    description: cleanText(input.description, 500) || null,
    kind: input.kind,
    price_coins: Math.round(input.price_coins),
    stock: input.stock == null ? null : Math.max(0, Math.round(input.stock)),
    per_student_limit: input.per_student_limit ? Math.round(input.per_student_limit) : null,
    level: input.level || null,
    starts_on: input.starts_on || null,
    ends_on: input.ends_on || null,
    is_active: input.is_active,
  }
  let id = input.id
  if (id) must(await supabase.from('rewards').update(row).eq('id', positiveInteger(id)))
  else id = (must(await supabase.from('rewards').insert(row).select('id').single()) as { id: number }).id

  const old = input.image_path ?? null
  if (image) {
    assertUploads()
    if (!/^image\/(jpeg|png|webp)$/.test(image.type)) throw new UserError('La imagen debe ser JPG, PNG o WebP.')
    if (image.size > 3 * 1024 * 1024) throw new UserError('La imagen supera los 3 MB.')
    const path = `${id}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(image.name)}`
    const up = await supabase.storage.from(BUCKET_REWARDS).upload(path, image, { contentType: image.type, upsert: false })
    if (up.error) throw up.error
    must(await supabase.from('rewards').update({ image_path: path }).eq('id', id))
    if (old) await supabase.storage.from(BUCKET_REWARDS).remove([old])
  } else if (removeImage && old) {
    must(await supabase.from('rewards').update({ image_path: null }).eq('id', id))
    await supabase.storage.from(BUCKET_REWARDS).remove([old])
  }
}

export const setRewardActive = async (id: number, active: boolean) =>
  must(await supabase.from('rewards').update({ is_active: active }).eq('id', positiveInteger(id)))

const REQUEST_SELECT = '*, student:students(id, first_name, last_name, classroom_id)'

export async function listRequests(filter: { studentId?: number; classroomId?: number; statuses?: RequestStatus[]; limit?: number } = {}): Promise<RewardRequest[]> {
  let q = supabase.from('reward_requests').select(filter.classroomId ? REQUEST_SELECT.replace('students(', 'students!inner(') : REQUEST_SELECT)
    .order('created_at', { ascending: false }).limit(filter.limit ?? 100)
  if (filter.studentId) q = q.eq('student_id', positiveInteger(filter.studentId))
  if (filter.classroomId) q = q.eq('student.classroom_id', positiveInteger(filter.classroomId))
  if (filter.statuses?.length) q = q.in('status', filter.statuses)
  return (must(await q) as unknown as RewardRequest[]).map((r) => num(r, ['id', 'reward_id', 'student_id']))
}

export const requestReward = (rewardId: number, note: string) =>
  rpc<number>('request_reward', { p_reward_id: positiveInteger(rewardId), p_note: cleanSingleLine(note, 200) || null })
export const cancelRequest = (id: number) => rpc<void>('cancel_reward_request', { p_request_id: positiveInteger(id) })
export const decideRequest = (id: number, approve: boolean, reason = '') =>
  rpc<void>('decide_reward_request', { p_request_id: positiveInteger(id), p_approve: approve, p_reason: cleanSingleLine(reason, 300) || null })
export const deliverRequest = (id: number) => rpc<void>('deliver_reward_request', { p_request_id: positiveInteger(id) })
export const expireRequests = () => rpc<number>('expire_reward_requests')

// ---------------------------------------------------------------------------
// Administración del catálogo
// ---------------------------------------------------------------------------
export async function getSettings(): Promise<TeslaSettings> {
  return must(await supabase.from('tesla_settings')
    .select('level_step, teacher_daily_recognitions, student_daily_recognitions, request_expiry_days, ranking_enabled, pin_levels').eq('id', 1).single()) as TeslaSettings
}

export async function updateSettings(patch: Partial<TeslaSettings>) {
  const p = patch.pin_levels
  if (p && (p.length !== 4 || p[0] < 2 || p[3] > 100 || p.some((l, i) => !Number.isInteger(l) || (i > 0 && l <= p[i - 1])))) {
    throw new UserError('Los niveles de las Estrellas deben ir de menor a mayor, desde el 2 hasta el 100.')
  }
  return must(await supabase.from('tesla_settings').update(patch).eq('id', 1))
}

export async function listRules(): Promise<PointRule[]> {
  return must(await supabase.from('point_rules').select('code, name, description, xp, coins, params, is_active, sort').order('sort')) as PointRule[]
}

export const updateRule = async (code: string, patch: Partial<Pick<PointRule, 'xp' | 'coins' | 'params' | 'is_active'>>) =>
  must(await supabase.from('point_rules').update(patch).eq('code', code))

export async function saveCategory(c: Partial<RecognitionCategory> & { name: string }) {
  const row = { name: cleanSingleLine(c.name, 40), icon: c.icon ?? 'Heart', xp: c.xp ?? 20, coins: c.coins ?? 5, is_active: c.is_active ?? true, sort: c.sort ?? 99 }
  if (row.name.length < 3) throw new UserError('Escribe el nombre de la categoría.')
  if (c.id) must(await supabase.from('recognition_categories').update(row).eq('id', positiveInteger(c.id)))
  else must(await supabase.from('recognition_categories').insert(row))
}

export async function saveAchievement(a: Omit<Achievement, 'id'> & { id?: number }) {
  const row = {
    code: a.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 40),
    name: cleanSingleLine(a.name, 60),
    description: cleanText(a.description, 200),
    icon: a.icon, rarity: a.rarity, is_secret: a.is_secret, is_seasonal: a.is_seasonal,
    condition_type: a.condition_type, threshold: Math.max(1, Math.round(a.threshold)),
    reward_xp: Math.max(0, Math.round(a.reward_xp)), reward_coins: Math.max(0, Math.round(a.reward_coins)),
    is_active: a.is_active, sort: a.sort,
  }
  if (row.code.length < 3) throw new UserError('El código debe tener al menos 3 caracteres (letras, números o _).')
  if (row.name.length < 2) throw new UserError('Escribe el nombre del logro.')
  if (a.id) must(await supabase.from('achievements').update(row).eq('id', positiveInteger(a.id)))
  else must(await supabase.from('achievements').insert(row))
}

export async function saveCosmetic(c: Omit<Cosmetic, 'id'> & { id?: number }) {
  const row = {
    kind: c.kind, name: cleanSingleLine(c.name, 40), value: c.value.trim().slice(0, 60), rarity: c.rarity,
    unlock_type: c.unlock_type,
    unlock_level: c.unlock_type === 'LEVEL' ? c.unlock_level : null,
    unlock_achievement_id: c.unlock_type === 'ACHIEVEMENT' ? c.unlock_achievement_id : null,
    price_coins: c.unlock_type === 'PURCHASE' ? c.price_coins : null,
    is_active: c.is_active, sort: c.sort,
  }
  if (row.name.length < 2 || !row.value) throw new UserError('Completa el nombre y el valor.')
  if (c.id) must(await supabase.from('cosmetics').update(row).eq('id', positiveInteger(c.id)))
  else must(await supabase.from('cosmetics').insert(row))
}

/** Sube la imagen o el video de un banner o fondo y devuelve su valor ("img:…" o "vid:…"). */
export async function uploadCosmeticMedia(file: File): Promise<string> {
  assertUploads()
  const isImage = /^image\/(jpeg|png|webp|gif)$/.test(file.type)
  const isVideo = /^video\/(webm|mp4)$/.test(file.type)
  if (!isImage && !isVideo) throw new UserError('Usa una imagen (JPG, PNG, WebP o GIF) o un video (WebM o MP4).')
  if (file.size > (isVideo ? 12 : 4) * 1024 * 1024) throw new UserError(isVideo ? 'El video supera los 12 MB.' : 'La imagen supera los 4 MB.')
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `cosmetics/${crypto.randomUUID().slice(0, 12)}.${ext}`
  const up = await supabase.storage.from(BUCKET_REWARDS).upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) throw up.error
  return `${isVideo ? 'vid' : 'img'}:${path}`
}

export const closeMonth = (month: string) =>
  rpc<{ month: string; school_days: number; students: number; attendance: number; punctuality: number }>('tesla_close_month', { p_month: month })

// ---------------------------------------------------------------------------
// Vitrina del perfil
// ---------------------------------------------------------------------------
export type ShowcaseBlock =
  | 'STREAK' | 'STATS' | 'PINS' | 'SPARKS' | 'RECENT'
  | 'TEXT' | 'ACHIEVEMENTS' | 'RAREST' | 'COLLECTION' | 'PROJECT' | 'COURSE'

export const SHOWCASE_MAX = 6

export type ShowcaseAchievement = { id: number; name: string; icon: string; rarity: Rarity; earned_at: string; pct?: number | null }

export type ShowcaseData = {
  STREAK?: { current: number; best: number }
  STATS?: { on_time: number; high: number; early: number; recognitions: number }
  SPARKS?: { total: number; kinds: Partial<Record<SparkKind, number>> }
  RECENT?: ShowcaseAchievement[]
  TEXT?: { title?: string; body: string }
  PROJECT?: { title: string; url: string; note?: string }
  ACHIEVEMENTS?: ShowcaseAchievement[]
  RAREST?: (ShowcaseAchievement & { description: string })[]
  COLLECTION?: { items: SeasonCosmetic[]; owned: number; total: number }
  COURSE?: { offering_id: number; name: string; teacher: string | null; note?: string }
}

/** Lo que el alumno configura en cada bloque de la vitrina. */
export type ShowcaseConfig = {
  TEXT?: { title?: string; body: string }
  PROJECT?: { title: string; url: string; note?: string }
  ACHIEVEMENTS?: { ids: number[] }
  COLLECTION?: { ids: number[] }
  COURSE?: { offering_id: number; note?: string }
}

export const SHOWCASE_LABEL: Record<ShowcaseBlock, { name: string; hint: string }> = {
  STREAK: { name: 'Racha', hint: 'Tu racha actual y tu mejor racha de entregas.' },
  STATS: { name: 'Estadísticas', hint: 'Entregas a tiempo, anticipadas, con A/AD y reconocimientos.' },
  PINS: { name: 'Estrellas Tesla', hint: 'Tus Estrellas y los pines que ya recibiste.' },
  SPARKS: { name: 'Chispas', hint: 'Las chispas que te dieron tus compañeros.' },
  RECENT: { name: 'Últimos logros', hint: 'Tus 4 logros más recientes.' },
  TEXT: { name: 'Caja de texto', hint: 'Un título y un texto tuyo (hasta 400 caracteres).' },
  ACHIEVEMENTS: { name: 'Vitrina de logros', hint: 'Elige hasta 6 logros para lucirlos en grande.' },
  RAREST: { name: 'Logros más raros', hint: 'Tus 3 logros que menos alumnos del colegio tienen.' },
  COLLECTION: { name: 'Colección', hint: 'Hasta 8 cosméticos de tu inventario.' },
  PROJECT: { name: 'Proyecto destacado', hint: 'Un enlace a un trabajo tuyo (Drive, Canva, YouTube…).' },
  COURSE: { name: 'Curso favorito', hint: 'El curso que más te gusta y por qué.' },
}

export type Loadout = { slot: number; name: string; ids: number[] }

/** Guarda todo el perfil: un cosmético por tipo, insignias, bio, privacidad, vitrina y muro. */
export function saveMyProfile(input: {
  cosmeticIds: (number | null)[]; featured: number[]; bio: string; hideFromRankings: boolean; showcase: ShowcaseBlock[]
  config?: ShowcaseConfig; wallEnabled?: boolean
}) {
  const bio = cleanSingleLine(input.bio, 200)
  if (bio.length > 140) throw new UserError('La presentación puede tener hasta 140 caracteres.')
  if (input.showcase.length > SHOWCASE_MAX) throw new UserError(`La vitrina admite hasta ${SHOWCASE_MAX} bloques.`)
  const c = input.config
  const url = c?.PROJECT?.url?.trim() ? cleanLink(c.PROJECT.url) : ''
  if (url.length > 300) throw new UserError('El enlace del proyecto es demasiado largo.')
  return rpc<void>('save_my_tesla_profile', {
    p_cosmetic_ids: input.cosmeticIds.filter((x): x is number => x != null),
    p_featured: input.featured.slice(0, 3), p_bio: bio || null, p_hide_from_rankings: input.hideFromRankings, p_showcase: input.showcase,
    ...(c ? {
      p_config: {
        ...(c.TEXT?.body?.trim() ? { TEXT: { title: cleanSingleLine(c.TEXT.title ?? '', 40), body: cleanText(c.TEXT.body, 400) } } : {}),
        ...(url ? { PROJECT: { title: cleanSingleLine(c.PROJECT?.title ?? '', 60), url, note: cleanSingleLine(c.PROJECT?.note ?? '', 140) } } : {}),
        ...(c.ACHIEVEMENTS ? { ACHIEVEMENTS: { ids: c.ACHIEVEMENTS.ids.slice(0, 6) } } : {}),
        ...(c.COLLECTION ? { COLLECTION: { ids: c.COLLECTION.ids.slice(0, 8) } } : {}),
        ...(c.COURSE?.offering_id ? { COURSE: { offering_id: c.COURSE.offering_id, note: cleanSingleLine(c.COURSE.note ?? '', 140) } } : {}),
      },
    } : {}),
    ...(input.wallEnabled !== undefined ? { p_wall_enabled: input.wallEnabled } : {}),
  })
}

/** Guarda (o borra, con ids en null) uno de los 3 conjuntos de cosméticos. */
export const saveLoadout = (slot: number, name: string, ids: number[] | null) =>
  rpc<Loadout[]>('save_tesla_loadout', { p_slot: Math.round(slot), p_name: cleanSingleLine(name, 24), p_cosmetic_ids: ids })

/** Tutor o dirección: quita la presentación, la caja de texto o el proyecto de un alumno. */
export const moderateProfile = (studentId: number, part: 'BIO' | 'TEXT' | 'PROJECT') =>
  rpc<void>('moderate_tesla_profile', { p_student_id: positiveInteger(studentId), p_part: part })

// ---------------------------------------------------------------------------
// Rareza de los logros (porcentaje del colegio que tiene cada uno)
// ---------------------------------------------------------------------------
export type RarityInfo = { holders: number; pct: number }

export async function getAchievementRarity(): Promise<Map<number, RarityInfo>> {
  try {
    const rows = await rpc<{ achievement_id: number; holders: number; pct: number }[]>('tesla_achievement_rarity')
    return new Map(rows.map((r) => [Number(r.achievement_id), { holders: Number(r.holders), pct: Number(r.pct) }]))
  } catch {
    // Sin el script 22 simplemente no se muestra la rareza.
    return new Map()
  }
}

export function rarityLabel(pct: number | null | undefined): string {
  if (pct == null) return ''
  return `${pct < 1 ? pct.toFixed(1) : Math.round(pct)} % del colegio`
}

// ---------------------------------------------------------------------------
// Muro de felicitaciones (solo stickers y frases predefinidas)
// ---------------------------------------------------------------------------
export type WallSticker = 'rayo' | 'estrella' | 'trofeo' | 'cohete' | 'corazon' | 'fuego' | 'aplauso' | 'cerebro' | 'corona' | 'arcoiris' | 'libro' | 'medalla'
export const WALL_STICKERS: { value: WallSticker; emoji: string; label: string }[] = [
  { value: 'rayo', emoji: '⚡', label: 'Rayo' }, { value: 'estrella', emoji: '🌟', label: 'Estrella' },
  { value: 'trofeo', emoji: '🏆', label: 'Trofeo' }, { value: 'cohete', emoji: '🚀', label: 'Cohete' },
  { value: 'corazon', emoji: '💙', label: 'Corazón' }, { value: 'fuego', emoji: '🔥', label: 'Fuego' },
  { value: 'aplauso', emoji: '👏', label: 'Aplausos' }, { value: 'cerebro', emoji: '🧠', label: 'Cerebrito' },
  { value: 'corona', emoji: '👑', label: 'Corona' }, { value: 'arcoiris', emoji: '🌈', label: 'Arcoíris' },
  { value: 'libro', emoji: '📚', label: 'Libros' }, { value: 'medalla', emoji: '🥇', label: 'Medalla' },
]
export const WALL_PHRASES: { value: string; label: string }[] = [
  { value: 'FELICIDADES', label: '¡Felicitaciones!' }, { value: 'SIGUE_ASI', label: '¡Sigue así!' },
  { value: 'GRAN_TRABAJO', label: '¡Gran trabajo!' }, { value: 'GRACIAS', label: 'Gracias por tu ayuda' },
  { value: 'CRACK', label: '¡Eres un crack!' }, { value: 'INSPIRAS', label: 'Nos inspiras' },
  { value: 'EQUIPO', label: 'Gran compañero de equipo' }, { value: 'ORGULLO', label: 'Estamos orgullosos de ti' },
  { value: 'NIVEL', label: '¡Felicidades por tu nuevo nivel!' }, { value: 'ANIMO', label: '¡Tú puedes!' },
]

export type WallPost = {
  id: number
  sticker: WallSticker
  phrase: string
  text: string
  created_at: string
  can_remove: boolean
  author:
    | { kind: 'STUDENT'; student_id: number; name: string | null; avatar: string; frame: string }
    | { kind: 'FAMILY'; name: string }
    | { kind: 'STAFF'; name: string; role: string }
}

export async function getWall(studentId: number): Promise<WallPost[]> {
  const rows = await rpc<WallPost[]>('tesla_wall', { p_student_id: positiveInteger(studentId) })
  return rows.map((r) => ({ ...r, id: Number(r.id) }))
}
export const postWall = (studentId: number, sticker: WallSticker, phrase: string) =>
  rpc<number>('post_wall_message', { p_to_student: positiveInteger(studentId), p_sticker: sticker, p_phrase: phrase })
export const removeWallPost = (id: number) => rpc<void>('remove_wall_post', { p_id: positiveInteger(id) })

// ---------------------------------------------------------------------------
// Chispas entre compañeros
// ---------------------------------------------------------------------------
export type SparkKind = 'AYUDA' | 'EQUIPO' | 'ANIMO' | 'IDEA' | 'AMABLE'
export const SPARK_KINDS: { value: SparkKind; label: string; emoji: string }[] = [
  { value: 'AYUDA', label: 'Me ayudó', emoji: '🤝' },
  { value: 'EQUIPO', label: 'Gran trabajo en equipo', emoji: '🧩' },
  { value: 'ANIMO', label: 'Me dio ánimo', emoji: '💪' },
  { value: 'IDEA', label: 'Tuvo una idea genial', emoji: '💡' },
  { value: 'AMABLE', label: 'Fue muy amable', emoji: '😊' },
]

export const giveSpark = (toStudentId: number, kind: SparkKind) =>
  rpc<{ id: number; rewarded: boolean; left_today: number }>('give_spark', { p_to_student: positiveInteger(toStudentId), p_kind: kind })
export const mySparksToday = () => rpc<{ left: number; given_to: number[] }>('my_sparks_today')

// ---------------------------------------------------------------------------
// Misiones semanales
// ---------------------------------------------------------------------------
export type MissionMetric = 'TASKS_ON_TIME' | 'EARLY_TASKS' | 'TASKS_HIGH' | 'RECOGNITIONS' | 'SPARKS_GIVEN' | 'SPARKS_RECEIVED'
export const MISSION_METRIC_LABEL: Record<MissionMetric, string> = {
  TASKS_ON_TIME: 'Tareas entregadas a tiempo', EARLY_TASKS: 'Tareas con 1 día de anticipación', TASKS_HIGH: 'Tareas con A o AD',
  RECOGNITIONS: 'Reconocimientos de docentes', SPARKS_GIVEN: 'Chispas dadas', SPARKS_RECEIVED: 'Reconocimientos o chispas recibidas',
}

export type Mission = {
  id: number; name: string; description: string; icon: string; metric: MissionMetric; target: number
  reward_xp: number; reward_coins: number; progress: number; claimed: boolean
}
export type WeeklyMission = Omit<Mission, 'progress' | 'claimed'> & { code: string; is_active: boolean; sort: number }

export const getMissions = (studentId: number) =>
  rpc<{ week_start: string; week_end: string; missions: Mission[] }>('tesla_missions', { p_student_id: positiveInteger(studentId) })
export const claimMission = (id: number) => rpc<{ xp: number; coins: number }>('claim_mission', { p_mission_id: positiveInteger(id) })

export async function listWeeklyMissions(): Promise<WeeklyMission[]> {
  return (must(await supabase.from('weekly_missions').select('*').order('sort').order('id')) as WeeklyMission[]).map((m) => num(m, ['id']))
}

export async function saveWeeklyMission(m: Omit<WeeklyMission, 'id'> & { id?: number }) {
  const row = {
    code: m.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 40), name: cleanSingleLine(m.name, 60), description: cleanText(m.description, 160),
    icon: m.icon, metric: m.metric, target: Math.max(1, Math.round(m.target)), reward_xp: Math.max(0, Math.round(m.reward_xp)),
    reward_coins: Math.max(0, Math.round(m.reward_coins)), is_active: m.is_active, sort: m.sort,
  }
  if (row.code.length < 3) throw new UserError('El código debe tener al menos 3 caracteres.')
  if (row.name.length < 3) throw new UserError('Escribe el nombre de la misión.')
  if (m.id) must(await supabase.from('weekly_missions').update(row).eq('id', positiveInteger(m.id)))
  else must(await supabase.from('weekly_missions').insert(row))
}

// ---------------------------------------------------------------------------
// Pase de temporada
// ---------------------------------------------------------------------------
export type SeasonCosmetic = { id: number; kind: CosmeticKind; name: string; value: string; rarity: Rarity }
export type SeasonRewardView = { id: number; tier: number; xp_needed: number; coins: number; cosmetic: SeasonCosmetic | null; claimed: boolean; owned: boolean }
export type Season = { period: { id: number; name: string; starts_on: string; ends_on: string } | null; xp: number; rewards: SeasonRewardView[] }
export type SeasonReward = { id: number; period_id: number | null; tier: number; xp_needed: number; coins: number; cosmetic_id: number | null; is_active: boolean }

export const getSeason = (studentId: number) => rpc<Season>('tesla_season', { p_student_id: positiveInteger(studentId) })
export const claimSeasonReward = (id: number) => rpc<{ coins: number; cosmetic_id: number | null }>('claim_season_reward', { p_reward_id: positiveInteger(id) })

export async function listSeasonRewards(): Promise<SeasonReward[]> {
  return (must(await supabase.from('season_rewards').select('*').order('period_id', { nullsFirst: true }).order('tier')) as SeasonReward[])
    .map((r) => num(r, ['id', 'period_id', 'cosmetic_id']))
}

export async function saveSeasonReward(r: Omit<SeasonReward, 'id'> & { id?: number }) {
  if (!(r.xp_needed >= 1)) throw new UserError('La XP necesaria debe ser al menos 1.')
  if (!(r.coins > 0) && !r.cosmetic_id) throw new UserError('El premio necesita monedas o un cosmético.')
  const row = {
    period_id: r.period_id || null, tier: Math.round(r.tier), xp_needed: Math.round(r.xp_needed), coins: Math.max(0, Math.round(r.coins)),
    cosmetic_id: r.cosmetic_id || null, is_active: r.is_active,
  }
  if (r.id) must(await supabase.from('season_rewards').update(row).eq('id', positiveInteger(r.id)))
  else must(await supabase.from('season_rewards').insert(row))
}

export const deleteSeasonReward = async (id: number) => must(await supabase.from('season_rewards').delete().eq('id', positiveInteger(id)))

export type PeriodLite = { id: number; name: string; starts_on: string; ends_on: string }
export async function listPeriods(): Promise<PeriodLite[]> {
  const rows = must(await supabase.from('grading_periods').select('id, name, starts_on, ends_on').order('starts_on', { ascending: false }).limit(12)) as PeriodLite[]
  return rows.map((r) => num(r, ['id']))
}

// ---------------------------------------------------------------------------
// Cofres sorpresa
// ---------------------------------------------------------------------------
export type Chest = {
  id: number; name: string; description: string; price: number
  w_bronze: number; w_silver: number; w_gold: number; w_platinum: number; is_active: boolean; sort: number
}
export type ChestResult = { duplicate: boolean; refund: number; cosmetic: SeasonCosmetic }

export async function listChests(includeInactive = false): Promise<Chest[]> {
  let q = supabase.from('chests').select('*').order('sort').order('id')
  if (!includeInactive) q = q.eq('is_active', true)
  return (must(await q) as Chest[]).map((c) => num(c, ['id']))
}

/** Probabilidad (0 a 1) de cada rareza en un cofre. */
export function chestOdds(c: Pick<Chest, 'w_bronze' | 'w_silver' | 'w_gold' | 'w_platinum'>): Record<Rarity, number> {
  const total = c.w_bronze + c.w_silver + c.w_gold + c.w_platinum || 1
  return { BRONZE: c.w_bronze / total, SILVER: c.w_silver / total, GOLD: c.w_gold / total, PLATINUM: c.w_platinum / total }
}

export const openChest = (id: number) => rpc<ChestResult>('open_chest', { p_chest_id: positiveInteger(id) })

export async function saveChest(c: Omit<Chest, 'id'> & { id?: number }) {
  const row = {
    name: cleanSingleLine(c.name, 40), description: cleanText(c.description, 160), price: Math.round(c.price),
    w_bronze: Math.max(0, Math.round(c.w_bronze)), w_silver: Math.max(0, Math.round(c.w_silver)),
    w_gold: Math.max(0, Math.round(c.w_gold)), w_platinum: Math.max(0, Math.round(c.w_platinum)), is_active: c.is_active, sort: c.sort,
  }
  if (row.name.length < 2) throw new UserError('Escribe el nombre del cofre.')
  if (!(row.price >= 1)) throw new UserError('El precio debe ser de al menos 1 moneda.')
  if (row.w_bronze + row.w_silver + row.w_gold + row.w_platinum <= 0) throw new UserError('Al menos una rareza debe tener probabilidad.')
  if (c.id) must(await supabase.from('chests').update(row).eq('id', positiveInteger(c.id)))
  else must(await supabase.from('chests').insert(row))
}

// ---------------------------------------------------------------------------
// Trayectoria
// ---------------------------------------------------------------------------
export type TimelineEvent = {
  at: string
  type: 'ACHIEVEMENT' | 'LEVEL' | 'PIN' | 'PIN_DELIVERED' | 'SPARKS' | 'SEASON' | 'RECOGNITION'
  title: string
  detail: string | null
  icon?: string
  rarity?: Rarity
  tier?: number
}
export const getTimeline = (studentId: number) => rpc<TimelineEvent[]>('tesla_timeline', { p_student_id: positiveInteger(studentId) })

// ---------------------------------------------------------------------------
// Identidad Tesla en todo el campus: nombre con efecto y avatar de los alumnos
// que escriben en mensajes, grupos, foro y anuncios. Las consultas se agrupan
// (una sola llamada por pantalla) y se guardan unos minutos.
// ---------------------------------------------------------------------------
export type TeslaIdentity = { profile_id: string; student_id: number; name_fx: string; avatar: string; frame: string; aura: string; level: number }

const identityCache = new Map<string, { at: number; value: TeslaIdentity | null }>()
const identityWaiters = new Map<string, ((v: TeslaIdentity | null) => void)[]>()
let identityTimer: ReturnType<typeof setTimeout> | null = null
let identitiesMissing = false

async function flushIdentities() {
  identityTimer = null
  const ids = [...identityWaiters.keys()].slice(0, 200)
  const waiting = ids.map((id) => [id, identityWaiters.get(id)!] as const)
  ids.forEach((id) => identityWaiters.delete(id))
  let rows: TeslaIdentity[] = []
  try {
    rows = await rpc<TeslaIdentity[]>('tesla_identities', { p_profile_ids: ids })
  } catch {
    // Sin el script 22 los nombres se muestran normales.
    identitiesMissing = true
  }
  const byId = new Map(rows.map((r) => [r.profile_id, { ...r, student_id: Number(r.student_id) }]))
  for (const [id, fns] of waiting) {
    const value = byId.get(id) ?? null
    identityCache.set(id, { at: Date.now(), value })
    fns.forEach((fn) => fn(value))
  }
  if (identityWaiters.size) identityTimer = setTimeout(() => void flushIdentities(), 30)
}

/** Identidad de un perfil (null si no es un alumno o no se puede ver su perfil). */
export function getIdentity(profileId: string): Promise<TeslaIdentity | null> {
  const hit = identityCache.get(profileId)
  if (hit && Date.now() - hit.at < 5 * 60_000) return Promise.resolve(hit.value)
  if (identitiesMissing) return Promise.resolve(null)
  return new Promise((resolve) => {
    identityWaiters.set(profileId, [...(identityWaiters.get(profileId) ?? []), resolve])
    identityTimer ??= setTimeout(() => void flushIdentities(), 30)
  })
}

/** Respuesta inmediata si ya está en memoria (evita parpadeos al repintar). */
export function cachedIdentity(profileId: string): TeslaIdentity | null | undefined {
  return identityCache.get(profileId)?.value
}

// ---------------------------------------------------------------------------
// Valores del colegio: cada logro se agrupa según lo que premia su condición.
// ---------------------------------------------------------------------------
export type Valor = 'DISCIPLINA' | 'LIDERAZGO' | 'EXCELENCIA'

export const VALOR_DE: Record<ConditionType, Valor> = {
  TASKS_ON_TIME: 'DISCIPLINA', EARLY_TASKS: 'DISCIPLINA', STREAK: 'DISCIPLINA', MONTH_ATTENDANCE: 'DISCIPLINA', MONTH_PUNCTUALITY: 'DISCIPLINA',
  RECOGNITIONS: 'LIDERAZGO', SPARKS: 'LIDERAZGO', WALL: 'LIDERAZGO', MANUAL: 'LIDERAZGO',
  TASKS_HIGH: 'EXCELENCIA', LEVEL: 'EXCELENCIA', COLLECTION: 'EXCELENCIA',
}

export const VALORES: { key: Valor; label: string; hint: string }[] = [
  { key: 'DISCIPLINA', label: 'Disciplina', hint: 'Puntualidad, asistencia y entregas a tiempo.' },
  { key: 'LIDERAZGO', label: 'Liderazgo', hint: 'Reconocimientos, chispas y apoyo a tus compañeros.' },
  { key: 'EXCELENCIA', label: 'Excelencia', hint: 'Notas altas, niveles y colecciones completas.' },
]
