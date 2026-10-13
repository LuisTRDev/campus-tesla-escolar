import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Badge, Button, ErrorBox, Field, Input, Loading, Modal, Panel, Select, Textarea } from '@/components/ui'
import { CoinAmount, ICON_NAMES, RarityBadge, TeslaIcon } from '@/components/tesla'
import { CosmeticPreview } from '@/pages/tesla/PerfilTeslaExtras'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import {
  KIND_LABEL, MISSION_METRIC_LABEL, RARITIES, RARITY_LABEL, chestOdds, deleteSeasonReward, listChests, listCosmetics, listPeriods,
  listSeasonRewards, listWeeklyMissions, saveChest, saveSeasonReward, saveWeeklyMission,
  type Chest, type Cosmetic, type MissionMetric, type SeasonReward, type WeeklyMission,
} from '@/services/tesla'

// ---------------------------------------------------------------------------
// Utilidad: guardar desde un modal
// ---------------------------------------------------------------------------
function useSave(onSaved: () => void, onClose: () => void, ok: string) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function run(e: FormEvent, fn: () => Promise<unknown>) {
    e.preventDefault()
    setBusy(true)
    try {
      await fn()
      toast(ok)
      onSaved()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

const numberInput = (v: number, set: (n: number) => void, props: { min?: number; max?: number } = {}) => (
  <Input type="number" value={v} onChange={(e) => set(Number(e.target.value))} {...props} />
)

// ---------------------------------------------------------------------------
// Misiones semanales
// ---------------------------------------------------------------------------
const NEW_MISSION: Omit<WeeklyMission, 'id'> = {
  code: '', name: '', description: '', icon: 'Target', metric: 'TASKS_ON_TIME', target: 3, reward_xp: 20, reward_coins: 10, is_active: true, sort: 50,
}

function MissionForm({ mission, onClose, onSaved }: { mission: WeeklyMission | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Omit<WeeklyMission, 'id'> & { id?: number }>(() => (mission && mission !== 'new' ? mission : NEW_MISSION))
  const { busy, run } = useSave(onSaved, onClose, 'Misión guardada.')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  return (
    <Modal open={!!mission} onClose={onClose} title={f.id ? 'Editar misión' : 'Nueva misión semanal'}>
      <form onSubmit={(e) => void run(e, () => saveWeeklyMission(f))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código"><Input value={f.code} onChange={(e) => set('code', e.target.value)} required maxLength={40} placeholder="SEMANA_PUNTUAL" /></Field>
          <Field label="Ícono">
            <Select value={f.icon} onChange={(e) => set('icon', e.target.value)}>{ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}</Select>
          </Field>
        </div>
        <Field label="Nombre"><Input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={60} /></Field>
        <Field label="Descripción"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={160} className="min-h-16" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Qué se mide">
            <Select value={f.metric} onChange={(e) => set('metric', e.target.value as MissionMetric)}>
              {(Object.keys(MISSION_METRIC_LABEL) as MissionMetric[]).map((m) => <option key={m} value={m}>{MISSION_METRIC_LABEL[m]}</option>)}
            </Select>
          </Field>
          <Field label="Meta en la semana">{numberInput(f.target, (n) => set('target', n), { min: 1, max: 100 })}</Field>
          <Field label="XP">{numberInput(f.reward_xp, (n) => set('reward_xp', n), { min: 0, max: 500 })}</Field>
          <Field label="Monedas">{numberInput(f.reward_coins, (n) => set('reward_coins', n), { min: 0, max: 500 })}</Field>
          <Field label="Orden">{numberInput(f.sort, (n) => set('sort', n))}</Field>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" /><b>Activa</b></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><Save className="h-4 w-4" />Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function MissionsPanel() {
  const [editing, setEditing] = useState<WeeklyMission | 'new' | null>(null)
  const { data, loading, error, reload } = useAsync(listWeeklyMissions, [])
  return (
    <Panel title="Misiones semanales" action={<Button size="sm" variant="secondary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Agregar</Button>}>
      <p className="mb-3 text-sm text-texto-suave">Se renuevan cada lunes (hora de Lima). El alumno reclama el premio cuando cumple la meta.</p>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading || !data ? <Loading /> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.map((m) => (
            <li key={m.id}>
              <button onClick={() => setEditing(m)} className="flex w-full items-center gap-3 rounded-xl border border-linea p-3 text-left hover:border-tinta-500">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-papel"><TeslaIcon name={m.icon} className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{m.name}{!m.is_active && <span className="font-normal text-texto-suave"> · inactiva</span>}</span>
                  <span className="block truncate text-xs text-texto-suave">{m.target} · {MISSION_METRIC_LABEL[m.metric]}</span>
                </span>
                <span className="text-right text-sm"><span className="block font-bold text-estado-info">+{m.reward_xp} XP</span><CoinAmount value={m.reward_coins} className="text-xs" /></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MissionForm key={editing === 'new' ? 'new' : editing?.id ?? 'none'} mission={editing} onClose={() => setEditing(null)} onSaved={() => void reload(true)} />
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Pase de temporada
// ---------------------------------------------------------------------------
function SeasonRewardForm({ reward, periodId, cosmetics, nextTier, onClose, onSaved }: {
  reward: SeasonReward | 'new' | null; periodId: number | null; cosmetics: Cosmetic[]; nextTier: number; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState<Omit<SeasonReward, 'id'> & { id?: number }>(() => (reward && reward !== 'new' ? reward : {
    period_id: periodId, tier: nextTier, xp_needed: nextTier * 100, coins: 0, cosmetic_id: null, is_active: true,
  }))
  const { busy, run } = useSave(onSaved, onClose, 'Premio guardado.')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const chosen = cosmetics.find((c) => c.id === f.cosmetic_id)
  return (
    <Modal open={!!reward} onClose={onClose} title={f.id ? `Premio del nivel ${f.tier}` : 'Nuevo premio de temporada'}>
      <form onSubmit={(e) => void run(e, () => saveSeasonReward(f))} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Nivel del pase">{numberInput(f.tier, (n) => set('tier', n), { min: 1, max: 50 })}</Field>
          <Field label="XP necesaria">{numberInput(f.xp_needed, (n) => set('xp_needed', n), { min: 1 })}</Field>
          <Field label="Monedas">{numberInput(f.coins, (n) => set('coins', n), { min: 0, max: 1000 })}</Field>
        </div>
        <Field label="Cosmético (opcional)" hint="Los de tipo «Pase de temporada» solo se consiguen aquí.">
          <Select value={f.cosmetic_id ?? ''} onChange={(e) => set('cosmetic_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">Sin cosmético</option>
            {cosmetics.map((c) => (
              <option key={c.id} value={c.id}>{c.unlock_type === 'SEASON' ? '★ ' : ''}{KIND_LABEL[c.kind]}: {c.name} ({RARITY_LABEL[c.rarity]})</option>
            ))}
          </Select>
        </Field>
        {chosen && <div className="flex justify-center rounded-xl bg-papel p-4"><CosmeticPreview c={chosen} size={64} avatar="⚡" /></div>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" /><b>Activo</b></label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><Save className="h-4 w-4" />Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function SeasonPanel() {
  const toast = useToast()
  const [periodId, setPeriodId] = useState<number | null>(null)
  const [editing, setEditing] = useState<SeasonReward | 'new' | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const [rewards, periods, cosmetics] = await Promise.all([listSeasonRewards(), listPeriods(), listCosmetics(true)])
    return { rewards, periods, cosmetics }
  }, [])

  async function remove(r: SeasonReward) {
    if (!confirm(`¿Eliminar el premio del nivel ${r.tier}? Los alumnos que ya lo reclamaron conservan el cosmético.`)) return
    try {
      await deleteSeasonReward(r.id)
      toast('Premio eliminado.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  const rewards = (data?.rewards ?? []).filter((r) => r.period_id === periodId)
  const byId = new Map((data?.cosmetics ?? []).map((c) => [c.id, c]))

  return (
    <Panel title="Pase de temporada" action={<Button size="sm" variant="secondary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Agregar</Button>}>
      <p className="mb-3 text-sm text-texto-suave">
        Cada bimestre es una temporada. Los premios «Para todos los bimestres» se usan cuando un bimestre no tiene premios propios.
      </p>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading || !data ? <Loading /> : (
        <>
          <Select value={periodId ?? ''} onChange={(e) => setPeriodId(e.target.value ? Number(e.target.value) : null)} className="mb-4 w-auto min-w-64" aria-label="Temporada">
            <option value="">Para todos los bimestres</option>
            {data.periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.starts_on} a {p.ends_on})</option>)}
          </Select>
          {rewards.length === 0 ? <p className="text-sm text-texto-suave">Sin premios propios: se usan los generales.</p> : (
            <ul className="divide-y divide-linea">
              {rewards.map((r) => {
                const c = r.cosmetic_id ? byId.get(r.cosmetic_id) : null
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <Badge tone={r.is_active ? 'spark' : 'neutral'}>Nivel {r.tier}</Badge>
                    <span className="w-20 text-sm tabular-nums text-texto-suave">{r.xp_needed} XP</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {c ? <><b>{c.name}</b> <span className="text-texto-suave">({KIND_LABEL[c.kind]})</span></> : null}
                      {c && r.coins ? ' + ' : ''}
                      {r.coins ? `${r.coins} monedas` : ''}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(r)} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></Button>
                  </li>
                )
              })}
            </ul>
          )}
          <SeasonRewardForm
            key={editing === 'new' ? `new-${periodId}` : editing?.id ?? 'none'}
            reward={editing}
            periodId={periodId}
            cosmetics={data.cosmetics}
            nextTier={(rewards[rewards.length - 1]?.tier ?? 0) + 1}
            onClose={() => setEditing(null)}
            onSaved={() => void reload(true)}
          />
        </>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Cofres
// ---------------------------------------------------------------------------
const NEW_CHEST: Omit<Chest, 'id'> = { name: '', description: '', price: 80, w_bronze: 50, w_silver: 35, w_gold: 12, w_platinum: 3, is_active: true, sort: 50 }
const WEIGHT_KEY = { BRONZE: 'w_bronze', SILVER: 'w_silver', GOLD: 'w_gold', PLATINUM: 'w_platinum' } as const

function ChestForm({ chest, onClose, onSaved }: { chest: Chest | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Omit<Chest, 'id'> & { id?: number }>(() => (chest && chest !== 'new' ? chest : NEW_CHEST))
  const { busy, run } = useSave(onSaved, onClose, 'Cofre guardado.')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const odds = chestOdds(f)
  return (
    <Modal open={!!chest} onClose={onClose} title={f.id ? 'Editar cofre' : 'Nuevo cofre'}>
      <form onSubmit={(e) => void run(e, () => saveChest(f))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre"><Input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={40} /></Field>
          <Field label="Precio (monedas)">{numberInput(f.price, (n) => set('price', n), { min: 1 })}</Field>
        </div>
        <Field label="Descripción"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={160} className="min-h-16" /></Field>
        <div>
          <p className="mb-2 font-bold">Probabilidad de cada rareza</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RARITIES.map((r) => (
              <Field key={r} label={`${RARITY_LABEL[r]} · ${(odds[r] * 100).toFixed(1)}%`}>
                {numberInput(f[WEIGHT_KEY[r]], (n) => set(WEIGHT_KEY[r], n), { min: 0 })}
              </Field>
            ))}
          </div>
          <p className="mt-1 text-xs text-texto-suave">Son pesos: el porcentaje es cada uno entre la suma. Salen cosméticos de tipo «Cofres sorpresa».</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Orden">{numberInput(f.sort, (n) => set('sort', n))}</Field>
          <label className="flex items-end gap-2 pb-3"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-5 w-5 accent-[#0B1D33]" /><b>Activo</b></label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}><Save className="h-4 w-4" />Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function ChestsPanel() {
  const [editing, setEditing] = useState<Chest | 'new' | null>(null)
  const { data, loading, error, reload } = useAsync(() => listChests(true), [])
  return (
    <Panel title="Cofres sorpresa" action={<Button size="sm" variant="secondary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Agregar</Button>}>
      <p className="mb-3 text-sm text-texto-suave">Solo se abren con monedas ganadas. Las probabilidades se muestran al alumno. Si ya tiene todo, recupera la mitad.</p>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading || !data ? <Loading /> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.map((c) => {
            const odds = chestOdds(c)
            return (
              <li key={c.id}>
                <button onClick={() => setEditing(c)} className="w-full rounded-xl border border-linea p-3 text-left hover:border-tinta-500">
                  <span className="flex items-center justify-between gap-2">
                    <b>{c.name}{!c.is_active && <span className="font-normal text-texto-suave"> · inactivo</span>}</b>
                    <CoinAmount value={c.price} className="text-sm" />
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {RARITIES.filter((r) => odds[r] > 0).map((r) => (
                      <span key={r} className="inline-flex items-center gap-1 text-xs"><RarityBadge rarity={r} />{(odds[r] * 100).toFixed(0)}%</span>
                    ))}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <ChestForm key={editing === 'new' ? 'new' : editing?.id ?? 'none'} chest={editing} onClose={() => setEditing(null)} onSaved={() => void reload(true)} />
    </Panel>
  )
}

export function RetosAdminTab() {
  return (
    <div className="space-y-6">
      <MissionsPanel />
      <SeasonPanel />
      <ChestsPanel />
    </div>
  )
}
