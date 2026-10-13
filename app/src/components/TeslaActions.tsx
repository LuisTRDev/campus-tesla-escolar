import { useState, type FormEvent } from 'react'
import { Button, Field, Input, Modal, Textarea } from '@/components/ui'
import { Medal, RarityBadge, TeslaIcon } from '@/components/tesla'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { adjustPoints, awardAchievement, giveRecognition, listAchievements, listCategories } from '@/services/tesla'

type Target = { id: number; name: string }

/** Reconocimiento del docente: categoría + motivo (con tope diario). */
export function RecognizeModal({ student, onClose, onDone }: { student: Target | null; onClose: () => void; onDone?: () => void }) {
  const toast = useToast()
  const { data: categories } = useAsync(() => listCategories(), [], { live: false })
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!student || !categoryId) return
    setBusy(true)
    try {
      const r = await giveRecognition(student.id, categoryId, reason)
      toast(`Reconocimiento enviado: +${r.xp} XP y +${r.coins} monedas para ${student.name}.`)
      setReason('')
      setCategoryId(null)
      onDone?.()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!student} onClose={onClose} title={`Reconocer a ${student?.name ?? ''}`}>
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-bold">¿Por qué lo reconoces?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(categories ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-bold transition-colors',
                  categoryId === c.id ? 'border-tinta bg-chispa-100 text-tinta' : 'border-linea hover:border-tinta-500',
                )}
              >
                <TeslaIcon name={c.icon} className="h-5 w-5" />
                {c.name}
                <span className="text-[11px] font-normal text-texto-suave">+{c.xp} XP · +{c.coins}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Motivo" hint="Lo verán el alumno y su familia. Sé específico: qué hizo y por qué importa.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required minLength={5} className="min-h-20"
            placeholder="Ayudó a su compañero a entender las fracciones sin darle la respuesta." />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={!categoryId || reason.trim().length < 5}>Reconocer</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Otorgar un logro a mano. Los docentes solo ven los logros manuales. */
export function AwardModal({ student, isAdmin, onClose, onDone }: { student: Target | null; isAdmin: boolean; onClose: () => void; onDone?: () => void }) {
  const toast = useToast()
  const { data } = useAsync(() => listAchievements(), [], { live: false })
  const options = (data ?? []).filter((a) => isAdmin || a.condition_type === 'MANUAL')
  const [achievementId, setAchievementId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!student || !achievementId) return
    setBusy(true)
    try {
      await awardAchievement(achievementId, student.id, note)
      toast(`Logro otorgado a ${student.name}.`)
      setNote('')
      setAchievementId(null)
      onDone?.()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!student} onClose={onClose} title={`Otorgar logro a ${student?.name ?? ''}`}>
      <form onSubmit={submit} className="space-y-4">
        {options.length === 0 ? (
          <p className="text-sm text-texto-suave">No hay logros manuales activos. La dirección puede crearlos en Recompensas → Logros.</p>
        ) : (
          <ul className="space-y-2">
            {options.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={achievementId === a.id}
                  onClick={() => setAchievementId(a.id)}
                  className={cn('flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors',
                    achievementId === a.id ? 'border-tinta bg-chispa-100' : 'border-linea hover:border-tinta-500')}
                >
                  <Medal icon={a.icon} rarity={a.rarity} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{a.name}</span>
                    <span className="block truncate text-xs text-texto-suave">{a.description}</span>
                  </span>
                  <RarityBadge rarity={a.rarity} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Field label="Nota (opcional)" hint="Se guarda junto al logro.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Por organizar la campaña de reciclaje." />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy} disabled={!achievementId}>Otorgar</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Ajuste manual de dirección (XP solo hacia arriba; monedas en ambos sentidos). */
export function AdjustModal({ student, onClose, onDone }: { student: Target | null; onClose: () => void; onDone?: () => void }) {
  const toast = useToast()
  const [xp, setXp] = useState('0')
  const [coins, setCoins] = useState('0')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!student) return
    setBusy(true)
    try {
      await adjustPoints(student.id, Number(xp) || 0, Number(coins) || 0, reason)
      toast('Ajuste registrado.')
      onDone?.()
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={!!student} onClose={onClose} title={`Ajustar puntos de ${student?.name ?? ''}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="XP a sumar" hint="La XP no se quita."><Input type="number" min={0} max={5000} value={xp} onChange={(e) => setXp(e.target.value)} /></Field>
          <Field label="Monedas" hint="Negativo para descontar."><Input type="number" min={-5000} max={5000} value={coins} onChange={(e) => setCoins(e.target.value)} /></Field>
        </div>
        <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={160} placeholder="Premio de la feria de ciencias" /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Guardar ajuste</Button>
        </div>
      </form>
    </Modal>
  )
}
