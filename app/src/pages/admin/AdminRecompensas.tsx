import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarCheck, Eye, EyeOff, Pencil, Plus, Save } from 'lucide-react'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Select, Textarea } from '@/components/ui'
import {
  AURA_KEYS, ArtLayer, CoinAmount, ICON_NAMES, Medal, NAME_FX_KEYS, NameFx, RankPin, RarityBadge, TeslaAvatar, TeslaIcon, isAnimatedArt,
} from '@/components/tesla'
import { RetosAdminTab } from '@/pages/admin/AdminRetos'
import { SCENES } from '@/components/scenes'
import { FileDropzone } from '@/components/files'
import { PinQueue, RequestQueue } from '@/pages/tesla/TeslaAulaPage'
import { RewardImage } from '@/pages/tesla/TiendaPage'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, limaToday } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  CONDITION_LABEL, DEFAULT_PIN_LEVELS, KIND_LABEL, PIN_NAMES, RARITIES, RARITY_LABEL, bannerColors, closeMonth, getSettings, listAchievements, listCategories, listCosmetics,
  listRewards, listRules, saveAchievement, saveCategory, saveCosmetic, saveReward, setRewardActive, updateRule, updateSettings, uploadCosmeticMedia,
  type Achievement, type ConditionType, type Cosmetic, type CosmeticKind, type PointRule, type Rarity, type RecognitionCategory,
  type Reward, type RewardInput, type TeslaSettings, type UnlockType,
} from '@/services/tesla'

type Tab = 'canjes' | 'insignias' | 'recompensas' | 'logros' | 'retos' | 'reglas' | 'cosmeticos'

// ---------------------------------------------------------------------------
// Recompensas
// ---------------------------------------------------------------------------
const EMPTY_REWARD: RewardInput = {
  name: '', description: '', kind: 'PRIVILEGE', price_coins: 50, stock: null, per_student_limit: null,
  level: null, starts_on: null, ends_on: null, is_active: true,
}

