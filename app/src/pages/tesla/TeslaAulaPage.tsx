import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Award, Check, Heart, PackageCheck, Pencil, Plus, Trophy, Undo2, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Select, Textarea } from '@/components/ui'
import { CoinAmount, LevelBadge, MiniProfileHover, NameFx, RankPin, TeslaAvatar } from '@/components/tesla'
import { AdjustModal, AwardModal, RecognizeModal } from '@/components/TeslaActions'
import { ConstancyBoard, GoalCard } from '@/pages/tesla/PerfilTeslaPage'
import { RequestRow } from '@/pages/tesla/TiendaPage'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { formatShort, limaToday } from '@/lib/format'
import { classroomLabel, listClassrooms, listTeacherOfferings } from '@/services/campus'
import {
  GOAL_METRIC_LABEL, PIN_NAMES, cancelGoal, decideRequest, deliverRequest, expireRequests, listClassroomCards, listGoals, listPinQueue, listRequests,
  saveGoal, setPinDelivered, type PinQueueRow,
  type ClassroomGoal, type GoalMetric, type RequestStatus, type RewardRequest,
} from '@/services/tesla'
import type { Classroom } from '@/types'

type Tab = 'alumnos' | 'canjes' | 'insignias' | 'metas'

// ---------------------------------------------------------------------------
// Bandeja de canjes (también la usa dirección en /admin/recompensas)
// ---------------------------------------------------------------------------
export function RequestQueue({ classroomId, canDecide }: { classroomId?: number; canDecide: boolean }) {
  const toast = useToast()
  const [view, setView] = useState<'open' | 'all'>('open')
  const [rejecting, setRejecting] = useState<RewardRequest | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const statuses: RequestStatus[] | undefined = view === 'open' ? ['PENDING', 'APPROVED'] : undefined

  const { data, loading, error, reload } = useAsync(async () => {
    await expireRequests().catch(() => 0)
    return listRequests({ classroomId, statuses, limit: 150 })
  }, [classroomId, view])

  async function run(r: RewardRequest, fn: () => Promise<void>, ok: string) {
    setBusy(r.id)
    try {
      await fn()
      toast(ok)
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  async function reject(e: FormEvent) {
    e.preventDefault()
    const r = rejecting
    if (!r) return
    await run(r, () => decideRequest(r.id, false, reason), 'Canje rechazado. Se devolvieron las monedas.')
    setRejecting(null)
    setReason('')
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'open', label: 'Por atender' }, { value: 'all', label: 'Historial' }]} />
        {!canDecide && <p className="text-sm text-texto-suave">Solo el tutor del aula o la dirección responden los canjes.</p>}
      </div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? (
        <Empty title={view === 'open' ? 'No hay canjes por atender' : 'Sin canjes'} art="mail" compact>Cuando un alumno pida una recompensa aparecerá aquí.</Empty>
      ) : (
        <ul className="divide-y divide-linea">
          {data.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              showStudent
              actions={canDecide && (r.status === 'PENDING' || r.status === 'APPROVED') ? (
                <span className="flex gap-1.5">
                  {r.status === 'PENDING' && (
                    <>
                      <Button size="sm" loading={busy === r.id} onClick={() => void run(r, () => decideRequest(r.id, true), 'Canje aprobado.')}><Check className="h-4 w-4" />Aprobar</Button>
                      <Button size="sm" variant="danger" onClick={() => setRejecting(r)}><X className="h-4 w-4" />Rechazar</Button>
                    </>
                  )}
                  {r.status === 'APPROVED' && (
                    <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => void run(r, () => deliverRequest(r.id), 'Marcado como entregado.')}>
                      <PackageCheck className="h-4 w-4" />Entregado
                    </Button>
                  )}
                </span>
              ) : undefined}
            />
          ))}
        </ul>
      )}

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Rechazar canje">
        <form onSubmit={reject} className="space-y-4">
          <p className="text-sm text-texto-suave">«{rejecting?.reward_name}». El alumno recupera sus {rejecting?.price} monedas y verá el motivo.</p>
          <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} className="min-h-20" placeholder="Esta semana hay evaluaciones; pídelo de nuevo el lunes." /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>Volver</Button>
            <Button type="submit" variant="danger" loading={busy === rejecting?.id}>Rechazar</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Estrellas Tesla: entrega de los pines físicos (también la usa dirección)
