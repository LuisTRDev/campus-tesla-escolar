import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Library, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, Modal, PageHeader, Panel, Segmented, Textarea } from '@/components/ui'
import { LevelChip } from '@/components/levels'
import { BankPicker } from '@/pages/course/quiz'
import { RubricGrid } from '@/pages/course/GradingTools'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import { deleteRubric, listRubrics, saveRubric, type Rubric, type RubricCriterion } from '@/services/aprendizaje'
import type { Level } from '@/types'

const LEVELS: Level[] = ['AD', 'A', 'B', 'C']
const newId = () => Math.random().toString(36).slice(2, 7)
const criterion = (name = ''): RubricCriterion => ({ id: newId(), name, levels: { AD: '', A: '', B: '', C: '' } })

const TEMPLATES: { title: string; criteria: [string, string, string, string, string][] }[] = [
  {
    title: 'Exposición oral',
    criteria: [
      ['Dominio del tema', 'Explica con precisión y responde preguntas con seguridad.', 'Explica el tema con pocas imprecisiones.', 'Explica parte del tema con errores.', 'No demuestra conocer el tema.'],
      ['Expresión oral', 'Voz clara, buen ritmo y vocabulario adecuado.', 'Se entiende bien con pequeñas pausas.', 'Se entiende con dificultad.', 'Difícil de entender.'],
      ['Apoyo visual', 'Material claro, ordenado y creativo.', 'Material claro y ordenado.', 'Material incompleto o desordenado.', 'Sin material de apoyo.'],
    ],
  },
  {
    title: 'Producción de textos',
    criteria: [
      ['Adecuación al propósito', 'Cumple el propósito y se adapta al lector.', 'Cumple el propósito.', 'Cumple parcialmente.', 'No cumple el propósito.'],
      ['Coherencia y cohesión', 'Ideas bien ordenadas y conectadas.', 'Ideas ordenadas con pocos saltos.', 'Ideas poco conectadas.', 'Ideas desordenadas.'],
      ['Ortografía y gramática', 'Sin errores.', 'Pocos errores.', 'Varios errores.', 'Muchos errores que dificultan la lectura.'],
    ],
  },
  {
    title: 'Trabajo en equipo',
    criteria: [
      ['Participación', 'Aporta ideas y cumple su parte siempre.', 'Aporta y cumple casi siempre.', 'Participa poco.', 'No participa.'],
      ['Respeto y escucha', 'Escucha y valora a todos.', 'Escucha a sus compañeros.', 'A veces interrumpe.', 'No respeta turnos ni ideas.'],
    ],
  },
]

function RubricEditor({ rubric, onClose, onSaved }: { rubric: Rubric | 'new'; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const edit = rubric === 'new' ? null : rubric
  const [title, setTitle] = useState(edit?.title ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [shared, setShared] = useState(edit?.shared ?? true)
  const [criteria, setCriteria] = useState<RubricCriterion[]>(edit?.criteria ?? [criterion(), criterion()])
  const [busy, setBusy] = useState(false)
  const set = (i: number, patch: Partial<RubricCriterion>) => setCriteria((c) => c.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <div className="space-y-4">
      {!edit && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-texto-suave">Empezar desde:</span>
          {TEMPLATES.map((t) => (
            <Button key={t.title} size="sm" variant="ghost" onClick={() => {
              setTitle(t.title)
              setCriteria(t.criteria.map(([name, AD, A, B, C]) => ({ id: newId(), name, levels: { AD, A, B, C } })))
            }}>{t.title}</Button>
          ))}
        </div>
      )}
      <Field label="Nombre"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></Field>
      <Field label="Descripción (opcional)"><Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} /></Field>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-44 text-left text-xs text-texto-suave">Criterio</th>
              {LEVELS.map((l) => <th key={l}><LevelChip level={l} /></th>)}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, i) => (
              <tr key={c.id}>
                <td className="align-top"><Textarea value={c.name} onChange={(e) => set(i, { name: e.target.value })} maxLength={120} className="min-h-20 text-sm font-bold" placeholder={`Criterio ${i + 1}`} /></td>
                {LEVELS.map((l) => (
                  <td key={l} className="align-top">
                    <Textarea value={c.levels[l]} onChange={(e) => set(i, { levels: { ...c.levels, [l]: e.target.value } })} maxLength={400} className="min-h-20 text-xs" placeholder="Descriptor" />
                  </td>
                ))}
                <td className="align-top">
                  <button onClick={() => setCriteria((x) => x.filter((_, j) => j !== i))} disabled={criteria.length <= 1} className="rounded p-1.5 text-texto-suave hover:text-estado-alerta disabled:opacity-30" aria-label="Quitar criterio"><X className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {criteria.length < 12 && <Button size="sm" variant="ghost" onClick={() => setCriteria((c) => [...c, criterion()])}><Plus className="h-4 w-4" />Criterio</Button>}
      <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4 accent-[#0B1D33]" />Compartir con los demás docentes</label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true)
          try { await saveRubric({ id: edit?.id, title, description, criteria, shared }); toast('Rúbrica guardada.'); onSaved() } catch (err) { toast(toMessage(err), 'error') } finally { setBusy(false) }
        }}><Save className="h-4 w-4" />Guardar rúbrica</Button>
      </div>
    </div>
  )
}