function RewardForm({ reward, onClose, onSaved }: { reward: Reward | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const initial: RewardInput = reward && reward !== 'new' ? reward : EMPTY_REWARD
  const [f, setF] = useState<RewardInput>(initial)
  const [image, setImage] = useState<File[]>([])
  const [removeImage, setRemoveImage] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof RewardInput>(k: K, v: RewardInput[K]) => setF((x) => ({ ...x, [k]: v }))
  const numOrNull = (v: string) => (v === '' ? null : Number(v))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await saveReward(f, image[0] ?? null, removeImage)
      toast(f.id ? 'Recompensa actualizada.' : 'Recompensa publicada en la tienda.')
      onSaved()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!reward} onClose={onClose} title={f.id ? 'Editar recompensa' : 'Nueva recompensa'} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={80} placeholder="Elegir tu sitio por una semana" /></Field>
        <Field label="Descripción" className="sm:col-span-2"><Textarea value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} maxLength={500} className="min-h-20" /></Field>
        <Field label="Tipo">
          <Select value={f.kind} onChange={(e) => { const k = e.target.value as RewardInput['kind']; setF((x) => ({ ...x, kind: k, stock: k === 'PHYSICAL' ? x.stock ?? 10 : x.stock })) }}>
            <option value="PRIVILEGE">Privilegio o experiencia</option>
            <option value="PHYSICAL">Producto físico</option>
          </Select>
        </Field>
        <Field label="Precio (monedas)"><Input type="number" min={1} value={f.price_coins} onChange={(e) => set('price_coins', Number(e.target.value))} required /></Field>
        <Field label="Stock" hint={f.kind === 'PHYSICAL' ? 'Obligatorio para productos.' : 'Vacío = ilimitado.'}>
          <Input type="number" min={0} value={f.stock ?? ''} onChange={(e) => set('stock', numOrNull(e.target.value))} required={f.kind === 'PHYSICAL'} />
        </Field>
        <Field label="Límite por alumno" hint="Vacío = sin límite."><Input type="number" min={1} max={100} value={f.per_student_limit ?? ''} onChange={(e) => set('per_student_limit', numOrNull(e.target.value))} /></Field>
        <Field label="Nivel">
          <Select value={f.level ?? ''} onChange={(e) => set('level', e.target.value || null)}>
            <option value="">Todo el colegio</option>
            <option value="Primaria">Solo Primaria</option>
            <option value="Secundaria">Solo Secundaria</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde"><Input type="date" value={f.starts_on ?? ''} onChange={(e) => set('starts_on', e.target.value || null)} /></Field>
          <Field label="Hasta"><Input type="date" value={f.ends_on ?? ''} onChange={(e) => set('ends_on', e.target.value || null)} /></Field>
        </div>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-bold">Imagen (opcional)</p>
          {f.image_path && !removeImage && image.length === 0 ? (
            <div className="flex items-center gap-3">
              <RewardImage reward={{ image_path: f.image_path, kind: f.kind }} className="h-20 w-28 rounded-lg" />
              <Button type="button" size="sm" variant="secondary" onClick={() => setRemoveImage(true)}>Quitar o cambiar</Button>
            </div>
          ) : (
            <FileDropzone files={image} onChange={setImage} accept="image/jpeg,image/png,image/webp" maxBytes={3 * 1024 * 1024} hint="JPG, PNG o WebP de hasta 3 MB." />
          )}
        </div>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" />
          <span className="font-bold">Visible en la tienda</span>
        </label>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><Save className="h-4 w-4" />Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function RewardsTab() {
  const toast = useToast()
  const [editing, setEditing] = useState<Reward | 'new' | null>(null)
  const { data, loading, error, reload } = useAsync(() => listRewards(true), [])
  const today = limaToday()

  async function toggle(r: Reward) {
    try {
      await setRewardActive(r.id, !r.is_active)
      toast(r.is_active ? 'Oculta de la tienda.' : 'Visible en la tienda.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <Panel title="Recompensas" action={<Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Nueva</Button>}>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? (
        <Empty title="La tienda está vacía" art="notebook" compact>Crea privilegios (elegir sitio, ser DJ del recreo…) o productos con stock.</Empty>
      ) : (
        <ul className="divide-y divide-linea">
          {data.map((r) => {
            const expired = r.ends_on && r.ends_on < today
            return (
              <li key={r.id} className={cn('flex flex-wrap items-center gap-3 py-3', !r.is_active && 'opacity-60')}>
                <RewardImage reward={r} className="h-14 w-20 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{r.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-texto-suave">
                    <CoinAmount value={r.price_coins} className="text-sm" />
                    <Badge tone={r.kind === 'PHYSICAL' ? 'info' : 'spark'}>{r.kind === 'PHYSICAL' ? 'Producto' : 'Privilegio'}</Badge>
                    {r.stock != null && <span>Stock {r.stock}</span>}
                    {r.per_student_limit && <span>Máx. {r.per_student_limit} por alumno</span>}
                    {r.level && <span>{r.level}</span>}
                    {(r.starts_on || r.ends_on) && <span>{r.starts_on ? formatShort(r.starts_on) : '…'} – {r.ends_on ? formatShort(r.ends_on) : '…'}</span>}
                    {expired && <Badge>Vencida</Badge>}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void toggle(r)}>{r.is_active ? <><EyeOff className="h-4 w-4" />Ocultar</> : <><Eye className="h-4 w-4" />Mostrar</>}</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" />Editar</Button>
              </li>
            )
          })}
        </ul>
      )}
      <RewardForm key={editing === 'new' ? 'new' : editing?.id ?? 'none'} reward={editing} onClose={() => setEditing(null)} onSaved={() => void reload(true)} />
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Logros
// ---------------------------------------------------------------------------
const CONDITIONS = Object.keys(CONDITION_LABEL) as ConditionType[]

function AchievementForm({ achievement, onClose, onSaved }: { achievement: Achievement | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<Omit<Achievement, 'id'> & { id?: number }>(() => (achievement && achievement !== 'new' ? achievement : {
    code: '', name: '', description: '', icon: 'Trophy', rarity: 'BRONZE', is_secret: false, is_seasonal: false,
    condition_type: 'MANUAL', threshold: 1, reward_xp: 20, reward_coins: 10, is_active: true, sort: 50,
  }))
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await saveAchievement(f)
      toast('Logro guardado.')
      onSaved()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!achievement} onClose={onClose} title={f.id ? 'Editar logro' : 'Nuevo logro'} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 sm:col-span-2">
          <Medal icon={f.icon} rarity={f.rarity} size={64} />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre"><Input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={60} /></Field>
            <Field label="Código" hint="Único, en mayúsculas (ej. LECTOR_10)."><Input value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} required maxLength={40} disabled={!!f.id} /></Field>
          </div>
        </div>
        <Field label="Descripción" className="sm:col-span-2"><Input value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={200} /></Field>
        <Field label="Rareza">
          <Select value={f.rarity} onChange={(e) => set('rarity', e.target.value as Rarity)}>{RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}</Select>
        </Field>
        <Field label="Cómo se gana">
          <Select value={f.condition_type} onChange={(e) => set('condition_type', e.target.value as ConditionType)}>{CONDITIONS.map((c) => <option key={c} value={c}>{CONDITION_LABEL[c]}</option>)}</Select>
        </Field>
        {f.condition_type !== 'MANUAL' && (
          <Field label="Cantidad necesaria"><Input type="number" min={1} value={f.threshold} onChange={(e) => set('threshold', Number(e.target.value))} /></Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Premio XP"><Input type="number" min={0} max={2000} value={f.reward_xp} onChange={(e) => set('reward_xp', Number(e.target.value))} /></Field>
          <Field label="Premio monedas"><Input type="number" min={0} max={2000} value={f.reward_coins} onChange={(e) => set('reward_coins', Number(e.target.value))} /></Field>
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-bold">Ícono</legend>
          <div className="flex flex-wrap gap-1.5">
            {ICON_NAMES.map((n) => (
              <button key={n} type="button" aria-pressed={f.icon === n} aria-label={n} onClick={() => set('icon', n)}
                className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', f.icon === n ? 'border-tinta bg-chispa-100' : 'border-linea')}>
                <TeslaIcon name={n} className="h-5 w-5" />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_secret} onChange={(e) => set('is_secret', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" /><span><b>Secreto:</b> los alumnos no lo ven hasta ganarlo.</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_seasonal} onChange={(e) => set('is_seasonal', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" /><span><b>De temporada:</b> cuenta solo dentro del bimestre y se gana una vez por bimestre.</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" /><span><b>Activo</b></span></label>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><Save className="h-4 w-4" />Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function AchievementsTab() {
  const [editing, setEditing] = useState<Achievement | 'new' | null>(null)
  const { data, loading, error, reload } = useAsync(() => listAchievements(true), [])
  return (
    <Panel title="Catálogo de logros" action={<Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Nuevo</Button>}>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(data ?? []).map((a) => (
            <li key={a.id} className={cn('flex items-center gap-3 rounded-xl border border-linea p-3', !a.is_active && 'opacity-60')}>
              <Medal icon={a.icon} rarity={a.rarity} size={48} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{a.name}</p>
                <p className="truncate text-sm text-texto-suave">{a.condition_type === 'MANUAL' ? CONDITION_LABEL.MANUAL : `${CONDITION_LABEL[a.condition_type]}: ${a.threshold}`}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                  <RarityBadge rarity={a.rarity} />
                  {a.is_secret && <Badge tone="info">Secreto</Badge>}
                  {a.is_seasonal && <Badge tone="spark">Temporada</Badge>}
                  {!a.is_active && <Badge>Inactivo</Badge>}
                  <span className="text-texto-suave">+{a.reward_xp} XP · +{a.reward_coins} monedas</span>
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <AchievementForm key={editing === 'new' ? 'new' : editing?.id ?? 'none'} achievement={editing} onClose={() => setEditing(null)} onSaved={() => void reload(true)} />
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Reglas, categorías y configuración
// ---------------------------------------------------------------------------
const PARAM_LABEL: Record<string, string> = { length: 'Tareas seguidas', min_score20: 'Nota mínima (sobre 20)', min_pct: '% mínimo de asistencia' }

function RuleRow({ rule, onSaved }: { rule: PointRule; onSaved: () => void }) {
  const toast = useToast()
  const [xp, setXp] = useState(String(rule.xp))
  const [coins, setCoins] = useState(String(rule.coins))
  const [params, setParams] = useState<Record<string, string>>(Object.fromEntries(Object.entries(rule.params).map(([k, v]) => [k, String(v)])))
  const [busy, setBusy] = useState(false)
  const dirty = xp !== String(rule.xp) || coins !== String(rule.coins) || Object.entries(params).some(([k, v]) => v !== String(rule.params[k]))

  async function save(patch: Parameters<typeof updateRule>[1], ok: string) {
    setBusy(true)
    try {
      await updateRule(rule.code, patch)
      toast(ok)
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn('grid gap-3 py-4 lg:grid-cols-[1fr_auto] lg:items-end', !rule.is_active && 'opacity-60')}>
      <div>
        <p className="font-bold">{rule.name} {!rule.is_active && <Badge>Apagada</Badge>}</p>
        {rule.description && <p className="text-sm text-texto-suave">{rule.description}</p>}
        <div className="mt-2 flex flex-wrap gap-3">
          <Field label="XP"><Input type="number" min={0} max={1000} value={xp} onChange={(e) => setXp(e.target.value)} className="w-24" /></Field>
          <Field label="Monedas"><Input type="number" min={0} max={1000} value={coins} onChange={(e) => setCoins(e.target.value)} className="w-24" /></Field>
          {Object.keys(params).map((k) => (
            <Field key={k} label={PARAM_LABEL[k] ?? k}><Input type="number" min={0} value={params[k]} onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))} className="w-32" /></Field>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        {dirty && (
          <Button size="sm" loading={busy} onClick={() => void save({
            xp: Number(xp) || 0, coins: Number(coins) || 0,
            params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Number(v)])),
          }, 'Regla actualizada.')}><Save className="h-4 w-4" />Guardar</Button>
        )}
        <Button size="sm" variant="secondary" loading={busy && !dirty} onClick={() => void save({ is_active: !rule.is_active }, rule.is_active ? 'Regla apagada.' : 'Regla encendida.')}>
          {rule.is_active ? 'Apagar' : 'Encender'}
        </Button>
      </div>
    </li>
  )
}

function CategoryRow({ category, onSaved }: { category: RecognitionCategory | null; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ name: category?.name ?? '', icon: category?.icon ?? 'Heart', xp: String(category?.xp ?? 20), coins: String(category?.coins ?? 5) })
  const [busy, setBusy] = useState(false)

  async function save(active = category?.is_active ?? true) {
    setBusy(true)
    try {
      await saveCategory({ id: category?.id, name: f.name, icon: f.icon, xp: Number(f.xp) || 0, coins: Number(f.coins) || 0, is_active: active, sort: category?.sort })
      toast(category ? 'Categoría actualizada.' : 'Categoría agregada.')
      if (!category) setF({ name: '', icon: 'Heart', xp: '20', coins: '5' })
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={cn('flex flex-wrap items-end gap-2 py-2', category && !category.is_active && 'opacity-60')}>
      <Select value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} className="w-36" aria-label="Ícono">
        {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
      </Select>
      <span className="flex h-11 w-9 items-center justify-center"><TeslaIcon name={f.icon} className="h-5 w-5" /></span>
      <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Nueva categoría" maxLength={40} className="min-w-40 flex-1" aria-label="Nombre" />
      <Input type="number" min={0} max={500} value={f.xp} onChange={(e) => setF({ ...f, xp: e.target.value })} className="w-20" aria-label="XP" title="XP" />
      <Input type="number" min={0} max={500} value={f.coins} onChange={(e) => setF({ ...f, coins: e.target.value })} className="w-20" aria-label="Monedas" title="Monedas" />
      <Button size="sm" variant={category ? 'secondary' : 'primary'} loading={busy} onClick={() => void save()}>{category ? 'Guardar' : <><Plus className="h-4 w-4" />Agregar</>}</Button>
      {category && <Button size="sm" variant="ghost" onClick={() => void save(!category.is_active)}>{category.is_active ? 'Desactivar' : 'Activar'}</Button>}
    </li>
  )
}

function SettingsPanel({ settings, onSaved }: { settings: TeslaSettings; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 7)
  })
  const [closing, setClosing] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await updateSettings(f)
      toast('Configuración guardada.')
      onSaved()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    setClosing(true)
    try {
      const r = await closeMonth(`${month}-01`)
      toast(`${r.month}: ${r.school_days} días de clase. ${r.attendance} alumnos con asistencia completa y ${r.punctuality} sin tardanzas.`)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setClosing(false)
    }
  }

  const n = (k: keyof TeslaSettings) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: Number(e.target.value) }))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Topes y canjes">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reconocimientos por docente al día"><Input type="number" min={1} max={200} value={f.teacher_daily_recognitions} onChange={n('teacher_daily_recognitions')} /></Field>
          <Field label="Reconocimientos por alumno al día"><Input type="number" min={1} max={50} value={f.student_daily_recognitions} onChange={n('student_daily_recognitions')} /></Field>
          <Field label="Días para responder un canje" hint="Después vence y se devuelven las monedas."><Input type="number" min={1} max={60} value={f.request_expiry_days} onChange={n('request_expiry_days')} /></Field>
          <Field label="XP por nivel" hint={`Nivel 2 = ${f.level_step} XP, nivel 5 = ${f.level_step * 10} XP.`}><Input type="number" min={10} max={10000} value={f.level_step} onChange={n('level_step')} /></Field>
        </div>
        <label className="mt-4 flex items-start gap-3">
          <input type="checkbox" checked={f.ranking_enabled} onChange={(e) => setF((x) => ({ ...x, ranking_enabled: e.target.checked }))} className="mt-1 h-5 w-5 accent-[#0B1D33]" />
          <span><b>Ranking de constancia por aula</b><span className="block text-sm text-texto-suave">Mide entregas a tiempo, rachas y asistencia (nunca notas). Cada alumno puede ocultarse.</span></span>
        </label>
        <div className="mt-5 border-t border-linea pt-4">
          <p className="font-bold">Estrellas Tesla</p>
          <p className="text-sm text-texto-suave">Nivel con el que se gana cada Estrella (y su pin físico). Deben ir de menor a mayor.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => {
              const levels = f.pin_levels?.length === 4 ? f.pin_levels : DEFAULT_PIN_LEVELS
              return (
                <Field key={i} label={PIN_NAMES[i + 1]}>
                  <span className="flex items-center gap-2">
                    <RankPin tier={i + 1} size={28} />
                    <Input type="number" min={2} max={100} value={levels[i]}
                      onChange={(e) => setF((x) => ({ ...x, pin_levels: levels.map((l, j) => (j === i ? Number(e.target.value) : l)) }))} />
                  </span>
                </Field>
              )
            })}
          </div>
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={() => void save()} loading={busy}><Save className="h-4 w-4" />Guardar</Button></div>
      </Panel>
      <Panel title="Asistencia del mes (Tesla)">
        <p className="text-sm text-texto-suave">
          Calcula los puntos de asistencia y puntualidad de un mes ya terminado con los registros de Tesla. Puedes repetirlo sin duplicar puntos
          (por ejemplo, si se corrigió la asistencia). Con pg_cron se hace solo el 1.° de cada mes.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label="Mes"><Input type="month" value={month} max={limaToday().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} /></Field>
          <Button onClick={() => void close()} loading={closing}><CalendarCheck className="h-4 w-4" />Calcular</Button>
        </div>
      </Panel>
    </div>
  )
}

