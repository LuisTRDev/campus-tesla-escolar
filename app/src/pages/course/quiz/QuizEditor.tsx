import { useState } from 'react'
import { ArrowDown, ArrowUp, BookmarkPlus, Library, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, ErrorBox, Loading, Panel } from '@/components/ui'
import { useAsync } from '@/lib/useAsync'
import { useToast } from '@/lib/toast'
import { toMessage } from '@/lib/errors'
import {
  QUESTION_TYPE_LABEL, deleteQuestion, importFromBank, questionToBank, quizEditor, reorderQuestions, saveQuestion, type EditorQuestion,
} from '@/services/aprendizaje'
import type { AssignmentWithCourse } from '@/types'
import { BankPicker } from './BankPicker'
import { QuestionForm, QuestionSummary, blankQuestion } from './QuestionEditor'
import { QuizSettingsForm } from './QuizSettingsForm'

export function QuizEditor({ assignment, onChanged }: { assignment: AssignmentWithCourse; onChanged: () => void }) {
  const toast = useToast()
  const { data, loading, error, reload, mutate } = useAsync(() => quizEditor(assignment.id), [assignment.id], { live: false })
  const [editing, setEditing] = useState<EditorQuestion | 'new' | null>(null)
  const [bank, setBank] = useState(false)
  const total = (data ?? []).reduce((s, q) => s + Number(q.points), 0)
  const pick = assignment.quiz_settings?.pick_count

  async function save(q: EditorQuestion) {
    await saveQuestion(assignment.id, q)
    toast('Pregunta guardada.')
    setEditing(null)
    await reload(true)
  }

  async function move(idx: number, dir: -1 | 1) {
    if (!data) return
    const list = [...data]
    const [item] = list.splice(idx, 1)
    list.splice(idx + dir, 0, item)
    mutate(() => list)
    await reorderQuestions(list.map((q) => q.id!)).catch((e) => toast(toMessage(e), 'error'))
  }

  return (
    <div className="space-y-6">
      <Panel title="Configuración"><QuizSettingsForm assignment={assignment} questionCount={data?.length ?? 0} onSaved={onChanged} /></Panel>
      <Panel
        title={`Preguntas (${data?.length ?? 0})`}
        action={<span className="text-sm text-texto-suave">{total} punto{total === 1 ? '' : 's'} en total{pick && pick < (data?.length ?? 0) ? ` · cada alumno recibe ${pick}` : ''}</span>}
      >
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {loading ? <Loading /> : (
          <ol className="space-y-3">
            {(data ?? []).map((q, i) => (
              <li key={q.id}>
                {editing !== 'new' && editing?.id === q.id ? (
                  <QuestionForm initial={q} onSave={save} onCancel={() => setEditing(null)} />
                ) : (
                  <div className="flex gap-3 rounded-xl border border-linea p-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-papel text-sm font-bold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-texto-suave">{QUESTION_TYPE_LABEL[q.type]} · {Number(q.points)} pt</p>
                      <p className="whitespace-pre-line font-bold">{q.prompt}</p>
                      <QuestionSummary q={q} />
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button onClick={() => setEditing(q)} className="rounded-md p-1.5 text-texto-suave hover:text-texto" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => void move(i, -1)} disabled={i === 0} className="rounded-md p-1.5 text-texto-suave hover:text-texto disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                      <button onClick={() => void move(i, 1)} disabled={i === (data?.length ?? 0) - 1} className="rounded-md p-1.5 text-texto-suave hover:text-texto disabled:opacity-30" aria-label="Bajar"><ArrowDown className="h-4 w-4" /></button>
                      <button onClick={() => void questionToBank(q.id!).then(() => toast('Guardada en el banco de preguntas.'), (e) => toast(toMessage(e), 'error'))}
                        className="rounded-md p-1.5 text-texto-suave hover:text-texto" aria-label="Guardar en el banco" title="Al banco"><BookmarkPlus className="h-4 w-4" /></button>
                      <button onClick={async () => {
                        if (!confirm('¿Eliminar esta pregunta?')) return
                        await deleteQuestion(q.id!).catch((e) => toast(toMessage(e), 'error'))
                        void reload(true)
                      }} className="rounded-md p-1.5 text-texto-suave hover:text-estado-alerta" aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {editing === 'new' ? (
          <div className="mt-3"><QuestionForm initial={blankQuestion('SINGLE')} onSave={save} onCancel={() => setEditing(null)} /></div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Agregar pregunta</Button>
            <Button variant="secondary" onClick={() => setBank(true)}><Library className="h-4 w-4" />Desde el banco</Button>
          </div>
        )}
      </Panel>
      <BankPicker open={bank} subjectId={assignment.offering.subject_id} onClose={() => setBank(false)}
        onPick={async (ids) => { const n = await importFromBank(assignment.id, ids); toast(`${n} pregunta${n === 1 ? '' : 's'} agregada${n === 1 ? '' : 's'}.`); await reload(true) }} />
    </div>
  )
}