// ---------------------------------------------------------------------------
export function PinQueue({ classroomId }: { classroomId?: number }) {
  const toast = useToast()
  const [view, setView] = useState<'open' | 'all'>('open')
  const [busy, setBusy] = useState<string | null>(null)
  const { data, loading, error, reload } = useAsync(() => listPinQueue(classroomId), [classroomId])
  const pending = (data ?? []).filter((r) => !r.delivered_at).length
  const rows = (data ?? []).filter((r) => view === 'all' || !r.delivered_at)

  async function mark(r: PinQueueRow, delivered: boolean) {
    if (!delivered && !confirm(`¿Deshacer la entrega de la ${PIN_NAMES[r.tier]} de ${r.first_name ?? 'este alumno'}?`)) return
    setBusy(`${r.student_id}-${r.tier}`)
    try {
      await setPinDelivered(r.student_id, r.tier, delivered)
      toast(delivered ? `Pin entregado a ${r.first_name ?? 'el alumno'}.` : 'Entrega deshecha.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={view} onChange={setView} options={[
          { value: 'open', label: pending ? `Por entregar (${pending})` : 'Por entregar' }, { value: 'all', label: 'Todas' },
        ]} />
        <p className="text-sm text-texto-suave">Cuando un alumno gana una Estrella, entrégale el pin en persona y márcalo aquí.</p>
      </div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading && !data ? <Loading /> : rows.length === 0 ? (
        <Empty title={view === 'open' ? 'No hay pines por entregar' : 'Todavía nadie gana una Estrella'} art="tasks" compact>
          La primera Estrella (bronce) llega al subir de nivel con entregas a tiempo, asistencia y reconocimientos.
        </Empty>
      ) : (
        <ul className="divide-y divide-linea">
          {rows.map((r) => {
            const key = `${r.student_id}-${r.tier}`
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 py-3">
                <RankPin tier={r.tier} size={40} />
                <div className="min-w-0 flex-1">
                  <Link to={`/perfil-tesla/${r.student_id}`} className="block truncate font-bold hover:underline">{r.first_name} {r.last_name}</Link>
                  <p className="truncate text-sm text-texto-suave">
                    {PIN_NAMES[r.tier]} · nivel {r.level}{!classroomId && r.classroom ? ` · ${r.classroom}` : ''}
                  </p>
                </div>
                {r.delivered_at ? (
                  <span className="flex items-center gap-2">
                    <Badge tone="ok"><Check className="h-3 w-3" />Entregado el {formatShort(r.delivered_at)}</Badge>
                    {r.can_deliver && (
                      <Button size="sm" variant="ghost" loading={busy === key} onClick={() => void mark(r, false)} aria-label="Deshacer entrega"><Undo2 className="h-4 w-4" /></Button>
                    )}
                  </span>
                ) : r.can_deliver ? (
                  <Button size="sm" loading={busy === key} onClick={() => void mark(r, true)}><PackageCheck className="h-4 w-4" />Pin entregado</Button>
                ) : (
                  <Badge tone="spark">Lo entrega el tutor</Badge>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Metas del aula
// ---------------------------------------------------------------------------
function GoalForm({ classroomId, goal, onClose, onSaved }: { classroomId: number; goal: ClassroomGoal | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const edit = goal && goal !== 'new' ? goal : null
  const today = limaToday()
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const [f, setF] = useState(() => ({
    title: edit?.title ?? '', description: edit?.description ?? '', metric: (edit?.metric ?? 'ON_TIME_TASKS') as GoalMetric,
    target: String(edit?.target ?? 100), startsOn: edit?.starts_on ?? today, endsOn: edit?.ends_on ?? in30,
    rewardText: edit?.reward_text ?? '', rewardXp: String(edit?.reward_xp ?? 20), rewardCoins: String(edit?.reward_coins ?? 10),
  }))
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await saveGoal({
        id: edit?.id, classroomId, title: f.title, description: f.description, metric: f.metric, target: Number(f.target),
        startsOn: f.startsOn, endsOn: f.endsOn, rewardText: f.rewardText, rewardXp: Number(f.rewardXp), rewardCoins: Number(f.rewardCoins),
      })
      toast(edit ? 'Meta actualizada.' : 'Meta creada. ¡Que el aula la logre!')
      onSaved()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!goal} onClose={onClose} title={edit ? 'Editar meta' : 'Nueva meta del aula'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nombre"><Input value={f.title} onChange={set('title')} required maxLength={100} placeholder="100 entregas a tiempo en octubre" /></Field>
        <Field label="Qué se mide">
          <Select value={f.metric} onChange={set('metric')}>
            {(Object.keys(GOAL_METRIC_LABEL) as GoalMetric[]).map((m) => <option key={m} value={m}>{GOAL_METRIC_LABEL[m].name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Objetivo"><Input type="number" min={1} value={f.target} onChange={set('target')} required /></Field>
          <Field label="Desde"><Input type="date" value={f.startsOn} onChange={set('startsOn')} required /></Field>
          <Field label="Hasta"><Input type="date" value={f.endsOn} onChange={set('endsOn')} required /></Field>
        </div>
        <Field label="Descripción (opcional)"><Textarea value={f.description} onChange={set('description')} maxLength={300} className="min-h-16" /></Field>
        <Field label="Premio para el aula" hint="Lo que celebrarán juntos. Además, cada alumno recibe la XP y monedas indicadas.">
          <Input value={f.rewardText} onChange={set('rewardText')} maxLength={120} placeholder="Película el viernes" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="XP por alumno" hint="Máximo 200"><Input type="number" min={0} max={200} value={f.rewardXp} onChange={set('rewardXp')} /></Field>
          <Field label="Monedas por alumno" hint="Máximo 100"><Input type="number" min={0} max={100} value={f.rewardCoins} onChange={set('rewardCoins')} /></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>{edit ? 'Guardar' : 'Crear meta'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function GoalsTab({ classroomId, canManage }: { classroomId: number; canManage: boolean }) {
  const toast = useToast()
  const [editing, setEditing] = useState<ClassroomGoal | 'new' | null>(null)
  const { data, loading, error, reload } = useAsync(() => listGoals(classroomId), [classroomId])

  async function cancel(g: ClassroomGoal) {
    if (!confirm(`¿Cancelar la meta «${g.title}»?`)) return
    try {
      await cancelGoal(g.id)
      toast('Meta cancelada.')
      void reload(true)
    } catch (err) {
      toast(toMessage(err), 'error')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel title="Metas cooperativas" action={canManage && <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Nueva meta</Button>}>
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {loading ? <Loading /> : !data?.length ? (
          <Empty title="Sin metas" art="tasks" compact>Una meta une al aula: todos ganan cuando el grupo la cumple.</Empty>
        ) : (
          <ul className="space-y-3">
            {data.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                actions={g.can_manage && g.status === 'ACTIVE' ? (
                  <span className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(g)} aria-label="Editar meta"><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => void cancel(g)} aria-label="Cancelar meta"><X className="h-4 w-4" /></Button>
                  </span>
                ) : undefined}
              />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Ranking de constancia" className="h-fit"><ConstancyBoard classroomId={classroomId} /></Panel>
      <GoalForm key={editing === 'new' ? 'new' : editing?.id ?? 'none'} classroomId={classroomId} goal={editing} onClose={() => setEditing(null)} onSaved={() => void reload(true)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export default function TeslaAulaPage() {
  const { profile, isAdmin, tutorClassrooms } = useAuth()
  const [search, setSearch] = useSearchParams()
  const [target, setTarget] = useState<{ kind: 'recognize' | 'award' | 'adjust'; id: number; name: string } | null>(null)
  const isTeacher = profile?.role === 'TEACHER'

  const { data: classrooms, loading: loadingRooms } = useAsync(async (): Promise<Classroom[]> => {
    if (!isTeacher) return listClassrooms()
    const offerings = await listTeacherOfferings(profile!.id)
    const map = new Map<number, Classroom>()
    for (const c of tutorClassrooms) map.set(c.id, c)
    for (const o of offerings) if (o.classroom) map.set(o.classroom_id, o.classroom)
    return [...map.values()].sort((a, b) => classroomLabel(a).localeCompare(classroomLabel(b), 'es'))
  }, [isTeacher, profile?.id, tutorClassrooms], { live: false })

  const rooms = classrooms ?? []
  const fromUrl = Number(search.get('aula'))
  const classroomId = rooms.some((c) => c.id === fromUrl) ? fromUrl : (tutorClassrooms[0]?.id ?? rooms[0]?.id ?? 0)
  const tab = (['alumnos', 'canjes', 'insignias', 'metas'].includes(search.get('vista') ?? '') ? search.get('vista') : 'alumnos') as Tab
  const update = (k: string, v: string) => setSearch((s) => { const n = new URLSearchParams(s); n.set(k, v); return n }, { replace: true })

  const isTutor = tutorClassrooms.some((c) => c.id === classroomId)
  const canManage = isAdmin || isTutor
  const canReward = isTeacher || isAdmin

  const { data: cards, loading, error, reload } = useAsync(
    () => (classroomId ? listClassroomCards(classroomId) : Promise.resolve([])),
    [classroomId],
  )

  return (
    <>
      <PageHeader
        title="Perfil Tesla"
        subtitle="Reconoce a tus alumnos, responde canjes y propón metas para el aula."
        action={rooms.length > 0 && (
          <Select value={classroomId} onChange={(e) => update('aula', e.target.value)} className="w-auto min-w-48" aria-label="Aula">
            {rooms.map((c) => <option key={c.id} value={c.id}>{classroomLabel(c)}{tutorClassrooms.some((t) => t.id === c.id) ? ' (tutoría)' : ''}</option>)}
          </Select>
        )}
      />
      {loadingRooms ? <Loading /> : !classroomId ? (
        <Empty title="No tienes aulas asignadas" art="notebook">Cuando la dirección te asigne cursos, tus aulas aparecerán aquí.</Empty>
      ) : (
        <>
          <div className="mb-5 overflow-x-auto">
            <Segmented value={tab} onChange={(v) => update('vista', v)} options={[
              { value: 'alumnos', label: 'Alumnos' }, { value: 'canjes', label: 'Canjes' }, { value: 'insignias', label: 'Estrellas' },
              { value: 'metas', label: 'Metas del aula' },
            ]} />
          </div>

          {tab === 'alumnos' && (
            <>
              {error && <ErrorBox message={error} onRetry={() => void reload()} />}
              {loading ? <Loading shape="cards" /> : !cards?.length ? (
                <Empty title="El aula no tiene alumnos" art="search" />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {cards.map((s) => {
                    const name = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()
                    return (
                      <li key={s.student_id} className="rounded-xl border border-linea bg-superficie p-3">
                        <MiniProfileHover studentId={s.student_id}>
                          <Link to={`/perfil-tesla/${s.student_id}`} className="flex items-center gap-3 hover:underline">
                            <TeslaAvatar emoji={s.avatar} frame={s.frame} aura={s.aura} size={48} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-bold"><NameFx fx={s.name_fx} text={name} /></span>
                              <span className="flex items-center gap-1 truncate text-xs text-texto-suave"><RankPin tier={s.pin_tier} size={16} />Nivel {s.level} · {s.title}</span>
                            </span>
                            <LevelBadge level={s.level} size={34} />
                          </Link>
                        </MiniProfileHover>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="tabular-nums text-texto-suave">{(s.xp ?? 0).toLocaleString('es-PE')} XP</span>
                          <CoinAmount value={s.coins ?? 0} className="text-sm font-normal" />
                          <span className="inline-flex items-center gap-1 text-texto-suave"><Trophy className="h-3.5 w-3.5" />{s.achievements}</span>
                          {!!s.recognitions_today && <Badge tone="alert"><Heart className="h-3 w-3" />{s.recognitions_today} hoy</Badge>}
                        </div>
                        {canReward && (
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="secondary" className="flex-1" onClick={() => setTarget({ kind: 'recognize', id: s.student_id, name: s.first_name ?? name })}>
                              <Heart className="h-4 w-4" />Reconocer
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setTarget({ kind: 'award', id: s.student_id, name: s.first_name ?? name })} aria-label={`Otorgar logro a ${name}`}>
                              <Award className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => setTarget({ kind: 'adjust', id: s.student_id, name: s.first_name ?? name })}>Ajustar</Button>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
          {tab === 'canjes' && <Panel><RequestQueue classroomId={classroomId} canDecide={canManage} /></Panel>}
          {tab === 'insignias' && <Panel><PinQueue classroomId={classroomId} /></Panel>}
          {tab === 'metas' && <GoalsTab classroomId={classroomId} canManage={canManage} />}
        </>
      )}

      <RecognizeModal student={target?.kind === 'recognize' ? target : null} onClose={() => setTarget(null)} onDone={() => void reload(true)} />
      <AwardModal student={target?.kind === 'award' ? target : null} isAdmin={isAdmin} onClose={() => setTarget(null)} onDone={() => void reload(true)} />
      <AdjustModal student={target?.kind === 'adjust' ? target : null} onClose={() => setTarget(null)} onDone={() => void reload(true)} />
    </>
  )
}