function RubricsTab() {
  const toast = useToast()
  const { profile } = useAuth()
  const { data, loading, error, reload } = useAsync(listRubrics, [])
  const [editing, setEditing] = useState<Rubric | 'new' | null>(null)
  const [viewing, setViewing] = useState<Rubric | null>(null)
  return (
    <>
      <div className="mb-4"><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Nueva rúbrica</Button></div>
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : !data?.length ? (
        <Empty title="Todavía no hay rúbricas" art="grades">Crea una y úsala al calificar: la nota AD, A, B o C sale sola.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((r) => {
            const mine = r.owner_id === profile?.id
            return (
              <li key={r.id} className="rounded-xl border border-linea bg-superficie p-4">
                <div className="flex items-start gap-2">
                  <button onClick={() => setViewing(r)} className="min-w-0 flex-1 text-left">
                    <p className="font-bold hover:underline">{r.title}</p>
                    <p className="text-sm text-texto-suave">{r.criteria.length} criterios: {r.criteria.map((c) => c.name).join(' · ')}</p>
                  </button>
                  {!mine && <Badge>Compartida</Badge>}
                </div>
                <div className="mt-2 flex gap-1">
                  {mine && <Button size="sm" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" />Editar</Button>}
                  <Button size="sm" variant="ghost" onClick={async () => {
                    try { await saveRubric({ title: `${r.title} (copia)`, description: r.description ?? '', criteria: r.criteria, shared: false }); toast('Copia creada.'); void reload(true) } catch (err) { toast(toMessage(err), 'error') }
                  }}><Copy className="h-4 w-4" />Copiar</Button>
                  {mine && <Button size="sm" variant="ghost" onClick={async () => { if (confirm('¿Eliminar la rúbrica? Las tareas que la usan quedarán sin rúbrica.')) { await deleteRubric(r.id).catch((e) => toast(toMessage(e), 'error')); void reload(true) } }}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva rúbrica' : 'Editar rúbrica'} wide>
        {editing && <RubricEditor rubric={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(true) }} />}
      </Modal>
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title ?? ''} wide>
        {viewing && <RubricGrid rubric={viewing} value={null} readOnly />}
      </Modal>
    </>
  )
}

export default function ResourcesPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('vista') === 'banco' ? 'banco' : 'rubricas'
  const [bank, setBank] = useState(false)
  return (
    <>
      <PageHeader title="Recursos" subtitle="Rúbricas y banco de preguntas compartidos entre docentes." />
      <div className="mb-5"><Segmented value={tab} onChange={(v) => setParams({ vista: v }, { replace: true })} options={[{ value: 'rubricas', label: 'Rúbricas' }, { value: 'banco', label: 'Banco de preguntas' }]} /></div>
      {tab === 'rubricas' ? <RubricsTab /> : (
        <Panel title="Banco de preguntas">
          <p className="mb-3 text-sm text-texto-suave">Las preguntas se guardan desde una evaluación con el botón «Al banco» y se reutilizan con «Desde el banco».</p>
          <Button onClick={() => setBank(true)}><Library className="h-4 w-4" />Ver y ordenar el banco</Button>
          <BankPicker open={bank} onClose={() => setBank(false)} />
        </Panel>
      )}
    </>
  )
}
