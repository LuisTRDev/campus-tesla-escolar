import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Empty, ErrorBox, Input, Loading, Modal } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { QUESTION_TYPE_LABEL, deleteBankQuestion, listBank } from '@/services/aprendizaje'
import { QuestionSummary } from './QuestionEditor'

export function BankPicker({ open, subjectId, onClose, onPick }: { open: boolean; subjectId?: number | null; onClose: () => void; onPick?: (ids: number[]) => Promise<void> }) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [onlySubject, setOnlySubject] = useState(true)
  const [picked, setPicked] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useAsync(
    () => (open ? listBank({ subjectId: onlySubject ? subjectId : null, search }) : Promise.resolve([])),
    [open, onlySubject, subjectId, search], { live: false },
  )

  async function add() {
    if (!onPick) return
    setBusy(true)
    try {
      await onPick(picked)
      setPicked([])
      onClose()
    } catch (err) {
      toast(toMessage(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Banco de preguntas" wide>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en el banco…" className="max-w-xs" />
        {subjectId && (
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={onlySubject} onChange={(e) => setOnlySubject(e.target.checked)} className="h-4 w-4 accent-[#0B1D33]" />Solo de esta área
          </label>
        )}
      </div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? (
        <Empty title="El banco está vacío" art="search" compact>Guarda preguntas desde tus evaluaciones con el botón «Al banco».</Empty>
      ) : (
        <ul className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {data.map((b) => {
            const on = picked.includes(b.id)
            return (
              <li key={b.id} className={cn('rounded-xl border p-3', on ? 'border-tinta bg-chispa-100/50' : 'border-linea')}>
                <div className="flex items-start gap-3">
                  {onPick && <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== b.id) : [...p, b.id]))} className="mt-1 h-5 w-5 accent-[#0B1D33]" aria-label="Elegir" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-texto-suave">{QUESTION_TYPE_LABEL[b.type]} · {b.points} pt{b.grade ? ` · ${b.grade}°` : ''}</p>
                    <p className="whitespace-pre-line font-bold">{b.prompt}</p>
                    <QuestionSummary q={b} />
                  </div>
                  {!onPick && (
                    <button onClick={async () => { if (confirm('¿Quitar esta pregunta del banco?')) { await deleteBankQuestion(b.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) } }}
                      className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label="Quitar del banco"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {onPick && (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void add()} disabled={!picked.length} loading={busy}><Plus className="h-4 w-4" />Agregar {picked.length || ''} pregunta{picked.length === 1 ? '' : 's'}</Button>
        </div>
      )}
    </Modal>
  )
}
