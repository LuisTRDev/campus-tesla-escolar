import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Gift, Package, Sparkles, X } from 'lucide-react'
import { useAuth, useFocusStudent } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Skeleton } from '@/components/ui'
import { CoinAmount, RarityBadge, isAnimatedArt } from '@/components/tesla'
import { CosmeticPreview } from '@/pages/tesla/PerfilTeslaExtras'
import { signedUrl } from '@/components/files'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, limaToday } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  BUCKET_REWARDS, KIND_LABEL, REQUEST_STATUS, cancelRequest, expireRequests, getProfile, listCosmetics, listOwnedCosmetics, listRequests, listRewards,
  requestReward, rewardAvailability, type Reward, type RewardRequest, type TeslaProfile,
} from '@/services/tesla'

/** Imagen de una recompensa (bucket privado, URL firmada). */
export function RewardImage({ reward, className }: { reward: Pick<Reward, 'image_path' | 'kind'>; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!reward.image_path) return
    let alive = true
    signedUrl(BUCKET_REWARDS, reward.image_path).then((u) => { if (alive) setUrl(u) }).catch(() => undefined)
    return () => { alive = false }
  }, [reward.image_path])
  if (reward.image_path && !url) return <Skeleton className={className} />
  if (url) return <img src={url} alt="" loading="lazy" className={cn('object-cover', className)} />
  const Icon = reward.kind === 'PHYSICAL' ? Package : Sparkles
  return (
    <span className={cn('notebook-cover flex items-center justify-center bg-tinta text-chispa', className)}>
      <Icon className="h-10 w-10" />
    </span>
  )
}

export function RequestRow({ r, actions, showStudent }: { r: RewardRequest; actions?: ReactNode; showStudent?: boolean }) {
  const st = REQUEST_STATUS[r.status]
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', r.reward_kind === 'PHYSICAL' ? 'bg-estado-info/10 text-estado-info' : 'bg-chispa-100 text-tinta')}>
        {r.reward_kind === 'PHYSICAL' ? <Package className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {showStudent && r.student ? `${r.student.first_name ?? ''} ${r.student.last_name ?? ''} · ` : ''}{r.reward_name}
        </p>
        <p className="text-sm text-texto-suave">
          {formatShort(r.created_at)} · <CoinAmount value={r.price} className="text-sm font-normal" />
          {r.status === 'PENDING' && <> · vence el {formatShort(r.expires_at)}</>}
          {r.note && <> · “{r.note}”</>}
        </p>
        {r.decision_reason && r.status === 'REJECTED' && <p className="text-sm text-estado-alerta">Motivo: {r.decision_reason}</p>}
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
      {actions}
    </li>
  )
}