function RulesTab() {
  const { data, loading, error, reload } = useAsync(async () => {
    const [rules, categories, settings] = await Promise.all([listRules(), listCategories(true), getSettings()])
    return { rules, categories, settings }
  }, [], { live: false })
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading shape="page" />
  return (
    <div className="space-y-6">
      <Panel title="Puntos automáticos">
        <ul className="divide-y divide-linea">{data.rules.map((r) => <RuleRow key={`${r.code}-${r.xp}-${r.coins}-${r.is_active}-${JSON.stringify(r.params)}`} rule={r} onSaved={() => void reload(true)} />)}</ul>
      </Panel>
      <Panel title="Categorías de reconocimiento">
        <p className="mb-2 text-sm text-texto-suave">Ícono, nombre, XP y monedas que recibe el alumno.</p>
        <ul className="divide-y divide-linea">
          {data.categories.map((c) => <CategoryRow key={`${c.id}-${c.is_active}`} category={c} onSaved={() => void reload(true)} />)}
          <CategoryRow category={null} onSaved={() => void reload(true)} />
        </ul>
      </Panel>
      <SettingsPanel key={JSON.stringify(data.settings)} settings={data.settings} onSaved={() => void reload(true)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cosméticos
// ---------------------------------------------------------------------------
const KINDS: CosmeticKind[] = ['BACKGROUND', 'BANNER', 'AVATAR', 'AURA', 'FRAME', 'NAME_FX', 'TITLE']
const FRAMES = ['none', 'bronze', 'silver', 'gold', 'platinum', 'spark', 'coil']
const UNLOCK_LABEL: Record<UnlockType, string> = {
  DEFAULT: 'Disponible para todos', LEVEL: 'Por nivel', ACHIEVEMENT: 'Por logro', PURCHASE: 'Compra con monedas', SEASON: 'Pase de temporada', CHEST: 'Cofres sorpresa',
}

function CosmeticForm({ cosmetic, achievements, onClose, onSaved }: { cosmetic: Cosmetic | CosmeticKind | null; achievements: Achievement[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState<Omit<Cosmetic, 'id'> & { id?: number }>(() => (cosmetic && typeof cosmetic === 'object' ? cosmetic : {
    kind: (cosmetic as CosmeticKind) ?? 'AVATAR', name: '',
    value: cosmetic === 'FRAME' ? 'gold' : cosmetic === 'BANNER' ? '#0B1D33,#F0B429' : cosmetic === 'BACKGROUND' ? 'scene:galaxia'
      : cosmetic === 'NAME_FX' ? 'oro' : cosmetic === 'AURA' ? 'chispas' : '',
    rarity: 'BRONZE', unlock_type: 'PURCHASE', unlock_level: 3, unlock_achievement_id: achievements[0]?.id ?? null, price_coins: 50, is_active: true, sort: 50,
  }))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const [b1, b2] = bannerColors(f.value)
  const isArt = f.kind === 'BANNER' || f.kind === 'BACKGROUND'
  const artMode = f.value.startsWith('scene:') ? 'scene' : /^(img|vid):/.test(f.value) ? 'media' : f.value === 'none' ? 'none' : 'colors'

  function setMode(mode: string) {
    if (mode === 'scene') set('value', 'scene:galaxia')
    else if (mode === 'colors') set('value', '#0B1D33,#F0B429')
    else if (mode === 'none') set('value', 'none')
    else set('value', '')
  }

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      set('value', await uploadCosmeticMedia(file))
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await saveCosmetic(f)
      toast('Cosmético guardado.')
      onSaved()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!cosmetic} onClose={onClose} title={f.id ? `Editar ${KIND_LABEL[f.kind].toLowerCase()}` : `Nuevo ${KIND_LABEL[f.kind].toLowerCase()}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre"><Input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={40} /></Field>
        {f.kind === 'AVATAR' && <Field label="Emoji" hint="Pega un emoji (🦙, 🚀, 🐉…)."><Input value={f.value} onChange={(e) => set('value', e.target.value)} required maxLength={16} className="text-2xl" /></Field>}
        {f.kind === 'TITLE' && <Field label="Texto del título"><Input value={f.value} onChange={(e) => set('value', e.target.value)} required maxLength={40} /></Field>}
        {(f.kind === 'NAME_FX' || f.kind === 'AURA') && (
          <div className="flex items-end gap-4">
            <Field label="Efecto" className="flex-1">
              <Select value={f.value} onChange={(e) => set('value', e.target.value)}>{(f.kind === 'AURA' ? AURA_KEYS : NAME_FX_KEYS).map((v) => <option key={v} value={v}>{v}</option>)}</Select>
            </Field>
            <span className="flex h-20 min-w-24 items-center justify-center rounded-xl bg-papel px-3">
              {f.kind === 'AURA' ? <TeslaAvatar emoji="⚡" aura={f.value} size={48} /> : <span className="font-display text-xl font-bold"><NameFx fx={f.value} text="Ramiro" /></span>}
            </span>
          </div>
        )}
        {f.kind === 'FRAME' && (
          <Field label="Estilo">
            <Select value={f.value} onChange={(e) => set('value', e.target.value)}>{FRAMES.map((v) => <option key={v} value={v}>{v}</option>)}</Select>
          </Field>
        )}
        {isArt && (
          <Field label="Tipo">
            <Segmented value={artMode} onChange={setMode} options={[
              { value: 'scene', label: 'Escena' },
              ...(f.kind === 'BANNER' ? [{ value: 'colors', label: 'Colores' }] : [{ value: 'none', label: 'Sin fondo' }]),
              { value: 'media', label: 'Imagen o video' },
            ]} />
          </Field>
        )}
        {isArt && artMode === 'scene' && (
          <ul className="art-tile-grid grid grid-cols-3 gap-2 sm:grid-cols-4">
            {SCENES.map((s) => {
              const v = `scene:${s.key}`
              return (
                <li key={s.key}>
                  <button type="button" aria-pressed={f.value === v} onClick={() => set('value', v)}
                    className={cn('art-tile w-full rounded-lg border p-1 text-center text-xs font-bold', f.value === v ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500')}>
                    <span className="relative block aspect-video overflow-hidden rounded-md"><ArtLayer value={v} /></span>
                    <span className="mt-1 block truncate">{s.name}{s.animated ? '' : ' (estática)'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {f.kind === 'BANNER' && artMode === 'colors' && (
          <div className="flex items-end gap-3">
            <Field label="Color 1"><input type="color" value={b1} onChange={(e) => set('value', `${e.target.value.toUpperCase()},${b2}`)} className="h-11 w-16 rounded-lg border border-linea" /></Field>
            <Field label="Color 2"><input type="color" value={b2} onChange={(e) => set('value', `${b1},${e.target.value.toUpperCase()}`)} className="h-11 w-16 rounded-lg border border-linea" /></Field>
            <span className="h-11 flex-1 rounded-lg" style={{ background: `linear-gradient(120deg, ${b1}, ${b2})` }} />
          </div>
        )}
        {isArt && artMode === 'media' && (
          <Field label="Archivo" hint="Imagen JPG, PNG, WebP o GIF de hasta 4 MB, o video WebM/MP4 en bucle de hasta 12 MB (sin audio). Mejor en horizontal, 1920 × 1080.">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/webm,video/mp4" onChange={(e) => void upload(e.target.files?.[0])} disabled={uploading} />
          </Field>
        )}
        {isArt && artMode !== 'none' && f.value && (
          <div className={cn('relative overflow-hidden rounded-xl border border-linea', f.kind === 'BACKGROUND' ? 'aspect-video' : 'h-24')}>
            <ArtLayer value={f.value} />
            {uploading && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white">Subiendo…</span>}
          </div>
        )}
        {f.kind === 'FRAME' && <div className="flex justify-center"><TeslaAvatar emoji="⚡" frame={f.value} size={72} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rareza"><Select value={f.rarity} onChange={(e) => set('rarity', e.target.value as Rarity)}>{RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}</Select></Field>
          <Field label="Cómo se obtiene">
            <Select value={f.unlock_type} onChange={(e) => set('unlock_type', e.target.value as UnlockType)}>
              {(Object.keys(UNLOCK_LABEL) as UnlockType[]).map((u) => <option key={u} value={u}>{UNLOCK_LABEL[u]}</option>)}
            </Select>
          </Field>
        </div>
        {f.unlock_type === 'LEVEL' && <Field label="Nivel"><Input type="number" min={2} max={100} value={f.unlock_level ?? 2} onChange={(e) => set('unlock_level', Number(e.target.value))} /></Field>}
        {f.unlock_type === 'PURCHASE' && <Field label="Precio (monedas)"><Input type="number" min={1} value={f.price_coins ?? 50} onChange={(e) => set('price_coins', Number(e.target.value))} /></Field>}
        {f.unlock_type === 'ACHIEVEMENT' && (
          <Field label="Logro">
            <Select value={f.unlock_achievement_id ?? ''} onChange={(e) => set('unlock_achievement_id', Number(e.target.value))}>
              {achievements.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" /><b>Activo</b></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><Save className="h-4 w-4" />Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function CosmeticsTab() {
  const [editing, setEditing] = useState<Cosmetic | CosmeticKind | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const [cosmetics, achievements] = await Promise.all([listCosmetics(true), listAchievements(true)])
    return { cosmetics, achievements }
  }, [])
  if (error) return <ErrorBox message={error} onRetry={() => void reload()} />
  if (loading || !data) return <Loading />
  const achName = new Map(data.achievements.map((a) => [a.id, a.name]))
  return (
    <div className="space-y-6">
      {KINDS.map((kind) => (
        <Panel key={kind} title={KIND_LABEL[kind]} action={<Button size="sm" variant="secondary" onClick={() => setEditing(kind)}><Plus className="h-4 w-4" />Agregar</Button>}>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.cosmetics.filter((c) => c.kind === kind).map((c) => {
              return (
                <li key={c.id}>
                  <button onClick={() => setEditing(c)} className={cn('flex w-full items-center gap-3 rounded-xl border border-linea p-2 text-left hover:border-tinta-500', !c.is_active && 'opacity-50')}>
                    {kind === 'AVATAR' && <TeslaAvatar emoji={c.value} size={40} />}
                    {kind === 'FRAME' && <TeslaAvatar emoji="⚡" frame={c.value} size={40} />}
                    {(kind === 'BANNER' || kind === 'BACKGROUND') && (
                      <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-linea">
                        {c.value === 'none' ? <span className="absolute inset-0 bg-papel" /> : <ArtLayer value={c.value} still />}
                      </span>
                    )}
                    {kind === 'TITLE' && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-papel text-xs font-bold">Aa</span>}
                    {kind === 'AURA' && <TeslaAvatar emoji="⚡" aura={c.value} size={32} className="m-1" />}
                    {kind === 'NAME_FX' && <span className="flex h-10 w-16 shrink-0 items-center justify-center font-display font-bold"><NameFx fx={c.value} text="Aa" /></span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.name}</span>
                      <span className="block truncate text-xs text-texto-suave">
                        {c.unlock_type === 'LEVEL' ? `Nivel ${c.unlock_level}` : c.unlock_type === 'PURCHASE' ? `${c.price_coins} monedas`
                          : c.unlock_type === 'ACHIEVEMENT' ? `Logro «${achName.get(c.unlock_achievement_id ?? 0) ?? '?'}»` : 'Para todos'}
                        {isAnimatedArt(c.value) && ' · animado'}
                        {!c.is_active && ' · inactivo'}
                      </span>
                    </span>
                    <RarityBadge rarity={c.rarity} />
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
      ))}
      <CosmeticForm
        key={editing && typeof editing === 'object' ? editing.id : editing ?? 'none'}
        cosmetic={editing}
        achievements={data.achievements}
        onClose={() => setEditing(null)}
        onSaved={() => void reload(true)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function AdminRecompensas() {
  const [search, setSearch] = useSearchParams()
  const tabs: { value: Tab; label: string }[] = [
    { value: 'canjes', label: 'Canjes' }, { value: 'insignias', label: 'Estrellas' }, { value: 'recompensas', label: 'Recompensas' }, { value: 'logros', label: 'Logros' }, { value: 'retos', label: 'Retos' },
    { value: 'reglas', label: 'Reglas y topes' }, { value: 'cosmeticos', label: 'Cosméticos' },
  ]
  const tab = (tabs.some((t) => t.value === search.get('vista')) ? search.get('vista') : 'canjes') as Tab
  return (
    <>
      <PageHeader title="Recompensas" subtitle="Perfil Tesla: tienda de canjes, logros, reglas de puntos y personalización." />
      <div className="mb-5 overflow-x-auto">
        <Segmented value={tab} onChange={(v) => setSearch({ vista: v }, { replace: true })} options={tabs} />
      </div>
      {tab === 'canjes' && <Panel title="Canjes de todo el colegio"><RequestQueue canDecide /></Panel>}
      {tab === 'insignias' && <Panel title="Pines de las Estrellas Tesla"><PinQueue /></Panel>}
      {tab === 'recompensas' && <RewardsTab />}
      {tab === 'logros' && <AchievementsTab />}
      {tab === 'retos' && <RetosAdminTab />}
      {tab === 'reglas' && <RulesTab />}
      {tab === 'cosmeticos' && <CosmeticsTab />}
    </>
  )
}