export default function TiendaPage() {
  const { profile: me } = useAuth()
  const student = useFocusStudent()
  const toast = useToast()
  const isStudent = me?.role === 'STUDENT'
  const studentId = student?.id ?? 0
  const [picked, setPicked] = useState<Reward | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useAsync(async () => {
    await expireRequests().catch(() => 0)
    const [rewards, requests, profile] = await Promise.all([listRewards(), listRequests({ studentId }), getProfile(studentId)])
    return { rewards, requests, profile }
  }, [studentId])

  if (!studentId) return <ErrorBox message="Tu cuenta no está vinculada a un alumno." />

  const today = limaToday()
  const level = student?.classroom?.level ?? null
  const coins = data?.profile.coins ?? 0
  const rewards = (data?.rewards ?? []).filter((r) => !r.level || r.level === level)
  const used = (rewardId: number) => (data?.requests ?? []).filter((q) => q.reward_id === rewardId && ['PENDING', 'APPROVED', 'DELIVERED'].includes(q.status)).length

  async function confirmRequest(e: FormEvent) {
    e.preventDefault()
    if (!picked) return
    setBusy(true)
    try {
      await requestReward(picked.id, note)
      toast(`Pediste «${picked.name}». Tu tutor lo revisará.`)
      setPicked(null)
      setNote('')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function cancel(r: RewardRequest) {
    if (!confirm(`¿Cancelar el canje de «${r.reward_name}»? Te devolvemos ${r.price} monedas.`)) return
    try {
      await cancelRequest(r.id)
      toast('Canje cancelado. Monedas devueltas.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Tienda Tesla"
        subtitle={isStudent ? 'Canjea tus monedas por privilegios y premios. Tu tutor aprueba cada canje.' : `Canjes de ${student?.first_name ?? 'tu hijo'}.`}
        action={data && (
          <div className="rounded-xl border border-linea bg-superficie px-4 py-2 text-right">
            <p className="text-xs font-bold text-texto-suave">{isStudent ? 'Tienes' : 'Saldo'}</p>
            <CoinAmount value={coins} className="font-display text-2xl" />
            {!!data.profile.reserved && <p className="text-xs text-texto-suave">{data.profile.reserved} reservadas en canjes pendientes</p>}
          </div>
        )}
      />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading || !data ? <Loading shape="cards" /> : (
        <div className="space-y-6">
          {rewards.length === 0 ? (
            <Empty title="La tienda está vacía por ahora" art="notebook">La dirección publicará recompensas pronto.</Empty>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rewards.map((r) => {
                const avail = rewardAvailability(r, today)
                const limitReached = r.per_student_limit != null && used(r.id) >= r.per_student_limit
                const short = coins < r.price_coins
                return (
                  <li key={r.id} className="flex flex-col overflow-hidden rounded-2xl border border-linea bg-superficie">
                    <RewardImage reward={r} className="h-36 w-full" />
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={r.kind === 'PHYSICAL' ? 'info' : 'spark'}>{r.kind === 'PHYSICAL' ? 'Producto' : 'Privilegio'}</Badge>
                        {r.stock != null && r.stock > 0 && <Badge>Quedan {r.stock}</Badge>}
                        {r.ends_on && <Badge>Hasta el {formatShort(r.ends_on)}</Badge>}
                      </div>
                      <h2 className="mt-2 font-display text-lg font-semibold leading-tight">{r.name}</h2>
                      {r.description && <p className="mt-1 text-sm text-texto-suave">{r.description}</p>}
                      {r.per_student_limit && <p className="mt-1 text-xs text-texto-suave">Máximo {r.per_student_limit} por alumno{used(r.id) ? ` · ya usaste ${used(r.id)}` : ''}.</p>}
                      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                        <CoinAmount value={r.price_coins} className="font-display text-xl" />
                        {isStudent && (
                          <Button size="sm" disabled={!avail.ok || limitReached || short} onClick={() => setPicked(r)}>
                            {!avail.ok ? avail.reason : limitReached ? 'Límite alcanzado' : short ? `Faltan ${r.price_coins - coins}` : <><Gift className="h-4 w-4" />Canjear</>}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <CosmeticShop profile={data.profile} isStudent={isStudent} coins={coins} />

          <Panel title={isStudent ? 'Mis canjes' : 'Canjes'}>
            {data.requests.length === 0 ? (
              <p className="text-sm text-texto-suave">Todavía no hay canjes.</p>
            ) : (
              <ul className="divide-y divide-linea">
                {data.requests.map((r) => (
                  <RequestRow
                    key={r.id}
                    r={r}
                    actions={isStudent && r.status === 'PENDING'
                      ? <Button size="sm" variant="ghost" onClick={() => void cancel(r)}><X className="h-4 w-4" />Cancelar</Button>
                      : undefined}
                  />
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-texto-suave">Al pedir un canje, las monedas quedan reservadas. Si se rechaza o nadie lo responde a tiempo, vuelven a tu saldo.</p>
          </Panel>
        </div>
      )}

      <Modal open={!!picked} onClose={() => setPicked(null)} title="Confirmar canje">
        {picked && (
          <form onSubmit={confirmRequest} className="space-y-4">
            <div className="flex items-center gap-3">
              <RewardImage reward={picked} className="h-16 w-16 rounded-xl" />
              <div>
                <p className="font-bold">{picked.name}</p>
                <p className="text-sm text-texto-suave">Te quedarán <b>{coins - picked.price_coins}</b> monedas.</p>
              </div>
            </div>
            <Field label="Nota para tu tutor (opcional)">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={picked.kind === 'PHYSICAL' ? 'Color o talla, si aplica' : '¿Cuándo te gustaría usarlo?'} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setPicked(null)}>Volver</Button>
              <Button type="submit" loading={busy}><Gift className="h-4 w-4" />Pedir por <CoinAmount value={picked.price_coins} className="text-white" /></Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Cosméticos en venta: se prueban en el perfil antes de comprarlos
// ---------------------------------------------------------------------------
function CosmeticShop({ profile, isStudent, coins }: { profile: TeslaProfile; isStudent: boolean; coins: number }) {
  const { data } = useAsync(async () => {
    const [cosmetics, owned] = await Promise.all([listCosmetics(), listOwnedCosmetics(profile.student_id)])
    const mine = new Set(owned)
    return cosmetics.filter((c) => c.unlock_type === 'PURCHASE' && !mine.has(c.id)).sort((a, b) => (a.price_coins ?? 0) - (b.price_coins ?? 0))
  }, [profile.student_id])
  if (!data || data.length === 0) return null
  return (
    <Panel title="Cosméticos para tu Perfil Tesla"
      action={<span className="text-sm text-texto-suave">{isStudent ? 'Pruébalos en tu perfil antes de comprarlos' : 'Tu hijo puede probarlos antes de comprarlos'}</span>}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {data.map((c) => (
          <li key={c.id} className="art-tile flex flex-col items-center gap-1.5 rounded-xl border border-linea p-3 text-center">
            <div className="flex h-20 items-center justify-center"><CosmeticPreview c={c} size={52} avatar={profile.avatar?.value} /></div>
            <p className="line-clamp-1 text-sm font-bold">{c.name}</p>
            <p className="text-xs text-texto-suave">{KIND_LABEL[c.kind]}{isAnimatedArt(c.value) ? ' · animado' : ''}</p>
            <RarityBadge rarity={c.rarity} />
            <CoinAmount value={c.price_coins ?? 0} className={cn('text-sm', coins < (c.price_coins ?? 0) && 'text-texto-suave')} />
            {isStudent && (
              <Link to={`/perfil-tesla?vista=personalizar&probar=${c.id}`} title="Ver cómo se ve en tu perfil antes de comprarlo"
                className="mt-1 inline-flex items-center gap-1 rounded-lg bg-tinta px-2.5 py-1.5 text-xs font-bold text-white hover:bg-tinta-700">
                <Eye className="h-3.5 w-3.5" />Probármelo
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
